#!/usr/bin/env python3
"""
Generate placeholder poster.png images for folders in the library.

Creates a simple colored card with the folder name for any folder that
doesn't already have a poster.png. Colors are deterministically assigned
based on the folder name, so they stay consistent across runs.

Usage:
    python3 scripts/generate_posters.py [options]

Options:
    --library DIR   Library directory (default: ./library)
    --force         Overwrite existing poster.png files
"""

import argparse
import hashlib
import os
import sys
import textwrap
from pathlib import Path

try:
    from PIL import Image, ImageDraw, ImageFont
except ImportError:
    print('Error: Pillow is required. Install it with:  pip install Pillow')
    sys.exit(1)

# Poster dimensions (16:9)
WIDTH = 640
HEIGHT = 360

# A palette of muted, dark background colors
PALETTE = [
    (52,  73,  94),   # dark blue-grey
    (44,  62,  80),   # navy
    (69,  39,  160),  # deep purple
    (27,  94,  32),   # dark green
    (130, 57,  53),   # dark red
    (74,  35,  90),   # dark violet
    (21,  101, 192),  # dark blue
    (0,   77,  64),   # dark teal
    (91,  57,  22),   # dark amber
    (38,  50,  56),   # blue-grey dark
]


def pick_color(name: str) -> tuple[int, int, int]:
    index = int(hashlib.md5(name.encode()).hexdigest(), 16) % len(PALETTE)
    return PALETTE[index]


def make_poster(folder_name: str, output: Path):
    bg_color = pick_color(folder_name)
    # Slightly lighter shade for a subtle gradient feel
    hi_color = tuple(min(255, c + 30) for c in bg_color)

    img = Image.new('RGB', (WIDTH, HEIGHT), bg_color)
    draw = ImageDraw.Draw(img)

    # Simple two-tone background: top strip
    draw.rectangle([0, 0, WIDTH, HEIGHT // 3], fill=hi_color)

    # Try to load a decent font, fall back to default
    font_large = None
    font_small = None
    for font_path in [
        '/System/Library/Fonts/Helvetica.ttc',
        '/System/Library/Fonts/Arial.ttf',
        '/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf',
        '/usr/share/fonts/truetype/liberation/LiberationSans-Bold.ttf',
    ]:
        if os.path.exists(font_path):
            try:
                font_large = ImageFont.truetype(font_path, 42)
                font_small = ImageFont.truetype(font_path, 20)
            except Exception:
                pass
            break

    if font_large is None:
        font_large = ImageFont.load_default()
        font_small = font_large

    # Wrap long folder names
    lines = textwrap.wrap(folder_name, width=22)
    line_height = 52
    total_height = len(lines) * line_height
    y = (HEIGHT - total_height) // 2

    for line in lines:
        bbox = draw.textbbox((0, 0), line, font=font_large)
        text_width = bbox[2] - bbox[0]
        x = (WIDTH - text_width) // 2
        # Shadow
        draw.text((x + 2, y + 2), line, font=font_large, fill=(0, 0, 0, 120))
        # Text
        draw.text((x, y), line, font=font_large, fill=(255, 255, 255))
        y += line_height

    # Small decorative bar at the bottom
    draw.rectangle([0, HEIGHT - 6, WIDTH, HEIGHT], fill=hi_color)

    img.save(output, 'PNG')


def main():
    parser = argparse.ArgumentParser(description='Generate placeholder poster images')
    parser.add_argument('--library', type=Path, default=Path('library'),
                        help='Library directory (default: ./library)')
    parser.add_argument('--force', action='store_true',
                        help='Overwrite existing poster.png files')
    args = parser.parse_args()

    library = args.library.resolve()
    if not library.exists():
        print(f'Error: library directory not found: {library}', file=sys.stderr)
        sys.exit(1)

    folders = [p for p in library.iterdir() if p.is_dir() and not p.name.startswith('.')]
    folders.sort()

    if not folders:
        print('No folders found in library.')
        sys.exit(0)

    print(f'Found {len(folders)} folder(s) in {library}\n')

    generated = 0
    skipped = 0

    for folder in folders:
        output = folder / 'poster.png'
        if output.exists() and not args.force:
            print(f'  skip  {folder.name}/')
            skipped += 1
            continue

        print(f'  gen   {folder.name}/ ... ', end='', flush=True)
        make_poster(folder.name, output)
        print('done')
        generated += 1

    print(f'\nDone. Generated: {generated}  Skipped: {skipped}')


if __name__ == '__main__':
    main()
