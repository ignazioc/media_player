import type { APIRoute } from 'astro';
import fs from 'node:fs';
import path from 'node:path';
import { LIBRARY_ROOT, getAllCourseMetadata, saveCourseMetadata } from '../../lib/db';
import type { CourseFile } from '../../lib/db';

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

async function discoverCourses(): Promise<number> {
  let discovered = 0;
  const existing = getAllCourseMetadata();
  let publishers: fs.Dirent[];
  try {
    publishers = await fs.promises.readdir(LIBRARY_ROOT, { withFileTypes: true });
  } catch {
    return 0;
  }
  for (const publisher of publishers) {
    if (!publisher.isDirectory() || publisher.name.startsWith('.')) continue;
    const publisherPath = path.join(LIBRARY_ROOT, publisher.name);
    let courses: fs.Dirent[];
    try {
      courses = await fs.promises.readdir(publisherPath, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const course of courses) {
      if (!course.isDirectory() || course.name.startsWith('.')) continue;
      const coursePath = path.join(publisherPath, course.name);

      // Collect video files inside the course folder (non-recursive, sorted)
      let courseFiles: CourseFile[] = [];
      try {
        const dirents = await fs.promises.readdir(coursePath, { withFileTypes: true });
        courseFiles = dirents
          .filter(d => d.isFile() && VIDEO_EXTS.has(path.extname(d.name).toLowerCase()))
          .sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }))
          .map(d => ({ name: d.name, path: path.join(coursePath, d.name) }));
      } catch { /* skip if unreadable */ }

      if (!existing[coursePath]) {
        saveCourseMetadata(coursePath, {
          title: course.name,
          publisher: publisher.name,
          files: courseFiles,
        });
        discovered++;
      } else if (!existing[coursePath].files) {
        // Back-fill files for existing courses that were scanned before this feature
        saveCourseMetadata(coursePath, {
          ...existing[coursePath],
          files: courseFiles,
        });
      }
    }
  }
  return discovered;
}

export const POST: APIRoute = async () => {
  console.log('[scan] Starting library scan at', LIBRARY_ROOT);
  try {
    const [entries, discovered] = await Promise.all([
      walk(LIBRARY_ROOT),
      discoverCourses(),
    ]);
    console.log(`[scan] Walk complete — ${entries.length} entries found, ${discovered} new courses registered`);
    const index: LibraryIndex = { scanned_at: Date.now(), entries };
    await fs.promises.mkdir(DATA_DIR, { recursive: true });
    await fs.promises.writeFile(INDEX_PATH, JSON.stringify(index));
    console.log(`[scan] Index written to ${INDEX_PATH}`);
    return new Response(JSON.stringify({ ok: true, count: entries.length, courses_discovered: discovered }), {
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
