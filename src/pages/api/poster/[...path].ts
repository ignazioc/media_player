import type { APIRoute } from 'astro';
import fs from 'node:fs';
import path from 'node:path';
import { LIBRARY_ROOT } from '../../../lib/db';

export const GET: APIRoute = ({ params }) => {
  const dirPath = path.resolve('/' + (params['path'] ?? ''));
  const posterPath = path.join(dirPath, 'poster.png');

  if (!dirPath.startsWith(LIBRARY_ROOT)) {
    return new Response('Access denied', { status: 403 });
  }

  let data: Buffer;
  try {
    data = fs.readFileSync(posterPath);
  } catch {
    return new Response('Not found', { status: 404 });
  }

  return new Response(data, {
    headers: { 'Content-Type': 'image/png' },
  });
};
