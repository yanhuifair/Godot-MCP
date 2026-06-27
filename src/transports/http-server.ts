// ============================================================
// HTTP Transport - SSE + Streamable HTTP 双协议支持
// ============================================================
// 基于 Express 启动 HTTP 服务器，同时暴露：
//   - GET/POST /sse        →  SSE 传输（兼容旧版 MCP 客户端）
//   - GET/POST /mcp        →  Streamable HTTP 传输（MCP 2025 规范）
//   - GET /health          →  健康检查端点
// ============================================================

import type { IncomingMessage, ServerResponse } from 'node:http';
import type { Express, Request, Response } from 'express';
import { SSEServerTransport } from '@modelcontextprotocol/sdk/server/sse.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { createMcpExpressApp } from '@modelcontextprotocol/sdk/server/express.js';
import { randomUUID } from 'node:crypto';
import { createMcpServer, initSharedResources, getProjectRoot } from '../server.js';
import { initEditorBridge, shutdownEditorBridge } from '../tools/editor.js';

export interface HttpTransportOptions {
  /** HTTP 监听端口，默认 3000 */
  port?: number;
  /** 监听地址，默认 '127.0.0.1' */
  host?: string;
  /** Godot 项目根目录 */
  projectRoot?: string;
  /** 是否启用 SSE 端点（兼容旧客户端），默认 true */
  enableSse?: boolean;
  /** 是否启用 Streamable HTTP 端点，默认 true */
  enableStreamableHttp?: boolean;
}

/**
 * 启动 HTTP 服务器，同时支持 SSE 和 Streamable HTTP 两种协议。
 *
 * SSE 端点 (/sse)：
 *   - GET 请求建立 SSE 长连接，服务端可推送消息
 *   - POST 请求发送 JSON-RPC 消息到服务端
 *   - 每个 SSE 连接创建独立的 Server + Transport 实例
 *
 * Streamable HTTP 端点 (/mcp)：
 *   - GET 请求建立 SSE 流（支持断线重连恢复）
 *   - POST 请求发送 JSON-RPC 消息
 *   - DELETE 请求关闭会话
 *   - 支持有状态（sessionId）和无状态两种模式
 */
export async function runHttpTransport(options: HttpTransportOptions = {}): Promise<void> {
  const port = options.port ?? 3000;
  const host = options.host ?? '127.0.0.1';
  const enableSse = options.enableSse ?? true;
  const enableStreamableHttp = options.enableStreamableHttp ?? true;

  // 初始化共享资源
  const { projectRoot } = initSharedResources(options.projectRoot);
  if (projectRoot) {
    console.error(`[Godot MCP] Project root: ${projectRoot}`);
    initEditorBridge(projectRoot);
  }

  // 创建 Express 应用（自带 DNS rebinding 防护）
  const app = createMcpExpressApp({ host });

  // ---- Streamable HTTP 端点 (/mcp) ----
  if (enableStreamableHttp) {
    setupStreamableHttpEndpoint(app);
  }

  // ---- SSE 端点 (/sse) ----
  if (enableSse) {
    setupSseEndpoint(app);
  }

  // ---- 健康检查 ----
  app.get('/health', (_req: Request, res: Response) => {
    res.json({
      status: 'ok',
      version: '1.3.4',
      projectRoot: getProjectRoot(),
      endpoints: {
        ...(enableSse ? { sse: `http://${host}:${port}/sse` } : {}),
        ...(enableStreamableHttp ? { streamableHttp: `http://${host}:${port}/mcp` } : {}),
      },
    });
  });

  // 启动 HTTP 服务器
  const server = app.listen(port, host, () => {
    console.error(`[Godot MCP] HTTP server listening on http://${host}:${port}`);
    if (enableSse) {
      console.error(`[Godot MCP]   SSE endpoint:           http://${host}:${port}/sse`);
    }
    if (enableStreamableHttp) {
      console.error(`[Godot MCP]   Streamable HTTP:        http://${host}:${port}/mcp`);
    }
    console.error(`[Godot MCP]   Health check:           http://${host}:${port}/health`);
  });

  // 优雅关闭
  const shutdown = async () => {
    console.error('[Godot MCP] Shutting down HTTP server...');
    shutdownEditorBridge();
    server.close();
    process.exit(0);
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

// ---- Streamable HTTP 端点 ----

function setupStreamableHttpEndpoint(app: Express): void {
  // 使用有状态模式：自动生成 sessionId
  const transport = new StreamableHTTPServerTransport({
    sessionIdGenerator: () => randomUUID(),
    onsessioninitialized: (sessionId) => {
      console.error(`[Godot MCP] Streamable HTTP session started: ${sessionId}`);
    },
    onsessionclosed: (sessionId) => {
      console.error(`[Godot MCP] Streamable HTTP session closed: ${sessionId}`);
    },
  });

  // 每个会话使用独立的 Server 实例
  const server = createMcpServer();
  transport.onclose = undefined; // 由 transport 自身管理生命周期

  // 连接 Server 到 Transport
  server.connect(transport).then(() => {
    console.error('[Godot MCP] Streamable HTTP transport ready');
  });

  // 处理所有 MCP 请求（GET / POST / DELETE）
  app.all('/mcp', async (req: Request, res: Response) => {
    try {
      await transport.handleRequest(
        req as unknown as IncomingMessage,
        res as unknown as ServerResponse,
        req.body
      );
    } catch (err: any) {
      console.error('[Godot MCP] Streamable HTTP error:', err.message);
      if (!res.headersSent) {
        res.status(500).json({ error: 'Internal server error' });
      }
    }
  });
}

// ---- SSE 端点 ----

function setupSseEndpoint(app: Express): void {
  // GET /sse — 建立 SSE 连接
  app.get('/sse', async (req: Request, res: Response) => {
    console.error('[Godot MCP] SSE connection established');

    // 为每个 SSE 连接创建独立的 Server + Transport
    const server = createMcpServer();
    const transport = new SSEServerTransport('/sse', res as unknown as ServerResponse);

    transport.onclose = () => {
      console.error('[Godot MCP] SSE connection closed');
    };

    await server.connect(transport);
    await transport.start();

    // 存储 transport 引用以便 POST 请求能找到对应的会话
    // 使用 query param 或 header 中的 sessionId
    const sessionId = transport.sessionId;
    res.setHeader('Mcp-Session-Id', sessionId);
    sseTransports.set(sessionId, { server, transport });
  });

  // POST /sse — 接收客户端消息
  app.post('/sse', async (req: Request, res: Response) => {
    const sessionId = req.headers['mcp-session-id'] as string;

    if (!sessionId) {
      res.status(400).json({ error: 'Missing Mcp-Session-Id header' });
      return;
    }

    const session = sseTransports.get(sessionId);
    if (!session) {
      res.status(404).json({ error: 'Session not found' });
      return;
    }

    try {
      await session.transport.handlePostMessage(
        req as unknown as IncomingMessage,
        res as unknown as ServerResponse,
        req.body
      );
    } catch (err: any) {
      console.error('[Godot MCP] SSE POST error:', err.message);
      if (!res.headersSent) {
        res.status(500).json({ error: 'Internal server error' });
      }
    }
  });
}

// SSE 会话管理（sessionId → { server, transport }）
const sseTransports = new Map<string, { server: ReturnType<typeof createMcpServer>; transport: SSEServerTransport }>();
