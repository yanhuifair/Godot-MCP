// ============================================================
// Godot MCP Server - Server Factory & Handlers (v1.3.7)
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
import { ToolRegistry } from './utils/registry.js';
import { ErrorCode, toolError } from './utils/errors.js';
import { registerAllTools } from './tools/register.js';

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
    sharedRegistry = new ToolRegistry();
    registerAllTools(sharedRegistry);
  }
  if (sharedProjectRoot === undefined || sharedProjectRoot === null) {
    sharedProjectRoot = projectRoot || findProjectRoot() || null;
  }
  return { registry: sharedRegistry, projectRoot: sharedProjectRoot };
}

/**
 * 获取当前 projectRoot（可被 set_project_root 工具动态修改）。
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
export function createMcpServer(options: CreateServerOptions = {}): Server {
  const { registry } = initSharedResources();

  const server = new Server(
    { name: 'godot-mcp', version: '1.3.7' },
    { capabilities: { tools: {} } }
  );

  // ---- List tools ----
  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: registry.list().map((t) => ({
      name: t.name,
      description: t.description,
      inputSchema: buildJsonSchema(t.schema),
    })),
  }));

  // ---- Call tool ----
  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;

    // ---- Auto-normalize snake_case → camelCase ----
    // AI clients sometimes send snake_case parameter names; we map them
    // to the camelCase equivalents that our Zod schemas expect.
    const normalizedArgs = normalizeParameterNames(args || {});

    // set_project_root — 动态更新项目根目录
    if (name === 'set_project_root') {
      const newPath = (normalizedArgs as any)?.path;
      if (!newPath) return toolError(ErrorCode.INVALID_ARGUMENT, 'Missing required parameter: path');
      const root = findProjectRoot(newPath);
      if (!root) return toolError(ErrorCode.FILE_NOT_FOUND, `No Godot project at "${newPath}"`);
      sharedProjectRoot = root;
      return { content: [{ type: 'text' as const, text: `Project root set to: ${root}` }] };
    }

    const tool = registry.find(name);
    if (!tool) {
      return toolError(ErrorCode.NOT_FOUND, `Unknown tool: ${name}`);
    }

    try {
      const schema = z.object(tool.schema);
      const validatedArgs = schema.parse(normalizedArgs);
      const effectiveRoot = sharedProjectRoot || process.cwd();
      const { content, isError } = await tool.handler(effectiveRoot, validatedArgs);
      return { content, isError } as any;
    } catch (err: any) {
      if (err instanceof z.ZodError) {
        return toolError(ErrorCode.VALIDATION_ERROR,
          err.errors.map(e => `${e.path.join('.')}: ${e.message}`).join(', '));
      }
      return toolError(ErrorCode.INTERNAL_ERROR, err.message);
    }
  });

  return server;
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

/** Known snake_case → camelCase mappings for common Godot MCP parameters */
const PARAMETER_MAP: Record<string, string> = {
  'project_path': 'projectPath',
  'scene_path': 'scenePath',
  'root_node_type': 'rootNodeType',
  'parent_node_path': 'parentNodePath',
  'node_type': 'nodeType',
  'node_name': 'nodeName',
  'texture_path': 'texturePath',
  'node_path': 'nodePath',
  'output_path': 'outputPath',
  'mesh_item_names': 'meshItemNames',
  'new_path': 'newPath',
  'file_path': 'filePath',
  'script_path': 'scriptPath',
  'max_results': 'maxResults',
  'new_name': 'newName',
  'shape_type': 'shapeType',
  'shape_resource_path': 'shapeResourcePath',
  'from_node': 'fromNode',
  'to_node': 'toNode',
  'method_name': 'methodName',
  'property_key': 'propertyKey',
  'property_value': 'propertyValue',
  'clone_source': 'cloneSource',
  'light_type': 'lightType',
  'light_name': 'lightName',
  'mesh_type': 'meshType',
  'marker_type': 'markerType',
  'root_name': 'rootName',
  'line_number': 'lineNumber',
  'new_parent': 'newParent',
};

/**
 * Convert snake_case keys to camelCase in an arguments object.
 * Leaves unknown keys unchanged (they pass through to Zod validation).
 */
function normalizeParameterNames(args: Record<string, unknown>): Record<string, unknown> {
  if (!args || typeof args !== 'object') return args;
  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(args)) {
    const camelKey = PARAMETER_MAP[key] || key;
    result[camelKey] = value;
  }
  return result;
}
