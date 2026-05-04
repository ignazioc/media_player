import { findChessableCourseUrl } from '../src/lib/scrapers/chessable.js';

// Fetch and print the raw sitemap XML
const res = await fetch('https://www.chessable.com/sitemap.xml', {
  headers: {
    'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  },
});

if (!res.ok) {
  console.error(`Failed to fetch sitemap: HTTP ${res.status}`);
  process.exit(1);
}

const xml = await res.text();
console.log(xml);
