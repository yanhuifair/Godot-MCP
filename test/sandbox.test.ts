// ============================================================
// Security / Sandbox Tests
//
// 这些用例对应 2026-09-21 审计中发现的、已用 PoC 证实的逃逸与注入问题。
// 此前 test/ 下没有任何路径沙箱相关测试——沙箱零覆盖正是符号链接写逃逸
// 长期没被发现的原因。每一条都对应一个具体的历史缺陷，不要删除。
// ============================================================

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

let root: string;      // “工程根”
let outside: string;   // 工程外目录（攻击目标）

beforeEach(() => {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), 'godot-mcp-sec-'));
  root = path.join(base, 'project');
  outside = path.join(base, 'outside');
  fs.mkdirSync(root, { recursive: true });
  fs.mkdirSync(outside, { recursive: true });
  fs.writeFileSync(path.join(outside, 'secret.txt'), 'TOP SECRET');
});

afterEach(() => {
  try {
    fs.rmSync(path.dirname(root), { recursive: true, force: true });
  } catch { /* best effort */ }
});

// ---- resolveProjectPath ----

describe('resolveProjectPath 沙箱', () => {
  it('拒绝绝对路径', async () => {
    const { resolveProjectPath } = await import('../src/utils/file_utils.js');
    expect(() => resolveProjectPath(root, '/etc/passwd')).toThrow(/Absolute path not allowed/);
  });

  it('拒绝 ../ 穿越', async () => {
    const { resolveProjectPath } = await import('../src/utils/file_utils.js');
    expect(() => resolveProjectPath(root, '../outside/secret.txt')).toThrow(/resolves outside project root/);
  });

  it('允许工程内的普通路径（含尚不存在的新文件）', async () => {
    const { resolveProjectPath } = await import('../src/utils/file_utils.js');
    expect(resolveProjectPath(root, 'scenes/main.tscn')).toContain('scenes');
    expect(() => resolveProjectPath(root, 'scenes/new.tscn')).not.toThrow();
  });

  it('拒绝读取指向工程外的符号链接', async () => {
    const { resolveProjectPath } = await import('../src/utils/file_utils.js');
    fs.symlinkSync(outside, path.join(root, 'link'));
    expect(() => resolveProjectPath(root, 'link/secret.txt')).toThrow(/resolves outside project root/);
  });

  it('拒绝写入经符号链接逃逸的“尚不存在”路径', async () => {
    // 目标不存在时若不做父链 realpath，校验会通过、写操作却顺着链接落到工程外。
    const { resolveProjectPath, writeTextFile } = await import('../src/utils/file_utils.js');
    fs.symlinkSync(outside, path.join(root, 'link'));
    expect(() => resolveProjectPath(root, 'link/escaped.txt')).toThrow(/resolves outside project root/);
    expect(fs.existsSync(path.join(outside, 'escaped.txt'))).toBe(false);
    // 反向确认这条路径本来真的能写出去（防止测试因其它原因“假通过”）
    expect(() => writeTextFile(path.join(outside, 'writable.txt'), 'x', false)).not.toThrow();
  });

  it('拒绝导出签名凭据文件', async () => {
    const { resolveProjectPath } = await import('../src/utils/file_utils.js');
    fs.mkdirSync(path.join(root, '.godot'), { recursive: true });
    expect(() => resolveProjectPath(root, '.godot/export_credentials.cfg'))
      .toThrow(/export_credentials\.cfg is not allowed/);
  });

  it('isPathWithin 正确区分内外', async () => {
    const { isPathWithin } = await import('../src/utils/file_utils.js');
    expect(isPathWithin(root, path.join(root, 'a/b.txt'))).toBe(true);
    expect(isPathWithin(root, root)).toBe(true);
    expect(isPathWithin(root, path.join(outside, 'secret.txt'))).toBe(false);
    // 前缀相同但不同目录，不能被当成“在里面”
    expect(isPathWithin(root, `${root}-evil/x`)).toBe(false);
  });
});

// ---- 日志路径（log_path 来自 project.godot，可能是不可信工程提供的） ----

describe('read_game_log 的 log_path 沙箱', () => {
  const writeProject = (logPath: string) => {
    fs.writeFileSync(path.join(root, 'project.godot'), [
      'config_version=5',
      '',
      '[application]',
      'config/name="SecTest"',
      '',
      '[debug]',
      'file_logging/enable_file_logging=true',
      `file_logging/log_path="${logPath}"`,
    ].join('\n'));
  };

  it('拒绝绝对路径指向工程外（审计 PoC：/etc/hosts 可被读出）', async () => {
    const { handleReadGameLog } = await import('../src/tools/logs.js');
    writeProject(path.join(outside, 'secret.txt'));
    const res = handleReadGameLog(root, {});
    expect(res.isError).toBe(true);
    expect(res.content[0].text).toMatch(/Refusing to touch this log path/);
    expect(res.content[0].text).not.toContain('TOP SECRET');
  });

  it('拒绝 .. 穿越到工程外', async () => {
    const { handleReadGameLog } = await import('../src/tools/logs.js');
    writeProject(`res://../outside/secret.txt`);
    const res = handleReadGameLog(root, {});
    expect(res.isError).toBe(true);
    expect(res.content[0].text).not.toContain('TOP SECRET');
  });

  it('绝对路径即使落在工程内，也不放过凭据文件', async () => {
    const { handleReadGameLog } = await import('../src/tools/logs.js');
    fs.mkdirSync(path.join(root, '.godot'), { recursive: true });
    writeProject(path.join(root, '.godot', 'export_credentials.cfg'));
    const res = handleReadGameLog(root, {});
    expect(res.isError).toBe(true);
    expect(res.content[0].text).toMatch(/Refusing to touch this log path/);
  });

  it('默认 user:// 路径不受影响（非误伤）', async () => {
    const { handleReadGameLog } = await import('../src/tools/logs.js');
    writeProject('user://logs/godot.log');
    const res = handleReadGameLog(root, {});
    expect(res.content[0].text).not.toMatch(/Refusing to touch/);
  });
});

// ---- 配置写入注入 ----

describe('project.godot 写入不可注入', () => {
  const freshProject = () => {
    fs.writeFileSync(path.join(root, 'project.godot'), [
      'config_version=5',
      '',
      '[application]',
      'config/name="SecTest"',
    ].join('\n'));
  };

  it('value 里的换行不能再注入出一个 [autoload] 段', async () => {
    const { handleWriteProjectConfig } = await import('../src/tools/project.js');
    freshProject();
    const res = handleWriteProjectConfig(root, {
      section: 'application',
      key: 'x',
      value: '1\n\n[autoload]\nEvil="*res://evil.gd"',
    });
    expect(res.isError).toBe(true);
    const after = fs.readFileSync(path.join(root, 'project.godot'), 'utf-8');
    expect(after).not.toContain('[autoload]');
    expect(after).not.toContain('evil.gd');
  });

  it('section / key 里的换行被拒绝', async () => {
    const { handleWriteProjectConfig } = await import('../src/tools/project.js');
    freshProject();
    expect(handleWriteProjectConfig(root, { section: 'a\nb', key: 'k', value: '1' }).isError).toBe(true);
    expect(handleWriteProjectConfig(root, { section: 'a', key: 'k\n[autoload]', value: '1' }).isError).toBe(true);
    const after = fs.readFileSync(path.join(root, 'project.godot'), 'utf-8');
    expect(after).not.toContain('[autoload]');
  });

  it('add_autoload 的 path 会被转义，不能带出引号', async () => {
    const { handleAddAutoload } = await import('../src/tools/project.js');
    freshProject();
    const res = handleAddAutoload(root, { name: 'Evil', path: 'res://a.gd"\n\n[autoload]\nBad="*res://bad.gd' });
    const after = fs.readFileSync(path.join(root, 'project.godot'), 'utf-8');
    // 按「行」判断：值里被转义后的 \n 只是文本，不能真的形成新的 section 行
    const sectionLines = after.split('\n').filter((l) => /^\[autoload\]$/.test(l.trim()));
    expect(sectionLines.length).toBeLessThanOrEqual(1);
    const badKeys = after.split('\n').filter((l) => l.trim().startsWith('Bad='));
    expect(badKeys.length).toBe(0);
    expect(res.isError || !after.includes('\nBad=')).toBeTruthy();
  });

  it('write_input_action 的 action 名不能注入', async () => {
    const { handleWriteInputAction } = await import('../src/tools/project.js');
    freshProject();
    const res = handleWriteInputAction(root, { action: 'jump\n\n[autoload]\nEvil="*res://e.gd"' });
    const after = fs.readFileSync(path.join(root, 'project.godot'), 'utf-8');
    expect(res.isError).toBe(true);
    expect(after.split('\n').filter((l) => /^\[autoload\]$/.test(l.trim()))).toHaveLength(0);
  });
});

// ---- 配置序列化：注释位置 ----

describe('project.godot 往返不损坏注释归属', () => {
  it('段内注释留在自己的段里，不被搬到文件头', async () => {
    const { parseConfig, serializeConfig } = await import('../src/parsers/config_parser.js');
    const src = [
      '; file header',
      'config_version=5',
      '',
      '[application]',
      '; belongs to application',
      'config/name="Demo"',
      '',
      '[display]',
      '; belongs to display',
      'window/size/width=1152',
      '',
    ].join('\n');
    const out = serializeConfig(parseConfig(src));
    // 段头与首条注释之间会有一个空行（对齐 Godot 自己的 ConfigFile::save 布局）
    expect(out).toMatch(/\[application\]\n\n; belongs to application/);
    expect(out).toMatch(/\[display\]\n\n; belongs to display/);
    // 注释仍在正确的段内，没有被搬到文件头
    expect(out.indexOf('; belongs to application')).toBeGreaterThan(out.indexOf('[application]'));
    expect(out.indexOf('; belongs to display')).toBeGreaterThan(out.indexOf('[display]'));
  });

  it('往返两次结果稳定（不产生 diff 抖动）', async () => {
    const { parseConfig, serializeConfig } = await import('../src/parsers/config_parser.js');
    const src = '; h\nconfig_version=5\n\n[application]\n; note\nconfig/name="D"\n\n[display]\nwindow/size/width=1152\n';
    const once = serializeConfig(parseConfig(src));
    expect(serializeConfig(parseConfig(once))).toBe(once);
  });
});

// ---- 假成功 ----

describe('edit_scene 不再谎报成功', () => {
  const scenePath = () => {
    fs.writeFileSync(path.join(root, 'main.tscn'), [
      '[gd_scene format=3 uid="uid://csec0main"]',
      '',
      '[node name="Main" type="Node2D"]',
      '',
      '[node name="Player" type="CharacterBody2D" parent="."]',
      '',
    ].join('\n'));
    return path.join(root, 'main.tscn');
  };

  it('删除不存在的节点时报错，且文件未被改动', async () => {
    const { handleEditScene } = await import('../src/tools/scene.js');
    const abs = scenePath();
    const before = fs.readFileSync(abs, 'utf-8');
    const res = handleEditScene(root, {
      path: 'main.tscn',
      operations: [{ action: 'remove_node', node_path: 'Does/Not/Exist' }],
    } as any);
    expect(res.isError).toBe(true);
    expect(res.content[0].text).toMatch(/No operation was applied/);
    expect(fs.readFileSync(abs, 'utf-8')).toBe(before);
  });

  it('批量里部分失败时如实标注未执行的那几条', async () => {
    const { handleEditScene } = await import('../src/tools/scene.js');
    scenePath();
    const res = handleEditScene(root, {
      path: 'main.tscn',
      operations: [
        { action: 'modify_node', node_path: 'Player', properties: { visible: 'false' } },
        { action: 'remove_node', node_path: 'Nope' },
      ],
    } as any);
    expect(res.isError).toBeFalsy();
    expect(res.content[0].text).toMatch(/Not applied \(1 of 2\)/);
  });

  it('真的删除成功时不带任何告警', async () => {
    const { handleEditScene } = await import('../src/tools/scene.js');
    const abs = scenePath();
    const res = handleEditScene(root, {
      path: 'main.tscn',
      operations: [{ action: 'remove_node', node_path: 'Player' }],
    } as any);
    expect(res.isError).toBeFalsy();
    expect(res.content[0].text).not.toMatch(/Not applied/);
    expect(fs.readFileSync(abs, 'utf-8')).not.toContain('Player');
  });
});
