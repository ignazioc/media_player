import type { APIRoute } from 'astro';
import fs from 'node:fs';
import path from 'node:path';
import { LIBRARY_ROOT, getAllCourseMetadata, saveCourseMetadata } from '../../lib/db';
import type { CourseFile } from '../../lib/db';

// ---------------------------------------------------------------------------
// Chessable catalog lookup
// ---------------------------------------------------------------------------

interface ChessableEntry {
  bid: number | string;
  name: string;
  url?: string;
  rating?: number | string;
  rated_by?: number | string;
  [key: string]: unknown;
}

let _catalog: ChessableEntry[] | null = null;

function loadCatalog(): ChessableEntry[] {
  if (_catalog) return _catalog;
  try {
    const p = path.resolve(process.cwd(), 'public/chessable_courses.json');
    _catalog = JSON.parse(fs.readFileSync(p, 'utf8'));
  } catch {
    _catalog = [];
  }
  return _catalog!;
}

/** Normalize a string for matching: strip author suffix, lowercase, alphanum only. */
function normalize(s: string): string {
  // Strip everything from the last " - " onward (author suffix in folder names)
  const stripped = s.replace(/\s+-\s+[^-]+$/, '').trim();
  return stripped.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

function tokenSet(s: string): Set<string> {
  return new Set(s.split(' ').filter(w => w.length > 1));
}

function matchScore(folderName: string, catalogName: string): number {
  const a = tokenSet(normalize(folderName));
  const b = tokenSet(normalize(catalogName));
  let shared = 0;
  for (const w of a) if (b.has(w)) shared++;
  const union = new Set([...a, ...b]).size;
  return union === 0 ? 0 : shared / union;
}

function findChessableCourse(folderName: string): ChessableEntry | null {
  const catalog = loadCatalog();
  if (catalog.length === 0) return null;
  let best: ChessableEntry | null = null;
  let bestScore = 0;
  for (const entry of catalog) {
    const score = matchScore(folderName, entry.name);
    if (score > bestScore) { bestScore = score; best = entry; }
  }
  // Require at least half the folder's tokens to match
  return bestScore >= 0.5 ? best : null;
}

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

      const chessable = findChessableCourse(course.name);
      const ratingFields = chessable ? {
        source_url: chessable.url,
        rating: chessable.rating !== undefined ? parseFloat(String(chessable.rating)) : undefined,
        rated_by: chessable.rated_by !== undefined ? parseInt(String(chessable.rated_by), 10) : undefined,
      } : {};

      if (!existing[coursePath]) {
        saveCourseMetadata(coursePath, {
          title: course.name,
          publisher: publisher.name,
          files: courseFiles,
          ...ratingFields,
        });
        discovered++;
      } else {
        const cur = existing[coursePath];
        const needsUpdate = !cur.files || (chessable && cur.rating === undefined);
        if (needsUpdate) {
          saveCourseMetadata(coursePath, {
            ...cur,
            files: cur.files ?? courseFiles,
            ...(!cur.rating ? ratingFields : {}),
          });
        }
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
