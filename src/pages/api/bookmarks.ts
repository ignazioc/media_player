import type { APIRoute } from 'astro';
import { getBookmarks, addBookmark, removeBookmark } from '../../lib/db';

export const GET: APIRoute = () => {
  return new Response(JSON.stringify(getBookmarks()), {
    headers: { 'Content-Type': 'application/json' },
  });
};

export const POST: APIRoute = async ({ request }) => {
  let body: { path?: string; label?: string };
  try {
    body = await request.json();
  } catch {
    return new Response(JSON.stringify({ error: 'Invalid JSON' }), { status: 400 });
  }

  const { path, label } = body;
  if (!path || !label) {
    return new Response(JSON.stringify({ error: 'path and label are required' }), { status: 400 });
  }

  addBookmark(path, label);
  return new Response(JSON.stringify({ ok: true }), {
    status: 201,
    headers: { 'Content-Type': 'application/json' },
  });
};

export const DELETE: APIRoute = ({ url }) => {
  const filePath = url.searchParams.get('path');
  if (!filePath) {
    return new Response(JSON.stringify({ error: 'path is required' }), { status: 400 });
  }
  removeBookmark(filePath);
  return new Response(null, { status: 204 });
};
