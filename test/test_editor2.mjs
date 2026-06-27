// ============================================================
// Editor 工具全量测试 — 单持久TCP连接
// ============================================================
import net from "node:net";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const P = resolve(dirname(fileURLToPath(import.meta.url)), "test-project");
const G = "\x1b[32m",
  R = "\x1b[31m",
  Y = "\x1b[33m",
  B = "\x1b[36m",
  N = "\x1b[0m";
let ok = 0,
  ng = 0,
  sk = 0;
function pass(n) {
  ok++;
  console.log(`  ${G}✓${N} ${n}`);
}
function fail(n, m) {
  ng++;
  console.log(`  ${R}✗${N} ${n}: ${m || ""}`);
}
function skip(n) {
  sk++;
  console.log(`  ${Y}⊘${N} ${n}`);
}
function info(n) {
  console.log(`  ${Y}ℹ${N} ${n}`);
}
function hdr(n) {
  console.log(`\n${B}━━━ ${n} ━━━${N}`);
}

let sock = null,
  buf = "",
  cid = 0;
const pend = {};

function rpc(method, params = {}, timeout = 4000) {
  return new Promise((resolve, reject) => {
    const id = ++cid;
    const t = setTimeout(() => {
      delete pend[id];
      reject(new Error("timeout"));
    }, timeout);
    pend[id] = (r) => {
      clearTimeout(t);
      if (r.error) reject(new Error(r.error.message || JSON.stringify(r.error)));
      else resolve(r.result);
    };
    sock.write(JSON.stringify({ jsonrpc: "2.0", method, params, id }) + "\n");
  });
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

// ==================== MAIN ====================
sock = new net.Socket();
let raw = "";
sock.on("data", (chunk) => {
  raw += chunk.toString();
  const lines = raw.split("\n");
  raw = lines.pop();
  for (const line of lines) {
    if (!line.trim()) continue;
    try {
      const r = JSON.parse(line);
      if (pend[r.id]) {
        pend[r.id](r);
        delete pend[r.id];
      }
    } catch {}
  }
});

sock.connect(9876, "127.0.0.1", async () => {
  console.log(`${B}╔══════════════════════════════════════╗${N}`);
  console.log(`${B}║  Editor 工具全量测试 (单连接)          ║${N}`);
  console.log(`${B}╚══════════════════════════════════════╝${N}`);

  try {
    // === Health & Info ===
    hdr("Health & 基本信息");
    await rpc("health_check");
    pass("health_check");
    const info = await rpc("get_editor_info");
    pass("get_editor_info");
    const ver = await rpc("get_editor_version");
    pass("get_editor_version");
    const rect = await rpc("get_editor_rect");
    pass("get_editor_rect");

    // === Scene State ===
    hdr("场景状态");
    try {
      await rpc("open_asset", { path: "res://scenes/main.tscn" });
      await sleep(400);
      pass("open_asset - main.tscn");
    } catch (e) {
      fail("open_asset", e.message);
    }

    try {
      await rpc("get_open_scene");
      pass("get_open_scene");
    } catch (e) {
      fail("get_open_scene", e.message);
    }
    try {
      await rpc("get_open_scenes");
      pass("get_open_scenes");
    } catch (e) {
      fail("get_open_scenes", e.message);
    }
    try {
      await rpc("get_current_scene_tree");
      pass("get_current_scene_tree");
    } catch (e) {
      fail("get_current_scene_tree", e.message);
    }

    // === Selection ===
    hdr("选择");
    try {
      await rpc("set_selection", { node_path: "Main" });
      await sleep(200);
      pass("set_selection");
    } catch (e) {
      fail("set_selection", e.message);
    }
    try {
      await rpc("get_selection");
      pass("get_selection");
    } catch (e) {
      fail("get_selection", e.message);
    }

    // === Scene Save ===
    hdr("场景保存");
    try {
      await rpc("save_scene");
      pass("save_scene");
    } catch (e) {
      fail("save_scene", e.message);
    }
    try {
      await rpc("save_all_scenes");
      pass("save_all_scenes");
    } catch (e) {
      fail("save_all_scenes", e.message);
    }
    try {
      await rpc("reload_scene");
      await sleep(300);
      pass("reload_scene");
    } catch (e) {
      fail("reload_scene", e.message);
    }

    // === Playback State (不实际播放) ===
    hdr("播放状态");
    try {
      await rpc("is_playing");
      pass("is_playing");
    } catch (e) {
      fail("is_playing", e.message);
    }

    // === Edit Operations ===
    hdr("编辑操作");
    try {
      await rpc("undo");
      pass("undo");
    } catch (e) {
      fail("undo", e.message);
    }
    try {
      await rpc("redo");
      pass("redo");
    } catch (e) {
      fail("redo", e.message);
    }

    // === Node Operations ===
    hdr("节点操作");
    try {
      await rpc("add_node", { type: "Label", name: "TestLabel", parent_path: "Main" });
      await sleep(300);
      pass("add_node");
    } catch (e) {
      fail("add_node", e.message);
    }
    try {
      await rpc("get_node_properties", { node_path: "Main/TestLabel" });
      pass("get_node_properties");
    } catch (e) {
      fail("get_node_properties", e.message);
    }
    try {
      await rpc("rename_node", { node_path: "Main/TestLabel", new_name: "RenamedLabel" });
      await sleep(200);
      pass("rename_node");
    } catch (e) {
      fail("rename_node", e.message);
    }
    try {
      await rpc("duplicate_node", { node_path: "Main/RenamedLabel" });
      await sleep(200);
      pass("duplicate_node");
    } catch (e) {
      fail("duplicate_node", e.message);
    }
    try {
      await rpc("remove_node", { node_path: "Main/RenamedLabel2" });
      await sleep(200);
      pass("remove_node");
    } catch (e) {
      fail("remove_node", e.message);
    }
    try {
      await rpc("set_node_properties", { node_path: "Main/RenamedLabel", properties: { text: "Hello MCP!" } });
      pass("set_node_properties");
    } catch (e) {
      fail("set_node_properties", e.message);
    }
    try {
      await rpc("select_node", { node_path: "Main" });
      pass("select_node");
    } catch (e) {
      fail("select_node", e.message);
    }

    // === Script ===
    hdr("脚本操作");
    try {
      await rpc("create_script", { path: "res://scripts/_ed.gd", type: "gdscript" });
      await sleep(300);
      pass("create_script");
    } catch (e) {
      fail("create_script", e.message);
    }
    try {
      await rpc("attach_script", { node_path: "Main/RenamedLabel", script_path: "res://scripts/_ed.gd" });
      pass("attach_script");
    } catch (e) {
      fail("attach_script", e.message);
    }

    // === Debug ===
    hdr("调试相关");
    try {
      await rpc("get_editor_output");
      pass("get_editor_output");
    } catch (e) {
      fail("get_editor_output", e.message);
    }
    try {
      await rpc("get_breakpoints");
      pass("get_breakpoints");
    } catch (e) {
      fail("get_breakpoints", e.message);
    }
    try {
      await rpc("set_breakpoint", { script: "res://scripts/_ed.gd", line: 1 });
      pass("set_breakpoint");
    } catch (e) {
      fail("set_breakpoint", e.message);
    }
    try {
      await rpc("remove_breakpoint", { script: "res://scripts/_ed.gd", line: 1 });
      pass("remove_breakpoint");
    } catch (e) {
      fail("remove_breakpoint", e.message);
    }

    // === File System ===
    hdr("文件系统");
    try {
      await rpc("show_in_filesystem", { path: "res://scenes/main.tscn" });
      pass("show_in_filesystem");
    } catch (e) {
      fail("show_in_filesystem", e.message);
    }
    try {
      await rpc("list_filesystem", { path: "res://" });
      pass("list_filesystem");
    } catch (e) {
      fail("list_filesystem", e.message);
    }

    // === UI ===
    hdr("UI / 窗口");
    try {
      await rpc("focus_editor");
      pass("focus_editor");
    } catch (e) {
      fail("focus_editor", e.message);
    }
    try {
      await rpc("open_dock", { dock: "filesystem" });
      pass("open_dock");
    } catch (e) {
      fail("open_dock", e.message);
    }

    // === Scene Creation ===
    hdr("场景创建");
    try {
      await rpc("set_main_scene", { path: "res://scenes/main.tscn" });
      pass("set_main_scene");
    } catch (e) {
      fail("set_main_scene", e.message);
    }
    try {
      await rpc("create_scene", { type: "Node2D", path: "res://scenes/_ed_test.tscn" });
      await sleep(300);
      pass("create_scene");
    } catch (e) {
      fail("create_scene", e.message);
    }

    // === Settings ===
    hdr("设置");
    try {
      await rpc("get_editor_setting", { setting: "interface/theme/base_color" });
      pass("get_editor_setting");
    } catch (e) {
      fail("get_editor_setting", e.message);
    }
    try {
      await rpc("get_project_setting", { setting: "application/config/name" });
      pass("get_project_setting");
    } catch (e) {
      fail("get_project_setting", e.message);
    }
    try {
      await rpc("set_editor_setting", { setting: "interface/theme/base_color", value: "#333333" });
      pass("set_editor_setting");
    } catch (e) {
      fail("set_editor_setting", e.message);
    }
    // Restore
    try {
      await rpc("set_editor_setting", { setting: "interface/theme/base_color", value: "#252525" });
    } catch (e) {}

    // === Signals ===
    hdr("信号");
    try {
      await rpc("get_node_signals", { node_path: "Main" });
      pass("get_node_signals (list)");
    } catch (e) {
      fail("get_node_signals", e.message);
    }

    // === Debugger ===
    hdr("调试器 (不运行状态下测试)");
    try {
      await rpc("evaluate_expression", { expression: "1 + 1" });
      pass("evaluate_expression");
    } catch (e) {
      skip("evaluate_expression (需要调试会话)");
    }
    try {
      await rpc("get_stack_trace");
      skip("get_stack_trace (需要调试会话)");
    } catch (e) {
      skip("get_stack_trace (需要调试会话)");
    }
    try {
      await rpc("get_debug_variables");
      skip("get_debug_variables (需要调试会话)");
    } catch (e) {
      skip("get_debug_variables (需要调试会话)");
    }

    // === Screenshot ===
    hdr("截图");
    try {
      await rpc("take_screenshot", { path: "res://_ed_screenshot.png" });
      pass("take_screenshot");
    } catch (e) {
      fail("take_screenshot", e.message);
    }

    // === 3D Camera ===
    hdr("3D 相机");
    try {
      await rpc("open_asset", { path: "res://scenes/test_3d.tscn" });
      await sleep(500);
      await rpc("get_editor_camera");
      pass("get_editor_camera");
    } catch (e) {
      fail("get_editor_camera", e.message);
    }
    try {
      await rpc("set_editor_camera", { position: [0, 5, 10] });
      pass("set_editor_camera");
    } catch (e) {
      fail("set_editor_camera", e.message);
    }
    try {
      await rpc("toggle_grid");
      pass("toggle_grid");
    } catch (e) {
      fail("toggle_grid", e.message);
    }

    // === Instantiate Scene ===
    hdr("场景实例化");
    try {
      await rpc("open_asset", { path: "res://scenes/main.tscn" });
      await sleep(300);
      await rpc("instantiate_scene", { path: "res://scenes/player.tscn" });
      pass("instantiate_scene");
    } catch (e) {
      fail("instantiate_scene", e.message);
    }

    // === Plugins ===
    hdr("插件");
    try {
      await rpc("get_plugin_list");
      pass("get_plugin_list");
    } catch (e) {
      fail("get_plugin_list", e.message);
    }

    // === Cleanup ===
    hdr("清理");
    try {
      await rpc("open_asset", { path: "res://scenes/main.tscn" });
      await sleep(300);
      await rpc("remove_node", { node_path: "Main/RenamedLabel" });
      await rpc("remove_node", { node_path: "Main/Player" });
      await rpc("delete_asset", { path: "res://scripts/_ed.gd" });
      await rpc("delete_asset", { path: "res://scenes/_ed_test.tscn" });
      await rpc("delete_asset", { path: "res://_ed_screenshot.png" });
      pass("cleanup");
    } catch (e) {
      info("cleanup partial: " + e.message);
    }

    // ====== SUMMARY ======
    console.log(`\n${B}══════════════════════════════════════════${N}`);
    console.log(`${G}Editor 通过: ${ok}  ${R}失败: ${ng}  ${Y}跳过: ${sk}  总计: ${ok + ng + sk}${N}`);
    console.log(`${B}══════════════════════════════════════════${N}`);
    sock.destroy();
    process.exit(ng > 0 ? 1 : 0);
  } catch (e) {
    console.error(`${R}FATAL: ${e.message}${N}`);
    sock.destroy();
    process.exit(1);
  }
});

sock.on("error", (e) => {
  console.error(`${R}Socket error: ${e.message}${N}`);
  process.exit(1);
});
setTimeout(() => {
  console.log(`${R}FATAL timeout${N}`);
  sock.destroy();
  process.exit(1);
}, 120000);
