#!/usr/bin/env node
// ============================================================
// Godot MCP Server - Entry Point (v1.2.0)
// ============================================================
// 同时支持三种 MCP 通信协议：
//   - Stdio（标准输入输出，默认）
//   - SSE（Server-Sent Events，兼容旧客户端）
//   - Streamable HTTP（MCP 2025 规范）
// ============================================================

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { findGodotBinary } from './utils/godot_cli.js';
import { findProjectRoot } from './utils/file_utils.js';
import { runStdioTransport } from './transports/stdio.js';
import { runHttpTransport } from './transports/http-server.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// ---- Transport 类型 ----

type TransportMode = 'stdio' | 'sse' | 'streamable-http' | 'all';

interface CliConfig {
  projectPath?: string;
  godotPath?: string;
  help?: boolean;
  installAddons?: boolean;
  transport: TransportMode;
  port: number;
  host: string;
  enableSse: boolean;
  enableStreamableHttp: boolean;
}

// ---- CLI 参数解析 ----

function parseArgs(): CliConfig {
  const args = process.argv.slice(2);
  const result: CliConfig = {
    transport: 'stdio',
    port: 3000,
    host: '127.0.0.1',
    enableSse: true,
    enableStreamableHttp: true,
  };

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
      case '--transport':
      case '-t':
        result.transport = args[++i] as TransportMode;
        break;
      case '--port':
        result.port = parseInt(args[++i], 10);
        break;
      case '--host':
        result.host = args[++i];
        break;
      case '--no-sse':
        result.enableSse = false;
        break;
      case '--no-streamable-http':
        result.enableStreamableHttp = false;
        break;
    }
  }

  return result;
}

// ---- 帮助信息 ----

function printHelp(): void {
  console.log(`
Godot MCP Server - Model Context Protocol server for Godot Engine
──────────────────────────────────────────────────────────────────────
同时支持三种 MCP 通信协议：Stdio、SSE、Streamable HTTP

USAGE:
  godot-mcp [options]

OPTIONS:
  --project-path, -p <path>  Godot 项目根目录（默认：自动检测）
  --godot-path, -g <path>    Godot 可执行文件路径（默认：自动检测）
  --install-addons            将编辑器插件 (addons/) 安装到目标项目

TRANSPORT OPTIONS:
  --transport, -t <mode>     传输协议（默认：stdio）
                             可选值: stdio | sse | streamable-http | all
    stdio                     标准输入输出（适用于 Claude Desktop、VS Code）
    sse                       SSE over HTTP（兼容旧版 MCP 客户端）
    streamable-http           Streamable HTTP（MCP 2025 规范）
    all                       同时启动 Stdio + SSE + Streamable HTTP

  --port <number>            HTTP 服务端口（默认：3000）
  --host <string>            HTTP 监听地址（默认：127.0.0.1）
  --no-sse                   禁用 SSE 端点
  --no-streamable-http       禁用 Streamable HTTP 端点

  --help, -h                 显示此帮助信息

EXAMPLES:
  godot-mcp                                      # Stdio 模式（默认）
  godot-mcp -p /path/to/project                  # 指定项目路径
  godot-mcp -t sse --port 3000                   # SSE over HTTP
  godot-mcp -t streamable-http --port 8080       # Streamable HTTP
  godot-mcp -t all --port 3000                   # 同时三种协议
  godot-mcp --install-addons -p /path/to/project # 安装编辑器插件

CLIENT CONFIGURATION EXAMPLES:
  # Claude Desktop / VS Code (stdio):
  {
    "mcpServers": {
      "godot-mcp": {
        "command": "npx",
        "args": ["@yanhuifair/godot-mcp", "-p", "/path/to/project"]
      }
    }
  }

  # HTTP 客户端 (SSE):
  {
    "mcpServers": {
      "godot-mcp": {
        "url": "http://127.0.0.1:3000/sse"
      }
    }
  }

  # HTTP 客户端 (Streamable HTTP):
  {
    "mcpServers": {
      "godot-mcp": {
        "url": "http://127.0.0.1:3000/mcp",
        "transportType": "streamable-http"
      }
    }
  }
`);
}

// ---- Addons 安装 ----

function installAddonsToProject(projectPath: string): void {
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

  fs.mkdirSync(path.dirname(targetAddons), { recursive: true });
  fs.cpSync(sourceAddons, targetAddons, { recursive: true, force: true });

  console.log(`✅ Editor plugin installed: addons/godot_mcp → ${targetAddons}`);
  console.log('   In Godot: Project → Project Settings → Plugins → Enable "Godot MCP"');
}

// ---- 主入口 ----

async function main(): Promise<void> {
  const config = parseArgs();

  if (config.help) {
    printHelp();
    process.exit(0);
  }

  // --install-addons: 仅复制 addons 到工程
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

  // 设置 GODOT_PATH 环境变量
  if (config.godotPath) {
    process.env.GODOT_PATH = config.godotPath;
  }

  // 验证项目路径
  if (config.projectPath) {
    const root = findProjectRoot(config.projectPath);
    if (!root) {
      console.error(`Error: No Godot project found at "${config.projectPath}" (project.godot not found)`);
      process.exit(1);
    }
  }

  // Godot 二进制检测提醒
  const godotBinary = findGodotBinary();
  if (!godotBinary) {
    console.error('Warning: Godot binary not found. Set GODOT_PATH or install Godot for engine control features.');
  }

  // 根据 transport 模式启动
  const { transport, port, host, enableSse, enableStreamableHttp, projectPath } = config;

  switch (transport) {
    case 'stdio':
      // 纯 Stdio 模式（默认）
      await runStdioTransport({ projectRoot: projectPath });
      break;

    case 'sse':
      // 仅 SSE over HTTP
      await runHttpTransport({
        port,
        host,
        projectRoot: projectPath,
        enableSse: true,
        enableStreamableHttp: false,
      });
      break;

    case 'streamable-http':
      // 仅 Streamable HTTP
      await runHttpTransport({
        port,
        host,
        projectRoot: projectPath,
        enableSse: false,
        enableStreamableHttp: true,
      });
      break;

    case 'all':
      // 同时启动 Stdio + HTTP（SSE + Streamable HTTP）
      console.error('[Godot MCP] Starting all transports: Stdio + SSE + Streamable HTTP');
      // HTTP 服务在后台运行，Stdio 在主线程
      runHttpTransport({
        port,
        host,
        projectRoot: projectPath,
        enableSse,
        enableStreamableHttp,
      });
      await runStdioTransport({ projectRoot: projectPath });
      break;

    default:
      console.error(`Error: Unknown transport mode "${transport}". Use --help for usage.`);
      process.exit(1);
  }
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
