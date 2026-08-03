// Copyright (c) 2026 FairYan
// SPDX-License-Identifier: MIT
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
 * 常见错误码 → 修复建议。toolError 输出时自动附加，让 AI 客户端
 * 拿到错误后能直接看到如何解决（对齐 Coding-Solo/godot-mcp 的
 * `possibleSolutions` 特性）。
 */
const SOLUTION_MAP: Partial<Record<ErrorCode, string[]>> = {
  [ErrorCode.READ_ONLY]: [
    'Remove the --read-only flag (or unset GODOT_MCP_READ_ONLY) to allow write operations.',
  ],
  [ErrorCode.EDITOR_NOT_REACHABLE]: [
    'Open the Godot editor with the MCP plugin installed, or run: npx @yanhuifair/godot-mcp --enable-plugin -p <project>',
    'The editor bridge probes TCP on 127.0.0.1:9876 first, then falls back to spawning Godot — verify the plugin is present in the target project.',
  ],
  [ErrorCode.GODOT_NOT_FOUND]: [
    'Set GODOT_PATH to your Godot 4.x binary, or install Godot from https://godotengine.org/download',
  ],
  [ErrorCode.GODOT_CLI_ERROR]: [
    'Run the same Godot command manually to see its stderr output.',
  ],
  [ErrorCode.FILE_NOT_FOUND]: [
    'Verify the path exists and is project-relative (e.g. "scenes/main.tscn", not an absolute path).',
  ],
  [ErrorCode.PATH_TRAVERSAL]: [
    'Use a path inside the project root — absolute paths and "../" escapes are rejected.',
  ],
  [ErrorCode.PARSE_ERROR]: [
    'The file content could not be parsed — check for syntax errors, or use the text format (.tres instead of binary .res).',
  ],
  [ErrorCode.ALREADY_EXISTS]: [
    'Use a different name, or remove the existing entry first.',
  ],
  [ErrorCode.INVALID_ARGUMENT]: [
    'Check the argument value against the tool input schema description.',
  ],
  [ErrorCode.NOT_FOUND]: [
    'Run tools/list to see the available tool names.',
  ],
  [ErrorCode.VALIDATION_ERROR]: [
    'Check parameter names and types against the tool input schema (snake_case keys).',
  ],
  [ErrorCode.PERMISSION_DENIED]: [
    'Check file permissions on the target path.',
  ],
};

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
  const solutions = SOLUTION_MAP[code];
  if (solutions && solutions.length > 0) {
    lines.push('Possible solutions:');
    for (const s of solutions) lines.push(`  - ${s}`);
  }
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

/**
 * Create a plain (unstructured) error ToolResult.
 *
 * Keeps the historical `{ content: [{ type: 'text', text }], isError: true }`
 * shape but centralizes construction, so tool handlers don't hand-roll error
 * objects. Prefer `toolError`/`wrapError` (structured, with an ErrorCode) for
 * new code; `plainError` is the drop-in replacement for legacy bare errors.
 */
export function plainError(message: string, detail?: string): ToolResult {
  const text = detail ? `${message}\nDetail: ${detail}` : message;
  return { content: [{ type: 'text', text }], isError: true };
}
