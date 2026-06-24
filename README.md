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

> 🔍 Click each category to expand and see all tool names. For detailed usage examples, see [Usage Examples](#usage-examples). Editor tools are also listed with descriptions in [Editor Tools](#editor-tools-78-tools).

<details>
<summary><b>🎬 Editor</b> (89 tools) — Live editor control</summary>

`editor_get_selection` `editor_set_selection` `editor_get_open_scene` `editor_read_current_scene` `editor_get_info` `editor_get_rect` `editor_focus` `editor_show_in_filesystem` `editor_open_dock` `editor_play` `editor_stop` `editor_run_specific_scene` `editor_get_running_scene_tree` `editor_get_performance_monitors` `editor_undo` `editor_redo` `editor_save` `editor_save_all` `editor_reload_scene` `editor_delete_selected` `editor_create_scene` `editor_instantiate_scene` `editor_set_main_scene` `editor_get_scene_changes` `editor_add_node` `editor_remove_node` `editor_duplicate_node` `editor_rename_node` `editor_reparent_node` `editor_move_node` `editor_get_node_properties` `editor_set_node_properties` `editor_create_script` `editor_attach_script` `editor_run_gdscript` `editor_evaluate_expression` `editor_set_breakpoint` `editor_remove_breakpoint` `editor_get_breakpoints` `editor_debug_continue` `editor_debug_step` `editor_debug_step_over` `editor_debug_break` `editor_get_stack_trace` `editor_get_debug_variables` `editor_connect_signal` `editor_disconnect_signal` `editor_list_node_signals` `editor_open_asset` `editor_list_filesystem` `editor_create_folder` `editor_delete_asset` `editor_rename_asset` `editor_move_asset` `editor_duplicate_asset` `editor_reimport_asset` `editor_get_dependency_list` `editor_get_project_setting` `editor_set_project_setting` `editor_get_editor_setting` `editor_set_editor_setting` `editor_get_project_directory` `editor_get_input_map` `editor_add_input_action` `editor_remove_input_action` `editor_get_autoload_list` `editor_add_autoload` `editor_remove_autoload` `editor_bake_lightmaps` `editor_bake_navigation` `editor_take_screenshot` `editor_get_class_list` `editor_get_method_list` `editor_get_class_property_list` `editor_get_class_signal_list` `editor_get_class_doc` `editor_search_help` `editor_get_editor_camera` `editor_set_editor_camera` `editor_toggle_grid` `editor_toggle_snap` `editor_get_recent_scenes` `editor_simulate_key` `editor_get_plugin_list` `editor_enable_plugin` `editor_disable_plugin` `editor_get_error_list` `editor_clear_errors` `editor_health_check`

</details>

<details>
<summary><b>🏗️ Scene</b> (22 tools) — Full scene CRUD + nodes + signals + transforms</summary>

`read_scene` `create_scene` `edit_scene` `list_scenes` `search_scene_content` `scene_dependency_graph` `add_node` `remove_node` `modify_node` `clone_node` `rename_node` `attach_script` `connect_signal` `disconnect_signal` `set_node_position` `set_node_rotation` `set_node_scale` `transform_node` `set_collision_shape` `load_sprite` `list_ui_nodes` `find_nodes_in_scenes`

</details>

<details>
<summary><b>📁 Project</b> (22 tools) — Config, input map, file ops, autoloads, validation</summary>

`list_project_files` `read_project_config` `write_project_config` `read_export_presets` `read_input_map` `write_input_action` `remove_input_action` `add_input_binding` `list_autoloads` `add_autoload` `remove_autoload` `search_in_project` `delete_file` `move_file` `create_directory` `duplicate_scene` `duplicate_resource` `generate_project_report` `find_unused_assets` `validate_project` `list_groups`

</details>

<details>
<summary><b>📝 Script</b> (21 tools) — GDScript/Shader CRUD + analysis + injection + validation</summary>

`read_script` `write_script` `create_script` `list_scripts` `read_script_structure` `search_in_scripts` `validate_script` `add_script_function` `add_script_signal` `add_script_export` `read_shader` `create_shader` `list_shaders` `write_shader` `validate_shader` `compile_shader` `list_visual_shaders` `read_visual_shader` `read_shader_include` `create_shader_include` `list_shader_includes`

</details>

<details>
<summary><b>🎯 Domain</b> (11 tools) — Curve, Gradient, Path, Skeleton, ReflectionProbe, MultiMesh, NoiseTexture</summary>

`read_curve` `create_curve` `read_gradient` `create_gradient` `list_paths` `read_path` `list_skeletons` `read_skeleton` `read_reflection_probe` `read_multi_mesh` `create_noise_texture`

</details>

<details>
<summary><b>🎞️ Animation</b> (10 tools) — AnimationPlayer/AnimationTree full pipeline</summary>

`list_animations` `read_animation` `create_animation` `set_animation_param` `add_animation_library` `add_animation_track` `set_keyframe` `remove_animation_track` `read_animation_tree` `set_animation_tree_param`

</details>

<details>
<summary><b>⚙️ Godot Engine</b> (9 tools) — Engine detection, launch, run, export, screenshot</summary>

`get_godot_version` `launch_editor` `run_project` `stop_project` `export_project` `capture_screenshot` `monitor_output` `is_editor_running` `list_projects`

</details>

<details>
<summary><b>🎨 Coverage</b> (18 tools) — Mesh primitives, 2D lights, VehicleBody, SpringArm, Decal & more</summary>

`create_mesh_primitive` `read_light_2d` `set_light_2d_param` `create_vehicle_body` `read_vehicle_body` `create_spring_arm` `read_spring_arm` `read_decal` `read_occluder` `read_marker` `read_audio_stream` `read_audio_listener` `create_camera_attributes` `create_sprite_frames` `read_sprite_frames` `read_soft_body` `read_grid_map` `create_grid_map`

</details>

<details>
<summary><b>🔲 Nodes</b> (8 tools) — CharacterBody, AnimatedSprite, Audio, Video, Parallax, RichText, Container, Tab</summary>

`read_character_body` `read_animated_sprite` `read_audio_player` `read_video_player` `read_parallax` `read_rich_text` `read_container` `read_tab_container`

</details>

<details>
<summary><b>📦 Resource</b> (8 tools) — .tres CRUD, PBR materials, themes, templates</summary>

`read_resource` `list_resources` `create_resource` `write_resource` `list_materials` `read_material` `set_material_param` `read_theme`

</details>

<details>
<summary><b>🔊 Audio</b> (7 tools) — Audio bus layout CRUD, effects, volume</summary>

`read_audio_bus_layout` `list_audio_files` `create_audio_bus_layout` `add_audio_bus` `remove_audio_bus` `add_bus_effect` `set_bus_volume`

</details>

<details>
<summary><b>🧩 Shader Graph</b> (8 tools) — VisualShader graph node add/remove/connect, param editing</summary>

`create_visual_shader` `add_shader_graph_node` `remove_shader_graph_node` `connect_shader_graph_nodes` `disconnect_shader_graph_nodes` `set_shader_node_param` `list_shader_node_types` `get_shader_node_defaults`

</details>

<details>
<summary><b>🛠️ Utility</b> (6 tools) — Signals list, StyleBox, AtlasTexture, Popup, project icon, cohesion report</summary>

`list_all_signals` `read_project_icon` `read_stylebox` `create_atlas_texture` `list_popups` `generate_cohesion_report`

</details>

<details>
<summary><b>🖼️ Rendering</b> (5 tools) — MeshInstance, Viewport, Area, RayCast/ShapeCast</summary>

`read_mesh_instance` `set_mesh_surface_material` `read_viewport` `read_area` `read_raycast`

</details>

<details>
<summary><b>🌍 Environment</b> (4 tools) — Environment .tres read/write + presets</summary>

`read_environment` `list_environments` `create_environment` `set_environment_param`

</details>

<details>
<summary><b>🔍 Inspector</b> (5 tools) — Camera, Light, Particle node inspection and editing</summary>

`list_cameras` `read_camera` `list_lights` `set_light_param` `read_particles`

</details>

<details>
<summary><b>⚡ Physics</b> (4 tools) — PhysicsMaterial CRUD, collision layer names</summary>

`list_physics_materials` `read_physics_material` `create_physics_material` `read_collision_layers`

</details>

<details>
<summary><b>📥 Import</b> (3 tools) — .import file read/write and listing</summary>

`read_import_config` `list_import_files` `write_import_config`

</details>

<details>
<summary><b>🗺️ TileMap</b> (3 tools) — TileSet resource parsing, TileMapLayer inspection</summary>

`list_tilesets` `read_tileset` `read_tilemap`

</details>

<details>
<summary><b>🧭 Navigation</b> (3 tools) — NavigationRegion inspection + NavigationMesh creation</summary>

`list_nav_regions` `read_nav_region` `create_nav_mesh`

</details>

<details>
<summary><b>🌐 Translation</b> (3 tools) — CSV/PO translation file read/write</summary>

`list_translations` `read_translation` `create_translation`

</details>

<details>
<summary><b>🔗 Joints</b> (3 tools) — Physics joint creation, params, listing</summary>

`create_joint` `set_joint_param` `list_joints`

</details>

<details>
<summary><b>🆔 UID</b> (3 tools) — File UID query, batch update, missing UID detection</summary>

`get_uid` `update_project_uids` `list_missing_uids`

</details>

<details>
<summary><b>📐 2D Geometry</b> (2 tools) — CollisionPolygon2D, CollisionShape2D shape config</summary>

`create_collision_polygon` `set_shape_points`

</details>

<details>
<summary><b>🔄 Diff</b> (2 tools) — Scene and resource comparison</summary>

`diff_scene` `diff_resource`

</details>

<details>
<summary><b>📋 Other</b> (8 tools) — GDExtension, C#, World3D, GridMap, Texture & more</summary>

`read_gdextension` `list_csproj` `create_world` `read_texture_info`

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
`editor_play` `editor_stop` `editor_run_specific_scene` `editor_get_running_scene_tree` `editor_get_performance`

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
`editor_open_asset` `editor_list_filesystem` `editor_create_folder` `editor_delete_asset` `editor_rename_asset` `editor_move_asset` `editor_duplicate_asset` `editor_reimport_asset` `editor_get_dependencies`

**Project Settings:**
`editor_get_project_setting` `editor_set_project_setting` `editor_get_editor_setting` `editor_set_editor_setting` `editor_get_project_directory`

**Input & Autoloads:**
`editor_get_input_map` `editor_add_input_action` `editor_remove_input_action` `editor_get_autoloads` `editor_add_autoload` `editor_remove_autoload`

**Assets:**
`editor_bake_lightmaps` `editor_bake_navigation` `editor_take_screenshot`

**Class Documentation:**
`editor_get_class_list` `editor_get_method_list` `editor_get_class_properties` `editor_get_class_signals` `editor_get_class_doc` `editor_search_help`

**Camera & Viewport:**
`editor_get_camera` `editor_set_camera` `editor_toggle_grid` `editor_toggle_snap`

**Other:**
`editor_get_recent_scenes` `editor_simulate_key` `editor_get_plugin_list` `editor_enable_plugin` `editor_disable_plugin` `editor_get_errors` `editor_clear_errors` `editor_health_check`

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
