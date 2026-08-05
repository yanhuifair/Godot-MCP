#!/usr/bin/env node
// Copyright (c) 2026 FairYan
// SPDX-License-Identifier: AGPL-3.0-or-later
// ============================================================
// sync-addons.js — 构建后将 addons 复制到目标 Godot 工程
// ============================================================
// 用法: node scripts/sync-addons.js <目标工程路径>
// 或作为 npm run build 的 postbuild 钩子
// 仅在源与目标内容不一致时才执行复制，避免不必要的写入。
//
// 注意：这里必须按“内容”而不是按“版本号”判断。早期版本只比较 plugin.cfg
// 的 version 字段，导致同一版本号内的插件修改永远不会同步到目标工程——
// 你修好了一个 plugin.gd 的 bug、重新构建，测试工程里跑的还是旧代码。

import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const sourceAddons = path.resolve(__dirname, "..", "addons", "godot-mcp");

// --- 辅助：从 plugin.cfg 中提取版本号 ---
function readPluginVersion(pluginCfgPath) {
  if (!fs.existsSync(pluginCfgPath)) return null;
  const content = fs.readFileSync(pluginCfgPath, "utf-8");
  const match = content.match(/^version\s*=\s*"(.+?)"/m);
  return match ? match[1] : null;
}

// --- 辅助：递归列出目录下所有文件的相对路径 ---
function listFiles(dir, base = dir) {
  if (!fs.existsSync(dir)) return [];
  const out = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...listFiles(full, base));
    else out.push(path.relative(base, full));
  }
  return out.sort();
}

function hashFile(p) {
  return crypto.createHash("sha1").update(fs.readFileSync(p)).digest("hex");
}

// --- 辅助：按内容比较源与目标，返回第一处差异的说明（相同则返回 null）---
function diffReason(srcDir, dstDir) {
  if (!fs.existsSync(dstDir)) return "target does not exist";

  const srcFiles = listFiles(srcDir);
  const dstFiles = listFiles(dstDir);

  const missing = srcFiles.filter((f) => !dstFiles.includes(f));
  if (missing.length) return `target is missing ${missing.length} file(s): ${missing.slice(0, 3).join(", ")}`;

  // Godot 会在目标工程里自己生成 .uid / .import 等元文件，它们本来就不该
  // 存在于源目录，不能当成“过期文件”，否则每次构建都会误判为需要同步。
  const isEngineArtifact = (f) => /\.(uid|import)$/.test(f);
  const extra = dstFiles.filter((f) => !srcFiles.includes(f) && !isEngineArtifact(f));
  if (extra.length) return `target has ${extra.length} stale file(s): ${extra.slice(0, 3).join(", ")}`;

  const changed = srcFiles.filter(
    (f) => hashFile(path.join(srcDir, f)) !== hashFile(path.join(dstDir, f))
  );
  if (changed.length) return `${changed.length} file(s) changed: ${changed.slice(0, 3).join(", ")}`;

  return null;
}

// 目标路径：命令行参数 > 环境变量 GODOT_PROJECT > 自动检测
let target = process.argv[2] || process.env.GODOT_PROJECT || "";

// 自动检测：搜索常见位置
if (!target) {
  const rootDir = path.resolve(__dirname, ".."); // 项目根目录
  const candidates = [
    path.join(rootDir, "test"), // <root>/test
    path.join(rootDir, "test", "test-project"), // <root>/test/test-project
  ];
  for (const c of candidates) {
    if (fs.existsSync(path.join(c, "project.godot"))) {
      target = c;
      break;
    }
  }
}

if (!target) {
  console.log("[sync-addons] No target found (set GODOT_PROJECT env var or pass CLI arg) — skipping");
  process.exit(0);
}

if (!fs.existsSync(target)) {
  console.error(`[sync-addons] Target "${target}" does not exist — skipping`);
  process.exit(0);
}

const targetAddons = path.join(target, "addons", "godot-mcp");
const srcPluginCfg = path.join(sourceAddons, "plugin.cfg");
const dstPluginCfg = path.join(targetAddons, "plugin.cfg");

// 内容完全一致则跳过复制
const reason = diffReason(sourceAddons, targetAddons);
if (!reason) {
  console.log(`[sync-addons] Already up to date (v${readPluginVersion(srcPluginCfg)}) — skipping sync`);
  process.exit(0);
}
console.log(`[sync-addons] Out of date — ${reason}`);

// 复制目录
fs.cpSync(sourceAddons, targetAddons, { recursive: true, force: true });

// 确保 plugin.cfg 已复制（cpSync 已处理，此处保留为显式保障）
if (fs.existsSync(srcPluginCfg)) {
  fs.copyFileSync(srcPluginCfg, dstPluginCfg);
}

const srcVer = readPluginVersion(srcPluginCfg);
console.log(`[sync-addons] ✅ addons/godot-mcp → ${targetAddons} (v${srcVer})`);
