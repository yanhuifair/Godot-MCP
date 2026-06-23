// ============================================================
// Godot MCP Server - UID Management Tools (Godot 4.4+)
// ============================================================

import { z } from 'zod';
import { ToolResult } from '../utils/types.js';
import fs from 'node:fs';
import { readTextFile, findFilesByExtension, resolveProjectPath, writeTextFile } from '../utils/file_utils.js';

// ---- Tool Schemas ----

export const getUidSchema = {
  path: z.string().describe('Path to file (relative to project root)'),
};

export const updateProjectUidsSchema = {
  check_only: z.boolean().optional().default(false).describe('Only report missing UIDs, do not fix them'),
};

export const listMissingUidsSchema = {};

// ---- Tool Handlers ----

export function handleGetUid(
  projectRoot: string,
  args: { path: string }
): ToolResult {
  try {
    const absPath = resolveProjectPath(projectRoot, args.path);
    if (!fs.existsSync(absPath)) {
      return { content: [{ type: 'text', text: `File not found: ${args.path}` }], isError: true };
    }

    const ext = args.path.split('.').pop()?.toLowerCase();

    // For .tscn files — extract uid from header
    if (ext === 'tscn') {
      const { content } = readTextFile(absPath);
      const uidMatch = content.match(/\[gd_scene[^\]]*uid="([^"]+)"/);
      if (uidMatch) {
        return { content: [{ type: 'text', text: `UID: ${uidMatch[1]}\nFile: ${args.path}\nType: Scene` }] };
      }
      return { content: [{ type: 'text', text: `No UID found in ${args.path}. The file may not have been saved in Godot 4.4+ yet.` }] };
    }

    // For .tres resources
    if (ext === 'tres') {
      const { content } = readTextFile(absPath);
      const uidMatch = content.match(/\[gd_resource[^\]]*uid="([^"]+)"/);
      if (uidMatch) {
        return { content: [{ type: 'text', text: `UID: ${uidMatch[1]}\nFile: ${args.path}\nType: Resource` }] };
      }
      return { content: [{ type: 'text', text: `No UID found in ${args.path}.` }] };
    }

    // For .gd scripts — check if uid="uid://..." is in first few lines
    if (ext === 'gd') {
      const { content } = readTextFile(absPath);
      const uidMatch = content.match(/uid="([^"]+)"/);
      if (uidMatch) {
        return { content: [{ type: 'text', text: `UID: ${uidMatch[1]}\nFile: ${args.path}\nType: Script` }] };
      }
    }

    // For other files — check .godot/uid_cache.bin (binary, limited)
    return { content: [{ type: 'text', text: `UID lookup not supported for file type: .${ext}. Only .tscn, .tres, and .gd files store UIDs inline.` }] };
  } catch (err: any) {
    return { content: [{ type: 'text', text: `Error: ${err.message}` }], isError: true };
  }
}

export function handleUpdateProjectUids(
  projectRoot: string,
  args: { check_only?: boolean }
): ToolResult {
  try {
    // Scan all .tscn and .tres files for empty UIDs
    const sceneFiles = findFilesByExtension(projectRoot, ['.tscn']);
    const tresFiles = findFilesByExtension(projectRoot, ['.tres']);

    const missingUids: { file: string; type: string }[] = [];
    const fixedFiles: string[] = [];

    for (const file of [...sceneFiles, ...tresFiles]) {
      try {
        const absPath = resolveProjectPath(projectRoot, file);
        const { content } = readTextFile(absPath);

        let hasUid = false;
        let type = 'unknown';

        if (file.endsWith('.tscn')) {
          type = 'Scene';
          hasUid = /\[gd_scene[^\]]*uid="uid:/i.test(content);
        } else if (file.endsWith('.tres')) {
          type = 'Resource';
          hasUid = /\[gd_resource[^\]]*uid="uid:/i.test(content);
        }

        if (!hasUid) {
          missingUids.push({ file, type });
        } else if (!args.check_only) {
          fixedFiles.push(file);
        }
      } catch { /* skip */ }
    }

    const lines: string[] = [];

    if (args.check_only) {
      if (missingUids.length === 0) {
        lines.push(`All ${sceneFiles.length + tresFiles.length} files have UIDs.`);
      } else {
        lines.push(`Missing UIDs: ${missingUids.length} files`);
        lines.push('');
        for (const m of missingUids) {
          lines.push(`  ${m.type}: ${m.file}`);
        }
        lines.push('');
        lines.push('To fix: open the project in Godot 4.4+ and run Project → Tools → Update UIDs,');
        lines.push('or save each scene individually. File-based UID generation is not possible');
        lines.push('(UIDs must be cryptographically unique and registered in uid_cache.bin).');
      }
    } else {
      lines.push(`UID Check Complete: ${sceneFiles.length + tresFiles.length} files scanned`);
      lines.push(`  With UIDs: ${fixedFiles.length}`);
      lines.push(`  Missing UIDs: ${missingUids.length}`);
      if (missingUids.length > 0) {
        lines.push('');
        lines.push('Files missing UIDs (need Godot editor to fix):');
        for (const m of missingUids) {
          lines.push(`  ${m.type}: ${m.file}`);
        }
      }
    }

    return { content: [{ type: 'text', text: lines.join('\n') }] };
  } catch (err: any) {
    return { content: [{ type: 'text', text: `Error: ${err.message}` }], isError: true };
  }
}

export function handleListMissingUids(projectRoot: string): ToolResult {
  return handleUpdateProjectUids(projectRoot, { check_only: true });
}
