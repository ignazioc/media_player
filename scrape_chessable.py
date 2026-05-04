"""
Scrape all courses from Chessable and save to chessable_courses.json.

Uses the mt1 SSR endpoint which embeds full course JSON in each page.
Total: ~1515 courses, ~20 per page, ~76 pages.
"""

import re
import json
import time
import sys
from curl_cffi import requests

BASE_URL = "https://www.chessable.com/mt1/courses/all/all/0-x/a/en/"
OUTPUT = "public/chessable_courses.json"
DELAY = 0.3  # seconds between requests


def fetch_page(page: int) -> tuple[list[dict], int]:
    """Fetch one page, return (courses, total)."""
    url = f"{BASE_URL}?mt2lang=en&page={page}"
    r = requests.get(url, impersonate="chrome124", timeout=20)
    r.raise_for_status()
    html = r.text

    # The page embeds: var init_data = {..., "books": [...], "total": 1515, ...};
    m = re.search(r'var init_data\s*=\s*(\{)', html)
    if not m:
        raise ValueError(f"Could not find init_data on page {page} (len={len(html)})")

    start = m.start(1)
    depth = 0
    end = start
    for i, ch in enumerate(html[start:], start):
        if ch == '{':
            depth += 1
        elif ch == '}':
            depth -= 1
            if depth == 0:
                end = i
                break

    data = json.loads(html[start:end + 1])
    books = data.get("books", [])
    total = int(data.get("total", 0))
    return books, total


def scrape_all() -> list[dict]:
    all_courses: dict[int, dict] = {}  # bid -> course, dedupes pinned/featured

    print("Fetching page 1 to get total count...")
    page1, total = fetch_page(1)
    pages = -(-total // 20)  # ceil division
    print(f"Total courses: {total}, pages: {pages}")

    for course in page1:
        all_courses[course["bid"]] = course

    for page in range(2, pages + 1):
        print(f"  Page {page}/{pages} ({len(all_courses)} courses so far)...")
        sys.stdout.flush()
        try:
            courses, _ = fetch_page(page)
            for course in courses:
                all_courses[course["bid"]] = course
        except Exception as e:
            print(f"\nError on page {page}: {e}")
        time.sleep(DELAY)

    result = sorted(all_courses.values(), key=lambda c: c.get("name", "").lower())
    print(f"\nDone. {len(result)} unique courses collected.")
    return result


def main():
    courses = scrape_all()

    # Write compact summary alongside raw data
    with open(OUTPUT, "w", encoding="utf-8") as f:
        json.dump(courses, f, ensure_ascii=False, indent=2)

    print(f"Saved to {OUTPUT}")

    # Print a quick sample
    print("\nSample (first 5):")
    for c in courses[:5]:
        owner = c.get("ownerArray", {})
        title_prefix = owner.get("chess_title", "").upper()
        author = f"{title_prefix} {owner.get('name', '?')}".strip() if title_prefix else owner.get("name", "?")
        print(f"  [{c['bid']}] {c['name']} — {author}")


if __name__ == "__main__":
    main()
