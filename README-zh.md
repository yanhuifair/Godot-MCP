# <div align="center">Godot MCP</div>

[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
[![Tests](https://img.shields.io/badge/tests-142%20passed-brightgreen)](.)
[![npm](https://img.shields.io/npm/v/@yanhuifair/godot-mcp)](https://www.npmjs.com/package/@yanhuifair/godot-mcp)
[![Node](https://img.shields.io/badge/node-%3E%3D18-green)](.)
[![Godot](https://img.shields.io/badge/godot-4.x-blue)](https://godotengine.org)

[English](README.md) | [中文文档](README-zh.md)

---

**Model Context Protocol (MCP) 服务器**，使 AI 助手能够与 Godot Engine 项目交互。AI 可以读取、检查、修改 Godot 项目的各个方面——从场景文件和脚本到材质、动画、音频总线和实时编辑器。**282 个工具、26 个分类、支持 12 种 AI 客户端。**

| 依赖 | |
|---|---|
| Godot | 4.x（不支持 Godot 3） |
| Node.js | >= 18 |
| AI 客户端 | 任何兼容 MCP 的客户端（参见[配置 AI 客户端](#配置-ai-客户端)） |

---

## 目录

1. [快速开始](#快速开始)
2. [功能](#功能)
3. [架构](#架构)
4. [实现原理](#实现原理)
5. [传输模式](#传输模式)
6. [安装](#安装)
7. [配置 AI 客户端](#配置-ai-客户端)
8. [使用示例](#使用示例)
9. [编辑器插件](#编辑器插件)
10. [全部工具列表](#全部工具列表)
11. [支持格式](#支持格式)
12. [开发](#开发)
13. [构建 VSIX](#构建-vsix)

---

## 快速开始

### 第 1 步：安装编辑器插件

```bash
npx @yanhuifair/godot-mcp --enable-plugin -p /path/to/your/godot/project
```

此命令将插件复制到 `addons/godot-mcp/` 并自动在 `project.godot` 中启用。无需手动操作 Godot。

### 第 2 步：配置 AI 客户端

在项目根目录创建 `.vscode/mcp.json`：

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

参见[配置 AI 客户端](#配置-ai-客户端)了解 Cursor、Claude Desktop、Windsurf、Codex、Cline、Aider、Cody、Goose 等客户端的配置方法。

### 第 3 步：开始对话

AI 客户端自动启动 MCP 服务器。基于文件的工具（.tscn、.tres、.gd）立即可用。编辑器工具（运行、选择节点、调试）会触发 MCP 自动启动 Godot。

```
"列出项目中所有场景"
"找到所有 CharacterBody2D 节点"
"运行游戏并截图"
```

---

## 功能

Godot MCP 通过 282 个工具、26 个分类，全面覆盖 Godot 4.x 引擎。

### 快速演示

```bash
# 一条命令完成全部设置
npx @yanhuifair/godot-mcp --enable-plugin -p .

# 然后向 AI 提问：
> "创建一个以 CharacterBody2D 为玩家的 2D 平台场景"
> "添加一个 Timer 节点，连接其 timeout 信号，编写处理函数"
> "创建一个金属 PBR 材质并应用到所有 MeshInstance3D 节点"
> "配置一个带混响的音频总线，将 SFX 音量设为 -6dB"
> "在第 42 行设置断点，运行游戏，单步调试"
```

### 功能概览

| 分类 | 工具数 | 说明 |
|---|---|---|
| Editor | 89 | 实时编辑器控制——选择、播放、撤销、保存、断点、文件操作、性能 |
| Scene | 22 | 场景 CRUD——节点、信号、变换、碰撞、精灵 |
| Project | 21 | 配置文件、输入映射、文件操作、自动加载、验证、无用资源检测 |
| Script | 21 | GDScript/Shader CRUD、结构分析、代码注入、验证 |
| Domain | 11 | 曲线、渐变、路径、骨骼、反射探针、MultiMesh、噪声纹理 |
| Animation | 10 | AnimationPlayer/AnimationTree——轨道、关键帧、参数 |
| Godot Engine | 9 | 引擎检测、启动编辑器、运行/导出项目、截图 |
| Coverage | 18 | 网格图元、2D 灯光、车辆、弹簧臂、贴花、遮挡器、网格地图 |
| Nodes | 8 | CharacterBody、AnimatedSprite、Audio、Video、Parallax、RichText、Container、Tab |
| Resource | 8 | .tres CRUD、PBR 材质、主题、14 种模板 |
| Audio | 7 | 音频总线布局、效果器、音量 |
| Shader Graph | 8 | VisualShader 图——40+ 节点类型、连接、参数 |
| Utility | 6 | 信号目录、StyleBox、AtlasTexture、弹窗列表、内聚报告 |
| Rendering | 5 | MeshInstance、Viewport、Area、RayCast/ShapeCast |
| Environment | 4 | Environment 读写、4 种预设 |
| Inspector | 5 | Camera、Light、Particle 节点检查 |
| Physics | 4 | PhysicsMaterial CRUD、碰撞层 |
| Import | 3 | .import 文件读写 |
| TileMap | 3 | TileSet 资源、TileMapLayer 检查 |
| Navigation | 3 | NavigationRegion、NavigationMesh |
| Translation | 3 | CSV/PO 翻译文件 |
| Joints | 3 | 物理关节——创建、配置、列表 |
| UID | 3 | 文件 UID 查询、批量更新、缺失检测 |
| 2D Geometry | 2 | CollisionPolygon2D、形状点编辑 |
| Diff | 2 | 场景与资源对比 |
| Other | 4 | GDExtension、C#、World3D、Texture |

**总计：282 个工具，26 个分类**

### 核心能力详解

**项目管理**
读写 `project.godot` 设置、输入映射、自动加载单例和导出预设。执行文件操作（列出、搜索、移动、带 `.bak` 备份的删除），验证项目健康度，检测未使用资源，生成全面的项目报告。

**场景编辑**
完整的 `.tscn` 场景文件 CRUD。添加、删除、修改、克隆和重命名节点。编辑节点属性、变换（位置/旋转/缩放）、碰撞形状和精灵纹理。连接和断开节点间的信号。按类型、属性、分组或信号跨场景搜索节点。

**脚本和着色器编写**
读取、写入和创建 GDScript、C# 和 `.gdshader` 文件。分析脚本结构（类名、信号、导出变量、函数）。向现有脚本注入函数、信号和 `@export` 变量。验证 GDScript 的常见语法问题。验证和编译着色器。管理 VisualShader 图——添加、删除、连接和配置节点。

**资源管理**
读取、写入和创建 `.tres` 资源文件，提供 14 种内置模板（StandardMaterial3D、ShaderMaterial、ORMMaterial3D、CanvasItemMaterial 等）。检查和修改 PBR 材质参数。读取 Theme 资源，支持按类型分组的属性。

**动画管线**
完整的 AnimationPlayer 和 AnimationTree 支持：列出动画、读取轨道和关键帧、创建新动画、添加/删除轨道、在特定时间设置关键帧、配置动画库、检查 AnimationTree 状态机。

**音频配置**
读取、创建和修改音频总线布局。添加和删除音频总线，附加效果器（14 种类型：Reverb、Delay、Chorus、Compressor 等），以 dB 为单位设置总线音量。

**物理与碰撞**
检查 VehicleBody3D、SoftBody3D 和物理材质。创建碰撞形状。从项目设置中读取碰撞层和掩码配置。创建物理关节（PinJoint、HingeJoint、SliderJoint 等）。

**渲染与环境**
检查 MeshInstance3D、Viewport、Area 和 RayCast 节点。创建和配置 Environment 资源（4 种预设）。管理 2D 灯光、贴花和遮挡器。读取 3D 网格图元（Box、Sphere、Capsule、Cylinder、Torus 等）。

**实时编辑器控制（89 个工具）**
通过 TCP 或 stdio 桥与 Godot 编辑器实时交互：选择节点、运行/停止/暂停项目、撤销/重做、保存场景、创建和附加脚本、设置断点、单步调试、求值表达式、控制 3D 视口相机、烘焙光照贴图和导航网格、管理插件、模拟按键。

**可视着色器图**
以编程方式创建和修改 VisualShader 图。从 40+ 类型的目录（常量、数学运算、纹理、输入）中添加节点，连接节点端口，设置节点参数，列出可用节点类型及其默认输入/输出配置。

**TileMap、导航和翻译**
检查 TileSet 资源和 TileMapLayer 节点。列出和读取 NavigationRegion 节点，创建 NavigationMesh 资源。读取和创建带搜索功能的 CSV/PO 翻译文件。

---

## 架构

### 系统概览

```
                        MCP 协议 (stdio/SSE/Streamable HTTP)
  +-----------------+                                        +------------------+
  |   AI 客户端       |<-------------------------------------->|  Godot MCP 服务器 |
  |  (VS Code/Cursor |                                        |  (TypeScript)     |
  |   Claude 等)     |                                        |                  |
  +-----------------+                                        |  +-------------+ |
                                                             |  | 工具注册表    | |
                                                             |  |  (282 工具)  | |
                                                             |  +------+------+ |
                                                             |         |        |
                                                             |    +----v-----+  |
                        文件 I/O（直接）                       |    | 解析器      |  |
  +------------------+<-------------------------------------->|    | .tscn      |  |
  |   Godot 项目       |                                       |    | .tres      |  |
  |   磁盘上的文件     |                                       |    | .godot     |  |
  |  (.tscn/.tres/.gd)|                                       |    +----------+  |
  +------------------+                                       |                  |
                                                             |  +-------------+ |
                        stdin/stdout（子进程）                 |  | Godot CLI   | |
  +------------------+<-------------------------------------->|  | (启动/编辑)  | |
  |   Godot 编辑器     |                                       |  +-------------+ |
  |  (GDScript 插件)  |                                       +------------------+
  |  TCP 端口 9876    |
  |  97 条命令        |
  +------------------+
```

### 通信路径

服务器根据操作类型使用三种不同的通信路径：

1. **直接文件 I/O** — 对于基于文件的工具（read_scene、write_script、create_resource 等），服务器使用自定义解析器直接读写磁盘上的 Godot 项目文件。无需启动 Godot 进程。这是最快的路径。

2. **Godot CLI** — 对于引擎操作（launch_editor、run_project、export_project、get_godot_version），服务器将 Godot 作为子进程启动，通过命令行参数和 stdout/stderr 进行通信。

3. **编辑器桥（双模式）** — 对于实时编辑器工具（editor_get_selection、editor_play、editor_set_breakpoint 等），MCP 服务器与运行中的 Godot 编辑器实例通信。支持两种模式：
   - **TCP 模式**（默认）：连接到已在 `localhost:9876` 上运行的 Godot。编辑器插件监听此端口。
   - **Stdio 模式**（回退）：以 `--editor --path <project>` 启动 Godot 子进程，设置 `MCP_STDIO=true`，通过 stdin/stdout 使用 JSON-RPC 通信，响应以 `__MCP__:` 前缀标记。此模式根据需要自动启动和重新启动 Godot（最多 3 次）。

### 项目结构

```
godot-mcp/
├── src/
│   ├── index.ts              # CLI 入口点，参数解析，传输调度
│   ├── server.ts             # MCP 服务器工厂，工具注册，请求路由
│   ├── tools/                # 29 个工具处理文件（每个分类一个）
│   │   ├── register.ts       # 集中注册（282 个工具）
│   │   ├── project.ts        # 项目管理工具
│   │   ├── scene.ts          # 场景编辑工具
│   │   ├── script.ts         # 脚本和着色器工具
│   │   ├── editor.ts         # 实时编辑器桥（TCP + stdio，持久连接）
│   │   ├── resource.ts       # 资源/材质/主题工具
│   │   ├── godot.ts          # Godot 引擎控制
│   │   ├── animation.ts      # 动画管线
│   │   ├── audio.ts          # 音频总线管理
│   │   ├── scene_inspectors.ts  # 2D 灯光、车辆、弹簧臂等
│   │   ├── mesh.ts           # 3D 网格图元
│   │   ├── shader_graph.ts   # VisualShader 图编辑
│   │   └── ...（另 16 个：domain、physics、navigation、joints 等）
│   ├── parsers/
│   │   ├── scene_parser.ts   # .tscn 文件解析器（段、节点、连接）
│   │   ├── resource_parser.ts # .tres 文件解析器
│   │   ├── config_parser.ts  # project.godot INI 解析器
│   │   └── parser_helpers.ts # 共享工具（引号处理、括号平衡）
│   ├── transports/
│   │   ├── stdio.ts          # Stdio 传输（默认，用于本地 AI 客户端）
│   │   └── http-server.ts    # SSE + Streamable HTTP 传输
│   └── utils/
│       ├── types.ts          # TypeScript 类型定义
│       ├── file_utils.ts     # 文件系统操作，带路径穿越防护
│       ├── godot_cli.ts      # Godot 二进制检测，进程管理
│       ├── registry.ts       # ToolRegistry 类，支持排序列表
│       ├── errors.ts         # 结构化错误码
│       └── cache.ts          # 基于 TTL 的文件缓存
├── addons/
│   └── godot-mcp/            # Godot 编辑器插件
│       ├── plugin.cfg         # 插件元数据
│       └── plugin.gd          # stdin 读取器、TCP 服务器、97 个命令处理器
├── test/                     # Vitest 套件（142 个测试）+ 旧版 .mjs 套件
│   ├── test_all.mjs          # 旧版独立套件（167 项工具检查）
│   ├── test_editor.mjs       # Editor 桥 TCP 测试
│   ├── test_runner.mjs       # 早期集成测试
│   ├── tools.test.ts         # Vitest 工具处理测试
│   ├── parsers.test.ts       # Vitest 解析器测试
│   ├── structural.test.ts    # Vitest 结构测试
│   ├── integration_mcp_test.test.ts  # Vitest 集成测试
│   ├── fixtures/             # 测试夹具文件（.tscn、.tres、.gd）
│   └── test-project/         # 独立 Godot 测试项目
├── scripts/
│   └── sync-addons.js        # 构建后：同步 addons 到目标 Godot 工程
├── package.json
└── tsconfig.json
```

---

## 实现原理

### 基于文件的解析

所有 Godot 文件格式（.tscn、.tres、project.godot）均使用 TypeScript 自定义解析器直接解析。这消除了启动 Godot 进行文件操作的需要，使读写几乎是即时完成的。

**场景解析器** (`parsers/scene_parser.ts`)：
- 解析所有 `.tscn` 段：`[gd_scene]`、`[ext_resource]`、`[sub_resource]`、`[node]`、`[connection]`
- 处理带括号/引号平衡检测的多行属性值
- 从父引用构建节点层级树
- 支持往返序列化以确保安全编辑

**资源解析器** (`parsers/resource_parser.ts`)：
- 解析基于段结构的 `.tres` 文本资源
- 通过 `GDROM` 魔术头检测二进制 `.res` 文件（返回不支持错误）
- 提取头、外部资源、子资源和主资源属性

**配置解析器** (`parsers/config_parser.ts`)：
- 解析 INI 风格的 `project.godot` 和 `.cfg` 文件
- 处理基于缩进的多行值续行
- 保留注释以支持往返编辑

### 双模式编辑器桥

编辑器插件（`addons/godot-mcp/plugin.gd`）实现了 97 个命令处理器，封装了 Godot 的 `EditorInterface` API。通信通过两个通道使用 JSON-RPC 2.0：

- **TCP 模式**（端口 9876）：当 Godot 独立运行时，插件接受 TCP 连接并处理命令。这是交互式开发的首选模式。

- **Stdio 模式**：当 MCP 服务器将 Godot 作为子进程启动时（`godot --editor --path <project>`），插件从 stdin 读取 JSON-RPC 请求，并以 `__MCP__:` 前缀标记将响应写入 stdout。服务器过滤这些标记以区分 JSON-RPC 和 Godot 的标准输出。

桥接自动检测使用哪种模式：首先尝试快速 TCP 健康检查（800ms 超时），如果未找到现有实例，则回退到启动 Godot。如果启动的进程意外退出，会自动重新启动（最多 3 次）。

### 参数规范化

为适应 AI 客户端可能使用 `snake_case` 或 `camelCase` 参数命名，服务器会自动将 30+ 个常见参数名规范化为其 Zod schema 所使用的 `snake_case` 键（`projectPath` -> `project_path`、`scenePath` -> `scene_path` 等），再进行验证。对外公布的 `inputSchema` 始终使用 `snake_case`，因此 `snake_case` 入参原样通过。

### 安全保障

- **路径穿越防护**：所有文件操作验证解析后的路径保持在项目根目录内
- **自动备份**：脚本和场景文件的写操作会创建 `.bak` 备份副本
- **只读模式**：`--read-only` 标志拒绝所有写和删除操作
- **结构化错误**：所有错误使用类型化的错误码（`FILE_NOT_FOUND`、`PARSE_ERROR`、`VALIDATION_ERROR` 等），并附有可操作的提示

---

## 传输模式

Godot MCP 支持三种传输协议。根据客户端和部署需求选择。

| 模式 | 协议 | 使用场景 | 默认 |
|---|---|---|---|
| **Stdio** | 标准 I/O（stdin/stdout） | 本地 AI 客户端（VS Code、Claude Desktop、Cursor、Windsurf） | 是 |
| **SSE** | Server-Sent Events over HTTP | 旧版 MCP 客户端、Web 客户端、远程访问 | |
| **Streamable HTTP** | MCP 2025 Streamable HTTP | 现代 MCP 客户端、生产部署、远程访问 | |

### Stdio（默认）

通过标准 I/O（stdin/stdout）进行 JSON-RPC 通信。适合本地开发——无需网络配置。

```bash
npx @yanhuifair/godot-mcp -p /path/to/your/godot/project
```

### SSE（Server-Sent Events）

基于 HTTP 的传输，使用 SSE 进行服务器到客户端的流式传输。兼容不支持 Streamable HTTP 的旧版 MCP 客户端。

```bash
npx @yanhuifair/godot-mcp -t sse --port 3000 -p /path/to/your/godot/project
```

| 选项 | 描述 | 默认值 |
|---|---|---|
| `-t sse` | 启用 SSE 传输模式 | — |
| `--port <number>` | HTTP 监听端口 | `3000` |
| `--host <string>` | 绑定地址（使用 `0.0.0.0` 允许远程访问） | `127.0.0.1` |

客户端配置：

```json
{
  "mcpServers": {
    "godot-mcp": {
      "url": "http://127.0.0.1:3000/sse"
    }
  }
}
```

### Streamable HTTP（MCP 2025）

基于 MCP 2025 规范的现代 HTTP 传输。支持会话管理、断线重连恢复，以及有状态和无状态两种模式。

```bash
npx @yanhuifair/godot-mcp -t streamable-http --port 3000 -p /path/to/your/godot/project
```

端点：

| 方法 | 路径 | 用途 |
|---|---|---|
| `GET` | `/mcp` | 建立 SSE 流（支持 `Last-Event-ID` 重连） |
| `POST` | `/mcp` | 发送 JSON-RPC 请求/通知 |
| `DELETE` | `/mcp` | 关闭会话 |

客户端配置：

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

### 同时启用所有传输

```bash
npx @yanhuifair/godot-mcp -t all --port 3000 -p /path/to/your/godot/project
```

同时启动：Stdio + SSE（`/sse`）+ Streamable HTTP（`/mcp`）+ 健康检查（`/health`）

```bash
curl http://127.0.0.1:3000/health
# {"status":"ok","version":"1.3.9","projectRoot":"/path/to/project","endpoints":{...}}
```

---

## 安装

### npx（推荐，无需预安装）

```bash
npx -y @yanhuifair/godot-mcp -p /path/to/your/godot/project
```

### 全局安装

```bash
npm install -g @yanhuifair/godot-mcp
```

### 从源码构建

```bash
git clone https://github.com/yanhuifair/Godot-MCP.git
cd godot-mcp
npm install
npm run build
```

### 环境变量

| 变量 | 描述 |
|---|---|
| `GODOT_PATH` | Godot 二进制路径（可选，自动检测） |
| `GODOT_MCP_TEST_PROJECT` | 集成测试项目路径 |

Godot 自动检测顺序：`GODOT_PATH` -> `/Applications/Godot.app` -> `PATH` -> snap/flatpak -> Windows Program Files

---

## 配置 AI 客户端

### VS Code / GitHub Copilot

**方式 1：项目级配置（推荐）**

在 Godot 项目根目录创建 `.vscode/mcp.json`：

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

保存后，重新加载 VS Code（`Cmd+Shift+P` -> `Developer: Reload Window`）。打开 Copilot Chat（`Cmd+Shift+I`），在聊天输入框中查看工具指示器。发送测试消息：

> "列出项目中所有场景"

提示：将 `.vscode/mcp.json` 提交到仓库，团队每个成员都能自动获得 MCP 服务器。

**方式 2：用户级配置**

打开 VS Code 设置（`Cmd+Shift+P` -> `Preferences: Open User Settings (JSON)`）并添加：

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

### Cursor

支持项目级和用户级两种 MCP 配置。

**项目级** — 项目根目录下的 `.cursor/mcp.json`：

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

**用户级** — `~/.cursor/mcp.json`（macOS/Linux）或 `%USERPROFILE%\.cursor\mcp.json`（Windows）：

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

配置完成后，打开 Cursor Settings -> MCP 验证服务器以绿色状态指示器显示。在聊天中使用 Agent 模式（Cmd+L）调用 MCP 工具。

### Claude Desktop

**macOS**：`~/Library/Application Support/Claude/claude_desktop_config.json`
**Windows**：`%APPDATA%\Claude\claude_desktop_config.json`

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

保存后，完全退出并重启 Claude Desktop。查看聊天输入框中的锤子图标以确认 MCP 工具已加载。发送测试：

> "获取 Godot 版本"

### Claude CLI (`claude`)

先安装 Claude CLI，然后注册 MCP 服务器：

```bash
# 一次性注册
claude mcp add godot-mcp -- npx -y @yanhuifair/godot-mcp -p /path/to/your/godot/project

# 带环境变量（例如自定义 Godot 路径）
claude mcp add godot-mcp -e GODOT_PATH=/path/to/godot -- npx -y @yanhuifair/godot-mcp -p .

# 列出已注册的服务器
claude mcp list

# 如需删除
claude mcp remove godot-mcp
```

然后交互式或非交互式使用：

```bash
# 交互式会话
claude

# 非交互式（管道模式）
echo "列出我 Godot 项目中的所有场景" | claude -p
```

### Windsurf

`~/.codeium/windsurf/mcp_config.json`（macOS/Linux）或 `%USERPROFILE%\.codeium\windsurf\mcp_config.json`（Windows）：

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

保存后重启 Windsurf。打开 Cascade（Cmd+L），在 MCP 面板中验证工具已出现。

### OpenAI Codex CLI

Codex 使用项目根目录下的 `.codex.toml` 或 `.codex.yaml`，或 `~/.codex/config.yaml` 作为用户级配置。

**项目级**（Godot 项目中的 `.codex.toml`）：

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

**全局安装**（如果运行了 `npm install -g @yanhuifair/godot-mcp`）：

```yaml
mcp_servers:
  godot-mcp:
    type: stdio
    command: godot-mcp
    args:
      - "-p"
      - "."
```

在 Godot 项目目录中运行 Codex：

```bash
# 交互式会话
codex

# 非交互式
codex exec "列出项目中所有场景"
codex exec "为玩家创建一个新的 CharacterBody2D 脚本"

# 验证 MCP 工具已加载
codex exec "获取 Godot 版本"
```

### Cline（VS Code 扩展）

Cline 从 VS Code 用户设置中读取 MCP 服务器。打开 `Cmd+Shift+P` -> `Preferences: Open User Settings (JSON)` 并添加：

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

保存后，点击侧边栏中的 Cline 扩展图标，然后在 Cline 面板中点击「重启 MCP 服务器」。服务器应显示为已连接。

### Roo Code（VS Code 扩展）

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

保存后打开 Roo Code，MCP 工具将在工具选择菜单中可用。

### Continue（VS Code / JetBrains）

Continue 使用 `~/.continue/config.json`（macOS/Linux）或 `%USERPROFILE%\.continue\config.json`（Windows）。

在 `mcpServers` 数组中添加新条目。如果数组不存在，请创建：

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

保存后在 VS Code 中打开 Continue（Cmd+L 或 Cmd+I）。工具会自动发现。发送：

> "列出项目中所有 .tscn 文件"

### Aider

Aider 通过 `.aider.conf.yml`（项目根目录或家目录）或命令行标志支持 MCP 服务器。

**配置文件**（`.aider.conf.yml`）：

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

**命令行**：

```bash
# 单个项目
aider --mcp-server "godot-mcp=npx -y @yanhuifair/godot-mcp -p ."

# 带自定义 Godot 路径
aider --mcp-server "godot-mcp=npx -y @yanhuifair/godot-mcp -p /path/to/project"
```

Aider 的 `/tools` 命令列出所有可用 MCP 工具。

### Cody（Sourcegraph）

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

保存后打开 Cody 聊天（Cmd+Shift+/）。点击聊天输入框中的 MCP 图标查看可用工具。

### Goose

Goose 使用 `~/.config/goose/config.yaml`（macOS/Linux）或 `%APPDATA%\goose\config.yaml`（Windows）：

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

保存后重启 Goose。使用 `/mcp` 列出已连接的服务器，使用 `/tools` 浏览工具：

```
/mcp                      # 列出已连接的 MCP 服务器
/tools                    # 浏览可用工具
列出所有场景              # 直接调用工具
```

### 故障排除

| 问题 | 解决方案 |
|---|---|
| 服务器未启动 | 确保 Node.js >= 18：`node -v` |
| "命令未找到" | 使用 `npx` 方式或 `npm install -g @yanhuifair/godot-mcp` |
| 插件未在 Godot 中显示 | 在插件标签页中点击重启，或重新打开项目 |
| 编辑器进程无法启动 | 确保 Godot 已安装且在 PATH 中，或设置 `GODOT_PATH` |
| 工具未在聊天中出现 | 重新加载 VS Code：`Cmd+Shift+P` -> `Developer: Reload Window` |

---

## 使用示例

以下示例展示了你可以向 AI 助手提出的问题。每条对应一个或多个 MCP 工具（括号中注明）。

### 项目探索

| 命令 | 使用的工具 |
|---|---|
| "显示项目结构" | `list_project_files` |
| "生成项目概览报告" | `generate_project_report` |
| "配置了哪些自动加载？" | `list_autoloads` |
| "检查项目是否有损坏的引用" | `validate_project` |
| "找出应该清理的未使用资源" | `find_unused_assets` |

### 场景创建和编辑

| 命令 | 使用的工具 |
|---|---|
| "创建一个以 CharacterBody2D 为根的 2D 平台场景" | `create_scene` |
| "在 Player 下添加一个 Cooldown Timer 节点" | `add_node` |
| "将 Enemy 节点克隆为 Enemy2" | `clone_node` |
| "将 body_entered 信号从 Player 连接到 _on_body_entered" | `connect_signal` |
| "将 Player 碰撞形状设置为 CapsuleShape2D" | `set_collision_shape` |
| "将 player.png 纹理加载到 Sprite 上" | `load_sprite` |
| "在所有场景中搜索 Timer 节点" | `find_nodes_in_scenes` |
| "列出所有 Button 和 Label 节点" | `list_ui_nodes` |

### 脚本和着色器

| 命令 | 使用的工具 |
|---|---|
| "分析 player.gd 的结构" | `read_script_structure` |
| "向 Player 脚本添加一个 dash 方法" | `add_script_function` |
| "在所有脚本中搜索对 'velocity' 的引用" | `search_in_scripts` |
| "验证所有 GDScript 是否有语法错误" | `validate_script` |
| "创建一个带顶点位移的新空间着色器" | `create_shader` |
| "验证并编译 hurricane 着色器" | `validate_shader` + `compile_shader` |

### 材质和资源

| 命令 | 使用的工具 |
|---|---|
| "创建一个粗糙度为 0.3 的金属 PBR 材质" | `create_resource` |
| "按类型分组列出所有材质" | `list_materials` |
| "更改 player_material 的反照率颜色" | `set_material_param` |
| "显示项目中所有 .tres 文件" | `list_resources` |

### 动画

| 命令 | 使用的工具 |
|---|---|
| "显示所有玩家动画及其关键帧" | `read_animation` |
| "向 idle 动画添加位置轨道" | `add_animation_track` |
| "在 0.5 秒处设置值 Vector2(100, 0) 的关键帧" | `set_keyframe` |
| "显示 AnimationTree 状态机" | `read_animation_tree` |

### 音频

| 命令 | 使用的工具 |
|---|---|
| "显示音频总线布局" | `read_audio_bus_layout` |
| "向 Master 总线添加混响效果" | `add_bus_effect` |
| "将 SFX 总线音量设置为 -6 dB" | `set_bus_volume` |
| "列出所有 .wav 和 .ogg 文件" | `list_audio_files` |

### 运行、调试和导出

| 命令 | 使用的工具 |
|---|---|
| "以 1280x720 分辨率运行游戏并截图" | `run_project` + `capture_screenshot` |
| "在 player.gd 第 42 行设置断点" | `editor_set_breakpoint` |
| "单步调试并显示局部变量" | `editor_debug_step` + `editor_get_debug_variables` |
| "停止正在运行的游戏" | `stop_project` |
| "为 macOS 导出项目" | `export_project` |

---

## 编辑器插件

编辑器插件实现了与 Godot 编辑器的实时交互。当调用编辑器工具时，MCP 将 Godot 作为子进程启动，通过 stdin/stdout 使用 JSON-RPC 2.0 进行通信。

### 安装

```bash
npx @yanhuifair/godot-mcp --enable-plugin -p /path/to/your/godot/project
```

此命令将插件安装到 `addons/godot-mcp/` 并自动在 `project.godot` 中启用。无需手动操作。

### 编辑器命令（89 个工具）

**视图和选择：** `editor_get_selection` `editor_set_selection` `editor_get_open_scene` `editor_read_current_scene` `editor_get_info` `editor_get_rect` `editor_focus` `editor_show_in_filesystem` `editor_open_dock`

**播放控制：** `editor_play` `editor_stop` `editor_run_specific_scene` `editor_get_running_scene_tree` `editor_get_performance`

**编辑操作：** `editor_undo` `editor_redo` `editor_save` `editor_save_all` `editor_reload_scene` `editor_delete_selected`

**场景操作：** `editor_create_scene` `editor_instantiate_scene` `editor_set_main_scene` `editor_get_scene_changes`

**节点操作：** `editor_add_node` `editor_remove_node` `editor_duplicate_node` `editor_rename_node` `editor_reparent_node` `editor_move_node` `editor_get_node_properties` `editor_set_node_properties`

**脚本：** `editor_create_script` `editor_attach_script` `editor_run_gdscript` `editor_evaluate_expression`

**调试：** `editor_set_breakpoint` `editor_remove_breakpoint` `editor_get_breakpoints` `editor_debug_continue` `editor_debug_step` `editor_debug_step_over` `editor_debug_break` `editor_get_stack_trace` `editor_get_debug_variables`

**信号：** `editor_connect_signal` `editor_disconnect_signal` `editor_list_node_signals`

**文件系统：** `editor_open_asset` `editor_list_filesystem` `editor_create_folder` `editor_delete_asset` `editor_rename_asset` `editor_move_asset` `editor_duplicate_asset` `editor_reimport_asset` `editor_get_dependencies`

**项目设置：** `editor_get_project_setting` `editor_set_project_setting` `editor_get_editor_setting` `editor_set_editor_setting` `editor_get_project_directory`

**输入和自动加载：** `editor_get_input_map` `editor_add_input_action` `editor_remove_input_action` `editor_get_autoloads` `editor_add_autoload` `editor_remove_autoload`

**资源和烘焙：** `editor_bake_lightmaps` `editor_bake_navigation` `editor_take_screenshot`

**类文档：** `editor_get_class_list` `editor_get_method_list` `editor_get_class_properties` `editor_get_class_signals` `editor_get_class_doc` `editor_search_help`

**相机和视口：** `editor_get_camera` `editor_set_camera` `editor_toggle_grid` `editor_toggle_snap`

**其他：** `editor_get_recent_scenes` `editor_simulate_key` `editor_get_plugin_list` `editor_enable_plugin` `editor_disable_plugin` `editor_get_errors` `editor_clear_errors` `editor_health_check`

---

## 全部工具列表

点击每个分类展开查看所有工具及其描述。

<details>
<summary>Editor（89 个工具）— 实时编辑器控制</summary>

| 工具 | 描述 |
|---|---|
| `editor_get_selection` | 获取编辑器中选择的节点 |
| `editor_set_selection` | 在编辑器中选择节点 |
| `editor_get_open_scene` | 获取当前打开的场景路径 |
| `editor_read_current_scene` | 读取实时编辑器场景树 |
| `editor_get_info` | 获取编辑器状态信息 |
| `editor_get_rect` | 获取编辑器窗口尺寸 |
| `editor_focus` | 将 Godot 编辑器窗口置于前台 |
| `editor_show_in_filesystem` | 在文件系统面板中定位文件 |
| `editor_open_dock` | 打开面板：filesystem、inspector、scene、output |
| `editor_play` | 从编辑器运行项目 |
| `editor_stop` | 在编辑器中停止运行 |
| `editor_run_specific_scene` | 运行特定场景（非主场景） |
| `editor_get_running_scene_tree` | 游戏运行时获取实时场景树 |
| `editor_get_performance` | 游戏运行时获取 FPS、绘制调用、内存使用 |
| `editor_undo` | 撤销上一步编辑器操作 |
| `editor_redo` | 重做上一步撤销的操作 |
| `editor_save` | 保存编辑器中的当前场景 |
| `editor_save_all` | 保存所有打开的场景 |
| `editor_reload_scene` | 保存并重新加载当前场景 |
| `editor_delete_selected` | 删除当前选中的节点 |
| `editor_create_scene` | 在编辑器中创建并打开新场景 |
| `editor_instantiate_scene` | 将 PackedScene 实例化到当前场景中 |
| `editor_set_main_scene` | 设置项目主场景 |
| `editor_get_scene_changes` | 检查当前场景是否有未保存的更改 |
| `editor_add_node` | 向编辑器中当前打开的场景添加节点 |
| `editor_remove_node` | 从当前打开的场景中删除节点 |
| `editor_duplicate_node` | 复制节点及其子节点、脚本和信号 |
| `editor_rename_node` | 在编辑器中重命名节点 |
| `editor_reparent_node` | 将节点移动到新的父节点 |
| `editor_move_node` | 将 2D/3D 节点移动到新位置 |
| `editor_get_node_properties` | 读取节点的所有编辑器可见属性 |
| `editor_set_node_properties` | 一次性设置节点的多个属性 |
| `editor_create_script` | 在编辑器中创建并打开新的 GDScript |
| `editor_attach_script` | 将脚本附加到编辑器中的节点 |
| `editor_run_gdscript` | 在编辑器上下文中执行任意 GDScript 代码 |
| `editor_evaluate_expression` | 在调试器/编辑器上下文中求值 GDScript 表达式 |
| `editor_set_breakpoint` | 在脚本中设置断点 |
| `editor_remove_breakpoint` | 从脚本中移除断点 |
| `editor_get_breakpoints` | 列出所有断点 |
| `editor_debug_continue` | 在调试器中继续执行 |
| `editor_debug_step` | 在调试器中步入下一行 |
| `editor_debug_step_over` | 在调试器中步过当前行 |
| `editor_debug_break` | 在调试器中停止执行（中断） |
| `editor_get_stack_trace` | 从调试器获取当前调用栈 |
| `editor_get_debug_variables` | 从调试器获取局部变量 |
| `editor_connect_signal` | 在编辑器中连接节点间的信号 |
| `editor_disconnect_signal` | 断开节点间的信号 |
| `editor_list_node_signals` | 列出节点上的信号及其连接 |
| `editor_open_asset` | 在编辑器中打开资源 |
| `editor_list_filesystem` | 列出编辑器文件系统中的文件和目录 |
| `editor_create_folder` | 通过编辑器文件系统在项目中创建目录 |
| `editor_delete_asset` | 通过编辑器删除文件或文件夹 |
| `editor_rename_asset` | 通过编辑器文件系统重命名文件 |
| `editor_move_asset` | 通过编辑器将文件移动到新位置 |
| `editor_duplicate_asset` | 通过编辑器文件系统复制文件 |
| `editor_reimport_asset` | 强制重新导入资源 |
| `editor_get_dependencies` | 获取文件的所有资源依赖 |
| `editor_get_project_setting` | 通过编辑器 API 读取项目设置 |
| `editor_set_project_setting` | 通过编辑器 API 设置项目设置（自动保存） |
| `editor_get_editor_setting` | 读取编辑器偏好值 |
| `editor_set_editor_setting` | 设置编辑器偏好 |
| `editor_get_project_directory` | 获取项目 res:// 和 user:// 路径 |
| `editor_get_input_map` | 通过编辑器 API 读取输入映射 |
| `editor_add_input_action` | 通过编辑器 API 添加输入动作 |
| `editor_remove_input_action` | 通过编辑器 API 删除输入动作 |
| `editor_get_autoloads` | 通过编辑器 API 列出自动加载单例 |
| `editor_add_autoload` | 通过编辑器 API 添加自动加载单例 |
| `editor_remove_autoload` | 通过编辑器 API 删除自动加载单例 |
| `editor_bake_lightmaps` | 触发光照贴图烘焙 |
| `editor_bake_navigation` | 为当前场景中所有 NavigationRegion 节点烘焙导航网格 |
| `editor_take_screenshot` | 将编辑器视口截图保存为 PNG |
| `editor_get_class_list` | 列出所有 Godot 类，可选过滤 |
| `editor_get_method_list` | 列出 Godot 类的所有方法 |
| `editor_get_class_properties` | 列出类的所有编辑器可见属性 |
| `editor_get_class_signals` | 列出 Godot 类的所有信号 |
| `editor_get_class_doc` | 在浏览器中打开 Godot 类文档 |
| `editor_search_help` | 在浏览器中搜索 Godot 文档 |
| `editor_get_camera` | 获取 3D 编辑器视口相机位置 |
| `editor_set_camera` | 设置 3D 编辑器视口相机位置 |
| `editor_toggle_grid` | 切换 3D 网格可见性 |
| `editor_toggle_snap` | 切换 3D 吸附模式 |
| `editor_get_recent_scenes` | 列出最近打开的场景路径 |
| `editor_simulate_key` | 在编辑器中模拟按键（如 F5 运行、Ctrl+S 保存） |
| `editor_get_plugin_list` | 列出所有已安装的编辑器插件及其启用状态 |
| `editor_enable_plugin` | 启用指定名称的编辑器插件 |
| `editor_disable_plugin` | 禁用指定名称的编辑器插件 |
| `editor_get_errors` | 获取当前编辑器错误/日志列表 |
| `editor_clear_errors` | 清除编辑器错误列表 |
| `editor_health_check` | 检查 Godot 编辑器插件是否可达 |

</details>

<details>
<summary>Scene（22 个工具）— 完整场景 CRUD + 节点 + 信号 + 变换</summary>

| 工具 | 描述 |
|---|---|
| `read_scene` | 读取 .tscn 场景文件 |
| `create_scene` | 从模板创建新场景 |
| `edit_scene` | 对场景应用批量操作 |
| `list_scenes` | 列出所有 .tscn 场景文件 |
| `search_scene_content` | 在 .tscn 内容中全文搜索 |
| `scene_dependency_graph` | 分析场景间的依赖关系 |
| `add_node` | 向场景添加节点 |
| `remove_node` | 从场景中删除节点 |
| `modify_node` | 修改节点属性或重命名 |
| `clone_node` | 在场景中深度克隆节点 |
| `rename_node` | 在场景中重命名节点 |
| `attach_script` | 将脚本附加到节点 |
| `connect_signal` | 在节点间连接信号 |
| `disconnect_signal` | 断开信号连接 |
| `set_node_position` | 设置节点位置（自动检测 2D/3D） |
| `set_node_rotation` | 设置节点旋转（2D/3D） |
| `set_node_scale` | 设置节点缩放（2D/3D） |
| `transform_node` | 对节点应用变换 |
| `set_collision_shape` | 为 CollisionShape 节点设置碰撞形状 |
| `load_sprite` | 将纹理加载到 Sprite2D 节点上 |
| `list_ui_nodes` | 列出 Control 派生的 UI 节点 |
| `find_nodes_in_scenes` | 按类型/属性跨场景搜索节点 |

</details>

<details>
<summary>Project（21 个工具）— 配置、输入映射、文件操作、自动加载、验证</summary>

| 工具 | 描述 |
|---|---|
| `list_project_files` | 列出 Godot 项目中的文件和目录 |
| `read_project_config` | 读取和解析 project.godot |
| `write_project_config` | 向 project.godot 写入配置值 |
| `read_export_presets` | 从 export_presets.cfg 读取导出预设 |
| `read_input_map` | 读取带键位绑定的输入映射 |
| `write_input_action` | 创建新的输入动作 |
| `remove_input_action` | 删除输入动作 |
| `add_input_binding` | 向动作添加按键/鼠标/手柄绑定 |
| `list_autoloads` | 列出所有自动加载单例 |
| `add_autoload` | 添加自动加载条目 |
| `remove_autoload` | 删除自动加载条目 |
| `search_in_project` | 跨项目文件搜索文本 |
| `delete_file` | 删除文件并保留 .bak 备份 |
| `move_file` | 在项目内移动/重命名文件 |
| `create_directory` | 在项目中创建目录 |
| `duplicate_scene` | 复制场景文件 |
| `duplicate_resource` | 复制 .tres 资源 |
| `generate_project_report` | 生成全面的项目概览 |
| `find_unused_assets` | 查找孤立的项目文件 |
| `validate_project` | 验证项目是否有损坏的引用、空 UID |
| `list_groups` | 列出所有场景中的节点分组 |

</details>

<details>
<summary>Script（21 个工具）— GDScript/Shader CRUD + 分析 + 注入 + 验证</summary>

| 工具 | 描述 |
|---|---|
| `read_script` | 读取带行号的脚本文件 |
| `write_script` | 向脚本文件写入内容 |
| `create_script` | 从模板创建新脚本 |
| `list_scripts` | 按类型分组列出所有脚本文件 |
| `read_script_structure` | 分析 GDScript 结构 |
| `search_in_scripts` | 在脚本中搜索并附带函数上下文 |
| `validate_script` | 验证 GDScript 的常见问题 |
| `add_script_function` | 向 GDScript 追加函数 |
| `add_script_signal` | 向 GDScript 添加信号声明 |
| `add_script_export` | 向 GDScript 添加 @export 变量 |
| `read_shader` | 读取 .gdshader 文件 |
| `create_shader` | 从模板创建新的 .gdshader |
| `list_shaders` | 列出所有 .gdshader 文件 |
| `write_shader` | 向 .gdshader 写入内容 |
| `validate_shader` | 验证 .gdshader 的语法问题 |
| `compile_shader` | 通过 Godot 编辑器编译（重新导入）.gdshader |
| `list_visual_shaders` | 列出 VisualShader 图文件 |
| `read_visual_shader` | 读取 VisualShader 图 |
| `read_shader_include` | 读取 .gdshaderinc 文件 |
| `create_shader_include` | 创建 .gdshaderinc 文件 |
| `list_shader_includes` | 列出所有 .gdshaderinc 文件 |

</details>

<details>
<summary>Animation（10 个工具）— AnimationPlayer/AnimationTree 管线</summary>

| 工具 | 描述 |
|---|---|
| `list_animations` | 列出 AnimationPlayer 和动画 |
| `read_animation` | 读取动画轨道和关键帧 |
| `create_animation` | 创建 Animation .tres 资源 |
| `set_animation_param` | 设置动画参数 |
| `add_animation_library` | 向播放器添加动画库 |
| `add_animation_track` | 向动画添加轨道 |
| `set_keyframe` | 在轨道上设置关键帧 |
| `remove_animation_track` | 从动画中删除轨道 |
| `read_animation_tree` | 读取带状态机的 AnimationTree |
| `set_animation_tree_param` | 设置 AnimationTree 参数 |

</details>

<details>
<summary>Godot Engine（9 个工具）— 引擎检测、启动、运行、导出</summary>

| 工具 | 描述 |
|---|---|
| `get_godot_version` | 检测已安装的 Godot 版本 |
| `launch_editor` | 使用项目启动 Godot 编辑器 |
| `run_project` | 运行 Godot 项目 |
| `stop_project` | 停止所有运行中的 Godot 进程 |
| `export_project` | 通过 Godot CLI 预设导出项目 |
| `capture_screenshot` | 截取运行中游戏的屏幕截图 |
| `monitor_output` | 读取 Godot 进程输出 |
| `is_editor_running` | 检查 Godot 编辑器是否正在运行 |
| `list_projects` | 扫描目录中的 Godot 项目 |

</details>

<details>
<summary>Coverage（18 个工具）— 网格图元、2D 灯光、车辆、弹簧臂、贴花等</summary>

| 工具 | 描述 |
|---|---|
| `create_mesh_primitive` | 创建 3D 网格资源：Box、Capsule、Cylinder、Plane、Sphere、Torus 等（11 种） |
| `read_light_2d` | 列出 PointLight2D/DirectionalLight2D 节点及其能量和阴影设置 |
| `set_light_2d_param` | 设置 2D 灯光节点的参数 |
| `create_vehicle_body` | 创建带 VehicleWheel 节点的 VehicleBody3D |
| `read_vehicle_body` | 列出 VehicleBody3D 节点及车轮数量 |
| `create_spring_arm` | 创建用于平滑相机跟随的 SpringArm3D |
| `read_spring_arm` | 列出 SpringArm3D 节点及弹簧长度和碰撞设置 |
| `read_decal` | 列出 Decal 节点及其大小和纹理信息 |
| `read_occluder` | 列出 OccluderInstance3D 和 OcclusionPolygon2D 节点 |
| `read_marker` | 列出场景中的 Marker2D/Marker3D 位置标记 |
| `read_audio_stream` | 读取音频文件信息：格式、大小、循环、比特率 |
| `read_audio_listener` | 列出 AudioListener2D/3D 节点 |
| `create_camera_attributes` | 创建 CameraAttributes（Practical 或 Physical） |
| `create_sprite_frames` | 创建带命名动画的 SpriteFrames .tres 资源 |
| `read_sprite_frames` | 列出 AnimatedSprite 节点及其 SpriteFrames 资源 |
| `read_soft_body` | 列出 SoftBody3D 节点及质量和刚度 |
| `read_grid_map` | 列出 GridMap 节点及单元大小和网格库引用 |
| `create_grid_map` | 创建用于 3D 瓦片关卡设计的 GridMap 节点 |

</details>

<details>
<summary>Resource（8 个工具）— .tres CRUD、PBR 材质、主题、模板</summary>

| 工具 | 描述 |
|---|---|
| `read_resource` | 读取 .tres 资源文件 |
| `list_resources` | 列出所有资源文件 |
| `create_resource` | 从模板创建资源 |
| `write_resource` | 向资源写入属性 |
| `list_materials` | 按类型分组列出材质 |
| `read_material` | 读取带 PBR 格式的材质 |
| `set_material_param` | 设置单个材质参数 |
| `read_theme` | 读取带类型分组信息的 Theme 资源 |

</details>

<details>
<summary>Audio（7 个工具）— 音频总线布局 CRUD、效果器、音量</summary>

| 工具 | 描述 |
|---|---|
| `read_audio_bus_layout` | 读取 AudioBusLayout |
| `list_audio_files` | 按格式列出音频文件 |
| `create_audio_bus_layout` | 创建 AudioBusLayout |
| `add_audio_bus` | 向布局添加音频总线 |
| `remove_audio_bus` | 删除音频总线 |
| `add_bus_effect` | 向音频总线添加效果器 |
| `set_bus_volume` | 以 dB 为单位设置总线音量 |

</details>

<details>
<summary>Shader Graph（8 个工具）— VisualShader 图节点编辑，40+ 节点类型</summary>

| 工具 | 描述 |
|---|---|
| `create_visual_shader` | 创建新的 VisualShader .tres 图文件 |
| `add_shader_graph_node` | 向 VisualShader 图添加节点（40+ 类型：常量、数学、纹理、效果） |
| `remove_shader_graph_node` | 按索引从 VisualShader 图中删除节点 |
| `connect_shader_graph_nodes` | 在 VisualShader 图中连接两个节点端口 |
| `disconnect_shader_graph_nodes` | 在 VisualShader 图中断开两个节点端口 |
| `set_shader_node_param` | 设置 VisualShader 节点参数 |
| `list_shader_node_types` | 按类别列出所有 VisualShader 节点类型及 I/O 数量 |
| `get_shader_node_defaults` | 获取特定 VisualShader 节点类型的默认端口和参数 |

</details>

<details>
<summary>其他分类</summary>

**Domain（11）：** `read_curve`、`create_curve`、`read_gradient`、`create_gradient`、`list_paths`、`read_path`、`list_skeletons`、`read_skeleton`、`read_reflection_probe`、`read_multimesh`、`create_noise_texture`

**Nodes（8）：** `read_character_body`、`read_animated_sprite`、`read_audio_player`、`read_video_player`、`read_parallax`、`read_rich_text`、`read_container`、`read_tab_container`

**Utility（6）：** `list_all_signals`、`read_project_icon`、`read_stylebox`、`create_atlas_texture`、`list_popups`、`generate_cohesion_report`

**Rendering（5）：** `read_mesh_instance`、`set_mesh_surface_material`、`read_viewport`、`read_area`、`read_raycast`

**Environment（4）：** `read_environment`、`list_environments`、`create_environment`、`set_environment_param`

**Inspector（5）：** `list_cameras`、`read_camera`、`list_lights`、`set_light_param`、`read_particles`

**Physics（4）：** `list_physics_materials`、`read_physics_material`、`create_physics_material`、`read_collision_layers`

**Import（3）：** `read_import_config`、`list_import_files`、`write_import_config`

**TileMap（3）：** `list_tilesets`、`read_tileset`、`read_tilemap`

**Navigation（3）：** `list_nav_regions`、`read_nav_region`、`create_nav_mesh`

**Translation（3）：** `list_translations`、`read_translation`、`create_translation`

**Joints（3）：** `create_joint`、`set_joint_param`、`list_joints`

**UID（3）：** `get_uid`、`update_project_uids`、`list_missing_uids`

**2D Geometry（2）：** `create_collision_polygon`、`set_shape_points`

**Diff（2）：** `diff_scene`、`diff_resource`

**Other（4）：** `read_gdextension`、`list_csproj`、`create_world`、`read_texture_info`

</details>

---

## 支持格式

| 格式 | 扩展名 | 操作 |
|---|---|---|
| Scene | `.tscn` | 读取、写入、创建、编辑 |
| Script | `.gd` | 读取、写入、创建、验证、分析 |
| Script | `.cs` | 读取、写入、创建 |
| Shader | `.gdshader` | 读取、写入、创建、验证、编译 |
| Shader Include | `.gdshaderinc` | 读取、写入、创建 |
| VisualShader | `.tres` | 读取、列出、图形编辑 |
| Resource | `.tres` | 读取、写入、创建（14 种模板） |
| Resource | `.res` | 不支持（二进制） |
| Config | `project.godot` | 读取、写入 |
| Config | `export_presets.cfg` | 读取 |
| Import | `.import` | 读取、写入 |
| Environment | `.tres` | 读取、写入、创建（4 种预设） |
| Animation | `.tres` / `.tscn` | 读取、创建、修改 |
| AudioBus | `.tres` | 读取、写入、创建 |
| PhysicsMaterial | `.tres` | 读取、写入、创建 |
| TileSet | `.tres` | 读取、列出 |
| Translation | `.csv` / `.po` | 读取、创建 |

---

## 开发

```bash
npm install          # 安装依赖
npm run build        # 构建 TypeScript 到 dist/
npm run dev          # 开发模式（tsx 热重载）
npm test             # 运行 vitest 套件（142 个测试）；node test/test_all.mjs 运行 167 项旧版检查
npm run test:watch   # 监听模式
```

### CLI 选项

| 标志 | 描述 |
|---|---|
| `-p, --project-path` | Godot 项目根目录路径 |
| `-g, --godot-path` | Godot 二进制路径（可选） |
| `-t, --transport` | 传输模式：`stdio`、`sse`、`streamable-http`、`all` |
| `--port` | HTTP 端口（默认：3000） |
| `--host` | HTTP 绑定地址（默认：127.0.0.1） |
| `--install-addons` | 将编辑器插件复制到目标 Godot 项目 |
| `--enable-plugin` | 安装并自动启用编辑器插件 |
| `--read-only` | 拒绝所有写和删除操作 |
| `--no-sse` | 禁用 SSE 端点 |
| `--no-streamable-http` | 禁用 Streamable HTTP 端点 |
| `-h, --help` | 显示帮助 |

### 技术栈

- **运行时**: Node.js >= 18
- **语言**: TypeScript 5.5
- **MCP SDK**: @modelcontextprotocol/sdk ^1.29
- **Schema 验证**: Zod ^3.24
- **HTTP 服务器**: Express ^5.2
- **测试**: Vitest ^2.0
- **传输**: stdio（默认）、SSE、Streamable HTTP

---

## 构建 VSIX

```bash
npm run vsix
# 输出: godot-mcp-1.3.9.vsix
```

在 VS Code 中安装：

```bash
code --install-extension godot-mcp-1.3.9.vsix
```

---

## 限制

- 二进制 `.res` 文件不可解析——使用 `.tres`（文本格式）进行可编辑的资源
- Godot CLI 工具（`launch_editor`、`run_project`、`export_project`）需要 Godot Engine 二进制文件
- `edit_scene` 使用对 `.tscn` 的文本操作；复杂的重构可能需要手动验证
- 截图依赖操作系统原生的截图工具

---

## License

MIT
