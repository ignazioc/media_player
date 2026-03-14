import type { APIRoute } from 'astro';
import { getProgress, saveProgress, removeProgress } from '../../lib/db';

export const GET: APIRoute = ({ url }) => {
  const filePath = url.searchParams.get('path');
  if (!filePath) {
    return new Response(JSON.stringify({ error: 'path is required' }), { status: 400 });
  }
  return new Response(JSON.stringify(getProgress(filePath)), {
    headers: { 'Content-Type': 'application/json' },
  });
};

export const POST: APIRoute = async ({ request }) => {
  let body: { file_path?: string; position_sec?: number; duration_sec?: number };
  try {
    body = await request.json();
  } catch {
    return new Response(JSON.stringify({ error: 'Invalid JSON' }), { status: 400 });
  }

  const { file_path, position_sec, duration_sec } = body;
  if (!file_path) {
    return new Response(JSON.stringify({ error: 'file_path is required' }), { status: 400 });
  }

  saveProgress(file_path, position_sec ?? 0, duration_sec ?? 0);
  return new Response(JSON.stringify({ ok: true }), {
    headers: { 'Content-Type': 'application/json' },
  });
};

export const DELETE: APIRoute = ({ url }) => {
  const filePath = url.searchParams.get('path');
  if (!filePath) {
    return new Response(JSON.stringify({ error: 'path is required' }), { status: 400 });
  }
  removeProgress(filePath);
  return new Response(null, { status: 204 });
};
