import type { APIRoute } from 'astro';
import path from 'node:path';
import { getRecentProgress } from '../../lib/db';

export const GET: APIRoute = ({ url }) => {
  const limit = Math.min(parseInt(url.searchParams.get('limit') ?? '20', 10), 100);
  const rows = getRecentProgress(limit);

  const items = rows.map(r => ({
    ...r,
    label: path.basename(r.file_path),
    percent: Math.round((r.position_sec / r.duration_sec) * 100),
  }));

  return new Response(JSON.stringify(items), {
    headers: { 'Content-Type': 'application/json' },
  });
};
