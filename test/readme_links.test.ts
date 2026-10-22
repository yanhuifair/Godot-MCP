// Copyright (c) 2026 FairYan
// SPDX-License-Identifier: AGPL-3.0-or-later
// ============================================================
// README 内部锚点校验
// ============================================================
// README 有 50+ 个 `](#anchor)` 内部跳转（目录、客户端索引、工具分类索引）。
// 改标题（尤其是中英两份同时改）时很容易把锚点改坏，而 GitHub 不会报错，
// 只是点了不跳 —— 线上才会被发现。这里按 GitHub 的 slug 规则静态校验。
// ============================================================

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(__dirname, '..');

/** GitHub 标题锚点规则：小写 → 去掉 markdown 标记 → 去掉标点（保留空格/连字符）→ 空格换 '-'。 */
function slug(heading: string): string {
  return heading
    .trim()
    .toLowerCase()
    .replace(/[`*_]/g, '')
    .replace(/[^\w\s\-\u4e00-\u9fff]/g, '')
    .replace(/ /g, '-');
}

function anchorsOf(markdown: string): { slugs: Set<string>; links: string[] } {
  // 代码块里的 `## foo` 是示例内容，不是标题
  const body = markdown.replace(/```[\s\S]*?```/g, '');
  const slugs = new Set<string>();
  for (const m of body.matchAll(/^#{1,6}\s+(.+)$/gm)) slugs.add(slug(m[1]));
  const links = [...body.matchAll(/\]\(#([^)]+)\)/g)].map((m) => m[1]);
  return { slugs, links };
}

describe('README internal anchors', () => {
  for (const file of ['README.md', 'README-zh.md']) {
    it(`${file} has no broken #anchors`, () => {
      const { slugs, links } = anchorsOf(fs.readFileSync(path.join(ROOT, file), 'utf8'));
      const broken = [...new Set(links.filter((l) => !slugs.has(l)))];
      expect(broken, `broken anchors in ${file}: ${broken.join(', ')}`).toEqual([]);
      expect(links.length).toBeGreaterThan(20); // 目录/索引确实存在
    });
  }

  it('both language versions link to each other', () => {
    const en = fs.readFileSync(path.join(ROOT, 'README.md'), 'utf8');
    const zh = fs.readFileSync(path.join(ROOT, 'README-zh.md'), 'utf8');
    expect(en).toContain('README-zh.md');
    expect(zh).toContain('README.md');
  });

  it('no leaked internal paths or stale version numbers', () => {
    for (const file of ['README.md', 'README-zh.md']) {
      const text = fs.readFileSync(path.join(ROOT, file), 'utf8');
      // 本机绝对路径不该出现在文档里
      expect(text, `${file} leaks a local path`).not.toMatch(/\/Users\/Fair/);
      // 硬编码的旧版本号样例（会随时间过期）
      expect(text, `${file} hardcodes an old version`).not.toMatch(/godot-mcp-1\.\d+\.\d+\.vsix/);
    }
  });
});
