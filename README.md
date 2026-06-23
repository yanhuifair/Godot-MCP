# Godot MCP

[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
[![Tests](https://img.shields.io/badge/tests-128%20passed-brightgreen)](.)

> **Model Context Protocol server for Godot Engine** — 279 tools across all Godot 4.6 subsystems. File-based CRUD + live editor plugin. AI assistants read, inspect, and modify Godot projects through stdio transport.

> **Godot Engine MCP 服务器** — 279 个工具覆盖 Godot 4.6 全子系统。文件级读写 + 实时编辑器插件。AI 助手通过 stdio 协议直接操作 Godot 项目。

---

## 目录

- [快速开始](#快速开始)
- [功能概览](#功能概览)
- [工具分类](#工具分类)
- [安装](#安装)
- [配置 AI 客户端](#配置-ai-客户端)
- [使用示例](#使用示例)
- [编辑器插件](#编辑器插件)
- [架构](#架构)
- [支持格式](#支持格式)
- [开发](#开发)
- [VSIX 打包](#打包为-vsix-扩展)

---

## 快速开始

```bash
# 方式一：npx（无需安装，发布到 npm 后可用）
npx -y godot-mcp -p /path/to/your/godot/project

# 方式二：全局安装
npm install -g godot-mcp
godot-mcp -p /path/to/your/godot/project
```

AI 客户端会自动启动 MCP 服务器，无需手动运行。配置完成后直接对话即可：

> "列出项目中的所有场景"
> "找到所有 CharacterBody2D 节点"
> "运行游戏并截图"

---

## 功能概览

| 分类 | 工具数 | 核心能力 |
|---|---|---|
| **Editor** | 78 | 实时编辑器控制：选中、播放、撤销、保存、断点、全局搜索、文件操作、性能监控 |
| **Scene** | 21 | 场景完整 CRUD + 节点增删改克隆 + 信号连接 + 变换 + 碰撞 + 精灵 |
| **Project** | 22 | 项目配置读写、输入映射管理、文件操作、自动加载、验证报告、无用资源清理 |
| **Script** | 19 | GDScript/Shader 读写创建 + 结构分析 + 代码搜索 + 信号/函数/导出注入 |
| **Domain** | 11 | 曲线、渐变、路径、骨骼、反射探针、MultiMesh、NoiseTexture |
| **Animation** | 10 | AnimationPlayer/AnimationTree 全管道：创建、轨道、关键帧、参数 |
| **Godot Engine** | 9 | 引擎检测、启动编辑器、运行/导出项目、截图、进程管理 |
| **Coverage** | 8 | Mesh 原始体、2D 灯光、VehicleBody、SpringArm、Decal、Occluder |
| **Nodes** | 8 | CharacterBody、AnimatedSprite、Audio、Video、Parallax、RichText、Container、Tab |
| **Resource** | 8 | .tres 读写创建、材质 PBR、主题、14 种模板 |
| **Audio** | 7 | 音频总线布局 CRUD、效果器、音量控制、音频文件检测 |
| **Shader Graph** | 7 | VisualShader 图谱节点增删连、参数设置 |
| **Utility** | 6 | 全局信号列表、StyleBox、AtlasTexture、Popup、项目图标、内聚报告 |
| **Rendering** | 5 | MeshInstance、Viewport、Area、RayCast/ShapeCast |
| **Environment** | 4 | Environment .tres 读写 + 4 种预设 |
| **Inspector** | 5 | Camera、Light、Particle 节点检测与编辑 |
| **Physics** | 4 | PhysicsMaterial CRUD、碰撞层名称 |
| **Import** | 3 | .import 文件读写与列表 |
| **TileMap** | 3 | TileSet 资源解析、TileMapLayer 节点 |
| **Navigation** | 3 | NavigationRegion 检测 + NavigationMesh 创建 |
| **Translation** | 3 | CSV/PO 翻译文件读写 |
| **Joints** | 3 | 物理关节创建、参数设置、列表 |
| **UID** | 3 | 文件 UID 查询、批量更新、缺失检测 |
| **2D Geometry** | 2 | CollisionPolygon2D、CollisionShape2D 形状设置 |
| **Diff** | 2 | 场景、资源逐行/逐属性对比 |
| **Other** | 8 | GDExtension、C#、World3D、CameraAttributes、SpriteFrames、GridMap、Texture 等 |

**总计：279 个工具，26 个分类**

---

## 安装

### npx（推荐，无需预安装）

```bash
# 发布到 npm 后，AI 客户端可直接配置 npx 命令
npx -y godot-mcp -p /path/to/your/godot/project
```

### 全局安装

```bash
npm install -g godot-mcp
```

### 从源码安装

```bash
git clone https://github.com/godot-mcp/godot-mcp.git
cd godot-mcp
npm install
npm run build
```

### 环境变量

| 变量 | 说明 |
|---|---|
| `GODOT_PATH` | Godot 可执行文件路径（可选，自动检测） |

Godot 自动检测顺序：`GODOT_PATH` → `/Applications/Godot.app` → `PATH` → snap/flatpak

---

## 配置 AI 客户端

### Cursor

`~/.cursor/mcp.json`:

```json
{
  "mcpServers": {
    "godot-mcp": {
      "command": "npx",
      "args": ["-y", "godot-mcp", "-p", "/path/to/your/godot/project"]
    }
  }
}
```

或者使用全局安装的命令：

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
      "args": ["-y", "godot-mcp", "-p", "/path/to/your/godot/project"]
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
      "args": ["-y", "godot-mcp", "-p", "/path/to/your/godot/project"]
    }
  }
}
```

### Reasonix / 本地开发

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

## 使用示例

### 浏览项目

```
"列出项目结构"
→ list_project_files → 完整的文件树

"生成项目概览报告"
→ generate_project_report → 场景/脚本/着色器/资源统计

"检查项目健康状态"
→ validate_project → 损坏引用、缺失 UID
```

### 创建资源

```
"创建一个 2D 平台游戏场景"
→ create_scene → scenes/main.tscn

"创建一个带金属质感的材质"
→ create_resource → materials/metal.tres
→ set_material_param → metallic=0.9, roughness=0.3
```

### 搜索与定位

```
"找到所有 Timer 节点"
→ find_nodes_in_scenes → 跨场景搜索，返回所在场景和路径

"搜索 _ready 函数"
→ search_in_scripts → 带函数上下文的精确匹配

"列出项目中所有 UI 按钮"
→ list_ui_nodes → 含锚点、位置、文本
```

### 运行与调试

```
"以 1280x720 运行游戏并截图"
→ run_project → 启动游戏
→ capture_screenshot → gameplay.png

"停止运行中的游戏"
→ stop_project → 终止所有 Godot 进程
```

### 脚本操作

```
"分析 player.gd 的结构"
→ read_script_structure → 类名、信号、导出变量、函数

"给 Player 类添加一个 dash 方法"
→ add_script_function → 安全的方法注入

"验证所有脚本"
→ validate_script → 逐文件语法/逻辑检查
```

### 动画编辑

```
"查看玩家动画"
→ read_animation → 轨道列表 + 关键帧

"给 idle 动画添加 position 轨道"
→ add_animation_track → track_path=".:position"

"在 0.5 秒处设置关键帧"
→ set_keyframe → time=0.5, value="Vector2(100,0)"
```

### 音频设置

```
"查看音频总线布局"
→ read_audio_bus_layout → 总线层级、音量、效果器

"给 Master 添加混响效果"
→ add_bus_effect → effect_type="Reverb"

"设置 SFX 总线音量"
→ set_bus_volume → bus_index=2, volume_db=-6.0
```

### 场景编辑

```
"在 Player 下添加一个 Timer"
→ add_node → type=Timer, name=Cooldown

"克隆 Enemy 节点为 Enemy2"
→ clone_node → clone_source="Main/Enemy", name="Enemy2"

"连接 body_entered 信号"
→ connect_signal → from_node="Player", signal="body_entered", method="_on_body_entered"
```

---

## 编辑器插件

可选编辑器插件通过 TCP（端口 `9876`）提供**实时编辑器控制**——选中节点、播放/停止、撤销/恢复、保存、断点调试等。

### 安装插件

1. 复制插件到项目：

```bash
cp -r addons/godot_mcp /path/to/your/godot/project/addons/
```

2. 在 Godot 中启用：**项目 → 项目设置 → 插件 → Godot MCP → 启用**

3. 若插件未显示，点击**重启**或重新打开项目

4. 在 **输出** 面板确认：

```
[Godot MCP] TCP server listening on port 9876
```

### 编辑器工具列表（78 个）

**视图与选中：**
`editor_get_selection` `editor_set_selection` `editor_get_open_scene` `editor_read_current_scene` `editor_get_info` `editor_get_rect` `editor_focus` `editor_show_in_filesystem` `editor_open_dock`

**播放控制：**
`editor_play` `editor_stop` `editor_run_specific_scene` `editor_get_running_scene_tree` `editor_get_performance`

**编辑操作：**
`editor_undo` `editor_redo` `editor_save` `editor_save_all` `editor_reload_scene` `editor_delete_selected`

**场景操作：**
`editor_create_scene` `editor_instantiate_scene` `editor_set_main_scene` `editor_get_scene_changes`

**节点操作：**
`editor_add_node` `editor_remove_node` `editor_duplicate_node` `editor_rename_node` `editor_reparent_node` `editor_move_node` `editor_get_node_properties` `editor_set_node_properties`

**脚本：**
`editor_create_script` `editor_attach_script` `editor_run_gdscript` `editor_evaluate_expression`

**调试：**
`editor_set_breakpoint` `editor_remove_breakpoint` `editor_get_breakpoints` `editor_debug_continue` `editor_debug_step` `editor_debug_step_over` `editor_debug_break` `editor_get_stack_trace` `editor_get_debug_variables`

**信号：**
`editor_connect_signal` `editor_disconnect_signal` `editor_list_node_signals`

**文件系统：**
`editor_open_asset` `editor_list_filesystem` `editor_create_folder` `editor_delete_asset` `editor_rename_asset` `editor_move_asset` `editor_duplicate_asset` `editor_reimport_asset` `editor_get_dependencies`

**项目设置：**
`editor_get_project_setting` `editor_set_project_setting` `editor_get_editor_setting` `editor_set_editor_setting` `editor_get_project_directory`

**输入与自动加载：**
`editor_get_input_map` `editor_add_input_action` `editor_remove_input_action` `editor_get_autoloads` `editor_add_autoload` `editor_remove_autoload`

**资源：**
`editor_bake_lightmaps` `editor_bake_navigation` `editor_take_screenshot`

**类文档：**
`editor_get_class_list` `editor_get_method_list` `editor_get_class_properties` `editor_get_class_signals` `editor_get_class_doc` `editor_search_help`

**相机与视图：**
`editor_get_camera` `editor_set_camera` `editor_toggle_grid` `editor_toggle_snap`

**其他：**
`editor_get_recent_scenes` `editor_simulate_key` `editor_get_plugin_list` `editor_enable_plugin` `editor_disable_plugin` `editor_get_errors` `editor_clear_errors` `editor_health_check`

---

## 架构

```
┌─────────────────────┐
│   AI 客户端           │
│ (Cursor/Claude/Copilot)│
└────────┬────────────┘
         │ MCP (stdio)
┌────────▼──────────────┐        TCP :9876      ┌──────────────────┐
│   Godot MCP Server     │ ◄───────────────────► │  Godot Editor     │
│   (TypeScript, 279 工具)│     (编辑器插件)      │  (GDScript addon) │
│                        │                       │                  │
│  ┌──────────────────┐  │                       │  78 个编辑器命令  │
│  │  Tool Handlers    │  │                       │  JSON-RPC/TCP    │
│  └──────────────────┘  │                       └──────────────────┘
│  ┌──────────────────┐  │
│  │  File Parsers     │  │  .tscn / .tres / .gd / .gdshader / .import / .csv
│  └──────────────────┘  │
│  ┌──────────────────┐  │
│  │  Godot CLI        │  │  启动、运行、导出、截图
│  └──────────────────┘  │
└────────────────────────┘
```

### 项目结构

```
godot-mcp/
├── src/
│   ├── index.ts              # CLI 入口
│   ├── server.ts             # MCP 服务器核心
│   ├── tools/                # 33 个处理器文件
│   │   ├── register.ts       # 集中注册（279 工具）
│   │   ├── project.ts        # 项目工具
│   │   ├── scene.ts          # 场景工具
│   │   ├── script.ts         # 脚本 + 着色器工具
│   │   ├── editor.ts         # 编辑器实时工具
│   │   ├── resource.ts       # 资源/材质/主题
│   │   ├── godot.ts          # 引擎控制
│   │   ├── animation.ts      # 动画管道
│   │   ├── audio.ts          # 音频总线
│   │   ├── environment.ts    # 环境资源
│   │   ├── physics.ts        # 物理材质
│   │   ├── import.ts         # 导入配置
│   │   ├── inspector.ts      # 节点检测器
│   │   ├── shader_graph.ts   # VisualShader 图谱
│   │   ├── tileset.ts        # TileMap/TileSet
│   │   ├── navigation.ts     # 导航网格
│   │   ├── translation.ts    # 翻译文件
│   │   ├── diff.ts           # 文件对比
│   │   ├── texture.ts        # 纹理信息
│   │   ├── extension.ts      # GDExtension/C#
│   │   ├── uid.ts            # 文件 UID
│   │   ├── joint.ts          # 物理关节
│   │   ├── geometry.ts       # 2D 几何形状
│   │   ├── rendering.ts      # 网格/视口/射线
│   │   ├── domain.ts         # 曲线/渐变/骨骼/路径
│   │   ├── nodes.ts          # 节点专用检测器
│   │   ├── utility.ts        # 工具集
│   │   ├── coverage.ts       # Mesh/2D 灯光/车辆等
│   │   └── register.ts       # 统一注册
│   ├── parsers/
│   │   ├── scene_parser.ts   # .tscn 解析器
│   │   ├── resource_parser.ts # .tres 解析器
│   │   ├── config_parser.ts  # project.godot 解析器
│   │   └── parser_helpers.ts # 共享解析工具
│   └── utils/
│       ├── types.ts          # 类型定义
│       ├── file_utils.ts     # 文件系统操作
│       ├── godot_cli.ts      # Godot 命令行接口
│       ├── registry.ts       # 工具注册表
│       ├── errors.ts         # 错误码
│       └── cache.ts          # 文件缓存
├── addons/
│   └── godot_mcp/            # Godot 编辑器插件
│       ├── plugin.cfg         # 插件元数据
│       └── plugin.gd          # TCP 服务器 + 命令处理器
├── dist/                     # 编译输出
├── test/                     # 测试套件
├── package.json
└── README.md
```

---

## 支持格式

| 格式 | 扩展名 | 支持 |
|---|---|---|
| 场景 | `.tscn` | ✅ 读写创建编辑（7 种操作） |
| 脚本 | `.gd` | ✅ 读写创建验证分析 |
| 脚本 | `.cs` | ✅ 读写创建 |
| 着色器 | `.gdshader` | ✅ 读写创建 |
| 着色器包含 | `.gdshaderinc` | ✅ 读写创建 |
| 可视化着色器 | `.tres` | ✅ 读写列表图谱编辑 |
| 资源 | `.tres` | ✅ 读写创建（14 种模板） |
| 资源 | `.res` | ❌ 不支持（二进制） |
| 配置 | `project.godot` | ✅ 读写 |
| 配置 | `export_presets.cfg` | ✅ 读取 |
| 导入 | `.import` | ✅ 读写 |
| 环境 | `.tres` | ✅ 读写创建（4 种预设） |
| 动画 | `.tres` / `.tscn` | ✅ 读取创建修改参数 |
| 音频总线 | `.tres` | ✅ 读写创建 |
| 物理材质 | `.tres` | ✅ 读写创建 |
| TileSet | `.tres` | ✅ 读取列表 |
| 翻译 | `.csv` / `.po` | ✅ 读取创建 |

---

## 开发

```bash
npm install              # 安装依赖
npm run build            # 编译 TypeScript → dist/
npm run dev              # 开发模式（tsx 热重载）
npm test                 # 运行 128 个测试
npm run test:watch       # 监视模式
```

### CLI 选项

| 参数 | 说明 |
|---|---|
| `-p, --project-path` | Godot 项目根目录路径 |
| `-g, --godot-path` | Godot 可执行文件路径（可选） |
| `-h, --help` | 显示帮助 |

### 技术栈

- **Runtime**: Node.js ≥18
- **Language**: TypeScript 5.5
- **MCP SDK**: @modelcontextprotocol/sdk ^1.29
- **Schema**: Zod ^3.24
- **Test**: Vitest ^2.0
- **Transport**: stdio

---

## 打包为 VSIX 扩展

```bash
npm run vsix
# → godot-mcp-1.0.0.vsix
```

安装到 VS Code：

```bash
code --install-extension godot-mcp-1.0.0.vsix
```

安装后，MCP 服务器自动注册，Copilot / Cline / Roo Code 自动发现。无需手动配置 `mcp.json`。

---

## 限制

- 二进制 `.res` 文件不支持——请使用 `.tres`（文本格式）
- Godot CLI 工具需要系统已安装 Godot Engine
- 截图依赖于操作系统原生工具
- `edit_scene` 使用 AST 操作 `.tscn`；复杂重构建议手动验证

---

## License

MIT
