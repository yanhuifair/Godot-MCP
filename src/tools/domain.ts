// Copyright (c) 2026 FairYan
// SPDX-License-Identifier: MIT
// ============================================================
// Godot MCP Server - Curve, Gradient, Path & Skeleton Tools
// ============================================================

import { z } from 'zod';
import { ToolResult } from '../utils/types.js';
import { readTextFile, resolveProjectPath, findFilesByExtension, writeTextFile } from '../utils/file_utils.js';
import { parseResource } from '../parsers/resource_parser.js';
import { parseScene } from '../parsers/scene_parser.js';

// ---- Schemas ----

export const readCurveSchema = {
  path: z.string().describe('Path to .tres Curve resource'),
};

export const createCurveSchema = {
  path: z.string().describe('Output path (e.g. "curves/ease_in.tres")'),
  points: z.array(z.array(z.number())).optional().describe('Array of [x, y] control points'),
  bake_resolution: z.number().optional().default(100).describe('Bake resolution'),
};

export const readGradientSchema = {
  path: z.string().describe('Path to .tres Gradient resource'),
};

export const createGradientSchema = {
  path: z.string().describe('Output path (e.g. "gradients/fire.tres")'),
  colors: z.array(z.record(z.string())).optional().describe('Array of {offset, color} objects'),
  interpolation_mode: z.enum(['linear', 'constant', 'cubic']).optional().default('linear'),
};

export const listPathsSchema = {
  scene_path: z.string().optional().describe('Filter to scene'),
};

export const readPathSchema = {
  scene_path: z.string().describe('Path to .tscn scene'),
  name: z.string().optional().describe('Path2D/Path3D node name'),
};

export const listSkeletonsSchema = {
  scene_path: z.string().optional().describe('Filter to scene'),
};

export const readSkeletonSchema = {
  scene_path: z.string().describe('Path to .tscn scene'),
  name: z.string().optional().describe('Skeleton3D node name'),
};

export const readReflectionProbeSchema = {
  scene_path: z.string().optional().describe('Filter to scene'),
};

export const readMultiMeshSchema = {
  scene_path: z.string().optional().describe('Filter to scene'),
};

export const createNoiseTextureSchema = {
  path: z.string().describe('Output path for NoiseTexture2D .tres'),
  width: z.number().optional().default(256).describe('Texture width'),
  height: z.number().optional().default(256).describe('Texture height'),
  seamless: z.boolean().optional().default(false).describe('Seamless tiling'),
  noise_type: z.enum(['simplex', 'cellular', 'perlin', 'value']).optional().default('simplex'),
};

// ---- Helpers ----

function walkNodes(nodes: any[], types: string[]): any[] {
  const result: any[] = [];
  for (const node of nodes) {
    if (types.includes(node.type)) result.push(node);
    if (node.children) result.push(...walkNodes(node.children, types));
  }
  return result;
}

// ---- Curve Tools ----

export function handleReadCurve(
  projectRoot: string,
  args: { path: string }
): ToolResult {
  try {
    const absPath = resolveProjectPath(projectRoot, args.path);
    const { content } = readTextFile(absPath);
    const doc = parseResource(content);

    const lines: string[] = [];
    lines.push(`Curve: ${doc.header.type}`);
    lines.push(`File: ${args.path}`);
    lines.push('');

    for (const [key, val] of Object.entries(doc.resource)) {
      const label = curvePropLabel(key);
      lines.push(`  ${key} = ${val}${label ? `  # ${label}` : ''}`);
    }

    // Parse curve points
    const points: { pos: string; left: string; right: string }[] = [];
    for (const key of Object.keys(doc.resource).sort()) {
      const m = key.match(/_data\/points\/(\d+)\/(.+)$/);
      if (m) {
        const idx = parseInt(m[1], 10);
        const field = m[2];
        if (!points[idx]) points[idx] = { pos: '?', left: '0', right: '0' };
        switch (field) {
          case 'pos': points[idx].pos = doc.resource[key]; break;
          case 'left_tangent': points[idx].left = doc.resource[key]; break;
          case 'right_tangent': points[idx].right = doc.resource[key]; break;
        }
      }
    }

    if (points.length > 0) {
      lines.push('');
      lines.push(`Control Points (${points.length}):`);
      points.forEach((p, i) => {
        lines.push(`  ${i}: pos=${p.pos}  tangent=[${p.left}, ${p.right}]`);
      });
    }

    return { content: [{ type: 'text', text: lines.join('\n') }] };
  } catch (err: any) {
    return { content: [{ type: 'text', text: `Error: ${err.message}` }], isError: true };
  }
}

export function handleCreateCurve(
  projectRoot: string,
  args: { path: string; points?: number[][]; bake_resolution?: number }
): ToolResult {
  try {
    let content = '[gd_resource type="Curve" format=3 uid=""]\n\n[resource]\n';
    content += `bake_resolution = ${args.bake_resolution ?? 100}\n`;

    if (args.points && args.points.length > 0) {
      content += `_data = {\n"points": PackedFloat32Array(${args.points.flat().join(', ')}),\n`;
      content += '"tilts": PackedFloat32Array()\n}\n';
    }

    const absPath = resolveProjectPath(projectRoot, args.path);
    writeTextFile(absPath, content, false);

    const pts = args.points?.length || 0;
    return { content: [{ type: 'text', text: `Curve created: ${args.path} (${pts} points)` }] };
  } catch (err: any) {
    return { content: [{ type: 'text', text: `Error: ${err.message}` }], isError: true };
  }
}

// ---- Gradient Tools ----

export function handleReadGradient(
  projectRoot: string,
  args: { path: string }
): ToolResult {
  try {
    const absPath = resolveProjectPath(projectRoot, args.path);
    const { content } = readTextFile(absPath);
    const doc = parseResource(content);

    const lines: string[] = [];
    lines.push(`Gradient: ${doc.header.type}`);
    lines.push(`File: ${args.path}`);
    lines.push('');

    const offsets: { offset: string; color: string }[] = [];
    for (const [key, val] of Object.entries(doc.resource)) {
      const m = key.match(/offsets\/Pack.*?Array\((.*?)\)/);
      const cm = key.match(/colors\/Pack.*?Array\((.*?)\)/);
      if (!m && !cm) {
        lines.push(`  ${key} = ${val}`);
      }
    }

    // Parse gradient colors
    for (const [key, val] of Object.entries(doc.resource)) {
      if (key.startsWith('offsets')) {
        const vals = val.match(/[\d.]+/g) || [];
        vals.forEach((v, i) => {
          if (!offsets[i]) offsets[i] = { offset: '', color: '' };
          offsets[i].offset = v;
        });
      }
      if (key.startsWith('colors')) {
        const matches = val.match(/Color\(([^)]+)\)/g) || [];
        matches.forEach((c, i) => {
          if (!offsets[i]) offsets[i] = { offset: '', color: '' };
          offsets[i].color = c;
        });
      }
    }

    if (offsets.length > 0) {
      lines.push(`\nColor Stops (${offsets.length}):`);
      offsets.forEach((s, i) => {
        lines.push(`  ${i}: offset=${s.offset}  ${s.color}`);
      });
    }

    return { content: [{ type: 'text', text: lines.join('\n') }] };
  } catch (err: any) {
    return { content: [{ type: 'text', text: `Error: ${err.message}` }], isError: true };
  }
}

export function handleCreateGradient(
  projectRoot: string,
  args: { path: string; colors?: Record<string, string>[]; interpolation_mode?: string }
): ToolResult {
  try {
    let content = '[gd_resource type="Gradient" format=3 uid=""]\n\n[resource]\n';

    if (args.colors && args.colors.length > 0) {
      const offsets: number[] = [];
      const colorVals: string[] = [];
      args.colors.forEach(c => {
        offsets.push(parseFloat(c.offset || '0'));
        colorVals.push(c.color || 'Color(1, 1, 1, 1)');
      });
      content += `offsets = PackedFloat32Array(${offsets.join(', ')})\n`;
      content += `colors = PackedColorArray(${colorVals.join(', ')})\n`;
    } else {
      content += `offsets = PackedFloat32Array(0, 1)\n`;
      content += `colors = PackedColorArray(Color(0, 0, 0, 1), Color(1, 1, 1, 1))\n`;
    }

    if (args.interpolation_mode) {
      const modes: Record<string, number> = { linear: 0, constant: 1, cubic: 2 };
      content += `interpolation_mode = ${modes[args.interpolation_mode] || 0}\n`;
    }

    const absPath = resolveProjectPath(projectRoot, args.path);
    writeTextFile(absPath, content, false);

    return { content: [{ type: 'text', text: `Gradient created: ${args.path}` }] };
  } catch (err: any) {
    return { content: [{ type: 'text', text: `Error: ${err.message}` }], isError: true };
  }
}

// ---- Path Tools ----

export function handleListPaths(
  projectRoot: string,
  args: { scene_path?: string }
): ToolResult {
  try {
    const sceneFiles = args.scene_path
      ? [args.scene_path]
      : findFilesByExtension(projectRoot, ['.tscn']);

    const paths: { scene: string; name: string; type: string; pointCount: string }[] = [];

    for (const relPath of sceneFiles) {
      const absPath = resolveProjectPath(projectRoot, relPath);
      const { content } = readTextFile(absPath);
      const doc = parseScene(content);

      for (const node of walkNodes(doc.nodes, ['Path2D', 'Path3D'])) {
        const curve = node.properties['curve'] || '';
        const pts = curve.match(/points/) ? 'has curve' : 'no curve';
        paths.push({ scene: relPath, name: node.name, type: node.type, pointCount: pts });
      }
    }

    if (paths.length === 0) {
      return { content: [{ type: 'text', text: 'No Path2D/Path3D nodes found.' }] };
    }

    const lines: string[] = [`Paths (${paths.length}):`, ''];
    paths.forEach(p => lines.push(`  ${p.scene} → ${p.name} (${p.type}) [${p.pointCount}]`));

    return { content: [{ type: 'text', text: lines.join('\n') }] };
  } catch (err: any) {
    return { content: [{ type: 'text', text: `Error: ${err.message}` }], isError: true };
  }
}

export function handleReadPath(
  projectRoot: string,
  args: { scene_path: string; name?: string }
): ToolResult {
  try {
    const absPath = resolveProjectPath(projectRoot, args.scene_path);
    const { content } = readTextFile(absPath);
    const doc = parseScene(content);

    const paths = walkNodes(doc.nodes, ['Path2D', 'Path3D']);
    const target = args.name ? paths.find(p => p.name === args.name) : paths[0];

    if (!target) {
      return { content: [{ type: 'text', text: `No Path found in ${args.scene_path}` }] };
    }

    const lines: string[] = [];
    lines.push(`Path: ${target.name} (${target.type})`);

    for (const [key, val] of Object.entries(target.properties)) {
      const label = key === 'curve' ? '  # Curve resource' : '';
      const valStr = String(val);
      const preview = valStr.length > 300 ? valStr.slice(0, 300) + '...' : valStr;
      lines.push(`  ${key} = ${preview}${label}`);
    }

    return { content: [{ type: 'text', text: lines.join('\n') }] };
  } catch (err: any) {
    return { content: [{ type: 'text', text: `Error: ${err.message}` }], isError: true };
  }
}

// ---- Skeleton Tools ----

export function handleListSkeletons(
  projectRoot: string,
  args: { scene_path?: string }
): ToolResult {
  try {
    const sceneFiles = args.scene_path
      ? [args.scene_path]
      : findFilesByExtension(projectRoot, ['.tscn']);

    const skeletons: { scene: string; name: string; boneCount: string }[] = [];

    for (const relPath of sceneFiles) {
      const absPath = resolveProjectPath(projectRoot, relPath);
      const { content } = readTextFile(absPath);
      const doc = parseScene(content);

      for (const node of walkNodes(doc.nodes, ['Skeleton3D', 'Skeleton2D'])) {
        const bones = countBones(node);
        skeletons.push({ scene: relPath, name: node.name, boneCount: String(bones) });
      }
    }

    if (skeletons.length === 0) {
      return { content: [{ type: 'text', text: 'No Skeleton nodes found.' }] };
    }

    const lines: string[] = [`Skeletons (${skeletons.length}):`, ''];
    skeletons.forEach(s => lines.push(`  ${s.scene} → ${s.name} (${s.boneCount} bones)`));

    return { content: [{ type: 'text', text: lines.join('\n') }] };
  } catch (err: any) {
    return { content: [{ type: 'text', text: `Error: ${err.message}` }], isError: true };
  }
}

export function handleReadSkeleton(
  projectRoot: string,
  args: { scene_path: string; name?: string }
): ToolResult {
  try {
    const absPath = resolveProjectPath(projectRoot, args.scene_path);
    const { content } = readTextFile(absPath);
    const doc = parseScene(content);

    const skeletons = walkNodes(doc.nodes, ['Skeleton3D', 'Skeleton2D']);
    const target = args.name ? skeletons.find(s => s.name === args.name) : skeletons[0];

    if (!target) {
      return { content: [{ type: 'text', text: `No Skeleton found in ${args.scene_path}` }] };
    }

    const lines: string[] = [];
    lines.push(`Skeleton: ${target.name} (${target.type})`);

    const boneList = extractBones(target);
    lines.push(`\nBones (${boneList.length}):`);
    if (boneList.length > 30) {
      boneList.slice(0, 30).forEach(b => lines.push(`  ${b}`));
      lines.push(`  ... and ${boneList.length - 30} more`);
    } else {
      boneList.forEach(b => lines.push(`  ${b}`));
    }

    for (const [key, val] of Object.entries(target.properties)) {
      if (key.startsWith('bones/')) continue; // Skip individual bone properties
      lines.push(`  ${key} = ${val}`);
    }

    return { content: [{ type: 'text', text: lines.join('\n') }] };
  } catch (err: any) {
    return { content: [{ type: 'text', text: `Error: ${err.message}` }], isError: true };
  }
}

// ---- ReflectionProbe Tools ----

export function handleReadReflectionProbe(
  projectRoot: string,
  args: { scene_path?: string }
): ToolResult {
  try {
    const sceneFiles = args.scene_path
      ? [args.scene_path]
      : findFilesByExtension(projectRoot, ['.tscn']);

    const probes: { scene: string; name: string; type: string; size: string; update: string }[] = [];

    for (const relPath of sceneFiles) {
      const absPath = resolveProjectPath(projectRoot, relPath);
      const { content } = readTextFile(absPath);
      const doc = parseScene(content);

      for (const node of walkNodes(doc.nodes, ['ReflectionProbe', 'VoxelGI', 'LightmapGI'])) {
        probes.push({
          scene: relPath, name: node.name, type: node.type,
          size: node.properties['size'] || node.properties['extents'] || '?',
          update: node.properties['update_mode'] || 'auto',
        });
      }
    }

    if (probes.length === 0) {
      return { content: [{ type: 'text', text: 'No ReflectionProbe/VoxelGI/LightmapGI nodes found.' }] };
    }

    const lines: string[] = [`GI Probes (${probes.length}):`, ''];
    probes.forEach(p => lines.push(`  ${p.scene} → ${p.name} (${p.type})  size=${p.size}`));

    return { content: [{ type: 'text', text: lines.join('\n') }] };
  } catch (err: any) {
    return { content: [{ type: 'text', text: `Error: ${err.message}` }], isError: true };
  }
}

// ---- MultiMesh ----

export function handleReadMultiMesh(
  projectRoot: string,
  args: { scene_path?: string }
): ToolResult {
  try {
    const sceneFiles = args.scene_path
      ? [args.scene_path]
      : findFilesByExtension(projectRoot, ['.tscn']);

    const multis: { scene: string; name: string; type: string; count: string }[] = [];

    for (const relPath of sceneFiles) {
      const absPath = resolveProjectPath(projectRoot, relPath);
      const { content } = readTextFile(absPath);
      const doc = parseScene(content);

      for (const node of walkNodes(doc.nodes, ['MultiMeshInstance3D', 'MultiMeshInstance2D'])) {
        multis.push({
          scene: relPath, name: node.name, type: node.type,
          count: node.properties['multimesh'] ? 'has mesh' : 'no mesh',
        });
      }
    }

    if (multis.length === 0) {
      return { content: [{ type: 'text', text: 'No MultiMeshInstance nodes found.' }] };
    }

    const lines: string[] = [`MultiMesh Instances (${multis.length}):`, ''];
    multis.forEach(m => lines.push(`  ${m.scene} → ${m.name} (${m.type}) [${m.count}]`));

    return { content: [{ type: 'text', text: lines.join('\n') }] };
  } catch (err: any) {
    return { content: [{ type: 'text', text: `Error: ${err.message}` }], isError: true };
  }
}

// ---- NoiseTexture ----

export function handleCreateNoiseTexture(
  projectRoot: string,
  args: { path: string; width?: number; height?: number; seamless?: boolean; noise_type?: string }
): ToolResult {
  try {
    const noiseTypes: Record<string, number> = { simplex: 0, cellular: 1, perlin: 2, value: 3 };
    const template = `[gd_resource type="NoiseTexture2D" format=3 uid=""]

[resource]
width = ${args.width ?? 256}
height = ${args.height ?? 256}
seamless = ${args.seamless ?? false}
noise = SubResource("FastNoiseLite_resource")

[sub_resource type="FastNoiseLite" id="FastNoiseLite_resource"]
noise_type = ${noiseTypes[args.noise_type || 'simplex'] || 0}
`;

    const absPath = resolveProjectPath(projectRoot, args.path);
    writeTextFile(absPath, template, false);

    return { content: [{ type: 'text', text: `NoiseTexture2D created: ${args.path} (${args.width}x${args.height}, ${args.noise_type || 'simplex'})` }] };
  } catch (err: any) {
    return { content: [{ type: 'text', text: `Error: ${err.message}` }], isError: true };
  }
}

// ---- Internal Helpers ----

function curvePropLabel(key: string): string {
  const labels: Record<string, string> = {
    bake_resolution: 'Bake resolution (points)',
    _data: 'Raw curve data',
    min_value: 'Minimum output value',
    max_value: 'Maximum output value',
  };
  return labels[key] || '';
}

function countBones(node: any): number {
  let count = 0;
  for (const key of Object.keys(node.properties)) {
    if (key.startsWith('bones/') && key.endsWith('/name')) count++;
  }
  return count || 0;
}

function extractBones(node: any): string[] {
  const bones: { idx: number; name: string; parent: string }[] = [];
  for (const [key, val] of Object.entries(node.properties)) {
    const m = key.match(/^bones\/(\d+)\/(name|parent)$/);
    if (m) {
      const idx = parseInt(m[1], 10);
      const field = m[2];
      const existing = bones.find(b => b.idx === idx);
      if (existing) {
        if (field === 'name') existing.name = String(val);
        else existing.parent = String(val);
      } else {
        bones.push({ idx, name: field === 'name' ? String(val) : '', parent: field === 'parent' ? String(val) : '' });
      }
    }
  }
  bones.sort((a, b) => a.idx - b.idx);
  return bones.map(b => `  bone_${b.idx}: ${b.name}  parent=${b.parent}`);
}
