// ============================================================
// Godot MCP Server - File Read Cache
// ============================================================
// TTL-based cache for parsed file content to avoid
// repeated disk reads + parsing overhead.

import fs from 'node:fs';

interface CacheEntry<T> {
  value: T;
  mtime: number;
  cachedAt: number;
}

const MAX_ENTRIES = 200;
const TTL_MS = 30_000; // 30 seconds

export class FileCache<T> {
  private store = new Map<string, CacheEntry<T>>();

  get(key: string, loader: (absPath: string) => T): T {
    const absPath = key;
    const now = Date.now();

    const entry = this.store.get(absPath);
    if (entry) {
      // Check if file changed on disk
      try {
        const stat = fs.statSync(absPath);
        if (stat.mtimeMs === entry.mtime && (now - entry.cachedAt) < TTL_MS) {
          return entry.value;
        }
      } catch {
        // File deleted, evict
        this.store.delete(absPath);
      }
    }

    // Load and cache
    const value = loader(absPath);
    try {
      const stat = fs.statSync(absPath);
      this.store.set(absPath, { value, mtime: stat.mtimeMs, cachedAt: now });
    } catch {
      this.store.set(absPath, { value, mtime: 0, cachedAt: now });
    }

    // Evict oldest if over limit
    if (this.store.size > MAX_ENTRIES) {
      const oldest = [...this.store.entries()]
        .sort(([, a], [, b]) => a.cachedAt - b.cachedAt)[0];
      if (oldest) this.store.delete(oldest[0]);
    }

    return value;
  }

  invalidate(key?: string): void {
    if (key) {
      this.store.delete(key);
    } else {
      this.store.clear();
    }
  }

  get size(): number {
    return this.store.size;
  }
}

// Shared cache instances
export const sceneCache = new FileCache<any>();
export const resourceCache = new FileCache<any>();
export const configCache = new FileCache<any>();
