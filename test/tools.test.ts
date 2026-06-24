import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdirSync, writeFileSync, existsSync, unlinkSync, rmdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

// ---- Integration Test Setup ----

let testDir: string;

beforeEach(() => {
  testDir = join(tmpdir(), `godot-mcp-test-${Date.now()}`);
  mkdirSync(testDir, { recursive: true });
  writeFileSync(join(testDir, 'project.godot'), `[application]
config/name="Test Game"
[input_map]
move_left=[ 0, { "deadzone": 0.5, "events": [ Object(InputEventKey,"resource_local_to_scene":false,"resource_name":"","device":-1,"keycode":65,"physical_keycode":0,"key_label":0,"unicode":0,"location":0,"ctrl_pressed":false,"shift_pressed":false,"alt_pressed":false,"meta_pressed":false,"pressed":false,"echo":false,"script":null) ] } ]
move_right=[ 0, { "deadzone": 0.5, "events": [ Object(InputEventKey,"resource_local_to_scene":false,"resource_name":"","device":-1,"keycode":68,"physical_keycode":0,"key_label":0,"unicode":0,"location":0,"ctrl_pressed":false,"shift_pressed":false,"alt_pressed":false,"meta_pressed":false,"pressed":false,"echo":false,"script":null) ] } ]
`);
  writeFileSync(join(testDir, 'main.tscn'), `[gd_scene format=3]

[node name="Main" type="Node2D"]
position = Vector2(100, 200)
`);
  writeFileSync(join(testDir, 'player.gd'), `extends CharacterBody2D

@export var speed: float = 300.0

func _ready():
	pass
`);
  writeFileSync(join(testDir, 'health.tres'), `[gd_resource type="Resource" format=3]

[resource]
max_health = 100
`);
});

afterEach(() => {
  const files = ['project.godot', 'main.tscn', 'player.gd', 'health.tres', 'new_scene.tscn', 'new_script.gd', 'player.gd.bak'];
  for (const f of files) {
    const fp = join(testDir, f);
    if (existsSync(fp)) {
      try { unlinkSync(fp); } catch { /* ignore */ }
    }
  }
  try { rmdirSync(testDir); } catch { /* ignore */ }
});

// ---- Project Tools Tests ----

describe('Project Tools (integration)', () => {
  it('list_project_files lists project root', async () => {
    const { listFiles } = await import('../src/utils/file_utils.js');
    const files = listFiles(testDir);
    const names = files.map(f => f.name);
    expect(names).toContain('project.godot');
    expect(names).toContain('main.tscn');
    expect(names).toContain('player.gd');
  });

  it('list_project_files filters by pattern', async () => {
    const { listFiles } = await import('../src/utils/file_utils.js');
    const files = listFiles(testDir, '', '*.tscn');
    expect(files.length).toBe(1);
    expect(files[0].name).toBe('main.tscn');
  });

  it('read_project_config parses project.godot', async () => {
    const { handleReadProjectConfig } = await import('../src/tools/project.js');
    const result = handleReadProjectConfig(testDir);
    const data = JSON.parse(result.content[0].text);
    expect(data.sections.application['config/name']).toBe('"Test Game"');
  });

  it('search_in_project finds text', async () => {
    const { handleSearchInProject } = await import('../src/tools/project.js');
    const result = handleSearchInProject(testDir, { query: 'speed', pattern: '*.gd' });
    const matches = JSON.parse(result.content[0].text);
    expect(matches.length).toBeGreaterThanOrEqual(1);
    expect(matches[0].file).toBe('player.gd');
  });

  it('search_in_project returns empty when no match', async () => {
    const { handleSearchInProject } = await import('../src/tools/project.js');
    const result = handleSearchInProject(testDir, { query: 'zzz_nonexistent_zzz' });
    expect(result.content[0].text).toContain('No matches found');
  });
});

// ---- Scene Tools Tests ----

describe('Scene Tools (integration)', () => {
  it('list_scenes finds .tscn files', async () => {
    const { handleListScenes } = await import('../src/tools/scene.js');
    const result = handleListScenes(testDir, {});
    expect(result.content[0].text).toContain('main.tscn');
  });

  it('read_scene parses scene structure', async () => {
    const { handleReadScene } = await import('../src/tools/scene.js');
    const result = handleReadScene(testDir, { path: 'main.tscn' });
    expect(result.content[0].text).toContain('Node2D');
    expect(result.content[0].text).toContain('"Main"');
    expect(result.content[0].text).toContain('position');
  });

  it('create_scene creates new scene from template', async () => {
    const { handleCreateScene } = await import('../src/tools/scene.js');
    const result = handleCreateScene(testDir, { path: 'new_scene.tscn', template: 'Node2D', root_name: 'Root' });
    expect(result.content[0].text).toContain('Scene created');

    const content = readFileSync(join(testDir, 'new_scene.tscn'), 'utf-8');
    expect(content).toContain('[node name="Root" type="Node2D"]');
  });

  it('read_scene returns error for missing file', async () => {
    const { handleReadScene } = await import('../src/tools/scene.js');
    const result = handleReadScene(testDir, { path: 'nonexistent.tscn' });
    expect(result.isError).toBe(true);
  });
});

// ---- Script Tools Tests ----

describe('Script Tools (integration)', () => {
  it('list_scripts finds .gd files', async () => {
    const { handleListScripts } = await import('../src/tools/script.js');
    const result = handleListScripts(testDir, { type: 'gdscript' });
    expect(result.content[0].text).toContain('player.gd');
  });

  it('read_script reads file with line numbers', async () => {
    const { handleReadScript } = await import('../src/tools/script.js');
    const result = handleReadScript(testDir, { path: 'player.gd' });
    expect(result.content[0].text).toContain('speed');
    expect(result.content[0].text).toContain('Total lines');
  });

  it('create_script creates new GDScript', async () => {
    const { handleCreateScript } = await import('../src/tools/script.js');
    const result = handleCreateScript(testDir, { path: 'new_script.gd', type: 'gdscript', template: 'empty' });
    expect(result.content[0].text).toContain('Script created');

    const content = readFileSync(join(testDir, 'new_script.gd'), 'utf-8');
    expect(content).toContain('extends Node');
  });

  it('write_script writes content with backup', async () => {
    const { handleWriteScript } = await import('../src/tools/script.js');
    const originalSize = readFileSync(join(testDir, 'player.gd'), 'utf-8').length;

    const result = handleWriteScript(testDir, { path: 'player.gd', content: 'extends Node\n', create_backup: true });
    expect(result.content[0].text).toContain('Script written');

    // Verify backup exists
    const backupExists = existsSync(join(testDir, 'player.gd.bak'));
    expect(backupExists).toBe(true);

    // Verify content changed
    const newContent = readFileSync(join(testDir, 'player.gd'), 'utf-8');
    expect(newContent).toBe('extends Node\n');
  });
});

// ---- Resource Tools Tests ----

describe('Resource Tools (integration)', () => {
  it('list_resources finds .tres files', async () => {
    const { handleListResources } = await import('../src/tools/resource.js');
    const result = handleListResources(testDir, {});
    expect(result.content[0].text).toContain('health.tres');
  });

  it('read_resource parses tres file', async () => {
    const { handleReadResource } = await import('../src/tools/resource.js');
    const result = handleReadResource(testDir, { path: 'health.tres' });
    expect(result.content[0].text).toContain('Resource');
    expect(result.content[0].text).toContain('max_health');
  });
});

// ---- Godot CLI Tools Tests ----

describe('Godot Tools (integration)', () => {
  it('get_godot_version works when Godot found or returns informative error', async () => {
    const { handleGetGodotVersion } = await import('../src/tools/godot.js');
    const result = handleGetGodotVersion();
    // Either Godot is found (not error) or we get a helpful message
    if (result.isError) {
      expect(result.content[0].text).toContain('Godot binary not found');
    } else {
      expect(result.content[0].text).toContain('Godot Version');
    }
  });
});

// ---- Server Test ----

describe('Server initialization', () => {
  it('server can be created', async () => {
    const { createMcpServer, initSharedResources } = await import('../src/server.js');
    initSharedResources(testDir);
    const server = createMcpServer();
    expect(server).toBeDefined();
  });
});

// ---- New Feature Tests ----

describe('Scene Connection Editor', () => {
  it('add_connection appears in editScene operations', async () => {
    const { parseScene, editScene } = await import('../src/parsers/scene_parser.js');
    const content = readFileSync(join(testDir, 'main.tscn'), 'utf-8');
    const modified = editScene(content, [{
      action: 'add_connection',
      signal: 'body_entered',
      from_node: 'Main',
      to_node: 'Main',
      method_name: '_on_body_entered',
    }]);
    expect(modified).toContain('[connection');
    expect(modified).toContain('body_entered');
    expect(modified).toContain('_on_body_entered');
  });

  it('remove_connection removes existing connection', async () => {
    const { parseScene, editScene } = await import('../src/parsers/scene_parser.js');
    // First add, then remove
    const content = readFileSync(join(testDir, 'main.tscn'), 'utf-8');
    const withConnection = editScene(content, [{
      action: 'add_connection',
      signal: 'body_entered',
      from_node: 'Main',
      to_node: 'Main',
      method_name: '_on_body_entered',
    }]);
    expect(withConnection).toContain('[connection');

    const withoutConnection = editScene(withConnection, [{
      action: 'remove_connection',
      signal: 'body_entered',
      from_node: 'Main',
      to_node: 'Main',
      method_name: '_on_body_entered',
    }]);
    expect(withoutConnection).not.toContain('[connection');
  });
});

describe('Resource CRUD', () => {
  it('create_resource creates .tres file from template', async () => {
    const { handleCreateResource } = await import('../src/tools/resource.js');
    const result = handleCreateResource(testDir, { path: 'test_material.tres', type: 'StandardMaterial3D' });
    expect(result.content[0].text).toContain('Resource created');
    const filePath = join(testDir, 'test_material.tres');
    expect(existsSync(filePath)).toBe(true);
    const content = readFileSync(filePath, 'utf-8');
    expect(content).toContain('StandardMaterial3D');
    expect(content).toContain('albedo_color');
  });

  it('write_resource updates existing resource', async () => {
    const { handleWriteResource } = await import('../src/tools/resource.js');
    const result = handleWriteResource(testDir, { path: 'health.tres', properties: { max_health: '200', min_health: '0' } });
    expect(result.content[0].text).toContain('Resource updated');
    const content = readFileSync(join(testDir, 'health.tres'), 'utf-8');
    expect(content).toContain('max_health = 200');
    expect(content).toContain('min_health = 0');
  });
});

describe('Input Map Reader', () => {
  it('read_input_map parses input bindings', async () => {
    const { handleReadInputMap } = await import('../src/tools/project.js');
    const result = handleReadInputMap(testDir);
    expect(result.content[0].text).toContain('Input Map');
    expect(result.content[0].text).toContain('move_left');
    expect(result.content[0].text).toContain('move_right');
    expect(result.content[0].text).toContain('Key: A');
    expect(result.content[0].text).toContain('Key: D');
  });
});

describe('Export Project', () => {
  it('export_project returns error if Godot not found', async () => {
    const { handleExportProject } = await import('../src/tools/godot.js');
    const result = handleExportProject(testDir, {
      preset: 'Windows Desktop',
      output_path: '/tmp/build.exe',
    });
    if (result.isError) {
      expect(result.content[0].text).toContain('Godot binary not found');
    }
  });
});

describe('File CRUD', () => {
  it('delete_file creates backup and removes file', async () => {
    const testFile = join(testDir, 'test_del.txt');
    writeFileSync(testFile, 'hello');
    const { handleDeleteFile } = await import('../src/tools/project.js');
    const result = handleDeleteFile(testDir, { path: 'test_del.txt' });
    expect(result.content[0].text).toContain('File deleted');
    expect(existsSync(testFile)).toBe(false);
    expect(existsSync(testFile + '.bak')).toBe(true);
  });

  it('move_file moves to new location', async () => {
    const src = join(testDir, 'test_src.txt');
    writeFileSync(src, 'hello');
    const { handleMoveFile } = await import('../src/tools/project.js');
    const result = handleMoveFile(testDir, { source: 'test_src.txt', destination: 'test_dst.txt' });
    expect(result.content[0].text).toContain('File moved');
    expect(existsSync(join(testDir, 'test_dst.txt'))).toBe(true);
    expect(existsSync(src)).toBe(false);
  });
});

describe('Project Config Writer', () => {
  it('write_project_config sets a value', async () => {
    const { handleWriteProjectConfig } = await import('../src/tools/project.js');
    const result = handleWriteProjectConfig(testDir, { section: 'application', key: 'config/test', value: '42' });
    expect(result.content[0].text).toContain('Config updated');
    const content = readFileSync(join(testDir, 'project.godot'), 'utf-8');
    expect(content).toContain('config/test = 42');
  });
});

describe('Shader Tools', () => {
  it('create_shader creates spatial shader', async () => {
    const { handleCreateShader } = await import('../src/tools/script.js');
    const result = handleCreateShader(testDir, { path: 'test_shader.gdshader', type: 'spatial' });
    expect(result.content[0].text).toContain('Shader created');
    const content = readFileSync(join(testDir, 'test_shader.gdshader'), 'utf-8');
    expect(content).toContain('shader_type spatial');
  });

  it('read_shader reads created shader', async () => {
    writeFileSync(join(testDir, 'test_read.gdshader'), 'shader_type canvas_item;\nvoid fragment() {}');
    const { handleReadShader } = await import('../src/tools/script.js');
    const result = handleReadShader(testDir, { path: 'test_read.gdshader' });
    expect(result.content[0].text).toContain('canvas_item');
  });
});

describe('Project Report', () => {
  it('generate_project_report includes counts', async () => {
    const { handleGenerateProjectReport } = await import('../src/tools/project.js');
    const result = handleGenerateProjectReport(testDir);
    expect(result.content[0].text).toContain('Project Report');
    expect(result.content[0].text).toContain('Scenes');
    expect(result.content[0].text).toContain('GDScripts');
    expect(result.content[0].text).toContain('Input actions');
  });
});

describe('Autoload Manager', () => {
  it('list_autoloads returns empty when none defined', async () => {
    const { handleListAutoloads } = await import('../src/tools/project.js');
    const result = handleListAutoloads(testDir);
    expect(result.content[0].text).toContain('No autoloads');
  });

  it('add_autoload adds to project.godot', async () => {
    const { handleAddAutoload } = await import('../src/tools/project.js');
    const result = handleAddAutoload(testDir, { name: 'Global', path: 'res://global.gd' });
    expect(result.content[0].text).toContain('Autoload added');
    const content = readFileSync(join(testDir, 'project.godot'), 'utf-8');
    expect(content).toContain('Global');
  });

  it('remove_autoload removes from project.godot', async () => {
    const { handleAddAutoload, handleRemoveAutoload } = await import('../src/tools/project.js');
    handleAddAutoload(testDir, { name: 'Global', path: 'res://global.gd' });
    const result = handleRemoveAutoload(testDir, { name: 'Global' });
    expect(result.content[0].text).toContain('Autoload removed');
  });
});

describe('Write Shader', () => {
  it('write_shader writes content with backup', async () => {
    writeFileSync(join(testDir, 'test_shader.gdshader'), 'shader_type canvas_item;\n');
    const { handleWriteShader } = await import('../src/tools/script.js');
    const result = handleWriteShader(testDir, { path: 'test_shader.gdshader', content: 'shader_type spatial;\n', create_backup: true });
    expect(result.content[0].text).toContain('Shader written');
    expect(existsSync(join(testDir, 'test_shader.gdshader.bak'))).toBe(true);
    expect(readFileSync(join(testDir, 'test_shader.gdshader'), 'utf-8')).toBe('shader_type spatial;\n');
  });
});

describe('GDScript Validator', () => {
  it('validate_script passes for valid script', async () => {
    const { handleValidateScript } = await import('../src/tools/script.js');
    const result = handleValidateScript(testDir, { path: 'player.gd' });
    expect(result.content[0].text).toContain('Validation');
  });

  it('validate_script detects missing colon in func', async () => {
    writeFileSync(join(testDir, 'bad.gd'), 'func broken\n\tpass\n');
    const { handleValidateScript } = await import('../src/tools/script.js');
    const result = handleValidateScript(testDir, { path: 'bad.gd' });
    expect(result.content[0].text).toContain('missing');
  });
});

describe('Scene Dependency Graph', () => {
  it('scene_dependency_graph runs without error', async () => {
    const { handleSceneDependencyGraph } = await import('../src/tools/scene.js');
    const result = handleSceneDependencyGraph(testDir);
    expect(result.content[0].text).toContain('Dependency');
  });
});
