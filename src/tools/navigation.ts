// ============================================================
// Godot MCP Server - Navigation Tools
// ============================================================
//
// NavigationRegion2D/3D nodes and NavigationMesh/2D resources.

import { z } from 'zod';
import { ToolResult } from '../utils/types.js';
import { readTextFile, resolveProjectPath, findFilesByExtension, writeTextFile } from '../utils/file_utils.js';
import { parseResource } from '../parsers/resource_parser.js';
import { parseScene } from '../parsers/scene_parser.js';

// ---- Tool Schemas ----

export const listNavRegionsSchema = {
  scene_path: z.string().optional().describe('Filter to a specific scene'),
};

export const readNavRegionSchema = {
  scene_path: z.string().describe('Path to .tscn scene'),
  region_name: z.string().optional().describe('Specific NavigationRegion node name'),
};

export const createNavMeshSchema = {
  path: z.string().describe('Output path for NavigationMesh .tres'),
  agent_radius: z.number().optional().default(0.5).describe('Agent radius'),
  agent_height: z.number().optional().default(2.0).describe('Agent height'),
  cell_size: z.number().optional().default(0.25).describe('Voxel cell size'),
  cell_height: z.number().optional().default(0.25).describe('Voxel cell height'),
};

// ---- Tool Handlers ----

export function handleListNavRegions(
  projectRoot: string,
  args: { scene_path?: string }
): ToolResult {
  try {
    const sceneFiles = args.scene_path
      ? [args.scene_path]
      : findFilesByExtension(projectRoot, ['.tscn']);

    const regions: { scene: string; name: string; type: string; baked: boolean }[] = [];
    const navMeshRefs: { scene: string; name: string; meshPath: string }[] = [];

    for (const relPath of sceneFiles) {
      const absPath = resolveProjectPath(projectRoot, relPath);
      const { content } = readTextFile(absPath);
      const doc = parseScene(content);

      function walk(nodes: any[]): void {
        for (const node of nodes) {
          if (node.type === 'NavigationRegion3D' || node.type === 'NavigationRegion2D') {
            const baked = node.properties['bake_navigation_mesh'] === 'true' ||
                          node.properties['navigation_mesh'] !== undefined;
            regions.push({ scene: relPath, name: node.name, type: node.type, baked });

            // Check for NavigationMesh reference
            if (node.properties['navigation_mesh']) {
              navMeshRefs.push({
                scene: relPath,
                name: node.name,
                meshPath: node.properties['navigation_mesh'],
              });
            }
          }
          if (node.children) walk(node.children);
        }
      }
      walk(doc.nodes);
    }

    if (regions.length === 0) {
      return { content: [{ type: 'text', text: 'No NavigationRegion nodes found.' }] };
    }

    const lines: string[] = [`Navigation Regions (${regions.length}):`, ''];
    regions.forEach(r => {
      const bakedLabel = r.baked ? ' [baked]' : ' [no mesh]';
      lines.push(`  ${r.scene} → ${r.name} (${r.type})${bakedLabel}`);
    });

    if (navMeshRefs.length > 0) {
      lines.push('');
      lines.push('Navigation Mesh References:');
      navMeshRefs.forEach(m => {
        lines.push(`  ${m.scene}/${m.name} → ${m.meshPath}`);
      });
    }

    return { content: [{ type: 'text', text: lines.join('\n') }] };
  } catch (err: any) {
    return { content: [{ type: 'text', text: `Error: ${err.message}` }], isError: true };
  }
}

export function handleReadNavRegion(
  projectRoot: string,
  args: { scene_path: string; region_name?: string }
): ToolResult {
  try {
    const absPath = resolveProjectPath(projectRoot, args.scene_path);
    const { content } = readTextFile(absPath);
    const doc = parseScene(content);

    const regions: any[] = [];
    function walk(nodes: any[]): void {
      for (const node of nodes) {
        if (node.type === 'NavigationRegion3D' || node.type === 'NavigationRegion2D') {
          regions.push(node);
        }
        if (node.children) walk(node.children);
      }
    }
    walk(doc.nodes);

    const region = args.region_name
      ? regions.find(r => r.name === args.region_name)
      : regions[0];

    if (!region) {
      return { content: [{ type: 'text', text: `Navigation region not found in ${args.scene_path}` }], isError: true };
    }

    const lines: string[] = [];
    lines.push(`Navigation Region: ${region.name} (${region.type})`);
    lines.push(`Scene: ${args.scene_path}`);
    lines.push('');

    const is3D = region.type === 'NavigationRegion3D';

    lines.push('Properties:');
    const labels: Record<string, string> = {
      navigation_layers: 'Navigation layers bitmask',
      bake_navigation_mesh: 'Auto-bake',
      navigation_mesh: is3D ? 'NavigationMesh resource' : 'NavigationPolygon resource',
      enabled: 'Enabled',
      avoidance_enabled: 'Avoidance enabled',
      avoidance_layers: 'Avoidance layers',
    };

    for (const [key, val] of Object.entries(region.properties)) {
      const label = labels[key] ? `  # ${labels[key]}` : '';
      lines.push(`  ${key} = ${val}${label}`);
    }

    // If there's a navigation_mesh ext_resource, try to read it
    const meshRef = region.properties['navigation_mesh'];
    if (meshRef) {
      const extMatch = meshRef.match(/ExtResource\("([^"]+)"\)/);
      if (extMatch) {
        const extResource = doc.extResources.find(e => e.id === extMatch[1]);
        if (extResource) {
          lines.push('');
          lines.push(`Mesh Resource: ${extResource.path}`);
          lines.push(`  Type: ${extResource.type}`);
        }
      }
    }

    return { content: [{ type: 'text', text: lines.join('\n') }] };
  } catch (err: any) {
    return { content: [{ type: 'text', text: `Error: ${err.message}` }], isError: true };
  }
}

export function handleCreateNavMesh(
  projectRoot: string,
  args: { path: string; agent_radius?: number; agent_height?: number; cell_size?: number; cell_height?: number }
): ToolResult {
  try {
    const template = `[gd_resource type="NavigationMesh" format=3 uid=""]

[resource]
agent_radius = ${args.agent_radius ?? 0.5}
agent_height = ${args.agent_height ?? 2.0}
cell_size = ${args.cell_size ?? 0.25}
cell_height = ${args.cell_height ?? 0.25}
`;

    const absPath = resolveProjectPath(projectRoot, args.path);
    writeTextFile(absPath, template, false);

    return {
      content: [{ type: 'text', text: `NavigationMesh created: ${args.path}\n  agent_radius=${args.agent_radius ?? 0.5} agent_height=${args.agent_height ?? 2.0}` }],
    };
  } catch (err: any) {
    return { content: [{ type: 'text', text: `Error: ${err.message}` }], isError: true };
  }
}
