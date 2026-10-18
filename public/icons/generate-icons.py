#!/usr/bin/env python3
"""Regenerate VoicePilot PWA icons.

The PNG icons (icon-192.png, icon-512.png, icon-maskable-512.png,
apple-touch-icon.png) are binary files and cannot be pushed through the
GitHub MCP push path (it mangles binary bytes), so they are NOT committed.
Run this script to regenerate them locally after cloning:

    python3 public/icons/generate-icons.py

Requires: pip install pillow
Output: public/icon-192.png, public/icon-512.png,
        public/icon-maskable-512.png, public/apple-touch-icon.png
"""
import os
from PIL import Image, ImageDraw

INDIGO = (79, 70, 229, 255)      # #4F46E5 — brand primary
WHITE = (255, 255, 255, 255)
TRANSPARENT = (0, 0, 0, 0)

# Standard glyph, in fractions of icon size:
# (bar_center_x, bar_height), bars vertically centered, square ends.
STD_BARS = [
    (0.2832, 0.2656),
    (0.3906, 0.4102),
    (0.5000, 0.4805),
    (0.6074, 0.4102),
    (0.7148, 0.2656),
]
STD_BAR_W = 0.0488
STD_CORNER_RADIUS = 0.1992

# Maskable glyph: full-bleed background, glyph scaled into the safe zone.
MASK_BARS = [
    (0.3145, 0.2227),
    (0.4062, 0.3438),
    (0.4980, 0.4023),
    (0.5898, 0.3438),
    (0.6836, 0.2227),
]
MASK_BAR_W = 0.0342


def draw_bars(img, bars, bar_w_frac):
    size = img.size[0]
    d = ImageDraw.Draw(img)
    for cx_f, h_f in bars:
        cx, h = cx_f * size, h_f * size
        w = bar_w_frac * size
        d.rectangle(
            [cx - w / 2, size / 2 - h / 2, cx + w / 2, size / 2 + h / 2],
            fill=WHITE,
        )


def make_standard(size):
    img = Image.new("RGBA", (size, size), TRANSPARENT)
    d = ImageDraw.Draw(img)
    d.rounded_rectangle(
        [0, 0, size - 1, size - 1],
        radius=int(STD_CORNER_RADIUS * size),
        fill=INDIGO,
    )
    draw_bars(img, STD_BARS, STD_BAR_W)
    return img


def make_maskable(size):
    img = Image.new("RGBA", (size, size), INDIGO)
    draw_bars(img, MASK_BARS, MASK_BAR_W)
    return img


def main():
    here = os.path.dirname(os.path.abspath(__file__))
    public_dir = os.path.dirname(here)
    targets = [
        ("icon-192.png", make_standard(192)),
        ("icon-512.png", make_standard(512)),
        ("icon-maskable-512.png", make_maskable(512)),
        ("apple-touch-icon.png", make_standard(180)),
    ]
    for name, img in targets:
        path = os.path.join(public_dir, name)
        img.save(path, "PNG")
        print(f"wrote {path} ({img.size[0]}x{img.size[1]})")


if __name__ == "__main__":
    main()
