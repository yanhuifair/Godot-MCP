// Copyright (c) 2026 FairYan
// SPDX-License-Identifier: AGPL-3.0-or-later
// ============================================================
// Godot MCP Server - Resource UID generation
// ============================================================
//
// Godot identifies resources by a 63-bit UID rendered as `uid://<base34>`.
// Files written without one (`uid=""`) still load, but they are second-class:
// nothing can reference them by UID, `validate_project` flags them, and the
// editor silently rewrites the file the first time it saves it.
//
// Encoding (core/io/resource_uid.cpp, verified against Godot 4.7.1):
//   base       = ('z' - 'a') + ('9' - '0') = 25 + 9 = 34
//   digit  0..24 -> 'a'..'y'   (note: 'z' is NOT part of the alphabet)
//   digit 25..33 -> '0'..'9'
// The id is emitted most-significant digit first, with no padding, so
// `ResourceUID.text_to_id(id_to_text(x)) == x` for every non-negative x.

const CHAR_COUNT = 25; // 'z' - 'a'
const BASE = 34n; // CHAR_COUNT + ('9' - '0')

/** Encode a non-negative id the same way `ResourceUID.id_to_text()` does. */
export function idToUidText(id: bigint): string {
  if (id < 0n) return 'uid://<invalid>';
  if (id === 0n) return 'uid://a';

  let txt = '';
  let rest = id;
  while (rest > 0n) {
    const c = Number(rest % BASE);
    txt = (c < CHAR_COUNT ? String.fromCharCode(97 + c) : String.fromCharCode(48 + (c - CHAR_COUNT))) + txt;
    rest /= BASE;
  }
  return `uid://${txt}`;
}

/** Decode `uid://...` back to its id, mirroring `ResourceUID.text_to_id()`. */
export function uidTextToId(text: string): bigint {
  if (!text.startsWith('uid://') || text === 'uid://<invalid>') return -1n;

  let id = 0n;
  for (let i = 6; i < text.length; i++) {
    const c = text.charCodeAt(i);
    id *= BASE;
    if (c >= 97 && c <= 121) {
      id += BigInt(c - 97); // 'a'..'y'
    } else if (c >= 48 && c <= 57) {
      id += BigInt(c - 48 + CHAR_COUNT); // '0'..'9'
    } else {
      return -1n;
    }
  }
  return id & 0x7fffffffffffffffn;
}

/**
 * Mint a fresh `uid://...`, matching `ResourceUID.create_id()` (random 63-bit).
 *
 * Godot dedupes against its own cache; we cannot read that from outside the
 * editor, but at 63 bits a collision is not a practical concern.
 */
export function generateUid(): string {
  const hi = BigInt(Math.floor(Math.random() * 0x100000000));
  const lo = BigInt(Math.floor(Math.random() * 0x100000000));
  const id = ((hi << 32n) | lo) & 0x7fffffffffffffffn;
  return idToUidText(id === 0n ? 1n : id);
}

/**
 * Replace the placeholder `uid=""` that the file templates emit with a real UID.
 *
 * Deliberately scoped to the `[gd_scene]` / `[gd_resource]` header on the first
 * line so that arbitrary file content (scripts, shaders, docs) is never touched.
 */
export function stampUid(content: string): string {
  const newline = content.indexOf('\n');
  const head = newline === -1 ? content : content.slice(0, newline);
  if (!/^\[gd_(scene|resource)\b/.test(head) || !head.includes('uid=""')) return content;

  const stamped = head.replace('uid=""', `uid="${generateUid()}"`);
  return newline === -1 ? stamped : stamped + content.slice(newline);
}
