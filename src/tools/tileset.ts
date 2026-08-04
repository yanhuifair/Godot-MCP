// Copyright (c) 2026 FairYan
// SPDX-License-Identifier: AGPL-3.0-or-later
// ============================================================
// Godot MCP Server - TileMap / TileSet Tools
// ============================================================
//
// TileSet is stored as a .tres file with complex nested sub-resources.
// TileMap nodes reference a TileSet resource in .tscn scenes.

import { z } from 'zod';
import { toolError, ErrorCode } from '../utils/errors.js';
import { ToolResult } from '../utils/types.js';
import fs from 'node:fs';
import { readTextFile, writeTextFile, resolveProjectPath, findFilesByExtension } from '../utils/file_utils.js';
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
    return toolError(ErrorCode.INTERNAL_ERROR, `Error: ${err.message}`);
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
            return toolError(ErrorCode.INTERNAL_ERROR, `File is not a TileSet (found: ${doc.header.type})`);
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
    return toolError(ErrorCode.INTERNAL_ERROR, `Error: ${err.message}`);
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
    return toolError(ErrorCode.INTERNAL_ERROR, `Error: ${err.message}`);
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

// ---- Additional TileSet tools (Tier1) ----

export const createTilesetSchema = {
  path: z.string().describe('Output path for new TileSet .tres (e.g. "tilesets/main.tres")'),
  tile_size: z.array(z.number()).optional().default([64, 64]).describe('Tile size [x, y] in pixels'),
};

export function handleCreateTileset(
  projectRoot: string,
  args: { path: string; tile_size?: number[] }
): ToolResult {
  try {
    const ts = args.tile_size || [64, 64];
    const content = `[gd_resource type="TileSet" format=3 uid=""]

[resource]
tile_size = Vector2i(${ts[0]}, ${ts[1]})
`;
    const absPath = resolveProjectPath(projectRoot, args.path);
    writeTextFile(absPath, content, false);
    return { content: [{ type: 'text', text: `TileSet created: ${args.path} (tile_size ${ts[0]}x${ts[1]})` }] };
  } catch (err: any) {
    return toolError(ErrorCode.INTERNAL_ERROR, `Error: ${err.message}`);
  }
}

export const addTilesetSourceSchema = {
  tileset_path: z.string().describe('Path to .tres TileSet file'),
  texture_path: z.string().describe('Path to the tileset atlas texture (e.g. "res://textures/tiles.png")'),
  source_id: z.number().int().optional().describe('Source index (auto-detected if omitted)'),
  tile_size: z.array(z.number()).optional().default([64, 64]).describe('Tile size [x, y] in pixels'),
  margin: z.array(z.number()).optional().default([0, 0]).describe('Atlas margin [x, y]'),
  separation: z.array(z.number()).optional().default([0, 0]).describe('Atlas separation [x, y]'),
};

export function handleAddTilesetSource(
  projectRoot: string,
  args: { tileset_path: string; texture_path: string; source_id?: number; tile_size?: number[]; margin?: number[]; separation?: number[] }
): ToolResult {
  try {
    const absPath = resolveProjectPath(projectRoot, args.tileset_path);
    const { content } = readTextFile(absPath);
    const lines = content.split('\n');

    const rel = args.texture_path.startsWith('res://') ? args.texture_path.slice(6) : args.texture_path;

    // Determine next free source id
    let maxSrc = -1;
    for (const l of lines) {
      const m = l.match(/^sources\/(\d+)\s*=/);
      if (m) maxSrc = Math.max(maxSrc, parseInt(m[1], 10));
    }
    const srcId = args.source_id ?? maxSrc + 1;

    // Reuse an existing texture ext_resource if present
    let texExtId = '';
    for (const l of lines) {
      const m = l.match(/\[ext_resource type="Texture2D" path="res:\/\/([^"]+)" id="([^"]+)"\]/);
      if (m && m[1] === rel) {
        texExtId = m[2];
        break;
      }
    }
    const needTexExt = !texExtId;
    if (needTexExt) texExtId = `1_tex_${srcId}`;

    const subId = `Atlas_${srcId}`;
    const ts = args.tile_size || [64, 64];
    const margin = args.margin || [0, 0];
    const sep = args.separation || [0, 0];

    const out: string[] = [];
    let inserted = false;
    for (let i = 0; i < lines.length; i++) {
      const l = lines[i];
      if (l.startsWith('[resource]') && !inserted) {
        if (needTexExt) out.push(`[ext_resource type="Texture2D" path="res://${rel}" id="${texExtId}"]`);
        out.push(`[sub_resource type="TileSetAtlasSource" id="${subId}"]`);
        out.push(`texture = ExtResource("${texExtId}")`);
        out.push(`atlas_grid_size = Vector2i(${ts[0]}, ${ts[1]})`);
        out.push(`margins = Vector2i(${margin[0]}, ${margin[1]})`);
        out.push(`separation = Vector2i(${sep[0]}, ${sep[1]})`);
        out.push('');
        out.push(l); // [resource]
        out.push(`sources/${srcId} = SubResource("${subId}")`);
        inserted = true;
        continue;
      }
      out.push(l);
    }

    writeTextFile(absPath, out.join('\n'), true);
    return { content: [{ type: 'text', text: `Added atlas source ${srcId} to ${args.tileset_path} (texture: ${args.texture_path})` }] };
  } catch (err: any) {
    return toolError(ErrorCode.INTERNAL_ERROR, `Error: ${err.message}`);
  }
}
