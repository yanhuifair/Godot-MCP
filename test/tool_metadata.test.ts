// Copyright (c) 2026 FairYan
// SPDX-License-Identifier: AGPL-3.0-or-later
// ============================================================
// Tool metadata tests — the "editing experience" layer.
//
// v1.12.13 adds two things clients rely on:
//   1. MCP `annotations` on every tool (readOnlyHint / destructiveHint /
//      idempotentHint / openWorldHint) + a human title. Without them every
//      client treats all 386 tools as potentially destructive.
//   2. Self-healing VALIDATION_ERROR messages: Zod silently DROPS unknown
//      keys, so `add_node({path: ...})` used to surface only
//      "scene_path: Required" with no hint that `path` was ignored.
// ============================================================

import { describe, it, expect } from 'vitest';
import { z } from 'zod';
import { toolAnnotations, describeArgumentError, normalizeParameterNames, resolveToolArguments } from '../src/server.js';
import { ToolRegistry, WRITE_TOOLS, isWriteTool, setActiveRegistry } from '../src/utils/registry.js';
import { registerAllTools } from '../src/tools/register.js';
import { handleSearchTools } from '../src/tools/meta.js';

describe('tool annotations', () => {
  it('marks read-only tools and leaves writes as not read-only', () => {
    expect(toolAnnotations('list_project_files').readOnlyHint).toBe(true);
    expect(toolAnnotations('read_scene').readOnlyHint).toBe(true);
    expect(toolAnnotations('add_node').readOnlyHint).toBe(false);
    expect(toolAnnotations('attach_script').readOnlyHint).toBe(false);
  });

  it('flags destructive operations and not additive ones', () => {
    expect(toolAnnotations('delete_file').destructiveHint).toBe(true);
    expect(toolAnnotations('editor_remove_node').destructiveHint).toBe(true);
    expect(toolAnnotations('clear_game_logs').destructiveHint).toBe(true);
    expect(toolAnnotations('add_node').destructiveHint).toBe(false);
    expect(toolAnnotations('create_scene').destructiveHint).toBe(false);
  });

  it('treats reads and set_* as idempotent, but not add/create', () => {
    expect(toolAnnotations('get_status').idempotentHint).toBe(true);
    expect(toolAnnotations('set_node_scale').idempotentHint).toBe(true);
    expect(toolAnnotations('add_node').idempotentHint).toBe(false);
  });

  it('produces a human title with 2D/3D casing fixed', () => {
    expect(toolAnnotations('add_node').title).toBe('Add Node');
    expect(toolAnnotations('create_light_2d').title).toBe('Create Light 2D');
    expect(toolAnnotations('editor_get_3d_snap').title).toBe('Editor Get 3D Snap');
  });

  it('stays consistent with WRITE_TOOLS for every registered tool', () => {
    const registry = new ToolRegistry();
    registerAllTools(registry);
    const inconsistent = registry.list()
      .map((t) => t.name)
      .filter((n) => toolAnnotations(n).readOnlyHint !== !isWriteTool(n));
    expect(inconsistent).toEqual([]);
    // 且真的两类都有（防止 WRITE_TOOLS 意外清空导致全员"只读"）
    const names = registry.list().map((t) => t.name);
    expect(names.some((n) => WRITE_TOOLS.has(n))).toBe(true);
    expect(names.some((n) => !WRITE_TOOLS.has(n))).toBe(true);
  });
});

describe('describeArgumentError', () => {
  const schema = {
    scene_path: z.string(),
    parent_path: z.string().optional(),
    name: z.string(),
    type: z.string(),
  };
  const boom = (args: Record<string, unknown>): string => {
    try {
      z.object(schema).parse(args);
      throw new Error('should have failed');
    } catch (err) {
      return describeArgumentError('add_node', schema, args, err as z.ZodError);
    }
  };

  it('lists missing required params and the accepted signature', () => {
    const msg = boom({});
    expect(msg).toMatch(/Missing required: scene_path, name, type/);
    expect(msg).toMatch(/Accepted parameters: scene_path \(required\), parent_path\?, name \(required\), type \(required\)/);
  });

  it('names dropped unknown keys instead of failing silently', () => {
    const msg = boom({ path: 'main.tscn', node_type: 'Node2D', name: 'X' });
    expect(msg).toMatch(/"path" is not a parameter of this tool — did you mean "scene_path"\?/);
    expect(msg).toMatch(/"node_type" is not a parameter of this tool — did you mean "type"\?/);
  });

  it('suggests the token-subset rename (node_type -> type)', () => {
    const msg = boom({ node_type: 'Node2D', name: 'X', type: 'Node2D' });
    expect(msg).toMatch(/did you mean "type"\?/);
  });

  it('never invents a suggestion for a completely unrelated key', () => {
    const msg = boom({ qqzz: 1 });
    expect(msg).toMatch(/"qqzz" is not a parameter of this tool and was IGNORED\./);
  });
});

describe('search_tools shows the call signature', () => {
  it('prints required parameters and the category for each hit', () => {
    const registry = new ToolRegistry();
    registerAllTools(registry);
    // handleSearchTools 读的是全局注册表
    setActiveRegistry(registry);

    const res = handleSearchTools({ keyword: 'add_node', limit: 5 });
    const text = res.content[0].text;
    expect(text).toContain('add_node(scene_path, name, type');
    expect(text).toMatch(/\[.+\]/); // category in brackets
  });
});

describe('parameter normalization still accepts camelCase', () => {
  it('maps snake-ish camelCase onto the schema keys', () => {
    expect(normalizeParameterNames({ scenePath: 'a', nodeType: 'Node2D' }))
      .toEqual({ scene_path: 'a', node_type: 'Node2D' });
  });
});

describe('synonym parameter aliases', () => {
  const registry = (() => {
    const r = new ToolRegistry();
    registerAllTools(r);
    return r;
  })();
  const call = (toolName: string, args: Record<string, unknown>) => {
    const tool = registry.find(toolName);
    expect(tool, `tool ${toolName} must exist`).toBeTruthy();
    return resolveToolArguments(tool!, args);
  };

  it('accepts the generic `path` where the schema says scene_path', () => {
    const { args, error } = call('add_node', { path: 'main.tscn', node_type: 'Node2D', name: 'X' });
    expect(error).toBeUndefined();
    expect(args).toMatchObject({ scene_path: 'main.tscn', type: 'Node2D', name: 'X' });
  });

  it('accepts semantic names where the schema says `path` (create_scene)', () => {
    const { args, error } = call('create_scene', { scene_path: 'res://new.tscn', root_name: 'Main' });
    expect(error).toBeUndefined();
    expect(args).toMatchObject({ path: 'res://new.tscn', root_name: 'Main' });
  });

  it('accepts `name` for a tool whose schema calls it new_name (rename_node)', () => {
    const { args, error } = call('rename_node', {
      scene_path: 'main.tscn', node_path: 'A', name: 'B',
    });
    expect(error).toBeUndefined();
    expect(args).toMatchObject({ new_name: 'B' });
  });

  it('does NOT guess when a tool takes two different paths (attach_script)', () => {
    const { args } = call('attach_script', { path: 'main.tscn', node_path: 'A' });
    // `path` 到底是场景还是脚本说不清，别瞎映射
    expect(args).toMatchObject({ path: 'main.tscn' });
    expect(args.scene_path).toBeUndefined();
  });

  it('reports a conflict instead of silently picking one value', () => {
    const { error } = call('add_node', { scene_path: 'a.tscn', path: 'b.tscn', name: 'X', type: 'Node' });
    expect(error?.isError).toBe(true);
    expect(error!.content[0].text).toMatch(/Ambiguous arguments for "add_node"/);
    expect(error!.content[0].text).toMatch(/scene_path/);
  });

  it('drops a duplicate alias when both keys carry the same value', () => {
    const { args, error } = call('add_node', { scene_path: 'a.tscn', path: 'a.tscn', name: 'X', type: 'Node' });
    expect(error).toBeUndefined();
    expect(args).toMatchObject({ scene_path: 'a.tscn' });
    expect(args.path).toBeUndefined();
  });
});
