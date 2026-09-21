// Copyright (c) 2026 FairYan
// SPDX-License-Identifier: AGPL-3.0-or-later
// ============================================================
// Godot MCP Server - Scene Node Traversal Helpers
// ============================================================
// 场景节点的遍历/查找在工具层曾散落成 20+ 份本地实现：
//   - 过滤版 `walk(nodes, types)` 有 5 份，其中 3 份逐字相同
//     （nodes.ts / scene_inspectors.ts / utility.ts），另 2 份只是变量名不同
//     （domain.ts / rendering.ts，叫 walkNodes）
//   - 访问者版 `walk(nodes)` 有 12 份，各自内联递归
//   - 查找版 `findNode` 有 3 份，语义还各不相同
// 这里收成一份。改遍历语义只需改这个文件，也便于给遍历加保护
// （下面的循环检测就是为了防止畸形场景把递归撑爆）。

import { NodeDefinition } from './types.js';

export type SceneNode = NodeDefinition & Record<string, any>;

/**
 * 深度优先遍历每个节点（父先于子）。
 *
 * `visit` 返回 `false` 表示跳过该节点的子树（仍会继续兄弟节点）。
 *
 * 带循环保护：解析出来的场景树理论上不该有环，但外部传入/手工拼的
 * `children` 引用可能成环，递归会直接爆栈并带崩整个服务器。用一条
 * 祖先链检测，命中即停止深入该分支。
 */
export function forEachNode(nodes: SceneNode[], visit: (node: SceneNode) => boolean | void): void {
  const ancestors = new Set<SceneNode>();
  const walk = (list: SceneNode[]) => {
    for (const node of list) {
      if (!node || typeof node !== 'object') continue;
      if (ancestors.has(node)) continue; // 环：跳过
      if (visit(node) === false) continue;
      if (node.children && node.children.length > 0) {
        ancestors.add(node);
        walk(node.children);
        ancestors.delete(node);
      }
    }
  };
  walk(nodes);
}

/**
 * 收集 type 命中 `types` 的所有节点（父先于子）。
 *
 * 语义与原来散落各处的 `walk(nodes, types)` 完全一致：
 *   - `types` 为 `undefined` → 收集**全部**节点
 *   - `types` 为 `[]` → 收集**零个**（空集合不命中任何 type）
 * 这个区分是有意的：既有调用方会把「用户没指定类型」表示成空数组，
 * 若把空数组当成「全部」会静默放大结果集。
 */
export function collectNodes(nodes: SceneNode[], types?: string[] | string): SceneNode[] {
  const wanted = types === undefined ? null : (typeof types === 'string' ? [types] : types);
  const out: SceneNode[] = [];
  forEachNode(nodes, (node) => {
    if (wanted === null || wanted.includes(node.type)) out.push(node);
  });
  return out;
}

/** 节点总数（等价于 collectNodes(nodes).length，但不建数组）。 */
export function countNodes(nodes: SceneNode[]): number {
  let n = 0;
  forEachNode(nodes, () => { n++; });
  return n;
}

/** 按 name 找第一个匹配的节点（可选 type 过滤）。 */
export function findNodeByName(nodes: SceneNode[], name: string, types?: string[]): SceneNode | null {
  let found: SceneNode | null = null;
  forEachNode(nodes, (node) => {
    if (node.name === name && (!types || types.length === 0 || types.includes(node.type))) {
      found = node;
      return false; // 找到即停
    }
  });
  return found;
}

/**
 * 按节点路径查找，形如 `"Main/Body/CollisionShape2D"`。
 *
 * 与既有各处实现保持一致的容错：
 *   - 前导 `/root/` 会被忽略（运行时绝对路径）
 *   - 单个组件（`"/"` 分隔后只剩一段）时，在整棵树里按 name 找第一个匹配
 */
export function findNodeByPath(nodes: SceneNode[], nodePath: string): SceneNode | null {
  const parts = nodePath.split('/').filter(Boolean);
  if (parts.length === 0) return null;

  if (parts.length === 1) {
    // 裸名：沿树找第一个同名节点（Godot 的 parent= 写法允许省略根名）
    const direct = findNodeByName(nodes, parts[0]);
    if (direct) return direct;
    return null;
  }

  // 多段路径：从根的下一层开始逐段匹配；也容忍路径里带根名
  const descend = (list: SceneNode[], idx: number): SceneNode | null => {
    if (idx >= parts.length) return null;
    for (const node of list) {
      if (node.name !== parts[idx]) continue;
      if (idx === parts.length - 1) return node;
      const deeper = node.children ? descend(node.children, idx + 1) : null;
      if (deeper) return deeper;
    }
    return null;
  };

  // 先按「完整路径从根开始」匹配
  const full = descend(nodes, 0);
  if (full) return full;
  // 再按「路径省略了根名」匹配（parts[0] 其实是根节点的子节点）
  if (nodes.length > 0) {
    const root = nodes[0];
    if (root && root.children) {
      return descend(root.children, 0);
    }
  }
  return null;
}

/**
 * 把节点路径规范化成 `res://` 相对形式的父路径（去掉根名）。
 * 供需要构造 `parent=` 值的调用方复用。
 */
export function parentPathOf(nodePath: string): string {
  const parts = nodePath.split('/').filter(Boolean);
  if (parts.length <= 1) return '.';
  return parts.slice(1).join('/');
}
