// ============================================================
// Godot MCP Server - Texture / Asset Info Tools
// ============================================================

import { z } from 'zod';
import { ToolResult } from '../utils/types.js';
import fs from 'node:fs';
import path from 'node:path';
import { resolveProjectPath } from '../utils/file_utils.js';

// ---- Tool Schemas ----

export const readTextureInfoSchema = {
  path: z.string().describe('Path to texture asset (e.g. "sprites/hero.png")'),
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
    return { content: [{ type: 'text', text: `Error: ${err.message}` }], isError: true };
  }
}

// ---- Helpers ----

interface ImportConfig {
  remap: Record<string, string>;
  deps: Record<string, string>;
  params: Record<string, string>;
}

function parseImportConfig(content: string): ImportConfig {
  const config: ImportConfig = { remap: {}, deps: {}, params: {} };
  let section: keyof ImportConfig | null = null;

  for (const line of content.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith(';')) continue;

    if (trimmed.startsWith('[') && trimmed.endsWith(']')) {
      section = trimmed.slice(1, -1) as keyof ImportConfig;
      continue;
    }

    const eq = trimmed.indexOf('=');
    if (eq > 0 && section) {
      let key = trimmed.slice(0, eq).trim();
      let value = trimmed.slice(eq + 1).trim();
      if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
        value = value.slice(1, -1);
      }
      config[section][key] = value;
    }
  }

  return config;
}

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
