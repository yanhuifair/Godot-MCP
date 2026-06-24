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

> 🔍 点击各分类展开查看所有工具及描述。详细用法见[使用示例](#使用示例)。编辑器工具详见[编辑器插件](#编辑器插件)。

<details>
<summary><b>🎬 Editor</b> (89 个工具) — 实时编辑器控制</summary>

| 工具 | 描述 |
|---|---|
| `editor_get_selection` | 获取编辑器中选中的节点。 |
| `editor_set_selection` | 在编辑器中选择节点。 |
| `editor_get_open_scene` | 获取当前打开的场景路径。 |
| `editor_read_current_scene` | 读取编辑器实时场景树。 |
| `editor_get_info` | 获取编辑器状态信息。 |
| `editor_get_rect` | 获取编辑器窗口尺寸。 |
| `editor_focus` | 将 Godot 编辑器窗口置于前台。 |
| `editor_show_in_filesystem` | 在文件系统面板中定位文件。 |
| `editor_open_dock` | 打开面板：文件系统、检查器、场景、输出。 |
| `editor_play` | 从编辑器运行项目。 |
| `editor_stop` | 在编辑器中停止运行。 |
| `editor_run_specific_scene` | 运行指定场景（非主场景）。 |
| `editor_get_running_scene_tree` | 获取游戏运行时的实时场景树。 |
| `editor_get_performance_monitors` | 获取运行时的 FPS、绘制调用、内存使用。 |
| `editor_undo` | 撤销上一步编辑器操作。 |
| `editor_redo` | 重做上一步撤销操作。 |
| `editor_save` | 保存编辑器中的当前场景。 |
| `editor_save_all` | 保存所有打开的场景。 |
| `editor_reload_scene` | 保存并重新加载当前场景。 |
| `editor_delete_selected` | 删除当前选中的节点。 |
| `editor_create_scene` | 在编辑器中创建并打开新场景。 |
| `editor_instantiate_scene` | 将 PackedScene 实例化到当前场景。 |
| `editor_set_main_scene` | 设置项目主场景。 |
| `editor_get_scene_changes` | 检查当前场景是否有未保存的修改。 |
| `editor_add_node` | 向当前打开的场景添加节点。 |
| `editor_remove_node` | 从当前打开的场景移除节点。 |
| `editor_duplicate_node` | 复制节点（含子节点、脚本和信号）。 |
| `editor_rename_node` | 在编辑器中重命名节点。 |
| `editor_reparent_node` | 将节点移动到新的父节点。 |
| `editor_move_node` | 将 2D/3D 节点移动到新位置。 |
| `editor_get_node_properties` | 读取节点所有编辑器可见属性。 |
| `editor_set_node_properties` | 一次性设置节点的多个属性。 |
| `editor_create_script` | 在编辑器中创建并打开新的 GDScript。 |
| `editor_attach_script` | 在编辑器中为节点挂载脚本。 |
| `editor_run_gdscript` | 在编辑器上下文中执行任意 GDScript 代码。 |
| `editor_evaluate_expression` | 在调试器/编辑器上下文中计算 GDScript 表达式。 |
| `editor_set_breakpoint` | 在脚本中设置断点。 |
| `editor_remove_breakpoint` | 从脚本中移除断点。 |
| `editor_get_breakpoints` | 列出所有断点。 |
| `editor_debug_continue` | 在调试器中继续执行。 |
| `editor_debug_step` | 调试器中单步进入。 |
| `editor_debug_step_over` | 调试器中单步跳过。 |
| `editor_debug_break` | 在调试器中停止执行（中断）。 |
| `editor_get_stack_trace` | 从调试器获取当前调用堆栈。 |
| `editor_get_debug_variables` | 从调试器获取局部变量。 |
| `editor_connect_signal` | 在编辑器中连接节点间信号。 |
| `editor_disconnect_signal` | 断开节点间的信号连接。 |
| `editor_list_node_signals` | 列出节点上的信号及其连接。 |
| `editor_open_asset` | 在编辑器中打开资源。 |
| `editor_list_filesystem` | 列出编辑器文件系统中的文件和目录。 |
| `editor_create_folder` | 通过编辑器文件系统创建目录。 |
| `editor_delete_asset` | 通过编辑器删除文件或文件夹。 |
| `editor_rename_asset` | 通过编辑器文件系统重命名文件。 |
| `editor_move_asset` | 通过编辑器将文件移动到新位置。 |
| `editor_duplicate_asset` | 通过编辑器文件系统复制文件。 |
| `editor_reimport_asset` | 强制重新导入资源。 |
| `editor_get_dependency_list` | 获取文件的所有资源依赖。 |
| `editor_get_project_setting` | 通过编辑器 API 读取项目设置。 |
| `editor_set_project_setting` | 通过编辑器 API 设置项目设置（自动保存）。 |
| `editor_get_editor_setting` | 读取编辑器偏好设置。 |
| `editor_set_editor_setting` | 设置编辑器偏好。 |
| `editor_get_project_directory` | 获取项目 res:// 和 user:// 路径。 |
| `editor_get_input_map` | 通过编辑器 API 读取输入映射。 |
| `editor_add_input_action` | 通过编辑器 API 添加输入动作。 |
| `editor_remove_input_action` | 通过编辑器 API 移除输入动作。 |
| `editor_get_autoload_list` | 通过编辑器 API 列出自动加载单例。 |
| `editor_add_autoload` | 通过编辑器 API 添加自动加载单例。 |
| `editor_remove_autoload` | 通过编辑器 API 移除自动加载单例。 |
| `editor_bake_lightmaps` | 触发光照贴图烘焙。 |
| `editor_bake_navigation` | 为当前场景所有 NavigationRegion 节点烘焙导航网格。 |
| `editor_take_screenshot` | 捕获编辑器视口为 PNG。 |
| `editor_get_class_list` | 列出所有 Godot 类（可筛选）。 |
| `editor_get_method_list` | 列出 Godot 类的所有方法。 |
| `editor_get_class_property_list` | 列出类的所有编辑器可见属性。 |
| `editor_get_class_signal_list` | 列出 Godot 类的所有信号。 |
| `editor_get_class_doc` | 在浏览器中打开 Godot 类文档。 |
| `editor_search_help` | 在浏览器中搜索 Godot 文档。 |
| `editor_get_editor_camera` | 获取 3D 编辑器视口相机位置。 |
| `editor_set_editor_camera` | 设置 3D 编辑器视口相机位置。 |
| `editor_toggle_grid` | 切换 3D 网格可见性。 |
| `editor_toggle_snap` | 切换 3D 吸附模式。 |
| `editor_get_recent_scenes` | 列出最近打开的场景路径。 |
| `editor_simulate_key` | 在编辑器中模拟按键（如 F5 运行、Ctrl+S 保存）。 |
| `editor_get_plugin_list` | 列出所有已安装的编辑器插件及启用状态。 |
| `editor_enable_plugin` | 启用指定的编辑器插件。 |
| `editor_disable_plugin` | 禁用指定的编辑器插件。 |
| `editor_get_error_list` | 获取当前编辑器错误/日志列表。 |
| `editor_clear_errors` | 清除编辑器错误列表。 |
| `editor_health_check` | 检查 Godot 编辑器插件是否可达。 |

</details>

<details>
<summary><b>🏗️ Scene</b> (22 个工具) — 场景完整 CRUD + 节点 + 信号 + 变换</summary>

| 工具 | 描述 |
|---|---|
| `read_scene` | 读取 .tscn 场景文件。 |
| `create_scene` | 从模板创建新场景。 |
| `edit_scene` | 对场景应用批量操作。 |
| `list_scenes` | 列出所有 .tscn 场景文件。 |
| `search_scene_content` | 在 .tscn 内容中进行全文搜索。 |
| `scene_dependency_graph` | 分析场景间依赖关系。 |
| `add_node` | 向场景添加节点。 |
| `remove_node` | 从场景中移除节点。 |
| `modify_node` | 修改节点属性或重命名。 |
| `clone_node` | 深度克隆场景中的节点。 |
| `rename_node` | 重命名场景中的节点。 |
| `attach_script` | 为节点挂载脚本。 |
| `connect_signal` | 连接节点间信号。 |
| `disconnect_signal` | 断开信号连接。 |
| `set_node_position` | 设置节点位置（自动识别 2D/3D）。 |
| `set_node_rotation` | 设置节点旋转（2D/3D）。 |
| `set_node_scale` | 设置节点缩放（2D/3D）。 |
| `transform_node` | 对节点应用变换。 |
| `set_collision_shape` | 设置碰撞形状节点的形状。 |
| `load_sprite` | 为 Sprite2D 节点加载纹理。 |
| `list_ui_nodes` | 列出 Control 派生 UI 节点。 |
| `find_nodes_in_scenes` | 按类型/属性跨场景搜索节点。 |

</details>

<details>
<summary><b>📁 Project</b> (22 个工具) — 项目配置、输入映射、文件操作、自动加载、验证</summary>

| 工具 | 描述 |
|---|---|
| `list_project_files` | 列出 Godot 项目中的文件和目录。 |
| `read_project_config` | 读取并解析 project.godot。 |
| `write_project_config` | 向 project.godot 写入配置值。 |
| `read_export_presets` | 读取 export_presets.cfg 中的导出预设。 |
| `read_input_map` | 读取带按键绑定的输入映射。 |
| `write_input_action` | 创建新的输入动作。 |
| `remove_input_action` | 移除输入动作。 |
| `add_input_binding` | 为动作添加按键/鼠标/手柄绑定。 |
| `list_autoloads` | 列出所有自动加载单例。 |
| `add_autoload` | 添加自动加载条目。 |
| `remove_autoload` | 移除自动加载条目。 |
| `search_in_project` | 在项目文件中搜索文本。 |
| `delete_file` | 删除文件（保留 .bak 备份）。 |
| `move_file` | 在项目中移动/重命名文件。 |
| `create_directory` | 在项目中创建目录。 |
| `duplicate_scene` | 复制场景文件。 |
| `duplicate_resource` | 复制 .tres 资源。 |
| `generate_project_report` | 生成全面的项目概览。 |
| `find_unused_assets` | 查找孤立项目文件。 |
| `validate_project` | 验证项目是否有损坏引用、缺失 UID。 |
| `list_groups` | 列出跨场景的所有节点分组。 |

</details>

<details>
<summary><b>📝 Script</b> (21 个工具) — GDScript/Shader 读写创建 + 分析 + 注入 + 验证</summary>

| 工具 | 描述 |
|---|---|
| `read_script` | 读取带行号的脚本文件。 |
| `write_script` | 向脚本文件写入内容。 |
| `create_script` | 从模板创建新脚本。 |
| `list_scripts` | 按类型分组列出所有脚本文件。 |
| `read_script_structure` | 分析 GDScript 结构。 |
| `search_in_scripts` | 在脚本中搜索，包含函数上下文。 |
| `validate_script` | 验证 GDScript 的常见问题。 |
| `add_script_function` | 向 GDScript 追加函数。 |
| `add_script_signal` | 向 GDScript 添加信号声明。 |
| `add_script_export` | 向 GDScript 添加 @export 变量。 |
| `read_shader` | 读取 .gdshader 文件。 |
| `create_shader` | 从模板创建新的 .gdshader。 |
| `list_shaders` | 列出所有 .gdshader 文件。 |
| `write_shader` | 向 .gdshader 写入内容。 |
| `validate_shader` | 验证 .gdshader 语法问题（shader_type、括号、声明）。 |
| `compile_shader` | 通过 Godot 编辑器或本地验证编译（重新导入）.gdshader。 |
| `list_visual_shaders` | 列出 VisualShader 图文件。 |
| `read_visual_shader` | 读取 VisualShader 图。 |
| `read_shader_include` | 读取 .gdshaderinc 文件。 |
| `create_shader_include` | 创建 .gdshaderinc 文件。 |
| `list_shader_includes` | 列出所有 .gdshaderinc 文件。 |

</details>

<details>
<summary><b>🎯 Domain</b> (11 个工具) — 曲线、渐变、路径、骨骼、反射探针、MultiMesh、NoiseTexture</summary>

| 工具 | 描述 |
|---|---|
| `read_curve` | 读取 Curve 资源。 |
| `create_curve` | 创建 Curve .tres 资源。 |
| `read_gradient` | 读取 Gradient 资源。 |
| `create_gradient` | 创建 Gradient .tres 资源。 |
| `list_paths` | 列出跨场景的 Path2D/Path3D 节点。 |
| `read_path` | 读取 Path2D/Path3D 节点及曲线点。 |
| `list_skeletons` | 列出 Skeleton3D 节点。 |
| `read_skeleton` | 读取 Skeleton3D 骨骼层级。 |
| `read_reflection_probe` | 读取 ReflectionProbe 设置。 |
| `read_multi_mesh` | 读取 MultiMeshInstance 设置。 |
| `create_noise_texture` | 创建 NoiseTexture2D/3D .tres。 |

</details>

<details>
<summary><b>🎞️ Animation</b> (10 个工具) — AnimationPlayer/AnimationTree 全管道</summary>

| 工具 | 描述 |
|---|---|
| `list_animations` | 列出 AnimationPlayer 和动画。 |
| `read_animation` | 读取动画轨道和关键帧。 |
| `create_animation` | 创建 Animation .tres 资源。 |
| `set_animation_param` | 设置动画参数。 |
| `add_animation_library` | 向播放器添加动画库。 |
| `add_animation_track` | 向动画添加轨道。 |
| `set_keyframe` | 在轨道上设置关键帧。 |
| `remove_animation_track` | 从动画中移除轨道。 |
| `read_animation_tree` | 读取带状态机的 AnimationTree。 |
| `set_animation_tree_param` | 设置 AnimationTree 参数。 |

</details>

<details>
<summary><b>⚙️ Godot Engine</b> (9 个工具) — 引擎检测、启动、运行、导出、截图</summary>

| 工具 | 描述 |
|---|---|
| `get_godot_version` | 检测已安装的 Godot 版本。 |
| `launch_editor` | 启动 Godot 编辑器并加载项目。 |
| `run_project` | 运行 Godot 项目。 |
| `stop_project` | 停止所有运行中的 Godot 进程。 |
| `export_project` | 通过 Godot CLI 预设导出项目。 |
| `capture_screenshot` | 捕获运行中游戏的截图。 |
| `monitor_output` | 读取 Godot 进程输出。 |
| `is_editor_running` | 检查 Godot 编辑器是否在运行。 |
| `list_projects` | 扫描目录中的 Godot 项目。 |

</details>

<details>
<summary><b>🎨 Coverage</b> (18 个工具) — Mesh 原始体、2D 灯光、VehicleBody、SpringArm、Decal 等</summary>

| 工具 | 描述 |
|---|---|
| `create_mesh_primitive` | 创建 3D 网格资源：Box、Capsule、Cylinder、Plane、Sphere、Torus 等（11 种类型）。 |
| `read_light_2d` | 列出 PointLight2D/DirectionalLight2D 节点及其能量和阴影设置。 |
| `set_light_2d_param` | 设置 2D 灯光节点的参数。 |
| `create_vehicle_body` | 创建 VehicleBody3D 及 VehicleWheel 节点用于车辆物理。 |
| `read_vehicle_body` | 列出 VehicleBody3D 节点及车轮数量。 |
| `create_spring_arm` | 创建 SpringArm3D 用于平滑相机跟随。 |
| `read_spring_arm` | 列出 SpringArm3D 节点及弹簧长度和碰撞设置。 |
| `read_decal` | 列出 Decal 节点及尺寸和纹理信息。 |
| `read_occluder` | 列出 OccluderInstance3D 和 OcclusionPolygon2D 节点。 |
| `read_marker` | 列出跨场景的 Marker2D/Marker3D 位置标记。 |
| `read_audio_stream` | 读取音频文件信息：格式、大小、循环、比特率（来自 .import 配置）。 |
| `read_audio_listener` | 列出 AudioListener2D/3D 节点用于空间音频定位。 |
| `create_camera_attributes` | 创建 CameraAttributes（Practical 或 Physical）用于 3D 相机景深和自动曝光。 |
| `create_sprite_frames` | 创建带命名动画的 SpriteFrames .tres 资源。 |
| `read_sprite_frames` | 列出 AnimatedSprite 节点及其 SpriteFrames 资源。 |
| `read_soft_body` | 列出 SoftBody3D 节点及质量和刚度。 |
| `read_grid_map` | 列出 GridMap 节点及单元格大小和网格库引用。 |
| `create_grid_map` | 创建 GridMap 节点用于 3D 瓦片式关卡设计。 |

</details>

<details>
<summary><b>🔲 Nodes</b> (8 个工具) — CharacterBody、AnimatedSprite、Audio、Video、Parallax、RichText、Container、Tab</summary>

| 工具 | 描述 |
|---|---|
| `read_character_body` | 读取 CharacterBody2D/3D 属性。 |
| `read_animated_sprite` | 读取 AnimatedSprite2D/3D 及动画和帧数据。 |
| `read_audio_player` | 读取 AudioStreamPlayer2D/3D 及音频流和播放设置。 |
| `read_video_player` | 读取 VideoStreamPlayer 及视频流和播放设置。 |
| `read_parallax` | 读取 ParallaxBackground/Parallax2D 及层级配置。 |
| `read_rich_text` | 读取 RichTextLabel 及 BBCode 内容。 |
| `read_container` | 读取 Container 派生节点及子布局信息。 |
| `read_tab_container` | 读取 TabContainer 及标签页名称和数量。 |

</details>

<details>
<summary><b>📦 Resource</b> (8 个工具) — .tres 读写创建、材质 PBR、主题、模板</summary>

| 工具 | 描述 |
|---|---|
| `read_resource` | 读取 .tres 资源文件。 |
| `list_resources` | 列出所有资源文件。 |
| `create_resource` | 从模板创建资源。 |
| `write_resource` | 向资源写入属性。 |
| `list_materials` | 按类型分组列出材质。 |
| `read_material` | 读取材质（PBR 格式化）。 |
| `set_material_param` | 设置单个材质参数。 |
| `read_theme` | 读取 Theme 资源（按类型分组）。 |

</details>

<details>
<summary><b>🔊 Audio</b> (7 个工具) — 音频总线布局 CRUD、效果器、音量控制</summary>

| 工具 | 描述 |
|---|---|
| `read_audio_bus_layout` | 读取 AudioBusLayout。 |
| `list_audio_files` | 按格式列出音频文件。 |
| `create_audio_bus_layout` | 创建 AudioBusLayout。 |
| `add_audio_bus` | 向布局添加音频总线。 |
| `remove_audio_bus` | 移除音频总线。 |
| `add_bus_effect` | 向音频总线添加效果器。 |
| `set_bus_volume` | 设置总线音量（dB）。 |

</details>

<details>
<summary><b>🧩 Shader Graph</b> (8 个工具) — VisualShader 图谱节点增删连、参数设置</summary>

| 工具 | 描述 |
|---|---|
| `create_visual_shader` | 创建新的 VisualShader .tres 图文件。 |
| `add_shader_graph_node` | 向 VisualShader 图添加节点（40+ 节点类型：常量、数学、纹理、效果）。 |
| `remove_shader_graph_node` | 按索引从 VisualShader 图移除节点。 |
| `connect_shader_graph_nodes` | 在 VisualShader 图中连接两个节点端口。 |
| `disconnect_shader_graph_nodes` | 在 VisualShader 图中断开两个节点端口。 |
| `set_shader_node_param` | 设置 VisualShader 节点参数（常量、表达式、运算符等）。 |
| `list_shader_node_types` | 按类别列出所有 VisualShader 节点类型及输入/输出数量。 |
| `get_shader_node_defaults` | 获取特定 VisualShader 节点类型的默认端口和参数。 |

</details>

<details>
<summary><b>🛠️ Utility</b> (6 个工具) — 全局信号列表、StyleBox、AtlasTexture、Popup、项目图标、内聚报告</summary>

| 工具 | 描述 |
|---|---|
| `list_all_signals` | 列出 Godot 所有内置信号。 |
| `read_project_icon` | 读取项目图标文件。 |
| `read_stylebox` | 读取主题和场景中的 StyleBox 资源。 |
| `create_atlas_texture` | 从精灵表创建 AtlasTexture .tres。 |
| `list_popups` | 列出跨场景的 Popup/PopupMenu/AcceptDialog 节点。 |
| `generate_cohesion_report` | 生成项目代码内聚和耦合报告。 |

</details>

<details>
<summary><b>🖼️ Rendering</b> (5 个工具) — MeshInstance、Viewport、Area、RayCast/ShapeCast</summary>

| 工具 | 描述 |
|---|---|
| `read_mesh_instance` | 读取 MeshInstance3D 及网格和材质槽。 |
| `set_mesh_surface_material` | 设置网格表面槽的材质。 |
| `read_viewport` | 读取 Viewport 节点配置。 |
| `read_area` | 读取 Area2D/Area3D 及碰撞和重叠设置。 |
| `read_raycast` | 读取 RayCast2D/3D 或 ShapeCast2D/3D 配置。 |

</details>

<details>
<summary><b>🌍 Environment</b> (4 个工具) — Environment .tres 读写 + 预设</summary>

| 工具 | 描述 |
|---|---|
| `read_environment` | 读取 Environment 资源。 |
| `list_environments` | 列出 Environment 资源。 |
| `create_environment` | 从预设创建 Environment。 |
| `set_environment_param` | 设置环境参数。 |

</details>

<details>
<summary><b>🔍 Inspector</b> (5 个工具) — Camera、Light、Particle 节点检测与编辑</summary>

| 工具 | 描述 |
|---|---|
| `list_cameras` | 列出 Camera 节点。 |
| `read_camera` | 读取相机配置。 |
| `list_lights` | 列出灯光节点。 |
| `set_light_param` | 设置灯光参数。 |
| `read_particles` | 列出粒子系统。 |

</details>

<details>
<summary><b>⚡ Physics</b> (4 个工具) — PhysicsMaterial CRUD、碰撞层名称</summary>

| 工具 | 描述 |
|---|---|
| `list_physics_materials` | 列出 PhysicsMaterial。 |
| `read_physics_material` | 读取 PhysicsMaterial。 |
| `create_physics_material` | 创建 PhysicsMaterial。 |
| `read_collision_layers` | 读取碰撞层名称。 |

</details>

<details>
<summary><b>📥 Import</b> (3 个工具) — .import 文件读写与列表</summary>

| 工具 | 描述 |
|---|---|
| `read_import_config` | 读取 .import 文件配置。 |
| `list_import_files` | 按类型分组列出 .import 文件。 |
| `write_import_config` | 写入导入设置。 |

</details>

<details>
<summary><b>🗺️ TileMap</b> (3 个工具) — TileSet 资源解析、TileMapLayer 节点</summary>

| 工具 | 描述 |
|---|---|
| `list_tilesets` | 列出 TileSet 资源。 |
| `read_tileset` | 读取 TileSet 资源。 |
| `read_tilemap` | 读取场景中的 TileMapLayer。 |

</details>

<details>
<summary><b>🧭 Navigation</b> (3 个工具) — NavigationRegion 检测 + NavigationMesh 创建</summary>

| 工具 | 描述 |
|---|---|
| `list_nav_regions` | 列出 NavigationRegion 节点。 |
| `read_nav_region` | 读取导航区域。 |
| `create_nav_mesh` | 创建 NavigationMesh .tres。 |

</details>

<details>
<summary><b>🌐 Translation</b> (3 个工具) — CSV/PO 翻译文件读写</summary>

| 工具 | 描述 |
|---|---|
| `list_translations` | 列出翻译文件。 |
| `read_translation` | 读取翻译文件。 |
| `create_translation` | 创建翻译 CSV。 |

</details>

<details>
<summary><b>🔗 Joints</b> (3 个工具) — 物理关节创建、参数设置、列表</summary>

| 工具 | 描述 |
|---|---|
| `create_joint` | 创建物理关节（PinJoint、HingeJoint、SliderJoint 等）。 |
| `set_joint_param` | 设置物理关节参数。 |
| `list_joints` | 列出场景中的所有物理关节。 |

</details>

<details>
<summary><b>🆔 UID</b> (3 个工具) — 文件 UID 查询、批量更新、缺失检测</summary>

| 工具 | 描述 |
|---|---|
| `get_uid` | 获取文件的 UID。 |
| `update_project_uids` | 扫描缺失的 UID。 |
| `list_missing_uids` | 列出缺少 UID 的文件。 |

</details>

<details>
<summary><b>📐 2D Geometry</b> (2 个工具) — CollisionPolygon2D、CollisionShape2D 形状设置</summary>

| 工具 | 描述 |
|---|---|
| `create_collision_polygon` | 创建带顶点集的 CollisionPolygon2D。 |
| `set_shape_points` | 设置 CollisionShape2D 的形状点。 |

</details>

<details>
<summary><b>🔄 Diff</b> (2 个工具) — 场景与资源对比</summary>

| 工具 | 描述 |
|---|---|
| `diff_scene` | 比较两个场景文件。 |
| `diff_resource` | 比较两个资源文件。 |

</details>

<details>
<summary><b>📋 Other</b> (8 个工具) — GDExtension、C#、World3D、GridMap、Texture 等</summary>

| 工具 | 描述 |
|---|---|
| `read_gdextension` | 读取 .gdextension 配置。 |
| `list_csproj` | 列出 C# 项目文件。 |
| `create_world` | 创建 World3D .tres。 |
| `read_texture_info` | 读取纹理资源信息。 |

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

#### SSE（Server-Sent Events）— HTTP 传输

适用于远程或基于 Web 的 MCP 客户端（使用 SSE）：

1. 以 SSE 模式启动服务器：
   ```bash
   npx @yanhuifair/godot-mcp -t sse --port 3000 -p .
   ```

2. 配置你的 MCP 客户端：
   ```json
   {
     "mcpServers": {
       "godot-mcp": {
         "url": "http://127.0.0.1:3000/sse"
       }
     }
   }
   ```

#### Streamable HTTP — MCP 2025 传输

适用于支持 Streamable HTTP 规范的现代 MCP 客户端：

1. 以 Streamable HTTP 模式启动服务器：
   ```bash
   npx @yanhuifair/godot-mcp -t streamable-http --port 3000 -p .
   ```

2. 配置你的 MCP 客户端：
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

#### 同时启用所有传输

同时运行三种传输（stdio + SSE + Streamable HTTP）：

```bash
npx @yanhuifair/godot-mcp -t all --port 3000 -p .
```

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
`editor_play` `editor_stop` `editor_run_specific_scene` `editor_get_running_scene_tree` `editor_get_performance_monitors`

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
`editor_open_asset` `editor_list_filesystem` `editor_create_folder` `editor_delete_asset` `editor_rename_asset` `editor_move_asset` `editor_duplicate_asset` `editor_reimport_asset` `editor_get_dependency_list`

**项目设置：**
`editor_get_project_setting` `editor_set_project_setting` `editor_get_editor_setting` `editor_set_editor_setting` `editor_get_project_directory`

**输入与自动加载：**
`editor_get_input_map` `editor_add_input_action` `editor_remove_input_action` `editor_get_autoload_list` `editor_add_autoload` `editor_remove_autoload`

**资源：**
`editor_bake_lightmaps` `editor_bake_navigation` `editor_take_screenshot`

**类文档：**
`editor_get_class_list` `editor_get_method_list` `editor_get_class_property_list` `editor_get_class_signal_list` `editor_get_class_doc` `editor_search_help`

**相机与视图：**
`editor_get_editor_camera` `editor_set_editor_camera` `editor_toggle_grid` `editor_toggle_snap`

**其他：**
`editor_get_recent_scenes` `editor_simulate_key` `editor_get_plugin_list` `editor_enable_plugin` `editor_disable_plugin` `editor_get_error_list` `editor_clear_errors` `editor_health_check`

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
| `--install-addons` | 将 addons/godot_mcp 复制到目标 Godot 项目 |
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
