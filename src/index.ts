#!/usr/bin/env node
// ============================================================
// Godot MCP Server - Entry Point
// ============================================================

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { GodotMcpServer } from './server.js';
import { findGodotBinary } from './utils/godot_cli.js';
import { findProjectRoot } from './utils/file_utils.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function parseArgs(): { projectPath?: string; godotPath?: string; help?: boolean; installAddons?: boolean } {
  const args = process.argv.slice(2);
  const result: { projectPath?: string; godotPath?: string; help?: boolean; installAddons?: boolean } = {};

  for (let i = 0; i < args.length; i++) {
    switch (args[i]) {
      case '--project-path':
      case '-p':
        result.projectPath = args[++i];
        break;
      case '--godot-path':
      case '-g':
        result.godotPath = args[++i];
        break;
      case '--help':
      case '-h':
        result.help = true;
        break;
      case '--install-addons':
        result.installAddons = true;
        break;
    }
  }

  return result;
}

function printHelp(): void {
  console.log(`
Godot MCP Server - Model Context Protocol server for Godot Engine

USAGE:
  godot-mcp [options]

OPTIONS:
  --project-path, -p <path>  Path to Godot project root (default: auto-detect)
  --godot-path, -g <path>    Path to Godot binary (default: auto-detect)
  --install-addons            Copy the editor plugin (addons/) to the target Godot project
  --help, -h                  Show this help message

EXAMPLES:
  godot-mcp                        # Auto-detect project and Godot
  godot-mcp -p /path/to/project    # Specify project path
  godot-mcp -g /usr/local/bin/godot # Specify Godot binary
  godot-mcp --install-addons -p /path/to/project  # Install addons to project

This server uses stdio transport for MCP communication.
Configure it in your AI client's MCP settings.
`);
}

/**
 * 将包内 addons/godot_mcp 目录复制到目标 Godot 工程
 * 包结构: <pkg>/addons/godot_mcp/  →  <project>/addons/godot_mcp/
 */
function installAddonsToProject(projectPath: string): void {
  // 定位包内 addons 目录（dist/index.js → ../addons/godot_mcp）
  const sourceAddons = path.resolve(__dirname, '..', 'addons', 'godot_mcp');
  const targetAddons = path.join(projectPath, 'addons', 'godot_mcp');

  if (!fs.existsSync(sourceAddons)) {
    console.error(`Error: addons directory not found at "${sourceAddons}"`);
    process.exit(1);
  }

  if (!fs.existsSync(path.join(sourceAddons, 'plugin.cfg'))) {
    console.error(`Error: plugin.cfg not found in "${sourceAddons}" — invalid plugin directory`);
    process.exit(1);
  }

  // 确保目标 addons 目录存在
  fs.mkdirSync(path.dirname(targetAddons), { recursive: true });

  // 复制整个插件目录
  fs.cpSync(sourceAddons, targetAddons, { recursive: true, force: true });

  console.log(`✅ Editor plugin installed: addons/godot_mcp → ${targetAddons}`);
  console.log('   In Godot: Project → Project Settings → Plugins → Enable "Godot MCP"');
}

async function main(): Promise<void> {
  const config = parseArgs();

  if (config.help) {
    printHelp();
    process.exit(0);
  }

  // --install-addons: 仅复制 addons 到工程，不启动 MCP 服务
  if (config.installAddons) {
    if (!config.projectPath) {
      console.error('Error: --install-addons requires --project-path (-p) to specify the target Godot project.');
      process.exit(1);
    }
    const root = findProjectRoot(config.projectPath);
    if (!root) {
      console.error(`Error: No Godot project found at "${config.projectPath}" (project.godot not found)`);
      process.exit(1);
    }
    installAddonsToProject(root);
    process.exit(0);
  }

  // Set GODOT_PATH env var if provided via CLI
  if (config.godotPath) {
    process.env.GODOT_PATH = config.godotPath;
  }

  // Validate project path if provided
  if (config.projectPath) {
    const root = findProjectRoot(config.projectPath);
    if (!root) {
      console.error(`Error: No Godot project found at "${config.projectPath}" (project.godot not found)`);
      process.exit(1);
    }
  }

  // Optionally detect Godot binary for startup message
  const godotBinary = findGodotBinary();
  if (!godotBinary) {
    console.error('Warning: Godot binary not found. Set GODOT_PATH or install Godot for engine control features.');
  }

  const server = new GodotMcpServer(config.projectPath);
  await server.run();
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
