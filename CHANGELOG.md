# Changelog
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
