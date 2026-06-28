#!/usr/bin/env node
// ============================================================
// sync-addons.js — 构建后将 addons 复制到目标 Godot 工程
// ============================================================
// 用法: node scripts/sync-addons.js <目标工程路径>
// 或作为 npm run build 的 postbuild 钩子

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const sourceAddons = path.resolve(__dirname, "..", "addons", "godot_mcp");

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

const targetAddons = path.join(target, "addons", "godot_mcp");

// 复制目录
fs.cpSync(sourceAddons, targetAddons, { recursive: true, force: true });

// 复制 plugin.cfg（保持 Godot 能识别为同一插件）
const srcPluginCfg = path.join(sourceAddons, "plugin.cfg");
const dstPluginCfg = path.join(targetAddons, "plugin.cfg");
if (fs.existsSync(srcPluginCfg)) {
  fs.copyFileSync(srcPluginCfg, dstPluginCfg);
}

console.log(`[sync-addons] ✅ addons/godot_mcp → ${targetAddons}`);
