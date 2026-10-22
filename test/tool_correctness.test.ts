// Copyright (c) 2026 FairYan
// SPDX-License-Identifier: AGPL-3.0-or-later
// ============================================================
// Tool-correctness regressions found by the "does it actually work" audit
// (smoke + a real Godot load of every file the tools produced).
//
// Each case below is a tool that reported success while producing something
// Godot cannot load — the engine-level audit is what surfaced them.
// ============================================================

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { ErrorCode, refineErrorCode, toolError } from '../src/utils/errors.js';
import { findNodeByName, findNodeByPath, isRootPath } from '../src/utils/scene_walk.js';
import { handleCreateGradient, handleCreateNoiseTexture, handleCreateMultimesh } from '../src/tools/domain.js';
import { handleCreateScript, handleWriteScript, handleWriteShader } from '../src/tools/script.js';
import { handleSetCollisionShape, handleSetNodeRotation } from '../src/tools/scene.js';
import { handleCreateAtlasTexture } from '../src/tools/utility.js';
import { handleCreateWorldEnvironment } from '../src/tools/environment.js';
import { handleCreateWorld } from '../src/tools/extension.js';

let root = '';

beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'godot-mcp-correct-'));
  fs.writeFileSync(path.join(root, 'project.godot'), 'config_version=5\n\n[application]\nconfig/name="t"\n');
});

afterEach(() => {
  fs.rmSync(root, { recursive: true, force: true });
});

const write = (rel: string, content: string): string => {
  const abs = path.join(root, rel);
  fs.mkdirSync(path.dirname(abs), { recursive: true });
  fs.writeFileSync(abs, content);
  return abs;
};
const read = (rel: string): string => fs.readFileSync(path.join(root, rel), 'utf8');
const text = (r: any): string => r.content[0].text as string;

describe('"." means the scene root (Godot NodePath semantics)', () => {
  const tree = [{ name: 'Root', type: 'Node2D', children: [{ name: 'Child', type: 'Node2D', children: [] }] }] as any;

  it('recognises "" / "." / "./" as the root path', () => {
    for (const p of ['', '.', './', '  .  ']) {
      expect(isRootPath(p)).toBe(true);
      expect(findNodeByPath(tree, p)?.name).toBe('Root');
      expect(findNodeByName(tree, p)?.name).toBe('Root');
    }
  });

  it('still resolves relative and absolute node paths', () => {
    expect(findNodeByPath(tree, 'Child')?.name).toBe('Child');
    expect(findNodeByPath(tree, './Child')?.name).toBe('Child');
    expect(findNodeByPath(tree, 'Root/Child')?.name).toBe('Child');
    expect(findNodeByPath(tree, 'Nope')).toBeNull();
  });
});

describe('gradients serialize as Godot expects', () => {
  // Godot's text format stores PackedColorArray as FLAT floats, not Color(...)
  // literals: `PackedColorArray(Color(0,0,0,1))` fails with
  // "Parse Error: Expected float in constructor".
  it('writes flattened floats, not Color(...) constructors', () => {
    const r = handleCreateGradient(root, { path: 'grad.tres' });
    expect(r.isError).toBeFalsy();
    const out = read('grad.tres');
    expect(out).toContain('colors = PackedColorArray(0, 0, 0, 1, 1, 1, 1, 1)');
    expect(out).not.toContain('PackedColorArray(Color');
  });

  it('converts Color(...) and hex inputs to flat floats', () => {
    handleCreateGradient(root, {
      path: 'grad2.tres',
      colors: [{ offset: '0', color: 'Color(1, 0, 0, 1)' }, { offset: '1', color: '#00ff00' }],
    });
    const out = read('grad2.tres');
    expect(out).toContain('offsets = PackedFloat32Array(0, 1)');
    expect(out).toContain('colors = PackedColorArray(1, 0, 0, 1, 0, 1, 0, 1)');
  });
});

describe('noise textures declare sub-resources before they are referenced', () => {
  it('puts [sub_resource] before [resource]', () => {
    handleCreateNoiseTexture(root, { path: 'noise.tres', width: 64, height: 32 });
    const out = read('noise.tres');
    const sub = out.indexOf('[sub_resource');
    const res = out.indexOf('[resource]');
    expect(sub).toBeGreaterThan(-1);
    expect(res).toBeGreaterThan(-1);
    expect(sub).toBeLessThan(res);
    expect(out).toContain('width = 64');
    expect(out).toContain('height = 32');
  });
});

describe('code writers refuse to clobber the wrong kind of file', () => {
  // Before the guard, `write_shader({path: "scenes/main.tscn", content: "shader_type ..."})`
  // overwrote the scene with shader source and answered "Shader written".
  const sceneFile = (): string =>
    write('main.tscn', '[gd_scene format=3]\n\n[node name="Main" type="Node2D"]\n');

  it('write_shader rejects a .tscn target and leaves it untouched', () => {
    const abs = sceneFile();
    const before = fs.readFileSync(abs, 'utf8');
    const r = handleWriteShader(root, { path: 'main.tscn', content: 'shader_type canvas_item;\n' });
    expect(r.isError).toBe(true);
    expect(text(r)).toContain('[INVALID_ARGUMENT]');
    expect(text(r)).toContain('.gdshader');
    expect(fs.readFileSync(abs, 'utf8')).toBe(before); // 文件没被动过
  });

  it('write_script rejects a .tscn target', () => {
    sceneFile();
    const r = handleWriteScript(root, { path: 'main.tscn', content: 'extends Node\n' });
    expect(r.isError).toBe(true);
    expect(text(r)).toContain('[INVALID_ARGUMENT]');
  });

  it('create_script rejects an extension that contradicts the language', () => {
    const r = handleCreateScript(root, { path: 'thing.cs', type: 'gdscript' });
    expect(r.isError).toBe(true);
    expect(text(r)).toContain('[INVALID_ARGUMENT]');
  });

  it('still writes the right extension', () => {
    const r = handleWriteShader(root, { path: 'shaders/x.gdshader', content: 'shader_type canvas_item;\n' });
    expect(r.isError).toBeFalsy();
    expect(read('shaders/x.gdshader')).toContain('shader_type');
  });
});

describe('scene writers reject values Godot cannot parse', () => {
  const scene = (): void => {
    write('main.tscn', [
      '[gd_scene load_steps=2 format=3]',
      '',
      '[node name="Main" type="Node2D"]',
      '',
      '[node name="Shape" type="CollisionShape2D" parent="."]',
      '',
    ].join('\n'));
  };

  it('refuses a non-numeric rotation instead of writing "rotation = smoke"', () => {
    scene();
    const before = read('main.tscn');
    const r = handleSetNodeRotation(root, { scene_path: 'main.tscn', node_path: '.', value: 'smoke' });
    expect(r.isError).toBe(true);
    expect(text(r)).toMatch(/Invalid rotation value/);
    expect(read('main.tscn')).toBe(before); // 场景没被写坏
  });

  it('accepts a numeric rotation', () => {
    scene();
    const r = handleSetNodeRotation(root, { scene_path: 'main.tscn', node_path: '.', value: '1.57' });
    expect(r.isError).toBeFalsy();
    expect(read('main.tscn')).toContain('rotation = 1.57');
  });

  it('set_collision_shape uses the resource type from the file, and rejects non-shapes', () => {
    scene();
    write('mat.tres', '[gd_resource type="PhysicsMaterial" format=3]\n\n[resource]\nfriction = 1.0\n');
    const r = handleSetCollisionShape(root, {
      scene_path: 'main.tscn', node_path: 'Shape', shape_type: 'BoxShape3D', shape_resource_path: 'mat.tres',
    });
    expect(r.isError).toBe(true);
    expect(text(r)).toContain('[INVALID_ARGUMENT]');
    expect(text(r)).toContain('PhysicsMaterial');

    // 真正的 shape 资源：ext_resource 的 type 必须是文件里的 BoxShape3D
    write('box.tres', '[gd_resource type="BoxShape3D" format=3]\n\n[resource]\nsize = Vector3(1, 1, 1)\n');
    const ok = handleSetCollisionShape(root, {
      scene_path: 'main.tscn', node_path: 'Shape', shape_type: 'BoxShape3D', shape_resource_path: 'box.tres',
    });
    expect(ok.isError).toBeFalsy();
    const out = read('main.tscn');
    expect(out).toContain('type="BoxShape3D" path="res://box.tres"');
    expect(out).not.toContain('type="PhysicsMaterial"');
  });
});

describe('generated resources never contain dangling references', () => {
  // 两类真 bug 的共同根因：
  //   * attach_script / create_atlas_texture 引用了 ExtResource 却没声明
  //   * create_noise_texture 把 [sub_resource] 写在引用它的 [resource] 之后
  // Godot 遇到任一种都直接拒绝加载整个文件（"Expected float in constructor",
  // "Condition !int_resources.has(id)"），而工具却回成功。
  function refProblems(text: string): string[] {
    const problems: string[] = [];
    const decl = (kind: string) => new Map(
      [...text.matchAll(new RegExp(`^\\[${kind}[^\\]]*id="([^"]+)"`, 'gm'))]
        .map((m) => [m[1], m.index ?? -1] as [string, number])
    );
    const extDecl = decl('ext_resource');
    const subDecl = decl('sub_resource');
    const use = (kind: string) => new Map(
      [...text.matchAll(new RegExp(`${kind}\\("([^"]+)"\\)`, 'g'))]
        .map((m) => [m[1], m.index ?? -1] as [string, number])
    );

    for (const [kind, declared, used] of [
      ['ExtResource', extDecl, use('ExtResource')],
      ['SubResource', subDecl, use('SubResource')],
    ] as const) {
      for (const [id, at] of used) {
        const declaredAt = declared.get(id);
        if (declaredAt === undefined) problems.push(`${kind}("${id}") is never declared`);
        else if (declaredAt > at) problems.push(`${kind}("${id}") is declared after it is used`);
      }
    }
    return problems;
  }

  it('atlas textures declare the atlas they reference', () => {
    write('icon.svg', '<svg xmlns="http://www.w3.org/2000/svg"/>');
    const r = handleCreateAtlasTexture(root, { path: 'atlas.tres', atlas_texture: 'icon.svg' });
    expect(r.isError).toBeFalsy();
    const out = read('atlas.tres');
    expect(out).toContain('[ext_resource type="Texture2D" path="res://icon.svg" id="1_atlas"]');
    expect(refProblems(out)).toEqual([]);
  });

  it('atlas textures refuse a texture that does not exist', () => {
    const r = handleCreateAtlasTexture(root, { path: 'atlas.tres', atlas_texture: 'nope.png' });
    expect(r.isError).toBe(true);
    expect(text(r)).toContain('[FILE_NOT_FOUND]');
    expect(fs.existsSync(path.join(root, 'atlas.tres'))).toBe(false);
  });

  it('noise textures, collision shapes and world environments are self-consistent', () => {
    write('env.tres', '[gd_resource type="Environment" format=3]\n\n[resource]\n');
    write('mesh.tres', '[gd_resource type="BoxMesh" format=3]\n\n[resource]\n');
    write('scene.tscn', '[gd_scene format=3]\n\n[node name="Main" type="Node3D"]\n\n[node name="Col" type="CollisionShape3D" parent="."]\n');

    const outputs: string[] = [];
    handleCreateNoiseTexture(root, { path: 'noise.tres' });
    outputs.push(read('noise.tres'));
    handleSetCollisionShape(root, { scene_path: 'scene.tscn', node_path: 'Col', shape_type: 'BoxShape3D' });
    outputs.push(read('scene.tscn'));
    handleCreateWorldEnvironment(root, { path: 'world_env.tscn', environment_path: 'res://env.tres' });
    outputs.push(read('world_env.tscn'));
    handleCreateMultimesh(root, { path: 'mm.tres', mesh_path: 'res://mesh.tres' });
    outputs.push(read('mm.tres'));
    handleCreateWorld(root, { path: 'world.tres', environment_path: 'res://env.tres' });
    outputs.push(read('world.tres'));

    for (const out of outputs) {
      expect(refProblems(out), `dangling/inverted references in:\n${out}`).toEqual([]);
    }
    // 传 res:// 前缀时不能拼出 res://res://
    expect(read('world.tres')).not.toContain('res://res://');
  });
});

describe('error codes are refined from the message', () => {
  it('maps filesystem hints to specific codes (INTERNAL_ERROR only)', () => {
    expect(refineErrorCode(ErrorCode.INTERNAL_ERROR, 'Error: File not found: /x')).toBe(ErrorCode.FILE_NOT_FOUND);
    expect(refineErrorCode(ErrorCode.INTERNAL_ERROR, 'ENOENT: no such file or directory')).toBe(ErrorCode.FILE_NOT_FOUND);
    expect(refineErrorCode(ErrorCode.INTERNAL_ERROR, 'EACCES: permission denied')).toBe(ErrorCode.PERMISSION_DENIED);
    expect(refineErrorCode(ErrorCode.INTERNAL_ERROR, 'File is not a TileSet (found: Resource)')).toBe(ErrorCode.INVALID_ARGUMENT);
    expect(refineErrorCode(ErrorCode.INTERNAL_ERROR, 'Node "." is Node2D, not Sprite2D')).toBe(ErrorCode.INVALID_ARGUMENT);
    expect(refineErrorCode(ErrorCode.INTERNAL_ERROR, 'No AnimationPlayer node found')).toBe(ErrorCode.NOT_FOUND);
    expect(refineErrorCode(ErrorCode.INTERNAL_ERROR, 'No transform parameters provided. Specify at least one: position')).toBe(ErrorCode.INVALID_ARGUMENT);
  });

  it('never overrides an explicit code', () => {
    expect(refineErrorCode(ErrorCode.NOT_FOUND, 'File not found: /x')).toBe(ErrorCode.NOT_FOUND);
    expect(toolError(ErrorCode.FILE_NOT_FOUND, 'EACCES: permission denied').content[0].text)
      .toMatch(/^\[FILE_NOT_FOUND\]/);
  });

  it('leaves genuinely internal errors alone', () => {
    expect(refineErrorCode(ErrorCode.INTERNAL_ERROR, 'Cannot read properties of undefined')).toBe(ErrorCode.INTERNAL_ERROR);
  });
});
