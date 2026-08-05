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
		_respond({"error": "invalid json: " + json.get_error_message()})
		return
	var msg: Dictionary = json.get_data()
	if typeof(msg) != TYPE_DICTIONARY:
		_respond({"error": "expected json object"})
		return
	var method: String = msg.get("method", msg.get("command", ""))
	var params: Dictionary = msg.get("params", {})
	if typeof(params) != TYPE_DICTIONARY:
		params = {}
	var id = msg.get("id", 0)
	var result: Dictionary = _dispatch(method, params)
	_respond({"jsonrpc": "2.0", "id": id, "result": result})

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
	if args.is_empty():
		node.emit_signal(sig)
	elif args.size() == 1:
		node.emit_signal(sig, args[0])
	else:
		node.emit_signal(sig, args)
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
