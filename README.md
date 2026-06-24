# Godot MCP

[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
[![Tests](https://img.shields.io/badge/tests-138%20passed-brightgreen)](.)
[![npm](https://img.shields.io/npm/v/@yanhuifair/godot-mcp)](https://www.npmjs.com/package/@yanhuifair/godot-mcp)

[中文文档](README-zh.md)

> **Model Context Protocol server for Godot Engine** — 281 tools, 26 categories, Godot 4.6/4.7 coverage. File-based CRUD + live editor plugin. AI assistants read, inspect, and modify Godot projects through **Stdio**, **SSE**, or **Streamable HTTP** transport.

---

## Table of Contents

- [Quick Start](#quick-start)
- [Feature Overview](#feature-overview)
- [All Tools](#all-tools)
- [Installation](#installation)
- [AI Client Configuration](#ai-client-configuration)
- [Usage Examples](#usage-examples)
- [Editor Plugin](#editor-plugin)
- [Architecture](#architecture)
- [Supported Formats](#supported-formats)
- [Development](#development)
- [Build VSIX](#build-vsix)

---

## Quick Start

### 1. Install the plugin (one-time)

```bash
npx @yanhuifair/godot-mcp --install-addons -p /path/to/your/godot/project
```

Then enable in Godot: **Project → Project Settings → Plugins → Godot MCP → Enable**.

### 2. Configure your AI client

Create `.vscode/mcp.json` in your project root (or see [AI Client Configuration](#ai-client-configuration) for other clients):

```json
{
  "mcpServers": {
    "godot-mcp": {
      "type": "stdio",
      "command": "npx",
      "args": ["-y", "@yanhuifair/godot-mcp", "-p", "."]
    }
  }
}
```

### 3. Start chatting

The AI client auto-launches the MCP server. **File-based tools** (.tscn, .tres, .gd) work immediately. **Editor tools** (play, select nodes, etc.) cause MCP to spawn Godot automatically — no need to manually open the editor.

> "List all scenes in the project"
> "Find all CharacterBody2D nodes"
> "Run the game and take a screenshot"

---

## Feature Overview

| Category | Tools | Highlights |
|---|---|---|
| **Editor** | 78 | Live editor control: select, play, undo, save, breakpoints, search, file ops, performance |
| **Scene** | 21 | Full scene CRUD + node add/remove/modify/clone + signals + transforms + collision + sprites |
| **Project** | 22 | Config read/write, input map, file ops, autoloads, validation, unused asset detection |
| **Script** | 21 | GDScript/Shader CRUD + structure analysis + code search + signal/function/export injection + shader validation/compilation |
| **Domain** | 11 | Curve, Gradient, Path, Skeleton, ReflectionProbe, MultiMesh, NoiseTexture |
| **Animation** | 10 | AnimationPlayer/AnimationTree full pipeline: create, tracks, keyframes, params |
| **Godot Engine** | 9 | Engine detection, launch editor, run/export project, screenshot, process control |
| **Coverage** | 8 | Mesh primitives, 2D lights, VehicleBody, SpringArm, Decal, Occluder |
| **Nodes** | 8 | CharacterBody, AnimatedSprite, Audio, Video, Parallax, RichText, Container, Tab |
| **Resource** | 8 | .tres CRUD, PBR materials, themes, 14 templates |
| **Audio** | 7 | Audio bus layout CRUD, effects, volume, audio file detection |
| **Shader Graph** | 7 | VisualShader graph node add/remove/connect, param editing |
| **Utility** | 6 | All signals list, StyleBox, AtlasTexture, Popup, project icon, cohesion report |
| **Rendering** | 5 | MeshInstance, Viewport, Area, RayCast/ShapeCast |
| **Environment** | 4 | Environment .tres read/write + 4 presets |
| **Inspector** | 5 | Camera, Light, Particle node inspection and editing |
| **Physics** | 4 | PhysicsMaterial CRUD, collision layer names |
| **Import** | 3 | .import file read/write and listing |
| **TileMap** | 3 | TileSet resource parsing, TileMapLayer inspection |
| **Navigation** | 3 | NavigationRegion inspection + NavigationMesh creation |
| **Translation** | 3 | CSV/PO translation file read/write |
| **Joints** | 3 | Physics joint creation, params, listing |
| **UID** | 3 | File UID query, batch update, missing UID detection |
| **2D Geometry** | 2 | CollisionPolygon2D, CollisionShape2D shape config |
| **Diff** | 2 | Scene and resource line-by-line/property comparison |
| **Other** | 8 | GDExtension, C#, World3D, CameraAttributes, SpriteFrames, GridMap, Texture |

**Total: 281 tools across 26 categories**

---

## All Tools

> 🔍 Click each category to expand and see all tools with descriptions. For detailed usage examples, see [Usage Examples](#usage-examples). Editor tools are also listed with descriptions in [Editor Plugin](#editor-plugin).

<details>
<summary><b>🎬 Editor</b> (89 tools) — Live editor control</summary>

| Tool | Description |
|---|---|
| `editor_get_selection` | Get selected nodes in editor. |
| `editor_set_selection` | Select node in editor. |
| `editor_get_open_scene` | Get currently open scene path. |
| `editor_read_current_scene` | Read live editor scene tree. |
| `editor_get_info` | Get editor status info. |
| `editor_get_rect` | Get editor window dimensions. |
| `editor_focus` | Bring the Godot editor window to the foreground. |
| `editor_show_in_filesystem` | Reveal a file in the FileSystem dock. |
| `editor_open_dock` | Open a dock: filesystem, inspector, scene, output. |
| `editor_play` | Play project from editor. |
| `editor_stop` | Stop playing in editor. |
| `editor_run_specific_scene` | Run a specific scene (not just main). |
| `editor_get_running_scene_tree` | Get the live scene tree while the game is running. |
| `editor_get_performance_monitors` | Get FPS, draw calls, memory usage while game is running. |
| `editor_undo` | Undo last editor action. |
| `editor_redo` | Redo last undone action. |
| `editor_save` | Save current scene in editor. |
| `editor_save_all` | Save all open scenes. |
| `editor_reload_scene` | Save and reload current scene. |
| `editor_delete_selected` | Delete currently selected nodes. |
| `editor_create_scene` | Create and open a new scene in the editor. |
| `editor_instantiate_scene` | Instantiate a PackedScene into the current scene. |
| `editor_set_main_scene` | Set the project main scene. |
| `editor_get_scene_changes` | Check if current scene has unsaved changes. |
| `editor_add_node` | Add a node to the currently open scene in editor. |
| `editor_remove_node` | Remove a node from the currently open scene. |
| `editor_duplicate_node` | Duplicate a node with children, scripts, and signals. |
| `editor_rename_node` | Rename a node in the editor. |
| `editor_reparent_node` | Move a node to a new parent. |
| `editor_move_node` | Move a 2D/3D node to a new position. |
| `editor_get_node_properties` | Read all editor-visible properties of a node. |
| `editor_set_node_properties` | Set multiple properties on a node at once. |
| `editor_create_script` | Create and open a new GDScript in the editor. |
| `editor_attach_script` | Attach a script to a node in the editor. |
| `editor_run_gdscript` | Execute arbitrary GDScript code in editor context. |
| `editor_evaluate_expression` | Evaluate a GDScript expression in debugger/editor context. |
| `editor_set_breakpoint` | Set a breakpoint in a script. |
| `editor_remove_breakpoint` | Remove a breakpoint from a script. |
| `editor_get_breakpoints` | List all breakpoints. |
| `editor_debug_continue` | Resume execution in debugger. |
| `editor_debug_step` | Step into next line in debugger. |
| `editor_debug_step_over` | Step over current line in debugger. |
| `editor_debug_break` | Stop execution (break) in debugger. |
| `editor_get_stack_trace` | Get current call stack from debugger. |
| `editor_get_debug_variables` | Get local variables from debugger. |
| `editor_connect_signal` | Connect a signal between nodes in the editor. |
| `editor_disconnect_signal` | Disconnect a signal between nodes. |
| `editor_list_node_signals` | List signals and their connections on a node. |
| `editor_open_asset` | Open an asset in editor. |
| `editor_list_filesystem` | List files and directories in the editor filesystem. |
| `editor_create_folder` | Create a directory in the project via editor filesystem. |
| `editor_delete_asset` | Delete a file or folder via editor. |
| `editor_rename_asset` | Rename a file via editor filesystem. |
| `editor_move_asset` | Move a file to a new location via editor. |
| `editor_duplicate_asset` | Duplicate a file via editor filesystem. |
| `editor_reimport_asset` | Force reimport of an asset. |
| `editor_get_dependency_list` | Get all resource dependencies for a file. |
| `editor_get_project_setting` | Read a project setting via editor API. |
| `editor_set_project_setting` | Set a project setting via editor API (auto-saves). |
| `editor_get_editor_setting` | Read an editor preference value. |
| `editor_set_editor_setting` | Set an editor preference. |
| `editor_get_project_directory` | Get project res:// and user:// paths. |
| `editor_get_input_map` | Read the Input Map via editor API. |
| `editor_add_input_action` | Add an input action via editor API. |
| `editor_remove_input_action` | Remove an input action via editor API. |
| `editor_get_autoload_list` | List autoload singletons via editor API. |
| `editor_add_autoload` | Add an autoload singleton via editor API. |
| `editor_remove_autoload` | Remove an autoload singleton via editor API. |
| `editor_bake_lightmaps` | Trigger lightmap baking. |
| `editor_bake_navigation` | Bake navigation meshes for all NavigationRegion nodes in current scene. |
| `editor_take_screenshot` | Capture the editor viewport as a PNG. |
| `editor_get_class_list` | List all Godot classes, optionally filtered. |
| `editor_get_method_list` | List all methods of a Godot class. |
| `editor_get_class_property_list` | List all editor-visible properties of a class. |
| `editor_get_class_signal_list` | List all signals of a Godot class. |
| `editor_get_class_doc` | Open Godot documentation for a class in browser. |
| `editor_search_help` | Search Godot documentation in browser. |
| `editor_get_editor_camera` | Get the 3D editor viewport camera position. |
| `editor_set_editor_camera` | Set the 3D editor viewport camera position. |
| `editor_toggle_grid` | Toggle 3D grid visibility. |
| `editor_toggle_snap` | Toggle 3D snap mode. |
| `editor_get_recent_scenes` | List recently opened scene paths. |
| `editor_simulate_key` | Simulate a key press in the editor (e.g. F5 to run, Ctrl+S to save). |
| `editor_get_plugin_list` | List all installed editor plugins with enabled state. |
| `editor_enable_plugin` | Enable a named editor plugin. |
| `editor_disable_plugin` | Disable a named editor plugin. |
| `editor_get_error_list` | Get current editor error/log list. |
| `editor_clear_errors` | Clear the editor error list. |
| `editor_health_check` | Check if the Godot editor plugin is reachable. |

</details>

<details>
<summary><b>🏗️ Scene</b> (22 tools) — Full scene CRUD + nodes + signals + transforms</summary>

| Tool | Description |
|---|---|
| `read_scene` | Read a .tscn scene file. |
| `create_scene` | Create a new scene from template. |
| `edit_scene` | Apply batch operations to a scene. |
| `list_scenes` | List all .tscn scene files. |
| `search_scene_content` | Full-text search in .tscn content. |
| `scene_dependency_graph` | Analyze inter-scene dependencies. |
| `add_node` | Add a node to a scene. |
| `remove_node` | Remove a node from a scene. |
| `modify_node` | Modify node properties or rename. |
| `clone_node` | Deep-clone a node in a scene. |
| `rename_node` | Rename a node in a scene. |
| `attach_script` | Attach a script to a node. |
| `connect_signal` | Connect a signal between nodes. |
| `disconnect_signal` | Disconnect a signal. |
| `set_node_position` | Set node position (2D/3D auto-detect). |
| `set_node_rotation` | Set node rotation (2D/3D). |
| `set_node_scale` | Set node scale (2D/3D). |
| `transform_node` | Apply a transform to a node. |
| `set_collision_shape` | Set collision shape for CollisionShape node. |
| `load_sprite` | Load a texture onto a Sprite2D node. |
| `list_ui_nodes` | List Control-derived UI nodes. |
| `find_nodes_in_scenes` | Search nodes across scenes by type/property. |

</details>

<details>
<summary><b>📁 Project</b> (22 tools) — Config, input map, file ops, autoloads, validation</summary>

| Tool | Description |
|---|---|
| `list_project_files` | List files and directories in the Godot project. |
| `read_project_config` | Read and parse project.godot. |
| `write_project_config` | Write a config value to project.godot. |
| `read_export_presets` | Read export presets from export_presets.cfg. |
| `read_input_map` | Read input map with key bindings. |
| `write_input_action` | Create a new input action. |
| `remove_input_action` | Remove an input action. |
| `add_input_binding` | Add key/mouse/joypad binding to action. |
| `list_autoloads` | List all autoload singletons. |
| `add_autoload` | Add an autoload entry. |
| `remove_autoload` | Remove an autoload entry. |
| `search_in_project` | Search for text across project files. |
| `delete_file` | Delete a file with .bak backup. |
| `move_file` | Move/rename a file within project. |
| `create_directory` | Create a directory in project. |
| `duplicate_scene` | Duplicate a scene file. |
| `duplicate_resource` | Duplicate a .tres resource. |
| `generate_project_report` | Generate comprehensive project overview. |
| `find_unused_assets` | Find orphaned project files. |
| `validate_project` | Validate project for broken refs, empty UIDs. |
| `list_groups` | List all node groups across scenes. |

</details>

<details>
<summary><b>📝 Script</b> (21 tools) — GDScript/Shader CRUD + analysis + injection + validation</summary>

| Tool | Description |
|---|---|
| `read_script` | Read a script file with line numbers. |
| `write_script` | Write content to a script file. |
| `create_script` | Create a new script from template. |
| `list_scripts` | List all script files grouped by type. |
| `read_script_structure` | Analyze GDScript structure. |
| `search_in_scripts` | Search in scripts with function context. |
| `validate_script` | Validate GDScript for common issues. |
| `add_script_function` | Append a function to GDScript. |
| `add_script_signal` | Add a signal declaration to GDScript. |
| `add_script_export` | Add @export variable to GDScript. |
| `read_shader` | Read a .gdshader file. |
| `create_shader` | Create a new .gdshader from template. |
| `list_shaders` | List all .gdshader files. |
| `write_shader` | Write content to a .gdshader. |
| `validate_shader` | Validate .gdshader for syntax issues (shader_type, braces, declarations). |
| `compile_shader` | Compile (reimport) a .gdshader via Godot editor or local validation. |
| `list_visual_shaders` | List VisualShader graph files. |
| `read_visual_shader` | Read a VisualShader graph. |
| `read_shader_include` | Read a .gdshaderinc file. |
| `create_shader_include` | Create a .gdshaderinc file. |
| `list_shader_includes` | List all .gdshaderinc files. |

</details>

<details>
<summary><b>🎯 Domain</b> (11 tools) — Curve, Gradient, Path, Skeleton, ReflectionProbe, MultiMesh, NoiseTexture</summary>

| Tool | Description |
|---|---|
| `read_curve` | Read a Curve resource. |
| `create_curve` | Create a Curve .tres resource. |
| `read_gradient` | Read a Gradient resource. |
| `create_gradient` | Create a Gradient .tres resource. |
| `list_paths` | List Path2D/Path3D nodes across scenes. |
| `read_path` | Read a Path2D/Path3D node with curve points. |
| `list_skeletons` | List Skeleton3D nodes. |
| `read_skeleton` | Read Skeleton3D bone hierarchy. |
| `read_reflection_probe` | Read ReflectionProbe settings. |
| `read_multi_mesh` | Read MultiMeshInstance settings. |
| `create_noise_texture` | Create a NoiseTexture2D/3D .tres. |

</details>

<details>
<summary><b>🎞️ Animation</b> (10 tools) — AnimationPlayer/AnimationTree full pipeline</summary>

| Tool | Description |
|---|---|
| `list_animations` | List AnimationPlayers and animations. |
| `read_animation` | Read animation tracks and keyframes. |
| `create_animation` | Create Animation .tres resource. |
| `set_animation_param` | Set animation parameter. |
| `add_animation_library` | Add animation library to player. |
| `add_animation_track` | Add track to animation. |
| `set_keyframe` | Set keyframe on track. |
| `remove_animation_track` | Remove track from animation. |
| `read_animation_tree` | Read AnimationTree with state machine. |
| `set_animation_tree_param` | Set AnimationTree parameter. |

</details>

<details>
<summary><b>⚙️ Godot Engine</b> (9 tools) — Engine detection, launch, run, export, screenshot</summary>

| Tool | Description |
|---|---|
| `get_godot_version` | Detect installed Godot version. |
| `launch_editor` | Launch Godot editor with project. |
| `run_project` | Run the Godot project. |
| `stop_project` | Stop all running Godot processes. |
| `export_project` | Export project via Godot CLI preset. |
| `capture_screenshot` | Capture screenshot of running game. |
| `monitor_output` | Read Godot process output. |
| `is_editor_running` | Check if Godot editor is running. |
| `list_projects` | Scan directory for Godot projects. |

</details>

<details>
<summary><b>🎨 Coverage</b> (18 tools) — Mesh primitives, 2D lights, VehicleBody, SpringArm, Decal & more</summary>

| Tool | Description |
|---|---|
| `create_mesh_primitive` | Create 3D mesh resource: Box, Capsule, Cylinder, Plane, Sphere, Torus, etc. (11 types). |
| `read_light_2d` | List PointLight2D/DirectionalLight2D nodes with energy and shadow settings. |
| `set_light_2d_param` | Set a parameter on a 2D light node. |
| `create_vehicle_body` | Create a VehicleBody3D with VehicleWheel nodes for car physics. |
| `read_vehicle_body` | List VehicleBody3D nodes with wheel counts. |
| `create_spring_arm` | Create a SpringArm3D for smooth camera follow. |
| `read_spring_arm` | List SpringArm3D nodes with spring length and collision settings. |
| `read_decal` | List Decal nodes with size and texture info. |
| `read_occluder` | List OccluderInstance3D and OcclusionPolygon2D nodes. |
| `read_marker` | List Marker2D/Marker3D position markers across scenes. |
| `read_audio_stream` | Read audio file info: format, size, loop, bitrate from .import config. |
| `read_audio_listener` | List AudioListener2D/3D nodes for spatial audio positioning. |
| `create_camera_attributes` | Create CameraAttributes (Practical or Physical) for 3D camera DOF and auto-exposure. |
| `create_sprite_frames` | Create a SpriteFrames .tres resource with named animations. |
| `read_sprite_frames` | List AnimatedSprite nodes and their SpriteFrames resources. |
| `read_soft_body` | List SoftBody3D nodes with mass and stiffness. |
| `read_grid_map` | List GridMap nodes with cell size and mesh library references. |
| `create_grid_map` | Create a GridMap node for 3D tile-based level design. |

</details>

<details>
<summary><b>🔲 Nodes</b> (8 tools) — CharacterBody, AnimatedSprite, Audio, Video, Parallax, RichText, Container, Tab</summary>

| Tool | Description |
|---|---|
| `read_character_body` | Read CharacterBody2D/3D properties. |
| `read_animated_sprite` | Read AnimatedSprite2D/3D with animation and frame data. |
| `read_audio_player` | Read AudioStreamPlayer2D/3D with stream and playback settings. |
| `read_video_player` | Read VideoStreamPlayer with video stream and playback settings. |
| `read_parallax` | Read ParallaxBackground/Parallax2D with layer configuration. |
| `read_rich_text` | Read RichTextLabel with BBCode content. |
| `read_container` | Read Container-derived nodes with child layout info. |
| `read_tab_container` | Read TabContainer with tab names and counts. |

</details>

<details>
<summary><b>📦 Resource</b> (8 tools) — .tres CRUD, PBR materials, themes, templates</summary>

| Tool | Description |
|---|---|
| `read_resource` | Read a .tres resource file. |
| `list_resources` | List all resource files. |
| `create_resource` | Create a resource from template. |
| `write_resource` | Write properties to a resource. |
| `list_materials` | List materials grouped by type. |
| `read_material` | Read material with PBR formatting. |
| `set_material_param` | Set a single material parameter. |
| `read_theme` | Read Theme resource with type-aware grouping. |

</details>

<details>
<summary><b>🔊 Audio</b> (7 tools) — Audio bus layout CRUD, effects, volume</summary>

| Tool | Description |
|---|---|
| `read_audio_bus_layout` | Read AudioBusLayout. |
| `list_audio_files` | List audio files by format. |
| `create_audio_bus_layout` | Create AudioBusLayout. |
| `add_audio_bus` | Add audio bus to layout. |
| `remove_audio_bus` | Remove audio bus. |
| `add_bus_effect` | Add effect to audio bus. |
| `set_bus_volume` | Set bus volume in dB. |

</details>

<details>
<summary><b>🧩 Shader Graph</b> (8 tools) — VisualShader graph node add/remove/connect, param editing</summary>

| Tool | Description |
|---|---|
| `create_visual_shader` | Create a new VisualShader .tres graph file. |
| `add_shader_graph_node` | Add a node to a VisualShader graph. 40+ node types available (constants, math, textures, effects). |
| `remove_shader_graph_node` | Remove a node from a VisualShader graph by index. |
| `connect_shader_graph_nodes` | Connect two node ports in a VisualShader graph. |
| `disconnect_shader_graph_nodes` | Disconnect two node ports in a VisualShader graph. |
| `set_shader_node_param` | Set a parameter on a VisualShader node (constant, expression, operator, etc.). |
| `list_shader_node_types` | List all VisualShader node types organized by category with input/output counts. |
| `get_shader_node_defaults` | Get default ports and parameters for a specific VisualShader node type. |

</details>

<details>
<summary><b>🛠️ Utility</b> (6 tools) — Signals list, StyleBox, AtlasTexture, Popup, project icon, cohesion report</summary>

| Tool | Description |
|---|---|
| `list_all_signals` | List all built-in signals across Godot classes. |
| `read_project_icon` | Read the project icon file. |
| `read_stylebox` | Read StyleBox resources in themes and scenes. |
| `create_atlas_texture` | Create an AtlasTexture .tres from a sprite sheet. |
| `list_popups` | List Popup/PopupMenu/AcceptDialog nodes across scenes. |
| `generate_cohesion_report` | Generate project code cohesion and coupling report. |

</details>

<details>
<summary><b>🖼️ Rendering</b> (5 tools) — MeshInstance, Viewport, Area, RayCast/ShapeCast</summary>

| Tool | Description |
|---|---|
| `read_mesh_instance` | Read MeshInstance3D with mesh and material slots. |
| `set_mesh_surface_material` | Set material on a mesh surface slot. |
| `read_viewport` | Read Viewport node configuration. |
| `read_area` | Read Area2D/Area3D with collision and overlap settings. |
| `read_raycast` | Read RayCast2D/3D or ShapeCast2D/3D configuration. |

</details>

<details>
<summary><b>🌍 Environment</b> (4 tools) — Environment .tres read/write + presets</summary>

| Tool | Description |
|---|---|
| `read_environment` | Read Environment resource. |
| `list_environments` | List Environment resources. |
| `create_environment` | Create Environment from preset. |
| `set_environment_param` | Set environment parameter. |

</details>

<details>
<summary><b>🔍 Inspector</b> (5 tools) — Camera, Light, Particle node inspection and editing</summary>

| Tool | Description |
|---|---|
| `list_cameras` | List Camera nodes. |
| `read_camera` | Read camera configuration. |
| `list_lights` | List light nodes. |
| `set_light_param` | Set light parameter. |
| `read_particles` | List particle systems. |

</details>

<details>
<summary><b>⚡ Physics</b> (4 tools) — PhysicsMaterial CRUD, collision layer names</summary>

| Tool | Description |
|---|---|
| `list_physics_materials` | List PhysicsMaterials. |
| `read_physics_material` | Read PhysicsMaterial. |
| `create_physics_material` | Create PhysicsMaterial. |
| `read_collision_layers` | Read collision layer names. |

</details>

<details>
<summary><b>📥 Import</b> (3 tools) — .import file read/write and listing</summary>

| Tool | Description |
|---|---|
| `read_import_config` | Read .import file config. |
| `list_import_files` | List .import files grouped by type. |
| `write_import_config` | Write import settings. |

</details>

<details>
<summary><b>🗺️ TileMap</b> (3 tools) — TileSet resource parsing, TileMapLayer inspection</summary>

| Tool | Description |
|---|---|
| `list_tilesets` | List TileSet resources. |
| `read_tileset` | Read TileSet resource. |
| `read_tilemap` | Read TileMapLayer in scene. |

</details>

<details>
<summary><b>🧭 Navigation</b> (3 tools) — NavigationRegion inspection + NavigationMesh creation</summary>

| Tool | Description |
|---|---|
| `list_nav_regions` | List NavigationRegion nodes. |
| `read_nav_region` | Read navigation region. |
| `create_nav_mesh` | Create NavigationMesh .tres. |

</details>

<details>
<summary><b>🌐 Translation</b> (3 tools) — CSV/PO translation file read/write</summary>

| Tool | Description |
|---|---|
| `list_translations` | List translation files. |
| `read_translation` | Read translation file. |
| `create_translation` | Create translation CSV. |

</details>

<details>
<summary><b>🔗 Joints</b> (3 tools) — Physics joint creation, params, listing</summary>

| Tool | Description |
|---|---|
| `create_joint` | Create a physics joint (PinJoint, HingeJoint, SliderJoint, etc.). |
| `set_joint_param` | Set a parameter on a physics joint. |
| `list_joints` | List all physics joints in a scene. |

</details>

<details>
<summary><b>🆔 UID</b> (3 tools) — File UID query, batch update, missing UID detection</summary>

| Tool | Description |
|---|---|
| `get_uid` | Get UID for a file. |
| `update_project_uids` | Scan for missing UIDs. |
| `list_missing_uids` | List files missing UIDs. |

</details>

<details>
<summary><b>📐 2D Geometry</b> (2 tools) — CollisionPolygon2D, CollisionShape2D shape config</summary>

| Tool | Description |
|---|---|
| `create_collision_polygon` | Create a CollisionPolygon2D with vertex points. |
| `set_shape_points` | Set the shape points on a CollisionShape2D. |

</details>

<details>
<summary><b>🔄 Diff</b> (2 tools) — Scene and resource comparison</summary>

| Tool | Description |
|---|---|
| `diff_scene` | Compare two scene files. |
| `diff_resource` | Compare two resource files. |

</details>

<details>
<summary><b>📋 Other</b> (8 tools) — GDExtension, C#, World3D, GridMap, Texture & more</summary>

| Tool | Description |
|---|---|
| `read_gdextension` | Read .gdextension config. |
| `list_csproj` | List C# project files. |
| `create_world` | Create World3D .tres. |
| `read_texture_info` | Read texture asset info. |

</details>

---

## Installation

### npx (recommended, no pre-install)

```bash
npx -y @yanhuifair/godot-mcp -p /path/to/your/godot/project
```

### Global Install

```bash
npm install -g @yanhuifair/godot-mcp
```

### From Source

```bash
git clone https://github.com/yanhuifair/Godot-MCP.git
cd godot-mcp
npm install
npm run build
```

### Environment Variables

| Variable | Description |
|---|---|
| `GODOT_PATH` | Path to Godot binary (optional, auto-detected) |

Godot auto-detection: `GODOT_PATH` → `/Applications/Godot.app` → `PATH` → snap/flatpak

---

## AI Client Configuration

### VS Code / GitHub Copilot

#### Method 1: VSIX Extension (recommended)

```bash
npm run vsix
# → godot-mcp-1.3.0.vsix

code --install-extension godot-mcp-1.3.0.vsix
```

After installation, the MCP server auto-registers. Copilot / Cline / Roo Code discover it automatically — **no manual config required**. Skip to [Verify Setup](#verify-setup).

#### Method 2: Project-level config

Create `.vscode/mcp.json` in your Godot project root:

```json
{
  "mcpServers": {
    "godot-mcp": {
      "type": "stdio",
      "command": "npx",
      "args": ["-y", "@yanhuifair/godot-mcp", "-p", "."]
    }
  }
}
```

> If you installed globally (`npm install -g`), use `"command": "godot-mcp"` and omit `-y @yanhuifair/godot-mcp` from args:
>
> ```json
> {
>   "mcpServers": {
>     "godot-mcp": {
>       "type": "stdio",
>       "command": "godot-mcp",
>       "args": ["-p", "."]
>     }
>   }
> }
> ```

> 💡 **Tip**: Commit `.vscode/mcp.json` to your repo so every team member gets the MCP server automatically.

#### SSE (Server-Sent Events) — HTTP transport

For remote or web-based MCP clients that use SSE:

1. Start the server in SSE mode:
   ```bash
   npx @yanhuifair/godot-mcp -t sse --port 3000 -p .
   ```

2. Configure your MCP client:
   ```json
   {
     "mcpServers": {
       "godot-mcp": {
         "url": "http://127.0.0.1:3000/sse"
       }
     }
   }
   ```

#### Streamable HTTP — MCP 2025 transport

For modern MCP clients supporting the Streamable HTTP spec:

1. Start the server in Streamable HTTP mode:
   ```bash
   npx @yanhuifair/godot-mcp -t streamable-http --port 3000 -p .
   ```

2. Configure your MCP client:
   ```json
   {
     "mcpServers": {
       "godot-mcp": {
         "url": "http://127.0.0.1:3000/mcp",
         "transportType": "streamable-http"
       }
     }
   }
   ```

#### All transports simultaneously

Run all three transports at once (stdio + SSE + Streamable HTTP):

```bash
npx @yanhuifair/godot-mcp -t all --port 3000 -p .
```

#### Verify Setup

1. Open your Godot project folder in VS Code
2. Open Copilot Chat (`⇧⌘I` / `Ctrl+Shift+I`)
3. Look for the 🔌 MCP tools indicator in the chat input
4. Send a test message:

> "List all scenes in the project"

If the server responds with your project's scenes, it's working.

#### Enable Editor Plugin (live control)

For real-time editor control — select nodes, play/stop, undo/redo, set breakpoints — install the plugin (one-time setup):

```bash
npx @yanhuifair/godot-mcp --install-addons -p .
```

Then enable in Godot Editor: **Project → Project Settings → Plugins → Godot MCP → Enable**. Confirm in the **Output** panel:

```
[Godot MCP] Plugin v1.3.0 loaded — ready on stdin/stdout
```

> 💡 After enabling once, close Godot. MCP spawns it automatically when you use editor commands.

Now try:

> "Run the game at 1280x720"
> "Select the Player node and show its properties"

#### Troubleshooting

| Problem | Solution |
|---|---|
| Server not starting | Ensure Node.js ≥18: `node -v` |
| "Command not found" | Use `npx` method or `npm install -g @yanhuifair/godot-mcp` |
| Plugin not showing in Godot | Click **Restart** in the Plugins tab, or reopen the project |
| Editor process won't start | Ensure Godot is installed and in PATH, or set `GODOT_PATH` |
| Tools not appearing in chat | Reload VS Code: `Cmd+Shift+P` → `Developer: Reload Window` |

### Cursor

`~/.cursor/mcp.json`:

```json
{
  "mcpServers": {
    "godot-mcp": {
      "type": "stdio",
      "command": "npx",
      "args": ["-y", "@yanhuifair/godot-mcp", "-p", "/path/to/your/godot/project"]
    }
  }
}
```

Or with a global install:

```json
{
  "mcpServers": {
    "godot-mcp": {
      "type": "stdio",
      "command": "godot-mcp",
      "args": ["-p", "/path/to/your/godot/project"]
    }
  }
}
```

### Claude Desktop

`~/Library/Application Support/Claude/claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "godot-mcp": {
      "type": "stdio",
      "command": "npx",
      "args": ["-y", "@yanhuifair/godot-mcp", "-p", "/path/to/your/godot/project"]
    }
  }
}
```

### Windsurf

`~/.codeium/windsurf/mcp_config.json`:

```json
{
  "mcpServers": {
    "godot-mcp": {
      "type": "stdio",
      "command": "npx",
      "args": ["-y", "@yanhuifair/godot-mcp", "-p", "/path/to/your/godot/project"]
    }
  }
}
```

### Local Development

```json
{
  "mcpServers": {
    "godot-mcp": {
      "type": "stdio",
      "command": "node",
      "args": ["/path/to/godot-mcp/dist/index.js", "-p", "/path/to/your/godot/project"]
    }
  }
}
```

---

## Usage Examples

### Browse Project

```
"Show me the project structure"
→ list_project_files → full file tree

"Generate a project overview report"
→ generate_project_report → scenes/scripts/shaders/resources stats

"Check project health"
→ validate_project → broken refs, missing UIDs
```

### Create Resources

```
"Create a 2D platformer scene"
→ create_scene → scenes/main.tscn

"Create a metallic material"
→ create_resource → materials/metal.tres
→ set_material_param → metallic=0.9, roughness=0.3
```

### Search & Locate

```
"Find all Timer nodes"
→ find_nodes_in_scenes → cross-scene search with paths

"Search for _ready functions"
→ search_in_scripts → matches with function context

"List all UI buttons in the project"
→ list_ui_nodes → anchors, positions, text
```

### Run & Debug

```
"Run the game at 1280x720 and take a screenshot"
→ run_project → launches game
→ capture_screenshot → gameplay.png

"Capture the game window with a custom name"
→ capture_screenshot output_path="gameplay.png" window_title="My Game" delay=2

"Stop the running game"
→ stop_project → terminates all Godot processes
```

### Script Operations

```
"Analyze player.gd structure"
→ read_script_structure → class name, signals, exports, functions

"Add a dash method to Player"
→ add_script_function → safe method injection

"Validate all scripts"
→ validate_script → per-file syntax/logic check
```

### Shader Validation & Compilation

```
"Validate hurricane.gdshader for syntax errors"
→ validate_shader → shader_type, braces, declarations check

"Compile the hurricane shader"
→ compile_shader → triggers Godot's shader compiler via editor plugin
```

### Animation Editing

```
"Show player animations"
→ read_animation → track list + keyframes

"Add a position track to idle animation"
→ add_animation_track → track_path=".:position"

"Set a keyframe at 0.5s"
→ set_keyframe → time=0.5, value="Vector2(100,0)"
```

### Audio Setup

```
"Show audio bus layout"
→ read_audio_bus_layout → bus hierarchy, volumes, effects

"Add reverb to Master"
→ add_bus_effect → effect_type="Reverb"

"Set SFX bus volume"
→ set_bus_volume → bus_index=2, volume_db=-6.0
```

### Scene Editing

```
"Add a Timer under Player"
→ add_node → type=Timer, name=Cooldown

"Clone Enemy node as Enemy2"
→ clone_node → clone_source="Main/Enemy", name="Enemy2"

"Connect body_entered signal"
→ connect_signal → from_node="Player", signal="body_entered", method="_on_body_entered"
```

---

## Editor Plugin

The editor plugin enables **real-time editor control** — select nodes, play/stop, undo/redo, save, breakpoints, debugging, and more. MCP spawns Godot as a child process when editor tools are invoked, communicating via stdin/stdout.

> **How it works**: When you say "Run the game", the MCP server spawns `godot --editor --path <project>`, the plugin reads commands from stdin, executes them, and writes results to stdout. The Godot window opens automatically — no manual steps.

### Install the Plugin

**Option 1: CLI one-liner (recommended)**

```bash
godot-mcp --install-addons -p /path/to/your/godot/project
```

**Option 2: Manual copy**

```bash
cp -r addons/godot_mcp /path/to/your/godot/project/addons/
```

Then enable in Godot: **Project → Project Settings → Plugins → Godot MCP → Enable**

If not visible, click **Restart** or reopen the project.

Confirm in the **Output** panel:

```
[Godot MCP] Plugin v1.3.0 loaded — ready on stdin/stdout
```

> 💡 After enabling the plugin once, you can close Godot. MCP will launch it automatically when needed.

### Editor Tools (78 tools)

**View & Selection:**
`editor_get_selection` `editor_set_selection` `editor_get_open_scene` `editor_read_current_scene` `editor_get_info` `editor_get_rect` `editor_focus` `editor_show_in_filesystem` `editor_open_dock`

**Playback Control:**
`editor_play` `editor_stop` `editor_run_specific_scene` `editor_get_running_scene_tree` `editor_get_performance_monitors`

**Edit Operations:**
`editor_undo` `editor_redo` `editor_save` `editor_save_all` `editor_reload_scene` `editor_delete_selected`

**Scene Operations:**
`editor_create_scene` `editor_instantiate_scene` `editor_set_main_scene` `editor_get_scene_changes`

**Node Operations:**
`editor_add_node` `editor_remove_node` `editor_duplicate_node` `editor_rename_node` `editor_reparent_node` `editor_move_node` `editor_get_node_properties` `editor_set_node_properties`

**Scripting:**
`editor_create_script` `editor_attach_script` `editor_run_gdscript` `editor_evaluate_expression`

**Debugging:**
`editor_set_breakpoint` `editor_remove_breakpoint` `editor_get_breakpoints` `editor_debug_continue` `editor_debug_step` `editor_debug_step_over` `editor_debug_break` `editor_get_stack_trace` `editor_get_debug_variables`

**Signals:**
`editor_connect_signal` `editor_disconnect_signal` `editor_list_node_signals`

**File System:**
`editor_open_asset` `editor_list_filesystem` `editor_create_folder` `editor_delete_asset` `editor_rename_asset` `editor_move_asset` `editor_duplicate_asset` `editor_reimport_asset` `editor_get_dependency_list`

**Project Settings:**
`editor_get_project_setting` `editor_set_project_setting` `editor_get_editor_setting` `editor_set_editor_setting` `editor_get_project_directory`

**Input & Autoloads:**
`editor_get_input_map` `editor_add_input_action` `editor_remove_input_action` `editor_get_autoload_list` `editor_add_autoload` `editor_remove_autoload`

**Assets:**
`editor_bake_lightmaps` `editor_bake_navigation` `editor_take_screenshot`

**Class Documentation:**
`editor_get_class_list` `editor_get_method_list` `editor_get_class_property_list` `editor_get_class_signal_list` `editor_get_class_doc` `editor_search_help`

**Camera & Viewport:**
`editor_get_editor_camera` `editor_set_editor_camera` `editor_toggle_grid` `editor_toggle_snap`

**Other:**
`editor_get_recent_scenes` `editor_simulate_key` `editor_get_plugin_list` `editor_enable_plugin` `editor_disable_plugin` `editor_get_error_list` `editor_clear_errors` `editor_health_check`

---

## Architecture

```
┌─────────────────────┐
│   AI Client          │
│ (Cursor/Claude/Copilot)│
└────────┬────────────┘
         │ MCP (stdio)
┌────────▼──────────────┐      stdin/stdout     ┌──────────────────┐
│   Godot MCP Server      │ ◄───────────────────► │  Godot Editor     │
│   (TypeScript, 281 tools)│  (spawns as child)  │  (GDScript addon) │
│                        │                       │                  │
│  ┌──────────────────┐  │                       │  78 editor cmds   │
│  │  Tool Handlers    │  │                       │  JSON-RPC/stdio  │
│  └──────────────────┘  │                       └──────────────────┘
│  ┌──────────────────┐  │
│  │  File Parsers     │  │  .tscn / .tres / .gd / .gdshader / .import / .csv
│  └──────────────────┘  │
│  ┌──────────────────┐  │
│  │  Godot CLI        │  │  Launch, run, export, screenshot
│  └──────────────────┘  │
└────────────────────────┘
```

### Project Structure

```
godot-mcp/
├── src/
│   ├── index.ts              # CLI entry point
│   ├── server.ts             # MCP server core
│   ├── tools/                # 33 handler files
│   │   ├── register.ts       # Centralized registration (281 tools)
│   │   ├── project.ts        # Project tools
│   │   ├── scene.ts          # Scene tools
│   │   ├── script.ts         # Script + shader tools
│   │   ├── editor.ts         # Live editor tools
│   │   ├── resource.ts       # Resource/material/theme
│   │   ├── godot.ts          # Engine control
│   │   ├── animation.ts      # Animation pipeline
│   │   ├── audio.ts          # Audio bus
│   │   ├── environment.ts    # Environment resources
│   │   ├── physics.ts        # Physics materials
│   │   ├── import.ts         # Import config
│   │   ├── inspector.ts      # Node inspectors
│   │   ├── shader_graph.ts   # VisualShader graph
│   │   ├── tileset.ts        # TileMap/TileSet
│   │   ├── navigation.ts     # Navigation mesh
│   │   ├── translation.ts    # Translation files
│   │   ├── diff.ts           # File comparison
│   │   ├── texture.ts        # Texture info
│   │   ├── extension.ts      # GDExtension/C#
│   │   ├── uid.ts            # File UIDs
│   │   ├── joint.ts          # Physics joints
│   │   ├── geometry.ts       # 2D geometry shapes
│   │   ├── rendering.ts      # Mesh/Viewport/RayCast
│   │   ├── domain.ts         # Curve/Gradient/Skeleton/Path
│   │   ├── nodes.ts          # Node-specific inspectors
│   │   ├── utility.ts        # Utilities
│   │   └── coverage.ts       # Mesh/2D lights/vehicles etc.
│   ├── parsers/
│   │   ├── scene_parser.ts   # .tscn parser
│   │   ├── resource_parser.ts # .tres parser
│   │   ├── config_parser.ts  # project.godot parser
│   │   └── parser_helpers.ts # Shared parsing utilities
│   └── utils/
│       ├── types.ts          # Type definitions
│       ├── file_utils.ts     # File system operations
│       ├── godot_cli.ts      # Godot CLI interface
│       ├── registry.ts       # Tool registry
│       ├── errors.ts         # Error codes
│       └── cache.ts          # File cache
├── addons/
│   └── godot_mcp/            # Godot editor plugin
│       ├── plugin.cfg         # Plugin metadata
│       └── plugin.gd          # stdin reader + command handlers
├── dist/                     # Compiled output
├── test/                     # Test suite
├── package.json
└── README.md
```

---

## Supported Formats

| Format | Extension | Support |
|---|---|---|
| Scene | `.tscn` | ✅ Read, write, create, edit (7 operations) |
| Script | `.gd` | ✅ Read, write, create, validate, analyze |
| Script | `.cs` | ✅ Read, write, create |
| Shader | `.gdshader` | ✅ Read, write, create |
| Shader Include | `.gdshaderinc` | ✅ Read, write, create |
| VisualShader | `.tres` | ✅ Read, list, graph editing |
| Resource | `.tres` | ✅ Read, write, create (14 templates) |
| Resource | `.res` | ❌ Not supported (binary) |
| Config | `project.godot` | ✅ Read, write |
| Config | `export_presets.cfg` | ✅ Read |
| Import | `.import` | ✅ Read, write |
| Environment | `.tres` | ✅ Read, write, create (4 presets) |
| Animation | `.tres` / `.tscn` | ✅ Read, create, modify params |
| AudioBus | `.tres` | ✅ Read, write, create |
| PhysicsMaterial | `.tres` | ✅ Read, write, create |
| TileSet | `.tres` | ✅ Read, list |
| Translation | `.csv` / `.po` | ✅ Read, create |

---

## Development

```bash
npm install              # Install dependencies
npm run build            # Build TypeScript → dist/
npm run dev              # Dev mode (tsx hot reload)
npm test                 # Run 138 tests
npm run test:watch       # Watch mode
```

### CLI Options

| Flag | Description |
|---|---|
| `-p, --project-path` | Path to Godot project root |
| `-g, --godot-path` | Path to Godot binary (optional) |
| `--install-addons` | Copy addons/godot_mcp to target Godot project |
| `-h, --help` | Show help |

### Tech Stack

- **Runtime**: Node.js ≥18
- **Language**: TypeScript 5.5
- **MCP SDK**: @modelcontextprotocol/sdk ^1.29
- **Schema**: Zod ^3.24
- **Test**: Vitest ^2.0
- **Transport**: stdio

---

## Build VSIX

```bash
npm run vsix
# → godot-mcp-1.3.0.vsix
```

See [VS Code Setup](#vs-code--github-copilot) for installation and usage.

---

## Limitations

- Binary `.res` files not supported — use `.tres` (text format)
- Godot CLI tools require the Godot Engine binary
- Screenshots depend on OS-native tools
- `edit_scene` uses AST manipulation on `.tscn`; complex refactors may need manual verification

---

## License

MIT
