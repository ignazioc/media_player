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

export interface CourseFile {
  name: string;  // filename
  path: string;  // absolute path
}

export interface CourseMetadata {
  // path is the key in the courses record (absolute path to the course folder)
  title: string;        // display name, defaults to folder name
  publisher: string;    // parent folder name, e.g. "chess_mood"
  instructor?: string;  // e.g. "Magnus Carlsen"
  difficulty?: 'beginner' | 'intermediate' | 'advanced';
  tags?: string[];      // e.g. ["openings", "endgames"]
  description?: string;
  files?: CourseFile[]; // video files in the course, populated by scan
  source_url?: string;  // URL to the course page on the provider's website
  cover_image_url?: string; // Remote cover image URL fetched from provider
  duration?: string;    // Human-readable duration string from provider
  scraped_at?: number;  // Unix timestamp of last successful metadata scrape
}

interface Store {
  bookmarks: Bookmark[];
  progress: Record<string, WatchProgress>;
  courses: Record<string, CourseMetadata>; // keyed by absolute course folder path
}

function load(): Store {
  try {
    const store = JSON.parse(fs.readFileSync(STORE_PATH, 'utf8'));
    if (!store.courses) store.courses = {};
    return store;
  } catch {
    return { bookmarks: [], progress: {}, courses: {} };
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

// ---------------------------------------------------------------------------
// Course metadata
// ---------------------------------------------------------------------------

export function getCourseMetadata(coursePath: string): CourseMetadata | null {
  return load().courses[coursePath] ?? null;
}

export function getAllCourseMetadata(): Record<string, CourseMetadata> {
  return load().courses;
}

export function saveCourseMetadata(coursePath: string, meta: CourseMetadata): void {
  const store = load();
  store.courses[coursePath] = meta;
  save(store);
}

export function removeCourseMetadata(coursePath: string): void {
  const store = load();
  delete store.courses[coursePath];
  save(store);
}
