# Copyright (c) 2026 FairYan
# SPDX-License-Identifier: AGPL-3.0-or-later
#
# godot-mcp — Live Game Runtime Bridge (autoload)
# ============================================================
# Enable this script as an autoload (name: godot_mcp_runtime) in your project
# to let the MCP server control the RUNNING game:
#   - inspect the live scene tree and node properties
#   - set properties, call methods, emit signals
#   - inject input events
#   - pause / resume / deterministically step the game clock
#   - capture screenshots of the running game
#
# It opens a tiny JSON-RPC-over-TCP server on 127.0.0.1:9877 (loopback only).
# The MCP server (TypeScript) connects to it via tools/runtime_bridge.ts.

extends Node

const PORT := 9877

var _server: TCPServer = null
var _peer: StreamPeerTCP = null
var _buffer := ""
var _step_frames := 0  # remaining frames to run while stepping

func _ready() -> void:
	# SAFETY: never open a control port in an exported / shipped game.
	# This bridge grants full remote control of the process (call_method on any
	# node, arbitrary property writes, input injection), so it must only run in
	# editor play sessions. If a developer forgets to remove the autoload before
	# exporting, we silently stay dormant instead of shipping a backdoor.
	# Escape hatch for CI / automated playtests of an exported build:
	#   GODOT_MCP_RUNTIME=1
	if not OS.has_feature("editor") and OS.get_environment("GODOT_MCP_RUNTIME") != "1":
		set_process(false)
		return

	# Keep running even when the tree is globally paused, so frame-stepping
	# and command polling keep working while the game is "frozen".
	process_mode = Node.PROCESS_MODE_ALWAYS

	_server = TCPServer.new()
	var err := _server.listen(PORT, "127.0.0.1")
	if err != OK:
		push_error("[godot-mcp-runtime] Failed to listen on 127.0.0.1:%d (err %d)" % [PORT, err])
	else:
		print("[godot-mcp-runtime] Listening on 127.0.0.1:%d" % PORT)

func _process(_delta: float) -> void:
	# Deterministic stepping: while frozen and frames remain, count one down
	# each frame; when exhausted, re-pause the tree.
	if _step_frames > 0:
		_step_frames -= 1
		if _step_frames == 0:
			get_tree().paused = true
	_poll()

func _poll() -> void:
	if not _server:
		return
	# get_status() only refreshes on poll(); without this a departed client leaves
	# _peer permanently "CONNECTED" and the bridge never accepts anyone again.
	if _peer:
		_peer.poll()
		if _peer.get_status() != StreamPeerTCP.STATUS_CONNECTED:
			_peer.disconnect_from_host()
			_peer = null
			_buffer = ""
	if not _peer and _server.is_connection_available():
		_peer = _server.take_connection()
		_buffer = ""
		_peer.poll()
	if _peer:
		var status := _peer.get_status()
		if status == StreamPeerTCP.STATUS_CONNECTED:
			var avail := _peer.get_available_bytes()
			if avail > 0:
				_buffer += _peer.get_string(min(avail, 65536))
				# 只增不减的缓冲区 = 一条不带换行的畸形流就能把游戏内存吃干。
				# 超过 1MB 还没见到换行，判定为异常对端，直接断开重来。
				if _buffer.length() > 1048576:
					printerr("[godot-mcp-runtime] Oversized request without newline — dropping connection")
					_peer.disconnect_from_host()
					_peer = null
					_buffer = ""
					return
				while "\n" in _buffer:
					var idx := _buffer.find("\n")
					var line := _buffer.substr(0, idx).strip_edges()
					_buffer = _buffer.substr(idx + 1)
					if line != "":
						_handle(line)
		else:
			_peer.disconnect_from_host()
			_peer = null

func _handle(raw: String) -> void:
	var json := JSON.new()
	var err := json.parse(raw)
	if err != OK:
		# 解析失败也要尽力回 id：响应不带 id 就匹配不上任何 pending 请求，
		# server 侧只能干等到 15s 超时（看起来像"桥挂了"，其实是自己丢了个包）。
		var bad_id = _last_parse_id(raw)
		_respond({"jsonrpc": "2.0", "id": bad_id, "error": {"message": "invalid json: " + json.get_error_message()}})
		return
	var msg: Dictionary = json.get_data()
	if typeof(msg) != TYPE_DICTIONARY:
		_respond({"jsonrpc": "2.0", "id": 0, "error": {"message": "expected json object"}})
		return
	var method: String = msg.get("method", msg.get("command", ""))
	var params: Dictionary = msg.get("params", {})
	if typeof(params) != TYPE_DICTIONARY:
		params = {}
	var id = msg.get("id", 0)
	var result: Dictionary = _dispatch(method, params)
	_respond({"jsonrpc": "2.0", "id": id, "result": result})

# 整段 JSON 解析失败时，尽力把 "id" 抠出来（{"...","id":7,...}）。
# 拿不到就给 0 —— 至少响应带 id 字段，server 侧能立刻解 pending，而不是干等超时。
func _last_parse_id(raw: String) -> int:
	var key := raw.find("\"id\"")
	if key == -1:
		return 0
	var colon := raw.find(":", key)
	if colon == -1:
		return 0
	var rest := raw.substr(colon + 1).strip_edges()
	if rest.begins_with("\""):
		return 0 # 字符串 id 不猜，交给 server 侧超时处理
	var digits := ""
	for i in rest.length():
		var c := rest.substr(i, 1)
		if c >= "0" and c <= "9":
			digits += c
		elif digits != "" or c == "}" or c == ",":
			break
	return digits.to_int() if digits != "" else 0

func _dispatch(method: String, params: Dictionary) -> Dictionary:
	match method:
		"ping":
			return {"ok": true}
		"get_tree":
			return _tree()
		"get_node":
			return _node_info(params)
		"set_node":
			return _set_node(params)
		"call_method":
			return _call_method(params)
		"emit_signal":
			return _emit_signal(params)
		"input":
			return _cmd_input(params)
		"freeze":
			get_tree().paused = true
			return {"ok": true, "paused": true}
		"resume":
			get_tree().paused = false
			_step_frames = 0
			return {"ok": true, "paused": false}
		"step":
			var n: int = int(params.get("frames", 1))
			_step_frames = n
			get_tree().paused = false
			return {"ok": true, "stepping": n}
		"screenshot":
			return _screenshot(params)
		_:
			return {"error": "unknown method: " + method}

func _tree() -> Dictionary:
	var root := _current_scene()
	if not root:
		return {"error": "no current scene"}
	var nodes: Array = []
	_build(root, nodes, 0)
	return {"root": root.name, "node_count": nodes.size(), "tree": nodes}

func _build(node: Node, out: Array, depth: int) -> void:
	var info := {"name": node.name, "type": node.get_class(), "path": str(node.get_path()), "depth": depth}
	if node is Node2D or node is Node3D or node is Control:
		info["position"] = str(node.position)
	out.append(info)
	for c in node.get_children():
		_build(c, out, depth + 1)

func _node_info(params: Dictionary) -> Dictionary:
	var node := _resolve(params.get("path", ""))
	if not node:
		return {"error": "node not found: " + str(params.get("path", ""))}
	var props: Dictionary = {}
	for p in node.get_property_list():
		var n: String = p["name"]
		if n.begins_with("_"):
			continue
		if not (p.get("usage", 0) & PROPERTY_USAGE_EDITOR):
			continue
		props[n] = str(node.get(n))
	return {"name": node.name, "type": node.get_class(), "path": str(node.get_path()), "properties": props}

func _set_node(params: Dictionary) -> Dictionary:
	var node := _resolve(params.get("path", ""))
	if not node:
		return {"error": "node not found: " + str(params.get("path", ""))}
	var props: Dictionary = params.get("properties", {})
	var updated := 0
	for k in props:
		node.set(k, _parse_value(str(props[k])))
		updated += 1
	return {"ok": true, "updated": updated}

func _call_method(params: Dictionary) -> Dictionary:
	var node := _resolve(params.get("path", ""))
	if not node:
		return {"error": "node not found"}
	var method: String = params.get("method", "")
	if not node.has_method(method):
		return {"error": "no such method: " + method}
	var args: Array = params.get("args", [])
	var ret = node.callv(method, args)
	return {"ok": true, "result": str(ret)}

func _emit_signal(params: Dictionary) -> Dictionary:
	var node := _resolve(params.get("path", ""))
	if not node:
		return {"error": "node not found"}
	var sig: String = params.get("signal", "")
	if not node.has_signal(sig):
		return {"error": "no such signal: " + sig}
	var args: Array = params.get("args", [])
	# 逐个展开，不能图省事写 emit_signal(sig, args) —— 那样整个 Array 会被当成
	# **一个**实参传出去，槽函数收到的第一个参数是 Array，于是"发两个参数"变成
	# "发一个数组"，对端拿到的是错的类型。
	# 注意 Godot 4 已经没有 emit_signalv 了（get_method_list() 里只有 emit_signal），
	# 所以只能手写展开；超过 6 个参数如实报错，而不是悄悄发错。
	match args.size():
		0: node.emit_signal(sig)
		1: node.emit_signal(sig, args[0])
		2: node.emit_signal(sig, args[0], args[1])
		3: node.emit_signal(sig, args[0], args[1], args[2])
		4: node.emit_signal(sig, args[0], args[1], args[2], args[3])
		5: node.emit_signal(sig, args[0], args[1], args[2], args[3], args[4])
		6: node.emit_signal(sig, args[0], args[1], args[2], args[3], args[4], args[5])
		_:
			return {"error": "too many signal arguments (%d): this bridge forwards up to 6" % args.size()}
	return {"ok": true}

# NOTE: must NOT be named `_input` — that collides with the built-in virtual
# Node._input(InputEvent) -> void and makes the whole script fail to parse.
func _cmd_input(params: Dictionary) -> Dictionary:
	var keycode: int = int(params.get("keycode", 0))
	var action: String = params.get("action", "press")
	var ev := InputEventKey.new()
	ev.keycode = keycode
	ev.pressed = (action != "release")
	Input.parse_input_event(ev)
	return {"ok": true, "action": action}

func _screenshot(params: Dictionary) -> Dictionary:
	var vp := get_viewport()
	var img := vp.get_texture().get_image()
	if not img:
		return {"error": "no viewport image"}
	var path: String = params.get("path", "user://runtime_screenshot.png")
	var err := img.save_png(path)
	if err != OK:
		return {"error": "failed to save screenshot: " + str(err)}
	return {"ok": true, "path": path}

func _resolve(path: String) -> Node:
	var root := _current_scene()
	if not root:
		return null
	if path == "" or path == "." or path == "/root":
		return root
	return root.get_node_or_null(path)

func _current_scene() -> Node:
	if get_tree().current_scene:
		return get_tree().current_scene
	return get_tree().root

func _parse_value(raw: String):
	if raw.is_valid_int():
		return int(raw)
	if raw.is_valid_float():
		return float(raw)
	if raw == "true":
		return true
	if raw == "false":
		return false
	if raw.begins_with("Vector2("):
		var s := raw.trim_prefix("Vector2(").trim_suffix(")").split(",", false)
		if s.size() >= 2: return Vector2(float(s[0]), float(s[1]))
	if raw.begins_with("Vector3("):
		var s := raw.trim_prefix("Vector3(").trim_suffix(")").split(",", false)
		if s.size() >= 3: return Vector3(float(s[0]), float(s[1]), float(s[2]))
	if raw.begins_with("Color("):
		var s := raw.trim_prefix("Color(").trim_suffix(")").split(",", false)
		if s.size() >= 4: return Color(float(s[0]), float(s[1]), float(s[2]), float(s[3]))
	if raw.begins_with("NodePath("):
		return NodePath(raw.trim_prefix("NodePath(").trim_suffix(")"))
	return raw

func _respond(data: Dictionary) -> void:
	if _peer:
		_peer.put_data((JSON.stringify(data) + "\n").to_utf8_buffer())
