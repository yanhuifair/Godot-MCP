<div align="center">

# Godot MCP

### The most complete MCP server for Godot Engine — **386 tools** that give your AI assistant real hands inside your game project.

[![License: AGPL-3.0](https://img.shields.io/badge/license-AGPL--3.0-blue.svg)](LICENSE.md)
[![CI](https://github.com/yanhuifair/Godot-MCP/actions/workflows/ci.yml/badge.svg)](https://github.com/yanhuifair/Godot-MCP/actions/workflows/ci.yml)
[![npm](https://img.shields.io/npm/v/@yanhuifair/godot-mcp)](https://www.npmjs.com/package/@yanhuifair/godot-mcp)
[![npm downloads](https://img.shields.io/npm/dm/@yanhuifair/godot-mcp)](https://www.npmjs.com/package/@yanhuifair/godot-mcp)
[![Tools](https://img.shields.io/badge/tools-386-orange)](#all-tools)
[![Node](https://img.shields.io/badge/node-%3E%3D18-green)](.)
[![Godot](https://img.shields.io/badge/godot-4.x-blue)](https://godotengine.org)

[English](README.md) | [中文文档](README-zh.md)

</div>

---

**Godot MCP** is a [Model Context Protocol](https://modelcontextprotocol.io) server that connects any AI assistant — **Claude, Cursor, VS Code Copilot, Windsurf, Cline, Codex, Aider** — directly to **Godot Engine 4.x**. Your AI stops guessing about your project and starts *operating* it.

- 📂 **Reads and writes your project files natively** — `.tscn` scenes, `.tres` resources, GDScript, C#, `.gdshader`, `project.godot`. Custom parsers, no Godot process required, instant response.
- 🎛️ **Drives the live editor** — select nodes, connect signals, author visual shaders, bake lightmaps, set breakpoints, step the debugger, run and stop the game.
- ↩️ **Every scene edit is undoable** — add, remove, rename, move, reparent, duplicate and instantiate all register on Godot's native undo stack. If the AI gets it wrong, **Ctrl+Z** puts it back.
- 🎮 **Reaches inside the running game** — inspect the live scene tree, call methods, inject input, **freeze the game, step it one frame at a time, and screenshot the result.** No other public Godot MCP does this.
- 🔎 **Stays usable at scale** — `search_tools` finds the right tool out of 386, `get_status` tells you exactly what is connected, and every error returns a typed code plus a repair hint.

**386 tools · 30 categories · 18 AI clients · 4 communication paths · one-command setup.**

```bash
npx @yanhuifair/godot-mcp --enable-plugin -p .
```

| Requirement | |
|---|---|
| Godot | 4.x (Godot 3 not supported) |
| Node.js | >= 18 |
| AI Client | Any MCP-compatible client (see [Configuration](#ai-client-configuration)) |

---

## Why Godot MCP

| | **Godot MCP** | Other Godot MCP servers |
|---|---|---|
| **Tool count** | **386** across 30 categories | 16 – 156 |
| **Works without Godot running** | ✅ Native `.tscn` / `.tres` / `.godot` parsers | ⚠️ Usually needs a live editor |
| **Live editor control** | ✅ 140 tools — play, debug, breakpoints, viewport, bake | Partial |
| **Undoable AI edits** | ✅ **Every scene mutation is one Ctrl+Z away** — native `EditorUndoRedoManager` actions | ❌ Edits are permanent |
| **Control the _running game_** | ✅ **11 tools** — live tree, method calls, input injection | ❌ None |
| **Deterministic frame stepping** | ✅ `runtime_freeze` → `runtime_step` → `runtime_screenshot` | ❌ None |
| **Tool discovery for large catalogs** | ✅ `search_tools` + `get_status` | ❌ None |
| **Error messages** | ✅ Typed error code + actionable repair hint | Raw stack traces |
| **Transports** | Stdio · SSE · Streamable HTTP | Usually stdio only |
| **Editor plugin install** | ✅ One command, auto-enabled | Manual copy |
| **Engine introspection** | ✅ Live ClassDB — classes, methods, properties, signals, docs | Rare |

If you have ever wanted to say *"run the game, freeze it at the moment the player lands, and show me the collision state"* — this is the server that can actually do it.

---

## Table of Contents

1. [Why Godot MCP](#why-godot-mcp)
2. [Quick Start](#quick-start)
3. [What You Can Do](#what-you-can-do)
4. [Architecture](#architecture)
5. [Implementation Principles](#implementation-principles)
6. [Transport Modes](#transport-modes)
7. [Installation](#installation)
8. [AI Client Configuration](#ai-client-configuration)
9. [Usage Examples](#usage-examples)
10. [Editor Plugin](#editor-plugin)
11. [Tool Discovery & Live Game Runtime](#tool-discovery--live-game-runtime)
12. [All Tools](#all-tools)
13. [Supported Formats](#supported-formats)
14. [Development](#development)
15. [Build VSIX](#build-vsix)

---

## Quick Start

**Two setup steps, about two minutes.** You do *not* need to install anything globally, and you do *not* need to keep a terminal open — your AI client starts the server for you.

### Before You Begin

| You need | How to check |
|---|---|
| **Godot 4.x** installed | Open Godot → the version shows in the title bar. *(Godot 3 is not supported.)* |
| **Node.js 18 or newer** | Run `node -v` in a terminal. If it says `command not found`, install from [nodejs.org](https://nodejs.org). |
| **An MCP-capable AI client** | VS Code + Copilot, Cursor, Claude Desktop, Windsurf, Cline… see [the full list](#ai-client-configuration). |

### Step 1 — Install the Editor Plugin

Open a terminal, `cd` into your Godot project folder (the one containing `project.godot`), and run:

```bash
npx @yanhuifair/godot-mcp --enable-plugin -p .
```

> The `-p .` means "this folder". You can also pass an absolute path from anywhere:
> `npx @yanhuifair/godot-mcp --enable-plugin -p /Users/me/games/my-game`

> **Always installs the latest version.** `npx` fetches the newest release every time. To force it or pin a specific version:
> `npx @yanhuifair/godot-mcp@latest --enable-plugin -p .` (latest) · `npx @yanhuifair/godot-mcp@1.11.1 --enable-plugin -p .` (pinned)

**What this does:** copies the plugin into `addons/godot-mcp/` and switches it on inside `project.godot`. Nothing to click in Godot.

**How to confirm it worked:** you should now see an `addons/godot-mcp/` folder in your project. If Godot is already open, reload the project (Project → Reload Current Project) so it picks up the plugin.

<details>
<summary>Do I actually need this step?</summary>

Only if you want the **live editor** and **live game** tools (play the scene, read the current selection, set breakpoints, bake lightmaps, freeze the running game…).

Over **220 of the 386 tools** — everything that reads and writes `.tscn`, `.tres`, `.gd`, shaders, project settings, etc. — work **without the plugin and without Godot even being open**. If that's all you need, skip to Step 2.
</details>

### Step 2 — Point Your AI Client at the Server

Create `.vscode/mcp.json` in your project root (this exact file works for **VS Code / GitHub Copilot**):

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

Then **restart your AI client** so it reads the new config.

> Using something else? The config file has a different name and location per client, but the `command` / `args` part is almost always identical. Copy-paste blocks for **Cursor, Claude Desktop, Claude CLI, Windsurf, OpenAI Codex, Cline, Roo Code, Continue, Aider, Cody, Goose, Zed** are in [AI Client Configuration](#ai-client-configuration).

### Step 3 — Verify and Start Chatting

Ask your AI:

```
"Run get_status"
```

You should get back the tool count and whether the editor / runtime bridges are reachable. That means everything is wired up. Now try:

```
"List all scenes in the project"
"Find all CharacterBody2D nodes and tell me their collision layers"
"Run the game and take a screenshot"
```

With 386 tools, the AI can't see them all at once — tell it to **`search_tools`** when it isn't sure what's available (e.g. *"search_tools for animation"*).

<details>
<summary>Something not working?</summary>

| Symptom | Fix |
|---|---|
| Client shows no `godot-mcp` tools | Restart the client. Config files are only read on startup. |
| `npx: command not found` | Node.js isn't installed or isn't on your `PATH`. Run `node -v` to confirm. |
| `Project not found` errors | The `-p` path must point at the folder containing `project.godot`. Using `"."` only works if the client's working directory *is* your project — otherwise use an absolute path. |
| Editor tools fail, file tools work | The plugin isn't installed/enabled. Re-run Step 1, then reload the project in Godot. |
| `EDITOR_NOT_REACHABLE` | Godot isn't running, or the plugin isn't enabled. The server will try to launch Godot itself; if that fails, open the project in Godot manually and check Project → Project Settings → Plugins → **Godot MCP** is enabled. |
| `EDITOR_COMMAND_FAILED` | The editor received the command but refused it — usually a wrong node path, a property that doesn't exist on that node type, or an invalid target. The message carries Godot's own reason. Use `editor_get_scene_tree` / `get_class_properties` to verify before retrying. |
| AI made a scene edit you don't want | Press **Ctrl+Z** in Godot, or call `editor_undo`. Every MCP scene mutation is a native undo action. |
| Godot binary not found | Set the `GODOT_PATH` environment variable to your Godot executable. See [Environment Variables](#environment-variables). |

</details>

---

## What You Can Do

Godot MCP provides comprehensive coverage of the Godot 4.x engine through 386 tools in 30 categories.

### Quick Demo

```bash
# One command to set up everything
npx @yanhuifair/godot-mcp --enable-plugin -p .

# Then ask your AI:
> "Create a 2D platformer scene with a CharacterBody2D player"
> "Add a Timer node, connect its timeout signal, write the handler"
> "Create a metallic PBR material and apply it to all MeshInstance3D nodes"
> "Set up an audio bus with reverb, set SFX volume to -6dB"
> "Set a breakpoint at line 42, run the game, step through the debugger"
```

### Feature Overview

| Category | Tools | Description |
|---|---|---|
| Editor | 140 | Live editor control — select, play, undo, save, breakpoints, file ops, performance |
| Project | 21 | Config, input map, file ops, autoloads, validation, unused assets |
| Scene | 22 | Scene CRUD — nodes, signals, transforms, collision, sprites |
| Script + Shader | 21 | GDScript/Shader CRUD, structure analysis, code injection, validation |
| Domain | 14 | Curve, Gradient, Path, Skeleton, ReflectionProbe, MultiMesh, NoiseTexture |
| Animation | 10 | AnimationPlayer/AnimationTree — tracks, keyframes, parameters |
| Godot Engine | 9 | Engine detection, launch editor, run/export project, screenshot |
| Coverage | 18 | Mesh primitives, 2D lights, vehicles, spring arm, decal, occluder, grid map |
| Node Inspectors | 8 | CharacterBody, AnimatedSprite, Audio, Video, Parallax, RichText, Container, Tab |
| Resource | 8 | .tres CRUD, PBR materials, themes, 14 templates |
| Audio | 7 | Audio bus layout, effects, volume |
| Shader Graph | 8 | VisualShader graph — 40+ node types, connections, parameters |
| Utility | 9 | Signal catalog, StyleBox, AtlasTexture, popup listing, cohesion report |
| Rendering | 5 | MeshInstance, Viewport, Area, RayCast/ShapeCast |
| Environment | 6 | Environment read/write, presets |
| Inspector | 5 | Camera, Light, Particle node inspection |
| Physics | 5 | PhysicsMaterial CRUD, collision layers |
| Import | 3 | .import file read/write |
| TileMap | 5 | TileSet resources, TileMapLayer inspection |
| Navigation | 6 | NavigationRegion, NavigationMesh |
| Translation | 5 | CSV/PO translation files |
| Joints | 5 | Physics joints — create, configure, list |
| UID | 4 | File UID query, batch update, missing UID detection |
| 2D Geometry | 4 | CollisionPolygon2D, shape point editing |
| Diff | 5 | Scene and resource comparison |
| Texture | 4 | Texture import/read/write, atlas, noise |
| Extension/World/C# | 5 | GDExtension, C#, World3D, CSProj |
| Meta / Introspection | 2 | Tool search (search_tools) + system diagnostics (get_status) |
| Logs | 5 | Read game-run logs (`user://logs/godot.log`), list/rotate, clear, locate user-data dir, configure file logging |
| Runtime (game) | 11 | Control the running game — tree, properties, methods, signals, input, freeze/step, screenshot |

**Total: 386 tools across 30 categories**

### Core Capabilities in Detail

**Project Management**
Read and write `project.godot` settings, input maps, autoload singletons, and export presets. Perform file operations (list, search, move, delete with `.bak` backups), validate project health, detect unused assets, and generate comprehensive project reports.

**Scene Editing**
Full CRUD on `.tscn` scene files. Add, delete, modify, clone, and rename nodes. Edit node properties, transforms (position/rotation/scale), collision shapes, and sprite textures. Connect and disconnect signals between nodes. Search nodes across scenes by type, property, group, or signal.

**Scripting & Shaders**
Read, write, and create GDScript, C#, and `.gdshader` files. Analyze script structure (class names, signals, exported variables, functions). Inject functions, signals, and `@export` variables into existing scripts. Validate GDScript for common syntax issues. Validate and compile shaders. Manage VisualShader graphs — add, remove, connect, and configure nodes.

**Resource Management**
Read, write, and create `.tres` resource files with 14 built-in templates (StandardMaterial3D, ShaderMaterial, ORMMaterial3D, CanvasItemMaterial, and more). Inspect and modify PBR material parameters. Read Theme resources with properties grouped by type.

**Animation Pipeline**
Complete AnimationPlayer and AnimationTree support: list animations, read tracks and keyframes, create new animations, add/remove tracks, set keyframes at specific times, configure animation libraries, and inspect AnimationTree state machines.

**Audio Configuration**
Read, create, and modify audio bus layouts. Add and remove audio buses, attach effects (14 types: Reverb, Delay, Chorus, Compressor, and more), and set bus volume in dB.

**Physics & Collision**
Inspect VehicleBody3D, SoftBody3D, and physics materials. Create collision shapes. Read collision layer and mask configuration from project settings. Create physics joints (PinJoint, HingeJoint, SliderJoint, and more).

**Rendering & Environment**
Inspect MeshInstance3D, Viewport, Area, and RayCast nodes. Create and configure Environment resources (4 presets). Manage 2D lights, decals, and occluders. Read 3D mesh primitives (Box, Sphere, Capsule, Cylinder, Torus, and more).

**Live Editor Control (140 tools)**
Interact with the running Godot editor in real time over a TCP or stdio bridge: select nodes, run/stop/pause the project, undo/redo, save scenes, create and attach scripts, set breakpoints, step the debugger, evaluate expressions, control the 3D viewport camera, bake lightmaps and navigation meshes, manage plugins, and simulate key presses.

**Live Game Runtime Control (11 tools)**
Go beyond the editor and reach into the **actually running game**. Inspect the live scene tree with real positions, read and write node properties at runtime, call arbitrary methods, emit signals, inject keyboard input, and — the headline feature — `runtime_freeze` the game, `runtime_step` forward an exact number of frames, and `runtime_screenshot` the result. This makes AI-driven gameplay debugging deterministic and reproducible.

**Visual Shader Graphs**
Create and modify VisualShader graphs programmatically. Add nodes from a catalog of 40+ types (constants, math operations, textures, inputs), connect node ports, set node parameters, and list available node types with their default input/output configurations.

**Engine Introspection (ClassDB)**
Query the live engine's ClassDB: list all classes, inspect methods, properties, and signals of any Godot type, read built-in class documentation, and search the help system. The AI works from ground truth instead of hallucinating APIs.

**TileMap, Navigation & Translation**
Inspect TileSet resources and TileMapLayer nodes. List and read NavigationRegion nodes, create NavigationMesh resources. Read and create CSV/PO translation files with search support.

---

## Architecture

### System Overview

```
                        MCP Protocol (stdio/SSE/Streamable HTTP)
  +-----------------+                                        +------------------+
  |   AI Client      |<-------------------------------------->|  Godot MCP Server |
  |  (VS Code/Cursor |                                        |  (TypeScript)     |
  |   Claude/etc.)   |                                        |                  |
  +-----------------+                                        |  +-------------+ |
                                                             |  | Tool Registry| |
                                                             |  |  (386 tools) | |
                                                             |  +------+------+ |
                                                             |         |        |
                                                             |    +----v-----+  |
                        File I/O (direct)                    |    | Parsers   |  |
  +------------------+<-------------------------------------->|    | .tscn     |  |
  |   Godot Project   |                                       |    | .tres     |  |
  |   Files on Disk   |                                       |    | .godot    |  |
  |  (.tscn/.tres/.gd)|                                       |    +----------+  |
  +------------------+                                       |                  |
                                                             |  +-------------+ |
                        stdin/stdout (spawned process)       |  | Godot CLI   | |
  +------------------+<-------------------------------------->|  | (spawn/edit) | |
  |   Godot Editor    |                                       |  +-------------+ |
  |  (GDScript addon) |                                       +------------------+
  |  TCP port 9876    |
  |  102 commands     |
  +------------------+
```

### Communication Paths

The server uses four distinct communication paths depending on the operation:

1. **Direct File I/O** — For file-based tools (read_scene, write_script, create_resource, etc.), the server reads and writes Godot project files directly on disk using custom parsers. No Godot process is required. This is the fastest path.

2. **Godot CLI** — For engine operations (launch_editor, run_project, export_project, get_godot_version), the server spawns Godot as a subprocess and communicates via command-line arguments and stdout/stderr.

3. **Editor Bridge (dual-mode)** — For live editor tools (editor_get_selection, editor_play, editor_set_breakpoint, etc.), the MCP server communicates with a running Godot editor instance. Two modes are supported:
   - **TCP mode** (default): Connects to an already-running Godot on `localhost:9876`. The editor plugin listens on this port.
   - **Stdio mode** (fallback): Spawns Godot as a child process with `--editor --path <project>`, sets `MCP_STDIO=true`, and communicates via stdin/stdout using JSON-RPC with a `__MCP__:` marker prefix. This mode auto-starts and auto-restarts Godot as needed.

4. **Live-Game Runtime Bridge** — For runtime tools (`runtime_*`, e.g. `runtime_get_tree`, `runtime_set_node`, `runtime_step`), the MCP server talks to a small autoload running **inside your played game** on `127.0.0.1:9877`. The autoload (`addons/godot-mcp/runtime_bridge.gd`, named `godot_mcp_runtime`) is added to your project and listens only on loopback. This lets the AI inspect and mutate the live scene tree, inject input, pause/resume, deterministically step frames, and screenshot the running game — a tier no other public Godot MCP offers out of the box.

### Project Structure

```
godot-mcp/
├── src/
│   ├── index.ts              # CLI entry point, argument parsing, transport dispatch
│   ├── server.ts             # MCP server factory, tool registration, request routing
│   ├── tools/                # tool handler files (one group per category)
│   │   ├── register.ts       # Centralized registration (386 tools)
│   │   ├── project.ts        # Project management tools
│   │   ├── scene.ts          # Scene editing tools
│   │   ├── script.ts         # Script and shader tools
│   │   ├── editor.ts         # Live editor bridge (TCP + stdio, persistent connection)
│   │   ├── resource.ts       # Resource/material/theme tools
│   │   ├── godot.ts          # Godot engine control
│   │   ├── animation.ts      # Animation pipeline
│   │   ├── audio.ts          # Audio bus management
│   │   ├── scene_inspectors.ts  # 2D lights, vehicles, spring arm, etc.
│   │   ├── mesh.ts           # 3D mesh primitives
│   │   ├── shader_graph.ts   # VisualShader graph editing
│   │   └── ... (16 more files: domain, physics, navigation, joints, etc.)
│   ├── parsers/
│   │   ├── scene_parser.ts   # .tscn file parser (sections, nodes, connections)
│   │   ├── resource_parser.ts # .tres file parser
│   │   ├── config_parser.ts  # project.godot INI parser
│   │   └── parser_helpers.ts # Shared utilities (quote handling, bracket balancing)
│   ├── transports/
│   │   ├── stdio.ts          # Stdio transport (default, for local AI clients)
│   │   └── http-server.ts    # SSE + Streamable HTTP transport
│   └── utils/
│       ├── types.ts          # TypeScript type definitions
│       ├── file_utils.ts     # File system operations with path traversal protection
│       ├── godot_cli.ts      # Godot binary detection, process management
│       ├── registry.ts       # ToolRegistry class with sorted listing
│       ├── errors.ts         # Structured error codes
│       └── cache.ts          # TTL-based file cache for parsed documents
├── addons/
│   └── godot-mcp/            # Godot editor plugin
│       ├── plugin.cfg         # Plugin metadata
│       └── plugin.gd          # stdin reader, TCP server, 102 command handlers
├── test/                     # Vitest suite (197 tests: 127 runnable + 70 integration requiring a live Godot project) + legacy .mjs suites
│   ├── test_all.mjs          # Legacy standalone suite (176 tool checks)
│   ├── test_editor.mjs       # Legacy editor bridge TCP tests
│   ├── test_runner.mjs       # Early integration test runner
│   ├── tools.test.ts         # Vitest tool handler tests
│   ├── parsers.test.ts       # Vitest parser tests
│   ├── structural.test.ts    # Vitest structural tests
│   ├── integration_mcp_test.test.ts  # Vitest integration tests
│   ├── server_normalization.test.ts  # Vitest parameter-normalization tests
│   ├── scene_format.test.ts  # .tscn/.tres on-disk format contract (round-trip, hierarchy, ids)
│   ├── addon_bridges.test.ts # GDScript bridge invariants (reserved names, poll(), return types)
│   ├── editor_error_surface.test.ts  # Editor error tagging + undo/redo addon invariants
│   ├── fixtures/             # Test fixture files (.tscn, .tres, .gd)
│   └── test-project/         # Standalone Godot test project
├── scripts/
│   └── sync-addons.js        # Post-build: syncs addons to target Godot project
├── package.json
└── tsconfig.json
```

---

## Implementation Principles

### File-Based Parsing

All Godot file formats (.tscn, .tres, project.godot) are parsed directly in TypeScript using custom parsers. This eliminates the need to launch Godot for file operations, making reads and writes near-instantaneous.

**Scene parser** (`parsers/scene_parser.ts`):
- Parses all `.tscn` sections: `[gd_scene]`, `[ext_resource]`, `[sub_resource]`, `[node]`, `[connection]`
- Handles multi-line property values with balanced bracket/quote detection
- Builds node hierarchy trees from parent references
- Supports round-trip serialization for safe edits

**Resource parser** (`parsers/resource_parser.ts`):
- Parses `.tres` text resources with section-based structure
- Detects binary `.res` files via `GDROM` magic header (returns unsupported error)
- Extracts header, external resources, sub-resources, and main resource properties

**Config parser** (`parsers/config_parser.ts`):
- Parses INI-style `project.godot` and `.cfg` files
- Handles multi-line values with indentation-based continuation
- Preserves comments for round-trip editing

### Dual-Mode Editor Bridge

The editor plugin (`addons/godot-mcp/plugin.gd`) implements 102 command handlers that wrap Godot's `EditorInterface` API. Communication uses JSON-RPC 2.0 over two channels:

- **TCP mode** (port 9876): When Godot is running independently, the plugin accepts TCP connections on `127.0.0.1` only (never the LAN). This is the preferred mode for interactive development. Set `GODOT_MCP_TOKEN` (or the project setting `godot_mcp/auth_token`) to require an `auth` handshake per connection.

- **Stdio mode**: When the MCP server spawns Godot as a child process (`godot --editor --path <project>`), the plugin reads JSON-RPC requests from stdin and writes responses to stdout with a `__MCP__:` prefix marker. The server filters for these markers to distinguish JSON-RPC from Godot's standard output.

The bridge auto-detects which mode to use: it first attempts a rapid TCP health check (800ms timeout), and falls back to spawning Godot if no existing instance is found. If the spawned process exits unexpectedly, it auto-restarts up to 3 times.

### Parameter Normalization

To accommodate AI clients that may use either `snake_case` or `camelCase` parameter naming, the server automatically normalizes 30+ common parameter names to the `snake_case` keys its Zod schemas expect (`projectPath` -> `project_path`, `scenePath` -> `scene_path`, etc.) before validation. The advertised `inputSchema` always uses `snake_case`, so `snake_case` inputs pass through unchanged.

### Safety Guarantees

- **Path traversal protection**: All file operations validate that resolved paths stay within the project root
- **Automatic backups**: Write operations on script and scene files create `.bak` backup copies
- **Read-only mode**: `--read-only` (or `GODOT_MCP_READ_ONLY=true`) rejects the 218 write/side-effect tools (write_, create_, delete_, move_, set_, edit_, editor_* mutations, run/export/launch, …) via a maintained whitelist — they are hidden from `tools/list` and blocked with a `READ_ONLY` error if called directly
- **TCP only on loopback**: The editor plugin's TCP bridge binds `127.0.0.1` only, never the LAN
- **Optional token auth**: Set `GODOT_MCP_TOKEN` to require a bearer token on HTTP (`/mcp`, `/sse`) and an `auth` handshake on the plugin TCP bridge; non-loopback HTTP binds are refused without it
- **Undoable editor mutations**: Every scene-changing editor command (`editor_add_node`, `editor_remove_node`, `editor_set_node_properties`, `editor_rename_node`, `editor_move_node`, `editor_move_node_3d`, `editor_reparent_node`, `editor_duplicate_node`, `editor_delete_selected`, `editor_instantiate_scene`, …) is committed through Godot's native `EditorUndoRedoManager`, so a single **Ctrl+Z** (or `editor_undo`) reverts what the AI just did
- **Structured errors**: Tool failures return structured `{ content, isError: true }` responses; privileged paths carry typed error codes (`READ_ONLY`, `EDITOR_NOT_REACHABLE`, `EDITOR_COMMAND_FAILED`, `NOT_FOUND`, …). Engine-side failures are never reported as success — if the editor rejects a command, the tool surfaces `EDITOR_COMMAND_FAILED` with the engine's own message

---

## Transport Modes

Godot MCP supports three transport protocols. Choose based on your client and deployment needs.

| Mode | Protocol | Use Case | Default |
|---|---|---|---|
| **Stdio** | Standard I/O (stdin/stdout) | Local AI clients (VS Code, Claude Desktop, Cursor, Windsurf) | Yes |
| **SSE** | Server-Sent Events over HTTP | Older MCP clients, web-based clients, remote access | |
| **Streamable HTTP** | MCP 2025 Streamable HTTP | Modern MCP clients, production deployments, remote access | |

### Stdio (default)

JSON-RPC communication over standard I/O (stdin/stdout). Ideal for local development — no network configuration needed.

```bash
npx @yanhuifair/godot-mcp -p /path/to/your/godot/project
```

### SSE (Server-Sent Events)

HTTP-based transport using SSE for server-to-client streaming. Compatible with older MCP clients.

```bash
npx @yanhuifair/godot-mcp -t sse --port 3000 -p /path/to/your/godot/project
```

| Option | Description | Default |
|---|---|---|
| `-t sse` | Enable SSE transport mode | — |
| `--port <number>` | HTTP listen port | `3000` |
| `--host <string>` | Bind address (use `0.0.0.0` for remote access) | `127.0.0.1` |

Client config:

```json
{
  "mcpServers": {
    "godot-mcp": {
      "url": "http://127.0.0.1:3000/sse"
    }
  }
}
```

### Streamable HTTP (MCP 2025)

Modern HTTP transport based on the MCP 2025 spec. Supports session management, reconnection with resume, and both stateful and stateless modes.

```bash
npx @yanhuifair/godot-mcp -t streamable-http --port 3000 -p /path/to/your/godot/project
```

Endpoints:

| Method | Path | Purpose |
|---|---|---|
| `GET` | `/mcp` | Establish SSE stream (supports `Last-Event-ID` reconnection) |
| `POST` | `/mcp` | Send JSON-RPC requests/notifications |
| `DELETE` | `/mcp` | Close session |

Client config:

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

### All Transports Simultaneously

```bash
npx @yanhuifair/godot-mcp -t all --port 3000 -p /path/to/your/godot/project
```

Starts: Stdio + SSE (`/sse`) + Streamable HTTP (`/mcp`) + Health Check (`/health`)

```bash
curl http://127.0.0.1:3000/health
# {"status":"ok","version":"1.11.1","projectRoot":"/path/to/project","endpoints":{...}}
```

---

## Installation

> **Read this first.** In normal use you never launch this server yourself — your AI client launches it in the background using the `command` from its config file. The commands below are for **installing the package** and for **manual/advanced runs** (HTTP transports, debugging, CI).

### Which method should I use?

| Method | Best for | Trade-off |
|---|---|---|
| **npx** *(recommended)* | Almost everyone | Nothing to install; always fetches the latest version. Tiny delay on first run. |
| **Global install** | Slow/offline networks, pinning a version, using a bare `godot-mcp` command | You must run `npm update -g` yourself to get new releases. |
| **From source** | Contributing, or you need an unreleased change | You have to rebuild after every `git pull`. |

### Option A — npx (recommended, nothing to pre-install)

```bash
npx -y @yanhuifair/godot-mcp -p /path/to/your/godot/project
```

`npx` downloads the package on demand and caches it. This is exactly what the config snippets in [AI Client Configuration](#ai-client-configuration) use, so **if you follow the Quick Start there is no separate install step at all** — `-y` just skips the "install this package?" prompt.

### Option B — Global install

```bash
npm install -g @yanhuifair/godot-mcp

# then run it by name anywhere
godot-mcp -p /path/to/your/godot/project
```

If you install globally, change your client config from `"command": "npx"` to `"command": "godot-mcp"` and drop the `-y` and package name from `args`:

```json
{ "command": "godot-mcp", "args": ["-p", "."] }
```

Update later with `npm update -g @yanhuifair/godot-mcp`.

### Option C — From source

```bash
git clone https://github.com/yanhuifair/Godot-MCP.git
cd Godot-MCP
npm install
npm run build       # compiles TypeScript into dist/

node dist/index.js -p /path/to/your/godot/project
```

Point your client at the built entry file:

```json
{ "command": "node", "args": ["/absolute/path/to/Godot-MCP/dist/index.js", "-p", "."] }
```

### Upgrading to the latest version

`npx` always fetches the newest release, so the same one-liner that installs also upgrades:

```bash
npx -y @yanhuifair/godot-mcp@latest --enable-plugin -p .
```

**To refresh the editor plugin** (the files in `addons/godot-mcp/`), delete the old copy first, then re-run — otherwise stale plugin files can linger:

```bash
rm -rf addons/godot-mcp && npx -y @yanhuifair/godot-mcp@latest --enable-plugin -p .
```

> On Windows PowerShell use `rm -r addons/godot-mcp` (no `-f` flag).

- **Pin a version** — `npx @yanhuifair/godot-mcp@1.11.1 …`; **force latest** — `npx @yanhuifair/godot-mcp@latest …`.
- **Global install** — `npm update -g @yanhuifair/godot-mcp`.
- **From source** — `git pull && npm run build`.
- **Check your version** — `npx @yanhuifair/godot-mcp --version`.

> **Upgrading from v1.9.0?** That release shipped an editor plugin whose `runtime_bridge.gd` failed to parse in Godot 4.7 (a `_input` function colliding with the built-in `Node._input`, plus an untyped `_resolve`). If your editor logs those parse errors, delete `addons/godot-mcp` and re-run `--enable-plugin` to install the fixed plugin.

See [CHANGELOG](CHANGELOG.md) for the complete history. **v1.11.1** added export-preset writing (`create_export_preset` / `update_export_preset` / `remove_export_preset`), localization writing (`create_po_translation` / `register_translation` / `unregister_translation`), and a read-only / path-sandbox security pass.

### Command-Line Options

| Flag | What it does |
|---|---|
| `-p, --project-path <path>` | Your Godot project folder — the one containing `project.godot`. Auto-detected if omitted. |
| `-g, --godot-path <path>` | Path to the Godot executable. Auto-detected if omitted (see the detection order below). |
| `--enable-plugin` | Copy the editor plugin into `addons/` **and** switch it on in `project.godot`. Requires `-p`. **This is the one you want.** |
| `--install-addons` | Copy the plugin files only — you enable it yourself in Godot's Plugins tab. |
| `--read-only` | Safe mode: rejects the 218 tools that write files or cause side effects. Great for letting an AI explore an unfamiliar project. |
| `-t, --transport <mode>` | `stdio` (default) · `sse` · `streamable-http` · `all`. See [Transport Modes](#transport-modes). |
| `--port <number>` | HTTP port for `sse` / `streamable-http`. Default `3000`. |
| `--host <string>` | HTTP bind address. Default `127.0.0.1`. Binding anything else **requires** `GODOT_MCP_TOKEN`. |
| `--no-sse` / `--no-streamable-http` | Disable an individual endpoint when running `-t all`. |
| `-h, --help` | Print all options and sample client configs. |

```bash
# a few real examples
npx @yanhuifair/godot-mcp --enable-plugin -p .          # one-time setup for a project
npx @yanhuifair/godot-mcp -p . --read-only              # let the AI look, not touch
npx @yanhuifair/godot-mcp -p . -t streamable-http --port 8080
```

### Environment Variables

| Variable | Description |
|---|---|
| `GODOT_PATH` | Path to Godot binary (optional, auto-detected) |
| `GODOT_MCP_READ_ONLY` | `true` — enable read-only mode (rejects 218 write/side-effect tools) |
| `GODOT_MCP_TOKEN` | Auth token. HTTP: required when binding a non-loopback host. Plugin TCP bridge: enables the `auth` handshake on port 9876 |
| `GODOT_MCP_TEST_PROJECT` | Path to test project for integration tests |
| `GODOT_PROJECT` | Target project for the `sync-addons` build hook |
| `MCP_STDIO` | `true` — run the editor plugin in stdio mode (set automatically when MCP spawns Godot) |

Godot auto-detection order: `GODOT_PATH` -> `/Applications/Godot.app` -> `PATH` -> snap/flatpak -> Windows Program Files

> **Security note**: The MCP server can read/write your project files, run GDScript, and export builds. When using HTTP transports, always set `GODOT_MCP_TOKEN` — the server refuses to bind a non-loopback address without it, and loopback-only access is strongly recommended anyway.

---

## AI Client Configuration

Godot MCP is a **plain stdio MCP server** — anything that speaks MCP can drive it. Below are step-by-step setups for the most popular AI agents, IDEs and CLIs.

> **In a hurry?** Nearly every client wants the same six lines of JSON. Copy [the universal snippet](#the-universal-snippet), drop it into the file listed for your client, restart, then ask the AI to run `get_status`. Done.

### Pick Your Client

| Client | Where the config lives | Top-level key |
|---|---|---|
| [Claude Code](#claude-code) | `claude mcp add` → `.mcp.json` | `mcpServers` |
| [Cursor](#cursor) | `.cursor/mcp.json` · `~/.cursor/mcp.json` | `mcpServers` |
| [VS Code / GitHub Copilot](#vs-code--github-copilot) | `.vscode/mcp.json` | `servers` |
| [Codex CLI](#codex-cli-openai) | `~/.codex/config.toml` | `[mcp_servers.*]` |
| [Gemini CLI](#gemini-cli-google) | `.gemini/settings.json` · `~/.gemini/settings.json` | `mcpServers` |
| [Windsurf](#windsurf) | `~/.codeium/windsurf/mcp_config.json` | `mcpServers` |
| [Cline](#cline-vs-code-extension) | `cline_mcp_settings.json` (open via UI) | `mcpServers` |
| [Roo Code](#roo-code-vs-code-extension) | `.roo/mcp.json` · global `mcp_settings.json` | `mcpServers` |
| [Trae](#trae) | AI panel → MCP (UI) | `mcpServers` |
| [Zed](#zed) | `~/.config/zed/settings.json` | `context_servers` |
| [JetBrains (Rider / IntelliJ)](#jetbrains-ides-rider-intellij-goland) | Settings → AI Assistant → MCP | `mcpServers` |
| [OpenCode](#opencode) | `opencode.json` | `mcp` |
| [Claude Desktop](#claude-desktop) | `claude_desktop_config.json` | `mcpServers` |
| [Continue](#continue) | `~/.continue/config.yaml` | `mcpServers` |
| [Cherry Studio](#cherry-studio) | Settings → MCP servers (UI) | `mcpServers` |
| [Goose](#goose) | `~/.config/goose/config.yaml` | `extensions` |
| [Aider](#aider) | `.aider.conf.yml` | `mcp-servers-file` |
| [Anything else](#any-other-mcp-client) | — | see below |

### The Universal Snippet

This is the config ~80% of clients accept verbatim:

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

What each part means:

| Field | Why it's there |
|---|---|
| `"godot-mcp"` | The name your AI will see. Rename it freely — nothing depends on it. |
| `"type": "stdio"` | The server runs as a local child process. Some clients omit this field entirely; both are fine. |
| `"command": "npx"` | On Windows, if you hit `spawn ENOENT`, change this to `"npx.cmd"`. |
| `"-y"` | Skips npx's "install this package?" prompt. Without it the server hangs on first run. |
| `"-p", "."` | Your Godot project folder. `.` means "wherever the client launched the server from". |

**When to use `.` and when to use a full path:**

- Editors that open a folder (VS Code, Cursor, Windsurf, Zed, Trae, JetBrains) launch the server *inside* that folder → `"."` works, and the config stays portable across machines.
- Desktop apps and global CLIs (Claude Desktop, Cherry Studio, a user-scope Claude Code entry) have no project folder → use an absolute path like `"/Users/you/Games/MyGame"` or `"C:/Users/you/Games/MyGame"`.
- **Windows: always use forward slashes** (`C:/Users/...`) or escaped backslashes (`C:\\Users\\...`) in JSON.

**Two useful variants:**

```jsonc
// Read-only — the AI can inspect everything but cannot modify a single file
"args": ["-y", "@yanhuifair/godot-mcp", "-p", ".", "--read-only"]

// Pin the Godot binary when auto-detection fails
"env": { "GODOT_PATH": "/Applications/Godot.app/Contents/MacOS/Godot" }
```

---

### Claude Code

**1. Register the server.** Run this from inside your Godot project folder:

```bash
cd /path/to/your/godot/project
claude mcp add godot-mcp -- npx -y @yanhuifair/godot-mcp -p .
```

Everything after `--` is the command Claude Code will spawn. The `--` separator is required — without it Claude Code eats the `-y` and `-p` flags as its own.

**2. Pick a scope** (optional — the default is fine for one project):

| Command | Stored in | Who gets it |
|---|---|---|
| `claude mcp add godot-mcp -- …` | `~/.claude.json`, keyed by folder | Just you, just this project |
| `claude mcp add -s project godot-mcp -- …` | `.mcp.json` in the project root | **Everyone who clones the repo** — commit this |
| `claude mcp add -s user godot-mcp -- …` | `~/.claude.json`, global | You, in every project (use an absolute `-p` path) |

Adding an environment variable:

```bash
claude mcp add godot-mcp -e GODOT_PATH=/Applications/Godot.app/Contents/MacOS/Godot \
  -- npx -y @yanhuifair/godot-mcp -p .
```

**3. Verify.** Start `claude`, then type `/mcp`. You should see `godot-mcp` with a **connected** status. Press Enter on it to browse the 386 tools.

**4. First prompt:**

> Run `get_status` and tell me what the Godot MCP server can currently reach, then list every scene in the project.

**Managing it later:**

```bash
claude mcp list              # all registered servers + connection status
claude mcp get godot-mcp     # full details of one server
claude mcp remove godot-mcp  # unregister
```

> If you used `-s project`, Claude Code will ask you to approve `.mcp.json` the first time you open the project. That's a security prompt, not an error — answer yes.

---

### Cursor

**1. Create the config.** Project-level is best — it travels with the repo:

`.cursor/mcp.json` in your Godot project root:

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

Prefer it everywhere? Use `~/.cursor/mcp.json` (Windows: `%USERPROFILE%\.cursor\mcp.json`) with an absolute `-p` path instead.

You can also let Cursor create the file for you: **Settings → Tools & Integrations → Add Custom MCP**.

**2. Verify.** Open **Cursor Settings → Tools & Integrations**. `godot-mcp` should appear with a **green dot** and a tool count. Cursor hot-reloads this file, so no restart is needed — if the dot is red, click the refresh icon and check the JSON for a trailing comma.

**3. Switch the chat to Agent mode** (`Cmd/Ctrl+I`). Ask mode cannot call tools.

**4. First prompt:**

> Use `search_tools` to find the tileset tools, then tell me which TileSets exist in this project.

> **Tool limit warning:** Cursor only sends ~40–80 tools to the model at a time. Godot MCP ships 386. Keep `search_tools` in your rules file (see [Make Your Agent Use the Tools Well](#make-your-agent-use-the-tools-well)) so the model looks a tool up instead of hallucinating one.

---

### VS Code / GitHub Copilot

**1. Create `.vscode/mcp.json`** in your Godot project root. Note that VS Code's own key is `servers`, not `mcpServers`:

```json
{
  "servers": {
    "godot-mcp": {
      "type": "stdio",
      "command": "npx",
      "args": ["-y", "@yanhuifair/godot-mcp", "-p", "."]
    }
  }
}
```

Shortcut: run `MCP: Add Server…` from the Command Palette (`Cmd/Ctrl+Shift+P`) and pick **Command (stdio)** — VS Code writes the file for you.

**2. Start it.** VS Code shows a small **Start** codelens directly above the `"godot-mcp"` line in the JSON. Click it. (Or run `MCP: List Servers` → `godot-mcp` → `Start Server`.)

**3. Switch Copilot Chat to Agent mode.** Open Chat (`Cmd/Ctrl+Shift+I`), then choose **Agent** in the mode dropdown. Ask and Edit modes don't call MCP tools.

**4. Verify.** Click the **tools icon (🛠)** in the chat input — `godot-mcp` should be listed. If you see "0 tools", run `MCP: List Servers` → `godot-mcp` → `Show Output` to read the startup log.

**5. First prompt:**

> #godot-mcp Run get_status, then list all scenes.

> **Team tip:** commit `.vscode/mcp.json`. Everyone who clones the repo gets the server automatically — VS Code just asks each person to trust it once.
>
> **User-level instead:** Command Palette → `MCP: Open User Configuration`, and use an absolute `-p` path.

---

### Codex CLI (OpenAI)

**1. Add the server** with the built-in command (writes `~/.codex/config.toml` for you):

```bash
codex mcp add godot-mcp -- npx -y @yanhuifair/godot-mcp -p .
```

Or edit `~/.codex/config.toml` by hand — note this is **TOML**, not JSON:

```toml
[mcp_servers.godot-mcp]
command = "npx"
args = ["-y", "@yanhuifair/godot-mcp", "-p", "."]
startup_timeout_sec = 30

[mcp_servers.godot-mcp.env]
GODOT_PATH = "/Applications/Godot.app/Contents/MacOS/Godot"
```

`startup_timeout_sec` matters here: `npx` may need to download the package on the very first run, which can exceed Codex's default startup window.

**2. Verify:**

```bash
codex mcp list
```

**3. Use it** — always launch Codex from inside the Godot project so `-p .` resolves correctly:

```bash
cd /path/to/your/godot/project
codex                                        # interactive
codex exec "Run get_status and list all scenes"   # one-shot
```

---

### Gemini CLI (Google)

**1. Add the server:**

```bash
cd /path/to/your/godot/project
gemini mcp add godot-mcp npx -y @yanhuifair/godot-mcp -p .
```

Default scope is **project** → written to `.gemini/settings.json`. Add `-s user` to write `~/.gemini/settings.json` instead (then use an absolute `-p` path).

Equivalent hand-written config:

```json
{
  "mcpServers": {
    "godot-mcp": {
      "command": "npx",
      "args": ["-y", "@yanhuifair/godot-mcp", "-p", "."],
      "timeout": 600000,
      "trust": false
    }
  }
}
```

- `trust: true` skips the per-call confirmation prompt. Convenient, but it also means the AI can write files without asking — pair it with `--read-only` if you want a safety net.
- `includeTools` / `excludeTools` accept arrays of tool names if you want to hand the model a curated subset instead of all 386.

**2. Verify.** Run `gemini`, then `/mcp` — it lists connected servers and their tools. `gemini mcp list` works outside a session.

**3. First prompt:**

> Call get_status, then use search_tools to find animation-related tools.

---

### Windsurf

**1. Open the config.** Either click **Cascade → the hammer icon → Configure**, or edit the file directly:

- macOS/Linux: `~/.codeium/windsurf/mcp_config.json`
- Windows: `%USERPROFILE%\.codeium\windsurf\mcp_config.json`

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

This file is global, so give it an **absolute** project path.

**2. Refresh.** Back in Cascade, click the hammer icon → **Refresh**. `godot-mcp` should turn green.

**3. First prompt** (Cascade is `Cmd/Ctrl+L`):

> Run get_status, then read the main scene.

---

### Cline (VS Code Extension)

**1. Open Cline's MCP settings** — don't hunt for the file, use the UI: click the **Cline icon** in the sidebar → **MCP Servers** (the server rack icon at the top) → **Installed** tab → **Configure MCP Servers**. That opens `cline_mcp_settings.json`.

<details>
<summary>Where that file actually lives</summary>

- macOS: `~/Library/Application Support/Code/User/globalStorage/saoudrizwan.claude-dev/settings/cline_mcp_settings.json`
- Windows: `%APPDATA%\Code\User\globalStorage\saoudrizwan.claude-dev\settings\cline_mcp_settings.json`
- Linux: `~/.config/Code/User/globalStorage/saoudrizwan.claude-dev/settings/cline_mcp_settings.json`

</details>

**2. Add the entry:**

```json
{
  "mcpServers": {
    "godot-mcp": {
      "command": "npx",
      "args": ["-y", "@yanhuifair/godot-mcp", "-p", "/path/to/your/godot/project"],
      "disabled": false,
      "autoApprove": []
    }
  }
}
```

`autoApprove` takes tool names that should run without a confirmation click — e.g. `["get_status", "search_tools", "list_scenes"]` for read-only convenience.

**3. Restart.** Cline usually reloads on save; if not, click **Restart Server** next to `godot-mcp` in the MCP Servers panel. Wait for the dot to go green.

**4. First prompt** in Plan or Act mode:

> Run get_status and summarize this Godot project's structure.

---

### Roo Code (VS Code Extension)

Roo Code supports both a project file and a global file — the project file wins on conflicts.

**1a. Project-level (recommended):** create `.roo/mcp.json` in your Godot project root:

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

**1b. Global:** Roo Code panel → **MCP** icon → **Edit Global MCP** (file lives at `…/globalStorage/rooveterinaryinc.roo-cline/settings/mcp_settings.json`). Use an absolute `-p` path there.

**2. Enable it.** In the Roo Code MCP panel, make sure the `godot-mcp` toggle is on and the status dot is green. Hit the refresh icon if it isn't.

**3. First prompt:**

> Use search_tools to find shader tools, then list every .gdshader file.

---

### Trae

Trae has two steps most people miss: adding the server **and** attaching it to an agent.

**1. Add the server.** Open the AI side panel → **Settings (gear) → MCP → Add → Add manually** (or **Import from JSON**), then paste:

```json
{
  "mcpServers": {
    "godot-mcp": {
      "command": "npx",
      "args": ["-y", "@yanhuifair/godot-mcp", "-p", "."]
    }
  }
}
```

Wait for the status to become **Connected/available** before continuing.

**2. Attach it to an agent.** This is the step that trips people up — Trae agents only see MCP servers you explicitly grant them. Go to **Agents → create or edit an agent → Tools → tick `godot-mcp`**, then save.

**3. Select that agent** in the chat's agent dropdown.

**4. First prompt:**

> Run get_status, then list all scenes in this project.

> If the tools never fire, check **MCP → godot-mcp → View logs** — Trae surfaces the raw stdio startup output there.

---

### Zed

**1. Add a local server.** Either use the UI — **Settings → AI → MCP Servers → Add Server → Add Local Server** — or run `zed: open settings file` from the Command Palette and add:

```json
{
  "context_servers": {
    "godot-mcp": {
      "command": "npx",
      "args": ["-y", "@yanhuifair/godot-mcp", "-p", "."],
      "env": {}
    }
  }
}
```

Zed calls MCP servers **context servers** — the key is `context_servers`, not `mcpServers`. Everything else is the same.

**2. Verify.** Go back to **Settings → AI → MCP Servers**. The dot next to `godot-mcp` should be **green** with the tooltip *"Server is active"*.

**3. First prompt** in the Agent Panel:

> Use the godot-mcp tools: run get_status, then list the scenes.

> Mentioning the server by name meaningfully improves tool-selection accuracy in Zed. For guaranteed usage, create an [agent profile](https://zed.dev/docs/ai/agent-profiles) that turns off the built-in tools and leaves only `godot-mcp` on.

---

### JetBrains IDEs (Rider, IntelliJ, GoLand…)

Relevant if you write **C# in Rider** against a Godot project. Requires a 2025.1+ IDE with the AI Assistant plugin (Junie shares the same MCP config).

**1. Open** `Settings/Preferences → Tools → AI Assistant → Model Context Protocol (MCP)`.

**2. Click `+`**, switch the dialog to **As JSON**, and paste:

```json
{
  "mcpServers": {
    "godot-mcp": {
      "command": "npx",
      "args": ["-y", "@yanhuifair/godot-mcp", "-p", "."]
    }
  }
}
```

If your IDE launches processes without your shell's `PATH`, replace `"npx"` with the absolute path (`which npx` / `where npx`).

**3. Apply**, then wait for the row to report a tool count instead of an error.

**4. Use it** in the AI Assistant chat with **Codebase/Agent mode** enabled — plain chat mode does not call tools.

---

### OpenCode

**1. Create `opencode.json`** in your project root (or `~/.config/opencode/opencode.json` for all projects):

```json
{
  "$schema": "https://opencode.ai/config.json",
  "mcp": {
    "godot-mcp": {
      "type": "local",
      "command": ["npx", "-y", "@yanhuifair/godot-mcp", "-p", "."],
      "enabled": true,
      "timeout": 30000
    }
  }
}
```

Two OpenCode-specific gotchas:

- `command` is a **single array**, not `command` + `args`.
- The default tool-discovery `timeout` is **5000 ms**. Listing 386 tools plus a cold `npx` download regularly blows past that — bump it to `30000` as shown or the server will silently show zero tools.

**2. Verify.** Start `opencode` in that folder. The MCP server appears at startup; tools are namespaced `godot-mcp_*`.

**3. First prompt:**

> use godot-mcp to run get_status and list all scenes

---

### Claude Desktop

**1. Edit the config file:**

- macOS: `~/Library/Application Support/Claude/claude_desktop_config.json`
- Windows: `%APPDATA%\Claude\claude_desktop_config.json`
- Linux: `~/.config/Claude/claude_desktop_config.json`

Easier route: **Settings → Developer → Edit Config** opens the file directly.

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

Claude Desktop has no project folder, so the **absolute path is mandatory**.

**2. Fully quit and relaunch.** Not "close the window" — quit the app (`Cmd+Q` / tray → Exit). Claude Desktop reads this file only at startup.

**3. Verify.** A **tools icon** appears in the chat input showing the tool count. If it's missing, check the log: `~/Library/Logs/Claude/mcp-server-godot-mcp.log` (macOS) or `%APPDATA%\Claude\logs\` (Windows).

**4. First prompt:**

> Get the Godot version and list all scenes in my project.

---

### Continue

Continue (VS Code + JetBrains) reads `~/.continue/config.yaml`:

```yaml
mcpServers:
  - name: godot-mcp
    command: npx
    args:
      - "-y"
      - "@yanhuifair/godot-mcp"
      - "-p"
      - "/path/to/your/godot/project"
```

Older Continue installs use `~/.continue/config.json` with a `mcpServers` **array** instead — check which file exists before editing. Save, then reopen the Continue panel; tools are discovered automatically. MCP tools only fire in **Agent mode**.

---

### Cherry Studio

Popular cross-platform desktop MCP client, fully GUI-driven.

1. **Settings → MCP Servers → Add Server → Quick create**.
2. Name: `godot-mcp` · Type: **STDIO** · Command: `npx`
3. Arguments — **one per line**, not space-separated:
   ```
   -y
   @yanhuifair/godot-mcp
   -p
   /path/to/your/godot/project
   ```
4. Save and toggle the server on. A green indicator plus a tool count means it's live.
5. In a chat, enable the MCP server via the toolbox icon under the input box, then ask it to run `get_status`.

> **Import from JSON** also works — paste [the universal snippet](#the-universal-snippet) with an absolute `-p` path.

---

### Goose

**Interactive (recommended):**

```bash
goose configure
# → Add Extension → Command-line Extension
#   Name:    godot-mcp
#   Command: npx -y @yanhuifair/godot-mcp -p /path/to/your/godot/project
#   Timeout: 300
```

**Or edit `~/.config/goose/config.yaml` directly:**

```yaml
extensions:
  godot-mcp:
    name: godot-mcp
    type: stdio
    cmd: npx
    args:
      - "-y"
      - "@yanhuifair/godot-mcp"
      - "-p"
      - "/path/to/your/godot/project"
    enabled: true
    timeout: 300
```

Goose calls MCP servers **extensions** and uses `cmd`, not `command`. Restart Goose, then run `/mcp` to confirm the connection.

---

### Aider

Aider's MCP support is version-dependent — run `aider --help | grep -i mcp` first to see which flags your build has.

```bash
# Point Aider at a standard MCP JSON file
aider --mcp-servers-file ./mcp.json

# Or inline
aider --mcp-servers '{"mcpServers":{"godot-mcp":{"command":"npx","args":["-y","@yanhuifair/godot-mcp","-p","."]}}}'
```

`./mcp.json` is just [the universal snippet](#the-universal-snippet). Persist it in `.aider.conf.yml`:

```yaml
mcp-servers-file: ./mcp.json
```

---

### Any Other MCP Client

If your client accepts a **local command**, give it:

```
command: npx
args:    -y  @yanhuifair/godot-mcp  -p  /path/to/your/godot/project
```

If your client only accepts a **URL** (n8n, Dify, browser-based agents, hosted connectors), run the server yourself and point the client at the HTTP endpoint:

```bash
export GODOT_MCP_TOKEN="$(openssl rand -hex 32)"   # required for non-loopback binds
npx -y @yanhuifair/godot-mcp -p /path/to/your/godot/project -t all --port 3000
```

| Endpoint | URL |
|---|---|
| Streamable HTTP (MCP 2025) | `http://127.0.0.1:3000/mcp` |
| SSE (legacy clients) | `http://127.0.0.1:3000/sse` |
| Health check | `http://127.0.0.1:3000/health` |

See [Transport Modes](#transport-modes) for the full details.

---

### Make Your Agent Use the Tools Well

386 tools is more than most models can keep straight, and many clients only forward a slice of them to the model. Two minutes of setup fixes this.

**1. Drop a rules file in your project.** Agents auto-read these: `AGENTS.md` (Codex, OpenCode, Cursor, Gemini CLI, Zed), `CLAUDE.md` (Claude Code), `.cursor/rules/*.mdc` (Cursor), `.clinerules` (Cline / Roo Code), `.github/copilot-instructions.md` (Copilot).

```markdown
## Godot MCP

This project has the `godot-mcp` server attached (386 tools).

- Never guess a tool name. Call `search_tools` with a keyword first —
  e.g. search_tools("tileset"), search_tools("animation"), search_tools("navmesh").
- On `EDITOR_NOT_REACHABLE` or `RUNTIME_NOT_REACHABLE`, call `get_status`
  and tell me what's missing instead of retrying blindly.
- On `EDITOR_COMMAND_FAILED`, the editor rejected the command — read the
  engine message, verify the node path / property with `editor_get_scene_tree`
  or `get_class_properties`, then retry. Do not repeat the same call.
- Every `editor_*` scene change is undoable — if I say "undo that",
  call `editor_undo` rather than trying to reconstruct the old state.
- Prefer the file tools (read_scene, write_script, create_resource…).
  They work with Godot closed and are the fastest path.
- Use `editor_*` tools only when the change must show up in a live editor.
- Use `runtime_*` tools only after the game is actually running (F5).
- Always `read_scene` before `add_node` so the parent NodePath is correct.
- Read a script before rewriting it; never blank a file you haven't read.
```

**2. Let it look before it touches.** For a first run on an unfamiliar project, add `--read-only` to `args`. The server then rejects every write tool at the boundary, so no amount of enthusiasm from the model can damage your project.

**3. Two prompts worth memorizing:**

> `get_status` — what is currently reachable (editor? running game?) and how many tools are loaded.
> `search_tools("<keyword>")` — the right tool name, ranked, without burning context on a 386-item list.

---

### Troubleshooting

| Symptom | Cause & fix |
|---|---|
| No tools show up at all | The client is in Ask/Chat mode. Switch to **Agent** mode — most clients don't call tools otherwise. |
| Server "fails to start", no error | JSON syntax. A trailing comma or a smart quote from a copy-paste is the usual culprit — validate the file. |
| `spawn npx ENOENT` (Windows) | Change `"command": "npx"` to `"npx.cmd"`, or use the absolute path from `where npx`. |
| `spawn npx ENOENT` (macOS/Linux GUI apps) | The app launched without your shell `PATH`. Use the absolute path from `which npx`. |
| Server times out on first launch | `npx` is downloading the package. Run `npx -y @yanhuifair/godot-mcp --help` once in a terminal to warm the cache, and raise the client's startup timeout. |
| `Project not found` | `-p .` only works when the client's working directory *is* the Godot project. Switch to an absolute path. |
| Connected, but 0 tools | Tool-discovery timeout too low (notably OpenCode's 5 s default). Raise it to 30 s. |
| File tools work, `editor_*` tools fail | The editor plugin isn't running. Run `--enable-plugin`, reload the project in Godot, and check `get_status`. |
| `RUNTIME_NOT_REACHABLE` | The game isn't running, or the runtime autoload isn't registered. See [Tool Discovery & Live Game Runtime](#tool-discovery--live-game-runtime). |
| Godot can't be found | Set `GODOT_PATH` in the config's `env` block to the Godot binary. |
| Model picks the wrong tool | Add the rules file above, and tell it to call `search_tools` first. |
| Node.js too old | `node -v` must be **≥ 18**. |

---

## Usage Examples

The following examples show what you can ask your AI assistant. Each maps to one or more MCP tools (shown in parentheses).

### Project Exploration

| Command | Tools Used |
|---|---|
| "Show me the project structure" | `list_project_files` |
| "Generate a project overview report" | `generate_project_report` |
| "What autoloads are configured?" | `list_autoloads` |
| "Check my project for broken references" | `validate_project` |
| "Find unused assets I should clean up" | `find_unused_assets` |

### Scene Creation and Editing

| Command | Tools Used |
|---|---|
| "Create a 2D platformer scene with a CharacterBody2D root" | `create_scene` |
| "Add a Cooldown Timer node under the Player" | `add_node` |
| "Clone the Enemy node as Enemy2" | `clone_node` |
| "Connect body_entered signal from Player to _on_body_entered" | `connect_signal` |
| "Set the Player collision shape to CapsuleShape2D" | `set_collision_shape` |
| "Load the player.png texture onto the Sprite" | `load_sprite` |
| "Search all scenes for Timer nodes" | `find_nodes_in_scenes` |
| "List all Button and Label nodes" | `list_ui_nodes` |

### Script and Shader

| Command | Tools Used |
|---|---|
| "Analyze the structure of player.gd" | `read_script_structure` |
| "Add a dash method to the Player script" | `add_script_function` |
| "Search all scripts for references to 'velocity'" | `search_in_scripts` |
| "Validate all GDScripts for syntax errors" | `validate_script` |
| "Create a new spatial shader with vertex displacement" | `create_shader` |
| "Validate and compile the hurricane shader" | `validate_shader` + `compile_shader` |

### Materials and Resources

| Command | Tools Used |
|---|---|
| "Create a metallic PBR material with roughness 0.3" | `create_resource` |
| "List all materials grouped by type" | `list_materials` |
| "Change the albedo color of player_material" | `set_material_param` |
| "Show me all .tres files in the project" | `list_resources` |

### Animation

| Command | Tools Used |
|---|---|
| "Show all player animations with their keyframes" | `read_animation` |
| "Add a position track to the idle animation" | `add_animation_track` |
| "Set a keyframe at 0.5s with value Vector2(100, 0)" | `set_keyframe` |
| "Show the AnimationTree state machine" | `read_animation_tree` |

### Audio

| Command | Tools Used |
|---|---|
| "Show the audio bus layout" | `read_audio_bus_layout` |
| "Add a reverb effect to the Master bus" | `add_bus_effect` |
| "Set the SFX bus volume to -6 dB" | `set_bus_volume` |
| "List all .wav and .ogg files" | `list_audio_files` |

### Run, Debug, and Export

| Command | Tools Used |
|---|---|
| "Run the game at 1280x720 and take a screenshot" | `run_project` + `capture_screenshot` |
| "Set a breakpoint at player.gd line 42" | `editor_set_breakpoint` |
| "Step through the debugger and show local variables" | `editor_debug_step` + `editor_get_debug_variables` |
| "Stop the running game" | `stop_project` |
| "Export the project for macOS" | `export_project` |

---

## Editor Plugin

The editor plugin enables real-time interaction with the Godot editor through two modes:

- **stdio mode** — when MCP spawns Godot as a child process (JSON-RPC 2.0 over stdin/stdout)
- **TCP mode** — when Godot is opened manually, the plugin listens on `127.0.0.1:9876` (loopback only). If `GODOT_MCP_TOKEN` or the project setting `godot_mcp/auth_token` is set, every connection must complete an `auth` handshake first. The port can be changed via the `godot_mcp/editor_port` project setting.

### Install

```bash
npx @yanhuifair/godot-mcp --enable-plugin -p /path/to/your/godot/project
```

This installs the plugin to `addons/godot-mcp/` and auto-enables it in `project.godot`. No manual steps required.

### Editor Commands (140 tools)

**View & Selection:** `editor_get_selection` `editor_set_selection` `editor_get_open_scene` `editor_read_current_scene` `editor_get_info` `editor_get_rect` `editor_focus` `editor_show_in_filesystem` `editor_open_dock`

**Playback Control:** `editor_play` `editor_stop` `editor_run_specific_scene` `editor_get_running_scene_tree` `editor_get_performance`

**Edit Operations:** `editor_undo` `editor_redo` `editor_save` `editor_save_all` `editor_reload_scene` `editor_delete_selected`

**Scene Operations:** `editor_create_scene` `editor_instantiate_scene` `editor_set_main_scene` `editor_get_scene_changes`

**Node Operations:** `editor_add_node` `editor_remove_node` `editor_duplicate_node` `editor_rename_node` `editor_reparent_node` `editor_move_node` `editor_get_node_properties` `editor_set_node_properties`

**Scripting:** `editor_create_script` `editor_attach_script` `editor_run_gdscript` `editor_evaluate_expression`

**Debugging:** `editor_set_breakpoint` `editor_remove_breakpoint` `editor_get_breakpoints` `editor_debug_continue` `editor_debug_step` `editor_debug_step_over` `editor_debug_break` `editor_get_stack_trace` `editor_get_debug_variables`

**Signals:** `editor_connect_signal` `editor_disconnect_signal` `editor_list_node_signals`

**File System:** `editor_open_asset` `editor_list_filesystem` `editor_create_folder` `editor_delete_asset` `editor_rename_asset` `editor_move_asset` `editor_duplicate_asset` `editor_reimport_asset` `editor_get_dependencies`

**Project Settings:** `editor_get_project_setting` `editor_set_project_setting` `editor_get_editor_setting` `editor_set_editor_setting` `editor_get_project_directory`

**Input & Autoloads:** `editor_get_input_map` `editor_add_input_action` `editor_remove_input_action` `editor_get_autoloads` `editor_add_autoload` `editor_remove_autoload`

**Assets & Baking:** `editor_bake_lightmaps` `editor_bake_navigation` `editor_take_screenshot`

**Class Documentation:** `editor_get_class_list` `editor_get_method_list` `editor_get_class_properties` `editor_get_class_signals` `editor_get_class_doc` `editor_search_help`

**Camera & Viewport:** `editor_get_camera` `editor_set_camera` `editor_toggle_grid` `editor_toggle_snap`

**Other:** `editor_get_recent_scenes` `editor_simulate_key` `editor_get_plugin_list` `editor_enable_plugin` `editor_disable_plugin` `editor_get_errors` `editor_clear_errors` `editor_health_check`

---

## Tool Discovery & Live Game Runtime

Most MCP servers can only touch the editor. Godot MCP can also **drive the game you are actually playing** — a tier no other public Godot MCP offers. This enables AI-driven playtesting, runtime-state debugging, automated gameplay verification, and live screenshots.

### Enable the Runtime Autoload

The runtime bridge is a separate, lightweight autoload — it does not modify the editor plugin. Add it once per project:

1. Make sure the editor plugin is installed (`npx @yanhuifair/godot-mcp --enable-plugin -p .`). The runtime bridge script ships inside the same `addons/godot-mcp/` folder.
2. In the Godot editor, open **Project → Project Settings → Globals → Autoload**.
3. Add `addons/godot-mcp/runtime_bridge.gd` with the autoload name **`godot_mcp_runtime`** and enable it.
4. Run the game from the editor (F5). The autoload prints `[godot-mcp-runtime] Listening on 127.0.0.1:9877` to the output log.

> **Security**: the bridge binds `127.0.0.1` only — it is never reachable from the LAN. It runs with `process_mode = PROCESS_MODE_ALWAYS`, so pausing the game (via `runtime_freeze` or the editor) does not stop the bridge from receiving commands.
>
> **It also refuses to start in an exported build.** The bridge can call arbitrary methods on any node, so shipping it would be a backdoor. It only listens when `OS.has_feature("editor")` is true — i.e. when the game is run from the editor. If you forget to remove the autoload before exporting, it stays dormant instead of opening a port. To drive an exported build in CI, set `GODOT_MCP_RUNTIME=1` in the environment.

### Runtime Tools (11)

| Tool | Description |
|---|---|
| `runtime_ping` | Check if the live-game runtime bridge is reachable. |
| `runtime_get_tree` | Read the running game scene tree (live, inside the played game). |
| `runtime_get_node` | Read live properties of a node in the running game. |
| `runtime_set_node` | Set properties on a node in the running game (live mutation). |
| `runtime_call_method` | Call a method on a node in the running game. |
| `runtime_emit_signal` | Emit a signal on a node in the running game. |
| `runtime_input` | Inject a key input event into the running game (keycode + press/release). |
| `runtime_freeze` | Pause (freeze) the running game. |
| `runtime_resume` | Resume (unpause) the running game. |
| `runtime_step` | Advance the running game by N frames deterministically while paused (frame stepping). |
| `runtime_screenshot` | Capture a screenshot of the running game viewport. |

### Example workflow

```
"Run the game, freeze it, then step 5 frames and screenshot"
  → runtime_ping → runtime_freeze → runtime_step { frames: 5 } → runtime_screenshot

"Set the Player's health to 0 and emit died"
  → runtime_set_node { path: "Player", properties: { "health": "0" } }
  → runtime_emit_signal { path: "Player", signal: "died" }
```

If the runtime tools return a `RUNTIME_NOT_REACHABLE` error, run `get_status` — it reports whether the autoload is reachable and how to enable it.

### Tool Discovery & Diagnostics (Meta, 2 tools)

With 386 tools, guessing the right name wastes tokens. Two discovery tools help:

| Tool | Description |
|---|---|
| `search_tools` | Search all tools by keyword/description to discover the right tool name. AND-combines space-separated words; name matches rank higher. |
| `get_status` | System status / diagnostics: editor bridge, live-game runtime bridge, and tool count. Use to debug connection issues. |

```
"Find tools that deal with collision shapes"  → search_tools { keyword: "collision shape" }
"What subsystems are available right now?"    → get_status
```

---

## All Tools

Click each category to expand and see all tools with descriptions.

<details>
<summary>Editor (140 tools) — Live editor control</summary>

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
| `editor_get_performance` | Get FPS, draw calls, memory usage while game is running. |
| `editor_undo` | Undo the last scene action (including every MCP scene mutation) and report which action was undone. |
| `editor_redo` | Redo the last undone scene action and report which action was redone. |
| `editor_save` | Save current scene in editor. |
| `editor_save_all` | Save all open scenes. |
| `editor_reload_scene` | Save and reload current scene. |
| `editor_delete_selected` | Delete currently selected nodes. |
| `editor_create_scene` | Create and open a new scene in the editor. |
| `editor_instantiate_scene` | Instantiate a PackedScene into the current scene. |
| `editor_set_main_scene` | Set the project main scene. |
| `editor_get_scene_changes` | Check unsaved changes plus the last action name and whether undo/redo are available. |
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
| `editor_get_dependencies` | Get all resource dependencies for a file. |
| `editor_get_project_setting` | Read a project setting via editor API. |
| `editor_set_project_setting` | Set a project setting via editor API (auto-saves). |
| `editor_get_editor_setting` | Read an editor preference value. |
| `editor_set_editor_setting` | Set an editor preference. |
| `editor_get_project_directory` | Get project res:// and user:// paths. |
| `editor_get_input_map` | Read the Input Map via editor API. |
| `editor_add_input_action` | Add an input action via editor API. |
| `editor_remove_input_action` | Remove an input action via editor API. |
| `editor_get_autoloads` | List autoload singletons via editor API. |
| `editor_add_autoload` | Add an autoload singleton via editor API. |
| `editor_remove_autoload` | Remove an autoload singleton via editor API. |
| `editor_bake_lightmaps` | Trigger lightmap baking. |
| `editor_bake_navigation` | Bake navigation meshes for all NavigationRegion nodes in current scene. |
| `editor_take_screenshot` | Capture the editor viewport as a PNG. |
| `editor_get_class_list` | List all Godot classes, optionally filtered. |
| `editor_get_method_list` | List all methods of a Godot class. |
| `editor_get_class_properties` | List all editor-visible properties of a class. |
| `editor_get_class_signals` | List all signals of a Godot class. |
| `editor_get_class_doc` | Open Godot documentation for a class in browser. |
| `editor_search_help` | Search Godot documentation in browser. |
| `editor_get_camera` | Get the 3D editor viewport camera position. |
| `editor_set_camera` | Set the 3D editor viewport camera position. |
| `editor_toggle_grid` | Toggle 3D grid visibility. |
| `editor_toggle_snap` | Toggle 3D snap mode. |
| `editor_get_recent_scenes` | List recently opened scene paths. |
| `editor_simulate_key` | Simulate a key press in the editor (e.g. F5 to run, Ctrl+S to save). |
| `editor_get_plugin_list` | List all installed editor plugins with enabled state. |
| `editor_enable_plugin` | Enable a named editor plugin. |
| `editor_disable_plugin` | Disable a named editor plugin. |
| `editor_get_errors` | Get current editor error/log list. |
| `editor_clear_errors` | Clear the editor error list. |
| `editor_health_check` | Check if the Godot editor plugin is reachable. |

</details>

<details>
<summary>Scene (22 tools) — Full scene CRUD + nodes + signals + transforms</summary>

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
<summary>Project (24 tools) — Config, input map, file ops, autoloads, export presets, validation</summary>

| Tool | Description |
|---|---|
| `list_project_files` | List files and directories in the Godot project. |
| `read_project_config` | Read and parse project.godot. |
| `write_project_config` | Write a config value to project.godot. |
| `read_export_presets` | Read export presets from export_presets.cfg. |
| `create_export_preset` | Create an export preset in export_presets.cfg (Windows Desktop/Linux/macOS/Android/iOS/Web). |
| `update_export_preset` | Update fields/options of an existing export preset (by name or index). |
| `remove_export_preset` | Remove an export preset and renumber the remaining ones. |
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
<summary>Script (21 tools) — GDScript/Shader CRUD + analysis + injection + validation</summary>

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
| `validate_shader` | Validate .gdshader for syntax issues. |
| `compile_shader` | Compile (reimport) a .gdshader via Godot editor. |
| `list_visual_shaders` | List VisualShader graph files. |
| `read_visual_shader` | Read a VisualShader graph. |
| `read_shader_include` | Read a .gdshaderinc file. |
| `create_shader_include` | Create a .gdshaderinc file. |
| `list_shader_includes` | List all .gdshaderinc files. |

</details>

<details>
<summary>Animation (10 tools) — AnimationPlayer/AnimationTree pipeline</summary>

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
<summary>Godot Engine (9 tools) — Engine detection, launch, run, export</summary>

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
<summary>Coverage (18 tools) — Mesh primitives, 2D lights, vehicles, spring arm, decal & more</summary>

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
<summary>Resource (8 tools) — .tres CRUD, PBR materials, themes, templates</summary>

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
<summary>Audio (7 tools) — Audio bus layout CRUD, effects, volume</summary>

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
<summary>Shader Graph (8 tools) — VisualShader graph node editing, 40+ node types</summary>

| Tool | Description |
|---|---|
| `create_visual_shader` | Create a new VisualShader .tres graph file. |
| `add_shader_graph_node` | Add a node to a VisualShader graph (40+ types: constants, math, textures, effects). |
| `remove_shader_graph_node` | Remove a node from a VisualShader graph by index. |
| `connect_shader_graph_nodes` | Connect two node ports in a VisualShader graph. |
| `disconnect_shader_graph_nodes` | Disconnect two node ports in a VisualShader graph. |
| `set_shader_node_param` | Set a parameter on a VisualShader node (constant, expression, operator, etc.). |
| `list_shader_node_types` | List all VisualShader node types organized by category with I/O counts. |
| `get_shader_node_defaults` | Get default ports and parameters for a specific VisualShader node type. |

</details>

<details>
<summary>Meta / Discovery (2 tools) — Tool search + system diagnostics</summary>

| Tool | Description |
|---|---|
| `search_tools` | Search all tools by keyword/description to discover the right tool name. Use this instead of guessing among 350+ tools. |
| `get_status` | System status / diagnostics: editor bridge, live-game runtime bridge, and tool count. Use to debug connection issues. |

</details>

<details>
<summary>Runtime (game) (11 tools) — Control the running game</summary>

| Tool | Description |
|---|---|
| `runtime_ping` | Check if the live-game runtime bridge is reachable. |
| `runtime_get_tree` | Read the running game scene tree (live, inside the played game). |
| `runtime_get_node` | Read live properties of a node in the running game. |
| `runtime_set_node` | Set properties on a node in the running game (live mutation). |
| `runtime_call_method` | Call a method on a node in the running game. |
| `runtime_emit_signal` | Emit a signal on a node in the running game. |
| `runtime_input` | Inject a key input event into the running game. |
| `runtime_freeze` | Pause (freeze) the running game. |
| `runtime_resume` | Resume (unpause) the running game. |
| `runtime_step` | Advance the running game by N frames deterministically while paused (frame stepping). |
| `runtime_screenshot` | Capture a screenshot of the running game viewport. |

</details>

<details>
<summary>Remaining Categories</summary>

**Domain (11):** `read_curve`, `create_curve`, `read_gradient`, `create_gradient`, `list_paths`, `read_path`, `list_skeletons`, `read_skeleton`, `read_reflection_probe`, `read_multimesh`, `create_noise_texture`

**Nodes (8):** `read_character_body`, `read_animated_sprite`, `read_audio_player`, `read_video_player`, `read_parallax`, `read_rich_text`, `read_container`, `read_tab_container`

**Utility (6):** `list_all_signals`, `read_project_icon`, `read_stylebox`, `create_atlas_texture`, `list_popups`, `generate_cohesion_report`

**Rendering (5):** `read_mesh_instance`, `set_mesh_surface_material`, `read_viewport`, `read_area`, `read_raycast`

**Environment (4):** `read_environment`, `list_environments`, `create_environment`, `set_environment_param`

**Inspector (5):** `list_cameras`, `read_camera`, `list_lights`, `set_light_param`, `read_particles`

**Physics (4):** `list_physics_materials`, `read_physics_material`, `create_physics_material`, `read_collision_layers`

**Import (3):** `read_import_config`, `list_import_files`, `write_import_config`

**TileMap (3):** `list_tilesets`, `read_tileset`, `read_tilemap`

**Navigation (3):** `list_nav_regions`, `read_nav_region`, `create_nav_mesh`

**Translation (8):** `list_translations`, `read_translation`, `create_translation`, `write_translation`, `add_translation_key`, `create_po_translation`, `register_translation`, `unregister_translation`

**Joints (3):** `create_joint`, `set_joint_param`, `list_joints`

**UID (3):** `get_uid`, `update_project_uids`, `list_missing_uids`

**2D Geometry (2):** `create_collision_polygon`, `set_shape_points`

**Diff (2):** `diff_scene`, `diff_resource`

**Other (4):** `read_gdextension`, `list_csproj`, `create_world`, `read_texture_info`

</details>

---

## Supported Formats

| Format | Extension | Operations |
|---|---|---|
| Scene | `.tscn` | Read, write, create, edit |
| Script | `.gd` | Read, write, create, validate, analyze |
| Script | `.cs` | Read, write, create |
| Shader | `.gdshader` | Read, write, create, validate, compile |
| Shader Include | `.gdshaderinc` | Read, write, create |
| VisualShader | `.tres` | Read, list, graph editing |
| Resource | `.tres` | Read, write, create (14 templates) |
| Resource | `.res` | Not supported (binary) |
| Config | `project.godot` | Read, write |
| Config | `export_presets.cfg` | Read |
| Import | `.import` | Read, write |
| Environment | `.tres` | Read, write, create (4 presets) |
| Animation | `.tres` / `.tscn` | Read, create, modify |
| AudioBus | `.tres` | Read, write, create |
| PhysicsMaterial | `.tres` | Read, write, create |
| TileSet | `.tres` | Read, list |
| Translation | `.csv` / `.po` | Read, create |

---

## Development

```bash
npm install          # Install dependencies
npm run build        # Build TypeScript to dist/
npm run dev          # Dev mode (tsx hot reload)
npm test             # Run vitest suite (197 tests: 127 runnable + 70 integration requiring a live Godot project); node test/test_all.mjs for 176 legacy checks
npm run test:watch   # Watch mode
npm run check:godot  # Load every fixture in a real headless Godot and verify
                     # ext_resource paths, UIDs and SubResource refs (needs Godot installed)
```

### CLI Options

| Flag | Description |
|---|---|
| `-p, --project-path` | Path to Godot project root |
| `-g, --godot-path` | Path to Godot binary (optional) |
| `-t, --transport` | Transport mode: `stdio`, `sse`, `streamable-http`, `all` |
| `--port` | HTTP port (default: 3000) |
| `--host` | HTTP bind address (default: 127.0.0.1) |
| `--install-addons` | Copy editor plugin to target Godot project |
| `--enable-plugin` | Install and auto-enable the editor plugin |
| `--read-only` | Reject 218 write/side-effect tools (security mode) |
| `--no-sse` | Disable SSE endpoint |
| `--no-streamable-http` | Disable Streamable HTTP endpoint |
| `-h, --help` | Show help |

### Tech Stack

- **Runtime**: Node.js >= 18
- **Language**: TypeScript 5.5
- **MCP SDK**: @modelcontextprotocol/sdk ^1.29
- **Schema Validation**: Zod ^3.24
- **HTTP Server**: Express ^5.2
- **Test**: Vitest ^2.0
- **Transport**: stdio (default), SSE, Streamable HTTP

---

## Build VSIX

```bash
npm run vsix
# Output: godot-mcp-1.11.1.vsix
```

Install in VS Code:

```bash
code --install-extension godot-mcp-1.11.1.vsix
```

---

## Limitations

- Binary `.res` files are not parseable — use `.tres` (text format) for editable resources
- Godot CLI tools (`launch_editor`, `run_project`, `export_project`) require the Godot Engine binary
- `edit_scene` uses text manipulation on `.tscn`; complex refactors may require manual verification
- Screenshots depend on OS-native screenshot utilities

---

## FAQ

**Do I need to keep Godot open?**
No. Every file-based tool — scenes, resources, scripts, shaders, project settings — uses native parsers and runs instantly against files on disk. Only the live editor tools (123) and live game runtime tools (11) need Godot running, and the server can launch it for you automatically.

**Does it support Godot 3?**
No. Godot **4.x** only. Godot 3's file formats and editor APIs differ too much to support cleanly.

**Which AI clients work with it?**
Any MCP-compatible client. Verified with Claude Desktop, Claude Code, Cursor, VS Code (Copilot), Windsurf, Codex, Cline, Roo Code, Aider, Cody, Goose, and Continue.

**How does the AI pick the right tool out of 386?**
Use `search_tools` — it ranks the catalog by keyword against tool names and descriptions, so the AI can find `add_audio_bus_effect` without loading all 386 schemas into context. `get_status` reports which subsystems (editor bridge, game runtime) are currently reachable.

**What makes the runtime tools different from the editor tools?**
Editor tools talk to the Godot **editor**. Runtime tools talk to the **running game** through a lightweight autoload on `127.0.0.1:9877`. That's what enables freezing the game, stepping an exact number of frames, and screenshotting a precise gameplay moment.

**Is it safe to let an AI edit my project?**
Destructive file operations write `.bak` backups, tools are classified read-only vs. write, and every failure returns a typed error code with a repair hint rather than silently corrupting a file. Use version control anyway.

---

## Keywords

Godot MCP · Godot MCP server · Model Context Protocol Godot · Godot AI assistant · Godot AI agent · Godot Engine 4 MCP · GDScript AI · AI game development · Godot Copilot · Claude Godot integration · Cursor Godot · VS Code Godot MCP · Windsurf Godot · Cline Godot · Godot automation · Godot scene editing API · `.tscn` parser · `.tres` parser · Godot shader AI · VisualShader automation · Godot debugging AI · Godot runtime inspection · AI game engine tooling · MCP server for game engines · Godot编辑器 AI · Godot 自动化 · Godot 智能体

---

## License

AGPL-3.0-or-later

## Tip
![alt text](tip.JPG)