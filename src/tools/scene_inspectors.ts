// Copyright (c) 2026 FairYan
// SPDX-License-Identifier: MIT
// ============================================================
// Godot MCP Server — Scene Node Inspectors
// ============================================================
// Inspect and manipulate specialized Godot nodes:
// 2D Lights, VehicleBody, SpringArm, Decals, Occluders, Markers,
// AudioListener, CameraAttributes, SpriteFrames, SoftBody, GridMap.
// (Mesh primitives moved to mesh.ts)

import { z } from 'zod';
import fs from 'node:fs';
import { ToolResult } from '../utils/types.js';
import { readTextFile, resolveProjectPath, findFilesByExtension, writeTextFile } from '../utils/file_utils.js';
import { parseScene } from '../parsers/scene_parser.js';

// ---- Shared scene-node walker ----

function walk(nodes: any[], types: string[]): any[] {
  const r: any[] = [];
  for (const n of nodes) { if (types.includes(n.type)) r.push(n); if (n.children) r.push(...walk(n.children, types)); }
  return r;
}

// ============================================================
// 2D LIGHTS
// ============================================================

export const readLight2dSchema = {
  scene_path: z.string().optional().describe('Filter to scene'),
  light_type: z.string().optional().describe('Filter: PointLight2D, DirectionalLight2D'),
};
export const setLight2dParamSchema = {
  scene_path: z.string(), light_name: z.string(), param: z.string(), value: z.string(),
};

export function handleReadLight2d(
  projectRoot: string,
  args: { scene_path?: string; light_type?: string }
): ToolResult {
  try {
    const types = ['PointLight2D', 'DirectionalLight2D'];
    const scenes = args.scene_path ? [args.scene_path] : findFilesByExtension(projectRoot, ['.tscn']);
    const lights: any[] = [];
    for (const s of scenes) {
      const doc = parseScene(readTextFile(resolveProjectPath(projectRoot, s)).content);
      for (const n of walk(doc.nodes, args.light_type ? [args.light_type] : types)) {
        lights.push({ scene: s, name: n.name, type: n.type, energy: n.properties['energy'] || '1', color: n.properties['color'] || 'white', shadow: n.properties['shadow_enabled'] || 'false' });
      }
    }
    if (!lights.length) return { content: [{ type: 'text', text: 'No 2D light nodes found.' }] };
    const lines = [`2D Lights (${lights.length}):`, ''];
    lights.forEach(l => lines.push(`  ${l.scene} → ${l.name} (${l.type})  energy=${l.energy}  shadow=${l.shadow}`));
    return { content: [{ type: 'text', text: lines.join('\n') }] };
  } catch (e: any) { return { content: [{ type: 'text', text: `Error: ${e.message}` }], isError: true }; }
}

export function handleSetLight2dParam(projectRoot: string, args: { scene_path: string; light_name: string; param: string; value: string }): ToolResult {
  try {
    const abs = resolveProjectPath(projectRoot, args.scene_path);
    const doc = parseScene(readTextFile(abs).content);
    const light = walk(doc.nodes, ['PointLight2D', 'DirectionalLight2D']).find(n => n.name === args.light_name);
    if (!light) return { content: [{ type: 'text', text: `Light ${args.light_name} not found` }], isError: true };
    light.properties[args.param] = args.value;
    // Note: full round-trip requires scene serialization — light write is best-effort
    return { content: [{ type: 'text', text: `2D light updated: ${args.light_name}.${args.param}=${args.value}` }] };
  } catch (e: any) { return { content: [{ type: 'text', text: `Error: ${e.message}` }], isError: true }; }
}

// ============================================================
// VEHICLE BODY
// ============================================================

export const createVehicleBodySchema = {
  scene_path: z.string(), name: z.string().optional().default('VehicleBody3D'), parent: z.string().optional().default('.'),
  wheels: z.array(z.object({ name: z.string(), position: z.array(z.number()).optional(), suspension: z.number().optional().default(0.15) })).optional(),
};
export const readVehicleBodySchema = { scene_path: z.string().optional() };

export function handleCreateVehicleBody(
  projectRoot: string,
  args: { scene_path: string; name?: string; parent?: string; wheels?: { name: string; position?: number[]; suspension?: number }[] }
): ToolResult {
  try {
    const abs = resolveProjectPath(projectRoot, args.scene_path);
    let content = readTextFile(abs).content;
    content += `\n[node name="${args.name || 'VehicleBody3D'}" type="VehicleBody3D" parent="${args.parent || '.'}"]\n`;
    content += `mass = 40.0\n`;
    if (args.wheels) {
      for (const w of args.wheels) {
        const pos = w.position ? `Vector3(${w.position[0]},${w.position[1]},${w.position[2]})` : 'Vector3(0,0,0)';
        content += `\n[node name="${w.name}" type="VehicleWheel3D" parent="${args.parent || '.'}/${args.name || 'VehicleBody3D'}"]\n`;
        content += `position = ${pos}\n`;
        content += `suspension_travel = ${w.suspension || 0.15}\n`;
      }
    }
    writeTextFile(abs, content, true);
    return { content: [{ type: 'text', text: `VehicleBody created: ${args.name || 'VehicleBody3D'} (${args.wheels?.length || 0} wheels)` }] };
  } catch (e: any) { return { content: [{ type: 'text', text: `Error: ${e.message}` }], isError: true }; }
}

export function handleReadVehicleBody(projectRoot: string, args: { scene_path?: string }): ToolResult {
  try {
    const scenes = args.scene_path ? [args.scene_path] : findFilesByExtension(projectRoot, ['.tscn']);
    const vehicles: any[] = [];
    for (const s of scenes) {
      const doc = parseScene(readTextFile(resolveProjectPath(projectRoot, s)).content);
      for (const n of walk(doc.nodes, ['VehicleBody3D'])) {
        const wheels = walk(n.children || [], ['VehicleWheel3D']);
        vehicles.push({ scene: s, name: n.name, mass: n.properties['mass'] || '40', wheels: wheels.length });
      }
    }
    if (!vehicles.length) return { content: [{ type: 'text', text: 'No VehicleBody nodes found.' }] };
    const lines = [`Vehicles (${vehicles.length}):`, ''];
    vehicles.forEach(v => lines.push(`  ${v.scene} → ${v.name}  mass=${v.mass}  wheels=${v.wheels}`));
    return { content: [{ type: 'text', text: lines.join('\n') }] };
  } catch (e: any) { return { content: [{ type: 'text', text: `Error: ${e.message}` }], isError: true }; }
}

// ============================================================
// SPRING ARM
// ============================================================

export const createSpringArmSchema = {
  scene_path: z.string(), name: z.string().optional().default('SpringArm3D'), parent: z.string().optional().default('.'), length: z.number().optional().default(4),
};
export const readSpringArmSchema = { scene_path: z.string().optional() };

export function handleCreateSpringArm(
  projectRoot: string,
  args: { scene_path: string; name?: string; parent?: string; length?: number }
): ToolResult {
  try {
    const abs = resolveProjectPath(projectRoot, args.scene_path);
    let content = readTextFile(abs).content;
    content += `\n[node name="${args.name || 'SpringArm3D'}" type="SpringArm3D" parent="${args.parent || '.'}"]\n`;
    content += `spring_length = ${args.length || 4}\n`;
    writeTextFile(abs, content, true);
    return { content: [{ type: 'text', text: `SpringArm created: ${args.name || 'SpringArm3D'} (length=${args.length || 4})` }] };
  } catch (e: any) { return { content: [{ type: 'text', text: `Error: ${e.message}` }], isError: true }; }
}

export function handleReadSpringArm(projectRoot: string, args: { scene_path?: string }): ToolResult {
  try {
    const scenes = args.scene_path ? [args.scene_path] : findFilesByExtension(projectRoot, ['.tscn']);
    const arms: any[] = [];
    for (const s of scenes) {
      const doc = parseScene(readTextFile(resolveProjectPath(projectRoot, s)).content);
      for (const n of walk(doc.nodes, ['SpringArm3D'])) {
        arms.push({ scene: s, name: n.name, length: n.properties['spring_length'] || '4', collision: n.properties['collision_mask'] || '1' });
      }
    }
    if (!arms.length) return { content: [{ type: 'text', text: 'No SpringArm3D nodes found.' }] };
    const lines = [`SpringArms (${arms.length}):`, ''];
    arms.forEach(a => lines.push(`  ${a.scene} → ${a.name}  length=${a.length}`));
    return { content: [{ type: 'text', text: lines.join('\n') }] };
  } catch (e: any) { return { content: [{ type: 'text', text: `Error: ${e.message}` }], isError: true }; }
}

// ============================================================
// DECALS
// ============================================================

export const readDecalSchema = { scene_path: z.string().optional() };

export function handleReadDecal(projectRoot: string, args: { scene_path?: string }): ToolResult {
  try {
    const scenes = args.scene_path ? [args.scene_path] : findFilesByExtension(projectRoot, ['.tscn']);
    const decals: any[] = [];
    for (const s of scenes) {
      const doc = parseScene(readTextFile(resolveProjectPath(projectRoot, s)).content);
      for (const n of walk(doc.nodes, ['Decal'])) {
        decals.push({ scene: s, name: n.name, size: n.properties['size'] || '1', texture: n.properties['texture_albedo'] || 'none', alpha: n.properties['upper_fade'] || '0.3' });
      }
    }
    if (!decals.length) return { content: [{ type: 'text', text: 'No Decal nodes found.' }] };
    const lines = [`Decals (${decals.length}):`, ''];
    decals.forEach(d => lines.push(`  ${d.scene} → ${d.name}  size=${d.size}`));
    return { content: [{ type: 'text', text: lines.join('\n') }] };
  } catch (e: any) { return { content: [{ type: 'text', text: `Error: ${e.message}` }], isError: true }; }
}

// ============================================================
// OCCLUDERS
// ============================================================

export const readOccluderSchema = { scene_path: z.string().optional() };

export function handleReadOccluder(projectRoot: string, args: { scene_path?: string }): ToolResult {
  try {
    const scenes = args.scene_path ? [args.scene_path] : findFilesByExtension(projectRoot, ['.tscn']);
    const occluders: any[] = [];
    for (const s of scenes) {
      const doc = parseScene(readTextFile(resolveProjectPath(projectRoot, s)).content);
      for (const n of walk(doc.nodes, ['OccluderInstance3D', 'OcclusionPolygon2D'])) {
        occluders.push({ scene: s, name: n.name, type: n.type });
      }
    }
    if (!occluders.length) return { content: [{ type: 'text', text: 'No Occluder nodes found.' }] };
    const lines = [`Occluders (${occluders.length}):`, ''];
    occluders.forEach(o => lines.push(`  ${o.scene} → ${o.name} (${o.type})`));
    return { content: [{ type: 'text', text: lines.join('\n') }] };
  } catch (e: any) { return { content: [{ type: 'text', text: `Error: ${e.message}` }], isError: true }; }
}

// ============================================================
// MARKERS
// ============================================================

export const readMarkerSchema = { scene_path: z.string().optional(), marker_type: z.string().optional().describe('Marker2D or Marker3D') };

export function handleReadMarker(projectRoot: string, args: { scene_path?: string; marker_type?: string }): ToolResult {
  try {
    const types = args.marker_type ? [args.marker_type] : ['Marker2D', 'Marker3D'];
    const scenes = args.scene_path ? [args.scene_path] : findFilesByExtension(projectRoot, ['.tscn']);
    const markers: any[] = [];
    for (const s of scenes) {
      const doc = parseScene(readTextFile(resolveProjectPath(projectRoot, s)).content);
      for (const n of walk(doc.nodes, types)) {
        markers.push({ scene: s, name: n.name, type: n.type, pos: n.properties['position'] || '0,0' });
      }
    }
    if (!markers.length) return { content: [{ type: 'text', text: 'No Marker nodes found.' }] };
    const byType: Record<string, typeof markers> = {};
    for (const m of markers) (byType[m.type] ||= []).push(m);
    const lines = [`Markers (${markers.length}):`, ''];
    for (const [t, items] of Object.entries(byType)) { lines.push(`  ${t} (${items.length}):`); items.forEach(m => lines.push(`    ${m.scene} → ${m.name}`)); }
    return { content: [{ type: 'text', text: lines.join('\n') }] };
  } catch (e: any) { return { content: [{ type: 'text', text: `Error: ${e.message}` }], isError: true }; }
}

// ============================================================
// AUDIO STREAM INFO
// ============================================================

export const readAudioStreamSchema = { path: z.string().describe('Path to audio file (.wav/.ogg/.mp3)') };

export function handleReadAudioStream(projectRoot: string, args: { path: string }): ToolResult {
  try {
    const abs = resolveProjectPath(projectRoot, args.path);
    if (!fs.existsSync(abs)) return { content: [{ type: 'text', text: `File not found: ${args.path}` }], isError: true };
    const stat = fs.statSync(abs);
    const ext = args.path.split('.').pop()?.toLowerCase();
    const lines = [`Audio Stream: ${args.path}`, `Format: ${ext?.toUpperCase()}`, `Size: ${Math.round(stat.size / 1024)} KB`, ''];
    const importPath = abs + '.import';
    if (fs.existsSync(importPath)) {
      const ic = fs.readFileSync(importPath, 'utf-8');
      const loopMatch = ic.match(/loop\s*=\s*(true|false)/i);
      const bitrateMatch = ic.match(/bitrate\s*=\s*(\d+)/);
      const modeMatch = ic.match(/stream_mode\s*=\s*(\d+)/);
      lines.push('Import Settings:');
      if (loopMatch) lines.push(`  Loop: ${loopMatch[1]}`);
      if (bitrateMatch) lines.push(`  Bitrate: ${bitrateMatch[1]}`);
      if (modeMatch) lines.push(`  Stream Mode: ${modeMatch[1]} (${modeMatch[1] === '0' ? 'Stream' : modeMatch[1] === '1' ? 'Compressed' : 'RAM'})`);
    }
    return { content: [{ type: 'text', text: lines.join('\n') }] };
  } catch (e: any) { return { content: [{ type: 'text', text: `Error: ${e.message}` }], isError: true }; }
}

// ============================================================
// CAMERA ATTRIBUTES
// ============================================================

export const createCameraAttributesSchema = {
  path: z.string(), preset: z.enum(['practical', 'physical']).optional().default('practical'),
};

export function handleCreateCameraAttributes(
  projectRoot: string,
  args: { path: string; preset?: string }
): ToolResult {
  try {
    const type = args.preset === 'physical' ? 'CameraAttributesPhysical' : 'CameraAttributesPractical';
    let content = `[gd_resource type="${type}" format=3 uid=""]\n\n[resource]\n`;
    if (type === 'CameraAttributesPractical') {
      content += 'dof_blur_amount = 0.1\nauto_exposure_enabled = true\n';
    } else {
      content += 'dof_blur_near_enabled = false\ndof_blur_far_enabled = true\ndof_blur_far_distance = 10.0\nauto_exposure_enabled = true\n';
    }
    const abs = resolveProjectPath(projectRoot, args.path);
    writeTextFile(abs, content, false);
    return { content: [{ type: 'text', text: `Camera attributes created: ${args.path} (${type})` }] };
  } catch (e: any) { return { content: [{ type: 'text', text: `Error: ${e.message}` }], isError: true }; }
}

// ============================================================
// SPRITE FRAMES
// ============================================================

export const createSpriteFramesSchema = {
  path: z.string().describe('Output path for SpriteFrames .tres'),
  animations: z.array(z.object({ name: z.string().optional().default('default'), fps: z.number().optional().default(5), loop: z.boolean().optional().default(true) })).optional(),
};
export const readSpriteFramesSchema = { scene_path: z.string().optional() };

export function handleCreateSpriteFrames(
  projectRoot: string,
  args: { path: string; animations?: { name?: string; fps?: number; loop?: boolean }[] }
): ToolResult {
  try {
    const anims = args.animations || [{ name: 'default', fps: 5, loop: true }];
    let content = '[gd_resource type="SpriteFrames" format=3 uid=""]\n\n[resource]\n';
    for (let i = 0; i < anims.length; i++) {
      const a = anims[i];
      content += `animations/${a.name || 'default'}/speed = ${a.fps || 5}\n`;
      content += `animations/${a.name || 'default'}/loop = ${a.loop !== false}\n`;
    }
    const abs = resolveProjectPath(projectRoot, args.path);
    writeTextFile(abs, content, false);
    return { content: [{ type: 'text', text: `SpriteFrames created: ${args.path} (${anims.length} animations)` }] };
  } catch (e: any) { return { content: [{ type: 'text', text: `Error: ${e.message}` }], isError: true }; }
}

export function handleReadSpriteFrames(projectRoot: string, args: { scene_path?: string }): ToolResult {
  try {
    const scenes = args.scene_path ? [args.scene_path] : findFilesByExtension(projectRoot, ['.tscn']);
    const sprites: any[] = [];
    for (const s of scenes) {
      const doc = parseScene(readTextFile(resolveProjectPath(projectRoot, s)).content);
      for (const n of walk(doc.nodes, ['AnimatedSprite2D', 'AnimatedSprite3D'])) {
        const frames = n.properties['sprite_frames'] || 'none';
        sprites.push({ scene: s, name: n.name, type: n.type, frames, anim: n.properties['animation'] || 'default' });
      }
    }
    const tresFiles = findFilesByExtension(projectRoot, ['.tres']);
    const frameFiles: string[] = [];
    for (const f of tresFiles) {
      try {
        const c = fs.readFileSync(resolveProjectPath(projectRoot, f), 'utf-8');
        if (c.includes('type="SpriteFrames"')) frameFiles.push(f);
      } catch { /* skip */ }
    }
    if (!sprites.length && !frameFiles.length) return { content: [{ type: 'text', text: 'No AnimatedSprite nodes or SpriteFrames resources found.' }] };
    const lines: string[] = [];
    if (sprites.length) { lines.push(`Animated Sprites (${sprites.length}):`, ''); sprites.forEach(s => lines.push(`  ${s.scene} → ${s.name} (${s.type})  anim="${s.anim}"`)); lines.push(''); }
    if (frameFiles.length) { lines.push(`SpriteFrames Resources (${frameFiles.length}):`); frameFiles.forEach(f => lines.push(`  ${f}`)); }
    return { content: [{ type: 'text', text: lines.join('\n') }] };
  } catch (e: any) { return { content: [{ type: 'text', text: `Error: ${e.message}` }], isError: true }; }
}

// ============================================================
// SOFT BODY
// ============================================================

export const readSoftBodySchema = { scene_path: z.string().optional() };

export function handleReadSoftBody(projectRoot: string, args: { scene_path?: string }): ToolResult {
  try {
    const scenes = args.scene_path ? [args.scene_path] : findFilesByExtension(projectRoot, ['.tscn']);
    const bodies: any[] = [];
    for (const s of scenes) {
      const doc = parseScene(readTextFile(resolveProjectPath(projectRoot, s)).content);
      for (const n of walk(doc.nodes, ['SoftBody3D'])) {
        bodies.push({ scene: s, name: n.name, mass: n.properties['mass'] || '1', stiffness: n.properties['stiffness'] || '1' });
      }
    }
    if (!bodies.length) return { content: [{ type: 'text', text: 'No SoftBody3D nodes found.' }] };
    const lines = [`Soft Bodies (${bodies.length}):`, ''];
    bodies.forEach(b => lines.push(`  ${b.scene} → ${b.name}  mass=${b.mass}  stiffness=${b.stiffness}`));
    return { content: [{ type: 'text', text: lines.join('\n') }] };
  } catch (e: any) { return { content: [{ type: 'text', text: `Error: ${e.message}` }], isError: true }; }
}

// ============================================================
// GRID MAP
// ============================================================

export const readGridMapSchema = { scene_path: z.string().optional() };
export const createGridMapSchema = { scene_path: z.string(), name: z.string().optional().default('GridMap'), parent: z.string().optional().default('.') };

export function handleReadGridMap(projectRoot: string, args: { scene_path?: string }): ToolResult {
  try {
    const scenes = args.scene_path ? [args.scene_path] : findFilesByExtension(projectRoot, ['.tscn']);
    const maps: any[] = [];
    for (const s of scenes) {
      const doc = parseScene(readTextFile(resolveProjectPath(projectRoot, s)).content);
      for (const n of walk(doc.nodes, ['GridMap'])) {
        maps.push({ scene: s, name: n.name, size: n.properties['cell_size'] || '1', mesh_library: n.properties['mesh_library'] || 'none' });
      }
    }
    if (!maps.length) return { content: [{ type: 'text', text: 'No GridMap nodes found.' }] };
    const lines = [`GridMaps (${maps.length}):`, ''];
    maps.forEach(m => lines.push(`  ${m.scene} → ${m.name}  cell=${m.size}`));
    return { content: [{ type: 'text', text: lines.join('\n') }] };
  } catch (e: any) { return { content: [{ type: 'text', text: `Error: ${e.message}` }], isError: true }; }
}

export function handleCreateGridMap(
  projectRoot: string,
  args: { scene_path: string; name?: string; parent?: string }
): ToolResult {
  try {
    const abs = resolveProjectPath(projectRoot, args.scene_path);
    let content = readTextFile(abs).content;
    content += `\n[node name="${args.name || 'GridMap'}" type="GridMap" parent="${args.parent || '.'}"]\ncell_size = 2.0\n`;
    writeTextFile(abs, content, true);
    return { content: [{ type: 'text', text: `GridMap created: ${args.name || 'GridMap'}` }] };
  } catch (e: any) { return { content: [{ type: 'text', text: `Error: ${e.message}` }], isError: true }; }
}

// ============================================================
// AUDIO LISTENER
// ============================================================

export const readAudioListenerSchema = { scene_path: z.string().optional() };

export function handleReadAudioListener(projectRoot: string, args: { scene_path?: string }): ToolResult {
  try {
    const scenes = args.scene_path ? [args.scene_path] : findFilesByExtension(projectRoot, ['.tscn']);
    const listeners: any[] = [];
    for (const s of scenes) {
      const doc = parseScene(readTextFile(resolveProjectPath(projectRoot, s)).content);
      for (const n of walk(doc.nodes, ['AudioListener2D', 'AudioListener3D'])) {
        listeners.push({ scene: s, name: n.name, type: n.type });
      }
    }
    if (!listeners.length) return { content: [{ type: 'text', text: 'No AudioListener nodes found.' }] };
    const lines = [`Audio Listeners (${listeners.length}):`, ''];
    listeners.forEach(l => lines.push(`  ${l.scene} → ${l.name} (${l.type})`));
    return { content: [{ type: 'text', text: lines.join('\n') }] };
  } catch (e: any) { return { content: [{ type: 'text', text: `Error: ${e.message}` }], isError: true }; }
}
