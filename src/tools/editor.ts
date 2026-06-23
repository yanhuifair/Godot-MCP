// ============================================================
// Godot MCP Server — Live Editor Bridge v1.0
// ============================================================

import { z } from 'zod';
import net from 'node:net';
import { ToolResult } from '../utils/types.js';
import { ErrorCode, toolError, wrapError } from '../utils/errors.js';

const DEFAULT_EDITOR_PORT = 9876;
const CONNECTION_TIMEOUT = 5000;

let _lastHealthCheck = 0;
let _lastHealthStatus = false;

// ---- Connection ----

export function sendEditorCommand(method: string, params: Record<string, any> = {}): Promise<any> {
  return new Promise((resolve, reject) => {
    const client = new net.Socket();
    const request = JSON.stringify({ jsonrpc: '2.0', id: Date.now(), method, params });

    let data = '';
    let settled = false;
    let timeout: NodeJS.Timeout;

    const finish = (err: Error | null, result?: any) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      client.destroy();
      if (err) reject(err);
      else resolve(result);
    };

    client.connect(DEFAULT_EDITOR_PORT, '127.0.0.1', () => {
      client.write(request);
    });

    client.on('data', (chunk: Buffer) => {
      data += chunk.toString();
      _lastHealthCheck = Date.now();
      _lastHealthStatus = true;
      try {
        const response = JSON.parse(data);
        if (response.error) {
          finish(new Error(response.error.message || 'Editor error'));
        } else {
          finish(null, response.result);
        }
      } catch {
        finish(new Error('Invalid response from editor'));
      }
    });

    client.on('error', (err: Error) => {
      _lastHealthStatus = false;
      finish(new Error(`Editor not reachable on port ${DEFAULT_EDITOR_PORT}. Ensure Godot is open with the Godot MCP plugin enabled (Project Settings → Plugins).`));
    });

    timeout = setTimeout(() => {
      _lastHealthStatus = false;
      finish(new Error('Editor connection timed out'));
    }, CONNECTION_TIMEOUT);
  });
}

/** Check if editor is currently reachable */
export function isEditorHealthy(): boolean {
  if (Date.now() - _lastHealthCheck < 30000) return _lastHealthStatus;
  return false;
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
  try { await sendEditorCommand('undo'); return { content: [{ type: 'text', text: 'Undo.' }] }; }
  catch (err: any) { return wrapError(ErrorCode.EDITOR_NOT_REACHABLE, err); }
}

export async function handleEditorRedo(): Promise<ToolResult> {
  try { await sendEditorCommand('redo'); return { content: [{ type: 'text', text: 'Redo.' }] }; }
  catch (err: any) { return wrapError(ErrorCode.EDITOR_NOT_REACHABLE, err); }
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
    if (r.error) return { content: [{ type: 'text', text: r.error }], isError: true };
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
    const [version, playing, scene, selection] = await Promise.all([
      sendEditorCommand('get_editor_version').catch(() => ({ version: {} })),
      sendEditorCommand('is_playing').catch(() => ({ playing: false })),
      sendEditorCommand('get_open_scene').catch(() => ({ scene: null })),
      sendEditorCommand('get_selection').catch(() => ({ selection: [] })),
    ]);
    const lines = [
      `Godot Editor:`,
      `  Version: ${version.version?.major || '?'}.${version.version?.minor || '?'}`,
      `  Playing: ${playing.playing ? 'yes' : 'no'}`,
      `  Scene: ${scene.scene || 'none'}`,
      `  Selected: ${selection.selection?.length || 0} node(s)`,
    ];
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
    return { content: [{ type: 'text', text: `Node added: ${r.name} (${r.type}) at ${r.path}` }] };
  } catch (err: any) { return wrapError(ErrorCode.EDITOR_NOT_REACHABLE, err); }
}

export async function handleEditorRemoveNode(args: { path: string }): Promise<ToolResult> {
  try {
    await sendEditorCommand('remove_node', { path: args.path });
    return { content: [{ type: 'text', text: `Node removed: ${args.path}` }] };
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
    await sendEditorCommand('set_node_properties', { path: args.path, properties: args.properties });
    return { content: [{ type: 'text', text: `Properties updated on ${args.path} (${Object.keys(args.properties).length} changes)` }] };
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
    if (r.error) return { content: [{ type: 'text', text: r.error }], isError: true };
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
    return { content: [{ type: 'text', text: 'Editor is NOT reachable.' + '\n' + err.message }], isError: true };
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
  try { const r = await sendEditorCommand('get_scene_changes'); return { content: [{ type: 'text', text: `Scene: ${r.scene || 'none'} | Modified: ${r.modified}` }] }; }
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
  try { const r = await sendEditorCommand('get_running_scene_tree'); if (r.error) return { content: [{ type: 'text', text: r.error }], isError: true }; return { content: [{ type: 'text', text: JSON.stringify(r, null, 2) }] }; }
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
