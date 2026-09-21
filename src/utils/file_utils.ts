// Copyright (c) 2026 FairYan
// SPDX-License-Identifier: AGPL-3.0-or-later
// ============================================================
// Godot MCP Server - File System Utilities
// ============================================================

import fs from 'node:fs';
import path from 'node:path';
import { FileEntry, SearchMatch } from './types.js';
import { stampUid } from './uid.js';

/**
 * 报告一处「被跳过的路径」。文件遍历里单个目录/文件不可读时跳过本身是合理的
 * （一个坏子目录不该让整次列举失败），但**不能静默**——否则权限/IO 错误会被
 * 伪装成「目录里什么都没有」，用户拿到少了一半的结果还以为成功了。
 * 走 stderr（MCP 的 stdout 是 JSON-RPC 通道，绝不能污染）。
 */
export function warnSkippedPath(target: string, err: unknown, what = 'path'): void {
  const code = (err as NodeJS.ErrnoException)?.code ?? 'UNKNOWN';
  console.error(`[Godot MCP] Skipped unreadable ${what}: ${target} (${code})`);
}

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
 * 把路径解析成“真实”绝对路径，**允许末段尚不存在**（新建场景/资源时文件还没有）。
 *
 * 从目标沿父目录向上找到第一个真实存在的祖先做 realpath，再把剩下那些不存在
 * 的段拼回去。若直接对不存在的路径用 path.resolve，工程内的符号链接目录会被
 * 当成普通目录字符串——校验通过、写操作却顺着链接落到工程外（沙箱逃逸）。
 */
function realpathAllowMissing(target: string): string {
  let current = target;
  const missingTail: string[] = [];

  for (;;) {
    if (fs.existsSync(current)) {
      let real: string;
      try {
        real = fs.realpathSync(current);
      } catch {
        real = current; // 存在但不可访问（权限等）：保留原样，交给后续校验兜底
      }
      return missingTail.length > 0
        ? path.join(real, ...missingTail.reverse())
        : real;
    }
    const parent = path.dirname(current);
    if (parent === current) return target; // 一路到根都不存在，原样返回
    missingTail.push(path.basename(current));
    current = parent;
  }
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

  // 关键：即便目标还不存在也要把父链的符号链接解析掉，否则可被工程内的
  // 符号链接目录带出工程根（写逃逸）。
  const resolvedReal = realpathAllowMissing(resolved);

  // 仅在大小写不敏感的文件系统上做小写比较。在 Linux（大小写敏感）上做小写
  // 比较会让兄弟目录 /a/PROJ 冒充 /a/proj 通过校验。
  const caseInsensitive = process.platform === 'win32' || process.platform === 'darwin';
  const normalize = (p: string) => (caseInsensitive ? p.toLowerCase() : p);

  const normalizedResolved = normalize(resolvedReal);
  const normalizedRoot = normalize(realRoot + path.sep);
  if (normalizedResolved !== normalize(realRoot) && !normalizedResolved.startsWith(normalizedRoot)) {
    throw new Error(
      `Path traversal detected: "${relativePath}" resolves outside project root ` +
      `(resolved: "${resolved}", realPath: "${resolvedReal}", realRoot: "${realRoot}")`
    );
  }

  // 定向拒绝导出签名凭据文件：里面是 Apple/Google 签名密钥，任何工具都不应读写它。
  // 用解析后的真实路径比较，符号链接绕不过去。
  const sep = path.sep;
  if (normalizedResolved.includes(`${normalize(sep + '.godot' + sep + 'export_credentials.cfg')}`)) {
    throw new Error(
      `Access to .godot/export_credentials.cfg is not allowed (contains export signing secrets)`
    );
  }
  return resolved;
}

/**
 * 判断 target 是否落在 root 之内（两侧都按真实路径比较，符号链接、大小写、
 * /var↔/private/var 都会被正确归一到同一形态）。
 */
export function isPathWithin(root: string, target: string): boolean {
  const real = (p: string): string => {
    try {
      return realpathAllowMissing(p);
    } catch {
      return path.resolve(p);
    }
  };
  const realRoot = real(root);
  const realTarget = real(target);

  const caseInsensitive = process.platform === 'win32' || process.platform === 'darwin';
  const normalize = (p: string) => (caseInsensitive ? p.toLowerCase() : p);
  const nRoot = normalize(realRoot);
  const nTarget = normalize(realTarget);
  return nTarget === nRoot || nTarget.startsWith(nRoot + path.sep);
}

/**
 * 把「用户数据目录」下的路径限制在该目录内（供日志等 user:// 场景复用）。
 * 与 resolveProjectPath 同样的思路：拒绝绝对路径、解析真实路径后校验前缀。
 */
export function resolveWithin(root: string, relativePath: string, label = 'directory'): string {
  if (path.isAbsolute(relativePath)) {
    throw new Error(`Absolute path not allowed here: "${relativePath}" (must stay inside the ${label}).`);
  }
  let realRoot: string;
  try {
    realRoot = fs.existsSync(root) ? fs.realpathSync(root) : path.resolve(root);
  } catch {
    realRoot = path.resolve(root);
  }
  const resolved = path.resolve(realRoot, relativePath);
  const resolvedReal = realpathAllowMissing(resolved);

  const caseInsensitive = process.platform === 'win32' || process.platform === 'darwin';
  const normalize = (p: string) => (caseInsensitive ? p.toLowerCase() : p);
  if (normalize(resolvedReal) !== normalize(realRoot) &&
      !normalize(resolvedReal).startsWith(normalize(realRoot + path.sep))) {
    throw new Error(
      `Path escapes the ${label}: "${relativePath}" (resolved: "${resolvedReal}", ${label}: "${realRoot}")`
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
    } catch (err) {
      warnSkippedPath(currentDir, err, 'directory');
      return;
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
    } catch (err) {
      warnSkippedPath(dir, err, 'directory');
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
        } catch (err) {
          warnSkippedPath(fullPath, err, 'file');
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
 * Normalise a user-supplied resource path to the `res://` form Godot stores.
 *
 * Every MCP tool takes project-relative paths, but `[ext_resource path=...]`
 * is resolved by the engine RELATIVE TO THE REFERRING FILE when it lacks the
 * `res://` prefix. Writing "resources/mat.tres" into "scenes/main.tscn" therefore
 * silently points at "res://scenes/resources/mat.tres" and the reference dies.
 * Always run external references through this.
 */
export function toResPath(inputPath: string): string {
  const trimmed = inputPath.trim();
  if (trimmed.startsWith('res://') || trimmed.startsWith('user://') || trimmed.startsWith('uid://')) {
    return trimmed;
  }
  return `res://${trimmed.replace(/^\.\//, '').replace(/^\/+/, '')}`;
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

  // The scene/resource templates emit `uid=""` as a placeholder. Mint a real
  // UID here so every file we create is a first-class resource instead of one
  // our own `validate_project` would immediately flag. The substitution is
  // scoped to the [gd_scene]/[gd_resource] header, so other content (scripts,
  // shaders, .import files) passes through untouched.
  const payload = stampUid(content);

  // Atomic write: write to a temp file in the same directory, then rename.
  // Prevents leaving a partially-written (corrupted) file if the process crashes mid-write.
  const tmpPath = `${absolutePath}.tmp.${process.pid}`;
  fs.writeFileSync(tmpPath, payload, 'utf-8');
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
    } catch (err) {
      warnSkippedPath(dir, err, 'directory');
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
