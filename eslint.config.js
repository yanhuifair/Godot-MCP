// Copyright (c) 2026 FairYan
// SPDX-License-Identifier: AGPL-3.0-or-later
// ============================================================
// ESLint 配置（flat config，ESLint 10）
// ============================================================
// 目标不是「风格统一」，而是把**真实 bug 类**问题钉死：
//   - no-empty（不许再出现吞掉错误的空 catch —— 本项目吃过这个亏）
//   - no-unused-vars（重构后残留的死变量/死 import）
//   - no-fallthrough / no-unreachable / no-dupe-keys / no-constant-condition
//   - prefer-const / no-var
//
// `no-explicit-any` 保持 warn 而不是 error：现有代码里有几百处 any，
// 一次全改会掩盖掉上面那些真正要紧的告警。它是待收紧项，不是已通过项。

import js from '@eslint/js';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  {
    ignores: [
      'dist/**',
      'node_modules/**',
      'test/test-project/**', // 生成的 Godot 工程 fixture
      '**/*.d.ts',
    ],
  },

  js.configs.recommended,
  ...tseslint.configs.recommended,

  {
    files: ['**/*.ts', '**/*.mjs', '**/*.js'],
    languageOptions: {
      ecmaVersion: 2023,
      sourceType: 'module',
      // Node 侧全局。只列项目实际用到的，避免「声明了但其实不存在」的假安全感。
      globals: {
        console: 'readonly',
        process: 'readonly',
        Buffer: 'readonly',
        global: 'readonly',
        globalThis: 'readonly',
        setTimeout: 'readonly',
        clearTimeout: 'readonly',
        setInterval: 'readonly',
        clearInterval: 'readonly',
        setImmediate: 'readonly',
        queueMicrotask: 'readonly',
        structuredClone: 'readonly',
        fetch: 'readonly',
        URL: 'readonly',
        URLSearchParams: 'readonly',
        TextEncoder: 'readonly',
        TextDecoder: 'readonly',
        performance: 'readonly',
        AbortController: 'readonly',
        AbortSignal: 'readonly',
      },
    },
    rules: {
      // ---- 真实 bug 类（error）----
      // 空 catch 是「静默失败」的入口：本项目的 edit_scene 假成功、
      // uid 检查谎报「全部有 UID」都源于这里。要忽略异常就写注释说明原因，
      // 并显式 eslint-disable-next-line。
      'no-empty': ['error', { allowEmptyCatch: false }],
      'no-fallthrough': 'error',
      'no-unreachable': 'error',
      'no-dupe-keys': 'error',
      'no-dupe-else-if': 'error',
      'no-dupe-args': 'error',
      'no-constant-condition': ['error', { checkLoops: false }],
      'no-self-compare': 'error',
      'no-unsafe-negation': 'error',
      'no-template-curly-in-string': 'error',
      'prefer-const': 'error',
      'no-var': 'error',
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_', caughtErrors: 'none' },
      ],

      // ---- 待收紧（warn）----
      '@typescript-eslint/no-explicit-any': 'warn',

      // ---- 有意关闭 ----
      // 服务器的诊断输出全部走 stderr（stdout 是 JSON-RPC 通道），是有意为之
      'no-console': 'off',
      // tsconfig 的 target 是 ES2022，不需要为老运行时降级语法
      'no-empty-function': 'off',
    },
  },

  // scripts/ 与测试脚本的既定写法：放宽这几条
  {
    files: ['scripts/**/*.js', 'test/**/*.mjs', 'test/**/*.ts', 'eslint.config.js'],
    rules: {
      '@typescript-eslint/no-explicit-any': 'off',
      'no-empty': ['error', { allowEmptyCatch: true }], // 测试里的清理代码可以吞异常
      // 测试脚本大量使用 `cond ? pass(x) : fail(x)` 这种「三元当语句」的断言写法。
      // 允许三元与短路，但保留规则本身，仍能抓到 `foo.bar` 这类忘记调用。
      '@typescript-eslint/no-unused-expressions': [
        'error',
        { allowTernary: true, allowShortCircuit: true },
      ],
    },
  },
  // 人工探针脚本（不是门禁的一部分，跑起来只为看输出）。
  // 它们会把每个命令的返回值都接住然后打印，天然一堆「赋值了没再用」的变量；
  // 强行加下划线前缀只会降低可读性。真正把关的套件
  // （test_all.mjs / smoke_all_tools.mjs / *.test.ts）仍然严格检查。
  {
    files: ['test/test_editor.mjs', 'test/test_editor2.mjs', 'test/test_runner.mjs'],
    rules: {
      '@typescript-eslint/no-unused-vars': 'off',
    },
  },
);
