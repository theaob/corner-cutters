# itch.io page art

Drawn by `python3 tools/itch-art.py` (needs Pillow), in the game's palette: the dark deck, red/white kerbs, gold title.

| File | Size | Where it goes |
| --- | --- | --- |
| `page-background.png` | 1920 × 1080 | Edit game → Theme → **Background image** |
| `embed-background.png` | 1280 × 720 | Edit game → Theme → **Banner/Header**, or the click-to-run backdrop (Embed options) |

## Upload

1. On itch.io open the dashboard, choose the game, then **Edit game**.
2. Scroll to **Theme** (or open **Edit theme**) and set **Background image** to `page-background.png`. Set the background
   colour to `#0e0d16` and leave "tile" off (the picture is fixed, with a calm dark middle behind the content column).
3. Upload `embed-background.png` as the banner/click-to-launch backdrop and save.

The page background keeps its middle quiet on purpose: itch's content column (about 960 px) sits there, and the
tracks run down the two sides. The embed picture has the title on the left and the track on the right so a game
frame's controls and play button don't cover the art.
