// ============================================================
// Godot MCP Server - Main Server Class (v1.0.0)
// ============================================================

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import { z } from 'zod';
import { zodToJsonSchema } from 'zod-to-json-schema';

import { findProjectRoot } from './utils/file_utils.js';
import { cleanupProcesses } from './utils/godot_cli.js';
import { ToolRegistry } from './utils/registry.js';
import { ErrorCode, toolError } from './utils/errors.js';
import { registerAllTools } from './tools/register.js';

// ---- MCP Server ----

export class GodotMcpServer {
  private server: Server;
  private projectRoot: string | null;
  private registry: ToolRegistry;

  constructor(projectRoot?: string) {
    this.registry = new ToolRegistry();

    // Register all 179 tools
    registerAllTools(this.registry);

    this.server = new Server(
      { name: 'godot-mcp', version: '1.0.0' },
      { capabilities: { tools: {} } }
    );

    this.projectRoot = projectRoot || findProjectRoot() || null;

    if (!this.projectRoot) {
      console.error('[Godot MCP] No Godot project found. Use -p <path> or run from a project directory.');
    } else {
      console.error(`[Godot MCP] Project root: ${this.projectRoot}  |  ${this.registry.count} tools loaded`);
    }

    this.registerHandlers();
  }

  private registerHandlers(): void {
    // List tools
    this.server.setRequestHandler(ListToolsRequestSchema, async () => ({
      tools: this.registry.list().map((t) => ({
        name: t.name,
        description: t.description,
        inputSchema: buildJsonSchema(t.schema),
      })),
    }));

    // Call tool
    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      const { name, arguments: args } = request.params;

      // set_project_root — updates server state, requires special handling
      if (name === 'set_project_root') {
        const newPath = (args as any)?.path;
        if (!newPath) return toolError(ErrorCode.INVALID_ARGUMENT, 'Missing required parameter: path');
        const root = findProjectRoot(newPath);
        if (!root) return toolError(ErrorCode.FILE_NOT_FOUND, `No Godot project at "${newPath}"`);
        this.projectRoot = root;
        return { content: [{ type: 'text' as const, text: `Project root set to: ${root}` }] };
      }

      const tool = this.registry.find(name);
      if (!tool) {
        return toolError(ErrorCode.NOT_FOUND, `Unknown tool: ${name}`);
      }

      try {
        const schema = z.object(tool.schema);
        const validatedArgs = schema.parse(args || {});
        const effectiveRoot = this.projectRoot || process.cwd();
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
  }

  async run(): Promise<void> {
    const transport = new StdioServerTransport();
    await this.server.connect(transport);

    const shutdown = async () => {
      cleanupProcesses();
      await this.server.close();
      process.exit(0);
    };
    process.on('SIGINT', shutdown);
    process.on('SIGTERM', shutdown);
  }
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
