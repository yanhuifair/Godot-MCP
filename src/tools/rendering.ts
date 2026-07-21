// Copyright (c) 2026 FairYan
// SPDX-License-Identifier: MIT
// ============================================================
// Godot MCP Server - Mesh, Viewport & Rendering Tools
// ============================================================

import { z } from 'zod';
import { ToolResult } from '../utils/types.js';
import { readTextFile, resolveProjectPath, findFilesByExtension, writeTextFile } from '../utils/file_utils.js';
import { parseScene, serializeScene } from '../parsers/scene_parser.js';

// ---- Schemas ----

export const readMeshInstanceSchema = {
  scene_path: z.string().describe('Path to .tscn scene'),
  node_name: z.string().optional().describe('MeshInstance node name (default: first found)'),
};

export const setMeshSurfaceMaterialSchema = {
  scene_path: z.string().describe('Path to .tscn scene'),
  node_name: z.string().describe('MeshInstance node name'),
  surface_index: z.number().optional().default(0).describe('Surface index'),
  material_path: z.string().describe('Path to material .tres file'),
};

export const readViewportSchema = {
  scene_path: z.string().describe('Path to .tscn scene'),
  node_name: z.string().optional().describe('Viewport/SubViewport node name'),
};

export const readAreaSchema = {
  scene_path: z.string().describe('Path to .tscn scene'),
  node_name: z.string().optional().describe('Area2D/3D node name'),
};

export const readRaycastSchema = {
  scene_path: z.string().optional().describe('Filter to scene'),
  ray_type: z.string().optional().describe('Filter: RayCast2D, RayCast3D, ShapeCast2D, ShapeCast3D'),
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

function findNodeByName(nodes: any[], name: string): any | null {
  for (const node of nodes) {
    if (node.name === name) return node;
    if (node.children) {
      const found = findNodeByName(node.children, name);
      if (found) return found;
    }
  }
  return null;
}

// ---- Mesh Tools ----

export function handleReadMeshInstance(
  projectRoot: string,
  args: { scene_path: string; node_name?: string }
): ToolResult {
  try {
    const absPath = resolveProjectPath(projectRoot, args.scene_path);
    const { content } = readTextFile(absPath);
    const doc = parseScene(content);

    const meshes = walkNodes(doc.nodes, ['MeshInstance3D', 'MeshInstance2D']);
    const target = args.node_name
      ? meshes.find(m => m.name === args.node_name)
      : meshes[0];

    if (!target) {
      return { content: [{ type: 'text', text: `No MeshInstance found in ${args.scene_path}` }] };
    }

    const lines: string[] = [];
    lines.push(`MeshInstance: ${target.name} (${target.type})`);

    const labels: Record<string, string> = {
      mesh: 'Mesh resource',
      skeleton: 'Skeleton path',
      'surface_material_override/0': 'Surface 0 material override',
      'surface_material_override/1': 'Surface 1 material override',
      'surface_material_override/2': 'Surface 2 material override',
      cast_shadow: 'Cast shadows',
      gi_mode: 'Global illumination mode',
      visibility_range_begin: 'Visibility range begin',
      visibility_range_end: 'Visibility range end',
      transparency: 'Transparency mode',
      material_override: 'Material override',
    };

    for (const [key, val] of Object.entries(target.properties)) {
      const label = labels[key] ? `  # ${labels[key]}` : '';
      lines.push(`  ${key} = ${val}${label}`);
    }

    return { content: [{ type: 'text', text: lines.join('\n') }] };
  } catch (err: any) {
    return { content: [{ type: 'text', text: `Error: ${err.message}` }], isError: true };
  }
}

export function handleSetMeshSurfaceMaterial(
  projectRoot: string,
  args: { scene_path: string; node_name: string; surface_index?: number; material_path: string }
): ToolResult {
  try {
    const absPath = resolveProjectPath(projectRoot, args.scene_path);
    const { content } = readTextFile(absPath);
    const doc = parseScene(content);

    const node = findNodeByName(doc.nodes, args.node_name);
    if (!node || !['MeshInstance3D', 'MeshInstance2D'].includes(node.type)) {
      return { content: [{ type: 'text', text: `MeshInstance "${args.node_name}" not found` }], isError: true };
    }

    // Add ExtResource for the material if not already present
    let materialId: string | null = null;
    for (const ext of doc.extResources) {
      if (ext.path === args.material_path) {
        materialId = ext.id;
        break;
      }
    }

    if (!materialId) {
      const nextId = doc.extResources.length + 1;
      materialId = `material_${nextId}`;
      doc.extResources.push({
        type: 'Material',
        path: args.material_path,
        id: materialId,
      });
    }

    const si = args.surface_index ?? 0;
    node.properties[`surface_material_override/${si}`] = `ExtResource("${materialId}")`;

    const newContent = serializeScene(doc);
    writeTextFile(absPath, newContent, true);

    return { content: [{ type: 'text', text: `Surface ${si} material set: ${args.material_path} on ${args.node_name}` }] };
  } catch (err: any) {
    return { content: [{ type: 'text', text: `Error: ${err.message}` }], isError: true };
  }
}

// ---- Viewport Tools ----

export function handleReadViewport(
  projectRoot: string,
  args: { scene_path: string; node_name?: string }
): ToolResult {
  try {
    const absPath = resolveProjectPath(projectRoot, args.scene_path);
    const { content } = readTextFile(absPath);
    const doc = parseScene(content);

    const viewports = walkNodes(doc.nodes, ['Viewport', 'SubViewport']);
    const target = args.node_name
      ? viewports.find(v => v.name === args.node_name)
      : viewports[0];

    if (!target) {
      return { content: [{ type: 'text', text: `No Viewport found in ${args.scene_path}` }] };
    }

    const lines: string[] = [];
    lines.push(`${target.type}: ${target.name}`);

    const labels: Record<string, string> = {
      size: 'Viewport resolution',
      'render_target/update_mode': 'Update mode (0=when visible, 1=always, 2=once)',
      'render_target/clear_mode': 'Clear mode (0=always, 1=never, 2=next frame)',
      transparent_bg: 'Transparent background',
      msaa: 'MSAA (2D: 0/2/4/8, 3D: 0/2/4/8)',
      'fsr_sharpness': 'FSR sharpness',
      'screen_space_aa': 'Screen space AA',
      'debug_draw': 'Debug draw',
      handle_input_locally: 'Handle input locally',
      gui_embed_subwindows: 'Embed subwindows',
      gui_snap_controls_to_pixels: 'Snap controls to pixels',
      world_3d: 'World3D resource',
      world_2d: 'World2D resource',
      own_world_3d: 'Own World3D',
      audio_listener_enable_3d: '3D Audio listener',
      audio_listener_enable_2d: '2D Audio listener',
      physics_object_picking: 'Physics object picking',
      physics_object_picking_sort: 'Pick sort',
      positional_shadow_atlas_size: 'Shadow atlas size',
      disable_3d: 'Disable 3D',
      usage: 'Usage (0-3)',
    };

    for (const [key, val] of Object.entries(target.properties)) {
      const label = labels[key] ? `  # ${labels[key]}` : '';
      lines.push(`  ${key} = ${val}${label}`);
    }

    return { content: [{ type: 'text', text: lines.join('\n') }] };
  } catch (err: any) {
    return { content: [{ type: 'text', text: `Error: ${err.message}` }], isError: true };
  }
}

// ---- Area Tools ----

export function handleReadArea(
  projectRoot: string,
  args: { scene_path: string; node_name?: string }
): ToolResult {
  try {
    const absPath = resolveProjectPath(projectRoot, args.scene_path);
    const { content } = readTextFile(absPath);
    const doc = parseScene(content);

    const areas = walkNodes(doc.nodes, ['Area2D', 'Area3D']);
    const target = args.node_name
      ? areas.find(a => a.name === args.node_name)
      : areas[0];

    if (!target) {
      return { content: [{ type: 'text', text: `No Area found in ${args.scene_path}` }] };
    }

    const lines: string[] = [];
    lines.push(`${target.type}: ${target.name}`);

    const is3D = target.type === 'Area3D';
    const labels: Record<string, string> = {
      monitoring: 'Enable monitoring (detect overlaps)',
      monitorable: 'Can be detected by other areas',
      collision_layer: 'Collision layer',
      collision_mask: 'Collision mask',
      priority: 'Overlap priority (higher = first)',
      gravity_enabled: 'Gravity enabled',
      gravity_point: 'Point gravity',
      gravity_direction: 'Gravity direction',
      gravity: 'Gravity strength (m/s²)',
      angular_damp: 'Angular damping override',
      linear_damp: 'Linear damping override',
      gravity_space_override: `Space override (0=disabled, 1=combine, 2=replace${is3D ? ', 3=replace combine' : ''})`,
      wind_force_magnitude: 'Wind force',
      wind_attenuation_factor: 'Wind attenuation',
      wind_source_path: 'Wind source path',
      audio_bus_override: 'Audio bus override',
      reverb_bus_enabled: 'Reverb bus',
      reverb_bus_amount: 'Reverb amount',
      reverb_bus_uniformity: 'Reverb uniformity',
    };

    for (const [key, val] of Object.entries(target.properties)) {
      const label = labels[key] ? `  # ${labels[key]}` : '';
      lines.push(`  ${key} = ${val}${label}`);
    }

    return { content: [{ type: 'text', text: lines.join('\n') }] };
  } catch (err: any) {
    return { content: [{ type: 'text', text: `Error: ${err.message}` }], isError: true };
  }
}

// ---- RayCast Tools ----

export function handleReadRaycast(
  projectRoot: string,
  args: { scene_path?: string; ray_type?: string }
): ToolResult {
  try {
    const rayTypes = ['RayCast2D', 'RayCast3D', 'ShapeCast2D', 'ShapeCast3D'];
    const targetTypes = args.ray_type ? [args.ray_type] : rayTypes;

    const sceneFiles = args.scene_path
      ? [args.scene_path]
      : findFilesByExtension(projectRoot, ['.tscn']);

    const rays: { scene: string; name: string; type: string; enabled: string; target: string }[] = [];

    for (const relPath of sceneFiles) {
      const absPath = resolveProjectPath(projectRoot, relPath);
      const { content } = readTextFile(absPath);
      const doc = parseScene(content);

      for (const node of walkNodes(doc.nodes, targetTypes)) {
        rays.push({
          scene: relPath, name: node.name, type: node.type,
          enabled: node.properties['enabled'] || 'true',
          target: node.properties['target_position'] || node.properties['target_position'] || '?',
        });
      }
    }

    if (rays.length === 0) {
      return { content: [{ type: 'text', text: 'No RayCast/ShapeCast nodes found.' }] };
    }

    const byType: Record<string, typeof rays> = {};
    for (const r of rays) (byType[r.type] ||= []).push(r);

    const lines: string[] = [`RayCasts (${rays.length}):`, ''];
    for (const [type, items] of Object.entries(byType).sort()) {
      lines.push(`  ${type} (${items.length}):`);
      items.forEach(r => {
        lines.push(`    ${r.scene} → ${r.name}  target=${r.target}  enabled=${r.enabled}`);
      });
    }

    return { content: [{ type: 'text', text: lines.join('\n') }] };
  } catch (err: any) {
    return { content: [{ type: 'text', text: `Error: ${err.message}` }], isError: true };
  }
}
