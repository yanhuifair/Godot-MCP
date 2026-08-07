// Copyright (c) 2026 FairYan
// SPDX-License-Identifier: AGPL-3.0-or-later
// ============================================================
// Godot MCP Server - Engine Log Tools (Godot 4.x)
//
// Godot writes runtime logs through RotatedFileLogger, installed in
// main/main.cpp:2250-2277:
//
//   debug/file_logging/enable_file_logging      false, but ".pc" override = true
//                                               (so: ON by default on desktop)
//   debug/file_logging/log_path                 "user://logs/godot.log"
//   debug/file_logging/max_log_files            5
//
// IMPORTANT: the editor and the project manager never install the logger
// (main.cpp guards with `!project_manager && !editor`), so an editor session
// produces NO log file. Only actual game runs do. `--log-file <path>` on the
// command line overrides both the path and the enable flag.
//
// Rotation (core/io/logger.cpp:139 rotate_file): on every launch the previous
// godot.log is copied to "godot" + ISO-datetime (":" -> ".") + ".log", and only
// the newest `max_log_files` are kept.
//
// The "user://" directory is resolved in core/os/os.cpp:336 get_user_data_dir():
//   default:  <data_path>/<godot_dir_name>/app_userdata/<safe(application/config/name)>
//   custom:   <data_path>/<safe(application/config/custom_user_dir_name, allow_paths)>
// with data_path / godot_dir_name being per-platform:
//   macOS   ~/Library/Application Support        + "Godot"   (os_macos.mm:423/490)
//   Windows %APPDATA%                            + "Godot"   (os_windows.cpp:2430/2472)
//   Linux   $XDG_DATA_HOME | ~/.local/share      + "godot"   (os_linuxbsd.cpp:905, os.cpp:292)
// ============================================================

import { z } from 'zod';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { toolError, ErrorCode } from '../utils/errors.js';
import { ToolResult } from '../utils/types.js';
import { readTextFile, resolveProjectPath, writeTextFile } from '../utils/file_utils.js';
import { parseConfig, serializeConfig } from '../parsers/config_parser.js';

// ---- user:// resolution -------------------------------------------------

/** Port of OS::get_safe_dir_name (core/os/os.cpp:260). */
function safeDirName(name: string, allowPaths = false): string {
  let s = name;
  const invalid = [':', '*', '?', '"', '<', '>', '|'];
  if (allowPaths) {
    s = s.replace(/\\/g, '/').replace(/\/\//g, '/').trim();
    invalid.push('..');
  } else {
    invalid.push('/', '\\');
    s = s.trim();
    if (s === '.') s = 'dot';
    else if (s === '..') s = 'twodots';
  }
  for (const c of invalid) s = s.split(c).join('-');
  // Trailing periods are invalid folder names on Windows; the engine trims them
  // on every platform so the value stays consistent.
  while (s.endsWith('.')) s = s.slice(0, -1);
  return s;
}

/** Per-platform <data_path>, i.e. OS::get_data_path(). */
function dataPath(): string {
  const home = os.homedir();
  if (process.platform === 'darwin') return path.join(home, 'Library', 'Application Support');
  if (process.platform === 'win32') {
    return (process.env.APPDATA || path.join(home, 'AppData', 'Roaming')).replace(/\\/g, '/');
  }
  const xdg = process.env.XDG_DATA_HOME;
  if (xdg && path.isAbsolute(xdg)) return xdg;
  return path.join(home, '.local', 'share');
}

/** Per-platform OS::get_godot_dir_name(). */
function godotDirName(): string {
  return process.platform === 'darwin' || process.platform === 'win32' ? 'Godot' : 'godot';
}

export interface UserDirInfo {
  dir: string;
  appName: string;
  custom: boolean;
  customName: string;
  logPath: string;      // raw setting, e.g. "user://logs/godot.log"
  logFileAbs: string;   // resolved absolute path of the *current* log
  logDirAbs: string;    // directory holding the logs
  loggingEnabled: boolean;
  maxLogFiles: number;
}

function unquote(v: string | undefined): string {
  if (v === undefined) return '';
  return v.trim().replace(/^"(.*)"$/s, '$1');
}

/**
 * Resolve everything about a project's user:// directory + log configuration
 * from project.godot alone (no running engine required).
 */
export function resolveUserDir(projectRoot: string): UserDirInfo {
  const { content } = readTextFile(resolveProjectPath(projectRoot, 'project.godot'));
  const cfg = parseConfig(content);
  const app = cfg.sections['application'] || {};
  const dbg = cfg.sections['debug'] || {};

  const rawName = unquote(app['config/name']);
  const appName = safeDirName(rawName) || '[unnamed project]';
  const custom = unquote(app['config/use_custom_user_dir']) === 'true';
  const customRaw = unquote(app['config/custom_user_dir_name']);
  const customName = safeDirName(customRaw, true);

  const dir = custom && customName
    ? path.join(dataPath(), customName)
    : path.join(dataPath(), godotDirName(), 'app_userdata', appName);

  // enable_file_logging: base default false, but the ".pc" feature-tag override
  // ships as true, so on desktop the effective default is ON.
  const enableRaw = dbg['file_logging/enable_file_logging'];
  const enablePcRaw = dbg['file_logging/enable_file_logging.pc'];
  const loggingEnabled = enablePcRaw !== undefined
    ? unquote(enablePcRaw) === 'true'
    : (enableRaw !== undefined ? unquote(enableRaw) === 'true' : true);

  const logPath = unquote(dbg['file_logging/log_path']) || 'user://logs/godot.log';
  const maxLogFiles = parseInt(unquote(dbg['file_logging/max_log_files']) || '5', 10);

  let logFileAbs: string;
  if (logPath.startsWith('user://')) {
    logFileAbs = path.join(dir, logPath.slice('user://'.length));
  } else if (logPath.startsWith('res://')) {
    logFileAbs = path.join(projectRoot, logPath.slice('res://'.length));
  } else if (path.isAbsolute(logPath)) {
    logFileAbs = logPath;
  } else {
    logFileAbs = path.join(projectRoot, logPath);
  }

  return {
    dir,
    appName,
    custom,
    customName,
    logPath,
    logFileAbs,
    logDirAbs: path.dirname(logFileAbs),
    loggingEnabled,
    maxLogFiles,
  };
}

/** List log files in the log directory, newest first. */
function listLogFiles(info: UserDirInfo): { name: string; abs: string; size: number; mtime: Date }[] {
  if (!fs.existsSync(info.logDirAbs)) return [];
  const base = path.basename(info.logFileAbs);
  const stem = base.replace(/\.[^.]*$/, '');
  const ext = path.extname(base);
  const out: { name: string; abs: string; size: number; mtime: Date }[] = [];
  for (const name of fs.readdirSync(info.logDirAbs)) {
    // Current log, or a rotated "<stem><timestamp><ext>" backup.
    if (name !== base && !(name.startsWith(stem) && name.endsWith(ext))) continue;
    const abs = path.join(info.logDirAbs, name);
    try {
      const st = fs.statSync(abs);
      if (!st.isFile()) continue;
      out.push({ name, abs, size: st.size, mtime: st.mtime });
    } catch { /* skip unreadable */ }
  }
  out.sort((a, b) => b.mtime.getTime() - a.mtime.getTime());
  return out;
}

function humanSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(2)} MB`;
}

// Error headers emitted by Logger::log_error (core/io/logger.h:57 error_type_string).
const LEVEL_PREFIX: Record<string, RegExp> = {
  error: /^(ERROR|SCRIPT ERROR|SHADER ERROR|UNKNOWN ERROR|USER ERROR|USER SCRIPT ERROR):/,
  warning: /^(WARNING|USER WARNING):/,
  script: /^(SCRIPT ERROR|USER SCRIPT ERROR):/,
  shader: /^SHADER ERROR:/,
};

/**
 * Keep only lines matching a severity, preserving the indented continuation
 * lines ("   at: ..." and script backtraces) that belong to each header.
 */
function filterByLevel(lines: string[], level: string): string[] {
  const re = LEVEL_PREFIX[level];
  if (!re) return lines;
  const out: string[] = [];
  let keeping = false;
  for (const line of lines) {
    if (re.test(line)) {
      keeping = true;
      out.push(line);
    } else if (keeping && /^\s+/.test(line) && line.trim() !== '') {
      out.push(line);
    } else {
      keeping = false;
    }
  }
  return out;
}

// ---- Tool schemas -------------------------------------------------------

export const readGameLogSchema = {
  lines: z.number().optional().default(200).describe('How many lines to return (default 200). Use 0 for the whole file.'),
  level: z.enum(['all', 'error', 'warning', 'script', 'shader']).optional().default('all')
    .describe('Filter by severity. "error" also matches SCRIPT/SHADER ERROR. Continuation lines ("   at: ...") are kept.'),
  pattern: z.string().optional().describe('Only return lines matching this regular expression (applied after the level filter).'),
  file: z.string().optional().describe('Read a specific log file name from the log directory instead of the newest one (see list_game_logs).'),
  from_start: z.boolean().optional().default(false).describe('Return the FIRST N lines instead of the last N (default: tail).'),
};

export const listGameLogsSchema = {};

export const clearGameLogsSchema = {
  include_current: z.boolean().optional().default(false).describe('Also delete the current godot.log, not just rotated backups.'),
};

export const getUserDataDirSchema = {
  list: z.boolean().optional().default(false).describe('Also list the top-level contents of the user:// directory.'),
};

export const configureFileLoggingSchema = {
  enabled: z.boolean().optional().describe('Turn debug/file_logging/enable_file_logging on or off.'),
  log_path: z.string().optional().describe('Log path, e.g. "user://logs/godot.log". Accepts user://, res:// or an absolute path.'),
  max_log_files: z.number().optional().describe('How many rotated logs to keep (debug/file_logging/max_log_files, default 5).'),
};

// ---- Handlers -----------------------------------------------------------

export function handleReadGameLog(
  projectRoot: string,
  args: { lines?: number; level?: string; pattern?: string; file?: string; from_start?: boolean }
): ToolResult {
  try {
    const info = resolveUserDir(projectRoot);
    const files = listLogFiles(info);

    let target: string;
    if (args.file) {
      if (args.file.includes('/') || args.file.includes('\\') || args.file.includes('..')) {
        return toolError(ErrorCode.INVALID_ARGUMENT, `"file" must be a bare file name inside the log directory, got: ${args.file}`);
      }
      target = path.join(info.logDirAbs, args.file);
    } else if (fs.existsSync(info.logFileAbs)) {
      target = info.logFileAbs;
    } else if (files.length > 0) {
      target = files[0].abs;
    } else {
      const hint = info.loggingEnabled
        ? 'File logging IS enabled, but no log exists yet — the game has not been run, or it was only opened in the editor (the editor never writes logs).'
        : 'File logging is DISABLED for this project (debug/file_logging/enable_file_logging = false). Run configure_file_logging with enabled=true, then run the game.';
      return {
        content: [{
          type: 'text',
          text: `No log file found.\n\nExpected: ${info.logFileAbs}\nLog dir:  ${info.logDirAbs}\n\n${hint}`,
        }],
      };
    }

    if (!fs.existsSync(target)) {
      return toolError(ErrorCode.FILE_NOT_FOUND, `Log file not found: ${target}`);
    }

    const raw = fs.readFileSync(target, 'utf-8');
    let all = raw.split('\n');
    if (all.length && all[all.length - 1] === '') all.pop();
    const totalLines = all.length;

    const level = args.level || 'all';
    if (level !== 'all') all = filterByLevel(all, level);

    if (args.pattern) {
      let re: RegExp;
      try {
        re = new RegExp(args.pattern);
      } catch (e: any) {
        return toolError(ErrorCode.INVALID_ARGUMENT, `Invalid "pattern" regex: ${e.message}`);
      }
      all = all.filter(l => re.test(l));
    }

    const matched = all.length;
    const want = args.lines ?? 200;
    const slice = want > 0
      ? (args.from_start ? all.slice(0, want) : all.slice(-want))
      : all;

    const st = fs.statSync(target);
    // NOTE: keep the trailing '' separator — do NOT use .filter(Boolean) here,
    // it would drop the blank line and glue the header onto the first log line.
    const header = ([
      `Log: ${target}`,
      `Modified: ${st.mtime.toISOString()}   Size: ${humanSize(st.size)}   Lines: ${totalLines}`,
      level !== 'all' || args.pattern
        ? `Filter: level=${level}${args.pattern ? ` pattern=/${args.pattern}/` : ''} -> ${matched} matching line(s)`
        : null,
      want > 0 && slice.length < matched
        ? `Showing ${args.from_start ? 'first' : 'last'} ${slice.length} of ${matched} line(s).`
        : null,
      '',
    ].filter(l => l !== null) as string[]).join('\n');

    if (slice.length === 0) {
      return { content: [{ type: 'text', text: `${header}(no matching lines)` }] };
    }

    return { content: [{ type: 'text', text: header + slice.join('\n') }] };
  } catch (err: any) {
    return toolError(ErrorCode.INTERNAL_ERROR, `Error reading game log: ${err.message}`);
  }
}

export function handleListGameLogs(projectRoot: string): ToolResult {
  try {
    const info = resolveUserDir(projectRoot);
    const files = listLogFiles(info);

    const lines: string[] = [
      `Log directory: ${info.logDirAbs}`,
      `Configured log_path: ${info.logPath}`,
      `File logging enabled: ${info.loggingEnabled ? 'yes' : 'no'}   max_log_files: ${info.maxLogFiles}`,
      '',
    ];

    if (files.length === 0) {
      lines.push('No log files found.');
      lines.push('');
      lines.push('Note: only actual game runs write logs — an editor session never does');
      lines.push('(main.cpp guards the logger with `!project_manager && !editor`).');
      return { content: [{ type: 'text', text: lines.join('\n') }] };
    }

    const current = path.basename(info.logFileAbs);
    lines.push(`${files.length} log file(s), newest first:`);
    for (const f of files) {
      const tag = f.name === current ? ' (current)' : '';
      lines.push(`  ${f.mtime.toISOString()}  ${humanSize(f.size).padStart(9)}  ${f.name}${tag}`);
    }
    return { content: [{ type: 'text', text: lines.join('\n') }] };
  } catch (err: any) {
    return toolError(ErrorCode.INTERNAL_ERROR, `Error listing game logs: ${err.message}`);
  }
}

export function handleClearGameLogs(
  projectRoot: string,
  args: { include_current?: boolean }
): ToolResult {
  try {
    const info = resolveUserDir(projectRoot);
    const files = listLogFiles(info);
    const current = path.basename(info.logFileAbs);

    const deleted: string[] = [];
    const failed: string[] = [];
    for (const f of files) {
      if (f.name === current && !args.include_current) continue;
      try {
        fs.unlinkSync(f.abs);
        deleted.push(f.name);
      } catch {
        failed.push(f.name);
      }
    }

    const lines = [`Deleted ${deleted.length} log file(s) from ${info.logDirAbs}`];
    for (const d of deleted) lines.push(`  - ${d}`);
    if (failed.length) {
      lines.push('');
      lines.push(`Failed to delete ${failed.length}:`);
      for (const f of failed) lines.push(`  ! ${f}`);
    }
    if (deleted.length === 0 && failed.length === 0) lines.push('  (nothing to delete)');
    return { content: [{ type: 'text', text: lines.join('\n') }] };
  } catch (err: any) {
    return toolError(ErrorCode.INTERNAL_ERROR, `Error clearing game logs: ${err.message}`);
  }
}

export function handleGetUserDataDir(
  projectRoot: string,
  args: { list?: boolean }
): ToolResult {
  try {
    const info = resolveUserDir(projectRoot);
    const exists = fs.existsSync(info.dir);

    const lines: string[] = [
      `user:// resolves to: ${info.dir}`,
      `  exists:            ${exists ? 'yes' : 'no'}`,
      `  app name:          ${info.appName}`,
      `  custom user dir:   ${info.custom ? `yes ("${info.customName}")` : 'no'}`,
      `  platform:          ${process.platform}`,
      '',
      'File logging:',
      `  enabled:           ${info.loggingEnabled ? 'yes' : 'no'}`,
      `  log_path:          ${info.logPath}`,
      `  resolved:          ${info.logFileAbs}`,
      `  max_log_files:     ${info.maxLogFiles}`,
    ];

    if (args.list && exists) {
      lines.push('');
      lines.push('Contents:');
      try {
        const entries = fs.readdirSync(info.dir, { withFileTypes: true });
        if (entries.length === 0) lines.push('  (empty)');
        for (const e of entries.sort((a, b) => a.name.localeCompare(b.name))) {
          if (e.isDirectory()) {
            lines.push(`  ${e.name}/`);
          } else {
            let size = '';
            try { size = ` (${humanSize(fs.statSync(path.join(info.dir, e.name)).size)})`; } catch { /* ignore */ }
            lines.push(`  ${e.name}${size}`);
          }
        }
      } catch (e: any) {
        lines.push(`  (unreadable: ${e.message})`);
      }
    }

    return { content: [{ type: 'text', text: lines.join('\n') }] };
  } catch (err: any) {
    return toolError(ErrorCode.INTERNAL_ERROR, `Error resolving user data dir: ${err.message}`);
  }
}

export function handleConfigureFileLogging(
  projectRoot: string,
  args: { enabled?: boolean; log_path?: string; max_log_files?: number }
): ToolResult {
  try {
    if (args.enabled === undefined && args.log_path === undefined && args.max_log_files === undefined) {
      return toolError(ErrorCode.INVALID_ARGUMENT, 'Provide at least one of: enabled, log_path, max_log_files.');
    }
    if (args.max_log_files !== undefined && (!Number.isInteger(args.max_log_files) || args.max_log_files < 0)) {
      return toolError(ErrorCode.INVALID_ARGUMENT, `max_log_files must be a non-negative integer, got: ${args.max_log_files}`);
    }

    const cfgPath = resolveProjectPath(projectRoot, 'project.godot');
    const { content } = readTextFile(cfgPath);
    const doc = parseConfig(content);
    if (!doc.sections['debug']) doc.sections['debug'] = {};

    const changed: string[] = [];
    if (args.enabled !== undefined) {
      const v = args.enabled ? 'true' : 'false';
      doc.sections['debug']['file_logging/enable_file_logging'] = v;
      // The engine ships an "enable_file_logging.pc" override that is true; if it
      // is present in project.godot it wins on desktop, so keep both in sync.
      if (doc.sections['debug']['file_logging/enable_file_logging.pc'] !== undefined) {
        doc.sections['debug']['file_logging/enable_file_logging.pc'] = v;
        changed.push(`debug/file_logging/enable_file_logging.pc = ${v}`);
      }
      changed.push(`debug/file_logging/enable_file_logging = ${v}`);
    }
    if (args.log_path !== undefined) {
      doc.sections['debug']['file_logging/log_path'] = `"${args.log_path}"`;
      changed.push(`debug/file_logging/log_path = "${args.log_path}"`);
    }
    if (args.max_log_files !== undefined) {
      doc.sections['debug']['file_logging/max_log_files'] = String(args.max_log_files);
      changed.push(`debug/file_logging/max_log_files = ${args.max_log_files}`);
    }

    writeTextFile(cfgPath, serializeConfig(doc), true);

    return {
      content: [{
        type: 'text',
        text: `File logging updated in project.godot:\n${changed.map(c => `  ${c}`).join('\n')}\n\nLogs are written on the next game run (editor sessions never write log files).`,
      }],
    };
  } catch (err: any) {
    return toolError(ErrorCode.INTERNAL_ERROR, `Error configuring file logging: ${err.message}`);
  }
}
