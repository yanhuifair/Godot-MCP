// Copyright (c) 2026 FairYan
// SPDX-License-Identifier: AGPL-3.0-or-later
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
  EDITOR_COMMAND_FAILED = 'EDITOR_COMMAND_FAILED',
  RUNTIME_NOT_REACHABLE = 'RUNTIME_NOT_REACHABLE',
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
  [ErrorCode.EDITOR_COMMAND_FAILED]: [
    'The editor was reached but rejected the command — read the message above; it comes straight from Godot.',
    'Common causes: no scene is open, the node path does not exist, or the target node type does not support the operation.',
    'Use editor_get_scene_tree / editor_get_node_properties to confirm the node path and property names first.',
  ],
  [ErrorCode.RUNTIME_NOT_REACHABLE]: [
    'The running game is not reachable. Add the `runtime_bridge.gd` autoload to your project (copy addons/godot-mcp/runtime_bridge.gd into your project and enable it as an autoload named `godot_mcp_runtime`), then run the game from the editor.',
    'The runtime bridge listens on 127.0.0.1:9877 — verify nothing else is using that port and the game is actually running (not just the editor).',
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
  // INTERNAL_ERROR 是所有兜底 catch 的落点，用量最大——以前这里没有条目，
  // 于是 200+ 处错误一条修复建议都拿不到，反而是最需要指引的那一类。
  [ErrorCode.INTERNAL_ERROR]: [
    'This is an unhandled error — the message above carries the real reason (a Node error code, ' +
      'a filesystem error, or an error string straight from Godot).',
    'Check that the project is a valid Godot 4.x project: get_status reports the resolved project ' +
      'root, whether the editor plugin is connected, and whether a game is running.',
    'If the message mentions a file, confirm the path is project-relative and the file exists ' +
      '(list_project_files, or read_scene for .tscn).',
  ],
  [ErrorCode.BINARY_UNSUPPORTED]: [
    'This file is in Godot\'s binary format. Re-save it as text in the editor ' +
      '(Scene → Save As → .tscn / .tres, and for resources use "Save as text"), then retry.',
    'Binary .res/.scn files cannot be read or edited by the file parsers — the editor bridge ' +
      'tools (editor_*) can still work with the open scene.',
  ],
  [ErrorCode.PROCESS_ERROR]: [
    'A Godot child process failed to start, exited early, or could not be killed. ' +
      'Run the same command manually in a terminal to see its stderr.',
    'Check GODOT_PATH / GODOT_BIN points at a working Godot 4.x binary (get_godot_version verifies it).',
  ],
};

/**
 * 把兜底错误码refine成具体错误码。
 *
 * 全仓 200+ 个 handler 都写 `catch { toolError(INTERNAL_ERROR, err.message) }`，
 * 于是"文件不存在"也变成 INTERNAL_ERROR —— smoke 里 28 个 INTERNAL_ERROR 有 23 个
 * 其实是文件问题。错误码错了，SOLUTION_MAP 给的修复建议也就错了：用户看到
 * "这是未处理的错误"而不是"路径写错了"。
 *
 * 只对 INTERNAL_ERROR 生效：调用方明确给出的错误码永远不被覆盖。
 */
const FS_ERROR_HINTS: ReadonlyArray<readonly [RegExp, ErrorCode]> = [
  [/\bENOENT\b|no such file or directory|file not found|cannot find (the )?file/i, ErrorCode.FILE_NOT_FOUND],
  [/\bENOTDIR\b|not a directory/i, ErrorCode.INVALID_ARGUMENT],
  [/\bEISDIR\b|is a directory/i, ErrorCode.INVALID_ARGUMENT],
  [/\bEACCES\b|\bEPERM\b|permission denied/i, ErrorCode.PERMISSION_DENIED],
  [/\bEEXIST\b|already exists/i, ErrorCode.ALREADY_EXISTS],
  // 类型不匹配（"File is not a TileSet"、"Node "." is Node2D, not Sprite2D"）
  // 是调用方参数问题，不是内部错误。
  [/File is not an? \w+/i, ErrorCode.INVALID_ARGUMENT],
  [/\bis \w+(?:\dD)?, not \w+/i, ErrorCode.INVALID_ARGUMENT],
  // 场景里缺少预期的节点/资源（"No AnimationPlayer node found"）
  [/^No \w[\w0-9]* (node|resource|bus) (found|in )/i, ErrorCode.NOT_FOUND],
  // 必填组合缺失（"No transform parameters provided. Specify at least one: ..."）
  [/^No .+ provided\. Specify at least one/i, ErrorCode.INVALID_ARGUMENT],
  [/^Specify (either|at least one)/i, ErrorCode.INVALID_ARGUMENT],
];

export function refineErrorCode(code: ErrorCode, message: string): ErrorCode {
  if (code !== ErrorCode.INTERNAL_ERROR) return code;
  for (const [pattern, refined] of FS_ERROR_HINTS) {
    if (pattern.test(message)) return refined;
  }
  return code;
}

/**
 * Create a structured ToolResult error.
 */
export function toolError(
  code: ErrorCode,
  message: string,
  detail?: string
): ToolResult {
  const effective = refineErrorCode(code, `${message} ${detail ?? ''}`);
  const lines: string[] = [];
  lines.push(`[${effective}] ${message}`);
  if (detail) lines.push(`Detail: ${detail}`);
  const solutions = SOLUTION_MAP[effective];
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
  // 引擎侧返回的业务错误（"Node not found" 等）不是连接问题。用调用方传入的
  // EDITOR_NOT_REACHABLE 标注会把用户引向"检查插件/端口"的错误排查方向，
  // 因此这里按标记改写成 EDITOR_COMMAND_FAILED。
  const effective = isEditorCommandFailure(err) ? ErrorCode.EDITOR_COMMAND_FAILED : code;
  return toolError(effective, prefix ? `${prefix}: ${message}` : message);
}

/** 标记：由 Godot 侧返回的命令级失败（而非传输/连接失败）。 */
export const EDITOR_COMMAND_FAILURE = Symbol.for('godot-mcp.editorCommandFailure');

export function isEditorCommandFailure(err: unknown): boolean {
  return !!err && typeof err === 'object' && (err as any)[EDITOR_COMMAND_FAILURE] === true;
}

/** 把 Godot 返回的 `{ error: "..." }` 包装成带标记的 Error。 */
export function editorCommandError(method: string, message: string): Error {
  const err = new Error(`${method} failed: ${message}`);
  (err as any)[EDITOR_COMMAND_FAILURE] = true;
  return err;
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
