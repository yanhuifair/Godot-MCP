// ============================================================
// Godot MCP Server - Tool Registry
// ============================================================
// Centralized tool registration system. Each tool file
// exports a `registerTools(registry)` function.

import { z, ZodTypeAny } from 'zod';
import { ToolResult } from './types.js';

export type ToolHandler = (projectRoot: string, args: any) => ToolResult | Promise<ToolResult>;

export interface ToolRegistration {
  name: string;
  description: string;
  schema: Record<string, ZodTypeAny>;
  handler: ToolHandler;
  readOnly?: boolean; // for future READ_ONLY_MODE support
}

export class ToolRegistry {
  private tools = new Map<string, ToolRegistration>();
  private readOnly = false;

  constructor(opts?: { readOnly?: boolean }) {
    this.readOnly = opts?.readOnly ?? false;
  }

  /** Register a single tool */
  register(tool: ToolRegistration): void {
    if (this.tools.has(tool.name)) {
      console.error(`[ToolRegistry] Duplicate tool: ${tool.name}`);
      return;
    }
    this.tools.set(tool.name, tool);
  }

  /** Get all tool definitions (for list_tools) */
  list(): ToolRegistration[] {
    return [...this.tools.values()]
      .filter(t => !this.readOnly || t.readOnly !== false)
      .sort((a, b) => a.name.localeCompare(b.name));
  }

  /** Find a tool by name */
  find(name: string): ToolRegistration | undefined {
    return this.tools.get(name);
  }

  /** Is the registry empty? */
  get isEmpty(): boolean {
    return this.tools.size === 0;
  }

  get count(): number {
    return this.tools.size;
  }
}
