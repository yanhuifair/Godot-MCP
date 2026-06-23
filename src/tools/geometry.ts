// ============================================================
// Godot MCP Server - 2D Geometry Tools
// ============================================================

import { z } from 'zod';
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
    return { content: [{ type: 'text', text: `Error: ${err.message}` }], isError: true };
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
      return { content: [{ type: 'text', text: `Node "${args.node_path}" not found` }], isError: true };
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
    return { content: [{ type: 'text', text: `Error: ${err.message}` }], isError: true };
  }
}
