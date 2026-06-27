// ============================================================
// Godot MCP Server - Godot Engine Control Tools
// ============================================================

import { z } from 'zod';
import { ToolResult } from '../utils/types.js';
import {
  findGodotBinary,
  getGodotVersion,
  launchGodotEditor,
  runGodotProject,
  exportGodotProject,
  getRecentOutput,
  cleanupProcesses,
  captureScreenshot,
  detectRunningGodot,
} from '../utils/godot_cli.js';
import { sendEditorCommand } from './editor.js';
import fs from 'node:fs';
import pathMod from 'node:path';

// ---- Tool Schemas ----

export const getGodotVersionSchema = {};

export const launchEditorSchema = {
  project_path: z.string().optional().describe('Project path (default: current project root)'),
  scene: z.string().optional().describe('Scene to open on launch (e.g. "res://main.tscn")'),
};

export const runProjectSchema = {
  project_path: z.string().optional().describe('Project path (default: current project root)'),
  scene: z.string().optional().describe('Specific scene to run'),
  headless: z.boolean().optional().default(false).describe('Run in headless mode (no window)'),
  debug: z.boolean().optional().default(false).describe('Run with debugger'),
  window_size: z.string().optional().describe('Window size (e.g. "1280x720", "1920x1080")'),
};

export const monitorOutputSchema = {
  clear: z.boolean().optional().default(false).describe('Clear accumulated output after reading'),
};

export const exportProjectSchema = {
  preset: z.string().min(1).describe('Export preset name (as defined in your export_presets.cfg, e.g. "Windows Desktop", "Linux/X11")'),
  output_path: z.string().min(1).describe('Output file path (absolute or relative) for the exported build'),
  project_path: z.string().optional().describe('Project path (default: current project root)'),
};

export const captureScreenshotSchema = {
  output_path: z.string().optional().default('screenshot.png').describe('Output file path for the screenshot'),
  window_title: z.string().optional().describe('Window title to capture (default: capture Godot window)'),
  delay: z.number().optional().default(1).describe('Delay in seconds before capture'),
};

export const stopProjectSchema = {};

export const isEditorRunningSchema = {};

// ---- Tool Handlers ----

export function handleGetGodotVersion(): ToolResult {
  try {
    const binaryPath = findGodotBinary();
    if (!binaryPath) {
      return {
        content: [{ type: 'text', text: 'Godot binary not found. Set GODOT_PATH environment variable or install Godot in /Applications/.' }],
        isError: true,
      };
    }

    const info = getGodotVersion(binaryPath);
    const lines = [
      `Godot Version: ${info.version}`,
      `Binary Path: ${info.path}`,
      `Platform: ${info.platform}`,
    ];

    // Warn if Godot 3.x is detected (not supported)
    const majorMatch = info.version.match(/^(\d+)\./);
    if (majorMatch && parseInt(majorMatch[1], 10) < 4) {
      lines.push('');
      lines.push('⚠️  WARNING: Godot 3.x detected. This MCP server only supports Godot 4.x.');
      lines.push('    Please install Godot 4.x from https://godotengine.org/download');
    }

    return {
      content: [{ type: 'text', text: lines.join('\n') }],
    };
  } catch (err: any) {
    return {
      content: [{ type: 'text', text: `Error getting Godot version: ${err.message}` }],
      isError: true,
    };
  }
}

export function handleLaunchEditor(
  projectRoot: string,
  args: { project_path?: string; scene?: string }
): ToolResult {
  try {
    const binaryPath = findGodotBinary();
    if (!binaryPath) {
      return {
        content: [{ type: 'text', text: 'Godot binary not found. Set GODOT_PATH or install Godot.' }],
        isError: true,
      };
    }

    const projectPath = args.project_path || projectRoot;
    const result = launchGodotEditor(binaryPath, projectPath, args.scene);

    return {
      content: [{ type: 'text', text: `Godot editor launched. PID: ${result.pid}\nCommand: ${result.command}` }],
    };
  } catch (err: any) {
    return {
      content: [{ type: 'text', text: `Error launching editor: ${err.message}` }],
      isError: true,
    };
  }
}

export function handleRunProject(
  projectRoot: string,
  args: { project_path?: string; scene?: string; headless?: boolean; debug?: boolean; window_size?: string }
): ToolResult {
  try {
    const binaryPath = findGodotBinary();
    if (!binaryPath) {
      return {
        content: [{ type: 'text', text: 'Godot binary not found. Set GODOT_PATH or install Godot.' }],
        isError: true,
      };
    }

    const projectPath = args.project_path || projectRoot;
    const result = runGodotProject(binaryPath, projectPath, {
      scene: args.scene,
      headless: args.headless,
      debug: args.debug,
      window_size: args.window_size,
    });

    const details: string[] = [`Godot project running. PID: ${result.pid}`, `Command: ${result.command}`];
    if (args.window_size) details.push(`Window: ${args.window_size}`);

    return {
      content: [{ type: 'text', text: details.join('\n') }],
    };
  } catch (err: any) {
    return {
      content: [{ type: 'text', text: `Error running project: ${err.message}` }],
      isError: true,
    };
  }
}

export async function handleMonitorOutput(args: { clear?: boolean }): Promise<ToolResult> {
  try {
    const lines: string[] = [];

    // 1. 读取 Godot 进程输出
    const processOutput = getRecentOutput(args.clear);
    if (processOutput.length > 0) {
      lines.push('=== Godot Process Output ===');
      lines.push(...processOutput);
    }

    // 2. 尝试读取编辑器插件输出
    try {
      const editorResult = await sendEditorCommand('get_editor_output');
      const editorOutput = editorResult?.output || [];
      if (editorOutput.length > 0) {
        if (lines.length > 0) lines.push('');
        lines.push('=== Editor Plugin Output ===');
        lines.push(...editorOutput);
      }
    } catch {
      // 编辑器未连接，跳过
    }

    if (lines.length === 0) {
      return {
        content: [{ type: 'text', text: 'No recent Godot output available. (Editor plugin not connected, no spawned processes.)' }],
      };
    }

    return {
      content: [{ type: 'text', text: lines.join('\n') }],
    };
  } catch (err: any) {
    return {
      content: [{ type: 'text', text: `Error reading output: ${err.message}` }],
      isError: true,
    };
  }
}

export function handleExportProject(
  projectRoot: string,
  args: { preset: string; output_path: string; project_path?: string }
): ToolResult {
  try {
    const binaryPath = findGodotBinary();
    if (!binaryPath) {
      return {
        content: [{ type: 'text', text: 'Godot binary not found. Set GODOT_PATH or install Godot.' }],
        isError: true,
      };
    }

    const projectPath = args.project_path || projectRoot;
    const result = exportGodotProject(binaryPath, projectPath, args.preset, args.output_path);

    return {
      content: [{ type: 'text', text: `Export started. PID: ${result.pid}\nPreset: ${args.preset}\nOutput: ${args.output_path}\nCommand: ${result.command}\n\nUse monitor_output to check build progress.` }],
    };
  } catch (err: any) {
    return {
      content: [{ type: 'text', text: `Error exporting project: ${err.message}` }],
      isError: true,
    };
  }
}

export function handleCaptureScreenshot(
  _projectRoot: string,
  args: { output_path?: string; window_title?: string; delay?: number }
): ToolResult {
  try {
    const result = captureScreenshot(
      args.output_path || 'screenshot.png',
      args.window_title,
      args.delay
    );

    if (result.success) {
      return { content: [{ type: 'text', text: result.message }] };
    }
    return { content: [{ type: 'text', text: result.message }], isError: true };
  } catch (err: any) {
    return { content: [{ type: 'text', text: `Screenshot error: ${err.message}` }], isError: true };
  }
}

export function handleStopProject(): ToolResult {
  try {
    cleanupProcesses();
    return { content: [{ type: 'text', text: 'All running Godot processes stopped.' }] };
  } catch (err: any) {
    return { content: [{ type: 'text', text: `Error: ${err.message}` }], isError: true };
  }
}

export function handleIsEditorRunning(): ToolResult {
  try {
    const result = detectRunningGodot();
    if (!result.running) {
      return { content: [{ type: 'text', text: 'No Godot process detected.' }] };
    }

    const lines: string[] = [];
    lines.push(`Godot is running:`);
    lines.push(`  Editor: ${result.editor ? 'yes ✅' : 'no'}`);
    lines.push(`  Playing: ${result.playing ? 'yes ▶️' : 'no'}`);
    lines.push(`  PIDs: ${result.pids.join(', ') || 'unknown'}`);

    return { content: [{ type: 'text', text: lines.join('\n') }] };
  } catch (err: any) {
    return { content: [{ type: 'text', text: `Error: ${err.message}` }], isError: true };
  }
}

// ---- Project Discovery ----

export const listProjectsSchema = {
  directory: z.string().optional().describe('Directory to search (default: current directory)'),
  recursive: z.boolean().optional().default(true).describe('Search recursively (default: true)'),
};

export function handleListProjects(
  _projectRoot: string,
  args: { directory?: string; recursive?: boolean }
): ToolResult {
  try {
    const startDir = args.directory || process.cwd();
    const recursive = args.recursive !== false;
    const isProject = (dir: string) => fs.existsSync(pathMod.join(dir, 'project.godot'));

    const found: { path: string; name: string }[] = [];

    function scan(dir: string, depth: number) {
      if (depth > 4) return;
      try {
        const entries = fs.readdirSync(dir, { withFileTypes: true });
        for (const entry of entries) {
          if (!entry.isDirectory() || entry.name.startsWith('.') || entry.name === 'node_modules') continue;
          const fullPath = pathMod.join(dir, entry.name);
          if (isProject(fullPath)) found.push({ path: fullPath, name: entry.name });
          if (recursive && found.length < 50) scan(fullPath, depth + 1);
        }
      } catch { /* permission denied */ }
    }

    if (isProject(startDir)) found.push({ path: startDir, name: pathMod.basename(startDir) });
    scan(startDir, 0);

    if (found.length === 0) {
      return { content: [{ type: 'text', text: `No Godot projects found in ${startDir}` }] };
    }

    const lines: string[] = [`Godot Projects (${found.length}):`, ''];
    for (const proj of found) {
      let name = proj.name;
      try {
        const configContent = fs.readFileSync(pathMod.join(proj.path, 'project.godot'), 'utf-8');
        const nameMatch = configContent.match(/config\/name="([^"]+)"/);
        if (nameMatch) name = nameMatch[1];
      } catch { /* use folder name */ }
      lines.push(`  ${proj.path}`);
      lines.push(`    Name: ${name}`);
    }

    return { content: [{ type: 'text', text: lines.join('\n') }] };
  } catch (err: any) {
    return { content: [{ type: 'text', text: `Error: ${err.message}` }], isError: true };
  }
}
