// Copyright (c) 2026 FairYan
// SPDX-License-Identifier: MIT
// ============================================================
// Godot MCP Server - Script Tools
// ============================================================

import { z } from 'zod';
import { ToolResult } from '../utils/types.js';
import {
  readFileLines,
  writeTextFile,
  readTextFile,
  findFilesByExtension,
  resolveProjectPath,
} from '../utils/file_utils.js';
import { parseResource } from '../parsers/resource_parser.js';

// ---- GDScript identifier validation ----
// Names fed into generated GDScript must be valid identifiers so a caller (or
// prompt-injection) cannot smuggle statements/code into the target file.
const GD_SCRIPT_IDENTIFIER = /^[A-Za-z_][A-Za-z0-9_]*$/;
/** A single-line value with no control chars, statement separators, or comments. Optional fields pass `undefined`, which is valid (no value). */
function isSingleLineSafe(s: string | undefined): boolean {
  if (s === undefined) return true;
  return !/[\x00-\x1f\x7f;#]/.test(s);
}
/** Validate one GDScript parameter entry: `name[: type[= default]]`. */
function isValidGdParam(p: string): boolean {
  const t = p.trim();
  if (!isSingleLineSafe(t)) return false;
  if (/[()]/.test(t)) return false; // reject grouping/paren tricks
  return /^([A-Za-z_]\w*)(?::\s*(.+))?$/.test(t);
}

// ---- Tool Schemas ----

export const readScriptSchema = {
  path: z.string().min(1).describe('Path to script file (relative to project root)'),
  line_start: z.number().optional().describe('Starting line (1-indexed, optional)'),
  line_count: z.number().optional().describe('Number of lines to read (optional)'),
};

export const writeScriptSchema = {
  path: z.string().min(1).describe('Path to script file (relative to project root)'),
  content: z.string().describe('New file content'),
  create_backup: z.boolean().optional().default(true).describe('Create .bak backup (default: true)'),
};

export const createScriptSchema = {
  path: z.string().min(1).describe('Output path (relative to project root, e.g. "scripts/enemy.gd")'),
  type: z.enum(['gdscript', 'csharp']).describe('Script language'),
  template: z.enum(['empty', 'node_script', 'resource_script', 'autoload']).optional().default('node_script').describe('Template type'),
  class_name: z.string().optional().describe('Optional class_name for GDScript'),
};

export const listScriptsSchema = {
  path: z.string().optional().default('').describe('Subdirectory to search (default: root)'),
  recursive: z.boolean().optional().default(true).describe('Search recursively (default: true)'),
  type: z.enum(['gdscript', 'csharp', 'all']).optional().default('all').describe('Filter by script type'),
};

// ---- Script Templates ----

const GDScriptTemplates: Record<string, string> = {
  empty: `extends Node
`,
  node_script: `extends Node

@export var speed: float = 100.0

func _ready():
	pass

func _process(delta):
	pass
`,
  resource_script: `extends Resource

@export var health: int = 100
@export var damage: float = 10.0
`,
  autoload: `extends Node

var game_state: Dictionary = {}

func _ready():
	print("Autoload initialized")
`,
};

const CSharpTemplates: Record<string, string> = {
  empty: `using Godot;

public partial class Script : Node
{
}
`,
  node_script: `using Godot;

public partial class Script : Node
{
    [Export]
    public float Speed { get; set; } = 100.0f;

    public override void _Ready()
    {
    }

    public override void _Process(double delta)
    {
    }
}
`,
  resource_script: `using Godot;

[GlobalClass]
public partial class GameResource : Resource
{
    [Export]
    public int Health { get; set; } = 100;

    [Export]
    public float Damage { get; set; } = 10.0f;
}
`,
  autoload: `using Godot;

public partial class GameManager : Node
{
    public override void _Ready()
    {
        GD.Print("Autoload initialized");
    }
}
`,
};

// ---- Tool Handlers ----

export function handleReadScript(
  projectRoot: string,
  args: { path: string; line_start?: number; line_count?: number }
): ToolResult {
  try {
    const absPath = resolveProjectPath(projectRoot, args.path);
    const { lines, totalLines } = readFileLines(absPath, args.line_start, args.line_count);

    const lineNumbers = lines.map((_, i) => {
      const lineNum = (args.line_start || 1) + i;
      return `${String(lineNum).padStart(4, ' ')} | ${lines[i]}`;
    });

    const result = [
      `File: ${args.path}`,
      `Total lines: ${totalLines}`,
      `Showing: ${lines.length} line(s)`,
      '─'.repeat(60),
      ...lineNumbers,
    ].join('\n');

    return {
      content: [{ type: 'text', text: result }],
    };
  } catch (err: any) {
    return {
      content: [{ type: 'text', text: `Error reading script: ${err.message}` }],
      isError: true,
    };
  }
}

export function handleWriteScript(
  projectRoot: string,
  args: { path: string; content: string; create_backup?: boolean }
): ToolResult {
  try {
    const absPath = resolveProjectPath(projectRoot, args.path);
    writeTextFile(absPath, args.content, args.create_backup !== false);
    return {
      content: [{ type: 'text', text: `Script written: ${args.path} (${args.content.length} bytes)` }],
    };
  } catch (err: any) {
    return {
      content: [{ type: 'text', text: `Error writing script: ${err.message}` }],
      isError: true,
    };
  }
}

export function handleCreateScript(
  projectRoot: string,
  args: { path: string; type: string; template?: string; class_name?: string }
): ToolResult {
  try {
    const templates = args.type === 'gdscript' ? GDScriptTemplates : CSharpTemplates;
    const templateKey = args.template || 'node_script';
    let content = templates[templateKey];

    if (!content) {
      return {
        content: [{ type: 'text', text: `Unknown template: ${args.template}. Available: ${Object.keys(templates).join(', ')}` }],
        isError: true,
      };
    }

    // Apply class_name for GDScript
    if (args.class_name && args.type === 'gdscript') {
      content = content.replace('extends', `class_name ${args.class_name}\nextends`);
    }

    const absPath = resolveProjectPath(projectRoot, args.path);
    writeTextFile(absPath, content);

    return {
      content: [{ type: 'text', text: `Script created: ${args.path} (${args.type}, template: ${templateKey})` }],
    };
  } catch (err: any) {
    return {
      content: [{ type: 'text', text: `Error creating script: ${err.message}` }],
      isError: true,
    };
  }
}

export function handleListScripts(
  projectRoot: string,
  args: { path?: string; recursive?: boolean; type?: string }
): ToolResult {
  try {
    const extensions: string[] = [];
    if (!args.type || args.type === 'all') {
      extensions.push('.gd', '.cs');
    } else if (args.type === 'gdscript') {
      extensions.push('.gd');
    } else if (args.type === 'csharp') {
      extensions.push('.cs');
    }

    const scripts = findFilesByExtension(projectRoot, extensions, args.path, args.recursive);
    if (scripts.length === 0) {
      return {
        content: [{ type: 'text', text: `No ${args.type || 'script'} files found.` }],
      };
    }

    // Group by type
    const gdScripts = scripts.filter(s => s.endsWith('.gd'));
    const csScripts = scripts.filter(s => s.endsWith('.cs'));

    const lines: string[] = [];
    if (gdScripts.length > 0) {
      lines.push(`GDScript (${gdScripts.length}):`);
      lines.push(...gdScripts.map(s => `  ${s}`));
    }
    if (csScripts.length > 0) {
      if (lines.length > 0) lines.push('');
      lines.push(`C# (${csScripts.length}):`);
      lines.push(...csScripts.map(s => `  ${s}`));
    }

    return {
      content: [{ type: 'text', text: lines.join('\n') }],
    };
  } catch (err: any) {
    return {
      content: [{ type: 'text', text: `Error listing scripts: ${err.message}` }],
      isError: true,
    };
  }
}

// ---- Shader Tools ----

const ShaderTemplates: Record<string, string> = {
  spatial: `shader_type spatial;
render_mode blend_mix, depth_draw_opaque, cull_back, diffuse_lambert, specular_schlick_ggx;

void fragment() {
	ALBEDO = vec3(0.8, 0.2, 0.2);
}
`,
  canvas_item: `shader_type canvas_item;

void fragment() {
	COLOR = texture(TEXTURE, UV);
}
`,
  particles: `shader_type particles;

void process() {
	COLOR = vec4(1.0);
}
`,
  sky: `shader_type sky;

void sky() {
	COLOR = vec3(0.5, 0.6, 0.9);
}
`,
  fog: `shader_type fog;

void fog() {
	COLOR = vec3(0.8, 0.8, 0.9);
}
`,
};

export const readShaderSchema = {
  path: z.string().min(1).describe('Path to .gdshader file (relative to project root)'),
  line_start: z.number().optional().describe('Starting line (1-indexed, optional)'),
  line_count: z.number().optional().describe('Number of lines to read (optional)'),
};

export const createShaderSchema = {
  path: z.string().min(1).describe('Output path (relative to project root, e.g. "shaders/glow.gdshader")'),
  type: z.enum(['spatial', 'canvas_item', 'particles', 'sky', 'fog']).describe('Shader type template'),
};

export const listShadersSchema = {
  path: z.string().optional().default('').describe('Subdirectory to search (default: root)'),
  recursive: z.boolean().optional().default(true).describe('Search recursively (default: true)'),
};

export const writeShaderSchema = {
  path: z.string().min(1).describe('Path to .gdshader file (relative to project root)'),
  content: z.string().describe('New shader content'),
  create_backup: z.boolean().optional().default(true).describe('Create .bak backup (default: true)'),
};

export const validateScriptSchema = {
  path: z.string().min(1).describe('Path to .gd file to validate (relative to project root)'),
};

export const readScriptStructureSchema = {
  path: z.string().min(1).describe('Path to .gd file (relative to project root)'),
};

export const searchInScriptsSchema = {
  query: z.string().min(1).describe('Search term (function name, variable, keyword)'),
  type: z.enum(['gdscript', 'csharp', 'all']).optional().default('all').describe('Script type filter'),
  max_results: z.number().optional().default(50).describe('Max results'),
};

export const listVisualShadersSchema = {
  path: z.string().optional().default('').describe('Subdirectory to search (default: root)'),
  recursive: z.boolean().optional().default(true).describe('Search recursively'),
};

export const readVisualShaderSchema = {
  path: z.string().min(1).describe('Path to VisualShader .tres file (relative to project root)'),
};

export const readShaderIncludeSchema = {
  path: z.string().min(1).describe('Path to .gdshaderinc file (relative to project root)'),
};

export const createShaderIncludeSchema = {
  path: z.string().min(1).describe('Output path (e.g. "shaders/common.gdshaderinc")'),
};

export const listShaderIncludesSchema = {
  path: z.string().optional().default('').describe('Subdirectory to search'),
  recursive: z.boolean().optional().default(true).describe('Search recursively'),
};

export function handleReadShader(
  projectRoot: string,
  args: { path: string; line_start?: number; line_count?: number }
): ToolResult {
  try {
    const absPath = resolveProjectPath(projectRoot, args.path);
    const { lines, totalLines } = readFileLines(absPath, args.line_start, args.line_count);

    const lineNumbers = lines.map((_, i) => {
      const lineNum = (args.line_start || 1) + i;
      return `${String(lineNum).padStart(4, ' ')} | ${lines[i]}`;
    });

    const result = [
      `Shader: ${args.path}`,
      `Total lines: ${totalLines}`,
      `Showing: ${lines.length} line(s)`,
      '─'.repeat(60),
      ...lineNumbers,
    ].join('\n');

    return {
      content: [{ type: 'text', text: result }],
    };
  } catch (err: any) {
    return {
      content: [{ type: 'text', text: `Error reading shader: ${err.message}` }],
      isError: true,
    };
  }
}

export function handleCreateShader(
  projectRoot: string,
  args: { path: string; type: string }
): ToolResult {
  try {
    const template = ShaderTemplates[args.type];
    if (!template) {
      return {
        content: [{ type: 'text', text: `Unknown shader type: ${args.type}. Available: ${Object.keys(ShaderTemplates).join(', ')}` }],
        isError: true,
      };
    }

    const absPath = resolveProjectPath(projectRoot, args.path);
    writeTextFile(absPath, template);

    return {
      content: [{ type: 'text', text: `Shader created: ${args.path} (type: ${args.type})` }],
    };
  } catch (err: any) {
    return {
      content: [{ type: 'text', text: `Error creating shader: ${err.message}` }],
      isError: true,
    };
  }
}

export function handleListShaders(
  projectRoot: string,
  args: { path?: string; recursive?: boolean }
): ToolResult {
  try {
    const shaders = findFilesByExtension(projectRoot, ['.gdshader'], args.path, args.recursive);
    if (shaders.length === 0) {
      return {
        content: [{ type: 'text', text: 'No .gdshader files found.' }],
      };
    }
    return {
      content: [{ type: 'text', text: `Shaders (${shaders.length}):\n${shaders.sort().join('\n')}` }],
    };
  } catch (err: any) {
    return {
      content: [{ type: 'text', text: `Error listing shaders: ${err.message}` }],
      isError: true,
    };
  }
}

export function handleWriteShader(
  projectRoot: string,
  args: { path: string; content: string; create_backup?: boolean }
): ToolResult {
  try {
    const absPath = resolveProjectPath(projectRoot, args.path);
    writeTextFile(absPath, args.content, args.create_backup !== false);
    return {
      content: [{ type: 'text', text: `Shader written: ${args.path} (${args.content.length} bytes)` }],
    };
  } catch (err: any) {
    return {
      content: [{ type: 'text', text: `Error writing shader: ${err.message}` }],
      isError: true,
    };
  }
}

// ---- GDScript Validator ----

export function handleValidateScript(
  projectRoot: string,
  args: { path: string }
): ToolResult {
  try {
    const absPath = resolveProjectPath(projectRoot, args.path);
    const { lines } = readFileLines(absPath);
    const issues: string[] = [];
    let extendsFound = false;
    let indentIssues = 0;

    for (let i = 0; i < lines.length; i++) {
      const lineNum = i + 1;
      const line = lines[i];
      const trimmed = line.trim();

      if (trimmed.length === 0 || trimmed.startsWith('#')) continue;

      // extends should be the first non-comment/non-empty statement
      if (!extendsFound && trimmed.startsWith('extends ')) {
        extendsFound = true;
        if (i > 2 && !lines.slice(0, i).every(l => l.trim().length === 0 || l.trim().startsWith('class_name') || l.trim().startsWith('#'))) {
          issues.push(`  Line ${lineNum}: 'extends' should appear before other statements (except class_name)`);
        }
      }

      // Check for common errors
      if (trimmed.includes('func ') && !trimmed.includes(':') && !trimmed.includes('(')) {
        issues.push(`  Line ${lineNum}: Function declaration missing '()' or ':'`);
      }
      if (trimmed.includes('func ') && trimmed.includes(')') && trimmed.endsWith(')')) {
        issues.push(`  Line ${lineNum}: Function declaration missing ':' after parameters`);
      }
      if (trimmed.match(/^var\s+\w+\s*$/) && !trimmed.includes('=') && !trimmed.includes(':')) {
        issues.push(`  Line ${lineNum}: Variable declaration missing type hint or initializer`);
      }
      if (trimmed.startsWith('@export') && trimmed.includes('=')) {
        // This is fine: @export var x = 5
      } else if (trimmed.match(/^@export\s*$/) || (trimmed.startsWith('@export ') && !trimmed.includes('var '))) {
        issues.push(`  Line ${lineNum}: @export annotation should be followed by 'var'`);
      }

      // Check tab/space mixing
      if (line.length > 0) {
        const leading = line.match(/^(\s*)/)?.[1].length || 0;
        const tabs = (line.match(/^\t*/)?.[0].length || 0) * 4;
        const spaces = (line.match(/^ */)?.[0].length || 0);
        if (tabs > 0 && spaces > 0 && spaces % 4 !== 0) {
          indentIssues++;
        }
      }
    }

    if (!extendsFound) {
      issues.push(`  Warning: No 'extends' statement found`);
    }

    if (indentIssues > 0) {
      issues.push(`  Warning: ${indentIssues} line(s) with mixed tab/space indentation`);
    }

    if (issues.length === 0) {
      return {
        content: [{ type: 'text', text: `Validation passed: ${args.path} (${lines.length} lines, no issues found)` }],
      };
    }

    return {
      content: [{ type: 'text', text: `Validation results for ${args.path}:\n\nIssues found:\n${issues.join('\n')}` }],
    };
  } catch (err: any) {
    return {
      content: [{ type: 'text', text: `Error validating script: ${err.message}` }],
      isError: true,
    };
  }
}

// ---- Script Structure Analyzer ----

export function handleReadScriptStructure(
  projectRoot: string,
  args: { path: string }
): ToolResult {
  try {
    const absPath = resolveProjectPath(projectRoot, args.path);
    const { lines } = readFileLines(absPath);
    const structure: { class_name?: string; extends?: string; signals: string[]; exports: string[]; functions: { name: string; params: string; line: number }[]; vars: string[] } = {
      signals: [],
      exports: [],
      functions: [],
      vars: [],
    };

    for (let i = 0; i < lines.length; i++) {
      const lineNum = i + 1;
      const trimmed = lines[i].trim();

      if (trimmed.startsWith('class_name ') && !structure.class_name) {
        structure.class_name = trimmed.slice(11).trim();
      }
      if (trimmed.startsWith('extends ') && !structure.extends) {
        structure.extends = trimmed.slice(8).trim();
      }
      if (trimmed.startsWith('signal ')) {
        structure.signals.push(trimmed.slice(7).trim());
      }
      if (trimmed.startsWith('@export ')) {
        structure.exports.push(trimmed.slice(8).trim());
      }
      if (trimmed.startsWith('@export_category ')) {
        structure.exports.push(trimmed);
      }
      if (trimmed.startsWith('@onready ')) {
        structure.vars.push(trimmed);
      }
      if (trimmed.startsWith('func ')) {
        const funcMatch = trimmed.match(/^func\s+(\w+)\s*(\([^)]*\))?/);
        if (funcMatch) {
          structure.functions.push({
            name: funcMatch[1],
            params: funcMatch[2] || '()',
            line: lineNum,
          });
        }
      }
      if (trimmed.startsWith('var ')) {
        structure.vars.push(trimmed);
      }
    }

    const out: string[] = [];
    out.push(`Script Structure: ${args.path}`);
    out.push('');
    if (structure.class_name) out.push(`  class_name: ${structure.class_name}`);
    if (structure.extends) out.push(`  extends:    ${structure.extends}`);
    out.push('');

    if (structure.signals.length > 0) {
      out.push(`Signals (${structure.signals.length}):`);
      structure.signals.forEach(s => out.push(`  signal ${s}`));
      out.push('');
    }

    if (structure.exports.length > 0) {
      out.push(`Exports (${structure.exports.length}):`);
      structure.exports.forEach(e => out.push(`  ${e}`));
      out.push('');
    }

    if (structure.vars.length > 0) {
      out.push(`Variables (${structure.vars.length}):`);
      structure.vars.forEach(v => out.push(`  Line ${lines.findIndex((l, idx) => l.trim() === v) + 1}: ${v}`));
      out.push('');
    }

    if (structure.functions.length > 0) {
      out.push(`Functions (${structure.functions.length}):`);
      structure.functions.forEach(f => out.push(`  L${f.line}: func ${f.name}${f.params}`));
      out.push('');
    }

    return { content: [{ type: 'text', text: out.join('\n') }] };
  } catch (err: any) {
    return { content: [{ type: 'text', text: `Error reading structure: ${err.message}` }], isError: true };
  }
}

// ---- Search in Scripts ----

export function handleSearchInScripts(
  projectRoot: string,
  args: { query: string; type?: string; max_results?: number }
): ToolResult {
  try {
    const extensions: string[] = [];
    if (!args.type || args.type === 'all') { extensions.push('.gd', '.cs'); }
    else if (args.type === 'gdscript') { extensions.push('.gd'); }
    else { extensions.push('.cs'); }

    const scripts = findFilesByExtension(projectRoot, extensions);
    const results: { file: string; line_num: number; context: string; line: string }[] = [];
    const lowerQuery = args.query.toLowerCase();
    const maxResults = args.max_results || 50;

    for (const scriptPath of scripts) {
      if (results.length >= maxResults) break;
      const absPath = resolveProjectPath(projectRoot, scriptPath);
      const { lines } = readFileLines(absPath);

      let currentFunc = '(top level)';
      for (let i = 0; i < lines.length; i++) {
        if (results.length >= maxResults) break;
        const line = lines[i].trim();
        if (line.startsWith('func ')) {
          const m = line.match(/^func\s+(\w+)/);
          if (m) currentFunc = m[1];
        }
        if (lines[i].toLowerCase().includes(lowerQuery)) {
          results.push({ file: scriptPath, line_num: i + 1, context: currentFunc, line: line.substring(0, 80) });
        }
      }
    }

    if (results.length === 0) {
      return { content: [{ type: 'text', text: `No matches for "${args.query}" in scripts.` }] };
    }

    const out: string[] = [`Search "${args.query}" in scripts (${results.length} results):`, ''];
    for (const r of results) {
      out.push(`  ${r.file}:${r.line_num} [${r.context}]`);
      out.push(`    ${r.line}`);
    }

    return { content: [{ type: 'text', text: out.join('\n') }] };
  } catch (err: any) {
    return {       content: [{ type: 'text', text: `Error searching scripts: ${err.message}` }], isError: true };
  }
}

// ---- Visual Shader Graph Tools ----

export function handleListVisualShaders(
  projectRoot: string,
  args: { path?: string; recursive?: boolean }
): ToolResult {
  try {
    const resources = findFilesByExtension(projectRoot, ['.tres'], args.path, args.recursive);
    const shaders: { path: string; mode: string }[] = [];

    for (const res of resources) {
      try {
        const absPath = resolveProjectPath(projectRoot, res);
        const { content } = readTextFile(absPath);
        const match = content.match(/type="(VisualShader)"/);
        if (match) {
          const modeMatch = content.match(/shader_type\s*=\s*"(\w+)"/);
          shaders.push({ path: res, mode: modeMatch?.[1] || 'unknown' });
        }
      } catch { /* skip */ }
    }

    if (shaders.length === 0) {
      return { content: [{ type: 'text', text: 'No VisualShader files found.' }] };
    }

    const byMode: Record<string, string[]> = {};
    for (const s of shaders) {
      (byMode[s.mode] ||= []).push(s.path);
    }

    const lines: string[] = [`Visual Shaders (${shaders.length}):`, ''];
    for (const [mode, paths] of Object.entries(byMode).sort()) {
      lines.push(`  ShaderType.${mode} (${paths.length}):`);
      paths.sort().forEach(p => lines.push(`    ${p}`));
    }

    return { content: [{ type: 'text', text: lines.join('\n') }] };
  } catch (err: any) {
    return { content: [{ type: 'text', text: `Error listing visual shaders: ${err.message}` }], isError: true };
  }
}

export function handleReadVisualShader(
  projectRoot: string,
  args: { path: string }
): ToolResult {
  try {
    const absPath = resolveProjectPath(projectRoot, args.path);
    const { content } = readTextFile(absPath);
    const doc = parseResource(content);

    // Parse nodes
    const nodes: { id: string; type: string; position: string }[] = [];
    const nodePattern = /nodes\/(\d+)\/node\s*=\s*(.+)/g;
    let match: RegExpExecArray | null;
    while ((match = nodePattern.exec(content)) !== null) {
      nodes.push({ id: match[1], type: match[2], position: '?' });
    }

    // Parse positions
    const posPattern = /nodes\/(\d+)\/position\s*=\s*(.+)/g;
    while ((match = posPattern.exec(content)) !== null) {
      const node = nodes.find(n => n.id === match![1]);
      if (node) node.position = match![2];
    }

    // Resolve sub_resource node types
    for (const node of nodes) {
      if (node.type.startsWith('SubResource(')) {
        const subId = node.type.match(/SubResource\("([^"]+)"\)/)?.[1] || '';
        for (const sub of doc.subResources) {
          if (sub.id === subId) {
            node.type = sub.type;
            break;
          }
        }
      }
    }

    // Parse connections
    const connections: { from: string; from_port: string; to: string; to_port: string }[] = [];
    const connMatch = content.match(/node_connections\s*=\s*\[([\s\S]*?)\]/);
    if (connMatch) {
      const entries = connMatch[1].match(/\{[^}]+\}/g) || [];
      for (const entry of entries) {
        const fm = entry.match(/"from_node":\s*(\d+)/);
        const fp = entry.match(/"from_port":\s*(\d+)/);
        const tm = entry.match(/"to_node":\s*(\d+)/);
        const tp = entry.match(/"to_port":\s*(\d+)/);
        if (fm && fp && tm && tp) {
          connections.push({ from: fm[1], from_port: fp[1], to: tm[1], to_port: tp[1] });
        }
      }
    }

    const modeMatch = content.match(/shader_type\s*=\s*"(\w+)"/);
    const lines: string[] = [];
    lines.push(`Visual Shader: ${args.path}`);
    lines.push(`Shader Type: ${modeMatch?.[1] || 'unknown'}`);
    lines.push(`Nodes: ${nodes.length}  |  Connections: ${connections.length}`);
    lines.push('');

    if (nodes.length > 0) {
      lines.push('Nodes:');
      for (const node of nodes) {
        lines.push(`  [#${node.id}] ${node.type}  @ ${node.position}`);
      }
      lines.push('');
    }

    if (connections.length > 0) {
      lines.push('Connections:');
      for (const conn of connections) {
        lines.push(`  node#${conn.from}:${conn.from_port} → node#${conn.to}:${conn.to_port}`);
      }
    }

    return { content: [{ type: 'text', text: lines.join('\n') }] };
  } catch (err: any) {
    return { content: [{ type: 'text', text: `Error reading visual shader: ${err.message}` }], isError: true };
  }
}

// ---- Shader Include Tools ----

export function handleReadShaderInclude(
  projectRoot: string,
  args: { path: string }
): ToolResult {
  try {
    const absPath = resolveProjectPath(projectRoot, args.path);
    const { lines, totalLines } = readFileLines(absPath);
    const result = [`Shader Include: ${args.path}`, `Lines: ${totalLines}`, '─'.repeat(60)];
    lines.forEach((line, i) => result.push(`${String(i + 1).padStart(4, ' ')} | ${line}`));
    return { content: [{ type: 'text', text: result.join('\n') }] };
  } catch (err: any) {
    return { content: [{ type: 'text', text: `Error reading shader include: ${err.message}` }], isError: true };
  }
}

export function handleCreateShaderInclude(
  projectRoot: string,
  args: { path: string }
): ToolResult {
  try {
    const template = '// Godot Shader Include\n// Shared functions and constants\n\nvec3 to_linear(vec3 srgb) {\n\treturn pow(srgb, vec3(2.2));\n}\n';
    const absPath = resolveProjectPath(projectRoot, args.path);
    writeTextFile(absPath, template);
    return { content: [{ type: 'text', text: `Shader include created: ${args.path}` }] };
  } catch (err: any) {
    return { content: [{ type: 'text', text: `Error creating shader include: ${err.message}` }], isError: true };
  }
}

export function handleListShaderIncludes(
  projectRoot: string,
  args: { path?: string; recursive?: boolean }
): ToolResult {
  try {
    const includes = findFilesByExtension(projectRoot, ['.gdshaderinc'], args.path, args.recursive);
    if (includes.length === 0) return { content: [{ type: 'text', text: 'No .gdshaderinc files found.' }] };
    return { content: [{ type: 'text', text: `Shader Includes (${includes.length}):\n${includes.sort().join('\n')}` }] };
  } catch (err: any) {
    return { content: [{ type: 'text', text: `Error: ${err.message}` }], isError: true };
  }
}

// ---- GDScript Writer Tools ----

export const addScriptFunctionSchema = {
  path: z.string().describe('Path to .gd script file'),
  func_name: z.string().min(1).refine(v => GD_SCRIPT_IDENTIFIER.test(v), 'func_name must be a valid GDScript identifier (e.g. "my_func")').describe('Function name'),
  params: z.array(z.string()).optional().default([]).refine(arr => arr.every(isValidGdParam), 'Each param must be a valid GDScript parameter (e.g. "delta: float")').describe('Parameter names (e.g. ["delta: float"])'),
  return_type: z.string().optional().refine(v => isSingleLineSafe(v), 'return_type must be a single line').describe('Return type hint'),
  body: z.string().optional().default('pass').describe('Function body'),
  after_func: z.string().optional().describe('Insert after this function'),
};

export const addScriptSignalSchema = {
  path: z.string().describe('Path to .gd script file'),
  signal_name: z.string().min(1).refine(v => GD_SCRIPT_IDENTIFIER.test(v), 'signal_name must be a valid GDScript identifier').describe('Signal name'),
  params: z.array(z.string()).optional().default([]).refine(arr => arr.every(isValidGdParam), 'Each param must be a valid GDScript parameter').describe('Signal parameters'),
};

export const addScriptExportSchema = {
  path: z.string().describe('Path to .gd script file'),
  var_name: z.string().min(1).refine(v => GD_SCRIPT_IDENTIFIER.test(v), 'var_name must be a valid GDScript identifier').describe('Variable name'),
  var_type: z.string().optional().refine(v => isSingleLineSafe(v), 'var_type must be a single line').describe('Type hint'),
  default_value: z.string().optional().describe('Default value'),
  export_hint: z.string().optional().refine(v => isSingleLineSafe(v), 'export_hint must be a single line').describe('Export hint (e.g. "int, 0, 100")'),
};

export function handleAddScriptFunction(
  projectRoot: string,
  args: { path: string; func_name: string; params?: string[]; return_type?: string; body?: string; after_func?: string }
): ToolResult {
  try {
    const absPath = resolveProjectPath(projectRoot, args.path);
    const { content } = readTextFile(absPath);

    const params = args.params || [];
    const paramStr = params.join(', ');
    const returnHint = args.return_type ? ` -> ${args.return_type}` : '';
    const body = args.body || 'pass';

    const funcCode = `\nfunc ${args.func_name}(${paramStr})${returnHint}:\n\t${body.replace(/\n/g, '\n\t')}\n`;
    const newContent = content + funcCode;
    writeTextFile(absPath, newContent, true);

    return { content: [{ type: 'text', text: `Function "${args.func_name}" added to ${args.path}` }] };
  } catch (err: any) {
    return { content: [{ type: 'text', text: `Error: ${err.message}` }], isError: true };
  }
}

export function handleAddScriptSignal(
  projectRoot: string,
  args: { path: string; signal_name: string; params?: string[] }
): ToolResult {
  try {
    const absPath = resolveProjectPath(projectRoot, args.path);
    const { content } = readTextFile(absPath);

    const params = args.params || [];
    const paramStr = params.join(', ');
    const signalLine = `signal ${args.signal_name}${paramStr ? `(${paramStr})` : ''}\n`;

    const lines = content.split('\n');
    let insertIdx = 0;
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      if (line.startsWith('class_name ') || line.startsWith('extends ')) {
        insertIdx = i + 1;
      }
    }

    const newLines = [...lines.slice(0, insertIdx), signalLine, ...lines.slice(insertIdx)];
    writeTextFile(absPath, newLines.join('\n'), true);

    return { content: [{ type: 'text', text: `Signal "${args.signal_name}" added to ${args.path}` }] };
  } catch (err: any) {
    return { content: [{ type: 'text', text: `Error: ${err.message}` }], isError: true };
  }
}

export function handleAddScriptExport(
  projectRoot: string,
  args: { path: string; var_name: string; var_type?: string; default_value?: string; export_hint?: string }
): ToolResult {
  try {
    const absPath = resolveProjectPath(projectRoot, args.path);
    const { content } = readTextFile(absPath);

    let exportLine = '@export';
    if (args.export_hint) exportLine += `(${args.export_hint})`;
    if (args.var_type) exportLine += ` var ${args.var_name}: ${args.var_type}`;
    else exportLine += ` var ${args.var_name}`;
    if (args.default_value !== undefined) exportLine += ` = ${args.default_value}`;
    exportLine += '\n';

    const lines = content.split('\n');
    let insertIdx = 0;
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      if (line.startsWith('class_name ') || line.startsWith('extends ')) {
        insertIdx = i + 1;
      }
    }

    const newLines = [...lines.slice(0, insertIdx), exportLine, ...lines.slice(insertIdx)];
    writeTextFile(absPath, newLines.join('\n'), true);

    return { content: [{ type: 'text', text: `@export "${args.var_name}" added to ${args.path}` }] };
  } catch (err: any) {
    return { content: [{ type: 'text', text: `Error: ${err.message}` }], isError: true };
  }
}

// ---- Shader Validation & Compilation ----

export const validateShaderSchema = {
  path: z.string().min(1).describe('Path to .gdshader file to validate (relative to project root)'),
};

export const compileShaderSchema = {
  path: z.string().min(1).describe('Path to .gdshader file to compile (relative to project root)'),
};

export function handleValidateShader(
  projectRoot: string,
  args: { path: string }
): ToolResult {
  try {
    const absPath = resolveProjectPath(projectRoot, args.path);
    if (!absPath.endsWith('.gdshader') && !absPath.endsWith('.gdshaderinc')) {
      return { content: [{ type: 'text', text: `Expected .gdshader or .gdshaderinc file: ${args.path}` }], isError: true };
    }

    const { lines } = readFileLines(absPath);
    const content = lines.join('\n');
    const issues: string[] = [];
    let shaderType = '';
    let braceDepth = 0;

    for (let i = 0; i < lines.length; i++) {
      const lineNum = i + 1;
      const line = lines[i];
      const trimmed = line.trim();

      // Skip comments and empty lines
      if (trimmed.length === 0 || trimmed.startsWith('//')) continue;

      // Check shader_type
      if (trimmed.startsWith('shader_type ')) {
        if (shaderType) {
          issues.push(`  Line ${lineNum}: Duplicate shader_type declaration`);
        } else {
          shaderType = trimmed.replace(/^shader_type\s+/, '').replace(';', '').trim();
          if (!['spatial', 'canvas_item', 'particles', 'sky', 'fog'].includes(shaderType)) {
            issues.push(`  Line ${lineNum}: Unknown shader_type "${shaderType}"`);
          }
        }
      }

      // Track brace depth
      for (const ch of line) {
        if (ch === '{') braceDepth++;
        if (ch === '}') braceDepth--;
      }

      // Check for missing semicolons in declarations
      if (
        (trimmed.startsWith('uniform ') || trimmed.startsWith('varying ') || trimmed.startsWith('hint_')) &&
        !trimmed.endsWith(';') && !trimmed.endsWith('{') && !line.trimEnd().endsWith('{')
      ) {
        // Check if next non-empty line starts with {
        const nextNonEmpty = lines.slice(i + 1).find(l => l.trim().length > 0);
        if (!nextNonEmpty || !nextNonEmpty.trim().startsWith('{')) {
          issues.push(`  Line ${lineNum}: Declaration may be missing ';'`);
        }
      }

      // Check function declarations have matching braces
      if (trimmed.match(/^\w+\s+\w+\s*\(/) && !trimmed.includes(':') && !trimmed.endsWith(';') && !trimmed.endsWith('{')) {
        issues.push(`  Line ${lineNum}: Function may be missing return type ':'`);
      }
    }

    if (!shaderType) {
      issues.push(`  Warning: No 'shader_type' declaration found`);
    }

    if (braceDepth !== 0) {
      issues.push(`  Error: Unbalanced braces (depth: ${braceDepth > 0 ? '+' : ''}${braceDepth})`);
    }

    if (issues.length === 0) {
      const info = shaderType ? ` (${shaderType})` : '';
      return {
        content: [{ type: 'text', text: `Shader validation passed: ${args.path}${info} — ${lines.length} lines, no issues found` }],
      };
    }

    return {
      content: [{ type: 'text', text: `Shader validation for ${args.path}:\n\nIssues:\n${issues.join('\n')}` }],
    };
  } catch (err: any) {
    return { content: [{ type: 'text', text: `Error validating shader: ${err.message}` }], isError: true };
  }
}

/**
 * Compile (reimport) a shader via the Godot editor plugin.
 * This triggers Godot's built-in shader compiler and reports any compilation errors.
 */
export async function handleCompileShader(
  projectRoot: string,
  args: { path: string }
): Promise<ToolResult> {
  try {
    // Try editor plugin first (triggers real shader compiler)
    const { sendEditorCommand } = await import('./editor.js');
    const result = await sendEditorCommand('reimport_asset', { path: args.path });
    if (result && !result.error) {
      return { content: [{ type: 'text', text: `Shader compiled: ${args.path}\n\nGodot shader compiler triggered via editor plugin. Check the Godot Output panel for compilation results.` }] };
    }
    throw new Error(result?.error || 'Editor plugin unreachable');
  } catch {
    // Fallback: validate locally and explain how to compile
    const validateResult = handleValidateShader(projectRoot, { path: args.path });
    const validateText = validateResult.content[0].text as string;
    
    if (validateResult.isError) {
      return validateResult;
    }

    const hasIssues = validateText.includes('Issues:');
    const msg = hasIssues
      ? `Shader compilation attempted: ${args.path}\n\n⚠️  Validation found issues (see above). Fix them, then reimport the shader in Godot:\n  - Open the Godot editor\n  - Select the shader in the FileSystem dock\n  - Click "Reimport" or press Ctrl+Shift+R\n\nOr enable the Godot MCP editor plugin for automatic compilation.`
      : `Shader ready for compilation: ${args.path}\n\n✨ Local validation passed. To compile:\n  1. Open the Godot editor\n  2. The shader will auto-compile on import\n\nOr enable the Godot MCP editor plugin for one-click compilation:\n  cp -r addons/godot-mcp <project>/addons/`;

    return { content: [{ type: 'text', text: validateText + '\n\n' + msg }] };
  }
}
