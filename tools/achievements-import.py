#!/usr/bin/env python3
"""Builds the ZIP the Play Console imports achievements from (Play Games Services →
Achievements → Import achievements): the game's achievements (src/f1/achievements.ts),
their points, and their icons (store/achievements/, drawn by tools/achievement-art.py).

    python3 tools/achievements-import.py        (needs nothing beyond Python)

Writes store/achievements-import.zip (commit it): AchievementsMetadata.csv (name,
description, incremental, steps, initial state, points, list order) and
AchievementsIconsMappings.csv (name, icon file), no header rows, as Google's format has
it (developer.android.com/games/pgs/integrate-achievements), and the 24 icons beside them.
No localisations: the names and descriptions are the default locale's.
"""
import re
import zipfile
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SOURCE = ROOT / 'src/f1/achievements.ts'
ICONS = ROOT / 'store/achievements'
OUT = ROOT / 'store/achievements-import.zip'

# each achievement's points on Play Games: multiples of 5, 5 to 200 each, 1,000 at most in all
POINTS = {
    'finish': 10, 'podium': 20, 'win': 30, 'hard-win': 70, 'wet-win': 40, 'from-back': 50, 'charge': 30,
    'hat-trick': 60, 'spotless': 30, 'purple': 25, 'endurance': 30, 'bald': 30, 'torch': 30, 'rocket': 15,
    'too-keen': 10, 'torpedo': 30, 'box': 10, 'no-stop': 25, 'lapped': 30, 'scrapheap': 15, 'golden': 30,
    'gold-standard': 100, 'champion': 90, 'globetrotter': 70, 'regular': 30, 'devoted': 60, 'busy-day': 30,
}

# Play allows no commas in a name or a description: the game's words without them, where it has any
PLAY_NAME = {'box': 'BOX BOX'}
PLAY_ABOUT = {'hat-trick': 'Take pole then win the race with its fastest lap'}


def achievements() -> list[tuple[str, str, str]]:
    """(id, name, what it takes) for each, in the game's order."""
    text = SOURCE.read_text()
    block = text[text.index('export const ACHIEVEMENTS'):]
    block = block[:block.index('];')]
    quoted = r"""(?:'((?:[^'\\]|\\.)*)'|"((?:[^"\\]|\\.)*)")"""
    rows = re.findall(r"\{ id: '([^']+)', name: " + quoted + r", about: " + quoted + r" \}", block)
    return [(i, (n1 or n2).replace("\\'", "'"), (a1 or a2).replace("\\'", "'")) for i, n1, n2, a1, a2 in rows]


def main() -> None:
    items = achievements()
    ids = [i for i, _, _ in items]
    assert set(ids) == set(POINTS), f'points for {sorted(set(ids) ^ set(POINTS))}'
    assert sum(POINTS.values()) <= 1000, sum(POINTS.values())
    meta, icons = [], []
    for order, (i, name, about) in enumerate(items, 1):
        name = PLAY_NAME.get(i, name)
        about = PLAY_ABOUT.get(i, about).rstrip('.') + '.'
        points = POINTS[i]
        assert ',' not in name and ',' not in about, (i, name, about)
        assert len(name) <= 100 and len(about) <= 500, i
        assert points % 5 == 0 and 5 <= points <= 200, (i, points)
        icon = ICONS / f'{i}.png'
        assert icon.exists(), icon
        meta.append(f'{name},{about},False,,Revealed,{points},{order}')
        icons.append(f'{name},{icon.name}')
    names = [m.split(',')[0] for m in meta]
    assert len(set(names)) == len(names), 'names must be unique'
    with zipfile.ZipFile(OUT, 'w', zipfile.ZIP_DEFLATED) as z:
        z.writestr('AchievementsMetadata.csv', '\n'.join(meta) + '\n')
        z.writestr('AchievementsIconsMappings.csv', '\n'.join(icons) + '\n')
        for i in ids:
            z.write(ICONS / f'{i}.png', f'{i}.png')
    print(f'{len(items)} achievements, {sum(POINTS.values())} points, in {OUT}')


if __name__ == '__main__':
    main()
