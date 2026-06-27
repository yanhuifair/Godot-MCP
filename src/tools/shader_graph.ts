// ============================================================
// Godot MCP Server - Visual Shader Graph Tools
// ============================================================
// Create/edit VisualShader .tres graphs: add/remove nodes,
// connect/disconnect ports, set node params, list available
// node types with their default ports and parameter labels.

import { z } from 'zod';
import { ToolResult } from '../utils/types.js';
import { readTextFile, resolveProjectPath, writeTextFile } from '../utils/file_utils.js';
import { parseResource } from '../parsers/resource_parser.js';
import { unquote } from '../parsers/parser_helpers.js';

// ---- Visual Shader Node Type Catalog ----

const SHADER_NODE_CATALOG: Record<string, { category: string; typeName: string; defaultParams: Record<string, string>; inputs: number; outputs: number }> = {
  // Output
  output:          { category: 'Output', typeName: 'VisualShaderNodeOutput', defaultParams: {}, inputs: 7, outputs: 0 },
  // Constants
  float_constant:  { category: 'Constant', typeName: 'VisualShaderNodeFloatConstant', defaultParams: { constant: '0.0' }, inputs: 0, outputs: 1 },
  int_constant:    { category: 'Constant', typeName: 'VisualShaderNodeIntConstant', defaultParams: { constant: '0' }, inputs: 0, outputs: 1 },
  boolean_constant:{ category: 'Constant', typeName: 'VisualShaderNodeBooleanConstant', defaultParams: { constant: 'true' }, inputs: 0, outputs: 1 },
  color_constant:  { category: 'Constant', typeName: 'VisualShaderNodeColorConstant', defaultParams: { constant: 'Color(1, 1, 1, 1)' }, inputs: 0, outputs: 1 },
  vec2_constant:   { category: 'Constant', typeName: 'VisualShaderNodeVec2Constant', defaultParams: { constant: 'Vector2(0, 0)' }, inputs: 0, outputs: 1 },
  vec3_constant:   { category: 'Constant', typeName: 'VisualShaderNodeVec3Constant', defaultParams: { constant: 'Vector3(0, 0, 0)' }, inputs: 0, outputs: 1 },
  // Textures
  texture2d:       { category: 'Texture', typeName: 'VisualShaderNodeTexture2D', defaultParams: {}, inputs: 1, outputs: 3 },
  texture3d:       { category: 'Texture', typeName: 'VisualShaderNodeTexture3D', defaultParams: {}, inputs: 1, outputs: 4 },
  cubemap:         { category: 'Texture', typeName: 'VisualShaderNodeCubemap', defaultParams: {}, inputs: 0, outputs: 1 },
  // Math
  add:             { category: 'Math', typeName: 'VisualShaderNodeVectorOp', defaultParams: { operator: '0' }, inputs: 2, outputs: 1 },
  multiply:        { category: 'Math', typeName: 'VisualShaderNodeVectorOp', defaultParams: { operator: '4' }, inputs: 2, outputs: 1 },
  subtract:        { category: 'Math', typeName: 'VisualShaderNodeVectorOp', defaultParams: { operator: '1' }, inputs: 2, outputs: 1 },
  divide:          { category: 'Math', typeName: 'VisualShaderNodeVectorOp', defaultParams: { operator: '5' }, inputs: 2, outputs: 1 },
  dot:             { category: 'Math', typeName: 'VisualShaderNodeDotProduct', defaultParams: {}, inputs: 2, outputs: 1 },
  cross:           { category: 'Math', typeName: 'VisualShaderNodeVectorOp', defaultParams: { operator: '8' }, inputs: 2, outputs: 1 },
  normalize:       { category: 'Math', typeName: 'VisualShaderNodeVectorOp', defaultParams: { operator: '7' }, inputs: 1, outputs: 1 },
  lerp:            { category: 'Math', typeName: 'VisualShaderNodeVectorOp', defaultParams: { operator: '2' }, inputs: 3, outputs: 1 },
  clamp:           { category: 'Math', typeName: 'VisualShaderNodeClamp', defaultParams: {}, inputs: 3, outputs: 1 },
  abs:             { category: 'Math', typeName: 'VisualShaderNodeVectorOp', defaultParams: { operator: '10' }, inputs: 1, outputs: 1 },
  ceil:            { category: 'Math', typeName: 'VisualShaderNodeVectorOp', defaultParams: { operator: '3' }, inputs: 1, outputs: 1 },
  floor:           { category: 'Math', typeName: 'VisualShaderNodeVectorOp', defaultParams: { operator: '9' }, inputs: 1, outputs: 1 },
  fract:           { category: 'Math', typeName: 'VisualShaderNodeVectorOp', defaultParams: { operator: '6' }, inputs: 1, outputs: 1 },
  sin:             { category: 'Math', typeName: 'VisualShaderNodeVectorOp', defaultParams: { operator: '11' }, inputs: 1, outputs: 1 },
  cos:             { category: 'Math', typeName: 'VisualShaderNodeVectorOp', defaultParams: { operator: '12' }, inputs: 1, outputs: 1 },
  pow:             { category: 'Math', typeName: 'VisualShaderNodeVectorOp', defaultParams: { operator: '13' }, inputs: 2, outputs: 1 },
  // Inputs
  uv:              { category: 'Input', typeName: 'VisualShaderNodeUV', defaultParams: {}, inputs: 0, outputs: 1 },
  time:            { category: 'Input', typeName: 'VisualShaderNodeTime', defaultParams: {}, inputs: 0, outputs: 1 },
  screen_uv:       { category: 'Input', typeName: 'VisualShaderNodeScreenUV', defaultParams: {}, inputs: 0, outputs: 1 },
  fragment_coord:  { category: 'Input', typeName: 'VisualShaderNodeInput', defaultParams: { 'input_type': '5' }, inputs: 0, outputs: 1 },
  camera:          { category: 'Input', typeName: 'VisualShaderNodeInput', defaultParams: { 'input_type': '3' }, inputs: 0, outputs: 1 },
  // Effects
  fresnel:         { category: 'Effect', typeName: 'VisualShaderNodeFresnel', defaultParams: {}, inputs: 3, outputs: 1 },
  noise:           { category: 'Effect', typeName: 'VisualShaderNodeNoise', defaultParams: {}, inputs: 1, outputs: 1 },
  // Conditional
  if_node:         { category: 'Conditional', typeName: 'VisualShaderNodeIf', defaultParams: {}, inputs: 3, outputs: 1 },
  switch_node:     { category: 'Conditional', typeName: 'VisualShaderNodeSwitch', defaultParams: {}, inputs: 3, outputs: 1 },
  compare:         { category: 'Conditional', typeName: 'VisualShaderNodeCompare', defaultParams: {}, inputs: 2, outputs: 1 },
  // Misc
  expression:      { category: 'Custom', typeName: 'VisualShaderNodeExpression', defaultParams: { expression: '"vec3(0.0)"' }, inputs: 0, outputs: 1 },
  comment:         { category: 'UI', typeName: 'VisualShaderNodeComment', defaultParams: { description: '"Comment"' }, inputs: 0, outputs: 0 },
};

// ---- Schemas ----

export const createVisualShaderSchema = {
  path: z.string().describe('Output path for new VisualShader .tres'),
  shader_type: z.enum(['CanvasItem', 'Spatial', 'Particles', 'Sky']).describe('Shader mode'),
};

export const addShaderGraphNodeSchema = {
  path: z.string().describe('Path to VisualShader .tres file'),
  node_type: z.string().describe('Node type shorthand (e.g. "color_constant", "add", "texture2d", "fresnel"). Use list_shader_node_types to see all options.'),
  position: z.array(z.number()).optional().describe('[x, y] position on graph canvas (default: auto-place)'),
  params: z.record(z.string()).optional().describe('Override default params'),
};

export const removeShaderGraphNodeSchema = {
  path: z.string().describe('Path to VisualShader .tres file'),
  node_index: z.number().describe('Node index to remove (0-based, use read_visual_shader to see indices)'),
};

export const connectShaderGraphNodesSchema = {
  path: z.string().describe('Path to VisualShader .tres'),
  from_node: z.number().describe('Source node index'),
  from_port: z.number().describe('Source port index'),
  to_node: z.number().describe('Target node index'),
  to_port: z.number().describe('Target port index'),
};

export const disconnectShaderGraphNodesSchema = {
  path: z.string().describe('Path to VisualShader .tres'),
  from_node: z.number().describe('Source node index'),
  from_port: z.number().describe('Source port index'),
  to_node: z.number().describe('Target node index'),
  to_port: z.number().describe('Target port index'),
};

export const setShaderNodeParamSchema = {
  path: z.string().describe('Path to VisualShader .tres'),
  node_index: z.number().describe('Node index'),
  param: z.string().describe('Parameter name (e.g. "constant", "expression", "operator")'),
  value: z.string().describe('New value'),
};

export const listShaderNodeTypesSchema = {
  category: z.string().optional().describe('Filter by category: Output, Constant, Texture, Math, Input, Effect, Conditional, Custom, UI'),
};

export const getShaderNodeDefaultsSchema = {
  node_type: z.string().describe('Node type shorthand to inspect'),
};

// ---- Helpers ----

function parseVisualShaderNodes(content: string): { count: number; nodeRefs: Map<number, string> } {
  const nodeRefs = new Map<number, string>();
  const nodePattern = /nodes\/(\d+)\/node\s*=\s*(.+)/g;
  let m: RegExpExecArray | null;
  while ((m = nodePattern.exec(content)) !== null) {
    nodeRefs.set(parseInt(m[1]), m[2].trim());
  }
  return { count: nodeRefs.size, nodeRefs };
}

function parseVisualShaderConnections(content: string): string {
  const cm = content.match(/node_connections\s*=\s*\[([\s\S]*?)\]/);
  return cm ? cm[1] : '';
}

function buildConnectionEntry(from: number, fromPort: number, to: number, toPort: number): string {
  return `{"from_node":${from},"from_port":${fromPort},"to_node":${to},"to_port":${toPort}}`;
}

function nextUniqueId(existingSubIds: string[], prefix: string): string {
  let id = prefix;
  let i = 1;
  while (existingSubIds.includes(id)) {
    id = `${prefix}_${i}`;
    i++;
  }
  return id;
}

// ---- Tool Handlers ----

export function handleCreateVisualShader(
  projectRoot: string,
  args: { path: string; shader_type: string }
): ToolResult {
  try {
    const modeMap: Record<string, string> = { 'CanvasItem': 'CanvasItem', 'Spatial': 'Spatial', 'Particles': 'Particles', 'Sky': 'Sky' };
    const mode = modeMap[args.shader_type] || 'Spatial';
    const template = `[gd_resource type="VisualShader" format=3 uid=""]

[resource]
graph_offset = Vector2(0, 0)
node_connections = []
shader_type = "${mode}"
`;

    const absPath = resolveProjectPath(projectRoot, args.path);
    writeTextFile(absPath, template, false);
    return { content: [{ type: 'text', text: `Visual Shader created: ${args.path} (mode: ${mode})` }] };
  } catch (err: any) {
    return { content: [{ type: 'text', text: `Error: ${err.message}` }], isError: true };
  }
}

export function handleAddShaderGraphNode(
  projectRoot: string,
  args: { path: string; node_type: string; position?: number[]; params?: Record<string, string> }
): ToolResult {
  try {
    const absPath = resolveProjectPath(projectRoot, args.path);
    const { content } = readTextFile(absPath);
    const doc = parseResource(content);

    const nodeInfo = SHADER_NODE_CATALOG[args.node_type];
    if (!nodeInfo) {
      return { content: [{ type: 'text', text: `Unknown node type: ${args.node_type}. Use list_shader_node_types to see options.` }], isError: true };
    }

    // Find next node index
    const { nodeRefs } = parseVisualShaderNodes(content);
    const nextIdx = nodeRefs.size > 0 ? Math.max(...nodeRefs.keys()) + 1 : 0;

    // Create sub_resource for the node
    const existingIds = doc.subResources.map((s: any) => unquote(s.id));
    const subId = nextUniqueId(existingIds.length > 0 ? existingIds : [], `${args.node_type}_node`);

    const subProps: Record<string, string> = { ...nodeInfo.defaultParams };
    if (args.params) Object.assign(subProps, args.params);

    // Ensure the new sub_resource is added to the document
    const subList = doc.subResources || [];
    subList.push({ type: nodeInfo.typeName, id: subId, properties: subProps });
    doc.subResources = subList;

    // Position
    const x = args.position?.[0] ?? (200 + (nextIdx % 4) * 250);
    const y = args.position?.[1] ?? (100 + Math.floor(nextIdx / 4) * 150);

    // Add node reference in resource section
    const resource = doc.resource || {};
    resource[`nodes/${nextIdx}/node`] = `SubResource("${subId}")`;
    resource[`nodes/${nextIdx}/position`] = `Vector2(${x}, ${y})`;
    doc.resource = resource;

    // Rebuild the .tres
    let newContent = `[gd_resource type="VisualShader" format=${doc.header?.format || 3}`;
    if (doc.header?.uid) newContent += ` uid="${doc.header.uid}"`;
    newContent += ']\n';

    for (const sub of subList) {
      newContent += `\n[sub_resource type="${unquote(sub.type)}" id="${unquote(sub.id)}"]\n`;
      for (const [k, v] of Object.entries(sub.properties)) {
        newContent += `${k} = ${v}\n`;
      }
    }

    newContent += '\n[resource]\n';
    for (const [key, val] of Object.entries(resource)) {
      newContent += `${key} = ${val}\n`;
    }

    writeTextFile(absPath, newContent, true);
    return { content: [{ type: 'text', text: `Node added [#${nextIdx}] ${args.node_type} (${nodeInfo.category}) at (${x}, ${y})` }] };
  } catch (err: any) {
    return { content: [{ type: 'text', text: `Error: ${err.message}` }], isError: true };
  }
}

export function handleRemoveShaderGraphNode(
  projectRoot: string,
  args: { path: string; node_index: number }
): ToolResult {
  try {
    const absPath = resolveProjectPath(projectRoot, args.path);
    const { content } = readTextFile(absPath);

    // Remove the node entry and its sub_resource reference
    const prefix = `nodes/${args.node_index}/`;
    const lines = content.split('\n');
    const filtered = lines.filter(l => !l.includes(prefix));
    const newContent = filtered.join('\n');

    writeTextFile(absPath, newContent, true);
    return { content: [{ type: 'text', text: `Node [#${args.node_index}] removed from graph` }] };
  } catch (err: any) {
    return { content: [{ type: 'text', text: `Error: ${err.message}` }], isError: true };
  }
}

export function handleConnectShaderGraphNodes(
  projectRoot: string,
  args: { path: string; from_node: number; from_port: number; to_node: number; to_port: number }
): ToolResult {
  try {
    const absPath = resolveProjectPath(projectRoot, args.path);
    const { content } = readTextFile(absPath);

    const connectionStr = buildConnectionEntry(args.from_node, args.from_port, args.to_node, args.to_port);

    let newContent: string;
    if (content.includes('node_connections = [')) {
      const existing = parseVisualShaderConnections(content);
      if (existing.trim()) {
        // Add to existing connections
        newContent = content.replace(/node_connections\s*=\s*\[([\s\S]*?)\]/, `node_connections = [$1,\n${connectionStr}]`);
      } else {
        newContent = content.replace('node_connections = [', `node_connections = [\n${connectionStr}`);
      }
    } else {
      // Add connections line
      newContent = content + `\nnode_connections = [\n${connectionStr}\n]\n`;
    }

    writeTextFile(absPath, newContent, true);
    return { content: [{ type: 'text', text: `Connected: node#${args.from_node}:${args.from_port} → node#${args.to_node}:${args.to_port}` }] };
  } catch (err: any) {
    return { content: [{ type: 'text', text: `Error: ${err.message}` }], isError: true };
  }
}

export function handleDisconnectShaderGraphNodes(
  projectRoot: string,
  args: { path: string; from_node: number; from_port: number; to_node: number; to_port: number }
): ToolResult {
  try {
    const absPath = resolveProjectPath(projectRoot, args.path);
    const { content } = readTextFile(absPath);

    const toRemove = `"from_node":${args.from_node},"from_port":${args.from_port},"to_node":${args.to_node},"to_port":${args.to_port}`;
    const connSection = content.match(/(node_connections\s*=\s*\[)([\s\S]*?)(\])/);
    if (connSection) {
      const before = connSection[1];
      const entries = connSection[2];
      const after = connSection[3];
      const filtered = entries
        .split(/\},\s*/)
        .filter(e => e.trim() && !e.includes(toRemove))
        .join('},') + '}';
      const newConns = filtered === '}' ? '' : filtered;
      const replacement = before + newConns + after;
      const newContent = content.replace(/node_connections\s*=\s*\[[\s\S]*?\]/, replacement);
      writeTextFile(absPath, newContent, true);
    }

    return { content: [{ type: 'text', text: `Disconnected: node#${args.from_node}:${args.from_port}` }] };
  } catch (err: any) {
    return { content: [{ type: 'text', text: `Error: ${err.message}` }], isError: true };
  }
}

export function handleSetShaderNodeParam(
  projectRoot: string,
  args: { path: string; node_index: number; param: string; value: string }
): ToolResult {
  try {
    const absPath = resolveProjectPath(projectRoot, args.path);
    const { content } = readTextFile(absPath);
    const doc = parseResource(content);

    // Find the sub_resource for this node
    const nodeRef = doc.resource[`nodes/${args.node_index}/node`];
    if (!nodeRef) {
      return { content: [{ type: 'text', text: `Node [#${args.node_index}] not found in graph` }], isError: true };
    }

    const subIdMatch = typeof nodeRef === 'string' ? nodeRef.match(/SubResource\("([^"]+)"\)/) : null;
    if (!subIdMatch) {
      return { content: [{ type: 'text', text: `Cannot resolve sub_resource for node [#${args.node_index}]` }], isError: true };
    }

    const subId = subIdMatch[1];
    const sub = doc.subResources?.find((s: any) => unquote(s.id) === subId);
    if (!sub) {
      return { content: [{ type: 'text', text: `Sub-resource ${subId} not found` }], isError: true };
    }

    sub.properties[args.param] = args.value;

    // Rebuild — simple text replacement approach
    let newContent = content;
    const oldLine = `${args.param} = `;
    const lines = newContent.split('\n');
    // Find the sub_resource section and update the param
    let inSub = false;
    const result: string[] = [];
    for (const line of lines) {
      if (line.trim().startsWith(`[sub_resource`) && line.includes(subId)) inSub = true;
      else if (line.trim().startsWith('[') && inSub) inSub = false;

      if (inSub && line.trim().startsWith(`${args.param} =`)) {
        result.push(`${args.param} = ${args.value}`);
      } else {
        result.push(line);
      }
    }

    writeTextFile(absPath, result.join('\n'), true);
    return { content: [{ type: 'text', text: `Shader node [#${args.node_index}]: ${args.param} = ${args.value}` }] };
  } catch (err: any) {
    return { content: [{ type: 'text', text: `Error: ${err.message}` }], isError: true };
  }
}

export function handleListShaderNodeTypes(args: { category?: string }): ToolResult {
  try {
    let nodes = Object.entries(SHADER_NODE_CATALOG);
    if (args.category) {
      nodes = nodes.filter(([, info]) => info.category === args.category);
    }

    const byCategory: Record<string, typeof nodes> = {};
    for (const [key, info] of nodes) {
      (byCategory[info.category] ||= []).push([key, info]);
    }

    const lines: string[] = [`Visual Shader Node Types (${nodes.length}):`, ''];
    for (const [cat, items] of Object.entries(byCategory)) {
      lines.push(`  ${cat}:`);
      for (const [key, info] of items) {
        lines.push(`    ${key.padEnd(18)} — ${info.typeName}  (in:${info.inputs}, out:${info.outputs})`);
      }
      lines.push('');
    }

    return { content: [{ type: 'text', text: lines.join('\n') }] };
  } catch (err: any) {
    return { content: [{ type: 'text', text: `Error: ${err.message}` }], isError: true };
  }
}

export function handleGetShaderNodeDefaults(_projectRoot: string, args: { node_type: string }): ToolResult {
  try {
    const info = SHADER_NODE_CATALOG[args.node_type];
    if (!info) {
      return { content: [{ type: 'text', text: `Unknown node type: ${args.node_type}` }], isError: true };
    }
    const lines = [
      `${args.node_type} — ${info.typeName}`,
      `Category: ${info.category}`,
      `Inputs: ${info.inputs}  |  Outputs: ${info.outputs}`,
      '',
      'Default Params:',
    ];
    for (const [k, v] of Object.entries(info.defaultParams)) {
      lines.push(`  ${k} = ${v}`);
    }
    return { content: [{ type: 'text', text: lines.join('\n') }] };
  } catch (err: any) {
    return { content: [{ type: 'text', text: `Error: ${err.message}` }], isError: true };
  }
}
