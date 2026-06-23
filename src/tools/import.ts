// ============================================================
// Godot MCP Server - Import File Tools
// ============================================================
//
// .import files are INI-like configs that Godot generates for imported assets.
// They control import settings (compression, sampling, etc.)

import { z } from 'zod';
import { ToolResult } from '../utils/types.js';
import fs from 'node:fs';
import path from 'node:path';
import { resolveProjectPath, findFilesByExtension, writeTextFile } from '../utils/file_utils.js';

// ---- Tool Schemas ----

export const readImportConfigSchema = {
  asset_path: z.string().describe('Path to the source asset file (e.g. "sprites/hero.png") — the .import file is derived automatically'),
};

export const listImportFilesSchema = {
  path: z.string().optional().default('').describe('Subdirectory to search (default: root)'),
  type_filter: z.string().optional().describe('Filter by imported asset type (e.g. "png", "wav", "obj")'),
};

export const writeImportConfigSchema = {
  asset_path: z.string().describe('Path to the source asset file'),
  settings: z.record(z.string()).describe('Import settings to write (key=value in the [params] section)'),
};

// ---- Helpers ----

interface ImportConfig {
  remap: Record<string, string>;  // [remap] section
  deps: Record<string, string>;   // [deps] section
  params: Record<string, string>; // [params] section
}

function parseImportFile(content: string): ImportConfig {
  const result: ImportConfig = { remap: {}, deps: {}, params: {} };
  let currentSection: 'remap' | 'deps' | 'params' | null = null;

  for (const rawLine of content.split('\n')) {
    const line = rawLine.trim();
    if (!line || line.startsWith(';')) continue;

    if (line.startsWith('[') && line.endsWith(']')) {
      const section = line.slice(1, -1).trim();
      switch (section) {
        case 'remap': currentSection = 'remap'; break;
        case 'deps': currentSection = 'deps'; break;
        case 'params': currentSection = 'params'; break;
        default: currentSection = null;
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

function serializeImportFile(config: ImportConfig): string {
  const lines: string[] = [];

  if (Object.keys(config.remap).length > 0) {
    lines.push('[remap]');
    for (const [k, v] of Object.entries(config.remap)) {
      lines.push(`${k}=${v}`);
    }
    lines.push('');
  }

  if (Object.keys(config.deps).length > 0) {
    lines.push('[deps]');
    for (const [k, v] of Object.entries(config.deps)) {
      lines.push(`${k}=${v}`);
    }
    lines.push('');
  }

  if (Object.keys(config.params).length > 0) {
    lines.push('[params]');
    for (const [k, v] of Object.entries(config.params)) {
      lines.push(`${k}=${v}`);
    }
    lines.push('');
  }

  return lines.join('\n').trim();
}

// ---- Tool Handlers ----

/**
 * Read .import configuration for a specific asset.
 */
export function handleReadImportConfig(
  projectRoot: string,
  args: { asset_path: string }
): ToolResult {
  try {
    const importFilePath = args.asset_path + '.import';
    const absPath = resolveProjectPath(projectRoot, importFilePath);

    if (!fs.existsSync(absPath)) {
      return {
        content: [{ type: 'text', text: `No .import file found for "${args.asset_path}". The asset may not be imported yet — open it in the Godot editor first.` }],
        isError: true,
      };
    }

    const content = fs.readFileSync(absPath, 'utf-8');
    const config = parseImportFile(content);

    const lines: string[] = [];
    lines.push(`Import config: ${args.asset_path}`);
    lines.push(`File: ${importFilePath}`);

    if (Object.keys(config.remap).length > 0) {
      lines.push(`\n[remap]`);
      for (const [k, v] of Object.entries(config.remap)) {
        lines.push(`  ${k} = ${v}`);
      }
    }

    if (Object.keys(config.deps).length > 0) {
      lines.push(`\n[deps]`);
      for (const [k, v] of Object.entries(config.deps)) {
        lines.push(`  ${k} = ${v}`);
      }
    }

    if (Object.keys(config.params).length > 0) {
      lines.push(`\n[params]`);
      for (const [k, v] of Object.entries(config.params)) {
        lines.push(`  ${k} = ${v}`);
      }
    }

    return { content: [{ type: 'text', text: lines.join('\n') }] };
  } catch (err: any) {
    return { content: [{ type: 'text', text: `Error: ${err.message}` }], isError: true };
  }
}

/**
 * List all .import files in the project, grouped by asset type.
 */
export function handleListImportFiles(
  projectRoot: string,
  args: { path?: string; type_filter?: string }
): ToolResult {
  try {
    const importFiles = findFilesByExtension(projectRoot, ['.import'], args.path || '');

    if (importFiles.length === 0) {
      return { content: [{ type: 'text', text: 'No .import files found.' }] };
    }

    // Group by source file extension
    const byType: Record<string, { source: string; importFile: string }[]> = {};

    for (const imp of importFiles) {
      const sourcePath = imp.replace(/\.import$/, '');
      const ext = path.extname(sourcePath).toLowerCase().replace('.', '') || '(unknown)';

      if (args.type_filter && ext !== args.type_filter.toLowerCase()) continue;

      if (!byType[ext]) byType[ext] = [];
      byType[ext].push({ source: sourcePath, importFile: imp });
    }

    const lines: string[] = [];
    let total = 0;
    for (const [ext, files] of Object.entries(byType).sort()) {
      lines.push(`\n${ext.toUpperCase()} (${files.length}):`);
      files.sort((a, b) => a.source.localeCompare(b.source));
      for (const f of files) {
        lines.push(`  ${f.source}`);
        total++;
      }
    }

    const prefix = `Import files: ${total} asset(s) across ${Object.keys(byType).length} type(s)`;
    return { content: [{ type: 'text', text: prefix + lines.join('\n') }] };
  } catch (err: any) {
    return { content: [{ type: 'text', text: `Error: ${err.message}` }], isError: true };
  }
}

/**
 * Write settings to an asset's .import file.
 */
export function handleWriteImportConfig(
  projectRoot: string,
  args: { asset_path: string; settings: Record<string, string> }
): ToolResult {
  try {
    const importFilePath = args.asset_path + '.import';
    const absPath = resolveProjectPath(projectRoot, importFilePath);

    let config: ImportConfig;

    if (fs.existsSync(absPath)) {
      const content = fs.readFileSync(absPath, 'utf-8');
      config = parseImportFile(content);
    } else {
      // Create a minimal .import file
      const ext = path.extname(args.asset_path).toLowerCase();
      const importer = inferImporter(ext);
      config = {
        remap: { importer, type: 'Resource' },
        deps: { 'source_file': `res://${args.asset_path}` },
        params: {},
      };
    }

    // Merge settings into params
    Object.assign(config.params, args.settings);

    const serialized = serializeImportFile(config);
    writeTextFile(absPath, serialized, true);

    // Update the corresponding .godot/imported file timestamp to force reimport
    // (This is a hint; Godot may need a re-import trigger)

    return {
      content: [{ type: 'text', text: `Import config updated: ${args.asset_path} (${Object.keys(args.settings).length} settings)` }],
    };
  } catch (err: any) {
    return { content: [{ type: 'text', text: `Error: ${err.message}` }], isError: true };
  }
}

function inferImporter(ext: string): string {
  switch (ext) {
    case '.png': case '.jpg': case '.jpeg': case '.webp': case '.bmp': case '.tga':
    case '.svg': case '.svgz':
      return 'texture';
    case '.wav': case '.ogg': case '.mp3':
      return 'audio';
    case '.obj': case '.fbx': case '.glb': case '.gltf': case '.blend':
      return 'scene';
    case '.ttf': case '.otf': case '.woff':
      return 'font_data';
    default:
      return 'keep';
  }
}
