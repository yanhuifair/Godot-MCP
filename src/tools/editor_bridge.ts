// Copyright (c) 2026 FairYan
// SPDX-License-Identifier: AGPL-3.0-or-later
// ============================================================
// Godot MCP Server — Live Editor Bridge (connection layer)
// ============================================================
// 从 editor.ts 拆出来：这里只管「怎么把一条命令送到编辑器」——
// TCP 长连接优先、失败退回 spawn Godot 子进程，外加连接健康探测与清理。
// 上面那 110 个 editor_* 工具只依赖 sendEditorCommand()，与传输细节无关。
//
// 传输约定：
//   - TCP:  127.0.0.1:9876，行分隔的 JSON-RPC（插件侧 plugin.gd 实现）
//   - spawn: 没有现成编辑器时自己拉起 Godot，走 stdin/stdout
//   - 两条通道都用 __MCP__: 前缀标记协议层级响应，避免与 Godot 自身日志混淆
// ============================================================

import net from 'node:net';
import { spawn, ChildProcess } from 'node:child_process';
import { editorCommandError } from '../utils/errors.js';
import { findGodotBinary } from '../utils/godot_cli.js';

const EDITOR_PORT = 9876;
const TCP_CONNECT_TIMEOUT = 800;   // quick probe for an existing editor on 127.0.0.1
const TCP_RESPONSE_TIMEOUT = 30000; // per-request response wait (heavy ops: bake, reimport, run_gdscript)
const SPAWN_TIMEOUT = 15000;
const MAX_RESTART_ATTEMPTS = 3;
const RESPONSE_MARKER = '__MCP__:';

let _editorProcess: ChildProcess | null = null;
const _pendingRequests: Map<number, { resolve: (value: any) => void; reject: (err: Error) => void }> = new Map();
let _stdoutBuffer = '';
let _projectRoot: string | null = null;
let _useTcp: boolean | null = null; // null = unknown, true = TCP, false = spawn
let _restartAttempts = 0;
/** Monotonic request id so concurrent commands never collide in the pending Maps. */
let _requestIdCounter = 0;

// ---- Persistent TCP connection ----
let _tcpClient: net.Socket | null = null;
let _tcpBuf = '';
const _tcpPending: Map<number, { resolve: (value: any) => void; reject: (err: Error) => void }> = new Map();
/** In-progress connect promise — shared by concurrent callers so only one socket is opened. */
let _tcpConnecting: Promise<net.Socket> | null = null;

function getTcpConnection(): Promise<net.Socket> {
  // Return existing healthy connection
  if (_tcpClient && !_tcpClient.destroyed && _tcpClient.readyState === 'open') {
    return Promise.resolve(_tcpClient);
  }

  // Share an in-progress connect so concurrent callers don't open multiple sockets
  if (_tcpConnecting) return _tcpConnecting;

  _tcpConnecting = new Promise((resolve, reject) => {
    // Close stale connection
    if (_tcpClient) {
      try { _tcpClient.destroy(); } catch { /* 套接字可能已经死了，忽略 */ }
      _tcpClient = null;
    }

    // Reject all pending
    for (const [, p] of _tcpPending) {
      p.reject(new Error('Connection lost'));
    }
    _tcpPending.clear();
    _tcpBuf = '';

    const client = new net.Socket();
    const timer = setTimeout(() => {
      client.destroy();
      _tcpConnecting = null;
      _useTcp = null; // allow re-probe / spawn fallback on next call
      reject(new Error('TCP connection timed out'));
    }, TCP_CONNECT_TIMEOUT);

    // Connect-phase error handler (auto-removed once connected)
    const onConnectError = (err: Error) => {
      clearTimeout(timer);
      _tcpConnecting = null;
      _useTcp = null;
      reject(new Error(`TCP connection failed: ${err.message}`));
    };
    client.once('error', onConnectError);

    client.connect(EDITOR_PORT, '127.0.0.1', () => {
      clearTimeout(timer);
      client.removeListener('error', onConnectError);
      _tcpClient = client;
      _tcpConnecting = null;
      _useTcp = true;

      // 插件若配置了 auth_token（GODOT_MCP_TOKEN），TCP 连接必须先完成 auth 握手。
      // 该响应不会匹配任何 pending 请求，会被 data 处理器忽略。
      const token = process.env.GODOT_MCP_TOKEN;
      if (token) {
        client.write(JSON.stringify({ jsonrpc: '2.0', id: 'auth', method: 'auth', params: { token } }) + '\n');
      }

      client.on('data', (chunk: Buffer) => {
        _tcpBuf += chunk.toString();
        // 解析完整的 JSON-RPC 响应（可能跨 chunk）
        let idx: number;
        while ((idx = _tcpBuf.indexOf('\n')) !== -1) {
          const line = _tcpBuf.substring(0, idx).trim();
          _tcpBuf = _tcpBuf.substring(idx + 1);
          if (!line) continue;
          try {
            const response = JSON.parse(line);
            const pending = _tcpPending.get(response.id);
            if (pending) {
              _tcpPending.delete(response.id);
              if (response.error) {
                pending.reject(new Error(response.error.message || 'Editor error'));
              } else {
                pending.resolve(response.result);
              }
            }
          } catch {
            // 插件偶尔会给出不完整/非 JSON 的一行（例如握手期的裸文本）。
            // 静默吞掉会让调用方只能干等 TCP_RESPONSE_TIMEOUT，所以至少留个痕。
            console.error(`[Godot MCP] Ignoring malformed editor response: ${line.slice(0, 200)}`);
          }
        }
      });

      client.on('error', () => {
        _tcpClient = null;
        _useTcp = null; // connection lost → re-probe / spawn fallback on next call
        for (const [, p] of _tcpPending) {
          p.reject(new Error('TCP connection error'));
        }
        _tcpPending.clear();
      });

      client.on('close', () => {
        _tcpClient = null;
        _useTcp = null; // connection lost → re-probe / spawn fallback on next call
        for (const [, p] of _tcpPending) {
          p.reject(new Error('TCP connection closed'));
        }
        _tcpPending.clear();
      });

      resolve(client);
    });
  });

  return _tcpConnecting;
}

// ---- Dual-mode send ----

/**
 * Godot 侧把业务失败放在 result 里（`{"error": "Node not found"}`），而不是
 * JSON-RPC 的 error 字段。以前没人检查它，于是删除不存在的节点也会回报
 * "Node removed"，AI 客户端拿到假成功后会继续往下错。这里统一拦截。
 */
function assertEditorOk(method: string, result: any): any {
  if (result && typeof result === 'object' && typeof result.error === 'string' && result.error !== '') {
    throw editorCommandError(method, result.error);
  }
  return result;
}

export function sendEditorCommand(method: string, params: Record<string, any> = {}): Promise<any> {
  const send = (): Promise<any> => {
    // If we already know which mode works, use it
    if (_useTcp === true) return sendViaTcp(method, params);
    if (_useTcp === false) return sendViaSpawn(method, params);

    // First call: try TCP first, fall back to spawn
    return sendViaTcp(method, params).catch(() => sendViaSpawn(method, params));
  };
  return send().then((result) => assertEditorOk(method, result));
}

/**
 * 只读探测：给 `get_status` 这类诊断用。
 *
 * 与 sendEditorCommand 的两点关键区别：
 *  1. **绝不 spawn 编辑器** —— 诊断"编辑器连上了吗"却顺手启动一个编辑器是荒谬的副作用。
 *  2. 超时是 probeTimeoutMs（默认 1.5s）而不是 TCP_RESPONSE_TIMEOUT(30s) —— 诊断工具必须秒回。
 *
 * 返回 null 表示不可达，不抛异常。
 */
export async function probeEditor(probeTimeoutMs = 1500): Promise<any | null> {
  if (_useTcp === false) return null; // 已知只能靠 spawn ⇒ 视为"没有在跑的编辑器"
  try {
    const client = await getTcpConnection();
    const id = ++_requestIdCounter;
    const request = JSON.stringify({ jsonrpc: '2.0', id, method: 'get_editor_version', params: {} }) + '\n';
    return await new Promise<any | null>((resolve) => {
      const timer = setTimeout(() => {
        _tcpPending.delete(id);
        resolve(null);
      }, probeTimeoutMs);
      _tcpPending.set(id, {
        resolve: (result) => { clearTimeout(timer); resolve(result); },
        reject: () => { clearTimeout(timer); resolve(null); },
      });
      client.write(request);
    });
  } catch {
    return null;
  }
}

// ---- TCP mode (persistent connection to already-running Godot) ----

async function sendViaTcp(method: string, params: Record<string, any> = {}): Promise<any> {
  const client = await getTcpConnection();
  const id = ++_requestIdCounter;
  const request = JSON.stringify({ jsonrpc: '2.0', id, method, params }) + '\n';

  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      _tcpPending.delete(id);
      reject(new Error('TCP request timed out'));
    }, TCP_RESPONSE_TIMEOUT);

    _tcpPending.set(id, {
      resolve: (result) => { clearTimeout(timer); resolve(result); },
      reject: (err) => { clearTimeout(timer); reject(err); },
    });

    client.write(request);
  });
}

// ---- Spawn mode (launch Godot as child process) ----

function ensureEditorProcess(): ChildProcess {
  if (_editorProcess && !_editorProcess.killed && _editorProcess.exitCode === null) {
    return _editorProcess;
  }

  if (!_projectRoot) {
    throw new Error('Editor bridge not initialized. Call initEditorBridge(projectRoot) first.');
  }

  const godotPath = findGodotBinary();
  if (!godotPath) {
    throw new Error('Godot binary not found. Set GODOT_PATH environment variable.');
  }

  _editorProcess = spawn(godotPath, ['--editor', '--path', _projectRoot], {
    stdio: ['pipe', 'pipe', 'pipe'],
    env: { ...process.env, MCP_STDIO: 'true' },
  });

  _stdoutBuffer = '';

  _editorProcess.stdout!.on('data', (data: Buffer) => {
    _stdoutBuffer += data.toString();
    const lines = _stdoutBuffer.split('\n');
    _stdoutBuffer = lines.pop() || '';

    for (const line of lines) {
      if (line.startsWith(RESPONSE_MARKER)) {
        try {
          const json = JSON.parse(line.substring(RESPONSE_MARKER.length));
          const resolver = _pendingRequests.get(json.id);
          if (resolver) {
            _pendingRequests.delete(json.id);
            if (json.error) {
              resolver.reject(new Error(json.error.message || 'Editor error'));
            } else {
              resolver.resolve(json.result);
            }
          }
        } catch { /* skip malformed */ }
      }
    }
  });

  _editorProcess.stderr!.on('data', (data: Buffer) => {
    const text = data.toString().trim();
    if (text) console.error(`[godot-editor] ${text}`);
  });

  _editorProcess.on('exit', (code) => {
    console.error(`[Godot MCP] Editor process exited (code=${code})`);
    for (const [, resolver] of _pendingRequests) {
      resolver.reject(new Error(`Editor process exited (code=${code})`));
    }
    _pendingRequests.clear();
    _editorProcess = null;

    // Auto-restart on unexpected exit (not caused by shutdown)
    if (code !== 0 && _restartAttempts < MAX_RESTART_ATTEMPTS) {
      _restartAttempts++;
      console.error(`[Godot MCP] Auto-restarting editor (attempt ${_restartAttempts}/${MAX_RESTART_ATTEMPTS})...`);
      try {
        ensureEditorProcess();
      } catch {
        console.error('[Godot MCP] Editor auto-restart failed');
      }
    }
  });

  _editorProcess.on('error', (err) => {
    console.error(`[Godot MCP] Failed to spawn editor: ${err.message}`);
    _editorProcess = null;
    for (const [, resolver] of _pendingRequests) {
      resolver.reject(new Error(`Editor spawn error: ${err.message}`));
    }
    _pendingRequests.clear();
  });

  return _editorProcess;
}

function sendViaSpawn(method: string, params: Record<string, any> = {}): Promise<any> {
  return new Promise((resolve, reject) => {
    try {
      const proc = ensureEditorProcess();
      const id = ++_requestIdCounter;
      const request = JSON.stringify({ jsonrpc: '2.0', id, method, params }) + '\n';

      // 先建定时器、再注册回调：回调里要 clearTimeout，用 const 就必须保证
      // 定时器在回调被定义之前已初始化（否则 const 的 TDZ 会在回调里抛错）。
      const timer = setTimeout(() => {
        if (_pendingRequests.has(id)) {
          _pendingRequests.delete(id);
          reject(new Error(`Editor command timed out: ${method}`));
        }
      }, SPAWN_TIMEOUT);
      _pendingRequests.set(id, {
        resolve: (result) => { clearTimeout(timer); resolve(result); },
        reject: (err) => { clearTimeout(timer); reject(err); },
      });
      _useTcp = false;
      proc.stdin!.write(request);
    } catch (err: any) {
        reject(new Error(`Editor not available: ${err.message}`));
    }
  });
}

/** Initialize the editor bridge with the project root. Call once on startup. */
export function initEditorBridge(projectRoot: string): void {
  _projectRoot = projectRoot;
  _restartAttempts = 0;
}

/** Shut down the editor process gracefully */
export function shutdownEditorBridge(): void {
  _restartAttempts = MAX_RESTART_ATTEMPTS; // prevent auto-restart during shutdown
  if (_editorProcess && !_editorProcess.killed) {
    _editorProcess.kill();
  }
  _editorProcess = null;
  for (const [, resolver] of _pendingRequests) {
    resolver.reject(new Error('Server shutting down'));
  }
  _pendingRequests.clear();

  // Tear down the persistent TCP connection too
  for (const [, p] of _tcpPending) {
    p.reject(new Error('Server shutting down'));
  }
  _tcpPending.clear();
  if (_tcpClient) {
    try { _tcpClient.destroy(); } catch { /* 套接字可能已经死了，忽略 */ }
    _tcpClient = null;
  }
  _tcpConnecting = null;
  _useTcp = null;
}
