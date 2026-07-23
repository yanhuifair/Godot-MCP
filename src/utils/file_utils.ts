// Copyright (c) 2026 FairYan
// SPDX-License-Identifier: MIT
// ============================================================
// Godot MCP Server - File System Utilities
// ============================================================

import fs from 'node:fs';
import path from 'node:path';
import { FileEntry, SearchMatch } from './types.js';

/**
 * Find the Godot project root by looking for project.godot
 * Searches cwd first, then parent directories, then subdirectories.
 */
export function findProjectRoot(startDir?: string): string | null {
  let dir = startDir ? path.resolve(startDir) : process.cwd();

  // 1. Check cwd and upward
  for (let i = 0; i < 10; i++) {
    if (fs.existsSync(path.join(dir, 'project.godot'))) {
      // 解析符号链接，保持与 resolveProjectPath 一致
      try { return fs.realpathSync(dir); } catch { return dir; }
    }
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }

  // 2. Check subdirectories (one level deep — covers VS Code workspace wrapping a Godot project)
  const baseDir = startDir ? path.resolve(startDir) : process.cwd();
  try {
    const entries = fs.readdirSync(baseDir, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.isDirectory() && !entry.name.startsWith('.') && entry.name !== 'node_modules') {
        const sub = path.join(baseDir, entry.name);
        if (fs.existsSync(path.join(sub, 'project.godot'))) {
          // 解析符号链接
          try { return fs.realpathSync(sub); } catch { return sub; }
        }
      }
    }
  } catch { /* no readdir access */ }

  return null;
}

/**
 * Resolve a project-relative path to an absolute path.
 */
export function resolveProjectPath(projectRoot: string, relativePath: string): string {
  // 拒绝绝对路径，防止绕过 projectRoot
  if (path.isAbsolute(relativePath)) {
    throw new Error(`Absolute path not allowed as relative path: "${relativePath}". Use a project-relative path instead.`);
  }

  // Resolve project root first (handle macOS /var→/private/var symlinks)
  let realRoot: string;
  try {
    realRoot = fs.existsSync(projectRoot) ? fs.realpathSync(projectRoot) : path.resolve(projectRoot);
  } catch (err) {
    throw new Error(`Cannot resolve project root path "${projectRoot}": ${(err as Error).message}`);
  }

  // Resolve target path (use path.resolve since file may not exist yet, e.g. for create operations)
  const resolved = path.resolve(realRoot, relativePath);

  let resolvedReal: string;
  try {
    resolvedReal = fs.existsSync(resolved) ? fs.realpathSync(resolved) : resolved;
  } catch (err) {
    // 如果 resolved 本身存在但无法访问，直接用 resolved 继续
    resolvedReal = resolved;
  }

  // Windows 文件系统不区分大小写，统一小写比较防止误报
  const normalizedResolved = resolvedReal.toLowerCase();
  const normalizedRoot = (realRoot + path.sep).toLowerCase();
  if (!normalizedResolved.startsWith(normalizedRoot) && normalizedResolved !== realRoot.toLowerCase()) {
    throw new Error(
      `Path traversal detected: "${relativePath}" resolves outside project root ` +
      `(resolved: "${resolved}", realRoot: "${realRoot}")`
    );
  }
  return resolved;
}

/**
 * List files in a directory with optional glob filtering.
 */
export function listFiles(
  projectRoot: string,
  subPath: string = '',
  pattern?: string,
  recursive: boolean = true
): FileEntry[] {
  const dirPath = resolveProjectPath(projectRoot, subPath || '');
  if (!fs.existsSync(dirPath)) {
    throw new Error(`Directory not found: ${subPath}`);
  }
  if (!fs.statSync(dirPath).isDirectory()) {
    throw new Error(`Not a directory: ${subPath}`);
  }

  const results: FileEntry[] = [];

  function walk(currentDir: string, relativeBase: string) {
    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(currentDir, { withFileTypes: true });
    } catch {
      return; // skip unreadable directories
    }

    for (const entry of entries) {
      // Skip hidden files/directories
      if (entry.name.startsWith('.')) continue;

      const fullPath = path.join(currentDir, entry.name);
      const relativePath = relativeBase ? `${relativeBase}/${entry.name}` : entry.name;

      if (entry.isDirectory()) {
        results.push({
          name: entry.name,
          path: relativePath,
          type: 'dir',
          size: 0,
          modified_at: fs.statSync(fullPath).mtime.toISOString(),
        });
        if (recursive) {
          walk(fullPath, relativePath);
        }
      } else if (entry.isFile()) {
        // Apply glob pattern filter
        if (pattern && !simpleGlobMatch(entry.name, pattern)) continue;

        const stat = fs.statSync(fullPath);
        results.push({
          name: entry.name,
          path: relativePath,
          type: 'file',
          size: stat.size,
          modified_at: stat.mtime.toISOString(),
        });
      }
    }
  }

  walk(dirPath, subPath || '');
  return results;
}

/**
 * Simple glob matching (supports * and ? wildcards).
 */
function simpleGlobMatch(filename: string, pattern: string): boolean {
  // Convert glob pattern to regex
  const regexStr = pattern
    .replace(/[.+^${}()|[\]\\]/g, '\\$&') // escape regex special chars
    .replace(/\*/g, '.*')
    .replace(/\?/g, '.');
  return new RegExp(`^${regexStr}$`, 'i').test(filename);
}

/**
 * Search for text across all files in the project.
 */
export function searchInProject(
  projectRoot: string,
  query: string,
  pattern?: string,
  maxResults: number = 50
): SearchMatch[] {
  const results: SearchMatch[] = [];
  const lowerQuery = query.toLowerCase();

  function walk(dir: string, relativeBase: string) {
    if (results.length >= maxResults) return;

    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }

    for (const entry of entries) {
      if (results.length >= maxResults) return;
      if (entry.name.startsWith('.') || entry.name === 'addons') continue;

      const fullPath = path.join(dir, entry.name);

      if (entry.isDirectory()) {
        walk(fullPath, relativeBase ? `${relativeBase}/${entry.name}` : entry.name);
      } else if (entry.isFile()) {
        // Apply pattern filter
        if (pattern && !simpleGlobMatch(entry.name, pattern)) continue;

        // Skip binary files by extension
        const ext = path.extname(entry.name).toLowerCase();
        const binaryExts = ['.png', '.jpg', '.jpeg', '.gif', '.bmp', '.webp', '.svg',
          '.ogg', '.mp3', '.wav', '.webm', '.mp4',
          '.ttf', '.otf', '.woff',
          '.dds', '.ktx', '.basis', '.pvr',
          '.blend', '.fbx', '.glb', '.gltf',
          '.res']; // .res is binary
        if (binaryExts.includes(ext)) continue;

        try {
          const content = fs.readFileSync(fullPath, 'utf-8');
          const lines = content.split('\n');
          for (let i = 0; i < lines.length; i++) {
            if (results.length >= maxResults) break;
            const lineLower = lines[i].toLowerCase();
            if (lineLower.includes(lowerQuery)) {
              const relativePath = relativeBase ? `${relativeBase}/${entry.name}` : entry.name;
              results.push({
                file: relativePath,
                line: lines[i].trim(),
                line_number: i + 1,
              });
            }
          }
        } catch {
          // skip unreadable files
        }
      }
    }
  }

  walk(projectRoot, '');
  return results;
}

/**
 * Read a text file, returning content and metadata.
 */
export function readTextFile(absolutePath: string): { content: string; totalLines: number; size: number } {
  if (!fs.existsSync(absolutePath)) {
    throw new Error(`File not found: ${absolutePath}`);
  }
  const stat = fs.statSync(absolutePath);
  const content = fs.readFileSync(absolutePath, 'utf-8');
  const totalLines = content.split('\n').length;
  return { content, totalLines, size: stat.size };
}

/**
 * Get lines from a file, optionally with start/limit.
 */
export function readFileLines(
  absolutePath: string,
  lineStart?: number,
  lineCount?: number
): { lines: string[]; totalLines: number } {
  const { content, totalLines } = readTextFile(absolutePath);
  const allLines = content.split('\n');

  let selectedLines: string[];
  if (lineStart !== undefined && lineCount !== undefined) {
    const start = Math.max(0, lineStart - 1); // convert 1-indexed to 0-indexed
    selectedLines = allLines.slice(start, start + lineCount);
  } else {
    selectedLines = allLines;
  }

  return { lines: selectedLines, totalLines };
}

/**
 * Write content to a file, optionally creating a backup.
 */
export function writeTextFile(absolutePath: string, content: string, createBackup: boolean = false): void {
  const dir = path.dirname(absolutePath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  if (createBackup && fs.existsSync(absolutePath)) {
    const backupPath = absolutePath + '.bak';
    fs.copyFileSync(absolutePath, backupPath);
  }

  // Atomic write: write to a temp file in the same directory, then rename.
  // Prevents leaving a partially-written (corrupted) file if the process crashes mid-write.
  const tmpPath = `${absolutePath}.tmp.${process.pid}`;
  fs.writeFileSync(tmpPath, content, 'utf-8');
  try {
    fs.renameSync(tmpPath, absolutePath);
  } catch (err) {
    try { fs.unlinkSync(tmpPath); } catch { /* best-effort cleanup */ }
    throw err;
  }
}

/**
 * Recursively find files matching an extension.
 */
export function findFilesByExtension(
  projectRoot: string,
  extensions: string[],
  subPath: string = '',
  recursive: boolean = true
): string[] {
  const results: string[] = [];

  function walk(dir: string, relativeBase: string) {
    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }

    for (const entry of entries) {
      if (entry.name.startsWith('.')) continue;
      const fullPath = path.join(dir, entry.name);
      const relativePath = relativeBase ? `${relativeBase}/${entry.name}` : entry.name;

      if (entry.isDirectory()) {
        if (recursive) {
          walk(fullPath, relativePath);
        }
      } else if (entry.isFile()) {
        const ext = path.extname(entry.name).toLowerCase();
        if (extensions.includes(ext)) {
          results.push(relativePath);
        }
      }
    }
  }

  const startDir = resolveProjectPath(projectRoot, subPath || '');
  walk(startDir, subPath || '');
  return results;
}

/**
 * Safely delete a file with backup.
 */
export function deleteFile(projectRoot: string, relativePath: string): void {
  const absPath = resolveProjectPath(projectRoot, relativePath);
  if (!fs.existsSync(absPath)) {
    throw new Error(`File not found: ${relativePath}`);
  }
  const stat = fs.statSync(absPath);
  if (stat.isDirectory()) {
    throw new Error(`Cannot delete directory: ${relativePath}. Use move_file instead.`);
  }
  // Create backup before deleting
  const backupPath = absPath + '.bak';
  fs.copyFileSync(absPath, backupPath);
  fs.unlinkSync(absPath);
}

/**
 * Move/rename a file within the project.
 */
export function moveFile(projectRoot: string, sourcePath: string, destPath: string): void {
  const absSource = resolveProjectPath(projectRoot, sourcePath);
  const absDest = resolveProjectPath(projectRoot, destPath);

  if (!fs.existsSync(absSource)) {
    throw new Error(`Source file not found: ${sourcePath}`);
  }

  const destDir = path.dirname(absDest);
  if (!fs.existsSync(destDir)) {
    fs.mkdirSync(destDir, { recursive: true });
  }

  if (fs.existsSync(absDest)) {
    // Backup existing destination
    fs.copyFileSync(absDest, absDest + '.bak');
  }

  fs.renameSync(absSource, absDest);
}
