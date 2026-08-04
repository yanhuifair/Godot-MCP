// Copyright (c) 2026 FairYan
// SPDX-License-Identifier: AGPL-3.0-or-later
// ============================================================
// Godot MCP Server - Godot CLI Detection and Execution
// ============================================================

import { execSync, execFile, spawn, ChildProcess } from 'node:child_process';
import { promisify } from 'node:util';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { GodotVersionInfo, SpawnedProcess } from './types.js';

const execFileAsync = promisify(execFile);

// Track spawned processes for output monitoring
const spawnedProcesses = new Map<number, { process: ChildProcess; output: string[] }>();
const MAX_OUTPUT_LINES = 200;

/**
 * Find the Godot binary on the system.
 * Checks in order:
 * 1. GODOT_PATH environment variable
 * 2. Common macOS locations
 * 3. PATH
 * 4. Common Linux/Windows locations
 */
export function findGodotBinary(godotPath?: string): string | null {
  // 1. Explicit path from argument or env
  if (godotPath) {
    if (fs.existsSync(godotPath)) return godotPath;
    return null;
  }

  const envPath = process.env.GODOT_PATH;
  if (envPath && fs.existsSync(envPath)) {
    return envPath;
  }

  // 2. Common macOS locations (Godot 4.x only — Godot 3 is not supported)
  if (os.platform() === 'darwin') {
    const godot4Versions = ['4.0', '4.1', '4.2', '4.3', '4.4', '4.5', '4.6', '4.7', '4.8', '4.9', '5.0'];
    const macPaths = [
      '/Applications/Godot.app/Contents/MacOS/Godot',
      ...godot4Versions.map(v => `/Applications/Godot_${v}.app/Contents/MacOS/Godot`),
      path.join(os.homedir(), 'Applications/Godot.app/Contents/MacOS/Godot'),
    ];

    for (const p of macPaths) {
      if (fs.existsSync(p)) return p;
    }

    // Try to find any Godot*.app
    try {
      const appsDir = '/Applications';
      const found = fs.readdirSync(appsDir)
        .filter(f => f.startsWith('Godot') && f.endsWith('.app'))
        .map(f => path.join(appsDir, f, 'Contents/MacOS', f.replace('.app', '')));
      for (const f of found) {
        if (fs.existsSync(f)) return f;
      }
    } catch {
      // ignore
    }

    // Try home Applications
    try {
      const homeAppsDir = path.join(os.homedir(), 'Applications');
      if (fs.existsSync(homeAppsDir)) {
        const found = fs.readdirSync(homeAppsDir)
          .filter(f => f.startsWith('Godot') && f.endsWith('.app'))
          .map(f => path.join(homeAppsDir, f, 'Contents/MacOS', f.replace('.app', '')));
        for (const f of found) {
          if (fs.existsSync(f)) return f;
        }
      }
    } catch {
      // ignore
    }
  }

  // 3. Check PATH
  try {
    const whichResult = execSync('which godot 2>/dev/null || which Godot 2>/dev/null', {
      encoding: 'utf-8',
    }).trim();
    if (whichResult && fs.existsSync(whichResult)) {
      return whichResult;
    }
  } catch {
    // not found in PATH
  }

  // 4. Linux snap/flatpak
  if (os.platform() === 'linux') {
    const linuxPaths = [
      '/snap/bin/godot',
      '/var/lib/flatpak/exports/bin/org.godotengine.Godot',
    ];
    for (const p of linuxPaths) {
      if (fs.existsSync(p)) return p;
    }
  }

  // 5. Windows common install paths
  if (os.platform() === 'win32') {
    const winPaths = [
      'C:\\Program Files\\Godot\\Godot.exe',
      'C:\\Program Files (x86)\\Godot\\Godot.exe',
      path.join(os.homedir(), 'AppData\\Local\\Programs\\Godot\\Godot.exe'),
    ];
    for (const p of winPaths) {
      if (fs.existsSync(p)) return p;
    }
  }

  return null;
}

/**
 * Get Godot version information (async — does not block the event loop).
 */
export async function getGodotVersion(godotPath: string): Promise<GodotVersionInfo> {
  try {
    const { stdout } = await execFileAsync(godotPath, ['--version'], { timeout: 5000 });
    const version = (stdout || '').trim();

    return {
      version: version || 'unknown',
      path: godotPath,
      platform: os.platform(),
    };
  } catch {
    return {
      version: 'unknown',
      path: godotPath,
      platform: os.platform(),
    };
  }
}

/**
 * Track a spawned process: capture its stdout/stderr into a bounded ring buffer
 * and register it in `spawnedProcesses`. The entry is automatically removed
 * 60s after the process exits (output stays available for `monitor_output`
 * queries in the meantime), preventing unbounded memory growth.
 */
function trackProcess(proc: ChildProcess): void {
  const output: string[] = [];
  proc.stdout?.on('data', (data: Buffer) => {
    const lines = data.toString().split('\n');
    for (const line of lines) {
      if (output.length >= MAX_OUTPUT_LINES) output.shift();
      output.push(line);
    }
  });
  proc.stderr?.on('data', (data: Buffer) => {
    const lines = data.toString().split('\n');
    for (const line of lines) {
      if (output.length >= MAX_OUTPUT_LINES) output.shift();
      output.push(line);
    }
  });

  const pid = proc.pid || -1;
  spawnedProcesses.set(pid, { process: proc, output });
  proc.unref();

  // 进程退出后 60s 自动清理 map 条目，避免长期运行内存增长
  proc.on('exit', () => {
    const timer = setTimeout(() => {
      spawnedProcesses.delete(pid);
    }, 60_000);
    timer.unref?.();
  });
}

/**
 * Launch Godot editor for a project.
 */
export function launchGodotEditor(
  godotPath: string,
  projectPath: string,
  scene?: string
): SpawnedProcess {
  const args: string[] = ['--path', projectPath, '-e'];
  if (scene) {
    args.push(scene);
  }

  const proc = spawn(godotPath, args, {
    detached: true,
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  const spawned: SpawnedProcess = {
    pid: proc.pid || -1,
    command: `${godotPath} ${args.join(' ')}`,
    startedAt: new Date().toISOString(),
  };

  trackProcess(proc);

  return spawned;
}

/**
 * Run a Godot project.
 */
export function runGodotProject(
  godotPath: string,
  projectPath: string,
  options?: {
    scene?: string;
    headless?: boolean;
    debug?: boolean;
    window_size?: string;
  }
): SpawnedProcess {
  const args: string[] = ['--path', projectPath];
  if (options?.scene) {
    args.push(options.scene);
  }
  if (options?.headless) {
    args.push('--headless');
  }
  if (options?.debug) {
    args.push('--debug');
  }
  if (options?.window_size) {
    args.push('--resolution', options.window_size);
  }

  const proc = spawn(godotPath, args, {
    detached: true,
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  const spawned: SpawnedProcess = {
    pid: proc.pid || -1,
    command: `${godotPath} ${args.join(' ')}`,
    startedAt: new Date().toISOString(),
  };

  const output: string[] = [];
  proc.stdout?.on('data', (data: Buffer) => {
    const lines = data.toString().split('\n');
    for (const line of lines) {
      if (output.length >= MAX_OUTPUT_LINES) output.shift();
      output.push(line);
    }
  });
  proc.stderr?.on('data', (data: Buffer) => {
    const lines = data.toString().split('\n');
    for (const line of lines) {
      if (output.length >= MAX_OUTPUT_LINES) output.shift();
      output.push(line);
    }
  });

  spawnedProcesses.set(proc.pid || -1, { process: proc, output });
  proc.unref();

  return spawned;
}

/**
 * Export a Godot project using an export preset.
 * godot --path <project> --export <preset> <output_path>
 */
export function exportGodotProject(
  godotPath: string,
  projectPath: string,
  preset: string,
  outputPath: string
): SpawnedProcess {
  const args: string[] = ['--path', projectPath, '--export', preset, outputPath];

  const proc = spawn(godotPath, args, {
    detached: true,
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  const spawned: SpawnedProcess = {
    pid: proc.pid || -1,
    command: `${godotPath} ${args.join(' ')}`,
    startedAt: new Date().toISOString(),
  };

  const output: string[] = [];
  proc.stdout?.on('data', (data: Buffer) => {
    const lines = data.toString().split('\n');
    for (const line of lines) {
      if (output.length >= MAX_OUTPUT_LINES) output.shift();
      output.push(line);
    }
  });
  proc.stderr?.on('data', (data: Buffer) => {
    const lines = data.toString().split('\n');
    for (const line of lines) {
      if (output.length >= MAX_OUTPUT_LINES) output.shift();
      output.push(line);
    }
  });

  spawnedProcesses.set(proc.pid || -1, { process: proc, output });
  proc.unref();

  return spawned;
}

/**
 * Get recent output from spawned processes.
 */
export function getRecentOutput(clear?: boolean): string[] {
  const allOutput: string[] = [];
  for (const [pid, data] of spawnedProcesses) {
    if (data.output.length > 0) {
      allOutput.push(`[PID ${pid}]`, ...data.output);

      // Check if process is still running
      try {
        if (data.process.exitCode !== null) {
          allOutput.push(`[PID ${pid}] Process exited with code ${data.process.exitCode}`);
        }
      } catch {
        // process reference might be stale
      }
    }
  }

  if (clear) {
    spawnedProcesses.clear();
  }

  return allOutput;
}

/**
 * Kill a specific spawned process.
 */
export function killProcess(pid: number): boolean {
  const entry = spawnedProcesses.get(pid);
  if (!entry) return false;

  try {
    entry.process.kill();
    return true;
  } catch {
    return false;
  }
}

/**
 * Clean up all spawned processes.
 */
export function cleanupProcesses(): void {
  for (const [pid, data] of spawnedProcesses) {
    try {
      data.process.kill();
    } catch {
      // already dead
    }
  }
  spawnedProcesses.clear();
}

/**
 * Capture a screenshot of the running Godot window (async).
 * Uses platform-native tools. All child processes are spawned with
 * argument arrays (never shell strings) to prevent injection.
 */
export async function captureScreenshot(
  outputPath: string,
  windowTitle: string = 'Godot',
  delay: number = 1
): Promise<{ success: boolean; message: string; path?: string }> {
  const platform = os.platform();

  try {
    if (platform === 'darwin') {
      const absPath = path.resolve(outputPath);

      // Try to find the Godot game window by title
      let windowID = '';
      try {
        // List all windows, find the one matching the title
        const script = `tell application "System Events" to get name of every window of every process whose name contains "godot"`;
        const { stdout: osaOutput } = await execFileAsync('osascript', ['-e', script], { timeout: 5000 });
        if (osaOutput.trim()) {
          const findWindowScript = `
            set windowList to {}
            tell application "System Events"
              repeat with p in (every process whose name contains "godot")
                repeat with w in (every window of p)
                  set end of windowList to (id of w) & "," & (name of w)
                end repeat
              end repeat
            end tell
            return windowList
          `;
          const { stdout: windowListOut } = await execFileAsync('osascript', ['-e', findWindowScript], { timeout: 5000 });
          const windowList = windowListOut.trim();
          const lines = windowList.split(', ');
          for (let i = 0; i < lines.length - 1; i += 2) {
            const id = lines[i];
            const name = lines[i + 1];
            // Match: game window typically has the project name or "Godot Engine" / "Godot"
            if (name && (name.includes(windowTitle) || name.toLowerCase().includes('godot'))) {
              windowID = id;
              break;
            }
          }
        }
      } catch {
        // osascript failed, fall back to active window capture
      }

      // Await the actual capture (spawn + promise, args passed literally, no shell)
      if (windowID) {
        await spawnAwait('screencapture', ['-T', String(delay), '-l', windowID, absPath], 15000);
      } else {
        await spawnAwait('screencapture', ['-T', String(delay), '-w', absPath], 15000);
      }

      if (fs.existsSync(absPath)) {
        return { success: true, message: `Screenshot saved to ${absPath} (${windowID ? `window #${windowID}` : 'active window'})`, path: absPath };
      }
      return { success: false, message: 'screencapture failed to create output file' };
    }

    if (platform === 'linux') {
      const absPath = path.resolve(outputPath);
      let captured = false;
      try {
        await spawnAwait('import', ['-window', 'root', '-delay', '100', absPath], 8000);
        captured = fs.existsSync(absPath);
      } catch {
        // fallback: try gnome-screenshot
      }
      if (!captured) {
        try {
          await spawnAwait('gnome-screenshot', ['-f', absPath], 8000);
        } catch {
          // no screenshot tool available
        }
      }
      if (fs.existsSync(absPath)) {
        return { success: true, message: `Screenshot saved to ${absPath}`, path: absPath };
      }
      return { success: false, message: 'No Linux screenshot tool found (install imagemagick or gnome-screenshot)' };
    }

    if (platform === 'win32') {
      // Windows: use PowerShell to capture screen.
      // absPath is embedded as a PowerShell single-quoted literal; single quotes
      // inside the path are escaped by doubling. Inside single quotes, $ and ;
      // are literal, so no further escaping is needed.
      const absPath = path.resolve(outputPath);
      const psCmd = `Add-Type -AssemblyName System.Windows.Forms; $s=[System.Windows.Forms.Screen]::AllScreens[0]; $b=new-object Drawing.Bitmap($s.Bounds.Width,$s.Bounds.Height); $g=[Drawing.Graphics]::FromImage($b); $g.CopyFromScreen($s.Bounds.Location, [Drawing.Point]::Empty, $s.Bounds.Size); $b.Save('${absPath.replace(/'/g, "''")}'); $g.Dispose(); $b.Dispose()`;
      await spawnAwait('powershell', ['-Command', psCmd], 10000);
      if (fs.existsSync(absPath)) {
        return { success: true, message: `Screenshot saved to ${absPath}`, path: absPath };
      }
      return { success: false, message: 'PowerShell screenshot failed' };
    }

    return { success: false, message: `Unsupported platform: ${platform}` };
  } catch (err: any) {
    return { success: false, message: `Screenshot error: ${err.message}` };
  }
}

/** Spawn a process and await its exit (resolves even on non-zero exit code). */
function spawnAwait(command: string, args: string[], timeoutMs: number): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: 'ignore' });
    const timer = setTimeout(() => {
      try { child.kill(); } catch { /* best effort */ }
      reject(new Error(`"${command}" timed out after ${timeoutMs}ms`));
    }, timeoutMs);
    child.on('error', (err) => { clearTimeout(timer); reject(err); });
    child.on('exit', () => { clearTimeout(timer); resolve(); });
  });
}

/**
 * Detect if the Godot editor is currently running (async).
 * Also checks if any project is being played from the editor.
 */
export async function detectRunningGodot(): Promise<{ running: boolean; editor: boolean; playing: boolean; pids: string[] }> {
  const platform = os.platform();
  const result = { running: false, editor: false, playing: false, pids: [] as string[] };

  try {
    let output = '';
    if (platform === 'darwin' || platform === 'linux') {
      const { stdout } = await execFileAsync('ps', ['aux'], { timeout: 3000 });
      output = stdout;
    } else if (platform === 'win32') {
      const { stdout } = await execFileAsync('tasklist', ['/FI', 'IMAGENAME eq Godot*'], { timeout: 3000 });
      output = stdout;
    }

    // Filter to Godot-related lines (was: `ps aux | grep -i '[Gg]odot' | grep -v grep`)
    const lines = output
      .split('\n')
      .filter(l => /godot/i.test(l) && !/grep/.test(l) && l.trim().length > 0);

    if (lines.length === 0) return result;

    result.running = true;

    for (const line of lines) {
      // Extract PID (column 2 on macOS/Linux `ps aux`)
      const parts = line.trim().split(/\s+/);
      if (parts.length >= 2) {
        const pid = parts[1];
        if (!isNaN(Number(pid)) && !result.pids.includes(pid)) {
          result.pids.push(pid);
        }
      }

      // Detect if running as editor (has --editor, -e, or --path flags)
      if (line.includes('--editor') || line.includes(' -e ') || line.includes('--path')) {
        result.editor = true;
      }
    }

    // Also check the spawnedProcesses map for editor/game processes
    for (const [pid, data] of spawnedProcesses) {
      if (data.process.exitCode === null) {
        // Process still running
        if (!result.pids.includes(String(pid))) {
          result.pids.push(String(pid));
        }
        if (data.process.spawnargs?.some((a: string) => a === '-e' || a === '--editor')) {
          result.editor = true;
        }
      }
    }

    // Check if any project is playing (has --project flag without -e)
    for (const [pid, data] of spawnedProcesses) {
      const args = data.process.spawnargs || [];
      if (args.includes('--path') && !args.includes('-e') && !args.includes('--editor')) {
        result.playing = true;
      }
    }

    return result;
  } catch {
    return result;
  }
}
