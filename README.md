# <div align="center">Godot MCP</div>

[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
[![Tests](https://img.shields.io/badge/tests-167%20passed-brightgreen)](.)
[![npm](https://img.shields.io/npm/v/@yanhuifair/godot-mcp)](https://www.npmjs.com/package/@yanhuifair/godot-mcp)
[![Node](https://img.shields.io/badge/node-%3E%3D18-green)](.)
[![Godot](https://img.shields.io/badge/godot-4.x-blue)](https://godotengine.org)

[English](README.md) | [中文文档](README-zh.md)

---

A **Model Context Protocol (MCP) server** that enables AI assistants to interact with Godot Engine projects. AI can read, inspect, and modify every aspect of your Godot project — from scene files and scripts to materials, animations, audio buses, and the live editor itself. **282 tools, 26 categories, 12 AI clients supported.**

| Requirement | |
|---|---|
| Godot | 4.x (Godot 3 not supported) |
| Node.js | >= 18 |
| AI Client | Any MCP-compatible client (see [Configuration](#ai-client-configuration)) |

---

## Table of Contents

1. [Quick Start](#quick-start)
2. [What You Can Do](#what-you-can-do)
3. [Architecture](#architecture)
4. [Implementation Principles](#implementation-principles)
5. [Transport Modes](#transport-modes)
6. [Installation](#installation)
7. [AI Client Configuration](#ai-client-configuration)
8. [Usage Examples](#usage-examples)
9. [Editor Plugin](#editor-plugin)
10. [All Tools](#all-tools)
11. [Supported Formats](#supported-formats)
12. [Development](#development)
13. [Build VSIX](#build-vsix)

---

## Quick Start

### Step 1: Install the Editor Plugin

```bash
npx @yanhuifair/godot-mcp --enable-plugin -p /path/to/your/godot/project
```

This copies the plugin to `addons/godot-mcp/` and auto-enables it in `project.godot`. No manual Godot steps required.

### Step 2: Configure Your AI Client

Create `.vscode/mcp.json` in your project root:

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

See [AI Client Configuration](#ai-client-configuration) for Cursor, Claude Desktop, Windsurf, Codex, Cline, Aider, Cody, Goose, and others.

### Step 3: Start Chatting

The AI client auto-launches the MCP server. File-based tools (.tscn, .tres, .gd) work immediately. Editor tools (play, select nodes, debug) cause MCP to spawn Godot automatically.

```
"List all scenes in the project"
"Find all CharacterBody2D nodes"
"Run the game and take a screenshot"
```

---

## What You Can Do

Godot MCP provides comprehensive coverage of the Godot 4.x engine through 282 tools in 26 categories.

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
| Editor | 89 | Live editor control — select, play, undo, save, breakpoints, file ops, performance |
| Scene | 22 | Scene CRUD — nodes, signals, transforms, collision, sprites |
| Project | 22 | Config, input map, file ops, autoloads, validation, unused assets |
| Script | 21 | GDScript/Shader CRUD, structure analysis, code injection, validation |
| Domain | 11 | Curve, Gradient, Path, Skeleton, ReflectionProbe, MultiMesh, NoiseTexture |
| Animation | 10 | AnimationPlayer/AnimationTree — tracks, keyframes, parameters |
| Godot Engine | 9 | Engine detection, launch editor, run/export project, screenshot |
| Coverage | 18 | Mesh primitives, 2D lights, vehicles, spring arm, decal, occluder, grid map |
| Nodes | 8 | CharacterBody, AnimatedSprite, Audio, Video, Parallax, RichText, Container, Tab |
| Resource | 8 | .tres CRUD, PBR materials, themes, 14 templates |
| Audio | 7 | Audio bus layout, effects, volume |
| Shader Graph | 8 | VisualShader graph — 40+ node types, connections, parameters |
| Utility | 6 | Signal catalog, StyleBox, AtlasTexture, popup listing, cohesion report |
| Rendering | 5 | MeshInstance, Viewport, Area, RayCast/ShapeCast |
| Environment | 4 | Environment read/write, 4 presets |
| Inspector | 5 | Camera, Light, Particle node inspection |
| Physics | 4 | PhysicsMaterial CRUD, collision layers |
| Import | 3 | .import file read/write |
| TileMap | 3 | TileSet resources, TileMapLayer inspection |
| Navigation | 3 | NavigationRegion, NavigationMesh |
| Translation | 3 | CSV/PO translation files |
| Joints | 3 | Physics joints — create, configure, list |
| UID | 3 | File UID query, batch update, missing UID detection |
| 2D Geometry | 2 | CollisionPolygon2D, shape point editing |
| Diff | 2 | Scene and resource comparison |
| Other | 8 | GDExtension, C#, World3D, CameraAttributes, SpriteFrames, Texture |

**Total: 282 tools across 26 categories**

### Core Capabilities in Detail

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
                                                             |  |  (282 tools) | |
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
  |  97 commands      |
  +------------------+
```

### Communication Paths

The server uses three distinct communication paths depending on the operation:

1. **Direct File I/O** — For file-based tools (read_scene, write_script, create_resource, etc.), the server reads and writes Godot project files directly on disk using custom parsers. No Godot process is required. This is the fastest path.

2. **Godot CLI** — For engine operations (launch_editor, run_project, export_project, get_godot_version), the server spawns Godot as a subprocess and communicates via command-line arguments and stdout/stderr.

3. **Editor Bridge (dual-mode)** — For live editor tools (editor_get_selection, editor_play, editor_set_breakpoint, etc.), the MCP server communicates with a running Godot editor instance. Two modes are supported:
   - **TCP mode** (default): Connects to an already-running Godot on `localhost:9876`. The editor plugin listens on this port.
   - **Stdio mode** (fallback): Spawns Godot as a child process with `--editor --path <project>`, sets `MCP_STDIO=true`, and communicates via stdin/stdout using JSON-RPC with a `__MCP__:` marker prefix. This mode auto-starts and auto-restarts Godot as needed.

### Project Structure

```
godot-mcp/
├── src/
│   ├── index.ts              # CLI entry point, argument parsing, transport dispatch
│   ├── server.ts             # MCP server factory, tool registration, request routing
│   ├── tools/                # 29 tool handler files (one per category)
│   │   ├── register.ts       # Centralized registration (282 tools)
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
│       └── plugin.gd          # stdin reader, TCP server, 97 command handlers
├── test/                     # 167 tests across 7 test files
│   ├── test_all.mjs          # Comprehensive 167-tool test suite
│   ├── test_editor.mjs       # Editor bridge TCP tests
│   ├── test_runner.mjs       # Early integration test runner
│   ├── tools.test.ts         # Vitest tool handler tests
│   ├── parsers.test.ts       # Vitest parser tests
│   ├── structural.test.ts    # Vitest structural tests
│   ├── integration_mcp_test.test.ts  # Vitest integration tests
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

The editor plugin (`addons/godot-mcp/plugin.gd`) implements 97 command handlers that wrap Godot's `EditorInterface` API. Communication uses JSON-RPC 2.0 over two channels:

- **TCP mode** (port 9876): When Godot is running independently, the plugin accepts TCP connections and processes commands. This is the preferred mode for interactive development.

- **Stdio mode**: When the MCP server spawns Godot as a child process (`godot --editor --path <project>`), the plugin reads JSON-RPC requests from stdin and writes responses to stdout with a `__MCP__:` prefix marker. The server filters for these markers to distinguish JSON-RPC from Godot's standard output.

The bridge auto-detects which mode to use: it first attempts a rapid TCP health check (800ms timeout), and falls back to spawning Godot if no existing instance is found. If the spawned process exits unexpectedly, it auto-restarts up to 3 times.

### Parameter Normalization

To accommodate AI clients that may use either `snake_case` or `camelCase` parameter naming, the server automatically normalizes 30+ common parameter names (`project_path` -> `projectPath`, `scene_path` -> `scenePath`, etc.) before Zod schema validation.

### Safety Guarantees

- **Path traversal protection**: All file operations validate that resolved paths stay within the project root
- **Automatic backups**: Write operations on script and scene files create `.bak` backup copies
- **Read-only mode**: `--read-only` flag rejects all write and delete operations
- **Structured errors**: All errors use typed error codes (`FILE_NOT_FOUND`, `PARSE_ERROR`, `VALIDATION_ERROR`, etc.) with actionable suggestions

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
# {"status":"ok","version":"1.3.8","projectRoot":"/path/to/project","endpoints":{...}}
```

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
| `GODOT_MCP_TEST_PROJECT` | Path to test project for integration tests |

Godot auto-detection order: `GODOT_PATH` -> `/Applications/Godot.app` -> `PATH` -> snap/flatpak -> Windows Program Files

---

## AI Client Configuration

### VS Code / GitHub Copilot

**Method 1: Project-level config (recommended)**

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

After saving, reload VS Code (`Cmd+Shift+P` -> `Developer: Reload Window`). Open Copilot Chat (`Cmd+Shift+I`), look for the tools indicator in the chat input. Send a test message:

> "List all scenes in the project"

Tip: Commit `.vscode/mcp.json` to your repository so every team member gets the MCP server automatically.

**Method 2: User-level config**

Open VS Code settings (`Cmd+Shift+P` -> `Preferences: Open User Settings (JSON)`) and add:

```jsonc
{
  "mcp": {
    "servers": {
      "godot-mcp": {
        "command": "npx",
        "args": ["-y", "@yanhuifair/godot-mcp", "-p", "/path/to/your/godot/project"]
      }
    }
  }
}
```

**Method 3: Install via `--enable-plugin`**

```bash
npx @yanhuifair/godot-mcp --enable-plugin -p /path/to/your/godot/project
```

This installs the editor plugin and auto-enables it. Combined with the MCP config above, you get full file-based tools + live editor control.

### Cursor

Cursor supports both project-level and user-level MCP configuration.

**Project-level** — `.cursor/mcp.json` in your project root:

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

**User-level** — `~/.cursor/mcp.json` (macOS/Linux) or `%USERPROFILE%\.cursor\mcp.json` (Windows):

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

After configuring, open Cursor Settings -> MCP to verify the server appears with a green status indicator. Use Agent mode in chat (Cmd+L) to invoke MCP tools.

### Claude Desktop

**macOS**: `~/Library/Application Support/Claude/claude_desktop_config.json`
**Windows**: `%APPDATA%\Claude\claude_desktop_config.json`

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

After saving, fully quit and restart Claude Desktop. Look for the hammer icon in the chat input to confirm MCP tools are loaded. Send a test:

> "Get the Godot version"

### Claude CLI (`claude`)

Install the Claude CLI first, then register the MCP server:

```bash
# One-time registration
claude mcp add godot-mcp -- npx -y @yanhuifair/godot-mcp -p /path/to/your/godot/project

# With environment variables (e.g., custom Godot path)
claude mcp add godot-mcp -e GODOT_PATH=/path/to/godot -- npx -y @yanhuifair/godot-mcp -p .

# List registered servers
claude mcp list

# Remove if needed
claude mcp remove godot-mcp
```

Then use interactively or non-interactively:

```bash
# Interactive session
claude

# Non-interactive (pipe mode)
echo "List all scenes in my Godot project" | claude -p
```

### Windsurf

`~/.codeium/windsurf/mcp_config.json` (macOS/Linux) or `%USERPROFILE%\.codeium\windsurf\mcp_config.json` (Windows):

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

Restart Windsurf after saving. Open Cascade (Cmd+L) and verify tools appear in the MCP panel.

### OpenAI Codex CLI

Codex uses `.codex.toml` or `.codex.yaml` in your project root, or `~/.codex/config.yaml` for user-level config.

**Project-level** (`.codex.toml` in your Godot project):

```yaml
mcp_servers:
  godot-mcp:
    type: stdio
    command: npx
    args:
      - "-y"
      - "@yanhuifair/godot-mcp"
      - "-p"
      - "."
```

**Global install** (if you ran `npm install -g @yanhuifair/godot-mcp`):

```yaml
mcp_servers:
  godot-mcp:
    type: stdio
    command: godot-mcp
    args:
      - "-p"
      - "."
```

Run Codex in your Godot project directory:

```bash
# Interactive session
codex

# Non-interactive
codex exec "List all scenes in the project"
codex exec "Create a new CharacterBody2D script for the player"

# Verify MCP tools are loaded
codex exec "Get the Godot version"
```

### Cline (VS Code Extension)

Cline reads MCP servers from VS Code user settings. Open `Cmd+Shift+P` -> `Preferences: Open User Settings (JSON)` and add:

```jsonc
{
  "cline.mcpServers": {
    "godot-mcp": {
      "command": "npx",
      "args": ["-y", "@yanhuifair/godot-mcp", "-p", "/path/to/your/godot/project"]
    }
  }
}
```

After saving, click the Cline extension icon in the sidebar, then click "Restart MCP Servers" in the Cline panel. The server should show as connected. Use Cline in any VS Code window — MCP tools are available automatically.

### Roo Code (VS Code Extension)

Roo Code also reads MCP servers from VS Code user settings:

```jsonc
{
  "rooCode.mcpServers": {
    "godot-mcp": {
      "command": "npx",
      "args": ["-y", "@yanhuifair/godot-mcp", "-p", "/path/to/your/godot/project"]
    }
  }
}
```

After saving, open Roo Code and the MCP tools will be available in the tool selection menu. If the server doesn't appear, click the refresh button in the Roo Code MCP settings panel.

### Continue (VS Code / JetBrains)

Continue uses `~/.continue/config.json` (macOS/Linux) or `%USERPROFILE%\.continue\config.json` (Windows).

Add a new entry to the `mcpServers` array. If the array doesn't exist, create it:

```json
{
  "models": [...],
  "mcpServers": [
    {
      "name": "godot-mcp",
      "transport": {
        "type": "stdio",
        "command": "npx",
        "args": ["-y", "@yanhuifair/godot-mcp", "-p", "/path/to/your/godot/project"]
      }
    }
  ]
}
```

After saving, open Continue in VS Code (Cmd+L or Cmd+I). Tools are discovered automatically. Send:

> "List all .tscn files in my project"

### Aider

Aider supports MCP servers via `.aider.conf.yml` (project root or home directory) or command-line flags.

**Config file** (`.aider.conf.yml`):

```yaml
mcp_servers:
  - name: godot-mcp
    command: npx
    args:
      - "-y"
      - "@yanhuifair/godot-mcp"
      - "-p"
      - "."
```

**Command-line**:

```bash
# Single project
aider --mcp-server "godot-mcp=npx -y @yanhuifair/godot-mcp -p ."

# With custom Godot path
aider --mcp-server "godot-mcp=npx -y @yanhuifair/godot-mcp -p /path/to/project"

# With global install
aider --mcp-server "godot-mcp=godot-mcp -p ."
```

Aider's `/tools` command lists all available MCP tools. Use them directly in chat:

```
/tools                    # List all 282 tools
Create a new Node2D scene called "MainMenu"
```

### Cody (Sourcegraph)

Cody is available as a VS Code extension. Add MCP config to VS Code user settings:

```jsonc
{
  "cody.mcpServers": {
    "godot-mcp": {
      "command": "npx",
      "args": ["-y", "@yanhuifair/godot-mcp", "-p", "/path/to/your/godot/project"]
    }
  }
}
```

After saving, open Cody chat (Cmd+Shift+/). Click the MCP icon in the chat input to see available tools. If tools don't appear, reload the VS Code window.

### Goose

Goose uses `~/.config/goose/config.yaml` (macOS/Linux) or `%APPDATA%\goose\config.yaml` (Windows):

```yaml
mcp_servers:
  godot-mcp:
    command: npx
    args:
      - "-y"
      - "@yanhuifair/godot-mcp"
      - "-p"
      - "/path/to/your/godot/project"
```

After saving, restart Goose. Use `/mcp` to list available servers and `/tools` to browse tools:

```
/mcp                      # List connected MCP servers
/tools                    # Browse available tools
List all scenes           # Direct tool invocation
```

### Troubleshooting

| Problem | Solution |
|---|---|
| Server not starting | Ensure Node.js >= 18: `node -v` |
| "Command not found" | Use `npx` method or `npm install -g @yanhuifair/godot-mcp` |
| Plugin not showing in Godot | Click Restart in the Plugins tab, or reopen the project |
| Editor process won't start | Ensure Godot is installed and in PATH, or set `GODOT_PATH` |
| Tools not appearing in chat | Reload VS Code: `Cmd+Shift+P` -> `Developer: Reload Window` |

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

The editor plugin enables real-time interaction with the Godot editor. MCP spawns Godot as a child process when editor tools are invoked, communicating via stdin/stdout with JSON-RPC 2.0.

### Install

```bash
npx @yanhuifair/godot-mcp --enable-plugin -p /path/to/your/godot/project
```

This installs the plugin to `addons/godot-mcp/` and auto-enables it in `project.godot`. No manual steps required.

### Editor Commands (89 tools)

**View & Selection:** `editor_get_selection` `editor_set_selection` `editor_get_open_scene` `editor_read_current_scene` `editor_get_info` `editor_get_rect` `editor_focus` `editor_show_in_filesystem` `editor_open_dock`

**Playback Control:** `editor_play` `editor_stop` `editor_run_specific_scene` `editor_get_running_scene_tree` `editor_get_performance_monitors`

**Edit Operations:** `editor_undo` `editor_redo` `editor_save` `editor_save_all` `editor_reload_scene` `editor_delete_selected`

**Scene Operations:** `editor_create_scene` `editor_instantiate_scene` `editor_set_main_scene` `editor_get_scene_changes`

**Node Operations:** `editor_add_node` `editor_remove_node` `editor_duplicate_node` `editor_rename_node` `editor_reparent_node` `editor_move_node` `editor_get_node_properties` `editor_set_node_properties`

**Scripting:** `editor_create_script` `editor_attach_script` `editor_run_gdscript` `editor_evaluate_expression`

**Debugging:** `editor_set_breakpoint` `editor_remove_breakpoint` `editor_get_breakpoints` `editor_debug_continue` `editor_debug_step` `editor_debug_step_over` `editor_debug_break` `editor_get_stack_trace` `editor_get_debug_variables`

**Signals:** `editor_connect_signal` `editor_disconnect_signal` `editor_list_node_signals`

**File System:** `editor_open_asset` `editor_list_filesystem` `editor_create_folder` `editor_delete_asset` `editor_rename_asset` `editor_move_asset` `editor_duplicate_asset` `editor_reimport_asset` `editor_get_dependency_list`

**Project Settings:** `editor_get_project_setting` `editor_set_project_setting` `editor_get_editor_setting` `editor_set_editor_setting` `editor_get_project_directory`

**Input & Autoloads:** `editor_get_input_map` `editor_add_input_action` `editor_remove_input_action` `editor_get_autoload_list` `editor_add_autoload` `editor_remove_autoload`

**Assets & Baking:** `editor_bake_lightmaps` `editor_bake_navigation` `editor_take_screenshot`

**Class Documentation:** `editor_get_class_list` `editor_get_method_list` `editor_get_class_property_list` `editor_get_class_signal_list` `editor_get_class_doc` `editor_search_help`

**Camera & Viewport:** `editor_get_editor_camera` `editor_set_editor_camera` `editor_toggle_grid` `editor_toggle_snap`

**Other:** `editor_get_recent_scenes` `editor_simulate_key` `editor_get_plugin_list` `editor_enable_plugin` `editor_disable_plugin` `editor_get_error_list` `editor_clear_errors` `editor_health_check`

---

## All Tools

Click each category to expand and see all tools with descriptions.

<details>
<summary>Editor (89 tools) — Live editor control</summary>

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
<summary>Project (22 tools) — Config, input map, file ops, autoloads, validation</summary>

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
<summary>Remaining Categories</summary>

**Domain (11):** `read_curve`, `create_curve`, `read_gradient`, `create_gradient`, `list_paths`, `read_path`, `list_skeletons`, `read_skeleton`, `read_reflection_probe`, `read_multi_mesh`, `create_noise_texture`

**Nodes (8):** `read_character_body`, `read_animated_sprite`, `read_audio_player`, `read_video_player`, `read_parallax`, `read_rich_text`, `read_container`, `read_tab_container`

**Utility (6):** `list_all_signals`, `read_project_icon`, `read_stylebox`, `create_atlas_texture`, `list_popups`, `generate_cohesion_report`

**Rendering (5):** `read_mesh_instance`, `set_mesh_surface_material`, `read_viewport`, `read_area`, `read_raycast`

**Environment (4):** `read_environment`, `list_environments`, `create_environment`, `set_environment_param`

**Inspector (5):** `list_cameras`, `read_camera`, `list_lights`, `set_light_param`, `read_particles`

**Physics (4):** `list_physics_materials`, `read_physics_material`, `create_physics_material`, `read_collision_layers`

**Import (3):** `read_import_config`, `list_import_files`, `write_import_config`

**TileMap (3):** `list_tilesets`, `read_tileset`, `read_tilemap`

**Navigation (3):** `list_nav_regions`, `read_nav_region`, `create_nav_mesh`

**Translation (3):** `list_translations`, `read_translation`, `create_translation`

**Joints (3):** `create_joint`, `set_joint_param`, `list_joints`

**UID (3):** `get_uid`, `update_project_uids`, `list_missing_uids`

**2D Geometry (2):** `create_collision_polygon`, `set_shape_points`

**Diff (2):** `diff_scene`, `diff_resource`

**Other (8):** `read_gdextension`, `list_csproj`, `create_world`, `read_texture_info`

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
npm test             # Run tests (167 via vitest + test_all.mjs)
npm run test:watch   # Watch mode
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
| `--read-only` | Reject all write and delete operations |
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
# Output: godot-mcp-1.3.8.vsix
```

Install in VS Code:

```bash
code --install-extension godot-mcp-1.3.8.vsix
```

---

## Limitations

- Binary `.res` files are not parseable — use `.tres` (text format) for editable resources
- Godot CLI tools (`launch_editor`, `run_project`, `export_project`) require the Godot Engine binary
- `edit_scene` uses text manipulation on `.tscn`; complex refactors may require manual verification
- Screenshots depend on OS-native screenshot utilities

---

## License

MIT
