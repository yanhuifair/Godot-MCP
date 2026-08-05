extends SceneTree

# Headless end-to-end gate: every .tscn/.tres in the test project must load in a
# real Godot build, every scene must instantiate, and every external reference
# must actually resolve.
#
# Unit tests only prove our parser round-trips its own output; they cannot catch
# files that are syntactically plausible but that the engine rejects (dangling
# SubResource ids, quote accumulation, orphan nodes with no `parent`, node ids
# the engine reserves, ...). Those bugs shipped before precisely because nothing
# ever asked Godot itself.
#
# `ResourceLoader.load() != null` is NOT sufficient on its own: Godot happily
# returns a PackedScene whose [ext_resource] targets are missing, printing an
# error but still handing back an object. A scene silently stripped of its
# material/texture would pass a null-check. So the references are verified
# explicitly below.
#
# Run:  npm run check:godot
# Exit: 0 when everything is clean, 1 otherwise.

# Godot encodes UIDs in base 34: 'a'..'y' = 0..24, '0'..'9' = 25..33.
# Anything else (notably '_' and 'z') makes ResourceUID.text_to_id() return
# INVALID_ID, so the file effectively has no UID at all.
const UID_ALPHABET := "abcdefghijklmnopqrstuvwxy0123456789"

func _scan(dir_path: String, out: Array) -> void:
	var d = DirAccess.open(dir_path)
	if d == null: return
	d.list_dir_begin()
	var f = d.get_next()
	while f != "":
		if f.begins_with("."):
			f = d.get_next(); continue
		var full = dir_path.path_join(f) if dir_path != "res://" else "res://" + f
		if d.current_is_dir():
			# addons/ is vendored plugin code, not fixture data under test.
			if f != "addons": _scan(full, out)
		else:
			if f.get_extension() in ["tscn", "tres"]:
				out.append(full)
		f = d.get_next()
	d.list_dir_end()

func _is_valid_uid(uid_text: String) -> bool:
	if not uid_text.begins_with("uid://"): return false
	var body := uid_text.substr(6)
	if body.is_empty(): return false
	for c in body:
		if not UID_ALPHABET.contains(c): return false
	return true

# Mirrors Godot's own resolution: a path without res:// is relative to the
# referring file's directory, which is almost never what the caller meant.
func _check_refs(path: String, bad: Array) -> void:
	var text := FileAccess.get_file_as_string(path)
	if text.is_empty(): return
	var base_dir := path.get_base_dir()

	var re := RegEx.create_from_string('\\[ext_resource[^\\]]*?path="([^"]+)"')
	for m in re.search_all(text):
		var ref: String = m.get_string(1)
		if not ref.begins_with("res://") and not ref.begins_with("uid://"):
			bad.append("%s -> ext_resource path is not absolute: \"%s\"" % [path, ref])
			continue
		var resolved := ref if ref.begins_with("res://") else ref
		if ref.begins_with("res://") and not ResourceLoader.exists(resolved):
			bad.append("%s -> ext_resource target missing: \"%s\"" % [path, ref])

	var uid_re := RegEx.create_from_string('^\\[gd_(?:scene|resource)[^\\]]*?uid="([^"]*)"')
	var head := text.split("\n")[0]
	var um := uid_re.search(head)
	if um and not _is_valid_uid(um.get_string(1)):
		bad.append("%s -> invalid uid \"%s\" (base-34 a-y/0-9 only)" % [path, um.get_string(1)])

	# Every SubResource("id") must have a matching [sub_resource ... id="id"].
	var declared := {}
	var decl_re := RegEx.create_from_string('\\[sub_resource[^\\]]*?id="([^"]+)"')
	for m in decl_re.search_all(text):
		declared[m.get_string(1)] = true
	var use_re := RegEx.create_from_string('SubResource\\("([^"]+)"\\)')
	for m in use_re.search_all(text):
		if not declared.has(m.get_string(1)):
			bad.append("%s -> dangling SubResource(\"%s\")" % [path, m.get_string(1)])

func _init():
	var files: Array = []
	_scan("res://", files)
	files.sort()

	var ok := 0
	var bad: Array = []
	for p in files:
		var r = ResourceLoader.load(p)
		if r == null:
			bad.append(p + " (load failed)")
			continue
		ok += 1
		_check_refs(p, bad)
		if p.ends_with(".tscn") and r is PackedScene:
			var inst = r.instantiate()
			if inst == null:
				bad.append(p + " (instantiate failed)")
			else:
				print("  SCENE %-46s root=%-18s children=%d" % [p, inst.name, inst.get_child_count()])
				inst.free()

	print("TOTAL=%d OK=%d BAD=%d" % [files.size(), ok, bad.size()])
	for b in bad: print("  BAD: ", b)
	quit(0 if bad.is_empty() else 1)
