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

async function walk(dir: string, results: Entry[] = []): Promise<Entry[]> {
  let entries: fs.Dirent[];
  try { entries = await fs.promises.readdir(dir, { withFileTypes: true }); }
  catch { return results; }
  for (const e of entries) {
    if (e.name.startsWith('.')) continue;
    const fullPath = path.join(dir, e.name);
    if (e.isDirectory()) {
      results.push({ name: e.name, path: fullPath, type: 'directory', ext: '' });
      await walk(fullPath, results);
    } else if (e.isFile() && VIDEO_EXTS.has(path.extname(e.name).toLowerCase())) {
      results.push({ name: e.name, path: fullPath, type: 'file', ext: path.extname(e.name).toLowerCase() });
    }
  }
  return results;
}

export const POST: APIRoute = async () => {
  console.log('[scan] Starting library scan at', LIBRARY_ROOT);
  try {
    const entries = await walk(LIBRARY_ROOT);
    console.log(`[scan] Walk complete — ${entries.length} entries found`);
    const index: LibraryIndex = { scanned_at: Date.now(), entries };
    await fs.promises.mkdir(DATA_DIR, { recursive: true });
    await fs.promises.writeFile(INDEX_PATH, JSON.stringify(index));
    console.log(`[scan] Index written to ${INDEX_PATH}`);
    return new Response(JSON.stringify({ ok: true, count: entries.length }), {
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (err) {
    console.error('[scan] Error:', err);
    return new Response(JSON.stringify({ ok: false, error: String(err) }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
};
