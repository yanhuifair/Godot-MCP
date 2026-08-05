// Copyright (c) 2026 FairYan
// SPDX-License-Identifier: AGPL-3.0-or-later
import { describe, it, expect } from 'vitest';
import { idToUidText, uidTextToId, generateUid, stampUid } from '../src/utils/uid.js';

// Captured from Godot 4.7.1 via `ResourceUID.id_to_text()` in a headless run.
// If these ever drift, our generated files stop matching the engine's encoding.
const GODOT_VECTORS: [bigint, string][] = [
  [1n, 'uid://b'],
  [33n, 'uid://8'],
  [34n, 'uid://ba'],
  [35n, 'uid://bb'],
  [1234567890n, 'uid://2f30kk'],
  [8070450532247928832n, 'uid://dm8ne2gdikjbk'],
];

describe('uid encoding', () => {
  it('matches Godot id_to_text for known vectors', () => {
    for (const [id, text] of GODOT_VECTORS) {
      expect(idToUidText(id)).toBe(text);
    }
  });

  it('matches Godot text_to_id for known vectors', () => {
    for (const [id, text] of GODOT_VECTORS) {
      expect(uidTextToId(text)).toBe(id);
    }
  });

  it('round-trips generated uids', () => {
    for (let i = 0; i < 200; i++) {
      const uid = generateUid();
      expect(uid).toMatch(/^uid:\/\/[a-y0-9]+$/);
      expect(idToUidText(uidTextToId(uid))).toBe(uid);
    }
  });

  it("never emits 'z' (outside Godot's base-34 alphabet)", () => {
    for (let i = 0; i < 200; i++) {
      expect(generateUid()).not.toContain('z');
    }
  });

  it('rejects malformed uid text', () => {
    expect(uidTextToId('res://foo.tscn')).toBe(-1n);
    expect(uidTextToId('uid://<invalid>')).toBe(-1n);
    expect(uidTextToId('uid://HELLO')).toBe(-1n); // uppercase is not in the alphabet
  });
});

describe('stampUid', () => {
  it('fills the placeholder in a gd_resource header', () => {
    const out = stampUid('[gd_resource type="Theme" format=3 uid=""]\n\n[resource]\n');
    expect(out).toMatch(/^\[gd_resource type="Theme" format=3 uid="uid:\/\/[a-y0-9]+"\]/);
  });

  it('fills the placeholder in a gd_scene header', () => {
    const out = stampUid('[gd_scene format=3 uid=""]\n\n[node name="Root" type="Node2D"]\n');
    expect(out).toMatch(/^\[gd_scene format=3 uid="uid:\/\/[a-y0-9]+"\]/);
  });

  it('leaves an existing uid untouched (no churn on re-write)', () => {
    const src = '[gd_scene format=3 uid="uid://cix1abnv66cck"]\n\n[node name="Root" type="Node2D"]\n';
    expect(stampUid(src)).toBe(src);
  });

  it('leaves headerless content untouched', () => {
    const gd = 'extends Node\n\nvar s = \'uid=""\'\n';
    expect(stampUid(gd)).toBe(gd);
    expect(stampUid('')).toBe('');
  });

  it('only touches the first line', () => {
    const src = '[gd_resource type="Theme" format=3]\n\n[resource]\nnote = "uid=\\"\\""\n';
    expect(stampUid(src)).toBe(src);
  });

  it('preserves the rest of the document verbatim', () => {
    const body = '\n\n[resource]\ndefault_font_size = 16\n';
    const out = stampUid('[gd_resource type="Theme" format=3 uid=""]' + body);
    expect(out.slice(out.indexOf('\n'))).toBe(body);
  });
});
