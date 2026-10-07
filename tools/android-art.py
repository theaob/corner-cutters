#!/usr/bin/env python3
"""Draws the Android and iOS apps' splash screens: a pixel-art F1 car, top-down, on the
page's background, in the game's colours.

    python3 tools/android-art.py        (needs Pillow: pip install pillow)

Writes into android/app/src/main/res/ and ios/App/App/Assets.xcassets/ (commit the results).

The launcher icons aren't drawn here, and this never touches them: they're the game's own
picture (the car cutting a kerb, rendered by the game at low resolution and scaled up), kept
as the files in android/app/src/main/res/mipmap-*/ic_launcher*.png, with the same picture as
the iOS icon (ios/App/App/Assets.xcassets/AppIcon.appiconset/) and the Play listing's
(store/icon-512.png).
"""
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
RES = ROOT / 'android/app/src/main/res'
ASSETS = ROOT / 'ios/App/App/Assets.xcassets'

DECK = (14, 13, 22)  # the page background, #0e0d16
COLORS = {
    'W': (244, 244, 248),  # wings
    'R': (216, 50, 60),  # body
    'D': (150, 28, 38),  # body shade
    'T': (24, 24, 30),  # tyres
    'Y': (242, 193, 78),  # helmet
    'K': (27, 27, 38),  # cockpit
}

# the car, nose up; one character per pixel
CAR = """
...WWWWWWW...
...WWWWWWW...
.....RRR.....
.....RRR.....
TTT..RRR..TTT
TTT.RRRRR.TTT
TTT.RRRRR.TTT
.....RRR.....
....RKYKR....
...RRKYKRR...
..RRRRRRRRR..
..RDRRRRRDR..
..RDRRRRRDR..
TTTRRRRRRRTTT
TTTRRRRRRRTTT
TTT.RRRRR.TTT
TTT..RRR..TTT
..WWWWWWWWW..
..WWWWWWWWW..
""".strip().splitlines()


def car(scale: int) -> Image.Image:
    """The car, each pixel `scale` px square, on a transparent background."""
    w, h = len(CAR[0]), len(CAR)
    im = Image.new('RGBA', (w, h), (0, 0, 0, 0))
    for y, row in enumerate(CAR):
        for x, c in enumerate(row):
            if c in COLORS:
                im.putpixel((x, y), COLORS[c] + (255,))
    return im.resize((w * scale, h * scale), Image.NEAREST)


def centred(base: Image.Image, top: Image.Image) -> Image.Image:
    base = base.copy()
    base.alpha_composite(top, ((base.width - top.width) // 2, (base.height - top.height) // 2))
    return base


# splash screens: the car on the page background, portrait and landscape
SPLASH = {'mdpi': (320, 480), 'hdpi': (480, 800), 'xhdpi': (720, 1280), 'xxhdpi': (960, 1600), 'xxxhdpi': (1280, 1920)}
for name, (w, h) in SPLASH.items():
    scale = max(2, round(min(w, h) * 0.28 / len(CAR)))
    for orient, size in (('port', (w, h)), ('land', (h, w))):
        centred(Image.new('RGBA', size, DECK + (255,)), car(scale)).convert('RGB').save(RES / f'drawable-{orient}-{name}' / 'splash.png')
centred(Image.new('RGBA', (480, 320), DECK + (255,)), car(4)).convert('RGB').save(RES / 'drawable' / 'splash.png')
print('android splash screens written to', RES)

# iOS: the splash, the car on the page background in a 2732 px square (the launch screen crops it to fit), at
# 1x, 2x and 3x
for name, scale in (('splash-2732x2732-2.png', 8), ('splash-2732x2732-1.png', 16), ('splash-2732x2732.png', 24)):
    centred(Image.new('RGBA', (2732, 2732), DECK + (255,)), car(scale)).convert('RGB').save(ASSETS / 'Splash.imageset' / name)
print('ios splash screens written to', ASSETS)
