/**
 * Chessable course metadata scraper.
 *
 * Fetches a course page and extracts:
 *   - author / instructor
 *   - duration
 *   - cover image URL
 *
 * Chessable renders pages server-side and embeds structured data in:
 *   - <script type="application/ld+json"> (JSON-LD)
 *   - <meta> tags (og:image, og:description, etc.)
 *   - Visible HTML elements
 *
 * URL discovery:
 *   findChessableCourseUrl(title) downloads the sitemap once (cached in memory),
 *   extracts all /course/ URLs, and returns the best slug match for the title.
 */

export interface ChessableCourseMeta {
  source_url?: string;  // populated by findChessableCourseUrl
  instructor?: string;
  duration?: string;
  cover_image_url?: string;
}

// ---------------------------------------------------------------------------
// Sitemap-based URL discovery
// ---------------------------------------------------------------------------

/** In-memory cache of course URLs parsed from the sitemap. */
let sitemapCache: string[] | null = null;

async function getSitemapUrls(): Promise<string[]> {
  if (sitemapCache) return sitemapCache;

  const res = await fetch('https://www.chessable.com/sitemap.xml', {
    headers: { 'User-Agent': BROWSER_UA },
  });
  if (!res.ok) throw new Error(`Failed to fetch sitemap: HTTP ${res.status}`);

  const xml = await res.text();
  // Extract all course URLs: /something/course/123456/
  const urls = [...xml.matchAll(/https:\/\/www\.chessable\.com\/([^/]+)\/course\/(\d+)\//g)]
    .map(m => m[0]);

  sitemapCache = urls;
  return urls;
}

// Words to ignore when comparing slugs (titles and honorifics bloat the query)
const STOP_WORDS = new Set([
  'a', 'an', 'the', 'and', 'or', 'of', 'in', 'to', 'for', 'by', 'with',
  'gm', 'im', 'fm', 'wgm', 'wim', 'nm', // chess titles
]);

/**
 * Convert a course title/folder name into a set of meaningful slug words.
 * Strips author suffixes (e.g. " - IM Thomas Willemze"), lowercases,
 * removes apostrophes, splits on non-alphanumeric, and filters stop words.
 */
function titleToWords(title: string): string[] {
  // Strip everything after " - " (author suffix)
  const stripped = title.replace(/\s+-\s+.*$/, '').trim();
  return stripped
    .toLowerCase()
    .replace(/['']/g, '')
    .split(/[^a-z0-9]+/)
    .filter(w => w.length > 0 && !STOP_WORDS.has(w));
}

/**
 * Score how well a candidate URL slug matches the query title words.
 * Uses a combination of:
 *  - Jaccard similarity on meaningful words
 *  - Bonus for matching words that appear at the start of the candidate slug
 *    (the first 3 words of a slug are usually the most distinctive part of the title)
 */
function slugScore(queryWords: string[], candidateSlug: string): number {
  const cWords = candidateSlug.split('-').filter(w => w.length > 0 && !STOP_WORDS.has(w));
  const qSet = new Set(queryWords);
  const cSet = new Set(cWords);

  const intersection = [...qSet].filter(w => cSet.has(w)).length;
  const union = new Set([...qSet, ...cSet]).size;
  const jaccard = union === 0 ? 0 : intersection / union;

  // Bonus: how many of the first 3 candidate words are in the query?
  const leadBonus = cWords.slice(0, 3).filter(w => qSet.has(w)).length / 3;

  return jaccard * 0.6 + leadBonus * 0.4;
}

/**
 * Find the Chessable course URL that best matches the given course title.
 * Returns null if no good match is found.
 */
export async function findChessableCourseUrl(title: string): Promise<string | null> {
  const urls = await getSitemapUrls();
  const queryWords = titleToWords(title);

  let bestUrl: string | null = null;
  let bestScore = 0;

  for (const url of urls) {
    const m = url.match(/chessable\.com\/([^/]+)\/course\//);
    if (!m) continue;
    const score = slugScore(queryWords, m[1]);
    if (score > bestScore) {
      bestScore = score;
      bestUrl = url;
    }
  }

  // Require at least one meaningful word in common in the lead position
  return bestScore >= 0.2 ? bestUrl : null;
}

// ---------------------------------------------------------------------------
// Course page scraper
// ---------------------------------------------------------------------------

const BROWSER_UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';

/**
 * Extract the first JSON-LD block from an HTML string and return it parsed,
 * or null if not found / invalid.
 */
function extractJsonLd(html: string): Record<string, unknown> | null {
  const match = html.match(/<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/i);
  if (!match) return null;
  try {
    return JSON.parse(match[1]);
  } catch {
    return null;
  }
}

/**
 * Extract a <meta> tag content value by property or name attribute.
 */
function metaContent(html: string, attr: string): string | undefined {
  const re = new RegExp(
    `<meta[^>]+(?:property|name)=["']${attr}["'][^>]+content=["']([^"']+)["']`,
    'i'
  );
  const m = html.match(re);
  if (m) return m[1];
  // Some pages put content before property
  const re2 = new RegExp(
    `<meta[^>]+content=["']([^"']+)["'][^>]+(?:property|name)=["']${attr}["']`,
    'i'
  );
  const m2 = html.match(re2);
  return m2?.[1];
}

export async function scrapeChessableCourse(url: string): Promise<ChessableCourseMeta> {
  const res = await fetch(url, {
    headers: {
      'User-Agent': BROWSER_UA,
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      'Accept-Language': 'en-US,en;q=0.5',
    },
  });

  if (!res.ok) {
    throw new Error(`HTTP ${res.status} fetching ${url}`);
  }

  const html = await res.text();
  const result: ChessableCourseMeta = {};

  // --- Cover image ---------------------------------------------------------
  const ogImage = metaContent(html, 'og:image');
  if (ogImage) {
    result.cover_image_url = ogImage;
  }

  // --- JSON-LD -------------------------------------------------------------
  const ld = extractJsonLd(html);
  if (ld) {
    // instructor / author
    const author = ld['author'];
    if (typeof author === 'string') {
      result.instructor = author;
    } else if (author && typeof author === 'object' && 'name' in (author as object)) {
      result.instructor = (author as Record<string, unknown>)['name'] as string;
    }

    // image fallback from JSON-LD
    if (!result.cover_image_url && ld['image']) {
      const img = ld['image'];
      if (typeof img === 'string') result.cover_image_url = img;
      else if (Array.isArray(img) && img.length > 0) result.cover_image_url = String(img[0]);
    }

    // duration — JSON-LD uses ISO 8601 (PT1H30M) or plain text
    if (ld['timeRequired']) {
      result.duration = parseDuration(String(ld['timeRequired']));
    }
  }

  // --- Fallback: scrape visible HTML for author/instructor -----------------
  if (!result.instructor) {
    const instructorMatch = html.match(/by\s+<[^>]+>([^<]+)<\/[^>]+>/i) ??
                            html.match(/instructor[^>]*>\s*([A-Z][a-z]+(?: [A-Z][a-z]+)+)/i);
    if (instructorMatch) {
      result.instructor = instructorMatch[1].trim();
    }
  }

  // --- Fallback: scrape visible HTML for duration --------------------------
  if (!result.duration) {
    const durMatch = html.match(/(\d+\s*h(?:ours?)?\s*(?:\d+\s*m(?:in(?:utes?)?)?)|\d+\s*m(?:in(?:utes?)?)\b)/i);
    if (durMatch) {
      result.duration = durMatch[1].trim();
    }
  }

  return result;
}

/**
 * Convert ISO 8601 duration (PT1H30M45S) to a human-readable string.
 */
function parseDuration(iso: string): string {
  const match = iso.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/i);
  if (!match) return iso;
  const h = parseInt(match[1] ?? '0', 10);
  const m = parseInt(match[2] ?? '0', 10);
  const parts: string[] = [];
  if (h > 0) parts.push(`${h}h`);
  if (m > 0) parts.push(`${m}m`);
  return parts.length > 0 ? parts.join(' ') : iso;
}
