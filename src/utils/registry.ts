// Copyright (c) 2026 FairYan
// SPDX-License-Identifier: AGPL-3.0-or-later
// ============================================================
// Godot MCP Server - Tool Registry
// ============================================================
// Centralized tool registration system. Each tool file
// exports a `registerTools(registry)` function.

import { z, ZodTypeAny } from 'zod';
import { ToolResult } from './types.js';

export type ToolHandler = (projectRoot: string, args: any) => ToolResult | Promise<ToolResult>;

export interface ToolRegistration {
  name: string;
  description: string;
  schema: Record<string, ZodTypeAny>;
  handler: ToolHandler;
  readOnly?: boolean; // for future READ_ONLY_MODE support
}

/**
 * 已知的写/副作用工具名单（read-only 模式下被拒绝）。
 *
 * 判定规则：显式白名单制 —— 只在此名单中的工具会被 read-only 模式拦截，
 * 不在名单中的一律视为只读。这是有意为之：漏列一个写工具 = 安全失效，
 * 因此新增写类工具时**必须**同时加入此名单（有结构性测试兜底，见
 * test/structural.test.ts 的 write-tool 完整性断言）。
 *
 * 分类原则：
 *  - write_/create_/delete_/move_/edit_/add_/remove_/set_/rename_/duplicate_/update_/compile_ 等明显写操作；
 *  - launch_editor / run_project / export_project / stop_project 等进程控制（有副作用）；
 *  - editor_* 中改变编辑器/场景/项目状态的操作；
 *  - capture_screenshot 启动外部进程，一并拦截。
 */
export const WRITE_TOOLS: ReadonlySet<string> = new Set([
  // ---- Project ----
  'write_project_config', 'delete_file', 'move_file', 'add_autoload', 'remove_autoload',
  'duplicate_scene', 'duplicate_resource', 'create_directory', 'write_input_action',
  'remove_input_action', 'add_input_binding',
  // ---- Scene ----
  'create_scene', 'edit_scene', 'add_node', 'remove_node', 'modify_node', 'clone_node',
  'connect_signal', 'disconnect_signal', 'set_node_position', 'set_node_rotation',
  'set_node_scale', 'transform_node', 'rename_node', 'attach_script', 'set_collision_shape',
  'load_sprite',
  // ---- Script / Shader ----
  'write_script', 'create_script', 'create_shader', 'write_shader', 'compile_shader',
  'create_shader_include', 'add_script_function', 'add_script_signal', 'add_script_export',
  'create_visual_shader',
  // ---- Resource ----
  'create_resource', 'write_resource', 'set_material_param',
  // ---- Godot Engine（进程控制 / 副作用）----
  'launch_editor', 'run_project', 'export_project', 'capture_screenshot', 'stop_project',
  // ---- Editor ----
  'editor_set_selection', 'editor_play', 'editor_stop', 'editor_undo', 'editor_redo',
  'editor_save', 'editor_reload_scene', 'editor_add_node', 'editor_remove_node',
  'editor_set_node_properties', 'editor_rename_node', 'editor_duplicate_node',
  'editor_reparent_node', 'editor_move_node', 'editor_run_specific_scene', 'editor_run_gdscript',
  'editor_create_script', 'editor_attach_script', 'editor_set_breakpoint',
  'editor_remove_breakpoint', 'editor_save_all', 'editor_delete_selected', 'editor_create_scene',
  'editor_instantiate_scene', 'editor_set_main_scene', 'editor_debug_continue',
  'editor_debug_step', 'editor_debug_step_over', 'editor_debug_break',
  'editor_evaluate_expression', 'editor_set_editor_setting', 'editor_set_project_setting',
  'editor_connect_signal', 'editor_disconnect_signal', 'editor_simulate_key',
  'editor_enable_plugin', 'editor_disable_plugin', 'editor_create_folder', 'editor_delete_asset',
  'editor_rename_asset', 'editor_move_asset', 'editor_duplicate_asset', 'editor_set_camera',
  'editor_add_autoload', 'editor_remove_autoload', 'editor_add_input_action',
  'editor_remove_input_action', 'editor_reimport_asset', 'editor_bake_lightmaps',
  'editor_bake_navigation', 'editor_take_screenshot',
  // ---- Shader Graph ----
  'add_shader_graph_node', 'remove_shader_graph_node', 'connect_shader_graph_nodes',
  'disconnect_shader_graph_nodes', 'set_shader_node_param',
  // ---- Mesh / Physics / Animation / Audio / 其他资源创建与修改 ----
  'create_mesh_primitive', 'create_vehicle_body', 'set_light_2d_param', 'create_spring_arm',
  'create_camera_attributes', 'create_sprite_frames', 'create_grid_map', 'create_animation',
  'set_animation_param', 'add_animation_library', 'add_animation_track', 'set_keyframe',
  'remove_animation_track', 'set_animation_tree_param', 'write_import_config',
  'create_environment', 'set_environment_param', 'create_audio_bus_layout', 'add_audio_bus',
  'remove_audio_bus', 'add_bus_effect', 'set_bus_volume', 'create_physics_material',
  'set_light_param', 'create_nav_mesh', 'create_translation', 'update_project_uids',
  'create_joint', 'set_joint_param', 'create_collision_polygon', 'set_shape_points',
  'set_mesh_surface_material',   'create_curve', 'create_gradient', 'create_noise_texture',
  'create_atlas_texture', 'create_world',
  // ---- 新增资源创建 / 修改工具 (v1.7.0) ----
  'create_image_texture', 'set_texture_import_flags', 'create_multimesh',
  'set_skeleton_bone_pose', 'write_path_curve', 'create_sky',
  'create_world_environment', 'create_gdextension', 'create_theme',
  'add_theme_type', 'set_stylebox', 'create_tileset', 'add_tileset_source',
  'create_nav_link', 'remove_joint', 'write_collision_layers',
  'write_translation', 'add_translation_key',
  // ---- 实时游戏运行时写工具 (v1.8.0) ----
  'runtime_set_node', 'runtime_call_method', 'runtime_emit_signal', 'runtime_input',
  'runtime_freeze', 'runtime_resume', 'runtime_step', 'runtime_screenshot',
]);

/** 该工具是否为写/副作用操作（read-only 模式下应被拒绝）。 */
export function isWriteTool(name: string): boolean {
  return WRITE_TOOLS.has(name);
}

// ---- Global registry singleton ----
// Set once at startup by registerAllTools so meta/discovery tools can search
// the full tool catalog without threading the registry instance through every
// handler. Returns null before registration completes.
let _activeRegistry: ToolRegistry | null = null;

export function setActiveRegistry(registry: ToolRegistry): void {
  _activeRegistry = registry;
}

export function getActiveRegistry(): ToolRegistry | null {
  return _activeRegistry;
}

export class ToolRegistry {
  private tools = new Map<string, ToolRegistration>();
  private readOnly: boolean;

  constructor(opts?: { readOnly?: boolean }) {
    this.readOnly = opts?.readOnly ?? false;
  }

  /** 当前是否处于只读模式 */
  get isReadOnly(): boolean {
    return this.readOnly;
  }

  /** Register a single tool */
  register(tool: ToolRegistration): void {
    if (this.tools.has(tool.name)) {
      console.error(`[ToolRegistry] Duplicate tool: ${tool.name}`);
      return;
    }
    this.tools.set(tool.name, tool);
  }

  /** Get all tool definitions (for list_tools). 只读模式下过滤掉写工具。 */
  list(): ToolRegistration[] {
    return [...this.tools.values()]
      .filter(t => !this.readOnly || !isWriteTool(t.name))
      .sort((a, b) => a.name.localeCompare(b.name));
  }

  /** Find a tool by name */
  find(name: string): ToolRegistration | undefined {
    return this.tools.get(name);
  }

  /** 是否允许调用该工具（read-only 模式下写工具被拒绝） */
  canCall(name: string): boolean {
    return !this.readOnly || !isWriteTool(name);
  }

  /** Is the registry empty? */
  get isEmpty(): boolean {
    return this.tools.size === 0;
  }

  get count(): number {
    return this.tools.size;
  }
}
