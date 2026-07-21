// Copyright (c) 2026 FairYan
// SPDX-License-Identifier: MIT
// ============================================================
// Godot MCP Server - TileMap / TileSet Tools
// ============================================================
//
// TileSet is stored as a .tres file with complex nested sub-resources.
// TileMap nodes reference a TileSet resource in .tscn scenes.

import { z } from 'zod';
import { ToolResult } from '../utils/types.js';
import fs from 'node:fs';
import { readTextFile, resolveProjectPath, findFilesByExtension } from '../utils/file_utils.js';
import { parseResource } from '../parsers/resource_parser.js';
import { parseScene } from '../parsers/scene_parser.js';

// ---- Tool Schemas ----

export const listTilesetsSchema = {
  path: z.string().optional().default('').describe('Subdirectory to search'),
};

export const readTilesetSchema = {
  path: z.string().describe('Path to .tres TileSet file'),
};

export const readTilemapSchema = {
  scene_path: z.string().describe('Path to .tscn scene containing TileMapLayer nodes'),
};

// ---- Tool Handlers ----

export function handleListTilesets(
  projectRoot: string,
  args: { path?: string }
): ToolResult {
  try {
    const tresFiles = findFilesByExtension(projectRoot, ['.tres'], args.path || '');

    const tilesets: { path: string; tileCount: string }[] = [];
    for (const f of tresFiles) {
      try {
        const absPath = resolveProjectPath(projectRoot, f);
        const { content } = readTextFile(absPath);
        const doc = parseResource(content);
        if (doc.header.type === 'TileSet') {
          tilesets.push({
            path: f,
            tileCount: doc.resource['tile_count'] || '0',
          });
        }
      } catch { /* skip */ }
    }

    if (tilesets.length === 0) {
      return { content: [{ type: 'text', text: 'No TileSet resources found.' }] };
    }

    const lines: string[] = [];
    lines.push(`TileSets (${tilesets.length}):`);
    tilesets.sort((a, b) => a.path.localeCompare(b.path));
    for (const t of tilesets) {
      lines.push(`  ${t.path}  (tiles: ${t.tileCount})`);
    }

    return { content: [{ type: 'text', text: lines.join('\n') }] };
  } catch (err: any) {
    return { content: [{ type: 'text', text: `Error: ${err.message}` }], isError: true };
  }
}

export function handleReadTileset(
  projectRoot: string,
  args: { path: string }
): ToolResult {
  try {
    const absPath = resolveProjectPath(projectRoot, args.path);
    const { content } = readTextFile(absPath);
    const doc = parseResource(content);

    if (doc.header.type !== 'TileSet') {
      return {
        content: [{ type: 'text', text: `File is not a TileSet (found: ${doc.header.type})` }],
        isError: true,
      };
    }

    const lines: string[] = [];
    lines.push(`TileSet: ${args.path}`);
    lines.push('');

    // TileSet properties
    if (Object.keys(doc.resource).length > 0) {
      lines.push('Properties:');
      for (const [key, val] of Object.entries(doc.resource)) {
        const label = tilesetPropLabel(key);
        lines.push(`  ${key} = ${val}${label ? `  # ${label}` : ''}`);
      }
      lines.push('');
    }

    // Sub-resources contain tile definitions, physics shapes, navigation, etc.
    if (doc.subResources.length > 0) {
      // Count resource types
      const typeCounts: Record<string, number> = {};
      for (const sub of doc.subResources) {
        typeCounts[sub.type] = (typeCounts[sub.type] || 0) + 1;
      }

      lines.push(`Sub-Resources (${doc.subResources.length}):`);
      for (const [type, count] of Object.entries(typeCounts).sort()) {
        lines.push(`  ${type}: ${count}`);
      }
      lines.push('');

      // Show first few sub-resources in detail
      const detailCount = Math.min(doc.subResources.length, 10);
      lines.push(`First ${detailCount} sub-resources:`);
      for (const sub of doc.subResources.slice(0, detailCount)) {
        lines.push(`  [${sub.id}] ${sub.type}`);
        for (const [key, val] of Object.entries(sub.properties).slice(0, 5)) {
          lines.push(`    ${key} = ${val}`);
        }
        if (Object.keys(sub.properties).length > 5) {
          lines.push(`    ... (${Object.keys(sub.properties).length} properties total)`);
        }
      }

      if (doc.subResources.length > detailCount) {
        lines.push(`  ... and ${doc.subResources.length - detailCount} more`);
      }
    }

    return { content: [{ type: 'text', text: lines.join('\n') }] };
  } catch (err: any) {
    return { content: [{ type: 'text', text: `Error: ${err.message}` }], isError: true };
  }
}

export function handleReadTilemap(
  projectRoot: string,
  args: { scene_path: string }
): ToolResult {
  try {
    const absPath = resolveProjectPath(projectRoot, args.scene_path);
    const { content } = readTextFile(absPath);
    const doc = parseScene(content);

    // Find TileMapLayer nodes
    const tilemapLayers: any[] = [];
    function walk(nodes: any[]): void {
      for (const node of nodes) {
        if (node.type === 'TileMapLayer' || node.type === 'TileMap') {
          tilemapLayers.push(node);
        }
        if (node.children) walk(node.children);
      }
    }
    walk(doc.nodes);

    if (tilemapLayers.length === 0) {
      return { content: [{ type: 'text', text: `No TileMapLayer nodes found in ${args.scene_path}` }] };
    }

    const lines: string[] = [];
    lines.push(`Scene: ${args.scene_path}`);
    lines.push(`TileMap Layers: ${tilemapLayers.length}`);
    lines.push('');

    for (const layer of tilemapLayers) {
      lines.push(`  [${layer.name}] (${layer.type})`);
      for (const [key, val] of Object.entries(layer.properties)) {
        if (key === 'tile_map_data') {
          const valStr = String(val);
          const preview = valStr.length > 200 ? valStr.slice(0, 200) + '...' : valStr;
          lines.push(`    tile_map_data = ${preview}`);
        } else {
          lines.push(`    ${key} = ${val}`);
        }
      }
      lines.push('');
    }

    // Also check ext_resources for TileSet references
    const tilesetExts = doc.extResources.filter(e => e.type === 'TileSet');
    if (tilesetExts.length > 0) {
      lines.push('TileSet References:');
      for (const ext of tilesetExts) {
        lines.push(`  [${ext.id}] ${ext.path}`);
      }
    }

    return { content: [{ type: 'text', text: lines.join('\n') }] };
  } catch (err: any) {
    return { content: [{ type: 'text', text: `Error: ${err.message}` }], isError: true };
  }
}

// ---- Helpers ----

function tilesetPropLabel(key: string): string {
  const labels: Record<string, string> = {
    tile_size: 'Tile size (pixels)',
    tile_shape: 'Tile shape (0=square, 1=isometric, 2=hex)',
    tile_layout: 'Tile layout',
    occlusion_layers: 'Occlusion layers',
    terrain_sets: 'Terrain sets',
    physics_layers: 'Physics layers',
    navigation_layers: 'Navigation layers',
    custom_data_layers: 'Custom data layers',
  };
  return labels[key] || '';
}
