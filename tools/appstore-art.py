#!/usr/bin/env python3
"""Draws the App Store screenshots: the Play screenshots (store/screenshots) under a caption, on the game's dark deck,
at the sizes App Store Connect takes.

    python3 tools/appstore-art.py        (needs Pillow: pip install pillow)

Writes store/appstore/iphone-6.9/ (1290 x 2796) and store/appstore/ipad-13/ (2064 x 2752), and copies the 1024 x 1024
app icon; commit the results.
"""
import shutil
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / 'store/screenshots'
OUT = ROOT / 'store/appstore'
FONT = '/usr/share/fonts/opentype/inter/InterDisplay-Bold.otf'

DECK = (14, 13, 22)
GOLD = (242, 193, 78)
WHITE = (244, 242, 250)

SHOTS = [
    ('01-crescent-park', 'RACE 15 PIXEL-3D CIRCUITS'),
    ('02-vegas', 'NEON NIGHTS, CITY STREETS'),
    ('03-glacier-pass', 'RAIN, SNOW AND PIT STOPS'),
    ('04-suzuka', 'FIGURE-OF-EIGHT, OVER THE BRIDGE'),
    ('05-dune-coast', 'DRIFT THE DUNES'),
    ('06-dust-bowl', 'WIN THE CHAMPIONSHIP'),
    ('07-title', 'CUT THE CORNERS!'),
]
SIZES = {'iphone-6.9': (1290, 2796), 'ipad-13': (2064, 2752)}


def render(name, caption, size):
    w, h = size
    canvas = Image.new('RGB', size, DECK)
    d = ImageDraw.Draw(canvas)
    band = int(h * 0.1)
    font = ImageFont.truetype(FONT, int(w * 0.052))
    tw = d.textlength(caption, font=font)
    d.text(((w - tw) / 2, band * 0.5), caption, font=font, fill=GOLD, anchor='lm')
    shot = Image.open(SRC / f'{name}.png').convert('RGB')
    th = h - band - int(h * 0.02)
    tw2 = round(shot.width * th / shot.height)
    if tw2 > w:
        tw2, th = w, round(shot.height * w / shot.width)
    shot = shot.resize((tw2, th), Image.LANCZOS)
    canvas.paste(shot, ((w - tw2) // 2, band))
    return canvas


def main():
    for folder, size in SIZES.items():
        out = OUT / folder
        out.mkdir(parents=True, exist_ok=True)
        for name, caption in SHOTS:
            render(name, caption, size).save(out / f'{name}.png', optimize=True)
    shutil.copy(ROOT / 'ios/App/App/Assets.xcassets/AppIcon.appiconset/AppIcon-512@2x.png', OUT / 'icon-1024.png')


if __name__ == '__main__':
    main()
