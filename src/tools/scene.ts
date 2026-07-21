// Copyright (c) 2026 FairYan
// SPDX-License-Identifier: MIT
// ============================================================
// Godot MCP Server - Scene Tools
// ============================================================

import { z } from 'zod';
import fs from 'node:fs';
import pathMod from 'node:path';
import { ToolResult, SceneOperation, SceneTemplateType } from '../utils/types.js';
import { readTextFile, writeTextFile, findFilesByExtension, findProjectRoot, resolveProjectPath } from '../utils/file_utils.js';
import { parseScene, serializeScene, generateSceneTemplate, editScene } from '../parsers/scene_parser.js';

// ---- Tool Schemas ----

export const readSceneSchema = {
  path: z.string().min(1).describe('Path to .tscn file (relative to project root)'),
};

export const createSceneSchema = {
  path: z.string().min(1).describe('Output path for new scene (relative to project root, e.g. "scenes/main.tscn")'),
  template: z.enum(['Node2D', 'Control', 'Node3D']).describe('Root node type template'),
  root_name: z.string().optional().describe('Custom root node name (default: derived from template)'),
};

export const editSceneSchema = {
  path: z.string().min(1).describe('Path to .tscn file to edit (relative to project root)'),
  operations: z.array(z.object({
    action: z.enum(['add_node', 'modify_node', 'remove_node', 'add_connection', 'remove_connection']),
    parent_path: z.string().optional(),
    node_path: z.string().optional(),
    name: z.string().optional(),
    type: z.string().optional(),
    properties: z.record(z.string()).optional(),
    groups: z.array(z.string()).optional(),
    new_name: z.string().optional(),
    signal: z.string().optional().describe('Signal name (for connection ops)'),
    from_node: z.string().optional().describe('Source node path (for connection ops)'),
    to_node: z.string().optional().describe('Target node path (for connection ops)'),
    method_name: z.string().optional().describe('Method name on target (for connection ops)'),
    flags: z.number().optional().describe('Connection flags'),
    unbinds: z.number().optional().describe('Number of unbinds'),
    clone_source: z.string().optional().describe('Source node path to clone (for clone_node action)'),
  })).min(1).describe('List of scene operations to apply'),
};

// Fine-grained node operations (recommended over edit_scene)
export const addNodeSchema = {
  scene_path: z.string().min(1).describe('Path to .tscn file'),
  parent_path: z.string().optional().default('.').describe('Parent node path (default: root level)'),
  name: z.string().min(1).describe('New node name'),
  type: z.string().min(1).describe('Node type (e.g. "CharacterBody2D", "Timer", "CollisionShape3D")'),
  properties: z.record(z.string()).optional().describe('Initial properties'),
  groups: z.array(z.string()).optional().describe('Initial groups'),
};

export const removeNodeSchema = {
  scene_path: z.string().min(1).describe('Path to .tscn file'),
  node_path: z.string().min(1).describe('Node path to remove (e.g. "Main/Enemy")'),
};

export const modifyNodeSchema = {
  scene_path: z.string().min(1).describe('Path to .tscn file'),
  node_path: z.string().min(1).describe('Node path to modify (e.g. "Player" or "Main/Enemy")'),
  properties: z.record(z.string()).optional().describe('Properties to set (key=value)'),
  new_name: z.string().optional().describe('New name (rename the node)'),
};

export const cloneNodeSchema = {
  scene_path: z.string().min(1).describe('Path to .tscn file'),
  clone_source: z.string().min(1).describe('Source node path to clone'),
  name: z.string().optional().describe('New name (default: "name_copy")'),
  parent_path: z.string().optional().describe('New parent (default: same as source)'),
};

export const connectSignalSchema = {
  scene_path: z.string().min(1).describe('Path to .tscn file'),
  signal: z.string().min(1).describe('Signal name (e.g. "body_entered", "pressed")'),
  from_node: z.string().min(1).describe('Source node path'),
  to_node: z.string().min(1).describe('Target node path'),
  method_name: z.string().min(1).describe('Method name on target (e.g. "_on_body_entered")'),
  flags: z.number().optional().describe('Connection flags'),
  unbinds: z.number().optional().describe('Number of unbinds'),
};

export const disconnectSignalSchema = {
  scene_path: z.string().min(1).describe('Path to .tscn file'),
  signal: z.string().min(1).describe('Signal name'),
  from_node: z.string().min(1).describe('Source node path'),
  to_node: z.string().min(1).describe('Target node path'),
  method_name: z.string().min(1).describe('Method name on target'),
};

// Fine-grained transform operations
export const setNodePositionSchema = {
  scene_path: z.string().min(1).describe('Path to .tscn file'),
  node_path: z.string().min(1).describe('Node path'),
  value: z.string().min(1).describe('Position: "x,y" for 2D, "x,y,z" for 3D, or "Vector2/3(...)"'),
};

export const setNodeRotationSchema = {
  scene_path: z.string().min(1).describe('Path to .tscn file'),
  node_path: z.string().min(1).describe('Node path'),
  value: z.string().min(1).describe('Rotation: float for 2D (e.g. "1.57"), "x,y,z" or "Vector3" for 3D'),
};

export const setNodeScaleSchema = {
  scene_path: z.string().min(1).describe('Path to .tscn file'),
  node_path: z.string().min(1).describe('Node path'),
  value: z.string().min(1).describe('Scale: "x,y" for 2D, "x,y,z" for 3D, or "Vector2/3(...)"'),
};

export const listScenesSchema = {
  path: z.string().optional().default('').describe('Subdirectory to search (default: root)'),
  recursive: z.boolean().optional().default(true).describe('Search recursively (default: true)'),
};

export const sceneDependencyGraphSchema = {};

export const listUiNodesSchema = {
  node_type: z.string().optional().describe('Filter by specific Control type (e.g. "Button", "Label"). Default: all Control-derived nodes.'),
  max_results: z.number().optional().default(100).describe('Max results'),
};

export const transformNodeSchema = {
  scene_path: z.string().min(1).describe('Path to .tscn file (relative to project root)'),
  node_path: z.string().min(1).describe('Node path (e.g. "Player" or "Main/Player")'),
  position: z.string().optional().describe('2D: "Vector2(100,200)" or shorthand "100,200"  |  3D: "Vector3(0,5,0)" or shorthand "0,5,0"'),
  rotation: z.string().optional().describe('2D: float radians e.g. "1.57"  |  3D: "Vector3(0,1.57,0)" or shorthand "0,1.57,0"'),
  scale: z.string().optional().describe('2D: "Vector2(2,2)" or "2,2"  |  3D: "Vector3(1,1,1)" or "1,1,1"'),
};

export const renameNodeSchema = {
  scene_path: z.string().min(1).describe('Path to .tscn file'),
  node_path: z.string().min(1).describe('Current node path (e.g. "Player" or "Main/Enemy")'),
  new_name: z.string().min(1).describe('New name for the node'),
};

export const attachScriptSchema = {
  scene_path: z.string().min(1).describe('Path to .tscn file'),
  node_path: z.string().min(1).describe('Node path to attach script to'),
  script_path: z.string().min(1).describe('Script resource path (e.g. "res://scripts/player.gd")'),
};

export const setCollisionShapeSchema = {
  scene_path: z.string().min(1).describe('Path to .tscn file'),
  node_path: z.string().min(1).describe('Parent node path (e.g. "Player" — the CollisionShape3D must already exist as child)'),
  shape_type: z.enum([
    'BoxShape3D', 'CapsuleShape3D', 'SphereShape3D', 'CylinderShape3D', 'ConcavePolygonShape3D', 'ConvexPolygonShape3D',
    'BoxShape2D', 'CapsuleShape2D', 'CircleShape2D', 'RectangleShape2D', 'SegmentShape2D', 'ConvexPolygonShape2D',
  ]).describe('Collision shape type'),
  shape_resource_path: z.string().optional().describe('Path to .tres resource file for the shape (e.g. "res://shapes/player_capsule.tres"). Creates one if omitted.'),
};

export const findNodesInScenesSchema = {
  node_type: z.string().optional().describe('Filter by node type (e.g. "CharacterBody2D", "Timer")'),
  property_key: z.string().optional().describe('Filter by property key (e.g. "position", "script")'),
  property_value: z.string().optional().describe('Filter by property value (partial match, e.g. "player.gd")'),
  group: z.string().optional().describe('Filter by node group'),
  signal_name: z.string().optional().describe('Filter scenes with this signal connection'),
  max_results: z.number().optional().default(100).describe('Max results (default: 100)'),
};

export const searchSceneContentSchema = {
  query: z.string().min(1).describe('Search term (case-insensitive)'),
  max_results: z.number().optional().default(50).describe('Max results (default: 50)'),
};

// ---- Tool Handlers ----

export function handleReadScene(
  projectRoot: string,
  args: { path: string }
): ToolResult {
  try {
    const absPath = resolveProjectPath(projectRoot, args.path);
    const { content } = readTextFile(absPath);
    const doc = parseScene(content);

    // Format a readable scene tree
    const result = formatSceneTree(doc);
    return {
      content: [{ type: 'text', text: result }],
    };
  } catch (err: any) {
    return {
      content: [{ type: 'text', text: `Error reading scene: ${err.message}` }],
      isError: true,
    };
  }
}

export function handleCreateScene(
  projectRoot: string,
  args: { path: string; template: SceneTemplateType; root_name?: string }
): ToolResult {
  try {
    const rootName = args.root_name || args.template;
    const content = generateSceneTemplate(args.template, rootName);
    const absPath = resolveProjectPath(projectRoot, args.path);
    writeTextFile(absPath, content);
    return {
      content: [{ type: 'text', text: `Scene created: ${args.path} (root: ${rootName}, type: ${args.template})` }],
    };
  } catch (err: any) {
    return {
      content: [{ type: 'text', text: `Error creating scene: ${err.message}` }],
      isError: true,
    };
  }
}

export function handleEditScene(
  projectRoot: string,
  args: { path: string; operations: SceneOperation[] }
): ToolResult {
  try {
    const absPath = resolveProjectPath(projectRoot, args.path);
    const { content } = readTextFile(absPath);
    const modified = editScene(content, args.operations);
    writeTextFile(absPath, modified, true); // backup enabled

    const opsSummary = args.operations.map(op => {
      switch (op.action) {
        case 'add_node': return `+ ${op.type} "${op.name}" under "${op.parent_path || '.'}"`;
        case 'modify_node': return `~ modified "${op.node_path}"`;
        case 'remove_node': return `- removed "${op.node_path}"`;
        case 'add_connection': return `🔌 signal ${op.signal}: ${op.from_node} → ${op.to_node}.${op.method_name}`;
        case 'remove_connection': return `🔌 removed signal ${op.signal}: ${op.from_node} → ${op.to_node}.${op.method_name}`;
        case 'clone_node': return `📋 cloned "${op.clone_source}" → "${op.name || op.clone_source}_copy"`;
        default: return '';
      }
    }).join('\n');

    return {
      content: [{ type: 'text', text: `Scene edited: ${args.path}\n\nOperations:\n${opsSummary}` }],
    };
  } catch (err: any) {
    return {
      content: [{ type: 'text', text: `Error editing scene: ${err.message}` }],
      isError: true,
    };
  }
}

export function handleListScenes(
  projectRoot: string,
  args: { path?: string; recursive?: boolean }
): ToolResult {
  try {
    const scenes = findFilesByExtension(projectRoot, ['.tscn'], args.path, args.recursive);
    if (scenes.length === 0) {
      const searchDir = args.path ? `${projectRoot}/${args.path}` : projectRoot;
      return {
        content: [{ type: 'text', text: `No .tscn files found in "${searchDir}".\n\nTips:\n- Make sure the Godot project path is correct\n- Verify project.godot exists in the project root\n- Check that .tscn scene files exist in the project` }],
      };
    }
    return {
      content: [{ type: 'text', text: scenes.join('\n') }],
    };
  } catch (err: any) {
    return {
      content: [{ type: 'text', text: `Error listing scenes: ${err.message}` }],
      isError: true,
    };
  }
}

// ---- Formatting ----

function formatSceneTree(doc: any): string {
  const lines: string[] = [];

  // Header info
  lines.push(`Scene: format ${doc.header.format}${doc.header.uid ? `, uid: ${doc.header.uid}` : ''}${doc.header.load_steps ? `, load_steps: ${doc.header.load_steps}` : ''}`);
  lines.push('');

  // Ext resources
  if (doc.extResources.length > 0) {
    lines.push(`External Resources (${doc.extResources.length}):`);
    for (const ext of doc.extResources) {
      lines.push(`  [${ext.id}] ${ext.type}: ${ext.path}`);
    }
    lines.push('');
  }

  // Sub resources
  if (doc.subResources.length > 0) {
    lines.push(`Sub-Resources (${doc.subResources.length}):`);
    for (const sub of doc.subResources) {
      lines.push(`  [${sub.id}] ${sub.type}: ${Object.keys(sub.properties).length} properties`);
    }
    lines.push('');
  }

  // Node tree
  lines.push('Scene Tree:');
  function printNode(node: any, depth: number): void {
    const indent = '  '.repeat(depth);
    const groupsStr = node.groups?.length ? ` [${node.groups.join(', ')}]` : '';
    lines.push(`${indent}${node.type} "${node.name}"${groupsStr}`);
    if (Object.keys(node.properties).length > 0) {
      for (const [key, val] of Object.entries(node.properties)) {
        const valStr = String(val).substring(0, 80);
        lines.push(`${indent}  ${key} = ${valStr}`);
      }
    }
    for (const child of node.children || []) {
      printNode(child, depth + 1);
    }
  }

  for (const node of doc.nodes) {
    printNode(node, 1);
  }
  lines.push('');

  // Connections
  if (doc.connections.length > 0) {
    lines.push(`Connections (${doc.connections.length}):`);
    for (const conn of doc.connections) {
      lines.push(`  ${conn.signal}: ${conn.from} -> ${conn.to}.${conn.method}`);
    }
  }

  return lines.join('\n');
}

// ---- Scene Dependency Graph ----

export function handleSceneDependencyGraph(projectRoot: string): ToolResult {
  try {
    const scenes = findFilesByExtension(projectRoot, ['.tscn']);
    const deps: Map<string, string[]> = new Map(); // scene -> [referenced scenes]

    for (const scenePath of scenes) {
      const absPath = resolveProjectPath(projectRoot, scenePath);
      const { content } = readTextFile(absPath);
      const doc = parseScene(content);
      const references: string[] = [];

      // Find ext_resource references of type PackedScene
      for (const ext of doc.extResources) {
        if (ext.type === 'PackedScene' || ext.path.endsWith('.tscn')) {
          references.push(ext.path);
        }
      }

      // Find nodes with instance (instanced scenes)
      for (const node of getAllNodes(doc.nodes)) {
        if (node.instance) {
          const instancePath = node.instance.startsWith('ExtResource(')
            ? `ExtResource ref in ${scenePath}`
            : node.instance;
          if (!references.includes(instancePath)) {
            references.push(instancePath);
          }
        }
      }

      deps.set(scenePath, references);
    }

    const lines: string[] = ['Scene Dependency Graph:', ''];
    for (const [scene, refs] of deps) {
      if (refs.length === 0) {
        lines.push(`  ${scene} (no dependencies)`);
      } else {
        lines.push(`  ${scene}`);
        for (const ref of refs) {
          lines.push(`    → ${ref}`);
        }
      }
    }

    return {
      content: [{ type: 'text', text: lines.join('\n') }],
    };
  } catch (err: any) {
    return {
      content: [{ type: 'text', text: `Error building dependency graph: ${err.message}` }],
      isError: true,
    };
  }
}

function getAllNodes(nodes: any[]): any[] {
  const all: any[] = [];
  function walk(list: any[]) {
    for (const node of list) {
      all.push(node);
      if (node.children) walk(node.children);
    }
  }
  walk(nodes);
  return all;
}

// ---- Cross-Scene Node Finder ----

export function handleFindNodesInScenes(
  projectRoot: string,
  args: { node_type?: string; property_key?: string; property_value?: string; group?: string; signal_name?: string; max_results?: number }
): ToolResult {
  try {
    const scenes = findFilesByExtension(projectRoot, ['.tscn']);
    const results: { scene: string; path: string; type: string; name: string; match: string }[] = [];
    const maxResults = args.max_results || 100;

    for (const scenePath of scenes) {
      if (results.length >= maxResults) break;
      const absPath = resolveProjectPath(projectRoot, scenePath);
      const { content } = readTextFile(absPath);
      const doc = parseScene(content);

      for (const node of getAllNodes(doc.nodes)) {
        if (results.length >= maxResults) break;

        let matched = false;
        let matchReason = '';

        if (args.node_type && node.type === args.node_type) {
          matched = true;
          matchReason = `type=${node.type}`;
        }
        if (args.group && node.groups?.includes(args.group)) {
          matched = true;
          matchReason = `group=${args.group}`;
        }
        if (args.property_key && node.properties[args.property_key]) {
          const val = node.properties[args.property_key];
          if (!args.property_value || String(val).includes(args.property_value)) {
            matched = true;
            matchReason = `prop ${args.property_key}=${String(val).substring(0, 40)}`;
          }
        }

        if (matched && (!args.node_type || node.type === args.node_type || args.group || args.property_key)) {
          // Build node path
          const nodePath = buildNodePath(doc.nodes, node.name);
          results.push({
            scene: scenePath,
            path: nodePath,
            type: node.type,
            name: node.name,
            match: matchReason,
          });
        }
      }

      // Check connections
      if (args.signal_name) {
        for (const conn of doc.connections) {
          if (conn.signal === args.signal_name) {
            if (results.length >= maxResults) break;
            results.push({
              scene: scenePath,
              path: `${conn.from} → ${conn.to}`,
              type: 'connection',
              name: conn.signal,
              match: `signal=${conn.signal} method=${conn.method}`,
            });
          }
        }
      }
    }

    if (results.length === 0) {
      const filters: string[] = [];
      if (args.node_type) filters.push(`type "${args.node_type}"`);
      if (args.group) filters.push(`group "${args.group}"`);
      if (args.property_key) filters.push(`property "${args.property_key}"`);
      if (args.signal_name) filters.push(`signal "${args.signal_name}"`);
      return {
        content: [{ type: 'text', text: `No nodes found matching: ${filters.join(', ') || 'any'}` }],
      };
    }

    const lines: string[] = [`Found ${results.length} node(s):`, ''];
    for (const r of results) {
      lines.push(`  ${r.scene}  ─  ${r.path}`);
      lines.push(`    ${r.type} "${r.name}"  [${r.match}]`);
    }

    return {
      content: [{ type: 'text', text: lines.join('\n') }],
    };
  } catch (err: any) {
    return {
      content: [{ type: 'text', text: `Error finding nodes: ${err.message}` }],
      isError: true,
    };
  }
}

export function handleSearchSceneContent(
  projectRoot: string,
  args: { query: string; max_results?: number }
): ToolResult {
  try {
    const scenes = findFilesByExtension(projectRoot, ['.tscn']);
    const results: { scene: string; line_num: number; line: string }[] = [];
    const lowerQuery = args.query.toLowerCase();
    const maxResults = args.max_results || 50;

    for (const scenePath of scenes) {
      if (results.length >= maxResults) break;
      const absPath = resolveProjectPath(projectRoot, scenePath);
      const { content } = readTextFile(absPath);
      const lines = content.split('\n');

      for (let i = 0; i < lines.length; i++) {
        if (results.length >= maxResults) break;
        if (lines[i].toLowerCase().includes(lowerQuery)) {
          results.push({ scene: scenePath, line_num: i + 1, line: lines[i].trim().substring(0, 100) });
        }
      }
    }

    if (results.length === 0) {
      return { content: [{ type: 'text', text: `No matches for "${args.query}" in scene files.` }] };
    }

    const lines: string[] = [`Search "${args.query}" in scenes (${results.length} results):`, ''];
    for (const r of results) {
      lines.push(`  ${r.scene}:${r.line_num}  ${r.line}`);
    }

    return { content: [{ type: 'text', text: lines.join('\n') }] };
  } catch (err: any) {
    return { content: [{ type: 'text', text: `Error searching scenes: ${err.message}` }], isError: true };
  }
}

function buildNodePath(roots: any[], targetName: string): string {
  function find(root: any, currentPath: string): string | null {
    if (root.name === targetName) return currentPath + targetName;
    for (const child of root.children || []) {
      const result = find(child, currentPath + root.name + '/');
      if (result) return result;
    }
    return null;
  }
  for (const root of roots) {
    const result = find(root, '');
    if (result) return result;
  }
  return targetName;
}

// ---- UI Node Lister ----

const CONTROL_TYPES = [
  'Control', 'Button', 'Label', 'LineEdit', 'TextEdit', 'RichTextLabel',
  'Panel', 'PanelContainer', 'MarginContainer', 'VBoxContainer', 'HBoxContainer',
  'GridContainer', 'ScrollContainer', 'TabContainer', 'SplitContainer',
  'ColorRect', 'TextureRect', 'TextureButton', 'CheckBox', 'CheckButton',
  'OptionButton', 'MenuButton', 'PopupMenu', 'ColorPicker', 'ColorPickerButton',
  'HSlider', 'VSlider', 'ProgressBar', 'SpinBox', 'Tree', 'ItemList',
  'FileDialog', 'AcceptDialog', 'ConfirmationDialog', 'Window', 'SubViewport',
  'VideoStreamPlayer', 'AnimationPlayer', // often nested in UI
];

export function handleListUiNodes(
  projectRoot: string,
  args: { node_type?: string; max_results?: number }
): ToolResult {
  try {
    const scenes = findFilesByExtension(projectRoot, ['.tscn']);
    const results: { scene: string; type: string; name: string; anchors: string; position: string; text?: string }[] = [];
    const maxResults = args.max_results || 100;

    for (const scenePath of scenes) {
      if (results.length >= maxResults) break;
      const absPath = resolveProjectPath(projectRoot, scenePath);
      const { content } = readTextFile(absPath);
      const doc = parseScene(content);

      for (const node of getAllNodes(doc.nodes)) {
        if (results.length >= maxResults) break;

        const isControlType = args.node_type 
          ? node.type === args.node_type
          : CONTROL_TYPES.includes(node.type);

        if (!isControlType) continue;

        const entry: typeof results[0] = {
          scene: scenePath,
          type: node.type,
          name: node.name,
          anchors: 'default',
          position: '?',
        };

        if (node.properties.anchor_left !== undefined) {
          const l = Number(node.properties.anchor_left) || 0;
          const t = Number(node.properties.anchor_top) || 0;
          const r = Number(node.properties.anchor_right) || 0;
          const b = Number(node.properties.anchor_bottom) || 0;
          entry.anchors = `(${l},${t})→(${r},${b})`;
        }
        if (node.properties.position) {
          entry.position = node.properties.position;
        }
        if (node.properties.text) {
          entry.text = node.properties.text.slice(0, 30);
        }

        results.push(entry);
      }
    }

    if (results.length === 0) {
      const filter = args.node_type || 'Control-derived';
      return { content: [{ type: 'text', text: `No ${filter} nodes found in project scenes.` }] };
    }

    const lines: string[] = [`UI Nodes (${results.length})${args.node_type ? ` — type: ${args.node_type}` : ''}`, ''];
    for (const r of results) {
      let line = `  ${r.scene}  ─  ${r.name}  [${r.type}]`;
      if (r.anchors !== 'default') line += `  anchors=${r.anchors}`;
      if (r.position !== '?') line += `  pos=${r.position}`;
      if (r.text) line += `  text="${r.text}"`;
      lines.push(line);
    }

    return { content: [{ type: 'text', text: lines.join('\n') }] };
  } catch (err: any) {
    return { content: [{ type: 'text', text: `Error listing UI nodes: ${err.message}` }], isError: true };
  }
}

// ---- Node Transform (2D/3D aware) ----

// Nodes that are 3D space
const NODE3D_TYPES = [
  'Node3D', 'CharacterBody3D', 'RigidBody3D', 'StaticBody3D', 'Area3D',
  'Camera3D', 'MeshInstance3D', 'CSGBox3D', 'CSGSphere3D', 'CSGCylinder3D',
  'CSGPolygon3D', 'CSGCombiner3D', 'CollisionShape3D', 'CollisionPolygon3D',
  'NavigationRegion3D', 'Path3D', 'SpringArm3D', 'Marker3D', 'BoneAttachment3D',
  'AnimationPlayer', 'Light3D', 'OmniLight3D', 'SpotLight3D', 'DirectionalLight3D',
];
// Everything else (Node2D, Control, etc.) is 2D
const NODE2D_TYPES = [
  'Node2D', 'CharacterBody2D', 'RigidBody2D', 'StaticBody2D', 'Area2D',
  'Sprite2D', 'AnimatedSprite2D', 'CollisionShape2D', 'CollisionPolygon2D',
  'TileMap', 'Camera2D', 'Path2D', 'Line2D', 'ParallaxBackground', 'ParallaxLayer',
  'CanvasLayer', 'AudioStreamPlayer2D',
  'Control', 'Button', 'Label', 'LineEdit', 'TextEdit', 'Panel', 'ColorRect',
  'TextureRect', 'MarginContainer', 'VBoxContainer', 'HBoxContainer', 'GridContainer',
  'ScrollContainer', 'ProgressBar', 'HSlider', 'VSlider', 'CheckBox', 'OptionButton',
];

function detectNodeDimension(nodeType: string): '2D' | '3D' {
  if (NODE3D_TYPES.includes(nodeType)) return '3D';
  if (NODE2D_TYPES.includes(nodeType)) return '2D';
  // Heuristic: if type contains "3D" or "3d", it's 3D
  if (nodeType.includes('3D') || nodeType.includes('3d')) return '3D';
  return '2D'; // default
}

function normalizeVector(value: string, dim: '2D' | '3D', field: 'position' | 'scale'): string {
  // Already in Vector2/Vector3 format
  if (value.startsWith('Vector2(') || value.startsWith('Vector3(')) return value;

  // Shorthand: "100,200" or "0,5,0"
  const parts = value.split(',').map(s => s.trim());
  if (field === 'position' || field === 'scale') {
    if (dim === '2D') {
      if (parts.length < 2) throw new Error(`2D ${field} needs 2 values: "x,y". Got: "${value}"`);
      return `Vector2(${parts[0]}, ${parts[1]})`;
    } else {
      if (parts.length < 3) throw new Error(`3D ${field} needs 3 values: "x,y,z". Got: "${value}"`);
      return `Vector3(${parts[0]}, ${parts[1]}, ${parts[2]})`;
    }
  }

  return value;
}

function normalizeRotation(value: string, dim: '2D' | '3D'): string {
  if (value.startsWith('Vector3(')) return value;
  const parts = value.split(',').map(s => s.trim());
  if (dim === '2D') {
    return value; // plain float, fine
  }
  // 3D: shorthand "0,1.57,0" → "Vector3(0,1.57,0)"
  if (parts.length >= 3) {
    return `Vector3(${parts[0]}, ${parts[1]}, ${parts[2]})`;
  }
  // Single value for 3D? Wrap as Z rotation
  return `Vector3(0, 0, ${value})`;
}

export function handleTransformNode(
  projectRoot: string,
  args: { scene_path: string; node_path: string; position?: string; rotation?: string; scale?: string }
): ToolResult {
  try {
    const absPath = resolveProjectPath(projectRoot, args.scene_path);
    const { content } = readTextFile(absPath);
    const doc = parseScene(content);

    // Find the target node
    const pathParts = args.node_path.split('/');
    let found: any = null;

    function find(nodes: any[], target: string): any | null {
      for (const n of nodes) {
        if (n.name === target) return n;
        const r = find(n.children || [], target);
        if (r) return r;
      }
      return null;
    }

    if (pathParts.length === 1) {
      found = find(doc.nodes, pathParts[0]);
    } else {
      let current = doc.nodes;
      for (let i = 0; i < pathParts.length; i++) {
        const match = find(current, pathParts[i]);
        if (!match) break;
        if (i === pathParts.length - 1) { found = match; break; }
        current = match.children || [];
      }
    }

    if (!found) {
      return {
        content: [{ type: 'text', text: `Node "${args.node_path}" not found in ${args.scene_path}.` }],
        isError: true,
      };
    }

    // Detect 2D / 3D
    const dim = detectNodeDimension(found.type);

    const props: Record<string, string> = {};
    try {
      if (args.position) props.position = normalizeVector(args.position, dim, 'position');
      if (args.rotation !== undefined) props.rotation = normalizeRotation(args.rotation, dim);
      if (args.scale) props.scale = normalizeVector(args.scale, dim, 'scale');
    } catch (err: any) {
      return { content: [{ type: 'text', text: `Format error: ${err.message} (node type: ${found.type}, dimension: ${dim})` }], isError: true };
    }

    if (Object.keys(props).length === 0) {
      return {
        content: [{ type: 'text', text: 'No transform parameters provided. Specify at least one: position, rotation, scale.' }],
        isError: true,
      };
    }

    const ops: SceneOperation[] = [{ action: 'modify_node', node_path: args.node_path, properties: props }];
    const modified = editScene(content, ops);
    writeTextFile(absPath, modified, true);

    const changed: string[] = [];
    if (args.position) changed.push(`position → ${props.position}`);
    if (args.rotation !== undefined) changed.push(`rotation → ${props.rotation}`);
    if (args.scale) changed.push(`scale → ${props.scale}`);

    return {
      content: [{ type: 'text', text: `Node "${args.node_path}" [${dim}] transformed in ${args.scene_path}:\n  ${changed.join('\n  ')}` }],
    };
  } catch (err: any) {
    return {
      content: [{ type: 'text', text: `Error transforming node: ${err.message}` }],
      isError: true,
    };
  }
}

// ---- Rename Node ----

export function handleRenameNode(
  projectRoot: string,
  args: { scene_path: string; node_path: string; new_name: string }
): ToolResult {
  try {
    const absPath = resolveProjectPath(projectRoot, args.scene_path);
    const { content } = readTextFile(absPath);
    const ops: SceneOperation[] = [{ action: 'modify_node', node_path: args.node_path, new_name: args.new_name }];
    const modified = editScene(content, ops);
    writeTextFile(absPath, modified, true);
    return { content: [{ type: 'text', text: `Node renamed: "${args.node_path}" → "${args.new_name}" in ${args.scene_path}` }] };
  } catch (err: any) {
    return { content: [{ type: 'text', text: `Error renaming node: ${err.message}` }], isError: true };
  }
}

// ---- Attach Script ----

export function handleAttachScript(
  projectRoot: string,
  args: { scene_path: string; node_path: string; script_path: string }
): ToolResult {
  try {
    const absPath = resolveProjectPath(projectRoot, args.scene_path);
    const { content } = readTextFile(absPath);
    const ops: SceneOperation[] = [{ action: 'modify_node', node_path: args.node_path, properties: { script: `ExtResource("${args.script_path}")` } }];
    const modified = editScene(content, ops);
    writeTextFile(absPath, modified, true);
    return { content: [{ type: 'text', text: `Script "${args.script_path}" attached to "${args.node_path}" in ${args.scene_path}` }] };
  } catch (err: any) {
    return { content: [{ type: 'text', text: `Error attaching script: ${err.message}` }], isError: true };
  }
}

// ---- Set Collision Shape ----

const SHAPE_DEFAULTS: Record<string, Record<string, string>> = {
  'BoxShape3D': { size: 'Vector3(1, 1, 1)' },
  'CapsuleShape3D': { height: '2.0', radius: '0.5' },
  'SphereShape3D': { radius: '0.5' },
  'CylinderShape3D': { height: '2.0', radius: '0.5' },
  'BoxShape2D': { size: 'Vector2(1, 1)' },
  'CapsuleShape2D': { height: '30.0', radius: '10.0' },
  'CircleShape2D': { radius: '10.0' },
  'RectangleShape2D': { size: 'Vector2(20, 20)' },
};

export function handleSetCollisionShape(
  projectRoot: string,
  args: { scene_path: string; node_path: string; shape_type: string; shape_resource_path?: string }
): ToolResult {
  // Atomic: set shape property on an existing CollisionShape node.
  // Use add_node first to create the CollisionShape2D/3D child if needed.
  // Use create_resource first to create the shape .tres if needed.
  try {
    const absPath = resolveProjectPath(projectRoot, args.scene_path);
    const { content } = readTextFile(absPath);

    const shapePath = args.shape_resource_path || `res://shapes/${args.node_path.replace(/[/\\]/g, '_')}_shape.tres`;
    const ops: SceneOperation[] = [{ action: 'modify_node', node_path: args.node_path, properties: { shape: `SubResource("${shapePath}")` } }];
    const modified = editScene(content, ops);
    writeTextFile(absPath, modified, true);

    return {
      content: [{ type: 'text', text: `Shape "${shapePath}" assigned to "${args.node_path}" in ${args.scene_path}` }],
    };
  } catch (err: any) {
    return { content: [{ type: 'text', text: `Error: ${err.message}` }], isError: true };
  }
}

// ============================================================
// Fine-grained tools (6 scene + 3 transform)
// ============================================================

function doSceneOp(projectRoot: string, scenePath: string, op: SceneOperation, label: string): ToolResult {
  try {
    const absPath = resolveProjectPath(projectRoot, scenePath);
    // 注意：此函数是同步的（被同步 handler 调用），但 withFileLock 是异步的。
    // 由于 Node.js 是单线程事件循环，同步文件操作天然串行——只要不在同一事件循环
    // tick 内并发调用即可。MCP 工具调用是串行的，所以实际不存在并发问题。
    // 但如果未来改为异步，请在调用链上升级为 async/await + withFileLock。
    const { content } = readTextFile(absPath);
    const modified = editScene(content, [op]);
    writeTextFile(absPath, modified, true);
    return { content: [{ type: 'text', text: label }] };
  } catch (err: any) {
    return { content: [{ type: 'text', text: `Error: ${err.message}` }], isError: true };
  }
}

// --- Node CRUD ---

export function handleAddNode(
  projectRoot: string,
  args: { scene_path: string; parent_path?: string; name: string; type: string; properties?: Record<string, string>; groups?: string[] }
): ToolResult {
  return doSceneOp(projectRoot, args.scene_path,
    { action: 'add_node', parent_path: args.parent_path, name: args.name, type: args.type, properties: args.properties, groups: args.groups },
    `+ ${args.type} "${args.name}" under "${args.parent_path || '.'}" in ${args.scene_path}`);
}

export function handleRemoveNode(
  projectRoot: string,
  args: { scene_path: string; node_path: string }
): ToolResult {
  return doSceneOp(projectRoot, args.scene_path,
    { action: 'remove_node', node_path: args.node_path },
    `- removed "${args.node_path}" from ${args.scene_path}`);
}

export function handleModifyNode(
  projectRoot: string,
  args: { scene_path: string; node_path: string; properties?: Record<string, string>; new_name?: string }
): ToolResult {
  return doSceneOp(projectRoot, args.scene_path,
    { action: 'modify_node', node_path: args.node_path, properties: args.properties, new_name: args.new_name },
    `~ modified "${args.node_path}" in ${args.scene_path}` + (args.new_name ? ` (renamed → ${args.new_name})` : ''));
}

export function handleCloneNode(
  projectRoot: string,
  args: { scene_path: string; clone_source: string; name?: string; parent_path?: string }
): ToolResult {
  return doSceneOp(projectRoot, args.scene_path,
    { action: 'clone_node', clone_source: args.clone_source, name: args.name, parent_path: args.parent_path },
    `📋 cloned "${args.clone_source}" → "${args.name || args.clone_source + '_copy'}" in ${args.scene_path}`);
}

// --- Signal Connections ---

export function handleConnectSignal(
  projectRoot: string,
  args: { scene_path: string; signal: string; from_node: string; to_node: string; method_name: string; flags?: number; unbinds?: number }
): ToolResult {
  return doSceneOp(projectRoot, args.scene_path,
    { action: 'add_connection', signal: args.signal, from_node: args.from_node, to_node: args.to_node, method_name: args.method_name, flags: args.flags, unbinds: args.unbinds },
    `🔗 signal "${args.signal}": ${args.from_node} → ${args.to_node}.${args.method_name}`);
}

export function handleDisconnectSignal(
  projectRoot: string,
  args: { scene_path: string; signal: string; from_node: string; to_node: string; method_name: string }
): ToolResult {
  return doSceneOp(projectRoot, args.scene_path,
    { action: 'remove_connection', signal: args.signal, from_node: args.from_node, to_node: args.to_node, method_name: args.method_name },
    `🔌 removed signal "${args.signal}": ${args.from_node} → ${args.to_node}.${args.method_name}`);
}

// --- Transform (position / rotation / scale) ---

export function handleSetNodePosition(
  projectRoot: string,
  args: { scene_path: string; node_path: string; value: string }
): ToolResult {
  return handleTransformNode(projectRoot, { scene_path: args.scene_path, node_path: args.node_path, position: args.value });
}

export function handleSetNodeRotation(
  projectRoot: string,
  args: { scene_path: string; node_path: string; value: string }
): ToolResult {
  return handleTransformNode(projectRoot, { scene_path: args.scene_path, node_path: args.node_path, rotation: args.value });
}

export function handleSetNodeScale(
  projectRoot: string,
  args: { scene_path: string; node_path: string; value: string }
): ToolResult {
  return handleTransformNode(projectRoot, { scene_path: args.scene_path, node_path: args.node_path, scale: args.value });
}

// ============================================================
// load_sprite — 为 Sprite2D/TextureRect 加载纹理
// ============================================================

export const loadSpriteSchema = {
  scene_path: z.string().min(1).describe('Path to .tscn file'),
  node_path: z.string().min(1).describe('Node path (Sprite2D or TextureRect)'),
  texture_path: z.string().min(1).describe('Texture resource path (e.g. "res://icon.svg")'),
};

export function handleLoadSprite(
  projectRoot: string,
  args: { scene_path: string; node_path: string; texture_path: string }
): ToolResult {
  try {
    const absPath = resolveProjectPath(projectRoot, args.scene_path);
    const { content } = readTextFile(absPath);
    const doc = parseScene(content);

    // 查找目标节点
    const findNode = (nodes: any[], target: string): any | null => {
      for (const n of nodes) {
        if (n.name === target) return n;
        const r = findNode(n.children || [], target);
        if (r) return r;
      }
      return null;
    };

    const node = findNode(doc.nodes, args.node_path);
    if (!node) {
      return {
        content: [{ type: 'text', text: `Node "${args.node_path}" not found in ${args.scene_path}.` }],
        isError: true,
      };
    }

    // 检查节点类型
    if (node.type !== 'Sprite2D' && node.type !== 'TextureRect') {
      return {
        content: [{ type: 'text', text: `Node "${args.node_path}" is ${node.type}, not Sprite2D or TextureRect.` }],
        isError: true,
      };
    }

    // 添加 ExtResource 引用
    const resId = `"${doc.extResources.length + 1}_sprite_texture"`;
    doc.extResources.push({
      id: resId,
      type: 'CompressedTexture2D',
      path: args.texture_path,
    });

    // 设置 texture 属性
    if (!node.properties) node.properties = {};
    node.properties.texture = `ExtResource(${resId})`;

    const modified = serializeScene(doc);
    writeTextFile(absPath, modified, true);

    return {
      content: [{ type: 'text', text: `🖼️ Texture "${args.texture_path}" loaded onto "${args.node_path}" in ${args.scene_path}.` }],
    };
  } catch (err: any) {
    return {
      content: [{ type: 'text', text: `Error loading sprite: ${err.message}` }],
      isError: true,
    };
  }
}
