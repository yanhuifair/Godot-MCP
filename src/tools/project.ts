// Copyright (c) 2026 FairYan
// SPDX-License-Identifier: AGPL-3.0-or-later
// ============================================================
// Godot MCP Server - Project Tools
// ============================================================

import { z } from 'zod';
import { toolError, ErrorCode } from '../utils/errors.js';
import { ToolResult, FileEntry, SearchMatch } from '../utils/types.js';
import {
  listFiles,
  searchInProject,
  readTextFile,
  findFilesByExtension,
  findProjectRoot,
  resolveProjectPath,
  deleteFile,
  moveFile,
  writeTextFile,
} from '../utils/file_utils.js';
import { parseConfig, serializeConfig } from '../parsers/config_parser.js';
import { parseScene } from '../parsers/scene_parser.js';
import fs from 'node:fs';

// ---- Tool Schemas ----

export const listProjectFilesSchema = {
  path: z.string().optional().default('').describe('Subdirectory relative to project root (default: root)'),
  pattern: z.string().optional().describe('Glob pattern filter (e.g. "*.tscn")'),
  recursive: z.boolean().optional().default(true).describe('Recurse into subdirectories (default: true)'),
};

export const readProjectConfigSchema = {};

export const searchInProjectSchema = {
  query: z.string().min(1).describe('Search term (case-insensitive)'),
  pattern: z.string().optional().describe('File pattern filter (e.g. "*.gd")'),
  max_results: z.number().optional().default(50).describe('Max results (default: 50)'),
};

export const readInputMapSchema = {};

export const deleteFileSchema = {
  path: z.string().min(1).describe('Path to file to delete (relative to project root)'),
};

export const moveFileSchema = {
  source: z.string().min(1).describe('Source file path (relative to project root)'),
  destination: z.string().min(1).describe('Destination file path (relative to project root)'),
};

export const writeProjectConfigSchema = {
  section: z.string().min(1).describe('Section name to add or modify (e.g. "application", "rendering")'),
  key: z.string().min(1).describe('Config key to set'),
  value: z.string().describe('Config value to set'),
};

export const readExportPresetsSchema = {};

export const generateProjectReportSchema = {};

export const listAutoloadsSchema = {};

export const addAutoloadSchema = {
  name: z.string().min(1).describe('Autoload singleton name'),
  path: z.string().min(1).describe('Script path (e.g. "res://globals.gd")'),
};

export const removeAutoloadSchema = {
  name: z.string().min(1).describe('Name of the autoload to remove'),
};

export const findUnusedAssetsSchema = {};

export const validateProjectSchema = {};

export const listGroupsSchema = {};

export const duplicateSceneSchema = {
  source: z.string().min(1).describe('Source scene path (relative to project root)'),
  destination: z.string().min(1).describe('Destination scene path (relative to project root)'),
};

export const duplicateResourceSchema = {
  source: z.string().min(1).describe('Source .tres path (relative to project root)'),
  destination: z.string().min(1).describe('Destination .tres path (relative to project root)'),
};

// ---- Tool Handlers ----

export function handleListProjectFiles(
  projectRoot: string,
  args: { path?: string; pattern?: string; recursive?: boolean }
): ToolResult {
  try {
    const entries = listFiles(projectRoot, args.path, args.pattern, args.recursive);
    return {
      content: [{ type: 'text', text: JSON.stringify(entries, null, 2) }],
    };
  } catch (err: any) {
        return toolError(ErrorCode.INTERNAL_ERROR, `Error listing files: ${err.message}`);
  }
}

export function handleReadProjectConfig(projectRoot: string): ToolResult {
  try {
    const path = resolveProjectPath(projectRoot, 'project.godot');
    const { content } = readTextFile(path);
    const doc = parseConfig(content);
    return {
      content: [{ type: 'text', text: JSON.stringify(doc, null, 2) }],
    };
  } catch (err: any) {
        return toolError(ErrorCode.INTERNAL_ERROR, `Error reading project config: ${err.message}`);
  }
}

export function handleSearchInProject(
  projectRoot: string,
  args: { query: string; pattern?: string; max_results?: number }
): ToolResult {
  try {
    const results = searchInProject(projectRoot, args.query, args.pattern, args.max_results);
    if (results.length === 0) {
      return {
        content: [{ type: 'text', text: `No matches found for "${args.query}".` }],
      };
    }
    return {
      content: [{ type: 'text', text: JSON.stringify(results, null, 2) }],
    };
  } catch (err: any) {
        return toolError(ErrorCode.INTERNAL_ERROR, `Error searching project: ${err.message}`);
  }
}

export function handleReadInputMap(projectRoot: string): ToolResult {
  try {
    const content = readTextFile(resolveProjectPath(projectRoot, 'project.godot'));
    const doc = parseConfig(content.content);
    const inputMap = doc.sections['input_map'];

    if (!inputMap || Object.keys(inputMap).length === 0) {
      return {
        content: [{ type: 'text', text: 'No input mappings defined (project.godot has no [input_map] section).' }],
      };
    }

    const lines: string[] = [`Input Map (${Object.keys(inputMap).length} actions):`, ''];
    for (const [action, value] of Object.entries(inputMap)) {
      lines.push(`  ${action}:`);

      const eventCount = (value.match(/InputEventKey/g) || []).length +
        (value.match(/InputEventMouseButton/g) || []).length +
        (value.match(/InputEventJoypadButton/g) || []).length +
        (value.match(/InputEventJoypadMotion/g) || []).length;

      if (eventCount > 0) {
        const deadzoneMatch = value.match(/"deadzone":\s*([\d.]+)/);
        const deadzone = deadzoneMatch ? deadzoneMatch[1] : '?';
        lines.push(`    events: ${eventCount}, deadzone: ${deadzone}`);

        const keycodeMatches = value.matchAll(/"keycode":(\d+)/g);
        for (const match of keycodeMatches) {
          const keycode = parseInt(match[1], 10);
          if (keycode > 0) {
            lines.push(`      Key: ${keycodeToName(keycode)} (${keycode})`);
          }
        }

        const btnMatches = value.matchAll(/"button_index":(\d+)/g);
        for (const match of btnMatches) {
          lines.push(`      Mouse Button: ${match[1]}`);
        }
      } else {
        lines.push(`    ${value.substring(0, 100)}...`);
      }
    }

    return {
      content: [{ type: 'text', text: lines.join('\n') }],
    };
  } catch (err: any) {
        return toolError(ErrorCode.INTERNAL_ERROR, `Error reading input map: ${err.message}`);
  }
}

/**
 * Convert Godot keycode number to human-readable key name.
 */
function keycodeToName(keycode: number): string {
  const keyMap: Record<number, string> = {
    32: 'Space', 39: 'Apostrophe', 44: 'Comma', 45: 'Minus', 46: 'Period', 47: 'Slash',
    48: '0', 49: '1', 50: '2', 51: '3', 52: '4', 53: '5', 54: '6', 55: '7', 56: '8', 57: '9',
    59: 'Semicolon', 61: 'Equal',
    65: 'A', 66: 'B', 67: 'C', 68: 'D', 69: 'E', 70: 'F', 71: 'G', 72: 'H',
    73: 'I', 74: 'J', 75: 'K', 76: 'L', 77: 'M', 78: 'N', 79: 'O',
    80: 'P', 81: 'Q', 82: 'R', 83: 'S', 84: 'T', 85: 'U', 86: 'V', 87: 'W', 88: 'X', 89: 'Y', 90: 'Z',
    91: 'BracketLeft', 92: 'Backslash', 93: 'BracketRight', 96: 'Grave',
    256: 'Escape', 257: 'Enter', 258: 'Tab', 259: 'Backspace', 260: 'Insert', 261: 'Delete',
    262: 'Right', 263: 'Left', 264: 'Down', 265: 'Up', 266: 'PageUp', 267: 'PageDown',
    268: 'Home', 269: 'End',
    276: 'CapsLock', 277: 'NumLock', 278: 'ScrollLock',
    279: 'Pause', 280: 'Keypad0', 281: 'Keypad1', 282: 'Keypad2', 283: 'Keypad3',
    284: 'Keypad4', 285: 'Keypad5', 286: 'Keypad6', 287: 'Keypad7', 288: 'Keypad8', 289: 'Keypad9',
    290: 'KeypadAdd', 291: 'KeypadSubtract', 292: 'KeypadMultiply', 293: 'KeypadDivide',
    294: 'KeypadEnter',
    296: 'Shift', 297: 'Control', 298: 'Alt', 299: 'Meta',
    4192: 'F1', 4193: 'F2', 4194: 'F3', 4195: 'F4', 4196: 'F5', 4197: 'F6',
    4198: 'F7', 4199: 'F8', 4200: 'F9', 4201: 'F10', 4202: 'F11', 4203: 'F12',
  };
  return keyMap[keycode] || `Key_${keycode}`;
}

// ---- Input Map Writers ----

export const writeInputActionSchema = {
  action: z.string().min(1).describe('Input action name (e.g. "jump", "move_left")'),
  deadzone: z.number().optional().default(0.5).describe('Deadzone for analog inputs (0-1)'),
};

export const removeInputActionSchema = {
  action: z.string().min(1).describe('Input action name to remove'),
};

export const addInputBindingSchema = {
  action: z.string().min(1).describe('Existing input action name'),
  key: z.string().optional().describe('Keyboard key name (e.g. "Space", "A", "Escape") — uses physical keycode'),
  mouse_button: z.number().optional().describe('Mouse button index (1=left, 2=right, 3=middle)'),
  joypad_button: z.number().optional().describe('Joypad button index'),
  joypad_axis: z.string().optional().describe('Joypad axis (e.g. "left_x", "right_trigger")'),
  device: z.number().optional().default(-1).describe('Device ID (-1 for all)'),
};

export function handleWriteInputAction(
  projectRoot: string,
  args: { action: string; deadzone?: number }
): ToolResult {
  try {
    const projPath = resolveProjectPath(projectRoot, 'project.godot');
    const { content } = readTextFile(projPath);
    const doc = parseConfig(content);

    const inputMap = doc.sections['input_map'] || {};
    if (inputMap[args.action]) {
    return toolError(ErrorCode.ALREADY_EXISTS, `Input action "${args.action}" already exists. Use remove_input_action first or add_input_binding to extend it.`);
    }

    const deadzone = args.deadzone ?? 0.5;
    inputMap[args.action] = `{\n"deadzone": ${deadzone},\n"events": []\n}`;
    doc.sections['input_map'] = inputMap;

    const newContent = serializeConfig(doc);
    writeTextFile(projPath, newContent, true);

    return { content: [{ type: 'text', text: `Input action created: ${args.action} (deadzone: ${deadzone})` }] };
  } catch (err: any) {
    return toolError(ErrorCode.INTERNAL_ERROR, `Error: ${err.message}`);
  }
}

export function handleRemoveInputAction(
  projectRoot: string,
  args: { action: string }
): ToolResult {
  try {
    const projPath = resolveProjectPath(projectRoot, 'project.godot');
    const { content } = readTextFile(projPath);
    const doc = parseConfig(content);

    const inputMap = doc.sections['input_map'] || {};
    if (!inputMap[args.action]) {
    return toolError(ErrorCode.FILE_NOT_FOUND, `Input action "${args.action}" not found.`);
    }

    delete inputMap[args.action];
    if (Object.keys(inputMap).length === 0) {
      delete doc.sections['input_map'];
    }

    const newContent = serializeConfig(doc);
    writeTextFile(projPath, newContent, true);

    return { content: [{ type: 'text', text: `Input action removed: ${args.action}` }] };
  } catch (err: any) {
    return toolError(ErrorCode.INTERNAL_ERROR, `Error: ${err.message}`);
  }
}

export function handleAddInputBinding(
  projectRoot: string,
  args: { action: string; key?: string; mouse_button?: number; joypad_button?: number; joypad_axis?: string; device?: number }
): ToolResult {
  try {
    const projPath = resolveProjectPath(projectRoot, 'project.godot');
    const { content } = readTextFile(projPath);
    const doc = parseConfig(content);

    const inputMap = doc.sections['input_map'] || {};
    if (!inputMap[args.action]) {
      // Auto-create the action if it doesn't exist
      inputMap[args.action] = `{\n"deadzone": 0.5,\n"events": []\n}`;
    }

    let value = inputMap[args.action];
    const deadzoneMatch = value.match(/"deadzone":\s*([\d.]+)/);
    const deadzone = deadzoneMatch ? deadzoneMatch[1] : '0.5';

    const device = args.device ?? -1;

    let eventStr: string;
    if (args.key) {
      const keycode = nameToKeycode(args.key);
      eventStr = `Object(InputEventKey,"resource_local_to_scene":false,"resource_name":"","device":${device},"window_id":0,"alt_pressed":false,"shift_pressed":false,"ctrl_pressed":false,"meta_pressed":false,"pressed":false,"keycode":0,"physical_keycode":${keycode},"key_label":0,"unicode":0,"location":0,"echo":false,"script":null)`;
    } else if (args.mouse_button !== undefined) {
      eventStr = `Object(InputEventMouseButton,"resource_local_to_scene":false,"resource_name":"","device":${device},"window_id":0,"alt_pressed":false,"shift_pressed":false,"ctrl_pressed":false,"meta_pressed":false,"button_mask":0,"position":Vector2(0, 0),"global_position":Vector2(0, 0),"factor":1.0,"button_index":${args.mouse_button},"canceled":false,"pressed":false,"double_click":false,"script":null)`;
    } else if (args.joypad_button !== undefined) {
      eventStr = `Object(InputEventJoypadButton,"resource_local_to_scene":false,"resource_name":"","device":${device},"window_id":0,"alt_pressed":false,"shift_pressed":false,"ctrl_pressed":false,"meta_pressed":false,"button_index":${args.joypad_button},"pressure":1.0,"pressed":false,"script":null)`;
    } else if (args.joypad_axis) {
      const axis = joypadAxisIndex(args.joypad_axis);
      const axisValue = args.joypad_axis.includes('left') || args.joypad_axis.includes('up') ? -1.0 : 1.0;
      eventStr = `Object(InputEventJoypadMotion,"resource_local_to_scene":false,"resource_name":"","device":${device},"window_id":0,"alt_pressed":false,"shift_pressed":false,"ctrl_pressed":false,"meta_pressed":false,"axis":${axis},"axis_value":${axisValue},"script":null)`;
    } else {
    return toolError(ErrorCode.INVALID_ARGUMENT, 'Must specify at least one: key, mouse_button, joypad_button, or joypad_axis');
    }

    // Insert the new event into the events array
    if (value.includes('"events": [')) {
      value = value.replace('"events": [', `"events": [\n${eventStr}`);
    } else if (value.includes('"events":[]')) {
      value = value.replace('"events":[]', `"events": [\n${eventStr}\n]`);
    } else {
      // Events array has content, add before closing bracket
      value = value.replace(/\n\]/, `,\n${eventStr}\n]`);
    }

    inputMap[args.action] = value;
    doc.sections['input_map'] = inputMap;

    const newContent = serializeConfig(doc);
    writeTextFile(projPath, newContent, true);

    const bindingDesc = args.key ? `Key: ${args.key}` :
      args.mouse_button !== undefined ? `Mouse: ${args.mouse_button}` :
      args.joypad_button !== undefined ? `Joypad: ${args.joypad_button}` :
      `Joypad Axis: ${args.joypad_axis}`;

    return { content: [{ type: 'text', text: `Binding added to "${args.action}": ${bindingDesc}` }] };
  } catch (err: any) {
    return toolError(ErrorCode.INTERNAL_ERROR, `Error: ${err.message}`);
  }
}

function nameToKeycode(name: string): number {
  const lower = name.toLowerCase();
  // Direct keycode mapping for Godot physical_keycode
  const singleChars: Record<string, number> = {
    'a': 65, 'b': 66, 'c': 67, 'd': 68, 'e': 69, 'f': 70, 'g': 71, 'h': 72,
    'i': 73, 'j': 74, 'k': 75, 'l': 76, 'm': 77, 'n': 78, 'o': 79,
    'p': 80, 'q': 81, 'r': 82, 's': 83, 't': 84, 'u': 85, 'v': 86, 'w': 87, 'x': 88, 'y': 89, 'z': 90,
    '0': 48, '1': 49, '2': 50, '3': 51, '4': 52, '5': 53, '6': 54, '7': 55, '8': 56, '9': 57,
  };
  const special: Record<string, number> = {
    'space': 32, 'escape': 256, 'esc': 256, 'enter': 257, 'return': 257, 'tab': 258,
    'backspace': 259, 'insert': 260, 'delete': 261, 'del': 261,
    'right': 262, 'left': 263, 'down': 264, 'up': 265,
    'pageup': 266, 'pagedown': 267, 'home': 268, 'end': 269,
    'shift': 296, 'ctrl': 297, 'control': 297, 'alt': 298, 'meta': 299, 'command': 299, 'super': 299,
    'f1': 4192, 'f2': 4193, 'f3': 4194, 'f4': 4195, 'f5': 4196, 'f6': 4197,
    'f7': 4198, 'f8': 4199, 'f9': 4200, 'f10': 4201, 'f11': 4202, 'f12': 4203,
    'comma': 44, 'period': 46, '.': 46, 'slash': 47, '/': 47, 'semicolon': 59, ';': 59,
    'minus': 45, '-': 45, 'equal': 61, '=': 61, 'bracketleft': 91, '[': 91,
    'bracketright': 93, ']': 93, 'backslash': 92, '\\': 92,
    'numlock': 277, 'capslock': 276, 'scrolllock': 278, 'pause': 279,
  };

  if (singleChars[lower]) return singleChars[lower];
  if (special[lower]) return special[lower];

  // Try parsing as a number
  const num = parseInt(name, 10);
  if (!isNaN(num)) return num;

  return 0;
}

function joypadAxisIndex(name: string): number {
  const axes: Record<string, number> = {
    'left_x': 0, 'left_y': 1, 'right_x': 2, 'right_y': 3,
    'left_trigger': 4, 'right_trigger': 5, 'l2': 4, 'r2': 5,
  };
  return axes[name.toLowerCase()] ?? 0;
}

// ---- File CRUD Handlers ----

export function handleDeleteFile(
  projectRoot: string,
  args: { path: string }
): ToolResult {
  try {
    deleteFile(projectRoot, args.path);
    return {
      content: [{ type: 'text', text: `File deleted: ${args.path} (backup saved as ${args.path}.bak)` }],
    };
  } catch (err: any) {
        return toolError(ErrorCode.INTERNAL_ERROR, `Error deleting file: ${err.message}`);
  }
}

export function handleMoveFile(
  projectRoot: string,
  args: { source: string; destination: string }
): ToolResult {
  try {
    moveFile(projectRoot, args.source, args.destination);
    return {
      content: [{ type: 'text', text: `File moved: ${args.source} → ${args.destination}` }],
    };
  } catch (err: any) {
        return toolError(ErrorCode.INTERNAL_ERROR, `Error moving file: ${err.message}`);
  }
}

// ---- Write Project Config ----

export function handleWriteProjectConfig(
  projectRoot: string,
  args: { section: string; key: string; value: string }
): ToolResult {
  try {
    const cfgPath = resolveProjectPath(projectRoot, 'project.godot');
    const { content } = readTextFile(cfgPath);
    const doc = parseConfig(content);

    if (!doc.sections[args.section]) {
      doc.sections[args.section] = {};
    }
    doc.sections[args.section][args.key] = args.value;

    const newContent = serializeConfig(doc);
    writeTextFile(cfgPath, newContent, true);

    return {
      content: [{ type: 'text', text: `Config updated: [${args.section}] ${args.key} = ${args.value}` }],
    };
  } catch (err: any) {
        return toolError(ErrorCode.INTERNAL_ERROR, `Error writing config: ${err.message}`);
  }
}

// ---- Export Presets Reader ----

export function handleReadExportPresets(projectRoot: string): ToolResult {
  try {
    const presetsPath = resolveProjectPath(projectRoot, 'export_presets.cfg');
    let content: string;
    try {
      const file = readTextFile(presetsPath);
      content = file.content;
    } catch {
      return {
        content: [{ type: 'text', text: 'No export_presets.cfg found in this project.' }],
      };
    }
    const lines = content.split('\n');
    const result: string[] = [];
    let currentPreset = '';
    let presetCount = 0;

    for (const line of lines) {
      const trimmed = line.trim();
      if (trimmed.startsWith('[preset.')) {
        const match = trimmed.match(/\[preset\.\d+\]\s*name\s*=\s*"(.+)"/);
        const matchAlt = trimmed.match(/name\s*=\s*"(.+)"/);
        currentPreset = match?.[1] || matchAlt?.[1] || trimmed.slice(1, -1);
        presetCount++;
        result.push(`\nPreset #${presetCount}: ${currentPreset}`);
      } else if (trimmed.startsWith('platform=') || trimmed.startsWith('export_path=')) {
        const [k, v] = trimmed.split('=').map(s => s.trim());
        result.push(`  ${k}: ${v}`);
      }
    }

    if (result.length === 0) {
      return {
        content: [{ type: 'text', text: 'No export presets found.' }],
      };
    }

    return {
      content: [{ type: 'text', text: `Export Presets:\n${result.join('\n')}` }],
    };
  } catch (err: any) {
        return toolError(ErrorCode.INTERNAL_ERROR, `Error reading export presets: ${err.message}`);
  }
}

// ---- Project Report Generator ----

export function handleGenerateProjectReport(projectRoot: string): ToolResult {
  try {
    const { content: cfgContent } = readTextFile(resolveProjectPath(projectRoot, 'project.godot'));
    const cfg = parseConfig(cfgContent);
    const appName = cfg.sections['application']?.['config/name']?.replace(/"/g, '') || 'Unnamed Project';

    const scenes = findFilesByExtension(projectRoot, ['.tscn']);
    const gdScripts = findFilesByExtension(projectRoot, ['.gd']);
    const csScripts = findFilesByExtension(projectRoot, ['.cs']);
    const shaders = findFilesByExtension(projectRoot, ['.gdshader']);
    const tresResources = findFilesByExtension(projectRoot, ['.tres']);
    const resResources = findFilesByExtension(projectRoot, ['.res']);

    const inputCount = Object.keys(cfg.sections['input_map'] || {}).length;
    const autoloadCount = Object.keys(cfg.sections['autoload'] || {}).length;

    const report = [
      `=== Project Report: ${appName} ===`,
      '',
      '📊 Summary',
      `  Scenes:       ${scenes.length}`,
      `  GDScripts:    ${gdScripts.length}`,
      `  C# Scripts:   ${csScripts.length}`,
      `  Shaders:      ${shaders.length}`,
      `  .tres:        ${tresResources.length}`,
      `  .res:         ${resResources.length}`,
      `  Input actions:${inputCount}`,
      `  Autoloads:    ${autoloadCount}`,
      '',
    ];

    if (scenes.length > 0) {
      report.push('🎬 Scenes:');
      scenes.sort().forEach(s => report.push(`  ${s}`));
      report.push('');
    }

    if (shaders.length > 0) {
      report.push('✨ Shaders:');
      shaders.sort().forEach(s => report.push(`  ${s}`));
      report.push('');
    }

    if (gdScripts.length > 0 || csScripts.length > 0) {
      report.push('📝 Scripts:');
      gdScripts.sort().forEach(s => report.push(`  [GDScript] ${s}`));
      csScripts.sort().forEach(s => report.push(`  [C#]      ${s}`));
      report.push('');
    }

    return {
      content: [{ type: 'text', text: report.join('\n') }],
    };
  } catch (err: any) {
        return toolError(ErrorCode.INTERNAL_ERROR, `Error generating report: ${err.message}`);
  }
}

// ---- Autoload Manager ----

export function handleListAutoloads(projectRoot: string): ToolResult {
  try {
    const { content } = readTextFile(resolveProjectPath(projectRoot, 'project.godot'));
    const cfg = parseConfig(content);
    const autoloads = cfg.sections['autoload'] || {};

    if (Object.keys(autoloads).length === 0) {
      return { content: [{ type: 'text', text: 'No autoloads defined.' }] };
    }

    const lines = [`Autoloads (${Object.keys(autoloads).length}):`, ''];
    for (const [name, path] of Object.entries(autoloads)) {
      lines.push(`  ${name}: ${path}`);
    }

    return { content: [{ type: 'text', text: lines.join('\n') }] };
  } catch (err: any) {
        return toolError(ErrorCode.INTERNAL_ERROR, `Error listing autoloads: ${err.message}`);
  }
}

export function handleAddAutoload(
  projectRoot: string,
  args: { name: string; path: string }
): ToolResult {
  try {
    const cfgPath = resolveProjectPath(projectRoot, 'project.godot');
    const { content } = readTextFile(cfgPath);
    const cfg = parseConfig(content);

    if (!cfg.sections['autoload']) {
      cfg.sections['autoload'] = {};
    }
    cfg.sections['autoload'][args.name] = `"*${args.path}"`;

    const newContent = serializeConfig(cfg);
    writeTextFile(cfgPath, newContent, true);

    return {
      content: [{ type: 'text', text: `Autoload added: ${args.name} = "*${args.path}"` }],
    };
  } catch (err: any) {
        return toolError(ErrorCode.INTERNAL_ERROR, `Error adding autoload: ${err.message}`);
  }
}

export function handleRemoveAutoload(
  projectRoot: string,
  args: { name: string }
): ToolResult {
  try {
    const cfgPath = resolveProjectPath(projectRoot, 'project.godot');
    const { content } = readTextFile(cfgPath);
    const cfg = parseConfig(content);

    if (!cfg.sections['autoload'] || !cfg.sections['autoload'][args.name]) {
            return toolError(ErrorCode.FILE_NOT_FOUND, `Autoload '${args.name}' not found.`);
    }

    delete cfg.sections['autoload'][args.name];
    const newContent = serializeConfig(cfg);
    writeTextFile(cfgPath, newContent, true);

    return {
      content: [{ type: 'text', text: `Autoload removed: ${args.name}` }],
    };
  } catch (err: any) {
        return toolError(ErrorCode.INTERNAL_ERROR, `Error removing autoload: ${err.message}`);
  }
}

// ---- Project Validation & Analysis ----

export function handleFindUnusedAssets(projectRoot: string): ToolResult {
  try {
    // Collect all referenced paths
    const referenced = new Set<string>();
    const allScenes = findFilesByExtension(projectRoot, ['.tscn']);
    const allScripts = findFilesByExtension(projectRoot, ['.gd', '.cs']);
    const allTres = findFilesByExtension(projectRoot, ['.tres']);

    // Scan scenes for ext_resource references
    for (const scenePath of allScenes) {
      const absPath = resolveProjectPath(projectRoot, scenePath);
      const { content } = readTextFile(absPath);
      const pathMatches = content.matchAll(/path\s*=\s*"([^"]+)"/g);
      for (const m of pathMatches) {
        const ref = m[1].replace('res://', '');
        referenced.add(ref);
      }
      const instMatches = content.matchAll(/instance\s*=\s*ExtResource\("[^"]+"\)/g);
      for (const m of instMatches) referenced.add(m[0]);
    }

    // Scan scripts for preload/load
    for (const scriptPath of allScripts) {
      const absPath = resolveProjectPath(projectRoot, scriptPath);
      const { content } = readTextFile(absPath);
      const preloads = content.matchAll(/preload\("([^"]+)"\)/g);
      for (const m of preloads) {
        referenced.add(m[1].replace('res://', ''));
      }
    }

    // Scan .tres for references
    for (const tresPath of allTres) {
      const absPath = resolveProjectPath(projectRoot, tresPath);
      const { content } = readTextFile(absPath);
      const pathMatches = content.matchAll(/path\s*=\s*"([^"]+)"/g);
      for (const m of pathMatches) {
        referenced.add(m[1].replace('res://', ''));
      }
    }

    // Find files NOT referenced
    const allFiles = findFilesByExtension(projectRoot, ['.tscn', '.gd', '.cs', '.tres', '.gdshader', '.gdshaderinc'], '', true);
    const unused = allFiles.filter(f => {
      if (f === 'project.godot' || f === 'export_presets.cfg') return false;
      return !referenced.has(f);
    });

    if (unused.length === 0) {
      return { content: [{ type: 'text', text: 'All project files are referenced. No unused assets found.' }] };
    }

    return { content: [{ type: 'text', text: `Unused Assets (${unused.length}):\n\n${unused.sort().join('\n')}` }] };
  } catch (err: any) {
    return toolError(ErrorCode.INTERNAL_ERROR, `Error: ${err.message}`);
  }
}

export function handleValidateProject(projectRoot: string): ToolResult {
  try {
    const issues: string[] = [];
    const allScenes = findFilesByExtension(projectRoot, ['.tscn']);

    for (const scenePath of allScenes) {
      const absPath = resolveProjectPath(projectRoot, scenePath);
      const { content } = readTextFile(absPath);

      // Check ext_resource paths
      const extPaths = content.matchAll(/path\s*=\s*"([^"]+)"/g);
      for (const m of extPaths) {
        const refPath = m[1].startsWith('res://') ? m[1].slice(6) : m[1];
        try {
          resolveProjectPath(projectRoot, refPath);
          try { readTextFile(resolveProjectPath(projectRoot, refPath)); } catch {
            issues.push(`  ${scenePath}: broken ref → "${m[1]}"`);
          }
        } catch { /* path traversal, skip */ }
      }

      // Check for common issues
      if (content.includes('uid=""')) {
        issues.push(`  ${scenePath}: empty UID (may cause problems)`);
      }
    }

    if (issues.length === 0) {
      return { content: [{ type: 'text', text: `Project validation passed. ${allScenes.length} scenes checked, no issues.` }] };
    }
    return { content: [{ type: 'text', text: `Project Issues (${issues.length}):\n\n${issues.join('\n')}` }] };
  } catch (err: any) {
    return toolError(ErrorCode.INTERNAL_ERROR, `Error: ${err.message}`);
  }
}

export function handleListGroups(projectRoot: string): ToolResult {
  try {
    const allScenes = findFilesByExtension(projectRoot, ['.tscn']);
    const allGroups = new Map<string, { scenes: string[]; nodes: string[] }>();

    for (const scenePath of allScenes) {
      const absPath = resolveProjectPath(projectRoot, scenePath);
      const { content } = readTextFile(absPath);
      const doc = parseScene(content);

      function walk(nodes: any[]) {
        for (const node of nodes) {
          if (node.groups) {
            for (const g of node.groups) {
              if (!allGroups.has(g)) allGroups.set(g, { scenes: [], nodes: [] });
              const entry = allGroups.get(g)!;
              if (!entry.scenes.includes(scenePath)) entry.scenes.push(scenePath);
              entry.nodes.push(`${scenePath}/${node.name}`);
            }
          }
          if (node.children) walk(node.children);
        }
      }
      walk(doc.nodes);
    }

    if (allGroups.size === 0) {
      return { content: [{ type: 'text', text: 'No node groups defined in any scene.' }] };
    }

    const lines: string[] = [`Node Groups (${allGroups.size}):`, ''];
    for (const [group, data] of [...allGroups.entries()].sort()) {
      lines.push(`  [${group}] — ${data.scenes.length} scene(s), ${data.nodes.length} node(s)`);
      data.scenes.forEach(s => lines.push(`    ${s}`));
    }

    return { content: [{ type: 'text', text: lines.join('\n') }] };
  } catch (err: any) {
    return toolError(ErrorCode.INTERNAL_ERROR, `Error: ${err.message}`);
  }
}

// ---- Duplicate Tools ----

export function handleDuplicateScene(
  projectRoot: string,
  args: { source: string; destination: string }
): ToolResult {
  try {
    const absSrc = resolveProjectPath(projectRoot, args.source);
    const absDst = resolveProjectPath(projectRoot, args.destination);
    const { content } = readTextFile(absSrc);
    writeTextFile(absDst, content, false);
    return { content: [{ type: 'text', text: `Scene duplicated: ${args.source} → ${args.destination}` }] };
  } catch (err: any) {
    return toolError(ErrorCode.INTERNAL_ERROR, `Error: ${err.message}`);
  }
}

export function handleDuplicateResource(
  projectRoot: string,
  args: { source: string; destination: string }
): ToolResult {
  try {
    const absSrc = resolveProjectPath(projectRoot, args.source);
    const absDst = resolveProjectPath(projectRoot, args.destination);
    const { content } = readTextFile(absSrc);
    writeTextFile(absDst, content, false);
    return { content: [{ type: 'text', text: `Resource duplicated: ${args.source} → ${args.destination}` }] };
  } catch (err: any) {
    return toolError(ErrorCode.INTERNAL_ERROR, `Error: ${err.message}`);
  }
}

// ---- Directory Operations ----

export const createDirectorySchema = {
  path: z.string().min(1).describe('Directory path to create (relative to project root)'),
};

export function handleCreateDirectory(
  projectRoot: string,
  args: { path: string }
): ToolResult {
  try {
    const absPath = resolveProjectPath(projectRoot, args.path);
    if (fs.existsSync(absPath)) {
      return { content: [{ type: 'text', text: `Directory already exists: ${args.path}` }] };
    }
    fs.mkdirSync(absPath, { recursive: true });
    return { content: [{ type: 'text', text: `Directory created: ${args.path}` }] };
  } catch (err: any) {
    return toolError(ErrorCode.INTERNAL_ERROR, `Error: ${err.message}`);
  }
}

// ============================================================
// Export Presets Writer (export_presets.cfg)
// ============================================================
//
// Format reference — EditorExport::_save() / EditorExport::load_config()
// in godot/editor/export/editor_export.cpp:
//   * One `[preset.N]` section per preset, plus a matching
//     `[preset.N.options]` section holding platform-specific options.
//   * A `[runnable_presets]` section maps platform name -> preset name.
//   * `load_config()` scans preset.0, preset.1, ... and STOPS at the first
//     missing index, so removing a preset MUST renumber the remaining ones or
//     they silently disappear from the editor.
//   * `export_filter` is read without a fallback, so it must always be written.
//   * `platform` must match EditorExportPlatform::get_name() exactly; presets
//     with an unknown platform are skipped without any error message.

/**
 * Platform names accepted by Godot, taken from EditorExportPlatform::get_name()
 * (platform/<name>/export/export.cpp). The extension is only used to build a
 * sensible default export_path.
 */
const EXPORT_PLATFORMS: Record<string, string> = {
  'Windows Desktop': '.exe',
  'Linux': '.x86_64',
  'macOS': '.zip',
  'Android': '.apk',
  'iOS': '.ipa',
  'Web': '.html',
};

/** A single parsed preset: its `[preset.N]` body and `[preset.N.options]` body. */
interface ExportPresetBlock {
  main: Record<string, string>;
  options: Record<string, string>;
}

interface ExportPresetsFile {
  presets: ExportPresetBlock[];
  /** `[runnable_presets]`: platform name -> preset name. */
  runnable: Record<string, string>;
}

/** Parse export_presets.cfg into presets + the runnable mapping. */
function parseExportPresets(content: string): ExportPresetsFile {
  const presets: ExportPresetBlock[] = [];
  const runnable: Record<string, string> = {};
  // Which record the `key=value` lines currently being read belong to.
  let target: Record<string, string> | null = null;

  for (const raw of content.split('\n')) {
    const line = raw.trim();
    if (line.length === 0 || line.startsWith(';')) continue;

    if (line.startsWith('[') && line.endsWith(']')) {
      const section = line.slice(1, -1).trim();
      if (section === 'runnable_presets') {
        target = runnable;
        continue;
      }
      const m = section.match(/^preset\.(\d+)(\.options)?$/);
      if (!m) {
        target = null; // Unknown section: skip its body rather than guess.
        continue;
      }
      const idx = Number(m[1]);
      // Sections may be sparse or out of order; grow so index N is addressable.
      while (presets.length <= idx) presets.push({ main: {}, options: {} });
      target = m[2] ? presets[idx].options : presets[idx].main;
      continue;
    }

    if (target === null) continue;
    const eq = line.indexOf('=');
    if (eq <= 0) continue;
    target[line.slice(0, eq).trim()] = line.slice(eq + 1).trim();
  }

  return { presets, runnable };
}

/**
 * Serialize back to Godot's native ConfigFile layout: `key=value` with no
 * spaces and a blank line after each section header, so that re-saving from
 * the editor produces no spurious diff.
 */
function serializeExportPresets(file: ExportPresetsFile): string {
  const out: string[] = [];
  // Quote a key when it contains characters Godot's ConfigFile would otherwise
  // mangle. Godot quotes any key with a space (e.g. `"Windows Desktop"` from the
  // runnable_presets section); an unquoted `Windows Desktop` is read back as
  // `WindowsDesktop`, which silently breaks the runnable-preset lookup.
  const quoteKey = (k: string): string =>
    /^[A-Za-z0-9_./-]+$/.test(k) ? k : `"${k.replace(/"/g, '\\"')}"`;
  const emit = (section: string, entries: Record<string, string>) => {
    out.push(`[${section}]`, '');
    for (const [k, v] of Object.entries(entries)) out.push(`${quoteKey(k)}=${v}`);
    out.push('');
  };

  if (Object.keys(file.runnable).length > 0) emit('runnable_presets', file.runnable);
  file.presets.forEach((preset, i) => {
    emit(`preset.${i}`, preset.main);
    emit(`preset.${i}.options`, preset.options);
  });
  return out.join('\n');
}

/** Quote a plain string as a .cfg value. */
function cfgString(value: string): string {
  return JSON.stringify(value);
}

/**
 * Convert a user-supplied value into .cfg syntax. Booleans and numbers are
 * written bare; anything that already looks like a Godot literal (quoted
 * string, `PackedStringArray(...)`, …) is passed through untouched so callers
 * can set exotic option values verbatim.
 */
function cfgValue(value: string): string {
  const t = value.trim();
  if (t === 'true' || t === 'false') return t;
  if (/^-?\d+(\.\d+)?$/.test(t)) return t;
  if (t.startsWith('"') && t.endsWith('"') && t.length >= 2) return t;
  if (/^[A-Za-z_][A-Za-z0-9_]*\(.*\)$/s.test(t)) return t;
  return cfgString(value);
}

/** Strip surrounding quotes from a stored .cfg value. */
function cfgUnquote(value: string): string {
  const t = (value ?? '').trim();
  return t.startsWith('"') && t.endsWith('"') && t.length >= 2 ? t.slice(1, -1) : t;
}

/** Resolve a preset reference that is either a zero-based index or a name. */
function findPresetIndex(file: ExportPresetsFile, ref: string): number {
  const t = ref.trim();
  if (/^\d+$/.test(t)) {
    const i = Number(t);
    return i >= 0 && i < file.presets.length ? i : -1;
  }
  return file.presets.findIndex(p => cfgUnquote(p.main['name'] ?? '') === t);
}

/** Read export_presets.cfg, treating an absent file as an empty preset list. */
function loadExportPresets(projectRoot: string): { path: string; file: ExportPresetsFile } {
  const presetsPath = resolveProjectPath(projectRoot, 'export_presets.cfg');
  try {
    return { path: presetsPath, file: parseExportPresets(readTextFile(presetsPath).content) };
  } catch {
    // Never exported yet — that is a normal state, not an error.
    return { path: presetsPath, file: { presets: [], runnable: {} } };
  }
}

/**
 * Rebuild `[runnable_presets]` so it only references presets that still exist.
 * Godot matches by preset NAME per platform, so a stale entry would silently
 * mark the wrong preset runnable after a rename or removal.
 */
function pruneRunnable(file: ExportPresetsFile): void {
  for (const [platform, presetName] of Object.entries(file.runnable)) {
    const stillThere = file.presets.some(
      p => cfgUnquote(p.main['platform'] ?? '') === platform &&
           cfgUnquote(p.main['name'] ?? '') === cfgUnquote(presetName)
    );
    if (!stillThere) delete file.runnable[platform];
  }
}

export const createExportPresetSchema = {
  name: z.string().describe('Preset name, e.g. "Windows Release"'),
  platform: z.enum(['Windows Desktop', 'Linux', 'macOS', 'Android', 'iOS', 'Web'])
    .describe('Godot export platform name (must match the engine exactly)'),
  export_path: z.string().optional().describe('Output path, e.g. "build/game.exe". Defaults to build/<name><platform extension>.'),
  runnable: z.boolean().optional().default(true).describe('Mark this preset as the runnable one for its platform'),
  export_filter: z.enum(['all_resources', 'scenes', 'resources', 'exclude', 'customized']).optional().default('all_resources')
    .describe('Which resources to include'),
  include_filter: z.string().optional().default('').describe('Comma-separated include globs, e.g. "*.json,*.txt"'),
  exclude_filter: z.string().optional().default('').describe('Comma-separated exclude globs'),
  custom_features: z.string().optional().default('').describe('Comma-separated custom feature tags'),
  dedicated_server: z.boolean().optional().default(false).describe('Export as a dedicated server build'),
  options: z.record(z.string()).optional()
    .describe('Extra [preset.N.options] keys, e.g. {"binary_format/embed_pck":"true"}'),
};

export const updateExportPresetSchema = {
  preset: z.string().describe('Preset name or zero-based index'),
  export_path: z.string().optional().describe('New output path'),
  runnable: z.boolean().optional().describe('Mark/unmark as the runnable preset for its platform'),
  export_filter: z.enum(['all_resources', 'scenes', 'resources', 'exclude', 'customized']).optional(),
  include_filter: z.string().optional(),
  exclude_filter: z.string().optional(),
  custom_features: z.string().optional(),
  dedicated_server: z.boolean().optional(),
  fields: z.record(z.string()).optional().describe('Raw [preset.N] keys to set, e.g. {"seed":"12345"}'),
  options: z.record(z.string()).optional().describe('Raw [preset.N.options] keys to set, e.g. {"texture_format/s3tc_bptc":"true"}'),
};

export const removeExportPresetSchema = {
  preset: z.string().describe('Preset name or zero-based index'),
};

/** Create a new export preset, appending it as the next `[preset.N]`. */
export function handleCreateExportPreset(
  projectRoot: string,
  args: {
    name: string; platform: string; export_path?: string; runnable?: boolean;
    export_filter?: string; include_filter?: string; exclude_filter?: string;
    custom_features?: string; dedicated_server?: boolean; options?: Record<string, string>;
  }
): ToolResult {
  try {
    const ext = EXPORT_PLATFORMS[args.platform];
    if (ext === undefined) {
      return toolError(
        ErrorCode.INVALID_ARGUMENT,
        `Unknown platform "${args.platform}". Valid platforms: ${Object.keys(EXPORT_PLATFORMS).join(', ')}.`
      );
    }

    const { path: presetsPath, file } = loadExportPresets(projectRoot);

    if (findPresetIndex(file, args.name) !== -1) {
      return toolError(
        ErrorCode.ALREADY_EXISTS,
        `A preset named "${args.name}" already exists. Use update_export_preset to modify it.`
      );
    }

    // Default to build/<sanitized name><ext> so the preset is immediately usable.
    const exportPath = args.export_path ?? `build/${args.name.replace(/[^\w.-]+/g, '_')}${ext}`;

    const main: Record<string, string> = {
      name: cfgString(args.name),
      platform: cfgString(args.platform),
      // Legacy flag; load_config() still honours it (see the DISABLE_DEPRECATED
      // branch) and it keeps the file readable by Godot 4.0-4.2.
      runnable: args.runnable === false ? 'false' : 'true',
      dedicated_server: args.dedicated_server ? 'true' : 'false',
      custom_features: cfgString(args.custom_features ?? ''),
      export_filter: cfgString(args.export_filter ?? 'all_resources'),
      include_filter: cfgString(args.include_filter ?? ''),
      exclude_filter: cfgString(args.exclude_filter ?? ''),
      export_path: cfgString(exportPath),
      patches: 'PackedStringArray()',
      encryption_include_filters: '""',
      encryption_exclude_filters: '""',
      seed: '0',
      encrypt_pck: 'false',
      encrypt_directory: 'false',
      script_export_mode: '2',
    };

    // Only seed the two universal option keys; Godot fills in every other
    // platform default the first time the preset is opened.
    const options: Record<string, string> = {
      'custom_template/debug': '""',
      'custom_template/release': '""',
    };
    for (const [k, v] of Object.entries(args.options ?? {})) options[k] = cfgValue(v);

    file.presets.push({ main, options });
    if (args.runnable !== false) file.runnable[args.platform] = cfgString(args.name);

    writeTextFile(presetsPath, serializeExportPresets(file), true);

    const index = file.presets.length - 1;
    return {
      content: [{
        type: 'text',
        text: `Created export preset #${index} "${args.name}"\n` +
          `  platform: ${args.platform}\n` +
          `  export_path: ${exportPath}\n` +
          `  export_filter: ${args.export_filter ?? 'all_resources'}\n` +
          `  runnable: ${args.runnable !== false}\n` +
          `  options: ${Object.keys(options).length} key(s)\n` +
          `Written to export_presets.cfg (${file.presets.length} preset(s) total).`,
      }],
    };
  } catch (err: any) {
    return toolError(ErrorCode.INTERNAL_ERROR, `Error creating export preset: ${err.message}`);
  }
}

/** Update fields and/or options of an existing export preset. */
export function handleUpdateExportPreset(
  projectRoot: string,
  args: {
    preset: string; export_path?: string; runnable?: boolean; export_filter?: string;
    include_filter?: string; exclude_filter?: string; custom_features?: string;
    dedicated_server?: boolean; fields?: Record<string, string>; options?: Record<string, string>;
  }
): ToolResult {
  try {
    const { path: presetsPath, file } = loadExportPresets(projectRoot);
    if (file.presets.length === 0) {
      return toolError(ErrorCode.NOT_FOUND, 'No export_presets.cfg found. Use create_export_preset first.');
    }

    const idx = findPresetIndex(file, args.preset);
    if (idx === -1) {
      const known = file.presets.map((p, i) => `${i}:${cfgUnquote(p.main['name'] ?? '')}`).join(', ');
      return toolError(ErrorCode.NOT_FOUND, `Export preset "${args.preset}" not found. Available: ${known}.`);
    }

    const preset = file.presets[idx];
    const changed: string[] = [];

    // Typed convenience fields.
    const simple: Array<[string, string | undefined]> = [
      ['export_path', args.export_path],
      ['export_filter', args.export_filter],
      ['include_filter', args.include_filter],
      ['exclude_filter', args.exclude_filter],
      ['custom_features', args.custom_features],
    ];
    for (const [key, value] of simple) {
      if (value !== undefined) {
        preset.main[key] = cfgString(value);
        changed.push(`${key}=${value}`);
      }
    }
    if (args.dedicated_server !== undefined) {
      preset.main['dedicated_server'] = args.dedicated_server ? 'true' : 'false';
      changed.push(`dedicated_server=${args.dedicated_server}`);
    }

    if (args.runnable !== undefined) {
      preset.main['runnable'] = args.runnable ? 'true' : 'false';
      const platform = cfgUnquote(preset.main['platform'] ?? '');
      // Godot allows only one runnable preset per platform, so setting this
      // one implicitly clears whichever preset held the slot before.
      if (args.runnable) file.runnable[platform] = preset.main['name'] ?? '""';
      else if (file.runnable[platform] === preset.main['name']) delete file.runnable[platform];
      changed.push(`runnable=${args.runnable}`);
    }

    // Raw escape hatches for keys this schema does not model explicitly.
    for (const [k, v] of Object.entries(args.fields ?? {})) {
      preset.main[k] = cfgValue(v);
      changed.push(`${k}=${v}`);
    }
    for (const [k, v] of Object.entries(args.options ?? {})) {
      preset.options[k] = cfgValue(v);
      changed.push(`options.${k}=${v}`);
    }

    if (changed.length === 0) {
      return toolError(ErrorCode.INVALID_ARGUMENT, 'No changes requested. Pass at least one field or option to update.');
    }

    pruneRunnable(file);
    writeTextFile(presetsPath, serializeExportPresets(file), true);

    return {
      content: [{
        type: 'text',
        text: `Updated export preset #${idx} "${cfgUnquote(preset.main['name'] ?? '')}"\n` +
          changed.map(c => `  ${c}`).join('\n'),
      }],
    };
  } catch (err: any) {
    return toolError(ErrorCode.INTERNAL_ERROR, `Error updating export preset: ${err.message}`);
  }
}

/** Remove an export preset and renumber the remaining ones. */
export function handleRemoveExportPreset(
  projectRoot: string,
  args: { preset: string }
): ToolResult {
  try {
    const { path: presetsPath, file } = loadExportPresets(projectRoot);
    if (file.presets.length === 0) {
      return toolError(ErrorCode.NOT_FOUND, 'No export_presets.cfg found.');
    }

    const idx = findPresetIndex(file, args.preset);
    if (idx === -1) {
      const known = file.presets.map((p, i) => `${i}:${cfgUnquote(p.main['name'] ?? '')}`).join(', ');
      return toolError(ErrorCode.NOT_FOUND, `Export preset "${args.preset}" not found. Available: ${known}.`);
    }

    const removed = cfgUnquote(file.presets[idx].main['name'] ?? '');
    // Splicing renumbers on serialize, which is required: load_config() stops
    // at the first missing preset.N index.
    file.presets.splice(idx, 1);
    pruneRunnable(file);

    writeTextFile(presetsPath, serializeExportPresets(file), true);

    return {
      content: [{
        type: 'text',
        text: `Removed export preset #${idx} "${removed}". ` +
          `${file.presets.length} preset(s) remain (renumbered 0..${Math.max(0, file.presets.length - 1)}).`,
      }],
    };
  } catch (err: any) {
    return toolError(ErrorCode.INTERNAL_ERROR, `Error removing export preset: ${err.message}`);
  }
}
