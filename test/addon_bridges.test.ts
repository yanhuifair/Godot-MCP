// Copyright (c) 2026 FairYan
// SPDX-License-Identifier: AGPL-3.0-or-later
// ============================================================
// Regression tests for the two GDScript TCP bridges:
//   addons/godot-mcp/plugin.gd          (editor bridge, :9876)
//   addons/godot-mcp/runtime_bridge.gd  (running-game bridge, :9877)
//
// These guard against three bugs that shipped in <= v1.9.1:
//   1. runtime_bridge.gd declared `func _input(Dictionary) -> Dictionary`,
//      which collides with the built-in virtual Node._input(InputEvent) -> void.
//      The whole script failed to parse, so the autoload never instantiated
//      and all 11 runtime_* tools were dead on arrival.
//   2. `var node := _resolve(...)` could not infer a type because _resolve()
//      had no declared return type -> 4 more parse errors in the same file.
//   3. Both bridges checked StreamPeerTCP.get_status() without calling poll()
//      first. get_status() is only refreshed by poll(), so a departed client
//      stayed "CONNECTED" forever, _peer was never cleared, and no second
//      client could ever connect until Godot was restarted.
// ============================================================

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';

const PLUGIN = 'addons/godot-mcp/plugin.gd';
const RUNTIME = 'addons/godot-mcp/runtime_bridge.gd';

/** Strip comment-only lines so prose in comments never satisfies/breaks a check. */
function code(path: string): string {
  return fs
    .readFileSync(path, 'utf8')
    .split('\n')
    .filter((l) => !l.trim().startsWith('#'))
    .join('\n');
}

describe('runtime_bridge.gd does not shadow Godot virtual methods', () => {
  // Node virtuals that take an engine-supplied argument. Redefining any of
  // these with a different signature is a hard parse error, which silently
  // kills the entire autoload.
  const RESERVED = [
    '_input',
    '_process',
    '_physics_process',
    '_unhandled_input',
    '_unhandled_key_input',
    '_shortcut_input',
    '_notification',
    '_draw',
  ];

  it('never declares a command handler using a reserved virtual name', () => {
    const src = code(RUNTIME);
    for (const name of RESERVED) {
      // A command handler is recognisable by taking a Dictionary and
      // returning a Dictionary — the virtuals never look like that.
      const bad = new RegExp(`func\\s+${name}\\s*\\([^)]*Dictionary[^)]*\\)\\s*->\\s*Dictionary`);
      expect(src, `${name}() must not be reused as a command handler`).not.toMatch(bad);
    }
  });

  it('routes the "input" command to a non-virtual handler', () => {
    const src = code(RUNTIME);
    expect(src).toMatch(/func\s+_cmd_input\s*\(/);
    expect(src).toMatch(/"input":\s*\n\s*return\s+_cmd_input\(/);
  });

  it('_resolve declares a return type so `var node := _resolve(...)` infers', () => {
    const src = code(RUNTIME);
    expect(src).toMatch(/func\s+_resolve\s*\([^)]*\)\s*->\s*Node:/);
  });
});

describe('TCP peer state is polled before it is trusted', () => {
  // StreamPeerTCP.get_status() only updates on poll(). Reading it without
  // polling means a disconnected client is never detected.
  for (const [label, path] of [
    ['editor bridge', PLUGIN],
    ['runtime bridge', RUNTIME],
  ] as const) {
    it(`${label} calls poll() before checking peer status`, () => {
      const src = code(path);
      expect(src, `${path} must poll the peer`).toMatch(/_peer\.poll\(\)/);

      // Every get_status() read must be preceded by a poll() somewhere above it.
      const firstPoll = src.indexOf('_peer.poll()');
      const firstStatus = src.indexOf('_peer.get_status()');
      expect(firstStatus, `${path} should read peer status`).toBeGreaterThan(-1);
      expect(
        firstPoll,
        `${path}: poll() must appear before the first get_status() read`
      ).toBeLessThan(firstStatus);
    });

    it(`${label} clears the peer when it is no longer connected`, () => {
      const src = code(path);
      expect(src).toMatch(/_peer\s*=\s*null/);
      expect(src).toMatch(/STATUS_CONNECTED/);
    });
  }
});

describe('runtime bridge refuses to run in a shipped game', () => {
  // The bridge grants full remote control of the process. If a developer
  // forgets to strip the autoload before exporting, it must stay dormant
  // instead of opening a control port in the released game.
  it('guards listen() behind an editor-only check', () => {
    const src = code(RUNTIME);
    expect(src).toContain('OS.has_feature("editor")');

    const ready = src.slice(src.indexOf('func _ready()'), src.indexOf('func _process('));
    expect(ready, '_ready must bail out before listening').toMatch(
      /if not OS\.has_feature\("editor"\)[\s\S]*?return/
    );
    // The bail-out has to happen before the socket is opened.
    expect(ready.indexOf('return')).toBeLessThan(ready.indexOf('_server.listen('));
  });

  it('offers a documented escape hatch for automated playtests', () => {
    const src = code(RUNTIME);
    expect(src).toContain('GODOT_MCP_RUNTIME');
  });
});

describe('bridge scripts stay syntactically plausible', () => {
  it('runtime_bridge.gd extends Node and self-registers a listener', () => {
    const src = code(RUNTIME);
    expect(src).toMatch(/^extends\s+Node/m);
    expect(src).toContain('9877');
  });

  it('plugin.gd advertises undo support in health_check', () => {
    const src = code(PLUGIN);
    expect(src).toContain('"undo_support": true');
  });
});
