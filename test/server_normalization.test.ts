// Regression test for the snake_case/camelCase parameter normalization.
//
// All Zod schemas and handlers in this project use snake_case keys (e.g.
// `scene_path`, `node_type`). The server advertises those same keys as the
// tool inputSchema, so clients send snake_case. normalizeParameterNames must
// therefore map camelCase -> snake_case (tolerating camelCase clients) and must
// NOT rename the snake_case keys that actually match the schemas.
//
// Previously the map was inverted (snake -> camel), which renamed every
// advertised snake_case argument to a key no schema declared, producing
// "Required" validation errors on real CallTool invocations.

import { describe, it, expect } from 'vitest';
import { normalizeParameterNames } from '../src/server.js';

describe('normalizeParameterNames', () => {
  it('leaves snake_case keys untouched (they match the Zod schemas)', () => {
    const args = { scene_path: 'res://main.tscn', node_type: 'Node3D', project_path: 'res://' };
    expect(normalizeParameterNames(args)).toEqual(args);
  });

  it('maps camelCase inputs to the snake_case schema keys', () => {
    const args = { scenePath: 'res://main.tscn', nodeType: 'Node3D' };
    expect(normalizeParameterNames(args)).toEqual({
      scene_path: 'res://main.tscn',
      node_type: 'Node3D',
    });
  });

  it('converts any camelCase key to snake_case, leaves snake_case keys untouched', () => {
    const args = { some_unmapped_key: 42, anotherKey: 'x' };
    // 'some_unmapped_key' is already snake_case -> stays; 'anotherKey' is
    // camelCase -> converted generically to 'another_key' so LLM clients that
    // emit camelCase don't fail Zod validation on multi-word tool parameters.
    expect(normalizeParameterNames(args)).toEqual({
      some_unmapped_key: 42,
      another_key: 'x',
    });
  });

  it('returns the input when it is not a plain object', () => {
    expect(normalizeParameterNames(null as any)).toBeNull();
    expect(normalizeParameterNames(undefined as any)).toBeUndefined();
  });
});
