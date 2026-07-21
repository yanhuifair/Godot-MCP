// Copyright (c) 2026 FairYan
// SPDX-License-Identifier: MIT
// ============================================================
// Godot MCP Server - Shared Type Definitions
// ============================================================

// ---- Scene Types ----

export interface SceneHeader {
  load_steps?: number;
  format: number;
  uid?: string;
}

export interface ExtResource {
  type: string;
  uid?: string;
  path: string;
  id: string;
}

export interface SubResource {
  type: string;
  id: string;
  properties: Record<string, string>;
}

export interface NodeDefinition {
  name: string;
  type: string;
  parent?: string;
  instance?: string;
  groups?: string[];
  index?: number;
  editorDescription?: string;
  properties: Record<string, string>;
  children: NodeDefinition[];
}

export interface Connection {
  signal: string;
  from: string;
  to: string;
  method: string;
  flags?: number;
  unbinds?: number;
}

export interface GodotDocument {
  header: SceneHeader;
  extResources: ExtResource[];
  subResources: SubResource[];
  nodes: NodeDefinition[];
  connections: Connection[];
}

// ---- Config Types ----

export interface ConfigDocument {
  sections: Record<string, Record<string, string>>;
  comments?: string[];
}

// ---- Resource Types ----

export interface ResourceDocument {
  header: ResourceHeader;
  extResources: ExtResource[];
  subResources: SubResource[];
  resource: Record<string, string>;
}

export interface ResourceHeader {
  type: string;
  load_steps?: number;
  format: number;
  uid?: string;
}

// ---- Tool Types ----

export interface FileEntry {
  name: string;
  path: string;
  type: 'file' | 'dir';
  size: number;
  modified_at: string;
}

export interface SearchMatch {
  file: string;
  line: string;
  line_number: number;
  context?: string;
}

export type SceneTemplateType = 'Node2D' | 'Control' | 'Node3D';

export type ScriptType = 'gdscript' | 'csharp';

export interface SceneOperation {
  action: 'add_node' | 'modify_node' | 'remove_node' | 'add_connection' | 'remove_connection' | 'clone_node';
  /** For add_node/clone_node: parent node path */
  parent_path?: string;
  /** Node path identifier */
  node_path?: string;
  /** For add_node/clone_node: node name */
  name?: string;
  /** For add_node: node type */
  type?: string;
  /** Properties to set (key-value) */
  properties?: Record<string, string>;
  /** Groups to set */
  groups?: string[];
  /** New name (for modify_node rename) */
  new_name?: string;
  /** For connection ops: signal name */
  signal?: string;
  /** For connection ops: source node path */
  from_node?: string;
  /** For connection ops: target node path */
  to_node?: string;
  /** For connection ops: method name on target */
  method_name?: string;
  /** For connection ops: connection flags */
  flags?: number;
  /** For connection ops: unbinds */
  unbinds?: number;
  /** For clone_node: source node path to clone */
  clone_source?: string;
}

export type ResourceTemplateType = 'StandardMaterial3D' | 'ORMMaterial3D' | 'ShaderMaterial' | 'CanvasItemMaterial' | 'PhysicalSkyMaterial' | 'ParticleProcessMaterial' | 'VisualShader' | 'FontFile' | 'StyleBoxFlat' | 'NavigationMesh' | 'Animation' | 'Theme' | 'Script' | 'Resource';

// ---- Godot CLI Types ----

export interface GodotVersionInfo {
  version: string;
  path: string;
  platform: string;
}

export interface SpawnedProcess {
  pid: number;
  command: string;
  startedAt: string;
}

// ---- Tool Result Types ----

export interface ToolResult {
  content: { type: 'text'; text: string }[];
  isError?: boolean;
}
