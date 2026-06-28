# Changelog
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
