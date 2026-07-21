// Copyright (c) 2026 FairYan
// SPDX-License-Identifier: MIT
// ============================================================
// Godot MCP Server — Mesh Primitives
// ============================================================
// Create 3D mesh resource files (.tres): Box, Capsule, Cylinder,
// Plane, Prism, Sphere, Torus, Quad, Text, RibbonTrail, TubeTrail.

import { z } from 'zod';
import { ToolResult } from '../utils/types.js';
import { resolveProjectPath, writeTextFile } from '../utils/file_utils.js';

// ---- Schema ----

export const createMeshPrimitiveSchema = {
  path: z.string().describe('Output path for mesh .tres'),
  mesh_type: z.enum(['BoxMesh', 'CapsuleMesh', 'CylinderMesh', 'PlaneMesh', 'PrismMesh', 'SphereMesh', 'TorusMesh', 'QuadMesh', 'TextMesh', 'RibbonTrailMesh', 'TubeTrailMesh']),
  params: z.record(z.string()).optional().describe('Override default size params'),
};

// ---- Defaults ----

const MESH_DEFAULTS: Record<string, Record<string, string>> = {
  BoxMesh: { size: 'Vector3(1, 1, 1)' },
  CapsuleMesh: { radius: '0.5', height: '2.0', radial_segments: '64', rings: '8' },
  CylinderMesh: { top_radius: '0.5', bottom_radius: '0.5', height: '2.0', radial_segments: '64', rings: '4' },
  PlaneMesh: { size: 'Vector2(1, 1)', subdivide_width: '0', subdivide_depth: '0' },
  PrismMesh: { left_to_right: '1.0', size: 'Vector3(1, 1, 1)', subdivision: '0' },
  SphereMesh: { radius: '1.0', height: '2.0', radial_segments: '64', rings: '32' },
  TorusMesh: { inner_radius: '0.5', outer_radius: '1.0', ring_segments: '64', tube_segments: '32' },
  QuadMesh: { size: 'Vector2(1, 1)' },
  TextMesh: { text: '"Hello"', font_size: '16', horizontal_alignment: '0' },
  RibbonTrailMesh: { size: '0.5', sections: '5', section_length: '0.5', section_segments: '3', curve: 'null' },
  TubeTrailMesh: { radius: '0.2', radial_steps: '8', sections: '5', section_length: '0.5', section_rings: '3', curve: 'null' },
};

// ---- Handler ----

export function handleCreateMeshPrimitive(
  projectRoot: string,
  args: { path: string; mesh_type: string; params?: Record<string, string> }
): ToolResult {
  try {
    const defaults = MESH_DEFAULTS[args.mesh_type];
    if (!defaults) return { content: [{ type: 'text', text: `Unknown mesh: ${args.mesh_type}. Valid: ${Object.keys(MESH_DEFAULTS).join(', ')}` }], isError: true };

    const props = { ...defaults, ...(args.params || {}) };
    let content = `[gd_resource type="${args.mesh_type}" format=3 uid=""]\n\n[resource]\n`;
    for (const [k, v] of Object.entries(props)) content += `${k} = ${v}\n`;

    const absPath = resolveProjectPath(projectRoot, args.path);
    writeTextFile(absPath, content, false);
    return { content: [{ type: 'text', text: `Mesh created: ${args.path} (${args.mesh_type})` }] };
  } catch (err: any) {
    return { content: [{ type: 'text', text: `Error: ${err.message}` }], isError: true };
  }
}
