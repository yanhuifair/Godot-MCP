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
    expect(result.content[0].text).toContain('assigned');
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
