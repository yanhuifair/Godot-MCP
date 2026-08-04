// Copyright (c) 2026 FairYan
// SPDX-License-Identifier: AGPL-3.0-or-later
// ============================================================
// Godot MCP Server - Translation / Localization Tools
// ============================================================
//
// Godot supports .csv, .po, and .translation files for localization.
// .csv is the most common format: keys,source,target separated by commas.

import { z } from 'zod';
import { toolError, ErrorCode } from '../utils/errors.js';
import { ToolResult } from '../utils/types.js';
import fs from 'node:fs';
import path from 'node:path';
import { readTextFile, resolveProjectPath, findFilesByExtension, writeTextFile } from '../utils/file_utils.js';

// ---- Tool Schemas ----

export const listTranslationsSchema = {
  path: z.string().optional().default('').describe('Subdirectory to search'),
};

export const readTranslationSchema = {
  path: z.string().describe('Path to .csv or .po translation file'),
  filter: z.string().optional().describe('Optional filter text to search for in keys or translations'),
};

export const createTranslationSchema = {
  path: z.string().describe('Output path for new translation .csv file (e.g. "localization/zh_CN.csv")'),
  language: z.string().optional().default('en').describe('Language code (e.g. "en", "zh_CN", "ja")'),
  keys: z.array(z.string()).optional().describe('Initial translation keys to add'),
};

// ---- Tool Handlers ----

export function handleListTranslations(
  projectRoot: string,
  args: { path?: string }
): ToolResult {
  try {
    const csvFiles = findFilesByExtension(projectRoot, ['.csv'], args.path || '');
    const poFiles = findFilesByExtension(projectRoot, ['.po'], args.path || '');
    const translationFiles = findFilesByExtension(projectRoot, ['.translation'], args.path || '');

    // Filter for translation-related CSVs by checking content
    const translationCsvs: string[] = [];
    for (const f of csvFiles) {
      try {
        const absPath = resolveProjectPath(projectRoot, f);
        const fileContent = fs.readFileSync(absPath, 'utf-8');
        const firstLine = fileContent.split('\n')[0] || '';
        // Godot CSV translations have "keys" in header
        if (firstLine.toLowerCase().includes('keys') || firstLine.toLowerCase().includes('key,')) {
          translationCsvs.push(f);
        }
      } catch { /* skip */ }
    }

    const total = translationCsvs.length + poFiles.length + translationFiles.length;
    if (total === 0) {
      return { content: [{ type: 'text', text: 'No translation files found. Use .csv format with "keys,en,zh_CN" header columns.' }] };
    }

    const lines: string[] = [];
    lines.push(`Translation Files (${total}):`);

    if (translationCsvs.length > 0) {
      lines.push(`\n  CSV (${translationCsvs.length}):`);
      translationCsvs.sort().forEach(f => {
        // Try to read entry count
        try {
          const absPath = resolveProjectPath(projectRoot, f);
          const fileContent = fs.readFileSync(absPath, 'utf-8');
          const entryCount = Math.max(0, fileContent.split('\n').filter(l => l.trim() && !l.trim().startsWith('#')).length - 1);
          lines.push(`    ${f}  (${entryCount} entries)`);
        } catch {
          lines.push(`    ${f}`);
        }
      });
    }

    if (poFiles.length > 0) {
      lines.push(`\n  Gettext PO (${poFiles.length}):`);
      poFiles.sort().forEach(f => lines.push(`    ${f}`));
    }

    if (translationFiles.length > 0) {
      lines.push(`\n  Compiled .translation (${translationFiles.length}):`);
      translationFiles.sort().forEach(f => lines.push(`    ${f}`));
    }

    return { content: [{ type: 'text', text: lines.join('\n') }] };
  } catch (err: any) {
    return toolError(ErrorCode.INTERNAL_ERROR, `Error: ${err.message}`);
  }
}

export function handleReadTranslation(
  projectRoot: string,
  args: { path: string; filter?: string }
): ToolResult {
  try {
    const absPath = resolveProjectPath(projectRoot, args.path);

    if (args.path.endsWith('.po')) {
      return readGettextPo(absPath, args);
    }

    if (!args.path.endsWith('.csv')) {
            return toolError(ErrorCode.INVALID_ARGUMENT, `Unsupported format: ${path.extname(args.path)}. Use .csv or .po files.`);
    }

    // Parse CSV translation
    const content = fs.readFileSync(absPath, 'utf-8');
    const entries = parseCsvTranslation(content);

    if (entries.length === 0) {
      return { content: [{ type: 'text', text: `No entries found in ${args.path}` }] };
    }

    const lines: string[] = [];
    lines.push(`Translation: ${args.path}`);
    lines.push(`Languages: ${entries[0].languages.join(', ')}`);
    lines.push(`Entries: ${entries.length}`);
    lines.push('');

    let filteredEntries = entries;
    if (args.filter) {
      const query = args.filter.toLowerCase();
      filteredEntries = entries.filter(e =>
        e.key.toLowerCase().includes(query) ||
        e.translations.some(t => t.toLowerCase().includes(query))
      );
      lines.push(`Filter: "${args.filter}" → ${filteredEntries.length} matches`);
      lines.push('');
    }

    for (const entry of filteredEntries.slice(0, 100)) {
      lines.push(`  ${entry.key}`);
      for (let i = 0; i < entry.languages.length; i++) {
        lines.push(`    ${entry.languages[i]}: ${entry.translations[i] || '(empty)'}`);
      }
    }

    if (filteredEntries.length > 100) {
      lines.push(`  ... and ${filteredEntries.length - 100} more entries`);
    }

    return { content: [{ type: 'text', text: lines.join('\n') }] };
  } catch (err: any) {
    return toolError(ErrorCode.INTERNAL_ERROR, `Error: ${err.message}`);
  }
}

export function handleCreateTranslation(
  projectRoot: string,
  args: { path: string; language?: string; keys?: string[] }
): ToolResult {
  try {
    // Create CSV header: keys,source_lang,target_lang
    const lang = args.language || 'en';
    let content = `keys,en,${lang}\n`;

    if (args.keys && args.keys.length > 0) {
      for (const key of args.keys) {
        content += `"${key}","${key}",""\n`;
      }
    } else {
      // Add some placeholder entries
      content += `"GREETING","Hello",""\n`;
      content += `"GOODBYE","Goodbye",""\n`;
    }

    const absPath = resolveProjectPath(projectRoot, args.path);
    writeTextFile(absPath, content, false);

    const entryCount = args.keys?.length || 2;
    return {
      content: [{ type: 'text', text: `Translation file created: ${args.path}\nLanguages: en → ${lang} | Entries: ${entryCount}` }],
    };
  } catch (err: any) {
    return toolError(ErrorCode.INTERNAL_ERROR, `Error: ${err.message}`);
  }
}

// ---- CSV Parser ----

interface TranslationEntry {
  key: string;
  languages: string[];
  translations: string[];
}

function parseCsvTranslation(content: string): TranslationEntry[] {
  const lines = content.split('\n').filter(l => l.trim() && !l.startsWith('#'));

  if (lines.length < 2) return [];

  // Parse header
  const header = parseCsvLine(lines[0]);
  if (header.length < 2) return [];

  const languages = header.slice(1); // All columns after "keys"

  // Parse entries
  const entries: TranslationEntry[] = [];
  for (let i = 1; i < lines.length; i++) {
    const fields = parseCsvLine(lines[i]);
    if (fields.length >= 2) {
      const key = fields[0];
      const translations = fields.slice(1);
      // Pad translations to match language count
      while (translations.length < languages.length) {
        translations.push('');
      }
      entries.push({ key, languages, translations: translations.slice(0, languages.length) });
    }
  }

  return entries;
}

/**
 * Parse a CSV line respecting quoted fields.
 */
function parseCsvLine(line: string): string[] {
  const result: string[] = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      // Handle escaped quotes ""
      if (inQuotes && i + 1 < line.length && line[i + 1] === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (ch === ',' && !inQuotes) {
      result.push(current.trim());
      current = '';
    } else {
      current += ch;
    }
  }
  result.push(current.trim());

  // Unquote fields
  return result.map(f => {
    if (f.startsWith('"') && f.endsWith('"')) {
      return f.slice(1, -1);
    }
    return f;
  });
}

// ---- Gettext .po Reader ----

function readGettextPo(absPath: string, args: { path: string; filter?: string }): ToolResult {
  try {
    const content = fs.readFileSync(absPath, 'utf-8');
    const entries: { msgid: string; msgstr: string }[] = [];

    let currentMsgid = '';
    let currentMsgstr = '';
    let inMsgid = false;
    let inMsgstr = false;

    for (const rawLine of content.split('\n')) {
      const line = rawLine.trim();
      if (!line || line.startsWith('#')) continue;

      if (line.startsWith('msgid ')) {
        // Save previous
        if (currentMsgid) {
          entries.push({ msgid: currentMsgid, msgstr: currentMsgstr });
        }
        currentMsgid = parseQuoted(line.slice(6));
        currentMsgstr = '';
        inMsgid = true;
        inMsgstr = false;
      } else if (line.startsWith('msgstr ')) {
        currentMsgstr = parseQuoted(line.slice(7));
        inMsgid = false;
        inMsgstr = true;
      } else if (line.startsWith('"') && line.endsWith('"')) {
        const val = parseQuoted(line);
        if (inMsgid) currentMsgid += val;
        else if (inMsgstr) currentMsgstr += val;
      }
    }
    // Save last entry
    if (currentMsgid) {
      entries.push({ msgid: currentMsgid, msgstr: currentMsgstr });
    }

    if (entries.length === 0) {
      return { content: [{ type: 'text', text: `No entries found in ${args.path}` }] };
    }

    const lines: string[] = [];
    lines.push(`Translation: ${args.path} (Gettext .po)`);
    lines.push(`Entries: ${entries.length}`);
    lines.push('');

    let filtered = entries;
    if (args.filter) {
      const query = args.filter.toLowerCase();
      filtered = entries.filter(e =>
        e.msgid.toLowerCase().includes(query) ||
        e.msgstr.toLowerCase().includes(query)
      );
      lines.push(`Filter: "${args.filter}" → ${filtered.length} matches`);
      lines.push('');
    }

    for (const entry of filtered.slice(0, 100)) {
      lines.push(`  msgid: "${entry.msgid}"`);
      lines.push(`  msgstr: "${entry.msgstr}"`);
      lines.push('');
    }

    return { content: [{ type: 'text', text: lines.join('\n') }] };
  } catch (err: any) {
    return toolError(ErrorCode.INTERNAL_ERROR, `Error: ${err.message}`);
  }
}

function parseQuoted(s: string): string {
  return s.replace(/^"/, '').replace(/"$/, '').replace(/\\n/g, '\n').replace(/\\"/g, '"');
}

// ---- Write / Append Translation ----

export const writeTranslationSchema = {
  path: z.string().describe('Path to .csv translation file to write/overwrite'),
  language: z.string().optional().default('en').describe('Target language column code'),
  entries: z.record(z.string()).describe('Map of translation key to its value'),
};

export const addTranslationKeySchema = {
  path: z.string().describe('Path to .csv translation file'),
  key: z.string().describe('New translation key to add'),
  translations: z.record(z.string()).optional().describe('Optional map of language code to value'),
};

export function handleWriteTranslation(
  projectRoot: string,
  args: { path: string; language?: string; entries: Record<string, string> }
): ToolResult {
  try {
    const lang = args.language || 'en';
    let content = `keys,en,${lang}\n`;
    const keys = Object.keys(args.entries);
    if (keys.length === 0) return toolError(ErrorCode.INVALID_ARGUMENT, 'entries must not be empty.');
    for (const k of keys) {
      content += `"${k}","${k}","${args.entries[k]}"\n`;
    }
    const absPath = resolveProjectPath(projectRoot, args.path);
    writeTextFile(absPath, content, false);
    return { content: [{ type: 'text', text: `Translation written: ${args.path} (${keys.length} entries, languages: en,${lang})` }] };
  } catch (err: any) {
    return toolError(ErrorCode.INTERNAL_ERROR, `Error: ${err.message}`);
  }
}

export function handleAddTranslationKey(
  projectRoot: string,
  args: { path: string; key: string; translations?: Record<string, string> }
): ToolResult {
  try {
    const absPath = resolveProjectPath(projectRoot, args.path);
    if (!fs.existsSync(absPath)) return toolError(ErrorCode.FILE_NOT_FOUND, `File not found: ${args.path}`);
    const raw = fs.readFileSync(absPath, 'utf-8');
    const firstLine = raw.split('\n')[0] || 'keys,en';
    const langs = parseCsvLine(firstLine).slice(1);
    const vals: string[] = langs.map(l => (args.translations && args.translations[l] !== undefined ? args.translations[l] : ''));
    const row = `"${args.key}",` + vals.map(v => `"${v}"`).join(',');
    writeTextFile(absPath, raw.replace(/\n*$/, '') + '\n' + row + '\n', true);
    return { content: [{ type: 'text', text: `Added key "${args.key}" to ${args.path}` }] };
  } catch (err: any) {
    return toolError(ErrorCode.INTERNAL_ERROR, `Error: ${err.message}`);
  }
}
