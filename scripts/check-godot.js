#!/usr/bin/env node
// Copyright (c) 2026 FairYan
// SPDX-License-Identifier: AGPL-3.0-or-later
//
// Runs the headless end-to-end gate (test/test-project/load_check.gd) against a
// real Godot build. Reuses the server's own binary discovery so the script works
// on macOS (where Godot lives inside an .app bundle and is rarely on PATH) as
// well as Linux/Windows.
//
// Usage:  npm run check:godot
//         GODOT_BIN=/path/to/godot npm run check:godot

import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const projectPath = resolve(root, 'test/test-project');

async function locateGodot() {
  if (process.env.GODOT_BIN) return process.env.GODOT_BIN;
  try {
    const { findGodotBinary } = await import(resolve(root, 'dist/utils/godot_cli.js'));
    const found = findGodotBinary();
    if (found) return found;
  } catch {
    // dist/ not built yet — fall through to the static candidates below.
  }
  const candidates = [
    '/Applications/Godot.app/Contents/MacOS/Godot',
    '/usr/local/bin/godot',
    '/usr/bin/godot',
  ];
  return candidates.find(existsSync) || 'godot';
}

const godot = await locateGodot();
if (!existsSync(godot) && godot !== 'godot') {
  console.error(`Godot binary not found at "${godot}". Set GODOT_BIN to override.`);
  process.exit(1);
}

console.log(`Using Godot: ${godot}`);
const r = spawnSync(godot, ['--headless', '--path', projectPath, '--script', 'load_check.gd'], {
  stdio: 'inherit',
});

if (r.error) {
  console.error(`Failed to run Godot: ${r.error.message}\nSet GODOT_BIN to the Godot executable.`);
  process.exit(1);
}
process.exit(r.status ?? 1);
