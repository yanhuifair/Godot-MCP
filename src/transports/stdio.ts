// Copyright (c) 2026 FairYan
// SPDX-License-Identifier: MIT
// ============================================================
// Stdio Transport - 标准输入输出通信
// ============================================================
// 用于 Claude Desktop、VS Code 等本地 MCP 客户端。
// 通过进程 stdin/stdout 进行 JSON-RPC 消息交换。
// ============================================================

import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { createMcpServer, initSharedResources } from '../server.js';
import { cleanupProcesses } from '../utils/godot_cli.js';
import { initEditorBridge, shutdownEditorBridge } from '../tools/editor.js';

export interface StdioTransportOptions {
  /** Godot 项目根目录路径 */
  projectRoot?: string;
}

/**
 * 启动 Stdio 传输层。
 * 这是默认传输方式，适用于本地 AI 客户端（Claude Desktop、VS Code 等）。
 */
export async function runStdioTransport(options: StdioTransportOptions = {}): Promise<void> {
  const { projectRoot } = initSharedResources(options.projectRoot);

  if (!projectRoot) {
    console.error('[Godot MCP] No Godot project found. Use -p <path> or run from a project directory.');
  } else {
    console.error(`[Godot MCP] Project root: ${projectRoot}  |  Stdio transport ready`);
    initEditorBridge(projectRoot);
  }

  const server = createMcpServer({ isStdio: true });
  const transport = new StdioServerTransport();

  await server.connect(transport);
  console.error('[Godot MCP] Stdio transport connected. Waiting for messages...');

  // 优雅关闭
  let shuttingDown = false;
  const shutdown = async () => {
    if (shuttingDown) return;
    shuttingDown = true;
    console.error('[Godot MCP] Shutting down Stdio transport...');
    shutdownEditorBridge();
    cleanupProcesses();
    await server.close();
    process.exit(0);
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}
