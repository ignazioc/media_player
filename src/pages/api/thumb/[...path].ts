import type { APIRoute } from 'astro';
import fs from 'node:fs';
import path from 'node:path';
import { LIBRARY_ROOT } from '../../../lib/db';

const THUMBS_ROOT = path.resolve(process.cwd(), 'thumbs');

export const GET: APIRoute = ({ params }) => {
  // params.path = "some/video.mp4" (leading slash stripped by Astro)
  const relPath = params['path'] ?? '';

  // The thumb mirrors the library path with .jpg extension.
  // The URL has no extension (stripped by FileList.astro), so just append .jpg.
  const thumbPath = path.resolve(THUMBS_ROOT, relPath + '.jpg');

  // Ensure the resolved path stays inside the thumbs directory
  if (!thumbPath.startsWith(THUMBS_ROOT)) {
    return new Response('Access denied', { status: 403 });
  }

  let data: Buffer;
  try {
    data = fs.readFileSync(thumbPath);
  } catch {
    return new Response('Not found', { status: 404 });
  }

  return new Response(data, {
    headers: {
      'Content-Type': 'image/jpeg',
      'Cache-Control': 'public, max-age=86400',
    },
  });
};
