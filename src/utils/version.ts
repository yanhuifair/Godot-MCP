// Copyright (c) 2026 FairYan
// SPDX-License-Identifier: AGPL-3.0-or-later
// ============================================================
// Godot MCP Server — 版本号单一真源
// ============================================================
// 以前版本号在 package.json、src/index.ts（--version）、src/server.ts（Server
// info）、src/transports/http-server.ts（/health）各存一份，发版要同步四处，
// 漏一处就是「--version 说 1.12.11 但 /health 说 1.12.9」这种谎言。现在统一
// 从 package.json 读，发版只需改 package.json（+ CHANGELOG/README）。

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/**
 * 运行时读 package.json，不硬编码第二份。
 * 读不到时退回 '0.0.0'（比如被单独拷出来跑），不至于让整个进程起不来。
 */
export const VERSION: string = (() => {
  try {
    const pkgPath = path.join(__dirname, '..', '..', 'package.json');
    const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8'));
    return typeof pkg.version === 'string' ? pkg.version : '0.0.0';
  } catch {
    return '0.0.0';
  }
})();
