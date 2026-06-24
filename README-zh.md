# Godot MCP

[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
[![Tests](https://img.shields.io/badge/tests-138%20passed-brightgreen)](.)
[![npm](https://img.shields.io/npm/v/@yanhuifair/godot-mcp)](https://www.npmjs.com/package/@yanhuifair/godot-mcp)

[English Documentation](README.md)

> **Godot Engine MCP 服务器** — 281 个工具，26 个分类，覆盖 Godot 4.6/4.7。文件级 CRUD + 可选实时编辑器插件。AI 助手通过 stdio 协议直接操作 Godot 项目。

---

## 目录

- [快速开始](#快速开始)
- [功能概览](#功能概览)
- [全部工具列表](#全部工具列表)
- [安装](#安装)
- [配置 AI 客户端](#配置-ai-客户端)
- [使用示例](#使用示例)
- [编辑器插件](#编辑器插件)
- [架构](#架构)
- [支持格式](#支持格式)
- [开发](#开发)
- [构建 VSIX](#构建-vsix)

---

## 快速开始

### 1. 安装插件（一次性）

```bash
npx @yanhuifair/godot-mcp --install-addons -p /path/to/your/godot/project
```

然后在 Godot 中启用：**项目 → 项目设置 → 插件 → Godot MCP → 启用**。

### 2. 配置 AI 客户端

在项目根目录创建 `.vscode/mcp.json`（其他客户端见[配置 AI 客户端](#配置-ai-客户端)）：

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

### 3. 开始对话

AI 客户端自动启动 MCP 服务器。**文件级工具**（.tscn、.tres、.gd）立即可用。**编辑器工具**（运行游戏、选中节点等）会触发 MCP 自动启动 Godot——无需手动打开编辑器。

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
| **Script** | 21 | GDScript/Shader 读写创建 + 结构分析 + 代码搜索 + 信号/函数/导出注入 + 着色器验证/编译 |
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

**总计：281 个工具，26 个分类**

---

## 全部工具列表

> 🔍 点击各分类展开查看所有工具名称。详细用法见[使用示例](#使用示例)。编辑器工具详见[编辑器工具](#编辑器工具-78-个工具)。

<details>
<summary><b>🎬 Editor</b> (89 个工具) — 实时编辑器控制</summary>

`editor_get_selection` `editor_set_selection` `editor_get_open_scene` `editor_read_current_scene` `editor_get_info` `editor_get_rect` `editor_focus` `editor_show_in_filesystem` `editor_open_dock` `editor_play` `editor_stop` `editor_run_specific_scene` `editor_get_running_scene_tree` `editor_get_performance_monitors` `editor_undo` `editor_redo` `editor_save` `editor_save_all` `editor_reload_scene` `editor_delete_selected` `editor_create_scene` `editor_instantiate_scene` `editor_set_main_scene` `editor_get_scene_changes` `editor_add_node` `editor_remove_node` `editor_duplicate_node` `editor_rename_node` `editor_reparent_node` `editor_move_node` `editor_get_node_properties` `editor_set_node_properties` `editor_create_script` `editor_attach_script` `editor_run_gdscript` `editor_evaluate_expression` `editor_set_breakpoint` `editor_remove_breakpoint` `editor_get_breakpoints` `editor_debug_continue` `editor_debug_step` `editor_debug_step_over` `editor_debug_break` `editor_get_stack_trace` `editor_get_debug_variables` `editor_connect_signal` `editor_disconnect_signal` `editor_list_node_signals` `editor_open_asset` `editor_list_filesystem` `editor_create_folder` `editor_delete_asset` `editor_rename_asset` `editor_move_asset` `editor_duplicate_asset` `editor_reimport_asset` `editor_get_dependency_list` `editor_get_project_setting` `editor_set_project_setting` `editor_get_editor_setting` `editor_set_editor_setting` `editor_get_project_directory` `editor_get_input_map` `editor_add_input_action` `editor_remove_input_action` `editor_get_autoload_list` `editor_add_autoload` `editor_remove_autoload` `editor_bake_lightmaps` `editor_bake_navigation` `editor_take_screenshot` `editor_get_class_list` `editor_get_method_list` `editor_get_class_property_list` `editor_get_class_signal_list` `editor_get_class_doc` `editor_search_help` `editor_get_editor_camera` `editor_set_editor_camera` `editor_toggle_grid` `editor_toggle_snap` `editor_get_recent_scenes` `editor_simulate_key` `editor_get_plugin_list` `editor_enable_plugin` `editor_disable_plugin` `editor_get_error_list` `editor_clear_errors` `editor_health_check`

</details>

<details>
<summary><b>🏗️ Scene</b> (22 个工具) — 场景完整 CRUD + 节点 + 信号 + 变换</summary>

`read_scene` `create_scene` `edit_scene` `list_scenes` `search_scene_content` `scene_dependency_graph` `add_node` `remove_node` `modify_node` `clone_node` `rename_node` `attach_script` `connect_signal` `disconnect_signal` `set_node_position` `set_node_rotation` `set_node_scale` `transform_node` `set_collision_shape` `load_sprite` `list_ui_nodes` `find_nodes_in_scenes`

</details>

<details>
<summary><b>📁 Project</b> (22 个工具) — 项目配置、输入映射、文件操作、自动加载、验证</summary>

`list_project_files` `read_project_config` `write_project_config` `read_export_presets` `read_input_map` `write_input_action` `remove_input_action` `add_input_binding` `list_autoloads` `add_autoload` `remove_autoload` `search_in_project` `delete_file` `move_file` `create_directory` `duplicate_scene` `duplicate_resource` `generate_project_report` `find_unused_assets` `validate_project` `list_groups`

</details>

<details>
<summary><b>📝 Script</b> (21 个工具) — GDScript/Shader 读写创建 + 分析 + 注入 + 验证</summary>

`read_script` `write_script` `create_script` `list_scripts` `read_script_structure` `search_in_scripts` `validate_script` `add_script_function` `add_script_signal` `add_script_export` `read_shader` `create_shader` `list_shaders` `write_shader` `validate_shader` `compile_shader` `list_visual_shaders` `read_visual_shader` `read_shader_include` `create_shader_include` `list_shader_includes`

</details>

<details>
<summary><b>🎯 Domain</b> (11 个工具) — 曲线、渐变、路径、骨骼、反射探针、MultiMesh、NoiseTexture</summary>

`read_curve` `create_curve` `read_gradient` `create_gradient` `list_paths` `read_path` `list_skeletons` `read_skeleton` `read_reflection_probe` `read_multi_mesh` `create_noise_texture`

</details>

<details>
<summary><b>🎞️ Animation</b> (10 个工具) — AnimationPlayer/AnimationTree 全管道</summary>

`list_animations` `read_animation` `create_animation` `set_animation_param` `add_animation_library` `add_animation_track` `set_keyframe` `remove_animation_track` `read_animation_tree` `set_animation_tree_param`

</details>

<details>
<summary><b>⚙️ Godot Engine</b> (9 个工具) — 引擎检测、启动、运行、导出、截图</summary>

`get_godot_version` `launch_editor` `run_project` `stop_project` `export_project` `capture_screenshot` `monitor_output` `is_editor_running` `list_projects`

</details>

<details>
<summary><b>🎨 Coverage</b> (18 个工具) — Mesh 原始体、2D 灯光、VehicleBody、SpringArm、Decal 等</summary>

`create_mesh_primitive` `read_light_2d` `set_light_2d_param` `create_vehicle_body` `read_vehicle_body` `create_spring_arm` `read_spring_arm` `read_decal` `read_occluder` `read_marker` `read_audio_stream` `read_audio_listener` `create_camera_attributes` `create_sprite_frames` `read_sprite_frames` `read_soft_body` `read_grid_map` `create_grid_map`

</details>

<details>
<summary><b>🔲 Nodes</b> (8 个工具) — CharacterBody、AnimatedSprite、Audio、Video、Parallax、RichText、Container、Tab</summary>

`read_character_body` `read_animated_sprite` `read_audio_player` `read_video_player` `read_parallax` `read_rich_text` `read_container` `read_tab_container`

</details>

<details>
<summary><b>📦 Resource</b> (8 个工具) — .tres 读写创建、材质 PBR、主题、模板</summary>

`read_resource` `list_resources` `create_resource` `write_resource` `list_materials` `read_material` `set_material_param` `read_theme`

</details>

<details>
<summary><b>🔊 Audio</b> (7 个工具) — 音频总线布局 CRUD、效果器、音量控制</summary>

`read_audio_bus_layout` `list_audio_files` `create_audio_bus_layout` `add_audio_bus` `remove_audio_bus` `add_bus_effect` `set_bus_volume`

</details>

<details>
<summary><b>🧩 Shader Graph</b> (8 个工具) — VisualShader 图谱节点增删连、参数设置</summary>

`create_visual_shader` `add_shader_graph_node` `remove_shader_graph_node` `connect_shader_graph_nodes` `disconnect_shader_graph_nodes` `set_shader_node_param` `list_shader_node_types` `get_shader_node_defaults`

</details>

<details>
<summary><b>🛠️ Utility</b> (6 个工具) — 全局信号列表、StyleBox、AtlasTexture、Popup、项目图标、内聚报告</summary>

`list_all_signals` `read_project_icon` `read_stylebox` `create_atlas_texture` `list_popups` `generate_cohesion_report`

</details>

<details>
<summary><b>🖼️ Rendering</b> (5 个工具) — MeshInstance、Viewport、Area、RayCast/ShapeCast</summary>

`read_mesh_instance` `set_mesh_surface_material` `read_viewport` `read_area` `read_raycast`

</details>

<details>
<summary><b>🌍 Environment</b> (4 个工具) — Environment .tres 读写 + 预设</summary>

`read_environment` `list_environments` `create_environment` `set_environment_param`

</details>

<details>
<summary><b>🔍 Inspector</b> (5 个工具) — Camera、Light、Particle 节点检测与编辑</summary>

`list_cameras` `read_camera` `list_lights` `set_light_param` `read_particles`

</details>

<details>
<summary><b>⚡ Physics</b> (4 个工具) — PhysicsMaterial CRUD、碰撞层名称</summary>

`list_physics_materials` `read_physics_material` `create_physics_material` `read_collision_layers`

</details>

<details>
<summary><b>📥 Import</b> (3 个工具) — .import 文件读写与列表</summary>

`read_import_config` `list_import_files` `write_import_config`

</details>

<details>
<summary><b>🗺️ TileMap</b> (3 个工具) — TileSet 资源解析、TileMapLayer 节点</summary>

`list_tilesets` `read_tileset` `read_tilemap`

</details>

<details>
<summary><b>🧭 Navigation</b> (3 个工具) — NavigationRegion 检测 + NavigationMesh 创建</summary>

`list_nav_regions` `read_nav_region` `create_nav_mesh`

</details>

<details>
<summary><b>🌐 Translation</b> (3 个工具) — CSV/PO 翻译文件读写</summary>

`list_translations` `read_translation` `create_translation`

</details>

<details>
<summary><b>🔗 Joints</b> (3 个工具) — 物理关节创建、参数设置、列表</summary>

`create_joint` `set_joint_param` `list_joints`

</details>

<details>
<summary><b>🆔 UID</b> (3 个工具) — 文件 UID 查询、批量更新、缺失检测</summary>

`get_uid` `update_project_uids` `list_missing_uids`

</details>

<details>
<summary><b>📐 2D Geometry</b> (2 个工具) — CollisionPolygon2D、CollisionShape2D 形状设置</summary>

`create_collision_polygon` `set_shape_points`

</details>

<details>
<summary><b>🔄 Diff</b> (2 个工具) — 场景与资源对比</summary>

`diff_scene` `diff_resource`

</details>

<details>
<summary><b>📋 Other</b> (8 个工具) — GDExtension、C#、World3D、GridMap、Texture 等</summary>

`read_gdextension` `list_csproj` `create_world` `read_texture_info`

</details>

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

### 从源码安装

```bash
git clone https://github.com/yanhuifair/Godot-MCP.git
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

### VS Code / GitHub Copilot

#### 方式一：安装 VSIX 扩展（推荐）

```bash
npm run vsix
# → godot-mcp-1.3.0.vsix

code --install-extension godot-mcp-1.3.0.vsix
```

安装后 MCP 服务器自动注册，Copilot / Cline / Roo Code 自动发现——**无需手动配置**。跳到[验证安装](#验证安装)。

#### 方式二：项目级配置

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

> 如果已全局安装（`npm install -g`），把 `command` 改为 `"godot-mcp"`，args 中去掉 `-y @yanhuifair/godot-mcp`：
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

> 💡 **提示**：将 `.vscode/mcp.json` 提交到仓库，团队成员打开项目即可自动获得 MCP 服务。

#### 验证安装

1. 在 VS Code 中打开 Godot 项目文件夹
2. 打开 Copilot Chat（`⇧⌘I` / `Ctrl+Shift+I`）
3. 查看聊天输入框是否出现 🔌 MCP 工具指示器
4. 发送一条测试消息：

> "列出项目中的所有场景"

如果返回了项目中的场景列表，说明安装成功。

#### 启用编辑器插件（实时控制）

如需实时编辑器控制——选中节点、运行/停止、撤销/恢复、断点调试——安装插件（一次性设置）：

```bash
npx @yanhuifair/godot-mcp --install-addons -p .
```

然后在 Godot 编辑器中启用：**项目 → 项目设置 → 插件 → Godot MCP → 启用**。在**输出**面板确认：

```
[Godot MCP] Plugin v1.3.0 loaded — ready on stdin/stdout
```

> 💡 启用一次后即可关闭 Godot，MCP 会在你使用编辑器命令时自动启动。

现在试试：

> "以 1280x720 运行游戏"
> "选中 Player 节点并显示属性"

#### 常见问题

| 问题 | 解决方法 |
|---|---|
| 服务器未启动 | 确保 Node.js ≥18：`node -v` |
| "Command not found" | 使用 `npx` 方式或 `npm install -g @yanhuifair/godot-mcp` |
| Godot 中看不到插件 | 在插件标签页点击**重启**，或重新打开项目 |
| 编辑器进程无法启动 | 确保 Godot 已安装且在 PATH 中，或设置 `GODOT_PATH` 环境变量 |
| 聊天中未出现工具 | 重新加载 VS Code：`Cmd+Shift+P` → `Developer: Reload Window` |

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

或者使用全局安装的命令：

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

### 本地开发

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

"截取指定标题的游戏窗口"
→ capture_screenshot output_path="gameplay.png" window_title="MCP_Test" delay=2

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

### 着色器验证与编译

```
"验证 hurricane.gdshader 的语法"
→ validate_shader → 检查 shader_type、花括号、声明

"编译 hurricane 着色器"
→ compile_shader → 通过编辑器插件触发 Godot 着色器编译器
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

编辑器插件提供**实时编辑器控制**——选中节点、运行/停止、撤销/恢复、保存、断点调试等。MCP 在调用编辑器工具时将 Godot 作为子进程启动，通过 stdin/stdout 通信。

> **工作原理**：当你说"运行游戏"时，MCP 服务器自动执行 `godot --editor --path <项目>`，插件从 stdin 读取命令、执行后将结果写入 stdout。Godot 窗口会自动打开——无需手动操作。

### 安装插件

**方式一：CLI 一键安装（推荐）**

```bash
godot-mcp --install-addons -p /path/to/your/godot/project
```

**方式二：手动复制**

```bash
cp -r addons/godot_mcp /path/to/your/godot/project/addons/
```

然后在 Godot 中启用：**项目 → 项目设置 → 插件 → Godot MCP → 启用**

若插件未显示，点击**重启**或重新打开项目。

在 **输出** 面板确认：

```
[Godot MCP] Plugin v1.3.0 loaded — ready on stdin/stdout
```

> 💡 插件启用一次后即可关闭 Godot，MCP 会在需要时自动启动。

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
┌────────▼──────────────┐      stdin/stdout     ┌──────────────────┐
│   Godot MCP Server     │ ◄───────────────────► │  Godot Editor     │
│   (TypeScript, 281 工具)│   (作为子进程启动)    │  (GDScript addon) │
│                        │                       │                  │
│  ┌──────────────────┐  │                       │  78 个编辑器命令  │
│  │  Tool Handlers    │  │                       │  JSON-RPC/stdio  │
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
│   │   ├── register.ts       # 集中注册（281 工具）
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
│   │   └── coverage.ts       # Mesh/2D 灯光/车辆等
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
│       └── plugin.gd          # stdin 读取器 + 命令处理器
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
npm test                 # 运行 138 个测试
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

## 构建 VSIX

```bash
npm run vsix
# → godot-mcp-1.3.0.vsix
```

详细安装和使用见 [VS Code 配置](#vs-code--github-copilot)。

---

## 限制

- 二进制 `.res` 文件不支持——请使用 `.tres`（文本格式）
- Godot CLI 工具需要系统已安装 Godot Engine
- 截图依赖于操作系统原生工具
- `edit_scene` 使用 AST 操作 `.tscn`；复杂重构建议手动验证

---

## License

MIT
