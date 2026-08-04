// Copyright (c) 2026 FairYan
// SPDX-License-Identifier: AGPL-3.0-or-later
// ============================================================
// Godot MCP Server — Meta / Discovery / Diagnostics
// ============================================================
// Helps the AI client navigate the (large) tool catalog and diagnose
// which subsystems are available — directly addressing the "345 tools
// won't fit a client tool budget" and "opaque failures" problems.

import { z } from 'zod';
import { ToolResult } from '../utils/types.js';
import { ErrorCode, wrapError, toolError } from '../utils/errors.js';
import { getActiveRegistry } from '../utils/registry.js';
import { sendEditorCommand } from './editor.js';
import { sendGameCommand, isGameReachable } from './runtime_bridge.js';

// ---- Schemas ----

export const searchToolsSchema = {
  keyword: z.string().describe('Keyword(s) to search tool names + descriptions. Space-separated words are AND-combined (e.g. "collision shape", "tilemap source").'),
  limit: z.number().int().optional().default(25).describe('Max results (default 25).'),
  write_only: z.boolean().optional().default(false).describe('If true, only return write/side-effect tools.'),
};

export const getStatusSchema = {
  probe_runtime: z.boolean().optional().default(true).describe('Also probe the live-game runtime bridge (port 9877).'),
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

  const scored: { name: string; description: string; score: number }[] = [];
  for (const t of all) {
    const hay = `${t.name} ${t.description}`.toLowerCase();
    // every word must appear somewhere (AND)
    if (!words.every((w) => hay.includes(w))) continue;
    // name match scores higher than description-only match
    let score = 0;
    if (words.every((w) => t.name.toLowerCase().includes(w))) score += 10;
    if (t.description.toLowerCase().includes(kw)) score += 3;
    score += Math.min(t.name.length, 20) * 0; // no-op, keeps sort stable-ish
    scored.push({ name: t.name, description: t.description, score });
  }

  scored.sort((a, b) => b.score - a.score || a.name.localeCompare(b.name));
  const top = scored.slice(0, args.limit ?? 25);

  if (top.length === 0) {
    return { content: [{ type: 'text', text: `No tools match "${args.keyword}". Try a broader keyword, or call get_status to see subsystem availability.` }] };
  }
  const lines = [`Found ${scored.length} tool(s) for "${args.keyword}" (showing ${top.length}):`, ''];
  for (const r of top) {
    lines.push(`• ${r.name} — ${r.description}`);
  }
  lines.push('', 'Tip: call the tool by its exact name (snake_case). Use get_status to verify the editor/runtime are connected.');
  return { content: [{ type: 'text', text: lines.join('\n') }] };
}

export async function handleGetStatus(args: { probe_runtime?: boolean }): Promise<ToolResult> {
  const registry = getActiveRegistry();
  const total = registry ? registry.list().length : 0;

  const out: string[] = ['Godot MCP — System Status', ''];

  // Editor bridge
  let editor = 'unreachable';
  let editorVersion = '';
  try {
    const v = await sendEditorCommand('get_editor_version');
    editor = 'connected';
    const ver = v?.version || {};
    editorVersion = `${ver.major ?? '?'}.${ver.minor ?? '?'}.${ver.patch ?? '?'}`;
  } catch {
    editor = 'not connected';
  }
  out.push(`Editor bridge : ${editor}${editorVersion ? ' (Godot ' + editorVersion + ')' : ''}`);
  out.push(`  → start the editor with the MCP plugin, or run the game from the editor to auto-connect on 127.0.0.1:9876`);

  // Runtime bridge (live game)
  let runtime = 'not running / not enabled';
  if (args.probe_runtime !== false) {
    if (isGameReachable()) {
      try {
        const r = await sendGameCommand('ping', {});
        runtime = r && r.ok ? 'connected (game running)' : 'reachable';
      } catch {
        runtime = 'not running / not enabled';
      }
    }
    out.push(`Runtime bridge: ${runtime}`);
    out.push(`  → add addons/godot-mcp/runtime_bridge.gd as an autoload (name godot_mcp_runtime) to control the running game`);
  }

  out.push(`Tools total   : ${total}`);
  out.push('', 'Subsystems available via this server:');
  out.push('  • 345+ file-path tools (edit .tscn/.tres/.gd/.import without the editor)');
  out.push('  • editor bridge (live scene/node/script/debugger control on :9876)');
  out.push('  • ClassDB introspection (editor_get_class_list / _method_list / _property_list / _signal_list)');
  out.push('  • live-game runtime bridge (runtime_* tools, requires autoload)');
  out.push('', 'Use search_tools "<keyword>" to find the right tool by name or description.');

  return { content: [{ type: 'text', text: out.join('\n') }] };
}
