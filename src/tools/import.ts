// Copyright (c) 2026 FairYan
// SPDX-License-Identifier: MIT
// ============================================================
// Godot MCP Server - Import File Tools
// ============================================================
//
// .import files are INI-like configs that Godot generates for imported assets.
// They control import settings (compression, sampling, etc.)

import { z } from 'zod';
import { toolError, ErrorCode } from '../utils/errors.js';
import { ToolResult } from '../utils/types.js';
import fs from 'node:fs';
import path from 'node:path';
import { resolveProjectPath, findFilesByExtension, writeTextFile } from '../utils/file_utils.js';
import { ImportConfig, parseImportConfig, serializeImportConfig } from '../utils/import_parser.js';

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
            return toolError(ErrorCode.INTERNAL_ERROR, `No .import file found for "${args.asset_path}". The asset may not be imported yet — open it in the Godot editor first.`);
    }

    const content = fs.readFileSync(absPath, 'utf-8');
    const config = parseImportConfig(content);

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
    return toolError(ErrorCode.INTERNAL_ERROR, `Error: ${err.message}`);
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
    return toolError(ErrorCode.INTERNAL_ERROR, `Error: ${err.message}`);
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
      config = parseImportConfig(content);
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

    const serialized = serializeImportConfig(config);
    writeTextFile(absPath, serialized, true);

    // Update the corresponding .godot/imported file timestamp to force reimport
    // (This is a hint; Godot may need a re-import trigger)

    return {
      content: [{ type: 'text', text: `Import config updated: ${args.asset_path} (${Object.keys(args.settings).length} settings)` }],
    };
  } catch (err: any) {
    return toolError(ErrorCode.INTERNAL_ERROR, `Error: ${err.message}`);
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
