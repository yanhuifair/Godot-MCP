// Copyright (c) 2026 FairYan
// SPDX-License-Identifier: AGPL-3.0-or-later
// ============================================================
// Godot MCP Server - Config File Parser (project.godot / .cfg)
// ============================================================

import { ConfigDocument } from '../utils/types.js';

/**
 * 把任意字符串包成 Godot .cfg 的双引号字符串字面量。
 * Godot 的 VariantParser 认识 \" \\ \n \t \r \uXXXX，所以换行会被安全地
 * 转义成一个转义序列，而不是真的在文件里断行 —— 否则值里塞
 * "\n\n[autoload]\nEvil=..." 就能凭空注入一个新 section（已实测可注入 autoload，
 * 而 autoload 会在编辑器启动时执行脚本）。
 */
export function cfgQuote(value: string): string {
  const escaped = String(value)
    .replace(/\\/g, '\\\\')
    .replace(/"/g, '\\"')
    .replace(/\r/g, '\\r')
    .replace(/\n/g, '\\n')
    .replace(/\t/g, '\\t');
  return `"${escaped}"`;
}

/**
 * 校验 section / key 名。这些名字会被直接写成 `[name]` 或 `name = value`，
 * 含换行、`[`、`]` 或 `=` 就能篡改文件结构。
 */
export function assertValidConfigName(kind: 'section' | 'key', value: string): void {
  if (typeof value !== 'string' || value.length === 0) {
    throw new Error(`Invalid config ${kind}: must be a non-empty string`);
  }
  if (/[\r\n]/.test(value)) {
    throw new Error(`Invalid config ${kind} ${JSON.stringify(value)}: must not contain a line break`);
  }
  if (kind === 'section' && /[[\]]/.test(value)) {
    throw new Error(`Invalid config section ${JSON.stringify(value)}: must not contain "[" or "]"`);
  }
  if (kind === 'key' && value.includes('=')) {
    throw new Error(`Invalid config key ${JSON.stringify(value)}: must not contain "="`);
  }
}

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
    sectionComments: {},
  };

  const lines = content.split('\n');
  let currentSection: string = '';
  let multiLineKey: string | null = null;
  let multiLineValue: string[] = [];
  // 记录「当前 section 里最后一条 key」，用于把注释锚定到它前面的那一项，
  // 这样回写时注释还在原处（而不是全被搬到文件头）。
  let lastKey: string | null = null;

  /** 记录一条注释：文件头注释进 comments，段内注释按锚点进 sectionComments。 */
  const recordComment = (text: string) => {
    if (currentSection === '') {
      doc.comments!.push(text);
      return;
    }
    if (!doc.sectionComments![currentSection]) doc.sectionComments![currentSection] = [];
    doc.sectionComments![currentSection].push({ afterKey: lastKey, text });
  };

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
        lastKey = multiLineKey;
        multiLineKey = null;
        multiLineValue = [];
      }
    }

    const trimmed = line.trimStart();

    // Comment line
    if (trimmed.startsWith(';')) {
      recordComment(trimmed);
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
      lastKey = null;
      continue;
    }

    // Key-value line: key = value
    const eqIndex = trimmed.indexOf('=');
    if (eqIndex > 0) {
      let key = trimmed.slice(0, eqIndex).trim();
      // Godot quotes keys that contain spaces/special chars (e.g. the
      // export_presets.cfg runnable_presets section uses `"Windows Desktop"`).
      // Unquote so the stored key matches the logical name.
      if (key.startsWith('"') && key.endsWith('"') && key.length >= 2) {
        key = key.slice(1, -1);
      }
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
      lastKey = key;
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
 *
 * 空行布局按 Godot 自己的 ConfigFile::save 复刻：section 之前空一行、section
 * 头之后再空一行。这样首次回写一个 Godot 生成的文件时，只有 `key = value`
 * 的空格风格会变，不会连带整篇的空行结构一起重排。
 *
 * （Godot 写的是 `key=value`（无空格），我们坚持 `key = value`——把它改掉等于
 *   让每一行都产生 diff，代价远大于收益。）
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
      if (lines.length > 0 && lines[lines.length - 1] !== '') lines.push('');
      lines.push(`[${sectionName}]`);
      lines.push('');
    }

    // 该 section 的注释按锚点分组，还原到对应 key 之后
    const anchored = new Map<string | null, string[]>();
    for (const c of doc.sectionComments?.[sectionName] ?? []) {
      const list = anchored.get(c.afterKey);
      if (list) list.push(c.text);
      else anchored.set(c.afterKey, [c.text]);
    }
    const emitCommentsAfter = (anchor: string | null) => {
      for (const text of anchored.get(anchor) ?? []) lines.push(text);
    };

    emitCommentsAfter(null);
    for (const [key, value] of Object.entries(entries)) {
      lines.push(`${key} = ${value}`);
      emitCommentsAfter(key);
    }
  }

  return lines.join('\n') + '\n';
}
