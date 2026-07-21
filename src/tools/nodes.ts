// Copyright (c) 2026 FairYan
// SPDX-License-Identifier: MIT
// ============================================================
// Godot MCP Server - Node Property Inspectors
// ============================================================
// CharacterBody, AnimatedSprite, AudioPlayer, VideoPlayer,
// Parallax, RichText, Container, TabContainer, ScrollContainer

import { z } from 'zod';
import { ToolResult } from '../utils/types.js';
import { readTextFile, resolveProjectPath, findFilesByExtension } from '../utils/file_utils.js';
import { parseScene } from '../parsers/scene_parser.js';

function walk(nodes: any[], types: string[]): any[] {
  const r: any[] = [];
  for (const n of nodes) { if (types.includes(n.type)) r.push(n); if (n.children) r.push(...walk(n.children, types)); }
  return r;
}

// ---- Schemas ----

export const readCharacterBodySchema = {
  scene_path: z.string().describe('Path to .tscn scene'),
  name: z.string().optional().describe('CharacterBody node name'),
};

export const readAnimatedSpriteSchema = {
  scene_path: z.string().optional().describe('Filter to scene'),
  name: z.string().optional().describe('Specific node name'),
};

export const readAudioPlayerSchema = {
  scene_path: z.string().optional().describe('Filter to scene'),
};

export const readVideoPlayerSchema = {
  scene_path: z.string().optional().describe('Filter to scene'),
};

export const readParallaxSchema = {
  scene_path: z.string().optional().describe('Filter to scene'),
};

export const readRichTextSchema = {
  scene_path: z.string().optional().describe('Filter to scene'),
  name: z.string().optional().describe('RichTextLabel node name'),
};

export const readContainerSchema = {
  scene_path: z.string().describe('Path to .tscn scene'),
  name: z.string().optional().describe('Container node name'),
};

export const readTabContainerSchema = {
  scene_path: z.string().describe('Path to .tscn scene'),
  name: z.string().optional().describe('TabContainer/TabBar node name'),
};

// ---- CharacterBody ----

export function handleReadCharacterBody(
  projectRoot: string,
  args: { scene_path: string; name?: string }
): ToolResult {
  try {
    const absPath = resolveProjectPath(projectRoot, args.scene_path);
    const { content } = readTextFile(absPath);
    const doc = parseScene(content);

    const bodies = walk(doc.nodes, ['CharacterBody2D', 'CharacterBody3D']);
    const target = args.name ? bodies.find(b => b.name === args.name) : bodies[0];

    if (!target) return { content: [{ type: 'text', text: 'No CharacterBody found.' }] };

    const is3D = target.type === 'CharacterBody3D';
    const lines: string[] = [`${target.type}: ${target.name}`];

    const labels: Record<string, string> = {
      motion_mode: 'Motion mode (0=grounded, 1=floating)' + (is3D ? '' : ''),
      floor_snap_length: is3D ? 'Floor snap length' : 'Floor snap length (px)',
      floor_stop_on_slope: 'Stop on slope',
      floor_constant_speed: 'Constant linear speed',
      floor_block_on_wall: 'Block on wall',
      floor_max_angle: 'Max floor angle (rad)',
      slide_on_ceiling: 'Slide on ceiling',
      wall_min_slide_angle: 'Min wall slide angle',
      up_direction: 'Up direction vector',
      platform_on_leave: 'Platform on leave',
      platform_floor_layers: 'Platform floor layers',
      platform_wall_layers: 'Platform wall layers',
      collision_layer: 'Collision layer',
      collision_mask: 'Collision mask',
      collision_priority: 'Collision priority',
      safe_margin: 'Safe margin',
      script: 'Attached script',
      velocity: 'Velocity override',
      'input/pickable': 'Input pickable',
      constant_linear_velocity: 'Constant linear velocity',
      constant_angular_velocity: 'Constant angular velocity',
    };

    for (const [key, val] of Object.entries(target.properties)) {
      const label = labels[key] ? `  # ${labels[key]}` : '';
      lines.push(`  ${key} = ${val}${label}`);
    }

    // Show child CollisionShape
    if (target.children) {
      const shapes = walk(target.children, ['CollisionShape2D', 'CollisionShape3D']);
      if (shapes.length > 0) {
        lines.push(`\n  Collision Shapes (${shapes.length}):`);
        shapes.forEach(s => lines.push(`    ${s.name} (${s.type})`));
      }
    }

    return { content: [{ type: 'text', text: lines.join('\n') }] };
  } catch (err: any) {
    return { content: [{ type: 'text', text: `Error: ${err.message}` }], isError: true };
  }
}

// ---- AnimatedSprite ----

export function handleReadAnimatedSprite(
  projectRoot: string,
  args: { scene_path?: string; name?: string }
): ToolResult {
  try {
    const types = ['AnimatedSprite2D', 'AnimatedSprite3D'];
    const sceneFiles = args.scene_path ? [args.scene_path] : findFilesByExtension(projectRoot, ['.tscn']);

    const sprites: { scene: string; name: string; type: string; anim: string; frame: string }[] = [];

    for (const relPath of sceneFiles) {
      const absPath = resolveProjectPath(projectRoot, relPath);
      const { content } = readTextFile(absPath);
      const doc = parseScene(content);

      for (const node of walk(doc.nodes, types)) {
        sprites.push({
          scene: relPath, name: node.name, type: node.type,
          anim: node.properties['animation'] || '(none)',
          frame: node.properties['frame'] || '0',
        });
      }
    }

    if (sprites.length === 0) return { content: [{ type: 'text', text: 'No AnimatedSprite nodes found.' }] };

    // If specific name, show details
    if (args.name) {
      const match = sprites.find(s => s.name === args.name);
      if (!match) return { content: [{ type: 'text', text: `AnimatedSprite "${args.name}" not found` }], isError: true };

      // Find the actual scene data
      for (const relPath of sceneFiles) {
        const absPath = resolveProjectPath(projectRoot, relPath);
        const { content } = readTextFile(absPath);
        const doc = parseScene(content);
        const node = walk(doc.nodes, types).find(n => n.name === args.name);
        if (node) {
          const lines: string[] = [`${node.type}: ${node.name}`];
          lines.push(`Scene: ${relPath}`);

          for (const [key, val] of Object.entries(node.properties)) {
            const label = key === 'sprite_frames' ? ' # SpriteFrames resource' :
              key === 'animation' ? ' # Current animation' :
              key === 'frame' ? ' # Current frame' :
              key === 'speed_scale' ? ' # Playback speed' :
              key === 'playing' ? ' # Is playing' :
              key === 'centered' ? ' # Centered' :
              key === 'flip_h' ? ' # Flip H' :
              key === 'flip_v' ? ' # Flip V' : '';
            lines.push(`  ${key} = ${val}${label}`);
          }
          return { content: [{ type: 'text', text: lines.join('\n') }] };
        }
      }
    }

    const byType: Record<string, typeof sprites> = {};
    for (const s of sprites) (byType[s.type] ||= []).push(s);

    const lines: string[] = [`Animated Sprites (${sprites.length}):`, ''];
    for (const [type, items] of Object.entries(byType).sort()) {
      lines.push(`  ${type} (${items.length}):`);
      items.forEach(s => lines.push(`    ${s.scene} → ${s.name}  anim="${s.anim}" frame=${s.frame}`));
    }

    return { content: [{ type: 'text', text: lines.join('\n') }] };
  } catch (err: any) {
    return { content: [{ type: 'text', text: `Error: ${err.message}` }], isError: true };
  }
}

// ---- Audio/Video Players ----

export function handleReadAudioPlayer(
  projectRoot: string,
  args: { scene_path?: string }
): ToolResult {
  try {
    const types = ['AudioStreamPlayer', 'AudioStreamPlayer2D', 'AudioStreamPlayer3D'];
    const sceneFiles = args.scene_path ? [args.scene_path] : findFilesByExtension(projectRoot, ['.tscn']);

    const players: { scene: string; name: string; type: string; stream: string; playing: string }[] = [];

    for (const relPath of sceneFiles) {
      const absPath = resolveProjectPath(projectRoot, relPath);
      const { content } = readTextFile(absPath);
      const doc = parseScene(content);

      for (const node of walk(doc.nodes, types)) {
        let stream = node.properties['stream'] || '(none)';
        if (stream.length > 60) stream = stream.slice(0, 60) + '...';
        players.push({
          scene: relPath, name: node.name, type: node.type,
          stream, playing: node.properties['playing'] || 'false',
        });
      }
    }

    if (players.length === 0) return { content: [{ type: 'text', text: 'No AudioStreamPlayer nodes found.' }] };

    const byType: Record<string, typeof players> = {};
    for (const p of players) (byType[p.type] ||= []).push(p);

    const lines: string[] = [`Audio Players (${players.length}):`, ''];
    for (const [type, items] of Object.entries(byType).sort()) {
      lines.push(`  ${type} (${items.length}):`);
      items.forEach(p => lines.push(`    ${p.scene} → ${p.name}  stream="${p.stream}"`));
    }

    return { content: [{ type: 'text', text: lines.join('\n') }] };
  } catch (err: any) {
    return { content: [{ type: 'text', text: `Error: ${err.message}` }], isError: true };
  }
}

export function handleReadVideoPlayer(
  projectRoot: string,
  args: { scene_path?: string }
): ToolResult {
  try {
    const sceneFiles = args.scene_path ? [args.scene_path] : findFilesByExtension(projectRoot, ['.tscn']);

    const players: { scene: string; name: string; stream: string; loop: string }[] = [];

    for (const relPath of sceneFiles) {
      const absPath = resolveProjectPath(projectRoot, relPath);
      const { content } = readTextFile(absPath);
      const doc = parseScene(content);

      for (const node of walk(doc.nodes, ['VideoStreamPlayer'])) {
        let stream = node.properties['stream'] || '(none)';
        if (stream.length > 60) stream = stream.slice(0, 60) + '...';
        players.push({ scene: relPath, name: node.name, stream, loop: node.properties['loop'] || 'false' });
      }
    }

    if (players.length === 0) return { content: [{ type: 'text', text: 'No VideoStreamPlayer nodes found.' }] };

    const lines: string[] = [`Video Players (${players.length}):`, ''];
    players.forEach(p => lines.push(`  ${p.scene} → ${p.name}  stream="${p.stream}"  loop=${p.loop}`));

    return { content: [{ type: 'text', text: lines.join('\n') }] };
  } catch (err: any) {
    return { content: [{ type: 'text', text: `Error: ${err.message}` }], isError: true };
  }
}

// ---- Parallax ----

export function handleReadParallax(
  projectRoot: string,
  args: { scene_path?: string }
): ToolResult {
  try {
    const sceneFiles = args.scene_path ? [args.scene_path] : findFilesByExtension(projectRoot, ['.tscn']);

    const bgs: { scene: string; name: string; layers: number }[] = [];

    for (const relPath of sceneFiles) {
      const absPath = resolveProjectPath(projectRoot, relPath);
      const { content } = readTextFile(absPath);
      const doc = parseScene(content);

      for (const node of walk(doc.nodes, ['ParallaxBackground'])) {
        let layers = 0;
        if (node.children) {
          layers = walk(node.children, ['ParallaxLayer']).length;
        }
        bgs.push({ scene: relPath, name: node.name, layers });

        if (args.scene_path && node.children) {
          const lines: string[] = [];
          lines.push(`ParallaxBackground: ${node.name} (${layers} layers)`);

          for (const [key, val] of Object.entries(node.properties)) {
            lines.push(`  ${key} = ${val}`);
          }
          lines.push('');

          const parallaxLayers = walk(node.children, ['ParallaxLayer']);
          parallaxLayers.forEach(l => {
            const scale = l.properties['motion_scale'] || '1, 1';
            const mirror = l.properties['motion_mirroring'] || '0, 0';
            lines.push(`  Layer: ${l.name}  scale=${scale}  mirror=${mirror}`);
          });
          return { content: [{ type: 'text', text: lines.join('\n') }] };
        }
      }
    }

    if (bgs.length === 0) return { content: [{ type: 'text', text: 'No ParallaxBackground nodes found.' }] };

    const lines: string[] = [`Parallax Backgrounds (${bgs.length}):`, ''];
    bgs.forEach(b => lines.push(`  ${b.scene} → ${b.name} (${b.layers} layers)`));

    return { content: [{ type: 'text', text: lines.join('\n') }] };
  } catch (err: any) {
    return { content: [{ type: 'text', text: `Error: ${err.message}` }], isError: true };
  }
}

// ---- RichText ----

export function handleReadRichText(
  projectRoot: string,
  args: { scene_path?: string; name?: string }
): ToolResult {
  try {
    const sceneFiles = args.scene_path ? [args.scene_path] : findFilesByExtension(projectRoot, ['.tscn']);

    const labels: { scene: string; name: string; bbcode: string; fit: string }[] = [];

    for (const relPath of sceneFiles) {
      const absPath = resolveProjectPath(projectRoot, relPath);
      const { content } = readTextFile(absPath);
      const doc = parseScene(content);

      for (const node of walk(doc.nodes, ['RichTextLabel'])) {
        let text = node.properties['text'] || node.properties['bbcode_text'] || '';
        if (text.length > 80) text = text.slice(0, 80) + '...';
        labels.push({ scene: relPath, name: node.name, bbcode: text, fit: node.properties['fit_content'] || 'false' });
      }
    }

    if (labels.length === 0) return { content: [{ type: 'text', text: 'No RichTextLabel nodes found.' }] };

    const lines: string[] = [`RichTextLabels (${labels.length}):`, ''];
    labels.forEach(l => lines.push(`  ${l.scene} → ${l.name}  fit=${l.fit}\n    "${l.bbcode}"`));

    return { content: [{ type: 'text', text: lines.join('\n') }] };
  } catch (err: any) {
    return { content: [{ type: 'text', text: `Error: ${err.message}` }], isError: true };
  }
}

// ---- Containers ----

const CONTAINER_TYPES = [
  'HBoxContainer', 'VBoxContainer', 'GridContainer', 'MarginContainer',
  'CenterContainer', 'PanelContainer', 'ScrollContainer', 'AspectRatioContainer',
  'SplitContainer', 'FlowContainer', 'HFlowContainer', 'VFlowContainer',
];

export function handleReadContainer(
  projectRoot: string,
  args: { scene_path: string; name?: string }
): ToolResult {
  try {
    const absPath = resolveProjectPath(projectRoot, args.scene_path);
    const { content } = readTextFile(absPath);
    const doc = parseScene(content);

    const containers = walk(doc.nodes, CONTAINER_TYPES);
    const target = args.name ? containers.find(c => c.name === args.name) : containers[0];

    if (!target) return { content: [{ type: 'text', text: 'No Container nodes found.' }] };

    const lines: string[] = [`Container: ${target.name} (${target.type})`];
    const childCount = target.children?.length || 0;
    lines.push(`Children: ${childCount}`);

    const labels: Record<string, string> = {
      alignment: 'Children alignment',
      separation: 'Spacing between children',
      'theme_override_constants/separation': 'Theme separation override',
      'split_offset': 'Split offset',
      'dragger_visibility': 'Dragger visibility',
      'collapsed': 'Collapsed',
      ratio: 'Aspect ratio',
      'stretch_mode': 'Stretch mode',
      'scroll_horizontal_enabled': 'Horizontal scroll',
      'scroll_vertical_enabled': 'Vertical scroll',
      'follow_focus': 'Follow focus',
      'horizontal_scroll_mode': 'H-scroll mode',
      'vertical_scroll_mode': 'V-scroll mode',
      'columns': 'Grid columns',
      'size_flags_horizontal': 'H-size flags',
      'size_flags_vertical': 'V-size flags',
      'size_flags_stretch_ratio': 'Stretch ratio',
    };

    for (const [key, val] of Object.entries(target.properties)) {
      const label = labels[key] ? `  # ${labels[key]}` : '';
      lines.push(`  ${key} = ${val}${label}`);
    }

    return { content: [{ type: 'text', text: lines.join('\n') }] };
  } catch (err: any) {
    return { content: [{ type: 'text', text: `Error: ${err.message}` }], isError: true };
  }
}

// ---- TabContainer ----

export function handleReadTabContainer(
  projectRoot: string,
  args: { scene_path: string; name?: string }
): ToolResult {
  try {
    const absPath = resolveProjectPath(projectRoot, args.scene_path);
    const { content } = readTextFile(absPath);
    const doc = parseScene(content);

    const tabs = walk(doc.nodes, ['TabContainer', 'TabBar']);
    const target = args.name ? tabs.find(t => t.name === args.name) : tabs[0];

    if (!target) return { content: [{ type: 'text', text: 'No TabContainer/TabBar found.' }] };

    const lines: string[] = [`${target.type}: ${target.name}`];
    lines.push(`Tabs: ${target.children?.length || 0}`);

    if (target.children) {
      target.children.forEach((c: any, i: number) => {
        lines.push(`  Tab ${i}: ${c.name} (${c.type})`);
      });
    }

    for (const [key, val] of Object.entries(target.properties)) {
      const label = key === 'current_tab' ? ' # Current tab index' :
        key === 'tab_alignment' ? ' # Tab alignment' :
        key === 'use_hidden_tabs_for_min_size' ? ' # Hidden tabs affect size' : '';
      lines.push(`  ${key} = ${val}${label}`);
    }

    return { content: [{ type: 'text', text: lines.join('\n') }] };
  } catch (err: any) {
    return { content: [{ type: 'text', text: `Error: ${err.message}` }], isError: true };
  }
}
