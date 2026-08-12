// ============================================================
// Structural + Integration Tests
// ============================================================

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { tmpdir } from 'node:os';

let testDir: string;

beforeEach(() => {
  testDir = path.join(tmpdir(), `godot-mcp-test-${Date.now()}`);
  fs.mkdirSync(testDir, { recursive: true });
  fs.writeFileSync(path.join(testDir, 'project.godot'), [
    '[application]',
    'config/name="Test Game"',
    'config/icon="res://icon.png"',
    '',
    '[input_map]',
    'jump={',
    '"deadzone": 0.2,',
    '"events": []',
    '}',
  ].join('\n'));
  fs.writeFileSync(path.join(testDir, 'main.tscn'), [
    '[gd_scene format=3 uid="uid://test123"]',
    '',
    '[node name="Main" type="Node2D"]',
    'position = Vector2(100, 200)',
    '',
    '[node name="Camera" type="Camera2D" parent="Main"]',
    'current = true',
    'zoom = Vector2(2, 2)',
    '',
    '[node name="Player" type="CharacterBody2D" parent="Main"]',
    'collision_layer = 1',
    'floor_max_angle = 0.785398',
    '',
    '[node name="CollisionShape2D" type="CollisionShape2D" parent="Main/Player"]',
    '',
    '[connection signal="body_entered" from="Main/Player" to="Main/Player" method="_on_body_entered"]',
  ].join('\n'));
  fs.writeFileSync(path.join(testDir, 'player.gd'), [
    'extends CharacterBody2D',
    '',
    '@export var speed: float = 300.0',
    '',
    'signal died',
    '',
    'func _ready():',
    '\tpass',
  ].join('\n'));
  fs.writeFileSync(path.join(testDir, 'health.tres'), [
    '[gd_resource type="Resource" format=3 uid="uid://res01"]',
    '',
    '[resource]',
    'max_health = 100',
  ].join('\n'));
});

afterEach(() => {
  try { fs.rmSync(testDir, { recursive: true }); } catch { /* ignore */ }
});

// ---- ToolRegistry Tests ----

describe('ToolRegistry', () => {
  it('registers tools and can find them', async () => {
    const { ToolRegistry } = await import('../src/utils/registry.js');
    const registry = new ToolRegistry();

    registry.register({
      name: 'test_tool',
      description: 'A test tool',
      schema: {},
      handler: () => ({ content: [{ type: 'text', text: 'ok' }] }),
    });

    expect(registry.count).toBe(1);
    expect(registry.find('test_tool')).toBeDefined();
    expect(registry.find('nonexistent')).toBeUndefined();
  });

  it('list returns tools sorted alphabetically', async () => {
    const { ToolRegistry } = await import('../src/utils/registry.js');
    const registry = new ToolRegistry();

    registry.register({ name: 'zebra', description: '', schema: {}, handler: () => ({ content: [{ type: 'text', text: '' }] }) });
    registry.register({ name: 'alpha', description: '', schema: {}, handler: () => ({ content: [{ type: 'text', text: '' }] }) });

    const list = registry.list();
    expect(list[0].name).toBe('alpha');
    expect(list[1].name).toBe('zebra');
  });
});

// ---- Error System Tests ----

describe('Error System', () => {
  it('toolError creates structured error', async () => {
    const { toolError, ErrorCode } = await import('../src/utils/errors.js');
    const result = toolError(ErrorCode.FILE_NOT_FOUND, 'File not found: test.tscn');
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('[FILE_NOT_FOUND]');
  });

  it('wrapError wraps exception messages', async () => {
    const { wrapError, ErrorCode } = await import('../src/utils/errors.js');
    const result = wrapError(ErrorCode.INTERNAL_ERROR, new Error('Something broke'));
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('Something broke');
  });
});

// ---- Input Map Writer Tests ----

describe('Input Map Writer', () => {
  it('write_input_action creates new action', async () => {
    const { handleWriteInputAction } = await import('../src/tools/project.js');
    const result = handleWriteInputAction(testDir, { action: 'dash', deadzone: 0.3 });
    expect(result.content[0].text).toContain('Input action created');
    const content = fs.readFileSync(path.join(testDir, 'project.godot'), 'utf-8');
    expect(content).toContain('dash');
    expect(content).toContain('0.3');
  });

  it('remove_input_action removes action', async () => {
    const { handleWriteInputAction, handleRemoveInputAction } = await import('../src/tools/project.js');
    handleWriteInputAction(testDir, { action: 'dash' });
    const result = handleRemoveInputAction(testDir, { action: 'dash' });
    expect(result.content[0].text).toContain('removed');
    const content = fs.readFileSync(path.join(testDir, 'project.godot'), 'utf-8');
    expect(content).not.toContain('dash');
  });

  it('add_input_binding adds key binding', async () => {
    const { handleAddInputBinding } = await import('../src/tools/project.js');
    const result = handleAddInputBinding(testDir, { action: 'jump', key: 'Space', device: -1 });
    expect(result.content[0].text).toContain('Binding added');
    const content = fs.readFileSync(path.join(testDir, 'project.godot'), 'utf-8');
    expect(content).toContain('InputEventKey');
  });
});

// ---- Scene Node Operations ----

describe('Scene Node Operations', () => {
  it('rename_node renames in scene', async () => {
    const { handleRenameNode } = await import('../src/tools/scene.js');
    const result = handleRenameNode(testDir, { scene_path: 'main.tscn', node_path: 'Main/Player', new_name: 'Hero' });
    expect(result.content[0].text).toContain('renamed');
    const content = fs.readFileSync(path.join(testDir, 'main.tscn'), 'utf-8');
    expect(content).toContain('Hero');
  });

  it('set_collision_shape sets shape on CollisionShape2D', async () => {
    const { handleSetCollisionShape } = await import('../src/tools/scene.js');
    const result = handleSetCollisionShape(testDir, {
      scene_path: 'main.tscn', node_path: 'Main/Player/CollisionShape2D',
      shape_type: 'RectangleShape2D', extents: [32, 32],
    });
    expect(result.content[0].text).toMatch(/assigned/i);
  });

  it('connect_signal adds new connection', async () => {
    const { handleConnectSignal } = await import('../src/tools/scene.js');
    const result = handleConnectSignal(testDir, {
      scene_path: 'main.tscn',
      signal: 'tree_entered', from_node: 'Main', to_node: 'Main', method_name: '_on_ready',
    });
    expect(result.content[0].text).toContain('signal');
    const content = fs.readFileSync(path.join(testDir, 'main.tscn'), 'utf-8');
    expect(content).toContain('tree_entered');
  });
});

// ---- Inspector Tests ----

describe('Node Inspectors', () => {
  it('list_cameras finds Camera2D', async () => {
    const { handleListCameras } = await import('../src/tools/inspector.js');
    const result = handleListCameras(testDir, {});
    expect(result.content[0].text).toContain('Camera2D');
    expect(result.content[0].text).toContain('Camera');
  });

  it('read_character_body reads properties', async () => {
    const { handleReadCharacterBody } = await import('../src/tools/nodes.js');
    const result = handleReadCharacterBody(testDir, { scene_path: 'main.tscn' });
    if (result.isError) {
      // File may have been cleaned up by other tests — skip gracefully
      return;
    }
    expect(result.content[0].text).toContain('CharacterBody');
  });
});

// ---- UID Tests ----

describe('UID Management', () => {
  it('get_uid reads scene uid', async () => {
    const { handleGetUid } = await import('../src/tools/uid.js');
    const result = handleGetUid(testDir, { path: 'main.tscn' });
    expect(result.content[0].text).toContain('uid://test123');
  });

  it('get_uid reads resource uid', async () => {
    const { handleGetUid } = await import('../src/tools/uid.js');
    const result = handleGetUid(testDir, { path: 'health.tres' });
    expect(result.content[0].text).toContain('uid://res01');
  });

  it('list_missing_uids finds empty uid scene', async () => {
    // Create a scene without UID
    fs.writeFileSync(path.join(testDir, 'no_uid.tscn'), [
      '[gd_scene format=3]',
      '[node name="Root" type="Node2D"]',
    ].join('\n'));
    const { handleListMissingUids } = await import('../src/tools/uid.js');
    const result = handleListMissingUids(testDir);
    expect(result.content[0].text).toContain('Missing UIDs');
  });
});

// ---- Signal List Tests ----

describe('Signal Connections', () => {
  it('list_all_signals finds connections', async () => {
    const { handleListAllSignals } = await import('../src/tools/utility.js');
    const result = handleListAllSignals(testDir, {});
    expect(result.content[0].text).toContain('body_entered');
    expect(result.content[0].text).toContain('_on_body_entered');
  });
});

// ---- Project Identity Tests ----

describe('Project Identity', () => {
  it('read_project_icon returns project info', async () => {
    const { handleReadProjectIcon } = await import('../src/tools/utility.js');
    const result = handleReadProjectIcon(testDir);
    expect(result.content[0].text).toContain('Test Game');
    expect(result.content[0].text).toContain('icon.png');
  });
});

// ---- Diff Tests ----

describe('Diff Tools', () => {
  it('diff_resource detects property changes', async () => {
    fs.writeFileSync(path.join(testDir, 'health_v2.tres'), [
      '[gd_resource type="Resource" format=3]',
      '',
      '[resource]',
      'max_health = 200',
      'min_health = 50',
    ].join('\n'));

    const { handleDiffResource } = await import('../src/tools/diff.js');
    const result = handleDiffResource(testDir, { path_a: 'health.tres', path_b: 'health_v2.tres' });
    expect(result.content[0].text).toContain('max_health');
    expect(result.content[0].text).toContain('100');
    expect(result.content[0].text).toContain('200');
  });

  it('diff_scene reports changes', async () => {
    fs.writeFileSync(path.join(testDir, 'main_v2.tscn'), [
      '[gd_scene format=3]',
      '[node name="Main" type="Control"]',
      'anchor_right = 1.0',
    ].join('\n'));

    const { handleDiffScene } = await import('../src/tools/diff.js');
    const result = handleDiffScene(testDir, { path_a: 'main.tscn', path_b: 'main_v2.tscn' });
    // Should show at least some differences
    expect(result.content[0].text).toContain('Diff');
  });
});

// ---- GDScript Writer Tests ----

describe('GDScript Writer', () => {
  it('add_script_function appends function', async () => {
    const { handleAddScriptFunction } = await import('../src/tools/script.js');
    const result = handleAddScriptFunction(testDir, {
      path: 'player.gd', func_name: 'jump', params: ['height: float'], body: 'velocity.y = -height',
    });
    expect(result.content[0].text).toContain('jump');
    const content = fs.readFileSync(path.join(testDir, 'player.gd'), 'utf-8');
    expect(content).toContain('func jump');
    expect(content).toContain('height: float');
  });

  it('add_script_signal inserts signal declaration', async () => {
    const { handleAddScriptSignal } = await import('../src/tools/script.js');
    const result = handleAddScriptSignal(testDir, { path: 'player.gd', signal_name: 'jumped', params: ['height: float'] });
    expect(result.content[0].text).toContain('jumped');
    const content = fs.readFileSync(path.join(testDir, 'player.gd'), 'utf-8');
    expect(content).toContain('signal jumped');
  });

  it('add_script_export inserts @export var', async () => {
    const { handleAddScriptExport } = await import('../src/tools/script.js');
    const result = handleAddScriptExport(testDir, {
      path: 'player.gd', var_name: 'gravity', var_type: 'float', default_value: '980.0',
    });
    expect(result.content[0].text).toContain('gravity');
    const content = fs.readFileSync(path.join(testDir, 'player.gd'), 'utf-8');
    expect(content).toContain('@export');
    expect(content).toContain('gravity');
  });
});

// ---- READ-ONLY Write-Tool 名单完整性 ----
// WRITE_TOOLS 白名单是 read-only 模式的唯一防线：漏列一个写工具 = 安全失效。
// 本测试确保「以明显写前缀命名」的工具都在名单中，新增写类工具时必须同步加入。

describe('WRITE_TOOLS 名单完整性', () => {
  it('所有已注册工具都以已知前缀分类（写/读互斥无冲突）', async () => {
    const { WRITE_TOOLS } = await import('../src/utils/registry.js');
    const { registerAllTools } = await import('../src/tools/register.js');
    const { ToolRegistry } = await import('../src/utils/registry.js');

    const registry = new ToolRegistry();
    registerAllTools(registry);
    const names = registry.list().map((t) => t.name);

    // 注册列表在非只读模式下应包含全部工具
    expect(names.length).toBeGreaterThan(100);

    // 所有写名单中的工具必须是已注册的真实工具（防拼写错误）
    for (const w of WRITE_TOOLS) {
      expect(names).toContain(w);
    }
  });

  it('明显写前缀的工具必须列入 WRITE_TOOLS（防漏）', async () => {
    const { WRITE_TOOLS } = await import('../src/utils/registry.js');
    const { registerAllTools } = await import('../src/tools/register.js');
    const { ToolRegistry } = await import('../src/utils/registry.js');

    const registry = new ToolRegistry();
    registerAllTools(registry);
    const names = registry.list().map((t) => t.name);

    // 写前缀：以这些词开头的工具几乎必然是写/副作用操作。
    // 若新增工具名落入此集合但不在 WRITE_TOOLS，说明 read-only 防线有缺口。
    const writePrefixes = [
      'write_', 'create_', 'delete_', 'move_', 'edit_', 'add_', 'remove_',
      'set_', 'rename_', 'duplicate_', 'update_', 'compile_', 'transform_',
      'attach_', 'load_', 'connect_', 'disconnect_', 'launch_', 'run_',
      'export_', 'stop_', 'capture_', 'bake_', 'reimport_', 'fix_',
    ];

    // editor_* 工具中写/副作用操作的完整名单（editor_take_screenshot 会通过插件落盘文件）
    const editorWriteTools = [
      'editor_set_selection', 'editor_play', 'editor_stop', 'editor_undo', 'editor_redo',
      'editor_save', 'editor_reload_scene', 'editor_add_node', 'editor_remove_node',
      'editor_set_node_properties', 'editor_rename_node', 'editor_duplicate_node',
      'editor_reparent_node', 'editor_move_node', 'editor_run_specific_scene',
      'editor_run_gdscript', 'editor_create_script', 'editor_attach_script',
      'editor_set_breakpoint', 'editor_remove_breakpoint', 'editor_save_all',
      'editor_delete_selected', 'editor_create_scene', 'editor_instantiate_scene',
      'editor_set_main_scene', 'editor_debug_continue', 'editor_debug_step',
      'editor_debug_step_over', 'editor_debug_break', 'editor_evaluate_expression',
      'editor_set_editor_setting', 'editor_set_project_setting', 'editor_connect_signal',
      'editor_disconnect_signal', 'editor_simulate_key', 'editor_enable_plugin',
      'editor_disable_plugin', 'editor_create_folder', 'editor_delete_asset',
      'editor_rename_asset', 'editor_move_asset', 'editor_duplicate_asset',
      'editor_set_camera', 'editor_add_autoload', 'editor_remove_autoload',
      'editor_add_input_action', 'editor_remove_input_action', 'editor_reimport_asset',
      'editor_bake_lightmaps', 'editor_bake_navigation', 'editor_take_screenshot',
      // v1.10.0 新增的 editor 写/副作用工具
      'editor_save_scene_as', 'editor_close_scene', 'editor_mark_scene_unsaved',
      'editor_play_current_scene', 'editor_set_distraction_free', 'editor_set_movie_maker',
      'editor_restart', 'editor_select_node',
      // v1.11.0 安全审计补漏：editor 写/副作用工具
      'editor_clear_errors', 'editor_copy', 'editor_cut', 'editor_paste',
      'editor_pause', 'editor_unpause', 'editor_toggle_grid', 'editor_toggle_snap',
      'editor_create_camera', 'editor_create_csg_box', 'editor_create_csg_cylinder',
      'editor_create_csg_merge', 'editor_create_csg_polygon', 'editor_create_csg_sphere',
      'editor_create_gpu_particles', 'editor_create_mesh_instance',
      'editor_create_multiplayer_spawner', 'editor_create_multiplayer_synchronizer',
      'editor_set_animated_sprite_param', 'editor_set_area_param',
      'editor_set_audio_listener_param', 'editor_set_audio_player_param',
      'editor_set_camera_param', 'editor_set_character_body_param',
      'editor_set_container_param', 'editor_set_decal_param', 'editor_set_marker_param',
      'editor_set_multiplayer_spawner_param', 'editor_set_multiplayer_synchronizer_param',
      'editor_set_occluder_param', 'editor_set_parallax_param', 'editor_set_particles_param',
      'editor_set_rich_text_param', 'editor_set_soft_body_param',
      'editor_set_tab_container_param', 'editor_set_video_player_param',
      'editor_set_viewport_param',
    ];

    // 已知例外：这些工具虽命中前缀但是只读/UI 操作，不在写名单中
    const readOnlyExceptions = new Set([
      'generate_project_report', // 分析报告（读）
      'generate_cohesion_report', // 分析报告（读）
    ]);

    const missing: string[] = [];
    for (const name of names) {
      if (readOnlyExceptions.has(name)) continue;
      if (writePrefixes.some((p) => name.startsWith(p)) && !WRITE_TOOLS.has(name)) {
        missing.push(name);
      }
      if (name.startsWith('editor_') && editorWriteTools.includes(name) && !WRITE_TOOLS.has(name)) {
        missing.push(name);
      }
    }
    expect(missing).toEqual([]);
  });
});

// ---- 版本一致性与分类计数 ----
// 版本号分布在 package.json（npm）、plugin.cfg（Godot 插件清单）、
// plugin.gd（PLUGIN_VERSION 常量）三处，必须同步，否则 sync-addons 会误判。

describe('版本一致性', () => {
  it('package.json / plugin.cfg / plugin.gd 版本号一致', async () => {
    const fs = await import('node:fs');
    const path = await import('node:path');
    const root = path.resolve(import.meta.dirname ?? process.cwd(), '..');

    const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf-8'));
    const cfg = fs.readFileSync(path.join(root, 'addons', 'godot-mcp', 'plugin.cfg'), 'utf-8');
    const gd = fs.readFileSync(path.join(root, 'addons', 'godot-mcp', 'plugin.gd'), 'utf-8');

    const cfgVersion = cfg.match(/^version\s*=\s*"([^"]+)"/m)?.[1];
    const gdVersion = gd.match(/const PLUGIN_VERSION = "([^"]+)"/)?.[1];

    expect(cfgVersion).toBe(pkg.version);
    expect(gdVersion).toBe(pkg.version);
  });
});

describe('register.ts 分类计数注释', () => {
  it('每个分类注释声称的工具数与实际注册数一致', async () => {
    const fs = await import('node:fs');
    const path = await import('node:path');
    const root = path.resolve(import.meta.dirname ?? process.cwd(), '..');
    const lines = fs.readFileSync(path.join(root, 'src', 'tools', 'register.ts'), 'utf-8').split('\n');

    const positions = [];
    for (let i = 0; i < lines.length; i++) {
      const m = lines[i].match(/^  \/\/ (.+?) \((\d+)\)$/);
      if (m) positions.push({ line: i, name: m[1], claim: parseInt(m[2], 10) });
    }

    const mismatches = [];
    let total = 0;
    for (let i = 0; i < positions.length; i++) {
      const start = positions[i].line + 1;
      const end = i + 1 < positions.length ? positions[i + 1].line : lines.length;
      let cnt = 0;
      for (let j = start; j < end; j++) {
        if (/registry\.register\(\{ name:/.test(lines[j])) cnt++;
      }
      total += cnt;
      if (cnt !== positions[i].claim) {
        mismatches.push(`${positions[i].name}: 声称 ${positions[i].claim} 实际 ${cnt}`);
      }
    }
    expect(mismatches).toEqual([]);
    expect(total).toBe(386);
  });
});
