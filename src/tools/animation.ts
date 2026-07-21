// Copyright (c) 2026 FairYan
// SPDX-License-Identifier: MIT
// ============================================================
// Godot MCP Server - Animation Tools
// ============================================================
//
// Parses AnimationPlayer nodes and Animation sub-resources from .tscn files.
// Animation data lives in:
//   1. [sub_resource type="Animation" id="..."] blocks with track data
//   2. [node name="X" type="AnimationPlayer"] with library references

import { z } from 'zod';
import { ToolResult } from '../utils/types.js';
import fs from 'node:fs';
import path from 'node:path';
import { readTextFile, resolveProjectPath, findFilesByExtension, writeTextFile } from '../utils/file_utils.js';
import { parseScene, serializeScene } from '../parsers/scene_parser.js';

// ---- Tool Schemas ----

export const listAnimationsSchema = {
  scene_path: z.string().optional().describe('Filter to a specific scene (default: all scenes)'),
};

export const readAnimationSchema = {
  scene_path: z.string().describe('Path to .tscn scene file containing the AnimationPlayer'),
  animation_name: z.string().optional().describe('Specific animation name to read (default: list all)'),
};

export const createAnimationSchema = {
  path: z.string().describe('Output path for new Animation .tres file (e.g. "animations/idle.tres")'),
  length: z.number().optional().default(1.0).describe('Animation length in seconds'),
  loop_mode: z.enum(['none', 'linear', 'ping_pong']).optional().default('none').describe('Loop mode: none, linear, or ping_pong'),
};

export const setAnimationParamSchema = {
  scene_path: z.string().describe('Path to .tscn scene file'),
  animation_name: z.string().describe('Name of the animation (as appears in AnimationPlayer)'),
  param: z.string().describe('Parameter name (e.g. "length", "loop_mode", "step")'),
  value: z.string().describe('New value for the parameter'),
};

export const addAnimationLibrarySchema = {
  scene_path: z.string().describe('Path to .tscn scene file'),
  animation_name: z.string().describe('Name for the new animation library'),
  animations: z.array(z.string()).optional().describe('Reserved UIDs of existing Animation sub-resources'),
};

// ---- Helpers ----

/** Parse animation loop_mode string to number */
function loopModeToNumber(mode: string): number {
  switch (mode) {
    case 'linear': return 1;
    case 'ping_pong': return 2;
    case 'none':
    default: return 0;
  }
}

function loopModeToString(mode: string | number): string {
  const n = typeof mode === 'string' ? parseInt(mode, 10) : mode;
  switch (n) {
    case 1: return 'linear';
    case 2: return 'ping_pong';
    default: return 'none';
  }
}

// ---- Tool Handlers ----

/**
 * List all AnimationPlayer nodes and their animations across scenes.
 */
export function handleListAnimations(
  projectRoot: string,
  args: { scene_path?: string }
): ToolResult {
  try {
    const sceneFiles = args.scene_path
      ? [args.scene_path]
      : findFilesByExtension(projectRoot, ['.tscn']);

    if (sceneFiles.length === 0) {
      return { content: [{ type: 'text', text: 'No scene files found.' }] };
    }

    const lines: string[] = [];
    let totalAnimations = 0;
    let totalPlayers = 0;

    for (const sceneRelPath of sceneFiles) {
      const absPath = resolveProjectPath(projectRoot, sceneRelPath);
      const { content } = readTextFile(absPath);
      const doc = parseScene(content);

      // Find AnimationPlayer nodes
      const animPlayers = getAllAnimationPlayers(doc);
      if (animPlayers.length === 0) continue;

      lines.push(`\n=== ${sceneRelPath} (${animPlayers.length} AnimationPlayer${animPlayers.length > 1 ? 's' : ''}) ===`);
      totalPlayers += animPlayers.length;

      for (const player of animPlayers) {
        const anims = extractAnimNames(player.properties);
        lines.push(`  [${player.name}]`);
        if (anims.length === 0) {
          lines.push(`    (no animations)`);
        } else {
          for (const anim of anims) {
            const sub = doc.subResources.find(s => s.id === anim.subId);
            const length = sub?.properties['length'] || '?';
            const loop = sub?.properties['loop_mode'] || '0';
            const trackCount = countTracks(sub?.properties || {});
            lines.push(`    ${anim.name}: length=${length}s loop=${loopModeToString(loop)} tracks=${trackCount}`);
            totalAnimations++;
          }
        }
      }
    }

    if (totalPlayers === 0) {
      return { content: [{ type: 'text', text: 'No AnimationPlayer nodes found in project scenes.' }] };
    }

    const summary = `\n---\nTotal: ${totalPlayers} AnimationPlayer(s), ${totalAnimations} animation(s) across ${sceneFiles.length} scene(s)`;
    lines.push(summary);

    return { content: [{ type: 'text', text: lines.join('\n') }] };
  } catch (err: any) {
    return { content: [{ type: 'text', text: `Error: ${err.message}` }], isError: true };
  }
}

/**
 * Read detailed animation data from a scene's AnimationPlayer.
 */
export function handleReadAnimation(
  projectRoot: string,
  args: { scene_path: string; animation_name?: string }
): ToolResult {
  try {
    const absPath = resolveProjectPath(projectRoot, args.scene_path);
    const { content } = readTextFile(absPath);
    const doc = parseScene(content);

    const animPlayers = getAllAnimationPlayers(doc);
    if (animPlayers.length === 0) {
      return { content: [{ type: 'text', text: 'No AnimationPlayer node found in this scene.' }] };
    }

    const lines: string[] = [];
    lines.push(`Scene: ${args.scene_path}`);

    for (const player of animPlayers) {
      const anims = extractAnimNames(player.properties);

      // Filter by name if specified
      const targetAnims = args.animation_name
        ? anims.filter(a => a.name === args.animation_name)
        : anims;

      if (targetAnims.length === 0 && args.animation_name) {
        lines.push(`  No animation named "${args.animation_name}" in ${player.name}`);
        continue;
      }

      lines.push(`\nAnimationPlayer: ${player.name}`);
      if (player.properties['playback/process_mode']) {
        lines.push(`  Process Mode: ${player.properties['playback/process_mode']}`);
      }
      if (player.properties['speed']) {
        lines.push(`  Speed: ${player.properties['speed']}`);
      }
      if (player.properties['autoplay']) {
        lines.push(`  Autoplay: ${player.properties['autoplay']}`);
      }

      // Read each animation
      for (const anim of targetAnims) {
        const sub = doc.subResources.find(s => s.id === anim.subId);
        if (!sub) {
          lines.push(`\n  Animation: ${anim.name} (sub-resource ${anim.subId} not found)`);
          continue;
        }

        const props = sub.properties;
        lines.push(`\n  Animation: ${anim.name}`);
        lines.push(`    Length: ${props['length'] || '?'}s`);
        lines.push(`    Loop: ${loopModeToString(props['loop_mode'] || '0')} (${props['loop_mode'] || '0'})`);
        if (props['step']) lines.push(`    Step: ${props['step']}`);

        // Parse tracks
        const tracks = parseTracks(props);
        lines.push(`    Tracks: ${tracks.length}`);
        for (const track of tracks) {
          const typeLabel = trackTypeLabel(track.type);
          lines.push(`      Track ${track.index}: ${typeLabel} → ${track.path}`);
          if (track.interp !== undefined) lines.push(`        Interpolation: ${track.interp}`);
          if (track.keys.length <= 5) {
            for (const key of track.keys) {
              lines.push(`        Key: t=${key.time} v=${key.value}${key.easing ? ` ease=${key.easing}` : ''}`);
            }
          } else {
            lines.push(`        ${track.keys.length} key(s)`);
            // Show first 2 and last 1
            for (const key of track.keys.slice(0, 2)) {
              lines.push(`        Key: t=${key.time} v=${key.value}${key.easing ? ` ease=${key.easing}` : ''}`);
            }
            lines.push(`        ...`);
            const last = track.keys[track.keys.length - 1];
            lines.push(`        Key: t=${last.time} v=${last.value}${last.easing ? ` ease=${last.easing}` : ''}`);
          }
        }
      }
    }

    return { content: [{ type: 'text', text: lines.join('\n') }] };
  } catch (err: any) {
    return { content: [{ type: 'text', text: `Error reading animation: ${err.message}` }], isError: true };
  }
}

/**
 * Create a new Animation .tres resource file.
 */
export function handleCreateAnimation(
  projectRoot: string,
  args: { path: string; length?: number; loop_mode?: string }
): ToolResult {
  try {
    const loopMode = loopModeToNumber(args.loop_mode || 'none');
    const length = args.length || 1.0;

    const template = `[gd_resource type="Animation" format=3 uid=""]

[resource]
length = ${length}
loop_mode = ${loopMode}
step = 0.1
`;

    const absPath = resolveProjectPath(projectRoot, args.path);
    writeTextFile(absPath, template, false);

    return {
      content: [{ type: 'text', text: `Animation resource created: ${args.path}\nLength: ${length}s | Loop: ${args.loop_mode || 'none'}` }],
    };
  } catch (err: any) {
    return { content: [{ type: 'text', text: `Error: ${err.message}` }], isError: true };
  }
}

/**
 * Set a parameter on an animation embedded in a scene.
 */
export function handleSetAnimationParam(
  projectRoot: string,
  args: { scene_path: string; animation_name: string; param: string; value: string }
): ToolResult {
  try {
    const absPath = resolveProjectPath(projectRoot, args.scene_path);
    const { content } = readTextFile(absPath);
    const doc = parseScene(content);

    // Find the animation reference in AnimationPlayer
    const animPlayers = getAllAnimationPlayers(doc);
    let foundSubId: string | null = null;

    for (const player of animPlayers) {
      const anims = extractAnimNames(player.properties);
      const match = anims.find(a => a.name === args.animation_name);
      if (match) {
        foundSubId = match.subId;
        break;
      }
    }

    if (!foundSubId) {
      return {
        content: [{ type: 'text', text: `Animation "${args.animation_name}" not found in ${args.scene_path}` }],
        isError: true,
      };
    }

    // Update the sub-resource
    const sub = doc.subResources.find(s => s.id === foundSubId);
    if (!sub) {
      return {
        content: [{ type: 'text', text: `Sub-resource ${foundSubId} not found (corrupt scene?)` }],
        isError: true,
      };
    }

    sub.properties[args.param] = args.value;

    // Save
    const newContent = serializeScene(doc);
    writeTextFile(absPath, newContent, true);

    return {
      content: [{ type: 'text', text: `Animation "${args.animation_name}" updated: ${args.param} = ${args.value}` }],
    };
  } catch (err: any) {
    return { content: [{ type: 'text', text: `Error: ${err.message}` }], isError: true };
  }
}

/**
 * Add an AnimationLibrary reference to an AnimationPlayer node.
 */
export function handleAddAnimationLibrary(
  projectRoot: string,
  args: { scene_path: string; animation_name: string; animations?: string[] }
): ToolResult {
  try {
    const absPath = resolveProjectPath(projectRoot, args.scene_path);
    const { content } = readTextFile(absPath);
    const doc = parseScene(content);

    const animPlayers = getAllAnimationPlayers(doc);

    if (animPlayers.length === 0) {
      return {
        content: [{ type: 'text', text: 'No AnimationPlayer node found. Add an AnimationPlayer node first.' }],
        isError: true,
      };
    }

    // Use the first AnimationPlayer (or allow specifying a path?)
    const player = animPlayers[0];

    // Store animation reference
    const libKey = `_libraries/${args.animation_name}`;
    const existing = player.properties[libKey];
    if (existing) {
      return {
        content: [{ type: 'text', text: `Animation library "${args.animation_name}" already exists in ${player.name}` }],
        isError: true,
      };
    }

    // Create a dummy sub-resource reference
    // In Godot 4, libraries are Arrays. We store as a placeholder Array[SubResource].
    player.properties[libKey] = '[]';

    const newContent = serializeScene(doc);
    writeTextFile(absPath, newContent, true);

    return {
      content: [{ type: 'text', text: `Animation library "${args.animation_name}" added to ${player.name} in ${args.scene_path}` }],
    };
  } catch (err: any) {
    return { content: [{ type: 'text', text: `Error: ${err.message}` }], isError: true };
  }
}

// ---- Animation Track Editor ----

export const addAnimationTrackSchema = {
  scene_path: z.string().describe('Path to .tscn scene file'),
  animation_name: z.string().describe('Name of the animation in AnimationPlayer'),
  track_type: z.enum(['value', 'method', 'bezier', 'audio', 'animation', 'blend_shape']).optional().default('value').describe('Track type'),
  track_path: z.string().describe('Node property path to animate (e.g. ".:position", "Sprite2D:modulate")'),
  interp: z.enum(['linear', 'cubic', 'nearest']).optional().default('linear').describe('Interpolation method'),
};

export const setKeyframeSchema = {
  scene_path: z.string().describe('Path to .tscn scene file'),
  animation_name: z.string().describe('Animation name'),
  track_index: z.number().describe('Track index (0-based)'),
  time: z.number().describe('Time in seconds'),
  value: z.string().describe('Value at keyframe (e.g. "Vector2(100, 0)", "1.5")'),
  easing: z.number().optional().default(1.0).describe('Easing weight (0=custom, 1=auto, >1=ease in, <-1=ease out)'),
};

export const removeAnimationTrackSchema = {
  scene_path: z.string().describe('Path to .tscn scene file'),
  animation_name: z.string().describe('Animation name'),
  track_index: z.number().describe('Track index to remove (0-based)'),
};

export function handleAddAnimationTrack(
  projectRoot: string,
  args: { scene_path: string; animation_name: string; track_type?: string; track_path: string; interp?: string }
): ToolResult {
  try {
    const absPath = resolveProjectPath(projectRoot, args.scene_path);
    const { content } = readTextFile(absPath);
    const doc = parseScene(content);

    // Find the animation
    const animPlayers = getAllAnimationPlayers(doc);
    let subId: string | null = null;

    for (const player of animPlayers) {
      const anims = extractAnimNames(player.properties);
      const match = anims.find(a => a.name === args.animation_name);
      if (match) { subId = match.subId; break; }
    }

    if (!subId) {
      return { content: [{ type: 'text', text: `Animation "${args.animation_name}" not found` }], isError: true };
    }

    const sub = doc.subResources.find(s => s.id === subId);
    if (!sub) {
      return { content: [{ type: 'text', text: `Sub-resource ${subId} not found` }], isError: true };
    }

    // Find next track index
    const trackCount = countTracks(sub.properties);
    const trackIdx = trackCount;
    const trackType = (args.track_type || 'value').replace('property', 'value');
    const interpCode = args.interp === 'cubic' ? '1' : args.interp === 'nearest' ? '2' : '0';

    sub.properties[`tracks/${trackIdx}/type`] = trackType;
    sub.properties[`tracks/${trackIdx}/path`] = `NodePath("${args.track_path}")`;
    sub.properties[`tracks/${trackIdx}/interp`] = interpCode;

    const newContent = serializeScene(doc);
    writeTextFile(absPath, newContent, true);

    return { content: [{ type: 'text', text: `Track ${trackIdx} added to "${args.animation_name}": ${trackType} → ${args.track_path}` }] };
  } catch (err: any) {
    return { content: [{ type: 'text', text: `Error: ${err.message}` }], isError: true };
  }
}

export function handleSetKeyframe(
  projectRoot: string,
  args: { scene_path: string; animation_name: string; track_index: number; time: number; value: string; easing?: number }
): ToolResult {
  try {
    const absPath = resolveProjectPath(projectRoot, args.scene_path);
    const { content } = readTextFile(absPath);
    const doc = parseScene(content);

    // Find animation
    const animPlayers = getAllAnimationPlayers(doc);
    let subId: string | null = null;
    for (const player of animPlayers) {
      const anims = extractAnimNames(player.properties);
      const match = anims.find(a => a.name === args.animation_name);
      if (match) { subId = match.subId; break; }
    }

    if (!subId) {
      return { content: [{ type: 'text', text: `Animation "${args.animation_name}" not found` }], isError: true };
    }

    const sub = doc.subResources.find(s => s.id === subId);
    if (!sub) {
      return { content: [{ type: 'text', text: `Sub-resource not found` }], isError: true };
    }

    // Find next key index for this track
    const prefix = `tracks/${args.track_index}/keys/`;
    let keyIdx = 0;
    for (const key of Object.keys(sub.properties)) {
      if (key.startsWith(prefix)) {
        const kMatch = key.match(new RegExp(`^tracks/${args.track_index}/keys/(\\d+)/`));
        if (kMatch) {
          keyIdx = Math.max(keyIdx, parseInt(kMatch[1], 10) + 1);
        }
      }
    }

    sub.properties[`${prefix}${keyIdx}/time`] = String(args.time);
    sub.properties[`${prefix}${keyIdx}/value`] = args.value;
    sub.properties[`${prefix}${keyIdx}/transition`] = String(args.easing ?? 1.0);

    const newContent = serializeScene(doc);
    writeTextFile(absPath, newContent, true);

    return { content: [{ type: 'text', text: `Keyframe set on "${args.animation_name}" track ${args.track_index}: t=${args.time} v=${args.value}` }] };
  } catch (err: any) {
    return { content: [{ type: 'text', text: `Error: ${err.message}` }], isError: true };
  }
}

export function handleRemoveAnimationTrack(
  projectRoot: string,
  args: { scene_path: string; animation_name: string; track_index: number }
): ToolResult {
  try {
    const absPath = resolveProjectPath(projectRoot, args.scene_path);
    const { content } = readTextFile(absPath);
    const doc = parseScene(content);

    // Find animation
    const animPlayers = getAllAnimationPlayers(doc);
    let subId: string | null = null;
    for (const player of animPlayers) {
      const anims = extractAnimNames(player.properties);
      const match = anims.find(a => a.name === args.animation_name);
      if (match) { subId = match.subId; break; }
    }

    if (!subId) {
      return { content: [{ type: 'text', text: `Animation not found` }], isError: true };
    }

    const sub = doc.subResources.find(s => s.id === subId);
    if (!sub) {
      return { content: [{ type: 'text', text: `Sub-resource not found` }], isError: true };
    }

    // Remove all properties for this track
    const prefix = `tracks/${args.track_index}/`;
    const keysToRemove = Object.keys(sub.properties).filter(k => k.startsWith(prefix));
    for (const key of keysToRemove) {
      delete sub.properties[key];
    }

    const newContent = serializeScene(doc);
    writeTextFile(absPath, newContent, true);

    return { content: [{ type: 'text', text: `Track ${args.track_index} removed from "${args.animation_name}"` }] };
  } catch (err: any) {
    return { content: [{ type: 'text', text: `Error: ${err.message}` }], isError: true };
  }
}

// ---- AnimationTree / State Machine Tools ----

export const readAnimationTreeSchema = {
  scene_path: z.string().describe('Path to .tscn scene file containing an AnimationTree node'),
};

export const setAnimationTreeParamSchema = {
  scene_path: z.string().describe('Path to .tscn scene file'),
  tree_name: z.string().optional().describe('AnimationTree node name (default: first found)'),
  param: z.string().describe('Parameter to set (e.g. "active", "tree_root/parameters/conditions/active")'),
  value: z.string().describe('New value'),
};

export function handleReadAnimationTree(
  projectRoot: string,
  args: { scene_path: string }
): ToolResult {
  try {
    const absPath = resolveProjectPath(projectRoot, args.scene_path);
    const { content } = readTextFile(absPath);
    const doc = parseScene(content);

    const animPlayers = getAllAnimationPlayers(doc);

    // Find AnimationTree nodes
    const trees: any[] = [];
    function walk(nodes: any[]): void {
      for (const node of nodes) {
        if (node.type === 'AnimationTree') trees.push(node);
        if (node.children) walk(node.children);
      }
    }
    walk(doc.nodes);

    if (trees.length === 0 && animPlayers.length === 0) {
      return { content: [{ type: 'text', text: 'No AnimationTree or AnimationPlayer nodes found in this scene.' }] };
    }

    const lines: string[] = [];
    lines.push(`Scene: ${args.scene_path}`);

    for (const tree of trees) {
      lines.push(`\nAnimationTree: ${tree.name}`);
      const treeProps: Record<string, string> = {};

      for (const [key, val] of Object.entries(tree.properties)) {
        if (!key.startsWith('anims/') && !key.startsWith('_libraries/')) {
          treeProps[key] = String(val);
        }
      }

      for (const [key, val] of Object.entries(treeProps)) {
        lines.push(`  ${key} = ${val}`);
      }

      // Show animation references
      const animRefs = extractAnimNames(tree.properties);
      if (animRefs.length > 0) {
        lines.push(`  Animations: ${animRefs.length}`);
        animRefs.forEach(a => lines.push(`    ${a.name} → SubResource("${a.subId}")`));
      }

      // Check for AnimationNode sub-resources
      const treeSubs = doc.subResources.filter(s =>
        s.type.includes('AnimationNode') || s.type.includes('AnimationRootNode')
      );
      if (treeSubs.length > 0) {
        lines.push(`  Animation Nodes: ${treeSubs.length}`);
        for (const sub of treeSubs) {
          lines.push(`\n    [${sub.id}] ${sub.type}:`);
          for (const [key, val] of Object.entries(sub.properties).slice(0, 10)) {
            lines.push(`      ${key} = ${val}`);
          }
          if (Object.keys(sub.properties).length > 10) {
            lines.push(`      ... (${Object.keys(sub.properties).length} total)`);
          }
        }
      }
    }

    // Also list AnimationPlayers
    if (animPlayers.length > 0 && trees.length === 0) {
      for (const player of animPlayers) {
        const anims = extractAnimNames(player.properties);
        lines.push(`\nAnimationPlayer: ${player.name} (${anims.length} animations)`);
        anims.forEach(a => {
          const sub = doc.subResources.find(s => s.id === a.subId);
          const len = sub?.properties['length'] || '?';
          lines.push(`  ${a.name}: ${len}s`);
        });
      }
    }

    return { content: [{ type: 'text', text: lines.join('\n') }] };
  } catch (err: any) {
    return { content: [{ type: 'text', text: `Error: ${err.message}` }], isError: true };
  }
}

export function handleSetAnimationTreeParam(
  projectRoot: string,
  args: { scene_path: string; tree_name?: string; param: string; value: string }
): ToolResult {
  try {
    const absPath = resolveProjectPath(projectRoot, args.scene_path);
    const { content } = readTextFile(absPath);
    const doc = parseScene(content);

    const trees: any[] = [];
    function walk(nodes: any[]): void {
      for (const node of nodes) {
        if (node.type === 'AnimationTree') trees.push(node);
        if (node.children) walk(node.children);
      }
    }
    walk(doc.nodes);

    const tree = args.tree_name
      ? trees.find(t => t.name === args.tree_name)
      : trees[0];

    if (!tree) {
      return { content: [{ type: 'text', text: 'AnimationTree node not found.' }], isError: true };
    }

    tree.properties[args.param] = args.value;

    const newContent = serializeScene(doc);
    writeTextFile(absPath, newContent, true);

    return { content: [{ type: 'text', text: `AnimationTree "${tree.name}" updated: ${args.param} = ${args.value}` }] };
  } catch (err: any) {
    return { content: [{ type: 'text', text: `Error: ${err.message}` }], isError: true };
  }
}

// ---- Internal Helpers ----

interface AnimReference {
  name: string;
  subId: string;
}

interface ParsedTrack {
  index: number;
  type: string;
  path: string;
  interp?: string;
  keys: ParsedKey[];
}

interface ParsedKey {
  time: string;
  value: string;
  easing?: string;
}

/** Walk scene tree to find AnimationPlayer nodes */
function getAllAnimationPlayers(doc: any): any[] {
  const players: any[] = [];

  function walk(nodes: any[]): void {
    for (const node of nodes) {
      if (node.type === 'AnimationPlayer') {
        players.push(node);
      }
      if (node.children) {
        walk(node.children);
      }
    }
  }

  walk(doc.nodes);
  return players;
}

/** Extract animation name → sub-resource ID mapping from AnimationPlayer properties */
function extractAnimNames(properties: Record<string, string>): AnimReference[] {
  const result: AnimReference[] = [];
  for (const [key, value] of Object.entries(properties)) {
    // Pattern: "anims/idle" = SubResource("Animation_abc123")
    if (key.startsWith('anims/')) {
      const name = key.replace('anims/', '');
      const match = value.match(/SubResource\("([^"]+)"\)/);
      if (match) {
        result.push({ name, subId: match[1] });
      }
    }
  }
  return result.sort((a, b) => a.name.localeCompare(b.name));
}

/** Count tracks in animation properties */
function countTracks(props: Record<string, string>): number {
  const tracks = new Set<number>();
  for (const key of Object.keys(props)) {
    const match = key.match(/^tracks\/(\d+)\//);
    if (match) tracks.add(parseInt(match[1], 10));
  }
  return tracks.size;
}

/** Parse track data from animation sub-resource properties */
function parseTracks(props: Record<string, string>): ParsedTrack[] {
  const trackMap = new Map<number, Record<string, string>>();

  for (const [key, value] of Object.entries(props)) {
    const match = key.match(/^tracks\/(\d+)\/(.+)$/);
    if (match) {
      const index = parseInt(match[1], 10);
      const field = match[2];
      if (!trackMap.has(index)) trackMap.set(index, {});
      trackMap.get(index)![field] = value;
    }
  }

  const tracks: ParsedTrack[] = [];
  for (const [index, fields] of trackMap) {
    const keys: ParsedKey[] = [];
    // Parse keys: "keys/<n>/<prop>"
    // Keys have a nested structure like "keys/0/time", "keys/0/value", "keys/0/transition"
    const keyMap = new Map<number, Record<string, string>>();
    for (const [field, val] of Object.entries(fields)) {
      const keyMatch = field.match(/^keys\/(\d+)\/(.+)$/);
      if (keyMatch) {
        const ki = parseInt(keyMatch[1], 10);
        const kp = keyMatch[2];
        if (!keyMap.has(ki)) keyMap.set(ki, {});
        keyMap.get(ki)![kp] = val;
      }
    }

    for (const [, keyFields] of keyMap) {
      keys.push({
        time: keyFields['time'] || '?',
        value: keyFields['value'] || '?',
        easing: keyFields['easing'] || keyFields['transition'],
      });
    }
    keys.sort((a, b) => parseFloat(a.time) - parseFloat(b.time));

    tracks.push({
      index,
      type: fields['type'] || 'value',
      path: fields['path'] || '?',
      interp: fields['interp'],
      keys,
    });
  }

  return tracks.sort((a, b) => a.index - b.index);
}

function trackTypeLabel(type: string): string {
  switch (type) {
    case 'value': return 'property';
    case 'method': return 'method';
    case 'bezier': return 'bezier';
    case 'audio': return 'audio';
    case 'animation': return 'animation';
    case 'blend_shape': return 'blend_shape';
    default: return type;
  }
}
