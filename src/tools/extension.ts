// Copyright (c) 2026 FairYan
// SPDX-License-Identifier: MIT
// ============================================================
// Godot MCP Server - Extension / World / C# Tools
// ============================================================

import { z } from 'zod';
import { toolError, ErrorCode } from '../utils/errors.js';
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
    return toolError(ErrorCode.FILE_NOT_FOUND, `GDExtension file not found: ${extPath}`);
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
    return toolError(ErrorCode.INTERNAL_ERROR, `Error: ${err.message}`);
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
    return toolError(ErrorCode.INTERNAL_ERROR, `Error: ${err.message}`);
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
    return toolError(ErrorCode.INTERNAL_ERROR, `Error: ${err.message}`);
  }
}

// ---- Additional extension tools (Tier1) ----

export const createGdextensionSchema = {
  path: z.string().describe('Output path for new .gdextension (e.g. "addons/myext/myext.gdextension")'),
  entry_symbol: z.string().optional().default('myext_init').describe('Entry symbol (init function name)'),
  library_path: z.string().optional().describe('Path to the compiled library (e.g. "res://addons/myext/bin/libmyext.linux.debug.x86_64.so")'),
};

export function handleCreateGdextension(
  projectRoot: string,
  args: { path: string; entry_symbol?: string; library_path?: string }
): ToolResult {
  try {
    let content = '; GDExtension configuration\n';
    content += '[configuration]\n\n';
    content += `entry_symbol = "${args.entry_symbol || 'myext_init'}"\n\n`;
    if (args.library_path) {
      const rel = args.library_path.startsWith('res://') ? args.library_path.slice(6) : args.library_path;
      content += '[libraries]\n\n';
      content += `linux.debug.x86_64 = "res://${rel}"\n`;
      content += `linux.release.x86_64 = "res://${rel}"\n`;
    }

    const absPath = resolveProjectPath(projectRoot, args.path);
    writeTextFile(absPath, content, false);
    return { content: [{ type: 'text', text: `GDExtension created: ${args.path} (entry: ${args.entry_symbol || 'myext_init'})` }] };
  } catch (err: any) {
    return toolError(ErrorCode.INTERNAL_ERROR, `Error: ${err.message}`);
  }
}

export const readCsprojSchema = {
  path: z.string().describe('Path to .csproj file (relative to project root)'),
};

export function handleReadCsproj(
  projectRoot: string,
  args: { path: string }
): ToolResult {
  try {
    const absPath = resolveProjectPath(projectRoot, args.path);
    if (!fs.existsSync(absPath)) {
      return toolError(ErrorCode.FILE_NOT_FOUND, `File not found: ${args.path}`);
    }
    const content = fs.readFileSync(absPath, 'utf-8');

    const lines: string[] = [];
    lines.push(`C# Project: ${args.path}`);
    lines.push('');

    const grab = (tag: string) => {
      const m = content.match(new RegExp(`<${tag}>([^<]*)</${tag}>`, 'i'));
      return m ? m[1] : '';
    };
    const assemblyName = grab('AssemblyName') || grab('RootNamespace');
    const target = grab('TargetFramework');
    if (assemblyName) lines.push(`  Assembly/Namespace: ${assemblyName}`);
    if (target) lines.push(`  Target Framework: ${target}`);

    const pkgRefs = [...content.matchAll(/<PackageReference[^>]*Include="([^"]+)"[^>]*Version="([^"]+)"/g)];
    if (pkgRefs.length) {
      lines.push('');
      lines.push(`  Package References (${pkgRefs.length}):`);
      for (const r of pkgRefs) lines.push(`    ${r[1]} = ${r[2]}`);
    }

    const projRefs = [...content.matchAll(/<ProjectReference[^>]*Include="([^"]+)"/g)];
    if (projRefs.length) {
      lines.push('');
      lines.push(`  Project References (${projRefs.length}):`);
      for (const r of projRefs) lines.push(`    ${r[1]}`);
    }

    return { content: [{ type: 'text', text: lines.join('\n') }] };
  } catch (err: any) {
    return toolError(ErrorCode.INTERNAL_ERROR, `Error: ${err.message}`);
  }
}
