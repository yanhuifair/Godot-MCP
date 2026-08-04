// Copyright (c) 2026 FairYan
// SPDX-License-Identifier: AGPL-3.0-or-later
// ============================================================
// Godot MCP Server - Project Utility & Resource Tools
// ============================================================
// Signal list, project icon, version compat, AtlasTexture, StyleBox reader,
// popup list

import { z } from 'zod';
import { toolError, ErrorCode } from '../utils/errors.js';
import { ToolResult } from '../utils/types.js';
import fs from 'node:fs';
import { readTextFile, resolveProjectPath, findFilesByExtension, writeTextFile } from '../utils/file_utils.js';
import { parseScene } from '../parsers/scene_parser.js';
import { parseResource } from '../parsers/resource_parser.js';

function walk(nodes: any[], types: string[]): any[] {
  const r: any[] = [];
  for (const n of nodes) { if (types.includes(n.type)) r.push(n); if (n.children) r.push(...walk(n.children, types)); }
  return r;
}

// ---- Schemas ----

export const listAllSignalsSchema = {
  scene_path: z.string().optional().describe('Filter to scene'),
  signal_name: z.string().optional().describe('Filter by signal name'),
};

export const readProjectIconSchema = {};

export const readStyleboxSchema = {
  path: z.string().describe('Path to StyleBox .tres file'),
};

export const createAtlasTextureSchema = {
  path: z.string().describe('Output path (e.g. "textures/sprite_atlas.tres")'),
  atlas_texture: z.string().describe('Path to source texture'),
  region: z.array(z.number()).optional().describe('[x, y, w, h] region rect'),
};

export const listPopupsSchema = {
  scene_path: z.string().optional().describe('Filter to scene'),
};

export const generateCohesionReportSchema = {};

// ---- Signal List ----

export function handleListAllSignals(
  projectRoot: string,
  args: { scene_path?: string; signal_name?: string }
): ToolResult {
  try {
    const sceneFiles = args.scene_path ? [args.scene_path] : findFilesByExtension(projectRoot, ['.tscn']);

    const allConns: { scene: string; signal: string; from: string; to: string; method: string }[] = [];

    for (const relPath of sceneFiles) {
      const absPath = resolveProjectPath(projectRoot, relPath);
      const { content } = readTextFile(absPath);
      const doc = parseScene(content);

      for (const conn of doc.connections) {
        if (args.signal_name && conn.signal !== args.signal_name) continue;
        allConns.push({
          scene: relPath, signal: conn.signal,
          from: conn.from, to: conn.to, method: conn.method,
        });
      }
    }

    if (allConns.length === 0) {
      const filter = args.signal_name ? ` "${args.signal_name}"` : '';
      return { content: [{ type: 'text', text: `No signal connections${filter} found.` }] };
    }

    const lines: string[] = [
      `Signal Connections (${allConns.length}):`,
      '',
    ];

    // Group by signal name
    const bySignal: Record<string, typeof allConns> = {};
    for (const c of allConns) (bySignal[c.signal] ||= []).push(c);

    for (const [signal, conns] of Object.entries(bySignal).sort()) {
      lines.push(`  [${signal}] (${conns.length}):
`);
      conns.forEach(c => {
        lines.push(`    ${c.scene}: ${c.from} → ${c.to}.${c.method}()`);
      });
      lines.push('');
    }

    return { content: [{ type: 'text', text: lines.join('\n') }] };
  } catch (err: any) {
    return toolError(ErrorCode.INTERNAL_ERROR, `Error: ${err.message}`);
  }
}

// ---- Project Icon ----

export function handleReadProjectIcon(projectRoot: string): ToolResult {
  try {
    const projPath = resolveProjectPath(projectRoot, 'project.godot');
    const { content } = readTextFile(projPath);

    const iconMatch = content.match(/config\/icon\s*=\s*"([^"]+)"/);
    const nameMatch = content.match(/config\/name\s*=\s*"([^"]+)"/);
    const descMatch = content.match(/config\/description\s*=\s*"([^"]*)"/);
    const versionMatch = content.match(/config\/version\s*=\s*"([^"]+)"/);

    const lines: string[] = ['Project Identity'];
    lines.push(`  Name: ${nameMatch ? nameMatch[1] : '(not set)'}`);
    if (descMatch) lines.push(`  Description: ${descMatch[1] || '(empty)'}`);
    if (versionMatch) lines.push(`  Version: ${versionMatch[1]}`);
    lines.push(`  Icon: ${iconMatch ? iconMatch[1] : '(not set)'}`);

    // Check if icon file exists
    if (iconMatch) {
      const iconPath = resolveProjectPath(projectRoot, iconMatch[1]);
      if (fs.existsSync(iconPath)) {
        const stat = fs.statSync(iconPath);
        lines.push(`  Icon size: ${Math.round(stat.size / 1024)} KB`);
      } else {
        lines.push(`  Icon: FILE NOT FOUND — ${iconMatch[1]}`);
      }
    }

    return { content: [{ type: 'text', text: lines.join('\n') }] };
  } catch (err: any) {
    return toolError(ErrorCode.INTERNAL_ERROR, `Error: ${err.message}`);
  }
}

// ---- StyleBox Reader ----

export function handleReadStylebox(
  projectRoot: string,
  args: { path: string }
): ToolResult {
  try {
    const absPath = resolveProjectPath(projectRoot, args.path);
    const { content } = readTextFile(absPath);
    const doc = parseResource(content);

    const lines: string[] = [];
    lines.push(`StyleBox: ${doc.header.type}`);
    lines.push(`File: ${args.path}`);
    lines.push('');

    const labels: Record<string, string> = {
      bg_color: 'Background color',
      border_color: 'Border color',
      border_width_left: 'Border left (px)',
      border_width_right: 'Border right (px)',
      border_width_top: 'Border top (px)',
      border_width_bottom: 'Border bottom (px)',
      corner_radius_top_left: 'Corner TL',
      corner_radius_top_right: 'Corner TR',
      corner_radius_bottom_left: 'Corner BL',
      corner_radius_bottom_right: 'Corner BR',
      corner_detail: 'Corner detail',
      expand_margin_left: 'Expand margin left',
      expand_margin_right: 'Expand margin right',
      expand_margin_top: 'Expand margin top',
      expand_margin_bottom: 'Expand margin bottom',
      content_margin_left: 'Content margin left',
      content_margin_right: 'Content margin right',
      content_margin_top: 'Content margin top',
      content_margin_bottom: 'Content margin bottom',
      shadow_size: 'Shadow size',
      shadow_color: 'Shadow color',
      shadow_offset: 'Shadow offset',
      texture: 'Texture',
      texture_margin_left: 'Texture margin left',
      texture_margin_right: 'Texture margin right',
      texture_margin_top: 'Texture margin top',
      texture_margin_bottom: 'Texture margin bottom',
      axis_stretch_horizontal: 'H-stretch axis',
      axis_stretch_vertical: 'V-stretch axis',
      draw_center: 'Draw center',
      modulate_color: 'Modulate color',
      region_rect: 'Region rect',
      anti_aliasing: 'Anti-aliasing',
      anti_aliasing_size: 'AA size',
    };

    for (const [key, val] of Object.entries(doc.resource)) {
      const label = labels[key] ? `  # ${labels[key]}` : '';
      lines.push(`  ${key} = ${val}${label}`);
    }

    return { content: [{ type: 'text', text: lines.join('\n') }] };
  } catch (err: any) {
    return toolError(ErrorCode.INTERNAL_ERROR, `Error: ${err.message}`);
  }
}

// ---- AtlasTexture ----

export function handleCreateAtlasTexture(
  projectRoot: string,
  args: { path: string; atlas_texture: string; region?: number[] }
): ToolResult {
  try {
    const region = args.region || [0, 0, 64, 64];
    const template = `[gd_resource type="AtlasTexture" format=3 uid=""]

[resource]
atlas = ExtResource("1_atlas")
region = Rect2(${region[0]}, ${region[1]}, ${region[2]}, ${region[3]})
`;

    const absPath = resolveProjectPath(projectRoot, args.path);
    writeTextFile(absPath, template, false);

    return { content: [{ type: 'text', text: `AtlasTexture created: ${args.path}\n  Atlas: ${args.atlas_texture}\n  Region: [${region.join(', ')}]` }] };
  } catch (err: any) {
    return toolError(ErrorCode.INTERNAL_ERROR, `Error: ${err.message}`);
  }
}

// ---- Popup List ----

export function handleListPopups(
  projectRoot: string,
  args: { scene_path?: string }
): ToolResult {
  try {
    const types = ['Popup', 'PopupMenu', 'PopupPanel', 'Window', 'AcceptDialog', 'ConfirmationDialog', 'FileDialog'];
    const sceneFiles = args.scene_path ? [args.scene_path] : findFilesByExtension(projectRoot, ['.tscn']);

    const popups: { scene: string; name: string; type: string; visible: string }[] = [];

    for (const relPath of sceneFiles) {
      const absPath = resolveProjectPath(projectRoot, relPath);
      const { content } = readTextFile(absPath);
      const doc = parseScene(content);

      for (const node of walk(doc.nodes, types)) {
        popups.push({
          scene: relPath, name: node.name, type: node.type,
          visible: node.properties['visible'] || 'false',
        });
      }
    }

    if (popups.length === 0) return { content: [{ type: 'text', text: 'No Popup/Window/Dialog nodes found.' }] };

    const byType: Record<string, typeof popups> = {};
    for (const p of popups) (byType[p.type] ||= []).push(p);

    const lines: string[] = [`Popups & Dialogs (${popups.length}):`, ''];
    for (const [type, items] of Object.entries(byType).sort()) {
      lines.push(`  ${type} (${items.length}):`);
      items.forEach(p => lines.push(`    ${p.scene} → ${p.name}`));
    }

    return { content: [{ type: 'text', text: lines.join('\n') }] };
  } catch (err: any) {
    return toolError(ErrorCode.INTERNAL_ERROR, `Error: ${err.message}`);
  }
}

// ---- Cohesion Report ----

export function handleGenerateCohesionReport(projectRoot: string): ToolResult {
  try {
    const sceneFiles = findFilesByExtension(projectRoot, ['.tscn']);
    const scriptFiles = findFilesByExtension(projectRoot, ['.gd']);

    let totalNodes = 0;
    let totalConnections = 0;
    let totalExtRefs = 0;
    const nodeTypeCounts: Record<string, number> = {};
    const signalCounts: Record<string, number> = {};

    for (const relPath of sceneFiles) {
      try {
        const absPath = resolveProjectPath(projectRoot, relPath);
        const { content } = readTextFile(absPath);
        const doc = parseScene(content);

        totalNodes += doc.nodes.flatMap(n => {
          const all: any[] = [];
          const w = (nodes: any[]) => { for (const n of nodes) { all.push(n); if (n.children) w(n.children); } };
          w(doc.nodes);
          return all;
        }).length;

        totalConnections += doc.connections.length;
        totalExtRefs += doc.extResources.length;

        // Count signals
        for (const c of doc.connections) {
          signalCounts[c.signal] = (signalCounts[c.signal] || 0) + 1;
        }

        // Count node types
        walk(doc.nodes, Object.keys(nodeTypeCounts).length === 0 ?
          [] : Object.keys(nodeTypeCounts)).forEach(n => {
            nodeTypeCounts[n.type] = (nodeTypeCounts[n.type] || 0) + 1;
          });
      } catch { /* skip */ }
    }

    // Re-count node types properly
    for (const relPath of sceneFiles) {
      try {
        const absPath = resolveProjectPath(projectRoot, relPath);
        const { content } = readTextFile(absPath);
        const doc = parseScene(content);
        const allNodes: any[] = [];
        const w = (nodes: any[]) => { for (const n of nodes) { allNodes.push(n); if (n.children) w(n.children); } };
        w(doc.nodes);
        allNodes.forEach(n => {
          nodeTypeCounts[n.type] = (nodeTypeCounts[n.type] || 0) + 1;
        });
      } catch { /* skip */ }
    }

    const lines: string[] = [];
    lines.push('=== Project Cohesion Report ===');
    lines.push('');
    lines.push(`Scenes: ${sceneFiles.length}`);
    lines.push(`Scripts: ${scriptFiles.length}`);
    lines.push(`Total nodes: ${totalNodes}`);
    lines.push(`Signal connections: ${totalConnections}`);
    lines.push(`External references: ${totalExtRefs}`);
    lines.push('');

    const topTypes = Object.entries(nodeTypeCounts)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 15);
    if (topTypes.length > 0) {
      lines.push('Top Node Types:');
      topTypes.forEach(([type, count]) => {
        lines.push(`  ${type}: ${count}`);
      });
    }

    const topSignals = Object.entries(signalCounts)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 10);
    if (topSignals.length > 0) {
      lines.push('');
      lines.push('Top Signal Connections:');
      topSignals.forEach(([signal, count]) => {
        lines.push(`  ${signal}: ${count}`);
      });
    }

    return { content: [{ type: 'text', text: lines.join('\n') }] };
  } catch (err: any) {
    return toolError(ErrorCode.INTERNAL_ERROR, `Error: ${err.message}`);
  }
}

// ---- Theme Tools (Tier1) ----

export const createThemeSchema = {
  path: z.string().describe('Output path for new Theme .tres (e.g. "themes/main.tres")'),
  default_font_size: z.number().int().optional().default(16).describe('Default font size'),
};

export function handleCreateTheme(
  projectRoot: string,
  args: { path: string; default_font_size?: number }
): ToolResult {
  try {
    const content = `[gd_resource type="Theme" format=3 uid=""]

[resource]
default_font_size = ${args.default_font_size ?? 16}
`;
    const absPath = resolveProjectPath(projectRoot, args.path);
    writeTextFile(absPath, content, false);
    return { content: [{ type: 'text', text: `Theme created: ${args.path} (default_font_size ${args.default_font_size ?? 16})` }] };
  } catch (err: any) {
    return toolError(ErrorCode.INTERNAL_ERROR, `Error: ${err.message}`);
  }
}

export const addThemeTypeSchema = {
  theme_path: z.string().describe('Path to .tres Theme file'),
  type: z.string().describe('Control type to add (e.g. "Button", "Label", "Panel")'),
  font_size: z.number().int().optional().describe('Default font size for this type'),
  font_color: z.string().optional().describe('Default font color (e.g. "Color(1, 1, 1, 1)")'),
};

export function handleAddThemeType(
  projectRoot: string,
  args: { theme_path: string; type: string; font_size?: number; font_color?: string }
): ToolResult {
  try {
    const absPath = resolveProjectPath(projectRoot, args.theme_path);
    const { content } = readTextFile(absPath);
    const lines = content.split('\n');

    const out: string[] = [];
    let inserted = false;
    for (let i = 0; i < lines.length; i++) {
      const l = lines[i];
      out.push(l);
      if (l.startsWith('[resource]') && !inserted) {
        if (args.font_size !== undefined) {
          out.push(`${args.type}/font_sizes/font_size = ${args.font_size}`);
        }
        if (args.font_color) {
          out.push(`${args.type}/colors/font_color = ${args.font_color}`);
        }
        inserted = true;
      }
    }

    writeTextFile(absPath, out.join('\n'), true);
    return { content: [{ type: 'text', text: `Added type "${args.type}" to theme ${args.theme_path}` }] };
  } catch (err: any) {
    return toolError(ErrorCode.INTERNAL_ERROR, `Error: ${err.message}`);
  }
}

export const setStyleboxSchema = {
  theme_path: z.string().describe('Path to .tres Theme file'),
  type: z.string().describe('Control type (e.g. "Button")'),
  state: z.string().optional().default('normal').describe('Style state (normal, hover, pressed, focus, disabled)'),
  bg_color: z.string().optional().describe('Background color (e.g. "Color(0.2, 0.2, 0.2, 1)")'),
  border_color: z.string().optional().describe('Border color'),
  border_width: z.array(z.number()).optional().describe('Border widths [left, right, top, bottom]'),
  corner_radius: z.array(z.number()).optional().describe('Corner radii [top_left, top_right, bottom_right, bottom_left]'),
  content_margin: z.array(z.number()).optional().describe('Content margins [left, right, top, bottom]'),
};

export function handleSetStylebox(
  projectRoot: string,
  args: { theme_path: string; type: string; state?: string; bg_color?: string; border_color?: string; border_width?: number[]; corner_radius?: number[]; content_margin?: number[] }
): ToolResult {
  try {
    const absPath = resolveProjectPath(projectRoot, args.theme_path);
    const { content } = readTextFile(absPath);
    const lines = content.split('\n');

    const subId = `StyleBoxFlat_${args.type}_${args.state}`;
    const props: string[] = [];
    if (args.bg_color) props.push(`bg_color = ${args.bg_color}`);
    if (args.border_color) props.push(`border_color = ${args.border_color}`);
    if (args.border_width) {
      const b = args.border_width;
      props.push(`border_width_left = ${b[0] ?? 0}`);
      props.push(`border_width_right = ${b[1] ?? 0}`);
      props.push(`border_width_top = ${b[2] ?? 0}`);
      props.push(`border_width_bottom = ${b[3] ?? 0}`);
    }
    if (args.corner_radius) {
      const c = args.corner_radius;
      props.push(`corner_radius_top_left = ${c[0] ?? 0}`);
      props.push(`corner_radius_top_right = ${c[1] ?? 0}`);
      props.push(`corner_radius_bottom_right = ${c[2] ?? 0}`);
      props.push(`corner_radius_bottom_left = ${c[3] ?? 0}`);
    }
    if (args.content_margin) {
      const m = args.content_margin;
      props.push(`content_margin_left = ${m[0] ?? 0}`);
      props.push(`content_margin_right = ${m[1] ?? 0}`);
      props.push(`content_margin_top = ${m[2] ?? 0}`);
      props.push(`content_margin_bottom = ${m[3] ?? 0}`);
    }

    const out: string[] = [];
    let inserted = false;
    for (let i = 0; i < lines.length; i++) {
      const l = lines[i];
      if (l.startsWith('[resource]') && !inserted) {
        out.push(`[sub_resource type="StyleBoxFlat" id="${subId}"]`);
        for (const p of props) out.push(p);
        out.push('');
        out.push(l); // [resource]
        out.push(`${args.type}/styles/${args.state || 'normal'} = SubResource("${subId}")`);
        inserted = true;
        continue;
      }
      out.push(l);
    }

    writeTextFile(absPath, out.join('\n'), true);
    return { content: [{ type: 'text', text: `StyleBox "${args.state || 'normal'}" set for ${args.type} in ${args.theme_path}` }] };
  } catch (err: any) {
    return toolError(ErrorCode.INTERNAL_ERROR, `Error: ${err.message}`);
  }
}
