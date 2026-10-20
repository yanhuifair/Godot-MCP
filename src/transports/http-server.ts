// Copyright (c) 2026 FairYan
// SPDX-License-Identifier: AGPL-3.0-or-later
// ============================================================
// HTTP Transport - SSE + Streamable HTTP 双协议支持
// ============================================================
// 基于 Express 启动 HTTP 服务器，同时暴露：
//   - GET/POST /sse        →  SSE 传输（兼容旧版 MCP 客户端）
//   - GET/POST /mcp        →  Streamable HTTP 传输（MCP 2025 规范）
//   - GET /health          →  健康检查端点
// ============================================================

import type { IncomingMessage, ServerResponse } from 'node:http';
import type { Express, Request, Response, NextFunction } from 'express';
import { timingSafeEqual } from 'node:crypto';
import { SSEServerTransport } from '@modelcontextprotocol/sdk/server/sse.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { createMcpExpressApp } from '@modelcontextprotocol/sdk/server/express.js';
import { randomUUID } from 'node:crypto';
import { createMcpServer, initSharedResources, getProjectRoot } from '../server.js';
import { initEditorBridge, shutdownEditorBridge } from '../tools/editor_bridge.js';
import { cleanupProcesses } from '../utils/godot_cli.js';
import { resolveHttpToken } from '../utils/http_token.js';
import { VERSION } from '../utils/version.js';

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

/** Constant-time string comparison to avoid timing side-channels on token checks. */
function safeTokenEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  try {
    return timingSafeEqual(Buffer.from(a), Buffer.from(b));
  } catch {
    return false;
  }
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

  // ---- 安全防线：非 loopback 绑定必须设置 GODOT_MCP_TOKEN ----
  // 该服务器可读写文件系统、执行 GDScript、导出工程，暴露到局域网/公网
  // 而无鉴权等于远程代码执行。拒绝启动而不是静默裸奔。
  const isLoopback = /^(127\.\d+\.\d+\.\d+|localhost|::1|0:0:0:0:0:0:0:1)$/i.test(host);
  if (!isLoopback && !process.env.GODOT_MCP_TOKEN) {
    console.error(
      `[Godot MCP] Refusing to listen on non-loopback host "${host}" without GODOT_MCP_TOKEN. ` +
      'Set GODOT_MCP_TOKEN to enable remote access, or bind 127.0.0.1.'
    );
    process.exit(1);
  }

  // 初始化共享资源
  const { projectRoot } = initSharedResources(options.projectRoot);
  if (projectRoot) {
    console.error(`[Godot MCP] Project root: ${projectRoot}`);
    initEditorBridge(projectRoot);
  }

  // 创建 Express 应用（自带 DNS rebinding 防护）
  const app = createMcpExpressApp({ host });

  // ---- 鉴权令牌（始终存在） ----
  // /mcp 与 /sse 的每个请求都必须携带令牌：
  //   Authorization: Bearer <token>   或   ?token=<token>
  // 来源优先级：GODOT_MCP_TOKEN > 工程 .godot/mcp_http_token >
  //             ~/.godot-mcp/http_token > 新生成并落盘。
  // 持久化的目的：以前每次启动都换一个一次性令牌，已配好的 HTTP 客户端下
  // 次启动就 401，等于逼用户每次去日志里捞令牌。
  const tokenInfo = resolveHttpToken(projectRoot);
  const mcpToken = tokenInfo.token;
  if (tokenInfo.source === 'env') {
    console.error('[Godot MCP] HTTP auth token: from GODOT_MCP_TOKEN');
  } else {
    const where = tokenInfo.path ?? '(in-memory, not persisted)';
    const verb = tokenInfo.created ? 'created' : 'reusing';
    console.error(`[Godot MCP] HTTP auth token ${verb}: ${where}`);
    // 令牌值只在**首次生成**时打印一次。之后每次启动都往日志里写一遍秘密
    // 没有收益（客户端早就配好了），反而让 stderr/日志文件变成泄密源。
    // 想再看就 cat 上面那个文件。
    if (tokenInfo.created) {
      console.error(`[Godot MCP]   token: ${mcpToken}`);
      console.error('[Godot MCP]   (reused on every start; set GODOT_MCP_TOKEN to override)');
    }
    if (tokenInfo.warning) {
      console.error(`[Godot MCP]   warning: ${tokenInfo.warning}`);
    }
  }

  /** 请求是否携带了正确的令牌。 */
  const requestHasValidToken = (req: Request): boolean => {
    const header = req.headers['authorization'];
    const fromHeader = typeof header === 'string' && header.startsWith('Bearer ')
      ? header.slice(7)
      : undefined;
    const fromQuery = typeof req.query.token === 'string' ? req.query.token : undefined;
    const provided = fromHeader ?? fromQuery;
    return !!provided && safeTokenEqual(provided, mcpToken);
  };

  console.error('[Godot MCP] HTTP auth ENABLED');
  const authMiddleware = (req: Request, res: Response, next: NextFunction) => {
    if (requestHasValidToken(req)) return next();
    res.status(401).json({ error: 'Unauthorized: invalid or missing token' });
  };
  app.use(['/mcp', '/sse'], authMiddleware);

  // ---- Streamable HTTP 端点 (/mcp) ----
  if (enableStreamableHttp) {
    setupStreamableHttpEndpoint(app);
    startSessionSweeper();
  }

  // ---- SSE 端点 (/sse) ----
  if (enableSse) {
    setupSseEndpoint(app);
  }

  // ---- 健康检查 ----
  // /health 故意不挂强制鉴权（探活工具要能用），但它不能当信息泄露口：
  // 非 loopback 部署时它对本网段可见，回显 projectRoot 绝对路径等于告诉别人
  // 这台机器上的目录结构。因此只有「本机请求」或「带了正确令牌」才回显路径。
  app.get('/health', (req: Request, res: Response) => {
    // 判断"是不是本机在问"要看**对端地址**，而不是我们绑在哪个接口上：
    // 绑 0.0.0.0 时 isLoopback 为 false，但请求可能就来自 127.0.0.1；反之
    // 绑在 loopback 上时同理。用 remoteAddress 才不会把路径泄露给局域网。
    const remote = req.socket.remoteAddress ?? '';
    const fromLoopback = /^(127\.\d+\.\d+\.\d+|::1|::ffff:127\.\d+\.\d+\.\d+|0:0:0:0:0:0:0:1)$/i.test(remote);
    const mayRevealPaths = fromLoopback || requestHasValidToken(req);
    res.json({
      status: 'ok',
      version: VERSION,
      ...(mayRevealPaths ? { projectRoot: getProjectRoot() } : {}),
      endpoints: {
        ...(enableSse ? { sse: `http://${host}:${port}/sse` } : {}),
        ...(enableStreamableHttp ? { streamableHttp: `http://${host}:${port}/mcp` } : {}),
      },
    });
  });

  // 启动 HTTP 服务器。启动失败（端口占用等）通过 reject 让调用方（index.ts 的
  // all 模式 .catch）走受控退出路径；运行期 error 事件也由此监听器消费，
  // 不会升级为 uncaughtException。
  let server: ReturnType<typeof app.listen>;
  await new Promise<void>((resolve, reject) => {
    server = app.listen(port, host, () => {
      console.error(`[Godot MCP] HTTP server listening on http://${host}:${port}`);
      if (enableSse) {
        console.error(`[Godot MCP]   SSE endpoint:           http://${host}:${port}/sse`);
      }
      if (enableStreamableHttp) {
        console.error(`[Godot MCP]   Streamable HTTP:        http://${host}:${port}/mcp`);
      }
      console.error(`[Godot MCP]   Health check:           http://${host}:${port}/health`);
      resolve();
    });
    server.on('error', (err: NodeJS.ErrnoException) => {
      console.error(`[Godot MCP] HTTP server error: ${err.message}`);
      reject(err);
    });
  });

  // 优雅关闭
  let shuttingDown = false;
  const shutdown = async () => {
    if (shuttingDown) return;
    shuttingDown = true;
    console.error('[Godot MCP] Shutting down HTTP server...');
    shutdownEditorBridge();
    cleanupProcesses(); // kill any spawned Godot editor/game/export processes
    // 等监听真正关闭再退：`--transport all` 下 stdio 还在同一进程里，直接
    // process.exit 会把正在写的响应/日志截断。close() 无回调参时要自己等。
    await new Promise<void>((resolve) => {
      const timer = setTimeout(resolve, 2000); // 兜底：别因为挂着的长连接永远不退出
      server.close(() => { clearTimeout(timer); resolve(); });
      timer.unref?.();
    });
    if (sweeper) clearInterval(sweeper);
    process.exit(0);
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

// ---- Streamable HTTP 端点 ----

// Streamable HTTP 会话管理（sessionId -> transport）
const mcpTransports = new Map<string, StreamableHTTPServerTransport>();
// 对应的 Server 实例 + 最近活动时间。SDK 只在我们（或客户端）显式终止会话时
// 回调 onsessionclosed；客户端直接断网不告而别时它不会触发，于是每个僵尸会话
// 都白占一个 Server（含工具注册表）。这里做空闲回收兜底。
const sessions = new Map<string, { server: unknown; lastSeen: number }>();
const SESSION_IDLE_TTL_MS = 60 * 60 * 1000; // 1 小时无任何请求即视为僵尸
const SESSION_SWEEP_MS = 15 * 60 * 1000;

let sweeper: NodeJS.Timeout | null = null;
function startSessionSweeper(): void {
  if (sweeper) return;
  sweeper = setInterval(() => {
    const now = Date.now();
    for (const [sid, s] of sessions) {
      if (now - s.lastSeen < SESSION_IDLE_TTL_MS) continue;
      console.error(`[Godot MCP] Reaping idle Streamable HTTP session: ${sid}`);
      try { (s.server as any)?.close?.(); } catch { /* best-effort disposal */ }
      mcpTransports.delete(sid);
      sessions.delete(sid);
    }
  }, SESSION_SWEEP_MS);
  // 定时器不能拖住进程退出
  sweeper.unref();
}

function setupStreamableHttpEndpoint(app: Express): void {
  // 有状态模式：每个会话（Mcp-Session-Id）使用独立的 Server + Transport 实例，
  // 避免多客户端 / 并发时共享同一 transport 导致的会话错乱。
  app.all('/mcp', async (req: Request, res: Response) => {
    const sessionId = req.headers['mcp-session-id'] as string | undefined;
    let transport = sessionId ? mcpTransports.get(sessionId) : undefined;

    if (!transport) {
      if (sessionId) {
        // 提供了 sessionId 但服务端找不到对应会话
        res.status(404).json({ error: 'Session not found' });
        return;
      }
      // 新会话：为该连接创建专用的 transport 与 server
      const entry: { server: unknown; lastSeen: number } = { server: null, lastSeen: Date.now() };
      transport = new StreamableHTTPServerTransport({
        sessionIdGenerator: () => randomUUID(),
        onsessioninitialized: (sid) => {
          mcpTransports.set(sid, transport!);
          sessions.set(sid, entry);
        },
        onsessionclosed: (sid) => {
          mcpTransports.delete(sid);
          sessions.delete(sid);
          console.error(`[Godot MCP] Streamable HTTP session closed: ${sid}`);
        },
      });
      const server = createMcpServer();
      entry.server = server;
      // 必须等 server 与 transport 连接完成后再处理首条请求（通常是 initialize）。
      // connect() 也可能抛（协议/版本不匹配等），必须包在 try 里——async
      // Express handler 里漏掉的异常会升级成 uncaughtException。
      try {
        await server.connect(transport);
      } catch (err: any) {
        console.error('[Godot MCP] Streamable HTTP connect failed:', err.message);
        if (!res.headersSent) res.status(500).json({ error: 'Internal server error' });
        return;
      }
    } else if (sessionId) {
      const s = sessions.get(sessionId);
      if (s) s.lastSeen = Date.now();
    }

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

    // 注意：server.connect(transport) 内部会自动调用 transport.start()，
    // 这里绝不能再多调一次 start()——SDK 会抛 "already started"，
    // 而 async handler 里未捕获的异常会让整个 server 进程崩溃（连带
    // streamable-http / stdio 一起挂）。同理用 try/catch 兜底。
    try {
      await server.connect(transport);
    } catch (err: any) {
      console.error('[Godot MCP] SSE connection failed:', err.message);
      if (!res.headersSent) res.status(500).end();
      return;
    }

    // 存储 transport 引用以便 POST 请求能找到对应的会话
    // 注意：不能再 res.setHeader('Mcp-Session-Id')——connect() 里
    // transport.start() 已经把响应头发出去（SDK 靠 endpoint 事件把
    // sessionId 告诉客户端），此时 setHeader 会抛 ERR_HTTP_HEADERS_SENT。
    const sessionId = transport.sessionId;
    sseTransports.set(sessionId, { server, transport });

    // ⚠️ 这里绝不能再调 server.close()：SDK 的 Protocol.close() →
    // SSEServerTransport.close() → onclose() 是无条件回调（没有 _closed 守卫），
    // 而客户端断开时 res 'close' → onclose() 已经触发过一次。于是
    // onclose → server.close() → transport.close() → onclose → … 无限递归，
    // 直接爆栈（RangeError: Maximum call stack size exceeded）。
    // 断开本身就是 close 的**结果**，这里只需清理注册表。
    let closed = false;
    transport.onclose = () => {
      if (closed) return;
      closed = true;
      console.error(`[Godot MCP] SSE connection closed: ${sessionId}`);
      sseTransports.delete(sessionId);
    };
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
