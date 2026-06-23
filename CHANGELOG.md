# Changelog

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
