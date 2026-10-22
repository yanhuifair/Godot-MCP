// Copyright (c) 2026 FairYan
// SPDX-License-Identifier: AGPL-3.0-or-later
// ============================================================
// Godot MCP Server - Server Factory & Handlers (v1.12.15)
// ============================================================
// 将 MCP Server 创建、工具注册、请求处理抽离为独立工厂函数，
// 供 Stdio、SSE、Streamable HTTP 三种传输层共用。
// ============================================================

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import { z } from 'zod';
import { zodToJsonSchema } from 'zod-to-json-schema';

import { findProjectRoot } from './utils/file_utils.js';
import { ToolRegistry, isWriteTool, setActiveProjectRoot } from './utils/registry.js';
import { ErrorCode, toolError } from './utils/errors.js';
import type { ToolResult } from './utils/types.js';
import { registerAllTools } from './tools/register.js';
import { VERSION } from './utils/version.js';
import { deriveParamAliases, applyParamAliases } from './utils/naming.js';

// ---- 共享资源 ----

/** 全局工具注册表，所有 transport 共用 */
let sharedRegistry: ToolRegistry | null = null;

/** 全局 projectRoot，所有 transport 共用 */
let sharedProjectRoot: string | null = null;

/**
 * 初始化共享资源（工具注册表 + 项目根目录）。
 * 最多调用一次；重复调用会复用已有实例。
 */
export function initSharedResources(projectRoot?: string): { registry: ToolRegistry; projectRoot: string | null } {
  if (!sharedRegistry) {
    // --read-only 通过环境变量 GODOT_MCP_READ_ONLY 传入（见 src/index.ts）
    const readOnly = process.env.GODOT_MCP_READ_ONLY === 'true';
    sharedRegistry = new ToolRegistry({ readOnly });
    registerAllTools(sharedRegistry);
  }
  if (sharedProjectRoot === null) {
    sharedProjectRoot = projectRoot || findProjectRoot() || null;
    // get_status 要报告"当前解析到的工程根目录"，否则它给出的排错建议
    // （"get_status 会告诉你 projectRoot"）自己就是空话。
    setActiveProjectRoot(sharedProjectRoot);
  }
  return { registry: sharedRegistry, projectRoot: sharedProjectRoot };
}

/**
 * 获取当前 projectRoot。
 */
export function getProjectRoot(): string | null {
  return sharedProjectRoot;
}

// ---- MCP Server 工厂 ----

export interface CreateServerOptions {
  /** 是否在 stdio transport 中运行（打印日志到 stderr） */
  isStdio?: boolean;
}

/**
 * 创建一个已注册所有工具和处理器的新 MCP Server 实例。
 * 每个 transport 连接都需要独立的 Server 实例。
 */
export function createMcpServer(_options: CreateServerOptions = {}): Server {
  const { registry } = initSharedResources();

  const server = new Server(
    { name: 'godot-mcp', version: VERSION },
    { capabilities: { tools: {} } }
  );

  // ---- List tools ----
  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: registry.list().map((t) => {
      const meta = toolAnnotations(t.name);
      return {
        name: t.name,
        title: meta.title,
        description: t.description,
        inputSchema: buildJsonSchema(t.schema),
        // MCP 标准注解：客户端据此决定是否弹权限确认、能否自动批准。
        // 以前一个都不给，客户端只能把所有 386 个工具都当"可能破坏性"，
        // 于是每次调用都弹窗 —— 这是编辑体验里最烦的一环。
        annotations: {
          readOnlyHint: meta.readOnlyHint,
          destructiveHint: meta.destructiveHint,
          idempotentHint: meta.idempotentHint,
          openWorldHint: meta.openWorldHint,
        },
      };
    }),
  }));

  // ---- Call tool ----
  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;

    // ---- Normalize parameter names to match Zod schema keys (snake_case) ----
    // Schemas and handlers use snake_case exclusively. We tolerate clients that
    // send camelCase by mapping camelCase → snake_case. The inverse mapping would
    // break every tool, because the inputSchema keys advertised to clients are
    // themselves snake_case.
    const tool = registry.find(name);
    if (!tool) {
      return toolError(ErrorCode.NOT_FOUND, `Unknown tool: ${name}`);
    }

    // ---- 同义参数归一化（path / scene_path / file_path …）----
    // 参数名是历史累积的，同一概念有多种写法；别名层两种都收，避免因为猜错
    // 名字白白多一轮往返（规则见 utils/naming.ts）。
    const prepared = resolveToolArguments(tool, args || {});
    if (prepared.error) return prepared.error;
    const validatedArgs = prepared.args;

    // ---- READ-ONLY 模式：拒绝所有写/副作用工具 ----
    if (!registry.canCall(name)) {
      return toolError(
        ErrorCode.READ_ONLY,
        `Tool "${name}" is a write operation and is blocked in read-only mode`
      );
    }

    try {
      const schema = z.object(tool.schema);
      const parsedArgs = schema.parse(validatedArgs);
      const effectiveRoot = sharedProjectRoot || process.cwd();
      const { content, isError } = await tool.handler(effectiveRoot, parsedArgs);
      return { content, isError } as any;
    } catch (err: any) {
      if (err instanceof z.ZodError) {
        return toolError(ErrorCode.VALIDATION_ERROR,
          describeArgumentError(name, tool.schema, validatedArgs, err));
      }
      return toolError(ErrorCode.INTERNAL_ERROR, err.message);
    }
  });

  return server;
}

/**
 * 把客户端传来的原始参数整理成"schema 接受的形状"：
 *   1. camelCase → snake_case（兼容老客户端）
 *   2. 同义参数归一化（path / scene_path / file_path …）
 *
 * 抽出来是为了能单独测试 —— 这段逻辑一旦出错，所有工具都会莫名其妙地报缺参数。
 */
export function resolveToolArguments(
  tool: { name: string; description?: string; schema: Record<string, z.ZodTypeAny> },
  rawArgs: Record<string, unknown>
): { args: Record<string, unknown>; error?: ToolResult } {
  const normalized = normalizeParameterNames(rawArgs);
  const plan = applyParamAliases(
    normalized,
    deriveParamAliases(tool.name, tool.description ?? '', tool.schema)
  );
  if (plan.conflicts.length) {
    const detail = plan.conflicts
      .map(({ from, to }) => `"${from}" and "${to}" were both given with different values — pass only one of them (canonical: "${to}").`)
      .join(' ');
    return {
      args: plan.args,
      error: toolError(ErrorCode.VALIDATION_ERROR, `Ambiguous arguments for "${tool.name}". ${detail}`),
    };
  }
  return { args: plan.args };
}

// ---- Argument-error descriptions ----
/** 逐字符 Levenshtein，只用来给"未知参数"猜一个最近的合法名（参数名都很短）。 */
function editDistance(a: string, b: string): number {
  const m = a.length, n = b.length;
  if (!m) return n;
  if (!n) return m;
  let prev = Array.from({ length: n + 1 }, (_, j) => j);
  for (let i = 1; i <= m; i++) {
    const cur = [i];
    for (let j = 1; j <= n; j++) {
      cur[j] = Math.min(
        prev[j] + 1,
        cur[j - 1] + 1,
        prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1)
      );
    }
    prev = cur;
  }
  return prev[n];
}

/**
 * 给"未知参数"猜最近的合法名。
 *
 * 只看编辑距离不够：`node_type` → `type`（距离 5）、`path` → `scene_path`（距离 6）
 * 都超出阈值，可它们恰恰是模型最常犯的错。所以先按**词元**判断
 * （snake_case 用 `_` 切分），词元被包含的关系远比字符距离更能说明意图。
 * 有歧义时宁可不猜 —— 错误的建议比没有建议更糟。
 */
function closestKey(unknown: string, keys: string[]): string | null {
  const ut = unknown.toLowerCase().split('_').filter(Boolean);
  const scored: { key: string; score: number }[] = [];

  for (const k of keys) {
    const kt = k.toLowerCase().split('_').filter(Boolean);
    let score = 0;

    if (k.toLowerCase() === unknown.toLowerCase()) return k;
    // 词元是候选的子集（node_type ⊂ {node,type} 不成立，但 type ⊂ node_type 成立）
    if (ut.length && ut.every((t) => kt.includes(t))) score += 100;
    else {
      const shared = ut.filter((t) => kt.includes(t)).length;
      if (shared) score += 20 * shared;
    }
    // 后缀命中（path ⊂ scene_path 的尾部）也算强信号
    if (k.toLowerCase().endsWith('_' + unknown.toLowerCase())) score += 30;

    score -= editDistance(unknown.toLowerCase(), k.toLowerCase());
    if (score > 0) scored.push({ key: k, score });
  }

  scored.sort((a, b) => b.score - a.score);
  if (scored.length === 0) return null;
  // 平分 = 猜不准，干脆不猜
  if (scored.length > 1 && scored[0].score === scored[1].score) return null;
  return scored[0].key;
}

/**
 * 把 Zod 的 "scene_path: Required" 变成能直接照着改的说明。
 *
 * 编辑体验的关键：模型第一次调错参数时必须能自己改对。Zod 默认**静默丢弃**
 * 未声明的 key，所以传 `path` 而不是 `scene_path` 时，用户看到的只有
 * "scene_path: Required"，完全不知道是自己拼错了参数名 —— 于是反复重试。
 */
export function describeArgumentError(
  toolName: string,
  schema: Record<string, z.ZodTypeAny>,
  args: Record<string, unknown>,
  err: z.ZodError
): string {
  const accepted = Object.entries(schema).map(([k, s]) => {
    const optional = typeof (s as any).isOptional === 'function' && (s as any).isOptional();
    return optional ? `${k}?` : `${k} (required)`;
  });
  const unknown = Object.keys(args).filter((k) => !(k in schema));
  const missing = err.errors
    .filter((e) => e.code === 'invalid_type' && (e as any).received === 'undefined')
    .map((e) => e.path.join('.'));

  const lines: string[] = [];
  lines.push(`Invalid arguments for "${toolName}".`);
  if (missing.length) {
    lines.push(`Missing required: ${missing.join(', ')}`);
  }
  const other = err.errors.filter((e) => !missing.includes(e.path.join('.')));
  if (other.length) {
    lines.push(`Bad values: ${other.map((e) => `${e.path.join('.')} (${e.message})`).join(', ')}`);
  }
  lines.push(`Accepted parameters: ${accepted.join(', ') || '(none)'}`);

  for (const u of unknown) {
    const near = closestKey(u, Object.keys(schema));
    lines.push(near
      ? `"${u}" is not a parameter of this tool — did you mean "${near}"?`
      : `"${u}" is not a parameter of this tool and was IGNORED.`);
  }
  lines.push('Tip: parameters are snake_case; call search_tools "<keyword>" to see the exact signature.');
  return lines.join('\n');
}

// ---- Tool metadata (annotations) ----

/** 名字里带这些动词的工具是破坏性的（删除/清空/重置类）。 */
const DESTRUCTIVE_NAME_RE = /(^|_)(delete|remove|clear|reset|drop|kill|truncate|overwrite|discard)(_|$)/;
/** 这些前缀的写工具重复调用是幂等的（设置类天然幂等）。 */
const IDEMPOTENT_WRITE_RE = /(^|_)set_|^editor_(set|select|open|focus)_/;

function humanizeToolName(name: string): string {
  return name
    .split('_')
    .map((w) => {
      const special: Record<string, string> = {
        '2d': '2D', '3d': '3D', uid: 'UID', gdscript: 'GDScript', csg: 'CSG',
        csharp: 'C#', png: 'PNG', udp: 'UDP', tcp: 'TCP', fov: 'FOV', lod: 'LOD',
      };
      return special[w] ?? (w.charAt(0).toUpperCase() + w.slice(1));
    })
    .join(' ');
}

/**
 * 从工具名推导 MCP annotations。全部是**计算**出来的，不另存一份元数据表 ——
 * 加工具时不会漏标，也不会和 WRITE_TOOLS 打架（同一份事实只有一个来源）。
 */
export function toolAnnotations(name: string): {
  title: string;
  readOnlyHint: boolean;
  destructiveHint: boolean;
  idempotentHint: boolean;
  openWorldHint: boolean;
} {
  const readOnly = !isWriteTool(name);
  const destructive = !readOnly && DESTRUCTIVE_NAME_RE.test(name);
  const idempotent = readOnly || IDEMPOTENT_WRITE_RE.test(name);
  return {
    title: humanizeToolName(name),
    readOnlyHint: readOnly,
    destructiveHint: destructive,
    idempotentHint: idempotent,
    openWorldHint: false, // 所有工具都只操作本机工程，不触网
  };
}

// ---- JSON Schema Builder ----

function buildJsonSchema(schema: Record<string, z.ZodTypeAny>): Record<string, unknown> {
  const properties: Record<string, unknown> = {};
  const required: string[] = [];

  for (const [key, zodSchema] of Object.entries(schema)) {
    properties[key] = zodToJsonSchema(zodSchema);
    if (!zodSchema.isOptional()) required.push(key);
  }

  return {
    type: 'object',
    properties,
    ...(required.length > 0 ? { required } : {}),
  };
}

// ---- Parameter Normalization ----

/** Known camelCase → snake_case mappings. Schemas and handlers are snake_case,
 *  so this lets clients that send camelCase still work. snake_case inputs pass through. */
const PARAMETER_MAP: Record<string, string> = {
  'projectPath': 'project_path',
  'scenePath': 'scene_path',
  'rootNodeType': 'root_node_type',
  'parentNodePath': 'parent_node_path',
  'nodeType': 'node_type',
  'nodeName': 'node_name',
  'texturePath': 'texture_path',
  'nodePath': 'node_path',
  'outputPath': 'output_path',
  'meshItemNames': 'mesh_item_names',
  'newPath': 'new_path',
  'filePath': 'file_path',
  'scriptPath': 'script_path',
  'maxResults': 'max_results',
  'newName': 'new_name',
  'shapeType': 'shape_type',
  'shapeResourcePath': 'shape_resource_path',
  'fromNode': 'from_node',
  'toNode': 'to_node',
  'methodName': 'method_name',
  'propertyKey': 'property_key',
  'propertyValue': 'property_value',
  'cloneSource': 'clone_source',
  'lightType': 'light_type',
  'lightName': 'light_name',
  'meshType': 'mesh_type',
  'markerType': 'marker_type',
  'rootName': 'root_name',
  'lineNumber': 'line_number',
  'newParent': 'new_parent',
};

/**
 * Convert camelCase keys to snake_case in an arguments object so they match the
 * snake_case keys declared in our Zod schemas. Explicit `PARAMETER_MAP` entries
 * win (handles irregular forms); any remaining key containing an uppercase
 * letter is converted generically so LLM clients that emit camelCase don't fail
 * Zod validation on the 100+ multi-word tool parameters. Keys already in
 * snake_case (no uppercase) pass through unchanged.
 */
export function normalizeParameterNames(args: Record<string, unknown>): Record<string, unknown> {
  if (!args || typeof args !== 'object') return args;
  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(args)) {
    const snakeKey = PARAMETER_MAP[key] || toSnakeCase(key);
    result[snakeKey] = value;
  }
  return result;
}

/** Generic camelCase → snake_case converter for otherwise-unmapped keys. */
function toSnakeCase(key: string): string {
  if (!/[A-Z]/.test(key)) return key; // already snake_case / no uppercase
  return key
    .replace(/([a-z0-9])([A-Z])/g, '$1_$2')
    .replace(/([A-Z]+)([A-Z][a-z])/g, '$1_$2')
    .toLowerCase();
}
