// Copyright (c) 2026 FairYan
// SPDX-License-Identifier: AGPL-3.0-or-later
// ============================================================
// Godot MCP Server — Live Game Runtime Tools
// ============================================================
// Control the RUNNING game (not the editor). Requires the
// `godot_mcp_runtime` autoload (addons/godot-mcp/runtime_bridge.gd) to be
// enabled in the project and the game to be played from the editor.
// Commands are sent over TCP to 127.0.0.1:9877 (see runtime_bridge.ts).

import { z } from 'zod';
import { ToolResult } from '../utils/types.js';
import { ErrorCode, wrapError } from '../utils/errors.js';
import { sendGameCommand } from './runtime_bridge.js';

// ---- Schemas ----

export const runtimePingSchema = {};
export const runtimeGetTreeSchema = {};
export const runtimeGetNodeSchema = { path: z.string().describe('Node path inside the running scene (e.g. "Player" or "World/Enemies/Enemy1"). Use "" / "." for the current scene root.') };
export const runtimeSetNodeSchema = {
  path: z.string().describe('Node path inside the running scene.'),
  properties: z.record(z.string()).describe('Property values to set, as strings (e.g. {"position":"Vector2(10,20)", "visible":"false"}).'),
};
export const runtimeCallMethodSchema = {
  path: z.string().describe('Node path inside the running scene.'),
  method: z.string().describe('Method name to call on the node.'),
  args: z.array(z.any()).optional().describe('Positional arguments.'),
};
export const runtimeEmitSignalSchema = {
  path: z.string().describe('Node path inside the running scene.'),
  signal: z.string().describe('Signal name to emit.'),
  args: z.array(z.any()).optional().describe('Signal arguments.'),
};
export const runtimeInputSchema = {
  keycode: z.number().int().describe('Godot keycode (e.g. KEY_W=87, KEY_SPACE=32). See https://docs.godotengine.org/en/stable/classes/class_@globals.html#enum-keymodifierkeycode'),
  action: z.string().optional().default('press').describe('"press" or "release".'),
};
export const runtimeFreezeSchema = {};
export const runtimeResumeSchema = {};
export const runtimeStepSchema = { frames: z.number().int().optional().default(1).describe('Number of frames to advance while paused (deterministic stepping).') };
export const runtimeScreenshotSchema = { path: z.string().optional().describe('Output path (default user://runtime_screenshot.png).') };

// ---- Handlers ----

export async function handleRuntimePing(): Promise<ToolResult> {
  try {
    const r = await sendGameCommand('ping', {});
    return { content: [{ type: 'text', text: `Runtime bridge reachable: ${JSON.stringify(r)}` }] };
  } catch (err: any) { return wrapError(ErrorCode.RUNTIME_NOT_REACHABLE, err); }
}

export async function handleRuntimeGetTree(): Promise<ToolResult> {
  try {
    const r = await sendGameCommand('get_tree', {});
    if (r.error) return { content: [{ type: 'text', text: `Error: ${r.error}` }], isError: true };
    const lines = [`Running scene: ${r.root} (${r.node_count} nodes)`, ''];
    for (const n of (r.tree || [])) {
      let line = `${'  '.repeat(n.depth)}${n.name} [${n.type}]`;
      if (n.position) line += `  pos=${n.position}`;
      if (n.path) line += `  (${n.path})`;
      lines.push(line);
    }
    return { content: [{ type: 'text', text: lines.join('\n') }] };
  } catch (err: any) { return wrapError(ErrorCode.RUNTIME_NOT_REACHABLE, err); }
}

export async function handleRuntimeGetNode(args: { path: string }): Promise<ToolResult> {
  try {
    const r = await sendGameCommand('get_node', { path: args.path });
    if (r.error) return { content: [{ type: 'text', text: `Error: ${r.error}` }], isError: true };
    const lines = [`${r.type}: ${r.name} (${r.path})`, `Properties (${Object.keys(r.properties || {}).length}):`, ''];
    for (const [k, v] of Object.entries(r.properties || {})) lines.push(`  ${k} = ${v}`);
    return { content: [{ type: 'text', text: lines.join('\n') }] };
  } catch (err: any) { return wrapError(ErrorCode.RUNTIME_NOT_REACHABLE, err); }
}

export async function handleRuntimeSetNode(args: { path: string; properties: Record<string, string> }): Promise<ToolResult> {
  try {
    const r = await sendGameCommand('set_node', { path: args.path, properties: args.properties || {} });
    if (r.error) return { content: [{ type: 'text', text: `Error: ${r.error}` }], isError: true };
    return { content: [{ type: 'text', text: `Node ${args.path}: ${r.updated} propertie(s) updated live.` }] };
  } catch (err: any) { return wrapError(ErrorCode.RUNTIME_NOT_REACHABLE, err); }
}

export async function handleRuntimeCallMethod(args: { path: string; method: string; args?: any[] }): Promise<ToolResult> {
  try {
    const r = await sendGameCommand('call_method', { path: args.path, method: args.method, args: args.args || [] });
    if (r.error) return { content: [{ type: 'text', text: `Error: ${r.error}` }], isError: true };
    return { content: [{ type: 'text', text: `Called ${args.path}.${args.method}\nResult: ${r.result ?? 'void'}` }] };
  } catch (err: any) { return wrapError(ErrorCode.RUNTIME_NOT_REACHABLE, err); }
}

export async function handleRuntimeEmitSignal(args: { path: string; signal: string; args?: any[] }): Promise<ToolResult> {
  try {
    const r = await sendGameCommand('emit_signal', { path: args.path, signal: args.signal, args: args.args || [] });
    if (r.error) return { content: [{ type: 'text', text: `Error: ${r.error}` }], isError: true };
    return { content: [{ type: 'text', text: `Emitted ${args.signal} on ${args.path}.` }] };
  } catch (err: any) { return wrapError(ErrorCode.RUNTIME_NOT_REACHABLE, err); }
}

export async function handleRuntimeInput(args: { keycode: number; action?: string }): Promise<ToolResult> {
  try {
    const r = await sendGameCommand('input', { keycode: args.keycode, action: args.action || 'press' });
    if (r.error) return { content: [{ type: 'text', text: `Error: ${r.error}` }], isError: true };
    return { content: [{ type: 'text', text: `Injected ${args.action || 'press'} for keycode ${args.keycode}.` }] };
  } catch (err: any) { return wrapError(ErrorCode.RUNTIME_NOT_REACHABLE, err); }
}

export async function handleRuntimeFreeze(): Promise<ToolResult> {
  try {
    const r = await sendGameCommand('freeze', {});
    return { content: [{ type: 'text', text: `Game paused (frozen). ${r.paused ? '' : ''}` }] };
  } catch (err: any) { return wrapError(ErrorCode.RUNTIME_NOT_REACHABLE, err); }
}

export async function handleRuntimeResume(): Promise<ToolResult> {
  try {
    await sendGameCommand('resume', {});
    return { content: [{ type: 'text', text: 'Game resumed (unpaused).' }] };
  } catch (err: any) { return wrapError(ErrorCode.RUNTIME_NOT_REACHABLE, err); }
}

export async function handleRuntimeStep(args: { frames?: number }): Promise<ToolResult> {
  try {
    const r = await sendGameCommand('step', { frames: args.frames ?? 1 });
    const n = args.frames ?? 1;
    return { content: [{ type: 'text', text: `Stepped ${n} frame(s) deterministically; game re-frozen. Use runtime_resume to continue.` }] };
  } catch (err: any) { return wrapError(ErrorCode.RUNTIME_NOT_REACHABLE, err); }
}

export async function handleRuntimeScreenshot(args: { path?: string }): Promise<ToolResult> {
  try {
    const r = await sendGameCommand('screenshot', { path: args.path || 'user://runtime_screenshot.png' });
    if (r.error) return { content: [{ type: 'text', text: `Error: ${r.error}` }], isError: true };
    return { content: [{ type: 'text', text: `Screenshot of running game saved: ${r.path}` }] };
  } catch (err: any) { return wrapError(ErrorCode.RUNTIME_NOT_REACHABLE, err); }
}
