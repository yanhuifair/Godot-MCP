// Copyright (c) 2026 FairYan
// SPDX-License-Identifier: AGPL-3.0-or-later
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
  unquoteId,
  unquoteAttr,
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
    uid: props.uid ? unquoteAttr(props.uid) : undefined,
  };
}

function parseExtResource(props: Record<string, string>): ExtResource {
  return {
    type: unquoteAttr(props.type),
    uid: props.uid ? unquoteAttr(props.uid) : undefined,
    path: unquoteAttr(props.path),
    id: unquoteId(props.id),
  };
}

function parseSubResource(props: Record<string, string>): SubResource {
  return {
    type: unquoteAttr(props.type),
    id: unquoteId(props.id),
    properties: {},
  };
}

function parseNodeDefinition(props: Record<string, string>): NodeDefinition {
  const node: NodeDefinition = {
    name: unquoteAttr(props.name),
    type: unquoteAttr(props.type),
    parent: props.parent ? unquoteAttr(props.parent) : undefined,
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

/**
 * Rebuild the node tree from the flat `[node ...]` list.
 *
 * Godot's .tscn parent convention (paths are relative to the scene root):
 *   root node          -> no `parent` attribute at all
 *   direct child       -> parent="."
 *   grandchild         -> parent="Child"
 *   great-grandchild   -> parent="Child/Grandchild"
 *
 * A `.tscn` has exactly ONE root. Treating parent="." as "is a root" (the old
 * behaviour) flattened the whole tree and, on the way back out, dropped the
 * `parent=` attribute entirely — producing a multi-root scene Godot cannot load.
 */
function buildNodeHierarchy(flatNodes: NodeDefinition[]): NodeDefinition[] {
  if (flatNodes.length === 0) return [];

  // The root is the only node without a `parent` attribute.
  const rootName = flatNodes.find(n => n.parent === undefined || n.parent === '')?.name;

  /**
   * Canonicalise a parent value to Godot's root-relative form.
   * Also accepts the root-prefixed variant ("Root", "Root/Child") that some
   * hand-written scenes and older tooling emit.
   */
  function canonicalParent(raw: string): string {
    if (raw === '.' || raw === '') return '.';
    if (rootName) {
      if (raw === rootName) return '.';
      if (raw.startsWith(`${rootName}/`)) return raw.slice(rootName.length + 1);
    }
    return raw;
  }

  const childrenByParent: Map<string, NodeDefinition[]> = new Map();
  const roots: NodeDefinition[] = [];

  for (const node of flatNodes) {
    node.children = [];
    if (node.parent === undefined || node.parent === '') {
      roots.push(node);
    } else {
      const key = canonicalParent(node.parent);
      node.parent = key; // normalise in-place so serialization emits Godot's form
      if (!childrenByParent.has(key)) childrenByParent.set(key, []);
      childrenByParent.get(key)!.push(node);
    }
  }

  // Malformed input with no explicit root: promote the first node so nothing is lost.
  if (roots.length === 0) {
    const first = flatNodes[0];
    const bucket = childrenByParent.get(first.parent!);
    if (bucket) {
      const i = bucket.indexOf(first);
      if (i >= 0) bucket.splice(i, 1);
    }
    first.parent = undefined;
    roots.push(first);
  }

  const attached = new Set<NodeDefinition>(roots);

  // `path` is the parent key used by children, in Godot's root-relative form.
  function attachChildren(node: NodeDefinition, path: string): void {
    const children = childrenByParent.get(path) || [];
    children.sort((a, b) => {
      if (a.index !== undefined && b.index !== undefined) return a.index - b.index;
      if (a.index !== undefined) return -1;
      if (b.index !== undefined) return 1;
      return 0;
    });
    node.children = children;

    for (const child of children) {
      attached.add(child);
      attachChildren(child, path === '.' ? child.name : `${path}/${child.name}`);
    }
  }

  // Only the real root owns the `parent="."` bucket.
  attachChildren(roots[0], '.');

  // Orphans (parent path points at a node that does not exist) must not vanish —
  // keep them addressable rather than silently deleting user data.
  for (const node of flatNodes) {
    if (!attached.has(node)) {
      attached.add(node);
      roots.push(node);
    }
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

  // Sub resources — blank line between blocks, matching Godot's own writer.
  doc.subResources.forEach((sub, i) => {
    if (i > 0) lines.push('');
    lines.push(`[sub_resource type="${sub.type}" id="${sub.id}"]`);
    for (const [key, value] of Object.entries(sub.properties)) {
      lines.push(`${key} = ${value}`);
    }
  });
  if (doc.subResources.length > 0) lines.push('');

  // Nodes, depth-first in Godot's document order.
  const flatNodes = flattenNodes(doc.nodes);
  flatNodes.forEach((node, i) => {
    if (i > 0) lines.push('');
    emitFlatNode(lines, node);
  });

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
  /** Root-relative parent path in Godot's own form ("." for direct children); undefined for the root. */
  parentPath: string | undefined;
}

/**
 * Depth-first flatten producing Godot's root-relative `parent=` values:
 * root -> undefined, direct child -> ".", deeper -> "Child/Grandchild".
 */
function flattenNodes(roots: NodeDefinition[], _originalFlat?: NodeDefinition[]): FlatNodeEntry[] {
  const result: FlatNodeEntry[] = [];

  function walk(node: NodeDefinition, depth: number, parentPath: string | undefined, selfPath: string): void {
    result.push({ node, depth, parentPath });
    for (const child of node.children) {
      walk(child, depth + 1, selfPath, selfPath === '.' ? child.name : `${selfPath}/${child.name}`);
    }
  }

  for (const root of roots) {
    walk(root, 0, undefined, '.');
  }

  return result;
}

function emitFlatNode(lines: string[], entry: FlatNodeEntry): void {
  const { node } = entry;
  let line = `[node name="${node.name}" type="${node.type}"`;
  if (entry.parentPath !== undefined) {
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
  // Bare-name index: only usable when the name is unambiguous scene-wide.
  const byName = new Map<string, { node: NodeDefinition; parentPath: string }[]>();
  function indexNodes(nodes: NodeDefinition[], parentPath: string): void {
    for (const node of nodes) {
      const fullPath = parentPath ? `${parentPath}/${node.name}` : node.name;
      const entry = { node, parentPath };
      flatMap.set(fullPath, entry);
      if (!byName.has(node.name)) byName.set(node.name, []);
      byName.get(node.name)!.push(entry);
      indexNodes(node.children, fullPath);
    }
  }
  indexNodes(doc.nodes, '');

  const rootName = doc.nodes[0]?.name;

  /**
   * Resolve a node reference tolerantly. Callers in the wild use several forms:
   *   "Player/Col"      full path from the scene root  (canonical)
   *   "Col"             root-relative path, as written in the .tscn `parent=`
   *   "."  / ""         the scene root itself
   *   "/root/Player/Col" absolute runtime path
   */
  function resolveNode(path: string | undefined): { node: NodeDefinition; parentPath: string } | undefined {
    if (path === undefined) return undefined;
    let p = path.trim();
    if (p === '' || p === '.') return rootName ? flatMap.get(rootName) : undefined;
    if (p.startsWith('/root/')) p = p.slice('/root/'.length);
    p = p.replace(/^\.\//, '').replace(/\/+$/, '');

    const direct = flatMap.get(p);
    if (direct) return direct;
    // Root-relative form ("Col" meaning "<Root>/Col").
    if (rootName) {
      const prefixed = flatMap.get(`${rootName}/${p}`);
      if (prefixed) return prefixed;
    }
    // Unique bare name anywhere in the tree.
    const leaf = p.split('/').pop()!;
    const candidates = byName.get(leaf);
    if (candidates && candidates.length === 1) return candidates[0];
    return undefined;
  }

  /** Resolve an add/clone target parent. "." and the root name both mean the scene root. */
  function resolveParent(path: string | undefined): { node: NodeDefinition; parentPath: string } | undefined {
    if (path === undefined || path === '' || path === '.') {
      return rootName ? flatMap.get(rootName) : undefined;
    }
    return resolveNode(path);
  }

  /** Godot-relative parent value for a node located at `fullPath` (used for `parent=`). */
  function godotParentValue(fullPath: string): string {
    if (!rootName || fullPath === rootName) return '.';
    return fullPath.startsWith(`${rootName}/`) ? fullPath.slice(rootName.length + 1) : fullPath;
  }

  /** Full path of an indexed entry. */
  function fullPathOf(entry: { node: NodeDefinition; parentPath: string }): string {
    return entry.parentPath ? `${entry.parentPath}/${entry.node.name}` : entry.node.name;
  }

  // Apply operations
  for (const op of operations) {
    switch (op.action) {
      case 'add_node': {
        const parentInfo = resolveParent(op.parent_path);
        if (!parentInfo) {
          // Empty scene (or unresolvable parent): the new node becomes the root.
          const newRoot: NodeDefinition = {
            name: op.name || 'NewNode',
            type: op.type || 'Node2D',
            properties: op.properties || {},
            groups: op.groups,
            children: [],
          };
          doc.nodes.push(newRoot);
          doc.nodes = buildNodeHierarchy(doc.nodes);
          break;
        }

        const parentFull = fullPathOf(parentInfo);
        const newNode: NodeDefinition = {
          name: op.name || 'NewNode',
          type: op.type || 'Node2D',
          parent: godotParentValue(parentFull),
          properties: op.properties || {},
          groups: op.groups,
          children: [],
        };
        parentInfo.node.children.push(newNode);
        // Index the newcomer so later operations in the same batch can target it.
        const newFull = `${parentFull}/${newNode.name}`;
        const entry = { node: newNode, parentPath: parentFull };
        flatMap.set(newFull, entry);
        if (!byName.has(newNode.name)) byName.set(newNode.name, []);
        byName.get(newNode.name)!.push(entry);
        break;
      }

      case 'modify_node': {
        if (!op.node_path) continue;
        const info = resolveNode(op.node_path);
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
        const info = resolveNode(op.node_path);
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
        const srcInfo = resolveNode(op.clone_source);
        if (!srcInfo) continue;

        // Deep clone the node
        const clone = deepCloneNode(srcInfo.node);
        clone.name = op.name || `${clone.name}_copy`;

        // Default target: the source's own parent (siblings), else the scene root.
        const parentInfo = op.parent_path !== undefined
          ? resolveParent(op.parent_path)
          : (srcInfo.parentPath ? flatMap.get(srcInfo.parentPath) : undefined);

        if (!parentInfo) {
          // Cloning the root itself has nowhere to go — keep it as a sibling root
          // rather than dropping the operation silently.
          clone.parent = undefined;
          doc.nodes.push(clone);
          break;
        }

        const parentFull = fullPathOf(parentInfo);
        clone.parent = godotParentValue(parentFull);
        parentInfo.node.children.push(clone);
        const cloneEntry = { node: clone, parentPath: parentFull };
        flatMap.set(`${parentFull}/${clone.name}`, cloneEntry);
        if (!byName.has(clone.name)) byName.set(clone.name, []);
        byName.get(clone.name)!.push(cloneEntry);
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
