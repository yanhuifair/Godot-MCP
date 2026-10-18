// Copyright (c) 2026 FairYan
// SPDX-License-Identifier: AGPL-3.0-or-later
// ============================================================
// Regression tests for the live-game runtime probe used by get_status.
//
// Bug (reported against v1.12.9): `get_status({probe_runtime: true})` is
// documented as "probe the live-game runtime bridge (port 9877)", but it never
// probed. It first consulted `isGameReachable()`, a flag written only on a
// successful socket connect and treated as valid for 5000 ms. So a game that
// was running and listening on 9877 was reported as "not running / not enabled"
// whenever no runtime_* command had been issued in the last five seconds.
//
// The gate is gone: `probeGameRuntime()` opens the socket and sends a real
// `ping`. These tests drive the real TCP path against a fake bridge on 9877
// (the port is hardcoded in runtime_bridge.ts), including the 5-second wait
// that used to flip the answer.
// ============================================================

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import net from 'node:net';
import fs from 'node:fs';
import { probeGameRuntime } from '../src/tools/runtime_bridge.js';
import { handleGetStatus } from '../src/tools/meta.js';

const PORT = 9877;
const CLOCK_GAP_MS = 5500; // > the old GAME_HEALTH_CACHE_MS (5000)

let server: net.Server | null = null;
let portAvailable = false;
let silent = false; // accept connections but never answer -> ping must time out
const clients = new Set<net.Socket>();

/** Minimal stand-in for addons/godot-mcp/runtime_bridge.gd: answers every request with {"ok": true}. */
async function startFakeBridge(): Promise<void> {
  server = net.createServer((socket) => {
    clients.add(socket);
    socket.on('close', () => clients.delete(socket));
    socket.on('error', () => { /* 客户端随时可能消失，测试里无所谓 */ });
    let buf = '';
    socket.on('data', (chunk: Buffer) => {
      buf += chunk.toString();
      let idx: number;
      while ((idx = buf.indexOf('\n')) !== -1) {
        const line = buf.slice(0, idx).trim();
        buf = buf.slice(idx + 1);
        if (!line || silent) continue;
        const req = JSON.parse(line);
        socket.write(JSON.stringify({ jsonrpc: '2.0', id: req.id, result: { ok: true } }) + '\n');
      }
    });
  });
  await new Promise<void>((resolve) => {
    server!.once('error', () => { server = null; resolve(); });
    server!.listen(PORT, '127.0.0.1', () => resolve());
  });
}

async function stopFakeBridge(): Promise<void> {
  for (const s of clients) s.destroy();
  clients.clear();
  if (!server) return;
  await new Promise<void>((resolve) => server!.close(() => resolve()));
  server = null;
}

describe('get_status runtime probe', () => {
  beforeAll(async () => {
    // The port is fixed in the source, so if something real is listening
    // (a developer running an actual game) we cannot run these assertions.
    portAvailable = await new Promise<boolean>((resolve) => {
      const probe = net.createServer();
      probe.once('error', () => resolve(false));
      probe.listen(PORT, '127.0.0.1', () => probe.close(() => resolve(true)));
    });
  });

  afterAll(async () => {
    await stopFakeBridge();
  });

  it('does not gate the probe behind a cached flag (no isGameReachable re-introduction)', () => {
    // Strip comments first: the explanatory prose in meta.ts still names the
    // removed helper, and prose must not satisfy or break a code check.
    const meta = fs
      .readFileSync('src/tools/meta.ts', 'utf8')
      .split('\n')
      .filter((l) => !l.trim().startsWith('//'))
      .join('\n');
    expect(meta).not.toContain('isGameReachable');
    expect(meta).toContain('await probeGameRuntime()');
  });

  it('reports not reachable when nothing listens on 9877', async () => {
    if (!portAvailable) return;
    const probe = await probeGameRuntime();
    expect(probe.reachable).toBe(false);
    expect(probe.responding).toBe(false);

    const status = (await handleGetStatus({ probe_runtime: true })).content[0].text;
    expect(status).toContain('Runtime bridge: not running / not enabled');
  });

  it('keeps reporting the running game after the old 5s cache window expires', async () => {
    if (!portAvailable) return;
    await startFakeBridge();
    expect(server).not.toBeNull();

    const first = (await handleGetStatus({ probe_runtime: true })).content[0].text;
    expect(first).toContain('Runtime bridge: connected (game running)');

    // Nobody issues a runtime_* command in between — the old implementation
    // expired its flag here and reported the bridge as down.
    await new Promise((r) => setTimeout(r, CLOCK_GAP_MS));

    const second = (await handleGetStatus({ probe_runtime: true })).content[0].text;
    expect(second).toContain('Runtime bridge: connected (game running)');
  }, 20000);

  it('distinguishes "port open but ping unanswered" from "not running"', async () => {
    if (!portAvailable) return;
    silent = true;
    try {
      const probe = await probeGameRuntime();
      expect(probe.reachable).toBe(true);
      expect(probe.responding).toBe(false);
      expect(probe.error).toContain('timed out');
    } finally {
      silent = false;
    }
  }, 20000);

  it('skips the probe entirely when probe_runtime is false', async () => {
    const status = (await handleGetStatus({ probe_runtime: false })).content[0].text;
    expect(status).not.toContain('Runtime bridge:');
  });
});
