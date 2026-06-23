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
