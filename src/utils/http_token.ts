// Copyright (c) 2026 FairYan
// SPDX-License-Identifier: AGPL-3.0-or-later
// ============================================================
// Godot MCP Server — HTTP auth token resolution
// ============================================================
// v1.12.10 起 /mcp 与 /sse 永远要求 Bearer 令牌；GODOT_MCP_TOKEN 未设置时
// 每次启动 `randomUUID()` 生成一个一次性令牌。问题是：令牌每次启动都变，
// 已经配好的本地 HTTP 客户端（VS Code / Cursor 的 url 配置）下次启动直接
// 401，而且没法"配一次就完事"。
//
// 所以改成持久化并复用：
//   环境变量 GODOT_MCP_TOKEN  >  工程 .godot/mcp_http_token  >
//   用户级 ~/.godot-mcp/http_token  >  新生成并落盘
//
// `.godot/` 是 Godot 自己生成的缓存目录，默认就在 .gitignore 里，把令牌放
// 这里既跟随工程、又不会被提交。工程内路径一律走 resolveProjectPath 沙箱，
// 防止 `.godot` 被换成指向工程外的符号链接后把令牌写到别处。

import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { randomBytes } from 'node:crypto';
import { resolveProjectPath } from './file_utils.js';

/** 令牌文件名 / 长度：24 字节 = 48 位小写十六进制，够熵且便于粘贴。 */
export const TOKEN_FILE_NAME = 'mcp_http_token';
export const TOKEN_HEX_LENGTH = 48;

const TOKEN_PATTERN = new RegExp(`^[0-9a-f]{${TOKEN_HEX_LENGTH}}$`);

export type HttpTokenSource = 'env' | 'project-file' | 'user-file' | 'memory';

export interface ResolvedHttpToken {
  token: string;
  /** 令牌的来源位置，决定日志怎么打。`memory` 表示落盘失败、只在本进程内有效。 */
  source: HttpTokenSource;
  /** true 表示本次启动新建了令牌文件（首次启动 / 文件被改坏后重建）。 */
  created?: boolean;
  /** 持久化文件路径；`env` 与 `memory` 来源时为空。 */
  path?: string;
  /** 落盘失败等非致命问题的说明（此时退回内存令牌）。 */
  warning?: string;
}

export interface ResolveHttpTokenOptions {
  /** 无 projectRoot 时的持久化目录（测试可覆盖，默认 ~/.godot-mcp）。 */
  userDir?: string;
  /** 环境变量来源（测试可注入，默认 process.env）。 */
  env?: NodeJS.ProcessEnv;
}

function generateToken(): string {
  return randomBytes(TOKEN_HEX_LENGTH / 2).toString('hex');
}

function isWellFormedToken(value: string): boolean {
  return TOKEN_PATTERN.test(value);
}

/**
 * 读取令牌文件。内容不合规（被改过、被截断、被人写成别的东西）就当作没有，
 * 由调用方重新生成——绝不把任意文件内容当令牌用。
 */
function readTokenFile(file: string): string | null {
  try {
    const raw = fs.readFileSync(file, 'utf8').trim();
    if (!isWellFormedToken(raw)) return null;
    // 历史上可能是 0644（手工创建/旧版本写入）：收紧权限，失败也无所谓。
    try { fs.chmodSync(file, 0o600); } catch { /* Windows 上没有意义 */ }
    return raw;
  } catch {
    return null;
  }
}

/**
 * 取用令牌文件：能读到合规令牌就复用，否则（不存在 / 内容被改坏）写入新的。
 *
 * `wx` 保证并发启动时不会互相覆盖：两个 server 同时起，先到先得，后到的读回
 * 先到的那个，两边用同一个令牌。文件存在但内容不合规（被人改过、截断）时
 * 需要**覆盖**而不是放弃——不然后面每次启动都读到同一堆垃圾。
 */
function writeOrAdoptToken(file: string): { token: string; created: boolean } {
  const token = generateToken();
  fs.mkdirSync(path.dirname(file), { recursive: true, mode: 0o700 });

  const create = (flag: 'wx' | 'w'): void => {
    fs.writeFileSync(file, token + '\n', { mode: 0o600, flag });
    try { fs.chmodSync(file, 0o600); } catch { /* Windows 上没有意义 */ }
  };

  try {
    create('wx');
    return { token, created: true };
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== 'EEXIST') throw err;
    const raced = readTokenFile(file);
    if (raced) return { token: raced, created: false };
    // 文件在，但内容不可用 ⇒ 覆盖它（这就是唯一一次"写别人文件"的情形，
    // 且路径已经过沙箱校验）。
    create('w');
    return { token, created: true };
  }
}

/** 在指定文件上解析 / 创建令牌。 */
function resolveAt(file: string, source: Exclude<HttpTokenSource, 'env' | 'memory'>): ResolvedHttpToken {
  const written = writeOrAdoptToken(file);
  return { token: written.token, source, path: file, created: written.created };
}

/**
 * 解析本次进程使用的 HTTP 令牌。
 *
 * 永不抛异常：落盘失败（只读文件系统、权限不足、路径异常）只是降级成内存
 * 令牌并带上 warning —— 鉴权不能因此变成"不鉴权"，也不该让服务器起不来。
 */
export function resolveHttpToken(
  projectRoot: string | null,
  options: ResolveHttpTokenOptions = {}
): ResolvedHttpToken {
  const env = options.env ?? process.env;
  const fromEnv = env.GODOT_MCP_TOKEN?.trim();
  if (fromEnv) return { token: fromEnv, source: 'env' };

  const attempts: Array<() => ResolvedHttpToken> = [];

  if (projectRoot) {
    attempts.push(() => {
      // 走沙箱：拒绝逃出工程根（.godot 被换成符号链接时会在这里抛错）
      const file = resolveProjectPath(projectRoot, path.join('.godot', TOKEN_FILE_NAME));
      return resolveAt(file, 'project-file');
    });
  }

  const userDir = options.userDir ?? path.join(os.homedir(), '.godot-mcp');
  attempts.push(() => resolveAt(path.join(userDir, TOKEN_FILE_NAME), 'user-file'));

  let warning: string | undefined;
  for (const attempt of attempts) {
    try {
      return { ...attempt(), ...(warning ? { warning } : {}) };
    } catch (err) {
      warning = `could not persist HTTP token: ${(err as Error).message}`;
    }
  }

  // 全部失败：内存令牌，本次进程内有效（stderr 会打印出来供客户端使用）。
  return { token: generateToken(), source: 'memory', warning };
}
