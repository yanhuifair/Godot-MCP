// Copyright (c) 2026 FairYan
// SPDX-License-Identifier: MIT
// ============================================================
// Godot MCP Server - Environment Tools
// ============================================================
//
// Environment controls post-processing, sky, fog, ambient light, etc.
// Stored as .tres files of type "Environment" or embedded in scenes.

import { z } from 'zod';
import { ToolResult } from '../utils/types.js';
import { readTextFile, resolveProjectPath, findFilesByExtension, writeTextFile } from '../utils/file_utils.js';
import { parseResource } from '../parsers/resource_parser.js';
import fs from 'node:fs';

// ---- Tool Schemas ----

export const readEnvironmentSchema = {
  path: z.string().describe('Path to .tres Environment file or .tscn scene with WorldEnvironment'),
};

export const listEnvironmentsSchema = {
  path: z.string().optional().default('').describe('Subdirectory to search'),
};

export const createEnvironmentSchema = {
  path: z.string().describe('Output path for new Environment .tres (e.g. "environments/default.tres")'),
  preset: z.enum(['default', 'stylized', 'dark', 'bright']).optional().default('default').describe('Preset: default, stylized, dark, or bright'),
};

export const setEnvironmentParamSchema = {
  path: z.string().describe('Path to .tres Environment file'),
  param: z.string().describe('Parameter to set (e.g. "background_color", "fog_enabled", "ssao_enabled")'),
  value: z.string().describe('New value'),
};

// ---- Environment Presets ----

const ENV_PRESETS: Record<string, Record<string, string>> = {
  default: {
    background_mode: '0', // sky
    background_color: 'Color(0, 0, 0, 1)',
    ambient_light_color: 'Color(0.3, 0.3, 0.3, 1)',
    ambient_light_energy: '1.0',
    fog_enabled: 'false',
    glow_enabled: 'false',
    ssao_enabled: 'false',
    ssil_enabled: 'false',
    tonemap_mode: '0',
  },
  stylized: {
    background_mode: '0',
    background_color: 'Color(0.6, 0.7, 0.9, 1)',
    ambient_light_color: 'Color(0.7, 0.6, 0.8, 1)',
    ambient_light_energy: '1.2',
    fog_enabled: 'true',
    fog_density: '0.01',
    fog_light_color: 'Color(0.8, 0.6, 0.4, 1)',
    glow_enabled: 'true',
    glow_intensity: '0.5',
    glow_bloom: '0.3',
    tonemap_mode: '2',
  },
  dark: {
    background_mode: '1', // color
    background_color: 'Color(0.02, 0.02, 0.04, 1)',
    ambient_light_color: 'Color(0.05, 0.05, 0.1, 1)',
    ambient_light_energy: '0.5',
    fog_enabled: 'true',
    fog_density: '0.02',
    fog_light_color: 'Color(0.1, 0.1, 0.15, 1)',
    glow_enabled: 'false',
    ssao_enabled: 'true',
    tonemap_mode: '3',
  },
  bright: {
    background_mode: '1',
    background_color: 'Color(0.8, 0.85, 0.9, 1)',
    ambient_light_color: 'Color(1, 1, 1, 1)',
    ambient_light_energy: '1.5',
    fog_enabled: 'false',
    glow_enabled: 'true',
    glow_intensity: '0.3',
    glow_bloom: '0.15',
    tonemap_mode: '1',
  },
};

// ---- Environment Property Labels ----

const ENV_LABELS: Record<string, string> = {
  background_mode: 'Background Mode (0=sky, 1=color, 2=canvas)',
  background_color: 'Background Color',
  background_energy: 'Background Energy',
  ambient_light_color: 'Ambient Light Color',
  ambient_light_energy: 'Ambient Light Energy',
  ambient_light_sky_contribution: 'Sky Contribution to Ambient',
  reflected_light_source: 'Reflected Light Source',
  fog_enabled: 'Fog Enabled',
  fog_mode: 'Fog Mode (0=exponential, 1=depth)',
  fog_density: 'Fog Density',
  fog_light_color: 'Fog Light Color',
  fog_light_energy: 'Fog Light Energy',
  glow_enabled: 'Glow Enabled',
  glow_intensity: 'Glow Intensity',
  glow_bloom: 'Glow Bloom',
  glow_hdr_threshold: 'Glow HDR Threshold',
  ssao_enabled: 'SSAO Enabled',
  ssa_radius: 'SSAO Radius',
  ssa_intensity: 'SSAO Intensity',
  ssil_enabled: 'SSIL Enabled',
  tonemap_mode: 'Tonemap Mode (0=linear, 1=reinhard, 2=filmic, 3=aces)',
  tonemap_white: 'Tonemap White',
  tonemap_exposure: 'Tonemap Exposure',
};

// ---- Tool Handlers ----

export function handleReadEnvironment(
  projectRoot: string,
  args: { path: string }
): ToolResult {
  try {
    const absPath = resolveProjectPath(projectRoot, args.path);

    // Check if it's a .tscn scene file (read WorldEnvironment from it)
    if (args.path.endsWith('.tscn')) {
      return readWorldEnvFromScene(absPath, args.path);
    }

    // Read as .tres
    const { content } = readTextFile(absPath);
    const doc = parseResource(content);

    const lines: string[] = [];
    lines.push(`Environment: ${doc.header.type}`);
    lines.push(`File: ${args.path}`);
    lines.push('');

    // Group properties
    const groups = categorizeEnvProps(doc.resource);
    for (const [group, props] of Object.entries(groups)) {
      if (props.length === 0) continue;
      lines.push(`${group}:`);
      for (const [key, val] of props) {
        const label = ENV_LABELS[key] ? `  # ${ENV_LABELS[key]}` : '';
        lines.push(`  ${key} = ${val}${label}`);
      }
      lines.push('');
    }

    return { content: [{ type: 'text', text: lines.join('\n') }] };
  } catch (err: any) {
    return { content: [{ type: 'text', text: `Error: ${err.message}` }], isError: true };
  }
}

export function handleListEnvironments(
  projectRoot: string,
  args: { path?: string }
): ToolResult {
  try {
    const tresFiles = findFilesByExtension(projectRoot, ['.tres'], args.path || '');

    const envs: { path: string }[] = [];
    for (const f of tresFiles) {
      try {
        const absPath = resolveProjectPath(projectRoot, f);
        const { content } = readTextFile(absPath);
        const doc = parseResource(content);
        if (doc.header.type === 'Environment') {
          envs.push({ path: f });
        }
      } catch { /* skip */ }
    }

    if (envs.length === 0) {
      return { content: [{ type: 'text', text: 'No Environment resources found.' }] };
    }

    const lines: string[] = [];
    lines.push(`Environment Resources (${envs.length}):`);
    envs.sort((a, b) => a.path.localeCompare(b.path));
    envs.forEach(e => lines.push(`  ${e.path}`));

    return { content: [{ type: 'text', text: lines.join('\n') }] };
  } catch (err: any) {
    return { content: [{ type: 'text', text: `Error: ${err.message}` }], isError: true };
  }
}

export function handleCreateEnvironment(
  projectRoot: string,
  args: { path: string; preset?: string }
): ToolResult {
  try {
    const preset = ENV_PRESETS[args.preset || 'default'];
    if (!preset) {
      return {
        content: [{ type: 'text', text: `Unknown preset: ${args.preset}. Available: ${Object.keys(ENV_PRESETS).join(', ')}` }],
        isError: true,
      };
    }

    let content = '[gd_resource type="Environment" format=3 uid=""]\n\n[resource]\n';
    for (const [key, val] of Object.entries(preset)) {
      content += `${key} = ${val}\n`;
    }

    const absPath = resolveProjectPath(projectRoot, args.path);
    writeTextFile(absPath, content, false);

    return {
      content: [{ type: 'text', text: `Environment created: ${args.path} (preset: ${args.preset || 'default'})` }],
    };
  } catch (err: any) {
    return { content: [{ type: 'text', text: `Error: ${err.message}` }], isError: true };
  }
}

export function handleSetEnvironmentParam(
  projectRoot: string,
  args: { path: string; param: string; value: string }
): ToolResult {
  try {
    const absPath = resolveProjectPath(projectRoot, args.path);
    const { content } = readTextFile(absPath);
    const doc = parseResource(content);

    if (doc.header.type !== 'Environment') {
      return {
        content: [{ type: 'text', text: `File is not an Environment resource (found: ${doc.header.type})` }],
        isError: true,
      };
    }

    doc.resource[args.param] = args.value;

    let newContent = `[gd_resource type="${doc.header.type}" format=${doc.header.format}`;
    if (doc.header.uid) newContent += ` uid="${doc.header.uid}"`;
    newContent += ']\n\n[resource]\n';
    for (const [key, val] of Object.entries(doc.resource)) {
      newContent += `${key} = ${val}\n`;
    }

    writeTextFile(absPath, newContent, true);

    return {
      content: [{ type: 'text', text: `Environment updated: ${args.param} = ${args.value}` }],
    };
  } catch (err: any) {
    return { content: [{ type: 'text', text: `Error: ${err.message}` }], isError: true };
  }
}

// ---- Helpers ----

function categorizeEnvProps(resource: Record<string, string>): Record<string, [string, string][]> {
  const groups: Record<string, [string, string][]> = {
    'Background': [],
    'Ambient Light': [],
    'Fog': [],
    'Volumetric Fog': [],
    'Glow': [],
    'SSAO/SSIL': [],
    'Tonemap': [],
    'Adjustments': [],
    'Other': [],
  };

  for (const [key, val] of Object.entries(resource)) {
    if (key.startsWith('background_') || key === 'background_mode') {
      groups['Background'].push([key, val]);
    } else if (key.startsWith('ambient_') || key.startsWith('reflected_')) {
      groups['Ambient Light'].push([key, val]);
    } else if (key.startsWith('fog_')) {
      groups['Fog'].push([key, val]);
    } else if (key.startsWith('volumetric_fog_')) {
      groups['Volumetric Fog'].push([key, val]);
    } else if (key.startsWith('glow_')) {
      groups['Glow'].push([key, val]);
    } else if (key.startsWith('ssao_') || key.startsWith('ssil_') || key.startsWith('ssr_')) {
      groups['SSAO/SSIL'].push([key, val]);
    } else if (key.startsWith('tonemap_')) {
      groups['Tonemap'].push([key, val]);
    } else if (key.startsWith('adjustment_')) {
      groups['Adjustments'].push([key, val]);
    } else {
      groups['Other'].push([key, val]);
    }
  }

  return groups;
}

function readWorldEnvFromScene(absPath: string, relPath: string): ToolResult {
  try {
    const content = fs.readFileSync(absPath, 'utf-8');

    // Find WorldEnvironment node and its environment reference
    const lines = content.split('\n');
    const envLines: string[] = [];
    let inWorldEnv = false;
    let found = false;

    // Simple line-by-line scan for WorldEnvironment
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      if (line.includes('type="WorldEnvironment"')) {
        inWorldEnv = true;
        found = true;
        envLines.push(`WorldEnvironment node found in ${relPath}:`);
        continue;
      }
      if (inWorldEnv) {
        if (line.startsWith('[') && line.endsWith(']')) {
          break; // next section
        }
        if (line.includes('=')) {
          envLines.push(`  ${line}`);
        }
      }
    }

    if (!found) {
      return { content: [{ type: 'text', text: `No WorldEnvironment node found in ${relPath}.` }] };
    }

    return { content: [{ type: 'text', text: envLines.join('\n') }] };
  } catch (err: any) {
    return { content: [{ type: 'text', text: `Error: ${err.message}` }], isError: true };
  }
}
