/**
 * POST /api/scrape-metadata
 *
 * For each known course whose publisher has a registered scraper:
 *   1. If the course has no source_url, attempt to discover one automatically.
 *   2. Fetch metadata (author, duration, cover image) from the provider page.
 *   3. Save the result back to the data store.
 *
 * Response: { ok: true, results: ScrapeResult[] }
 */

import type { APIRoute } from 'astro';
import { getAllCourseMetadata, saveCourseMetadata } from '../../lib/db';
import { findChessableCourseUrl, scrapeChessableCourse } from '../../lib/scrapers/chessable';

interface ScrapeResult {
  course: string;
  status: 'ok' | 'skipped' | 'error';
  message?: string;
}

interface ProviderScraper {
  findUrl: (title: string) => Promise<string | null>;
  scrape: (url: string) => Promise<{ instructor?: string; duration?: string; cover_image_url?: string }>;
}

/**
 * Registry of scraper functions keyed by publisher folder name (lowercase).
 * Add new entries here to support additional providers.
 */
const SCRAPERS: Record<string, ProviderScraper> = {
  chessable: {
    findUrl: findChessableCourseUrl,
    scrape: scrapeChessableCourse,
  },
};

export const POST: APIRoute = async () => {
  const all = getAllCourseMetadata();
  const results: ScrapeResult[] = [];

  for (const [coursePath, meta] of Object.entries(all)) {
    const publisher = meta.publisher?.toLowerCase();
    const scraper = publisher ? SCRAPERS[publisher] : undefined;

    if (!scraper) {
      results.push({ course: meta.title, status: 'skipped', message: `No scraper for publisher "${meta.publisher}"` });
      continue;
    }

    let sourceUrl = meta.source_url;

    // Auto-discover the URL if not already set
    if (!sourceUrl) {
      try {
        const found = await scraper.findUrl(meta.title);
        if (found) {
          sourceUrl = found;
        } else {
          results.push({ course: meta.title, status: 'skipped', message: 'Could not find a matching URL on provider site' });
          continue;
        }
      } catch (err) {
        results.push({ course: meta.title, status: 'error', message: `URL discovery failed: ${err}` });
        continue;
      }
    }

    try {
      const scraped = await scraper.scrape(sourceUrl);
      saveCourseMetadata(coursePath, {
        ...meta,
        source_url: sourceUrl,
        instructor: scraped.instructor ?? meta.instructor,
        duration: scraped.duration ?? meta.duration,
        cover_image_url: scraped.cover_image_url ?? meta.cover_image_url,
        scraped_at: Math.floor(Date.now() / 1000),
      });
      results.push({ course: meta.title, status: 'ok' });
    } catch (err) {
      results.push({ course: meta.title, status: 'error', message: String(err) });
    }
  }

  return new Response(JSON.stringify({ ok: true, results }), {
    headers: { 'Content-Type': 'application/json' },
  });
};
