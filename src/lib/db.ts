import fs from 'node:fs';
import path from 'node:path';

// Absolute path to the media library — everything must stay inside here.
export const LIBRARY_ROOT = path.resolve(process.cwd(), 'library');

// ---------------------------------------------------------------------------
// JSON store
// ---------------------------------------------------------------------------

const DATA_DIR = path.resolve(process.cwd(), 'data');
const STORE_PATH = path.join(DATA_DIR, 'data.json');

export interface Bookmark {
  path: string;
  label: string;
  created_at: number;
}

export interface WatchProgress {
  position_sec: number;
  duration_sec: number;
  last_watched: number;
}

interface Store {
  bookmarks: Bookmark[];
  progress: Record<string, WatchProgress>;
}

function load(): Store {
  try {
    return JSON.parse(fs.readFileSync(STORE_PATH, 'utf8'));
  } catch {
    return { bookmarks: [], progress: {} };
  }
}

function save(store: Store): void {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.writeFileSync(STORE_PATH, JSON.stringify(store, null, 2), 'utf8');
}

// ---------------------------------------------------------------------------
// Bookmarks
// ---------------------------------------------------------------------------

export function getBookmarks(): Bookmark[] {
  return load().bookmarks.sort((a, b) => a.label.localeCompare(b.label));
}

export function addBookmark(filePath: string, label: string): void {
  const store = load();
  if (!store.bookmarks.find(b => b.path === filePath)) {
    store.bookmarks.push({ path: filePath, label, created_at: Math.floor(Date.now() / 1000) });
    save(store);
  }
}

export function removeBookmark(filePath: string): void {
  const store = load();
  store.bookmarks = store.bookmarks.filter(b => b.path !== filePath);
  save(store);
}

// ---------------------------------------------------------------------------
// Watch progress
// ---------------------------------------------------------------------------

export function getProgress(filePath: string): (WatchProgress & { file_path: string }) | null {
  const entry = load().progress[filePath];
  return entry ? { file_path: filePath, ...entry } : null;
}

export function saveProgress(filePath: string, position_sec: number, duration_sec: number): void {
  const store = load();
  store.progress[filePath] = {
    position_sec,
    duration_sec,
    last_watched: Math.floor(Date.now() / 1000),
  };
  save(store);
}

export function removeProgress(filePath: string): void {
  const store = load();
  delete store.progress[filePath];
  save(store);
}

export function getRecentProgress(limit: number): (WatchProgress & { file_path: string })[] {
  const store = load();
  return Object.entries(store.progress)
    .filter(([, p]) =>
      p.duration_sec > 0 &&
      p.position_sec > p.duration_sec * 0.05 &&
      p.position_sec < p.duration_sec * 0.95
    )
    .sort(([, a], [, b]) => b.last_watched - a.last_watched)
    .slice(0, limit)
    .map(([file_path, p]) => ({ file_path, ...p }));
}
