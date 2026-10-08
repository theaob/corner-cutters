#!/usr/bin/env python3
"""Draws the itch.io page's artwork: a page background and an embed background, pixel art in the game's colours
(the dark deck, red/white kerbs, asphalt, gold title).

    python3 tools/itch-art.py        (needs Pillow: pip install pillow)

Writes store/itch/page-background.png (1920 x 1080) and store/itch/embed-background.png (1280 x 720); commit the results.
"""
import random
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / 'store/itch'
FONT = ROOT / 'public/fonts/silkscreen.woff2'

DECK = (14, 13, 22)  # the page background, #0e0d16
DECK2 = (21, 20, 31)  # #15141f
ASPHALT = (30, 29, 44)
ASPHALT_LINE = (58, 56, 88)
RED = (216, 50, 60)
WHITE = (244, 242, 250)
GOLD = (242, 193, 78)
GOLD_DARK = (107, 75, 16)
CYAN = (95, 224, 208)
PINK = (255, 79, 216)
CAR_COLORS = [RED, (61, 127, 196), (255, 138, 40), CYAN, PINK, GOLD]

CAR = """
..WWWWW..
....R....
....R....
TT.RRR.TT
TT.RKR.TT
...RYR...
..RRRRR..
TTRRRRRTT
TT.RRR.TT
.WWWWWWW.
""".strip().splitlines()


def car(body, scale=1):
    cols = {'W': WHITE, 'R': body, 'T': (24, 24, 30), 'Y': GOLD, 'K': (27, 27, 38)}
    im = Image.new('RGBA', (len(CAR[0]), len(CAR)), (0, 0, 0, 0))
    for y, row in enumerate(CAR):
        for x, c in enumerate(row):
            if c in cols:
                im.putpixel((x, y), cols[c] + (255,))
    return im


def scene(w, h, seed, band_width, quiet=None, shift=0, ground=(DECK, DECK2), flecks=((30, 28, 46), (37, 35, 58), (24, 23, 38)), cars_big=2):
    """A low-resolution scene: speckled deck, a diagonal track with kerbs and a few cars. `quiet` is an (x0, x1)
    column kept free of track so the page's content sits on calm ground."""
    rnd = random.Random(seed)
    im = Image.new('RGBA', (w, h), DECK + (255,))
    d = ImageDraw.Draw(im)
    for y in range(h):  # soft vertical gradient
        t = y / h
        d.line([(0, y), (w, y)], fill=tuple(int(ground[0][i] + (ground[1][i] - ground[0][i]) * t) for i in range(3)))
    for _ in range(w * h // 90):  # faint speckle, like the game's far ground
        x, y = rnd.randrange(w), rnd.randrange(h)
        d.point((x, y), fill=rnd.choice(flecks))

    def track(x_at, width, cars):
        pts = [(x_at(y), y) for y in range(-4, h + 5)]
        for x, y in pts:
            d.line([(x - width // 2 - 3, y), (x + width // 2 + 3, y)], fill=WHITE if (y // 3) % 2 else RED)
        for x, y in pts:
            d.line([(x - width // 2, y), (x + width // 2, y)], fill=ASPHALT)
        for x, y in pts:
            if (y // 5) % 2:
                d.point((x, y), fill=ASPHALT_LINE)
        for i, (ty, col) in enumerate(cars):
            x = x_at(ty)
            im.alpha_composite(car(col).resize((9 * cars_big, 10 * cars_big), Image.NEAREST), (int(x) - 4 * cars_big, ty))

    import math

    if quiet is None:
        track(lambda y: w * (0.5 + shift) + math.sin(y / 38) * w * 0.12 + (y - h / 2) * 0.35, band_width,
              [(int(h * f), rnd.choice(CAR_COLORS)) for f in (0.12, 0.3, 0.42, 0.7, 0.86)])
    else:
        x0, x1 = quiet
        left_c, right_c = x0 / 2, (x1 + w) / 2
        track(lambda y: left_c + math.sin(y / 34) * x0 * 0.28 + (y - h / 2) * 0.12, band_width,
              [(int(h * f), rnd.choice(CAR_COLORS)) for f in (0.18, 0.5, 0.82)])
        track(lambda y: right_c - math.sin(y / 34 + 2) * (w - x1) * 0.28 - (y - h / 2) * 0.12, band_width,
              [(int(h * f), rnd.choice(CAR_COLORS)) for f in (0.1, 0.4, 0.68, 0.92)])
    return im


def vignette(im, strength, tint=DECK):
    w, h = im.size
    px = im.load()
    for y in range(h):
        for x in range(w):
            dx, dy = (x - w / 2) / (w / 2), (y - h / 2) / (h / 2)
            k = min(1.0, max(0.0, (dx * dx + dy * dy - 0.35) * strength))
            r, g, b, a = px[x, y]
            px[x, y] = (int(r * (1 - k) + tint[0] * k), int(g * (1 - k) + tint[1] * k), int(b * (1 - k) + tint[2] * k), 255)
    return im


def shade_centre(im, x0, x1, alpha):
    """Darkens a centre column so itch's content panel reads against the artwork."""
    over = Image.new('RGBA', im.size, (0, 0, 0, 0))
    ImageDraw.Draw(over).rectangle([x0, 0, x1, im.height], fill=DECK + (alpha,))
    return Image.alpha_composite(im, over)


def title(im, scale, cy, cx):
    f = ImageFont.truetype(str(FONT), 16 * scale // 2 * 2)
    d = ImageDraw.Draw(im)
    for text, y in (('CORNER', cy - 11 * scale), ('CUTTERS', cy + 11 * scale)):
        for dy, col in ((3 * scale // 2, GOLD_DARK), (0, GOLD)):
            d.text((cx, y + dy), text, font=f, fill=col, anchor='mm')
    sw, sh = 48 * scale, scale  # the red/white kerb between the words
    for i in range(14):
        d.rectangle([cx - sw + i * (sw // 7), cy - scale // 2, cx - sw + (i + 1) * (sw // 7) - 1, cy - scale // 2 + sh],
                    fill=RED if i % 2 == 0 else WHITE)
    small = ImageFont.truetype(str(FONT), 3 * scale)
    d.text((cx, cy + 30 * scale), 'A R C A D E   G R A N D   P R I X', font=small, fill=WHITE, anchor='mm')


OUT.mkdir(parents=True, exist_ok=True)

# page background: 1920 x 1080 (a 480 x 270 scene at 4x). Track runs down each side, the middle is dark and quiet
# where itch's content column sits (about 960 px wide).
page = scene(480, 270, 7, 22, quiet=(120, 360), ground=((20, 22, 52), (14, 13, 30)), flecks=((38, 44, 96), (28, 30, 70), (60, 40, 90)), cars_big=2).resize((1920, 1080), Image.NEAREST)
page = shade_centre(vignette(page, 0.5), 480, 1440, 150)
page.convert('RGB').save(OUT / 'page-background.png', optimize=True)

# embed background: 1280 x 720 (a 320 x 180 scene at 4x), Crescent Park green, the title across a diagonal track
GREEN = (36, 92, 40)
emb = scene(320, 180, 11, 30, shift=0.3, ground=((30, 78, 36), (22, 60, 30)), flecks=((44, 104, 48), (26, 70, 32), (52, 116, 54)), cars_big=2).resize((1280, 720), Image.NEAREST)
glow = Image.new('RGBA', emb.size, (0, 0, 0, 0))
g = ImageDraw.Draw(glow)
for r in range(520, 0, -20):  # a soft dark pool behind the title
    g.ellipse([450 - r, 370 - r * 0.5, 450 + r, 370 + r * 0.5], fill=(10, 14, 12, 14))
emb = vignette(Image.alpha_composite(emb, glow), 0.7, tint=(8, 18, 12))
title(emb, 7, 330, 450)
emb.convert('RGB').save(OUT / 'embed-background.png', optimize=True)
print('itch art written to', OUT)
