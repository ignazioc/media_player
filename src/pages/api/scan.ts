import type { APIRoute } from 'astro';
import fs from 'node:fs';
import path from 'node:path';
import { LIBRARY_ROOT } from '../../lib/db';

const VIDEO_EXTS = new Set(['.mp4', '.mkv', '.mov', '.avi', '.webm', '.m4v', '.flv', '.ts', '.wmv']);

export interface Entry {
  name: string;
  path: string;
  type: 'directory' | 'file';
  ext: string;
}

export interface LibraryIndex {
  scanned_at: number;
  entries: Entry[];
}

const DATA_DIR = path.resolve(process.cwd(), 'data');
export const INDEX_PATH = path.join(DATA_DIR, 'folder-index.json');

function walk(dir: string, results: Entry[] = []): Entry[] {
  let entries: fs.Dirent[];
  try { entries = fs.readdirSync(dir, { withFileTypes: true }); }
  catch { return results; }
  for (const e of entries) {
    if (e.name.startsWith('.')) continue;
    const fullPath = path.join(dir, e.name);
    if (e.isDirectory()) {
      results.push({ name: e.name, path: fullPath, type: 'directory', ext: '' });
      walk(fullPath, results);
    } else if (e.isFile() && VIDEO_EXTS.has(path.extname(e.name).toLowerCase())) {
      results.push({ name: e.name, path: fullPath, type: 'file', ext: path.extname(e.name).toLowerCase() });
    }
  }
  return results;
}

export const POST: APIRoute = () => {
  try {
    const entries = walk(LIBRARY_ROOT);
    const index: LibraryIndex = { scanned_at: Date.now(), entries };
    fs.mkdirSync(DATA_DIR, { recursive: true });
    fs.writeFileSync(INDEX_PATH, JSON.stringify(index));
    return new Response(JSON.stringify({ ok: true, count: entries.length }), {
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (err) {
    return new Response(JSON.stringify({ ok: false, error: String(err) }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
};
