# The Japanese font for the Unity port (Silkscreen has no Japanese): DotGothic16 (SIL OFL 1.1), a pixel Gothic that
# sits with Silkscreen, cut down to what the game writes (the Japanese dictionary's characters, the kana, ASCII and
# the CJK punctuation), written to unity/Assets/Resources/Fonts/DotGothic16.ttf with the characters it has beside it
# (DotGothic16.chars.txt: the Unity tests check the dictionary needs none it hasn't). Run after ja.ts changes and
# `npm run unity:lang`:
#   npm pack @fontsource/dotgothic16 && tar xzf fontsource-dotgothic16-*.tgz
#   python3 tools/unity/jafont.py package/files
import glob, json, os, sys, tempfile
from fontTools.ttLib import TTFont
from fontTools.merge import Merger
from fontTools import subset

src = sys.argv[1] if len(sys.argv) > 1 else 'package/files'
root = os.path.join(os.path.dirname(__file__), '..', '..')
out = os.path.join(root, 'unity/Assets/Resources/Fonts/DotGothic16.ttf')
words = json.load(open(os.path.join(root, 'unity/Assets/Resources/Lang/ja.json'), encoding='utf-8'))['words']
want = set(''.join(words.values()) + ''.join(words.keys()))
want |= {chr(c) for c in list(range(0x20, 0x7f)) + list(range(0x3000, 0x3040)) + list(range(0x3040, 0x3100)) + list(range(0xff01, 0xff5f))}

with tempfile.TemporaryDirectory() as tmp:
    parts = []
    for p in sorted(glob.glob(os.path.join(src, 'dotgothic16-*-400-normal.woff'))):
        f = TTFont(p)
        f.flavor = None
        q = os.path.join(tmp, os.path.basename(p) + '.ttf')
        f.save(q)
        parts.append(q)
    font = Merger().merge(parts)
    have = set(chr(c) for c in font.getBestCmap())
    opts = subset.Options()
    opts.name_IDs = ['*']
    opts.notdef_outline = True
    s = subset.Subsetter(opts)
    s.populate(unicodes=[ord(c) for c in want if c in have])
    s.subset(font)
    font.save(out)
kept = sorted(c for c in want if c in have)
with open(out.replace('.ttf', '.chars.txt'), 'w', encoding='utf-8') as f:
    f.write(''.join(c for c in kept if c not in '\n\r') + '\n')
print(f'{os.path.getsize(out)} bytes, {len(kept)} characters; not in the font: {"".join(sorted(c for c in want - have if c.strip()))}')
