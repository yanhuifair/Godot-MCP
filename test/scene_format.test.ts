// Copyright (c) 2026 FairYan
// SPDX-License-Identifier: AGPL-3.0-or-later
// ============================================================
// Regression tests for .tscn / .tres round-trip fidelity.
//
// Every case here corresponds to a bug that silently corrupted user files:
//   1. resource ids accumulated quotes on each edit  -> scene became unloadable
//   2. parent="." was treated as "is a root"          -> tree flattened, multi-root scene
//   3. SubResource() pointed at a res:// path         -> dangling shape reference
//   4. audio buses were never renumbered/deduped      -> ghost buses in Godot
// ============================================================

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { parseScene, serializeScene, editScene } from '../src/parsers/scene_parser.js';

// A scene written by Godot itself: root has no `parent`, direct children use ".".
const GODOT_SCENE = `[gd_scene load_steps=3 format=3 uid="uid://bh1"]

[ext_resource type="Script" path="res://player.gd" id="1"]

[sub_resource type="CapsuleShape2D" id="capsule"]
radius = 8.0

[node name="Player" type="CharacterBody2D"]
script = ExtResource("1")

[node name="Sprite" type="Sprite2D" parent="."]

[node name="Col" type="CollisionShape2D" parent="."]
shape = SubResource("capsule")

[node name="Tip" type="Marker2D" parent="Col"]

[node name="Deep" type="Node2D" parent="Col/Tip"]
`;

describe('tscn round-trip fidelity', () => {
  it('is byte-for-byte idempotent on a Godot-authored scene', () => {
    expect(serializeScene(parseScene(GODOT_SCENE))).toBe(GODOT_SCENE);
  });

  it('stays stable across repeated edits (no quote accumulation)', () => {
    let s = GODOT_SCENE;
    for (let i = 0; i < 5; i++) s = serializeScene(parseScene(s));
    expect(s).toBe(GODOT_SCENE);
    expect(s).not.toMatch(/id=""/);
    expect(s).not.toMatch(/Resource\(""/);
  });

  it('heals a scene whose ids were already over-quoted', () => {
    const corrupt = GODOT_SCENE
      .replace('id="1"', 'id="""1"""')
      .replace('id="capsule"', 'id="""capsule"""');
    const healed = serializeScene(parseScene(corrupt));
    expect(healed).toContain('id="1"');
    expect(healed).toContain('id="capsule"');
    expect(healed).not.toContain('"""');
  });

  it('keeps exactly one root and preserves parent="."', () => {
    const doc = parseScene(GODOT_SCENE);
    expect(doc.nodes).toHaveLength(1);
    expect(doc.nodes[0].name).toBe('Player');
    expect(doc.nodes[0].children.map(c => c.name)).toEqual(['Sprite', 'Col']);

    const out = serializeScene(doc);
    expect(out).toContain('[node name="Sprite" type="Sprite2D" parent="."]');
    expect(out).toContain('[node name="Col" type="CollisionShape2D" parent="."]');
    // Exactly one node block without a parent= attribute: the root.
    const rootless = out.split('\n').filter(l => l.startsWith('[node ') && !l.includes('parent='));
    expect(rootless).toHaveLength(1);
  });

  it('preserves nesting deeper than one level', () => {
    const doc = parseScene(GODOT_SCENE);
    const col = doc.nodes[0].children.find(c => c.name === 'Col')!;
    expect(col.children.map(c => c.name)).toEqual(['Tip']);
    expect(col.children[0].children.map(c => c.name)).toEqual(['Deep']);
    expect(serializeScene(doc)).toContain('parent="Col/Tip"');
  });

  it('also accepts the root-prefixed parent form used by hand-written scenes', () => {
    const handWritten = `[gd_scene format=3]

[node name="Game" type="Node2D"]

[node name="Player" type="CharacterBody2D" parent="Game"]

[node name="Sprite" type="Sprite2D" parent="Game/Player"]
`;
    const doc = parseScene(handWritten);
    expect(doc.nodes).toHaveLength(1);
    expect(doc.nodes[0].children[0].name).toBe('Player');
    expect(doc.nodes[0].children[0].children[0].name).toBe('Sprite');
    // ...and normalises it to Godot's own form on the way out.
    expect(serializeScene(doc)).toContain('parent="."');
  });
});

describe('editScene node addressing', () => {
  const forms = ['Player/Col', 'Col', '/root/Player/Col'];
  for (const form of forms) {
    it(`resolves "${form}"`, () => {
      const out = editScene(GODOT_SCENE, [
        { action: 'modify_node', node_path: form, properties: { disabled: 'true' } },
      ]);
      expect(out).toMatch(/\[node name="Col"[^\]]*\]\n(.*\n)*?disabled = true/);
    });
  }

  it('resolves "." to the scene root', () => {
    const out = editScene(GODOT_SCENE, [
      { action: 'modify_node', node_path: '.', properties: { motion_mode: '1' } },
    ]);
    expect(out).toMatch(/\[node name="Player"[^\]]*\]\n(.*\n)*?motion_mode = 1/);
  });

  it('add_node attaches to the root with parent="." (not as a second root)', () => {
    const out = editScene(GODOT_SCENE, [
      { action: 'add_node', parent_path: '.', name: 'Hud', type: 'CanvasLayer' },
    ]);
    expect(out).toContain('[node name="Hud" type="CanvasLayer" parent="."]');
    const rootless = out.split('\n').filter(l => l.startsWith('[node ') && !l.includes('parent='));
    expect(rootless).toHaveLength(1);
  });

  it('add_node nests under a deep parent with a root-relative path', () => {
    const out = editScene(GODOT_SCENE, [
      { action: 'add_node', parent_path: 'Player/Col/Tip', name: 'Leaf', type: 'Node2D' },
    ]);
    expect(out).toContain('[node name="Leaf" type="Node2D" parent="Col/Tip"]');
  });

  it('clone_node places the copy beside its source, not at the root', () => {
    const out = editScene(GODOT_SCENE, [
      { action: 'clone_node', clone_source: 'Player/Col/Tip', name: 'Tip2' },
    ]);
    expect(out).toContain('[node name="Tip2" type="Marker2D" parent="Col"]');
  });

  it('remove_node deletes only the target subtree', () => {
    const out = editScene(GODOT_SCENE, [{ action: 'remove_node', node_path: 'Player/Sprite' }]);
    expect(out).not.toContain('name="Sprite"');
    expect(out).toContain('name="Col"');
    expect(out).toContain('name="Deep"');
  });
});

describe('set_collision_shape', () => {
  let dir: string;

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'gmcp-shape-'));
    fs.writeFileSync(path.join(dir, 'project.godot'), 'config_version=5\n');
    fs.mkdirSync(path.join(dir, 'scenes'));
    fs.writeFileSync(path.join(dir, 'scenes', 'p.tscn'), `[gd_scene format=3]

[node name="Player" type="CharacterBody2D"]

[node name="Col" type="CollisionShape2D" parent="."]
`);
  });
  afterEach(() => fs.rmSync(dir, { recursive: true, force: true }));

  const read = () => fs.readFileSync(path.join(dir, 'scenes', 'p.tscn'), 'utf-8');

  it('creates an inline sub_resource and references it by id', async () => {
    const { handleSetCollisionShape } = await import('../src/tools/scene.js');
    const r = handleSetCollisionShape(dir, {
      scene_path: 'scenes/p.tscn', node_path: 'Player/Col', shape_type: 'CapsuleShape2D',
    });
    expect(r.content[0].text).toMatch(/assigned/i);
    const out = read();
    expect(out).toContain('[sub_resource type="CapsuleShape2D" id="CapsuleShape2D_1"]');
    expect(out).toContain('shape = SubResource("CapsuleShape2D_1")');
    // The old bug: a res:// path smuggled into SubResource().
    expect(out).not.toMatch(/SubResource\("res:\/\//);
  });

  it('registers an ext_resource for an external .tres', async () => {
    const { handleSetCollisionShape } = await import('../src/tools/scene.js');
    handleSetCollisionShape(dir, {
      scene_path: 'scenes/p.tscn', node_path: 'Player/Col',
      shape_type: 'RectangleShape2D', shape_resource_path: 'res://shapes/box.tres',
    });
    const out = read();
    expect(out).toMatch(/\[ext_resource type="RectangleShape2D" path="res:\/\/shapes\/box\.tres" id="RectangleShape2D_1"\]/);
    expect(out).toContain('shape = ExtResource("RectangleShape2D_1")');
  });

  it('rejects a non-shape class instead of writing garbage', async () => {
    const { handleSetCollisionShape } = await import('../src/tools/scene.js');
    const r = handleSetCollisionShape(dir, {
      scene_path: 'scenes/p.tscn', node_path: 'Player/Col', shape_type: 'Sprite2D',
    });
    expect(r.content[0].text).toContain('INVALID_ARGUMENT');
    expect(read()).not.toContain('sub_resource');
  });

  it('reports a missing node instead of silently succeeding', async () => {
    const { handleSetCollisionShape } = await import('../src/tools/scene.js');
    const r = handleSetCollisionShape(dir, {
      scene_path: 'scenes/p.tscn', node_path: 'Player/Nope', shape_type: 'CircleShape2D',
    });
    expect(r.content[0].text).toContain('NOT_FOUND');
  });
});

describe('AudioBusLayout maintenance', () => {
  let dir: string;

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'gmcp-bus-'));
    fs.writeFileSync(path.join(dir, 'project.godot'), 'config_version=5\n');
  });
  afterEach(() => fs.rmSync(dir, { recursive: true, force: true }));

  const layout = () => fs.readFileSync(path.join(dir, 'default_bus_layout.tres'), 'utf-8');
  const indices = () => [...layout().matchAll(/^bus\/(\d+)\/name/gm)].map(m => Number(m[1]));

  async function setup() {
    const m = await import('../src/tools/audio.js');
    m.handleCreateAudioBusLayout(dir, {});
    m.handleAddAudioBus(dir, { bus_name: 'Music' });
    m.handleAddAudioBus(dir, { bus_name: 'SFX' });
    m.handleAddAudioBus(dir, { bus_name: 'Voice' });
    return m;
  }

  it('keeps bus indices contiguous after a removal', async () => {
    const m = await setup();
    expect(indices()).toEqual([0, 1, 2, 3]);
    m.handleRemoveAudioBus(dir, { bus_index: 1 });
    // A gap here would make Godot fabricate a default bus at index 1.
    expect(indices()).toEqual([0, 1, 2]);
    expect(layout()).toContain('bus/1/name = &"SFX"');
  });

  it('rejects a duplicate bus name', async () => {
    const m = await setup();
    const r = m.handleAddAudioBus(dir, { bus_name: 'Music' });
    expect(r.content[0].text).toContain('ALREADY_EXISTS');
    expect(indices()).toEqual([0, 1, 2, 3]);
  });

  it('orders keys numerically, not lexicographically', async () => {
    const m = await setup();
    for (let i = 0; i < 8; i++) m.handleAddAudioBus(dir, { bus_name: `Extra${i}` });
    expect(indices()).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]);
    // The lexicographic bug put bus/10 directly after bus/1.
    const order = [...layout().matchAll(/^bus\/(\d+)\//gm)].map(x => Number(x[1]));
    expect(order).toEqual([...order].sort((a, b) => a - b));
  });

  it('refuses to touch a bus index that does not exist', async () => {
    const m = await setup();
    expect(m.handleSetBusVolume(dir, { bus_index: 9, volume_db: -3 }).content[0].text).toContain('NOT_FOUND');
    expect(m.handleRemoveAudioBus(dir, { bus_index: 9 }).content[0].text).toContain('NOT_FOUND');
  });

  it('writes StringName values like AudioServer.generate_bus_layout()', async () => {
    await setup();
    expect(layout()).toContain('bus/0/name = &"Master"');
    expect(layout()).not.toContain('uid=""');
  });
});
