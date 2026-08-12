// Copyright (c) 2026 FairYan
// SPDX-License-Identifier: AGPL-3.0-or-later
// ============================================================
// Godot MCP Server - .import file parser (shared)
// ============================================================
// .import files are INI-like configs Godot generates for imported assets.
// Shared by the import tools (src/tools/import.ts) and the texture tools
// (src/tools/texture.ts) — previously each had its own near-identical copy.
//
// Godot 4.x .import values are TYPED: strings are double-quoted
// (`importer="texture"`), while numbers, booleans, null, arrays `[...]` and
// dicts `{...}` are bare literals. An unquoted string (`importer=texture`)
// makes Godot's ConfigFile parser throw `Unexpected identifier 'texture'`, so
// serialization must quote strings. Multi-line dict values (`metadata={...}`)
// must be collected verbatim on parse and re-emitted verbatim on serialize.

export interface ImportConfig {
  remap: Record<string, string>;  // [remap] section
  deps: Record<string, string>;   // [deps] section
  params: Record<string, string>; // [params] section
}

/** True when a `{`/`[` literal's braces/brackets are all closed (and not inside a string). */
function isBalancedLiteral(s: string): boolean {
  let depth = 0;
  let inStr = false;
  let esc = false;
  for (const c of s) {
    if (inStr) {
      if (esc) esc = false;
      else if (c === '\\') esc = true;
      else if (c === '"') inStr = false;
    } else {
      if (c === '"') inStr = true;
      else if (c === '{' || c === '[') depth++;
      else if (c === '}' || c === ']') depth--;
    }
  }
  return depth <= 0 && !inStr;
}

/** Parse an .import file body into its [remap]/[deps]/[params] sections. */
export function parseImportConfig(content: string): ImportConfig {
  const result: ImportConfig = { remap: {}, deps: {}, params: {} };
  let currentSection: keyof ImportConfig | null = null;

  const lines = content.split('\n');
  let i = 0;
  while (i < lines.length) {
    const line = lines[i].trim();
    if (!line || line.startsWith(';')) { i++; continue; }

    if (line.startsWith('[') && line.endsWith(']')) {
      const section = line.slice(1, -1).trim();
      switch (section) {
        case 'remap': currentSection = 'remap'; break;
        case 'deps': currentSection = 'deps'; break;
        case 'params': currentSection = 'params'; break;
        default: currentSection = null; // unknown section — ignore
      }
      i++;
      continue;
    }

    const eqIdx = line.indexOf('=');
    if (eqIdx > 0 && currentSection) {
      const key = line.slice(0, eqIdx).trim();
      let value = line.slice(eqIdx + 1).trim();
      // Strip surrounding quotes (keeps numbers/bools/arrays/dicts verbatim).
      if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
        value = value.slice(1, -1);
      }
      // Multi-line literal (`metadata={ ... }`) — collect lines until balanced.
      if ((value.startsWith('{') || value.startsWith('[')) && !isBalancedLiteral(value)) {
        let collected = value;
        i++;
        while (i < lines.length) {
          collected += '\n' + lines[i].trimEnd();
          if (isBalancedLiteral(collected)) break;
          i++;
        }
        value = collected;
      }
      result[currentSection][key] = value;
    }
    i++;
  }

  return result;
}

/** Emit one .import value with Godot 4.x quoting rules. */
function serializeImportValue(v: string): string {
  const t = v.trim();
  if (
    /^-?\d+(\.\d+)?$/.test(t) ||
    t === 'true' || t === 'false' || t === 'null' ||
    (t.startsWith('[') && t.endsWith(']')) ||
    (t.startsWith('{') && t.endsWith('}')) ||
    (t.startsWith('"') && t.endsWith('"')) ||
    (t.startsWith("'") && t.endsWith("'"))
  ) {
    return v; // number / bool / null / array / dict / already-quoted — emit as-is
  }
  return `"${v}"`; // plain string (incl. res://, uid://, empty → "")
}

/** Serialize an ImportConfig back into Godot 4.x-native .import file text. */
export function serializeImportConfig(config: ImportConfig): string {
  const lines: string[] = [];

  for (const section of ['remap', 'deps', 'params'] as const) {
    const entries = Object.entries(config[section]);
    if (entries.length > 0) {
      lines.push(`[${section}]`);
      lines.push(''); // Godot puts a blank line after every section header
      for (const [k, v] of entries) {
        // Multi-line literals carry their own newlines; emit them verbatim.
        lines.push(`${k}=${serializeImportValue(v)}`);
      }
      lines.push('');
    }
  }

  return lines.join('\n').trim();
}
