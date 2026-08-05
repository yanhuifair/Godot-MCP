// Copyright (c) 2026 FairYan
// SPDX-License-Identifier: AGPL-3.0-or-later
// ============================================================
// Godot MCP Server - Visual Shader Graph Tools
// ============================================================
// Create/edit VisualShader .tres graphs: add/remove nodes,
// connect/disconnect ports, set node params, list available
// node types with their default ports and parameter labels.
//
// Serialization follows the exact on-disk format produced by
// Godot 4.x `ResourceSaver.save(VisualShader)`:
//
//   [gd_resource type="VisualShader" format=3]
//
//   [sub_resource type="VisualShaderNodeColorConstant" id="..."]
//   constant = Color(0.2, 0.4, 0.9, 1)
//
//   [resource]
//   mode = 1
//   nodes/fragment/2/node = SubResource("...")
//   nodes/fragment/2/position = Vector2(-300, 0)
//   nodes/fragment/connections = PackedInt32Array(2, 0, 0, 0)
//
// Hard engine constraints encoded here:
//   * `mode` is an INTEGER (Shader.Mode), not a `shader_type` string.
//   * Node keys are namespaced per shader stage (`nodes/<stage>/<id>/...`).
//   * Connections live in `nodes/<stage>/connections` as a flat
//     PackedInt32Array of (from_node, from_port, to_node, to_port).
//   * Node id 0 is the implicit Output node and id 1 is reserved;
//     `VisualShader::add_node()` rejects any id < 2, so a graph that
//     stores a node at index 0/1 silently loses it on load.

import { z } from 'zod';
import { toolError, ErrorCode } from '../utils/errors.js';
import { ToolResult } from '../utils/types.js';
import { readTextFile, resolveProjectPath, writeTextFile } from '../utils/file_utils.js';
import { unquote, isValueBalanced } from '../parsers/parser_helpers.js';

// ---- Shader modes & stages (verified against Godot 4.7.1) ----

/** Shader.Mode enum values as serialized into `mode = N`. */
export const SHADER_MODES: Record<string, number> = {
  Spatial: 0,
  CanvasItem: 1,
  Particles: 2,
  Sky: 3,
  Fog: 4,
};

const MODE_LABELS = ['Spatial', 'CanvasItem', 'Particles', 'Sky', 'Fog'];

/** VisualShader.Type -> serialized stage key, in engine declaration order. */
export const STAGE_KEYS = [
  'vertex', 'fragment', 'light',
  'start', 'process', 'collide',
  'start_custom', 'process_custom',
  'sky', 'fog',
];

/** Which stages are legal for each shader mode. */
export const MODE_STAGES: Record<number, string[]> = {
  0: ['vertex', 'fragment', 'light'],
  1: ['vertex', 'fragment', 'light'],
  2: ['start', 'process', 'collide', 'start_custom', 'process_custom'],
  3: ['sky'],
  4: ['fog'],
};

/** Stage used when the caller does not specify one. */
const DEFAULT_STAGE: Record<number, string> = {
  0: 'fragment',
  1: 'fragment',
  2: 'process',
  3: 'sky',
  4: 'fog',
};

/** `VisualShader::add_node()` refuses ids below this. */
const FIRST_NODE_ID = 2;

// ---- Visual Shader Node Type Catalog ----
// Every `typeName` below was verified with ClassDB.can_instantiate()
// on Godot 4.7.1. Operator/function numbers come from the engine enums.

interface ShaderNodeSpec {
  category: string;
  typeName: string;
  defaultParams: Record<string, string>;
  inputs: number;
  outputs: number;
}

const SHADER_NODE_CATALOG: Record<string, ShaderNodeSpec> = {
  // -- Constants --
  float_constant:   { category: 'Constant', typeName: 'VisualShaderNodeFloatConstant',   defaultParams: { constant: '0.0' }, inputs: 0, outputs: 1 },
  int_constant:     { category: 'Constant', typeName: 'VisualShaderNodeIntConstant',     defaultParams: { constant: '0' }, inputs: 0, outputs: 1 },
  uint_constant:    { category: 'Constant', typeName: 'VisualShaderNodeUIntConstant',    defaultParams: { constant: '0' }, inputs: 0, outputs: 1 },
  boolean_constant: { category: 'Constant', typeName: 'VisualShaderNodeBooleanConstant', defaultParams: { constant: 'false' }, inputs: 0, outputs: 1 },
  color_constant:   { category: 'Constant', typeName: 'VisualShaderNodeColorConstant',   defaultParams: { constant: 'Color(1, 1, 1, 1)' }, inputs: 0, outputs: 2 },
  vec2_constant:    { category: 'Constant', typeName: 'VisualShaderNodeVec2Constant',    defaultParams: { constant: 'Vector2(0, 0)' }, inputs: 0, outputs: 1 },
  vec3_constant:    { category: 'Constant', typeName: 'VisualShaderNodeVec3Constant',    defaultParams: { constant: 'Vector3(0, 0, 0)' }, inputs: 0, outputs: 1 },
  // Vec4Constant.constant is a Quaternion, not a Vector4.
  vec4_constant:    { category: 'Constant', typeName: 'VisualShaderNodeVec4Constant',    defaultParams: { constant: 'Quaternion(0, 0, 0, 1)' }, inputs: 0, outputs: 1 },

  // -- Textures --
  texture:   { category: 'Texture', typeName: 'VisualShaderNodeTexture',   defaultParams: {}, inputs: 3, outputs: 2 },
  texture2d: { category: 'Texture', typeName: 'VisualShaderNodeTexture',   defaultParams: {}, inputs: 3, outputs: 2 },
  texture3d: { category: 'Texture', typeName: 'VisualShaderNodeTexture3D', defaultParams: {}, inputs: 3, outputs: 2 },
  cubemap:   { category: 'Texture', typeName: 'VisualShaderNodeCubemap',   defaultParams: {}, inputs: 3, outputs: 2 },

  // -- Vector math (VisualShaderNodeVectorOp.Operator) --
  add:      { category: 'Math', typeName: 'VisualShaderNodeVectorOp', defaultParams: { operator: '0' }, inputs: 2, outputs: 1 },
  subtract: { category: 'Math', typeName: 'VisualShaderNodeVectorOp', defaultParams: { operator: '1' }, inputs: 2, outputs: 1 },
  multiply: { category: 'Math', typeName: 'VisualShaderNodeVectorOp', defaultParams: { operator: '2' }, inputs: 2, outputs: 1 },
  divide:   { category: 'Math', typeName: 'VisualShaderNodeVectorOp', defaultParams: { operator: '3' }, inputs: 2, outputs: 1 },
  modulo:   { category: 'Math', typeName: 'VisualShaderNodeVectorOp', defaultParams: { operator: '4' }, inputs: 2, outputs: 1 },
  pow:      { category: 'Math', typeName: 'VisualShaderNodeVectorOp', defaultParams: { operator: '5' }, inputs: 2, outputs: 1 },
  max:      { category: 'Math', typeName: 'VisualShaderNodeVectorOp', defaultParams: { operator: '6' }, inputs: 2, outputs: 1 },
  min:      { category: 'Math', typeName: 'VisualShaderNodeVectorOp', defaultParams: { operator: '7' }, inputs: 2, outputs: 1 },
  cross:    { category: 'Math', typeName: 'VisualShaderNodeVectorOp', defaultParams: { operator: '8' }, inputs: 2, outputs: 1 },
  atan2:    { category: 'Math', typeName: 'VisualShaderNodeVectorOp', defaultParams: { operator: '9' }, inputs: 2, outputs: 1 },
  reflect:  { category: 'Math', typeName: 'VisualShaderNodeVectorOp', defaultParams: { operator: '10' }, inputs: 2, outputs: 1 },
  step:     { category: 'Math', typeName: 'VisualShaderNodeVectorOp', defaultParams: { operator: '11' }, inputs: 2, outputs: 1 },

  // -- Vector functions (VisualShaderNodeVectorFunc.Function) --
  normalize: { category: 'Math', typeName: 'VisualShaderNodeVectorFunc', defaultParams: { function: '0' }, inputs: 1, outputs: 1 },
  saturate:  { category: 'Math', typeName: 'VisualShaderNodeVectorFunc', defaultParams: { function: '1' }, inputs: 1, outputs: 1 },
  negate:    { category: 'Math', typeName: 'VisualShaderNodeVectorFunc', defaultParams: { function: '2' }, inputs: 1, outputs: 1 },
  abs:       { category: 'Math', typeName: 'VisualShaderNodeVectorFunc', defaultParams: { function: '4' }, inputs: 1, outputs: 1 },
  ceil:      { category: 'Math', typeName: 'VisualShaderNodeVectorFunc', defaultParams: { function: '11' }, inputs: 1, outputs: 1 },
  cos:       { category: 'Math', typeName: 'VisualShaderNodeVectorFunc', defaultParams: { function: '12' }, inputs: 1, outputs: 1 },
  floor:     { category: 'Math', typeName: 'VisualShaderNodeVectorFunc', defaultParams: { function: '17' }, inputs: 1, outputs: 1 },
  fract:     { category: 'Math', typeName: 'VisualShaderNodeVectorFunc', defaultParams: { function: '18' }, inputs: 1, outputs: 1 },
  round:     { category: 'Math', typeName: 'VisualShaderNodeVectorFunc', defaultParams: { function: '23' }, inputs: 1, outputs: 1 },
  sign:      { category: 'Math', typeName: 'VisualShaderNodeVectorFunc', defaultParams: { function: '25' }, inputs: 1, outputs: 1 },
  sin:       { category: 'Math', typeName: 'VisualShaderNodeVectorFunc', defaultParams: { function: '26' }, inputs: 1, outputs: 1 },
  sqrt:      { category: 'Math', typeName: 'VisualShaderNodeVectorFunc', defaultParams: { function: '28' }, inputs: 1, outputs: 1 },
  tan:       { category: 'Math', typeName: 'VisualShaderNodeVectorFunc', defaultParams: { function: '29' }, inputs: 1, outputs: 1 },
  one_minus: { category: 'Math', typeName: 'VisualShaderNodeVectorFunc', defaultParams: { function: '32' }, inputs: 1, outputs: 1 },

  // -- Scalar math (VisualShaderNodeFloatOp / FloatFunc) --
  float_add:      { category: 'Scalar', typeName: 'VisualShaderNodeFloatOp',   defaultParams: { operator: '0' }, inputs: 2, outputs: 1 },
  float_subtract: { category: 'Scalar', typeName: 'VisualShaderNodeFloatOp',   defaultParams: { operator: '1' }, inputs: 2, outputs: 1 },
  float_multiply: { category: 'Scalar', typeName: 'VisualShaderNodeFloatOp',   defaultParams: { operator: '2' }, inputs: 2, outputs: 1 },
  float_divide:   { category: 'Scalar', typeName: 'VisualShaderNodeFloatOp',   defaultParams: { operator: '3' }, inputs: 2, outputs: 1 },
  float_pow:      { category: 'Scalar', typeName: 'VisualShaderNodeFloatOp',   defaultParams: { operator: '5' }, inputs: 2, outputs: 1 },
  float_sin:      { category: 'Scalar', typeName: 'VisualShaderNodeFloatFunc', defaultParams: { function: '0' }, inputs: 1, outputs: 1 },
  float_cos:      { category: 'Scalar', typeName: 'VisualShaderNodeFloatFunc', defaultParams: { function: '1' }, inputs: 1, outputs: 1 },
  float_abs:      { category: 'Scalar', typeName: 'VisualShaderNodeFloatFunc', defaultParams: { function: '12' }, inputs: 1, outputs: 1 },

  // -- Mixed math --
  dot:              { category: 'Math', typeName: 'VisualShaderNodeDotProduct',      defaultParams: {}, inputs: 2, outputs: 1 },
  clamp:            { category: 'Math', typeName: 'VisualShaderNodeClamp',           defaultParams: {}, inputs: 3, outputs: 1 },
  lerp:             { category: 'Math', typeName: 'VisualShaderNodeMix',             defaultParams: {}, inputs: 3, outputs: 1 },
  mix:              { category: 'Math', typeName: 'VisualShaderNodeMix',             defaultParams: {}, inputs: 3, outputs: 1 },
  smoothstep:       { category: 'Math', typeName: 'VisualShaderNodeSmoothStep',      defaultParams: {}, inputs: 3, outputs: 1 },
  remap:            { category: 'Math', typeName: 'VisualShaderNodeRemap',           defaultParams: {}, inputs: 5, outputs: 1 },
  vector_len:       { category: 'Math', typeName: 'VisualShaderNodeVectorLen',       defaultParams: {}, inputs: 1, outputs: 1 },
  vector_distance:  { category: 'Math', typeName: 'VisualShaderNodeVectorDistance',  defaultParams: {}, inputs: 2, outputs: 1 },
  vector_compose:   { category: 'Math', typeName: 'VisualShaderNodeVectorCompose',   defaultParams: {}, inputs: 3, outputs: 1 },
  vector_decompose: { category: 'Math', typeName: 'VisualShaderNodeVectorDecompose', defaultParams: {}, inputs: 1, outputs: 3 },

  // -- Colour --
  color_func: { category: 'Color', typeName: 'VisualShaderNodeColorFunc', defaultParams: { function: '0' }, inputs: 1, outputs: 1 },
  color_op:   { category: 'Color', typeName: 'VisualShaderNodeColorOp',   defaultParams: { operator: '0' }, inputs: 2, outputs: 1 },

  // -- Inputs (all are VisualShaderNodeInput; `input_name` selects the builtin) --
  uv:              { category: 'Input', typeName: 'VisualShaderNodeInput', defaultParams: { input_name: '"uv"' }, inputs: 0, outputs: 1 },
  uv2:             { category: 'Input', typeName: 'VisualShaderNodeInput', defaultParams: { input_name: '"uv2"' }, inputs: 0, outputs: 1 },
  time:            { category: 'Input', typeName: 'VisualShaderNodeInput', defaultParams: { input_name: '"time"' }, inputs: 0, outputs: 1 },
  screen_uv:       { category: 'Input', typeName: 'VisualShaderNodeInput', defaultParams: { input_name: '"screen_uv"' }, inputs: 0, outputs: 1 },
  vertex_input:    { category: 'Input', typeName: 'VisualShaderNodeInput', defaultParams: { input_name: '"vertex"' }, inputs: 0, outputs: 1 },
  normal_input:    { category: 'Input', typeName: 'VisualShaderNodeInput', defaultParams: { input_name: '"normal"' }, inputs: 0, outputs: 1 },
  color_input:     { category: 'Input', typeName: 'VisualShaderNodeInput', defaultParams: { input_name: '"color"' }, inputs: 0, outputs: 1 },
  fragment_coord:  { category: 'Input', typeName: 'VisualShaderNodeInput', defaultParams: { input_name: '"fragcoord"' }, inputs: 0, outputs: 1 },
  camera:          { category: 'Input', typeName: 'VisualShaderNodeInput', defaultParams: { input_name: '"camera_position_world"' }, inputs: 0, outputs: 1 },
  // Generic escape hatch: pass params:{input_name:"\"<builtin>\""}
  input:           { category: 'Input', typeName: 'VisualShaderNodeInput', defaultParams: { input_name: '"uv"' }, inputs: 0, outputs: 1 },

  // -- Effects --
  fresnel: { category: 'Effect', typeName: 'VisualShaderNodeFresnel', defaultParams: {}, inputs: 4, outputs: 1 },

  // -- Conditional --
  if_node:     { category: 'Conditional', typeName: 'VisualShaderNodeIf',      defaultParams: {}, inputs: 6, outputs: 1 },
  switch_node: { category: 'Conditional', typeName: 'VisualShaderNodeSwitch',  defaultParams: {}, inputs: 3, outputs: 1 },
  compare:     { category: 'Conditional', typeName: 'VisualShaderNodeCompare', defaultParams: { function: '0' }, inputs: 3, outputs: 1 },

  // -- Custom / UI --
  expression: { category: 'Custom', typeName: 'VisualShaderNodeExpression', defaultParams: { expression: '""' }, inputs: 0, outputs: 1 },
  frame:      { category: 'UI',     typeName: 'VisualShaderNodeFrame',      defaultParams: { title: '"Frame"' }, inputs: 0, outputs: 0 },
  // VisualShaderNodeComment was removed in Godot 4.3; Frame replaces it.
  comment:    { category: 'UI',     typeName: 'VisualShaderNodeFrame',      defaultParams: { title: '"Comment"' }, inputs: 0, outputs: 0 },
};

/** Shorthands that used to exist but map to classes Godot 4 does not have. */
const REMOVED_NODE_TYPES: Record<string, string> = {
  output: 'The output node is implicit: every VisualShader stage already owns node index 0. Connect into node 0 instead of adding one.',
  noise: 'Godot 4 has no VisualShaderNodeNoise. Use "texture" with a NoiseTexture2D assigned to its sampler port.',
};

// ---- Schemas ----

export const createVisualShaderSchema = {
  path: z.string().describe('Output path for new VisualShader .tres'),
  shader_type: z.enum(['CanvasItem', 'Spatial', 'Particles', 'Sky', 'Fog']).describe('Shader mode'),
};

export const addShaderGraphNodeSchema = {
  path: z.string().describe('Path to VisualShader .tres file'),
  node_type: z.string().describe('Node type shorthand (e.g. "color_constant", "multiply", "texture", "fresnel"). Use list_shader_node_types to see all options.'),
  position: z.array(z.number()).optional().describe('[x, y] position on graph canvas (default: auto-place)'),
  params: z.record(z.string()).optional().describe('Override default params. Values are raw Godot literals, so strings need embedded quotes: {"input_name": "\\"uv\\""}'),
  shader_stage: z.string().optional().describe('Shader stage: vertex/fragment/light (Spatial, CanvasItem), start/process/collide (Particles), sky, fog. Defaults to the main stage for the shader mode.'),
};

export const removeShaderGraphNodeSchema = {
  path: z.string().describe('Path to VisualShader .tres file'),
  node_index: z.number().describe('Node index to remove (>= 2; use read_visual_shader to see indices)'),
  shader_stage: z.string().optional().describe('Shader stage the node lives in (default: main stage for the shader mode)'),
};

export const connectShaderGraphNodesSchema = {
  path: z.string().describe('Path to VisualShader .tres'),
  from_node: z.number().describe('Source node index'),
  from_port: z.number().describe('Source port index'),
  to_node: z.number().describe('Target node index (0 = the built-in output node)'),
  to_port: z.number().describe('Target port index'),
  shader_stage: z.string().optional().describe('Shader stage (default: main stage for the shader mode)'),
};

export const disconnectShaderGraphNodesSchema = {
  path: z.string().describe('Path to VisualShader .tres'),
  from_node: z.number().describe('Source node index'),
  from_port: z.number().describe('Source port index'),
  to_node: z.number().describe('Target node index'),
  to_port: z.number().describe('Target port index'),
  shader_stage: z.string().optional().describe('Shader stage (default: main stage for the shader mode)'),
};

export const setShaderNodeParamSchema = {
  path: z.string().describe('Path to VisualShader .tres'),
  node_index: z.number().describe('Node index'),
  param: z.string().describe('Parameter name (e.g. "constant", "expression", "operator")'),
  value: z.string().describe('New value as a raw Godot literal (e.g. "2", "Color(1, 0, 0, 1)", "\\"uv\\"")'),
  shader_stage: z.string().optional().describe('Shader stage (default: main stage for the shader mode)'),
};

export const listShaderNodeTypesSchema = {
  category: z.string().optional().describe('Filter by category: Constant, Texture, Math, Scalar, Color, Input, Effect, Conditional, Custom, UI'),
};

export const getShaderNodeDefaultsSchema = {
  node_type: z.string().describe('Node type shorthand to inspect'),
};

// ---- VisualShader document model ----

export interface VisualShaderSub {
  type: string;
  id: string;
  props: Record<string, string>;
  order: string[];
}

export interface VisualShaderDoc {
  format: number;
  uid?: string;
  subs: VisualShaderSub[];
  res: Record<string, string>;
  resOrder: string[];
}

const HEADER_ATTR_RE = /(\w+)\s*=\s*("(?:[^"\\]|\\.)*"|[^\s\]]+)/g;

function parseHeaderAttrs(inner: string): Record<string, string> {
  const out: Record<string, string> = {};
  let m: RegExpExecArray | null;
  HEADER_ATTR_RE.lastIndex = 0;
  while ((m = HEADER_ATTR_RE.exec(inner)) !== null) {
    out[m[1]] = unquote(m[2]);
  }
  return out;
}

/**
 * Parse a VisualShader `.tres` into an editable model.
 * Multi-line property values (e.g. an Expression body) are folded back
 * into a single logical value using bracket/quote balancing.
 */
export function parseVisualShaderDoc(content: string): VisualShaderDoc {
  const doc: VisualShaderDoc = { format: 3, subs: [], res: {}, resOrder: [] };
  const lines = content.split(/\r?\n/);

  type Target = { props: Record<string, string>; order: string[] } | null;
  let target: Target = null;

  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i];
    const trimmed = raw.trim();
    if (!trimmed) continue;

    if (trimmed.startsWith('[') && trimmed.endsWith(']')) {
      const inner = trimmed.slice(1, -1);
      const kind = inner.split(/\s+/)[0];
      if (kind === 'gd_resource') {
        const attrs = parseHeaderAttrs(inner.slice(kind.length));
        if (attrs.format) doc.format = parseInt(attrs.format, 10) || 3;
        if (attrs.uid) doc.uid = attrs.uid;
        target = null;
      } else if (kind === 'sub_resource') {
        const attrs = parseHeaderAttrs(inner.slice(kind.length));
        const sub: VisualShaderSub = {
          type: attrs.type || '',
          id: attrs.id || '',
          props: {},
          order: [],
        };
        doc.subs.push(sub);
        target = { props: sub.props, order: sub.order };
      } else if (kind === 'resource') {
        target = { props: doc.res, order: doc.resOrder };
      } else {
        target = null;
      }
      continue;
    }

    if (!target) continue;

    const eq = trimmed.indexOf('=');
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();

    // Fold continuation lines for multi-line literals.
    while (!isValueBalanced(value) && i + 1 < lines.length) {
      i++;
      value += '\n' + lines[i];
    }

    if (!(key in target.props)) target.order.push(key);
    target.props[key] = value;
  }

  return doc;
}

/**
 * Order `[resource]` keys the way Godot writes them:
 * mode, flags/*, graph_offset, then per-stage nodes (numerically) and
 * that stage's connections, then anything unrecognised.
 */
function orderedResourceKeys(doc: VisualShaderDoc): string[] {
  const remaining = new Set(Object.keys(doc.res));
  const out: string[] = [];
  const take = (k: string) => {
    if (remaining.has(k)) { out.push(k); remaining.delete(k); }
  };

  take('mode');
  for (const k of doc.resOrder) if (remaining.has(k) && k.startsWith('flags/')) take(k);
  for (const k of [...remaining].filter(k => k.startsWith('flags/')).sort()) take(k);
  take('graph_offset');

  for (const stage of STAGE_KEYS) {
    const prefix = `nodes/${stage}/`;
    const ids = new Set<number>();
    for (const k of remaining) {
      if (!k.startsWith(prefix)) continue;
      const m = k.slice(prefix.length).match(/^(\d+)\//);
      if (m) ids.add(parseInt(m[1], 10));
    }
    for (const id of [...ids].sort((a, b) => a - b)) {
      const np = `${prefix}${id}/`;
      take(`${np}node`);
      take(`${np}position`);
      for (const k of [...remaining].filter(k => k.startsWith(np)).sort()) take(k);
    }
    take(`${prefix}connections`);
    for (const k of [...remaining].filter(k => k.startsWith(prefix)).sort()) take(k);
  }

  for (const k of doc.resOrder) if (remaining.has(k)) take(k);
  for (const k of [...remaining].sort()) take(k);
  return out;
}

/** Serialize back to Godot's exact `.tres` layout. */
export function serializeVisualShaderDoc(doc: VisualShaderDoc): string {
  let out = `[gd_resource type="VisualShader" format=${doc.format}`;
  if (doc.uid) out += ` uid="${doc.uid}"`;
  out += ']\n';

  for (const sub of doc.subs) {
    out += `\n[sub_resource type="${sub.type}" id="${sub.id}"]\n`;
    const keys = sub.order.filter(k => k in sub.props);
    for (const k of Object.keys(sub.props)) if (!keys.includes(k)) keys.push(k);
    for (const k of keys) out += `${k} = ${sub.props[k]}\n`;
  }

  out += '\n[resource]\n';
  for (const k of orderedResourceKeys(doc)) out += `${k} = ${doc.res[k]}\n`;
  return out;
}

// ---- Stage / connection helpers ----

function docMode(doc: VisualShaderDoc): number {
  const raw = doc.res['mode'];
  const n = raw === undefined ? 0 : parseInt(raw, 10);
  return Number.isFinite(n) && n >= 0 && n <= 4 ? n : 0;
}

function resolveStage(doc: VisualShaderDoc, requested?: string): { stage: string } | { error: ToolResult } {
  const mode = docMode(doc);
  const allowed = MODE_STAGES[mode];
  if (!requested) return { stage: DEFAULT_STAGE[mode] };
  const stage = requested.trim().toLowerCase();
  if (!allowed.includes(stage)) {
    return {
      error: toolError(
        ErrorCode.INVALID_ARGUMENT,
        `Stage "${requested}" is not valid for a ${MODE_LABELS[mode]} shader. Allowed: ${allowed.join(', ')}`
      ),
    };
  }
  return { stage };
}

export function parseConnectionArray(value: string | undefined): number[] {
  if (!value) return [];
  const m = value.match(/PackedInt32Array\(([^)]*)\)/);
  if (!m) return [];
  return m[1]
    .split(',')
    .map(s => s.trim())
    .filter(s => s.length > 0)
    .map(Number)
    .filter(n => Number.isFinite(n));
}

function formatConnectionArray(nums: number[]): string {
  return `PackedInt32Array(${nums.join(', ')})`;
}

/** Collect the node ids present in one stage. */
function stageNodeIds(doc: VisualShaderDoc, stage: string): number[] {
  const prefix = `nodes/${stage}/`;
  const ids = new Set<number>();
  for (const k of Object.keys(doc.res)) {
    if (!k.startsWith(prefix)) continue;
    const m = k.slice(prefix.length).match(/^(\d+)\/node$/);
    if (m) ids.add(parseInt(m[1], 10));
  }
  return [...ids].sort((a, b) => a - b);
}

function subIdOfNode(doc: VisualShaderDoc, stage: string, id: number): string | undefined {
  const ref = doc.res[`nodes/${stage}/${id}/node`];
  return ref?.match(/SubResource\("([^"]+)"\)/)?.[1];
}

/** Godot-style unique sub-resource id: `<ClassName>_<suffix>`. */
function uniqueSubId(doc: VisualShaderDoc, typeName: string): string {
  const used = new Set(doc.subs.map(s => s.id));
  const short = typeName.replace(/^VisualShaderNode/, '') || 'Node';
  for (let i = 1; i < 10000; i++) {
    const candidate = `${short}_${i}`;
    if (!used.has(candidate)) return candidate;
  }
  return `${short}_${Date.now()}`;
}

/** Drop sub-resources that are no longer referenced by any node. */
function pruneOrphanSubs(doc: VisualShaderDoc): void {
  const referenced = new Set<string>();
  for (const value of Object.values(doc.res)) {
    const re = /SubResource\("([^"]+)"\)/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(value)) !== null) referenced.add(m[1]);
  }
  for (const sub of doc.subs) {
    for (const value of Object.values(sub.props)) {
      const re = /SubResource\("([^"]+)"\)/g;
      let m: RegExpExecArray | null;
      while ((m = re.exec(value)) !== null) referenced.add(m[1]);
    }
  }
  doc.subs = doc.subs.filter(s => referenced.has(s.id));
}

function setResKey(doc: VisualShaderDoc, key: string, value: string): void {
  if (!(key in doc.res)) doc.resOrder.push(key);
  doc.res[key] = value;
}

function loadDoc(projectRoot: string, path: string): { absPath: string; doc: VisualShaderDoc } {
  const absPath = resolveProjectPath(projectRoot, path);
  const { content } = readTextFile(absPath);
  return { absPath, doc: parseVisualShaderDoc(content) };
}

// ---- Tool Handlers ----

export function handleCreateVisualShader(
  projectRoot: string,
  args: { path: string; shader_type: string }
): ToolResult {
  try {
    const key = Object.keys(SHADER_MODES).find(
      k => k.toLowerCase() === String(args.shader_type).toLowerCase()
    );
    if (key === undefined) {
      return toolError(
        ErrorCode.INVALID_ARGUMENT,
        `Unknown shader_type "${args.shader_type}". Valid: ${Object.keys(SHADER_MODES).join(', ')}`
      );
    }
    const mode = SHADER_MODES[key];

    const doc: VisualShaderDoc = { format: 3, subs: [], res: {}, resOrder: [] };
    setResKey(doc, 'mode', String(mode));

    const absPath = resolveProjectPath(projectRoot, args.path);
    writeTextFile(absPath, serializeVisualShaderDoc(doc), false);
    return {
      content: [{
        type: 'text',
        text: `Visual Shader created: ${args.path}\n  mode = ${mode} (${key})\n  stages: ${MODE_STAGES[mode].join(', ')}\n  node index 0 is the built-in output; new nodes start at ${FIRST_NODE_ID}`,
      }],
    };
  } catch (err: any) {
    return toolError(ErrorCode.INTERNAL_ERROR, `Error: ${err.message}`);
  }
}

export function handleAddShaderGraphNode(
  projectRoot: string,
  args: { path: string; node_type: string; position?: number[]; params?: Record<string, string>; shader_stage?: string }
): ToolResult {
  try {
    const removed = REMOVED_NODE_TYPES[args.node_type];
    if (removed) return toolError(ErrorCode.INVALID_ARGUMENT, `"${args.node_type}" is not addable. ${removed}`);

    const spec = SHADER_NODE_CATALOG[args.node_type];
    if (!spec) {
      return toolError(
        ErrorCode.INVALID_ARGUMENT,
        `Unknown node type: ${args.node_type}. Use list_shader_node_types to see the ${Object.keys(SHADER_NODE_CATALOG).length} available options.`
      );
    }

    const { absPath, doc } = loadDoc(projectRoot, args.path);
    const stageResult = resolveStage(doc, args.shader_stage);
    if ('error' in stageResult) return stageResult.error;
    const { stage } = stageResult;

    const existing = stageNodeIds(doc, stage);
    const nextIdx = existing.length > 0 ? Math.max(...existing) + 1 : FIRST_NODE_ID;

    const subId = uniqueSubId(doc, spec.typeName);
    const props: Record<string, string> = { ...spec.defaultParams };
    if (args.params) Object.assign(props, args.params);
    doc.subs.push({ type: spec.typeName, id: subId, props, order: Object.keys(props) });

    const seq = nextIdx - FIRST_NODE_ID;
    const x = args.position?.[0] ?? (-400 + (seq % 4) * 200);
    const y = args.position?.[1] ?? Math.floor(seq / 4) * 180;

    setResKey(doc, `nodes/${stage}/${nextIdx}/node`, `SubResource("${subId}")`);
    setResKey(doc, `nodes/${stage}/${nextIdx}/position`, `Vector2(${x}, ${y})`);

    writeTextFile(absPath, serializeVisualShaderDoc(doc), true);
    return {
      content: [{
        type: 'text',
        text: `Node added [${stage}#${nextIdx}] ${args.node_type} → ${spec.typeName} (${spec.category}) at (${x}, ${y})`,
      }],
    };
  } catch (err: any) {
    return toolError(ErrorCode.INTERNAL_ERROR, `Error: ${err.message}`);
  }
}

export function handleRemoveShaderGraphNode(
  projectRoot: string,
  args: { path: string; node_index: number; shader_stage?: string }
): ToolResult {
  try {
    const { absPath, doc } = loadDoc(projectRoot, args.path);
    const stageResult = resolveStage(doc, args.shader_stage);
    if ('error' in stageResult) return stageResult.error;
    const { stage } = stageResult;

    if (args.node_index < FIRST_NODE_ID) {
      return toolError(
        ErrorCode.INVALID_ARGUMENT,
        `Node index ${args.node_index} is reserved by the engine (0 = built-in output). Removable nodes start at ${FIRST_NODE_ID}.`
      );
    }

    const present = stageNodeIds(doc, stage);
    if (!present.includes(args.node_index)) {
      return toolError(
        ErrorCode.NOT_FOUND,
        `Node [${stage}#${args.node_index}] not found. Nodes in "${stage}": ${present.length ? present.join(', ') : '(none)'}`
      );
    }

    const prefix = `nodes/${stage}/${args.node_index}/`;
    for (const k of Object.keys(doc.res)) {
      if (k.startsWith(prefix)) delete doc.res[k];
    }
    doc.resOrder = doc.resOrder.filter(k => !k.startsWith(prefix));

    // Drop any connection touching the removed node.
    const connKey = `nodes/${stage}/connections`;
    const conns = parseConnectionArray(doc.res[connKey]);
    let dropped = 0;
    const kept: number[] = [];
    for (let i = 0; i + 3 < conns.length; i += 4) {
      if (conns[i] === args.node_index || conns[i + 2] === args.node_index) { dropped++; continue; }
      kept.push(conns[i], conns[i + 1], conns[i + 2], conns[i + 3]);
    }
    if (conns.length > 0) {
      if (kept.length > 0) doc.res[connKey] = formatConnectionArray(kept);
      else {
        delete doc.res[connKey];
        doc.resOrder = doc.resOrder.filter(k => k !== connKey);
      }
    }

    pruneOrphanSubs(doc);
    writeTextFile(absPath, serializeVisualShaderDoc(doc), true);
    return {
      content: [{
        type: 'text',
        text: `Node [${stage}#${args.node_index}] removed${dropped ? ` (${dropped} connection${dropped > 1 ? 's' : ''} pruned)` : ''}`,
      }],
    };
  } catch (err: any) {
    return toolError(ErrorCode.INTERNAL_ERROR, `Error: ${err.message}`);
  }
}

export function handleConnectShaderGraphNodes(
  projectRoot: string,
  args: { path: string; from_node: number; from_port: number; to_node: number; to_port: number; shader_stage?: string }
): ToolResult {
  try {
    const { absPath, doc } = loadDoc(projectRoot, args.path);
    const stageResult = resolveStage(doc, args.shader_stage);
    if ('error' in stageResult) return stageResult.error;
    const { stage } = stageResult;

    const present = new Set(stageNodeIds(doc, stage));
    present.add(0); // implicit output node
    for (const [label, id] of [['from_node', args.from_node], ['to_node', args.to_node]] as const) {
      if (!present.has(id)) {
        return toolError(
          ErrorCode.NOT_FOUND,
          `${label} ${id} does not exist in stage "${stage}". Available: ${[...present].sort((a, b) => a - b).join(', ')}`
        );
      }
    }
    if (args.from_node === args.to_node) {
      return toolError(ErrorCode.INVALID_ARGUMENT, `Cannot connect node ${args.from_node} to itself.`);
    }

    const connKey = `nodes/${stage}/connections`;
    const conns = parseConnectionArray(doc.res[connKey]);
    for (let i = 0; i + 3 < conns.length; i += 4) {
      if (conns[i] === args.from_node && conns[i + 1] === args.from_port &&
          conns[i + 2] === args.to_node && conns[i + 3] === args.to_port) {
        return toolError(ErrorCode.ALREADY_EXISTS, `Connection ${args.from_node}:${args.from_port} → ${args.to_node}:${args.to_port} already exists in "${stage}".`);
      }
      // An input port accepts exactly one link in Godot.
      if (conns[i + 2] === args.to_node && conns[i + 3] === args.to_port) {
        return toolError(
          ErrorCode.ALREADY_EXISTS,
          `Input port ${args.to_node}:${args.to_port} is already driven by ${conns[i]}:${conns[i + 1]}. Disconnect it first.`
        );
      }
    }

    conns.push(args.from_node, args.from_port, args.to_node, args.to_port);
    setResKey(doc, connKey, formatConnectionArray(conns));

    writeTextFile(absPath, serializeVisualShaderDoc(doc), true);
    return {
      content: [{ type: 'text', text: `Connected [${stage}] node#${args.from_node}:${args.from_port} → node#${args.to_node}:${args.to_port}` }],
    };
  } catch (err: any) {
    return toolError(ErrorCode.INTERNAL_ERROR, `Error: ${err.message}`);
  }
}

export function handleDisconnectShaderGraphNodes(
  projectRoot: string,
  args: { path: string; from_node: number; from_port: number; to_node: number; to_port: number; shader_stage?: string }
): ToolResult {
  try {
    const { absPath, doc } = loadDoc(projectRoot, args.path);
    const stageResult = resolveStage(doc, args.shader_stage);
    if ('error' in stageResult) return stageResult.error;
    const { stage } = stageResult;

    const connKey = `nodes/${stage}/connections`;
    const conns = parseConnectionArray(doc.res[connKey]);
    const kept: number[] = [];
    let removed = 0;
    for (let i = 0; i + 3 < conns.length; i += 4) {
      if (conns[i] === args.from_node && conns[i + 1] === args.from_port &&
          conns[i + 2] === args.to_node && conns[i + 3] === args.to_port) {
        removed++;
        continue;
      }
      kept.push(conns[i], conns[i + 1], conns[i + 2], conns[i + 3]);
    }

    if (removed === 0) {
      return toolError(
        ErrorCode.NOT_FOUND,
        `No connection ${args.from_node}:${args.from_port} → ${args.to_node}:${args.to_port} in stage "${stage}".`
      );
    }

    if (kept.length > 0) {
      doc.res[connKey] = formatConnectionArray(kept);
    } else {
      delete doc.res[connKey];
      doc.resOrder = doc.resOrder.filter(k => k !== connKey);
    }

    writeTextFile(absPath, serializeVisualShaderDoc(doc), true);
    return {
      content: [{ type: 'text', text: `Disconnected [${stage}] node#${args.from_node}:${args.from_port} → node#${args.to_node}:${args.to_port}` }],
    };
  } catch (err: any) {
    return toolError(ErrorCode.INTERNAL_ERROR, `Error: ${err.message}`);
  }
}

export function handleSetShaderNodeParam(
  projectRoot: string,
  args: { path: string; node_index: number; param: string; value: string; shader_stage?: string }
): ToolResult {
  try {
    const { absPath, doc } = loadDoc(projectRoot, args.path);
    const stageResult = resolveStage(doc, args.shader_stage);
    if ('error' in stageResult) return stageResult.error;
    const { stage } = stageResult;

    const present = stageNodeIds(doc, stage);
    if (!present.includes(args.node_index)) {
      return toolError(
        ErrorCode.NOT_FOUND,
        `Node [${stage}#${args.node_index}] not found. Nodes in "${stage}": ${present.length ? present.join(', ') : '(none)'}`
      );
    }

    const subId = subIdOfNode(doc, stage, args.node_index);
    if (!subId) {
      return toolError(ErrorCode.INTERNAL_ERROR, `Node [${stage}#${args.node_index}] does not reference a sub_resource.`);
    }
    const sub = doc.subs.find(s => s.id === subId);
    if (!sub) {
      return toolError(ErrorCode.NOT_FOUND, `Sub-resource "${subId}" referenced by node [${stage}#${args.node_index}] is missing from the file.`);
    }

    const isNew = !(args.param in sub.props);
    if (isNew) sub.order.push(args.param);
    sub.props[args.param] = args.value;

    writeTextFile(absPath, serializeVisualShaderDoc(doc), true);
    return {
      content: [{
        type: 'text',
        text: `${sub.type} [${stage}#${args.node_index}]: ${args.param} = ${args.value}${isNew ? ' (added)' : ''}`,
      }],
    };
  } catch (err: any) {
    return toolError(ErrorCode.INTERNAL_ERROR, `Error: ${err.message}`);
  }
}

export function handleListShaderNodeTypes(args: { category?: string }): ToolResult {
  try {
    let nodes = Object.entries(SHADER_NODE_CATALOG);
    if (args.category) {
      const wanted = args.category.toLowerCase();
      nodes = nodes.filter(([, info]) => info.category.toLowerCase() === wanted);
      if (nodes.length === 0) {
        const cats = [...new Set(Object.values(SHADER_NODE_CATALOG).map(n => n.category))].sort();
        return toolError(ErrorCode.NOT_FOUND, `No node types in category "${args.category}". Categories: ${cats.join(', ')}`);
      }
    }

    const byCategory: Record<string, typeof nodes> = {};
    for (const [key, info] of nodes) (byCategory[info.category] ||= []).push([key, info]);

    const lines: string[] = [`Visual Shader Node Types (${nodes.length}):`, ''];
    for (const cat of Object.keys(byCategory).sort()) {
      lines.push(`  ${cat}:`);
      for (const [key, info] of byCategory[cat]) {
        lines.push(`    ${key.padEnd(18)} — ${info.typeName}  (in:${info.inputs}, out:${info.outputs})`);
      }
      lines.push('');
    }
    lines.push('Note: node index 0 is the built-in output node of every stage — connect into it rather than creating one.');

    return { content: [{ type: 'text', text: lines.join('\n') }] };
  } catch (err: any) {
    return toolError(ErrorCode.INTERNAL_ERROR, `Error: ${err.message}`);
  }
}

export function handleGetShaderNodeDefaults(_projectRoot: string, args: { node_type: string }): ToolResult {
  try {
    const removed = REMOVED_NODE_TYPES[args.node_type];
    if (removed) return toolError(ErrorCode.INVALID_ARGUMENT, `"${args.node_type}" is not available. ${removed}`);

    const info = SHADER_NODE_CATALOG[args.node_type];
    if (!info) return toolError(ErrorCode.INVALID_ARGUMENT, `Unknown node type: ${args.node_type}`);

    const lines = [
      `${args.node_type} — ${info.typeName}`,
      `Category: ${info.category}`,
      `Inputs: ${info.inputs}  |  Outputs: ${info.outputs}`,
      '',
      'Default Params:',
    ];
    const entries = Object.entries(info.defaultParams);
    if (entries.length === 0) lines.push('  (none — engine defaults apply)');
    for (const [k, v] of entries) lines.push(`  ${k} = ${v}`);
    return { content: [{ type: 'text', text: lines.join('\n') }] };
  } catch (err: any) {
    return toolError(ErrorCode.INTERNAL_ERROR, `Error: ${err.message}`);
  }
}

/** Shared renderer used by `read_visual_shader`. */
export function describeVisualShaderDoc(path: string, doc: VisualShaderDoc): string {
  const mode = docMode(doc);
  const subById = new Map(doc.subs.map(s => [s.id, s]));
  const lines: string[] = [
    `Visual Shader: ${path}`,
    `Mode: ${mode} (${MODE_LABELS[mode]})`,
  ];

  let totalNodes = 0;
  let totalConns = 0;
  const body: string[] = [];

  for (const stage of STAGE_KEYS) {
    const ids = stageNodeIds(doc, stage);
    const conns = parseConnectionArray(doc.res[`nodes/${stage}/connections`]);
    if (ids.length === 0 && conns.length === 0) continue;

    totalNodes += ids.length;
    totalConns += Math.floor(conns.length / 4);
    body.push('', `[${stage}]`);
    body.push(`  #0  VisualShaderNodeOutput  (built-in)`);
    for (const id of ids) {
      const subId = subIdOfNode(doc, stage, id);
      const sub = subId ? subById.get(subId) : undefined;
      const pos = doc.res[`nodes/${stage}/${id}/position`] ?? '?';
      const params = sub ? Object.entries(sub.props).map(([k, v]) => `${k}=${v}`).join(' ') : '';
      body.push(`  #${id}  ${sub?.type ?? subId ?? '?'}  @ ${pos}${params ? `  { ${params} }` : ''}`);
    }
    for (let i = 0; i + 3 < conns.length; i += 4) {
      body.push(`  link  #${conns[i]}:${conns[i + 1]} → #${conns[i + 2]}:${conns[i + 3]}`);
    }
  }

  lines.push(`Nodes: ${totalNodes}  |  Connections: ${totalConns}  |  Sub-resources: ${doc.subs.length}`);
  lines.push(...body);
  if (totalNodes === 0) lines.push('', '(empty graph — only the built-in output node exists)');
  return lines.join('\n');
}
