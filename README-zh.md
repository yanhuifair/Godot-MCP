<div align="center">

# Godot MCP

### 功能最完整的 Godot 引擎 MCP 服务器——**386 个工具**，让 AI 助手真正"上手"操作你的游戏项目。

[![License: AGPL-3.0](https://img.shields.io/badge/license-AGPL--3.0-blue.svg)](LICENSE.md)
[![CI](https://github.com/yanhuifair/Godot-MCP/actions/workflows/ci.yml/badge.svg)](https://github.com/yanhuifair/Godot-MCP/actions/workflows/ci.yml)
[![npm](https://img.shields.io/npm/v/@yanhuifair/godot-mcp)](https://www.npmjs.com/package/@yanhuifair/godot-mcp)
[![npm downloads](https://img.shields.io/npm/dm/@yanhuifair/godot-mcp)](https://www.npmjs.com/package/@yanhuifair/godot-mcp)
[![Tools](https://img.shields.io/badge/tools-386-orange)](#全部工具列表)
[![Node](https://img.shields.io/badge/node-%3E%3D18-green)](.)
[![Godot](https://img.shields.io/badge/godot-4.x-blue)](https://godotengine.org)

[English](README.md) | [中文文档](README-zh.md)

</div>

---

**Godot MCP** 是一个 [Model Context Protocol](https://modelcontextprotocol.io) 服务器，把任意 AI 助手——**Claude、Cursor、VS Code Copilot、Windsurf、Cline、Codex、Aider**——直接接入 **Godot Engine 4.x**。AI 不再靠猜测理解你的项目，而是真正地*操作*它。

- 📂 **原生读写项目文件** — `.tscn` 场景、`.tres` 资源、GDScript、C#、`.gdshader`、`project.godot`。自研解析器，无需启动 Godot 进程，响应即时。
- 🎛️ **驱动实时编辑器** — 选择节点、连接信号、编写可视化着色器、烘焙光照贴图、设置断点、单步调试、运行与停止游戏。
- ↩️ **每一次场景修改都可撤销** — 添加、删除、重命名、移动、重设父节点、复制、实例化，全部注册进 Godot 原生撤销栈。AI 改错了，**Ctrl+Z** 就能还原。
- 🎮 **深入正在运行的游戏** — 检查实时场景树、调用方法、注入输入，**冻结游戏、逐帧步进、并对结果截图**。这是目前唯一能做到这一点的公开 Godot MCP。
- 🔎 **规模化仍然好用** — `search_tools` 从 386 个工具中精准定位，`get_status` 直接告诉你哪些子系统已连接，每个错误都返回类型化错误码和修复建议。

**386 个工具 · 30 个分类 · 18 种 AI 客户端 · 4 条通信路径 · 一条命令完成配置。**

```bash
npx @yanhuifair/godot-mcp --enable-plugin -p .
```

| 依赖 | |
|---|---|
| Godot | 4.x（不支持 Godot 3） |
| Node.js | >= 18 |
| AI 客户端 | 任何兼容 MCP 的客户端（参见[配置 AI 客户端](#配置-ai-客户端)） |

---

## 为什么选择 Godot MCP

| | **Godot MCP** | 其他 Godot MCP 服务器 |
|---|---|---|
| **工具数量** | **386 个**，30 个分类 | 16 – 156 个 |
| **无需 Godot 运行** | ✅ 原生 `.tscn` / `.tres` / `.godot` 解析器 | ⚠️ 通常必须开着编辑器 |
| **实时编辑器控制** | ✅ 140 个工具——运行、调试、断点、视口、烘焙 | 部分支持 |
| **AI 修改可撤销** | ✅ **任何场景改动都能一次 Ctrl+Z 撤销**——原生 `EditorUndoRedoManager` 动作 | ❌ 改了就回不去 |
| **控制_正在运行的游戏_** | ✅ **11 个工具**——实时场景树、方法调用、输入注入 | ❌ 无 |
| **确定性逐帧步进** | ✅ `runtime_freeze` → `runtime_step` → `runtime_screenshot` | ❌ 无 |
| **大规模工具发现** | ✅ `search_tools` + `get_status` | ❌ 无 |
| **错误信息** | ✅ 类型化错误码 + 可执行的修复建议 | 原始堆栈 |
| **传输方式** | Stdio · SSE · Streamable HTTP | 通常仅 stdio |
| **编辑器插件安装** | ✅ 一条命令，自动启用 | 手动拷贝 |
| **引擎自省** | ✅ 实时 ClassDB——类、方法、属性、信号、文档 | 少见 |

如果你曾经想说一句 *"运行游戏，在玩家落地那一刻冻结，把碰撞状态给我看看"*——这就是真正能做到的那个服务器。

---

## 目录

1. [为什么选择 Godot MCP](#为什么选择-godot-mcp)
2. [快速开始](#快速开始)
3. [功能](#功能)
4. [架构](#架构)
5. [实现原理](#实现原理)
6. [传输模式](#传输模式)
7. [安装](#安装)
8. [配置 AI 客户端](#配置-ai-客户端)
9. [使用示例](#使用示例)
10. [编辑器插件](#编辑器插件)
11. [工具发现与实时游戏运行时](#工具发现与实时游戏运行时)
12. [全部工具列表](#全部工具列表)
13. [支持格式](#支持格式)
14. [开发](#开发)
15. [构建 VSIX](#构建-vsix)

---

## 快速开始

**两步配置，约两分钟。** 你**不需要**全局安装任何东西，也**不需要**一直开着终端——AI 客户端会自动帮你把服务器拉起来。

### 开始之前

| 需要准备 | 怎么确认 |
|---|---|
| **Godot 4.x** | 打开 Godot，标题栏会显示版本号。*（不支持 Godot 3）* |
| **Node.js 18 或更高** | 终端里执行 `node -v`。若提示 `command not found`，去 [nodejs.org](https://nodejs.org) 安装。 |
| **一个支持 MCP 的 AI 客户端** | VS Code + Copilot、Cursor、Claude Desktop、Windsurf、Cline……[完整列表在这里](#配置-ai-客户端)。 |

### 第 1 步 —— 安装编辑器插件

打开终端，`cd` 进入你的 Godot 项目目录（也就是含有 `project.godot` 的那个文件夹），执行：

```bash
npx @yanhuifair/godot-mcp --enable-plugin -p .
```

> `-p .` 表示"当前这个目录"。你也可以在任意位置用绝对路径：
> `npx @yanhuifair/godot-mcp --enable-plugin -p /Users/me/games/my-game`

**这条命令做了什么：** 把插件复制到 `addons/godot-mcp/`，并直接在 `project.godot` 里把它打开。不需要你在 Godot 里点任何按钮。

**怎么确认成功：** 项目里应该出现了 `addons/godot-mcp/` 目录。如果 Godot 已经开着，重新加载一下项目（项目 → 重新加载当前项目）让它识别插件。

<details>
<summary>这一步是必须的吗？</summary>

只有在你需要**实时编辑器**和**实时游戏**能力时才必须——比如运行场景、读取当前选中节点、打断点、烘焙光照贴图、冻结正在跑的游戏……

386 个工具中有 **220 多个**（所有读写 `.tscn`、`.tres`、`.gd`、着色器、项目设置的工具）**不需要插件，甚至不需要打开 Godot** 就能用。如果这些已经够用，可以直接跳到第 2 步。
</details>

### 第 2 步 —— 让 AI 客户端连上服务器

在项目根目录创建 `.vscode/mcp.json`（这份配置可直接用于 **VS Code / GitHub Copilot**）：

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

然后**重启 AI 客户端**，让它读取新配置。

> 用的是别的客户端？配置文件的名字和位置各不相同，但 `command` / `args` 部分基本完全一样。**Cursor、Claude Desktop、Claude CLI、Windsurf、OpenAI Codex、Cline、Roo Code、Continue、Aider、Cody、Goose、Zed** 的可直接复制的配置块都在[配置 AI 客户端](#配置-ai-客户端)。

### 第 3 步 —— 先验证，再开聊

对 AI 说：

```
"运行 get_status"
```

它应该会返回工具总数，以及编辑器桥 / 运行时桥是否连通。看到这个就说明全部接好了。接着试试：

```
"列出项目中所有场景"
"找到所有 CharacterBody2D 节点，并告诉我它们的碰撞层"
"运行游戏并截图"
```

386 个工具无法一次性全塞给 AI——当它不确定有哪些能力时，让它 **`search_tools`** 就行（例如："search_tools 搜一下 animation"）。

<details>
<summary>不工作？看这里</summary>

| 现象 | 解决办法 |
|---|---|
| 客户端里看不到 `godot-mcp` 的工具 | 重启客户端。配置文件只在启动时读取一次。 |
| `npx: command not found` | Node.js 没装，或者不在 `PATH` 里。执行 `node -v` 确认。 |
| 报 `Project not found` | `-p` 必须指向含有 `project.godot` 的目录。`"."` 只在客户端的工作目录**就是**你的项目时才有效，否则请用绝对路径。 |
| 文件类工具正常，编辑器工具失败 | 插件没装或没启用。重跑第 1 步，然后在 Godot 里重新加载项目。 |
| `EDITOR_NOT_REACHABLE` | Godot 没在运行，或插件未启用。服务器会尝试自己拉起 Godot；若失败，请手动用 Godot 打开项目，并检查 项目 → 项目设置 → 插件 → **Godot MCP** 是否已勾选。 |
| `EDITOR_COMMAND_FAILED` | 编辑器收到了命令但拒绝执行——通常是节点路径写错、该节点类型上不存在这个属性，或目标非法。报错信息里带着 Godot 自己给出的原因。重试前可先用 `editor_get_scene_tree` / `get_class_properties` 核对。 |
| AI 改了场景但你不想要 | 在 Godot 里按 **Ctrl+Z**，或调用 `editor_undo`。所有 MCP 场景改动都是原生撤销动作。 |
| 找不到 Godot 可执行文件 | 设置环境变量 `GODOT_PATH` 指向 Godot 可执行文件，参见[环境变量](#环境变量)。 |

</details>

---

## 功能

Godot MCP 通过 386 个工具、30 个分类，全面覆盖 Godot 4.x 引擎。

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
| Editor | 140 | 实时编辑器控制——选择、播放、撤销、保存、断点、文件操作、性能 |
| 项目 | 24 | 配置文件、输入映射、文件操作、自动加载、导出预设、验证、无用资源检测 |
| 场景 | 22 | 场景 CRUD——节点、信号、变换、碰撞、精灵 |
| 脚本 + 着色器 | 21 | GDScript/着色器 CRUD、结构分析、代码注入、验证 |
| 域对象 | 14 | 曲线、渐变、路径、骨骼、反射探针、MultiMesh、噪声纹理 |
| 动画 | 10 | AnimationPlayer/AnimationTree——轨道、关键帧、参数 |
| Godot 引擎 | 9 | 引擎检测、启动编辑器、运行/导出项目、截图 |
| 覆盖工具 | 18 | 网格图元、2D 灯光、车辆、弹簧臂、贴花、遮挡器、网格地图 |
| 节点检查器 | 8 | CharacterBody、AnimatedSprite、Audio、Video、Parallax、RichText、Container、Tab |
| 资源 | 8 | .tres CRUD、PBR 材质、主题、14 种模板 |
| 音频 | 7 | 音频总线布局、效果器、音量 |
| 着色器图 | 8 | VisualShader 图——40+ 节点类型、连接、参数 |
| 工具集 | 9 | 信号目录、StyleBox、AtlasTexture、弹窗列表、内聚报告 |
| 渲染 | 5 | MeshInstance、Viewport、Area、RayCast/ShapeCast |
| 环境 | 6 | Environment 读写、预设 |
| 检查器 | 5 | Camera、Light、Particle 节点检查 |
| 物理 | 5 | PhysicsMaterial CRUD、碰撞层 |
| 导入 | 3 | .import 文件读写 |
| 瓦片地图 | 5 | TileSet 资源、TileMapLayer 检查 |
| 导航 | 6 | NavigationRegion、NavigationMesh |
| 翻译 | 8 | CSV/PO 翻译文件 |
| 关节 | 5 | 物理关节——创建、配置、列表 |
| UID | 4 | 文件 UID 查询、批量更新、缺失检测 |
| 2D 几何 | 4 | CollisionPolygon2D、形状点编辑 |
| 差异对比 | 5 | 场景与资源对比 |
| 纹理 | 4 | 纹理导入/读写、图集、噪声 |
| 扩展/世界/C# | 5 | GDExtension、C#、World3D、CSProj |
| 元信息 / 内省 | 2 | 工具搜索（search_tools）+ 系统诊断（get_status） |
| 日志 | 5 | 读取游戏运行日志（user://logs/godot.log）、轮转列表、清理、定位用户数据目录、配置文件日志 |
| 运行时（游戏） | 11 | 控制正在运行的游戏——场景树、属性、方法、信号、输入、冻结/步进、截图 |

**总计：386 个工具，30 个分类**

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

**实时编辑器控制（140 个工具）**
通过 TCP 或 stdio 桥与 Godot 编辑器实时交互：选择节点、运行/停止/暂停项目、撤销/重做、保存场景、创建和附加脚本、设置断点、单步调试、求值表达式、控制 3D 视口相机、烘焙光照贴图和导航网格、管理插件、模拟按键。

**实时游戏运行时控制（11 个工具）**
超越编辑器，直接深入**正在运行的游戏**。检查带真实坐标的实时场景树，在运行时读写节点属性，调用任意方法，发射信号，注入键盘输入——以及最核心的能力：`runtime_freeze` 冻结游戏、`runtime_step` 精确前进指定帧数、`runtime_screenshot` 截取结果。这让 AI 驱动的玩法调试变得确定且可复现。

**可视着色器图**
以编程方式创建和修改 VisualShader 图。从 40+ 类型的目录（常量、数学运算、纹理、输入）中添加节点，连接节点端口，设置节点参数，列出可用节点类型及其默认输入/输出配置。

**引擎自省（ClassDB）**
查询实时引擎的 ClassDB：列出全部类，检查任意 Godot 类型的方法、属性和信号，读取内置类文档，搜索帮助系统。AI 基于事实工作，而不是凭空臆造 API。

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
                                                             |  |  (386 工具)  | |
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
  |  102 条命令       |
  +------------------+
```

### 通信路径

服务器根据操作类型使用四种不同的通信路径：

1. **直接文件 I/O** — 对于基于文件的工具（read_scene、write_script、create_resource 等），服务器使用自定义解析器直接读写磁盘上的 Godot 项目文件。无需启动 Godot 进程。这是最快的路径。

2. **Godot CLI** — 对于引擎操作（launch_editor、run_project、export_project、get_godot_version），服务器将 Godot 作为子进程启动，通过命令行参数和 stdout/stderr 进行通信。

3. **编辑器桥（双模式）** — 对于实时编辑器工具（editor_get_selection、editor_play、editor_set_breakpoint 等），MCP 服务器与运行中的 Godot 编辑器实例通信。支持两种模式：
   - **TCP 模式**（默认）：连接到已在 `localhost:9876` 上运行的 Godot。编辑器插件监听此端口。
   - **Stdio 模式**（回退）：以 `--editor --path <project>` 启动 Godot 子进程，设置 `MCP_STDIO=true`，通过 stdin/stdout 使用 JSON-RPC 通信，响应以 `__MCP__:` 前缀标记。此模式根据需要自动启动和重新启动 Godot（最多 3 次）。

4. **实时游戏运行时桥** — 对于运行时工具（`runtime_*`，如 `runtime_get_tree`、`runtime_set_node`、`runtime_step`），MCP 服务器与运行在你**正在游玩的游戏内部**的一个小型 Autoload 通信，地址为 `127.0.0.1:9877`。该 Autoload（`addons/godot-mcp/runtime_bridge.gd`，命名为 `godot_mcp_runtime`）需添加到你的项目中，且仅监听本机回环地址。这让 AI 能够检查并修改实时场景树、注入输入、暂停/恢复、确定性地逐帧步进，以及对运行中的游戏截图——这是其他公开 Godot MCP 都未开箱提供的层级。

### 项目结构

```
godot-mcp/
├── src/
│   ├── index.ts              # CLI 入口点，参数解析，传输调度
│   ├── server.ts             # MCP 服务器工厂，工具注册，请求路由
│   ├── tools/                # 工具处理文件（按分类分组）
│   │   ├── register.ts       # 集中注册（386 个工具）
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
│       └── plugin.gd          # stdin 读取器、TCP 服务器、102 个命令处理器
├── test/                     # Vitest 套件（197 个测试：127 个可运行 + 70 个集成需要真实 Godot 项目）+ 旧版 .mjs 套件
│   ├── test_all.mjs          # 旧版独立套件（176 项工具检查）
│   ├── test_editor.mjs       # Editor 桥 TCP 测试
│   ├── test_runner.mjs       # 早期集成测试
│   ├── tools.test.ts         # Vitest 工具处理测试
│   ├── parsers.test.ts       # Vitest 解析器测试
│   ├── structural.test.ts    # Vitest 结构测试
│   ├── integration_mcp_test.test.ts  # Vitest 集成测试
│   ├── server_normalization.test.ts  # Vitest 参数归一化测试
│   ├── scene_format.test.ts  # .tscn/.tres 磁盘格式契约（往返、层级、资源 id）
│   ├── addon_bridges.test.ts # GDScript 桥不变量（保留名、poll()、返回类型）
│   ├── editor_error_surface.test.ts  # Editor 错误标记 + 撤销/重做插件不变量
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

编辑器插件（`addons/godot-mcp/plugin.gd`）实现了 102 个命令处理器，封装了 Godot 的 `EditorInterface` API。通信通过两个通道使用 JSON-RPC 2.0：

- **TCP 模式**（端口 9876）：当 Godot 独立运行时，插件仅在 `127.0.0.1` 上接受 TCP 连接（绝不暴露到局域网）。这是交互式开发的首选模式。设置 `GODOT_MCP_TOKEN`（或项目设置 `godot_mcp/auth_token`）可要求每个连接先完成 `auth` 握手。

- **Stdio 模式**：当 MCP 服务器将 Godot 作为子进程启动时（`godot --editor --path <project>`），插件从 stdin 读取 JSON-RPC 请求，并以 `__MCP__:` 前缀标记将响应写入 stdout。服务器过滤这些标记以区分 JSON-RPC 和 Godot 的标准输出。

桥接自动检测使用哪种模式：首先尝试快速 TCP 健康检查（800ms 超时），如果未找到现有实例，则回退到启动 Godot。如果启动的进程意外退出，会自动重新启动（最多 3 次）。

### 参数规范化

为适应 AI 客户端可能使用 `snake_case` 或 `camelCase` 参数命名，服务器会自动将 30+ 个常见参数名规范化为其 Zod schema 所使用的 `snake_case` 键（`projectPath` -> `project_path`、`scenePath` -> `scene_path` 等），再进行验证。对外公布的 `inputSchema` 始终使用 `snake_case`，因此 `snake_case` 入参原样通过。

### 安全保障

- **路径穿越防护**：所有文件操作验证解析后的路径保持在项目根目录内
- **自动备份**：脚本和场景文件的写操作会创建 `.bak` 备份副本
- **只读模式**：`--read-only`（或 `GODOT_MCP_READ_ONLY=true`）通过维护的白名单拒绝218 个写/副作用工具（write_、create_、delete_、move_、set_、edit_、editor_* 变更类、run/export/launch 等）——它们从 `tools/list` 中隐藏，直接调用时返回 `READ_ONLY` 错误
- **TCP 仅限本机**：编辑器插件的 TCP 桥只绑定 `127.0.0.1`，绝不暴露到局域网
- **可选令牌鉴权**：设置 `GODOT_MCP_TOKEN` 后，HTTP（`/mcp`、`/sse`）要求 Bearer 令牌，插件 TCP 桥要求 `auth` 握手；非 loopback 的 HTTP 绑定在没有令牌时拒绝启动
- **编辑器改动可撤销**：所有会修改场景的编辑器命令（`editor_add_node`、`editor_remove_node`、`editor_set_node_properties`、`editor_rename_node`、`editor_move_node`、`editor_move_node_3d`、`editor_reparent_node`、`editor_duplicate_node`、`editor_delete_selected`、`editor_instantiate_scene` 等）都通过 Godot 原生 `EditorUndoRedoManager` 提交，一次 **Ctrl+Z**（或 `editor_undo`）即可撤回 AI 刚做的操作
- **结构化错误**：工具失败统一返回 `{ content, isError: true }` 结构；关键路径携带类型化错误码（`READ_ONLY`、`EDITOR_NOT_REACHABLE`、`EDITOR_COMMAND_FAILED`、`NOT_FOUND` 等）。引擎侧失败绝不会被当作成功返回——编辑器拒绝了命令，工具就会带着引擎自己的报错信息抛出 `EDITOR_COMMAND_FAILED`

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
# {"status":"ok","version":"1.11.0","projectRoot":"/path/to/project","endpoints":{...}}
```

---

## 安装

> **先看这句。** 日常使用中你**不需要**自己去启动这个服务器——AI 客户端会用配置文件里的 `command` 在后台把它拉起来。下面这些命令是用于**安装包本体**，以及**手动/进阶场景**（HTTP 传输、调试、CI）。

### 我该用哪种方式？

| 方式 | 适合谁 | 代价 |
|---|---|---|
| **npx**（推荐） | 绝大多数人 | 无需安装，永远拿到最新版。首次运行会稍慢一点。 |
| **全局安装** | 网络慢/离线、需要锁版本、想直接敲 `godot-mcp` 命令 | 要靠自己 `npm update -g` 才能升级。 |
| **从源码构建** | 参与开发，或需要尚未发布的改动 | 每次 `git pull` 后都要重新 build。 |

### 方式 A —— npx（推荐，无需预安装）

```bash
npx -y @yanhuifair/godot-mcp -p /path/to/your/godot/project
```

`npx` 会按需下载并缓存这个包。[配置 AI 客户端](#配置-ai-客户端)里的所有配置片段用的都是这种方式，所以**只要照着快速开始走，压根不存在单独的"安装"步骤**——`-y` 只是跳过"是否安装该包"的确认提示。

### 方式 B —— 全局安装

```bash
npm install -g @yanhuifair/godot-mcp

# 之后在任意位置都能直接用命令名调用
godot-mcp -p /path/to/your/godot/project
```

选择全局安装后，把客户端配置里的 `"command": "npx"` 改成 `"command": "godot-mcp"`，并把 `args` 里的 `-y` 和包名去掉：

```json
{ "command": "godot-mcp", "args": ["-p", "."] }
```

后续升级：`npm update -g @yanhuifair/godot-mcp`。

### 方式 C —— 从源码构建

```bash
git clone https://github.com/yanhuifair/Godot-MCP.git
cd Godot-MCP
npm install
npm run build       # 把 TypeScript 编译到 dist/

node dist/index.js -p /path/to/your/godot/project
```

然后把客户端指向编译产物：

```json
{ "command": "node", "args": ["/absolute/path/to/Godot-MCP/dist/index.js", "-p", "."] }
```

### 升级到最新版本

`npx` 每次都会拉取最新版本，所以安装用的那条命令同时也是升级命令：

```bash
npx -y @yanhuifair/godot-mcp@latest --enable-plugin -p .
```

**想刷新编辑器插件**（`addons/godot-mcp/` 里的文件）时，先删掉旧副本再重跑，避免残留旧插件文件：

```bash
rm -rf addons/godot-mcp && npx -y @yanhuifair/godot-mcp@latest --enable-plugin -p .
```

> Windows PowerShell 请用 `rm -r addons/godot-mcp`（不带 `-f`）。

- **锁定某个版本** —— `npx @yanhuifair/godot-mcp@1.11.0 …`；**强制用最新** —— `npx @yanhuifair/godot-mcp@latest …`。
- **全局安装** —— `npm update -g @yanhuifair/godot-mcp`。
- **从源码构建** —— `git pull && npm run build`。
- **查看当前版本** —— `npx @yanhuifair/godot-mcp --version`。

> **从 v1.9.0 升级？** 那个版本自带的编辑器插件里 `runtime_bridge.gd` 在 Godot 4.7 会解析失败（`_input` 函数与内置的 `Node._input` 冲突，且 `_resolve` 缺少返回类型）。如果编辑器报这些解析错误，删掉 `addons/godot-mcp` 再重跑 `--enable-plugin` 即可装上修复后的插件。

完整变更历史见 [CHANGELOG](CHANGELOG.md)。**v1.11.0** 新增了导出预设写入（`create_export_preset` / `update_export_preset` / `remove_export_preset`）、本地化写入（`create_po_translation` / `register_translation` / `unregister_translation`），以及一轮只读模式 / 路径沙箱安全加固。

### 命令行参数

| 参数 | 作用 |
|---|---|
| `-p, --project-path <path>` | 你的 Godot 项目目录，即含有 `project.godot` 的那个文件夹。不填则自动检测。 |
| `-g, --godot-path <path>` | Godot 可执行文件路径。不填则自动检测（顺序见下方）。 |
| `--enable-plugin` | 把编辑器插件复制进 `addons/`**并**在 `project.godot` 中自动启用。需要配合 `-p`。**通常你要的就是这个。** |
| `--install-addons` | 只复制插件文件，需要你自己去 Godot 的插件面板里勾选启用。 |
| `--read-only` | 安全模式：拒绝218 个会写文件或产生副作用的工具。让 AI 探索一个陌生项目时非常好用。 |
| `-t, --transport <mode>` | `stdio`（默认）· `sse` · `streamable-http` · `all`。详见[传输模式](#传输模式)。 |
| `--port <number>` | `sse` / `streamable-http` 的 HTTP 端口，默认 `3000`。 |
| `--host <string>` | HTTP 监听地址，默认 `127.0.0.1`。绑定其他地址**必须**设置 `GODOT_MCP_TOKEN`。 |
| `--no-sse` / `--no-streamable-http` | 在 `-t all` 时单独关掉某个端点。 |
| `-h, --help` | 打印全部参数和客户端配置示例。 |

```bash
# 几个真实例子
npx @yanhuifair/godot-mcp --enable-plugin -p .          # 项目的一次性初始化
npx @yanhuifair/godot-mcp -p . --read-only              # 只让 AI 看，不让它改
npx @yanhuifair/godot-mcp -p . -t streamable-http --port 8080
```

### 环境变量

| 变量 | 描述 |
|---|---|
| `GODOT_PATH` | Godot 二进制路径（可选，自动检测） |
| `GODOT_MCP_READ_ONLY` | `true` — 启用只读模式（拒绝218 个写/副作用工具） |
| `GODOT_MCP_TOKEN` | 鉴权令牌。HTTP：绑定非 loopback 地址时必须设置；插件 TCP 桥：在 9876 端口启用 `auth` 握手 |
| `GODOT_MCP_TEST_PROJECT` | 集成测试项目路径 |
| `GODOT_PROJECT` | `sync-addons` 构建钩子的目标项目 |
| `MCP_STDIO` | `true` — 让编辑器插件以 stdio 模式运行（MCP 启动 Godot 时自动设置） |

Godot 自动检测顺序：`GODOT_PATH` -> `/Applications/Godot.app` -> `PATH` -> snap/flatpak -> Windows Program Files

> **安全提示**：MCP 服务器可读写你的项目文件、执行 GDScript、导出构建。使用 HTTP 传输时务必设置 `GODOT_MCP_TOKEN`——没有令牌时服务器拒绝绑定非 loopback 地址，且仍强烈建议仅限本机访问。

---

## 配置 AI 客户端

Godot MCP 是一个**标准的 stdio MCP 服务器**——任何支持 MCP 的客户端都能驱动它。下面是各主流 AI Agent、IDE 和 CLI 的分步配置。

> **赶时间？** 几乎所有客户端要的都是同样那六行 JSON。复制[通用配置片段](#通用配置片段)，粘贴到你的客户端对应的文件里，重启，然后让 AI 执行 `get_status` 验证。结束。

### 找到你的客户端

| 客户端 | 配置文件位置 | 顶层字段 |
|---|---|---|
| [Claude Code](#claude-code) | `claude mcp add` → `.mcp.json` | `mcpServers` |
| [Cursor](#cursor) | `.cursor/mcp.json` · `~/.cursor/mcp.json` | `mcpServers` |
| [VS Code / GitHub Copilot](#vs-code--github-copilot) | `.vscode/mcp.json` | `servers` |
| [Codex CLI](#codex-cli-openai) | `~/.codex/config.toml` | `[mcp_servers.*]` |
| [Gemini CLI](#gemini-cli-google) | `.gemini/settings.json` · `~/.gemini/settings.json` | `mcpServers` |
| [Windsurf](#windsurf) | `~/.codeium/windsurf/mcp_config.json` | `mcpServers` |
| [Cline](#clinevs-code-扩展) | `cline_mcp_settings.json`（从 UI 打开） | `mcpServers` |
| [Roo Code](#roo-codevs-code-扩展) | `.roo/mcp.json` · 全局 `mcp_settings.json` | `mcpServers` |
| [Trae](#trae) | AI 面板 → MCP（图形界面） | `mcpServers` |
| [Zed](#zed) | `~/.config/zed/settings.json` | `context_servers` |
| [JetBrains（Rider / IntelliJ）](#jetbrains-系列riderintellijgoland) | 设置 → AI Assistant → MCP | `mcpServers` |
| [OpenCode](#opencode) | `opencode.json` | `mcp` |
| [Claude Desktop](#claude-desktop) | `claude_desktop_config.json` | `mcpServers` |
| [Continue](#continue) | `~/.continue/config.yaml` | `mcpServers` |
| [Cherry Studio](#cherry-studio) | 设置 → MCP 服务器（图形界面） | `mcpServers` |
| [Goose](#goose) | `~/.config/goose/config.yaml` | `extensions` |
| [Aider](#aider) | `.aider.conf.yml` | `mcp-servers-file` |
| [其他任何客户端](#其他任何-mcp-客户端) | — | 见下文 |

### 通用配置片段

约 80% 的客户端可以原样接受这段配置：

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

每个字段的含义：

| 字段 | 为什么需要它 |
|---|---|
| `"godot-mcp"` | AI 看到的服务器名字，随便改，没有任何东西依赖它 |
| `"type": "stdio"` | 服务器以本地子进程方式运行。部分客户端不需要这个字段，写不写都行 |
| `"command": "npx"` | Windows 上如果报 `spawn ENOENT`，把它改成 `"npx.cmd"` |
| `"-y"` | 跳过 npx 的"是否安装此包？"询问。不加这个，首次启动会一直卡住 |
| `"-p", "."` | 你的 Godot 项目目录。`.` 表示"客户端在哪个目录启动服务器，就用哪个" |

**什么时候用 `.`，什么时候用完整路径：**

- **打开文件夹的编辑器**（VS Code、Cursor、Windsurf、Zed、Trae、JetBrains）会在该目录里启动服务器 → 用 `"."` 即可，配置还能跨机器通用。
- **桌面应用和全局 CLI**（Claude Desktop、Cherry Studio、user 级的 Claude Code 条目）没有"项目目录"的概念 → 必须写绝对路径，例如 `"/Users/you/Games/MyGame"` 或 `"C:/Users/you/Games/MyGame"`。
- **Windows 请务必用正斜杠**（`C:/Users/...`）或转义反斜杠（`C:\\Users\\...`），JSON 里单反斜杠是转义符。

**两个实用变体：**

```jsonc
// 只读模式 —— AI 能看遍整个项目，但一个文件都改不了
"args": ["-y", "@yanhuifair/godot-mcp", "-p", ".", "--read-only"]

// 自动探测不到 Godot 时，手动指定可执行文件
"env": { "GODOT_PATH": "/Applications/Godot.app/Contents/MacOS/Godot" }
```

---

### Claude Code

**第 1 步：注册服务器。** 在 Godot 项目目录里执行：

```bash
cd /path/to/your/godot/project
claude mcp add godot-mcp -- npx -y @yanhuifair/godot-mcp -p .
```

`--` 后面的内容是 Claude Code 要启动的命令。**这个 `--` 分隔符不能省**，否则 `-y` 和 `-p` 会被 Claude Code 当成自己的参数吃掉。

**第 2 步：选择作用域**（可选，单项目用默认的就行）：

| 命令 | 保存位置 | 谁能用到 |
|---|---|---|
| `claude mcp add godot-mcp -- …` | `~/.claude.json`，按目录区分 | 只有你，只在这个项目 |
| `claude mcp add -s project godot-mcp -- …` | 项目根目录的 `.mcp.json` | **所有 clone 仓库的人**——建议提交进 git |
| `claude mcp add -s user godot-mcp -- …` | `~/.claude.json` 全局 | 你的所有项目（`-p` 要写绝对路径） |

带环境变量：

```bash
claude mcp add godot-mcp -e GODOT_PATH=/Applications/Godot.app/Contents/MacOS/Godot \
  -- npx -y @yanhuifair/godot-mcp -p .
```

**第 3 步：验证。** 启动 `claude`，输入 `/mcp`。应该能看到 `godot-mcp` 显示为 **connected**，回车进去可以浏览全部 386 个工具。

**第 4 步：第一条提示词：**

> 执行 `get_status`，告诉我 Godot MCP 现在能连上什么，然后列出项目里所有场景。

**后续管理：**

```bash
claude mcp list              # 列出所有已注册服务器及连接状态
claude mcp get godot-mcp     # 查看某个服务器的完整信息
claude mcp remove godot-mcp  # 移除
```

> 用了 `-s project` 的话，第一次打开项目时 Claude Code 会要求你批准 `.mcp.json`。这是安全确认，不是报错，选"是"即可。

---

### Cursor

**第 1 步：创建配置。** 推荐项目级——配置会跟着仓库走。

在 Godot 项目根目录创建 `.cursor/mcp.json`：

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

想所有项目都能用？改写 `~/.cursor/mcp.json`（Windows：`%USERPROFILE%\.cursor\mcp.json`），并把 `-p` 换成绝对路径。

也可以让 Cursor 帮你建文件：**Settings → Tools & Integrations → Add Custom MCP**。

**第 2 步：验证。** 打开 **Cursor Settings → Tools & Integrations**，`godot-mcp` 应显示**绿点**和工具数量。Cursor 会热重载这个文件，不需要重启——如果是红点，点刷新图标，并检查 JSON 有没有多余的逗号。

**第 3 步：把对话切到 Agent 模式**（`Cmd/Ctrl+I`）。Ask 模式不会调用工具。

**第 4 步：第一条提示词：**

> 用 `search_tools` 找出瓦片地图相关的工具，然后告诉我这个项目里有哪些 TileSet。

> **工具数量上限提醒：** Cursor 一次只会把大约 40–80 个工具发给模型，而 Godot MCP 有 386 个。请务必在规则文件里写上"先用 `search_tools`"（见[让你的 Agent 用好这些工具](#让你的-agent-用好这些工具)），否则模型会凭空编工具名。

---

### VS Code / GitHub Copilot

**第 1 步：在项目根目录创建 `.vscode/mcp.json`。** 注意 VS Code 自己的字段叫 `servers`，不是 `mcpServers`：

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

快捷做法：命令面板（`Cmd/Ctrl+Shift+P`）执行 `MCP: Add Server…`，选 **Command (stdio)**，VS Code 会自动生成这个文件。

**第 2 步：启动它。** VS Code 会在 JSON 里 `"godot-mcp"` 那一行正上方显示一个 **Start** 小按钮（codelens），点它。也可以执行 `MCP: List Servers` → `godot-mcp` → `Start Server`。

**第 3 步：把 Copilot Chat 切到 Agent 模式。** 打开聊天（`Cmd/Ctrl+Shift+I`），在模式下拉里选 **Agent**。Ask 和 Edit 模式不调用 MCP 工具。

**第 4 步：验证。** 点聊天输入框里的**工具图标（🛠）**，应该能看到 `godot-mcp`。如果显示 0 个工具，执行 `MCP: List Servers` → `godot-mcp` → `Show Output` 查看启动日志。

**第 5 步：第一条提示词：**

> #godot-mcp 执行 get_status，然后列出所有场景。

> **团队提示：** 把 `.vscode/mcp.json` 提交进仓库，团队里每个 clone 的人都会自动拿到这个服务器，VS Code 只会让他们各自确认一次信任。
>
> **改成用户级：** 命令面板 → `MCP: Open User Configuration`，`-p` 用绝对路径。

---

### Codex CLI (OpenAI)

**第 1 步：用内置命令添加**（会自动写入 `~/.codex/config.toml`）：

```bash
codex mcp add godot-mcp -- npx -y @yanhuifair/godot-mcp -p .
```

或者手动编辑 `~/.codex/config.toml`——注意这是 **TOML，不是 JSON/YAML**：

```toml
[mcp_servers.godot-mcp]
command = "npx"
args = ["-y", "@yanhuifair/godot-mcp", "-p", "."]
startup_timeout_sec = 30

[mcp_servers.godot-mcp.env]
GODOT_PATH = "/Applications/Godot.app/Contents/MacOS/Godot"
```

`startup_timeout_sec` 在这里很关键：首次运行时 `npx` 需要下载包，很容易超过 Codex 的默认启动超时。

**第 2 步：验证：**

```bash
codex mcp list
```

**第 3 步：使用**——一定要在 Godot 项目目录里启动 Codex，`-p .` 才能正确解析：

```bash
cd /path/to/your/godot/project
codex                                        # 交互式
codex exec "执行 get_status 并列出所有场景"    # 一次性
```

---

### Gemini CLI (Google)

**第 1 步：添加服务器：**

```bash
cd /path/to/your/godot/project
gemini mcp add godot-mcp npx -y @yanhuifair/godot-mcp -p .
```

默认作用域是 **project** → 写入 `.gemini/settings.json`。加 `-s user` 则写入 `~/.gemini/settings.json`（此时 `-p` 要用绝对路径）。

等价的手写配置：

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

- `trust: true` 会跳过每次调用的确认弹窗。方便，但也意味着 AI 可以不打招呼直接写文件——想要安全网就配合 `--read-only` 一起用。
- `includeTools` / `excludeTools` 接受工具名数组，可以只把精选的一部分工具交给模型，而不是全部 386 个。

**第 2 步：验证。** 运行 `gemini`，输入 `/mcp` 查看已连接的服务器和工具。会话外可以用 `gemini mcp list`。

**第 3 步：第一条提示词：**

> 调用 get_status，然后用 search_tools 找出动画相关的工具。

---

### Windsurf

**第 1 步：打开配置。** 点 **Cascade → 锤子图标 → Configure**，或者直接编辑文件：

- macOS/Linux：`~/.codeium/windsurf/mcp_config.json`
- Windows：`%USERPROFILE%\.codeium\windsurf\mcp_config.json`

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

这个文件是全局的，所以项目路径必须写**绝对路径**。

**第 2 步：刷新。** 回到 Cascade，点锤子图标 → **Refresh**，`godot-mcp` 应该变绿。

**第 3 步：第一条提示词**（Cascade 快捷键 `Cmd/Ctrl+L`）：

> 执行 get_status，然后读取主场景。

---

### Cline（VS Code 扩展）

**第 1 步：打开 Cline 的 MCP 设置。** 别去翻文件路径，用界面：侧边栏点 **Cline 图标** → 顶部 **MCP Servers**（服务器机架图标）→ **Installed** 标签 → **Configure MCP Servers**，会直接打开 `cline_mcp_settings.json`。

<details>
<summary>这个文件的真实路径</summary>

- macOS：`~/Library/Application Support/Code/User/globalStorage/saoudrizwan.claude-dev/settings/cline_mcp_settings.json`
- Windows：`%APPDATA%\Code\User\globalStorage\saoudrizwan.claude-dev\settings\cline_mcp_settings.json`
- Linux：`~/.config/Code/User/globalStorage/saoudrizwan.claude-dev/settings/cline_mcp_settings.json`

</details>

**第 2 步：添加条目：**

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

`autoApprove` 里填的工具名会免确认直接执行，例如填 `["get_status", "search_tools", "list_scenes"]` 让只读操作不再弹窗。

**第 3 步：重启。** Cline 一般保存即生效；如果没有，在 MCP Servers 面板里点 `godot-mcp` 旁边的 **Restart Server**，等状态点变绿。

**第 4 步：第一条提示词**（Plan 或 Act 模式）：

> 执行 get_status，然后总结这个 Godot 项目的结构。

---

### Roo Code（VS Code 扩展）

Roo Code 同时支持项目级和全局配置，冲突时项目级优先。

**第 1a 步（推荐，项目级）：** 在 Godot 项目根目录创建 `.roo/mcp.json`：

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

**第 1b 步（全局）：** Roo Code 面板 → **MCP** 图标 → **Edit Global MCP**（文件位于 `…/globalStorage/rooveterinaryinc.roo-cline/settings/mcp_settings.json`），`-p` 用绝对路径。

**第 2 步：启用。** 在 Roo Code 的 MCP 面板里确认 `godot-mcp` 的开关是打开的、状态点是绿的，不是的话点刷新图标。

**第 3 步：第一条提示词：**

> 用 search_tools 找出着色器相关的工具，然后列出所有 .gdshader 文件。

---

### Trae

Trae 有两步，很多人只做了第一步就以为配好了：**添加服务器**之后还要**把它挂到智能体上**。

**第 1 步：添加服务器。** 打开 AI 侧边栏 → **设置（齿轮）→ MCP → 添加 → 手动添加**（或**从 JSON 导入**），粘贴：

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

等状态变成**已连接／可用**再继续。

**第 2 步：挂到智能体上。** 这一步最容易被漏掉——Trae 的智能体只能看到你明确授权给它的 MCP 服务器。进入**智能体 → 新建或编辑一个智能体 → 工具 → 勾选 `godot-mcp`**，保存。

**第 3 步：在对话框的智能体下拉里选中该智能体。**

**第 4 步：第一条提示词：**

> 执行 get_status，然后列出这个项目里的所有场景。

> 如果工具一直不触发，去 **MCP → godot-mcp → 查看日志**，Trae 会把原始 stdio 启动输出打在那里。

---

### Zed

**第 1 步：添加本地服务器。** 用界面：**Settings → AI → MCP Servers → Add Server → Add Local Server**；或者命令面板执行 `zed: open settings file`，加入：

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

Zed 把 MCP 服务器叫做 **context server**，所以字段是 `context_servers` 而不是 `mcpServers`，其余完全一致。

**第 2 步：验证。** 回到 **Settings → AI → MCP Servers**，`godot-mcp` 旁边的指示点应该是**绿色**，悬停提示 *"Server is active"*。

**第 3 步：在 Agent Panel 里发第一条提示词：**

> 用 godot-mcp 的工具：先执行 get_status，然后列出所有场景。

> 在 Zed 里点名服务器名字能明显提高工具选中率。想 100% 确保用到它，可以建一个 [agent profile](https://zed.dev/docs/ai/agent-profiles)，把内置工具全关掉、只留 `godot-mcp`。

---

### JetBrains 系列（Rider、IntelliJ、GoLand…）

如果你在 **Rider 里写 Godot 的 C#**，这一节对你有用。需要 2025.1+ 版本并安装 AI Assistant 插件（Junie 共用同一份 MCP 配置）。

**第 1 步：** 打开 `设置/Preferences → Tools → AI Assistant → Model Context Protocol (MCP)`。

**第 2 步：** 点 `+`，把对话框切到 **As JSON**，粘贴：

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

如果你的 IDE 启动进程时没有继承 shell 的 `PATH`，把 `"npx"` 换成绝对路径（`which npx` / `where npx` 查）。

**第 3 步：** 点 Apply，等这一行显示出工具数量而不是报错。

**第 4 步：** 在 AI Assistant 聊天里开启 **Codebase/Agent 模式**再用——普通聊天模式不调用工具。

---

### OpenCode

**第 1 步：在项目根目录创建 `opencode.json`**（或 `~/.config/opencode/opencode.json` 全局生效）：

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

两个 OpenCode 专有的坑：

- `command` 是**一个数组**，没有单独的 `args` 字段。
- 工具发现的 `timeout` 默认只有 **5000 毫秒**。要列出 386 个工具、外加首次冷启动 `npx` 下载，经常超时——按上面写成 `30000`，否则服务器会静默显示 0 个工具。

**第 2 步：验证。** 在该目录下启动 `opencode`，MCP 服务器会在启动时加载，工具名带 `godot-mcp_` 前缀。

**第 3 步：第一条提示词：**

> use godot-mcp 执行 get_status 并列出所有场景

---

### Claude Desktop

**第 1 步：编辑配置文件：**

- macOS：`~/Library/Application Support/Claude/claude_desktop_config.json`
- Windows：`%APPDATA%\Claude\claude_desktop_config.json`
- Linux：`~/.config/Claude/claude_desktop_config.json`

更省事的方式：**Settings → Developer → Edit Config** 直接打开该文件。

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

Claude Desktop 没有"项目目录"概念，**必须写绝对路径**。

**第 2 步：完全退出并重启。** 不是"关窗口"，是退出应用（`Cmd+Q` / 托盘 → Exit）。Claude Desktop 只在启动时读一次这个文件。

**第 3 步：验证。** 聊天输入框会出现**工具图标**并显示工具数量。没有的话去看日志：macOS `~/Library/Logs/Claude/mcp-server-godot-mcp.log`，Windows `%APPDATA%\Claude\logs\`。

**第 4 步：第一条提示词：**

> 获取 Godot 版本，并列出我项目中的所有场景。

---

### Continue

Continue（VS Code + JetBrains）读取 `~/.continue/config.yaml`：

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

旧版 Continue 用的是 `~/.continue/config.json` 里的 `mcpServers` **数组**——编辑前先看哪个文件存在。保存后重新打开 Continue 面板即可自动发现工具。MCP 工具只在 **Agent 模式**下生效。

---

### Cherry Studio

流行的跨平台桌面 MCP 客户端，全程图形界面。

1. **设置 → MCP 服务器 → 添加服务器 → 快速创建**。
2. 名称：`godot-mcp` · 类型：**STDIO** · 命令：`npx`
3. 参数——**每行一个**，不要写成一行用空格隔开：
   ```
   -y
   @yanhuifair/godot-mcp
   -p
   /path/to/your/godot/project
   ```
4. 保存并打开服务器开关。出现绿色指示和工具数量即表示已连通。
5. 在对话里通过输入框下方的工具箱图标启用该 MCP 服务器，然后让它执行 `get_status`。

> 也可以用**从 JSON 导入**，粘贴[通用配置片段](#通用配置片段)并把 `-p` 改成绝对路径。

---

### Goose

**交互式配置（推荐）：**

```bash
goose configure
# → Add Extension → Command-line Extension
#   名称：   godot-mcp
#   命令：   npx -y @yanhuifair/godot-mcp -p /path/to/your/godot/project
#   超时：   300
```

**或者直接编辑 `~/.config/goose/config.yaml`：**

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

Goose 把 MCP 服务器叫做 **extension**，而且字段是 `cmd` 不是 `command`。重启 Goose 后用 `/mcp` 确认连接。

---

### Aider

Aider 的 MCP 支持跟版本相关，先跑一下 `aider --help | grep -i mcp` 看你的版本有哪些参数。

```bash
# 指向一个标准 MCP JSON 文件
aider --mcp-servers-file ./mcp.json

# 或者直接内联
aider --mcp-servers '{"mcpServers":{"godot-mcp":{"command":"npx","args":["-y","@yanhuifair/godot-mcp","-p","."]}}}'
```

这里的 `./mcp.json` 就是[通用配置片段](#通用配置片段)。想固化下来，写进 `.aider.conf.yml`：

```yaml
mcp-servers-file: ./mcp.json
```

---

### 其他任何 MCP 客户端

如果你的客户端支持**本地命令**，填：

```
command（命令）: npx
args（参数）:    -y  @yanhuifair/godot-mcp  -p  /path/to/your/godot/project
```

如果你的客户端**只接受 URL**（n8n、Dify、纯网页版 Agent、托管型连接器），那就自己把服务器跑起来，让客户端连 HTTP 端点：

```bash
export GODOT_MCP_TOKEN="$(openssl rand -hex 32)"   # 绑定非回环地址时必须设置
npx -y @yanhuifair/godot-mcp -p /path/to/your/godot/project -t all --port 3000
```

| 端点 | URL |
|---|---|
| Streamable HTTP（MCP 2025） | `http://127.0.0.1:3000/mcp` |
| SSE（旧版客户端） | `http://127.0.0.1:3000/sse` |
| 健康检查 | `http://127.0.0.1:3000/health` |

详见[传输模式](#传输模式)。

---

### 让你的 Agent 用好这些工具

386 个工具超出了大多数模型能同时记住的量，而且不少客户端只会把其中一部分转发给模型。花两分钟做下面两件事就能解决。

**1. 在项目里放一个规则文件。** 各家 Agent 会自动读取这些文件：`AGENTS.md`（Codex、OpenCode、Cursor、Gemini CLI、Zed）、`CLAUDE.md`（Claude Code）、`.cursor/rules/*.mdc`（Cursor）、`.clinerules`（Cline / Roo Code）、`.github/copilot-instructions.md`（Copilot）。

```markdown
## Godot MCP

本项目已接入 `godot-mcp` 服务器（386 个工具）。

- 不要凭记忆猜工具名。先用关键词调用 `search_tools`，
  例如 search_tools("tileset")、search_tools("animation")、search_tools("navmesh")。
- 遇到 `EDITOR_NOT_REACHABLE` 或 `RUNTIME_NOT_REACHABLE` 时，先调用 `get_status`，
  把缺什么告诉我，不要盲目重试。
- 遇到 `EDITOR_COMMAND_FAILED` 说明编辑器拒绝了这条命令——先读引擎给出的原因，
  用 `editor_get_scene_tree` 或 `get_class_properties` 核对节点路径/属性，再重试。
  不要原样重复调用。
- 所有 `editor_*` 场景改动都可撤销——我说"撤销刚才那步"时，
  直接调用 `editor_undo`，不要试图手工还原旧状态。
- 优先使用文件类工具（read_scene、write_script、create_resource…）。
  它们在 Godot 没打开时也能用，而且最快。
- 只有当改动必须在运行中的编辑器里体现时，才用 `editor_*` 工具。
- 只有游戏真的在运行（F5 已按下）时，才用 `runtime_*` 工具。
- 调 `add_node` 之前一定先 `read_scene`，确保父节点 NodePath 正确。
- 改脚本前先读脚本；绝不覆盖没读过的文件。
```

**2. 先让它只看不碰。** 首次在陌生项目上跑，给 `args` 加上 `--read-only`。服务器会在入口层面拒绝所有写操作工具，模型再热情也伤不到你的项目。

**3. 两条值得背下来的提示词：**

> `get_status` —— 当前能连上什么（编辑器？运行中的游戏？），加载了多少工具。
> `search_tools("<关键词>")` —— 直接拿到排好序的正确工具名，不用把 386 条列表塞进上下文。

---

### 故障排除

| 现象 | 原因与解决 |
|---|---|
| 完全看不到工具 | 客户端在 Ask/Chat 模式。切到 **Agent 模式**——大多数客户端只有 Agent 模式才调工具 |
| 服务器"启动失败"但没有报错信息 | JSON 语法问题。多半是多了个尾逗号，或者复制粘贴带进了中文引号——找个工具校验一下 |
| `spawn npx ENOENT`（Windows） | 把 `"command": "npx"` 改成 `"npx.cmd"`，或者用 `where npx` 查到的绝对路径 |
| `spawn npx ENOENT`（macOS/Linux 图形应用） | 应用启动时没继承 shell 的 `PATH`。用 `which npx` 的绝对路径 |
| 首次启动超时 | `npx` 正在下载包。先在终端跑一次 `npx -y @yanhuifair/godot-mcp --help` 预热缓存，并调大客户端的启动超时 |
| `Project not found` | `-p .` 只有在客户端工作目录就是 Godot 项目时才成立。改成绝对路径 |
| 已连接但工具数为 0 | 工具发现超时太短（OpenCode 默认只有 5 秒）。调到 30 秒 |
| 文件类工具正常，`editor_*` 报错 | 编辑器插件没在跑。执行 `--enable-plugin`，在 Godot 里重新加载项目，再看 `get_status` |
| `RUNTIME_NOT_REACHABLE` | 游戏没运行，或运行时 autoload 没注册。见[工具发现与实时游戏运行时](#工具发现与实时游戏运行时) |
| 找不到 Godot | 在配置的 `env` 里设置 `GODOT_PATH` 指向 Godot 可执行文件 |
| 模型总是选错工具 | 加上上面的规则文件，并明确要求它先调 `search_tools` |
| Node.js 版本太低 | `node -v` 必须 **≥ 18** |

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

编辑器插件通过两种模式实现与 Godot 编辑器的实时交互：

- **stdio 模式** — 当 MCP 将 Godot 作为子进程启动时（通过 stdin/stdout 使用 JSON-RPC 2.0 通信）
- **TCP 模式** — 当手动打开 Godot 时，插件监听 `127.0.0.1:9876`（仅本机）。若设置了 `GODOT_MCP_TOKEN` 或项目设置 `godot_mcp/auth_token`，每个连接必须先完成 `auth` 握手。端口可通过项目设置 `godot_mcp/editor_port` 修改。

### 安装

```bash
npx @yanhuifair/godot-mcp --enable-plugin -p /path/to/your/godot/project
```

此命令将插件安装到 `addons/godot-mcp/` 并自动在 `project.godot` 中启用。无需手动操作。

### 编辑器命令（140 个工具）

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

## 工具发现与实时游戏运行时

大多数 MCP 服务器只能操作编辑器。Godot MCP 还能**驱动你真正在运行的游戏**——这是目前其他公开 Godot MCP 都不具备的能力。适用于 AI 驱动的自动化测试（playtesting）、调试运行时状态、自动化玩法验证，以及生成实时截图。

### 启用运行时自动加载（Autoload）

运行时桥是一个独立、轻量的 Autoload（不会修改编辑器插件）。每个项目只需添加一次：

1. 确保已安装编辑器插件（`npx @yanhuifair/godot-mcp --enable-plugin -p .`）。运行时桥脚本随附在同一个 `addons/godot-mcp/` 目录中。
2. 在 Godot 编辑器中打开 **项目 → 项目设置 → 全局 → 自动加载（Autoload）**。
3. 添加 `addons/godot-mcp/runtime_bridge.gd`，Autoload 名称设为 **`godot_mcp_runtime`** 并启用。
4. 从编辑器运行游戏（F5）。Autoload 会在输出日志中打印 `[godot-mcp-runtime] Listening on 127.0.0.1:9877`。

> **安全**：桥仅绑定 `127.0.0.1`，绝不暴露到局域网。它以 `process_mode = PROCESS_MODE_ALWAYS` 运行，因此即使通过 `runtime_freeze` 暂停游戏，桥仍能持续接收命令。
>
> **它同时拒绝在导出版本中启动。** 这个桥可以在任意节点上调用任意方法，一旦随游戏发布就等于留了后门。因此它只在 `OS.has_feature("editor")` 为真时（也就是从编辑器运行游戏时）才监听端口。即使你导出前忘了移除这个 autoload，它也只会保持静默，不会开端口。若需要在 CI 中驱动导出版本，请设置环境变量 `GODOT_MCP_RUNTIME=1`。

### 运行时工具（11 个）

| 工具 | 描述 |
|---|---|
| `runtime_ping` | 检查实时游戏运行时桥是否可达。 |
| `runtime_get_tree` | 读取运行中的游戏场景树（游戏实际运行时的实时状态）。 |
| `runtime_get_node` | 读取运行中游戏里某个节点的实时属性。 |
| `runtime_set_node` | 设置运行中游戏里某个节点的属性（实时变更）。 |
| `runtime_call_method` | 调用运行中游戏里某个节点的方法。 |
| `runtime_emit_signal` | 在运行中游戏里某个节点上发射信号。 |
| `runtime_input` | 向运行中的游戏注入按键输入事件（keycode + 按下/释放）。 |
| `runtime_freeze` | 暂停（冻结）运行中的游戏。 |
| `runtime_resume` | 恢复（取消暂停）运行中的游戏。 |
| `runtime_step` | 在暂停状态下确定性地推进 N 帧（逐帧步进）。 |
| `runtime_screenshot` | 截取运行中游戏视口的屏幕截图。 |

### 示例工作流

```
"运行游戏，冻结它，然后步进 5 帧并截图"
  → runtime_ping → runtime_freeze → runtime_step { frames: 5 } → runtime_screenshot

"把 Player 的 health 设为 0 并触发 died 信号"
  → runtime_set_node { path: "Player", properties: { "health": "0" } }
  → runtime_emit_signal { path: "Player", signal: "died" }
```

如果运行时工具返回 `RUNTIME_NOT_REACHABLE` 错误，请调用 `get_status`——它会报告 Autoload 是否可达，并提示如何启用。

### 工具发现与诊断（Meta，2 个工具）

面对 386 个工具，盲目猜测名称会浪费大量 token。两个发现工具可提供帮助：

| 工具 | 描述 |
|---|---|
| `search_tools` | 按关键词/描述搜索所有工具以发现正确的工具名。空格分隔的词为 AND 组合；名称匹配优先级更高。 |
| `get_status` | 系统状态/诊断：编辑器桥、实时游戏运行时桥，以及工具总数。用于排查连接问题。 |

```
"找处理碰撞形状的工具"  → search_tools { keyword: "collision shape" }
"现在哪些子系统可用？"  → get_status
```

---

## 全部工具列表

点击每个分类展开查看所有工具及其描述。

<details>
<summary>Editor（140 个工具）— 实时编辑器控制</summary>

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
| `editor_undo` | 撤销上一步场景操作（包含所有 MCP 场景改动），并返回被撤销的动作名 |
| `editor_redo` | 重做上一步被撤销的场景操作，并返回被重做的动作名 |
| `editor_save` | 保存编辑器中的当前场景 |
| `editor_save_all` | 保存所有打开的场景 |
| `editor_reload_scene` | 保存并重新加载当前场景 |
| `editor_delete_selected` | 删除当前选中的节点 |
| `editor_create_scene` | 在编辑器中创建并打开新场景 |
| `editor_instantiate_scene` | 将 PackedScene 实例化到当前场景中 |
| `editor_set_main_scene` | 设置项目主场景 |
| `editor_get_scene_changes` | 检查未保存更改，并返回最后一次动作名与撤销/重做是否可用 |
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
<summary>Project（24 个工具）— 配置、输入映射、文件操作、自动加载、导出预设、验证</summary>

| 工具 | 描述 |
|---|---|
| `list_project_files` | 列出 Godot 项目中的文件和目录 |
| `read_project_config` | 读取和解析 project.godot |
| `write_project_config` | 向 project.godot 写入配置值 |
| `read_export_presets` | 从 export_presets.cfg 读取导出预设 |
| `create_export_preset` | 在 export_presets.cfg 中创建导出预设（Windows Desktop/Linux/macOS/Android/iOS/Web） |
| `update_export_preset` | 更新已有导出预设的字段/选项（按名称或索引） |
| `remove_export_preset` | 删除导出预设并重编号剩余预设 |
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
<summary>Meta / Discovery（2 个工具）— 工具搜索 + 系统诊断</summary>

| 工具 | 描述 |
|---|---|
| `search_tools` | 按关键词/描述搜索所有工具以发现正确的工具名，避免在 350+ 个工具中盲目猜测。 |
| `get_status` | 系统状态/诊断：编辑器桥、实时游戏运行时桥，以及工具总数。用于排查连接问题。 |

</details>

<details>
<summary>Runtime（游戏）（11 个工具）— 控制运行中的游戏</summary>

| 工具 | 描述 |
|---|---|
| `runtime_ping` | 检查实时游戏运行时桥是否可达。 |
| `runtime_get_tree` | 读取运行中的游戏场景树（游戏实际运行时的实时状态）。 |
| `runtime_get_node` | 读取运行中游戏里某个节点的实时属性。 |
| `runtime_set_node` | 设置运行中游戏里某个节点的属性（实时变更）。 |
| `runtime_call_method` | 调用运行中游戏里某个节点的方法。 |
| `runtime_emit_signal` | 在运行中游戏里某个节点上发射信号。 |
| `runtime_input` | 向运行中的游戏注入按键输入事件。 |
| `runtime_freeze` | 暂停（冻结）运行中的游戏。 |
| `runtime_resume` | 恢复（取消暂停）运行中的游戏。 |
| `runtime_step` | 在暂停状态下确定性地推进 N 帧（逐帧步进）。 |
| `runtime_screenshot` | 截取运行中游戏视口的屏幕截图。 |

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

**Translation（8）：** `list_translations`、`read_translation`、`create_translation`、`write_translation`、`add_translation_key`、`create_po_translation`、`register_translation`、`unregister_translation`

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
npm test             # 运行 vitest 套件（197 个测试：127 个可运行 + 70 个集成需要真实 Godot 项目）；node test/test_all.mjs 运行 176 项旧版检查
npm run test:watch   # 监听模式
npm run check:godot  # 在真实的无头 Godot 中加载全部测试资源，校验
                     # ext_resource 路径、UID 与 SubResource 引用（需已安装 Godot）
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
| `--read-only` | 拒绝218 个写/副作用工具（安全模式） |
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
# 输出: godot-mcp-1.11.0.vsix
```

在 VS Code 中安装：

```bash
code --install-extension godot-mcp-1.11.0.vsix
```

---

## 限制

- 二进制 `.res` 文件不可解析——使用 `.tres`（文本格式）进行可编辑的资源
- Godot CLI 工具（`launch_editor`、`run_project`、`export_project`）需要 Godot Engine 二进制文件
- `edit_scene` 使用对 `.tscn` 的文本操作；复杂的重构可能需要手动验证
- 截图依赖操作系统原生的截图工具

---

## 常见问题

**必须一直开着 Godot 吗？**
不需要。所有基于文件的工具——场景、资源、脚本、着色器、项目设置——都使用原生解析器直接读写磁盘文件，瞬时完成。只有实时编辑器工具（123 个）和实时游戏运行时工具（11 个）需要 Godot 运行，而且服务器可以自动帮你启动。

**支持 Godot 3 吗？**
不支持，仅支持 **Godot 4.x**。Godot 3 的文件格式与编辑器 API 差异过大，无法干净地兼容。

**支持哪些 AI 客户端？**
任何兼容 MCP 的客户端。已验证：Claude Desktop、Claude Code、Cursor、VS Code（Copilot）、Windsurf、Codex、Cline、Roo Code、Aider、Cody、Goose、Continue。

**AI 怎么从 386 个工具里挑对的那个？**
用 `search_tools`——它按关键词对工具名和描述排序检索，AI 无需把 386 个 schema 全塞进上下文就能找到 `add_audio_bus_effect` 这样的工具。`get_status` 则报告当前哪些子系统（编辑器桥、游戏运行时）可达。

**运行时工具和编辑器工具有什么区别？**
编辑器工具与 Godot **编辑器**通信；运行时工具通过 `127.0.0.1:9877` 上的轻量 autoload 与**正在运行的游戏**通信。正因如此才能冻结游戏、精确步进指定帧数、并截取某个精确的玩法瞬间。

**让 AI 改我的项目安全吗？**
破坏性文件操作会写入 `.bak` 备份，工具区分只读与写入两类，任何失败都返回类型化错误码与修复建议，而不是悄悄损坏文件。当然，仍然建议使用版本控制。

---

## 关键词

Godot MCP · Godot MCP 服务器 · Godot AI 助手 · Godot AI 智能体 · Model Context Protocol Godot · Godot 引擎 4 · GDScript AI · AI 游戏开发 · Godot 自动化 · Godot Copilot · Claude 接入 Godot · Cursor Godot · VS Code Godot MCP · Windsurf Godot · Cline Godot · Godot 场景编辑 API · `.tscn` 解析器 · `.tres` 解析器 · Godot 着色器 AI · VisualShader 自动化 · Godot 调试 AI · Godot 运行时检查 · 游戏引擎 AI 工具链 · MCP server for game engines

---

## 协议

AGPL-3.0-or-later

## 打赏
![alt text](tip.JPG)