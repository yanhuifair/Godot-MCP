// ============================================================
// Godot MCP Server - Config File Parser (project.godot / .cfg)
// ============================================================

import { ConfigDocument } from '../utils/types.js';

/**
 * Parse a Godot config/INI-style file.
 * Handles:
 * - [section] headers
 * - key = value pairs
 * - ; comment lines
 * - Multi-line values (indented continuation)
 */
export function parseConfig(content: string): ConfigDocument {
  const doc: ConfigDocument = {
    sections: {},
    comments: [],
  };

  const lines = content.split('\n');
  let currentSection: string = '';
  let multiLineKey: string | null = null;
  let multiLineValue: string[] = [];

  for (const rawLine of lines) {
    const line = rawLine.trimEnd();

    // Handle multi-line value continuation
    if (multiLineKey !== null) {
      // Check if the line continues a multi-line value (indented or empty)
      const trimmed = line.trimStart();
      if (line.length > 0 && line[0] !== '[' && line[0] !== ';' && !/^\w/.test(line)) {
        // Continuation line (indented)
        multiLineValue.push(trimmed);
        continue;
      } else {
        // End of multi-line value, save it
        if (!doc.sections[currentSection]) {
          doc.sections[currentSection] = {};
        }
        doc.sections[currentSection][multiLineKey] = multiLineValue.join('\n');
        multiLineKey = null;
        multiLineValue = [];
      }
    }

    const trimmed = line.trimStart();

    // Comment line
    if (trimmed.startsWith(';')) {
      doc.comments!.push(trimmed);
      continue;
    }

    // Empty line
    if (trimmed.length === 0) {
      continue;
    }

    // Section header: [section_name]
    if (trimmed.startsWith('[') && trimmed.endsWith(']')) {
      currentSection = trimmed.slice(1, -1).trim();
      if (!doc.sections[currentSection]) {
        doc.sections[currentSection] = {};
      }
      continue;
    }

    // Key-value line: key = value
    const eqIndex = trimmed.indexOf('=');
    if (eqIndex > 0) {
      const key = trimmed.slice(0, eqIndex).trim();
      let value = trimmed.slice(eqIndex + 1).trim();

      // Check for multi-line value start
      if (value === '"' || (value.startsWith('"') && !value.endsWith('"')) ||
          value === '{' || (value.startsWith('{') && !value.endsWith('}'))) {
        multiLineKey = key;
        multiLineValue = [value];
        continue;
      }

      if (!doc.sections[currentSection]) {
        doc.sections[currentSection] = {};
      }
      doc.sections[currentSection][key] = value;
    }
  }

  // Flush any remaining multi-line value
  if (multiLineKey !== null) {
    if (!doc.sections[currentSection]) {
      doc.sections[currentSection] = {};
    }
    doc.sections[currentSection][multiLineKey] = multiLineValue.join('\n');
  }

  return doc;
}

/**
 * Serialize a ConfigDocument back to text.
 */
export function serializeConfig(doc: ConfigDocument): string {
  const lines: string[] = [];

  if (doc.comments && doc.comments.length > 0) {
    for (const comment of doc.comments) {
      lines.push(comment);
    }
  }

  for (const [sectionName, entries] of Object.entries(doc.sections)) {
    if (sectionName) {
      lines.push(`[${sectionName}]`);
    }
    for (const [key, value] of Object.entries(entries)) {
      lines.push(`${key} = ${value}`);
    }
  }

  return lines.join('\n') + '\n';
}
