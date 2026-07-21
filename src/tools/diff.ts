// Copyright (c) 2026 FairYan
// SPDX-License-Identifier: MIT
// ============================================================
// Godot MCP Server - Diff / Compare Tools
// ============================================================

import { z } from 'zod';
import { ToolResult } from '../utils/types.js';
import { readTextFile, resolveProjectPath } from '../utils/file_utils.js';

// ---- Tool Schemas ----

export const diffSceneSchema = {
  path_a: z.string().describe('First scene path'),
  path_b: z.string().describe('Second scene path'),
  ignore_whitespace: z.boolean().optional().default(true).describe('Ignore whitespace-only changes'),
};

export const diffResourceSchema = {
  path_a: z.string().describe('First .tres resource path'),
  path_b: z.string().describe('Second .tres resource path'),
  context_lines: z.number().optional().default(3).describe('Lines of context around diffs'),
};

// ---- Tool Handlers ----

export function handleDiffScene(
  projectRoot: string,
  args: { path_a: string; path_b: string; ignore_whitespace?: boolean }
): ToolResult {
  try {
    const absA = resolveProjectPath(projectRoot, args.path_a);
    const absB = resolveProjectPath(projectRoot, args.path_b);

    const { content: contentA } = readTextFile(absA);
    const { content: contentB } = readTextFile(absB);

    const linesA = args.ignore_whitespace
      ? contentA.split('\n').map(l => l.trim()).filter(l => l)
      : contentA.split('\n');
    const linesB = args.ignore_whitespace
      ? contentB.split('\n').map(l => l.trim()).filter(l => l)
      : contentB.split('\n');

    const diff = computeDiff(linesA, linesB);

    const lines: string[] = [];
    lines.push(`Scene Diff: ${args.path_a} ↔ ${args.path_b}`);
    lines.push(`Lines: A=${contentA.split('\n').length} B=${contentB.split('\n').length}`);
    lines.push(`Changes: +${diff.adds} -${diff.removes} ~${diff.mods} (${diff.adds + diff.removes + diff.mods} total)`);
    lines.push('');

    if (diff.changes.length === 0) {
      lines.push('No differences found.');
    } else {
      for (const change of diff.changes) {
        switch (change.type) {
          case 'add':
            lines.push(`  + [B:${change.lineB}] ${change.text}`);
            break;
          case 'remove':
            lines.push(`  - [A:${change.lineA}] ${change.text}`);
            break;
          case 'modify':
            lines.push(`  ~ [A:${change.lineA} → B:${change.lineB}]`);
            lines.push(`    - ${change.text}`);
            lines.push(`    + ${change.newText}`);
            break;
        }
      }
    }

    return { content: [{ type: 'text', text: lines.join('\n') }] };
  } catch (err: any) {
    return { content: [{ type: 'text', text: `Error: ${err.message}` }], isError: true };
  }
}

export function handleDiffResource(
  projectRoot: string,
  args: { path_a: string; path_b: string; context_lines?: number }
): ToolResult {
  try {
    const absA = resolveProjectPath(projectRoot, args.path_a);
    const absB = resolveProjectPath(projectRoot, args.path_b);

    const { content: contentA } = readTextFile(absA);
    const { content: contentB } = readTextFile(absB);

    const propsA = extractResourceProperties(contentA);
    const propsB = extractResourceProperties(contentB);

    const lines: string[] = [];
    lines.push(`Resource Diff: ${args.path_a} ↔ ${args.path_b}`);
    lines.push('');

    const allKeys = new Set([...Object.keys(propsA), ...Object.keys(propsB)]);

    let changed = 0;
    for (const key of [...allKeys].sort()) {
      const valA = propsA[key];
      const valB = propsB[key];

      if (valA === undefined) {
        lines.push(`  + ${key} = ${valB}`);
        changed++;
      } else if (valB === undefined) {
        lines.push(`  - ${key} = ${valA}`);
        changed++;
      } else if (valA !== valB) {
        lines.push(`  ~ ${key}: "${valA}" → "${valB}"`);
        changed++;
      }
    }

    if (changed === 0) {
      lines.push('No property differences found.');
    } else {
      lines.push(`\n${changed} property change(s) total.`);
    }

    return { content: [{ type: 'text', text: lines.join('\n') }] };
  } catch (err: any) {
    return { content: [{ type: 'text', text: `Error: ${err.message}` }], isError: true };
  }
}

// ---- Helpers ----

interface DiffEntry {
  type: 'add' | 'remove' | 'modify';
  text: string;
  newText?: string;
  lineA?: number;
  lineB?: number;
}

interface DiffResult {
  adds: number;
  removes: number;
  mods: number;
  changes: DiffEntry[];
}

function computeDiff(linesA: string[], linesB: string[]): DiffResult {
  const changes: DiffEntry[] = [];
  let adds = 0;
  let removes = 0;
  let mods = 0;

  // Simple LCS-based diff
  const m = linesA.length;
  const n = linesB.length;

  // Build LCS table
  const dp: number[][] = Array.from({ length: m + 1 }, () => Array(n + 1).fill(0));
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      if (linesA[i - 1] === linesB[j - 1]) {
        dp[i][j] = dp[i - 1][j - 1] + 1;
      } else {
        dp[i][j] = Math.max(dp[i - 1][j], dp[i][j - 1]);
      }
    }
  }

  // Backtrack
  let i = m, j = n;
  const operations: { type: 'add' | 'remove'; text: string; lineA: number; lineB: number }[] = [];

  while (i > 0 || j > 0) {
    if (i > 0 && j > 0 && linesA[i - 1] === linesB[j - 1]) {
      i--;
      j--;
    } else if (j > 0 && (i === 0 || dp[i][j - 1] >= dp[i - 1][j])) {
      operations.unshift({ type: 'add', text: linesB[j - 1], lineA: 0, lineB: j });
      j--;
      adds++;
    } else if (i > 0 && (j === 0 || dp[i][j - 1] < dp[i - 1][j])) {
      operations.unshift({ type: 'remove', text: linesA[i - 1], lineA: i, lineB: 0 });
      i--;
      removes++;
    }
  }

  // Detect modifications (adjacent add+remove)
  const merged: DiffEntry[] = [];
  let idx = 0;
  while (idx < operations.length - 1) {
    const curr = operations[idx];
    const next = operations[idx + 1];
    if (curr.type === 'remove' && next.type === 'add') {
      merged.push({ type: 'modify', text: curr.text, newText: next.text, lineA: curr.lineA, lineB: next.lineB });
      idx += 2;
      adds--;
      removes--;
      mods++;
    } else {
      merged.push(curr);
      idx++;
    }
  }
  if (idx < operations.length) {
    merged.push(operations[idx]);
  }

  return { adds, removes, mods, changes: merged };
}

function extractResourceProperties(content: string): Record<string, string> {
  const props: Record<string, string> = {};
  let inResource = false;

  for (const rawLine of content.split('\n')) {
    const line = rawLine.trim();
    if (!line) continue;
    if (line === '[resource]') {
      inResource = true;
      continue;
    }
    if (line.startsWith('[')) {
      if (inResource) break;
      continue;
    }
    if (inResource) {
      const eq = line.indexOf('=');
      if (eq > 0) {
        props[line.slice(0, eq).trim()] = line.slice(eq + 1).trim();
      }
    }
  }

  return props;
}
