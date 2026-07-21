// Copyright (c) 2026 FairYan
// SPDX-License-Identifier: MIT
// ============================================================
// Godot MCP Server - Resource File Parser (.tres / .res)
// ============================================================
//
// .tres files are text-based resource files:
// [gd_resource type="..." load_steps=N format=3 uid="uid://..."]
// [ext_resource type="..." path="..." id="id_xxx"]
// [sub_resource type="..." id="id_xxx"]
// properties...
// [resource]
// key = value
//
// .res files are binary - not supported.

import { ResourceDocument, ResourceHeader, ExtResource, SubResource } from '../utils/types.js';
import { splitHeaderParts, parseKeyValuePairs, unquote } from './parser_helpers.js';

const BINARY_RES_HEADER = 'GDROM'; // 4-byte magic for Godot binary resources

/**
 * Check if a file is a binary .res file by reading its first bytes.
 */
export function isBinaryResource(content: Buffer | string): boolean {
  if (Buffer.isBuffer(content)) {
    if (content.length < 4) return false; // guard against empty/small files
    return content.toString('ascii', 0, 4) === BINARY_RES_HEADER;
  }
  // For string content, it's text-based (.tres)
  return false;
}

/**
 * Parse a .tres file string into a structured ResourceDocument.
 */
export function parseResource(content: string): ResourceDocument {
  const doc: ResourceDocument = {
    header: { type: 'Resource', format: 3 },
    extResources: [],
    subResources: [],
    resource: {},
  };

  const lines = content.split('\n');
  let currentSection: 'header' | 'ext_resource' | 'sub_resource' | 'resource' = 'header';
  let currentSubIdx = -1;

  for (const rawLine of lines) {
    const trimmed = rawLine.trim();

    if (trimmed.length === 0 || trimmed.startsWith(';')) continue;

    // Section header
    if (trimmed.startsWith('[') && trimmed.endsWith(']')) {
      const inner = trimmed.slice(1, -1).trim();
      const parts = splitHeaderParts(inner);

      if (!parts || parts.length === 0) continue;

      const type = parts[0];
      const props = parseKeyValuePairs(parts.slice(1));

      switch (type) {
        case 'gd_resource':
          doc.header = {
            type: props.type ? unquote(props.type) : 'Resource',
            load_steps: props.load_steps ? parseInt(props.load_steps, 10) : undefined,
            format: props.format ? parseInt(props.format, 10) : 3,
            uid: props.uid ? unquote(props.uid) : undefined,
          };
          currentSection = 'header';
          break;
        case 'ext_resource':
          doc.extResources.push({
            type: props.type || '',
            uid: props.uid || undefined,
            path: unquote(props.path || ''),
            id: props.id || '',
          });
          currentSection = 'ext_resource';
          break;
        case 'sub_resource':
          doc.subResources.push({
            type: props.type || '',
            id: props.id || '',
            properties: {},
          });
          currentSubIdx = doc.subResources.length - 1;
          currentSection = 'sub_resource';
          break;
        case 'resource':
          currentSection = 'resource';
          break;
      }
      continue;
    }

    // Property line
    const eqIndex = trimmed.indexOf('=');
    if (eqIndex > 0) {
      const key = trimmed.slice(0, eqIndex).trim();
      const value = trimmed.slice(eqIndex + 1).trim();

      if (currentSection === 'resource') {
        doc.resource[key] = value;
      } else if (currentSection === 'sub_resource' && currentSubIdx >= 0) {
        doc.subResources[currentSubIdx].properties[key] = value;
      }
    }
  }

  return doc;
}
