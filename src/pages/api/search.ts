import type { APIRoute } from 'astro';
import { getAllCourseMetadata } from '../../lib/db';

export const GET: APIRoute = ({ url }) => {
  const query = url.searchParams.get('q')?.trim() ?? '';

  if (!query) {
    return new Response(JSON.stringify({ error: 'Missing query parameter "q"' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const lower = query.toLowerCase();
  const all = getAllCourseMetadata();

  const results = Object.entries(all)
    .filter(([, meta]) => meta.title.toLowerCase().includes(lower))
    .map(([coursePath, meta]) => ({
      path: coursePath,
      title: meta.title,
      publisher: meta.publisher,
      instructor: meta.instructor,
      difficulty: meta.difficulty,
      tags: meta.tags,
      description: meta.description,
      duration: meta.duration,
      cover_image_url: meta.cover_image_url,
      source_url: meta.source_url,
    }))
    .sort((a, b) => a.title.localeCompare(b.title, undefined, { sensitivity: 'base' }));

  return new Response(JSON.stringify({ query, results }), {
    headers: { 'Content-Type': 'application/json' },
  });
};
