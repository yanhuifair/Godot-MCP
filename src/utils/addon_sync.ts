// Copyright (c) 2026 FairYan
// SPDX-License-Identifier: AGPL-3.0-or-later
// ============================================================
// addon_sync.ts — 运行时把 bundled addon 同步到用户 Godot 工程
// ============================================================
// 与 scripts/sync-addons.js 逻辑相同（按内容 SHA-1 比对，而非版本号），
// 但作为可复用的 TS 函数供 server 在启动时 / 插件上报版本时调用。
//
// 这是「打开 Godot 工程时插件自动检测并 self-update」的核心：server 始终是
// addon 的权威源，只要它连着工程，工程里的 addon 就应与 server 自带版本一致。
//
// 注意：scripts/sync-addons.js 是 postbuild 用的 CLI 孪生实现，逻辑相同但独立
// 维护（sync-addons.js 由 node 直接执行、无法 import .ts）。修改比对逻辑时两处都要改。

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { resolveProjectPath } from './file_utils.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
// src/utils => ../../addons/godot-mcp ; dist/utils => ../../addons/godot-mcp
const SOURCE_ADDONS = path.resolve(__dirname, '..', '..', 'addons', 'godot-mcp');

export interface AddonSyncResult {
  /** 是否发生了文件写入（内容有差异） */
  updated: boolean;
  /** 差异原因（updated=false 时为 null） */
  reason: string | null;
  /** server 自带 addon 的版本号（来自 plugin.cfg） */
  version: string;
  /** 被跳过的原因（只读模式下不会写工程） */
  skipped?: string;
  /** 被删除的过期文件（相对路径） */
  removed?: string[];
}

function readPluginVersion(pluginCfgPath: string): string {
  if (!fs.existsSync(pluginCfgPath)) return '?';
  const content = fs.readFileSync(pluginCfgPath, 'utf-8');
  const m = content.match(/^version\s*=\s*"(.+?)"/m);
  return m ? m[1] : '?';
}

function listFiles(dir: string, base = dir): string[] {
  if (!fs.existsSync(dir)) return [];
  const out: string[] = [];
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) out.push(...listFiles(full, base));
    else out.push(path.relative(base, full));
  }
  return out.sort();
}

function hashFile(p: string): string {
  return crypto.createHash('sha1').update(fs.readFileSync(p)).digest('hex');
}

interface Diff {
  /** 差异说明（无差异时为 null） */
  reason: string | null;
  /** 目标目录里源目录已经没有的过期文件（Godot 生成的 .uid/.import 不算） */
  stale: string[];
}

function diffReason(srcDir: string, dstDir: string): Diff {
  if (!fs.existsSync(dstDir)) {
    return { reason: 'target does not exist', stale: [] };
  }

  const srcFiles = listFiles(srcDir);
  const dstFiles = listFiles(dstDir);

  const missing = srcFiles.filter((f) => !dstFiles.includes(f));
  if (missing.length) {
    return {
      reason: `target is missing ${missing.length} file(s): ${missing.slice(0, 3).join(', ')}`,
      stale: [],
    };
  }

  // Godot 会在目标工程里自己生成 .uid / .import 等元文件，它们本来就不该
  // 存在于源目录，不能当成“过期文件”，否则每次都误判为需要同步。
  const isEngineArtifact = (f: string) => /\.(uid|import)$/.test(f);
  const extra = dstFiles.filter((f) => !srcFiles.includes(f) && !isEngineArtifact(f));
  if (extra.length) {
    return {
      reason: `target has ${extra.length} stale file(s): ${extra.slice(0, 3).join(', ')}`,
      stale: extra,
    };
  }

  const changed = srcFiles.filter(
    (f) => hashFile(path.join(srcDir, f)) !== hashFile(path.join(dstDir, f)),
  );
  if (changed.length) {
    return {
      reason: `${changed.length} file(s) changed: ${changed.slice(0, 3).join(', ')}`,
      stale: [],
    };
  }

  return { reason: null, stale: [] };
}

/**
 * 把 server 自带的 addon 同步到用户的 Godot 工程。
 * 仅在内容有差异时才写文件（避免无意义的写入），返回是否发生了更新。
 */
export function syncAddonToProject(projectRoot: string): AddonSyncResult {
  const srcVer = readPluginVersion(path.join(SOURCE_ADDONS, 'plugin.cfg'));

  // 只读模式是"绝不改工程文件"的硬承诺，addon 同步属于写操作 —— 它甚至连
  // --read-only 都不该绕过：用户在只读模式下跑 server 就是为了只读。
  if (process.env.GODOT_MCP_READ_ONLY === 'true') {
    return { updated: false, reason: null, version: srcVer, skipped: 'read-only mode' };
  }

  // 目标路径也过一遍工程沙箱：projectRoot 可能来自配置/命令行，若它是个指向
  // 别处的符号链接子树，裸 path.join 会把 addon 写到工程外去。
  let targetAddons: string;
  try {
    targetAddons = resolveProjectPath(projectRoot, path.join('addons', 'godot-mcp'));
  } catch (err) {
    return {
      updated: false,
      reason: null,
      version: srcVer,
      skipped: `target path rejected by sandbox: ${(err as Error).message}`,
    };
  }

  const { reason, stale } = diffReason(SOURCE_ADDONS, targetAddons);
  if (!reason) {
    return { updated: false, reason: null, version: srcVer };
  }

  fs.cpSync(SOURCE_ADDONS, targetAddons, { recursive: true, force: true });

  // 过期文件必须删掉，否则"有差异"这个结论永远成立：每次打开工程都会再复制
  // 一遍并触发一次 reload_addon —— 用户看到的是插件每次启动都重载一次。
  // addons/godot-mcp 整个目录归本包所有（同步本身就带 force 覆盖），删掉新版
  // 里已经不存在的文件是合理的；Godot 生成的 .uid/.import 已经在上面排除。
  const removed: string[] = [];
  for (const f of stale) {
    const abs = path.join(targetAddons, f);
    try {
      fs.rmSync(abs, { force: true });
      removed.push(f);
    } catch {
      // 删不掉（占用/权限）就算了，下次启动会再试
    }
  }

  return { updated: true, reason, version: srcVer, ...(removed.length ? { removed } : {}) };
}
