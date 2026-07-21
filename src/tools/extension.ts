// Copyright (c) 2026 FairYan
// SPDX-License-Identifier: MIT
// ============================================================
// Godot MCP Server - Extension / World / C# Tools
// ============================================================

import { z } from 'zod';
import { ToolResult } from '../utils/types.js';
import fs from 'node:fs';
import { readTextFile, resolveProjectPath, findFilesByExtension, writeTextFile } from '../utils/file_utils.js';

// ---- Tool Schemas ----

export const readGdextensionSchema = {
  path: z.string().optional().default('').describe('Path to .gdextension file (default: auto-detect)'),
};

export const listCsprojSchema = {};

export const createWorldSchema = {
  path: z.string().describe('Output path for World3D .tres (e.g. "environments/main_world.tres")'),
  environment_path: z.string().optional().describe('Path to Environment .tres to attach'),
};

// ---- Tool Handlers ----

export function handleReadGdextension(
  projectRoot: string,
  args: { path?: string }
): ToolResult {
  try {
    let extPath = args.path || '';
    if (!extPath) {
      // Auto-detect
      const files = findFilesByExtension(projectRoot, ['.gdextension']);
      if (files.length === 0) {
        return { content: [{ type: 'text', text: 'No .gdextension files found. This project does not use GDExtension.' }] };
      }
      extPath = files[0];
    }

    const absPath = resolveProjectPath(projectRoot, extPath);
    if (!fs.existsSync(absPath)) {
      return { content: [{ type: 'text', text: `GDExtension file not found: ${extPath}` }], isError: true };
    }

    const content = fs.readFileSync(absPath, 'utf-8');

    // GDExtension uses a simplified TOML-like config
    const lines: string[] = [];
    lines.push(`GDExtension: ${extPath}`);
    lines.push('');

    let section: string | null = null;
    const sections: Record<string, Record<string, string>> = {};

    for (const rawLine of content.split('\n')) {
      const line = rawLine.trim();
      if (!line || line.startsWith(';') || line.startsWith('#')) continue;

      if (line.startsWith('[') && line.endsWith(']')) {
        section = line.slice(1, -1).trim();
        sections[section] = {};
        continue;
      }

      const eq = line.indexOf('=');
      if (eq > 0 && section) {
        const key = line.slice(0, eq).trim();
        let val = line.slice(eq + 1).trim();
        if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
          val = val.slice(1, -1);
        }
        sections[section][key] = val;
      }
    }

    for (const [sec, props] of Object.entries(sections)) {
      lines.push(`[${sec}]`);
      for (const [key, val] of Object.entries(props)) {
        lines.push(`  ${key} = ${val}`);
      }
      lines.push('');
    }

    return { content: [{ type: 'text', text: lines.join('\n') }] };
  } catch (err: any) {
    return { content: [{ type: 'text', text: `Error: ${err.message}` }], isError: true };
  }
}

export function handleListCsproj(projectRoot: string): ToolResult {
  try {
    const csprojFiles = findFilesByExtension(projectRoot, ['.csproj']);
    const slnFiles = findFilesByExtension(projectRoot, ['.sln']);

    if (csprojFiles.length === 0 && slnFiles.length === 0) {
      return { content: [{ type: 'text', text: 'No C# project files found. This project does not use C#/.NET.' }] };
    }

    const lines: string[] = [];
    lines.push('C# Project Files:');

    if (slnFiles.length > 0) {
      lines.push(`\n  Solution files (${slnFiles.length}):`);
      slnFiles.sort().forEach(f => lines.push(`    ${f}`));
    }

    if (csprojFiles.length > 0) {
      lines.push(`\n  Project files (${csprojFiles.length}):`);
      csprojFiles.sort().forEach(f => {
        try {
          const absPath = resolveProjectPath(projectRoot, f);
          const content = fs.readFileSync(absPath, 'utf-8');
          // Extract TargetFramework
          const targetMatch = content.match(/<TargetFramework>([^<]+)<\/TargetFramework>/);
          const tf = targetMatch ? targetMatch[1] : 'unknown';
          lines.push(`    ${f}  (target: ${tf})`);
        } catch {
          lines.push(`    ${f}`);
        }
      });
    }

    return { content: [{ type: 'text', text: lines.join('\n') }] };
  } catch (err: any) {
    return { content: [{ type: 'text', text: `Error: ${err.message}` }], isError: true };
  }
}

export function handleCreateWorld(
  projectRoot: string,
  args: { path: string; environment_path?: string }
): ToolResult {
  try {
    let content = '[gd_resource type="World3D" format=3 uid=""]\n\n';
    content += '[resource]\n';

    if (args.environment_path) {
      content += `environment = ExtResource("1_environment")\n`;
    }

    if (args.environment_path) {
      // Add ext_resource
      content = `[gd_resource type="World3D" load_steps=2 format=3 uid=""]

[ext_resource type="Environment" path="res://${args.environment_path}" id="1_environment"]

[resource]
environment = ExtResource("1_environment")
`;
    }

    const absPath = resolveProjectPath(projectRoot, args.path);
    writeTextFile(absPath, content, false);

    const envNote = args.environment_path ? ` (with environment: ${args.environment_path})` : '';
    return {
      content: [{ type: 'text', text: `World3D created: ${args.path}${envNote}` }],
    };
  } catch (err: any) {
    return { content: [{ type: 'text', text: `Error: ${err.message}` }], isError: true };
  }
}
