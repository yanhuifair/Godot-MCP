// Copyright (c) 2026 FairYan
// SPDX-License-Identifier: MIT
// ============================================================
// Godot MCP Server - Texture / Asset Info Tools
// ============================================================

import { z } from 'zod';
import { toolError, ErrorCode } from '../utils/errors.js';
import { ToolResult } from '../utils/types.js';
import fs from 'node:fs';
import path from 'node:path';
import { resolveProjectPath, findFilesByExtension, writeTextFile } from '../utils/file_utils.js';
import { parseImportConfig } from '../utils/import_parser.js';

// ---- Tool Schemas ----

export const readTextureInfoSchema = {
  path: z.string().describe('Path to texture asset (e.g. "sprites/hero.png")'),
};

export const listTexturesSchema = {
  path: z.string().optional().default('').describe('Subdirectory to search (default: root)'),
};

export const createImageTextureSchema = {
  path: z.string().describe('Output .tres path for the new ImageTexture (e.g. "textures/hero_tex.tres")'),
  source: z.string().describe('Source image path relative to project (e.g. "sprites/hero.png")'),
};

export const setTextureImportFlagsSchema = {
  path: z.string().describe('Image asset path (e.g. "sprites/hero.png"); modifies its .import config'),
  flags: z.record(z.string()).describe('Import params to set, e.g. {"compress/mode": "2", "process/size_limit": "512"}'),
};

// ---- Tool Handlers ----

export function handleReadTextureInfo(
  projectRoot: string,
  args: { path: string }
): ToolResult {
  try {
    const absPath = resolveProjectPath(projectRoot, args.path);

    const lines: string[] = [];
    lines.push(`Texture: ${args.path}`);

    // File stats
    const stat = fs.statSync(absPath);
    const sizeKB = Math.round(stat.size / 1024);
    const ext = path.extname(args.path).toLowerCase();

    lines.push(`File size: ${sizeKB} KB`);
    lines.push(`Modified: ${stat.mtime.toISOString()}`);
    lines.push('');

    // Read .import config
    const importPath = absPath + '.import';
    if (fs.existsSync(importPath)) {
      const importContent = fs.readFileSync(importPath, 'utf-8');
      const config = parseImportConfig(importContent);

      lines.push('Import Settings:');
      if (config.params['compress/mode']) {
        lines.push(`  Compression: ${importLabel('compress/mode', config.params['compress/mode'])}`);
      }
      if (config.params['compress/high_quality']) {
        lines.push(`  High quality: ${config.params['compress/high_quality']}`);
      }
      if (config.params['process/fix_alpha_border']) {
        lines.push(`  Fix alpha border: ${config.params['process/fix_alpha_border']}`);
      }
      if (config.params['process/premult_alpha']) {
        lines.push(`  Premultiply alpha: ${config.params['process/premult_alpha']}`);
      }
      if (config.params['process/HDR_as_SRGB']) {
        lines.push(`  HDR as sRGB: ${config.params['process/HDR_as_SRGB']}`);
      }
      if (config.params['process/size_limit']) {
        lines.push(`  Size limit: ${config.params['process/size_limit']}`);
      }
      if (config.params['svg/scale']) {
        lines.push(`  SVG scale: ${config.params['svg/scale']}`);
      }
      if (config.params['detect_3d/compress_to']) {
        lines.push(`  3D compress to: ${config.params['detect_3d/compress_to']}`);
      }

      // Show all params
      lines.push('');
      lines.push('All import params:');
      for (const [key, val] of Object.entries(config.params).sort()) {
        lines.push(`  ${key} = ${val}`);
      }

      // Show remap
      if (Object.keys(config.remap).length > 0) {
        lines.push('');
        lines.push('Remap:');
        for (const [key, val] of Object.entries(config.remap)) {
          lines.push(`  ${key} = ${val}`);
        }
      }

      // Source deps
      if (Object.keys(config.deps).length > 0) {
        lines.push('');
        lines.push('Dependencies:');
        for (const [key, val] of Object.entries(config.deps)) {
          lines.push(`  ${key} = ${val}`);
        }
      }
    } else {
      lines.push('Import: Not yet imported (open in Godot editor first)');
    }

    // Try to detect dimensions for common formats
    if (ext === '.png') {
      try {
        const buf = fs.readFileSync(absPath);
        const dimensions = getPngDimensions(buf);
        if (dimensions) {
          lines.push('');
          lines.push(`Dimensions: ${dimensions.width}×${dimensions.height} px`);
        }
      } catch { /* can't read dimensions */ }
    }

    return { content: [{ type: 'text', text: lines.join('\n') }] };
  } catch (err: any) {
    return toolError(ErrorCode.INTERNAL_ERROR, `Error: ${err.message}`);
  }
}

// ---- Helpers ----

function getPngDimensions(buffer: Buffer): { width: number; height: number } | null {
  try {
    if (buffer.toString('ascii', 1, 4) !== 'PNG') return null;
    const width = buffer.readUInt32BE(16);
    const height = buffer.readUInt32BE(20);
    return { width, height };
  } catch {
    return null;
  }
}

function importLabel(key: string, value: string): string {
  const labels: Record<string, Record<string, string>> = {
    'compress/mode': {
      '0': 'Lossless',
      '1': 'Lossy',
      '2': 'VRAM Compressed',
      '3': 'VRAM Uncompressed',
      '4': 'Basis Universal',
    },
  };
  const map = labels[key];
  return map ? `${value} (${map[value] || 'unknown'})` : value;
}

// ---- Texture listing / creation / import flags ----

export function handleListTextures(
  projectRoot: string,
  args: { path?: string }
): ToolResult {
  try {
    const exts = ['.png', '.jpg', '.jpeg', '.webp', '.svg', '.bmp', '.hdr', '.exr', '.tga', '.dds'];
    const files = findFilesByExtension(projectRoot, exts, args.path || '', true);
    if (files.length === 0) return { content: [{ type: 'text', text: 'No texture assets found.' }] };
    const byExt: Record<string, string[]> = {};
    for (const f of files) {
      const e = f.slice(f.lastIndexOf('.')).toLowerCase();
      (byExt[e] ||= []).push(f);
    }
    const lines: string[] = [`Textures (${files.length}):`, ''];
    for (const e of Object.keys(byExt).sort()) {
      lines.push(`  ${e} (${byExt[e].length}):`);
      byExt[e].sort().forEach(f => lines.push(`    ${f}`));
    }
    return { content: [{ type: 'text', text: lines.join('\n') }] };
  } catch (err: any) {
    return toolError(ErrorCode.INTERNAL_ERROR, `Error: ${err.message}`);
  }
}

export function handleCreateImageTexture(
  projectRoot: string,
  args: { path: string; source: string }
): ToolResult {
  try {
    const src = args.source.startsWith('res://') ? args.source : `res://${args.source.replace(/^\/+/, '')}`;
    const content = `[gd_resource type="ImageTexture" format=3 uid=""]

[sub_resource type="Image" id="Image_1"]
resource_path = "${src}"

[resource]
image = SubResource("Image_1")
`;
    const absPath = resolveProjectPath(projectRoot, args.path);
    writeTextFile(absPath, content, false);
    return { content: [{ type: 'text', text: `ImageTexture created: ${args.path} (source: ${src})` }] };
  } catch (err: any) {
    return toolError(ErrorCode.INTERNAL_ERROR, `Error: ${err.message}`);
  }
}

export function handleSetTextureImportFlags(
  projectRoot: string,
  args: { path: string; flags: Record<string, string> }
): ToolResult {
  try {
    if (!args.flags || Object.keys(args.flags).length === 0) {
      return toolError(ErrorCode.INVALID_ARGUMENT, 'flags must not be empty.');
    }
    const absPath = resolveProjectPath(projectRoot, args.path);
    const importPath = absPath + '.import';
    if (!fs.existsSync(importPath)) return toolError(ErrorCode.FILE_NOT_FOUND, `No .import config for ${args.path} (import it in Godot first).`);
    const raw = fs.readFileSync(importPath, 'utf-8');
    const lines = raw.split('\n');
    let inParams = false;
    let set: Record<string, string> = { ...args.flags };
    const out: string[] = [];
    for (const line of lines) {
      const trim = line.trim();
      if (trim === '[params]') {
        inParams = true;
        out.push(line);
        continue;
      }
      if (inParams && trim.startsWith('[') && trim.endsWith(']') && trim !== '[params]') {
        // section ended; flush remaining flags not yet written
        for (const [k, v] of Object.entries(set)) out.push(`${k}=${v}`);
        set &&= {};
        inParams = false;
        out.push(line);
        continue;
      }
      if (inParams) {
        const eq = line.indexOf('=');
        if (eq > 0) {
          const key = line.slice(0, eq).trim();
          if (key in set) { out.push(`${key}=${set[key]}`); delete set[key]; continue; }
        }
        out.push(line);
        continue;
      }
      out.push(line);
    }
    // If [params] never appeared or flags remain at EOF
    if (Object.keys(set).length > 0) {
      out.push('[params]');
      for (const [k, v] of Object.entries(set)) out.push(`${k}=${v}`);
    }
    writeTextFile(importPath, out.join('\n'), true);
    return { content: [{ type: 'text', text: `Updated import flags for ${args.path} (${Object.keys(args.flags).length} params).` }] };
  } catch (err: any) {
    return toolError(ErrorCode.INTERNAL_ERROR, `Error: ${err.message}`);
  }
}
