// Copyright (c) 2026 FairYan
// SPDX-License-Identifier: AGPL-3.0-or-later
// ============================================================
// Godot MCP Server — Live Editor Bridge v1.3.3 (dual-mode)
// ============================================================
// Communicates with Godot Editor via TCP (preferred) or by
// spawning Godot as a child process with stdin/stdout.
// - TCP mode: connects to an already-running Godot on port 9876
// - stdio mode: spawns Godot if no existing instance is reachable
// ============================================================

import { z } from 'zod';
import net from 'node:net';
import { spawn, ChildProcess } from 'node:child_process';
import { ToolResult } from '../utils/types.js';
import { ErrorCode, toolError, wrapError, plainError, editorCommandError } from '../utils/errors.js';
import { findGodotBinary } from '../utils/godot_cli.js';

const EDITOR_PORT = 9876;
const TCP_CONNECT_TIMEOUT = 800;   // quick probe for an existing editor on 127.0.0.1
const TCP_RESPONSE_TIMEOUT = 30000; // per-request response wait (heavy ops: bake, reimport, run_gdscript)
const SPAWN_TIMEOUT = 15000;
const HEALTH_CACHE_MS = 60000;  // 60s health cache (was 30s)
const MAX_RESTART_ATTEMPTS = 3;
const RESPONSE_MARKER = '__MCP__:';

let _editorProcess: ChildProcess | null = null;
let _pendingRequests: Map<number, { resolve: (value: any) => void; reject: (err: Error) => void }> = new Map();
let _stdoutBuffer = '';
let _projectRoot: string | null = null;
let _lastHealthCheck = 0;
let _lastHealthStatus = false;
let _useTcp: boolean | null = null; // null = unknown, true = TCP, false = spawn
let _restartAttempts = 0;
/** Monotonic request id so concurrent commands never collide in the pending Maps. */
let _requestIdCounter = 0;

// ---- Persistent TCP connection ----
let _tcpClient: net.Socket | null = null;
let _tcpBuf = '';
let _tcpPending: Map<number, { resolve: (value: any) => void; reject: (err: Error) => void }> = new Map();
/** In-progress connect promise — shared by concurrent callers so only one socket is opened. */
let _tcpConnecting: Promise<net.Socket> | null = null;

function getTcpConnection(): Promise<net.Socket> {
  // Return existing healthy connection
  if (_tcpClient && !_tcpClient.destroyed && _tcpClient.readyState === 'open') {
    return Promise.resolve(_tcpClient);
  }

  // Share an in-progress connect so concurrent callers don't open multiple sockets
  if (_tcpConnecting) return _tcpConnecting;

  _tcpConnecting = new Promise((resolve, reject) => {
    // Close stale connection
    if (_tcpClient) {
      try { _tcpClient.destroy(); } catch {}
      _tcpClient = null;
    }

    // Reject all pending
    for (const [, p] of _tcpPending) {
      p.reject(new Error('Connection lost'));
    }
    _tcpPending.clear();
    _tcpBuf = '';

    const client = new net.Socket();
    const timer = setTimeout(() => {
      client.destroy();
      _tcpConnecting = null;
      _useTcp = null; // allow re-probe / spawn fallback on next call
      reject(new Error('TCP connection timed out'));
    }, TCP_CONNECT_TIMEOUT);

    // Connect-phase error handler (auto-removed once connected)
    const onConnectError = (err: Error) => {
      clearTimeout(timer);
      _tcpConnecting = null;
      _useTcp = null;
      reject(new Error(`TCP connection failed: ${err.message}`));
    };
    client.once('error', onConnectError);

    client.connect(EDITOR_PORT, '127.0.0.1', () => {
      clearTimeout(timer);
      client.removeListener('error', onConnectError);
      _tcpClient = client;
      _tcpConnecting = null;
      _lastHealthCheck = Date.now();
      _lastHealthStatus = true;
      _useTcp = true;

      // 插件若配置了 auth_token（GODOT_MCP_TOKEN），TCP 连接必须先完成 auth 握手。
      // 该响应不会匹配任何 pending 请求，会被 data 处理器忽略。
      const token = process.env.GODOT_MCP_TOKEN;
      if (token) {
        client.write(JSON.stringify({ jsonrpc: '2.0', id: 'auth', method: 'auth', params: { token } }) + '\n');
      }

      client.on('data', (chunk: Buffer) => {
        _tcpBuf += chunk.toString();
        // 解析完整的 JSON-RPC 响应（可能跨 chunk）
        let idx: number;
        while ((idx = _tcpBuf.indexOf('\n')) !== -1) {
          const line = _tcpBuf.substring(0, idx).trim();
          _tcpBuf = _tcpBuf.substring(idx + 1);
          if (!line) continue;
          try {
            const response = JSON.parse(line);
            const pending = _tcpPending.get(response.id);
            if (pending) {
              _tcpPending.delete(response.id);
              if (response.error) {
                pending.reject(new Error(response.error.message || 'Editor error'));
              } else {
                pending.resolve(response.result);
              }
            }
          } catch {}
        }
      });

      client.on('error', () => {
        _lastHealthStatus = false;
        _tcpClient = null;
        _useTcp = null; // connection lost → re-probe / spawn fallback on next call
        for (const [, p] of _tcpPending) {
          p.reject(new Error('TCP connection error'));
        }
        _tcpPending.clear();
      });

      client.on('close', () => {
        _tcpClient = null;
        _useTcp = null; // connection lost → re-probe / spawn fallback on next call
        for (const [, p] of _tcpPending) {
          p.reject(new Error('TCP connection closed'));
        }
        _tcpPending.clear();
      });

      resolve(client);
    });
  });

  return _tcpConnecting;
}

// ---- Dual-mode send ----

/**
 * Godot 侧把业务失败放在 result 里（`{"error": "Node not found"}`），而不是
 * JSON-RPC 的 error 字段。以前没人检查它，于是删除不存在的节点也会回报
 * "Node removed"，AI 客户端拿到假成功后会继续往下错。这里统一拦截。
 */
function assertEditorOk(method: string, result: any): any {
  if (result && typeof result === 'object' && typeof result.error === 'string' && result.error !== '') {
    throw editorCommandError(method, result.error);
  }
  return result;
}

export function sendEditorCommand(method: string, params: Record<string, any> = {}): Promise<any> {
  const send = (): Promise<any> => {
    // If we already know which mode works, use it
    if (_useTcp === true) return sendViaTcp(method, params);
    if (_useTcp === false) return sendViaSpawn(method, params);

    // First call: try TCP first, fall back to spawn
    return sendViaTcp(method, params).catch(() => sendViaSpawn(method, params));
  };
  return send().then((result) => assertEditorOk(method, result));
}

/**
 * 只读探测：给 `get_status` 这类诊断用。
 *
 * 与 sendEditorCommand 的两点关键区别：
 *  1. **绝不 spawn 编辑器** —— 诊断"编辑器连上了吗"却顺手启动一个编辑器是荒谬的副作用。
 *  2. 超时是 probeTimeoutMs（默认 1.5s）而不是 TCP_RESPONSE_TIMEOUT(30s) —— 诊断工具必须秒回。
 *
 * 返回 null 表示不可达，不抛异常。
 */
export async function probeEditor(probeTimeoutMs = 1500): Promise<any | null> {
  if (_useTcp === false) return null; // 已知只能靠 spawn ⇒ 视为"没有在跑的编辑器"
  try {
    const client = await getTcpConnection();
    const id = ++_requestIdCounter;
    const request = JSON.stringify({ jsonrpc: '2.0', id, method: 'get_editor_version', params: {} }) + '\n';
    return await new Promise<any | null>((resolve) => {
      const timer = setTimeout(() => {
        _tcpPending.delete(id);
        resolve(null);
      }, probeTimeoutMs);
      _tcpPending.set(id, {
        resolve: (result) => { clearTimeout(timer); resolve(result); },
        reject: () => { clearTimeout(timer); resolve(null); },
      });
      client.write(request);
    });
  } catch {
    return null;
  }
}

/** 绕过业务错误检查的原始通道（供本身就要读 result.error 的命令使用）。 */
export function sendEditorCommandRaw(method: string, params: Record<string, any> = {}): Promise<any> {
  if (_useTcp === true) return sendViaTcp(method, params);
  if (_useTcp === false) return sendViaSpawn(method, params);
  return sendViaTcp(method, params).catch(() => sendViaSpawn(method, params));
}

// ---- TCP mode (persistent connection to already-running Godot) ----

async function sendViaTcp(method: string, params: Record<string, any> = {}): Promise<any> {
  const client = await getTcpConnection();
  const id = ++_requestIdCounter;
  const request = JSON.stringify({ jsonrpc: '2.0', id, method, params }) + '\n';

  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      _tcpPending.delete(id);
      reject(new Error('TCP request timed out'));
    }, TCP_RESPONSE_TIMEOUT);

    _tcpPending.set(id, {
      resolve: (result) => { clearTimeout(timer); resolve(result); },
      reject: (err) => { clearTimeout(timer); reject(err); },
    });

    client.write(request);
  });
}

// ---- Spawn mode (launch Godot as child process) ----

function ensureEditorProcess(): ChildProcess {
  if (_editorProcess && !_editorProcess.killed && _editorProcess.exitCode === null) {
    return _editorProcess;
  }

  if (!_projectRoot) {
    throw new Error('Editor bridge not initialized. Call initEditorBridge(projectRoot) first.');
  }

  const godotPath = findGodotBinary();
  if (!godotPath) {
    throw new Error('Godot binary not found. Set GODOT_PATH environment variable.');
  }

  _editorProcess = spawn(godotPath, ['--editor', '--path', _projectRoot], {
    stdio: ['pipe', 'pipe', 'pipe'],
    env: { ...process.env, MCP_STDIO: 'true' },
  });

  _stdoutBuffer = '';

  _editorProcess.stdout!.on('data', (data: Buffer) => {
    _stdoutBuffer += data.toString();
    const lines = _stdoutBuffer.split('\n');
    _stdoutBuffer = lines.pop() || '';

    for (const line of lines) {
      if (line.startsWith(RESPONSE_MARKER)) {
        try {
          const json = JSON.parse(line.substring(RESPONSE_MARKER.length));
          const resolver = _pendingRequests.get(json.id);
          if (resolver) {
            _pendingRequests.delete(json.id);
            if (json.error) {
              resolver.reject(new Error(json.error.message || 'Editor error'));
            } else {
              resolver.resolve(json.result);
              _lastHealthCheck = Date.now();
              _lastHealthStatus = true;
            }
          }
        } catch { /* skip malformed */ }
      }
    }
  });

  _editorProcess.stderr!.on('data', (data: Buffer) => {
    const text = data.toString().trim();
    if (text) console.error(`[godot-editor] ${text}`);
  });

  _editorProcess.on('exit', (code) => {
    console.error(`[Godot MCP] Editor process exited (code=${code})`);
    _lastHealthStatus = false;
    for (const [, resolver] of _pendingRequests) {
      resolver.reject(new Error(`Editor process exited (code=${code})`));
    }
    _pendingRequests.clear();
    _editorProcess = null;

    // Auto-restart on unexpected exit (not caused by shutdown)
    if (code !== 0 && _restartAttempts < MAX_RESTART_ATTEMPTS) {
      _restartAttempts++;
      console.error(`[Godot MCP] Auto-restarting editor (attempt ${_restartAttempts}/${MAX_RESTART_ATTEMPTS})...`);
      try {
        ensureEditorProcess();
      } catch {
        console.error('[Godot MCP] Editor auto-restart failed');
      }
    }
  });

  _editorProcess.on('error', (err) => {
    console.error(`[Godot MCP] Failed to spawn editor: ${err.message}`);
    _lastHealthStatus = false;
    _editorProcess = null;
    for (const [, resolver] of _pendingRequests) {
      resolver.reject(new Error(`Editor spawn error: ${err.message}`));
    }
    _pendingRequests.clear();
  });

  return _editorProcess;
}

function sendViaSpawn(method: string, params: Record<string, any> = {}): Promise<any> {
  return new Promise((resolve, reject) => {
    try {
      const proc = ensureEditorProcess();
      const id = ++_requestIdCounter;
      const request = JSON.stringify({ jsonrpc: '2.0', id, method, params }) + '\n';

      let timer: NodeJS.Timeout;
      _pendingRequests.set(id, {
        resolve: (result) => { clearTimeout(timer); resolve(result); },
        reject: (err) => { clearTimeout(timer); reject(err); },
      });
      _useTcp = false;
      proc.stdin!.write(request);

      timer = setTimeout(() => {
        if (_pendingRequests.has(id)) {
          _pendingRequests.delete(id);
          reject(new Error(`Editor command timed out: ${method}`));
        }
      }, SPAWN_TIMEOUT);
    } catch (err: any) {
      _lastHealthStatus = false;
      reject(new Error(`Editor not available: ${err.message}`));
    }
  });
}

/** Initialize the editor bridge with the project root. Call once on startup. */
export function initEditorBridge(projectRoot: string): void {
  _projectRoot = projectRoot;
  _restartAttempts = 0;
}

/** Check if editor is currently reachable */
export function isEditorHealthy(): boolean {
  if (Date.now() - _lastHealthCheck < HEALTH_CACHE_MS) return _lastHealthStatus;
  return false;
}

/** Shut down the editor process gracefully */
export function shutdownEditorBridge(): void {
  _restartAttempts = MAX_RESTART_ATTEMPTS; // prevent auto-restart during shutdown
  if (_editorProcess && !_editorProcess.killed) {
    _editorProcess.kill();
  }
  _editorProcess = null;
  for (const [, resolver] of _pendingRequests) {
    resolver.reject(new Error('Server shutting down'));
  }
  _pendingRequests.clear();

  // Tear down the persistent TCP connection too
  for (const [, p] of _tcpPending) {
    p.reject(new Error('Server shutting down'));
  }
  _tcpPending.clear();
  if (_tcpClient) {
    try { _tcpClient.destroy(); } catch {}
    _tcpClient = null;
  }
  _tcpConnecting = null;
  _useTcp = null;
}

// ---- Tool Schemas ----

export const editorGetSelectionSchema = {};
export const editorSetSelectionSchema = {
  node_path: z.string().describe('Node path to select'),
  property: z.string().optional().describe('Property key to set'),
  value: z.string().optional().describe('Property value'),
};
export const editorPlaySchema = {};
export const editorStopSchema = {};
export const editorUndoSchema = {};
export const editorRedoSchema = {};
export const editorSaveSchema = {};
export const editorGetOpenSceneSchema = {};
export const editorOpenAssetSchema = { path: z.string().describe('Asset path') };
export const editorGetInfoSchema = {};
export const editorReadCurrentSceneSchema = {};
export const editorReloadSceneSchema = {};

// New v1.0 schemas
export const editorAddNodeSchema = {
  type: z.string().describe('Node type (e.g. "Sprite2D", "CollisionShape2D")'),
  name: z.string().optional().describe('Node name (auto-generated if omitted)'),
  parent: z.string().optional().default('.').describe('Parent node path'),
  properties: z.record(z.string()).optional().describe('Properties to set'),
};
export const editorRemoveNodeSchema = {
  path: z.string().describe('Node path to remove'),
};
export const editorGetNodePropertiesSchema = {
  path: z.string().describe('Node path to inspect'),
};
export const editorSetNodePropertiesSchema = {
  path: z.string().describe('Node path'),
  properties: z.record(z.string()).describe('Properties to set'),
};
export const editorRenameNodeSchema = {
  path: z.string().describe('Node path'),
  name: z.string().describe('New name'),
};
export const editorDuplicateNodeSchema = {
  path: z.string().describe('Node path to duplicate'),
  name: z.string().optional().describe('Name for duplicate'),
};
export const editorReparentNodeSchema = {
  path: z.string().describe('Node path'),
  new_parent: z.string().describe('New parent path'),
};
export const editorMoveNodeSchema = {
  node_path: z.string().describe('Node path'),
  position: z.string().describe('Position (e.g. "Vector2(100, 200)" or "Vector3(0, 5, 0)")'),
};
export const editorRunSpecificSceneSchema = {
  scene: z.string().describe('Scene path to run (e.g. "res://scenes/level1.tscn")'),
};
export const editorRunGdscriptSchema = {
  code: z.string().describe('GDScript code to execute in editor context'),
};
export const editorCreateScriptSchema = {
  path: z.string().describe('Output path for new script'),
  extends: z.string().optional().default('Node').describe('Base class'),
  template: z.string().optional().describe('Template: empty, node_script, character, resource_script, signal'),
};
export const editorAttachScriptSchema = {
  path: z.string().describe('Node path'),
  script: z.string().describe('Script path to attach'),
};
export const editorSetBreakpointSchema = {
  script: z.string().describe('Script path'),
  line: z.number().describe('Line number'),
};
export const editorRemoveBreakpointSchema = {
  script: z.string().describe('Script path'),
  line: z.number().describe('Line number'),
};
export const editorGetBreakpointsSchema = {};
export const editorSaveAllSchema = {};
export const editorFocusSchema = {};
export const editorOpenDockSchema = {
  dock: z.string().describe('Dock name: filesystem, inspector, scene, output'),
};
export const editorListFilesystemSchema = {
  path: z.string().optional().default('res://').describe('Directory path'),
  recursive: z.boolean().optional().default(false),
  pattern: z.string().optional().describe('Glob pattern (e.g. "*.gd")'),
};
export const editorHealthCheckSchema = {};
export const editorDeleteSelectedSchema = {};
export const editorGetRectSchema = {};
export const editorShowInFilesystemSchema = {
  path: z.string().describe('Path to reveal'),
};

// ---- Tool Handlers ----

export async function handleEditorGetSelection(): Promise<ToolResult> {
  try {
    const result = await sendEditorCommand('get_selection');
    const lines: string[] = [`Selected (${result.selection?.length || 0}):`];
    for (const n of (result.selection || [])) {
      lines.push(`  ${n.path} — ${n.type} "${n.name}"`);
    }
    return { content: [{ type: 'text', text: lines.join('\n') }] };
  } catch (err: any) { return wrapError(ErrorCode.EDITOR_NOT_REACHABLE, err); }
}

export async function handleEditorSetSelection(args: { node_path: string; property?: string; value?: string }): Promise<ToolResult> {
  try {
    const params: any = { node_path: args.node_path };
    if (args.property) params.property = args.property;
    if (args.value) params.value = args.value;
    await sendEditorCommand('set_selection', params);
    const msg = args.property
      ? `Selected "${args.node_path}" + set ${args.property}=${args.value}`
      : `Selected: ${args.node_path}`;
    return { content: [{ type: 'text', text: msg }] };
  } catch (err: any) { return wrapError(ErrorCode.EDITOR_NOT_REACHABLE, err); }
}

export async function handleEditorPlay(): Promise<ToolResult> {
  try { await sendEditorCommand('play_project'); return { content: [{ type: 'text', text: 'Project started.' }] }; }
  catch (err: any) { return wrapError(ErrorCode.EDITOR_NOT_REACHABLE, err); }
}

export async function handleEditorStop(): Promise<ToolResult> {
  try { await sendEditorCommand('stop_project'); return { content: [{ type: 'text', text: 'Project stopped.' }] }; }
  catch (err: any) { return wrapError(ErrorCode.EDITOR_NOT_REACHABLE, err); }
}

export async function handleEditorUndo(): Promise<ToolResult> {
  try {
    const r = await sendEditorCommand('undo');
    const text = r.undone ? `Undone: ${r.action || '(unnamed action)'}` : (r.message || 'Nothing to undo.');
    return { content: [{ type: 'text', text }] };
  } catch (err: any) { return wrapError(ErrorCode.EDITOR_NOT_REACHABLE, err); }
}

export async function handleEditorRedo(): Promise<ToolResult> {
  try {
    const r = await sendEditorCommand('redo');
    const text = r.redone ? `Redone: ${r.action || '(unnamed action)'}` : (r.message || 'Nothing to redo.');
    return { content: [{ type: 'text', text }] };
  } catch (err: any) { return wrapError(ErrorCode.EDITOR_NOT_REACHABLE, err); }
}

export async function handleEditorSave(): Promise<ToolResult> {
  try { await sendEditorCommand('save_scene'); return { content: [{ type: 'text', text: 'Scene saved.' }] }; }
  catch (err: any) { return wrapError(ErrorCode.EDITOR_NOT_REACHABLE, err); }
}

export async function handleEditorGetOpenScene(): Promise<ToolResult> {
  try {
    const r = await sendEditorCommand('get_open_scene');
    if (r.scene) {
      const lines = [`Scene: ${r.scene}`, `Root: ${r.root} (${r.root_type})`, `Children: ${r.child_count}`];
      for (const c of (r.top_children || [])) lines.push(`  - ${c.name} [${c.type}]`);
      return { content: [{ type: 'text', text: lines.join('\n') }] };
    }
    return { content: [{ type: 'text', text: 'No scene open.' }] };
  } catch (err: any) { return wrapError(ErrorCode.EDITOR_NOT_REACHABLE, err); }
}

export async function handleEditorReadCurrentScene(): Promise<ToolResult> {
  try {
    const r = await sendEditorCommand('get_current_scene_tree');
    if (r.error) return plainError(r.error);
    const lines = [`Scene: ${r.scene || '(unsaved)'}`, `Nodes: ${r.node_count}`, ''];
    for (const n of (r.tree || [])) {
      let line = `${'  '.repeat(n.depth)}${n.name} [${n.type}]`;
      if (n.position) line += `  pos=${n.position}`;
      if (n.text) line += `  "${n.text}"`;
      lines.push(line);
    }
    return { content: [{ type: 'text', text: lines.join('\n') }] };
  } catch (err: any) { return wrapError(ErrorCode.EDITOR_NOT_REACHABLE, err); }
}

export async function handleEditorOpenAsset(args: { path: string }): Promise<ToolResult> {
  try { await sendEditorCommand('open_asset', { path: args.path }); return { content: [{ type: 'text', text: `Opened: ${args.path}` }] }; }
  catch (err: any) { return wrapError(ErrorCode.EDITOR_NOT_REACHABLE, err); }
}

export async function handleEditorGetInfo(): Promise<ToolResult> {
  try {
    // Single round-trip: plugin.gd `get_editor_info` returns the whole snapshot.
    // Selection is not part of it, so fetch it alongside.
    const [info, selection] = await Promise.all([
      sendEditorCommand('get_editor_info'),
      sendEditorCommand('get_selection').catch(() => ({ selection: [] })),
    ]);
    const v = info.version || {};
    const lines = [
      'Godot Editor:',
      `  Version:       ${v.string || `${v.major ?? '?'}.${v.minor ?? '?'}.${v.patch ?? '?'}`}`,
      `  Plugin:        v${info.plugin_version ?? '?'}`,
      `  Language:      ${info.editor_language || '?'}   Scale: ${info.editor_scale ?? '?'}`,
      `  Window:        ${info.editor_width}x${info.editor_height}`,
      `  Playing:       ${info.playing ? `yes (${info.playing_scene || '?'})` : 'no'}`,
      `  Scene:         ${info.open_scene || 'none'}`,
      `  Open scenes:   ${(info.open_scenes || []).length}`,
    ];
    for (const s of (info.open_scenes || [])) lines.push(`    - ${s}`);
    if (Array.isArray(info.unsaved_scenes)) {
      lines.push(`  Unsaved:       ${info.unsaved_scenes.length}`);
      for (const s of info.unsaved_scenes) lines.push(`    * ${s}`);
    }
    lines.push(
      `  Selected:      ${selection.selection?.length || 0} node(s)`,
      `  FS directory:  ${info.current_directory || '?'}`,
      `  Movie Maker:   ${info.movie_maker ? 'on' : 'off'}   Distraction-free: ${info.distraction_free ? 'on' : 'off'}   Multi-window: ${info.multi_window ? 'on' : 'off'}`,
    );
    return { content: [{ type: 'text', text: lines.join('\n') }] };
  } catch (err: any) { return wrapError(ErrorCode.EDITOR_NOT_REACHABLE, err); }
}

export async function handleEditorReloadScene(): Promise<ToolResult> {
  try {
    const r = await sendEditorCommand('reload_scene');
    return { content: [{ type: 'text', text: `Reloaded: ${r.scene}\n${r.message}` }] };
  } catch (err: any) { return wrapError(ErrorCode.EDITOR_NOT_REACHABLE, err); }
}

// ---- New v1.0 Handlers ----

export async function handleEditorAddNode(args: { type: string; name?: string; parent?: string; properties?: Record<string, string> }): Promise<ToolResult> {
  try {
    const r = await sendEditorCommand('add_node', {
      type: args.type, name: args.name, parent: args.parent || '.', properties: args.properties || {},
    });
    const lines = [`Node added: ${r.name} (${r.type}) at ${r.path}`];
    if (r.failed_properties?.length) {
      lines.push(`Skipped unknown properties: ${r.failed_properties.join(', ')} — use editor_get_node_properties to list valid names.`);
    }
    if (r.undoable) lines.push('Undoable in the editor (Ctrl+Z / editor_undo).');
    return { content: [{ type: 'text', text: lines.join('\n') }] };
  } catch (err: any) { return wrapError(ErrorCode.EDITOR_NOT_REACHABLE, err); }
}

export async function handleEditorRemoveNode(args: { path: string }): Promise<ToolResult> {
  try {
    const r = await sendEditorCommand('remove_node', { path: args.path });
    const suffix = r.undoable ? ' (undoable via Ctrl+Z / editor_undo)' : '';
    return { content: [{ type: 'text', text: `Node removed: ${args.path}${suffix}` }] };
  } catch (err: any) { return wrapError(ErrorCode.EDITOR_NOT_REACHABLE, err); }
}

export async function handleEditorGetNodeProperties(args: { path: string }): Promise<ToolResult> {
  try {
    const r = await sendEditorCommand('get_node_properties', { path: args.path });
    const lines = [`${r.type}: ${r.node} (${r.path})`, `Properties (${Object.keys(r.properties || {}).length}):`, ''];
    for (const [k, v] of Object.entries(r.properties || {})) {
      lines.push(`  ${k} = ${v}`);
    }
    return { content: [{ type: 'text', text: lines.join('\n') }] };
  } catch (err: any) { return wrapError(ErrorCode.EDITOR_NOT_REACHABLE, err); }
}

export async function handleEditorSetNodeProperties(args: { path: string; properties: Record<string, string> }): Promise<ToolResult> {
  try {
    const r = await sendEditorCommand('set_node_properties', { path: args.path, properties: args.properties });
    const applied = r.applied?.length ?? r.updated ?? 0;
    const lines = [`Properties updated on ${args.path}: ${applied} applied` +
      (r.applied?.length ? ` (${r.applied.join(', ')})` : '')];
    if (r.failed_properties?.length) {
      lines.push(`Skipped ${r.failed_properties.length} unknown propertie(s): ${r.failed_properties.join(', ')}`);
      lines.push('Use editor_get_node_properties to list the valid property names for this node.');
    }
    // 全部属性都无效时按失败上报，否则 AI 会以为改动生效了。
    const allFailed = applied === 0 && (r.failed_properties?.length ?? 0) > 0;
    return { content: [{ type: 'text', text: lines.join('\n') }], isError: allFailed };
  } catch (err: any) { return wrapError(ErrorCode.EDITOR_NOT_REACHABLE, err); }
}

export async function handleEditorRenameNode(args: { path: string; name: string }): Promise<ToolResult> {
  try {
    await sendEditorCommand('rename_node', args);
    return { content: [{ type: 'text', text: `Renamed ${args.path} → ${args.name}` }] };
  } catch (err: any) { return wrapError(ErrorCode.EDITOR_NOT_REACHABLE, err); }
}

export async function handleEditorDuplicateNode(args: { path: string; name?: string }): Promise<ToolResult> {
  try {
    const r = await sendEditorCommand('duplicate_node', args);
    return { content: [{ type: 'text', text: `Duplicated: ${r.name} at ${r.path}` }] };
  } catch (err: any) { return wrapError(ErrorCode.EDITOR_NOT_REACHABLE, err); }
}

export async function handleEditorReparentNode(args: { path: string; new_parent: string }): Promise<ToolResult> {
  try {
    await sendEditorCommand('reparent_node', args);
    return { content: [{ type: 'text', text: `Reparented: ${args.path} → ${args.new_parent}` }] };
  } catch (err: any) { return wrapError(ErrorCode.EDITOR_NOT_REACHABLE, err); }
}

export async function handleEditorMoveNode(args: { node_path: string; position: string }): Promise<ToolResult> {
  try {
    const method = args.position.includes('Vector3') ? 'move_node_3d' : 'move_node';
    await sendEditorCommand(method, args);
    return { content: [{ type: 'text', text: `Moved ${args.node_path} to ${args.position}` }] };
  } catch (err: any) { return wrapError(ErrorCode.EDITOR_NOT_REACHABLE, err); }
}

export async function handleEditorRunSpecificScene(args: { scene: string }): Promise<ToolResult> {
  try {
    await sendEditorCommand('run_specific_scene', args);
    return { content: [{ type: 'text', text: `Running scene: ${args.scene}` }] };
  } catch (err: any) { return wrapError(ErrorCode.EDITOR_NOT_REACHABLE, err); }
}

export async function handleEditorRunGdscript(args: { code: string }): Promise<ToolResult> {
  try {
    const r = await sendEditorCommand('run_gdscript', args);
    if (r.error) return plainError(r.error);
    return { content: [{ type: 'text', text: `GDScript executed.\nResult: ${r.result || 'void'}` }] };
  } catch (err: any) { return wrapError(ErrorCode.EDITOR_NOT_REACHABLE, err); }
}

export async function handleEditorCreateScript(args: { path: string; extends?: string; template?: string }): Promise<ToolResult> {
  try {
    const r = await sendEditorCommand('create_script', args);
    return { content: [{ type: 'text', text: `Script created: ${r.path} (extends ${r.extends})` }] };
  } catch (err: any) { return wrapError(ErrorCode.EDITOR_NOT_REACHABLE, err); }
}

export async function handleEditorAttachScript(args: { path: string; script: string }): Promise<ToolResult> {
  try {
    await sendEditorCommand('attach_script', args);
    return { content: [{ type: 'text', text: `Script ${args.script} attached to ${args.path}` }] };
  } catch (err: any) { return wrapError(ErrorCode.EDITOR_NOT_REACHABLE, err); }
}

export async function handleEditorSetBreakpoint(args: { script: string; line: number }): Promise<ToolResult> {
  try {
    await sendEditorCommand('set_breakpoint', args);
    return { content: [{ type: 'text', text: `Breakpoint set: ${args.script}:${args.line}` }] };
  } catch (err: any) { return wrapError(ErrorCode.EDITOR_NOT_REACHABLE, err); }
}

export async function handleEditorRemoveBreakpoint(args: { script: string; line: number }): Promise<ToolResult> {
  try {
    await sendEditorCommand('remove_breakpoint', args);
    return { content: [{ type: 'text', text: `Breakpoint removed: ${args.script}:${args.line}` }] };
  } catch (err: any) { return wrapError(ErrorCode.EDITOR_NOT_REACHABLE, err); }
}

export async function handleEditorGetBreakpoints(): Promise<ToolResult> {
  try {
    const r = await sendEditorCommand('get_breakpoints');
    const bps = r.breakpoints || [];
    return { content: [{ type: 'text', text: `Breakpoints (${bps.length}):\n${JSON.stringify(bps, null, 2)}` }] };
  } catch (err: any) { return wrapError(ErrorCode.EDITOR_NOT_REACHABLE, err); }
}

export async function handleEditorSaveAll(): Promise<ToolResult> {
  try { await sendEditorCommand('save_all_scenes'); return { content: [{ type: 'text', text: 'All scenes saved.' }] }; }
  catch (err: any) { return wrapError(ErrorCode.EDITOR_NOT_REACHABLE, err); }
}

export async function handleEditorFocus(): Promise<ToolResult> {
  try { await sendEditorCommand('focus_editor'); return { content: [{ type: 'text', text: 'Editor focused.' }] }; }
  catch (err: any) { return wrapError(ErrorCode.EDITOR_NOT_REACHABLE, err); }
}

export async function handleEditorOpenDock(args: { dock: string }): Promise<ToolResult> {
  try { await sendEditorCommand('open_dock', args); return { content: [{ type: 'text', text: `Dock opened: ${args.dock}` }] }; }
  catch (err: any) { return wrapError(ErrorCode.EDITOR_NOT_REACHABLE, err); }
}

export async function handleEditorListFilesystem(args: { path?: string; recursive?: boolean; pattern?: string }): Promise<ToolResult> {
  try {
    const r = await sendEditorCommand('list_filesystem', args);
    const dirs = (r.files || []).filter((f: any) => f.type === 'dir');
    const files = (r.files || []).filter((f: any) => f.type === 'file');
    const lines = [`Directory: ${r.path}`, `Dirs: ${dirs.length}, Files: ${files.length}`, ''];
    for (const f of r.files || []) {
      lines.push(`  [${f.type}] ${f.path}`);
    }
    return { content: [{ type: 'text', text: lines.join('\n') }] };
  } catch (err: any) { return wrapError(ErrorCode.EDITOR_NOT_REACHABLE, err); }
}

export async function handleEditorHealthCheck(): Promise<ToolResult> {
  try {
    await sendEditorCommand('get_editor_version');
    return { content: [{ type: 'text', text: 'Editor is reachable.' }] };
  } catch (err: any) {
    return toolError(ErrorCode.EDITOR_NOT_REACHABLE, 'Editor is NOT reachable.', err.message);
  }
}

export async function handleEditorDeleteSelected(): Promise<ToolResult> {
  try {
    const r = await sendEditorCommand('delete_selected');
    return { content: [{ type: 'text', text: `Deleted ${r.deleted} node(s).` }] };
  } catch (err: any) { return wrapError(ErrorCode.EDITOR_NOT_REACHABLE, err); }
}

export async function handleEditorGetRect(): Promise<ToolResult> {
  try {
    const r = await sendEditorCommand('get_editor_rect');
    return { content: [{ type: 'text', text: `Editor window: ${r.width} x ${r.height}` }] };
  } catch (err: any) { return wrapError(ErrorCode.EDITOR_NOT_REACHABLE, err); }
}

export async function handleEditorShowInFilesystem(args: { path: string }): Promise<ToolResult> {
  try { await sendEditorCommand('show_in_filesystem', args); return { content: [{ type: 'text', text: `Revealed: ${args.path}` }] }; }
  catch (err: any) { return wrapError(ErrorCode.EDITOR_NOT_REACHABLE, err); }
}

// ---- v2.0: Debugger, Settings, Signals, Scenes, Input, Plugins ----

export const editorCreateSceneSchema = {
  path: z.string().describe('Path for new scene'), root_type: z.string().optional().default('Node2D'), root_name: z.string().optional(),
};
export const editorInstantiateSceneSchema = {
  scene: z.string().describe('PackedScene path to instantiate'), parent: z.string().optional().default('.'), name: z.string().optional(),
};
export const editorSetMainSceneSchema = { scene: z.string().describe('Scene path to set as main') };
export const editorDebugContinueSchema = {};
export const editorDebugStepSchema = {};
export const editorDebugStepOverSchema = {};
export const editorDebugBreakSchema = {};
export const editorGetStackTraceSchema = {};
export const editorGetDebugVariablesSchema = {};
export const editorEvaluateExpressionSchema = { expression: z.string().describe('GDScript expression to evaluate') };
export const editorGetEditorSettingSchema = { key: z.string().describe('Setting key') };
export const editorSetEditorSettingSchema = { key: z.string(), value: z.string() };
export const editorGetProjectSettingSchema = { key: z.string() };
export const editorSetProjectSettingSchema = { key: z.string(), value: z.string() };
export const editorConnectSignalSchema = {
  node: z.string(), signal: z.string(), target: z.string().optional(), method: z.string(),
};
export const editorDisconnectSignalSchema = {
  node: z.string(), signal: z.string(), target: z.string().optional(), method: z.string().optional(),
};
export const editorListNodeSignalsSchema = { node: z.string() };
export const editorGetSceneChangesSchema = {};
export const editorGetRecentScenesSchema = {};
export const editorGetProjectDirectorySchema = {};
export const editorSimulateKeySchema = {
  key: z.string().describe('Key name (e.g. "F5", "Ctrl+S" via modifiers)'),
  modifiers: z.record(z.boolean()).optional().describe('{ctrl, shift, alt} booleans'),
};
export const editorGetPluginListSchema = {};
export const editorEnablePluginSchema = { plugin: z.string() };
export const editorDisablePluginSchema = { plugin: z.string() };
export const editorTakeScreenshotSchema = { path: z.string().optional().default('res://editor_screenshot.png') };

export async function handleEditorCreateScene(args: { path: string; root_type?: string; root_name?: string }): Promise<ToolResult> {
  try { const r = await sendEditorCommand('create_scene', args); return { content: [{ type: 'text', text: `Scene created: ${r.path} (${r.root})` }] }; }
  catch (err: any) { return wrapError(ErrorCode.EDITOR_NOT_REACHABLE, err); }
}
export async function handleEditorInstantiateScene(args: { scene: string; parent?: string; name?: string }): Promise<ToolResult> {
  try { const r = await sendEditorCommand('instantiate_scene', args); return { content: [{ type: 'text', text: `Instantiated: ${r.name} (${r.type}) at ${r.path}` }] }; }
  catch (err: any) { return wrapError(ErrorCode.EDITOR_NOT_REACHABLE, err); }
}
export async function handleEditorSetMainScene(args: { scene: string }): Promise<ToolResult> {
  try { await sendEditorCommand('set_main_scene', args); return { content: [{ type: 'text', text: `Main scene set: ${args.scene}` }] }; }
  catch (err: any) { return wrapError(ErrorCode.EDITOR_NOT_REACHABLE, err); }
}
export async function handleEditorDebugContinue(): Promise<ToolResult> {
  try { await sendEditorCommand('debug_continue'); return { content: [{ type: 'text', text: 'Debugger continued.' }] }; }
  catch (err: any) { return wrapError(ErrorCode.EDITOR_NOT_REACHABLE, err); }
}
export async function handleEditorDebugStep(): Promise<ToolResult> {
  try { await sendEditorCommand('debug_step'); return { content: [{ type: 'text', text: 'Step into.' }] }; }
  catch (err: any) { return wrapError(ErrorCode.EDITOR_NOT_REACHABLE, err); }
}
export async function handleEditorDebugStepOver(): Promise<ToolResult> {
  try { await sendEditorCommand('debug_step_over'); return { content: [{ type: 'text', text: 'Step over.' }] }; }
  catch (err: any) { return wrapError(ErrorCode.EDITOR_NOT_REACHABLE, err); }
}
export async function handleEditorDebugBreak(): Promise<ToolResult> {
  try { await sendEditorCommand('debug_break'); return { content: [{ type: 'text', text: 'Execution stopped.' }] }; }
  catch (err: any) { return wrapError(ErrorCode.EDITOR_NOT_REACHABLE, err); }
}
export async function handleEditorGetStackTrace(): Promise<ToolResult> {
  try { const r = await sendEditorCommand('get_stack_trace'); return { content: [{ type: 'text', text: `Stack (${r.count} frames):\n${JSON.stringify(r.stack, null, 2)}` }] }; }
  catch (err: any) { return wrapError(ErrorCode.EDITOR_NOT_REACHABLE, err); }
}
export async function handleEditorGetDebugVariables(): Promise<ToolResult> {
  try { const r = await sendEditorCommand('get_debug_variables'); return { content: [{ type: 'text', text: `Variables:\n${JSON.stringify(r.variables, null, 2)}` }] }; }
  catch (err: any) { return wrapError(ErrorCode.EDITOR_NOT_REACHABLE, err); }
}
export async function handleEditorEvaluateExpression(args: { expression: string }): Promise<ToolResult> {
  try { const r = await sendEditorCommand('evaluate_expression', args); return { content: [{ type: 'text', text: r.error ? r.error : `Result: ${r.result}` }], isError: !!r.error }; }
  catch (err: any) { return wrapError(ErrorCode.EDITOR_NOT_REACHABLE, err); }
}
export async function handleEditorGetEditorSetting(args: { key: string }): Promise<ToolResult> {
  try { const r = await sendEditorCommand('get_editor_setting', args); return { content: [{ type: 'text', text: r.error ? r.error : `${r.key} = ${r.value}` }], isError: !!r.error }; }
  catch (err: any) { return wrapError(ErrorCode.EDITOR_NOT_REACHABLE, err); }
}
export async function handleEditorSetEditorSetting(args: { key: string; value: string }): Promise<ToolResult> {
  try { await sendEditorCommand('set_editor_setting', args); return { content: [{ type: 'text', text: `Editor setting: ${args.key} = ${args.value}` }] }; }
  catch (err: any) { return wrapError(ErrorCode.EDITOR_NOT_REACHABLE, err); }
}
export async function handleEditorGetProjectSetting(args: { key: string }): Promise<ToolResult> {
  try { const r = await sendEditorCommand('get_project_setting', args); return { content: [{ type: 'text', text: r.error ? r.error : `${r.key} = ${r.value}` }], isError: !!r.error }; }
  catch (err: any) { return wrapError(ErrorCode.EDITOR_NOT_REACHABLE, err); }
}
export async function handleEditorSetProjectSetting(args: { key: string; value: string }): Promise<ToolResult> {
  try { await sendEditorCommand('set_project_setting', args); return { content: [{ type: 'text', text: `Project setting: ${args.key} = ${args.value}` }] }; }
  catch (err: any) { return wrapError(ErrorCode.EDITOR_NOT_REACHABLE, err); }
}
export async function handleEditorConnectSignal(args: { node: string; signal: string; target?: string; method: string }): Promise<ToolResult> {
  try { await sendEditorCommand('connect_editor_signal', args); return { content: [{ type: 'text', text: `Signal connected: ${args.signal} on ${args.node}` }] }; }
  catch (err: any) { return wrapError(ErrorCode.EDITOR_NOT_REACHABLE, err); }
}
export async function handleEditorDisconnectSignal(args: { node: string; signal: string; target?: string; method?: string }): Promise<ToolResult> {
  try { await sendEditorCommand('disconnect_editor_signal', args); return { content: [{ type: 'text', text: `Signal disconnected: ${args.signal}` }] }; }
  catch (err: any) { return wrapError(ErrorCode.EDITOR_NOT_REACHABLE, err); }
}
export async function handleEditorListNodeSignals(args: { node: string }): Promise<ToolResult> {
  try { const r = await sendEditorCommand('list_node_signals', args); const lines = [`${r.node} signals:`]; for (const s of r.signals||[]) lines.push(`  ${s.name} (${s.connections} connections)`); return { content: [{ type: 'text', text: lines.join('\n') }] }; }
  catch (err: any) { return wrapError(ErrorCode.EDITOR_NOT_REACHABLE, err); }
}
export async function handleEditorGetSceneChanges(): Promise<ToolResult> {
  try {
    const r = await sendEditorCommand('get_scene_changes');
    const parts = [`Scene: ${r.scene || 'none'}`, `Modified: ${r.modified}`];
    if (r.last_action) parts.push(`Last action: ${r.last_action}`);
    if (r.can_undo !== undefined) parts.push(`Undo: ${r.can_undo ? 'available' : 'empty'}`);
    if (r.can_redo !== undefined) parts.push(`Redo: ${r.can_redo ? 'available' : 'empty'}`);
    return { content: [{ type: 'text', text: parts.join(' | ') }] };
  }
  catch (err: any) { return wrapError(ErrorCode.EDITOR_NOT_REACHABLE, err); }
}
export async function handleEditorGetRecentScenes(): Promise<ToolResult> {
  try { const r = await sendEditorCommand('get_recent_scenes'); return { content: [{ type: 'text', text: `Recent: ${(r.recent||[]).join(', ')}` }] }; }
  catch (err: any) { return wrapError(ErrorCode.EDITOR_NOT_REACHABLE, err); }
}
export async function handleEditorGetProjectDirectory(): Promise<ToolResult> {
  try { const r = await sendEditorCommand('get_project_directory'); return { content: [{ type: 'text', text: `Res: ${r.res} | User: ${r.user}` }] }; }
  catch (err: any) { return wrapError(ErrorCode.EDITOR_NOT_REACHABLE, err); }
}
export async function handleEditorSimulateKey(args: { key: string; modifiers?: Record<string, boolean> }): Promise<ToolResult> {
  try { await sendEditorCommand('simulate_key_press', args); return { content: [{ type: 'text', text: `Key simulated: ${args.key}` }] }; }
  catch (err: any) { return wrapError(ErrorCode.EDITOR_NOT_REACHABLE, err); }
}
export async function handleEditorGetPluginList(): Promise<ToolResult> {
  try { const r = await sendEditorCommand('get_plugin_list'); const lines = [`Plugins (${r.count}):`]; for (const p of r.plugins||[]) lines.push(`  ${p.enabled?'[ON]':'[OFF]'} ${p.id} — ${p.name} v${p.version}`); return { content: [{ type: 'text', text: lines.join('\n') }] }; }
  catch (err: any) { return wrapError(ErrorCode.EDITOR_NOT_REACHABLE, err); }
}
export async function handleEditorEnablePlugin(args: { plugin: string }): Promise<ToolResult> {
  try { await sendEditorCommand('enable_plugin', args); return { content: [{ type: 'text', text: `Plugin enabled: ${args.plugin}` }] }; }
  catch (err: any) { return wrapError(ErrorCode.EDITOR_NOT_REACHABLE, err); }
}
export async function handleEditorDisablePlugin(args: { plugin: string }): Promise<ToolResult> {
  try { await sendEditorCommand('disable_plugin', args); return { content: [{ type: 'text', text: `Plugin disabled: ${args.plugin}` }] }; }
  catch (err: any) { return wrapError(ErrorCode.EDITOR_NOT_REACHABLE, err); }
}
export async function handleEditorTakeScreenshot(args: { path?: string }): Promise<ToolResult> {
  try { const r = await sendEditorCommand('take_screenshot', args); return { content: [{ type: 'text', text: r.error ? r.error : `Screenshot saved: ${r.path}` }], isError: !!r.error }; }
  catch (err: any) { return wrapError(ErrorCode.EDITOR_NOT_REACHABLE, err); }
}

// ---- v3.0: Class Introspection, Filesystem CRUD, Camera, Autoload, InputMap, Errors, Bake, Runtime ----

export const editorGetClassListSchema = { filter: z.string().optional(), extends: z.string().optional() };
export const editorGetMethodListSchema = { class: z.string() };
export const editorGetClassPropertyListSchema = { class: z.string() };
export const editorGetClassSignalListSchema = { class: z.string() };
export const editorGetClassDocSchema = { class: z.string() };
export const editorSearchHelpSchema = { query: z.string() };
export const editorCreateFolderSchema = { path: z.string() };
export const editorDeleteAssetSchema = { path: z.string() };
export const editorRenameAssetSchema = { from: z.string(), to: z.string() };
export const editorMoveAssetSchema = { from: z.string(), to: z.string() };
export const editorDuplicateAssetSchema = { from: z.string(), to: z.string() };
export const editorGetEditorCameraSchema = {};
export const editorSetEditorCameraSchema = { position: z.string() };
export const editorToggleGridSchema = {};
export const editorToggleSnapSchema = {};
export const editorGetAutoloadListSchema = {};
export const editorAddAutoloadSchema = { name: z.string(), path: z.string() };
export const editorRemoveAutoloadSchema = { name: z.string() };
export const editorGetInputMapSchema = {};
export const editorAddInputActionSchema = { name: z.string(), deadzone: z.number().optional().default(0.5) };
export const editorRemoveInputActionSchema = { name: z.string() };
export const editorGetErrorListSchema = {};
export const editorClearErrorsSchema = {};
export const editorReimportAssetSchema = { path: z.string() };
export const editorBakeLightmapsSchema = {};
export const editorBakeNavigationSchema = {};
export const editorGetRunningSceneTreeSchema = {};
export const editorGetPerformanceMonitorsSchema = {};
export const editorGetDependencyListSchema = { path: z.string() };

// Class introspection
export async function handleEditorGetClassList(args: { filter?: string; extends?: string }): Promise<ToolResult> {
  try { const r = await sendEditorCommand('get_class_list', args); return { content: [{ type: 'text', text: `Classes (${r.count}):\n${(r.classes||[]).join(', ')}` }] }; }
  catch (e: any) { return wrapError(ErrorCode.EDITOR_NOT_REACHABLE, e); }
}
export async function handleEditorGetMethodList(args: { class: string }): Promise<ToolResult> {
  try { const r = await sendEditorCommand('get_method_list', args); const lines = [`${r.class} methods (${r.count}):`]; for (const m of r.methods||[]) lines.push(`  ${m.name}(${(m.args||[]).map((a:any)=>`${a.name}:${a.type}`).join(', ')}) → ${m.returns}`); return { content: [{ type: 'text', text: lines.join('\n') }] }; }
  catch (e: any) { return wrapError(ErrorCode.EDITOR_NOT_REACHABLE, e); }
}
export async function handleEditorGetClassPropertyList(args: { class: string }): Promise<ToolResult> {
  try { const r = await sendEditorCommand('get_property_list', args); const lines = [`${r.class} properties (${r.count}):`]; for (const p of r.properties||[]) lines.push(`  ${p.name}: ${p.type}`); return { content: [{ type: 'text', text: lines.join('\n') }] }; }
  catch (e: any) { return wrapError(ErrorCode.EDITOR_NOT_REACHABLE, e); }
}
export async function handleEditorGetClassSignalList(args: { class: string }): Promise<ToolResult> {
  try { const r = await sendEditorCommand('get_signal_list', args); const lines = [`${r.class} signals (${r.count}):`]; for (const s of r.signals||[]) lines.push(`  ${s.name}(${(s.args||[]).join(',')})`); return { content: [{ type: 'text', text: lines.join('\n') }] }; }
  catch (e: any) { return wrapError(ErrorCode.EDITOR_NOT_REACHABLE, e); }
}
export async function handleEditorGetClassDoc(args: { class: string }): Promise<ToolResult> {
  try { await sendEditorCommand('get_class_doc', args); return { content: [{ type: 'text', text: `Opening docs for ${args.class} in browser.` }] }; }
  catch (e: any) { return wrapError(ErrorCode.EDITOR_NOT_REACHABLE, e); }
}
export async function handleEditorSearchHelp(args: { query: string }): Promise<ToolResult> {
  try { await sendEditorCommand('search_help', args); return { content: [{ type: 'text', text: `Searching Godot docs for: ${args.query}` }] }; }
  catch (e: any) { return wrapError(ErrorCode.EDITOR_NOT_REACHABLE, e); }
}

// Filesystem CRUD
export async function handleEditorCreateFolder(args: { path: string }): Promise<ToolResult> {
  try { await sendEditorCommand('create_folder', args); return { content: [{ type: 'text', text: `Folder created: ${args.path}` }] }; }
  catch (e: any) { return wrapError(ErrorCode.EDITOR_NOT_REACHABLE, e); }
}
export async function handleEditorDeleteAsset(args: { path: string }): Promise<ToolResult> {
  try { await sendEditorCommand('delete_asset', args); return { content: [{ type: 'text', text: `Asset deleted: ${args.path}` }] }; }
  catch (e: any) { return wrapError(ErrorCode.EDITOR_NOT_REACHABLE, e); }
}
export async function handleEditorRenameAsset(args: { from: string; to: string }): Promise<ToolResult> {
  try { await sendEditorCommand('rename_asset', args); return { content: [{ type: 'text', text: `Renamed: ${args.from} → ${args.to}` }] }; }
  catch (e: any) { return wrapError(ErrorCode.EDITOR_NOT_REACHABLE, e); }
}
export async function handleEditorMoveAsset(args: { from: string; to: string }): Promise<ToolResult> {
  try { await sendEditorCommand('move_asset', args); return { content: [{ type: 'text', text: `Moved: ${args.from} → ${args.to}` }] }; }
  catch (e: any) { return wrapError(ErrorCode.EDITOR_NOT_REACHABLE, e); }
}
export async function handleEditorDuplicateAsset(args: { from: string; to: string }): Promise<ToolResult> {
  try { await sendEditorCommand('duplicate_asset', args); return { content: [{ type: 'text', text: `Duplicated: ${args.from} → ${args.to}` }] }; }
  catch (e: any) { return wrapError(ErrorCode.EDITOR_NOT_REACHABLE, e); }
}

// Editor Viewport
export async function handleEditorGetEditorCamera(): Promise<ToolResult> {
  try { const r = await sendEditorCommand('get_editor_camera'); return { content: [{ type: 'text', text: r.error ? r.error : `Editor camera: ${r.position} rot=${r.rotation} fov=${r.fov}` }], isError: !!r.error }; }
  catch (e: any) { return wrapError(ErrorCode.EDITOR_NOT_REACHABLE, e); }
}
export async function handleEditorSetEditorCamera(args: { position: string }): Promise<ToolResult> {
  try { await sendEditorCommand('set_editor_camera', args); return { content: [{ type: 'text', text: `Camera moved to ${args.position}` }] }; }
  catch (e: any) { return wrapError(ErrorCode.EDITOR_NOT_REACHABLE, e); }
}
export async function handleEditorToggleGrid(): Promise<ToolResult> {
  try { await sendEditorCommand('toggle_grid'); return { content: [{ type: 'text', text: 'Grid toggled.' }] }; }
  catch (e: any) { return wrapError(ErrorCode.EDITOR_NOT_REACHABLE, e); }
}
export async function handleEditorToggleSnap(): Promise<ToolResult> {
  try { await sendEditorCommand('toggle_snap'); return { content: [{ type: 'text', text: 'Snap toggled.' }] }; }
  catch (e: any) { return wrapError(ErrorCode.EDITOR_NOT_REACHABLE, e); }
}

// Autoload via Editor
export async function handleEditorGetAutoloadList(): Promise<ToolResult> {
  try { const r = await sendEditorCommand('get_autoload_list'); const lines = [`Autoloads (${r.count}):`]; for (const a of r.autoloads||[]) lines.push(`  ${a.name} → ${a.path}`); return { content: [{ type: 'text', text: lines.join('\n') }] }; }
  catch (e: any) { return wrapError(ErrorCode.EDITOR_NOT_REACHABLE, e); }
}
export async function handleEditorAddAutoload(args: { name: string; path: string }): Promise<ToolResult> {
  try { await sendEditorCommand('add_autoload', args); return { content: [{ type: 'text', text: `Autoload added: ${args.name} → ${args.path}` }] }; }
  catch (e: any) { return wrapError(ErrorCode.EDITOR_NOT_REACHABLE, e); }
}
export async function handleEditorRemoveAutoload(args: { name: string }): Promise<ToolResult> {
  try { await sendEditorCommand('remove_autoload', args); return { content: [{ type: 'text', text: `Autoload removed: ${args.name}` }] }; }
  catch (e: any) { return wrapError(ErrorCode.EDITOR_NOT_REACHABLE, e); }
}

// Input Map via Editor
export async function handleEditorGetInputMap(): Promise<ToolResult> {
  try { const r = await sendEditorCommand('get_input_map'); const lines = [`Input Map (${r.count} actions):`]; for (const a of r.actions||[]) { lines.push(`  ${a.name} (deadzone=${a.deadzone})`); for (const e of a.events||[]) lines.push(`    ${e}`); } return { content: [{ type: 'text', text: lines.join('\n') }] }; }
  catch (e: any) { return wrapError(ErrorCode.EDITOR_NOT_REACHABLE, e); }
}
export async function handleEditorAddInputAction(args: { name: string; deadzone?: number }): Promise<ToolResult> {
  try { await sendEditorCommand('add_input_action', args); return { content: [{ type: 'text', text: `Input action added: ${args.name}` }] }; }
  catch (e: any) { return wrapError(ErrorCode.EDITOR_NOT_REACHABLE, e); }
}
export async function handleEditorRemoveInputAction(args: { name: string }): Promise<ToolResult> {
  try { await sendEditorCommand('remove_input_action', args); return { content: [{ type: 'text', text: `Input action removed: ${args.name}` }] }; }
  catch (e: any) { return wrapError(ErrorCode.EDITOR_NOT_REACHABLE, e); }
}

// Errors
export async function handleEditorGetErrorList(): Promise<ToolResult> {
  try { const r = await sendEditorCommand('get_error_list'); return { content: [{ type: 'text', text: `Errors (${r.count}):\n${(r.output||[]).join('\n')}` }] }; }
  catch (e: any) { return wrapError(ErrorCode.EDITOR_NOT_REACHABLE, e); }
}
export async function handleEditorClearErrors(): Promise<ToolResult> {
  try { await sendEditorCommand('clear_errors'); return { content: [{ type: 'text', text: 'Error list cleared.' }] }; }
  catch (e: any) { return wrapError(ErrorCode.EDITOR_NOT_REACHABLE, e); }
}

// Build/Bake
export async function handleEditorReimportAsset(args: { path: string }): Promise<ToolResult> {
  try { await sendEditorCommand('reimport_asset', args); return { content: [{ type: 'text', text: `Reimporting: ${args.path}` }] }; }
  catch (e: any) { return wrapError(ErrorCode.EDITOR_NOT_REACHABLE, e); }
}
export async function handleEditorBakeLightmaps(): Promise<ToolResult> {
  try { const r = await sendEditorCommand('bake_lightmaps'); return { content: [{ type: 'text', text: r.message || 'Baking lightmaps...' }] }; }
  catch (e: any) { return wrapError(ErrorCode.EDITOR_NOT_REACHABLE, e); }
}
export async function handleEditorBakeNavigation(): Promise<ToolResult> {
  try { await sendEditorCommand('bake_navigation'); return { content: [{ type: 'text', text: 'Navigation meshes baked.' }] }; }
  catch (e: any) { return wrapError(ErrorCode.EDITOR_NOT_REACHABLE, e); }
}

// Runtime Inspection
export async function handleEditorGetRunningSceneTree(): Promise<ToolResult> {
  try { const r = await sendEditorCommand('get_running_scene_tree'); if (r.error) return plainError(r.error); return { content: [{ type: 'text', text: JSON.stringify(r, null, 2) }] }; }
  catch (e: any) { return wrapError(ErrorCode.EDITOR_NOT_REACHABLE, e); }
}
export async function handleEditorGetPerformanceMonitors(): Promise<ToolResult> {
  try { const r = await sendEditorCommand('get_performance_monitors'); return { content: [{ type: 'text', text: `FPS: ${r.fps}\n${JSON.stringify(r.monitors, null, 2)}` }] }; }
  catch (e: any) { return wrapError(ErrorCode.EDITOR_NOT_REACHABLE, e); }
}
export async function handleEditorGetDependencyList(args: { path: string }): Promise<ToolResult> {
  try { const r = await sendEditorCommand('get_dependency_list', args); return { content: [{ type: 'text', text: `Dependencies (${r.count}):\n${(r.dependencies||[]).join('\n')}` }] }; }
  catch (e: any) { return wrapError(ErrorCode.EDITOR_NOT_REACHABLE, e); }
}

// ---- Clipboard & Playback (plugin commands already implemented) ----

export const editorCutSchema = {};
export const editorCopySchema = {};
export const editorPasteSchema = { parent: z.string().optional().default('.').describe('Parent node path for paste target (defaults to selected node or scene root)') };
export const editorPauseSchema = {};
export const editorUnpauseSchema = {};

export async function handleEditorCut(): Promise<ToolResult> {
  try { const r = await sendEditorCommand('cut_selected'); return { content: [{ type: 'text', text: r.error ? r.error : `Cut ${r.cut ?? 0} node(s) to editor clipboard.` }], isError: !!r.error }; }
  catch (e: any) { return wrapError(ErrorCode.EDITOR_NOT_REACHABLE, e); }
}
export async function handleEditorCopy(): Promise<ToolResult> {
  try { const r = await sendEditorCommand('copy_selected'); return { content: [{ type: 'text', text: r.error ? r.error : `Copied ${r.copied ?? 0} node(s) to editor clipboard.` }], isError: !!r.error }; }
  catch (e: any) { return wrapError(ErrorCode.EDITOR_NOT_REACHABLE, e); }
}
export async function handleEditorPaste(args: { parent?: string }): Promise<ToolResult> {
  try { const r = await sendEditorCommand('paste', args.parent && args.parent !== '.' ? { parent: args.parent } : {}); return { content: [{ type: 'text', text: r.error ? r.error : `Pasted ${r.pasted ?? 0} node(s).` }], isError: !!r.error }; }
  catch (e: any) { return wrapError(ErrorCode.EDITOR_NOT_REACHABLE, e); }
}
export async function handleEditorPause(): Promise<ToolResult> {
  try { const r = await sendEditorCommand('pause_project'); return { content: [{ type: 'text', text: r.error ? r.error : (r.message || 'Editor scene tree paused.') }], isError: !!r.error }; }
  catch (e: any) { return wrapError(ErrorCode.EDITOR_NOT_REACHABLE, e); }
}
export async function handleEditorUnpause(): Promise<ToolResult> {
  try { const r = await sendEditorCommand('unpause_project'); return { content: [{ type: 'text', text: r.error ? r.error : (r.message || 'Editor scene tree resumed.') }], isError: !!r.error }; }
  catch (e: any) { return wrapError(ErrorCode.EDITOR_NOT_REACHABLE, e); }
}

// ---- Node property setters (reuse editor set_node_properties) ----

const nodePropSetterSchema = {
  node_path: z.string().describe('Node path in the currently open scene'),
  param: z.string().describe('Property key to set (e.g. "mass", "energy", "visible")'),
  value: z.string().describe('Property value as GDScript literal (e.g. "40.0", "true", "Color(1,0,0,1)")'),
};

function makeNodePropSetter(): (args: { node_path: string; param: string; value: string }) => Promise<ToolResult> {
  return async (args) => {
    try {
      await sendEditorCommand('set_node_properties', { path: args.node_path, properties: { [args.param]: args.value } });
      return { content: [{ type: 'text', text: `Set ${args.node_path}.${args.param} = ${args.value}` }] };
    } catch (e: any) { return wrapError(ErrorCode.EDITOR_NOT_REACHABLE, e); }
  };
}

export const editorSetCharacterBodyParamSchema = nodePropSetterSchema;
export const handleEditorSetCharacterBodyParam = makeNodePropSetter();
export const editorSetAnimatedSpriteParamSchema = nodePropSetterSchema;
export const handleEditorSetAnimatedSpriteParam = makeNodePropSetter();
export const editorSetAudioPlayerParamSchema = nodePropSetterSchema;
export const handleEditorSetAudioPlayerParam = makeNodePropSetter();
export const editorSetVideoPlayerParamSchema = nodePropSetterSchema;
export const handleEditorSetVideoPlayerParam = makeNodePropSetter();
export const editorSetParallaxParamSchema = nodePropSetterSchema;
export const handleEditorSetParallaxParam = makeNodePropSetter();
export const editorSetRichTextParamSchema = nodePropSetterSchema;
export const handleEditorSetRichTextParam = makeNodePropSetter();
export const editorSetContainerParamSchema = nodePropSetterSchema;
export const handleEditorSetContainerParam = makeNodePropSetter();
export const editorSetTabContainerParamSchema = nodePropSetterSchema;
export const handleEditorSetTabContainerParam = makeNodePropSetter();
export const editorSetCameraParamSchema = nodePropSetterSchema;
export const handleEditorSetCameraParam = makeNodePropSetter();
export const editorSetParticlesParamSchema = nodePropSetterSchema;
export const handleEditorSetParticlesParam = makeNodePropSetter();
export const editorSetViewportParamSchema = nodePropSetterSchema;
export const handleEditorSetViewportParam = makeNodePropSetter();
export const editorSetAreaParamSchema = nodePropSetterSchema;
export const handleEditorSetAreaParam = makeNodePropSetter();
export const editorSetDecalParamSchema = nodePropSetterSchema;
export const handleEditorSetDecalParam = makeNodePropSetter();
export const editorSetOccluderParamSchema = nodePropSetterSchema;
export const handleEditorSetOccluderParam = makeNodePropSetter();
export const editorSetMarkerParamSchema = nodePropSetterSchema;
export const handleEditorSetMarkerParam = makeNodePropSetter();
export const editorSetSoftBodyParamSchema = nodePropSetterSchema;
export const handleEditorSetSoftBodyParam = makeNodePropSetter();
export const editorSetAudioListenerParamSchema = nodePropSetterSchema;
export const handleEditorSetAudioListenerParam = makeNodePropSetter();
export const editorSetMultiplayerSpawnerParamSchema = nodePropSetterSchema;
export const handleEditorSetMultiplayerSpawnerParam = makeNodePropSetter();
export const editorSetMultiplayerSynchronizerParamSchema = nodePropSetterSchema;
export const handleEditorSetMultiplayerSynchronizerParam = makeNodePropSetter();

// ---- Typed node creators (reuse editor add_node) ----

const createTypedNodeSchema = {
  name: z.string().optional().describe('Node name (auto-generated if omitted)'),
  parent: z.string().optional().default('.').describe('Parent node path'),
  properties: z.record(z.string()).optional().describe('Properties to set on the new node'),
};

function makeTypedNodeCreator(type: string): (args: { name?: string; parent?: string; properties?: Record<string, string> }) => Promise<ToolResult> {
  return async (args) => {
    try {
      const r = await sendEditorCommand('add_node', { type, name: args.name, parent: args.parent || '.', properties: args.properties || {} });
      return { content: [{ type: 'text', text: `Created ${type}: ${r.name} at ${r.path}` }] };
    } catch (e: any) { return wrapError(ErrorCode.EDITOR_NOT_REACHABLE, e); }
  };
}

export const editorCreateCameraSchema = createTypedNodeSchema;
export const handleEditorCreateCamera = makeTypedNodeCreator('Camera3D');
export const editorCreateMeshInstanceSchema = createTypedNodeSchema;
export const handleEditorCreateMeshInstance = makeTypedNodeCreator('MeshInstance3D');
export const editorCreateMultiplayerSpawnerSchema = createTypedNodeSchema;
// NOTE: these are plain `Node` subclasses — there is no 2D/3D variant.
// See modules/multiplayer/register_types.cpp:49-50 (GDREGISTER_CLASS(MultiplayerSpawner)).
// They used to be created as "MultiplayerSpawner3D"/"MultiplayerSynchronizer3D",
// which are not real classes, so both tools failed 100% of the time.
export const handleEditorCreateMultiplayerSpawner = makeTypedNodeCreator('MultiplayerSpawner');
export const editorCreateMultiplayerSynchronizerSchema = createTypedNodeSchema;
export const handleEditorCreateMultiplayerSynchronizer = makeTypedNodeCreator('MultiplayerSynchronizer');
export const editorCreateCsgBoxSchema = createTypedNodeSchema;
export const handleEditorCreateCsgBox = makeTypedNodeCreator('CSGBox3D');
export const editorCreateCsgSphereSchema = createTypedNodeSchema;
export const handleEditorCreateCsgSphere = makeTypedNodeCreator('CSGSphere3D');
export const editorCreateCsgCylinderSchema = createTypedNodeSchema;
export const handleEditorCreateCsgCylinder = makeTypedNodeCreator('CSGCylinder3D');
export const editorCreateCsgMergeSchema = createTypedNodeSchema;
export const handleEditorCreateCsgMerge = makeTypedNodeCreator('CSGCombiner3D');
export const editorCreateCsgPolygonSchema = createTypedNodeSchema;
export const handleEditorCreateCsgPolygon = makeTypedNodeCreator('CSGPolygon3D');
export const editorCreateGpuParticlesSchema = createTypedNodeSchema;
export const handleEditorCreateGpuParticles = makeTypedNodeCreator('GPUParticles3D');

// ============================================================
// Editor Interface coverage (APIs the bridge previously skipped)
// Verified against editor/editor_interface.cpp _bind_methods().
// ============================================================

// ---- Scene lifecycle ----

export const editorSaveSceneAsSchema = {
  path: z.string().describe('Destination scene path, must start with res:// (e.g. res://levels/level2.tscn)'),
  with_preview: z.boolean().optional().default(true).describe('Generate a thumbnail preview for the FileSystem dock'),
};

export async function handleEditorSaveSceneAs(args: { path: string; with_preview?: boolean }): Promise<ToolResult> {
  try {
    const r = await sendEditorCommand('save_scene_as', { path: args.path, with_preview: args.with_preview ?? true });
    if (r.error) return plainError(r.error);
    return { content: [{ type: 'text', text: `Scene saved as: ${r.path}` }] };
  } catch (err: any) { return wrapError(ErrorCode.EDITOR_NOT_REACHABLE, err); }
}

export const editorCloseSceneSchema = {};

export async function handleEditorCloseScene(): Promise<ToolResult> {
  try {
    const r = await sendEditorCommand('close_scene');
    if (r.error) return plainError(r.error);
    if (!r.closed) return { content: [{ type: 'text', text: r.message || 'Scene not closed.' }] };
    return { content: [{ type: 'text', text: `Closed scene: ${r.scene || '(unsaved)'}` }] };
  } catch (err: any) { return wrapError(ErrorCode.EDITOR_NOT_REACHABLE, err); }
}

export const editorGetOpenScenesSchema = {};

export async function handleEditorGetOpenScenes(): Promise<ToolResult> {
  try {
    const [open, unsaved] = await Promise.all([
      sendEditorCommand('get_open_scenes'),
      sendEditorCommand('get_unsaved_scenes').catch(() => ({ scenes: null })),
    ]);
    const scenes: string[] = open.scenes || [];
    if (scenes.length === 0) return { content: [{ type: 'text', text: 'No scenes open in the editor.' }] };
    const dirty = new Set<string>(Array.isArray(unsaved.scenes) ? unsaved.scenes : []);
    const lines = [`${scenes.length} open scene(s):`];
    for (const s of scenes) lines.push(`  ${dirty.has(s) ? '*' : ' '} ${s}`);
    if (dirty.size > 0) lines.push('', '(* = unsaved changes)');
    return { content: [{ type: 'text', text: lines.join('\n') }] };
  } catch (err: any) { return wrapError(ErrorCode.EDITOR_NOT_REACHABLE, err); }
}

export const editorGetUnsavedScenesSchema = {};

export async function handleEditorGetUnsavedScenes(): Promise<ToolResult> {
  try {
    const r = await sendEditorCommand('get_unsaved_scenes');
    if (r.error) return plainError(r.error);
    const scenes: string[] = r.scenes || [];
    if (scenes.length === 0) return { content: [{ type: 'text', text: 'No unsaved scenes - everything is committed to disk.' }] };
    return { content: [{ type: 'text', text: `${scenes.length} scene(s) with unsaved changes:\n${scenes.map(s => `  ${s}`).join('\n')}` }] };
  } catch (err: any) { return wrapError(ErrorCode.EDITOR_NOT_REACHABLE, err); }
}

export const editorMarkSceneUnsavedSchema = {};

export async function handleEditorMarkSceneUnsaved(): Promise<ToolResult> {
  try {
    const r = await sendEditorCommand('mark_scene_unsaved');
    if (r.error) return plainError(r.error);
    return { content: [{ type: 'text', text: 'Current scene marked as unsaved (editor will prompt to save).' }] };
  } catch (err: any) { return wrapError(ErrorCode.EDITOR_NOT_REACHABLE, err); }
}

// ---- Playback ----

export const editorPlayCurrentSceneSchema = {};

export async function handleEditorPlayCurrentScene(): Promise<ToolResult> {
  try {
    const r = await sendEditorCommand('play_current_scene');
    if (r.error) return plainError(r.error);
    return { content: [{ type: 'text', text: `Playing current scene: ${r.scene}` }] };
  } catch (err: any) { return wrapError(ErrorCode.EDITOR_NOT_REACHABLE, err); }
}

export const editorGetPlayingSceneSchema = {};

export async function handleEditorGetPlayingScene(): Promise<ToolResult> {
  try {
    const r = await sendEditorCommand('get_playing_scene');
    if (!r.playing) return { content: [{ type: 'text', text: 'No scene is currently playing.' }] };
    return { content: [{ type: 'text', text: `Playing: ${r.scene || '(main scene)'}` }] };
  } catch (err: any) { return wrapError(ErrorCode.EDITOR_NOT_REACHABLE, err); }
}

// ---- FileSystem dock / script editor ----

export const editorGetFilesystemSelectionSchema = {};

export async function handleEditorGetFilesystemSelection(): Promise<ToolResult> {
  try {
    const r = await sendEditorCommand('get_filesystem_selection');
    const sel: string[] = r.selected_paths || [];
    const lines = [
      `Current directory: ${r.current_directory || '(none)'}`,
      `Current path:      ${r.current_path || '(none)'}`,
      `Selected:          ${sel.length} path(s)`,
    ];
    for (const p of sel) lines.push(`  ${p}`);
    return { content: [{ type: 'text', text: lines.join('\n') }] };
  } catch (err: any) { return wrapError(ErrorCode.EDITOR_NOT_REACHABLE, err); }
}

export const editorOpenScriptAtLineSchema = {
  path: z.string().describe('Script path, e.g. res://player.gd'),
  line: z.number().optional().default(1).describe('Line to jump to (1-based)'),
  column: z.number().optional().default(0).describe('Column to place the caret at'),
  grab_focus: z.boolean().optional().default(true).describe('Focus the script editor after opening'),
};

export async function handleEditorOpenScriptAtLine(args: { path: string; line?: number; column?: number; grab_focus?: boolean }): Promise<ToolResult> {
  try {
    const r = await sendEditorCommand('open_script_at_line', {
      path: args.path, line: args.line ?? 1, column: args.column ?? 0, grab_focus: args.grab_focus ?? true,
    });
    if (r.error) return plainError(r.error);
    return { content: [{ type: 'text', text: `Opened ${r.path} at line ${r.line}` }] };
  } catch (err: any) { return wrapError(ErrorCode.EDITOR_NOT_REACHABLE, err); }
}

// ---- Editor UI / environment ----

export const editorShowToastSchema = {
  message: z.string().describe('Toast text to display in the editor'),
  severity: z.enum(['info', 'warning', 'error']).optional().default('info').describe('Toast severity/color'),
  tooltip: z.string().optional().describe('Optional tooltip shown on hover'),
};

export async function handleEditorShowToast(args: { message: string; severity?: string; tooltip?: string }): Promise<ToolResult> {
  try {
    const r = await sendEditorCommand('show_toast', { message: args.message, severity: args.severity || 'info', tooltip: args.tooltip || '' });
    if (r.error) return plainError(r.error);
    return { content: [{ type: 'text', text: `Toast shown (${r.severity}): ${args.message}` }] };
  } catch (err: any) { return wrapError(ErrorCode.EDITOR_NOT_REACHABLE, err); }
}

export const editorSetDistractionFreeSchema = {
  enabled: z.boolean().optional().describe('Turn distraction-free mode on/off. Omit to just read the current state.'),
};

export async function handleEditorSetDistractionFree(args: { enabled?: boolean }): Promise<ToolResult> {
  try {
    const r = await sendEditorCommand('set_distraction_free', args.enabled === undefined ? {} : { enabled: args.enabled });
    if (r.error) return plainError(r.error);
    return { content: [{ type: 'text', text: `Distraction-free mode: ${r.enabled ? 'on' : 'off'}` }] };
  } catch (err: any) { return wrapError(ErrorCode.EDITOR_NOT_REACHABLE, err); }
}

export const editorSetMovieMakerSchema = {
  enabled: z.boolean().optional().describe('Enable Movie Maker mode so the next play session records to a video file. Omit to read the current state.'),
};

export async function handleEditorSetMovieMaker(args: { enabled?: boolean }): Promise<ToolResult> {
  try {
    const r = await sendEditorCommand('set_movie_maker', args.enabled === undefined ? {} : { enabled: args.enabled });
    if (r.error) return plainError(r.error);
    const hint = r.enabled
      ? '\nSet application/run/movie_writer/movie_file in project.godot (plus mjpeg_quality / fps) to control the output.'
      : '';
    return { content: [{ type: 'text', text: `Movie Maker mode: ${r.enabled ? 'on' : 'off'}${hint}` }] };
  } catch (err: any) { return wrapError(ErrorCode.EDITOR_NOT_REACHABLE, err); }
}

export const editorGet3dSnapSchema = {};

export async function handleEditorGet3dSnap(): Promise<ToolResult> {
  try {
    const r = await sendEditorCommand('get_3d_snap');
    const lines = [
      `3D snap: ${r.snap_enabled ? 'enabled' : 'disabled'}`,
      `  translate: ${r.translate_snap}`,
      `  rotate:    ${r.rotate_snap}`,
      `  scale:     ${r.scale_snap}`,
    ];
    return { content: [{ type: 'text', text: lines.join('\n') }] };
  } catch (err: any) { return wrapError(ErrorCode.EDITOR_NOT_REACHABLE, err); }
}

export const editorGetPathsSchema = {};

export async function handleEditorGetPaths(): Promise<ToolResult> {
  try {
    const r = await sendEditorCommand('get_editor_paths');
    const lines = [
      'Editor paths:',
      `  data:              ${r.data_dir || '?'}`,
      `  config:            ${r.config_dir || '?'}`,
      `  cache:             ${r.cache_dir || '?'}`,
      `  project settings:  ${r.project_settings_dir || '?'}`,
      `  self-contained:    ${r.self_contained ? 'yes' : 'no'}`,
      '',
      `  editor scale:      ${r.editor_scale}`,
      `  editor language:   ${r.editor_language}`,
      `  multi-window:      ${r.multi_window ? 'yes' : 'no'}`,
    ];
    return { content: [{ type: 'text', text: lines.join('\n') }] };
  } catch (err: any) { return wrapError(ErrorCode.EDITOR_NOT_REACHABLE, err); }
}

export const editorRestartSchema = {
  confirm: z.boolean().describe('Must be true - restarting closes the editor and drops the MCP bridge connection.'),
  save: z.boolean().optional().default(true).describe('Save all open scenes before restarting'),
};

export async function handleEditorRestart(args: { confirm: boolean; save?: boolean }): Promise<ToolResult> {
  try {
    const r = await sendEditorCommand('restart_editor', { confirm: args.confirm, save: args.save ?? true });
    if (r.error) return plainError(r.error);
    return { content: [{ type: 'text', text: `Editor restarting (saved: ${r.saved ? 'yes' : 'no'}). The bridge will be unreachable until it comes back up.` }] };
  } catch {
    // A restart tears down the socket mid-flight; that is expected, not a failure.
    return { content: [{ type: 'text', text: 'Editor restart requested - the bridge connection dropped as expected. Reconnect once the editor is back.' }] };
  }
}

// ---- Playback / selection convenience ----

export const editorIsPlayingSchema = {};

export async function handleEditorIsPlaying(): Promise<ToolResult> {
  try {
    const r = await sendEditorCommand('is_playing');
    if (r.error) return plainError(r.error);
    const playing = r.playing ? 'yes' : 'no';
    const scene = r.scene ? String(r.scene) : '(none)';
    return { content: [{ type: 'text', text: `Playing: ${playing}\nScene: ${scene}` }] };
  } catch (err: any) { return wrapError(ErrorCode.EDITOR_NOT_REACHABLE, err); }
}

export const editorSelectNodeSchema = {
  node_path: z.string().describe('Node path to select (e.g. "Player" or "World/Enemies/Boss")'),
  property: z.string().optional().describe('Optional property to set on the node after selecting (GDScript literal)'),
  value: z.string().optional().describe('Value for the optional property'),
};

export async function handleEditorSelectNode(args: { node_path: string; property?: string; value?: string }): Promise<ToolResult> {
  try {
    const params: any = { node_path: args.node_path };
    if (args.property) params.property = args.property;
    if (args.value) params.value = args.value;
    const r = await sendEditorCommand('select_node', params);
    if (r.error) return plainError(r.error);
    const msg = args.property
      ? `Selected "${args.node_path}" + set ${args.property}=${args.value}`
      : `Selected: ${args.node_path}`;
    return { content: [{ type: 'text', text: msg }] };
  } catch (err: any) { return wrapError(ErrorCode.EDITOR_NOT_REACHABLE, err); }
}
