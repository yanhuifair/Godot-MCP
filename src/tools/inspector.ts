// ============================================================
// Godot MCP Server - Node Inspector Tools
// ============================================================
//
// Specialized readers for Camera, Light, Particle nodes across scenes.

import { z } from 'zod';
import { ToolResult } from '../utils/types.js';
import { resolveProjectPath, findFilesByExtension, readTextFile, writeTextFile } from '../utils/file_utils.js';
import { parseScene, serializeScene } from '../parsers/scene_parser.js';

// ---- Tool Schemas ----

export const listCamerasSchema = {
  scene_path: z.string().optional().describe('Filter to a specific scene (default: all scenes)'),
};

export const readCameraSchema = {
  scene_path: z.string().describe('Path to .tscn scene file'),
  camera_name: z.string().optional().describe('Specific camera node name (default: first found)'),
};

export const listLightsSchema = {
  scene_path: z.string().optional().describe('Filter to a specific scene'),
  light_type: z.string().optional().describe('Filter by light type: OmniLight3D, SpotLight3D, DirectionalLight3D, PointLight2D'),
};

export const setLightParamSchema = {
  scene_path: z.string().describe('Path to .tscn scene file'),
  light_name: z.string().describe('Name of the light node'),
  param: z.string().describe('Light parameter (e.g. "energy", "color", "shadow_enabled")'),
  value: z.string().describe('New value'),
};

export const readParticlesSchema = {
  scene_path: z.string().optional().describe('Filter to a specific scene'),
  particle_type: z.string().optional().describe('Filter: GPUParticles3D, CPUParticles3D, GPUParticles2D'),
};

// ---- Lighting helpers ----

const LIGHT_TYPES_3D = ['OmniLight3D', 'SpotLight3D', 'DirectionalLight3D'];
const LIGHT_TYPES_2D = ['PointLight2D', 'DirectionalLight2D'];

const LIGHT_PARAM_LABELS: Record<string, string> = {
  light_color: 'Light color',
  light_energy: 'Light energy (brightness)',
  light_indirect_energy: 'Indirect light energy',
  light_negative: 'Negative light',
  light_specular: 'Affects specular',
  shadow_enabled: 'Casts shadows',
  shadow_bias: 'Shadow bias',
  shadow_normal_bias: 'Shadow normal bias',
  shadow_opacity: 'Shadow opacity',
  shadow_blur: 'Shadow blur',
  spot_range: 'Spot range',
  spot_attenuation: 'Spot attenuation',
  spot_angle: 'Spot angle',
  omni_range: 'Range',
  omni_attenuation: 'Attenuation',
  directional_shadow_mode: 'Shadow mode',
  directional_shadow_split_1: 'Shadow split 1',
  directional_shadow_split_2: 'Shadow split 2',
  directional_shadow_split_3: 'Shadow split 3',
  texture: 'Light texture (cookies)',
  texture_scale: 'Texture scale',
  editor_only: 'Editor only',
  energy: 'Energy',
  color: 'Color',
  range_z_min: 'Min Z range',
  range_z_max: 'Max Z range',
  range_height: 'Range height',
};

const PARTICLE_TYPES = ['GPUParticles3D', 'CPUParticles3D', 'GPUParticles2D', 'CPUParticles2D'];

// ---- Helpers ----

function walkAllNodes(nodes: any[]): any[] {
  const result: any[] = [];
  for (const node of nodes) {
    result.push(node);
    if (node.children) result.push(...walkAllNodes(node.children));
  }
  return result;
}

// ---- Tool Handlers ----

export function handleListCameras(
  projectRoot: string,
  args: { scene_path?: string }
): ToolResult {
  try {
    const sceneFiles = args.scene_path
      ? [args.scene_path]
      : findFilesByExtension(projectRoot, ['.tscn']);

    const cameras: { scene: string; name: string; type: string; current: boolean }[] = [];

    for (const relPath of sceneFiles) {
      const absPath = resolveProjectPath(projectRoot, relPath);
      const { content } = readTextFile(absPath);
      const doc = parseScene(content);

      for (const node of walkAllNodes(doc.nodes)) {
        if (node.type === 'Camera3D' || node.type === 'Camera2D') {
          cameras.push({
            scene: relPath,
            name: node.name,
            type: node.type,
            current: node.properties['current'] === 'true',
          });
        }
      }
    }

    if (cameras.length === 0) {
      return { content: [{ type: 'text', text: 'No Camera nodes found.' }] };
    }

    const byType: Record<string, typeof cameras> = {};
    for (const c of cameras) {
      (byType[c.type] ||= []).push(c);
    }

    const lines: string[] = [`Cameras (${cameras.length}):`, ''];
    for (const [type, cams] of Object.entries(byType).sort()) {
      lines.push(`  ${type} (${cams.length}):`);
      cams.forEach(c => {
        const active = c.current ? ' [active]' : '';
        lines.push(`    ${c.scene} → ${c.name}${active}`);
      });
    }

    return { content: [{ type: 'text', text: lines.join('\n') }] };
  } catch (err: any) {
    return { content: [{ type: 'text', text: `Error: ${err.message}` }], isError: true };
  }
}

export function handleReadCamera(
  projectRoot: string,
  args: { scene_path: string; camera_name?: string }
): ToolResult {
  try {
    const absPath = resolveProjectPath(projectRoot, args.scene_path);
    const { content } = readTextFile(absPath);
    const doc = parseScene(content);

    const allCameras = walkAllNodes(doc.nodes).filter(
      n => n.type === 'Camera3D' || n.type === 'Camera2D'
    );

    let camera;
    if (args.camera_name) {
      camera = allCameras.find(c => c.name === args.camera_name);
      if (!camera) {
        return { content: [{ type: 'text', text: `Camera "${args.camera_name}" not found in ${args.scene_path}` }], isError: true };
      }
    } else {
      camera = allCameras[0];
      if (!camera) {
        return { content: [{ type: 'text', text: `No Camera nodes found in ${args.scene_path}` }] };
      }
    }

    const labels: Record<string, string> = {
      fov: 'Field of view (degrees)',
      near: 'Near clip plane',
      far: 'Far clip plane',
      current: 'Active camera',
      size: 'Camera size (2D)',
      projection: 'Projection (0=perspective, 1=orthogonal)',
      cull_mask: 'Cull mask',
      h_offset: 'Horizontal offset',
      v_offset: 'Vertical offset',
      doppler_tracking: 'Doppler tracking',
      environment: 'Environment override',
      attributes: 'Camera attributes',
    };

    const lines: string[] = [];
    lines.push(`Camera: ${camera.name} (${camera.type})`);
    lines.push(`Scene: ${args.scene_path}`);
    lines.push('');

    const is3D = camera.type === 'Camera3D';
    lines.push(is3D ? '3D Camera Properties:' : '2D Camera Properties:');

    for (const [key, val] of Object.entries(camera.properties)) {
      const label = labels[key] ? `  # ${labels[key]}` : '';
      lines.push(`  ${key} = ${val}${label}`);
    }

    return { content: [{ type: 'text', text: lines.join('\n') }] };
  } catch (err: any) {
    return { content: [{ type: 'text', text: `Error: ${err.message}` }], isError: true };
  }
}

export function handleListLights(
  projectRoot: string,
  args: { scene_path?: string; light_type?: string }
): ToolResult {
  try {
    const sceneFiles = args.scene_path
      ? [args.scene_path]
      : findFilesByExtension(projectRoot, ['.tscn']);

    const allLightTypes = [...LIGHT_TYPES_3D, ...LIGHT_TYPES_2D];
    const targetTypes = args.light_type
      ? [args.light_type]
      : allLightTypes;

    const lights: { scene: string; name: string; type: string; energy: string }[] = [];

    for (const relPath of sceneFiles) {
      const absPath = resolveProjectPath(projectRoot, relPath);
      const { content } = readTextFile(absPath);
      const doc = parseScene(content);

      for (const node of walkAllNodes(doc.nodes)) {
        if (targetTypes.includes(node.type)) {
          lights.push({
            scene: relPath,
            name: node.name,
            type: node.type,
            energy: node.properties['light_energy'] || node.properties['energy'] || '?',
          });
        }
      }
    }

    if (lights.length === 0) {
      return { content: [{ type: 'text', text: 'No light nodes found.' }] };
    }

    const byType: Record<string, typeof lights> = {};
    for (const l of lights) {
      (byType[l.type] ||= []).push(l);
    }

    const lines: string[] = [`Lights (${lights.length}):`, ''];
    for (const [type, items] of Object.entries(byType).sort()) {
      lines.push(`  ${type} (${items.length}):`);
      items.forEach(l => lines.push(`    ${l.scene} → ${l.name}  energy=${l.energy}`));
    }

    return { content: [{ type: 'text', text: lines.join('\n') }] };
  } catch (err: any) {
    return { content: [{ type: 'text', text: `Error: ${err.message}` }], isError: true };
  }
}

export function handleSetLightParam(
  projectRoot: string,
  args: { scene_path: string; light_name: string; param: string; value: string }
): ToolResult {
  try {
    const absPath = resolveProjectPath(projectRoot, args.scene_path);
    const { content } = readTextFile(absPath);
    const doc = parseScene(content);

    const allLights = walkAllNodes(doc.nodes).filter(
      n => [...LIGHT_TYPES_3D, ...LIGHT_TYPES_2D].includes(n.type)
    );
    const light = allLights.find(l => l.name === args.light_name);

    if (!light) {
      return { content: [{ type: 'text', text: `Light "${args.light_name}" not found in ${args.scene_path}` }], isError: true };
    }

    light.properties[args.param] = args.value;

    const newContent = serializeScene(doc);
    writeTextFile(absPath, newContent, true);

    return { content: [{ type: 'text', text: `Light "${args.light_name}" updated: ${args.param} = ${args.value}` }] };
  } catch (err: any) {
    return { content: [{ type: 'text', text: `Error: ${err.message}` }], isError: true };
  }
}

export function handleReadParticles(
  projectRoot: string,
  args: { scene_path?: string; particle_type?: string }
): ToolResult {
  try {
    const sceneFiles = args.scene_path
      ? [args.scene_path]
      : findFilesByExtension(projectRoot, ['.tscn']);

    const targetTypes = args.particle_type
      ? [args.particle_type]
      : PARTICLE_TYPES;

    const particles: { scene: string; name: string; type: string; amount: string; lifetime: string }[] = [];

    for (const relPath of sceneFiles) {
      const absPath = resolveProjectPath(projectRoot, relPath);
      const { content } = readTextFile(absPath);
      const doc = parseScene(content);

      for (const node of walkAllNodes(doc.nodes)) {
        if (targetTypes.includes(node.type)) {
          particles.push({
            scene: relPath,
            name: node.name,
            type: node.type,
            amount: node.properties['amount'] || '?',
            lifetime: node.properties['lifetime'] || '?',
          });
        }
      }
    }

    if (particles.length === 0) {
      return { content: [{ type: 'text', text: 'No particle nodes found.' }] };
    }

    const byType: Record<string, typeof particles> = {};
    for (const p of particles) {
      (byType[p.type] ||= []).push(p);
    }

    const lines: string[] = [`Particle Systems (${particles.length}):`, ''];
    for (const [type, items] of Object.entries(byType).sort()) {
      lines.push(`  ${type} (${items.length}):`);
      items.forEach(p => lines.push(`    ${p.scene} → ${p.name}  amount=${p.amount}  lifetime=${p.lifetime}s`));
    }

    return { content: [{ type: 'text', text: lines.join('\n') }] };
  } catch (err: any) {
    return { content: [{ type: 'text', text: `Error: ${err.message}` }], isError: true };
  }
}
