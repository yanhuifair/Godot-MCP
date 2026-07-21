// Copyright (c) 2026 FairYan
// SPDX-License-Identifier: MIT
// ============================================================
// Godot MCP Server - Server Factory & Handlers (v1.3.9)
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
export function createMcpServer(options: CreateServerOptions = {}): Server {
  const { registry } = initSharedResources();

  const server = new Server(
    { name: 'godot-mcp', version: '1.3.9' },
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

    // ---- Normalize parameter names to match Zod schema keys (snake_case) ----
    // Schemas and handlers use snake_case exclusively. We tolerate clients that
    // send camelCase by mapping camelCase → snake_case. The inverse mapping would
    // break every tool, because the inputSchema keys advertised to clients are
    // themselves snake_case.
    const normalizedArgs = normalizeParameterNames(args || {});

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
 * snake_case keys declared in our Zod schemas. Leaves unknown keys unchanged
 * (they pass through to Zod validation).
 */
export function normalizeParameterNames(args: Record<string, unknown>): Record<string, unknown> {
  if (!args || typeof args !== 'object') return args;
  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(args)) {
    const snakeKey = PARAMETER_MAP[key] || key;
    result[snakeKey] = value;
  }
  return result;
}
