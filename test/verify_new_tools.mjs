// 功能验证：导出预设写工具 + 本地化注册/.po 写工具
// 直接调用编译后的 handler，断言序列化产物符合 Godot 编辑器可加载格式。
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const root = process.cwd();
const project = await import(path.join(root, 'dist/tools/project.js'));
const trans = await import(path.join(root, 'dist/tools/translation.js'));

function assert(cond, msg) {
  if (!cond) { console.error('❌ FAIL:', msg); process.exitCode = 1; }
  else { console.log('✓', msg); }
}

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'godot-mcp-verify-'));
// 最小 project.godot（无 internationalization 段）
fs.writeFileSync(path.join(dir, 'project.godot'), '[application]\nconfig/name="V"\n');

// ---------- export_presets.cfg ----------
const h1 = project.handleCreateExportPreset(dir, { name: 'WinBuild', platform: 'Windows Desktop', runnable: true });
assert(!h1.isError, 'create_export_preset: 无错误 -> ' + (h1.content?.[0]?.text || ''));
const cfg1 = fs.readFileSync(path.join(dir, 'export_presets.cfg'), 'utf-8');
assert(cfg1.includes('[preset.0]'), '导出预设文件含 [preset.0]');
assert(cfg1.includes('name="WinBuild"'), '含 name=WinBuild');
assert(cfg1.includes('platform="Windows Desktop"'), '含平台 Windows Desktop');
assert(cfg1.includes('export_filter="all_resources"'), '含受强制要求的 export_filter');
assert(cfg1.includes('[preset.0.options]'), '含 options 段');
assert(cfg1.includes('[runnable_presets]'), '含 runnable_presets 段');
assert(/"Windows Desktop"="WinBuild"/.test(cfg1), 'runnable 映射 "Windows Desktop"=WinBuild（带引号）');

// 读回验证：quoted key 必须被解析为带空格的逻辑名，而非 "WindowsDesktop"
const rb = project.handleReadExportPresets(dir, {});
assert(!rb.isError && /Windows Desktop/.test(rb.content[0].text), '读回 export_presets 保留 "Windows Desktop" 平台名');

// 第二个预设（不同平台，避免 runnable 冲突）
const h2 = project.handleCreateExportPreset(dir, { name: 'LinuxBuild', platform: 'Linux', runnable: true });
assert(!h2.isError, 'create_export_preset #2 无错误');
const cfg2 = fs.readFileSync(path.join(dir, 'export_presets.cfg'), 'utf-8');
assert(cfg2.includes('[preset.1]'), '第二个预设为 [preset.1]');
assert(/Linux="LinuxBuild"/.test(cfg2), 'runnable 映射 Linux=LinuxBuild');

// 重复名应被拒
const dup = project.handleCreateExportPreset(dir, { name: 'WinBuild', platform: 'macOS' });
assert(dup.isError && dup.content[0].text.includes('ALREADY_EXISTS'), '重复名被拒绝(ALREADY_EXISTS)');

// update：修改 export_path + 自定义 option
const u1 = project.handleUpdateExportPreset(dir, { preset: 'WinBuild', export_path: 'build/win.exe', fields: { 'custom_features': 'a,b' } });
assert(!u1.isError, 'update_export_preset 无错误 -> ' + (u1.content?.[0]?.text || ''));
const cfg3 = fs.readFileSync(path.join(dir, 'export_presets.cfg'), 'utf-8');
assert(cfg3.includes('export_path="build/win.exe"'), 'update 写入 export_path');
assert(cfg3.includes('custom_features="a,b"'), 'update 写入自定义字段');

// remove：删除 preset.0，剩余必须重编号（load_config 在首个缺失索引处停止）
const r1 = project.handleRemoveExportPreset(dir, { preset: 'WinBuild' });
assert(!r1.isError, 'remove_export_preset 无错误');
const cfg4 = fs.readFileSync(path.join(dir, 'export_presets.cfg'), 'utf-8');
assert(!cfg4.includes('[preset.1]'), '移除后无 [preset.1]（已重编号）');
assert(cfg4.includes('[preset.0]') && cfg4.includes('name="LinuxBuild"'), '剩余预设重编号为 [preset.0]');
assert(!/Web=/.test(cfg4), 'runnable 中失效的 WinBuild 映射已清理');

// ---------- 本地化 ----------
const poPath = 'res://locale/en.po';
const cpo = trans.handleCreatePoTranslation(dir, { path: poPath, language: 'en', entries: { hello: 'Hello', bye: 'Bye' }, register: true });
assert(!cpo.isError, 'create_po_translation 无错误 -> ' + (cpo.content?.[0]?.text || ''));
const po = fs.readFileSync(path.join(dir, 'locale', 'en.po'), 'utf-8');
assert(po.includes('msgid "hello"') && po.includes('msgstr "Hello"'), '.po 含 msgid/msgstr 对');
assert(po.includes('Language: en'), '.po 头部含 Language: en');
const pg = fs.readFileSync(path.join(dir, 'project.godot'), 'utf-8');
assert(pg.includes('[internationalization]'), 'project.godot 写入 [internationalization] 段');
assert(/locale\/translations\s*=\s*PackedStringArray\("res:\/\/locale\/en\.po"\)/.test(pg), '翻译已注册到 locale/translations');

// 重复注册应可幂等/被拒
const rep = trans.handleRegisterTranslation(dir, { path: poPath });
assert(rep.isError || /already/i.test(rep.content[0].text), '重复注册被拒绝或幂等');

// unregister
const ur = trans.handleUnregisterTranslation(dir, { path: poPath });
assert(!ur.isError, 'unregister_translation 无错误');
const pg2 = fs.readFileSync(path.join(dir, 'project.godot'), 'utf-8');
assert(!pg2.includes('locale/translations=PackedStringArray("res://locale/en.po")'), '注销后翻译条目已移除');
assert(!/translations=PackedStringArray\(\)/.test(pg2) || !pg2.includes('locale/translations'), '空列表时 key 已删除');

console.log('\n=== 功能验证完成（exitCode=' + (process.exitCode || 0) + '）===');
