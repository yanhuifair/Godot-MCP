// ============================================================
// Godot MCP Server - Physics Joint Tools
// ============================================================

import { z } from 'zod';
import { ToolResult } from '../utils/types.js';
import { resolveProjectPath, readTextFile, writeTextFile, findFilesByExtension } from '../utils/file_utils.js';
import { parseScene, serializeScene } from '../parsers/scene_parser.js';

// ---- Tool Schemas ----

export const createJointSchema = {
  scene_path: z.string().describe('Path to .tscn scene file'),
  joint_type: z.enum(['PinJoint2D', 'GrooveJoint2D', 'DampedSpringJoint2D', 'PinJoint3D', 'HingeJoint3D', 'SliderJoint3D', 'ConeTwistJoint3D', 'Generic6DOFJoint3D']).describe('Joint type'),
  parent_path: z.string().optional().default('.').describe('Parent node path'),
  name: z.string().min(1).describe('Joint node name'),
  node_a: z.string().optional().describe('Node A path (first connected body)'),
  node_b: z.string().optional().describe('Node B path (second connected body)'),
};

export const setJointParamSchema = {
  scene_path: z.string().describe('Path to .tscn scene file'),
  joint_name: z.string().describe('Joint node name'),
  param: z.string().describe('Parameter name (e.g. "bias", "angular_limit/lower", "motor/enable")'),
  value: z.string().describe('New value'),
};

export const listJointsSchema = {
  scene_path: z.string().optional().describe('Filter to a specific scene'),
  joint_type: z.string().optional().describe('Filter by joint type'),
};

// ---- Joint type helpers ----

const JOINT_TYPES_2D = ['PinJoint2D', 'GrooveJoint2D', 'DampedSpringJoint2D'];
const JOINT_TYPES_3D = ['PinJoint3D', 'HingeJoint3D', 'SliderJoint3D', 'ConeTwistJoint3D', 'Generic6DOFJoint3D'];
const ALL_JOINT_TYPES = [...JOINT_TYPES_2D, ...JOINT_TYPES_3D];

// ---- Tool Handlers ----

export function handleCreateJoint(
  projectRoot: string,
  args: { scene_path: string; joint_type: string; parent_path?: string; name: string; node_a?: string; node_b?: string }
): ToolResult {
  try {
    const absPath = resolveProjectPath(projectRoot, args.scene_path);
    const { content } = readTextFile(absPath);
    const doc = parseScene(content);

    // Build the joint node
    const newNode: any = {
      name: args.name,
      type: args.joint_type,
      parent: args.parent_path || '.',
      properties: {},
      children: [],
    };

    if (args.node_a) newNode.properties['node_a'] = `NodePath("${args.node_a}")`;
    if (args.node_b) newNode.properties['node_b'] = `NodePath("${args.node_b}")`;

    // Add default properties based on joint type
    if (args.joint_type === 'HingeJoint3D') {
      newNode.properties['angular_limit__enabled'] = 'false';
      newNode.properties['angular_limit/lower'] = '-45.0';
      newNode.properties['angular_limit/upper'] = '45.0';
      newNode.properties['motor/enable'] = 'false';
      newNode.properties['motor/target_velocity'] = '0.0';
      newNode.properties['motor/max_impulse'] = '1.0';
    } else if (args.joint_type === 'SliderJoint3D') {
      newNode.properties['linear_limit/upper_distance'] = '1.0';
      newNode.properties['linear_limit/lower_distance'] = '-1.0';
    } else if (args.joint_type === 'DampedSpringJoint2D') {
      newNode.properties['length'] = '50.0';
      newNode.properties['rest_length'] = '50.0';
      newNode.properties['stiffness'] = '20.0';
      newNode.properties['damping'] = '1.0';
    } else if (args.joint_type === 'PinJoint2D') {
      newNode.properties['bias'] = '0.0';
    }

    // Add to parent
    if (!args.parent_path || args.parent_path === '.') {
      doc.nodes.push(newNode);
    } else {
      // Find parent and add as child
      function findAndAdd(nodes: any[], targetPath: string): boolean {
        for (const node of nodes) {
          if (node.name === targetPath || (node.children && findAndAdd(node.children, targetPath))) {
            if (node.name === targetPath) node.children.push(newNode);
            return true;
          }
        }
        return false;
      }
      if (!findAndAdd(doc.nodes, args.parent_path)) {
        doc.nodes.push(newNode);
      }
    }

    const newContent = serializeScene(doc);
    writeTextFile(absPath, newContent, true);

    const connections = [args.node_a, args.node_b].filter(Boolean).join(' ↔ ');
    return { content: [{ type: 'text', text: `Joint created: ${args.name} (${args.joint_type})${connections ? ` ${connections}` : ''}` }] };
  } catch (err: any) {
    return { content: [{ type: 'text', text: `Error: ${err.message}` }], isError: true };
  }
}

export function handleSetJointParam(
  projectRoot: string,
  args: { scene_path: string; joint_name: string; param: string; value: string }
): ToolResult {
  try {
    const absPath = resolveProjectPath(projectRoot, args.scene_path);
    const { content } = readTextFile(absPath);
    const doc = parseScene(content);

    function findNode(nodes: any[], name: string): any | null {
      for (const node of nodes) {
        if (node.name === name && ALL_JOINT_TYPES.includes(node.type)) return node;
        if (node.children) {
          const found = findNode(node.children, name);
          if (found) return found;
        }
      }
      return null;
    }

    const joint = findNode(doc.nodes, args.joint_name);
    if (!joint) {
      return { content: [{ type: 'text', text: `Joint "${args.joint_name}" not found in ${args.scene_path}` }], isError: true };
    }

    joint.properties[args.param] = args.value;

    const newContent = serializeScene(doc);
    writeTextFile(absPath, newContent, true);

    return { content: [{ type: 'text', text: `Joint "${args.joint_name}" updated: ${args.param} = ${args.value}` }] };
  } catch (err: any) {
    return { content: [{ type: 'text', text: `Error: ${err.message}` }], isError: true };
  }
}

export function handleListJoints(
  projectRoot: string,
  args: { scene_path?: string; joint_type?: string }
): ToolResult {
  try {
    const sceneFiles = args.scene_path
      ? [args.scene_path]
      : findFilesByExtension(projectRoot, ['.tscn']);

    const targetTypes = args.joint_type
      ? [args.joint_type]
      : ALL_JOINT_TYPES;

    const joints: { scene: string; name: string; type: string; connections: string }[] = [];

    for (const relPath of sceneFiles) {
      const absPath = resolveProjectPath(projectRoot, relPath);
      const { content } = readTextFile(absPath);
      const doc = parseScene(content);

      function walk(nodes: any[]): void {
        for (const node of nodes) {
          if (targetTypes.includes(node.type)) {
            const a = node.properties['node_a'] || '';
            const b = node.properties['node_b'] || '';
            const conn = [a, b].filter(Boolean).join(' ↔ ') || 'no connections';
            joints.push({ scene: relPath, name: node.name, type: node.type, connections: conn });
          }
          if (node.children) walk(node.children);
        }
      }
      walk(doc.nodes);
    }

    if (joints.length === 0) {
      return { content: [{ type: 'text', text: 'No joint nodes found.' }] };
    }

    const byType: Record<string, typeof joints> = {};
    for (const j of joints) {
      (byType[j.type] ||= []).push(j);
    }

    const lines: string[] = [`Joints (${joints.length}):`, ''];
    for (const [type, items] of Object.entries(byType).sort()) {
      lines.push(`  ${type} (${items.length}):`);
      items.forEach(j => lines.push(`    ${j.scene} → ${j.name}  [${j.connections}]`));
    }

    return { content: [{ type: 'text', text: lines.join('\n') }] };
  } catch (err: any) {
    return { content: [{ type: 'text', text: `Error: ${err.message}` }], isError: true };
  }
}
