#!/usr/bin/env node
// Copyright (c) 2026 FairYan
// SPDX-License-Identifier: MIT
// ============================================================
// sync-addons.js — 构建后将 addons 复制到目标 Godot 工程
// ============================================================
// 用法: node scripts/sync-addons.js <目标工程路径>
// 或作为 npm run build 的 postbuild 钩子
// 仅在源版本与目标版本不匹配时才执行复制，避免不必要的写入

import fs from "node:fs";
import path from "node:path";
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

// --- 辅助：比较源与目标的 plugin.cfg 版本 ---
function needsSync(srcCfgPath, dstCfgPath) {
  const srcVersion = readPluginVersion(srcCfgPath);
  const dstVersion = readPluginVersion(dstCfgPath);
  if (!srcVersion) {
    console.warn("[sync-addons] ⚠️  Source plugin.cfg has no version — will sync anyway");
    return true;
  }
  if (!dstVersion) {
    console.log(`[sync-addons] Target has no plugin.cfg or no version — will sync (source: ${srcVersion})`);
    return true;
  }
  if (srcVersion !== dstVersion) {
    console.log(`[sync-addons] Version mismatch: source=${srcVersion} vs target=${dstVersion} — will sync`);
    return true;
  }
  console.log(`[sync-addons] Versions match (${srcVersion}) — skipping sync`);
  return false;
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

// 版本匹配则跳过复制
if (!needsSync(srcPluginCfg, dstPluginCfg)) {
  process.exit(0);
}

// 复制目录
fs.cpSync(sourceAddons, targetAddons, { recursive: true, force: true });

// 确保 plugin.cfg 已复制（cpSync 已处理，此处保留为显式保障）
if (fs.existsSync(srcPluginCfg)) {
  fs.copyFileSync(srcPluginCfg, dstPluginCfg);
}

const srcVer = readPluginVersion(srcPluginCfg);
console.log(`[sync-addons] ✅ addons/godot-mcp → ${targetAddons} (v${srcVer})`);
