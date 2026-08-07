// Copyright (c) 2026 FairYan
// SPDX-License-Identifier: AGPL-3.0-or-later
// ============================================================
// Godot MCP Server - UID Management Tools (Godot 4.x)
// ============================================================

import { z } from 'zod';
import { toolError, ErrorCode } from '../utils/errors.js';
import { ToolResult } from '../utils/types.js';
import fs from 'node:fs';
import { readTextFile, findFilesByExtension, resolveProjectPath, writeTextFile } from '../utils/file_utils.js';
import { generateUid, uidTextToId } from '../utils/uid.js';

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
    return toolError(ErrorCode.FILE_NOT_FOUND, `File not found: ${args.path}`);
    }

    const ext = args.path.split('.').pop()?.toLowerCase();

    // For .tscn files — extract uid from header
    if (ext === 'tscn') {
      const { content } = readTextFile(absPath);
      const uidMatch = content.match(/\[gd_scene[^\]]*uid="([^"]+)"/);
      if (uidMatch) {
        return { content: [{ type: 'text', text: `UID: ${uidMatch[1]}\nFile: ${args.path}\nType: Scene` }] };
      }
      return { content: [{ type: 'text', text: `No UID found in ${args.path}. The file may not have been saved in Godot 4.x yet.` }] };
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

    // Everything else (.gd scripts, .png/.svg/.ogg imported assets, shaders, ...)
    // stores its UID in a sidecar "<file>.uid" written by the editor's filesystem
    // scanner — see editor/file_system/editor_file_system.cpp (open(path + ".uid", WRITE)).
    // It is a plain text file containing exactly one "uid://..." token.
    const sidecar = absPath + '.uid';
    if (fs.existsSync(sidecar)) {
      const uid = fs.readFileSync(sidecar, 'utf-8').trim();
      const kind = ext === 'gd' ? 'Script' : 'Asset';
      const valid = uidTextToId(uid) >= 0n;
      return {
        content: [{
          type: 'text',
          text: `UID: ${uid}\nFile: ${args.path}\nSidecar: ${args.path}.uid\nType: ${kind}${valid ? '' : '\nWARNING: this UID is not decodable by Godot (invalid base-34 text).'}`,
        }],
      };
    }

    return {
      content: [{
        type: 'text',
        text: `No UID for ${args.path}.\n\n.tscn/.tres store the UID inline in their header; every other file type (.gd, textures, audio, shaders) uses a "<file>.uid" sidecar created when the editor scans the filesystem. Neither was found — run fix_missing_uids, or open the project in the Godot editor once.`,
      }],
    };
  } catch (err: any) {
    return toolError(ErrorCode.INTERNAL_ERROR, `Error: ${err.message}`);
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
        lines.push('To fix: run fix_missing_uids (mints spec-correct base-34 UIDs in place),');
        lines.push('or open the project in Godot 4.x and use Project → Tools → Update UIDs.');
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
    return toolError(ErrorCode.INTERNAL_ERROR, `Error: ${err.message}`);
  }
}

export function handleListMissingUids(projectRoot: string): ToolResult {
  return handleUpdateProjectUids(projectRoot, { check_only: true });
}

// ---- Additional UID tools (Tier1) ----

// NOTE: generateUid() intentionally comes from ../utils/uid.js.
// A local copy used to live here with the alphabet
// 'abcdefghijklmnopqrstuvwxyz0123456789' (36 chars, INCLUDING 'z').
// Godot's real alphabet is base-34: 'a'..'y' (0-24) then '0'..'9' (25-33) —
// see core/io/resource_uid.cpp: char_count = 'z'-'a' (=25), base = char_count + ('9'-'0') (=34).
// 'z' is NOT a valid UID character, so that generator emitted UIDs which
// ResourceUID::text_to_id() rejects (-1) roughly half the time.

export const fixMissingUidsSchema = {};

export function handleFixMissingUids(projectRoot: string): ToolResult {
  try {
    const sceneFiles = findFilesByExtension(projectRoot, ['.tscn']);
    const tresFiles = findFilesByExtension(projectRoot, ['.tres']);

    const fixedFiles: string[] = [];
    const failedFiles: string[] = [];

    for (const file of [...sceneFiles, ...tresFiles]) {
      try {
        const absPath = resolveProjectPath(projectRoot, file);
        const { content } = readTextFile(absPath);

        let newContent = content;
        if (file.endsWith('.tscn')) {
          if (!/\[gd_scene[^\]]*uid="uid:/i.test(content)) {
            newContent = content.replace(/^(\[gd_scene[^\]]*\])/m, (m) =>
              m.replace(/\]$/, ` uid="${generateUid()}"]`)
            );
          }
        } else if (file.endsWith('.tres')) {
          if (!/\[gd_resource[^\]]*uid="uid:/i.test(content)) {
            newContent = content.replace(/^(\[gd_resource[^\]]*\])/m, (m) =>
              m.replace(/\]$/, ` uid="${generateUid()}"]`)
            );
          }
        }

        if (newContent !== content) {
          writeTextFile(absPath, newContent, true);
          fixedFiles.push(file);
        }
      } catch {
        failedFiles.push(file);
      }
    }

    // .gd scripts keep their UID in a "<file>.uid" sidecar, not inline.
    for (const file of findFilesByExtension(projectRoot, ['.gd'])) {
      try {
        const absPath = resolveProjectPath(projectRoot, file);
        const sidecar = absPath + '.uid';
        if (fs.existsSync(sidecar)) continue;
        writeTextFile(sidecar, generateUid() + '\n', true);
        fixedFiles.push(file + '.uid');
      } catch {
        failedFiles.push(file + '.uid');
      }
    }

    const lines: string[] = [];
    lines.push(`UID Fix Complete: ${fixedFiles.length} file(s) updated`);
    if (fixedFiles.length) {
      lines.push('');
      for (const f of fixedFiles) lines.push(`  + ${f}`);
    }
    if (failedFiles.length) {
      lines.push('');
      lines.push(`Failed: ${failedFiles.length}`);
      for (const f of failedFiles) lines.push(`  - ${f}`);
    }
    if (fixedFiles.length === 0 && failedFiles.length === 0) {
      lines.push('All scanned files already have UIDs.');
    }

    return { content: [{ type: 'text', text: lines.join('\n') }] };
  } catch (err: any) {
    return toolError(ErrorCode.INTERNAL_ERROR, `Error: ${err.message}`);
  }
}
