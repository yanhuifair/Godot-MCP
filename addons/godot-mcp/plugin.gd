@tool
extends EditorPlugin

# Copyright (c) 2026 FairYan
# SPDX-License-Identifier: AGPL-3.0-or-later

# ============================================================
# Godot MCP Editor Plugin v1.11.2
# ============================================================
# ⚠️  Godot 4.x only. Godot 3 is NOT supported.
# Dual-mode communication with the MCP server:
# - stdio mode: when spawned by MCP (MCP_STDIO=true), reads
#   commands from stdin, writes responses to stdout.
# - TCP mode: when Godot is opened directly, listens on port
#   9876 for TCP connections from the MCP server.
# Both modes share the same command handlers.
# ============================================================

const DEFAULT_PORT = 9876
const MAX_OUTPUT_LINES = 500
const BUFFER_SIZE = 65536
const RESPONSE_MARKER = "__MCP__:"
const PLUGIN_VERSION = "1.11.2"

# TCP 接收缓冲上限：超过且无完整行时丢弃，防止恶意客户端灌数据撑爆内存
const TCP_BUFFER_LIMIT = 1024 * 1024

var _output_buffer: PackedStringArray = []
var _output_signal_connected: bool = false

# ---- stdio mode ----
var _stdin_thread: Thread = null
var _command_mutex: Mutex = null
var _command_queue: Array = []
var _running: bool = true
var _stdio_mode: bool = false

# ---- TCP mode (direct Godot launch) ----
var _tcp_server: TCPServer = null
var _peer: StreamPeerTCP = null
var _tcp_connections: Array[StreamPeerTCP] = []
var _tcp_buffer: String = ""
var _peer_authenticated: bool = false
# 从 ProjectSettings godot_mcp/auth_token 或环境变量 GODOT_MCP_TOKEN 读取；
# 未设置时不要求鉴权（仅本机 loopback 可连，风险可控）。
var _auth_token: String = ""


# ---- Lifecycle ----

func _enter_tree() -> void:
	_stdio_mode = OS.get_environment("MCP_STDIO") == "true"
	_command_mutex = Mutex.new()
	_running = true
	_auth_token = ProjectSettings.get_setting("godot_mcp/auth_token", "")
	if _auth_token == "":
		_auth_token = OS.get_environment("GODOT_MCP_TOKEN")

	if _stdio_mode:
		_start_stdin_reader()
		_send_stdout({"jsonrpc": "2.0", "id": 0, "result": {"ready": true, "version": PLUGIN_VERSION}})
	else:
		_start_tcp_server()

	set_process(true)

	if _stdio_mode:
		print("[Godot MCP] Plugin v" + PLUGIN_VERSION + " loaded — stdio mode")
	else:
		print("[Godot MCP] Plugin v" + PLUGIN_VERSION + " loaded — TCP on 127.0.0.1:", _get_port(), " (auth: ", "on" if _auth_token != "" else "off", ")")


func _exit_tree() -> void:
	_running = false
	set_process(false)

	if _stdio_mode:
		if _stdin_thread:
			# reader 线程阻塞在 OS.read_string_from_stdin() 上，无法被直接唤醒。
			# 等待有限时间后放弃，避免编辑器退出被永久卡死。
			var deadline := Time.get_ticks_msec() + 1500
			while _stdin_thread.is_alive() and Time.get_ticks_msec() < deadline:
				OS.delay_msec(10)
			if _stdin_thread.is_alive():
				# 线程仍阻塞在 stdin 读取上：分离并释放引用，进程退出时由 OS 回收
				_stdin_thread = null
			else:
				_stdin_thread.wait_to_finish()
				_stdin_thread = null
		_send_stdout({"jsonrpc": "2.0", "id": 0, "result": {"shutdown": true}})
	else:
		_stop_tcp_server()

	print("[Godot MCP] Plugin unloaded")


# ---- TCP Server (direct mode) ----

func _get_port() -> int:
	if ProjectSettings.has_setting("godot_mcp/editor_port"):
		return ProjectSettings.get_setting("godot_mcp/editor_port")
	return DEFAULT_PORT


func _start_tcp_server() -> void:
	_tcp_server = TCPServer.new()
	var port = _get_port()
	# 只绑定 loopback —— 9876 端口可执行任意 GDScript/文件操作，
	# 暴露到局域网等于无鉴权 RCE（除非显式配置了 auth_token）。
	var err = _tcp_server.listen(port, "127.0.0.1")
	if err != OK:
		printerr("[Godot MCP] Failed to start TCP server on port ", port, " (", error_string(err), ")")
		_tcp_server = null
		return
	print("[Godot MCP] TCP server listening on 127.0.0.1:", port)


func _stop_tcp_server() -> void:
	# Disconnect all peers
	for p in _tcp_connections:
		p.disconnect_from_host()
	_tcp_connections.clear()
	_peer = null
	if _tcp_server:
		_tcp_server.stop()
		_tcp_server = null


# ---- stdin Reader (stdio mode) ----

func _start_stdin_reader() -> void:
	_stdin_thread = Thread.new()
	_stdin_thread.start(_stdin_reader_loop)


func _stdin_reader_loop() -> void:
	while _running:
		var line: String = OS.read_string_from_stdin()
		if line == "":
			break
		line = line.strip_edges()
		if line != "":
			_command_mutex.lock()
			_command_queue.append(line)
			_command_mutex.unlock()


# ---- Process (main thread) ----

func _process(_delta: float) -> void:
	if _stdio_mode:
		_process_stdio()
	else:
		_process_tcp()


func _process_stdio() -> void:
	_command_mutex.lock()
	var commands = _command_queue.duplicate()
	_command_queue.clear()
	_command_mutex.unlock()
	for cmd in commands:
		_handle_message(cmd)


func _process_tcp() -> void:
	if not _tcp_server:
		return

	# Refresh the current peer's socket state FIRST.
	# StreamPeerTCP.get_status() is only updated by poll(); without this the peer
	# stays reported as CONNECTED forever after the client goes away, _peer is
	# never cleared, and no further client can ever connect until Godot restarts.
	if _peer:
		_peer.poll()
		if _peer.get_status() != StreamPeerTCP.STATUS_CONNECTED:
			_disconnect_peer()

	# Accept new connections
	if not _peer:
		if _tcp_server.is_connection_available():
			_peer = _tcp_server.take_connection()
			_tcp_connections.append(_peer)
			_tcp_buffer = ""
			_peer_authenticated = _auth_token == ""
			_peer.poll()
			print("[Godot MCP] TCP client connected (auth: ", "on" if _auth_token != "" else "off", ")")

	# Read and handle messages
	if _peer:
		var status = _peer.get_status()
		if status == StreamPeerTCP.STATUS_CONNECTED:
			var available = _peer.get_available_bytes()
			if available > 0:
				_tcp_buffer += _peer.get_string(min(available, BUFFER_SIZE))
				if _tcp_buffer.length() > TCP_BUFFER_LIMIT:
					# 无完整行的超长缓冲 = 损坏/恶意连接，断开防止内存膨胀
					_disconnect_peer()
					return
				# 按 \n 切分完整消息，处理粘包/半包（JSON.stringify 不产生裸换行）
				while "\n" in _tcp_buffer:
					var idx = _tcp_buffer.find("\n")
					var line = _tcp_buffer.substr(0, idx).strip_edges()
					_tcp_buffer = _tcp_buffer.substr(idx + 1)
					if line != "":
						_handle_message(line)
			elif available < 0:
				_disconnect_peer()
		else:
			_disconnect_peer()


func _disconnect_peer() -> void:
	if _peer:
		_peer.disconnect_from_host()
		_tcp_connections.erase(_peer)
	_peer = null
	_tcp_buffer = ""
	_peer_authenticated = false


# ---- Output Capture ----


# ---- stdout Response ----

func _send_stdout(data: Dictionary) -> void:
	# Write a JSON-RPC response to stdout with marker prefix.
	# The parent MCP server filters for lines starting with RESPONSE_MARKER.
	var json_str = JSON.stringify(data, "", false)
	printraw(RESPONSE_MARKER + json_str + "\n")


# ---- Message Handling ----

func _handle_message(raw: String) -> void:
	var json = JSON.new()
	var err = json.parse(raw)
	if err != OK:
		_send_error("Invalid JSON: " + json.get_error_message())
		return

	var msg = json.get_data()
	if typeof(msg) != TYPE_DICTIONARY:
		_send_error("Expected JSON object")
		return

	# Accept both "method" (JSON-RPC) and "command" (simple format)
	var method = msg.get("method", "")
	if method == "":
		method = msg.get("command", "")
	var params = msg.get("params", {})
	if params == null:
		params = {}
	# JSON-RPC id 可以是字符串或数字，保留原值
	var id = msg.get("id", 0)

	# ---- 鉴权（仅 TCP 模式；配置了 auth_token 时未鉴权连接只能执行 auth）----
	if not _stdio_mode and _auth_token != "" and not _peer_authenticated:
		if method != "auth":
			_send_error("Unauthorized: auth required", id)
			return
		var token = params.get("token", "")
		if typeof(token) == TYPE_STRING and token == _auth_token:
			_peer_authenticated = true
			_send_response(id, {"ok": true, "authenticated": true})
		else:
			_send_error("Unauthorized: invalid token", id)
		return

	var result = _execute_command(method, params)
	_send_response(id, result)


func _execute_command(method: String, params: Dictionary) -> Dictionary:
	match method:
		# ---- Health Check ----
		"health_check": return {"ok": true, "version": PLUGIN_VERSION, "commands": 116, "undo_support": true}

		# ---- Editor State ----
		"get_open_scene": return _cmd_get_open_scene()
		"get_open_scenes": return _cmd_get_open_scenes()
		"get_current_scene_tree": return _cmd_get_current_scene_tree()
		"get_selection": return _cmd_get_selection()
		"set_selection": return _cmd_set_selection(params)

		# ---- Scene Operations ----
		"save_scene": return _cmd_save_scene()
		"save_all_scenes": return _cmd_save_all_scenes()
		"save_scene_as": return _cmd_save_scene_as(params)
		"close_scene": return _cmd_close_scene()
		"reload_scene": return _cmd_reload_scene()
		"get_unsaved_scenes": return _cmd_get_unsaved_scenes()
		"mark_scene_unsaved": return _cmd_mark_scene_unsaved()

		# ---- Playback ----
		"play_project": return _cmd_play_project()
		"stop_project": return _cmd_stop_project()
		"pause_project": return _cmd_pause_project()
		"unpause_project": return _cmd_unpause_project()
		"is_playing": return _cmd_is_playing()
		"run_specific_scene": return _cmd_run_specific_scene(params)
		"play_current_scene": return _cmd_play_current_scene()
		"get_playing_scene": return _cmd_get_playing_scene()

		# ---- Edit Operations ----
		"undo": return _cmd_undo()
		"redo": return _cmd_redo()
		"cut_selected": return _cmd_cut_selected()
		"copy_selected": return _cmd_copy_selected()
		"paste": return _cmd_paste()

		# ---- Node Operations (live) ----
		"select_node": return _cmd_select_node(params)
		"move_node": return _cmd_move_node(params)
		"move_node_3d": return _cmd_move_node_3d(params)
		"delete_selected": return _cmd_delete_selected()
		"add_node": return _cmd_add_node(params)
		"remove_node": return _cmd_remove_node(params)
		"get_node_properties": return _cmd_get_node_properties(params)
		"set_node_properties": return _cmd_set_node_properties(params)
		"rename_node": return _cmd_rename_node(params)
		"duplicate_node": return _cmd_duplicate_node(params)
		"reparent_node": return _cmd_reparent_node(params)

		# ---- Script Operations ----
		"create_script": return _cmd_create_script(params)
		"attach_script": return _cmd_attach_script(params)
		"run_gdscript": return _cmd_run_gdscript(params)

		# ---- Debug ----
		"get_editor_output": return _cmd_get_editor_output()
		"get_editor_version": return _cmd_get_editor_version()
		"get_editor_info": return _cmd_get_editor_info()
		"get_breakpoints": return _cmd_get_breakpoints()
		"set_breakpoint": return _cmd_set_breakpoint(params)
		"remove_breakpoint": return _cmd_remove_breakpoint(params)

		# ---- File System ----
		"open_asset": return _cmd_open_asset(params)
		"show_in_filesystem": return _cmd_show_in_filesystem(params)
		"list_filesystem": return _cmd_list_filesystem(params)
		"get_filesystem_selection": return _cmd_get_filesystem_selection()
		"open_script_at_line": return _cmd_open_script_at_line(params)

		# ---- UI / Window ----
		"get_editor_rect": return _cmd_get_editor_rect()
		"focus_editor": return _cmd_focus_editor()
		"open_dock": return _cmd_open_dock(params)
		"take_screenshot": return _cmd_take_screenshot(params)
		"show_toast": return _cmd_show_toast(params)
		"set_distraction_free": return _cmd_set_distraction_free(params)
		"set_movie_maker": return _cmd_set_movie_maker(params)
		"get_3d_snap": return _cmd_get_3d_snap()
		"get_editor_paths": return _cmd_get_editor_paths()
		"restart_editor": return _cmd_restart_editor(params)

		# ---- Scene Creation ----
		"create_scene": return _cmd_create_editor_scene(params)
		"instantiate_scene": return _cmd_instantiate_scene(params)
		"set_main_scene": return _cmd_set_main_scene(params)

		# ---- Debugger Control ----
		"debug_continue": return _cmd_debug_continue()
		"debug_step": return _cmd_debug_step()
		"debug_step_over": return _cmd_debug_step_over()
		"debug_break": return _cmd_debug_break()
		"get_stack_trace": return _cmd_get_stack_trace()
		"get_debug_variables": return _cmd_get_debug_variables()
		"evaluate_expression": return _cmd_evaluate_expression(params)

		# ---- Settings ----
		"get_editor_setting": return _cmd_get_editor_setting(params)
		"set_editor_setting": return _cmd_set_editor_setting(params)
		"get_project_setting": return _cmd_get_project_setting(params)
		"set_project_setting": return _cmd_set_project_setting(params)

		# ---- Signals ----
		"connect_editor_signal": return _cmd_connect_signal(params)
		"disconnect_editor_signal": return _cmd_disconnect_signal(params)
		"list_node_signals": return _cmd_list_node_signals(params)

		# ---- Export ----
		# NOTE: project export is driven from the MCP side via the Godot CLI
		# (handleExportProject -> exportGodotProject), not the bridge, so there
		# is intentionally no "export_project" dispatch key here.

		# ---- Project State ----
		"get_scene_changes": return _cmd_get_scene_changes()
		"get_recent_scenes": return _cmd_get_recent_scenes()
		"get_project_directory": return _cmd_get_project_directory()

		# ---- Input Simulation ----
		"simulate_key_press": return _cmd_simulate_key_press(params)

		# ---- Plugin Management ----
		"get_plugin_list": return _cmd_get_plugin_list()
		"enable_plugin": return _cmd_enable_plugin(params)
		"disable_plugin": return _cmd_disable_plugin(params)

		# ---- Class Introspection ----
		"get_class_list": return _cmd_get_class_list(params)
		"get_method_list": return _cmd_get_method_list(params)
		"get_property_list": return _cmd_get_property_list(params)
		"get_signal_list": return _cmd_get_signal_list(params)
		"get_class_doc": return _cmd_get_class_doc(params)
		"search_help": return _cmd_search_help(params)

		# ---- Filesystem CRUD ----
		"create_folder": return _cmd_create_folder(params)
		"delete_asset": return _cmd_delete_asset(params)
		"rename_asset": return _cmd_rename_asset(params)
		"move_asset": return _cmd_move_asset(params)
		"duplicate_asset": return _cmd_duplicate_asset(params)

		# ---- Editor Viewport ----
		"get_editor_camera": return _cmd_get_editor_camera()
		"set_editor_camera": return _cmd_set_editor_camera(params)
		"toggle_grid": return _cmd_toggle_grid()
		"toggle_snap": return _cmd_toggle_snap()

		# ---- Autoload via Editor ----
		"get_autoload_list": return _cmd_get_autoload_list()
		"add_autoload": return _cmd_add_autoload(params)
		"remove_autoload": return _cmd_remove_autoload(params)

		# ---- Input Map via Editor ----
		"get_input_map": return _cmd_get_input_map()
		"add_input_action": return _cmd_add_input_action(params)
		"remove_input_action": return _cmd_remove_input_action(params)

		# ---- Errors / Diagnostics ----
		"get_error_list": return _cmd_get_error_list()
		"clear_errors": return _cmd_clear_errors()

		# ---- Build / Bake ----
		"reimport_asset": return _cmd_reimport_asset(params)
		"bake_lightmaps": return _cmd_bake_lightmaps()
		"bake_navigation": return _cmd_bake_navigation()

		# ---- Runtime Inspection (game running) ----
		"get_running_scene_tree": return _cmd_get_running_scene_tree()
		"get_performance_monitors": return _cmd_get_performance_monitors()
		"get_dependency_list": return _cmd_get_dependency_list(params)

		_:
			return {"error": "Unknown method: " + method}


# ============================================================
# Type Parser — JSON string → Godot native types
# ============================================================

func _parse_value(raw: String):
	# 解析形如 "Vector2(1, 2)" / "Color(1,0,0,1)" 的字符串为原生类型。
	# 所有分支都做元素个数检查，防止越界访问导致 push_error 刷屏。
	if raw.begins_with("Vector2("):
		var s = raw.trim_prefix("Vector2(").trim_suffix(")")
		var p = s.split(",", false)
		if p.size() >= 2: return Vector2(float(p[0]), float(p[1]))
		return raw

	if raw.begins_with("Vector3("):
		var s = raw.trim_prefix("Vector3(").trim_suffix(")")
		var p = s.split(",", false)
		if p.size() >= 3: return Vector3(float(p[0]), float(p[1]), float(p[2]))
		return raw

	if raw.begins_with("Vector4("):
		var s = raw.trim_prefix("Vector4(").trim_suffix(")")
		var p = s.split(",", false)
		if p.size() >= 4: return Vector4(float(p[0]), float(p[1]), float(p[2]), float(p[3]))
		return raw

	if raw.begins_with("Vector2i("):
		var s = raw.trim_prefix("Vector2i(").trim_suffix(")")
		var p = s.split(",", false)
		if p.size() >= 2: return Vector2i(int(p[0]), int(p[1]))
		return raw

	if raw.begins_with("Color("):
		var s = raw.trim_prefix("Color(").trim_suffix(")")
		var p = s.split(",", false)
		if p.size() >= 4: return Color(float(p[0]), float(p[1]), float(p[2]), float(p[3]))
		# 3 参形式 Color(r, g, b) 视为不透明色，避免整条属性回退成字符串。
		if p.size() == 3: return Color(float(p[0]), float(p[1]), float(p[2]), 1.0)
		return raw

	# 十六进制颜色：#RGB / #RGBA / #RRGGBB / #RRGGBBAA
	if raw.begins_with("#"):
		var hex = raw.substr(1)
		if hex.is_valid_hex_number(false) and hex.length() in [3, 4, 6, 8]:
			return Color(raw)
		return raw

	if raw.begins_with("Rect2("):
		var s = raw.trim_prefix("Rect2(").trim_suffix(")")
		var p = s.split(",", false)
		if p.size() >= 4: return Rect2(float(p[0]), float(p[1]), float(p[2]), float(p[3]))
		return raw

	if raw.begins_with("Vector3i("):
		var s = raw.trim_prefix("Vector3i(").trim_suffix(")")
		var p = s.split(",", false)
		if p.size() >= 3: return Vector3i(int(p[0]), int(p[1]), int(p[2]))
		return raw

	if raw.begins_with("Vector4i("):
		var s = raw.trim_prefix("Vector4i(").trim_suffix(")")
		var p = s.split(",", false)
		if p.size() >= 4: return Vector4i(int(p[0]), int(p[1]), int(p[2]), int(p[3]))
		return raw

	if raw.begins_with("Quaternion("):
		var s = raw.trim_prefix("Quaternion(").trim_suffix(")")
		var p = s.split(",", false)
		return Quaternion(float(p[0]), float(p[1]), float(p[2]), float(p[3]))

	if raw.begins_with("Plane("):
		var s = raw.trim_prefix("Plane(").trim_suffix(")")
		var p = s.split(",", false)
		return Plane(float(p[0]), float(p[1]), float(p[2]), float(p[3]))

	if raw.begins_with("Transform3D("):
		var s = raw.trim_prefix("Transform3D(").trim_suffix(")")
		var p = s.split(",", false)
		if p.size() >= 12:
			return Transform3D(
				Vector3(float(p[0]), float(p[1]), float(p[2])),
				Vector3(float(p[3]), float(p[4]), float(p[5])),
				Vector3(float(p[6]), float(p[7]), float(p[8])),
				Vector3(float(p[9]), float(p[10]), float(p[11]))
			)
		return Transform3D()

	if raw.begins_with("AABB("):
		var s = raw.trim_prefix("AABB(").trim_suffix(")")
		var p = s.split(",", false)
		if p.size() >= 6:
			return AABB(Vector3(float(p[0]), float(p[1]), float(p[2])), Vector3(float(p[3]), float(p[4]), float(p[5])))
		return AABB()

	if raw.begins_with("Transform2D("):
		var s = raw.trim_prefix("Transform2D(").trim_suffix(")")
		var p = s.split(",", false)
		if p.size() >= 6:
			return Transform2D(
				Vector2(float(p[0]), float(p[1])),
				Vector2(float(p[2]), float(p[3])),
				Vector2(float(p[4]), float(p[5]))
			)
		return Transform2D()

	if raw.begins_with("NodePath("):
		return NodePath(raw.trim_prefix("NodePath(").trim_suffix(")"))

	if raw.begins_with('"') and raw.ends_with('"'):
		return raw.substr(1, raw.length() - 2)

	if raw.is_valid_int():
		return int(raw)
	if raw.is_valid_float():
		return float(raw)
	if raw == "true": return true
	if raw == "false": return false

	return raw


func _node_has_property(node: Node, key: String) -> bool:
	# 只认节点真实存在的属性；否则 Object.set() 会静默失败，调用方无从感知。
	for prop in node.get_property_list():
		if prop["name"] == key:
			return true
	return false


func _node_set_property(node: Node, key: String, raw_value: String) -> bool:
	var value = _parse_value(raw_value)

	if key == "transform" and value is String:
		return false

	if node.has_method("set_" + key):
		node.call("set_" + key, value)
		return true

	if not _node_has_property(node, key):
		return false

	node.set(key, value)
	return true


# ============================================================
# Undo/Redo & scene mutation helpers
# ============================================================

func _set_owner_recursive(node: Node, owner_node: Node) -> void:
	# 复制/重挂节点时必须递归设置 owner，否则子节点不会被写入 .tscn（保存后丢失）。
	node.set_owner(owner_node)
	for child in node.get_children():
		_set_owner_recursive(child, owner_node)


func _collect_owner_map(node: Node) -> Array:
	# 记录 node 及其所有后代当前的 owner，供 undo 时原样恢复。
	var out: Array = [[node, node.owner]]
	for child in node.get_children():
		out.append_array(_collect_owner_map(child))
	return out


func _restore_owners(owner_map: Array) -> void:
	for pair in owner_map:
		var n = pair[0]
		if is_instance_valid(n):
			n.set_owner(pair[1])


func _reparent_and_own(node: Node, new_parent: Node, owner_node: Node) -> void:
	node.reparent(new_parent, true)
	_set_owner_recursive(node, owner_node)


func _maybe_save_scene(params: Dictionary) -> void:
	# 变更类命令默认落盘（便于随后用文件级工具读取），传 save=false 可只改内存。
	if params.get("save", true):
		EditorInterface.save_scene()


func _value_to_jsonable(val, _depth := 0):
	# Convert a Godot value into something JSON.stringify can serialize directly.
	# Vector/Color/Rect2/Transform etc. become their string form; strings and
	# primitives pass through as-is so JSON.stringify does the quoting/escaping —
	# this avoids the double-escaping and invalid-JSON bugs of the old hand-rolled
	# string builder.
	# _depth 上限防止自引用结构（如 metadata 里 d["self"]=d）导致无限递归栈溢出。
	if _depth > 20:
		return str(val)
	match typeof(val):
		TYPE_VECTOR2, TYPE_VECTOR2I, TYPE_VECTOR3, TYPE_VECTOR3I, TYPE_VECTOR4, TYPE_VECTOR4I, TYPE_COLOR, TYPE_RECT2, TYPE_TRANSFORM2D, TYPE_TRANSFORM3D, TYPE_PLANE, TYPE_QUATERNION, TYPE_AABB, TYPE_NODE_PATH, TYPE_RID, TYPE_OBJECT:
			return str(val)
		TYPE_DICTIONARY:
			var d := {}
			for k in val:
				d[str(k)] = _value_to_jsonable(val[k], _depth + 1)
			return d
		TYPE_ARRAY, TYPE_PACKED_BYTE_ARRAY, TYPE_PACKED_INT32_ARRAY, TYPE_PACKED_INT64_ARRAY, TYPE_PACKED_FLOAT32_ARRAY, TYPE_PACKED_FLOAT64_ARRAY, TYPE_PACKED_STRING_ARRAY, TYPE_PACKED_VECTOR2_ARRAY, TYPE_PACKED_VECTOR3_ARRAY, TYPE_PACKED_COLOR_ARRAY:
			var a := []
			for item in val:
				a.append(_value_to_jsonable(item, _depth + 1))
			return a
		_:
			return val


# ============================================================
# Editor State Commands
# ============================================================

func _cmd_get_open_scene() -> Dictionary:
	var es = EditorInterface.get_edited_scene_root()
	if es:
		var path = es.scene_file_path
		if not path or path == "":
			var open_scenes = EditorInterface.get_open_scenes()
			if open_scenes.size() > 0:
				path = open_scenes[0]
		if not path:
			path = "(unsaved)"

		var children: Array = []
		for c in es.get_children():
			children.append({"name": c.name, "type": c.get_class()})
		return {
			"scene": path, "root": es.name, "root_type": es.get_class(),
			"child_count": es.get_child_count(), "top_children": children,
		}
	return {"scene": null}


func _cmd_get_current_scene_tree() -> Dictionary:
	var root = EditorInterface.get_edited_scene_root()
	if not root:
		return {"error": "No scene open"}
	var nodes: Array = []
	_build_tree(root, nodes, 0)
	return {"scene": root.scene_file_path, "node_count": nodes.size(), "tree": nodes}


func _build_tree(node: Node, out: Array, depth: int) -> void:
	var info = {"name": node.name, "type": node.get_class(), "depth": depth}
	if node is Node2D: info["position"] = str(node.position)
	if node is Node3D: info["position"] = str(node.position)
	if node is Control: info["position"] = str(node.position)
	var txt = node.get("text")
	if txt != null: info["text"] = str(txt).substr(0, 50)
	out.append(info)
	for c in node.get_children():
		_build_tree(c, out, depth + 1)


func _cmd_get_open_scenes() -> Dictionary:
	return {"scenes": Array(EditorInterface.get_open_scenes())}


func _cmd_get_selection() -> Dictionary:
	var sel = EditorInterface.get_selection()
	var nodes = sel.get_selected_nodes()
	var result: Array = []
	for node in nodes:
		result.append({
			"name": node.name, "type": node.get_class(),
			"path": _get_node_path(node),
		})
	return {"selection": result}


func _cmd_set_selection(params: Dictionary) -> Dictionary:
	var node_path = params.get("node_path", "")
	var property_key = params.get("property", "")
	var property_value = params.get("value", "")
	if not node_path: return {"error": "Missing node_path"}

	var root = EditorInterface.get_edited_scene_root()
	if not root: return {"error": "No scene open"}

	var node = root.get_node(str(node_path))
	if not node: return {"error": "Node not found: " + str(node_path)}

	EditorInterface.get_selection().clear()
	EditorInterface.get_selection().add_node(node)
	EditorInterface.edit_node(node)

	if property_key and property_value:
		_node_set_property(node, property_key, property_value)
		EditorInterface.save_scene()

	var result = {"ok": true, "selected": str(node_path)}
	if property_key: result["set"] = property_key
	return result


# ============================================================
# Scene Operations
# ============================================================

func _cmd_save_scene() -> Dictionary:
	EditorInterface.save_scene()
	return {"ok": true}


func _cmd_save_all_scenes() -> Dictionary:
	EditorInterface.save_all_scenes()
	return {"ok": true}


func _cmd_save_scene_as(params: Dictionary) -> Dictionary:
	var path = str(params.get("path", ""))
	if path.is_empty():
		return {"error": "Missing path"}
	if not path.begins_with("res://"):
		return {"error": "path must start with res:// — got: " + path}
	if not EditorInterface.get_edited_scene_root():
		return {"error": "No scene open"}
	var with_preview = bool(params.get("with_preview", true))
	EditorInterface.save_scene_as(path, with_preview)
	return {"ok": true, "path": path}


func _cmd_close_scene() -> Dictionary:
	# EditorInterface.close_scene() 在 Godot 4.6 加入（editor_interface.cpp:948）。
	# 旧版本没有该 API，退回到"保存并如实说明"。
	var root = EditorInterface.get_edited_scene_root()
	var scene_path = root.scene_file_path if root else ""
	if not EditorInterface.has_method("close_scene"):
		EditorInterface.save_scene()
		return {
			"ok": false,
			"closed": false,
			"message": "EditorInterface.close_scene() requires Godot 4.6+. Scene was saved instead; it remains open.",
		}
	EditorInterface.close_scene()
	return {"ok": true, "closed": true, "scene": scene_path}


func _cmd_get_unsaved_scenes() -> Dictionary:
	if not EditorInterface.has_method("get_unsaved_scenes"):
		return {"error": "EditorInterface.get_unsaved_scenes() requires Godot 4.4+"}
	return {"scenes": Array(EditorInterface.get_unsaved_scenes())}


func _cmd_mark_scene_unsaved() -> Dictionary:
	if not EditorInterface.get_edited_scene_root():
		return {"error": "No scene open"}
	EditorInterface.mark_scene_as_unsaved()
	return {"ok": true}


func _cmd_reload_scene() -> Dictionary:
	var root = EditorInterface.get_edited_scene_root()
	var scene_path = root.scene_file_path if root else ""
	if not scene_path:
		return {"error": "No scene open to reload"}
	EditorInterface.save_scene()
	EditorInterface.reload_scene_from_path(scene_path)
	return {"ok": true, "scene": scene_path, "message": "Scene saved and reloaded"}


# ============================================================
# Playback
# ============================================================

func _cmd_play_project() -> Dictionary:
	EditorInterface.play_main_scene()
	return {"ok": true, "playing": true}


func _cmd_stop_project() -> Dictionary:
	EditorInterface.stop_playing_scene()
	return {"ok": true, "playing": false}


func _cmd_pause_project() -> Dictionary:
	# 注意：插件运行在编辑器进程内，get_tree() 是编辑器的 SceneTree，
	# 无法暂停正在运行的游戏（运行中的游戏是独立进程/树）。
	# 这里只切换编辑器树的 paused 状态，避免误导调用方。
	var tree = get_tree()
	if tree:
		tree.paused = not tree.paused
		var is_paused = tree.paused
		return {"ok": true, "paused": is_paused, "scope": "editor", "message": ("Editor tree paused" if is_paused else "Editor tree resumed") + " (running game is a separate process and is unaffected)"}
	return {"error": "No scene tree available"}


func _cmd_is_playing() -> Dictionary:
	return {
		"playing": EditorInterface.is_playing_scene(),
		"scene": EditorInterface.get_playing_scene(),
	}


func _cmd_run_specific_scene(params: Dictionary) -> Dictionary:
	var scene_path = params.get("scene", "")
	if not scene_path:
		return {"error": "Missing scene path"}
	EditorInterface.play_custom_scene(str(scene_path))
	return {"ok": true, "running": str(scene_path)}


func _cmd_play_current_scene() -> Dictionary:
	var root = EditorInterface.get_edited_scene_root()
	if not root:
		return {"error": "No scene open"}
	if root.scene_file_path.is_empty():
		return {"error": "Current scene has never been saved — save it first (save_scene_as)"}
	EditorInterface.play_current_scene()
	return {"ok": true, "playing": true, "scene": root.scene_file_path}


func _cmd_get_playing_scene() -> Dictionary:
	return {
		"playing": EditorInterface.is_playing_scene(),
		"scene": EditorInterface.get_playing_scene(),
	}


# ============================================================
# Edit Operations
# ============================================================

func _scene_history() -> UndoRedo:
	# EditorUndoRedoManager 并没有绑定 undo()/redo()/get_current_action_name()，
	# 必须先取出当前场景对应的 UndoRedo 历史对象才能真正撤销/重做。
	var urm = EditorInterface.get_editor_undo_redo()
	if not urm: return null
	var hid := 0
	var root = EditorInterface.get_edited_scene_root()
	if root:
		hid = urm.get_object_history_id(root)
	return urm.get_history_undo_redo(hid)


func _cmd_undo() -> Dictionary:
	var hist: UndoRedo = _scene_history()
	if not hist: return {"error": "Undo history unavailable"}
	if not hist.has_undo(): return {"ok": true, "undone": false, "message": "Nothing to undo"}
	var action_name: String = hist.get_current_action_name()
	hist.undo()
	return {"ok": true, "undone": true, "action": action_name}


func _cmd_redo() -> Dictionary:
	var hist: UndoRedo = _scene_history()
	if not hist: return {"error": "Redo history unavailable"}
	if not hist.has_redo(): return {"ok": true, "redone": false, "message": "Nothing to redo"}
	hist.redo()
	return {"ok": true, "redone": true, "action": hist.get_current_action_name()}


func _cmd_cut_selected() -> Dictionary:
	var es = EditorInterface.get_selection()
	var nodes = es.get_selected_nodes()
	if nodes.is_empty(): return {"ok": true, "cut": 0}
	var root = EditorInterface.get_edited_scene_root()
	_clipboard_nodes = []
	
	# Use undo_redo for proper undo support
	var ur = get_undo_redo()
	ur.create_action("Cut Nodes")
	for n in nodes:
		var parent_path = _get_node_path(n.get_parent()) if n.get_parent() else ""
		_clipboard_nodes.append({
			"type": n.get_class(),
			"name": n.name,
			"parent_path": parent_path,
			"properties": _serialize_node_properties(n),
		})
		ur.add_do_method(n.get_parent(), "remove_child", n)
		ur.add_undo_method(n.get_parent(), "add_child", n)
		ur.add_undo_reference(n)
	ur.commit_action()
	
	EditorInterface.get_selection().clear()
	EditorInterface.save_scene()
	return {"ok": true, "cut": nodes.size()}

var _clipboard_nodes: Array = []

func _cmd_copy_selected() -> Dictionary:
	var es = EditorInterface.get_selection()
	var nodes = es.get_selected_nodes()
	if nodes.is_empty(): return {"ok": true, "copied": 0}
	_clipboard_nodes = []
	for n in nodes:
		_clipboard_nodes.append({"type": n.get_class(), "name": n.name, "parent_path": _get_node_path(n.get_parent()) if n.get_parent() else ""})
	return {"ok": true, "copied": nodes.size()}

func _cmd_paste() -> Dictionary:
	if _clipboard_nodes.is_empty(): return {"ok": true, "pasted": 0}
	var root = EditorInterface.get_edited_scene_root()
	if not root: return {"error": "No scene open"}
	var es = EditorInterface.get_selection()
	var parent = root
	var sel = es.get_selected_nodes()
	if not sel.is_empty(): parent = sel[0]
	
	var ur = get_undo_redo()
	ur.create_action("Paste Nodes")
	var pasted = 0
	for item in _clipboard_nodes:
		var t = item["type"]
		if not ClassDB.class_exists(t): continue
		var node = ClassDB.instantiate(t)
		node.name = item["name"]
		parent.add_child(node)
		node.set_owner(root)
		
		# Restore serialized properties
		var props = item.get("properties", {})
		if typeof(props) == TYPE_DICTIONARY:
			for key in props:
				_node_set_property(node, key, str(props[key]))
		
		ur.add_do_method(parent, "add_child", node)
		ur.add_do_method(node, "set_owner", root)
		ur.add_undo_method(parent, "remove_child", node)
		pasted += 1
	ur.commit_action()
	EditorInterface.save_scene()
	return {"ok": true, "pasted": pasted}


func _cmd_unpause_project() -> Dictionary:
	# Unpause the scene tree if it's currently paused
	var tree = get_tree()
	if tree and tree.paused:
		tree.paused = false
		return {"ok": true, "paused": false, "message": "Project unpaused"}
	elif tree and not tree.paused and EditorInterface.is_playing_scene():
		return {"ok": true, "paused": false, "message": "Project is already running (not paused)"}
	return {"ok": true, "message": "Project not playing"}


# ============================================================
# Node Operations (Live)
# ============================================================

func _cmd_select_node(params: Dictionary) -> Dictionary:
	return _cmd_set_selection(params)


func _cmd_move_node(params: Dictionary) -> Dictionary:
	var node_path = params.get("node_path", "")
	var position = params.get("position", null)
	var root = EditorInterface.get_edited_scene_root()
	if not root: return {"error": "No scene open"}

	var node = root.get_node(str(node_path))
	if not node: return {"error": "Node not found"}

	if position == null: return {"error": "Missing position"}
	if not (node is Node2D or node is Control):
		return {"error": "Node is not Node2D/Control (use move_node_3d for Node3D)"}

	var target = _parse_value(str(position))
	if not (target is Vector2):
		# 兼容裸坐标写法 "10, 20"，避免调用方必须记住 Vector2(...) 前缀。
		var parts = str(position).replace("Vector2(", "").replace("(", "").replace(")", "").split(",", false)
		if parts.size() < 2: return {"error": "Cannot parse position: " + str(position)}
		target = Vector2(float(parts[0]), float(parts[1]))

	var ur = get_undo_redo()
	ur.create_action("MCP: Move %s" % node.name)
	ur.add_do_property(node, "position", target)
	ur.add_undo_property(node, "position", node.position)
	ur.commit_action()

	_maybe_save_scene(params)
	return {"ok": true, "new_position": str(node.position), "undoable": true}


func _cmd_move_node_3d(params: Dictionary) -> Dictionary:
	var node_path = params.get("node_path", "")
	var position = params.get("position", null)
	var root = EditorInterface.get_edited_scene_root()
	if not root: return {"error": "No scene open"}

	var node = root.get_node(str(node_path))
	if not node: return {"error": "Node not found"}

	if position == null: return {"error": "Missing position"}
	if not (node is Node3D): return {"error": "Node is not Node3D (use move_node for 2D/Control)"}

	var target = _parse_value(str(position))
	if not (target is Vector3):
		var parts = str(position).replace("Vector3(", "").replace("(", "").replace(")", "").split(",", false)
		if parts.size() < 3: return {"error": "Cannot parse position: " + str(position)}
		target = Vector3(float(parts[0]), float(parts[1]), float(parts[2]))

	var ur = get_undo_redo()
	ur.create_action("MCP: Move %s" % node.name)
	ur.add_do_property(node, "position", target)
	ur.add_undo_property(node, "position", node.position)
	ur.commit_action()

	_maybe_save_scene(params)
	return {"ok": true, "new_position": str(node.position), "undoable": true}


func _cmd_delete_selected() -> Dictionary:
	var sel = EditorInterface.get_selection()
	var nodes = sel.get_selected_nodes()
	if nodes.is_empty():
		return {"ok": true, "deleted": 0}

	var root = EditorInterface.get_edited_scene_root()
	# 过滤掉场景根，以及祖先同样被选中的节点（否则会重复删同一棵子树）。
	var targets: Array = []
	for n in nodes:
		if n == root or not n.get_parent(): continue
		var covered := false
		for other in nodes:
			if other != n and other.is_ancestor_of(n):
				covered = true
				break
		if not covered: targets.append(n)
	if targets.is_empty():
		return {"ok": true, "deleted": 0, "note": "Nothing deletable (scene root cannot be deleted)"}

	var ur = get_undo_redo()
	ur.create_action("MCP: Delete %d node(s)" % targets.size())
	for n in targets:
		var parent: Node = n.get_parent()
		ur.add_do_method(parent, "remove_child", n)
		ur.add_undo_method(parent, "add_child", n)
		ur.add_undo_method(parent, "move_child", n, n.get_index())
		ur.add_undo_method(self, "_restore_owners", _collect_owner_map(n))
		ur.add_undo_reference(n)
	ur.commit_action()
	return {"ok": true, "deleted": targets.size(), "undoable": true}


func _cmd_add_node(params: Dictionary) -> Dictionary:
	var node_type = params.get("type", "")
	var node_name = params.get("name", "")
	var parent_path = params.get("parent", ".")
	var properties = params.get("properties", {})

	if not node_type: return {"error": "Missing node type"}

	var root = EditorInterface.get_edited_scene_root()
	if not root: return {"error": "No scene open"}

	# Determine parent
	var parent: Node = root
	if parent_path and parent_path != ".":
		parent = root.get_node(str(parent_path))
		if not parent:
			return {"error": "Parent not found: " + str(parent_path)}

	# Create the node
	var new_node: Node
	if ClassDB.class_exists(node_type):
		new_node = ClassDB.instantiate(node_type)
	else:
		return {"error": "Invalid node type: " + node_type}

	if node_name:
		new_node.name = node_name
	else:
		new_node.name = _generate_node_name(node_type, parent)

	# 属性在入树前设置：此时对象尚未被 UndoRedo 记录，写入最干净。
	var failed: Array = []
	for key in properties:
		if not _node_set_property(new_node, key, str(properties[key])):
			failed.append(key)

	# 包裹到编辑器的撤销栈，使 MCP 的改动可以直接 Ctrl+Z 撤销。
	var ur = get_undo_redo()
	ur.create_action("MCP: Add %s" % node_type)
	ur.add_do_method(parent, "add_child", new_node)
	ur.add_do_method(new_node, "set_owner", root)
	ur.add_do_reference(new_node)
	ur.add_undo_method(parent, "remove_child", new_node)
	ur.commit_action()

	_maybe_save_scene(params)

	var result := {
		"ok": true,
		"name": new_node.name,
		"type": node_type,
		"path": _get_node_path(new_node),
		"undoable": true,
	}
	if not failed.is_empty():
		result["failed_properties"] = failed
	return result


func _cmd_remove_node(params: Dictionary) -> Dictionary:
	var node_path = params.get("path", "")
	if not node_path: return {"error": "Missing path"}

	var root = EditorInterface.get_edited_scene_root()
	if not root: return {"error": "No scene open"}

	var node = root.get_node(str(node_path))
	if not node: return {"error": "Node not found: " + str(node_path)}
	if node == root: return {"error": "Cannot remove root node"}

	var parent: Node = node.get_parent()
	if not parent: return {"error": "Node has no parent: " + str(node_path)}

	# 旧实现用 queue_free()：删除被延迟到帧末，而 save_scene() 立即执行，
	# 结果保存下来的 .tscn 里节点仍然存在。改为立即 remove_child + 撤销记录。
	var idx: int = node.get_index()
	var owner_map: Array = _collect_owner_map(node)
	var ur = get_undo_redo()
	ur.create_action("MCP: Remove %s" % node.name)
	ur.add_do_method(parent, "remove_child", node)
	ur.add_undo_method(parent, "add_child", node)
	ur.add_undo_method(parent, "move_child", node, idx)
	ur.add_undo_method(self, "_restore_owners", owner_map)
	ur.add_undo_reference(node)
	ur.commit_action()

	_maybe_save_scene(params)
	return {"ok": true, "removed": str(node_path), "undoable": true}


func _cmd_get_node_properties(params: Dictionary) -> Dictionary:
	var node_path = params.get("path", "")
	if not node_path: return {"error": "Missing path"}

	var root = EditorInterface.get_edited_scene_root()
	if not root: return {"error": "No scene open"}

	var node = root.get_node(str(node_path))
	if not node: return {"error": "Node not found: " + str(node_path)}

	var props: Dictionary = {}
	for prop in node.get_property_list():
		var name = prop["name"]
		if name.begins_with("_"): continue
		var usage = prop.get("usage", 0)
		if not (usage & PROPERTY_USAGE_EDITOR): continue

		var val = node.get(name)
		props[name] = _value_to_jsonable(val)

	return {
		"node": node.name,
		"type": node.get_class(),
		"path": _get_node_path(node),
		"properties": props,
	}


func _cmd_set_node_properties(params: Dictionary) -> Dictionary:
	var node_path = params.get("path", "")
	var properties = params.get("properties", {})

	if not node_path: return {"error": "Missing path"}
	if typeof(properties) != TYPE_DICTIONARY: return {"error": "properties must be a dictionary"}

	var root = EditorInterface.get_edited_scene_root()
	if not root: return {"error": "No scene open"}

	var node = root.get_node(str(node_path))
	if not node: return {"error": "Node not found: " + str(node_path)}

	# 逐属性校验 + 记录旧值，既能反馈哪些键无效，也让整批改动可一次性撤销。
	var applied: Array = []
	var failed: Array = []
	var ur = get_undo_redo()
	ur.create_action("MCP: Set properties on %s" % node.name)
	for key in properties:
		var k: String = str(key)
		var value = _parse_value(str(properties[key]))
		if (k == "transform" and value is String) or not _node_has_property(node, k):
			failed.append(k)
			continue
		ur.add_do_property(node, k, value)
		ur.add_undo_property(node, k, node.get(k))
		applied.append(k)
	ur.commit_action()

	_maybe_save_scene(params)
	var result := {"ok": true, "updated": applied.size(), "applied": applied, "undoable": true}
	if not failed.is_empty():
		result["failed_properties"] = failed
		result["hint"] = "Unknown properties were skipped. Use get_node_properties to list valid names."
	return result


func _cmd_rename_node(params: Dictionary) -> Dictionary:
	var node_path = params.get("path", "")
	var new_name = params.get("name", "")
	if not node_path or not new_name: return {"error": "Missing path or name"}

	var root = EditorInterface.get_edited_scene_root()
	if not root: return {"error": "No scene open"}

	var node = root.get_node(str(node_path))
	if not node: return {"error": "Node not found"}

	# Godot 会静默改写非法名字（. : @ / % 等），这里提前告知调用方。
	var safe_name: String = str(new_name).validate_node_name()
	if safe_name.is_empty():
		return {"error": "Invalid node name: " + str(new_name)}

	var old_name: String = str(node.name)
	var ur = get_undo_redo()
	ur.create_action("MCP: Rename %s" % old_name)
	ur.add_do_property(node, "name", safe_name)
	ur.add_undo_property(node, "name", old_name)
	ur.commit_action()

	_maybe_save_scene(params)
	var result := {"ok": true, "renamed": node.name, "previous": old_name, "undoable": true}
	if node.name != safe_name or safe_name != str(new_name):
		result["note"] = "Name adjusted by the engine (illegal characters or sibling collision)."
	return result


func _cmd_duplicate_node(params: Dictionary) -> Dictionary:
	var node_path = params.get("path", "")
	var new_name = params.get("name", "")
	if not node_path: return {"error": "Missing path"}

	var root = EditorInterface.get_edited_scene_root()
	if not root: return {"error": "No scene open"}

	var node = root.get_node(str(node_path))
	if not node: return {"error": "Node not found"}

	var parent: Node = node.get_parent()
	if not parent:
		return {"error": "Cannot duplicate the scene root; use create_editor_scene or save_scene_as instead"}

	var dup = node.duplicate(DUPLICATE_GROUPS | DUPLICATE_SIGNALS | DUPLICATE_SCRIPTS)
	if new_name: dup.name = str(new_name).validate_node_name()
	else: dup.name = node.name + "_copy"

	var ur = get_undo_redo()
	ur.create_action("MCP: Duplicate %s" % node.name)
	ur.add_do_method(parent, "add_child", dup)
	# 必须递归设 owner：只设根节点会让副本的子节点在保存时被丢弃。
	ur.add_do_method(self, "_set_owner_recursive", dup, root)
	ur.add_do_reference(dup)
	ur.add_undo_method(parent, "remove_child", dup)
	ur.commit_action()

	_maybe_save_scene(params)
	return {"ok": true, "name": dup.name, "path": _get_node_path(dup), "undoable": true}


func _cmd_reparent_node(params: Dictionary) -> Dictionary:
	var node_path = params.get("path", "")
	var new_parent_path = params.get("new_parent", "")
	if not node_path or not new_parent_path: return {"error": "Missing path or new_parent"}

	var root = EditorInterface.get_edited_scene_root()
	if not root: return {"error": "No scene open"}

	var node = root.get_node(str(node_path))
	var new_parent = root.get_node(str(new_parent_path))
	if not node: return {"error": "Node not found"}
	if not new_parent: return {"error": "New parent not found"}
	if node == root: return {"error": "Cannot reparent the scene root"}
	# 把节点挂到它自己的后代下会破坏场景树，Godot 侧会直接崩，必须提前拦。
	if node == new_parent or node.is_ancestor_of(new_parent):
		return {"error": "Cannot reparent a node into itself or one of its descendants"}

	var old_parent: Node = node.get_parent()
	if not old_parent: return {"error": "Node has no parent"}
	if old_parent == new_parent:
		return {"ok": true, "moved": "no-op (already a child of " + str(new_parent_path) + ")"}

	var old_idx: int = node.get_index()
	var owner_map: Array = _collect_owner_map(node)
	var ur = get_undo_redo()
	ur.create_action("MCP: Reparent %s" % node.name)
	ur.add_do_method(self, "_reparent_and_own", node, new_parent, root)
	ur.add_undo_method(self, "_reparent_and_own", node, old_parent, root)
	ur.add_undo_method(old_parent, "move_child", node, old_idx)
	ur.add_undo_method(self, "_restore_owners", owner_map)
	ur.commit_action()

	_maybe_save_scene(params)
	return {"ok": true, "moved": str(node_path) + " → " + str(new_parent_path), "undoable": true}


# ============================================================
# Script Operations
# ============================================================

func _cmd_create_script(params: Dictionary) -> Dictionary:
	var path = params.get("path", "")
	var extends_type = params.get("extends", "Node")
	var template = params.get("template", "")
	if not path: return {"error": "Missing path"}

	if not ClassDB.class_exists(extends_type):
		return {"error": "Invalid base class: " + extends_type}

	var script = GDScript.new()
	script.source_code = _build_script_template(extends_type, template)
	var err = ResourceSaver.save(script, str(path))
	if err != OK:
		return {"error": "Failed to save script: " + str(err)}

	# Open in editor
	EditorInterface.edit_resource(script)
	return {"ok": true, "path": path, "extends": extends_type}


func _cmd_attach_script(params: Dictionary) -> Dictionary:
	var node_path = params.get("path", "")
	var script_path = params.get("script", "")
	if not node_path or not script_path: return {"error": "Missing path or script"}

	var root = EditorInterface.get_edited_scene_root()
	if not root: return {"error": "No scene open"}

	var node = root.get_node(str(node_path))
	if not node: return {"error": "Node not found"}

	var script = load(str(script_path))
	if not script: return {"error": "Script not found at: " + str(script_path)}

	node.set_script(script)
	EditorInterface.save_scene()
	return {"ok": true, "attached": script_path}


func _cmd_run_gdscript(params: Dictionary) -> Dictionary:
	var code = params.get("code", "")
	if not code: return {"error": "Missing code"}

	# Execute GDScript in editor context using an Expression or temporary node
	var expression = Expression.new()
	var err = expression.parse(code)
	if err != OK:
		return {"error": "Parse error: " + expression.get_error_text()}

	var result = expression.execute([], EditorInterface.get_edited_scene_root())
	if expression.has_execute_failed():
		return {"error": "Execution error: " + expression.get_error_text()}

	return {"ok": true, "result": _value_to_jsonable(result)}


func _build_script_template(extends_type: String, template: String) -> String:
	if template == "node_script" or template == "character":
		return "extends " + extends_type + "\n\nfunc _ready():\n\tpass\n\nfunc _process(delta):\n\tpass\n"
	elif template == "resource_script":
		return "extends " + extends_type + "\n\nclass_name MyResource\n"
	elif template == "signal":
		return "extends " + extends_type + "\n\nsignal my_signal\n\nfunc _ready():\n\tpass\n"
	else:
		return "extends " + extends_type + "\n"


# ============================================================
# Debug Commands
# ============================================================

func _cmd_get_editor_output() -> Dictionary:
	# 编辑器 stdout/stderr 由 MCP 服务器从子进程捕获（monitor_output），
	# 插件内不再维护输出缓冲。保留空数组以兼容旧客户端。
	return {"output": Array(_output_buffer), "note": "Editor output is captured by the MCP server via process stdout; this buffer is legacy and empty."}


func _cmd_get_editor_version() -> Dictionary:
	return {"version": Engine.get_version_info()}


func _cmd_get_editor_info() -> Dictionary:
	var scene = _cmd_get_open_scene()
	var rect = DisplayServer.window_get_size()
	var out := {
		"version": Engine.get_version_info(),
		"playing": EditorInterface.is_playing_scene(),
		"playing_scene": EditorInterface.get_playing_scene(),
		"open_scene": scene.get("scene", null),
		"open_scenes": Array(EditorInterface.get_open_scenes()),
		"main_screen": EditorInterface.get_editor_main_screen().get_class() if EditorInterface.get_editor_main_screen() else "",
		"editor_width": rect.x,
		"editor_height": rect.y,
		"editor_scale": EditorInterface.get_editor_scale(),
		"editor_language": EditorInterface.get_editor_language(),
		"distraction_free": EditorInterface.is_distraction_free_mode_enabled(),
		"movie_maker": EditorInterface.is_movie_maker_enabled(),
		"multi_window": EditorInterface.is_multi_window_enabled(),
		"current_directory": EditorInterface.get_current_directory(),
		"plugin_version": PLUGIN_VERSION,
	}
	if EditorInterface.has_method("get_unsaved_scenes"):
		out["unsaved_scenes"] = Array(EditorInterface.get_unsaved_scenes())
	return out


func _cmd_get_breakpoints() -> Dictionary:
	var script_editor = EditorInterface.get_script_editor()
	var breakpoints: Array = []
	# Breakpoints are per-script, iterate open scripts
	var open_editors = script_editor.get_open_script_editors()
	for i in open_editors.size():
		var se = open_editors[i]
		if not se: continue
		var base = se.get_base_editor()
		if base and base.has_method("get_breakpoints"):
			var bps = base.get_breakpoints()
			if bps:
				for bp in bps:
					breakpoints.append(bp)
	return {"breakpoints": breakpoints}


func _cmd_set_breakpoint(params: Dictionary) -> Dictionary:
	var script_path = params.get("script", "")
	var line = params.get("line", 0)
	if not script_path or line <= 0: return {"error": "Missing script or line"}

	var script_editor = EditorInterface.get_script_editor()
	# Open the script first
	EditorInterface.edit_resource(load(str(script_path)))

	# Set breakpoint via ScriptEditor
	for se in script_editor.get_open_script_editors():
		var base = se.get_base_editor()
		if base and base.has_method("set_breakpoint"):
			base.set_breakpoint(int(line), true)
			return {"ok": true, "script": script_path, "line": line}

	return {"error": "Could not find script editor for: " + script_path}


func _cmd_remove_breakpoint(params: Dictionary) -> Dictionary:
	var script_path = params.get("script", "")
	var line = params.get("line", 0)
	if not script_path or line <= 0: return {"error": "Missing script or line"}

	var script_editor = EditorInterface.get_script_editor()
	for se in script_editor.get_open_script_editors():
		var base = se.get_base_editor()
		if base and base.has_method("remove_breakpoint"):
			base.remove_breakpoint(int(line))
			return {"ok": true, "script": script_path, "line": line}

	return {"ok": true, "note": "Script may not be open; breakpoint will apply when opened"}


# ============================================================
# File System Commands
# ============================================================

func _cmd_open_asset(params: Dictionary) -> Dictionary:
	var path = params.get("path", "")
	if not path: return {"error": "Missing path"}
	EditorInterface.open_scene_from_path(str(path))
	return {"ok": true}


func _cmd_show_in_filesystem(params: Dictionary) -> Dictionary:
	var path = params.get("path", "")
	if not path: return {"error": "Missing path"}
	EditorInterface.get_file_system_dock().navigate_to_path(str(path))
	return {"ok": true}


func _cmd_list_filesystem(params: Dictionary) -> Dictionary:
	var dir_path = params.get("path", "res://")
	var recursive = params.get("recursive", false)
	var pattern = params.get("pattern", "")

	var dir = DirAccess.open(str(dir_path))
	if not dir:
		return {"error": "Cannot open: " + str(dir_path)}

	var files: Array = []
	_list_dir(dir, dir_path, files, recursive, pattern, 0, 3)

	return {"path": str(dir_path), "files": files}


func _cmd_get_filesystem_selection() -> Dictionary:
	# FileSystem dock state — what the user currently has highlighted/navigated to.
	return {
		"current_directory": EditorInterface.get_current_directory(),
		"current_path": EditorInterface.get_current_path(),
		"selected_paths": Array(EditorInterface.get_selected_paths()),
	}


func _cmd_open_script_at_line(params: Dictionary) -> Dictionary:
	var path = str(params.get("path", ""))
	if path.is_empty():
		return {"error": "Missing path"}
	if not ResourceLoader.exists(path):
		return {"error": "Script not found: " + path}
	var script = load(path)
	if not (script is Script):
		return {"error": "Not a Script resource: " + path}
	# edit_script() is 1-based for the line; column defaults to 0.
	var line = int(params.get("line", 1))
	var column = int(params.get("column", 0))
	var grab_focus = bool(params.get("grab_focus", true))
	EditorInterface.edit_script(script, line, column, grab_focus)
	return {"ok": true, "path": path, "line": line}


func _list_dir(dir: DirAccess, base: String, out: Array, recursive: bool, pattern: String, depth: int, max_depth: int) -> void:
	if depth > max_depth: return
	dir.list_dir_begin()
	var fn = dir.get_next()
	while fn != "":
		if fn == "." or fn == "..":
			fn = dir.get_next()
			continue
		var full = str(base) + "/" + fn
		if dir.current_is_dir():
			out.append({"name": fn, "path": full, "type": "dir"})
			if recursive:
				var sub = DirAccess.open(full)
				if sub:
					_list_dir(sub, full, out, recursive, pattern, depth + 1, max_depth)
		else:
			if pattern and not fn.match(pattern):
				fn = dir.get_next()
				continue
			out.append({"name": fn, "path": full, "type": "file"})
		fn = dir.get_next()


# ============================================================
# UI / Window Commands
# ============================================================

func _cmd_get_editor_rect() -> Dictionary:
	var rect = DisplayServer.window_get_size()
	return {"width": rect.x, "height": rect.y}


func _cmd_focus_editor() -> Dictionary:
	DisplayServer.window_move_to_foreground()
	return {"ok": true}


func _cmd_show_toast(params: Dictionary) -> Dictionary:
	# EditorToaster.push_toast(message, severity, tooltip)
	# severity: 0 = INFO, 1 = WARNING, 2 = ERROR (editor/gui/editor_toaster.cpp:565)
	var message = str(params.get("message", ""))
	if message.is_empty():
		return {"error": "Missing message"}
	var severity_name = str(params.get("severity", "info")).to_lower()
	var severity := 0
	match severity_name:
		"warning", "warn": severity = 1
		"error", "err": severity = 2
		_: severity = 0
	var toaster = EditorInterface.get_editor_toaster()
	if not toaster:
		return {"error": "Editor toaster unavailable"}
	toaster.push_toast(message, severity, str(params.get("tooltip", "")))
	return {"ok": true, "severity": severity_name}


func _cmd_set_distraction_free(params: Dictionary) -> Dictionary:
	if not params.has("enabled"):
		return {"enabled": EditorInterface.is_distraction_free_mode_enabled()}
	var enabled = bool(params.get("enabled"))
	EditorInterface.set_distraction_free_mode(enabled)
	return {"ok": true, "enabled": enabled}


func _cmd_set_movie_maker(params: Dictionary) -> Dictionary:
	# Movie Maker mode: the next play session writes frames to a video file
	# instead of running in real time (see application/run/movie_writer/*).
	if not params.has("enabled"):
		return {"enabled": EditorInterface.is_movie_maker_enabled()}
	var enabled = bool(params.get("enabled"))
	EditorInterface.set_movie_maker_enabled(enabled)
	return {"ok": true, "enabled": enabled}


func _cmd_get_3d_snap() -> Dictionary:
	return {
		"snap_enabled": EditorInterface.is_node_3d_snap_enabled(),
		"translate_snap": EditorInterface.get_node_3d_translate_snap(),
		"rotate_snap": EditorInterface.get_node_3d_rotate_snap(),
		"scale_snap": EditorInterface.get_node_3d_scale_snap(),
	}


func _cmd_get_editor_paths() -> Dictionary:
	var paths = EditorInterface.get_editor_paths()
	var out := {
		"editor_scale": EditorInterface.get_editor_scale(),
		"editor_language": EditorInterface.get_editor_language(),
		"multi_window": EditorInterface.is_multi_window_enabled(),
	}
	if paths:
		out["data_dir"] = paths.get_data_dir()
		out["config_dir"] = paths.get_config_dir()
		out["cache_dir"] = paths.get_cache_dir()
		out["project_settings_dir"] = paths.get_project_settings_dir()
		out["self_contained"] = paths.is_self_contained()
	return out


func _cmd_restart_editor(params: Dictionary) -> Dictionary:
	# Destructive: tears down the editor process (and this TCP bridge with it).
	# Require an explicit opt-in so an agent can't trigger it by accident.
	if not bool(params.get("confirm", false)):
		return {"error": "restart_editor requires confirm=true (this closes the editor and drops the MCP bridge connection)"}
	var save_scenes = bool(params.get("save", true))
	EditorInterface.restart_editor(save_scenes)
	return {"ok": true, "restarting": true, "saved": save_scenes}


func _cmd_open_dock(params: Dictionary) -> Dictionary:
	var dock_name = params.get("dock", "")
	if not dock_name: return {"error": "Missing dock name"}

	match dock_name.to_lower():
		"filesystem", "files":
			EditorInterface.set_main_screen_editor("Filesystem")
		"inspector":
			EditorInterface.set_main_screen_editor("Inspector")
		"node", "scene":
			EditorInterface.set_main_screen_editor("Node")
		"output", "console":
			# Show the bottom panel via editor main screen
			EditorInterface.set_main_screen_editor("Script")
		_:
			return {"error": "Unknown dock: " + dock_name + ". Valid: filesystem, inspector, scene, output"}

	return {"ok": true, "dock": dock_name}


# ============================================================
# Scene Creation
# ============================================================

func _cmd_create_editor_scene(params: Dictionary) -> Dictionary:
	var path = params.get("path", ""); var root_type = params.get("root_type", "Node2D")
	if not path: return {"error": "Missing path"}
	if not ClassDB.class_exists(root_type): return {"error": "Invalid root type: " + root_type}
	var root: Node
	if root_type == "Node2D":
		root = Node2D.new()
	elif root_type == "Node3D":
		root = Node3D.new()
	elif root_type == "Control":
		root = Control.new()
	else:
		root = ClassDB.instantiate(root_type)
	root.name = params.get("root_name", root_type)
	var packed = PackedScene.new(); packed.pack(root)
	var err = ResourceSaver.save(packed, str(path)); root.queue_free()
	if err != OK: return {"error": "Failed to save: " + str(err)}
	EditorInterface.open_scene_from_path(str(path))
	return {"ok": true, "path": path, "root": root_type}


func _cmd_instantiate_scene(params: Dictionary) -> Dictionary:
	var sp = params.get("scene", ""); var pp = params.get("parent", "."); var nn = params.get("name", "")
	if not sp: return {"error": "Missing scene path"}
	var root = EditorInterface.get_edited_scene_root()
	if not root: return {"error": "No scene open"}
	if not ResourceLoader.exists(str(sp)): return {"error": "Scene not found: " + str(sp)}
	var packed = load(str(sp))
	# load() 对非场景资源（图片/脚本等）也会成功，直接 instantiate() 会崩溃。
	if not (packed is PackedScene): return {"error": "Not a PackedScene: " + str(sp)}
	var inst = packed.instantiate()
	if not inst: return {"error": "Failed to instantiate: " + str(sp)}
	if nn: inst.name = str(nn).validate_node_name()
	var parent: Node = root
	if pp != ".":
		parent = root.get_node(str(pp))
		if not parent:
			inst.free()
			return {"error": "Parent not found: " + str(pp)}

	var ur = get_undo_redo()
	ur.create_action("MCP: Instantiate %s" % str(sp).get_file())
	ur.add_do_method(parent, "add_child", inst)
	# 实例化场景只设根 owner：子节点属于被实例化的场景，不能被外层持有。
	ur.add_do_method(inst, "set_owner", root)
	ur.add_do_reference(inst)
	ur.add_undo_method(parent, "remove_child", inst)
	ur.commit_action()

	_maybe_save_scene(params)
	return {"ok": true, "name": inst.name, "type": inst.get_class(), "path": _get_node_path(inst), "undoable": true}


func _cmd_set_main_scene(params: Dictionary) -> Dictionary:
	var sp = params.get("scene", "")
	if not sp: sp = params.get("path", "")
	if not sp: return {"error": "Missing scene path"}
	ProjectSettings.set_setting("application/run/main_scene", str(sp)); ProjectSettings.save()
	return {"ok": true, "main_scene": sp}


# ============================================================
# Debugger Control
# ============================================================

func _cmd_debug_continue() -> Dictionary:
	var se = EditorInterface.get_script_editor()
	if not se:
		return {"error": "Script editor not available"}
	se.debug_continue()
	return {"ok": true}

func _cmd_debug_step() -> Dictionary:
	var se = EditorInterface.get_script_editor()
	if not se:
		return {"error": "Script editor not available"}
	se.debug_step()
	return {"ok": true}

func _cmd_debug_step_over() -> Dictionary:
	var se = EditorInterface.get_script_editor()
	if not se:
		return {"error": "Script editor not available"}
	se.debug_next()
	return {"ok": true}

func _cmd_debug_break() -> Dictionary:
	EditorInterface.stop_playing_scene(); return {"ok": true}

func _cmd_get_stack_trace() -> Dictionary:
	var se = EditorInterface.get_script_editor()
	if not se: return {"error": "Script editor not available"}
	var dbg = se.get_debugger()
	if not dbg: return {"error": "Debugger not running. Start project in debug mode first."}
	var st: Array = []
	for i in dbg.get_stack_count():
		var f = dbg.get_stack_frame(i)
		if f: st.append({"source": f.get("source", ""), "function": f.get("function", ""), "line": f.get("line", 0)})
	return {"stack": st, "count": st.size()}

func _cmd_get_debug_variables() -> Dictionary:
	var se = EditorInterface.get_script_editor()
	if not se: return {"error": "Script editor not available"}
	var dbg = se.get_debugger()
	if not dbg: return {"error": "Debugger not running"}
	var vars: Dictionary = {}
	for i in dbg.get_dump_stack_members_count():
		var m = dbg.get_dump_stack_member(i)
		if m: vars[m.get("name", "")] = str(m.get("value", ""))
	return {"variables": vars}

func _cmd_evaluate_expression(params: Dictionary) -> Dictionary:
	var expr_str = params.get("expression", "")
	if not expr_str: return {"error": "Missing expression"}
	var expr = Expression.new()
	if expr.parse(expr_str) != OK: return {"error": "Parse error: " + expr.get_error_text()}
	var result = expr.execute([], EditorInterface.get_edited_scene_root())
	if expr.has_execute_failed(): return {"error": "Eval error: " + expr.get_error_text()}
	return {"ok": true, "result": str(result)}


# ============================================================
# Editor & Project Settings
# ============================================================

func _cmd_get_editor_setting(params: Dictionary) -> Dictionary:
	var key = params.get("key", "")
	if not key: key = params.get("setting", "")
	if not key: return {"error": "Missing key"}
	if EditorInterface.get_editor_settings().has_setting(key):
		return {"key": key, "value": str(EditorInterface.get_editor_settings().get_setting(key))}
	return {"error": "Setting not found: " + key}

func _cmd_set_editor_setting(params: Dictionary) -> Dictionary:
	var key = params.get("key", ""); var value = params.get("value", "")
	if not key: key = params.get("setting", "")
	if not key: return {"error": "Missing key"}
	EditorInterface.get_editor_settings().set_setting(key, _parse_value(value))
	return {"ok": true, "key": key}

func _cmd_get_project_setting(params: Dictionary) -> Dictionary:
	var key = params.get("key", "")
	if not key: key = params.get("setting", "")
	if not key: return {"error": "Missing key"}
	if ProjectSettings.has_setting(key):
		return {"key": key, "value": str(ProjectSettings.get_setting(key))}
	return {"error": "Setting not found: " + key}

func _cmd_set_project_setting(params: Dictionary) -> Dictionary:
	var key = params.get("key", ""); var value = params.get("value", "")
	if not key: key = params.get("setting", "")
	if not key: return {"error": "Missing key"}
	ProjectSettings.set_setting(key, _parse_value(value)); ProjectSettings.save()
	return {"ok": true, "key": key}


# ============================================================
# Signals (Live Editor)
# ============================================================

func _cmd_connect_signal(params: Dictionary) -> Dictionary:
	var np = params.get("node", ""); var sn = params.get("signal", "")
	var tp = params.get("target", ""); var mt = params.get("method", "")
	if not np or not sn or not mt: return {"error": "Missing node, signal, or method"}
	var root = EditorInterface.get_edited_scene_root()
	if not root: return {"error": "No scene open"}
	var src = root.get_node(str(np)); var tgt = root.get_node(str(tp)) if tp else root
	if not src: return {"error": "Source not found"}
	if not tgt: return {"error": "Target not found"}
	if not src.has_signal(sn): return {"error": "Signal not found: " + sn}
	src.connect(sn, Callable(tgt, mt))
	EditorInterface.save_scene()
	return {"ok": true, "signal": sn, "from": np, "to": tp}

func _cmd_disconnect_signal(params: Dictionary) -> Dictionary:
	var np = params.get("node", ""); var sn = params.get("signal", "")
	var tp = params.get("target", ""); var mt = params.get("method", "")
	if not np or not sn: return {"error": "Missing node or signal"}
	var root = EditorInterface.get_edited_scene_root()
	if not root: return {"error": "No scene open"}
	var src = root.get_node(str(np))
	if not src: return {"error": "Node not found"}
	if tp and mt: src.disconnect(sn, Callable(root.get_node(str(tp)), mt))
	else:
		for c in src.get_signal_connection_list(sn): src.disconnect(sn, c["callable"])
	EditorInterface.save_scene()
	return {"ok": true, "disconnected": sn}

func _cmd_list_node_signals(params: Dictionary) -> Dictionary:
	var np = params.get("node", "")
	if not np: return {"error": "Missing node path"}
	var root = EditorInterface.get_edited_scene_root()
	if not root: return {"error": "No scene open"}
	var node = root.get_node(str(np))
	if not node: return {"error": "Node not found"}
	var sigs: Array = []
	for s in node.get_signal_list():
		var nm = s["name"]; var conns = node.get_signal_connection_list(nm)
		var targets: Array = []
		for c in conns: targets.append({"method": c.get("method", ""), "target": str(c.get("target", ""))})
		sigs.append({"name": nm, "connections": conns.size(), "targets": targets})
	return {"node": node.name, "signals": sigs}


# ============================================================
# Export, State, Input, Plugins, Screenshot
# ============================================================

func _cmd_editor_export(params: Dictionary) -> Dictionary:
	return {"message": "Export via editor is limited. Use Godot CLI export_project for reliable export.", "preset": params.get("preset", "")}

func _cmd_get_scene_changes() -> Dictionary:
	var root = EditorInterface.get_edited_scene_root()
	if not root: return {"scene": null, "modified": false}
	# 旧实现调用 EditorUndoRedoManager.get_current_action_name()（未绑定，运行时报错）。
	var hist: UndoRedo = _scene_history()
	if not hist:
		return {"scene": root.scene_file_path, "modified": false}
	return {
		"scene": root.scene_file_path,
		"modified": hist.has_undo(),
		"last_action": hist.get_current_action_name(),
		"can_undo": hist.has_undo(),
		"can_redo": hist.has_redo(),
	}

func _cmd_get_recent_scenes() -> Dictionary:
	var s = EditorInterface.get_editor_settings(); var r: Array = []
	for i in 10:
		var k = "filesystem/recent_dirs/scenes/" + str(i)
		if s.has_setting(k): r.append(s.get_setting(k))
	return {"recent": r}

func _cmd_get_project_directory() -> Dictionary:
	return {"res": "res://", "user": OS.get_user_data_dir()}

func _cmd_simulate_key_press(params: Dictionary) -> Dictionary:
	var ks = params.get("key", ""); var mods = params.get("modifiers", {})
	if not ks: return {"error": "Missing key"}
	var code = _key_name_to_code(ks)
	if code == 0: return {"error": "Unknown key: " + ks}
	var ev = InputEventKey.new(); ev.keycode = code
	ev.ctrl_pressed = mods.get("ctrl", false) or mods.get("command", false)
	ev.shift_pressed = mods.get("shift", false)
	ev.alt_pressed = mods.get("alt", false) or mods.get("option", false); ev.pressed = true
	Input.parse_input_event(ev)
	# Small delay before release (non-blocking via call_deferred)
	var rel = InputEventKey.new(); rel.keycode = code
	rel.ctrl_pressed = ev.ctrl_pressed; rel.shift_pressed = ev.shift_pressed
	rel.alt_pressed = ev.alt_pressed; rel.pressed = false
	call_deferred("_release_key", rel)
	return {"ok": true, "key": ks}


func _release_key(rel: InputEventKey) -> void:
	Input.parse_input_event(rel)

const KEY_NAME_TO_CODE := {
	"a": KEY_A, "b": KEY_B, "c": KEY_C, "d": KEY_D, "e": KEY_E, "f": KEY_F,
	"g": KEY_G, "h": KEY_H, "i": KEY_I, "j": KEY_J, "k": KEY_K, "l": KEY_L,
	"m": KEY_M, "n": KEY_N, "o": KEY_O, "p": KEY_P, "q": KEY_Q, "r": KEY_R,
	"s": KEY_S, "t": KEY_T, "u": KEY_U, "v": KEY_V, "w": KEY_W, "x": KEY_X,
	"y": KEY_Y, "z": KEY_Z,
	"0": KEY_0, "1": KEY_1, "2": KEY_2, "3": KEY_3, "4": KEY_4,
	"5": KEY_5, "6": KEY_6, "7": KEY_7, "8": KEY_8, "9": KEY_9,
	"space": KEY_SPACE, "enter": KEY_ENTER, "return": KEY_ENTER,
	"escape": KEY_ESCAPE, "esc": KEY_ESCAPE, "tab": KEY_TAB,
	"backspace": KEY_BACKSPACE, "delete": KEY_DELETE, "del": KEY_DELETE,
	"up": KEY_UP, "down": KEY_DOWN, "left": KEY_LEFT, "right": KEY_RIGHT,
	"home": KEY_HOME, "end": KEY_END, "pageup": KEY_PAGEUP, "pagedown": KEY_PAGEDOWN,
	"f1": KEY_F1, "f2": KEY_F2, "f3": KEY_F3, "f4": KEY_F4, "f5": KEY_F5,
	"f6": KEY_F6, "f7": KEY_F7, "f8": KEY_F8, "f9": KEY_F9, "f10": KEY_F10,
	"f11": KEY_F11, "f12": KEY_F12,
	"ctrl": KEY_CTRL, "shift": KEY_SHIFT, "alt": KEY_ALT,
	"ui_save": KEY_S, "ui_undo": KEY_Z, "ui_redo": KEY_Y, "ui_copy": KEY_C,
	"ui_cut": KEY_X, "ui_paste": KEY_V, "ui_select_all": KEY_A,
	"ui_play": KEY_F5, "ui_stop": KEY_F8,
}

func _key_name_to_code(n: String) -> int:
	return KEY_NAME_TO_CODE.get(n.to_lower(), 0)

func _cmd_get_plugin_list() -> Dictionary:
	var dir = DirAccess.open("res://addons/"); var plugins: Array = []
	if not dir: return {"plugins": [], "count": 0}
	dir.list_dir_begin(); var fn = dir.get_next()
	while fn != "":
		if fn != "." and fn != ".." and dir.current_is_dir():
			var cp = "res://addons/" + fn + "/plugin.cfg"
			if FileAccess.file_exists(cp):
				var cfg = ConfigFile.new()
				if cfg.load(cp) == OK:
					plugins.append({"id": fn, "name": cfg.get_value("plugin", "name", fn), "version": cfg.get_value("plugin", "version", "?"), "enabled": EditorInterface.is_plugin_enabled(fn)})
		fn = dir.get_next()
	return {"plugins": plugins, "count": plugins.size()}

func _cmd_enable_plugin(params: Dictionary) -> Dictionary:
	var p = params.get("plugin", ""); if not p: return {"error": "Missing plugin name"}
	EditorInterface.set_plugin_enabled(p, true); return {"ok": true, "plugin": p}

func _cmd_disable_plugin(params: Dictionary) -> Dictionary:
	var p = params.get("plugin", ""); if not p: return {"error": "Missing plugin name"}
	EditorInterface.set_plugin_enabled(p, false); return {"ok": true, "plugin": p}

func _cmd_take_screenshot(params: Dictionary) -> Dictionary:
	var path = params.get("path", "res://editor_screenshot.png")
	var vp = EditorInterface.get_editor_main_screen().get_viewport()
	if not vp: return {"error": "No editor viewport"}
	var img = vp.get_texture().get_image()
	if not img: return {"error": "Failed to capture"}
	var err = img.save_png(str(path))
	if err != OK: return {"error": "Failed to save: " + str(err)}
	return {"ok": true, "path": path}


# ============================================================
# Class Introspection & Documentation
# ============================================================

func _cmd_get_class_list(params: Dictionary) -> Dictionary:
	var filter = params.get("filter", "").to_lower()
	var classes: Array = []
	for cls in ClassDB.get_class_list():
		if not filter or filter in cls.to_lower():
			var is_parent = ClassDB.is_parent_class(cls, params.get("extends", "")) if params.get("extends", "") else true
			if is_parent: classes.append(cls)
	classes.sort()
	return {"classes": classes.slice(0, 200), "count": classes.size()}

func _cmd_get_method_list(params: Dictionary) -> Dictionary:
	var cls = params.get("class", ""); if not cls: return {"error": "Missing class name"}
	if not ClassDB.class_exists(cls): return {"error": "Class not found: " + cls}
	var methods: Array = []
	for m in ClassDB.class_get_method_list(cls, true):
		var name = m["name"]; var returns = m.get("return", {"type": TYPE_NIL})
		var args: Array = []; var defaults: Array = m.get("default_args", [])
		for a in m.get("args", []): args.append({"name": a["name"], "type": a.get("type", TYPE_NIL)})
		methods.append({"name": name, "returns": returns.get("type", TYPE_NIL), "args": args, "default_count": defaults.size(), "flags": m.get("flags", 0)})
	return {"class": cls, "methods": methods, "count": methods.size()}

func _cmd_get_property_list(params: Dictionary) -> Dictionary:
	var cls = params.get("class", ""); if not cls: return {"error": "Missing class name"}
	if not ClassDB.class_exists(cls): return {"error": "Class not found: " + cls}
	var props: Array = []
	for p in ClassDB.class_get_property_list(cls, true):
		var name = p["name"]; var usage = p.get("usage", 0)
		if not (usage & PROPERTY_USAGE_EDITOR): continue
		props.append({"name": name, "type": p.get("type", TYPE_NIL), "hint": p.get("hint", 0), "usage": usage})
	return {"class": cls, "properties": props, "count": props.size()}

func _cmd_get_signal_list(params: Dictionary) -> Dictionary:
	var cls = params.get("class", ""); if not cls: return {"error": "Missing class name"}
	if not ClassDB.class_exists(cls): return {"error": "Class not found: " + cls}
	var signals: Array = []
	for s in ClassDB.class_get_signal_list(cls, true):
		var args: Array = []; for a in s.get("args", []): args.append(a["name"])
		signals.append({"name": s["name"], "args": args})
	return {"class": cls, "signals": signals, "count": signals.size()}

func _cmd_get_class_doc(params: Dictionary) -> Dictionary:
	var cls = params.get("class", ""); if not cls: return {"error": "Missing class name"}
	# Open the help for this class in the editor
	OS.shell_open("https://docs.godotengine.org/en/stable/classes/class_" + cls.to_lower().replace("_", "-") + ".html")
	return {"ok": true, "class": cls, "url": "https://docs.godotengine.org/en/stable/classes/class_" + cls.to_lower() + ".html"}

func _cmd_search_help(params: Dictionary) -> Dictionary:
	var query = params.get("query", ""); if not query: return {"error": "Missing query"}
	OS.shell_open("https://docs.godotengine.org/en/stable/search.html?q=" + query.uri_encode())
	return {"ok": true, "query": query}


# ============================================================
# Filesystem CRUD (via Editor)
# ============================================================

func _cmd_create_folder(params: Dictionary) -> Dictionary:
	var path = params.get("path", ""); if not path: return {"error": "Missing path"}
	var err = DirAccess.make_dir_recursive_absolute(str(path))
	if err != OK: return {"error": "Failed to create: " + str(err)}
	EditorInterface.get_file_system_dock().navigate_to_path(str(path))
	return {"ok": true, "path": path}

func _cmd_delete_asset(params: Dictionary) -> Dictionary:
	var path = params.get("path", ""); if not path: return {"error": "Missing path"}
	var dir = DirAccess.open(str(path).get_base_dir())
	if not dir: return {"error": "Cannot access parent directory"}
	var err = dir.remove(str(path))
	if err != OK: return {"error": "Failed to delete: " + str(err)}
	EditorInterface.get_file_system_dock().call_deferred("update_file_list")
	return {"ok": true, "deleted": path}

func _cmd_rename_asset(params: Dictionary) -> Dictionary:
	var from = params.get("from", ""); var to = params.get("to", "")
	if not from or not to: return {"error": "Missing from/to"}
	var dir = DirAccess.open(str(from).get_base_dir())
	if not dir: return {"error": "Cannot access directory"}
	var err = dir.rename(str(from), str(to))
	if err != OK: return {"error": "Failed to rename: " + str(err)}
	EditorInterface.get_file_system_dock().navigate_to_path(str(to))
	return {"ok": true, "from": from, "to": to}

func _cmd_move_asset(params: Dictionary) -> Dictionary:
	var from = params.get("from", ""); var to = params.get("to", "")
	if not from or not to: return {"error": "Missing from/to"}
	var err = DirAccess.copy_absolute(str(from), str(to))
	if err == OK: DirAccess.remove_absolute(str(from))
	else: return {"error": "Failed to move: " + str(err)}
	EditorInterface.get_file_system_dock().navigate_to_path(str(to))
	return {"ok": true, "from": from, "to": to}

func _cmd_duplicate_asset(params: Dictionary) -> Dictionary:
	var from = params.get("from", ""); var to = params.get("to", "")
	if not from or not to: return {"error": "Missing from/to"}
	var err = DirAccess.copy_absolute(str(from), str(to))
	if err != OK: return {"error": "Failed to duplicate: " + str(err)}
	EditorInterface.get_file_system_dock().navigate_to_path(str(to))
	return {"ok": true, "from": from, "to": to}


# ============================================================
# Editor Viewport Control
# ============================================================

func _cmd_get_editor_camera() -> Dictionary:
	var vp = EditorInterface.get_editor_main_screen().get_viewport()
	if not vp: return {"error": "No viewport"}
	# Find the editor's Camera3D (usually Camera3D "EditorCamera")
	var cam: Camera3D = null
	for c in vp.get_children():
		if c is Camera3D: cam = c; break
	if cam:
		return {"position": str(cam.position), "rotation": str(cam.rotation), "fov": cam.fov}
	# Fallback: check spatial editor
	var spatial_editor = EditorInterface.get_editor_main_screen()
	return {"position": "Vector3(0,0,0)", "note": "Camera data may not be directly accessible"}

func _cmd_set_editor_camera(params: Dictionary) -> Dictionary:
	var pos_str = params.get("position", "")
	if not pos_str: return {"error": "Missing position"}
	var p = pos_str.replace("Vector3(", "").replace(")", "").split(",")
	if p.size() < 3: return {"error": "Invalid position format. Use Vector3(x,y,z) string"}
	var vp = EditorInterface.get_editor_main_screen().get_viewport()
	if not vp: return {"error": "No viewport"}
	for c in vp.get_children():
		if c is Camera3D:
			c.position = Vector3(float(p[0]), float(p[1]), float(p[2]))
			return {"ok": true, "position": str(c.position)}
	return {"error": "Camera3D not found in viewport"}

func _cmd_toggle_grid() -> Dictionary:
	# Toggle the 3D editor grid visibility
	EditorInterface.get_editor_settings().set_setting("editors/3d/grid_enabled",
		not EditorInterface.get_editor_settings().get_setting("editors/3d/grid_enabled"))
	return {"ok": true}

func _cmd_toggle_snap() -> Dictionary:
	var s = EditorInterface.get_editor_settings()
	s.set_setting("editors/3d/use_snap", not s.get_setting("editors/3d/use_snap"))
	return {"ok": true}


# ============================================================
# Autoload via Editor
# ============================================================

func _cmd_get_autoload_list() -> Dictionary:
	var autoloads: Array = []
	# Read from project.godot [autoload] section
	var cfg = ConfigFile.new()
	var err = cfg.load("res://project.godot")
	if err == OK:
		for key in cfg.get_section_keys("autoload"):
			var path = cfg.get_value("autoload", key)
			if path is String and path.ends_with(".gd"):
				autoloads.append({"name": key, "path": path})
	return {"autoloads": autoloads, "count": autoloads.size()}

func _cmd_add_autoload(params: Dictionary) -> Dictionary:
	var name = params.get("name", ""); var path = params.get("path", "")
	if not name or not path: return {"error": "Missing name or path"}
	var cfg = ConfigFile.new(); cfg.load("res://project.godot")
	cfg.set_value("autoload", name, str(path))
	cfg.save("res://project.godot")
	# 修改 autoload 需要重启编辑器才会生效；没有公开的即时刷新 API
	return {"ok": true, "name": name, "path": path, "note": "Restart the editor for autoload changes to take effect"}

func _cmd_remove_autoload(params: Dictionary) -> Dictionary:
	var name = params.get("name", "")
	if not name: return {"error": "Missing name"}
	var cfg = ConfigFile.new(); cfg.load("res://project.godot")
	if cfg.has_section_key("autoload", name):
		cfg.erase_section_key("autoload", name); cfg.save("res://project.godot")
		return {"ok": true, "removed": name}
	return {"error": "Autoload not found: " + name}


# ============================================================
# Input Map via Editor
# ============================================================

func _cmd_get_input_map() -> Dictionary:
	var actions: Array = []
	for action in InputMap.get_actions():
		var events: Array = []
		for ev in InputMap.action_get_events(action):
			events.append(str(ev))
		actions.append({"name": action, "events": events, "deadzone": InputMap.action_get_deadzone(action)})
	return {"actions": actions, "count": actions.size()}

func _cmd_add_input_action(params: Dictionary) -> Dictionary:
	var name = params.get("name", ""); var deadzone = params.get("deadzone", 0.5)
	if not name: return {"error": "Missing action name"}
	if InputMap.has_action(name): return {"error": "Action already exists: " + name}
	InputMap.add_action(name, float(deadzone))
	return {"ok": true, "name": name, "deadzone": deadzone}

func _cmd_remove_input_action(params: Dictionary) -> Dictionary:
	var name = params.get("name", "")
	if not name: return {"error": "Missing action name"}
	if not InputMap.has_action(name): return {"error": "Action not found: " + name}
	InputMap.erase_action(name)
	return {"ok": true, "removed": name}


# ============================================================
# Errors / Diagnostics
# ============================================================

func _cmd_get_error_list() -> Dictionary:
	return {"output": Array(_output_buffer), "count": _output_buffer.size()}

func _cmd_clear_errors() -> Dictionary:
	_output_buffer.clear()
	return {"ok": true, "cleared": true}


# ============================================================
# Build / Bake
# ============================================================

func _cmd_reimport_asset(params: Dictionary) -> Dictionary:
	var path = params.get("path", "")
	if not path: return {"error": "Missing path"}
	# EditorFileSystem reimport
	var fs = EditorInterface.get_resource_filesystem()
	if fs: fs.reimport_files(PackedStringArray([str(path)]))
	else: return {"error": "Resource filesystem not available"}
	return {"ok": true, "reimported": path}

func _cmd_bake_lightmaps() -> Dictionary:
	# Lightmap baking in Godot 4.x requires manual steps in the editor.
	# The `bake` button is in the 3D editor toolbar (Bake Lightmaps).
	# From GDScript, we can try to trigger it if a LightmapGI node exists.
	var root = EditorInterface.get_edited_scene_root()
	if not root: return {"error": "No scene open"}
	
	var lightmap_nodes = _find_all_nodes(root, "LightmapGI")
	if lightmap_nodes.size() > 0:
		# Try to bake via LightmapGI node
		lightmap_nodes[0].bake()
		return {"ok": true, "baked": true, "message": "Lightmap baking triggered"}
	
	return {"message": "No LightmapGI node found in scene. Add a LightmapGI node and use the Bake Lightmaps button in the 3D editor toolbar.", "ok": true}

func _cmd_bake_navigation() -> Dictionary:
	var root = EditorInterface.get_edited_scene_root()
	if not root: return {"error": "No scene open"}
	# Navigate to navigation regions and trigger bake
	for node in _find_all_nodes(root, "NavigationRegion3D"):
		if node.has_method("bake_navigation_mesh"): node.bake_navigation_mesh(true)
	for node in _find_all_nodes(root, "NavigationRegion2D"):
		if node.has_method("bake_navigation_mesh"): node.bake_navigation_mesh(true)
	return {"ok": true, "baked": true}

func _find_all_nodes(root: Node, type_name: String) -> Array:
	var result: Array = []
	_find_recursive(root, type_name, result)
	return result

func _find_recursive(node: Node, type_name: String, out: Array) -> void:
	for c in node.get_children():
		if c.get_class() == type_name: out.append(c)
		_find_recursive(c, type_name, out)


# ============================================================
# Runtime Inspection
# ============================================================

func _cmd_get_running_scene_tree() -> Dictionary:
	if not EditorInterface.is_playing_scene(): return {"error": "Project not running"}
	# 运行中的游戏是独立进程（或调试子进程），编辑器插件无法直接访问其 SceneTree。
	# 需要 Godot 的远程调试器协议才能读取；当前实现只能给出编辑器自身树，容易误导，
	# 因此明确返回错误并提示可用能力。
	return {"error": "Running game scene tree is not accessible from the editor plugin (requires remote debugger protocol). Use get_current_scene_tree to inspect the editor scene."}

func _cmd_get_performance_monitors() -> Dictionary:
	# Godot 4.x Performance monitors — use enum values directly
	var monitors: Dictionary = {}
	
	# Map readable names to Performance.Monitor enum values
	var monitor_map = {
		"time/process": Performance.TIME_PROCESS,
		"time/physics_process": Performance.TIME_PHYSICS_PROCESS,
		"objects/node_count": Performance.OBJECT_NODE_COUNT,
		"objects/orphan_node_count": Performance.OBJECT_ORPHAN_NODE_COUNT,
		"render/objects/visible": Performance.RENDER_TOTAL_OBJECTS_IN_FRAME,
		"render/draw_calls": Performance.RENDER_TOTAL_DRAW_CALLS_IN_FRAME,
		"memory/static": Performance.MEMORY_STATIC,
		"memory/static_max": Performance.MEMORY_STATIC_MAX,
		"video_mem/used": Performance.RENDER_VIDEO_MEM_USED,
		"physics/objects": Performance.PHYSICS_3D_ACTIVE_OBJECTS,
	}
	
	for key in monitor_map:
		var val = Performance.get_monitor(monitor_map[key])
		monitors[key] = str(val) if typeof(val) == TYPE_FLOAT else val
	
	monitors["fps"] = Engine.get_frames_per_second() if EditorInterface.is_playing_scene() else "not running"
	return {"monitors": monitors}

func _cmd_get_dependency_list(params: Dictionary) -> Dictionary:
	var path = params.get("path", "")
	if not path: return {"error": "Missing resource path"}
	var res = load(str(path))
	if not res: return {"error": "Resource not found: " + path}
	var deps: Array = []
	if ResourceLoader.has_method("get_dependencies"):
		deps = ResourceLoader.get_dependencies(str(path))
	return {"path": path, "dependencies": deps, "count": deps.size()}

func _get_node_path(node: Node) -> String:
	var parts: Array[String] = []
	var current: Node = node
	var scene_root = EditorInterface.get_edited_scene_root()
	while current and current != scene_root:
		parts.push_front(current.name)
		current = current.get_parent()
	return "./" + "/".join(parts)


func _generate_node_name(type_name: String, parent: Node) -> String:
	# Generate unique name: TYPE, TYPE2, TYPE3...
	var base = type_name.trim_prefix("_")
	var idx = 1
	var name = base
	while parent.has_node(name):
		idx += 1
		name = base + str(idx)
	return name


func _serialize_node_properties(node: Node) -> Dictionary:
	# Serialize editor-visible properties for clipboard persistence.
	# This ensures cut/copy/paste preserves property values.
	var props: Dictionary = {}
	for prop in node.get_property_list():
		var pname = prop["name"]
		if pname.begins_with("_"): continue
		var usage = prop.get("usage", 0)
		if not (usage & PROPERTY_USAGE_EDITOR): continue
		var val = node.get(pname)
		props[pname] = _value_to_jsonable(val)
	return props


func _send_response(id, result: Dictionary) -> void:
	if _stdio_mode:
		_send_stdout({"jsonrpc": "2.0", "id": id, "result": result})
	else:
		_send_tcp({"jsonrpc": "2.0", "id": id, "result": result})


func _send_error(message: String, id = 0) -> void:
	if _stdio_mode:
		_send_stdout({"jsonrpc": "2.0", "id": id, "error": {"message": message}})
	else:
		_send_tcp({"jsonrpc": "2.0", "id": id, "error": {"message": message}})


func _send_tcp(data: Dictionary) -> void:
	if not _peer:
		return
	var json_str = JSON.stringify(data, "", false)
	_peer.put_data((json_str + "\n").to_utf8_buffer())
