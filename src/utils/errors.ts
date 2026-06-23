// ============================================================
// Godot MCP Server - Structured Error System
// ============================================================

import { ToolResult } from './types.js';

export enum ErrorCode {
  FILE_NOT_FOUND = 'FILE_NOT_FOUND',
  PARSE_ERROR = 'PARSE_ERROR',
  VALIDATION_ERROR = 'VALIDATION_ERROR',
  PERMISSION_DENIED = 'PERMISSION_DENIED',
  PATH_TRAVERSAL = 'PATH_TRAVERSAL',
  BINARY_UNSUPPORTED = 'BINARY_UNSUPPORTED',
  GODOT_NOT_FOUND = 'GODOT_NOT_FOUND',
  GODOT_CLI_ERROR = 'GODOT_CLI_ERROR',
  PROCESS_ERROR = 'PROCESS_ERROR',
  EDITOR_NOT_REACHABLE = 'EDITOR_NOT_REACHABLE',
  INVALID_ARGUMENT = 'INVALID_ARGUMENT',
  ALREADY_EXISTS = 'ALREADY_EXISTS',
  NOT_FOUND = 'NOT_FOUND',
  INTERNAL_ERROR = 'INTERNAL_ERROR',
  READ_ONLY = 'READ_ONLY',
}

export interface StructuredError {
  code: ErrorCode;
  message: string;
  detail?: string;
  retry?: boolean;
}

/**
 * Create a structured ToolResult error.
 */
export function toolError(
  code: ErrorCode,
  message: string,
  detail?: string
): ToolResult {
  const lines: string[] = [];
  lines.push(`[${code}] ${message}`);
  if (detail) lines.push(`Detail: ${detail}`);
  return {
    content: [{ type: 'text', text: lines.join('\n') }],
    isError: true,
  };
}

/**
 * Wrap a caught error in a tool error.
 */
export function wrapError(
  code: ErrorCode,
  err: unknown,
  prefix?: string
): ToolResult {
  const message = err instanceof Error ? err.message : String(err);
  return toolError(code, prefix ? `${prefix}: ${message}` : message);
}
