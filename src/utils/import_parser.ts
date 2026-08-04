// Copyright (c) 2026 FairYan
// SPDX-License-Identifier: AGPL-3.0-or-later
// ============================================================
// Godot MCP Server - .import file parser (shared)
// ============================================================
// .import files are INI-like configs Godot generates for imported assets.
// Shared by the import tools (src/tools/import.ts) and the texture tools
// (src/tools/texture.ts) — previously each had its own near-identical copy.

export interface ImportConfig {
  remap: Record<string, string>;  // [remap] section
  deps: Record<string, string>;   // [deps] section
  params: Record<string, string>; // [params] section
}

/** Parse an .import file body into its [remap]/[deps]/[params] sections. */
export function parseImportConfig(content: string): ImportConfig {
  const result: ImportConfig = { remap: {}, deps: {}, params: {} };
  let currentSection: keyof ImportConfig | null = null;

  for (const rawLine of content.split('\n')) {
    const line = rawLine.trim();
    if (!line || line.startsWith(';')) continue;

    if (line.startsWith('[') && line.endsWith(']')) {
      const section = line.slice(1, -1).trim();
      switch (section) {
        case 'remap': currentSection = 'remap'; break;
        case 'deps': currentSection = 'deps'; break;
        case 'params': currentSection = 'params'; break;
        default: currentSection = null; // unknown section — ignore
      }
      continue;
    }

    const eqIdx = line.indexOf('=');
    if (eqIdx > 0 && currentSection) {
      const key = line.slice(0, eqIdx).trim();
      let value = line.slice(eqIdx + 1).trim();
      // Strip surrounding quotes
      if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
        value = value.slice(1, -1);
      }
      result[currentSection][key] = value;
    }
  }

  return result;
}

/** Serialize an ImportConfig back into .import file body text. */
export function serializeImportConfig(config: ImportConfig): string {
  const lines: string[] = [];

  for (const section of ['remap', 'deps', 'params'] as const) {
    const entries = Object.entries(config[section]);
    if (entries.length > 0) {
      lines.push(`[${section}]`);
      for (const [k, v] of entries) {
        lines.push(`${k}=${v}`);
      }
      lines.push('');
    }
  }

  return lines.join('\n').trim();
}
