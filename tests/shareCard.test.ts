import { describe, expect, it } from 'vitest';
import { attackCard, cardFile, raceCard, shareText, splitDistance } from '../src/f1/shareCard';

const team = { name: 'Milk Energy', body: '#1e2b5c', trim: '#f2c14e' };

describe('the result card to share', () => {
  it('a win: P1 in gold, WINNER, the places gained from the grid', () => {
    const c = raceCard({ circuit: 'CRESCENT PARK', mode: 'QUICK RACE · NORMAL · DRY', place: 1, field: 10, grid: 6, gap: 0, best: '0:29.81', fastest: true, team, date: '2026-10-04' });
    expect(c.headline).toBe('P1');
    expect(c.color).toBe('#f2c14e');
    expect(c.sub).toBe('WINNER');
    expect(c.stats).toEqual([['GRID', 'P6'], ['PLACES', '▲5'], ['FASTEST LAP', '0:29.81']]);
    expect(shareText(c)).toBe('I finished P1 at Crescent Park in Corner Cutters 🏁 🏆 Can you beat it? https://theaob.itch.io/corner-cutters');
    expect(cardFile(c)).toBe('corner-cutters-crescent-park-2026-10-04.png');
  });

  it('a podium, a lower place, and a DNF', () => {
    const base = { circuit: 'NIPPON', mode: 'QUICK RACE', field: 10, grid: 2, fastest: false, team, date: '2026-10-04' };
    expect(raceCard({ ...base, place: 3, gap: 4.2 }).sub).toBe('PODIUM · +4.20 S');
    const p7 = raceCard({ ...base, place: 7, gap: 21.456 });
    expect(p7.sub).toBe('+21.46 S');
    expect(p7.stats[1]).toEqual(['PLACES', '▼5']);
    const out = raceCard({ ...base });
    expect(out.headline).toBe('DNF');
    expect(shareText(out)).toMatch(/^I crashed out at Nippon/);
  });

  it("a Time Attack's distance and medal", () => {
    const c = attackCard({ circuit: 'OASIS', mode: 'TIME ATTACK', distance: '2 LAPS + 3 SECTORS', medal: 'gold', record: true, team, date: '2026-10-04' });
    expect(c.headline).toBe('2 LAPS + 3 SECTORS');
    // (on the card on two lines, the sectors under the laps; a whole number of laps, or sectors alone, on one)
    expect(splitDistance(c.headline)).toEqual(['2 LAPS', '+ 3 SECTORS']);
    expect(splitDistance('4 LAPS')).toEqual(['4 LAPS']);
    expect(splitDistance('2 SECTORS')).toEqual(['2 SECTORS']);
    expect(c.sub).toBe('GOLD MEDAL · NEW RECORD');
    expect(c.medal).toBe('gold');
    // (the text says it in words)
    expect(shareText(c)).toMatch(/^I reached 2 laps \+ 3 sectors at Oasis/);
  });
});
