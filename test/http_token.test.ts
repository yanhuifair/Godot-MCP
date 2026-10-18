// Copyright (c) 2026 FairYan
// SPDX-License-Identifier: AGPL-3.0-or-later
// ============================================================
// Regression tests for HTTP auth token persistence.
//
// v1.12.10 made /mcp and /sse always require a token, but generated a fresh
// `randomUUID()` on every start — so a configured local client got 401 after
// each restart. v1.12.11 persists the generated token (project
// `.godot/mcp_http_token`, else `~/.godot-mcp/http_token`) and reuses it.
//
// These tests pin: env precedence, create-then-reuse, corrupt-file recovery,
// the user-level fallback, and that a `.godot` symlinked outside the project
// cannot redirect the token write (the sandbox must reject it).
// ============================================================

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { resolveHttpToken, TOKEN_FILE_NAME, TOKEN_HEX_LENGTH } from '../src/utils/http_token.js';

const TOKEN_RE = new RegExp(`^[0-9a-f]{${TOKEN_HEX_LENGTH}}$`);
const ENV_TOKEN = 'a'.repeat(TOKEN_HEX_LENGTH);

let root = '';
let projectRoot = '';
let userDir = '';

function tokenFile(): string {
  return path.join(projectRoot, '.godot', TOKEN_FILE_NAME);
}

beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'godot-mcp-token-'));
  projectRoot = path.join(root, 'project');
  userDir = path.join(root, 'user');
  fs.mkdirSync(projectRoot, { recursive: true });
});

afterEach(() => {
  fs.rmSync(root, { recursive: true, force: true });
});

describe('resolveHttpToken', () => {
  it('prefers GODOT_MCP_TOKEN and writes nothing', () => {
    const r = resolveHttpToken(projectRoot, { env: { GODOT_MCP_TOKEN: ENV_TOKEN }, userDir });
    expect(r.source).toBe('env');
    expect(r.token).toBe(ENV_TOKEN);
    expect(fs.existsSync(tokenFile())).toBe(false);
    expect(fs.existsSync(userDir)).toBe(false);
  });

  it('creates <project>/.godot/mcp_http_token with 0600 and reuses it next start', () => {
    const first = resolveHttpToken(projectRoot, { env: {}, userDir });
    expect(first.source).toBe('project-file');
    expect(first.created).toBe(true);
    // resolveProjectPath 会归一到真实路径（macOS 的 /var -> /private/var）
    expect(first.path).toBe(path.join(fs.realpathSync(projectRoot), '.godot', TOKEN_FILE_NAME));
    expect(first.token).toMatch(TOKEN_RE);
    expect(fs.readFileSync(tokenFile(), 'utf8').trim()).toBe(first.token);
    if (process.platform !== 'win32') {
      expect(fs.statSync(tokenFile()).mode & 0o777).toBe(0o600);
    }

    // 下一次启动（新进程语义）必须拿到同一个令牌，否则客户端又会 401
    const second = resolveHttpToken(projectRoot, { env: {}, userDir });
    expect(second.source).toBe('project-file');
    expect(second.created).toBe(false);
    expect(second.token).toBe(first.token);
  });

  it('regenerates when the file content is not a valid token', () => {
    fs.mkdirSync(path.dirname(tokenFile()), { recursive: true });
    fs.writeFileSync(tokenFile(), 'not-a-token\n');
    const r = resolveHttpToken(projectRoot, { env: {}, userDir });
    expect(r.source).toBe('project-file');
    expect(r.created).toBe(true);
    expect(r.token).toMatch(TOKEN_RE);
    expect(r.token).not.toBe('not-a-token');
    expect(fs.readFileSync(tokenFile(), 'utf8').trim()).toBe(r.token);
  });

  it('falls back to the user-level file when no project root is known', () => {
    const r = resolveHttpToken(null, { env: {}, userDir });
    expect(r.source).toBe('user-file');
    expect(r.created).toBe(true);
    expect(r.path).toBe(path.join(userDir, TOKEN_FILE_NAME));
    expect(resolveHttpToken(null, { env: {}, userDir }).token).toBe(r.token);
  });

  it('refuses to follow a .godot symlink that escapes the project', () => {
    const outside = path.join(root, 'outside');
    fs.mkdirSync(outside, { recursive: true });
    fs.symlinkSync(outside, path.join(projectRoot, '.godot'), 'dir');

    const r = resolveHttpToken(projectRoot, { env: {}, userDir });
    // 沙箱拒绝 ⇒ 退回用户级文件，并留下 warning，但令牌依然有效
    expect(r.source).toBe('user-file');
    expect(r.warning).toContain('could not persist');
    expect(r.token).toMatch(TOKEN_RE);
    expect(fs.existsSync(path.join(outside, TOKEN_FILE_NAME))).toBe(false);
  });

  it('never throws — an unwritable location degrades to an in-memory token', () => {
    const blocked = path.join(root, 'blocked');
    fs.mkdirSync(blocked, { recursive: true });
    if (process.platform !== 'win32') fs.chmodSync(blocked, 0o500); // r-x, no write

    try {
      // projectRoot 不存在 ⇒ resolveProjectPath 抛错；userDir 不可写 ⇒ 写失败
      const r = resolveHttpToken(path.join(root, 'missing-project'), { env: {}, userDir: path.join(blocked, 'sub') });
      expect(r.token).toMatch(TOKEN_RE);
      expect(r.source).toBe('memory');
      expect(r.path).toBeUndefined();
      expect(r.warning).toBeTruthy();
    } finally {
      if (process.platform !== 'win32') fs.chmodSync(blocked, 0o700);
    }
  });
});
