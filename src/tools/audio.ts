// Copyright (c) 2026 FairYan
// SPDX-License-Identifier: AGPL-3.0-or-later
// ============================================================
// Godot MCP Server - Audio Tools
// ============================================================
//
// AudioBusLayout is stored as a .tres file.
// Audio .import files control import settings for audio assets.

import { z } from 'zod';
import { toolError, ErrorCode } from '../utils/errors.js';
import { ToolResult, ExtResource, SubResource } from '../utils/types.js';
import fs from 'node:fs';
import { readTextFile, resolveProjectPath, findFilesByExtension, writeTextFile } from '../utils/file_utils.js';
import { parseResource, serializeResource } from '../parsers/resource_parser.js';

// ============================================================
// AudioBusLayout helpers
// ============================================================
//
// Godot rebuilds the bus list from the `bus/<index>/...` keys and sizes it from
// the HIGHEST index it sees. A gap (e.g. removing bus 2 out of 0..4) therefore
// materialises a ghost bus with default settings instead of shrinking the list,
// so indices must always stay contiguous.
//
// A plain `Object.keys().sort()` is also wrong: it is lexicographic, so bus/10
// lands between bus/1 and bus/2 and the file becomes unreadable.

const BUS_PROP_ORDER = ['name', 'solo', 'mute', 'bypass_fx', 'volume_db', 'send'];

function busKeyRank(key: string): [number, number, number, string] {
  const m = key.match(/^bus\/(\d+)\/(.*)$/);
  if (!m) return [Number.MAX_SAFE_INTEGER, 0, 0, key];
  const idx = parseInt(m[1], 10);
  const rest = m[2];
  const known = BUS_PROP_ORDER.indexOf(rest);
  // Named properties first (in Godot's own order), then effect/* entries.
  // Effect indices must sort numerically too, or effect/10 lands before effect/2.
  const fx = rest.match(/^effect\/(\d+)\//);
  return [idx, known >= 0 ? known : BUS_PROP_ORDER.length, fx ? parseInt(fx[1], 10) : -1, rest];
}

/** Sort resource keys the way Godot writes them: numerically by bus, then by property. */
function sortBusKeys(keys: string[]): string[] {
  return [...keys].sort((a, b) => {
    const [ai, ap, af, an] = busKeyRank(a);
    const [bi, bp, bf, bn] = busKeyRank(b);
    if (ai !== bi) return ai - bi;
    if (ap !== bp) return ap - bp;
    if (af !== bf) return af - bf;
    return an.localeCompare(bn);
  });
}

interface BusLayoutDoc {
  header: { type: string; format: number; uid?: string };
  extResources?: ExtResource[];
  subResources?: SubResource[];
  resource: Record<string, string>;
}

/**
 * Serialize a parsed AudioBusLayout back to .tres text.
 *
 * Effects live in `[sub_resource]` blocks that `bus/<i>/effect/<n>/effect`
 * points at. Dropping them turns every reference into a dangling
 * `SubResource("...")` and Godot refuses to parse the file, so the blocks are
 * re-emitted verbatim ahead of `[resource]` (the order the engine requires).
 */
function rebuildBusLayout(doc: BusLayoutDoc): string {
  return serializeResource(
    {
      header: doc.header,
      extResources: doc.extResources || [],
      subResources: doc.subResources || [],
      resource: doc.resource,
    },
    sortBusKeys,
  );
}

/** All bus indices present in the layout, ascending. */
function busIndicesOf(resource: Record<string, string>): number[] {
  const seen = new Set<number>();
  for (const key of Object.keys(resource)) {
    const m = key.match(/^bus\/(\d+)\//);
    if (m) seen.add(parseInt(m[1], 10));
  }
  return [...seen].sort((a, b) => a - b);
}

/** Renumber buses to 0..N-1 so Godot does not invent ghost buses for the gaps. */
function compactBusIndices(resource: Record<string, string>): Record<string, string> {
  const indices = busIndicesOf(resource);
  const remap = new Map<number, number>();
  indices.forEach((old, i) => remap.set(old, i));

  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(resource)) {
    const m = key.match(/^bus\/(\d+)\/(.*)$/);
    if (!m) { out[key] = value; continue; }
    out[`bus/${remap.get(parseInt(m[1], 10))}/${m[2]}`] = value;
  }
  return out;
}

/** Strip Godot's StringName marker and surrounding quotes: `&"Music"` -> `Music`. */
function busNameOf(raw: string | undefined): string {
  if (!raw) return '';
  return raw.replace(/^&/, '').replace(/^"|"$/g, '');
}

/**
 * Accept either `bus_index` or `bus_name`.
 *
 * `add_audio_bus` speaks in names, and indices shift whenever a bus is removed,
 * so forcing callers to re-read the layout just to learn an index is a trap.
 * Returns the resolved index, or a ToolResult describing what went wrong.
 */
function resolveBusIndex(
  resource: Record<string, string>,
  args: { bus_index?: number; bus_name?: string },
  layoutPath: string
): number | ToolResult {
  const present = busIndicesOf(resource);
  const describe = () =>
    present.map(i => `${i}="${busNameOf(resource[`bus/${i}/name`])}"`).join(', ') || '(none)';

  if (args.bus_index !== undefined && args.bus_index !== null) {
    if (!present.includes(args.bus_index)) {
      return toolError(
        ErrorCode.NOT_FOUND,
        `Bus index ${args.bus_index} does not exist in ${layoutPath}. Present buses: ${describe()}`
      );
    }
    return args.bus_index;
  }

  if (args.bus_name) {
    const hits = present.filter(i => busNameOf(resource[`bus/${i}/name`]) === args.bus_name);
    if (hits.length === 0) {
      return toolError(
        ErrorCode.NOT_FOUND,
        `Audio bus "${args.bus_name}" not found in ${layoutPath}. Present buses: ${describe()}`
      );
    }
    return hits[0];
  }

  return toolError(
    ErrorCode.INVALID_ARGUMENT,
    `Specify either bus_index or bus_name. Present buses: ${describe()}`
  );
}

/** Godot-style unique sub-resource id, e.g. `AudioEffectReverb_a1b2c`. */
function uniqueSubResourceId(subs: SubResource[], type: string): string {
  const taken = new Set(subs.map(s => s.id));
  for (let n = 1; ; n++) {
    const id = `${type}_${n}`;
    if (!taken.has(id)) return id;
  }
}

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
            return toolError(ErrorCode.FILE_NOT_FOUND, `AudioBusLayout file not found: ${layoutPath}. Create one in the Godot editor (Audio tab → Add Bus) or use create_audio_bus_layout.`);
    }

    const { content } = readTextFile(absPath);
    const doc = parseResource(content);

    const lines: string[] = [];
    lines.push(`AudioBusLayout`);
    lines.push(`File: ${layoutPath}`);
    lines.push('');

    // Buses live in the `bus/<i>/...` keys of [resource]. The [sub_resource]
    // blocks are effect resources referenced by those buses, not buses
    // themselves, so they are resolved and shown inside each bus's chain.
    const subById = new Map(doc.subResources.map(s => [s.id, s]));
    const indices = busIndicesOf(doc.resource);

    if (indices.length === 0) {
      lines.push('No buses defined. Godot always needs at least a Master bus (index 0).');
      return { content: [{ type: 'text', text: lines.join('\n') }] };
    }

    lines.push(`Buses (${indices.length}):`);
    for (const i of indices) {
      const get = (k: string) => doc.resource[`bus/${i}/${k}`];
      const name = busNameOf(get('name')) || (i === 0 ? 'Master' : `(unnamed)`);
      const send = busNameOf(get('send'));
      const flags = ['solo', 'mute', 'bypass_fx'].filter(f => get(f) === 'true');

      lines.push('');
      lines.push(`  [${i}] ${name}`);
      lines.push(`    volume_db = ${get('volume_db') ?? '0.0'}`);
      lines.push(`    send      = ${i === 0 ? '(none — Master is the output)' : send || 'Master'}`);
      if (flags.length > 0) lines.push(`    flags     = ${flags.join(', ')}`);

      const fxIdx = Object.keys(doc.resource)
        .map(k => k.match(new RegExp(`^bus/${i}/effect/(\\d+)/effect$`)))
        .filter((m): m is RegExpMatchArray => m !== null)
        .map(m => parseInt(m[1], 10))
        .sort((a, b) => a - b);

      if (fxIdx.length > 0) {
        lines.push(`    effects (${fxIdx.length}):`);
        for (const e of fxIdx) {
          const ref = doc.resource[`bus/${i}/effect/${e}/effect`] || '';
          const enabled = doc.resource[`bus/${i}/effect/${e}/enabled`] !== 'false';
          const sub = subById.get(ref.replace(/^SubResource\("|"\)$/g, ''));
          lines.push(`      ${e}. ${sub ? sub.type : ref}${enabled ? '' : ' (disabled)'}`);
          if (sub) {
            for (const [k, v] of Object.entries(sub.properties)) lines.push(`         ${k} = ${v}`);
          }
        }
      }
    }

    return { content: [{ type: 'text', text: lines.join('\n') }] };
  } catch (err: any) {
    return toolError(ErrorCode.INTERNAL_ERROR, `Error: ${err.message}`);
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
    return toolError(ErrorCode.INTERNAL_ERROR, `Error: ${err.message}`);
  }
}

export function handleCreateAudioBusLayout(
  projectRoot: string,
  args: { path?: string; master_volume?: number }
): ToolResult {
  try {
    const layoutPath = args.path || 'default_bus_layout.tres';

    // Matches what AudioServer.generate_bus_layout() writes: no uid, StringName names.
    const template = `[gd_resource type="AudioBusLayout" format=3]

[resource]
bus/0/name = &"Master"
bus/0/solo = false
bus/0/mute = false
bus/0/bypass_fx = false
bus/0/volume_db = ${linearToDb(args.master_volume ?? 1.0)}
bus/0/send = &""
`;

    const absPath = resolveProjectPath(projectRoot, layoutPath);
    writeTextFile(absPath, template, false);

    return {
      content: [{ type: 'text', text: `AudioBusLayout created: ${layoutPath} (${Object.keys(template.split('\n').filter(l => l.includes('='))).length} bus properties)` }],
    };
  } catch (err: any) {
    return toolError(ErrorCode.INTERNAL_ERROR, `Error: ${err.message}`);
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
  bus_index: z.number().optional().describe('Bus index to remove (0=Master cannot be removed). Give this or bus_name.'),
  bus_name: z.string().optional().describe('Bus name to remove, e.g. "Music". Alternative to bus_index.'),
};

export const addBusEffectSchema = {
  layout_path: z.string().optional().default('default_bus_layout.tres'),
  bus_index: z.number().optional().describe('Bus index. Give this or bus_name.'),
  bus_name: z.string().optional().describe('Bus name, e.g. "Music". Alternative to bus_index.'),
  effect_type: z.enum(['Reverb', 'Delay', 'Distortion', 'Chorus', 'EQ', 'Compressor', 'Limiter', 'Panner', 'PitchShift', 'Phaser', 'LowPassFilter', 'HighPassFilter', 'BandPassFilter', 'BandLimitFilter', 'Amplify']).describe('Effect type'),
  effect_params: z.record(z.string()).optional().describe('Effect properties set on the effect resource, e.g. {"wet":"0.5","room_size":"0.8"}'),
};

export const setBusVolumeSchema = {
  layout_path: z.string().optional().default('default_bus_layout.tres'),
  bus_index: z.number().optional().describe('Bus index. Give this or bus_name.'),
  bus_name: z.string().optional().describe('Bus name, e.g. "Music". Alternative to bus_index.'),
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
    return toolError(ErrorCode.FILE_NOT_FOUND, `AudioBusLayout not found: ${layoutPath}. Use create_audio_bus_layout first.`);
    }

    const { content } = readTextFile(absPath);
    const doc = parseResource(content) as BusLayoutDoc;

    // Godot resolves buses by name (AudioServer.get_bus_index) — duplicates make
    // one of them permanently unreachable, so reject instead of silently adding.
    const existingNames = busIndicesOf(doc.resource)
      .map(i => busNameOf(doc.resource[`bus/${i}/name`]));
    if (existingNames.includes(args.bus_name)) {
      return toolError(
        ErrorCode.ALREADY_EXISTS,
        `Audio bus "${args.bus_name}" already exists (index ${existingNames.indexOf(args.bus_name)}). ` +
        `Bus names must be unique. Use set_bus_volume / remove_audio_bus to change it.`
      );
    }

    // Append at the first contiguous slot; never leave a gap.
    doc.resource = compactBusIndices(doc.resource);
    const nextIdx = busIndicesOf(doc.resource).length;

    const sendTo = args.send_to || 'Master';
    const volDb = args.volume_db ?? 0.0;

    doc.resource[`bus/${nextIdx}/name`] = `&"${args.bus_name}"`;
    doc.resource[`bus/${nextIdx}/solo`] = 'false';
    doc.resource[`bus/${nextIdx}/mute`] = 'false';
    doc.resource[`bus/${nextIdx}/bypass_fx`] = 'false';
    doc.resource[`bus/${nextIdx}/volume_db`] = volDb.toFixed(1);
    doc.resource[`bus/${nextIdx}/send`] = `&"${sendTo}"`;

    writeTextFile(absPath, rebuildBusLayout(doc), true);

    return { content: [{ type: 'text', text: `Bus "${args.bus_name}" added at index ${nextIdx} (send → ${sendTo})` }] };
  } catch (err: any) {
    return toolError(ErrorCode.INTERNAL_ERROR, `Error: ${err.message}`);
  }
}

export function handleRemoveAudioBus(
  projectRoot: string,
  args: { layout_path?: string; bus_index?: number; bus_name?: string }
): ToolResult {
  try {
    const layoutPath = args.layout_path || 'default_bus_layout.tres';
    const absPath = resolveProjectPath(projectRoot, layoutPath);
    const { content } = readTextFile(absPath);
    const doc = parseResource(content) as BusLayoutDoc;

    const resolved = resolveBusIndex(doc.resource, args, layoutPath);
    if (typeof resolved !== 'number') return resolved;
    if (resolved === 0) {
      return toolError(ErrorCode.INVALID_ARGUMENT, 'Cannot remove the Master bus (index 0); Godot requires it.');
    }

    const prefix = `bus/${resolved}/`;
    const removedName = busNameOf(doc.resource[`bus/${resolved}/name`]);
    for (const key of Object.keys(doc.resource).filter(k => k.startsWith(prefix))) {
      delete doc.resource[key];
    }

    // Close the gap, otherwise Godot fabricates a default bus at that index.
    doc.resource = compactBusIndices(doc.resource);

    // Buses that routed into the removed one would now send to a dead target.
    for (const i of busIndicesOf(doc.resource)) {
      if (busNameOf(doc.resource[`bus/${i}/send`]) === removedName) {
        doc.resource[`bus/${i}/send`] = '&"Master"';
      }
    }

    // Effect sub-resources that nothing references any more are dead weight.
    doc.subResources = pruneUnusedEffects(doc);

    writeTextFile(absPath, rebuildBusLayout(doc), true);

    return {
      content: [{
        type: 'text',
        text: `Bus ${resolved}${removedName ? ` ("${removedName}")` : ''} removed; ` +
              `remaining buses renumbered 0..${busIndicesOf(doc.resource).length - 1}`,
      }],
    };
  } catch (err: any) {
    return toolError(ErrorCode.INTERNAL_ERROR, `Error: ${err.message}`);
  }
}

/** Drop `[sub_resource]` blocks no `bus/<i>/effect/<n>/effect` key points at. */
function pruneUnusedEffects(doc: BusLayoutDoc): SubResource[] {
  const subs = doc.subResources || [];
  const referenced = new Set<string>();
  for (const value of Object.values(doc.resource)) {
    const m = value.match(/^SubResource\("([^"]+)"\)$/);
    if (m) referenced.add(m[1]);
  }
  return subs.filter(s => referenced.has(s.id));
}

export function handleAddBusEffect(
  projectRoot: string,
  args: { layout_path?: string; bus_index?: number; bus_name?: string; effect_type: string; effect_params?: Record<string, string> }
): ToolResult {
  try {
    const layoutPath = args.layout_path || 'default_bus_layout.tres';
    const absPath = resolveProjectPath(projectRoot, layoutPath);
    const { content } = readTextFile(absPath);
    const doc = parseResource(content) as BusLayoutDoc;

    const busIdx = resolveBusIndex(doc.resource, args, layoutPath);
    if (typeof busIdx !== 'number') return busIdx;

    // Effect indices must stay contiguous from 0; Godot stops reading the chain
    // at the first missing slot.
    const used = new Set<number>();
    for (const key of Object.keys(doc.resource)) {
      const m = key.match(new RegExp(`^bus/${busIdx}/effect/(\\d+)/`));
      if (m) used.add(parseInt(m[1], 10));
    }
    const nextIdx = used.size;

    // The effect itself is a resource, not a set of bus properties: it needs a
    // real [sub_resource] block or the SubResource(...) reference dangles and
    // Godot fails to parse the whole file.
    const className = `AudioEffect${args.effect_type}`;
    doc.subResources = doc.subResources || [];
    const subId = uniqueSubResourceId(doc.subResources, className);
    doc.subResources.push({
      type: className,
      id: subId,
      properties: { ...(args.effect_params || {}) },
    });

    const prefix = `bus/${busIdx}/effect/${nextIdx}/`;
    doc.resource[`${prefix}effect`] = `SubResource("${subId}")`;
    doc.resource[`${prefix}enabled`] = 'true';

    writeTextFile(absPath, rebuildBusLayout(doc), true);

    const busName = busNameOf(doc.resource[`bus/${busIdx}/name`]);
    return {
      content: [{
        type: 'text',
        text: `Effect "${args.effect_type}" added to bus ${busIdx}${busName ? ` ("${busName}")` : ''} ` +
              `at effect index ${nextIdx} (sub_resource id: ${subId})`,
      }],
    };
  } catch (err: any) {
    return toolError(ErrorCode.INTERNAL_ERROR, `Error: ${err.message}`);
  }
}

export function handleSetBusVolume(
  projectRoot: string,
  args: { layout_path?: string; bus_index?: number; bus_name?: string; volume_db: number }
): ToolResult {
  try {
    const layoutPath = args.layout_path || 'default_bus_layout.tres';
    const absPath = resolveProjectPath(projectRoot, layoutPath);
    const { content } = readTextFile(absPath);
    const doc = parseResource(content) as BusLayoutDoc;

    // Writing volume_db for an index that has no bus would fabricate a half-built
    // ghost bus, so require the bus to exist.
    const busIdx = resolveBusIndex(doc.resource, args, layoutPath);
    if (typeof busIdx !== 'number') return busIdx;

    doc.resource[`bus/${busIdx}/volume_db`] = args.volume_db.toFixed(1);

    writeTextFile(absPath, rebuildBusLayout(doc), true);

    const busName = busNameOf(doc.resource[`bus/${busIdx}/name`]);
    return {
      content: [{
        type: 'text',
        text: `Bus ${busIdx}${busName ? ` ("${busName}")` : ''} volume set to ${args.volume_db} dB`,
      }],
    };
  } catch (err: any) {
    return toolError(ErrorCode.INTERNAL_ERROR, `Error: ${err.message}`);
  }
}

// ---- Helpers ----


function linearToDb(linear: number): string {
  if (linear <= 0) return '-80.0';
  const db = 20 * Math.log10(linear);
  return db.toFixed(1);
}
