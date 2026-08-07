// Copyright (c) 2026 FairYan
// SPDX-License-Identifier: AGPL-3.0-or-later
// ============================================================
// Godot MCP — 全量工具冒烟测试 (smoke test for EVERY registered tool)
// ============================================================
// 与 test_all.mjs 的分工：
//   test_all.mjs  验证「行为正确」（断言输出内容），覆盖挑选出来的工具。
//   本文件        验证「每一个注册工具都能被调用且不崩溃」，覆盖率 = 100%。
//
// 专门抓这几类问题：
//   1. handler 抛异常（未捕获的 TypeError / ESM 导入错误 / 空指针）
//   2. handler 挂起（没有超时保护的 IO）
//   3. 工具「永远返回空」——声称能用但实现是死的
//   4. schema 与 handler 不一致（参数名对不上）
//   5. 桥接类工具发出的 method 名在 plugin.gd 里根本没有对应实现
//
// 关键设计：
//   * 所有写操作在 test-project 的**临时副本**里跑，绝不碰 tracked fixture。
//   * 在 9876/9877 起**桩 TCP 服务**，这样 editor_*/runtime_* 工具不会
//     退化去 spawn 一个真实 Godot 编辑器（那会挂住几分钟并留下孤儿进程）。
//     桩服务同时**记录每个工具实际发出的 method 名**，用于和 plugin.gd 对账。
//   * 每个 handler 调用都有 8s 超时兜底。

import * as require_fs from 'node:fs';
import { cpSync, rmSync, mkdtempSync, readFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import net from 'node:net';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SRC_PROJECT = resolve(__dirname, 'test-project');
const REPO = resolve(__dirname, '..');

const G = '\x1b[32m', R = '\x1b[31m', Y = '\x1b[33m', B = '\x1b[36m', D = '\x1b[90m', N = '\x1b[0m';

const CALL_TIMEOUT_MS = 8000;

// 只排除「会 spawn 真实进程 / 需要真人 GUI」的工具。
const SPAWNS_PROCESS = new Set([
  'launch_editor', 'run_project', 'export_project', 'capture_screenshot',
  'stop_project', 'compile_shader', 'validate_script', 'get_godot_version',
  'check_godot_installation', 'list_export_templates', 'monitor_output',
  'import_resources',
]);

// ------------------------------------------------------------
// 桩 TCP 桥接服务
// ------------------------------------------------------------
function startStubBridge(port, seenMethods) {
  return new Promise((res, rej) => {
    const server = net.createServer((sock) => {
      let buf = '';
      sock.on('data', (chunk) => {
        buf += chunk.toString();
        let idx;
        while ((idx = buf.indexOf('\n')) !== -1) {
          const line = buf.slice(0, idx).trim();
          buf = buf.slice(idx + 1);
          if (!line) continue;
          let req;
          try { req = JSON.parse(line); } catch { continue; }
          if (req.method && req.method !== 'auth') seenMethods.add(req.method);
          // 统一返回结构化错误：handler 应当把它转成 isError，而不是崩溃。
          sock.write(JSON.stringify({
            jsonrpc: '2.0', id: req.id,
            error: { code: -32000, message: 'stub bridge: no real Godot attached' },
          }) + '\n');
        }
      });
      sock.on('error', () => {});
    });
    server.on('error', rej);
    server.listen(port, '127.0.0.1', () => res(server));
  });
}

// ------------------------------------------------------------
// 参数生成
// ------------------------------------------------------------
const zodDef = (zt) => zt?._def ?? {};
const typeName = (zt) => zodDef(zt).typeName;

function unwrap(zt) {
  let cur = zt;
  for (let i = 0; i < 10; i++) {
    const tn = typeName(cur);
    if (tn === 'ZodOptional' || tn === 'ZodNullable' || tn === 'ZodDefault') cur = zodDef(cur).innerType;
    else if (tn === 'ZodEffects') cur = zodDef(cur).schema;
    else return cur;
  }
  return cur;
}
function isOptional(zt) {
  const tn = typeName(zt);
  return tn === 'ZodOptional' || tn === 'ZodDefault' || tn === 'ZodNullable';
}

function guessByName(key) {
  const k = key.toLowerCase();
  if (k === 'scene_path' || (k.includes('scene') && k.includes('path'))) return 'scenes/ui_demo.tscn';
  if (k === 'script_path' || (k.includes('script') && k.includes('path'))) return 'scripts/main.gd';
  if (k.includes('shader') && k.includes('include')) return 'resources/test_include.gdshaderinc';
  if (k.includes('shader') && k.includes('path')) return 'resources/sample_shader.gdshader';
  if (k === 'resource_path' || (k.includes('resource') && k.includes('path'))) return 'resources/sample_material.tres';
  if (k === 'material_path') return 'resources/sample_material.tres';
  if (k === 'asset_path' || k === 'texture_path' || k === 'image_path') return 'icon.svg';
  if (k === 'output_path' || k === 'dest_path' || k === 'target_path' || k === 'to_path') return 'smoke_out.tres';
  if (k === 'path' || k === 'file_path') return 'scenes/ui_demo.tscn';
  if (k === 'node_path' || k === 'parent_path') return '.';
  if (k === 'node_name' || k === 'name') return 'SmokeNode';
  if (k === 'new_name') return 'SmokeRenamed';
  if (k === 'node_type' || k === 'type') return 'Node2D';
  if (k === 'keyword' || k === 'query' || k === 'search' || k === 'pattern') return 'Node';
  if (k === 'class_name' || k === 'godot_class') return 'Node2D';
  if (k === 'signal_name' || k === 'signal') return 'ready';
  if (k === 'method' || k === 'method_name') return '_on_ready';
  if (k === 'group' || k === 'group_name') return 'smoke';
  if (k === 'property' || k === 'property_name' || k === 'param' || k === 'param_name') return 'position';
  if (k === 'bus_name') return 'Master';
  if (k === 'action' || k === 'action_name') return 'ui_accept';
  if (k === 'locale') return 'en';
  if (k === 'key') return 'SMOKE_KEY';
  if (k === 'code' || k === 'content' || k === 'source' || k === 'text' || k === 'expression') return '1 + 1';
  if (k.includes('color')) return '#ff0000';
  if (k.endsWith('path')) return 'scenes/ui_demo.tscn';
  return 'smoke';
}

function sampleValue(zt, key, depth = 0) {
  if (depth > 4) return undefined;
  const inner = unwrap(zt);
  const tn = typeName(inner);
  const def = zodDef(inner);
  switch (tn) {
    case 'ZodString': return guessByName(key);
    case 'ZodNumber': return 0;
    case 'ZodBoolean': return false;
    case 'ZodEnum': return def.values?.[0];
    case 'ZodNativeEnum': return Object.values(def.values ?? {})[0];
    case 'ZodLiteral': return def.value;
    case 'ZodArray': {
      const el = sampleValue(def.type, key, depth + 1);
      return el === undefined ? [] : [el];
    }
    case 'ZodRecord': return {};
    case 'ZodObject': {
      const shape = typeof def.shape === 'function' ? def.shape() : def.shape;
      const out = {};
      for (const [k, v] of Object.entries(shape ?? {})) {
        if (isOptional(v)) continue;
        const s = sampleValue(v, k, depth + 1);
        if (s !== undefined) out[k] = s;
      }
      return out;
    }
    case 'ZodUnion': {
      for (const o of def.options ?? []) {
        const s = sampleValue(o, key, depth + 1);
        if (s !== undefined) return s;
      }
      return undefined;
    }
    case 'ZodAny':
    case 'ZodUnknown': return 'smoke';
    default: return undefined;
  }
}

function buildArgs(tool) {
  const args = {};
  for (const [key, zt] of Object.entries(tool.schema ?? {})) {
    if (isOptional(zt)) continue;
    const v = sampleValue(zt, key);
    if (v !== undefined) args[key] = v;
  }
  return args;
}

// ------------------------------------------------------------
// 语义上必须正确、猜不出来的参数
// ------------------------------------------------------------
const OVERRIDES = {
  read_scene: { scene_path: 'scenes/ui_demo.tscn' },
  edit_scene: { scene_path: 'scenes/_smoke.tscn', operations: [{ action: 'add_node', parent_path: '.', name: 'SmokeChild', type: 'Node2D' }] },
  create_scene: { scene_path: 'scenes/_smoke.tscn', template: 'Node2D' },
  add_node: { scene_path: 'scenes/_smoke.tscn', parent_path: '.', node_name: 'SmokeAdd', node_type: 'Node2D' },
  remove_node: { scene_path: 'scenes/_smoke.tscn', node_path: 'SmokeAdd' },
  modify_node: { scene_path: 'scenes/_smoke.tscn', node_path: '.', properties: { position: 'Vector2(1, 2)' } },
  clone_node: { scene_path: 'scenes/_smoke.tscn', node_path: 'SmokeChild', new_name: 'SmokeClone' },
  rename_node: { scene_path: 'scenes/_smoke.tscn', node_path: 'SmokeClone', new_name: 'SmokeR' },
  connect_signal: { scene_path: 'scenes/_smoke.tscn', signal_name: 'ready', from_node: '.', to_node: '.', method_name: '_on_ready' },
  disconnect_signal: { scene_path: 'scenes/_smoke.tscn', signal_name: 'ready', from_node: '.', to_node: '.', method_name: '_on_ready' },
  set_node_position: { scene_path: 'scenes/_smoke.tscn', node_path: '.', x: 1, y: 2 },
  set_node_rotation: { scene_path: 'scenes/_smoke.tscn', node_path: '.', rotation: 1 },
  set_node_scale: { scene_path: 'scenes/_smoke.tscn', node_path: '.', x: 1, y: 1 },
  transform_node: { scene_path: 'scenes/_smoke.tscn', node_path: '.' },
  attach_script: { scene_path: 'scenes/_smoke.tscn', node_path: '.', script_path: 'scripts/main.gd' },
  load_sprite: { scene_path: 'scenes/_smoke.tscn', node_path: '.', texture_path: 'icon.svg' },
  set_collision_shape: { scene_path: 'scenes/_smoke.tscn', node_path: '.', shape_resource_path: 'resources/test_physics_material.tres' },

  create_script: { script_path: 'scripts/_smoke.gd' },
  write_script: { script_path: 'scripts/_smoke.gd', content: 'extends Node\n' },
  add_script_function: { script_path: 'scripts/_smoke.gd', function_name: 'smoke_fn' },
  add_script_signal: { script_path: 'scripts/_smoke.gd', signal_name: 'smoke_sig' },
  add_script_export: { script_path: 'scripts/_smoke.gd', variable_name: 'smoke_var', variable_type: 'int' },

  create_shader: { shader_path: 'resources/_smoke.gdshader' },
  write_shader: { shader_path: 'resources/_smoke.gdshader', content: 'shader_type canvas_item;\n' },
  create_shader_include: { include_path: 'resources/_smoke.gdshaderinc', content: '// smoke\n' },
  validate_shader: { shader_path: 'resources/sample_shader.gdshader' },

  create_resource: { resource_path: 'resources/_smoke.tres', type: 'StandardMaterial3D' },
  write_resource: { resource_path: 'resources/_smoke.tres', properties: { albedo_color: 'Color(1, 0, 0, 1)' } },
  set_material_param: { material_path: 'resources/sample_material.tres', param_name: 'albedo_color', value: 'Color(1, 0, 0, 1)' },

  duplicate_scene: { source_path: 'scenes/ui_demo.tscn', dest_path: 'scenes/_smoke_dup.tscn' },
  duplicate_resource: { source_path: 'resources/sample_material.tres', dest_path: 'resources/_smoke_dup.tres' },
  move_file: { source_path: 'scenes/_smoke_dup.tscn', dest_path: 'scenes/_smoke_moved.tscn' },
  delete_file: { path: 'scenes/_smoke_moved.tscn' },
  create_directory: { path: '_smoke_dir' },

  write_import_config: { asset_path: 'icon.svg', settings: { 'compress/mode': '0' } },
  read_import_config: { asset_path: 'icon.svg' },

  create_animation: { resource_path: 'resources/_smoke_anim.tres', animation_name: 'smoke' },
  create_environment: { resource_path: 'resources/_smoke_env.tres' },
  create_physics_material: { resource_path: 'resources/_smoke_phys.tres' },
  create_curve: { resource_path: 'resources/_smoke_curve.tres' },
  create_gradient: { resource_path: 'resources/_smoke_grad.tres' },
  create_noise_texture: { resource_path: 'resources/_smoke_noise.tres' },
  create_sprite_frames: { resource_path: 'resources/_smoke_sf.tres' },
  create_theme: { resource_path: 'resources/_smoke_theme.tres' },
  create_tileset: { resource_path: 'resources/_smoke_ts.tres' },
  create_atlas_texture: { resource_path: 'resources/_smoke_atlas.tres', texture_path: 'icon.svg' },
  create_image_texture: { resource_path: 'resources/_smoke_imgtex.tres', image_path: 'icon.svg' },
  create_sky: { resource_path: 'resources/_smoke_sky.tres' },
  create_multimesh: { resource_path: 'resources/_smoke_mm.tres' },
  create_nav_mesh: { resource_path: 'resources/_smoke_nav.tres' },
  create_translation: { resource_path: 'translations/_smoke.csv' },
  create_audio_bus_layout: { resource_path: 'resources/_smoke_bus.tres' },
  create_visual_shader: { resource_path: 'resources/_smoke_vs.tres' },
  create_world: { resource_path: 'resources/_smoke_world.tres' },
  create_camera_attributes: { resource_path: 'resources/_smoke_cam.tres' },

  add_theme_type: { resource_path: 'resources/test_stylebox.tres', type_name: 'Button' },
  set_stylebox: { resource_path: 'resources/test_stylebox.tres', type_name: 'Button' },

  search_tools: { keyword: 'node' },
  search_in_project: { query: 'extends' },
  search_in_scripts: { query: 'func' },
  search_scene_content: { query: 'Node' },
  find_nodes_in_scenes: { node_type: 'Node2D' },

  get_class_info: { class_name: 'Node2D' },
  list_class_methods: { class_name: 'Node2D' },
  list_class_properties: { class_name: 'Node2D' },
  list_class_signals: { class_name: 'Node2D' },
  get_class_hierarchy: { class_name: 'Sprite2D' },
};

function withTimeout(promise, ms, label) {
  let t;
  return Promise.race([
    Promise.resolve(promise).finally(() => clearTimeout(t)),
    new Promise((_, rej) => { t = setTimeout(() => rej(new Error(`__TIMEOUT__ ${label}`)), ms); }),
  ]);
}

// ------------------------------------------------------------
// plugin.gd / runtime_bridge.gd 的 dispatch 表
// ------------------------------------------------------------
// 只认 `match method:` 里形如 `"name": return _cmd_xxx()` 的分支，
// 避免把普通字典 key 误判成命令。
function parseDispatch(gdPath) {
  if (!existsSync(gdPath)) return null;
  const src = readFileSync(gdPath, 'utf-8');
  const lines = src.split('\n');
  const methods = new Set();
  let caseIndent = null; // match 分支所在的缩进（match 行缩进 + 1 级）
  let inMatch = false;

  const indentOf = (l) => l.length - l.replace(/^[\t ]+/, '').length;

  for (const line of lines) {
    if (/^[\t ]*match\s+method\s*:/.test(line)) {
      inMatch = true;
      caseIndent = null; // 下一行非空行确定 case 缩进
      continue;
    }
    if (!inMatch) continue;
    if (!line.trim() || line.trim().startsWith('#')) continue;

    const ind = indentOf(line);
    if (caseIndent === null) caseIndent = ind;

    // 退出 match 块：缩进回到 match 行同级或更浅（例如新的 func）
    if (ind < caseIndent) { inMatch = false; continue; }

    // 只在 case 缩进这一层认 "name": —— 更深的是分支体里的字典字面量，不算
    if (ind !== caseIndent) continue;
    const m = /^[\t ]*"([a-z0-9_]+)"\s*:\s*$/.exec(line) || /^[\t ]*"([a-z0-9_]+)"\s*:\s*\S/.exec(line);
    if (m) methods.add(m[1]);
  }
  return methods;
}

// MCP 侧实际发出的 method 名（静态提取，不依赖真实桥接）
function parseSentMethods(srcDir) {
  const editor = new Set(), runtime = new Set();
  for (const f of require_readdir(srcDir)) {
    const src = readFileSync(join(srcDir, f), 'utf-8');
    for (const m of src.matchAll(/sendEditorCommand(?:Raw)?\(\s*'([a-z0-9_]+)'/g)) editor.add(m[1]);
    // 运行时三元选择的方法（如 `const method = cond ? 'move_node_3d' : 'move_node'`）也要计入
    for (const m of src.matchAll(/(?:const|let|var)\s+method\s*=\s*[^\n]*\?\s*'([a-z0-9_]+)'\s*:\s*'([a-z0-9_]+)'/g)) {
      editor.add(m[1]); editor.add(m[2]);
    }
    for (const m of src.matchAll(/sendGameCommand\(\s*'([a-z0-9_]+)'/g)) runtime.add(m[1]);
  }
  return { editor, runtime };
}
function require_readdir(dir) {
  return require_fs.readdirSync(dir).filter((f) => f.endsWith('.ts'));
}

// 哪些工具依赖桥接（按命名约定 editor_*/runtime_* 识别，比解析 import 更稳健：
// 这样即便 handler 在 import 块的任意位置、或 method 名是运行时变量，也能正确跳过）
function detectBridgeTools(registerJs) {
  const src = readFileSync(registerJs, 'utf-8');
  const names = new Set();
  for (const m of src.matchAll(/registry\.register\(\{\s*name:\s*'([a-z0-9_]+)'/g)) {
    const name = m[1];
    if (name.startsWith('editor_') || name.startsWith('runtime_')) names.add(name);
  }
  return names;
}

// ------------------------------------------------------------
async function main() {
  const sandbox = mkdtempSync(join(tmpdir(), 'godot-mcp-smoke-'));
  const P = join(sandbox, 'test-project');
  cpSync(SRC_PROJECT, P, { recursive: true });

  const seenEditor = new Set();
  const seenRuntime = new Set();
  let editorStub = null, runtimeStub = null;
  try { editorStub = await startStubBridge(9876, seenEditor); } catch { /* 端口被真 Godot 占用 */ }
  try { runtimeStub = await startStubBridge(9877, seenRuntime); } catch { /* ignore */ }

  const { ToolRegistry } = await import('../dist/utils/registry.js');
  const { registerAllTools } = await import('../dist/tools/register.js');
  const registry = new ToolRegistry();
  registerAllTools(registry);
  const tools = registry.list();

  const bridgeTools = detectBridgeTools(join(REPO, 'dist/tools/register.js'));
  // 端口被占用 = 用户有真实 Godot 在跑。绝不能拿它当靶子，否则会改到用户的工程。
  const liveEditor = !editorStub;

  console.log(`${B}━━━ 全量工具冒烟测试 ━━━${N}`);
  console.log(`${D}注册工具: ${tools.length}   沙箱: ${P}${N}`);
  console.log(`${D}桥接工具: ${bridgeTools.size}   桩服务: editor=${editorStub ? '9876' : `${R}占用中${D}`} runtime=${runtimeStub ? '9877' : `${R}占用中${D}`}${N}`);
  if (liveEditor) {
    console.log(`${Y}⚠ 检测到 9876 已被真实 Godot 占用 —— 跳过全部桥接工具的动态调用，`);
    console.log(`  以免改动你正在编辑的工程。桥接部分改为静态 method 对账。${N}`);
  }
  console.log();

  const crashed = [], timedOut = [], empty = [], errored = [];
  let okCount = 0, skipCount = 0, bridgeSkipped = 0;

  for (const tool of tools) {
    if (SPAWNS_PROCESS.has(tool.name)) { skipCount++; continue; }
    if (liveEditor && bridgeTools.has(tool.name)) { bridgeSkipped++; continue; }

    const args = { ...buildArgs(tool), ...(OVERRIDES[tool.name] ?? {}) };
    let res;
    try {
      res = await withTimeout(tool.handler(P, args), CALL_TIMEOUT_MS, tool.name);
    } catch (e) {
      const msg = `${e?.message ?? e}`;
      if (msg.startsWith('__TIMEOUT__')) timedOut.push({ name: tool.name, args });
      else crashed.push({ name: tool.name, msg: `${e?.name ?? 'Error'}: ${msg}`, args });
      continue;
    }

    if (!res || !Array.isArray(res.content) || res.content.length === 0) {
      crashed.push({ name: tool.name, msg: 'handler 返回了非法 ToolResult（content 缺失或为空）', args });
      continue;
    }
    const text = res.content.map((c) => c?.text ?? '').join('\n');
    if (typeof text !== 'string') {
      crashed.push({ name: tool.name, msg: 'content[].text 不是字符串', args });
      continue;
    }
    if (res.isError) { errored.push({ name: tool.name, msg: text.slice(0, 160).replace(/\s+/g, ' ') }); continue; }

    const trimmed = text.trim();
    const looksEmpty =
      trimmed.length === 0 || trimmed === '[]' || trimmed === '{}' ||
      /^\{\s*"[a-z_]+"\s*:\s*\[\s*\]\s*\}$/i.test(trimmed) ||
      /^\{\s*"[a-z_]+"\s*:\s*\[\s*\]\s*,\s*"count"\s*:\s*0\s*\}$/i.test(trimmed);
    if (looksEmpty) { empty.push({ name: tool.name, msg: trimmed.slice(0, 100) }); continue; }
    okCount++;
  }

  editorStub?.close();
  runtimeStub?.close();

  // ---- 报告 ----
  if (crashed.length) {
    console.log(`${R}━━━ CRASH（handler 抛异常 / 返回非法结果）${N}`);
    for (const c of crashed) console.log(`  ${R}✗${N} ${c.name}  ${D}${c.msg}${N}`);
    console.log();
  }
  if (timedOut.length) {
    console.log(`${R}━━━ TIMEOUT（>${CALL_TIMEOUT_MS}ms 未返回，缺少超时保护）${N}`);
    for (const c of timedOut) console.log(`  ${R}⏱${N} ${c.name}`);
    console.log();
  }
  if (empty.length) {
    console.log(`${Y}━━━ SUSPICIOUS EMPTY（成功但内容为空，疑似死工具）${N}`);
    for (const c of empty) console.log(`  ${Y}!${N} ${c.name}  ${D}${JSON.stringify(c.msg)}${N}`);
    console.log();
  }
  if (process.env.SMOKE_VERBOSE && errored.length) {
    console.log(`${D}━━━ ERROR（结构化错误，通常是参数不适用或桥接不可用，可接受）${N}`);
    for (const c of errored) console.log(`  ${D}· ${c.name}: ${c.msg}${N}`);
    console.log();
  }

  // ---- 桥接方法对账（静态，不依赖真实 Godot）----
  const sent = parseSentMethods(join(REPO, 'src/tools'));
  const gdEditor = parseDispatch(join(REPO, 'addons/godot-mcp/plugin.gd'));
  const gdRuntime = parseDispatch(join(REPO, 'addons/godot-mcp/runtime_bridge.gd'));
  const missingEditor = gdEditor ? [...sent.editor].filter((m) => !gdEditor.has(m)).sort() : [];
  const missingRuntime = gdRuntime ? [...sent.runtime].filter((m) => !gdRuntime.has(m)).sort() : [];
  const unexposedEditor = gdEditor ? [...gdEditor].filter((m) => !sent.editor.has(m) && m !== 'health_check').sort() : [];

  console.log(`${B}━━━ 桥接 method 对账${N}`);
  console.log(`  editor : MCP 发出 ${sent.editor.size} 个 method，plugin.gd 实现 ${gdEditor?.size ?? '?'} 个`);
  if (missingEditor.length) {
    console.log(`  ${R}✗ plugin.gd 缺少 ${missingEditor.length} 个实现（这些工具必然报错）:${N}`);
    for (const m of missingEditor) console.log(`      ${R}${m}${N}`);
  } else console.log(`  ${G}✓ 发出的 method 全部有对应实现${N}`);
  if (unexposedEditor.length) {
    console.log(`  ${Y}! plugin.gd 有 ${unexposedEditor.length} 个命令没有对应的 MCP 工具（能力未暴露）:${N}`);
    console.log(`      ${D}${unexposedEditor.join(', ')}${N}`);
  }
  console.log(`  runtime: MCP 发出 ${sent.runtime.size} 个 method，runtime_bridge.gd 实现 ${gdRuntime?.size ?? '?'} 个`);
  if (missingRuntime.length) {
    console.log(`  ${R}✗ runtime_bridge.gd 缺少 ${missingRuntime.length} 个实现:${N}`);
    for (const m of missingRuntime) console.log(`      ${R}${m}${N}`);
  } else console.log(`  ${G}✓ 发出的 method 全部有对应实现${N}`);
  console.log();

  console.log(`${B}━━━ 汇总${N}`);
  console.log(`  ${G}OK       ${okCount}${N}`);
  console.log(`  ${D}ERROR    ${errored.length}  (结构化错误，可接受)${N}`);
  console.log(`  ${Y}EMPTY    ${empty.length}${N}`);
  console.log(`  ${R}CRASH    ${crashed.length}${N}`);
  console.log(`  ${R}TIMEOUT  ${timedOut.length}${N}`);
  console.log(`  ${D}SKIP     ${skipCount}  (会 spawn 真实进程)${N}`);
  if (bridgeSkipped) console.log(`  ${D}BRIDGE   ${bridgeSkipped}  (真实 Godot 在跑，跳过动态调用)${N}`);
  console.log(`  ${D}TOTAL    ${tools.length}${N}`);

  rmSync(sandbox, { recursive: true, force: true });

  const fatal = crashed.length + timedOut.length + missingEditor.length + missingRuntime.length;
  if (fatal > 0) { console.log(`\n${R}FAILED${N}`); process.exit(1); }
  console.log(`\n${G}PASSED${N}`);
}

main().catch((e) => { console.error(e); process.exit(1); });
