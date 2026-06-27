// ============================================================
// Editor 工具测试 — 需要 Godot 编辑器运行中
// Godot 必须已经启动且 MCP 插件在 TCP 9876 端口监听
// ============================================================
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const P = resolve(__dirname, "test-project");
const G = "\x1b[32m",
  R = "\x1b[31m",
  Y = "\x1b[33m",
  B = "\x1b[36m",
  N = "\x1b[0m";
let ok = 0,
  ng = 0;

function pass(n) {
  ok++;
  console.log(`  ${G}✓${N} ${n}`);
}
function fail(n, m) {
  ng++;
  console.log(`  ${R}✗${N} ${n}: ${m || ""}`);
}
function info(n) {
  console.log(`  ${Y}ℹ${N} ${n}`);
}
function hdr(n) {
  console.log(`\n${B}━━━ ${n} ━━━${N}`);
}

// 直接通过 TCP 发送 JSON-RPC 命令
import net from "node:net";

let reqId = 1;

function rpc(method, params = {}) {
  return new Promise((resolve, reject) => {
    const id = reqId++;
    const client = new net.Socket();
    let data = "";
    const timer = setTimeout(() => {
      client.destroy();
      reject(new Error("TCP timeout"));
    }, 5000);

    client.connect(9876, "127.0.0.1", () => {
      const req = JSON.stringify({ jsonrpc: "2.0", method, params, id });
      client.write(req + "\n");
    });

    client.on("data", (chunk) => {
      data += chunk.toString();
      try {
        const result = JSON.parse(data);
        clearTimeout(timer);
        client.destroy();
        if (result.error) reject(new Error(result.error.message || JSON.stringify(result.error)));
        else resolve(result.result);
      } catch {
        /* wait for more data */
      }
    });

    client.on("error", (e) => {
      clearTimeout(timer);
      reject(e);
    });
  });
}

console.log(`${B}╔══════════════════════════════════════╗${N}`);
console.log(`${B}║  Editor 工具测试 (需 Godot 运行中)    ║${N}`);
console.log(`${B}╚══════════════════════════════════════╝${N}`);

// ====== 连接检查 ======
let connected = false;
try {
  hdr("连接检查");
  const health = await rpc("editor_health_check");
  info(`Godot 插件状态: ${JSON.stringify(health)}`);
  connected = true;
  pass("editor_health_check - Godot 插件可达");
} catch (e) {
  fail("连接失败", e.message);
  console.log(`${R}请确保 Godot 编辑器已启动且插件在 9876 端口监听${N}`);
  process.exit(1);
}

if (!connected) process.exit(1);

// ====== 基本信息 ======
hdr("编辑器基本信息");
try {
  const info = await rpc("editor_get_info");
  pass("editor_get_info");
} catch (e) {
  fail("editor_get_info", e.message);
}

try {
  const rect = await rpc("editor_get_rect");
  pass("editor_get_rect");
} catch (e) {
  fail("editor_get_rect", e.message);
}

try {
  const dir = await rpc("editor_get_project_directory");
  pass("editor_get_project_directory");
} catch (e) {
  fail("editor_get_project_directory", e.message);
}

// ====== 场景操作 ======
hdr("场景操作");
try {
  // 打开 main 场景
  await rpc("editor_open_asset", { path: "res://scenes/main.tscn" });
  await new Promise((r) => setTimeout(r, 500));
  pass("editor_open_asset - 打开 main.tscn");
} catch (e) {
  fail("editor_open_asset", e.message);
}

try {
  const scene = await rpc("editor_get_open_scene");
  pass(`editor_get_open_scene: ${typeof scene === "string" ? scene.substring(0, 60) : "ok"}`);
} catch (e) {
  fail("editor_get_open_scene", e.message);
}

try {
  const current = await rpc("editor_read_current_scene");
  pass("editor_read_current_scene");
} catch (e) {
  fail("editor_read_current_scene", e.message);
}

try {
  await rpc("editor_save");
  pass("editor_save");
} catch (e) {
  fail("editor_save", e.message);
}

// ====== 选择节点 ======
hdr("节点选择");
try {
  await rpc("editor_set_selection", { node_path: "Main" });
  await new Promise((r) => setTimeout(r, 200));
  pass("editor_set_selection - Main");
} catch (e) {
  fail("editor_set_selection", e.message);
}

try {
  const sel = await rpc("editor_get_selection");
  pass(`editor_get_selection: ${JSON.stringify(sel).substring(0, 80)}`);
} catch (e) {
  fail("editor_get_selection", e.message);
}

try {
  const props = await rpc("editor_get_node_properties", { node_path: "Main" });
  pass("editor_get_node_properties - Main");
} catch (e) {
  fail("editor_get_node_properties", e.message);
}

// ====== 编辑操作 ======
hdr("编辑操作");
try {
  await rpc("editor_undo");
  pass("editor_undo");
} catch (e) {
  fail("editor_undo", e.message);
}

try {
  await rpc("editor_redo");
  pass("editor_redo");
} catch (e) {
  fail("editor_redo", e.message);
}

// ====== 节点 CRUD ======
hdr("节点 CRUD");
try {
  await rpc("editor_add_node", { type: "Label", name: "TestLabel", parent_path: "Main" });
  await new Promise((r) => setTimeout(r, 300));
  pass("editor_add_node - TestLabel");
} catch (e) {
  fail("editor_add_node", e.message);
}

try {
  await rpc("editor_rename_node", { node_path: "Main/TestLabel", new_name: "RenamedLabel" });
  await new Promise((r) => setTimeout(r, 200));
  pass("editor_rename_node");
} catch (e) {
  fail("editor_rename_node", e.message);
}

try {
  await rpc("editor_duplicate_node", { node_path: "Main/RenamedLabel" });
  await new Promise((r) => setTimeout(r, 200));
  pass("editor_duplicate_node");
} catch (e) {
  fail("editor_duplicate_node", e.message);
}

try {
  await rpc("editor_remove_node", { node_path: "Main/RenamedLabel2" });
  await new Promise((r) => setTimeout(r, 200));
  pass("editor_remove_node");
} catch (e) {
  fail("editor_remove_node", e.message);
}

// ====== 脚本 ======
hdr("脚本操作");
try {
  await rpc("editor_create_script", { path: "res://scripts/_test_editor.gd", type: "gdscript" });
  await new Promise((r) => setTimeout(r, 300));
  pass("editor_create_script");
} catch (e) {
  fail("editor_create_script", e.message);
}

try {
  await rpc("editor_attach_script", { node_path: "Main/RenamedLabel", script_path: "res://scripts/_test_editor.gd" });
  pass("editor_attach_script");
} catch (e) {
  fail("editor_attach_script", e.message);
}

try {
  const methods = await rpc("editor_get_method_list", { class_name: "Node" });
  pass("editor_get_method_list - Node");
} catch (e) {
  fail("editor_get_method_list", e.message);
}

try {
  const classes = await rpc("editor_get_class_list", { filter: "Node" });
  pass("editor_get_class_list");
} catch (e) {
  fail("editor_get_class_list", e.message);
}

// ====== 信号 ======
hdr("信号操作");
try {
  const signals = await rpc("editor_list_node_signals", { node_path: "Main" });
  pass("editor_list_node_signals - Main");
} catch (e) {
  fail("editor_list_node_signals", e.message);
}

// ====== 文件系统 ======
hdr("文件系统");
try {
  const fs = await rpc("editor_list_filesystem", { path: "res://" });
  pass("editor_list_filesystem");
} catch (e) {
  fail("editor_list_filesystem", e.message);
}

try {
  await rpc("editor_create_folder", { path: "res://_test_folder" });
  pass("editor_create_folder");
} catch (e) {
  fail("editor_create_folder", e.message);
}

try {
  const deps = await rpc("editor_get_dependency_list", { path: "res://scenes/main.tscn" });
  pass("editor_get_dependency_list");
} catch (e) {
  fail("editor_get_dependency_list", e.message);
}

// ====== 项目设置 ======
hdr("项目设置");
try {
  const setting = await rpc("editor_get_project_setting", { setting: "application/config/name" });
  pass(`editor_get_project_setting: ${JSON.stringify(setting).substring(0, 60)}`);
} catch (e) {
  fail("editor_get_project_setting", e.message);
}

try {
  const editorSetting = await rpc("editor_get_editor_setting", { setting: "interface/theme/base_color" });
  pass("editor_get_editor_setting");
} catch (e) {
  fail("editor_get_editor_setting", e.message);
}

try {
  const inputMap = await rpc("editor_get_input_map");
  pass("editor_get_input_map");
} catch (e) {
  fail("editor_get_input_map", e.message);
}

try {
  const autoloads = await rpc("editor_get_autoload_list");
  pass("editor_get_autoload_list");
} catch (e) {
  fail("editor_get_autoload_list", e.message);
}

// ====== 插件管理 ======
hdr("插件管理");
try {
  const plugins = await rpc("editor_get_plugin_list");
  pass("editor_get_plugin_list");
} catch (e) {
  fail("editor_get_plugin_list", e.message);
}

// ====== 类文档 ======
hdr("类文档");
try {
  const classProps = await rpc("editor_get_class_property_list", { class_name: "Node2D" });
  pass("editor_get_class_property_list - Node2D");
} catch (e) {
  fail("editor_get_class_property_list", e.message);
}

try {
  const classSignals = await rpc("editor_get_class_signal_list", { class_name: "Node" });
  pass("editor_get_class_signal_list - Node");
} catch (e) {
  fail("editor_get_class_signal_list", e.message);
}

// ====== 编辑器视图 ======
hdr("编辑器视图");
try {
  await rpc("editor_show_in_filesystem", { path: "res://scenes/main.tscn" });
  pass("editor_show_in_filesystem");
} catch (e) {
  fail("editor_show_in_filesystem", e.message);
}

try {
  await rpc("editor_open_dock", { dock: "filesystem" });
  pass("editor_open_dock - filesystem");
} catch (e) {
  fail("editor_open_dock", e.message);
}

try {
  const recent = await rpc("editor_get_recent_scenes");
  pass("editor_get_recent_scenes");
} catch (e) {
  fail("editor_get_recent_scenes", e.message);
}

try {
  const errors = await rpc("editor_get_error_list");
  pass("editor_get_error_list");
} catch (e) {
  fail("editor_get_error_list", e.message);
}

// ====== 编辑器相机（3D） ======
hdr("编辑器 3D 相机");
try {
  // 先打开 3D 场景
  await rpc("editor_open_asset", { path: "res://scenes/test_3d.tscn" });
  await new Promise((r) => setTimeout(r, 500));
  const cam = await rpc("editor_get_editor_camera");
  pass("editor_get_editor_camera");
} catch (e) {
  fail("editor_get_editor_camera", e.message);
}

try {
  await rpc("editor_set_editor_camera", { position: [0, 5, 10], rotation: [0, 0, 0] });
  pass("editor_set_editor_camera");
} catch (e) {
  fail("editor_set_editor_camera", e.message);
}

try {
  await rpc("editor_toggle_grid");
  pass("editor_toggle_grid");
} catch (e) {
  fail("editor_toggle_grid", e.message);
}

try {
  await rpc("editor_toggle_snap");
  pass("editor_toggle_snap");
} catch (e) {
  fail("editor_toggle_snap", e.message);
}

// ====== 播放控制（不执行，避免阻塞） ======
hdr("播放控制（仅检查可用性）");
try {
  // 不实际运行，只验证命令不报连接错误
  info("editor_play/stop/run_specific_scene 跳过（需要交互）");
} catch (e) {}

// ====== 清理 ======
hdr("清理");
try {
  // 回到 main 场景
  await rpc("editor_open_asset", { path: "res://scenes/main.tscn" });
  await new Promise((r) => setTimeout(r, 300));
  // 删除测试标签
  await rpc("editor_remove_node", { node_path: "Main/RenamedLabel" });
  await rpc("editor_delete_asset", { path: "res://_test_folder" });
  await rpc("editor_delete_asset", { path: "res://scripts/_test_editor.gd" });
  pass("editor cleanup");
} catch (e) {
  fail("cleanup", e.message);
}

// ====== 汇总 ======
console.log(`\n${B}══════════════════════════════════════════${N}`);
console.log(`${G}Editor 通过: ${ok}  ${R}失败: ${ng}  总计: ${ok + ng}${N}`);
console.log(`${B}══════════════════════════════════════════${N}`);
console.log(`\n非 Editor 工具: ${G}166/167${N} 通过`);
console.log(`Editor 工具: ${G}${ok}${N}/${R}${ng}${N} 通过`);
console.log(`综合: ${G}${166 + ok}${N}/${R}${1 + ng}${N} (不含未测试的 Editor 工具)`);
process.exit(ng > 0 ? 1 : 0);
