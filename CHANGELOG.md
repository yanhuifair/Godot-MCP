# Changelog
## v1.11.2 (2026-08-13)

### Docs & config
- README / README-zh: new AI-client configs for **Hermes**, **OpenClaw**, **Reasonix** and **WorkBuddy / CodeBuddy**; "Pick Your Client" tables and the client count (18 → 22) updated.
- `reasonix.toml`: godot-mcp plugin now uses the portable `npx -y @yanhuifair/godot-mcp -p .` form (was a machine-specific `node` path).

## v1.11.1 (2026-08-13)

### Fix — `.import` files written by `write_import_config` were rejected by Godot 4.7
`serializeImportConfig` emitted string values **unquoted** (`importer=texture`), which Godot 4.7's
ConfigFile parser rejects with `Unexpected identifier 'texture'` — so the tool corrupted every
`.import` file it touched. Values are now quoted (`importer="texture"`), numbers/booleans/arrays/dicts
stay bare, and multi-line dict values (`metadata={...}`) are preserved on round-trip. `test/test-project/icon.svg.import` was re-normalized to the Godot-native format, and `test/parsers.test.ts` gained two regression tests.

### Docs
- README / README-zh: new "Upgrading to the latest version" section (npx upgrade one-liner, plugin-refresh steps, v1.9.0 `runtime_bridge.gd` note) plus an explicit "installs latest by default" note in Quick Start.
- Fixed stale write-tool counts (164 → 218) in `src/index.ts` `--help` and `README-zh.md`.

## v1.11.0 (2026-08-13)

### New tools — expanded EditorInterface coverage (17 tools)
The editor tier now reaches deeper into `EditorInterface` (Godot 4.6+). All are live-editor bridge tools.

- `editor_save_scene_as` — save the current scene under a new `res://` path (with optional preview).
- `editor_close_scene` — close the currently open scene (uses the real `EditorInterface.close_scene()` added in Godot 4.6; falls back gracefully on older builds).
- `editor_get_open_scenes` / `editor_get_unsaved_scenes` — list open / dirty scenes.
- `editor_mark_scene_unsaved` — flag the current scene as dirty.
- `editor_play_current_scene` / `editor_get_playing_scene` — play the edited scene and report which scene is running.
- `editor_get_filesystem_selection` — return the filesystem dock selection (directory, current path, selected paths).
- `editor_open_script_at_line` — open a script and jump to a line/column.
- `editor_show_toast` — push an info/warning/error toast to the editor toaster.
- `editor_set_distraction_free` / `editor_set_movie_maker` — toggle distraction-free and movie-maker modes.
- `editor_get_3d_snap` — report 3D editor snap settings.
- `editor_get_paths` — report editor data/config/cache/project-settings directory paths.
- `editor_restart` — restart the editor (requires `confirm=true`; optional save). Destructive.
- `editor_is_playing` — quick "is the editor playing?" probe.
- `editor_select_node` — select a node in the edited scene (optionally set a property on it).

### New tools — game-run log reading (Logs category, 5 tools)
Godot only writes `user://logs/godot.log` for **game runs** (the editor never logs), so these read the on-disk game log, not the editor console.

- `read_game_log` — tail the current `godot.log`, filter by level (error/warning/script/shader) or pattern, list rotated backups.
- `list_game_logs` — list the active log plus rotated `godot<timestamp>.log` files (newest first).
- `clear_game_logs` — delete rotated logs (optionally the active one too) — a write tool.
- `get_user_data_dir` — resolve the OS-specific `user://` data directory for the project.
- `configure_file_logging` — toggle file logging, set the log path, and cap rotated-file count in `project.godot` — a write tool.

### New tools — export preset writing (Project category, 3 tools)
Previously `export_presets.cfg` was read-only. These write it, matching Godot's own `editor_export.cpp` `_save()` layout so the editor re-saves with no spurious diff.

- `create_export_preset` — create a preset for Windows Desktop / Linux / macOS / Android / iOS / Web, with the mandatory `export_filter`, default `build/<name>.<ext>` path, and the runnable mapping (platform-name key is quoted, e.g. `"Windows Desktop"`, because Godot strips spaces from unquoted config keys).
- `update_export_preset` — update typed fields (`export_path`, `export_filter`, `include_filter`, `exclude_filter`, `custom_features`, `dedicated_server`, `runnable`) plus raw `fields` / `options` escape hatches; manages the one-runnable-per-platform slot.
- `remove_export_preset` — delete a preset and renumber the rest (Godot's `load_config` stops at the first missing `preset.N` index, so renumbering is required or later presets silently vanish).

### New tools — localization writing (Translation category, 3 tools)
Previously only CSV/PO *reading* and CSV *writing* existed. These close the localization authoring gap.

- `create_po_translation` — write a Gettext `.po` file (header `Language`/`Content-Type` + `msgid`/`msgstr` pairs, with proper escaping). Optionally registers it.
- `register_translation` — add a file to `internationalization/locale/translations` in `project.godot` so Godot actually loads it at runtime.
- `unregister_translation` — remove a file from that list (drops the key entirely when empty).

### Security audit fixes
A full pass over the read-only whitelist, path resolution, and process management surfaced and closed the following gaps:

- **Read-only mode bypass closed (high)** — 38 tools that mutate files or editor state were missing from the `WRITE_TOOLS` whitelist and were callable in `--read-only` mode: `fix_missing_uids` (writes `.tscn`/`.tres`/`.uid` files), 19 `editor_set_*_param` property setters, 10 `editor_create_*` scene-node creators, `editor_cut`/`editor_paste`/`editor_copy`, `editor_pause`/`editor_unpause`, `editor_toggle_grid`/`editor_toggle_snap`, `editor_clear_errors`. All are now blocked in read-only mode. `test/structural.test.ts` gained `fix_` in its write-prefix check plus the full new `editorWriteTools` list so future gaps fail CI.
- **`export_project` arbitrary-file-write closed (high)** — `output_path` was passed verbatim to Godot, which writes the build to any absolute path on disk. It is now resolved inside the project root (sandbox), as are `launch_editor`/`run_project` `project_path` overrides, so Godot can no longer be pointed at arbitrary project directories to execute scripts.
- **`monitor_output(clear=true)` no longer breaks `stop_project` (high)** — it cleared the entire spawned-process map while Godot was still running, so `stop_project`/`cleanupProcesses` lost the handles and could not kill anything. It now only clears the output buffers.
- **Export signing secrets protected (medium)** — `resolveProjectPath` now refuses `.godot/export_credentials.cfg`, which `read_script`/`write_script` (extension-agnostic) could previously read or overwrite.
- **`is_editor_running` false-positive fixed (medium)** — process detection matched any command line containing "godot" (`/godot/i`), which the server's own process always satisfies when run from a `Godot-MCP`-named path, so it always reported an editor running. It now matches on the executable name instead.
- **Spawn bookkeeping hardened (medium)** — `run_project`/`export_project` spawned processes never registered the 60-second exit cleanup timer, so the process map grew without bound; they now reuse the same `trackProcess()` path as `launch_editor`.
- Docs: `--read-only` help text and README counts updated to the current 218 write/side-effect tools.

### Cleanup
- Removed two dead `plugin.gd` dispatch keys: a duplicate `read_current_scene` (identical to `get_current_scene_tree`) and `export_project` (project export is driven from the MCP side via the Godot CLI, not the bridge).
- Extended the `WRITE_TOOLS` read-only-mode whitelist to cover every new write tool, so `--read-only` now correctly blocks `editor_save_scene_as`, `editor_close_scene`, `editor_mark_scene_unsaved`, `editor_play_current_scene`, `editor_set_distraction_free`, `editor_set_movie_maker`, `editor_restart`, `editor_select_node`, `clear_game_logs`, and `configure_file_logging`.

### Tooling
- Hardened `test/smoke_all_tools.mjs`: bridge-tool detection now uses the `editor_`/`runtime_` name prefix (robust against handler placement and runtime method selection), and the method-reconciliation parser now captures runtime ternary method names. The full 386-tool smoke now passes with 0 timeouts and 0 crashes, and flags 0 unexposed plugin commands.

## v1.10.0 (2026-08-05)

### Critical — three tools wrote `ext_resource` references that Godot cannot load
A second end-to-end audit (round-trip through the built handlers, then `load()` in a headless Godot 4.7.1) found a whole class of bugs where a tool "succeeded", the file looked plausible, and the scene was **dead on arrival**.

- **`load_sprite` produced an unparseable scene.** It built the resource id *with the quotes baked in* — `id=""1_sprite_texture""` — because the id string was assembled as `'"' + n + '_sprite_texture"'` and the serializer then wrapped it in quotes again. Godot's parser aborts on the doubled quote with `Unexpected end of file`, so **the scene could not be opened at all**. It also wrote `path="icon.svg"` verbatim. Now uses `uniqueResourceId()` (bare id, quoted once by the serializer), normalises the path through `toResPath()`, reuses an existing `[ext_resource]` for the same texture instead of appending a duplicate, and recomputes `load_steps`. Reproduced FAIL → verified PASS against the engine.
- **`set_mesh_surface_material` and `set_collision_shape` wrote non-`res://` paths.** A path without the `res://` prefix is resolved by Godot **relative to the referring file's directory**, not the project root — so `path="resources/mat.tres"` inside `scenes/main.tscn` silently pointed at `res://scenes/resources/mat.tres`. The scene still loaded; the material/shape was just **null forever**, with no error at edit time. Both now normalise through the new `toResPath()` helper. `set_mesh_surface_material` additionally stopped deriving ids from `extResources.length + 1`, which collided whenever a resource had been removed earlier; it now scans for the first free `material_<n>`.

### Critical — every file we created carried an invalid `uid=""`, and `validate_project` flagged it
`handleValidateProject` reported an empty `uid=""` as a defect, while 34 template sites in our own code emitted exactly that — so **the toolchain failed its own validator on files it had just written**. Rather than silence the check, UIDs are now real.
- New `src/utils/uid.ts` implements Godot's actual UID encoding: **base-34 over `a`–`y` (0–24) and `0`–`9` (25–33)**. Note `z` is *not* in the alphabet — a UID containing `z` or `_` is rejected by `ResourceUID.text_to_id()`. Verified bit-for-bit against Godot 4.7.1 with known vectors (`1n → uid://b`, `34n → uid://ba`, `1234567890n → uid://2f30kk`, `8070450532247928832n → uid://dm8ne2gdikjbk`).
- `stampUid()` is wired into `writeTextFile()` — the **single write path** — so any `[gd_scene]` / `[gd_resource]` header containing `uid=""` gets a freshly minted UID on first write. It is header-scoped and idempotent: an existing UID is never touched, so re-saving a file causes no churn.
- **23 committed test fixtures held UIDs that Godot rejects** (`uid://bus_layout`, `uid://player_scene`, `uid://test_3d_scene`, …) and `scenes/test_3d.tscn` referenced `resources/sample_material.tres` without `res://`. All repaired and confirmed byte-stable across repeated integration runs.

### Critical — the headless-Godot gate was reporting false passes
`test/test-project/load_check.gd` judged a file solely by `ResourceLoader.load() != null`. **Godot returns a `PackedScene` even when its `[ext_resource]` targets are missing** — it prints an error to stderr and hands back the object anyway. The gate therefore printed `BAD=0` while the engine was simultaneously logging `Parse Error` and `Failed loading resource`. It now additionally verifies that (a) every `[ext_resource] path=` is `res://` or `uid://` **and** actually exists, (b) the header `uid=` conforms to the base-34 alphabet, and (c) every `SubResource("id")` reference has a matching `[sub_resource]` block. Re-run on the unfixed tree it correctly reported `BAD=24`; after the repairs, `TOTAL=24 OK=24 BAD=0`. Confirmed to exit non-zero on a deliberately broken scene.

### Internal — one serializer instead of two
`rebuildBusLayout` in `audio.ts` had its own hand-rolled `.tres` writer, which is how it managed to drop `[ext_resource]` / `[sub_resource]` sections. `serializeResource()` now takes an optional `sortResourceKeys` hook, so the bus layout keeps its numeric ordering while going through the same serializer as everything else.

### Critical — `edit_scene` silently corrupted every scene it touched
Four independent bugs in the `.tscn` parser/serializer combined to destroy scenes. All were found by an end-to-end audit that round-tripped real Godot-authored files through the built handlers and then asked a headless Godot 4.7.1 to load the result.

- **Resource ids gained a layer of quotes on every single edit.** `[ext_resource]` / `[sub_resource]` blocks were parsed with `id: props.id` instead of `unquote(props.id)`, so `id="1"` became `id=""1""`, then `id="""1"""`, … After a handful of edits the id no longer matched the `ExtResource("1")` reference and **Godot refused to open the scene entirely** (reproduced: `RESULT: LOAD FAILED`). Fixed with a new `unquoteId()` helper applied at all four parse sites in `scene_parser.ts` / `resource_parser.ts`. It is also *self-healing*: loading an already-corrupted file strips the accumulated quotes and the next save writes a clean id.
- **The node tree was flattened into a pile of roots.** `buildNodeHierarchy()` treated `parent="."` as "this node is a root", and `serializeScene()` then dropped the `parent="."` attribute on write. So a scene with a root and three children came back as **four roots** — which Godot cannot instantiate. The correct rule (now implemented) is: the root is the node with *no* `parent` attribute at all, direct children carry `parent="."`, and deeper nodes carry a root-relative path (`Child/Grandchild`, *not* `Root/Child/Grandchild`). The parser now also accepts the root-prefixed form and normalises it, so hand-written and third-party scenes are healed rather than mangled. Round-trips are byte-for-byte idempotent against Godot's own writer.
- **`set_collision_shape` emitted an invalid reference.** It wrote `shape = SubResource("res://shapes/foo_shape.tres")` — a `SubResource` can only point at an inline `[sub_resource]` id, never at a file path, so the shape was always null at runtime. It now either registers an `[ext_resource]` and references `ExtResource("id")` (when `shape_resource_path` is given) or creates a real inline `[sub_resource]` with sensible per-type defaults and references `SubResource("id")`. `load_steps` is recomputed, ids are de-duplicated, a non-shape class is rejected with `INVALID_ARGUMENT`, and a missing target node returns `NOT_FOUND` **listing the nodes that do exist** instead of silently "succeeding".
- **Node addressing in `edit_scene` was inconsistent.** `add_node`, `modify_node`, `remove_node` and `clone_node` each resolved paths differently and could not see nodes created earlier in the same batch. All four now share `resolveNode()`, which accepts `Player/Collision`, a bare `Collision`, `.`/`""` for the root, and `/root/Player/Collision`; newly added nodes are indexed immediately so a multi-step batch works.

### Critical — audio bus edits created phantom buses
`AudioBusLayout` sizes its bus array from the *highest* `bus/<n>/` index present, so any gap makes Godot fabricate default buses.
- **`remove_audio_bus` left a hole** (removing bus 1 of 3 left `bus/0` and `bus/2`), so the layout silently regrew a nameless ghost bus at index 1. Remaining buses are now renumbered to a contiguous `0..N-1`.
- **`add_audio_bus` appended at `max+1`** instead of the first free slot, could create duplicate bus names (Godot resolves `send` by name), and wrote plain strings where Godot writes StringNames. It now rejects duplicates with `ALREADY_EXISTS`, fills contiguously, and emits `&"Name"` / `&""` notation matching Godot byte-for-byte.
- **`set_bus_volume` on a non-existent index used to conjure a half-built bus**; it now returns `NOT_FOUND`.
- Bus keys were sorted lexicographically, which put `bus/10/...` between `bus/1/...` and `bus/2/...`; sorting is now numeric by index, then by property. The `create_audio_bus_layout` template also dropped a bogus `uid=""` (Godot never writes one for this type).

### Critical — the test suite was not in the repository
`.gitignore` contained a blanket `test/` rule, so **every test file was invisible to git** — the committed tree had no runnable suite, and the two `test-project` fixtures that *had* been force-added were themselves corrupt in `HEAD` (13 accumulated layers of quotes, lost `parent="."`, an invalid `SubResource("res://…")`). Replaced with targeted ignores (`.godot/`, `*.uid`, `*.import`, synced `addons/`, scratch files) and rewrote `player.tscn` and `default_bus_layout.tres` in Godot's exact on-disk format. `npm pack --dry-run` confirms tests are still excluded from the published tarball via `.npmignore`.

### Critical — the live-game runtime tier never actually worked
- **`runtime_bridge.gd` failed to parse, so the autoload never instantiated and all 11 `runtime_*` tools were dead on arrival.** Godot reported `Failed to instantiate an autoload, script does not inherit from 'Node'`, and port 9877 was never opened. Two root causes:
  - The command handler for `runtime_input` was named **`_input`**, which collides with Godot's built-in virtual `Node._input(InputEvent) -> void`. The mismatched signature is a hard parse error. Renamed to `_cmd_input`.
  - `_resolve()` had no declared return type, so the four `var node := _resolve(...)` call sites could not infer a type — four more parse errors. `_resolve()` now declares `-> Node`.
  - Verified live: the game-side bridge now opens :9877 and answers `ping`, `get_tree`, `get_node`, `set_node`, `call_method`, `input`, `freeze`, `step` and `resume` against a running headless game (12/12 checks).

### Critical — the editor bridge accepted only one client per Godot session
- **`StreamPeerTCP.get_status()` is only refreshed by `poll()`, which neither bridge called.** After the first client disconnected, the peer was still reported as `STATUS_CONNECTED` forever, `_peer` was never cleared, and *no further client could ever connect* — the bridge stayed silently dead until Godot was restarted. In practice this meant **restarting your AI client (or the MCP server) killed the editor connection**, with the plugin still appearing enabled and the port still listening. Both `plugin.gd` and `runtime_bridge.gd` now `poll()` the peer before trusting its status and drop it as soon as it disconnects. Verified with 4 consecutive independent client sessions against one editor.

### Security — the runtime bridge no longer ships as a backdoor
- **`runtime_bridge.gd` now refuses to open its port in an exported build.** The bridge can call arbitrary methods on any node, write any property and inject input, so an autoload left in place at export time would have handed local remote-control of the released game to any process on the machine. It now listens only when `OS.has_feature("editor")` is true, with a `GODOT_MCP_RUNTIME=1` escape hatch for automated playtests of exported builds. (Previously moot only because the script never loaded at all — with the parse errors fixed, the guard became mandatory.)

### Undo/Redo — every AI scene edit is now reversible
- **All 12 scene-mutating editor commands are committed through Godot's native `EditorUndoRedoManager`**, so a single **Ctrl+Z** in the editor (or `editor_undo`) reverts what the AI just did: `add_node`, `remove_node`, `set_node_properties`, `rename_node`, `move_node`, `move_node_3d`, `reparent_node`, `duplicate_node`, `delete_selected`, `instantiate_scene`. Each action gets a readable name (`MCP: Add Sprite2D`, `MCP: Reparent Player`, …) so it is identifiable in the editor's history panel.
- `health_check` now reports `undo_support: true`.

### Fixes — latent bugs found by live end-to-end testing against Godot 4.7.1
- **`editor_undo` / `editor_redo` were silent no-ops.** They called `EditorUndoRedoManager.undo()` / `.redo()`, which **do not exist** on that class in Godot 4 — the calls failed silently and nothing was ever undone. Fixed with a new `_scene_history()` helper that resolves the manager to the real `UndoRedo` history object (`get_object_history_id(root)` → `get_history_undo_redo(hid)`). Both tools now also report *which* action was undone/redone, or "Nothing to undo/redo".
- **`editor_get_scene_changes` threw a runtime error** (`Nonexistent function 'get_current_action_name' in base 'EditorUndoRedoManager'`). Fixed via the same helper; it now returns `modified`, `last_action`, `can_undo` and `can_redo`.
- **`editor_remove_node` left the node in the saved `.tscn`.** It used `queue_free()`, which defers deletion until the end of the frame — the scene was saved *before* the node actually went away. Now removed immediately inside the undo action, with owner data recorded for restoration.
- **`editor_duplicate_node` silently dropped all children on save**, because the duplicate's descendants had no `owner` set. Fixed with a recursive owner assignment.
- **`editor_set_node_properties` reported success for properties that don't exist.** Each key is now validated against the node; the response lists `applied` and `failed_properties`, and the tool returns `isError: true` if *every* property failed.
- **`editor_reparent_node` could crash the editor** by reparenting a node into its own descendant. Now guarded, along with root-reparenting and self-reparenting; a no-op reparent is reported instead of being re-executed.
- **`editor_instantiate_scene` could crash on a non-`PackedScene` resource** or a missing path. Both are now rejected with a clear message.
- **`editor_rename_node` silently accepted invalid node names.** Names are sanitized with `validate_node_name()`, and the response reports the final name plus a note when the engine adjusted it.
- **`editor_delete_selected` double-deleted nested selections.** Ancestor-covered nodes and the scene root are now filtered out.
- **Color parsing**: `Color(r, g, b)` (3-arg, alpha defaults to 1.0) and hex strings (`#RGB`, `#RGBA`, `#RRGGBB`, `#RRGGBBAA`) are now accepted wherever a color value is parsed.

### Error surfacing
- **Engine-side failures are no longer reported as success.** `sendEditorCommand` previously ignored an `{ error: "..." }` payload returned inside the JSON-RPC `result` field, so a rejected command (e.g. deleting a node that doesn't exist) came back as "OK". A central `assertEditorOk` guard now throws on any engine-reported error.
- **New `EDITOR_COMMAND_FAILED` error code** (17 codes total) with its own repair hints, so a genuine command rejection is no longer mislabelled `EDITOR_NOT_REACHABLE` ("check your plugin and port") when the plugin is in fact perfectly reachable. Handlers that legitimately read `result.error` (`evaluate_expression`, `get_editor_setting`, …) use a new `sendEditorCommandRaw` bypass.

### Build tooling
- **`scripts/sync-addons.js` never propagated same-version addon fixes.** It compared only the `version` field in `plugin.cfg`, so editing `plugin.gd` and rebuilding left the target project running the *old* plugin — silently, with a reassuring "Versions match — skipping sync" message. (This bit during this very release: the addon fixes above did not reach `test/test-project` until it was fixed.) It now compares actual file contents (SHA-1 per file, plus added/removed file detection), ignores Godot-generated `.uid` / `.import` artifacts in the target, and reports *why* it is syncing. Verified idempotent across repeated runs.

### Tests
- New `test/editor_error_surface.test.ts` (8 tests) covering the error-tagging/rewrite logic plus grep-based addon invariants (every mutating command must contain `create_action` + `commit_action`; no `queue_free` in deletion paths; no unbound `EditorUndoRedoManager` methods).
- New `test/addon_bridges.test.ts` (11 tests) locking down the bridge bugs: no command handler may reuse a reserved `Node` virtual name, `_resolve` must declare a return type, and both bridges must `poll()` before reading peer status. Confirmed to fail against the v1.9.1 sources.
- New `test/scene_format.test.ts` (23 tests) pinning the `.tscn`/`.tres` on-disk contract: byte-for-byte idempotent round-trip against a Godot-authored scene, no quote accumulation over five consecutive edits, self-healing of already-over-quoted ids, exactly one root with `parent="."` preserved on direct children, deep nesting preserved, the root-prefixed parent form accepted, every `edit_scene` addressing style resolved, collision shapes as both inline `sub_resource` and external `ext_resource`, and the audio-bus contiguity / numeric-ordering / StringName rules.
- New `test/uid.test.ts` (11 tests) pinning the UID encoder against Godot's own vectors, asserting 200 generated UIDs match `^uid://[a-y0-9]+$` (no `z`), rejecting malformed input, and covering `stampUid`'s placeholder-fill / leave-existing / header-scoped / body-preserving behaviour.
- New `load_sprite` regression in `test/test_all.mjs` asserting the emitted `[ext_resource]` has a singly-quoted id and a `res://` path; the `set_mesh_surface_material` case was strengthened to reject any non-`res://` path it produces (that test had previously been *causing* the fixture corruption it should have caught).
- Fixed the legacy `test/test_all.mjs` harness, which called `fn(m)` without awaiting — an async handler (`get_godot_version`) was asserted before it resolved and always failed. Now **176/176**.
- Suite is now **197 tests (127 runnable + 70 integration)**.
- `npm run check:godot` now runs through `scripts/check-godot.js`, which locates the engine via `GODOT_BIN` → `findGodotBinary()` → platform candidates, so the gate works on macOS where Godot ships as an `.app` bundle rather than a binary on `PATH`.
- Verified against a live headless Godot 4.7.1 editor: 39/39 addon-level checks over TCP, 19/19 full-stack checks through MCP stdio → server → editor, and 12/12 against a running game. A regression harness run against the previous release reproduced the bugs listed above.

## v1.9.1 (2026-08-05)

### Fixes
- **Corrected the read-only tool count** in docs and the CLI help text: `--read-only` actually rejects **164** write/side-effect tools (the `WRITE_TOOLS` set), not "~140". Updated README (en/zh) and `src/index.ts` accordingly.
- **Fixed the vitest test-count claim**: the suite is **144 tests** (74 runnable + 70 integration requiring a live Godot project), not "140". Legacy `test/test_all.mjs` "167 checks" claim verified accurate and kept.
- **Robust camelCase→snake_case parameter mapping.** `normalizeParameterNames` now converts *any* camelCase argument key to snake_case (generic `toSnakeCase` fallback) instead of only the 30 hand-listed `PARAMETER_MAP` entries. This closes a gap where 111 multi-word tool parameters would fail Zod validation if an LLM client emitted camelCase. Snake_case keys still pass through unchanged; `test/server_normalization.test.ts` updated to match.

## v1.9.0 (2026-08-05)

### License
- **Switched from MIT to AGPL-3.0-or-later.** `LICENSE.md` now carries the full GNU AGPL v3.0 text; all source/addon SPDX headers, `package.json`, and `package-lock.json` updated accordingly. (AGPL strengthens the network-use copyleft clause — anyone offering godot-mcp as a network service must share their corresponding source.)

### Docs
- **Rewrote "AI Client Configuration"** into a step-by-step guide covering **18 clients** (Claude Code, Cursor, VS Code / GitHub Copilot, Codex, Gemini, Windsurf, Cline, Roo Code, Trae, Zed, JetBrains, OpenCode, Claude Desktop, Continue, Cherry Studio, Goose, Aider, and a generic catch-all) — each with config snippet, verify step, and a starter prompt. Includes a universal `mcpServers` snippet, client-specific gotchas (OpenCode 30s timeout, Goose `cmd`, Trae two-step attach, etc.), an `AGENTS.md` rules-file template, and a troubleshooting table.
- **Corrected documentation counts** that had drifted from the registry: **358 tools across 29 categories** (was "26 categories") and **123 editor tools** (was "89"). The Feature Overview table was rebuilt to match `src/tools/register.ts` exactly (29 rows summing to 358).

## v1.8.0 (2026-08-04)

### New Tools (+13, total 358 across 29 categories)
- **Meta / Discovery (2)** — `search_tools` (keyword search across the full tool catalog so an agent never has to guess among 350+ tools) and `get_status` (system diagnostics: editor-bridge health, live-game runtime-bridge health, tool count + subsystem list).
- **Live-game Runtime tier (11)** — control the *running* game via a new `runtime_bridge.gd` autoload (enable it as an autoload named `godot_mcp_runtime`): `runtime_ping`, `runtime_get_tree`, `runtime_get_node`, `runtime_set_node`, `runtime_call_method`, `runtime_emit_signal`, `runtime_input`, `runtime_freeze`, `runtime_resume`, `runtime_step` (deterministic frame-stepping), `runtime_screenshot`. Enables deterministic playtesting instead of the flaky "wait + screenshot" loop.

### DX / Reliability
- Global registry singleton so meta/discovery tools can search the catalog.
- New `RUNTIME_NOT_REACHABLE` error code with setup hints.
- Added `addons/godot-mcp/runtime_bridge.gd` (game-side autoload, loopback TCP :9877).

## v1.7.0 (2026-08-04)

### New Tools (+63, total 345 across 26 categories)
- **Editor bridge (34)** — clipboard & playback (`editor_cut`/`editor_copy`/`editor_paste`/`editor_pause`/`editor_unpause`) wrapping existing plugin commands; 19 node-property setters (`editor_set_*_param`) reusing `set_node_properties`; 10 typed node creators (`editor_create_*`) reusing `add_node`.
- **File-path tools (29)** — physics (`write_collision_layers`); translation (`write_translation`/`add_translation_key`); texture (`list_textures`/`create_image_texture`/`set_texture_import_flags`); diff (`diff_script`/`diff_project_config`/`diff_animation`); geometry (`read_collision_polygon`/`simplify_polygon`); navigation (`read_nav_agent`/`create_nav_link`/`read_nav_obstacle`); joints (`read_joint`/`remove_joint`); environment (`create_sky`/`create_world_environment`); extension (`create_gdextension`/`read_csproj`); uid (`fix_missing_uids`); domain (`create_multimesh`/`set_skeleton_bone_pose`/`write_path_curve`); tileset (`create_tileset`/`add_tileset_source`); utility (`create_theme`/`add_theme_type`/`set_stylebox`).

## v1.6.0 (2026-08-04)

### Refactor
- **Error codes everywhere** — ~240 `plainError` calls upgraded to `toolError(ErrorCode.*)` (FILE_NOT_FOUND / ALREADY_EXISTS / GODOT_NOT_FOUND / PARSE_ERROR / INVALID_ARGUMENT / INTERNAL_ERROR); only raw editor-bridge passthroughs stay uncoded.
- **Error suggestions** — `toolError` now appends "Possible solutions" mapped per `ErrorCode` (e.g. READ_ONLY → how to disable, EDITOR_NOT_REACHABLE → `--enable-plugin` install hint), mirroring Coding-Solo's `possibleSolutions`.

### Testing & CI
- **New GitHub Actions CI** (`.github/workflows/ci.yml`): unit job (Node 18/20) + integration job that installs Godot 4.4 Linux headless and runs the 70 integration tests against `test/test-project`.
- **Fixed `handleGetGodotVersion` / `handleIsEditorRunning` await** in integration tests (async migration leftover) — full suite now **144/144 green with real Godot**.
- **Structural asserts**: package.json/plugin.cfg/plugin.gd version consistency, and register.ts category-count comments vs actual registrations.

### Documentation
- README badges now point to the live GitHub Actions CI badge.

## v1.5.0 (2026-08-04)

### Security & Hardening
- **`--read-only` actually works now** — the flag previously only set `GODOT_MCP_READ_ONLY` with no enforcement anywhere. Added a maintained `WRITE_TOOLS` whitelist (~140 write/side-effect tools): in read-only mode they are hidden from `tools/list` and direct calls are rejected with a `READ_ONLY` error. Structural tests assert whitelist completeness (`editor_take_screenshot` included).
- **Plugin TCP bridge bound to loopback only** — `_tcp_server.listen(port, "127.0.0.1")` (was `0.0.0.0` = LAN-wide unauthenticated RCE: arbitrary GDScript execution, file writes, `OS.execute`). Optional `auth` handshake via `GODOT_MCP_TOKEN` or project setting `godot_mcp/auth_token`; MCP server client (`editor.ts`) sends the handshake automatically.
- **HTTP: non-loopback binds now require `GODOT_MCP_TOKEN`** — server refuses to start on `0.0.0.0`/LAN addresses without a token. Loopback-check fails closed.
- **`captureScreenshot` window matching** — removed the always-true `id.length > 0` dead condition that selected the first window unconditionally.
- **`server.on('error')` startup failure** — HTTP listen errors now reject the startup promise (was an un-rejectable `throw` inside an EventEmitter callback), so `all` transport mode exits controlled.

### Bug Fixes
- **`--install-addons` was a dead flag** — `parseArgs` never handled it (help text and `main()` did); it silently fell through to serving mode. Now works.
- **Plugin JSON double-escaping** — `_value_to_json_string` hand-built quoted strings that were escaped a second time by `JSON.stringify`, producing `\"` and, for control chars, invalid JSON that could break the `__MCP__:` line protocol. Replaced with `_value_to_jsonable` (native values pass through, `JSON.stringify` does the escaping; depth-limited to 20 against self-referential structures).
- **Editor exit hang in stdio mode** — `wait_to_finish()` on the stdin reader thread blocked forever (thread parked on `OS.read_string_from_stdin()`). `_exit_tree` now waits with a 1.5s deadline, then detaches.
- **TCP framing** — plugin read raw chunks and parsed whole blocks (stuck/partial frames failed). Now buffers and splits on `\n` with a 1 MB cap; disconnected peers are removed from `_tcp_connections`.
- **`_parse_value` out-of-bounds** — `Vector2(1)`-style input indexed missing elements, spamming errors; all branches now check element counts.
- **Plugin misc** — JSON-RPC `id` now preserves string ids (was `id: int`); `params: null` handled; `health_check` version `3.0`→`1.5.0` (was hardcoded); `_cmd_add_autoload` dropped the invalid `set_plugin_enabled("reload_current_project")` call; `_cmd_close_scene` no longer calls `reload_scene_from_path("")`; `pause_project`/`get_running_scene_tree` now clearly report they operate on the *editor* tree, not the running game.
- **Blocking event loop** — `getGodotVersion` (`spawnSync` 5s), `detectRunningGodot` (`execSync` 3s) and `captureScreenshot` (`spawnSync` up to 15s) are now async; `spawnedProcesses` entries are auto-removed 60s after exit.

### Refactor
- **244 hand-rolled error objects** unified into `plainError()` (`errors.ts`); fixed `read_audio_bus_layout` returning file-not-found as a *success*.
- **`.import` parsing** merged into shared `src/utils/import_parser.ts` (import.ts / texture.ts each had a near-identical copy).
- **Plugin `_key_name_to_code`** — 85-line if-chain replaced with a `const` dictionary; dead output-capture code and `_build_runtime_tree` removed.
- **`src/index.ts` header** — version comment synchronized (was v1.2.0).

### Documentation
- READMEs corrected to match reality: read-only semantics, structured-error scope, tests badge 140→72 passed, plugin command count 97→102, and added the previously undocumented `GODOT_MCP_TOKEN` / `GODOT_MCP_READ_ONLY` / `MCP_STDIO` / `GODOT_PROJECT` env vars plus a security note.

## v1.4.0 (2026-07-23)

### Security & Hardening
- **script.ts** — GDScript identifier validation for `add_script_function` / `add_script_signal` / `add_script_export`. `func_name`, `signal_name`, `var_name` must now be valid GDScript identifiers, and `params` / `return_type` / `var_type` / `export_hint` are rejected if they contain control chars, statement separators, or comment markers — preventing crafted input from smuggling code into generated `.gd` files.
- **godot.ts** — `capture_screenshot` output path is now constrained to the project root via `resolveProjectPath` (was `path.resolve`, which allowed writing the screenshot anywhere on disk, bypassing the project sandbox every other write tool respects).
- **cleanup** — Removed dead code: `src/utils/cache.ts` (`FileCache` / `sceneCache` / `resourceCache` / `configCache`) and the unused `withFileLock` helper in `src/utils/file_utils.ts`.

## v1.3.9 (2026-07-16)

### Bug Fixes
- **server.ts** — Fix `PARAMETER_MAP` inversion (was normalizing `snake_case` → `camelCase`, which broke every tool's zod schema); now correctly maps `camelCase` → `snake_case` for client compatibility. Exported `normalizeParameterNames`.
- **editor.ts** — Fix JSON-RPC response collision: replaced `Date.now()`/`Date.now()+Math.random()` request IDs with a monotonic `_requestIdCounter` (both TCP and spawn bridges), preventing mismatched responses under concurrent calls.
- **utility.ts** — Harden `handleReadProjectIcon` regexes to tolerate whitespace around `=` (`config/name="..."`).
- **http-server.ts** — Per-session Streamable HTTP transport: `/mcp` now creates a dedicated `StreamableHTTPServerTransport` per `Mcp-Session-Id` (was a single shared instance). Added optional `GODOT_MCP_TOKEN` Bearer/query auth (401 when set and missing/wrong; `/health` stays open).
- **register.ts** — Removed dead inline `read_multimesh` schema (now uses shared `readMultiMeshSchema`); corrected category-count comments; total 282 tools.

### Documentation
- Renamed 9 tool names in READMEs + legacy tests for registry consistency (`editor_get_autoload_list`→`editor_get_autoloads`, `editor_get_class_property_list`→`editor_get_class_properties`, `editor_get_class_signal_list`→`editor_get_class_signals`, `editor_get_dependency_list`→`editor_get_dependencies`, `editor_get_editor_camera`→`editor_get_camera`, `editor_get_error_list`→`editor_get_errors`, `editor_get_performance_monitors`→`editor_get_performance`, `editor_set_editor_camera`→`editor_set_camera`, `read_multi_mesh`→`read_multimesh`).
- Corrected README category counts (Project 22→21, Other 8→4) and normalization description; added missing `editor_get_scene_changes` to Chinese README; test-count claims updated (vitest 142 + legacy 167).

## v1.3.8 (2026-06-28)

### Refactor
- Rename addons directory from `godot_mcp` to `godot-mcp` (hyphenated)
- sync-addons now checks version before copying (skip if versions match)

## v1.3.7 (2026-06-28)

### Path & Security Fixes
- **resolveProjectPath** — reject absolute paths to prevent path traversal bypass; add try/catch for `fs.realpathSync` EACCES errors; improve error message with resolved path details
- **resolveProjectPath** — add `.toLowerCase()` for case-insensitive `startsWith` check on Windows
- **findProjectRoot** — resolve symlinks via `fs.realpathSync` for consistency with `resolveProjectPath`
- **sync-addons.js** — fix auto-detection candidate paths; add log messages when target not found (no longer silent)
- **test cleanup** — use `rmSync({ recursive: true })` instead of manual file list to clean all `.bak` files
- **integration test** — use `path.join` instead of string concatenation for cross-platform consistency
- **.mcp.json** — fix path typo (`GodotMCP` → `Godot-MCP`)

## v1.3.4 (2026-06-28)

### Documentation
- **README.md** — Professional rewrite: removed emojis, added ASCII architecture diagram, Implementation Principles section, Quick Demo, structured Usage Examples with tool mapping tables
- **README-zh.md** — Full Chinese translation synced with English README (12 client configs, 34 usage examples, 14 collapsible tool categories)
- Language switcher moved to top of both READMEs
- Added 12 AI client configuration guides: VS Code/Copilot (3 methods), Cursor, Claude Desktop, Claude CLI, Windsurf, Codex CLI, Cline, Roo Code, Continue, Aider, Cody, Goose — each with platform-specific paths, setup steps, and verification commands

### Godot API Fixes
- Replaced 84 deprecated `get_editor_interface()` calls with `EditorInterface` singleton throughout plugin.gd
- Fixed `_cmd_bake_lightmaps()` to use `LightmapGI.bake()` instead of `OS.execute("godot"...)`
- Fixed `_cmd_get_performance_monitors()` to use Godot 4.x `Performance.Monitor` enum values directly
- Added Godot 3.x detection warning in `get_godot_version` tool

### Version Support
- All references updated from specific version numbers to unified "Godot 4.x"
- Godot 3 explicitly marked as not supported in all documentation
## v1.3.4 (2026-06-27)

### Bug Fixes
- **plugin.gd**: Fixed `_cmd_close_scene()` to properly save then clear scene (was calling invalid `reload_scene_from_path("")`)
- **plugin.gd**: Fixed `_cmd_pause_project()` using `get_tree().paused` toggle (was incorrectly calling `play_main_scene()`)
- **plugin.gd**: Fixed `_cmd_unpause_project()` to actually unpause via `get_tree().paused = false`
- **plugin.gd**: Fixed `_cmd_cut_selected()` to use `undo_redo` system (was using `queue_free()` directly, breaking undo)
- **plugin.gd**: Fixed `_cmd_paste()` to restore serialized node properties via new `_serialize_node_properties()` helper
- **plugin.gd**: Added `_serialize_node_properties()` method for clipboard-aware cut/copy/paste
- **plugin.gd**: Added missing `_parse_value` types: Vector3i, Vector4i, Quaternion, Plane, Transform3D, AABB; also fixed Transform2D to parse matrix values
- **register.ts**: Registered `transform_node` tool (schema/handler existed but was never registered)
- **resource_parser.ts**: Fixed `isBinaryResource()` crash on empty/small files (< 4 bytes)
- **Tests**: Fixed coverage tools imports from `coverage.js` → `scene_inspectors.js`

### Performance
- **editor.ts**: Reduced TCP timeout from 3000ms to 800ms — first-call delay reduced from 15s+ to ~5s
- **editor.ts**: Added auto-restart on unexpected editor process exit (up to 3 attempts)
- **editor.ts**: Extended health check cache from 30s to 60s

### Architecture — coverage.ts split
- **New**: `src/tools/mesh.ts` — Mesh Primitives (create_mesh_primitive, 11 mesh types)
- **New**: `src/tools/scene_inspectors.ts` — All scene node inspectors (24 handlers: 2D Lights, VehicleBody, SpringArm, Decals, Occluders, Markers, AudioStream, CameraAttributes, SpriteFrames, SoftBody, GridMap, AudioListener)
- **Deleted**: `src/tools/coverage.ts` (444 lines → 2 clean files)

### Features
- **New**: `--enable-plugin` CLI flag — installs `addons/` and auto-enables plugin in `project.godot` (no manual Godot step required)
- **New**: `--read-only` CLI flag — global read-only mode, rejects all write/delete operations
- **New**: Automatic `snake_case` → `camelCase` parameter normalization in `server.ts` (maps `project_path` → `projectPath`, etc. for 30+ common parameters)

### Documentation
- Fixed README/README-zh tool count inconsistencies (Editor 78→89, Scene 21→22, Shader Graph 7→8, Total 281→282)
- Updated MEMORY.md with current state and v1.3.4 fixes

## v1.3.0 (2026-06-24)

### Multi-Transport Support
- **New**: Stdio transport (`-t stdio`, default) — stdin/stdout for Claude Desktop / VS Code
- **New**: SSE transport (`-t sse --port 3000`) — HTTP Server-Sent Events for legacy MCP clients
- **New**: Streamable HTTP transport (`-t streamable-http --port 3000`) — MCP 2025 spec, supports session resumption
- **New**: `-t all` mode — run Stdio + SSE + Streamable HTTP simultaneously
- **New**: `--port` / `--host` / `--no-sse` / `--no-streamable-http` CLI flags
- **New**: `/health` endpoint — health check with version + active endpoints
- **Refactored**: `server.ts` → factory pattern (`createMcpServer`, `initSharedResources`)
- **Refactored**: Transport layer extracted to `src/transports/` (stdio.ts, http-server.ts)
- **Deps**: Added `express` dependency for HTTP server

## v1.2.0 (2026-06-23)

### Dual-Mode Editor Bridge
- **New**: stdio mode — editor plugin reads commands from stdin when spawned by MCP
- **New**: TCP mode — editor plugin listens on port 9876 for direct Godot launches
- **New**: `--install-addons` CLI flag to install editor plugin to project

## v1.1.2 (2026-06-22)

### Fixes
- Fixed plugin loading guard for stdio mode

## v1.0.2 (2026-06-21)

### Features
- `--install-addons` CLI flag for editor plugin installation
- Shader tools and screenshot usage docs

## v1.0.0 (2026-06-16)

### Structural
- **New**: `ToolRegistry` pattern — centralized registration in `src/tools/register.ts`
- **New**: `ErrorCode` enum — structured errors with `[CODE] message` format
- **New**: `FileCache` — TTL-based in-memory cache for parsed files
- **Rewritten**: `server.ts` — from ~1700 lines to ~110 lines
- **Fixed**: package.json metadata (was 57→now 179 tools, v0.1→v1.0)

### Tools Added (83→179, +96 tools)
- Animation: list_animations, read_animation, create_animation, set_animation_param, add_animation_library, add_animation_track, set_keyframe, remove_animation_track, read_animation_tree, set_animation_tree_param
- Import: read_import_config, list_import_files, write_import_config
- Environment: read_environment, list_environments, create_environment, set_environment_param
- Audio: read_audio_bus_layout, list_audio_files, create_audio_bus_layout, add_audio_bus, remove_audio_bus, add_bus_effect, set_bus_volume
- Physics: list_physics_materials, read_physics_material, create_physics_material, read_collision_layers
- Input Map: write_input_action, remove_input_action, add_input_binding
- GDScript Writer: add_script_function, add_script_signal, add_script_export
- Inspector: list_cameras, read_camera, list_lights, set_light_param, read_particles
- TileMap: list_tilesets, read_tileset, read_tilemap
- Navigation: list_nav_regions, read_nav_region, create_nav_mesh
- Translation: list_translations, read_translation, create_translation
- Diff: diff_scene, diff_resource
- Texture: read_texture_info
- Extension: read_gdextension, list_csproj, create_world
- UID: get_uid, update_project_uids, list_missing_uids
- Joints: create_joint, set_joint_param, list_joints
- Geometry: create_collision_polygon, set_shape_points
- Rendering: read_mesh_instance, set_mesh_surface_material, read_viewport, read_area, read_raycast
- Domain: read_curve, create_curve, read_gradient, create_gradient, list_paths, read_path, list_skeletons, read_skeleton, read_reflection_probe, read_multimesh, create_noise_texture
- Nodes: read_character_body, read_animated_sprite, read_audio_player, read_video_player, read_parallax, read_rich_text, read_container, read_tab_container
- Utility: list_all_signals, read_project_icon, read_stylebox, create_atlas_texture, list_popups, generate_cohesion_report
- Project: create_directory, list_projects
- Scene: edit_scene (registered in TOOLS)
- Scene fine-grained: rename_node, attach_script, set_collision_shape, load_sprite, set_node_position, set_node_rotation, set_node_scale, add_node, remove_node, modify_node, clone_node, connect_signal, disconnect_signal

### Architecture
- 25 handler files in `src/tools/`, 4 parsers, 5 utility modules
- File-based (no editor required) + optional TCP editor plugin
- All write operations create `.bak` backups
- 44 integration tests, 8 parser tests

## v0.1.0 (initial)
- 67 tools across 7 categories
- File-based pure MCP server
- Scene parser, resource parser, config parser
- Godot CLI integration
