// Copyright (c) 2026 FairYan
// SPDX-License-Identifier: AGPL-3.0-or-later
// ============================================================
// Regression tests: Godot-side command failures must surface as
// errors instead of being reported as success.
// ============================================================

import { describe, it, expect } from 'vitest';
import {
  ErrorCode,
  wrapError,
  editorCommandError,
  isEditorCommandFailure,
} from '../src/utils/errors.js';

function textOf(result: { content: Array<{ type: string; text: string }> }): string {
  return result.content.map((c) => c.text).join('\n');
}

describe('editor command failure surfacing', () => {
  it('editorCommandError is tagged and keeps the engine message', () => {
    const err = editorCommandError('remove_node', 'Node not found: Foo');
    expect(isEditorCommandFailure(err)).toBe(true);
    expect(err.message).toContain('remove_node failed');
    expect(err.message).toContain('Node not found: Foo');
  });

  it('plain errors are not mistaken for command failures', () => {
    expect(isEditorCommandFailure(new Error('TCP request timed out'))).toBe(false);
    expect(isEditorCommandFailure(null)).toBe(false);
    expect(isEditorCommandFailure('boom')).toBe(false);
  });

  it('wrapError rewrites EDITOR_NOT_REACHABLE to EDITOR_COMMAND_FAILED for engine errors', () => {
    const result = wrapError(
      ErrorCode.EDITOR_NOT_REACHABLE,
      editorCommandError('reparent_node', 'Cannot reparent a node into itself or one of its descendants')
    );
    const text = textOf(result as any);
    expect(text).toContain(ErrorCode.EDITOR_COMMAND_FAILED);
    expect(text).not.toContain(ErrorCode.EDITOR_NOT_REACHABLE);
    expect(text).toContain('descendants');
  });

  it('wrapError keeps the caller code for genuine transport failures', () => {
    const result = wrapError(ErrorCode.EDITOR_NOT_REACHABLE, new Error('Connection lost'));
    expect(textOf(result as any)).toContain(ErrorCode.EDITOR_NOT_REACHABLE);
  });

  it('EDITOR_COMMAND_FAILED ships actionable solutions', () => {
    const result = wrapError(
      ErrorCode.EDITOR_NOT_REACHABLE,
      editorCommandError('set_node_properties', 'No scene open')
    );
    const text = textOf(result as any);
    expect(text).toContain('Possible solutions');
    expect(text).toContain('editor_get_node_properties');
  });
});

describe('addon undo/redo coverage', () => {
  it('every scene-mutating command wraps its change in an UndoRedo action', async () => {
    const fs = await import('node:fs');
    const src = fs.readFileSync('addons/godot-mcp/plugin.gd', 'utf8');

    // 这些命令会改变场景树/节点状态，必须可以在编辑器里 Ctrl+Z 撤销。
    const mutating = [
      '_cmd_add_node',
      '_cmd_remove_node',
      '_cmd_set_node_properties',
      '_cmd_rename_node',
      '_cmd_duplicate_node',
      '_cmd_reparent_node',
      '_cmd_move_node',
      '_cmd_move_node_3d',
      '_cmd_delete_selected',
      '_cmd_instantiate_scene',
      '_cmd_cut_selected',
      '_cmd_paste',
    ];

    for (const fn of mutating) {
      const start = src.indexOf(`func ${fn}(`);
      expect(start, `${fn} should exist in plugin.gd`).toBeGreaterThan(-1);
      // 函数体 = 到下一个顶层 func 为止
      const nextFn = src.indexOf('\nfunc ', start + 1);
      const body = src.slice(start, nextFn === -1 ? src.length : nextFn);
      expect(body, `${fn} must create an undo action`).toContain('create_action(');
      expect(body, `${fn} must commit its undo action`).toContain('commit_action()');
    }
  });

  it('no scene mutation relies on queue_free (deferred delete races save_scene)', async () => {
    const fs = await import('node:fs');
    const src = fs.readFileSync('addons/godot-mcp/plugin.gd', 'utf8');
    for (const fn of ['_cmd_remove_node', '_cmd_delete_selected']) {
      const start = src.indexOf(`func ${fn}(`);
      const nextFn = src.indexOf('\nfunc ', start + 1);
      const body = src
        .slice(start, nextFn === -1 ? src.length : nextFn)
        .split('\n')
        .filter((l) => !l.trim().startsWith('#'))
        .join('\n');
      expect(body, `${fn} must not use queue_free`).not.toContain('queue_free');
    }
  });

  it('does not call unbound EditorUndoRedoManager methods', async () => {
    const fs = await import('node:fs');
    const src = fs.readFileSync('addons/godot-mcp/plugin.gd', 'utf8');
    // EditorUndoRedoManager 没有绑定 undo()/redo()/get_current_action_name()，
    // 必须通过 get_history_undo_redo() 拿到真正的 UndoRedo 对象。
    expect(src).toContain('get_history_undo_redo(');
    expect(src).not.toMatch(/get_undo_redo\(\)\.get_current_action_name\(/);
    expect(src).not.toMatch(/get_editor_undo_redo\(\)\.undo\(\)/);
    expect(src).not.toMatch(/get_editor_undo_redo\(\)\.redo\(\)/);
  });
});
