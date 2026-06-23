# Godot MCP

[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
[![Tests](https://img.shields.io/badge/tests-138%20passed-brightgreen)](.)
[![npm](https://img.shields.io/npm/v/@yanhuifair/godot-mcp)](https://www.npmjs.com/package/@yanhuifair/godot-mcp)

[中文文档](README-zh.md)

> **Model Context Protocol server for Godot Engine** — 281 tools, 26 categories, Godot 4.6/4.7 coverage. File-based CRUD + live editor plugin. AI assistants read, inspect, and modify Godot projects through stdio transport.

---

## Table of Contents

- [Quick Start](#quick-start)
- [Feature Overview](#feature-overview)
- [Installation](#installation)
- [AI Client Configuration](#ai-client-configuration)
- [Usage Examples](#usage-examples)
- [Editor Plugin](#editor-plugin)
- [Architecture](#architecture)
- [Supported Formats](#supported-formats)
- [Development](#development)
- [VSIX Packaging](#vsix-packaging)

---

## Quick Start

```bash
# Option 1: npx (no install, available after npm publish)
npx -y @yanhuifair/godot-mcp -p /path/to/your/godot/project

# Option 2: global install
npm install -g @yanhuifair/godot-mcp
godot-mcp -p /path/to/your/godot/project
```

The AI client launches the MCP server automatically — no manual run needed. Just configure and start chatting:

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

### Cursor

`~/.cursor/mcp.json`:

```json
{
  "mcpServers": {
    "godot-mcp": {
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

The optional editor plugin provides **real-time editor control** via TCP on port `9876` — select nodes, play/stop, undo/redo, save, breakpoints, debugging, and more.

### Install the Plugin

1. Copy the plugin to your project:

```bash
cp -r addons/godot_mcp /path/to/your/godot/project/addons/
```

2. Enable in Godot: **Project → Project Settings → Plugins → Godot MCP → Enable**

3. If not visible, click **Restart** or reopen the project

4. Confirm in the **Output** panel:

```
[Godot MCP] TCP server listening on port 9876
```

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
┌────────▼──────────────┐        TCP :9876      ┌──────────────────┐
│   Godot MCP Server     │ ◄───────────────────► │  Godot Editor     │
│   (TypeScript, 279 tools)│   (editor plugin)   │  (GDScript addon) │
│                        │                       │                  │
│  ┌──────────────────┐  │                       │  78 editor cmds   │
│  │  Tool Handlers    │  │                       │  JSON-RPC/TCP    │
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
│   │   ├── register.ts       # Centralized registration (279 tools)
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
│       └── plugin.gd          # TCP server + command handlers
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
| `-h, --help` | Show help |

### Tech Stack

- **Runtime**: Node.js ≥18
- **Language**: TypeScript 5.5
- **MCP SDK**: @modelcontextprotocol/sdk ^1.29
- **Schema**: Zod ^3.24
- **Test**: Vitest ^2.0
- **Transport**: stdio

---

## VSIX Packaging

```bash
npm run vsix
# → godot-mcp-1.0.0.vsix
```

Install in VS Code:

```bash
code --install-extension godot-mcp-1.0.0.vsix
```

After installation, the MCP server auto-registers. Copilot / Cline / Roo Code discover it automatically — no manual `mcp.json` config required.

---

## Limitations

- Binary `.res` files not supported — use `.tres` (text format)
- Godot CLI tools require the Godot Engine binary
- Screenshots depend on OS-native tools
- `edit_scene` uses AST manipulation on `.tscn`; complex refactors may need manual verification

---

## License

MIT
