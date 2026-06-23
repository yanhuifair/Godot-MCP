// ============================================================
// Godot MCP Server - Audio Tools
// ============================================================
//
// AudioBusLayout is stored as a .tres file.
// Audio .import files control import settings for audio assets.

import { z } from 'zod';
import { ToolResult } from '../utils/types.js';
import fs from 'node:fs';
import { readTextFile, resolveProjectPath, findFilesByExtension, writeTextFile } from '../utils/file_utils.js';
import { parseResource } from '../parsers/resource_parser.js';

// ---- Tool Schemas ----

export const readAudioBusLayoutSchema = {
  path: z.string().optional().default('default_bus_layout.tres').describe('Path to AudioBusLayout .tres file (default: default_bus_layout.tres)'),
};

export const listAudioFilesSchema = {
  path: z.string().optional().default('').describe('Subdirectory to search'),
};

export const createAudioBusLayoutSchema = {
  path: z.string().optional().default('default_bus_layout.tres').describe('Output path for AudioBusLayout .tres'),
  master_volume: z.number().optional().default(1.0).describe('Master bus volume (0-1)'),
};

// ---- Tool Handlers ----

export function handleReadAudioBusLayout(
  projectRoot: string,
  args: { path?: string }
): ToolResult {
  try {
    const layoutPath = args.path || 'default_bus_layout.tres';
    const absPath = resolveProjectPath(projectRoot, layoutPath);

    if (!fs.existsSync(absPath)) {
      return {
        content: [{ type: 'text', text: `AudioBusLayout file not found: ${layoutPath}. Create one in the Godot editor (Audio tab → Add Bus) or use create_audio_bus_layout.` }],
      };
    }

    const { content } = readTextFile(absPath);
    const doc = parseResource(content);

    const lines: string[] = [];
    lines.push(`AudioBusLayout`);
    lines.push(`File: ${layoutPath}`);
    lines.push('');

    // Parse bus structure from sub-resources
    if (doc.subResources.length > 0) {
      lines.push(`Buses (${doc.subResources.length}):`);
      for (const sub of doc.subResources) {
        lines.push(`\n  ${sub.id} (${sub.type}):`);
        for (const [key, val] of Object.entries(sub.properties)) {
          const label = busPropLabel(key);
          lines.push(`    ${key} = ${val}${label ? `  # ${label}` : ''}`);
        }
      }
    } else {
      // Try parsing from the raw content for bus definitions
      lines.push('Bus Properties:');
      for (const [key, val] of Object.entries(doc.resource)) {
        const label = busPropLabel(key);
        lines.push(`  ${key} = ${val}${label ? `  # ${label}` : ''}`);
      }
    }

    return { content: [{ type: 'text', text: lines.join('\n') }] };
  } catch (err: any) {
    return { content: [{ type: 'text', text: `Error: ${err.message}` }], isError: true };
  }
}

export function handleListAudioFiles(
  projectRoot: string,
  args: { path?: string }
): ToolResult {
  try {
    const audioExts = ['.wav', '.ogg', '.mp3', '.m4a', '.flac', '.opus'];
    const allFiles = findFilesByExtension(projectRoot, audioExts, args.path || '');

    if (allFiles.length === 0) {
      return { content: [{ type: 'text', text: 'No audio files found.' }] };
    }

    // Group by extension
    const byExt: Record<string, string[]> = {};
    for (const f of allFiles) {
      const ext = f.split('.').pop()?.toLowerCase() || 'unknown';
      if (f.endsWith('.import')) continue; // skip .import files
      (byExt[ext] ||= []).push(f);
    }

    const lines: string[] = [];
    let total = 0;
    for (const [ext, files] of Object.entries(byExt).sort()) {
      lines.push(`\n${ext.toUpperCase()} (${files.length}):`);
      files.sort().forEach(f => {
        // Check if imported
        const hasImport = fs.existsSync(resolveProjectPath(projectRoot, f + '.import'));
        const marker = hasImport ? '' : ' [not imported]';
        lines.push(`  ${f}${marker}`);
        total++;
      });
    }

    const prefix = `Audio Files: ${total} file(s) across ${Object.keys(byExt).length} format(s)`;
    return { content: [{ type: 'text', text: prefix + lines.join('\n') }] };
  } catch (err: any) {
    return { content: [{ type: 'text', text: `Error: ${err.message}` }], isError: true };
  }
}

export function handleCreateAudioBusLayout(
  projectRoot: string,
  args: { path?: string; master_volume?: number }
): ToolResult {
  try {
    const layoutPath = args.path || 'default_bus_layout.tres';

    const template = `[gd_resource type="AudioBusLayout" format=3 uid=""]

[resource]
bus/0/name = "Master"
bus/0/solo = false
bus/0/mute = false
bus/0/bypass_fx = false
bus/0/volume_db = ${linearToDb(args.master_volume ?? 1.0)}
bus/0/send = "Master"
`;

    const absPath = resolveProjectPath(projectRoot, layoutPath);
    writeTextFile(absPath, template, false);

    return {
      content: [{ type: 'text', text: `AudioBusLayout created: ${layoutPath} (${Object.keys(template.split('\n').filter(l => l.includes('='))).length} bus properties)` }],
    };
  } catch (err: any) {
    return { content: [{ type: 'text', text: `Error: ${err.message}` }], isError: true };
  }
}

// ---- Bus Editor Tools ----

export const addAudioBusSchema = {
  layout_path: z.string().optional().default('default_bus_layout.tres').describe('Path to AudioBusLayout .tres'),
  bus_name: z.string().min(1).describe('New bus name'),
  send_to: z.string().optional().default('Master').describe('Send target bus'),
  volume_db: z.number().optional().default(0.0).describe('Volume in dB'),
};

export const removeAudioBusSchema = {
  layout_path: z.string().optional().default('default_bus_layout.tres'),
  bus_index: z.number().describe('Bus index to remove (0=Master cannot be removed)'),
};

export const addBusEffectSchema = {
  layout_path: z.string().optional().default('default_bus_layout.tres'),
  bus_index: z.number().describe('Bus index'),
  effect_type: z.enum(['Reverb', 'Delay', 'Distortion', 'Chorus', 'EQ', 'Compressor', 'Limiter', 'Panner', 'PitchShift', 'Phaser', 'LowPassFilter', 'HighPassFilter', 'BandPassFilter', 'BandLimitFilter', 'Amplify']).describe('Effect type'),
  effect_params: z.record(z.string()).optional().describe('Effect parameters'),
};

export const setBusVolumeSchema = {
  layout_path: z.string().optional().default('default_bus_layout.tres'),
  bus_index: z.number().describe('Bus index'),
  volume_db: z.number().describe('Volume in dB (e.g. -6.0, 0.0, 3.0)'),
};

export function handleAddAudioBus(
  projectRoot: string,
  args: { layout_path?: string; bus_name: string; send_to?: string; volume_db?: number }
): ToolResult {
  try {
    const layoutPath = args.layout_path || 'default_bus_layout.tres';
    const absPath = resolveProjectPath(projectRoot, layoutPath);

    if (!fs.existsSync(absPath)) {
      return { content: [{ type: 'text', text: `AudioBusLayout not found: ${layoutPath}. Use create_audio_bus_layout first.` }], isError: true };
    }

    const { content } = readTextFile(absPath);
    const doc = parseResource(content);

    // Find next bus index
    const busIndices = new Set<number>();
    for (const key of Object.keys(doc.resource)) {
      const m = key.match(/^bus\/(\d+)\//);
      if (m) busIndices.add(parseInt(m[1], 10));
    }
    const nextIdx = busIndices.size > 0 ? Math.max(...busIndices) + 1 : 1;

    const sendTo = args.send_to || 'Master';
    const volDb = args.volume_db ?? 0.0;

    doc.resource[`bus/${nextIdx}/name`] = `"${args.bus_name}"`;
    doc.resource[`bus/${nextIdx}/solo`] = 'false';
    doc.resource[`bus/${nextIdx}/mute`] = 'false';
    doc.resource[`bus/${nextIdx}/bypass_fx`] = 'false';
    doc.resource[`bus/${nextIdx}/volume_db`] = String(volDb);
    doc.resource[`bus/${nextIdx}/send`] = `"${sendTo}"`;

    // Rebuild .tres
    let newContent = `[gd_resource type="${doc.header.type}" format=${doc.header.format}`;
    if (doc.header.uid) newContent += ` uid="${doc.header.uid}"`;
    newContent += ']\n\n[resource]\n';
    const sortedKeys = Object.keys(doc.resource).sort();
    for (const key of sortedKeys) {
      newContent += `${key} = ${doc.resource[key]}\n`;
    }

    writeTextFile(absPath, newContent, true);

    return { content: [{ type: 'text', text: `Bus "${args.bus_name}" added at index ${nextIdx} (send → ${sendTo})` }] };
  } catch (err: any) {
    return { content: [{ type: 'text', text: `Error: ${err.message}` }], isError: true };
  }
}

export function handleRemoveAudioBus(
  projectRoot: string,
  args: { layout_path?: string; bus_index: number }
): ToolResult {
  try {
    if (args.bus_index === 0) {
      return { content: [{ type: 'text', text: 'Cannot remove Master bus (index 0).' }], isError: true };
    }

    const layoutPath = args.layout_path || 'default_bus_layout.tres';
    const absPath = resolveProjectPath(projectRoot, layoutPath);
    const { content } = readTextFile(absPath);
    const doc = parseResource(content);

    // Remove all properties for this bus
    const prefix = `bus/${args.bus_index}/`;
    const keysToRemove = Object.keys(doc.resource).filter(k => k.startsWith(prefix));
    for (const key of keysToRemove) {
      delete doc.resource[key];
    }

    // Rebuild
    let newContent = `[gd_resource type="${doc.header.type}" format=${doc.header.format}`;
    if (doc.header.uid) newContent += ` uid="${doc.header.uid}"`;
    newContent += ']\n\n[resource]\n';
    const sortedKeys = Object.keys(doc.resource).sort();
    for (const key of sortedKeys) {
      newContent += `${key} = ${doc.resource[key]}\n`;
    }

    writeTextFile(absPath, newContent, true);

    return { content: [{ type: 'text', text: `Bus index ${args.bus_index} removed (${keysToRemove.length} properties)` }] };
  } catch (err: any) {
    return { content: [{ type: 'text', text: `Error: ${err.message}` }], isError: true };
  }
}

export function handleAddBusEffect(
  projectRoot: string,
  args: { layout_path?: string; bus_index: number; effect_type: string; effect_params?: Record<string, string> }
): ToolResult {
  try {
    const layoutPath = args.layout_path || 'default_bus_layout.tres';
    const absPath = resolveProjectPath(projectRoot, layoutPath);
    const { content } = readTextFile(absPath);
    const doc = parseResource(content);

    // Find next effect index for this bus
    const prefix = `bus/${args.bus_index}/effect/`;
    const effectIndices = new Set<number>();
    for (const key of Object.keys(doc.resource)) {
      const m = key.match(new RegExp(`^bus/${args.bus_index}/effect/(\\d+)/`));
      if (m) effectIndices.add(parseInt(m[1], 10));
    }
    const nextIdx = effectIndices.size > 0 ? Math.max(...effectIndices) + 1 : 0;

    doc.resource[`${prefix}${nextIdx}/effect`] = `SubResource("AudioEffect${args.effect_type}_${nextIdx}")`;

    if (args.effect_params) {
      for (const [k, v] of Object.entries(args.effect_params)) {
        doc.resource[`${prefix}${nextIdx}/${k}`] = v;
      }
    }

    // Rebuild
    let newContent = `[gd_resource type="${doc.header.type}" format=${doc.header.format}`;
    if (doc.header.uid) newContent += ` uid="${doc.header.uid}"`;
    newContent += ']\n\n[resource]\n';
    const sortedKeys = Object.keys(doc.resource).sort();
    for (const key of sortedKeys) {
      newContent += `${key} = ${doc.resource[key]}\n`;
    }

    writeTextFile(absPath, newContent, true);

    return { content: [{ type: 'text', text: `Effect "${args.effect_type}" added to bus ${args.bus_index} (effect index: ${nextIdx})` }] };
  } catch (err: any) {
    return { content: [{ type: 'text', text: `Error: ${err.message}` }], isError: true };
  }
}

export function handleSetBusVolume(
  projectRoot: string,
  args: { layout_path?: string; bus_index: number; volume_db: number }
): ToolResult {
  try {
    const layoutPath = args.layout_path || 'default_bus_layout.tres';
    const absPath = resolveProjectPath(projectRoot, layoutPath);
    const { content } = readTextFile(absPath);
    const doc = parseResource(content);

    const key = `bus/${args.bus_index}/volume_db`;
    doc.resource[key] = String(args.volume_db);

    // Rebuild
    let newContent = `[gd_resource type="${doc.header.type}" format=${doc.header.format}`;
    if (doc.header.uid) newContent += ` uid="${doc.header.uid}"`;
    newContent += ']\n\n[resource]\n';
    const sortedKeys = Object.keys(doc.resource).sort();
    for (const key of sortedKeys) {
      newContent += `${key} = ${doc.resource[key]}\n`;
    }

    writeTextFile(absPath, newContent, true);

    return { content: [{ type: 'text', text: `Bus ${args.bus_index} volume set to ${args.volume_db} dB` }] };
  } catch (err: any) {
    return { content: [{ type: 'text', text: `Error: ${err.message}` }], isError: true };
  }
}

// ---- Helpers ----

function busPropLabel(key: string): string {
  const labels: Record<string, string> = {
    'bus/0/name': 'Bus name',
    'bus/0/solo': 'Solo mode',
    'bus/0/mute': 'Muted',
    'bus/0/bypass_fx': 'Bypass effects',
    'bus/0/volume_db': 'Volume (dB)',
    'bus/0/send': 'Send target',
    'bus/0/effect/0/effect': 'Effect type',
  };
  return labels[key] || '';
}

function linearToDb(linear: number): string {
  if (linear <= 0) return '-80.0';
  const db = 20 * Math.log10(linear);
  return db.toFixed(1);
}
