#!/usr/bin/env python3
"""
Generate video thumbnails for the media player.

Scans the library/ directory, finds all video files, and generates a JPEG
thumbnail for each one using FFmpeg. Thumbnails are stored in thumbs/ mirroring
the library folder structure.

Usage:
    python3 scripts/generate_thumbnails.py [options]

Options:
    --timestamp SECS   Time offset to capture frame (default: 10)
    --force            Re-generate thumbnails even if they already exist
    --library DIR      Library directory (default: ./library)
    --thumbs DIR       Thumbnails output directory (default: ./thumbs)
"""

import argparse
import os
import subprocess
import sys
from pathlib import Path

VIDEO_EXTENSIONS = {'.mp4', '.mkv', '.mov', '.avi', '.webm', '.m4v', '.flv', '.ts', '.wmv'}

def find_videos(library: Path) -> list[Path]:
    videos = []
    for root, dirs, files in os.walk(library):
        # Skip hidden directories
        dirs[:] = [d for d in dirs if not d.startswith('.')]
        for f in files:
            if Path(f).suffix.lower() in VIDEO_EXTENSIONS:
                videos.append(Path(root) / f)
    return sorted(videos)

def thumb_path(video: Path, library: Path, thumbs: Path) -> Path:
    relative = video.relative_to(library)
    return (thumbs / relative).with_suffix('.jpg')

def generate_thumbnail(video: Path, output: Path, timestamp: int) -> bool:
    output.parent.mkdir(parents=True, exist_ok=True)
    result = subprocess.run(
        [
            'ffmpeg',
            '-ss', str(timestamp),
            '-i', str(video),
            '-frames:v', '1',
            '-q:v', '3',          # JPEG quality (2=best, 31=worst)
            '-vf', 'scale=320:-1', # 320px wide, height proportional
            '-y',                  # overwrite without asking
            str(output),
        ],
        capture_output=True,
        text=True,
    )
    return result.returncode == 0

def main():
    parser = argparse.ArgumentParser(description='Generate video thumbnails')
    parser.add_argument('--timestamp', type=int, default=10,
                        help='Seconds into the video to capture (default: 10)')
    parser.add_argument('--force', action='store_true',
                        help='Re-generate existing thumbnails')
    parser.add_argument('--library', type=Path, default=Path('library'),
                        help='Library directory (default: ./library)')
    parser.add_argument('--thumbs', type=Path, default=Path('thumbs'),
                        help='Thumbnails output directory (default: ./thumbs)')
    args = parser.parse_args()

    library = args.library.resolve()
    thumbs = args.thumbs.resolve()

    if not library.exists():
        print(f'Error: library directory not found: {library}', file=sys.stderr)
        sys.exit(1)

    videos = find_videos(library)
    if not videos:
        print('No video files found in library.')
        sys.exit(0)

    print(f'Found {len(videos)} video(s) in {library}')
    print(f'Thumbnails will be saved to {thumbs}\n')

    generated = 0
    skipped = 0
    failed = 0

    for video in videos:
        out = thumb_path(video, library, thumbs)

        if out.exists() and not args.force:
            print(f'  skip  {video.relative_to(library)}')
            skipped += 1
            continue

        print(f'  gen   {video.relative_to(library)} ... ', end='', flush=True)
        ok = generate_thumbnail(video, out, args.timestamp)
        if ok:
            print('done')
            generated += 1
        else:
            # Video may be shorter than the timestamp; fall back to 0s
            ok = generate_thumbnail(video, out, 0)
            if ok:
                print('done (used start frame)')
                generated += 1
            else:
                print('FAILED')
                failed += 1

    print(f'\nDone. Generated: {generated}  Skipped: {skipped}  Failed: {failed}')

if __name__ == '__main__':
    main()
