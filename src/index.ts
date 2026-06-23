#!/usr/bin/env node
// ============================================================
// Godot MCP Server - Entry Point
// ============================================================

import { GodotMcpServer } from './server.js';
import { findGodotBinary } from './utils/godot_cli.js';
import { findProjectRoot } from './utils/file_utils.js';

function parseArgs(): { projectPath?: string; godotPath?: string; help?: boolean } {
  const args = process.argv.slice(2);
  const result: { projectPath?: string; godotPath?: string; help?: boolean } = {};

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
  --help, -h                 Show this help message

EXAMPLES:
  godot-mcp                        # Auto-detect project and Godot
  godot-mcp -p /path/to/project    # Specify project path
  godot-mcp -g /usr/local/bin/godot # Specify Godot binary

This server uses stdio transport for MCP communication.
Configure it in your AI client's MCP settings.
`);
}

async function main(): Promise<void> {
  const config = parseArgs();

  if (config.help) {
    printHelp();
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
