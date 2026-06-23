import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import { parseConfig, serializeConfig } from '../src/parsers/config_parser.js';
import { parseScene, serializeScene, generateSceneTemplate } from '../src/parsers/scene_parser.js';
import { parseResource, isBinaryResource } from '../src/parsers/resource_parser.js';
import { findProjectRoot } from '../src/utils/file_utils.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const fixtureDir = join(__dirname, 'fixtures');

function read(file: string): string {
  return readFileSync(join(fixtureDir, file), 'utf-8');
}

// ---- Config Parser Tests ----

describe('Config Parser', () => {
  it('parses project.godot correctly', () => {
    const content = read('project.godot');
    const doc = parseConfig(content);

    expect(doc.sections['application']).toBeDefined();
    expect(doc.sections['application']['config/name']).toBe('"My Game"');
    expect(doc.sections['application']['run/main_scene']).toBe('"res://main.tscn"');
    expect(doc.sections['rendering']['renderer/rendering_method']).toBe('"forward_plus"');
    expect(doc.sections['autoload']['GameManager']).toBe('"res://game_manager.gd"');
    expect(doc.comments!.length).toBeGreaterThan(0);
  });

  it('round-trips config correctly', () => {
    const content = read('project.godot');
    const doc = parseConfig(content);
    const serialized = serializeConfig(doc);

    // Re-parse and verify
    const doc2 = parseConfig(serialized);
    expect(doc2.sections).toEqual(doc.sections);
  });
});

// ---- Scene Parser Tests ----

describe('Scene Parser', () => {
  it('parses empty scene', () => {
    const content = read('empty_scene.tscn');
    const doc = parseScene(content);

    expect(doc.header.format).toBe(3);
    expect(doc.header.uid).toBe('uid://empty');
    expect(doc.nodes.length).toBe(1);
    expect(doc.nodes[0].name).toBe('Root');
    expect(doc.nodes[0].type).toBe('Node2D');
    expect(doc.nodes[0].parent).toBeUndefined(); // root has no parent
  });

  it('parses complex scene with hierarchy', () => {
    const content = read('complex_scene.tscn');
    const doc = parseScene(content);

    expect(doc.header.load_steps).toBe(5);
    expect(doc.header.format).toBe(3);
    expect(doc.header.uid).toBe('uid://cm1vdsyoj27qy');

    // Ext resources
    expect(doc.extResources.length).toBe(2);
    expect(doc.extResources[0].type).toBe('Script');
    expect(doc.extResources[0].path).toBe('res://player.gd');

    // Sub resources
    expect(doc.subResources.length).toBe(1);
    expect(doc.subResources[0].type).toBe('Animation');

    // Nodes - root should be "Game"
    expect(doc.nodes.length).toBe(1);
    const game = doc.nodes[0];
    expect(game.name).toBe('Game');
    expect(game.type).toBe('Node2D');
    expect(game.properties['script']).toContain('ExtResource');

    // Children
    expect(game.children.length).toBeGreaterThanOrEqual(2);

    // Player node
    const player = game.children.find(c => c.name === 'Player');
    expect(player).toBeDefined();
    expect(player!.type).toBe('CharacterBody2D');

    // Sprite child of Player
    expect(player!.children.length).toBe(1);
    expect(player!.children[0].name).toBe('Sprite');
    expect(player!.children[0].type).toBe('Sprite2D');

    // Connections
    expect(doc.connections.length).toBe(1);
    expect(doc.connections[0].signal).toBe('body_entered');
    expect(doc.connections[0].from).toBe('Game/Player');
    expect(doc.connections[0].to).toBe('Game');
    expect(doc.connections[0].method).toBe('_on_player_body_entered');
  });

  it('generates scene templates', () => {
    const node2d = generateSceneTemplate('Node2D', 'Main');
    expect(node2d).toContain('[node name="Main" type="Node2D"]');

    const control = generateSceneTemplate('Control', 'UI');
    expect(control).toContain('[node name="UI" type="Control"]');
    expect(control).toContain('anchor_right = 1.0');

    const node3d = generateSceneTemplate('Node3D', 'World');
    expect(node3d).toContain('[node name="World" type="Node3D"]');
  });
});

// ---- Resource Parser Tests ----

describe('Resource Parser', () => {
  it('parses .tres material file', () => {
    const content = read('sample_material.tres');
    const doc = parseResource(content);

    expect(doc.header.type).toBe('StandardMaterial3D');
    expect(doc.header.format).toBe(3);
    expect(doc.resource['albedo_color']).toBe('Color(1, 0, 0, 1)');
    expect(doc.resource['metallic']).toBe('0.5');
    expect(doc.resource['roughness']).toBe('0.2');
  });

  it('detects text-based .tres as non-binary', () => {
    const content = read('sample_material.tres');
    expect(isBinaryResource(content)).toBe(false);
  });
});

// ---- File Utils Integration Tests ----

describe('File Utils', () => {
  it('finds project.godot in fixtures', () => {
    const root = findProjectRoot(fixtureDir);
    expect(root).toBe(fixtureDir);
  });
});
