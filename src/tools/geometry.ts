// Copyright (c) 2026 FairYan
// SPDX-License-Identifier: MIT
// ============================================================
// Godot MCP Server - 2D Geometry Tools
// ============================================================

import { z } from 'zod';
import { toolError, ErrorCode } from '../utils/errors.js';
import { ToolResult } from '../utils/types.js';
import { resolveProjectPath, readTextFile, writeTextFile } from '../utils/file_utils.js';
import { parseScene, serializeScene } from '../parsers/scene_parser.js';

// ---- Tool Schemas ----

export const createCollisionPolygonSchema = {
  scene_path: z.string().describe('Path to .tscn scene file'),
  parent_path: z.string().optional().default('.').describe('Parent node path (usually a StaticBody2D or Area2D)'),
  name: z.string().optional().default('CollisionPolygon2D').describe('Node name'),
  points: z.array(z.array(z.number())).describe('Array of [x, y] points (e.g. [[0,0], [100,0], [100,50], [0,50]])'),
};

export const setShapePointsSchema = {
  scene_path: z.string().describe('Path to .tscn scene file'),
  node_path: z.string().describe('Node path to CollisionShape2D or CollisionPolygon2D'),
  shape_type: z.enum(['RectangleShape2D', 'CircleShape2D', 'CapsuleShape2D', 'SegmentShape2D', 'ConcavePolygonShape2D', 'ConvexPolygonShape2D']).optional().describe('Shape type (for CollisionShape2D)'),
  points: z.array(z.array(z.number())).optional().describe('Points for polygon shapes'),
  radius: z.number().optional().describe('Radius for circle/capsule shapes'),
  extents: z.array(z.number()).optional().describe('[width, height] for rectangle shapes'),
};

// ---- Tool Handlers ----

export function handleCreateCollisionPolygon(
  projectRoot: string,
  args: { scene_path: string; parent_path?: string; name?: string; points: number[][] }
): ToolResult {
  try {
    const absPath = resolveProjectPath(projectRoot, args.scene_path);
    const { content } = readTextFile(absPath);
    const doc = parseScene(content);

    const pointStr = args.points
      .map(p => `Vector2(${p[0]}, ${p[1]})`)
      .join(', ');

    const newNode: any = {
      name: args.name || 'CollisionPolygon2D',
      type: 'CollisionPolygon2D',
      parent: args.parent_path || '.',
      properties: {
        'polygon': `PackedVector2Array(${pointStr})`,
      },
      children: [],
    };

    // Add to parent
    if (!args.parent_path || args.parent_path === '.') {
      doc.nodes.push(newNode);
    } else {
      function findAndAdd(nodes: any[], targetPath: string): boolean {
        for (const node of nodes) {
          if (node.name === targetPath) {
            node.children.push(newNode);
            return true;
          }
          if (node.children && findAndAdd(node.children, targetPath)) return true;
        }
        return false;
      }
      if (!findAndAdd(doc.nodes, args.parent_path)) {
        doc.nodes.push(newNode);
      }
    }

    const newContent = serializeScene(doc);
    writeTextFile(absPath, newContent, true);

    return { content: [{ type: 'text', text: `CollisionPolygon2D created: ${newNode.name} (${args.points.length} points)` }] };
  } catch (err: any) {
    return toolError(ErrorCode.INTERNAL_ERROR, `Error: ${err.message}`);
  }
}

export function handleSetShapePoints(
  projectRoot: string,
  args: { scene_path: string; node_path: string; shape_type?: string; points?: number[][]; radius?: number; extents?: number[] }
): ToolResult {
  try {
    const absPath = resolveProjectPath(projectRoot, args.scene_path);
    const { content } = readTextFile(absPath);
    const doc = parseScene(content);

    // Find the node
    function findNode(nodes: any[], pathParts: string[], idx: number): any | null {
      if (idx >= pathParts.length) return null;
      const target = pathParts[idx];
      for (const node of nodes) {
        if (node.name === target) {
          if (idx === pathParts.length - 1) return node;
          if (node.children) return findNode(node.children, pathParts, idx + 1);
        }
      }
      return null;
    }

    const pathParts = args.node_path.split('/').filter(Boolean);
    // Handle root path like "Main/Body/CollisionShape2D"
    // First part might be root node, skip if needed
    const startIdx = pathParts.length > 1 ? 1 : 0;

    const node = findNode(doc.nodes, pathParts, 0);
    if (!node) {
    return toolError(ErrorCode.FILE_NOT_FOUND, `Node "${args.node_path}" not found`);
    }

    if (args.shape_type) {
      // For CollisionShape2D — set shape type and parameters
      const shapeType = args.shape_type;
      node.properties['shape'] = `SubResource("${shapeType}_shape")`;

      // Add or update sub_resource
      const subId = `${shapeType}_shape`;
      const existingSub = doc.subResources.find(s => s.id === subId);

      if (args.points && (shapeType.includes('Polygon'))) {
        const pointStr = args.points.map(p => `Vector2(${p[0]}, ${p[1]})`).join(', ');
        const propKey = shapeType.includes('Concave') ? 'segments' : 'points';
        if (existingSub) {
          existingSub.properties[propKey] = `PackedVector2Array(${pointStr})`;
        } else {
          doc.subResources.push({
            type: shapeType,
            id: subId,
            properties: { [propKey]: `PackedVector2Array(${pointStr})` },
          });
        }
      }

      if (args.radius && (shapeType.includes('Circle') || shapeType.includes('Capsule'))) {
        if (existingSub) {
          existingSub.properties['radius'] = String(args.radius);
        } else {
          doc.subResources.push({
            type: shapeType,
            id: subId,
            properties: { 'radius': String(args.radius) },
          });
        }
      }

      if (args.extents && shapeType.includes('Rectangle')) {
        const extStr = `Vector2(${args.extents[0]}, ${args.extents[1]})`;
        if (existingSub) {
          existingSub.properties['size'] = extStr;
        } else {
          doc.subResources.push({
            type: shapeType,
            id: subId,
            properties: { 'size': extStr },
          });
        }
      }
    } else if (args.points && node.type === 'CollisionPolygon2D') {
      // Direct polygon point update
      const pointStr = args.points.map(p => `Vector2(${p[0]}, ${p[1]})`).join(', ');
      node.properties['polygon'] = `PackedVector2Array(${pointStr})`;
    }

    const newContent = serializeScene(doc);
    writeTextFile(absPath, newContent, true);

    return { content: [{ type: 'text', text: `Shape updated: ${args.node_path}` }] };
  } catch (err: any) {
    return toolError(ErrorCode.INTERNAL_ERROR, `Error: ${err.message}`);
  }
}

// ---- Additional geometry tools (Tier1) ----

export const readCollisionPolygonSchema = {
  scene_path: z.string().describe('Path to .tscn scene file'),
  node_path: z.string().optional().describe('Specific CollisionPolygon2D node path (defaults to all)'),
};

export const simplifyPolygonSchema = {
  points: z.array(z.array(z.number())).describe('Array of [x, y] points to simplify'),
  tolerance: z.number().optional().default(1.0).describe('Douglas-Peucker tolerance (higher = more aggressive)'),
};

function parsePackedVector2Array(text: string): number[][] {
  const inner = text.replace(/^PackedVector2Array\(/, '').replace(/\)$/, '');
  const nums = inner.split(',').map(s => parseFloat(s.trim())).filter(n => !isNaN(n));
  const pts: number[][] = [];
  for (let i = 0; i + 1 < nums.length; i += 2) pts.push([nums[i], nums[i + 1]]);
  return pts;
}

export function handleReadCollisionPolygon(
  projectRoot: string,
  args: { scene_path: string; node_path?: string }
): ToolResult {
  try {
    const absPath = resolveProjectPath(projectRoot, args.scene_path);
    const { content } = readTextFile(absPath);
    const doc = parseScene(content);

    const found: { name: string; type: string; points: number[][] }[] = [];
    function walk(nodes: any[]): void {
      for (const node of nodes) {
        if (node.type === 'CollisionPolygon2D') {
          const prop = node.properties['polygon'] || '';
          const pts = prop.includes('PackedVector2Array') ? parsePackedVector2Array(prop) : [];
          if (!args.node_path || node.name === args.node_path || args.node_path.endsWith('/' + node.name)) {
            found.push({ name: node.name, type: node.type, points: pts });
          }
        }
        if (node.children) walk(node.children);
      }
    }
    walk(doc.nodes);

    if (found.length === 0) {
      return { content: [{ type: 'text', text: `No CollisionPolygon2D nodes found${args.node_path ? ` matching "${args.node_path}"` : ''}.` }] };
    }

    const lines: string[] = [`CollisionPolygon2D nodes (${found.length}):`, ''];
    for (const f of found) {
      lines.push(`  ${f.name} (${f.points.length} points):`);
      f.points.forEach((p, i) => lines.push(`    [${i}] (${p[0]}, ${p[1]})`));
      lines.push('');
    }
    return { content: [{ type: 'text', text: lines.join('\n') }] };
  } catch (err: any) {
    return toolError(ErrorCode.INTERNAL_ERROR, `Error: ${err.message}`);
  }
}

export function handleSimplifyPolygon(
  projectRoot: string,
  args: { points: number[][]; tolerance?: number }
): ToolResult {
  try {
    if (!args.points || args.points.length < 3) {
      return toolError(ErrorCode.INVALID_ARGUMENT, 'Provide at least 3 points.');
    }
    const eps = args.tolerance ?? 1.0;
    const simplified = douglasPeucker(args.points, eps);
    return {
      content: [{ type: 'text', text: `Simplified ${args.points.length} → ${simplified.length} points (tolerance ${eps}).\n\n${JSON.stringify(simplified)}` }],
    };
  } catch (err: any) {
    return toolError(ErrorCode.INTERNAL_ERROR, `Error: ${err.message}`);
  }
}

// ---- Douglas-Peucker polygon simplification ----

function perpDistance(p: number[], a: number[], b: number[]): number {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const mag = Math.sqrt(dx * dx + dy * dy);
  if (mag === 0) return Math.hypot(p[0] - a[0], p[1] - a[1]);
  return Math.abs((p[0] - a[0]) * dy - (p[1] - a[1]) * dx) / mag;
}

function douglasPeucker(points: number[][], epsilon: number): number[][] {
  if (points.length < 3) return points.slice();
  let maxDist = 0;
  let index = 0;
  const end = points.length - 1;
  for (let i = 1; i < end; i++) {
    const d = perpDistance(points[i], points[0], points[end]);
    if (d > maxDist) { maxDist = d; index = i; }
  }
  if (maxDist > epsilon) {
    const left = douglasPeucker(points.slice(0, index + 1), epsilon);
    const right = douglasPeucker(points.slice(index), epsilon);
    return left.slice(0, -1).concat(right);
  }
  return [points[0], points[end]];
}
