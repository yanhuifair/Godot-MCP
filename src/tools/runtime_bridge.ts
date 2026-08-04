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
const RESPONSE_MARKER = '\n'; // one JSON object per line
const GAME_RESPONSE_TIMEOUT = 15000;
const GAME_HEALTH_CACHE_MS = 5000;

let _client: net.Socket | null = null;
let _buf = '';
let _pending: Map<number, { resolve: (v: any) => void; reject: (e: Error) => void }> = new Map();
let _connecting: Promise<net.Socket> | null = null;
let _lastHealth = 0;
let _lastHealthy = false;
let _reqId = 0;

function getConnection(): Promise<net.Socket> {
  if (_client && !_client.destroyed && _client.readyState === 'open') {
    return Promise.resolve(_client);
  }
  if (_connecting) return _connecting;

  _connecting = new Promise((resolve, reject) => {
    if (_client) { try { _client.destroy(); } catch {} _client = null; }
    for (const [, p] of _pending) p.reject(new Error('Connection lost'));
    _pending.clear();
    _buf = '';

    const client = new net.Socket();
    const timer = setTimeout(() => {
      client.destroy();
      _connecting = null;
      reject(new Error('Runtime bridge connection timed out'));
    }, 1500);

    client.once('error', (err) => {
      clearTimeout(timer);
      _connecting = null;
      reject(new Error(`Runtime bridge connection failed: ${err.message}`));
    });

    client.connect(GAME_PORT, '127.0.0.1', () => {
      clearTimeout(timer);
      _client = client;
      _connecting = null;
      _lastHealth = Date.now();
      _lastHealthy = true;
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
          } catch {}
        }
      });
      client.on('close', () => {
        _lastHealthy = false;
        _client = null;
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

export function isGameReachable(): boolean {
  if (Date.now() - _lastHealth < GAME_HEALTH_CACHE_MS) return _lastHealthy;
  return false;
}

/** Drop any live connection (used on shutdown). */
export function shutdownGameBridge(): void {
  if (_client) { try { _client.destroy(); } catch {} _client = null; }
  for (const [, p] of _pending) p.reject(new Error('Server shutting down'));
  _pending.clear();
  _connecting = null;
}
