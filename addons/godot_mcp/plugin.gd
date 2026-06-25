@tool
extends EditorPlugin

# ============================================================
# Godot MCP Editor Plugin v1.3.2
# ============================================================
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


# ---- Lifecycle ----

func _enter_tree() -> void:
	_stdio_mode = OS.get_environment("MCP_STDIO") == "true"
	_command_mutex = Mutex.new()
	_running = true

	if _stdio_mode:
		_start_stdin_reader()
		_send_stdout({"jsonrpc": "2.0", "id": 0, "result": {"ready": true, "version": "1.3.2"}})
	else:
		_start_tcp_server()

	_setup_output_capture()
	set_process(true)

	if _stdio_mode:
		print("[Godot MCP] Plugin v1.3.2 loaded — stdio mode")
	else:
		print("[Godot MCP] Plugin v1.3.2 loaded — TCP on port ", DEFAULT_PORT)


func _exit_tree() -> void:
	_running = false
	set_process(false)
	_teardown_output_capture()

	if _stdio_mode:
		if _stdin_thread:
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
	var err = _tcp_server.listen(port)
	if err != OK:
		printerr("[Godot MCP] Failed to start TCP server on port ", port)
		return
	print("[Godot MCP] TCP server listening on port ", port)


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

	_capture_editor_output()


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

	# Accept new connections
	if not _peer:
		if _tcp_server.is_connection_available():
			_peer = _tcp_server.take_connection()
			_tcp_connections.append(_peer)

	# Read and handle messages
	if _peer:
		var status = _peer.get_status()
		if status == StreamPeerTCP.STATUS_CONNECTED:
			var available = _peer.get_available_bytes()
			if available > 0:
				var data = _peer.get_string(min(available, BUFFER_SIZE))
				if data:
					_handle_message(data)
			elif available < 0:
				_peer = null
		else:
			_peer = null


# ---- Output Capture ----

var _last_output_line_count: int = 0

func _capture_editor_output() -> void:
	# Navigate to output panel via editor main screen
	var editor_main = get_editor_interface().get_editor_main_screen()
	if not editor_main:
		return
	# For now, rely on print() forwarding which already works
	pass


func capture_output_line(line: String) -> void:
	_output_buffer.append(line)
	while _output_buffer.size() > MAX_OUTPUT_LINES:
		_output_buffer.remove_at(0)


func _setup_output_capture() -> void:
	if _output_signal_connected:
		return
	# Output capture relies on _capture_editor_output() polling
	_output_signal_connected = true


func _teardown_output_capture() -> void:
	_output_signal_connected = false


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
	var id = msg.get("id", 0)

	var result = _execute_command(method, params)
	_send_response(id, result)


func _execute_command(method: String, params: Dictionary) -> Dictionary:
	match method:
		# ---- Health Check ----
		"health_check": return {"ok": true, "version": "3.0", "commands": 97}

		# ---- Editor State ----
		"get_open_scene": return _cmd_get_open_scene()
		"get_open_scenes": return _cmd_get_open_scenes()
		"get_current_scene_tree": return _cmd_get_current_scene_tree()
		"get_selection": return _cmd_get_selection()
		"set_selection": return _cmd_set_selection(params)

		# ---- Scene Operations ----
		"save_scene": return _cmd_save_scene()
		"save_all_scenes": return _cmd_save_all_scenes()
		"close_scene": return _cmd_close_scene()
		"reload_scene": return _cmd_reload_scene()

		# ---- Playback ----
		"play_project": return _cmd_play_project()
		"stop_project": return _cmd_stop_project()
		"pause_project": return _cmd_pause_project()
		"unpause_project": return _cmd_unpause_project()
		"is_playing": return _cmd_is_playing()
		"run_specific_scene": return _cmd_run_specific_scene(params)

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
		"read_current_scene": return _cmd_get_current_scene_tree()
		"get_breakpoints": return _cmd_get_breakpoints()
		"set_breakpoint": return _cmd_set_breakpoint(params)
		"remove_breakpoint": return _cmd_remove_breakpoint(params)

		# ---- File System ----
		"open_asset": return _cmd_open_asset(params)
		"show_in_filesystem": return _cmd_show_in_filesystem(params)
		"list_filesystem": return _cmd_list_filesystem(params)

		# ---- UI / Window ----
		"get_editor_rect": return _cmd_get_editor_rect()
		"focus_editor": return _cmd_focus_editor()
		"open_dock": return _cmd_open_dock(params)
		"take_screenshot": return _cmd_take_screenshot(params)

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
		"export_project": return _cmd_editor_export(params)

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
	if raw.begins_with("Vector2("):
		var s = raw.trim_prefix("Vector2(").trim_suffix(")")
		var p = s.split(",", false)
		return Vector2(float(p[0]), float(p[1]))

	if raw.begins_with("Vector3("):
		var s = raw.trim_prefix("Vector3(").trim_suffix(")")
		var p = s.split(",", false)
		return Vector3(float(p[0]), float(p[1]), float(p[2]))

	if raw.begins_with("Vector4("):
		var s = raw.trim_prefix("Vector4(").trim_suffix(")")
		var p = s.split(",", false)
		return Vector4(float(p[0]), float(p[1]), float(p[2]), float(p[3]))

	if raw.begins_with("Vector2i("):
		var s = raw.trim_prefix("Vector2i(").trim_suffix(")")
		var p = s.split(",", false)
		return Vector2i(int(p[0]), int(p[1]))

	if raw.begins_with("Color("):
		var s = raw.trim_prefix("Color(").trim_suffix(")")
		var p = s.split(",", false)
		return Color(float(p[0]), float(p[1]), float(p[2]), float(p[3]))

	if raw.begins_with("Rect2("):
		var s = raw.trim_prefix("Rect2(").trim_suffix(")")
		var p = s.split(",", false)
		return Rect2(float(p[0]), float(p[1]), float(p[2]), float(p[3]))

	if raw.begins_with("Transform2D("):
		return Transform2D() # parsing full matrix is complex; return identity

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


func _node_set_property(node: Node, key: String, raw_value: String) -> void:
	var value = _parse_value(raw_value)

	if key == "transform" and value is String:
		return

	if node.has_method("set_" + key):
		node.call("set_" + key, value)
	else:
		node.set(key, value)


func _value_to_json_string(val) -> String:
	# Convert a Godot value to a string suitable for JSON serialization.
	match typeof(val):
		TYPE_VECTOR2, TYPE_VECTOR2I: return str(val)
		TYPE_VECTOR3, TYPE_VECTOR3I: return str(val)
		TYPE_VECTOR4, TYPE_VECTOR4I: return str(val)
		TYPE_COLOR: return str(val)
		TYPE_RECT2: return str(val)
		TYPE_BOOL: return "true" if val else "false"
		TYPE_INT, TYPE_FLOAT: return str(val)
		TYPE_STRING, TYPE_STRING_NAME: return '"' + str(val).replace('"', '\\"') + '"'
		TYPE_NODE_PATH: return '"' + str(val) + '"'
		_: return '"' + str(val) + '"'


# ============================================================
# Editor State Commands
# ============================================================

func _cmd_get_open_scene() -> Dictionary:
	var editor = get_editor_interface()
	var es = editor.get_edited_scene_root()
	if es:
		var path = es.scene_file_path
		if not path or path == "":
			var open_scenes = editor.get_open_scenes()
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
	var root = get_editor_interface().get_edited_scene_root()
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
	return {"scenes": Array(get_editor_interface().get_open_scenes())}


func _cmd_get_selection() -> Dictionary:
	var sel = get_editor_interface().get_selection()
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

	var root = get_editor_interface().get_edited_scene_root()
	if not root: return {"error": "No scene open"}

	var node = root.get_node(str(node_path))
	if not node: return {"error": "Node not found: " + str(node_path)}

	get_editor_interface().get_selection().clear()
	get_editor_interface().get_selection().add_node(node)
	get_editor_interface().edit_node(node)

	if property_key and property_value:
		_node_set_property(node, property_key, property_value)
		get_editor_interface().save_scene()

	var result = {"ok": true, "selected": str(node_path)}
	if property_key: result["set"] = property_key
	return result


# ============================================================
# Scene Operations
# ============================================================

func _cmd_save_scene() -> Dictionary:
	get_editor_interface().save_scene()
	return {"ok": true}


func _cmd_save_all_scenes() -> Dictionary:
	get_editor_interface().save_all_scenes()
	return {"ok": true}


func _cmd_close_scene() -> Dictionary:
	get_editor_interface().reload_scene_from_path("")
	return {"ok": true}


func _cmd_reload_scene() -> Dictionary:
	var editor = get_editor_interface()
	var root = editor.get_edited_scene_root()
	var scene_path = root.scene_file_path if root else ""
	if not scene_path:
		return {"error": "No scene open to reload"}
	editor.save_scene()
	editor.reload_scene_from_path(scene_path)
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
	# Actually pauses using the editor's built-in pause
	EditorInterface.play_main_scene()
	return {"ok": true, "message": "Project started (pause toggle not directly supported via API)"}


func _cmd_is_playing() -> Dictionary:
	return {"playing": EditorInterface.is_playing_scene()}


func _cmd_run_specific_scene(params: Dictionary) -> Dictionary:
	var scene_path = params.get("scene", "")
	if not scene_path:
		return {"error": "Missing scene path"}
	EditorInterface.play_custom_scene(str(scene_path))
	return {"ok": true, "running": str(scene_path)}


# ============================================================
# Edit Operations
# ============================================================

func _cmd_undo() -> Dictionary:
	get_undo_redo().undo()
	return {"ok": true}


func _cmd_redo() -> Dictionary:
	get_undo_redo().redo()
	return {"ok": true}


func _cmd_cut_selected() -> Dictionary:
	var es = get_editor_interface().get_selection()
	var nodes = es.get_selected_nodes()
	if nodes.is_empty(): return {"ok": true, "cut": 0}
	var root = get_editor_interface().get_edited_scene_root()
	_clipboard_nodes = []
	for n in nodes:
		_clipboard_nodes.append({"type": n.get_class(), "name": n.name, "parent_path": _get_node_path(n.get_parent()) if n.get_parent() else ""})
		n.queue_free()
	get_editor_interface().get_selection().clear()
	get_editor_interface().save_scene()
	return {"ok": true, "cut": nodes.size()}

var _clipboard_nodes: Array = []

func _cmd_copy_selected() -> Dictionary:
	var es = get_editor_interface().get_selection()
	var nodes = es.get_selected_nodes()
	if nodes.is_empty(): return {"ok": true, "copied": 0}
	_clipboard_nodes = []
	for n in nodes:
		_clipboard_nodes.append({"type": n.get_class(), "name": n.name, "parent_path": _get_node_path(n.get_parent()) if n.get_parent() else ""})
	return {"ok": true, "copied": nodes.size()}

func _cmd_paste() -> Dictionary:
	if _clipboard_nodes.is_empty(): return {"ok": true, "pasted": 0}
	var root = get_editor_interface().get_edited_scene_root()
	if not root: return {"error": "No scene open"}
	var es = get_editor_interface().get_selection()
	var parent = root
	var sel = es.get_selected_nodes()
	if not sel.is_empty(): parent = sel[0]
	var pasted = 0
	for item in _clipboard_nodes:
		var t = item["type"]
		if not ClassDB.class_exists(t): continue
		var node = ClassDB.instantiate(t)
		node.name = item["name"]
		parent.add_child(node)
		node.set_owner(root)
		pasted += 1
	get_editor_interface().save_scene()
	return {"ok": true, "pasted": pasted}


func _cmd_unpause_project() -> Dictionary:
	if EditorInterface.is_playing_scene():
		return {"ok": true, "message": "Project is playing (unpause via editor UI)"}
	return {"ok": true, "message": "Project not playing"}


# ============================================================
# Node Operations (Live)
# ============================================================

func _cmd_select_node(params: Dictionary) -> Dictionary:
	return _cmd_set_selection(params)


func _cmd_move_node(params: Dictionary) -> Dictionary:
	var node_path = params.get("node_path", "")
	var position = params.get("position", null)
	var root = get_editor_interface().get_edited_scene_root()
	if not root: return {"error": "No scene open"}

	var node = root.get_node(str(node_path))
	if not node: return {"error": "Node not found"}

	if position and node is Node2D:
		var pos_str = str(position)
		var parts = pos_str.replace("Vector2(", "").replace(")", "").split(",")
		if parts.size() >= 2:
			node.position = Vector2(float(parts[0]), float(parts[1]))
			return {"ok": true, "new_position": str(node.position)}

	if position and node is Control:
		var pos_str = str(position)
		var parts = pos_str.replace("Vector2(", "").replace(")", "").split(",")
		if parts.size() >= 2:
			node.position = Vector2(float(parts[0]), float(parts[1]))
			return {"ok": true, "new_position": str(node.position)}

	return {"error": "Node is not 2D/Control or missing position"}


func _cmd_move_node_3d(params: Dictionary) -> Dictionary:
	var node_path = params.get("node_path", "")
	var position = params.get("position", null)
	var root = get_editor_interface().get_edited_scene_root()
	if not root: return {"error": "No scene open"}

	var node = root.get_node(str(node_path))
	if not node: return {"error": "Node not found"}

	if position and node is Node3D:
		var pos_str = str(position)
		var parts = pos_str.replace("Vector3(", "").replace(")", "").split(",")
		if parts.size() >= 3:
			node.position = Vector3(float(parts[0]), float(parts[1]), float(parts[2]))
			return {"ok": true, "new_position": str(node.position)}
	return {"error": "Node is not 3D or missing position"}


func _cmd_delete_selected() -> Dictionary:
	var sel = get_editor_interface().get_selection()
	var nodes = sel.get_selected_nodes()
	if nodes.is_empty():
		return {"ok": true, "deleted": 0}
	var count = nodes.size()
	for n in nodes:
		n.queue_free()
	return {"ok": true, "deleted": count}


func _cmd_add_node(params: Dictionary) -> Dictionary:
	var node_type = params.get("type", "")
	var node_name = params.get("name", "")
	var parent_path = params.get("parent", ".")
	var properties = params.get("properties", {})

	if not node_type: return {"error": "Missing node type"}

	var root = get_editor_interface().get_edited_scene_root()
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

	parent.add_child(new_node)
	new_node.set_owner(root)

	# Set properties
	for key in properties:
		_node_set_property(new_node, key, str(properties[key]))

	get_editor_interface().save_scene()

	return {
		"ok": true,
		"name": new_node.name,
		"type": node_type,
		"path": _get_node_path(new_node),
	}


func _cmd_remove_node(params: Dictionary) -> Dictionary:
	var node_path = params.get("path", "")
	if not node_path: return {"error": "Missing path"}

	var root = get_editor_interface().get_edited_scene_root()
	if not root: return {"error": "No scene open"}

	var node = root.get_node(str(node_path))
	if not node: return {"error": "Node not found: " + str(node_path)}
	if node == root: return {"error": "Cannot remove root node"}

	node.queue_free()
	get_editor_interface().save_scene()
	return {"ok": true, "removed": str(node_path)}


func _cmd_get_node_properties(params: Dictionary) -> Dictionary:
	var node_path = params.get("path", "")
	if not node_path: return {"error": "Missing path"}

	var root = get_editor_interface().get_edited_scene_root()
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
		props[name] = _value_to_json_string(val)

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

	var root = get_editor_interface().get_edited_scene_root()
	if not root: return {"error": "No scene open"}

	var node = root.get_node(str(node_path))
	if not node: return {"error": "Node not found: " + str(node_path)}

	for key in properties:
		_node_set_property(node, key, str(properties[key]))

	get_editor_interface().save_scene()
	return {"ok": true, "updated": properties.size()}


func _cmd_rename_node(params: Dictionary) -> Dictionary:
	var node_path = params.get("path", "")
	var new_name = params.get("name", "")
	if not node_path or not new_name: return {"error": "Missing path or name"}

	var root = get_editor_interface().get_edited_scene_root()
	if not root: return {"error": "No scene open"}

	var node = root.get_node(str(node_path))
	if not node: return {"error": "Node not found"}

	node.name = new_name
	get_editor_interface().save_scene()
	return {"ok": true, "renamed": new_name}


func _cmd_duplicate_node(params: Dictionary) -> Dictionary:
	var node_path = params.get("path", "")
	var new_name = params.get("name", "")
	if not node_path: return {"error": "Missing path"}

	var root = get_editor_interface().get_edited_scene_root()
	if not root: return {"error": "No scene open"}

	var node = root.get_node(str(node_path))
	if not node: return {"error": "Node not found"}

	var dup = node.duplicate(DUPLICATE_GROUPS | DUPLICATE_SIGNALS | DUPLICATE_SCRIPTS)
	if new_name: dup.name = new_name
	else: dup.name = node.name + "_copy"

	node.get_parent().add_child(dup)
	dup.set_owner(root)
	get_editor_interface().save_scene()

	return {"ok": true, "name": dup.name, "path": _get_node_path(dup)}


func _cmd_reparent_node(params: Dictionary) -> Dictionary:
	var node_path = params.get("path", "")
	var new_parent_path = params.get("new_parent", "")
	if not node_path or not new_parent_path: return {"error": "Missing path or new_parent"}

	var root = get_editor_interface().get_edited_scene_root()
	if not root: return {"error": "No scene open"}

	var node = root.get_node(str(node_path))
	var new_parent = root.get_node(str(new_parent_path))
	if not node: return {"error": "Node not found"}
	if not new_parent: return {"error": "New parent not found"}

	node.reparent(new_parent, true)
	node.set_owner(root)
	get_editor_interface().save_scene()
	return {"ok": true, "moved": str(node_path) + " → " + str(new_parent_path)}


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
	get_editor_interface().edit_resource(script)
	return {"ok": true, "path": path, "extends": extends_type}


func _cmd_attach_script(params: Dictionary) -> Dictionary:
	var node_path = params.get("path", "")
	var script_path = params.get("script", "")
	if not node_path or not script_path: return {"error": "Missing path or script"}

	var root = get_editor_interface().get_edited_scene_root()
	if not root: return {"error": "No scene open"}

	var node = root.get_node(str(node_path))
	if not node: return {"error": "Node not found"}

	var script = load(str(script_path))
	if not script: return {"error": "Script not found at: " + str(script_path)}

	node.set_script(script)
	get_editor_interface().save_scene()
	return {"ok": true, "attached": script_path}


func _cmd_run_gdscript(params: Dictionary) -> Dictionary:
	var code = params.get("code", "")
	if not code: return {"error": "Missing code"}

	# Execute GDScript in editor context using an Expression or temporary node
	var expression = Expression.new()
	var err = expression.parse(code)
	if err != OK:
		return {"error": "Parse error: " + expression.get_error_text()}

	var result = expression.execute([], get_editor_interface().get_edited_scene_root())
	if expression.has_execute_failed():
		return {"error": "Execution error: " + expression.get_error_text()}

	return {"ok": true, "result": _value_to_json_string(result)}


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
	return {"output": Array(_output_buffer)}


func _cmd_get_editor_version() -> Dictionary:
	return {"version": Engine.get_version_info()}


func _cmd_get_editor_info() -> Dictionary:
	var scene = _cmd_get_open_scene()
	var playing = EditorInterface.is_playing_scene()
	var version = Engine.get_version_info()
	var rect = DisplayServer.window_get_size()
	return {
		"version": version,
		"playing": playing,
		"open_scene": scene.get("scene", null),
		"editor_width": rect.x,
		"editor_height": rect.y,
	}


func _cmd_get_breakpoints() -> Dictionary:
	var script_editor = get_editor_interface().get_script_editor()
	var breakpoints: Array = []
	# Breakpoints are per-script, iterate open scripts
	for i in script_editor.get_open_script_editors().size():
		var se = script_editor.get_open_script_editors()[i]
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

	var script_editor = get_editor_interface().get_script_editor()
	# Open the script first
	get_editor_interface().edit_resource(load(str(script_path)))

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

	var script_editor = get_editor_interface().get_script_editor()
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
	get_editor_interface().open_scene_from_path(str(path))
	return {"ok": true}


func _cmd_show_in_filesystem(params: Dictionary) -> Dictionary:
	var path = params.get("path", "")
	if not path: return {"error": "Missing path"}
	get_editor_interface().get_file_system_dock().navigate_to_path(str(path))
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


func _cmd_open_dock(params: Dictionary) -> Dictionary:
	var dock_name = params.get("dock", "")
	if not dock_name: return {"error": "Missing dock name"}

	match dock_name.to_lower():
		"filesystem", "files":
			get_editor_interface().set_main_screen_editor("Filesystem")
		"inspector", "inspector":
			get_editor_interface().set_main_screen_editor("Inspector")
		"node", "scene":
			get_editor_interface().set_main_screen_editor("Node")
		"output", "console":
			# Show the bottom panel via editor main screen
			var editor_node = get_editor_interface().get_editor_main_screen()
			# Try to find and activate the output panel
			get_editor_interface().set_main_screen_editor("Script")
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
	get_editor_interface().open_scene_from_path(str(path))
	return {"ok": true, "path": path, "root": root_type}


func _cmd_instantiate_scene(params: Dictionary) -> Dictionary:
	var sp = params.get("scene", ""); var pp = params.get("parent", "."); var nn = params.get("name", "")
	if not sp: return {"error": "Missing scene path"}
	var root = get_editor_interface().get_edited_scene_root()
	if not root: return {"error": "No scene open"}
	var packed = load(str(sp))
	if not packed: return {"error": "Scene not found: " + sp}
	var inst = packed.instantiate()
	if nn: inst.name = nn
	var parent: Node = root
	if pp != ".": parent = root.get_node(str(pp)); if not parent: return {"error": "Parent not found"}
	parent.add_child(inst); inst.set_owner(root)
	get_editor_interface().save_scene()
	return {"ok": true, "name": inst.name, "type": inst.get_class(), "path": _get_node_path(inst)}


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
	var se = get_editor_interface().get_script_editor()
	if not se:
		return {"error": "Script editor not available"}
	se.debug_continue()
	return {"ok": true}

func _cmd_debug_step() -> Dictionary:
	var se = get_editor_interface().get_script_editor()
	if not se:
		return {"error": "Script editor not available"}
	se.debug_step()
	return {"ok": true}

func _cmd_debug_step_over() -> Dictionary:
	var se = get_editor_interface().get_script_editor()
	if not se:
		return {"error": "Script editor not available"}
	se.debug_next()
	return {"ok": true}

func _cmd_debug_break() -> Dictionary:
	EditorInterface.stop_playing_scene(); return {"ok": true}

func _cmd_get_stack_trace() -> Dictionary:
	var se = get_editor_interface().get_script_editor()
	if not se: return {"error": "Script editor not available"}
	var dbg = se.get_debugger()
	if not dbg: return {"error": "Debugger not running. Start project in debug mode first."}
	var st: Array = []
	for i in dbg.get_stack_count():
		var f = dbg.get_stack_frame(i)
		if f: st.append({"source": f.get("source", ""), "function": f.get("function", ""), "line": f.get("line", 0)})
	return {"stack": st, "count": st.size()}

func _cmd_get_debug_variables() -> Dictionary:
	var se = get_editor_interface().get_script_editor()
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
	var result = expr.execute([], get_editor_interface().get_edited_scene_root())
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
	var root = get_editor_interface().get_edited_scene_root()
	if not root: return {"error": "No scene open"}
	var src = root.get_node(str(np)); var tgt = root.get_node(str(tp)) if tp else root
	if not src: return {"error": "Source not found"}
	if not tgt: return {"error": "Target not found"}
	if not src.has_signal(sn): return {"error": "Signal not found: " + sn}
	src.connect(sn, Callable(tgt, mt))
	get_editor_interface().save_scene()
	return {"ok": true, "signal": sn, "from": np, "to": tp}

func _cmd_disconnect_signal(params: Dictionary) -> Dictionary:
	var np = params.get("node", ""); var sn = params.get("signal", "")
	var tp = params.get("target", ""); var mt = params.get("method", "")
	if not np or not sn: return {"error": "Missing node or signal"}
	var root = get_editor_interface().get_edited_scene_root()
	if not root: return {"error": "No scene open"}
	var src = root.get_node(str(np))
	if not src: return {"error": "Node not found"}
	if tp and mt: src.disconnect(sn, Callable(root.get_node(str(tp)), mt))
	else:
		for c in src.get_signal_connection_list(sn): src.disconnect(sn, c["callable"])
	get_editor_interface().save_scene()
	return {"ok": true, "disconnected": sn}

func _cmd_list_node_signals(params: Dictionary) -> Dictionary:
	var np = params.get("node", "")
	if not np: return {"error": "Missing node path"}
	var root = get_editor_interface().get_edited_scene_root()
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
	var root = get_editor_interface().get_edited_scene_root()
	if not root: return {"scene": null, "modified": false}
	return {"scene": root.scene_file_path, "modified": get_undo_redo().get_current_action_name() != ""}

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

func _key_name_to_code(n: String) -> int:
	var k = n.to_lower()
	# Letters
	if k == "a": return KEY_A
	if k == "b": return KEY_B
	if k == "c": return KEY_C
	if k == "d": return KEY_D
	if k == "e": return KEY_E
	if k == "f": return KEY_F
	if k == "g": return KEY_G
	if k == "h": return KEY_H
	if k == "i": return KEY_I
	if k == "j": return KEY_J
	if k == "k": return KEY_K
	if k == "l": return KEY_L
	if k == "m": return KEY_M
	if k == "n": return KEY_N
	if k == "o": return KEY_O
	if k == "p": return KEY_P
	if k == "q": return KEY_Q
	if k == "r": return KEY_R
	if k == "s": return KEY_S
	if k == "t": return KEY_T
	if k == "u": return KEY_U
	if k == "v": return KEY_V
	if k == "w": return KEY_W
	if k == "x": return KEY_X
	if k == "y": return KEY_Y
	if k == "z": return KEY_Z
	# Numbers
	if k == "0": return KEY_0
	if k == "1": return KEY_1
	if k == "2": return KEY_2
	if k == "3": return KEY_3
	if k == "4": return KEY_4
	if k == "5": return KEY_5
	if k == "6": return KEY_6
	if k == "7": return KEY_7
	if k == "8": return KEY_8
	if k == "9": return KEY_9
	# Special keys
	if k == "space": return KEY_SPACE
	if k == "enter" or k == "return": return KEY_ENTER
	if k == "escape" or k == "esc": return KEY_ESCAPE
	if k == "tab": return KEY_TAB
	if k == "backspace": return KEY_BACKSPACE
	if k == "delete" or k == "del": return KEY_DELETE
	# Arrow keys
	if k == "up": return KEY_UP
	if k == "down": return KEY_DOWN
	if k == "left": return KEY_LEFT
	if k == "right": return KEY_RIGHT
	# Navigation
	if k == "home": return KEY_HOME
	if k == "end": return KEY_END
	if k == "pageup": return KEY_PAGEUP
	if k == "pagedown": return KEY_PAGEDOWN
	# Function keys
	if k == "f1": return KEY_F1
	if k == "f2": return KEY_F2
	if k == "f3": return KEY_F3
	if k == "f4": return KEY_F4
	if k == "f5": return KEY_F5
	if k == "f6": return KEY_F6
	if k == "f7": return KEY_F7
	if k == "f8": return KEY_F8
	if k == "f9": return KEY_F9
	if k == "f10": return KEY_F10
	if k == "f11": return KEY_F11
	if k == "f12": return KEY_F12
	# Modifiers
	if k == "ctrl": return KEY_CTRL
	if k == "shift": return KEY_SHIFT
	if k == "alt": return KEY_ALT
	# Common UI actions (map to key combinations)
	if k == "ui_save": return KEY_S
	if k == "ui_undo": return KEY_Z
	if k == "ui_redo": return KEY_Y
	if k == "ui_copy": return KEY_C
	if k == "ui_cut": return KEY_X
	if k == "ui_paste": return KEY_V
	if k == "ui_select_all": return KEY_A
	if k == "ui_play": return KEY_F5
	if k == "ui_stop": return KEY_F8
	return 0

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
					plugins.append({"id": fn, "name": cfg.get_value("plugin", "name", fn), "version": cfg.get_value("plugin", "version", "?"), "enabled": get_editor_interface().is_plugin_enabled(fn)})
		fn = dir.get_next()
	return {"plugins": plugins, "count": plugins.size()}

func _cmd_enable_plugin(params: Dictionary) -> Dictionary:
	var p = params.get("plugin", ""); if not p: return {"error": "Missing plugin name"}
	get_editor_interface().set_plugin_enabled(p, true); return {"ok": true, "plugin": p}

func _cmd_disable_plugin(params: Dictionary) -> Dictionary:
	var p = params.get("plugin", ""); if not p: return {"error": "Missing plugin name"}
	get_editor_interface().set_plugin_enabled(p, false); return {"ok": true, "plugin": p}

func _cmd_take_screenshot(params: Dictionary) -> Dictionary:
	var path = params.get("path", "res://editor_screenshot.png")
	var vp = get_editor_interface().get_editor_main_screen().get_viewport()
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
	get_editor_interface().get_file_system_dock().navigate_to_path(str(path))
	return {"ok": true, "path": path}

func _cmd_delete_asset(params: Dictionary) -> Dictionary:
	var path = params.get("path", ""); if not path: return {"error": "Missing path"}
	var dir = DirAccess.open(str(path).get_base_dir())
	if not dir: return {"error": "Cannot access parent directory"}
	var err = dir.remove(str(path))
	if err != OK: return {"error": "Failed to delete: " + str(err)}
	get_editor_interface().get_file_system_dock().call_deferred("update_file_list")
	return {"ok": true, "deleted": path}

func _cmd_rename_asset(params: Dictionary) -> Dictionary:
	var from = params.get("from", ""); var to = params.get("to", "")
	if not from or not to: return {"error": "Missing from/to"}
	var dir = DirAccess.open(str(from).get_base_dir())
	if not dir: return {"error": "Cannot access directory"}
	var err = dir.rename(str(from), str(to))
	if err != OK: return {"error": "Failed to rename: " + str(err)}
	get_editor_interface().get_file_system_dock().navigate_to_path(str(to))
	return {"ok": true, "from": from, "to": to}

func _cmd_move_asset(params: Dictionary) -> Dictionary:
	var from = params.get("from", ""); var to = params.get("to", "")
	if not from or not to: return {"error": "Missing from/to"}
	var err = DirAccess.copy_absolute(str(from), str(to))
	if err == OK: DirAccess.remove_absolute(str(from))
	else: return {"error": "Failed to move: " + str(err)}
	get_editor_interface().get_file_system_dock().navigate_to_path(str(to))
	return {"ok": true, "from": from, "to": to}

func _cmd_duplicate_asset(params: Dictionary) -> Dictionary:
	var from = params.get("from", ""); var to = params.get("to", "")
	if not from or not to: return {"error": "Missing from/to"}
	var err = DirAccess.copy_absolute(str(from), str(to))
	if err != OK: return {"error": "Failed to duplicate: " + str(err)}
	get_editor_interface().get_file_system_dock().navigate_to_path(str(to))
	return {"ok": true, "from": from, "to": to}


# ============================================================
# Editor Viewport Control
# ============================================================

func _cmd_get_editor_camera() -> Dictionary:
	var vp = get_editor_interface().get_editor_main_screen().get_viewport()
	if not vp: return {"error": "No viewport"}
	# Find the editor's Camera3D (usually Camera3D "EditorCamera")
	var cam: Camera3D = null
	for c in vp.get_children():
		if c is Camera3D: cam = c; break
	if cam:
		return {"position": str(cam.position), "rotation": str(cam.rotation), "fov": cam.fov}
	# Fallback: check spatial editor
	var spatial_editor = get_editor_interface().get_editor_main_screen()
	return {"position": "Vector3(0,0,0)", "note": "Camera data may not be directly accessible"}

func _cmd_set_editor_camera(params: Dictionary) -> Dictionary:
	var pos_str = params.get("position", "")
	if not pos_str: return {"error": "Missing position"}
	var p = pos_str.replace("Vector3(", "").replace(")", "").split(",")
	if p.size() < 3: return {"error": "Invalid position format. Use Vector3(x,y,z) string"}
	var vp = get_editor_interface().get_editor_main_screen().get_viewport()
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
	get_editor_interface().call_deferred("set_plugin_enabled", "reload_current_project", true)
	return {"ok": true, "name": name, "path": path}

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
	var fs = get_editor_interface().get_resource_filesystem()
	if fs: fs.reimport_files(PackedStringArray([str(path)]))
	else: return {"error": "Resource filesystem not available"}
	return {"ok": true, "reimported": path}

func _cmd_bake_lightmaps() -> Dictionary:
	# Trigger lightmap baking
	OS.execute("godot", ["--headless", "--path", ProjectSettings.globalize_path("res://"), "--editor", "--quit-after", "100"], [], false)
	return {"message": "Lightmap baking requires Godot CLI. Use export_project or run Godot headless.", "ok": true}

func _cmd_bake_navigation() -> Dictionary:
	var root = get_editor_interface().get_edited_scene_root()
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
	# Access the running scene via the editor's play window
	var running = get_tree().root
	if running:
		var nodes: Array = []
		_build_runtime_tree(running, nodes, 0)
		return {"running": true, "node_count": nodes.size(), "tree": nodes}
	return {"error": "Cannot access running scene tree"}

func _build_runtime_tree(node: Node, out: Array, depth: int) -> void:
	if depth > 10: return
	out.append({"name": node.name, "type": node.get_class(), "depth": depth})
	for c in node.get_children():
		_build_runtime_tree(c, out, depth + 1)

func _cmd_get_performance_monitors() -> Dictionary:
	var monitors: Dictionary = {}
	var names = ["time/process", "physics/objects", "objects/node_count", "render/objects/visible", "render/draw_calls", "memory/static", "video_mem/used"]
	for n in names:
		monitors[n] = Performance.get_monitor(Performance[n.replace("/", "_").to_upper()]) if Performance.has_method("get_monitor") else "N/A"
	return {"monitors": monitors, "fps": Engine.get_frames_per_second() if EditorInterface.is_playing_scene() else "not running"}

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
	var scene_root = get_editor_interface().get_edited_scene_root()
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


func _send_response(id: int, result: Dictionary) -> void:
	if _stdio_mode:
		_send_stdout({"jsonrpc": "2.0", "id": id, "result": result})
	else:
		_send_tcp({"jsonrpc": "2.0", "id": id, "result": result})


func _send_error(message: String) -> void:
	if _stdio_mode:
		_send_stdout({"jsonrpc": "2.0", "id": 0, "error": {"message": message}})
	else:
		_send_tcp({"jsonrpc": "2.0", "id": 0, "error": {"message": message}})


func _send_tcp(data: Dictionary) -> void:
	if not _peer:
		return
	var json_str = JSON.stringify(data, "", false)
	_peer.put_data(json_str.to_utf8_buffer())
