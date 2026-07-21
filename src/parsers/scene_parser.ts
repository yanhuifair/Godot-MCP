// Copyright (c) 2026 FairYan
// SPDX-License-Identifier: MIT
// ============================================================
// Godot MCP Server - TSCN Scene File Parser
// ============================================================
//
// Godot .tscn files use an extended INI-like text format:
//
// [gd_scene load_steps=N format=3 uid="uid://..."]
//
// [ext_resource type="PackedScene" uid="uid://..." path="res://..." id="id_xxx"]
// [sub_resource type="Animation" id="id_xxx"]
// properties...
//
// [node name="Node2D" type="Node2D" parent="."]
// properties...
//
// [connection signal="..." from="..." to="..." method="..."]

import {
  GodotDocument,
  SceneHeader,
  ExtResource,
  SubResource,
  NodeDefinition,
  Connection,
  SceneOperation,
} from '../utils/types.js';
import {
  splitHeaderParts,
  parseKeyValuePairs,
  unquote,
  isValueBalanced,
} from './parser_helpers.js';

// ============================================================
// Parsing
// ============================================================

/**
 * Parse a .tscn file string into a structured GodotDocument.
 */
export function parseScene(content: string): GodotDocument {
  const doc: GodotDocument = {
    header: { format: 3 },
    extResources: [],
    subResources: [],
    nodes: [],
    connections: [],
  };

  const lines = content.split('\n');
  let multiLineValue: { sectionType: string; sectionIdx: number; key: string; valueParts: string[] } | null = null;

  for (let i = 0; i < lines.length; i++) {
    const rawLine = lines[i];
    const trimmedStart = rawLine.trimStart();
    const trimmed = trimmedStart.trim();

    // Comment or empty
    if (trimmed.length === 0 || trimmed.startsWith(';')) continue;

    // Handle multi-line value continuation
    if (multiLineValue !== null) {
      // Check for closing of multi-line value: unbalanced quotes/brackets
      multiLineValue.valueParts.push(trimmed);
      const combined = multiLineValue.valueParts.join('\n');
      // Check balance
      if (isValueBalanced(combined)) {
        // Multi-line value complete
        setProperty(doc, multiLineValue.sectionType, multiLineValue.sectionIdx, multiLineValue.key, combined);
        multiLineValue = null;
      }
      continue;
    }

    // Section header: [type key=value ...]
    if (trimmed.startsWith('[') && trimmed.endsWith(']')) {
      // Simple section header like [gd_scene format=3]
      const inner = trimmed.slice(1, -1).trim();
      const parts = splitHeaderParts(inner);

      if (!parts || parts.length === 0) continue;

      const type = parts[0];
      const props = parseKeyValuePairs(parts.slice(1));

      switch (type) {
        case 'gd_scene':
          doc.header = parseSceneHeader(props);
          break;
        case 'ext_resource':
          doc.extResources.push(parseExtResource(props));
          break;
        case 'sub_resource':
          doc.subResources.push(parseSubResource(props));
          break;
        case 'node':
          doc.nodes.push(parseNodeDefinition(props));
          break;
        case 'connection':
          doc.connections.push(parseConnection(props));
          break;
        default:
          // Unknown section type - could be animation or other resource
          break;
      }
      continue;
    }

    // Property line within a section: key = value
    const eqIndex = trimmed.indexOf('=');
    if (eqIndex > 0) {
      const key = trimmed.slice(0, eqIndex).trim();
      const value = trimmed.slice(eqIndex + 1).trim();

      // Determine which section we're currently in
      // We need to look at the last processed section
      const lastSection = getLastSectionType(doc);

      if (lastSection.sectionType === 'gd_scene') {
        continue; // Skip stray properties under header
      }

      // Check if value starts a multi-line block
      if (value.startsWith('"') && !value.replace(/\\"/g, '').endsWith('"')) {
        multiLineValue = { sectionType: lastSection.sectionType, sectionIdx: lastSection.sectionIdx, key, valueParts: [value] };
        continue;
      }
      if ((value.startsWith('{') && !value.endsWith('}')) ||
          (value.startsWith('[') && !value.endsWith(']'))) {
        multiLineValue = { sectionType: lastSection.sectionType, sectionIdx: lastSection.sectionIdx, key, valueParts: [value] };
        continue;
      }

      setProperty(doc, lastSection.sectionType, lastSection.sectionIdx, key, value);
    }
  }

  // Build node hierarchy
  doc.nodes = buildNodeHierarchy(doc.nodes);

  return doc;
}

function parseSceneHeader(props: Record<string, string>): SceneHeader {
  return {
    load_steps: props.load_steps ? parseInt(props.load_steps, 10) : undefined,
    format: props.format ? parseInt(props.format, 10) : 3,
    uid: props.uid ? unquote(props.uid) : undefined,
  };
}

function parseExtResource(props: Record<string, string>): ExtResource {
  return {
    type: props.type ? unquote(props.type) : '',
    uid: props.uid ? unquote(props.uid) : undefined,
    path: unquote(props.path || ''),
    id: props.id || '',
  };
}

function parseSubResource(props: Record<string, string>): SubResource {
  return {
    type: props.type ? unquote(props.type) : '',
    id: props.id || '',
    properties: {},
  };
}

function parseNodeDefinition(props: Record<string, string>): NodeDefinition {
  const node: NodeDefinition = {
    name: unquote(props.name || ''),
    type: props.type ? unquote(props.type) : '',
    parent: props.parent ? unquote(props.parent) : undefined,
    instance: props.instance,
    properties: {},
    children: [],
  };

  if (props.groups) {
    node.groups = parseGroups(props.groups);
  }
  if (props.index) {
    node.index = parseInt(props.index, 10);
  }
  if (props.editor_description) {
    node.editorDescription = unquote(props.editor_description);
  }

  return node;
}

function parseConnection(props: Record<string, string>): Connection {
  return {
    signal: unquote(props.signal || ''),
    from: unquote(props.from || ''),
    to: unquote(props.to || ''),
    method: unquote(props.method || ''),
    flags: props.flags ? parseInt(props.flags, 10) : undefined,
    unbinds: props.unbinds ? parseInt(props.unbinds, 10) : undefined,
  };
}

function parseGroups(groupsStr: string): string[] {
  // Groups format: [ "group1", "group2" ]
  const trimmed = groupsStr.trim();
  if (trimmed.startsWith('[') && trimmed.endsWith(']')) {
    const inner = trimmed.slice(1, -1);
    return inner.split(',').map(g => g.trim().replace(/^"|"$/g, '')).filter(g => g.length > 0);
  }
  return [];
}

// ============================================================
// Property Management
// ============================================================

interface SectionRef {
  sectionType: string;
  sectionIdx: number;
}

function getLastSectionType(doc: GodotDocument): SectionRef {
  if (doc.nodes.length > 0) {
    return { sectionType: 'node', sectionIdx: doc.nodes.length - 1 };
  }
  if (doc.subResources.length > 0) {
    return { sectionType: 'sub_resource', sectionIdx: doc.subResources.length - 1 };
  }
  if (doc.extResources.length > 0) {
    return { sectionType: 'ext_resource', sectionIdx: doc.extResources.length - 1 };
  }
  return { sectionType: 'gd_scene', sectionIdx: 0 };
}

function setProperty(doc: GodotDocument, sectionType: string, sectionIdx: number, key: string, value: string): void {
  switch (sectionType) {
    case 'node':
      if (doc.nodes[sectionIdx]) {
        doc.nodes[sectionIdx].properties[key] = value;
      }
      break;
    case 'sub_resource':
      if (doc.subResources[sectionIdx]) {
        doc.subResources[sectionIdx].properties[key] = value;
      }
      break;
    default:
      break;
  }
}

// ============================================================
// Node Hierarchy Building
// ============================================================

function buildNodeHierarchy(flatNodes: NodeDefinition[]): NodeDefinition[] {
  if (flatNodes.length === 0) return [];

  // Find root nodes (no parent or parent is ".")
  const roots: NodeDefinition[] = [];
  const childrenByParent: Map<string, NodeDefinition[]> = new Map();

  for (const node of flatNodes) {
    if (!node.parent || node.parent === '.') {
      roots.push(node);
    } else {
      // Normalize parent path
      const parentPath = node.parent;
      if (!childrenByParent.has(parentPath)) {
        childrenByParent.set(parentPath, []);
      }
      childrenByParent.get(parentPath)!.push(node);
    }
  }

  // Attach children recursively
  function attachChildren(node: NodeDefinition, path: string): void {
    const children = childrenByParent.get(path) || [];
    // Sort by index if present
    children.sort((a, b) => {
      if (a.index !== undefined && b.index !== undefined) return a.index - b.index;
      if (a.index !== undefined) return -1;
      if (b.index !== undefined) return 1;
      return 0;
    });
    node.children = children;

    for (const child of children) {
      const childPath = `${path}/${child.name}`;
      attachChildren(child, childPath);
    }
  }

  for (const root of roots) {
    attachChildren(root, root.name);
  }

  return roots;
}

// ============================================================
// Serialization (for edit_scene)
// ============================================================

/**
 * Serialize a GodotDocument back to .tscn text format.
 */
export function serializeScene(doc: GodotDocument): string {
  const lines: string[] = [];

  // Header
  let headerStr = '[gd_scene';
  if (doc.header.load_steps !== undefined) headerStr += ` load_steps=${doc.header.load_steps}`;
  headerStr += ` format=${doc.header.format}`;
  if (doc.header.uid) headerStr += ` uid="${doc.header.uid}"`;
  headerStr += ']';
  lines.push(headerStr);
  lines.push('');

  // Ext resources
  for (const ext of doc.extResources) {
    let line = '[ext_resource';
    line += ` type="${ext.type}"`;
    if (ext.uid) line += ` uid="${ext.uid}"`;
    line += ` path="${ext.path}"`;
    line += ` id="${ext.id}"`;
    line += ']';
    lines.push(line);
  }
  if (doc.extResources.length > 0) lines.push('');

  // Sub resources
  for (const sub of doc.subResources) {
    let line = `[sub_resource type="${sub.type}" id="${sub.id}"]`;
    lines.push(line);
    for (const [key, value] of Object.entries(sub.properties)) {
      lines.push(`${key} = ${value}`);
    }
  }
  if (doc.subResources.length > 0) lines.push('');

  // Nodes (depth-first traversal)
  function emitNode(node: NodeDefinition, depth: number): void {
    const indent = '\t'.repeat(depth);
    // Gather flat nodes list from tree
  }

  // We need flat node list for serialization - use the stored order
  // Since we built hierarchy, we need to flatten back preserving order
  const flatNodes = flattenNodes(doc.nodes, doc.nodes); // use original flat order tracking
  for (const node of flatNodes) {
    emitFlatNode(lines, node);
  }

  if (flatNodes.length > 0) lines.push('');

  // Connections
  for (const conn of doc.connections) {
    let line = `[connection signal="${conn.signal}" from="${conn.from}" to="${conn.to}" method="${conn.method}"`;
    if (conn.flags !== undefined) line += ` flags=${conn.flags}`;
    if (conn.unbinds !== undefined) line += ` unbinds=${conn.unbinds}`;
    line += ']';
    lines.push(line);
  }

  return lines.join('\n');
}

interface FlatNodeEntry {
  node: NodeDefinition;
  depth: number;
  parentPath: string;
}

function flattenNodes(roots: NodeDefinition[], _originalFlat: NodeDefinition[]): FlatNodeEntry[] {
  const result: FlatNodeEntry[] = [];

  function walk(node: NodeDefinition, depth: number, parentPath: string): void {
    result.push({ node, depth, parentPath });
    const fullPath = parentPath ? `${parentPath}/${node.name}` : node.name;
    for (const child of node.children) {
      walk(child, depth + 1, fullPath);
    }
  }

  for (const root of roots) {
    walk(root, 0, '');
  }

  return result;
}

function emitFlatNode(lines: string[], entry: FlatNodeEntry): void {
  const { node, depth } = entry;
  let line = `[node name="${node.name}" type="${node.type}"`;
  if (depth > 0) {
    line += ` parent="${entry.parentPath}"`;
  }
  if (node.instance) line += ` instance="${node.instance}"`;
  if (node.groups && node.groups.length > 0) {
    line += ` groups=[ ${node.groups.map(g => `"${g}"`).join(', ')} ]`;
  }
  if (node.index !== undefined) line += ` index=${node.index}`;
  if (node.editorDescription) line += ` editor_description="${node.editorDescription}"`;
  line += ']';
  lines.push(line);

  for (const [key, value] of Object.entries(node.properties)) {
    lines.push(`${key} = ${value}`);
  }
}

// ============================================================
// Scene Editing
// ============================================================

/**
 * Parse a scene, apply operations, and return the modified string.
 */
export function editScene(content: string, operations: SceneOperation[]): string {
  const doc = parseScene(content);

  // Flatten nodes for operation targeting
  const flatMap = new Map<string, { node: NodeDefinition; parentPath: string }>();
  function indexNodes(nodes: NodeDefinition[], parentPath: string): void {
    for (const node of nodes) {
      const fullPath = parentPath ? `${parentPath}/${node.name}` : node.name;
      flatMap.set(fullPath, { node, parentPath });
      indexNodes(node.children, fullPath);
    }
  }
  indexNodes(doc.nodes, '');

  // Apply operations
  for (const op of operations) {
    switch (op.action) {
      case 'add_node': {
        const newNode: NodeDefinition = {
          name: op.name || 'NewNode',
          type: op.type || 'Node2D',
          parent: op.parent_path || '.',
          properties: op.properties || {},
          groups: op.groups,
          children: [],
        };

        // If parent_path is '.' or root, add to roots
        if (!op.parent_path || op.parent_path === '.') {
          doc.nodes.push(newNode);
          // Rebuild hierarchy
          doc.nodes = buildNodeHierarchy(doc.nodes);
        } else {
          // Add as child of existing node (requires hierarchy rebuild)
          const parentInfo = flatMap.get(op.parent_path);
          if (parentInfo) {
            parentInfo.node.children.push(newNode);
          } else {
            doc.nodes.push(newNode);
            doc.nodes = buildNodeHierarchy(doc.nodes);
          }
        }
        break;
      }

      case 'modify_node': {
        if (!op.node_path) continue;
        const info = flatMap.get(op.node_path);
        if (!info) continue;
        if (op.properties) {
          Object.assign(info.node.properties, op.properties);
        }
        if (op.new_name) {
          info.node.name = op.new_name;
        }
        if (op.groups) {
          info.node.groups = op.groups;
        }
        break;
      }

      case 'remove_node': {
        if (!op.node_path) continue;
        const info = flatMap.get(op.node_path);
        if (!info) continue;

        if (info.parentPath === '') {
          // Root node - remove from doc.nodes
          doc.nodes = doc.nodes.filter(n => n !== info.node);
        } else {
          // Child node
          const parentInfo = flatMap.get(info.parentPath);
          if (parentInfo) {
            parentInfo.node.children = parentInfo.node.children.filter(c => c !== info.node);
          }
        }
        break;
      }

      case 'add_connection': {
        if (!op.signal || !op.from_node || !op.to_node || !op.method_name) continue;
        doc.connections.push({
          signal: op.signal,
          from: op.from_node,
          to: op.to_node,
          method: op.method_name,
          flags: op.flags,
          unbinds: op.unbinds,
        });
        break;
      }

      case 'remove_connection': {
        if (!op.signal || !op.from_node || !op.to_node || !op.method_name) continue;
        doc.connections = doc.connections.filter(c =>
          !(c.signal === op.signal && c.from === op.from_node &&
            c.to === op.to_node && c.method === op.method_name)
        );
        break;
      }

      case 'clone_node': {
        if (!op.clone_source) continue;
        const srcInfo = flatMap.get(op.clone_source);
        if (!srcInfo) continue;

        // Deep clone the node
        const clone = deepCloneNode(srcInfo.node);
        clone.name = op.name || `${clone.name}_copy`;

        // Add to same parent or specified parent
        const targetParent = op.parent_path || srcInfo.parentPath;
        if (!targetParent || targetParent === '.') {
          doc.nodes.push(clone);
          doc.nodes = buildNodeHierarchy(doc.nodes);
        } else {
          const parentInfo = flatMap.get(targetParent);
          if (parentInfo) {
            parentInfo.node.children.push(clone);
          } else {
            doc.nodes.push(clone);
            doc.nodes = buildNodeHierarchy(doc.nodes);
          }
        }
        break;
      }
    }
  }

  // Rebuild flat hierarchy for serialization
  // Store original flat list
  const originalFlat = flattenNodes(doc.nodes, doc.nodes);

  return serializeSceneToText(doc, originalFlat);
}

function deepCloneNode(node: NodeDefinition): NodeDefinition {
  return {
    name: node.name,
    type: node.type,
    parent: node.parent,
    properties: { ...node.properties },
    groups: node.groups ? [...node.groups] : undefined,
    index: node.index,
    instance: node.instance,
    editorDescription: node.editorDescription,
    children: (node.children || []).map(deepCloneNode),
  };
}

/**
 * Serialize scene document back to text with proper flat node ordering.
 */
function serializeSceneToText(doc: GodotDocument, flatNodes: FlatNodeEntry[]): string {
  // Reuse serializeScene logic with proper parent tracking
  // For the edit_scene serialization, we need accurate parent paths
  return serializeScene(doc);
}

// ============================================================
// Scene Templates
// ============================================================

export const SCENE_TEMPLATES: Record<string, string> = {
  Node2D: `[gd_scene format=3 uid=""]

[node name="{root_name}" type="Node2D"]
`,
  Control: `[gd_scene format=3 uid=""]

[node name="{root_name}" type="Control"]
anchors_preset = 15
anchor_right = 1.0
anchor_bottom = 1.0
`,
  Node3D: `[gd_scene format=3 uid=""]

[node name="{root_name}" type="Node3D"]
`,
};

export function generateSceneTemplate(templateType: string, rootName: string): string {
  const tmpl = SCENE_TEMPLATES[templateType];
  if (!tmpl) {
    throw new Error(`Unknown scene template type: ${templateType}. Supported: ${Object.keys(SCENE_TEMPLATES).join(', ')}`);
  }
  return tmpl.replace(/\{root_name\}/g, rootName);
}
