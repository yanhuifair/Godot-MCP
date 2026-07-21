// Copyright (c) 2026 FairYan
// SPDX-License-Identifier: MIT
// ============================================================
// Godot MCP Server - Physics Tools
// ============================================================
//
// PhysicsMaterial is a resource for friction/bounce.
// Collision layer names are in project.godot [physics] section.

import { z } from 'zod';
import { ToolResult } from '../utils/types.js';
import { readTextFile, resolveProjectPath, findFilesByExtension, writeTextFile } from '../utils/file_utils.js';
import { parseResource } from '../parsers/resource_parser.js';

// ---- Tool Schemas ----

export const listPhysicsMaterialsSchema = {
  path: z.string().optional().default('').describe('Subdirectory to search'),
};

export const readPhysicsMaterialSchema = {
  path: z.string().describe('Path to PhysicsMaterial .tres file'),
};

export const createPhysicsMaterialSchema = {
  path: z.string().describe('Output path (e.g. "physics/ice.tres")'),
  friction: z.number().optional().default(0.5).describe('Friction coefficient (0=ice, 1=rubber)'),
  bounce: z.number().optional().default(0.0).describe('Bounciness (0=none, 1=perfect)'),
  absorb: z.boolean().optional().default(false).describe('Absorbent mode'),
  rough: z.boolean().optional().default(false).describe('Rough surface'),
};

export const readCollisionLayersSchema = {}; // reads from project.godot

// ---- Tool Handlers ----

export function handleListPhysicsMaterials(
  projectRoot: string,
  args: { path?: string }
): ToolResult {
  try {
    const tresFiles = findFilesByExtension(projectRoot, ['.tres'], args.path || '');

    const materials: { path: string; friction: string; bounce: string }[] = [];
    for (const f of tresFiles) {
      try {
        const absPath = resolveProjectPath(projectRoot, f);
        const { content } = readTextFile(absPath);
        const doc = parseResource(content);
        if (doc.header.type === 'PhysicsMaterial') {
          materials.push({
            path: f,
            friction: doc.resource['friction'] || '0.5',
            bounce: doc.resource['bounce'] || '0.0',
          });
        }
      } catch { /* skip */ }
    }

    if (materials.length === 0) {
      return { content: [{ type: 'text', text: 'No PhysicsMaterial resources found.' }] };
    }

    const lines: string[] = [];
    lines.push(`Physics Materials (${materials.length}):`);
    lines.push('');
    materials.sort((a, b) => a.path.localeCompare(b.path));
    for (const m of materials) {
      lines.push(`  ${m.path}`);
      lines.push(`    friction=${m.friction}  bounce=${m.bounce}`);
    }

    return { content: [{ type: 'text', text: lines.join('\n') }] };
  } catch (err: any) {
    return { content: [{ type: 'text', text: `Error: ${err.message}` }], isError: true };
  }
}

export function handleReadPhysicsMaterial(
  projectRoot: string,
  args: { path: string }
): ToolResult {
  try {
    const absPath = resolveProjectPath(projectRoot, args.path);
    const { content } = readTextFile(absPath);
    const doc = parseResource(content);

    if (doc.header.type !== 'PhysicsMaterial') {
      return {
        content: [{ type: 'text', text: `File is not a PhysicsMaterial (found: ${doc.header.type})` }],
        isError: true,
      };
    }

    const lines: string[] = [];
    lines.push(`PhysicsMaterial: ${args.path}`);
    lines.push('');

    const labels: Record<string, string> = {
      friction: 'Friction (0=ice, 1=full friction)',
      bounce: 'Bounciness (0=no bounce, 1=perfect bounce)',
      absorb: 'Absorbent (objects stick)',
      rough: 'Rough surface (increases friction variance)',
    };

    for (const [key, val] of Object.entries(doc.resource)) {
      const label = labels[key] ? `  # ${labels[key]}` : '';
      lines.push(`  ${key} = ${val}${label}`);
    }

    return { content: [{ type: 'text', text: lines.join('\n') }] };
  } catch (err: any) {
    return { content: [{ type: 'text', text: `Error: ${err.message}` }], isError: true };
  }
}

export function handleCreatePhysicsMaterial(
  projectRoot: string,
  args: { path: string; friction?: number; bounce?: number; absorb?: boolean; rough?: boolean }
): ToolResult {
  try {
    const template = `[gd_resource type="PhysicsMaterial" format=3 uid=""]

[resource]
friction = ${args.friction ?? 0.5}
bounce = ${args.bounce ?? 0.0}
absorb = ${args.absorb ?? false}
rough = ${args.rough ?? false}
`;

    const absPath = resolveProjectPath(projectRoot, args.path);
    writeTextFile(absPath, template, false);

    return {
      content: [{ type: 'text', text: `PhysicsMaterial created: ${args.path}\n  friction=${args.friction ?? 0.5}  bounce=${args.bounce ?? 0.0}` }],
    };
  } catch (err: any) {
    return { content: [{ type: 'text', text: `Error: ${err.message}` }], isError: true };
  }
}

export function handleReadCollisionLayers(projectRoot: string): ToolResult {
  try {
    const projPath = resolveProjectPath(projectRoot, 'project.godot');
    const { content } = readTextFile(projPath);

    // Parse [layer_names/2d_physics] and [layer_names/3d_physics] sections
    const section2d: Record<string, string> = {};
    const section3d: Record<string, string> = {};
    let currentSection: string | null = null;

    for (const rawLine of content.split('\n')) {
      const line = rawLine.trim();
      if (line.startsWith('[') && line.endsWith(']')) {
        currentSection = line.slice(1, -1).trim();
        continue;
      }

      const eqIdx = line.indexOf('=');
      if (eqIdx > 0) {
        const key = line.slice(0, eqIdx).trim();
        const value = line.slice(eqIdx + 1).trim().replace(/"/g, '');

        if (currentSection === 'layer_names/2d_physics') {
          section2d[key] = value;
        } else if (currentSection === 'layer_names/3d_physics') {
          section3d[key] = value;
        }
      }
    }

    const lines: string[] = [];
    lines.push('Collision Layers');
    lines.push('');

    if (Object.keys(section2d).length > 0) {
      lines.push('2D Physics Layers:');
      for (const [layer, name] of Object.entries(section2d).sort()) {
        lines.push(`  ${layer}: "${name}"`);
      }
      lines.push('');
    }

    if (Object.keys(section3d).length > 0) {
      lines.push('3D Physics Layers:');
      for (const [layer, name] of Object.entries(section3d).sort()) {
        lines.push(`  ${layer}: "${name}"`);
      }
      lines.push('');
    }

    if (Object.keys(section2d).length === 0 && Object.keys(section3d).length === 0) {
      lines.push('No collision layers defined. Use Project Settings → Layer Names to define them.');
    }

    return { content: [{ type: 'text', text: lines.join('\n') }] };
  } catch (err: any) {
    return { content: [{ type: 'text', text: `Error: ${err.message}` }], isError: true };
  }
}
