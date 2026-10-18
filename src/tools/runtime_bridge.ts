// Copyright (c) 2026 FairYan
// SPDX-License-Identifier: AGPL-3.0-or-later
// ============================================================
// Godot MCP Server — Live Game Runtime Bridge (client)
// ============================================================
// Talks to the `godot_mcp_runtime` autoload running INSIDE the played game
// (addons/godot-mcp/runtime_bridge.gd). Unlike the editor bridge, this target
// is the *running game*, so it can introspect the live scene tree, set
// properties, call methods, inject input, and pause/step the game clock.
//
// The game exposes a tiny JSON-RPC-over-TCP server on 127.0.0.1:9877. This
// module is a thin, timeout-guarded client.

import net from 'node:net';

const GAME_PORT = 9877;
const GAME_CONNECT_TIMEOUT = 1500;
const GAME_RESPONSE_TIMEOUT = 15000;
// get_status 用的 ping 超时：诊断工具必须秒回，不能陪着 15s 的业务超时一起卡。
const GAME_PROBE_TIMEOUT = 2000;

let _client: net.Socket | null = null;
let _buf = '';
const _pending: Map<number, { resolve: (v: any) => void; reject: (e: Error) => void }> = new Map();
let _connecting: Promise<net.Socket> | null = null;
let _reqId = 0;

function getConnection(): Promise<net.Socket> {
  if (_client && !_client.destroyed && _client.readyState === 'open') {
    return Promise.resolve(_client);
  }
  if (_connecting) return _connecting;

  _connecting = new Promise((resolve, reject) => {
    if (_client) { try { _client.destroy(); } catch { /* 套接字可能已经死了，忽略 */ } _client = null; }
    for (const [, p] of _pending) p.reject(new Error('Connection lost'));
    _pending.clear();
    _buf = '';

    const client = new net.Socket();
    const timer = setTimeout(() => {
      client.destroy();
      _connecting = null;
      reject(new Error('Runtime bridge connection timed out'));
    }, GAME_CONNECT_TIMEOUT);

    // 只在建连阶段生效，连上之后摘掉（下面换成长期 error 处理器）
    const onConnectError = (err: Error) => {
      clearTimeout(timer);
      _connecting = null;
      reject(new Error(`Runtime bridge connection failed: ${err.message}`));
    };
    client.once('error', onConnectError);

    client.connect(GAME_PORT, '127.0.0.1', () => {
      clearTimeout(timer);
      client.removeListener('error', onConnectError);
      _client = client;
      _connecting = null;
      client.on('data', (chunk: Buffer) => {
        _buf += chunk.toString();
        let idx: number;
        while ((idx = _buf.indexOf('\n')) !== -1) {
          const line = _buf.substring(0, idx).trim();
          _buf = _buf.substring(idx + 1);
          if (!line) continue;
          try {
            const res = JSON.parse(line);
            const p = _pending.get(res.id);
            if (p) {
              _pending.delete(res.id);
              if (res.error) p.reject(new Error(res.error.message || 'Runtime error'));
              else p.resolve(res.result);
            }
          } catch {
            // 与编辑器桥同理：静默丢弃畸形行会让调用方干等到超时，至少留个痕。
            console.error(`[Godot MCP] Ignoring malformed runtime response: ${line.slice(0, 200)}`);
          }
        }
      });
      // 连接建立后的异步错误（游戏退出时的 ECONNRESET 等）如果没有 handler，
      // 会变成未捕获的 'error' 事件直接干掉整个 MCP server。这里必须常驻。
      client.on('error', () => {
        if (_client === client) _client = null;
        for (const [, p] of _pending) p.reject(new Error('Runtime bridge connection error'));
        _pending.clear();
      });
      client.on('close', () => {
        if (_client === client) _client = null;
        for (const [, p] of _pending) p.reject(new Error('Runtime bridge disconnected'));
        _pending.clear();
      });
      resolve(client);
    });
  });
  return _connecting;
}

export async function sendGameCommand(method: string, params: Record<string, any> = {}): Promise<any> {
  const client = await getConnection();
  const id = ++_reqId;
  const req = JSON.stringify({ jsonrpc: '2.0', id, method, params }) + '\n';
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      _pending.delete(id);
      reject(new Error(`Runtime command timed out: ${method}`));
    }, GAME_RESPONSE_TIMEOUT);
    _pending.set(id, {
      resolve: (v) => { clearTimeout(timer); resolve(v); },
      reject: (e) => { clearTimeout(timer); reject(e); },
    });
    client.write(req);
  });
}

/**
 * 真探测：连一下 9877 并**实际发一个 ping**，而不是读「上次连接成功的时间」。
 *
 * 之前的 `isGameReachable()` 只在 connect 成功时写缓存、5 秒后过期，调用方
 * （get_status）拿它当门卫挡在 ping 前面 ⇒ 游戏明明还在监听，只要 5 秒内没发过
 * runtime_* 命令就会被报成 "not running / not enabled"。健康检查绝不能靠缓存。
 *
 * 返回值分三态，好让调用方如实描述：
 *  - reachable=false          端口都不通（游戏没跑 / autoload 没挂）
 *  - reachable=true, responding=false  端口开着但 ping 没回（autoload 卡住 / 端口被别的程序占了）
 *  - reachable=true, responding=true   桥活着
 *
 * 连不上时是 loopback 上的 ECONNREFUSED，秒回，不会拖慢 get_status。
 */
export interface GameProbeResult {
  reachable: boolean;
  responding: boolean;
  info?: any;
  error?: string;
}

export async function probeGameRuntime(): Promise<GameProbeResult> {
  let client: net.Socket;
  try {
    client = await getConnection();
  } catch (err: any) {
    return { reachable: false, responding: false, error: err?.message || String(err) };
  }

  const id = ++_reqId;
  try {
    const info = await new Promise<any>((resolve, reject) => {
      const timer = setTimeout(() => {
        _pending.delete(id);
        reject(new Error(`ping timed out after ${GAME_PROBE_TIMEOUT}ms`));
      }, GAME_PROBE_TIMEOUT);
      _pending.set(id, {
        resolve: (v) => { clearTimeout(timer); resolve(v); },
        reject: (e) => { clearTimeout(timer); reject(e); },
      });
      client.write(JSON.stringify({ jsonrpc: '2.0', id, method: 'ping', params: {} }) + '\n');
    });
    return { reachable: true, responding: true, info };
  } catch (err: any) {
    return { reachable: true, responding: false, error: err?.message || String(err) };
  }
}
