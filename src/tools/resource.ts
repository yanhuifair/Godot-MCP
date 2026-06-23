// ============================================================
// Godot MCP Server - Resource Tools
// ============================================================

import { z } from 'zod';
import { ToolResult, ResourceTemplateType } from '../utils/types.js';
import fs from 'node:fs';
import { readTextFile, findFilesByExtension, resolveProjectPath, writeTextFile } from '../utils/file_utils.js';
import { parseResource, isBinaryResource } from '../parsers/resource_parser.js';

// ---- Resource Templates ----

const RESOURCE_TEMPLATES: Record<string, string> = {
  // --- 3D Materials ---
  StandardMaterial3D: `[gd_resource type="StandardMaterial3D" format=3 uid=""]

[resource]
albedo_color = Color(1, 1, 1, 1)
metallic = 0.0
roughness = 0.5
`,
  ORMMaterial3D: `[gd_resource type="ORMMaterial3D" format=3 uid=""]

[resource]
albedo_color = Color(1, 1, 1, 1)
metallic = 0.0
roughness = 0.5
ao = 1.0
`,
  ShaderMaterial: `[gd_resource type="ShaderMaterial" format=3 uid=""]

[resource]
shader = SubResource("Shader_material")
`,

  // --- 2D Materials ---
  CanvasItemMaterial: `[gd_resource type="CanvasItemMaterial" format=3 uid=""]

[resource]
blend_mode = 0
light_mode = 0
`,

  // --- Sky Materials ---
  PhysicalSkyMaterial: `[gd_resource type="PhysicalSkyMaterial" format=3 uid=""]

[resource]
ground_color = Color(0.5, 0.5, 0.5, 1)
sun_disk_scale = 1.0
sun_brightness = 1.0
`,

  // --- Particle Materials ---
  ParticleProcessMaterial: `[gd_resource type="ParticleProcessMaterial" format=3 uid=""]

[resource]
emission_shape = 0
gravity = Vector3(0, -9.8, 0)
lifetime_randomness = 0.0
`,

  // --- Visual Shader ---
  VisualShader: `[gd_resource type="VisualShader" format=3 uid=""]

[resource]
graph_offset = Vector2(0, 0)
`,

  // --- Font & UI ---
  FontFile: `[gd_resource type="FontFile" format=3 uid=""]

[resource]
antialiasing = true
fixed_size = 16
`,
  StyleBoxFlat: `[gd_resource type="StyleBoxFlat" format=3 uid=""]

[resource]
bg_color = Color(0.2, 0.2, 0.2, 1)
border_width_left = 2
border_width_right = 2
border_width_top = 2
border_width_bottom = 2
`,

  // --- Navigation ---
  NavigationMesh: `[gd_resource type="NavigationMesh" format=3 uid=""]

[resource]
agent_radius = 0.5
agent_height = 2.0
cell_size = 0.25
`,

  // --- Miscellaneous ---
  Animation: `[gd_resource type="Animation" format=3 uid=""]

[resource]
length = 1.0
loop_mode = 0
`,
  Resource: `[gd_resource type="Resource" format=3 uid=""]

[resource]
`,
  Script: `[gd_resource type="Script" format=3 uid=""]

[resource]
script = SubResource("Script_resource")
`,
  Theme: `[gd_resource type="Theme" format=3 uid=""]

[resource]
`,
};

// ---- Tool Schemas ----

export const readResourceSchema = {
  path: z.string().min(1).describe('Path to .tres or .res file (relative to project root)'),
};

export const listResourcesSchema = {
  path: z.string().optional().default('').describe('Subdirectory to search (default: root)'),
  type_filter: z.string().optional().describe('Resource type filter (e.g. "Material", "Shader")'),
  recursive: z.boolean().optional().default(true).describe('Search recursively (default: true)'),
};

export const createResourceSchema = {
  path: z.string().min(1).describe('Output path for new resource (e.g. "materials/floor.tres")'),
  type: z.enum(['StandardMaterial3D', 'ORMMaterial3D', 'ShaderMaterial', 'CanvasItemMaterial', 'PhysicalSkyMaterial', 'ParticleProcessMaterial', 'VisualShader', 'FontFile', 'StyleBoxFlat', 'NavigationMesh', 'Animation', 'Theme', 'Script', 'Resource']).describe('Resource type template'),
  properties: z.record(z.string()).optional().describe('Optional custom properties to override template defaults'),
};

export const writeResourceSchema = {
  path: z.string().min(1).describe('Path to .tres file (relative to project root)'),
  properties: z.record(z.string()).describe('Properties to set/overwrite in the [resource] section'),
  create_backup: z.boolean().optional().default(true).describe('Create .bak backup (default: true)'),
};

// ---- Tool Handlers ----

export function handleReadResource(
  projectRoot: string,
  args: { path: string }
): ToolResult {
  try {
    const absPath = resolveProjectPath(projectRoot, args.path);

    // Detect binary .res file
    if (absPath.endsWith('.res')) {
      const buffer = fs.readFileSync(absPath);
      if (isBinaryResource(buffer)) {
        return {
          content: [{ type: 'text', text: `Cannot read "${args.path}": .res (binary) format is not supported. Only .tres (text) resources are readable.` }],
          isError: true,
        };
      }
    }

    const { content } = readTextFile(absPath);
    const doc = parseResource(content);

    // Format the result
    const lines: string[] = [];
    lines.push(`Type: ${doc.header.type}`);
    lines.push(`Format: ${doc.header.format}`);
    if (doc.header.uid) lines.push(`UID: ${doc.header.uid}`);
    if (doc.header.load_steps) lines.push(`Load steps: ${doc.header.load_steps}`);
    lines.push('');

    if (doc.extResources.length > 0) {
      lines.push(`External Resources (${doc.extResources.length}):`);
      for (const ext of doc.extResources) {
        lines.push(`  [${ext.id}] ${ext.type}: ${ext.path}`);
      }
      lines.push('');
    }

    if (doc.subResources.length > 0) {
      lines.push(`Sub-Resources (${doc.subResources.length}):`);
      for (const sub of doc.subResources) {
        lines.push(`  [${sub.id}] ${sub.type}`);
        for (const [key, val] of Object.entries(sub.properties)) {
          lines.push(`    ${key} = ${val}`);
        }
      }
      lines.push('');
    }

    lines.push('Properties:');
    for (const [key, val] of Object.entries(doc.resource)) {
      lines.push(`  ${key} = ${val}`);
    }

    return {
      content: [{ type: 'text', text: lines.join('\n') }],
    };
  } catch (err: any) {
    return {
      content: [{ type: 'text', text: `Error reading resource: ${err.message}` }],
      isError: true,
    };
  }
}

export function handleListResources(
  projectRoot: string,
  args: { path?: string; type_filter?: string; recursive?: boolean }
): ToolResult {
  try {
    const resources = findFilesByExtension(projectRoot, ['.tres', '.res'], args.path, args.recursive);

    if (resources.length === 0) {
      return {
        content: [{ type: 'text', text: 'No resource files found.' }],
      };
    }

    // If type_filter is provided, filter by resource type
    if (args.type_filter) {
      const filtered: string[] = [];
      for (const res of resources) {
        if (res.endsWith('.res')) continue; // skip binary
        try {
          const absPath = resolveProjectPath(projectRoot, res);
          const { content } = readTextFile(absPath);
          const doc = parseResource(content);
          if (doc.header.type.toLowerCase() === args.type_filter!.toLowerCase()) {
            filtered.push(res);
          }
        } catch {
          // skip unreadable
        }
      }

      if (filtered.length === 0) {
        return {
          content: [{ type: 'text', text: `No resources of type "${args.type_filter}" found.` }],
        };
      }

      return {
        content: [{ type: 'text', text: `Resources (type: ${args.type_filter}):\n${filtered.join('\n')}` }],
      };
    }

    // Group by type
    const tres = resources.filter(r => r.endsWith('.tres'));
    const res = resources.filter(r => r.endsWith('.res'));

    const lines: string[] = [];
    if (tres.length > 0) {
      lines.push(`Text resources (.tres ${tres.length}):`);
      lines.push(...tres.map(r => `  ${r}`));
    }
    if (res.length > 0) {
      if (lines.length > 0) lines.push('');
      lines.push(`Binary resources (.res ${res.length} - read only via Godot editor):`);
      lines.push(...res.map(r => `  ${r}`));
    }

    return {
      content: [{ type: 'text', text: lines.join('\n') }],
    };
  } catch (err: any) {
    return {
      content: [{ type: 'text', text: `Error listing resources: ${err.message}` }],
      isError: true,
    };
  }
}

export function handleCreateResource(
  projectRoot: string,
  args: { path: string; type: ResourceTemplateType; properties?: Record<string, string> }
): ToolResult {
  try {
    const template = RESOURCE_TEMPLATES[args.type];
    if (!template) {
      return {
        content: [{ type: 'text', text: `Unknown resource type: ${args.type}. Available: ${Object.keys(RESOURCE_TEMPLATES).join(', ')}` }],
        isError: true,
      };
    }

    let content = template;
    if (args.properties) {
      // Append custom properties to the [resource] section
      content += '\n' + Object.entries(args.properties)
        .map(([k, v]) => `${k} = ${v}`)
        .join('\n');
    }

    const absPath = resolveProjectPath(projectRoot, args.path);
    writeTextFile(absPath, content);
    return {
      content: [{ type: 'text', text: `Resource created: ${args.path} (type: ${args.type})` }],
    };
  } catch (err: any) {
    return {
      content: [{ type: 'text', text: `Error creating resource: ${err.message}` }],
      isError: true,
    };
  }
}

export function handleWriteResource(
  projectRoot: string,
  args: { path: string; properties: Record<string, string>; create_backup?: boolean }
): ToolResult {
  try {
    const absPath = resolveProjectPath(projectRoot, args.path);

    // Read existing resource
    const { content } = readTextFile(absPath);
    const doc = parseResource(content);

    // Merge new properties
    Object.assign(doc.resource, args.properties);

    // Rebuild .tres text
    let newContent = `[gd_resource type="${doc.header.type}" format=${doc.header.format}`;
    if (doc.header.uid) newContent += ` uid="${doc.header.uid}"`;
    if (doc.header.load_steps) newContent += ` load_steps=${doc.header.load_steps}`;
    newContent += ']\n\n[resource]\n';

    for (const [key, val] of Object.entries(doc.resource)) {
      newContent += `${key} = ${val}\n`;
    }

    writeTextFile(absPath, newContent, args.create_backup !== false);
    return {
      content: [{ type: 'text', text: `Resource updated: ${args.path} (${Object.keys(args.properties).length} properties changed)` }],
    };
  } catch (err: any) {
    return {
      content: [{ type: 'text', text: `Error writing resource: ${err.message}` }],
      isError: true,
    };
  }
}

// ---- Material-Specific Tools ----

const MATERIAL_TYPES = [
  'StandardMaterial3D', 'ORMMaterial3D', 'ShaderMaterial',
  'CanvasItemMaterial', 'PhysicalSkyMaterial', 'ParticleProcessMaterial',
];

const PBR_PROPERTIES: Record<string, string> = {
  albedo_color: 'Albedo (base color)',
  metallic: 'Metallic (0=dielectric, 1=metal)',
  roughness: 'Roughness (0=mirror, 1=matte)',
  metallic_texture: 'Metallic texture channel',
  roughness_texture: 'Roughness texture channel',
  albedo_texture: 'Albedo texture',
  normal_texture: 'Normal map texture',
  ao_texture: 'Ambient occlusion texture',
  emission: 'Emission energy',
  emission_texture: 'Emission texture',
  ao: 'Ambient occlusion',
  anisotropy: 'Anisotropy',
  clearcoat: 'Clearcoat',
  specular: 'Specular',
  subsurf_scatter: 'Subsurface scattering',
  transparency: 'Transparency mode',
};

export const listMaterialsSchema = {
  path: z.string().optional().default('').describe('Subdirectory to search (default: root)'),
  type_filter: z.string().optional().describe('Filter by material type (e.g. "StandardMaterial3D")'),
  recursive: z.boolean().optional().default(true).describe('Search recursively (default: true)'),
};

export const readMaterialSchema = {
  path: z.string().min(1).describe('Path to .tres material file (relative to project root)'),
};

export const setMaterialParamSchema = {
  path: z.string().min(1).describe('Path to .tres material file'),
  param: z.string().min(1).describe('Parameter name (e.g. "metallic", "roughness", "albedo_color")'),
  value: z.string().describe('Parameter value (e.g. "0.5", "Color(1,0,0,1)")'),
};

export const readThemeSchema = {
  path: z.string().min(1).describe('Path to Theme .tres or .theme file'),
};

export function handleListMaterials(
  projectRoot: string,
  args: { path?: string; type_filter?: string; recursive?: boolean }
): ToolResult {
  try {
    const resources = findFilesByExtension(projectRoot, ['.tres', '.res'], args.path, args.recursive);
    const materials: { path: string; type: string }[] = [];

    for (const res of resources) {
      if (res.endsWith('.res')) continue;
      try {
        const absPath = resolveProjectPath(projectRoot, res);
        const { content } = readTextFile(absPath);
        const doc = parseResource(content);
        if (MATERIAL_TYPES.some(t => doc.header.type === t)) {
          if (!args.type_filter || doc.header.type === args.type_filter) {
            materials.push({ path: res, type: doc.header.type });
          }
        }
      } catch { /* skip */ }
    }

    if (materials.length === 0) {
      return { content: [{ type: 'text', text: 'No material resources found.' }] };
    }

    const byType: Record<string, string[]> = {};
    for (const m of materials) {
      (byType[m.type] ||= []).push(m.path);
    }

    const lines: string[] = [`Materials (${materials.length}):`, ''];
    for (const [type, paths] of Object.entries(byType).sort()) {
      lines.push(`  ${type} (${paths.length}):`);
      paths.sort().forEach(p => lines.push(`    ${p}`));
    }

    return { content: [{ type: 'text', text: lines.join('\n') }] };
  } catch (err: any) {
    return { content: [{ type: 'text', text: `Error listing materials: ${err.message}` }], isError: true };
  }
}

export function handleReadMaterial(
  projectRoot: string,
  args: { path: string }
): ToolResult {
  try {
    const absPath = resolveProjectPath(projectRoot, args.path);
    const { content } = readTextFile(absPath);
    const doc = parseResource(content);

    const lines: string[] = [];
    lines.push(`Material: ${doc.header.type}`);
    lines.push(`File: ${args.path}`);
    lines.push('');

    const textures: string[] = [];
    const pbr: string[] = [];
    const other: string[] = [];

    for (const [key, val] of Object.entries(doc.resource)) {
      if (key.endsWith('_texture') || key.endsWith('_channel')) {
        textures.push(`  ${key} = ${val}`);
      } else if (PBR_PROPERTIES[key] || key === 'metallic' || key === 'roughness' || key === 'albedo_color' || key === 'emission' || key === 'ao') {
        const label = PBR_PROPERTIES[key];
        pbr.push(`  ${key} = ${val}${label ? `  (${label})` : ''}`);
      } else {
        other.push(`  ${key} = ${val}`);
      }
    }

    if (pbr.length > 0) {
      lines.push('PBR Properties:');
      lines.push(...pbr);
      lines.push('');
    }
    if (textures.length > 0) {
      lines.push('Textures:');
      lines.push(...textures);
      lines.push('');
    }
    if (other.length > 0) {
      lines.push('Other:');
      lines.push(...other);
    }

    return { content: [{ type: 'text', text: lines.join('\n') }] };
  } catch (err: any) {
    return { content: [{ type: 'text', text: `Error reading material: ${err.message}` }], isError: true };
  }
}

export function handleSetMaterialParam(
  projectRoot: string,
  args: { path: string; param: string; value: string }
): ToolResult {
  return handleWriteResource(projectRoot, { path: args.path, properties: { [args.param]: args.value } });
}

// ---- Theme Reader ----

export function handleReadTheme(
  projectRoot: string,
  args: { path: string }
): ToolResult {
  try {
    const absPath = resolveProjectPath(projectRoot, args.path);
    const { content } = readTextFile(absPath);
    const doc = parseResource(content);

    const lines: string[] = [];
    lines.push(`Theme: ${doc.header.type}`);
    lines.push(`File: ${args.path}`);
    lines.push('');

    const colors: string[] = [];
    const fonts: string[] = [];
    const styleboxes: string[] = [];
    const constants: string[] = [];
    const other: string[] = [];

    for (const [key, val] of Object.entries(doc.resource)) {
      if (key.endsWith('_color') || key.endsWith('_colors')) {
        colors.push(`  ${key} = ${val}`);
      } else if (key.endsWith('_font') || key.endsWith('_fonts')) {
        fonts.push(`  ${key} = ${val}`);
      } else if (key.endsWith('_stylebox') || key.includes('StyleBox')) {
        styleboxes.push(`  ${key} = ${val}`);
      } else if (key.includes('constant') || key.includes('separation') || key.includes('margin')) {
        constants.push(`  ${key} = ${val}`);
      } else {
        other.push(`  ${key} = ${val}`);
      }
    }

    if (colors.length > 0) {
      lines.push(`Colors (${colors.length}):`);
      lines.push(...colors);
      lines.push('');
    }
    if (fonts.length > 0) {
      lines.push(`Fonts (${fonts.length}):`);
      lines.push(...fonts);
      lines.push('');
    }
    if (styleboxes.length > 0) {
      lines.push(`StyleBoxes (${styleboxes.length}):`);
      lines.push(...styleboxes);
      lines.push('');
    }
    if (constants.length > 0) {
      lines.push(`Constants (${constants.length}):`);
      lines.push(...constants);
      lines.push('');
    }
    if (other.length > 0) {
      lines.push('Other:');
      lines.push(...other);
    }

    return { content: [{ type: 'text', text: lines.join('\n') }] };
  } catch (err: any) {
    return { content: [{ type: 'text', text: `Error: ${err.message}` }], isError: true };
  }
}
