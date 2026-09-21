// Copyright (c) 2026 FairYan
// SPDX-License-Identifier: AGPL-3.0-or-later
// ============================================================
// Godot MCP Server - Export Presets (export_presets.cfg)
// ============================================================
// 从 project.ts 拆出来：读写 export_presets.cfg 自成一块（解析、序列化、
// 平台常量、三个写工具），和工程配置/输入映射/自动加载没有耦合。

import { z } from 'zod';
import { toolError, ErrorCode } from '../utils/errors.js';
import { ToolResult } from '../utils/types.js';
import { readTextFile, resolveProjectPath, writeTextFile } from '../utils/file_utils.js';
import { cfgValue } from '../parsers/config_parser.js';
import fs from 'node:fs';

export const readExportPresetsSchema = {};

// ============================================================
// Export Presets Writer (export_presets.cfg)
// ============================================================
//
// Format reference — EditorExport::_save() / EditorExport::load_config()
// in godot/editor/export/editor_export.cpp:
//   * One `[preset.N]` section per preset, plus a matching
//     `[preset.N.options]` section holding platform-specific options.
//   * A `[runnable_presets]` section maps platform name -> preset name.
//   * `load_config()` scans preset.0, preset.1, ... and STOPS at the first
//     missing index, so removing a preset MUST renumber the remaining ones or
//     they silently disappear from the editor.
//   * `export_filter` is read without a fallback, so it must always be written.
//   * `platform` must match EditorExportPlatform::get_name() exactly; presets
//     with an unknown platform are skipped without any error message.

/**
 * Platform names accepted by Godot, taken from EditorExportPlatform::get_name()
 * (platform/<name>/export/export.cpp). The extension is only used to build a
 * sensible default export_path.
 */
const EXPORT_PLATFORMS: Record<string, string> = {
  'Windows Desktop': '.exe',
  'Linux': '.x86_64',
  'macOS': '.zip',
  'Android': '.apk',
  'iOS': '.ipa',
  'Web': '.html',
};

/** A single parsed preset: its `[preset.N]` body and `[preset.N.options]` body. */
interface ExportPresetBlock {
  main: Record<string, string>;
  options: Record<string, string>;
}

interface ExportPresetsFile {
  presets: ExportPresetBlock[];
  /** `[runnable_presets]`: platform name -> preset name. */
  runnable: Record<string, string>;
}

/** Parse export_presets.cfg into presets + the runnable mapping. */
function parseExportPresets(content: string): ExportPresetsFile {
  const presets: ExportPresetBlock[] = [];
  const runnable: Record<string, string> = {};
  // Which record the `key=value` lines currently being read belong to.
  let target: Record<string, string> | null = null;

  for (const raw of content.split('\n')) {
    const line = raw.trim();
    if (line.length === 0 || line.startsWith(';')) continue;

    if (line.startsWith('[') && line.endsWith(']')) {
      const section = line.slice(1, -1).trim();
      if (section === 'runnable_presets') {
        target = runnable;
        continue;
      }
      const m = section.match(/^preset\.(\d+)(\.options)?$/);
      if (!m) {
        target = null; // Unknown section: skip its body rather than guess.
        continue;
      }
      const idx = Number(m[1]);
      // Sections may be sparse or out of order; grow so index N is addressable.
      while (presets.length <= idx) presets.push({ main: {}, options: {} });
      target = m[2] ? presets[idx].options : presets[idx].main;
      continue;
    }

    if (target === null) continue;
    const eq = line.indexOf('=');
    if (eq <= 0) continue;
    target[line.slice(0, eq).trim()] = line.slice(eq + 1).trim();
  }

  return { presets, runnable };
}

/**
 * Serialize back to Godot's native ConfigFile layout: `key=value` with no
 * spaces and a blank line after each section header, so that re-saving from
 * the editor produces no spurious diff.
 */
function serializeExportPresets(file: ExportPresetsFile): string {
  const out: string[] = [];
  // Quote a key when it contains characters Godot's ConfigFile would otherwise
  // mangle. Godot quotes any key with a space (e.g. `"Windows Desktop"` from the
  // runnable_presets section); an unquoted `Windows Desktop` is read back as
  // `WindowsDesktop`, which silently breaks the runnable-preset lookup.
  const quoteKey = (k: string): string =>
    /^[A-Za-z0-9_./-]+$/.test(k) ? k : `"${k.replace(/"/g, '\\"')}"`;
  const emit = (section: string, entries: Record<string, string>) => {
    out.push(`[${section}]`, '');
    for (const [k, v] of Object.entries(entries)) out.push(`${quoteKey(k)}=${v}`);
    out.push('');
  };

  if (Object.keys(file.runnable).length > 0) emit('runnable_presets', file.runnable);
  file.presets.forEach((preset, i) => {
    emit(`preset.${i}`, preset.main);
    emit(`preset.${i}.options`, preset.options);
  });
  return out.join('\n');
}

/** Quote a plain string as a .cfg value. */
function cfgString(value: string): string {
  return JSON.stringify(value);
}

/** Strip surrounding quotes from a stored .cfg value. */
function cfgUnquote(value: string): string {
  const t = (value ?? '').trim();
  return t.startsWith('"') && t.endsWith('"') && t.length >= 2 ? t.slice(1, -1) : t;
}

/** Resolve a preset reference that is either a zero-based index or a name. */
function findPresetIndex(file: ExportPresetsFile, ref: string): number {
  const t = ref.trim();
  if (/^\d+$/.test(t)) {
    const i = Number(t);
    return i >= 0 && i < file.presets.length ? i : -1;
  }
  return file.presets.findIndex(p => cfgUnquote(p.main['name'] ?? '') === t);
}

/** Read export_presets.cfg, treating an absent file as an empty preset list. */
function loadExportPresets(projectRoot: string): { path: string; file: ExportPresetsFile } {
  const presetsPath = resolveProjectPath(projectRoot, 'export_presets.cfg');
  try {
    return { path: presetsPath, file: parseExportPresets(readTextFile(presetsPath).content) };
  } catch {
    // Never exported yet — that is a normal state, not an error.
    return { path: presetsPath, file: { presets: [], runnable: {} } };
  }
}

/**
 * Rebuild `[runnable_presets]` so it only references presets that still exist.
 * Godot matches by preset NAME per platform, so a stale entry would silently
 * mark the wrong preset runnable after a rename or removal.
 */
function pruneRunnable(file: ExportPresetsFile): void {
  for (const [platform, presetName] of Object.entries(file.runnable)) {
    const stillThere = file.presets.some(
      p => cfgUnquote(p.main['platform'] ?? '') === platform &&
           cfgUnquote(p.main['name'] ?? '') === cfgUnquote(presetName)
    );
    if (!stillThere) delete file.runnable[platform];
  }
}

export const createExportPresetSchema = {
  name: z.string().describe('Preset name, e.g. "Windows Release"'),
  platform: z.enum(['Windows Desktop', 'Linux', 'macOS', 'Android', 'iOS', 'Web'])
    .describe('Godot export platform name (must match the engine exactly)'),
  export_path: z.string().optional().describe('Output path, e.g. "build/game.exe". Defaults to build/<name><platform extension>.'),
  runnable: z.boolean().optional().default(true).describe('Mark this preset as the runnable one for its platform'),
  export_filter: z.enum(['all_resources', 'scenes', 'resources', 'exclude', 'customized']).optional().default('all_resources')
    .describe('Which resources to include'),
  include_filter: z.string().optional().default('').describe('Comma-separated include globs, e.g. "*.json,*.txt"'),
  exclude_filter: z.string().optional().default('').describe('Comma-separated exclude globs'),
  custom_features: z.string().optional().default('').describe('Comma-separated custom feature tags'),
  dedicated_server: z.boolean().optional().default(false).describe('Export as a dedicated server build'),
  options: z.record(z.string()).optional()
    .describe('Extra [preset.N.options] keys, e.g. {"binary_format/embed_pck":"true"}'),
};

export const updateExportPresetSchema = {
  preset: z.string().describe('Preset name or zero-based index'),
  export_path: z.string().optional().describe('New output path'),
  runnable: z.boolean().optional().describe('Mark/unmark as the runnable preset for its platform'),
  export_filter: z.enum(['all_resources', 'scenes', 'resources', 'exclude', 'customized']).optional(),
  include_filter: z.string().optional(),
  exclude_filter: z.string().optional(),
  custom_features: z.string().optional(),
  dedicated_server: z.boolean().optional(),
  fields: z.record(z.string()).optional().describe('Raw [preset.N] keys to set, e.g. {"seed":"12345"}'),
  options: z.record(z.string()).optional().describe('Raw [preset.N.options] keys to set, e.g. {"texture_format/s3tc_bptc":"true"}'),
};

export const removeExportPresetSchema = {
  preset: z.string().describe('Preset name or zero-based index'),
};

/** Create a new export preset, appending it as the next `[preset.N]`. */
export function handleCreateExportPreset(
  projectRoot: string,
  args: {
    name: string; platform: string; export_path?: string; runnable?: boolean;
    export_filter?: string; include_filter?: string; exclude_filter?: string;
    custom_features?: string; dedicated_server?: boolean; options?: Record<string, string>;
  }
): ToolResult {
  try {
    const ext = EXPORT_PLATFORMS[args.platform];
    if (ext === undefined) {
      return toolError(
        ErrorCode.INVALID_ARGUMENT,
        `Unknown platform "${args.platform}". Valid platforms: ${Object.keys(EXPORT_PLATFORMS).join(', ')}.`
      );
    }

    const { path: presetsPath, file } = loadExportPresets(projectRoot);

    if (findPresetIndex(file, args.name) !== -1) {
      return toolError(
        ErrorCode.ALREADY_EXISTS,
        `A preset named "${args.name}" already exists. Use update_export_preset to modify it.`
      );
    }

    // Default to build/<sanitized name><ext> so the preset is immediately usable.
    const exportPath = args.export_path ?? `build/${args.name.replace(/[^\w.-]+/g, '_')}${ext}`;

    const main: Record<string, string> = {
      name: cfgString(args.name),
      platform: cfgString(args.platform),
      // Legacy flag; load_config() still honours it (see the DISABLE_DEPRECATED
      // branch) and it keeps the file readable by Godot 4.0-4.2.
      runnable: args.runnable === false ? 'false' : 'true',
      dedicated_server: args.dedicated_server ? 'true' : 'false',
      custom_features: cfgString(args.custom_features ?? ''),
      export_filter: cfgString(args.export_filter ?? 'all_resources'),
      include_filter: cfgString(args.include_filter ?? ''),
      exclude_filter: cfgString(args.exclude_filter ?? ''),
      export_path: cfgString(exportPath),
      patches: 'PackedStringArray()',
      encryption_include_filters: '""',
      encryption_exclude_filters: '""',
      seed: '0',
      encrypt_pck: 'false',
      encrypt_directory: 'false',
      script_export_mode: '2',
    };

    // Only seed the two universal option keys; Godot fills in every other
    // platform default the first time the preset is opened.
    const options: Record<string, string> = {
      'custom_template/debug': '""',
      'custom_template/release': '""',
    };
    for (const [k, v] of Object.entries(args.options ?? {})) options[k] = cfgValue(v);

    file.presets.push({ main, options });
    if (args.runnable !== false) file.runnable[args.platform] = cfgString(args.name);

    writeTextFile(presetsPath, serializeExportPresets(file), true);

    const index = file.presets.length - 1;
    return {
      content: [{
        type: 'text',
        text: `Created export preset #${index} "${args.name}"\n` +
          `  platform: ${args.platform}\n` +
          `  export_path: ${exportPath}\n` +
          `  export_filter: ${args.export_filter ?? 'all_resources'}\n` +
          `  runnable: ${args.runnable !== false}\n` +
          `  options: ${Object.keys(options).length} key(s)\n` +
          `Written to export_presets.cfg (${file.presets.length} preset(s) total).`,
      }],
    };
  } catch (err: any) {
    return toolError(ErrorCode.INTERNAL_ERROR, `Error creating export preset: ${err.message}`);
  }
}

/** Update fields and/or options of an existing export preset. */
export function handleUpdateExportPreset(
  projectRoot: string,
  args: {
    preset: string; export_path?: string; runnable?: boolean; export_filter?: string;
    include_filter?: string; exclude_filter?: string; custom_features?: string;
    dedicated_server?: boolean; fields?: Record<string, string>; options?: Record<string, string>;
  }
): ToolResult {
  try {
    const { path: presetsPath, file } = loadExportPresets(projectRoot);
    if (file.presets.length === 0) {
      return toolError(ErrorCode.NOT_FOUND, 'No export_presets.cfg found. Use create_export_preset first.');
    }

    const idx = findPresetIndex(file, args.preset);
    if (idx === -1) {
      const known = file.presets.map((p, i) => `${i}:${cfgUnquote(p.main['name'] ?? '')}`).join(', ');
      return toolError(ErrorCode.NOT_FOUND, `Export preset "${args.preset}" not found. Available: ${known}.`);
    }

    const preset = file.presets[idx];
    const changed: string[] = [];

    // Typed convenience fields.
    const simple: Array<[string, string | undefined]> = [
      ['export_path', args.export_path],
      ['export_filter', args.export_filter],
      ['include_filter', args.include_filter],
      ['exclude_filter', args.exclude_filter],
      ['custom_features', args.custom_features],
    ];
    for (const [key, value] of simple) {
      if (value !== undefined) {
        preset.main[key] = cfgString(value);
        changed.push(`${key}=${value}`);
      }
    }
    if (args.dedicated_server !== undefined) {
      preset.main['dedicated_server'] = args.dedicated_server ? 'true' : 'false';
      changed.push(`dedicated_server=${args.dedicated_server}`);
    }

    if (args.runnable !== undefined) {
      preset.main['runnable'] = args.runnable ? 'true' : 'false';
      const platform = cfgUnquote(preset.main['platform'] ?? '');
      // Godot allows only one runnable preset per platform, so setting this
      // one implicitly clears whichever preset held the slot before.
      if (args.runnable) file.runnable[platform] = preset.main['name'] ?? '""';
      else if (file.runnable[platform] === preset.main['name']) delete file.runnable[platform];
      changed.push(`runnable=${args.runnable}`);
    }

    // Raw escape hatches for keys this schema does not model explicitly.
    for (const [k, v] of Object.entries(args.fields ?? {})) {
      preset.main[k] = cfgValue(v);
      changed.push(`${k}=${v}`);
    }
    for (const [k, v] of Object.entries(args.options ?? {})) {
      preset.options[k] = cfgValue(v);
      changed.push(`options.${k}=${v}`);
    }

    if (changed.length === 0) {
      return toolError(ErrorCode.INVALID_ARGUMENT, 'No changes requested. Pass at least one field or option to update.');
    }

    pruneRunnable(file);
    writeTextFile(presetsPath, serializeExportPresets(file), true);

    return {
      content: [{
        type: 'text',
        text: `Updated export preset #${idx} "${cfgUnquote(preset.main['name'] ?? '')}"\n` +
          changed.map(c => `  ${c}`).join('\n'),
      }],
    };
  } catch (err: any) {
    return toolError(ErrorCode.INTERNAL_ERROR, `Error updating export preset: ${err.message}`);
  }
}

/** Remove an export preset and renumber the remaining ones. */
export function handleRemoveExportPreset(
  projectRoot: string,
  args: { preset: string }
): ToolResult {
  try {
    const { path: presetsPath, file } = loadExportPresets(projectRoot);
    if (file.presets.length === 0) {
      return toolError(ErrorCode.NOT_FOUND, 'No export_presets.cfg found.');
    }

    const idx = findPresetIndex(file, args.preset);
    if (idx === -1) {
      const known = file.presets.map((p, i) => `${i}:${cfgUnquote(p.main['name'] ?? '')}`).join(', ');
      return toolError(ErrorCode.NOT_FOUND, `Export preset "${args.preset}" not found. Available: ${known}.`);
    }

    const removed = cfgUnquote(file.presets[idx].main['name'] ?? '');
    // Splicing renumbers on serialize, which is required: load_config() stops
    // at the first missing preset.N index.
    file.presets.splice(idx, 1);
    pruneRunnable(file);

    writeTextFile(presetsPath, serializeExportPresets(file), true);

    return {
      content: [{
        type: 'text',
        text: `Removed export preset #${idx} "${removed}". ` +
          `${file.presets.length} preset(s) remain (renumbered 0..${Math.max(0, file.presets.length - 1)}).`,
      }],
    };
  } catch (err: any) {
    return toolError(ErrorCode.INTERNAL_ERROR, `Error removing export preset: ${err.message}`);
  }
}


export function handleReadExportPresets(projectRoot: string): ToolResult {
  try {
    const presetsPath = resolveProjectPath(projectRoot, 'export_presets.cfg');
    let content: string;
    try {
      const file = readTextFile(presetsPath);
      content = file.content;
    } catch (err: any) {
      // 区分「确实没有这个文件」与「有但读不了」：把权限/IO 错误说成
      // 「没有 export preset」会让用户以为导出配置丢了。
      if (err?.code === 'ENOENT' || !fs.existsSync(presetsPath)) {
        return {
          content: [{ type: 'text', text: 'No export_presets.cfg found in this project.' }],
        };
      }
      return toolError(ErrorCode.PERMISSION_DENIED, `export_presets.cfg exists but could not be read: ${err?.message ?? String(err)}`);
    }
    const lines = content.split('\n');
    const result: string[] = [];
    let currentPreset = '';
    let presetCount = 0;

    for (const line of lines) {
      const trimmed = line.trim();
      if (trimmed.startsWith('[preset.')) {
        const match = trimmed.match(/\[preset\.\d+\]\s*name\s*=\s*"(.+)"/);
        const matchAlt = trimmed.match(/name\s*=\s*"(.+)"/);
        currentPreset = match?.[1] || matchAlt?.[1] || trimmed.slice(1, -1);
        presetCount++;
        result.push(`\nPreset #${presetCount}: ${currentPreset}`);
      } else if (trimmed.startsWith('platform=') || trimmed.startsWith('export_path=')) {
        const [k, v] = trimmed.split('=').map(s => s.trim());
        result.push(`  ${k}: ${v}`);
      }
    }

    if (result.length === 0) {
      return {
        content: [{ type: 'text', text: 'No export presets found.' }],
      };
    }

    return {
      content: [{ type: 'text', text: `Export Presets:\n${result.join('\n')}` }],
    };
  } catch (err: any) {
        return toolError(ErrorCode.INTERNAL_ERROR, `Error reading export presets: ${err.message}`);
  }
}
