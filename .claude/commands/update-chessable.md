---
description: Re-scrape all Chessable courses and update chessable_courses.json
allowed-tools: Bash(python3 scrape_chessable.py)
---

Run the Chessable scraper to refresh the local course catalog:

```bash
cd /Users/ignazioc/Developer/media_player && python3 scrape_chessable.py
```

Report how many courses were collected and confirm the file was saved to `public/chessable_courses.json`.
