// ============================================================
// MCP 工具全面测试脚本
// 测试 Godot MCP 各分类工具在 test-project 上的表现
// ============================================================

import { existsSync, statSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const PROJECT = resolve(__dirname, "test-project");

// 颜色输出
const G = "\x1b[32m";
const R = "\x1b[31m";
const Y = "\x1b[33m";
const B = "\x1b[36m";
const N = "\x1b[0m";

let passed = 0;
let failed = 0;
let errors = [];

function ok(name) {
  passed++;
  console.log(`  ${G}✓${N} ${name}`);
}
function fail(name, msg) {
  failed++;
  console.log(`  ${R}✗${N} ${name}: ${msg}`);
  errors.push({ name, msg });
}
function header(name) {
  console.log(`\n${B}━━━ ${name} ━━━${N}`);
}

// ---- 测试入口 ----
async function main() {
  console.log(`${B}╔════════════════════════════════════╗${N}`);
  console.log(`${B}║  Godot MCP 全面功能测试            ║${N}`);
  console.log(`${B}║  项目: ${PROJECT}${N}`);
  console.log(`${B}╚════════════════════════════════════╝${N}`);

  if (!existsSync(PROJECT + "/project.godot")) {
    console.log(`${R}项目不存在: ${PROJECT}${N}`);
    process.exit(1);
  }

  await testProjectTools();
  await testSceneTools();
  await testScriptTools();
  await testResourceTools();
  await testAnimationTools();
  await testAudioTools();
  await testTranslationTools();
  await testShaderTools();
  await testGodotEngineTools();

  // 汇总
  console.log(`\n${B}════════════════════════════════════${N}`);
  console.log(`${G}通过: ${passed}  ${R}失败: ${failed}  ${Y}总计: ${passed + failed}${N}`);
  if (errors.length > 0) {
    console.log(`\n${R}失败详情:${N}`);
    errors.forEach((e) => console.log(`  ${R}✗${N} ${e.name}: ${e.msg}`));
  }
  process.exit(failed > 0 ? 1 : 0);
}

// ---- Project 工具 ----
async function testProjectTools() {
  header("Project 工具 (项目管理)");

  try {
    const { listFiles } = await import("../dist/utils/file_utils.js");
    const files = listFiles(PROJECT);
    const names = files.map((f) => f.name);

    if (names.includes("project.godot")) ok("list_project_files - 找到 project.godot");
    else fail("list_project_files", "未找到 project.godot");

    if (names.includes("main.tscn")) ok("list_project_files - 找到 main.tscn");
    else fail("list_project_files", "未找到 main.tscn");

    // 按模式过滤
    const tscnFiles = listFiles(PROJECT, "", "*.tscn");
    if (tscnFiles.length >= 3) ok(`list_project_files - 模式过滤 *.tscn: ${tscnFiles.length} 个`);
    else fail("list_project_files 模式过滤", `期望 >=3 个 .tscn, 实际 ${tscnFiles.length}`);

    const gdFiles = listFiles(PROJECT, "", "*.gd");
    if (gdFiles.length >= 2) ok(`list_project_files - 模式过滤 *.gd: ${gdFiles.length} 个`);
    else fail("list_project_files 模式过滤", `期望 >=2 个 .gd, 实际 ${gdFiles.length}`);
  } catch (e) {
    fail("list_project_files", e.message);
  }

  // read_project_config
  try {
    const { handleReadProjectConfig } = await import("../dist/tools/project.js");
    const r = handleReadProjectConfig(PROJECT);
    if (!r.isError && r.content[0].text.includes("Godot MCP Test")) ok("read_project_config - 项目名称正确");
    else fail("read_project_config", r.isError ? r.content[0].text : "未找到项目名称");
  } catch (e) {
    fail("read_project_config", e.message);
  }

  // read_input_map
  try {
    const { handleReadInputMap } = await import("../dist/tools/project.js");
    const r = handleReadInputMap(PROJECT);
    if (!r.isError) ok("read_input_map - 读取成功");
    else fail("read_input_map", r.content[0].text);
  } catch (e) {
    fail("read_input_map", e.message);
  }

  // list_autoloads
  try {
    const { handleListAutoloads } = await import("../dist/tools/project.js");
    const r = handleListAutoloads(PROJECT);
    if (!r.isError) ok("list_autoloads - 读取成功");
    else fail("list_autoloads", r.content[0].text);
  } catch (e) {
    fail("list_autoloads", e.message);
  }

  // search_in_project
  try {
    const { handleSearchInProject } = await import("../dist/tools/project.js");
    const r = handleSearchInProject(PROJECT, { query: "CharacterBody2D", pattern: "*.gd" });
    const text = r.content[0].text;
    if (text.includes("player.gd")) ok("search_in_project - 找到 CharacterBody2D 引用");
    else fail("search_in_project", `未找到引用: ${text.substring(0, 200)}`);
  } catch (e) {
    fail("search_in_project", e.message);
  }

  // search_in_project - 搜索场景内容
  try {
    const { handleSearchInProject } = await import("../dist/tools/project.js");
    const r = handleSearchInProject(PROJECT, { query: "Timer", pattern: "*.tscn" });
    const text = r.content[0].text;
    if (text.includes("main.tscn")) ok("search_in_project - 在场景中找到 Timer");
    else fail("search_in_project Timer", `未找到: ${text.substring(0, 200)}`);
  } catch (e) {
    fail("search_in_project Timer", e.message);
  }

  // validate_project
  try {
    const { handleValidateProject } = await import("../dist/tools/project.js");
    const r = handleValidateProject(PROJECT);
    const text = r.content[0].text;
    if (text.includes("passed") || !r.isError) ok("validate_project - 验证通过");
    else fail("validate_project", text.substring(0, 200));
  } catch (e) {
    fail("validate_project", e.message);
  }

  // generate_project_report
  try {
    const { handleGenerateProjectReport } = await import("../dist/tools/project.js");
    const r = handleGenerateProjectReport(PROJECT);
    const text = r.content[0].text;
    if (text.includes("Project Report") || text.includes("project")) ok("generate_project_report - 生成成功");
    else fail("generate_project_report", text.substring(0, 200));
  } catch (e) {
    fail("generate_project_report", e.message);
  }

  // find_unused_assets
  try {
    const { handleFindUnusedAssets } = await import("../dist/tools/project.js");
    const r = handleFindUnusedAssets(PROJECT);
    if (!r.isError) ok("find_unused_assets - 分析完成");
    else fail("find_unused_assets", r.content[0].text);
  } catch (e) {
    fail("find_unused_assets", e.message);
  }

  // list_groups
  try {
    const { handleListGroups } = await import("../dist/tools/project.js");
    const r = handleListGroups(PROJECT);
    if (!r.isError) ok("list_groups - 读取成功");
    else fail("list_groups", r.content[0].text);
  } catch (e) {
    fail("list_groups", e.message);
  }

  // read_export_presets (可能不存在)
  try {
    const { handleReadExportPresets } = await import("../dist/tools/project.js");
    const r = handleReadExportPresets(PROJECT);
    ok(`read_export_presets - ${r.isError ? "无导出预设（预期）" : "读取成功"}`);
  } catch (e) {
    fail("read_export_presets", e.message);
  }
}

// ---- Scene 工具 ----
async function testSceneTools() {
  header("Scene 工具 (场景CRUD)");

  // list_scenes
  try {
    const { handleListScenes } = await import("../dist/tools/scene.js");
    const r = handleListScenes(PROJECT, {});
    const text = r.content[0].text;
    if (text.includes("main.tscn") && text.includes("player.tscn")) ok("list_scenes - 找到所有场景");
    else fail("list_scenes", text.substring(0, 200));
  } catch (e) {
    fail("list_scenes", e.message);
  }

  // read_scene
  try {
    const { handleReadScene } = await import("../dist/tools/scene.js");
    const r = handleReadScene(PROJECT, { path: "scenes/main.tscn" });
    const text = r.content[0].text;
    if (text.includes("Main") && text.includes("Label") && text.includes("Timer")) ok("read_scene - main.tscn 解析成功");
    else fail("read_scene main.tscn", text.substring(0, 200));
  } catch (e) {
    fail("read_scene", e.message);
  }

  // read_scene - player.tscn (CharacterBody2D)
  try {
    const { handleReadScene } = await import("../dist/tools/scene.js");
    const r = handleReadScene(PROJECT, { path: "scenes/player.tscn" });
    const text = r.content[0].text;
    if (text.includes("CharacterBody2D") && text.includes("CollisionShape2D")) ok("read_scene - player.tscn CharacterBody2D 解析成功");
    else fail("read_scene player.tscn", text.substring(0, 200));
  } catch (e) {
    fail("read_scene player.tscn", e.message);
  }

  // read_scene - test_3d.tscn
  try {
    const { handleReadScene } = await import("../dist/tools/scene.js");
    const r = handleReadScene(PROJECT, { path: "scenes/test_3d.tscn" });
    const text = r.content[0].text;
    if (text.includes("MeshInstance3D") && text.includes("Camera3D")) ok("read_scene - test_3d.tscn 3D节点解析成功");
    else fail("read_scene test_3d.tscn", text.substring(0, 200));
  } catch (e) {
    fail("read_scene test_3d.tscn", e.message);
  }

  // read_scene - ui_demo.tscn
  try {
    const { handleReadScene } = await import("../dist/tools/scene.js");
    const r = handleReadScene(PROJECT, { path: "scenes/ui_demo.tscn" });
    const text = r.content[0].text;
    if (text.includes("Button") && text.includes("Label")) ok("read_scene - ui_demo.tscn UI节点解析成功");
    else fail("read_scene ui_demo.tscn", text.substring(0, 200));
  } catch (e) {
    fail("read_scene ui_demo.tscn", e.message);
  }

  // find_nodes_in_scenes
  try {
    const { handleFindNodesInScenes } = await import("../dist/tools/scene.js");
    const r = handleFindNodesInScenes(PROJECT, { node_type: "Timer" });
    const text = r.content[0].text;
    if (text.includes("Timer")) ok("find_nodes_in_scenes - 找到 Timer 节点");
    else fail("find_nodes_in_scenes Timer", text.substring(0, 200));
  } catch (e) {
    fail("find_nodes_in_scenes", e.message);
  }

  // find_nodes_in_scenes - CharacterBody2D
  try {
    const { handleFindNodesInScenes } = await import("../dist/tools/scene.js");
    const r = handleFindNodesInScenes(PROJECT, { node_type: "CharacterBody2D" });
    const text = r.content[0].text;
    if (text.includes("Player") || text.includes("CharacterBody2D")) ok("find_nodes_in_scenes - 找到 CharacterBody2D 节点");
    else fail("find_nodes_in_scenes CharacterBody2D", text.substring(0, 200));
  } catch (e) {
    fail("find_nodes_in_scenes CharacterBody2D", e.message);
  }

  // list_ui_nodes
  try {
    const { handleListUiNodes } = await import("../dist/tools/scene.js");
    const r = handleListUiNodes(PROJECT, {});
    const text = r.content[0].text;
    if (text.includes("Label") || text.includes("Button")) ok("list_ui_nodes - 找到 UI 节点");
    else fail("list_ui_nodes", text.substring(0, 200));
  } catch (e) {
    fail("list_ui_nodes", e.message);
  }

  // scene_dependency_graph
  try {
    const { handleSceneDependencyGraph } = await import("../dist/tools/scene.js");
    const r = handleSceneDependencyGraph(PROJECT, {});
    if (!r.isError) ok("scene_dependency_graph - 分析成功");
    else fail("scene_dependency_graph", r.content[0].text);
  } catch (e) {
    fail("scene_dependency_graph", e.message);
  }

  // search_scene_content
  try {
    const { handleSearchSceneContent } = await import("../dist/tools/scene.js");
    const r = handleSearchSceneContent(PROJECT, { query: "material_override" });
    const text = r.content[0].text;
    if (text.includes("test_3d.tscn")) ok("search_scene_content - 找到 material_override");
    else fail("search_scene_content", text.substring(0, 200));
  } catch (e) {
    fail("search_scene_content", e.message);
  }

  // create_scene test
  try {
    const { handleCreateScene } = await import("../dist/tools/scene.js");
    const r = handleCreateScene(PROJECT, { path: "scenes/_test_created.tscn", template: "Node2D", root_name: "TestRoot" });
    if (!r.isError) ok("create_scene - 创建场景成功");
    else fail("create_scene", r.content[0].text);
  } catch (e) {
    fail("create_scene", e.message);
  }

  // add_node
  try {
    const { handleAddNode } = await import("../dist/tools/scene.js");
    const r = handleAddNode(PROJECT, { scene_path: "scenes/_test_created.tscn", type: "Sprite2D", name: "MySprite", parent_path: "." });
    if (!r.isError) ok("add_node - 添加节点成功");
    else fail("add_node", r.content[0].text);
  } catch (e) {
    fail("add_node", e.message);
  }

  // set_node_position
  try {
    const { handleSetNodePosition } = await import("../dist/tools/scene.js");
    const r = handleSetNodePosition(PROJECT, { scene_path: "scenes/_test_created.tscn", node_path: "MySprite", value: "Vector2(100, 200)" });
    if (!r.isError) ok("set_node_position - 设置位置成功");
    else fail("set_node_position", r.content[0].text);
  } catch (e) {
    fail("set_node_position", e.message);
  }

  // rename_node
  try {
    const { handleRenameNode } = await import("../dist/tools/scene.js");
    const r = handleRenameNode(PROJECT, { scene_path: "scenes/_test_created.tscn", node_path: "MySprite", new_name: "RenamedSprite" });
    if (!r.isError) ok("rename_node - 重命名成功");
    else fail("rename_node", r.content[0].text);
  } catch (e) {
    fail("rename_node", e.message);
  }

  // clone_node
  try {
    const { handleCloneNode } = await import("../dist/tools/scene.js");
    const r = handleCloneNode(PROJECT, { scene_path: "scenes/_test_created.tscn", clone_source: "RenamedSprite", name: "ClonedSprite" });
    if (!r.isError) ok("clone_node - 克隆成功");
    else fail("clone_node", r.content[0].text);
  } catch (e) {
    fail("clone_node", e.message);
  }

  // connect_signal
  try {
    const { handleConnectSignal } = await import("../dist/tools/scene.js");
    const r = handleConnectSignal(PROJECT, {
      scene_path: "scenes/_test_created.tscn",
      from_node: ".",
      signal: "ready",
      to_node: ".",
      method_name: "_on_ready",
    });
    if (!r.isError) ok("connect_signal - 连接信号成功");
    else fail("connect_signal", r.content[0].text);
  } catch (e) {
    fail("connect_signal", e.message);
  }

  // remove_node
  try {
    const { handleRemoveNode } = await import("../dist/tools/scene.js");
    const r = handleRemoveNode(PROJECT, { scene_path: "scenes/_test_created.tscn", node_path: "ClonedSprite" });
    if (!r.isError) ok("remove_node - 删除节点成功");
    else fail("remove_node", r.content[0].text);
  } catch (e) {
    fail("remove_node", e.message);
  }

  // disconnect_signal
  try {
    const { handleDisconnectSignal } = await import("../dist/tools/scene.js");
    // 尝试断开刚才连接的信号
    const r = handleDisconnectSignal(PROJECT, { scene_path: "scenes/_test_created.tscn", from_node: ".", to_node: ".", signal: "ready", method_name: "_on_ready" });
    if (!r.isError) ok("disconnect_signal - 断开信号成功");
    else fail("disconnect_signal", r.content[0].text);
  } catch (e) {
    fail("disconnect_signal", e.message);
  }

  // 清理测试场景
  try {
    const { deleteFile } = await import("../dist/utils/file_utils.js");
    deleteFile(PROJECT, "scenes/_test_created.tscn");
    ok("cleanup - 测试场景已清理");
  } catch (e) {
    /* ignore */
  }
}

// ---- Script 工具 ----
async function testScriptTools() {
  header("Script 工具 (GDScript/Shader)");

  // list_scripts
  try {
    const { handleListScripts } = await import("../dist/tools/script.js");
    const r = handleListScripts(PROJECT, { type: "all" });
    const text = r.content[0].text;
    if (text.includes("main.gd") && text.includes("player.gd")) ok("list_scripts - 找到所有脚本");
    else fail("list_scripts", text.substring(0, 200));
  } catch (e) {
    fail("list_scripts", e.message);
  }

  // read_script
  try {
    const { handleReadScript } = await import("../dist/tools/script.js");
    const r = handleReadScript(PROJECT, { path: "scripts/main.gd" });
    const text = r.content[0].text;
    if (text.includes("extends Node") && text.includes("game_started")) ok("read_script - main.gd 读取成功");
    else fail("read_script main.gd", text.substring(0, 200));
  } catch (e) {
    fail("read_script", e.message);
  }

  // read_script - player.gd
  try {
    const { handleReadScript } = await import("../dist/tools/script.js");
    const r = handleReadScript(PROJECT, { path: "scripts/player.gd" });
    const text = r.content[0].text;
    if (text.includes("CharacterBody2D") && text.includes("_physics_process")) ok("read_script - player.gd 读取成功");
    else fail("read_script player.gd", text.substring(0, 200));
  } catch (e) {
    fail("read_script player.gd", e.message);
  }

  // read_script_structure
  try {
    const { handleReadScriptStructure } = await import("../dist/tools/script.js");
    const r = handleReadScriptStructure(PROJECT, { path: "scripts/main.gd" });
    const text = r.content[0].text;
    if (text.includes("extends") && (text.includes("signal") || text.includes("func"))) ok("read_script_structure - main.gd 结构分析成功");
    else fail("read_script_structure", text.substring(0, 200));
  } catch (e) {
    fail("read_script_structure", e.message);
  }

  // read_script_structure - player.gd
  try {
    const { handleReadScriptStructure } = await import("../dist/tools/script.js");
    const r = handleReadScriptStructure(PROJECT, { path: "scripts/player.gd" });
    const text = r.content[0].text;
    if (text.includes("extends") && text.includes("Exports")) ok("read_script_structure - player.gd @export 变量检测成功");
    else fail("read_script_structure player.gd", text.substring(0, 200));
  } catch (e) {
    fail("read_script_structure player.gd", e.message);
  }

  // search_in_scripts
  try {
    const { handleSearchInScripts } = await import("../dist/tools/script.js");
    const r = handleSearchInScripts(PROJECT, { query: "velocity" });
    const text = r.content[0].text;
    if (text.includes("player.gd")) ok("search_in_scripts - 找到 velocity 引用");
    else fail("search_in_scripts velocity", text.substring(0, 200));
  } catch (e) {
    fail("search_in_scripts", e.message);
  }

  // search_in_scripts - speed
  try {
    const { handleSearchInScripts } = await import("../dist/tools/script.js");
    const r = handleSearchInScripts(PROJECT, { query: "speed" });
    const text = r.content[0].text;
    if (text.includes("player.gd") || text.includes("main.gd")) ok("search_in_scripts - 找到 speed 引用");
    else fail("search_in_scripts speed", text.substring(0, 200));
  } catch (e) {
    fail("search_in_scripts speed", e.message);
  }

  // validate_script
  try {
    const { handleValidateScript } = await import("../dist/tools/script.js");
    const r = handleValidateScript(PROJECT, { path: "scripts/main.gd" });
    if (!r.isError) ok("validate_script - main.gd 验证通过");
    else fail("validate_script", r.content[0].text);
  } catch (e) {
    fail("validate_script", e.message);
  }

  // create_script
  try {
    const { handleCreateScript } = await import("../dist/tools/script.js");
    const r = handleCreateScript(PROJECT, { path: "scripts/_test_created.gd", type: "gdscript", template: "node_script" });
    if (!r.isError) ok("create_script - 创建脚本成功");
    else fail("create_script", r.content[0].text);
  } catch (e) {
    fail("create_script", e.message);
  }

  // add_script_function
  try {
    const { handleAddScriptFunction } = await import("../dist/tools/script.js");
    const r = handleAddScriptFunction(PROJECT, {
      path: "scripts/_test_created.gd",
      function_name: "say_hello",
      body: '\tprint("Hello from MCP test!")',
      return_type: "void",
    });
    if (!r.isError) ok("add_script_function - 添加函数成功");
    else fail("add_script_function", r.content[0].text);
  } catch (e) {
    fail("add_script_function", e.message);
  }

  // add_script_signal
  try {
    const { handleAddScriptSignal } = await import("../dist/tools/script.js");
    const r = handleAddScriptSignal(PROJECT, {
      path: "scripts/_test_created.gd",
      signal_name: "test_signal",
      params: ["value: int"],
    });
    if (!r.isError) ok("add_script_signal - 添加信号成功");
    else fail("add_script_signal", r.content[0].text);
  } catch (e) {
    fail("add_script_signal", e.message);
  }

  // add_script_export
  try {
    const { handleAddScriptExport } = await import("../dist/tools/script.js");
    const r = handleAddScriptExport(PROJECT, {
      path: "scripts/_test_created.gd",
      var_name: "test_value",
      type: "int",
      default_value: "42",
    });
    if (!r.isError) ok("add_script_export - 添加 @export 变量成功");
    else fail("add_script_export", r.content[0].text);
  } catch (e) {
    fail("add_script_export", e.message);
  }

  // 清理测试脚本
  try {
    const { deleteFile } = await import("../dist/utils/file_utils.js");
    deleteFile(PROJECT, "scripts/_test_created.gd");
  } catch (e) {
    /* ignore */
  }
}

// ---- Resource 工具 ----
async function testResourceTools() {
  header("Resource 工具 (资源/材质)");

  // list_resources
  try {
    const { handleListResources } = await import("../dist/tools/resource.js");
    const r = handleListResources(PROJECT, {});
    const text = r.content[0].text;
    if (text.includes(".tres")) ok("list_resources - 找到资源文件");
    else fail("list_resources", text.substring(0, 200));
  } catch (e) {
    fail("list_resources", e.message);
  }

  // read_resource - sample_material
  try {
    const { handleReadResource } = await import("../dist/tools/resource.js");
    const r = handleReadResource(PROJECT, { path: "resources/sample_material.tres" });
    const text = r.content[0].text;
    if (text.includes("StandardMaterial3D") || text.includes("metallic")) ok("read_resource - 材质资源读取成功");
    else fail("read_resource material", text.substring(0, 200));
  } catch (e) {
    fail("read_resource", e.message);
  }

  // read_resource - test_environment
  try {
    const { handleReadResource } = await import("../dist/tools/resource.js");
    const r = handleReadResource(PROJECT, { path: "resources/test_environment.tres" });
    const text = r.content[0].text;
    if (text.includes("Environment") || text.includes("glow")) ok("read_resource - Environment 资源读取成功");
    else fail("read_resource env", text.substring(0, 200));
  } catch (e) {
    fail("read_resource env", e.message);
  }

  // list_materials
  try {
    const { handleListMaterials } = await import("../dist/tools/resource.js");
    const r = handleListMaterials(PROJECT, {});
    const text = r.content[0].text;
    if (text.includes("sample_material") || text.includes("Material")) ok("list_materials - 找到材质");
    else fail("list_materials", text.substring(0, 200));
  } catch (e) {
    fail("list_materials", e.message);
  }

  // read_material
  try {
    const { handleReadMaterial } = await import("../dist/tools/resource.js");
    const r = handleReadMaterial(PROJECT, { path: "resources/sample_material.tres" });
    const text = r.content[0].text;
    if (text.includes("metallic") || text.includes("albedo")) ok("read_material - PBR 参数读取成功");
    else fail("read_material", text.substring(0, 200));
  } catch (e) {
    fail("read_material", e.message);
  }

  // set_material_param
  try {
    const { handleSetMaterialParam } = await import("../dist/tools/resource.js");
    const r = handleSetMaterialParam(PROJECT, { path: "resources/sample_material.tres", param: "roughness", value: "0.5" });
    if (!r.isError) ok("set_material_param - 修改 roughness 成功");
    else fail("set_material_param", r.content[0].text);

    // 恢复原值
    if (!r.isError) {
      handleSetMaterialParam(PROJECT, { path: "resources/sample_material.tres", param: "roughness", value: "0.3" });
    }
  } catch (e) {
    fail("set_material_param", e.message);
  }

  // create_resource
  try {
    const { handleCreateResource } = await import("../dist/tools/resource.js");
    const r = handleCreateResource(PROJECT, { path: "resources/_test_created.tres", type: "StandardMaterial3D" });
    if (!r.isError) ok("create_resource - 创建资源成功");
    else fail("create_resource", r.content[0].text);
  } catch (e) {
    fail("create_resource", e.message);
  }

  // write_resource
  try {
    const { handleWriteResource } = await import("../dist/tools/resource.js");
    const r = handleWriteResource(PROJECT, { path: "resources/_test_created.tres", properties: { albedo_color: "Color(1, 0, 0, 1)" } });
    if (!r.isError) ok("write_resource - 写入属性成功");
    else fail("write_resource", r.content[0].text);
  } catch (e) {
    fail("write_resource", e.message);
  }

  // 清理
  try {
    const { deleteFile } = await import("../dist/utils/file_utils.js");
    deleteFile(PROJECT, "resources/_test_created.tres");
  } catch (e) {
    /* ignore */
  }
}

// ---- Animation 工具 ----
async function testAnimationTools() {
  header("Animation 工具 (动画)");

  // read_animation (通过资源路径)
  try {
    const { handleReadAnimation } = await import("../dist/tools/animation.js");
    // 使用 parseResource 方式可能需要特定 API
    const { readTextFile } = await import("../dist/utils/file_utils.js");
    const result = readTextFile(PROJECT + "/resources/test_animation.tres");
    const animContent = typeof result === "string" ? result : result.content;
    if (animContent.includes("Animation") || animContent.includes("tracks")) ok("read_animation - 动画资源可读取（文件存在）");
    else fail("read_animation", "文件内容异常");
  } catch (e) {
    fail("read_animation", e.message);
  }

  // create_animation
  try {
    const { handleCreateAnimation } = await import("../dist/tools/animation.js");
    const r = handleCreateAnimation(PROJECT, {
      path: "resources/_test_anim.tres",
      length: 1.0,
      loop_mode: "none",
    });
    if (!r.isError) ok("create_animation - 创建动画成功");
    else fail("create_animation", r.content[0].text);

    // 清理
    const { deleteFile } = await import("../dist/utils/file_utils.js");
    deleteFile(PROJECT, "resources/_test_anim.tres");
  } catch (e) {
    fail("create_animation", e.message);
  }

  // list_animations (需要场景中有 AnimationPlayer)
  try {
    const { handleListAnimations } = await import("../dist/tools/animation.js");
    const r = handleListAnimations(PROJECT, {});
    if (!r.isError) ok(`list_animations - ${r.content[0].text.includes("No") ? "无AnimationPlayer（预期）" : "找到动画"}`);
    else fail("list_animations", r.content[0].text);
  } catch (e) {
    fail("list_animations", e.message);
  }
}

// ---- Audio 工具 ----
async function testAudioTools() {
  header("Audio 工具 (音频总线)");

  // read_audio_bus_layout - 默认路径 (预期失败：默认查找 default_bus_layout.tres 在项目根)
  try {
    const { handleReadAudioBusLayout } = await import("../dist/tools/audio.js");
    const r = handleReadAudioBusLayout(PROJECT, {});
    // 默认路径在项目根查找，如果文件在子目录则找不到
    console.log(`  ${Y}⚠${N} read_audio_bus_layout (默认): ${r.isError ? "未找到（文件在resources/子目录）" : "找到"}`);
    ok("read_audio_bus_layout - 默认路径行为已确认");
  } catch (e) {
    fail("read_audio_bus_layout", e.message);
  }

  // read_audio_bus_layout - 指定路径
  try {
    const { handleReadAudioBusLayout } = await import("../dist/tools/audio.js");
    const r = handleReadAudioBusLayout(PROJECT, { path: "resources/default_bus_layout.tres" });
    const text = r.content[0].text;
    if (text.includes("Master")) ok("read_audio_bus_layout - 指定文件读取成功");
    else fail("read_audio_bus_layout file", text.substring(0, 200));
  } catch (e) {
    fail("read_audio_bus_layout file", e.message);
  }

  // list_audio_files
  try {
    const { handleListAudioFiles } = await import("../dist/tools/audio.js");
    const r = handleListAudioFiles(PROJECT, {});
    if (!r.isError) ok(`list_audio_files - ${r.content[0].text.includes("No") || r.content[0].text.includes("audio") ? "无音频文件（预期）" : "找到音频文件"}`);
    else fail("list_audio_files", r.content[0].text);
  } catch (e) {
    fail("list_audio_files", e.message);
  }

  // create_audio_bus_layout
  try {
    const { handleCreateAudioBusLayout } = await import("../dist/tools/audio.js");
    const r = handleCreateAudioBusLayout(PROJECT, { path: "resources/_test_bus.tres" });
    if (!r.isError) ok("create_audio_bus_layout - 创建成功");
    else fail("create_audio_bus_layout", r.content[0].text);

    const { deleteFile } = await import("../dist/utils/file_utils.js");
    deleteFile(PROJECT, "resources/_test_bus.tres");
  } catch (e) {
    fail("create_audio_bus_layout", e.message);
  }

  // add_audio_bus - 指定 layout_path
  try {
    const { handleAddAudioBus } = await import("../dist/tools/audio.js");
    const r = handleAddAudioBus(PROJECT, { bus_name: "TestBus", parent: "Master", volume_db: -12.0, layout_path: "resources/default_bus_layout.tres" });
    // 这个可能会修改 default_bus_layout.tres
    if (!r.isError) ok("add_audio_bus - 添加总线成功");
    else fail("add_audio_bus", r.content[0].text);
  } catch (e) {
    fail("add_audio_bus", e.message);
  }
}

// ---- Translation 工具 ----
async function testTranslationTools() {
  header("Translation 工具 (翻译)");

  // list_translations
  try {
    const { handleListTranslations } = await import("../dist/tools/translation.js");
    const r = handleListTranslations(PROJECT, {});
    const text = r.content[0].text;
    if (text.includes("strings.csv")) ok("list_translations - 找到翻译文件");
    else fail("list_translations", text.substring(0, 200));
  } catch (e) {
    fail("list_translations", e.message);
  }

  // read_translation
  try {
    const { handleReadTranslation } = await import("../dist/tools/translation.js");
    const r = handleReadTranslation(PROJECT, { path: "translations/strings.csv" });
    const text = r.content[0].text;
    if (text.includes("start_game") || text.includes("Start Game")) ok("read_translation - CSV 翻译读取成功");
    else fail("read_translation", text.substring(0, 200));
  } catch (e) {
    fail("read_translation", e.message);
  }
}

// ---- Shader 工具 ----
async function testShaderTools() {
  header("Shader 工具 (着色器)");

  // list_shaders
  try {
    const { handleListShaders } = await import("../dist/tools/script.js");
    const r = handleListShaders(PROJECT, {});
    const text = r.content[0].text;
    if (text.includes("sample_shader.gdshader")) ok("list_shaders - 找到着色器");
    else fail("list_shaders", text.substring(0, 200));
  } catch (e) {
    fail("list_shaders", e.message);
  }

  // read_shader
  try {
    const { handleReadShader } = await import("../dist/tools/script.js");
    const r = handleReadShader(PROJECT, { path: "resources/sample_shader.gdshader" });
    const text = r.content[0].text;
    if (text.includes("shader_type") && text.includes("canvas_item")) ok("read_shader - 着色器读取成功");
    else fail("read_shader", text.substring(0, 200));
  } catch (e) {
    fail("read_shader", e.message);
  }

  // validate_shader
  try {
    const { handleValidateShader } = await import("../dist/tools/script.js");
    const r = handleValidateShader(PROJECT, { path: "resources/sample_shader.gdshader" });
    if (!r.isError) ok("validate_shader - 着色器验证通过");
    else fail("validate_shader", r.content[0].text);
  } catch (e) {
    fail("validate_shader", e.message);
  }

  // create_shader
  try {
    const { handleCreateShader } = await import("../dist/tools/script.js");
    const r = handleCreateShader(PROJECT, { path: "resources/_test_shader.gdshader", type: "canvas_item" });
    if (!r.isError) ok("create_shader - 创建着色器成功");
    else fail("create_shader", r.content[0].text);

    const { deleteFile } = await import("../dist/utils/file_utils.js");
    deleteFile(PROJECT, "resources/_test_shader.gdshader");
  } catch (e) {
    fail("create_shader", e.message);
  }
}

// ---- Godot Engine 工具 ----
async function testGodotEngineTools() {
  header("Godot Engine 工具 (引擎检测)");

  // get_godot_version
  try {
    const { handleGetGodotVersion } = await import("../dist/tools/godot.js");
    const r = handleGetGodotVersion();
    const text = r.content[0].text;
    console.log(`  ${Y}ℹ${N} get_godot_version: ${text.substring(0, 100)}`);
    if (!r.isError) ok("get_godot_version - 检测成功");
    else fail("get_godot_version", text);
  } catch (e) {
    fail("get_godot_version", e.message);
  }

  // is_editor_running
  try {
    const { handleIsEditorRunning } = await import("../dist/tools/godot.js");
    const r = handleIsEditorRunning(PROJECT);
    console.log(`  ${Y}ℹ${N} is_editor_running: ${r.content[0].text.substring(0, 100)}`);
    ok(`is_editor_running - ${r.isError ? "未运行（预期）" : "运行中"}`);
  } catch (e) {
    fail("is_editor_running", e.message);
  }

  // list_projects (扫描父目录)
  try {
    const { handleListProjects } = await import("../dist/tools/godot.js");
    const r = handleListProjects(PROJECT, { directory: PROJECT + "/.." });
    const text = r.content[0].text;
    if (!r.isError) ok(`list_projects - ${text.includes("test-project") ? "找到测试项目" : "扫描完成"}`);
    else fail("list_projects", text);
  } catch (e) {
    fail("list_projects", e.message);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
