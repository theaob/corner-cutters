import { describe, expect, it } from 'vitest';
import { buildScript, showIndex, stepUrl } from '../src/f1/showreel';
import { LAYOUTS } from '../src/f1/layouts';
import { TEAMS } from '../src/f1/teams';

describe('showreel', () => {
  const script = buildScript(LAYOUTS, TEAMS);
  it('visits every circuit once in a race, and ends with a Time Trial and a Time Attack', () => {
    const races = script.filter((s) => s.kind === 'race' && s.mode === 'race').map((s) => s.circuit);
    expect(races).toEqual(LAYOUTS.map((l) => l.id));
    expect(script.at(-2)?.mode).toBe('timetrial');
    expect(script.at(-1)?.mode).toBe('timeattack');
  });
  it('shows the tunnel, the castle walls and the Azerbaijan pit lane', () => {
    const jumps = (id: string) => script.find((s) => s.circuit === id && s.mode === 'race')?.jumps;
    expect(jumps('harbour')).toContain('TUNNEL');
    expect(jumps('baku')).toEqual(expect.arrayContaining(['PIT LANE', 'CASTLE WALLS']));
  });
  it('uses every team and ends the circuits with champagne', () => {
    expect(new Set(script.map((s) => s.team).filter(Boolean)).size).toBe(TEAMS.length);
    expect(script.filter((s) => s.champagne).length).toBeGreaterThanOrEqual(3);
  });
  it('adds captions and an end card only when asked', () => {
    expect(script.some((x) => x.caption && x.screen === 'menu' && x.secs === 6)).toBe(false);
    const withCaptions = buildScript(LAYOUTS, TEAMS, true);
    expect(withCaptions.length).toBe(script.length + 1);
    expect(withCaptions.at(-1)?.caption?.[0]).toBe('CORNER CUTTERS');
  });
  it('addresses its steps and reads them back', () => {
    expect(showIndex('?show')).toBe(0);
    expect(showIndex('?show=7')).toBe(7);
    expect(showIndex('')).toBeUndefined();
    const url = stepUrl('http://x/capture/?show=0&desktop', 5, script[5]);
    expect(showIndex(new URL(url).search)).toBe(5);
    expect(new URL(url).searchParams.get('circuit')).toBe(script[5].circuit);
    expect(new URL(url).searchParams.has('desktop')).toBe(true);
    expect(new URL(stepUrl('http://x/?show=3&circuit=a', 3, undefined)).search).toBe('');
  });
});
