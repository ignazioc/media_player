import type { APIRoute } from 'astro';
import fs from 'node:fs';
import path from 'node:path';
import { LIBRARY_ROOT } from '../../lib/db';

const VIDEO_EXTS = new Set(['.mp4', '.mkv', '.mov', '.avi', '.webm', '.m4v', '.flv', '.ts', '.wmv']);

export const GET: APIRoute = ({ url }) => {
  const requested = url.searchParams.get('path') ?? LIBRARY_ROOT;
  const dirPath = path.resolve(requested);

  // Reject any path that escapes the library root
  if (!dirPath.startsWith(LIBRARY_ROOT)) {
    return new Response(JSON.stringify({ error: 'Access denied' }), {
      status: 403,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  let entries: fs.Dirent[];
  try {
    entries = fs.readdirSync(dirPath, { withFileTypes: true });
  } catch {
    return new Response(JSON.stringify({ error: 'Cannot read directory' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const items = entries
    .filter(e => !e.name.startsWith('.') && (e.isDirectory() || VIDEO_EXTS.has(path.extname(e.name).toLowerCase())))
    .map(e => ({
      name: e.name,
      path: path.join(dirPath, e.name),
      type: e.isDirectory() ? 'directory' : 'file',
      ext: path.extname(e.name).toLowerCase(),
    }))
    .sort((a, b) => {
      if (a.type !== b.type) return a.type === 'directory' ? -1 : 1;
      return a.name.localeCompare(b.name, undefined, { sensitivity: 'base' });
    });

  return new Response(JSON.stringify({ path: dirPath, items }), {
    headers: { 'Content-Type': 'application/json' },
  });
};
