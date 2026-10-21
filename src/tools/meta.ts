// Copyright (c) 2026 FairYan
// SPDX-License-Identifier: AGPL-3.0-or-later
// ============================================================
// Godot MCP Server — Meta / Discovery / Diagnostics
// ============================================================
// Helps the AI client navigate the (large) tool catalog and diagnose
// which subsystems are available — directly addressing the "386 tools
// won't fit a client tool budget" and "opaque failures" problems.

import { z } from 'zod';
import { ToolResult } from '../utils/types.js';
import { ErrorCode, toolError } from '../utils/errors.js';
import { getActiveRegistry, getActiveProjectRoot } from '../utils/registry.js';
import { probeEditor } from './editor_bridge.js';
import { probeGameRuntime } from './runtime_bridge.js';

// ---- Schemas ----

export const searchToolsSchema = {
  keyword: z.string().describe('Keyword(s) to search tool names + descriptions. Space-separated words are AND-combined (e.g. "collision shape", "tilemap source").'),
  limit: z.number().int().optional().default(25).describe('Max results (default 25).'),
  write_only: z.boolean().optional().default(false).describe('If true, only return write/side-effect tools.'),
};

export const getStatusSchema = {
  probe_runtime: z.boolean().optional().default(true).describe('Also perform a real ping against the live-game runtime bridge on 127.0.0.1:9877 (never a cached flag). Set false to skip the probe entirely.'),
};

// ---- Handlers ----

export function handleSearchTools(args: { keyword: string; limit?: number; write_only?: boolean }): ToolResult {
  const registry = getActiveRegistry();
  if (!registry) {
    return toolError(ErrorCode.INTERNAL_ERROR, 'Tool registry not initialized yet. Try again after server startup.');
  }
  const kw = (args.keyword || '').toLowerCase().trim();
  if (!kw) {
    return toolError(ErrorCode.INVALID_ARGUMENT, 'Provide a keyword to search for.');
  }
  const words = kw.split(/\s+/).filter(Boolean);
  const all = registry.list(); // already filters write tools in read-only mode

  const scored: { name: string; description: string; score: number; category: string; schema: Record<string, any> }[] = [];
  for (const t of all) {
    const hay = `${t.name} ${t.description}`.toLowerCase();
    // every word must appear somewhere (AND)
    if (!words.every((w) => hay.includes(w))) continue;
    // name match scores higher than description-only match
    let score = 0;
    if (words.every((w) => t.name.toLowerCase().includes(w))) score += 10;
    if (t.description.toLowerCase().includes(kw)) score += 3;
    scored.push({ name: t.name, description: t.description, score, category: t.category ?? 'Uncategorized', schema: t.schema ?? {} });
  }

  scored.sort((a, b) => b.score - a.score || a.name.localeCompare(b.name));
  const top = scored.slice(0, args.limit ?? 25);

  if (top.length === 0) {
    return { content: [{ type: 'text', text: `No tools match "${args.keyword}". Try a broader keyword, or call get_status to see subsystem availability.` }] };
  }
  const lines = [`Found ${scored.length} tool(s) for "${args.keyword}" (showing ${top.length}):`, ''];
  for (const r of top) {
    // 带出签名：只给名字 + 一句话，模型还得再猜参数名（`path` 还是
    // `scene_path`？），猜错就是一次 VALIDATION_ERROR 往返。直接给必填参数，
    // 第一次调用就能对。
    const required = Object.entries(r.schema)
      .filter(([, s]) => typeof (s as any).isOptional === 'function' && !(s as any).isOptional())
      .map(([k]) => k);
    const optionalCount = Object.keys(r.schema).length - required.length;
    const sig = required.length === 0
      ? '(no required args)'
      : `(${required.join(', ')}${optionalCount > 0 ? ', …' : ''})`;
    lines.push(`• ${r.name}${sig} — ${r.description}  [${r.category}]`);
  }
  lines.push('');
  lines.push('Tip: parameters are snake_case; required ones are shown in parentheses.');
  lines.push('Use get_status to verify the editor/runtime are connected before calling editor_*/runtime_* tools.');
  return { content: [{ type: 'text', text: lines.join('\n') }] };
}

export async function handleGetStatus(args: { probe_runtime?: boolean }): Promise<ToolResult> {
  const registry = getActiveRegistry();
  const total = registry ? registry.list().length : 0;

  const out: string[] = ['Godot MCP — System Status', ''];

  // Editor bridge — probe only: never spawns an editor, gives up after ~1.5s.
  // (get_status is what users call *when things are broken*; it must never hang
  //  for 30s on TCP_RESPONSE_TIMEOUT, and must never launch a Godot instance.)
  let editor = 'not connected';
  let editorVersion = '';
  const v = await probeEditor();
  if (v) {
    editor = 'connected';
    const ver = v?.version || {};
    editorVersion = `${ver.major ?? '?'}.${ver.minor ?? '?'}.${ver.patch ?? '?'}`;
  }
  out.push(`Editor bridge : ${editor}${editorVersion ? ' (Godot ' + editorVersion + ')' : ''}`);
  out.push(`  → start the editor with the MCP plugin, or run the game from the editor to auto-connect on 127.0.0.1:9876`);

  // Runtime bridge (live game) — 实测，不读缓存。
  // 这里以前先问 isGameReachable()（一个只在连接成功时刷新、5 秒过期的标志），
  // 结果 5 秒内没发过 runtime_* 命令就把真实 ping 挡在门外，游戏明明在跑也报
  // "not running / not enabled"。健康检查必须每次真连真 ping。
  if (args.probe_runtime !== false) {
    const probe = await probeGameRuntime();
    let runtime: string;
    let runtimeHealthy = false;
    if (!probe.reachable) {
      runtime = 'not running / not enabled';
    } else if (probe.responding) {
      runtime = probe.info && probe.info.ok === false
        ? `reachable (ping replied ${JSON.stringify(probe.info)})`
        : 'connected (game running)';
      runtimeHealthy = true;
    } else {
      // 端口开着却没有 ping 回应：既可能是 autoload 卡死，也可能是 9877 被
      // 别的程序占着。如实分开报，别一口断定"游戏没跑"。
      runtime = `reachable (127.0.0.1:9877 accepts connections but ping failed: ${probe.error})`;
    }
    out.push(`Runtime bridge: ${runtime}`);
    if (!runtimeHealthy) {
      out.push(`  → add addons/godot-mcp/runtime_bridge.gd as an autoload (name godot_mcp_runtime) to control the running game`);
    }
  }

  // 工程根目录 / 只读模式：这两条是排错时最先要知道的事实。
  // 以前 get_status 根本不打印 projectRoot，而 INTERNAL_ERROR 的修复建议里
  // 却写着"get_status 会告诉你解析到的工程根目录" —— 建议本身就是空话。
  const root = getActiveProjectRoot();
  out.push(`Project root  : ${root ?? '(not detected — pass -p <path> or run from a Godot project)'}`);
  if (registry?.isReadOnly === true) {
    out.push('Mode          : READ-ONLY (write/side-effect tools are hidden from tools/list and blocked with READ_ONLY)');
  }

  out.push(`Tools total   : ${total}${registry ? ` in ${registry.categories().length} categories` : ''}`);
  out.push('', 'Subsystems available via this server:');
  // 别硬编码工具数：以前这里写死 235，加一个工具就变谎话。直接从注册表算——
  // "file-path tools" = 不需要编辑器桥/运行时桥的那些（即非 editor_/runtime_）。
  const bridgeTools = registry ? registry.list().filter((t) => /^(editor_|runtime_)/.test(t.name)).length : 0;
  out.push(`  • ${total - bridgeTools} file-path tools (edit .tscn/.tres/.gd/.import without the editor)`);
  out.push('  • editor bridge (live scene/node/script/debugger control on :9876)');
  out.push('  • ClassDB introspection (editor_get_class_list / _method_list / _property_list / _signal_list)');
  out.push('  • live-game runtime bridge (runtime_* tools, requires autoload)');
  out.push('', 'Use search_tools "<keyword>" to find the right tool by name or description.');

  return { content: [{ type: 'text', text: out.join('\n') }] };
}
