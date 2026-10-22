// Copyright (c) 2026 FairYan
// SPDX-License-Identifier: AGPL-3.0-or-later
// ============================================================
// Godot MCP Server — 参数命名归一化（别名层）
// ============================================================
// 背景：386 个工具的参数名是历史累积的 —— 同一个概念有 `path` / `scene_path` /
// `file_path` / `output_path` 等多种写法（`path` 116 处、`scene_path` 79 处）。
// 对模型来说，猜错参数名就多一轮 VALIDATION_ERROR 往返；对人来说，同一件事
// 在不同工具里叫不同名字也很难记。
//
// 直接改名是破坏性变更（工具名 + 参数名都是对外契约，已有客户端和脚本在发
// `path`），所以这里做**别名归一化**：schema 里保留既有的规范名，调用时把同组
// 的其它写法映射过去。双向都收 —— 传 `path` 给 `add_node` 或传 `scene_path`
// 给 `create_scene` 都能工作。
//
// 安全规则：一组里如果出现 ≥2 个键（例如 `attach_script` 同时有 `scene_path`
// 和 `script_path`），就**不猜** —— 把 `path` 映射到哪一个都可能是错的，宁可
// 让校验报错去问清楚。
// ============================================================

/** 同义参数分组（小分组：组内语义完全等价，可安全互转）。 */
export const PARAM_GROUPS: readonly (readonly string[])[] = [
  ['name', 'new_name', 'node_name', 'root_name'],
  ['type', 'node_type', 'root_node_type'],
  ['parent_path', 'parent_node_path', 'new_parent'],
  ['value', 'property_value'],
  ['method', 'method_name'],
];

/**
 * 文件路径类参数。它们**不是**同义的（`script_path` 和 `texture_path` 是
 * 两个不同的东西），所以不能整组互转 —— 只在工具"只有一个路径参数"时，
 * 把通用写法（`path` / `file_path` / `output_path`）映射到那个唯一的键。
 */
export const FILE_PATH_KEYS: readonly string[] = [
  'path', 'file_path', 'output_path', 'asset_path', 'resource_path', 'scene_path',
  'script_path', 'shader_path', 'texture_path', 'layout_path', 'theme_path',
  'export_path', 'project_path', 'track_path', 'dir_path',
];

/** 明确是"场景文件"的工具，才把 `scene_path` 认成那个唯一的 `path`。 */
const SCENE_HINT_RE = /\bscene\b|\.tscn/;

/**
 * 根据工具名 + 描述 + schema 推导别名表：`{ 别名: 规范名 }`。
 *
 * 只做**有把握**的映射，宁可少认也不瞎猜：
 * - 路径参数 ≥2 个 ⇒ 完全不猜（`attach_script` 的 `path` 到底是场景还是脚本？）
 * - 唯一路径参数是 `path` ⇒ 按工具语义吸收 `scene_path` / `output_path` / `file_path`
 * - 唯一路径参数是具体名（`script_path` 等）⇒ 接受通用 `path`
 */
export function deriveParamAliases(
  name: string,
  description: string,
  schema: Record<string, unknown>
): Record<string, string> {
  const keys = new Set(Object.keys(schema ?? {}));
  const aliases: Record<string, string> = {};

  const pathKeys = FILE_PATH_KEYS.filter((k) => keys.has(k));
  if (pathKeys.length === 1) {
    const canonical = pathKeys[0];
    if (canonical === 'path') {
      const hint = `${name} ${description}`.toLowerCase();
      if (SCENE_HINT_RE.test(hint)) aliases['scene_path'] = 'path';
      if (/^(create_|export_|write_|generate_)/.test(name)) aliases['output_path'] = 'path';
      if (/^(read_|validate_|diff_|compile_)/.test(name)) aliases['file_path'] = 'path';
    } else {
      aliases['path'] = canonical;
      if (canonical === 'scene_path') aliases['file_path'] = 'scene_path';
      if (canonical === 'output_path') aliases['file_path'] = 'output_path';
    }
  }

  // 小分组：只有组内恰好一个键时才映射
  for (const group of PARAM_GROUPS) {
    const present = group.filter((k) => keys.has(k));
    if (present.length !== 1) continue;
    const canonical = present[0];
    for (const k of group) {
      if (k !== canonical) aliases[k] = canonical;
    }
  }

  return aliases;
}

export interface AliasResult {
  args: Record<string, unknown>;
  /** 实际发生的映射（用于日志/调试） */
  applied: { from: string; to: string }[];
  /** 别名与规范名同时出现且取值不同 —— 不能猜，交给调用方报错 */
  conflicts: { from: string; to: string }[];
}

/**
 * 把别名键改写成规范键。
 * - 只处理"别名在、规范名不在"的情况；
 * - 两者都在且值相同 → 丢掉别名（无害）；
 * - 两者都在且值不同 → 记入 conflicts，不改写。
 */
export function applyParamAliases(
  args: Record<string, unknown>,
  aliases: Record<string, string>
): AliasResult {
  const result: Record<string, unknown> = { ...args };
  const applied: { from: string; to: string }[] = [];
  const conflicts: { from: string; to: string }[] = [];

  for (const [from, to] of Object.entries(aliases)) {
    if (!(from in result)) continue;
    if (!(to in result)) {
      result[to] = result[from];
      delete result[from];
      applied.push({ from, to });
      continue;
    }
    if (JSON.stringify(result[from]) === JSON.stringify(result[to])) {
      delete result[from]; // 同一个值写了两遍，留一个
      continue;
    }
    conflicts.push({ from, to });
  }

  return { args: result, applied, conflicts };
}
