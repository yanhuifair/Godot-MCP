// Copyright (c) 2026 FairYan
// SPDX-License-Identifier: AGPL-3.0-or-later
// ============================================================
// Godot MCP Server - Shared Parser Helpers
// ============================================================
// Functions shared by scene_parser.ts, resource_parser.ts, config_parser.ts

/**
 * Split a Godot header string into parts, respecting quoted strings.
 * e.g. `gd_scene load_steps=5 format=3 uid="uid://abc"` →
 *   ['gd_scene', 'load_steps=5', 'format=3', 'uid="uid://abc"']
 */
export function splitHeaderParts(inner: string): string[] {
  const parts: string[] = [];
  let current = '';
  let inString = false;
  let escape = false;

  for (const ch of inner) {
    if (escape) {
      current += ch;
      escape = false;
      continue;
    }
    if (ch === '\\') {
      current += ch;
      escape = true;
      continue;
    }
    if (ch === '"') {
      inString = !inString;
      current += ch;
      continue;
    }
    if (ch === ' ' && !inString) {
      if (current.length > 0) {
        parts.push(current);
        current = '';
      }
      continue;
    }
    current += ch;
  }
  if (current.length > 0) parts.push(current);

  return parts;
}

/**
 * Parse key=value pairs from header parts.
 * e.g. ['type="Script"', 'path="res://player.gd"', 'id="1_abc"'] →
 *   { type: '"Script"', path: '"res://player.gd"', id: '"1_abc"' }
 */
export function parseKeyValuePairs(props: string[]): Record<string, string> {
  const result: Record<string, string> = {};
  for (const prop of props) {
    const eqIndex = prop.indexOf('=');
    if (eqIndex > 0) {
      const key = prop.slice(0, eqIndex);
      const value = prop.slice(eqIndex + 1);
      result[key] = value;
    }
  }
  return result;
}

/**
 * Remove surrounding double quotes from a string.
 */
export function unquote(str: string): string {
  if (str.length >= 2 && str.startsWith('"') && str.endsWith('"')) {
    return str.slice(1, -1);
  }
  return str;
}

/**
 * Normalize an ext_resource / sub_resource `id` into its bare form.
 *
 * Serializers re-emit ids as `id="<id>"`, so the parsed value must never keep
 * its own quotes -- otherwise every read-modify-write cycle adds one quote
 * layer (`"1"` -> `""1""` -> `"""1"""`), the id stops matching the
 * `ExtResource("1")` / `SubResource("1")` references, and Godot rejects the
 * whole file with "Parse Error: Unexpected end of file".
 *
 * Godot resource ids are `[A-Za-z0-9_]`-ish tokens and can never legitimately
 * contain a double quote, so stripping *every* surrounding layer is safe and
 * additionally repairs files that a previous buggy version already corrupted.
 */
export function unquoteId(str: string | undefined): string {
  return unquoteAttr(str);
}

/**
 * Normalize any section-header attribute (`type`, `uid`, `path`, `id`) to its
 * bare form.
 *
 * Same hazard as {@link unquoteId}: serializers always re-add the quotes, so a
 * parser that keeps them makes every read-modify-write cycle grow another
 * layer (`type="BoxMesh"` -> `type=""BoxMesh""` -> ...) until Godot can no
 * longer parse the file. None of these attributes can legitimately contain a
 * double quote, so stripping every layer is safe and also repairs files that an
 * earlier buggy version already damaged.
 */
export function unquoteAttr(str: string | undefined): string {
  if (!str) return '';
  let out = str.trim();
  while (out.length >= 2 && out.startsWith('"') && out.endsWith('"')) {
    out = out.slice(1, -1);
  }
  // Repair unbalanced remnants left by partially-corrupted files.
  return out.replace(/^"+/, '').replace(/"+$/, '');
}

/**
 * Check if brackets/quotes in a multi-line value are balanced.
 */
export function isValueBalanced(value: string): boolean {
  let inString = false;
  let escape = false;
  const stack: string[] = [];

  for (let i = 0; i < value.length; i++) {
    const ch = value[i];

    if (escape) {
      escape = false;
      continue;
    }

    if (ch === '\\') {
      escape = true;
      continue;
    }

    if (ch === '"') {
      inString = !inString;
      continue;
    }

    if (inString) continue;

    if (ch === '{' || ch === '[' || ch === '(') {
      stack.push(ch);
    } else if (ch === '}') {
      if (stack.pop() !== '{') return false;
    } else if (ch === ']') {
      if (stack.pop() !== '[') return false;
    } else if (ch === ')') {
      if (stack.pop() !== '(') return false;
    }
  }

  return stack.length === 0 && !inString;
}
