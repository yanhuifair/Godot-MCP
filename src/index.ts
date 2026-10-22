#!/usr/bin/env node
// Copyright (c) 2026 FairYan
// SPDX-License-Identifier: AGPL-3.0-or-later
// ============================================================
// Godot MCP Server - Entry Point (v1.12.16)
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
import { VERSION } from './utils/version.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// ---- 全局异常兜底：防止未捕获的 rejection/异常导致进程崩溃 ----
process.on('unhandledRejection', (reason) => {
  console.error('[Godot MCP] Unhandled rejection:', reason);
});
process.on('uncaughtException', (err) => {
  console.error('[Godot MCP] Uncaught exception:', err);
});

/**
 * 校验 --port：必须是 0–65535 的整数。
 * 不校验的话 `--port abc` → parseInt → NaN → 一路传到 app.listen()，
 * 最后以 "Fatal error: RangeError [ERR_SOCKET_BAD_PORT]" 收场，用户只看到
 * 一句莫名其妙的崩溃，而不是"端口不是数字"。
 */
function parsePort(raw: string | undefined): number {
  if (raw === undefined || !/^\d+$/.test(raw.trim())) {
    console.error(`Error: --port expects a port number, got "${raw ?? ''}". Use --help for usage.`);
    process.exit(1);
  }
  const port = parseInt(raw.trim(), 10);
  if (port < 0 || port > 65535) {
    console.error(`Error: --port must be between 0 and 65535, got ${port}.`);
    process.exit(1);
  }
  return port;
}

// ---- Transport 类型 ----

type TransportMode = 'stdio' | 'sse' | 'streamable-http' | 'all';

interface CliConfig {
  projectPath?: string;
  godotPath?: string;
  help?: boolean;
  version?: boolean;
  installAddons?: boolean;
  enablePlugin?: boolean;
  readOnly?: boolean;
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
      // README 一直把 `--version` 写成「查看版本的命令」，但它之前根本没实现——
      // 传进去会被当成未知参数忽略，然后照常启动 stdio 服务器并挂住等 stdin。
      case '--version':
      case '-v':
        result.version = true;
        break;
      case '--install-addons':
        result.installAddons = true;
        break;
      case '--enable-plugin':
        result.enablePlugin = true;
        break;
      case '--read-only':
        result.readOnly = true;
        break;
      case '--transport':
      case '-t':
        result.transport = args[++i] as TransportMode;
        break;
      case '--port':
        // 不校验的话 `--port abc` → parseInt → NaN → 一路传到 app.listen()，
        // 最后抛 ERR_SOCKET_BAD_PORT 并以 "Fatal error: RangeError" 收场。
        // 用户只看到一句莫名其妙的崩溃，而不是"端口不是数字"。
        result.port = parsePort(args[++i]);
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
同时支持四种通信方式：Stdio、SSE、Streamable HTTP，以及编辑器插件 TCP 桥 (:9876)

USAGE:
  godot-mcp [options]

OPTIONS:
  --project-path, -p <path>  Godot 项目根目录（默认：自动检测）
  --godot-path, -g <path>    Godot 可执行文件路径（默认：自动检测）
  --install-addons            将编辑器插件 (addons/) 安装到目标项目
  --enable-plugin             安装 addons 并自动在 project.godot 中启用插件
  --read-only                 只读模式：拒绝 223 个写/副作用工具（安全模式）

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
  --version, -v              显示版本号并退出

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

  # HTTP 客户端 (SSE) — HTTP 端点一律需要令牌：
  #   令牌在启动时打印到 stderr（首次生成后写入 <工程>/.godot/mcp_http_token 并复用），
  #   也可以自己 export GODOT_MCP_TOKEN 固定住。
  {
    "mcpServers": {
      "godot-mcp": {
        "url": "http://127.0.0.1:3000/sse",
        "headers": { "Authorization": "Bearer <token>" }
      }
    }
  }

  # HTTP 客户端 (Streamable HTTP):
  {
    "mcpServers": {
      "godot-mcp": {
        "url": "http://127.0.0.1:3000/mcp",
        "transportType": "streamable-http",
        "headers": { "Authorization": "Bearer <token>" }
      }
    }
  }
`);
}

// ---- Addons 安装 ----

function installAddonsToProject(projectPath: string): void {
  const sourceAddons = path.resolve(__dirname, '..', 'addons', 'godot-mcp');
  const targetAddons = path.join(projectPath, 'addons', 'godot-mcp');

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

  console.log(`✅ Editor plugin installed: addons/godot-mcp → ${targetAddons}`);
  console.log('   In Godot: Project → Project Settings → Plugins → Enable "Godot MCP"');
}

const PLUGIN_CFG_RES = '"res://addons/godot-mcp/plugin.cfg"';

/**
 * 在 project.godot 的 [editor_plugins] 段里补上本插件。
 *
 * 只在**段内**做外科手术式改写，不走 parseConfig/serializeConfig 全量回写：
 * 序列化器会按自己的风格重写整个文件（Godot 写 `key=value`，我们写 `key = value`），
 * 一次 `--enable-plugin` 就把用户的 project.godot 每行都改一遍，diff 噪音太大。
 *
 * 以前这里是手搓字符串拼接，且兜底分支拼的是 `editor_plugins]`（少了左方括号），
 * 会写出一个畸形段头、把配置文件搞坏 —— 现在统一走这个函数。
 *
 * 返回 true 表示文件确实被改了。
 */
function enablePluginInProjectFile(projectFile: string): boolean {
  const original = fs.readFileSync(projectFile, 'utf-8');
  const lines = original.split('\n');

  const sectionIdx = lines.findIndex((l) => /^\s*\[editor_plugins\]\s*$/.test(l));
  const enabledLine = (plugins: string[]): string =>
    `enabled=PackedStringArray(${plugins.join(', ')})`;

  if (sectionIdx === -1) {
    // 没有该段：直接在末尾追加（注意段头必须是 `[editor_plugins]`）
    const tail = original.endsWith('\n') || original === '' ? '' : '\n';
    fs.writeFileSync(
      projectFile,
      `${original}${tail}\n[editor_plugins]\n${enabledLine([PLUGIN_CFG_RES])}\n`
    );
    return true;
  }

  // 找到该段的结束位置（下一个段头或文件末尾）
  let endIdx = lines.length;
  for (let i = sectionIdx + 1; i < lines.length; i++) {
    if (/^\s*\[.+\]\s*$/.test(lines[i])) { endIdx = i; break; }
  }

  // 段内已有的 enabled 行
  const enabledIdx = lines.findIndex(
    (l, i) => i > sectionIdx && i < endIdx && /^\s*enabled\s*=/.test(l)
  );

  if (enabledIdx === -1) {
    lines.splice(sectionIdx + 1, 0, enabledLine([PLUGIN_CFG_RES]));
    fs.writeFileSync(projectFile, lines.join('\n'));
    return true;
  }

  const line = lines[enabledIdx];
  const m = line.match(/PackedStringArray\(([^)]*)\)/);
  const plugins = m
    ? m[1].split(',').map((s) => s.trim()).filter(Boolean)
    : [];
  if (plugins.includes(PLUGIN_CFG_RES)) return false; // 已经启用，别动文件

  plugins.push(PLUGIN_CFG_RES);
  // 保留原来的缩进与 key 写法，只换掉值
  const indent = (line.match(/^\s*/) ?? [''])[0];
  const key = (line.match(/^\s*(enabled)\s*=/) ?? [])[1] ?? 'enabled';
  lines[enabledIdx] = `${indent}${key}=PackedStringArray(${plugins.join(', ')})`;
  fs.writeFileSync(projectFile, lines.join('\n'));
  return true;
}

// ---- 主入口 ----

async function main(): Promise<void> {
  const config = parseArgs();

  if (config.help) {
    printHelp();
    process.exit(0);
  }

  // README 把 `--version` 写成查看版本的命令，这里必须真的处理它并退出：
  // 否则参数被忽略 → 照常进 stdio 服务器 → 客户端以为命令卡死。
  if (config.version) {
    console.log(VERSION);
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

  // --enable-plugin: 安装 addons 并自动在 project.godot 中启用插件
  if (config.enablePlugin) {
    if (!config.projectPath) {
      console.error('Error: --enable-plugin requires --project-path (-p) to specify the target Godot project.');
      process.exit(1);
    }
    const root = findProjectRoot(config.projectPath);
    if (!root) {
      console.error(`Error: No Godot project found at "${config.projectPath}" (project.godot not found)`);
      process.exit(1);
    }
    installAddonsToProject(root);

    // Auto-enable plugin in project.godot
    const projectFile = path.join(root, 'project.godot');
    const changed = enablePluginInProjectFile(projectFile);
    console.log(changed
      ? '✅ Editor plugin enabled in project.godot'
      : '✅ Editor plugin was already enabled in project.godot');
    console.log('   Restart Godot for the plugin to take effect.');
    process.exit(0);
  }

  // 设置 GODOT_PATH 环境变量
  if (config.godotPath) {
    process.env.GODOT_PATH = config.godotPath;
  }

  // --read-only: 设置全局只读模式
  if (config.readOnly) {
    process.env.GODOT_MCP_READ_ONLY = 'true';
    console.error('[Godot MCP] Running in READ-ONLY mode — write operations will be rejected');
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
      // HTTP 服务在后台运行，Stdio 在主线程；HTTP 启动失败（如端口占用）直接报错退出
      runHttpTransport({
        port,
        host,
        projectRoot: projectPath,
        enableSse,
        enableStreamableHttp,
      }).catch((err: unknown) => {
        console.error(`[Godot MCP] HTTP server failed to start: ${err instanceof Error ? err.message : String(err)}`);
        process.exit(1);
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
