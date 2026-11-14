import { describe, expect, it } from 'vitest';
import { writeFileSync } from 'node:fs';
import { REEL_TIMING, checkScript, loadScript, sheetRows, showIndex, stepUrl } from '../src/f1/showreel';
import { LAYOUTS } from '../src/f1/layouts';
import { TEAMS } from '../src/f1/teams';

describe('showreel', () => {
  const script = loadScript(false);
  const all = loadScript(true);
  it('is consistent: every circuit, team, weather and place in it exists, every event is inside its step', () => {
    expect(checkScript(all, LAYOUTS, TEAMS)).toEqual([]);
  });
  it('catches a mistake in it', () => {
    const bad = [{ kind: 'race' as const, circuit: 'nowhere', team: 'x', secs: 5 }, { kind: 'race' as const, circuit: 'harbour', team: TEAMS[0].id, weather: 'fog', secs: 5, events: [{ at: 9, do: 'flight' as const, place: 'TUNNEL' }, { at: 1, do: 'flight' as const, place: 'MOON' }] }];
    expect(checkScript(bad, LAYOUTS, TEAMS).length).toBe(4);
  });
  it('visits every circuit once in a race, and ends with a Time Trial and a Time Attack', () => {
    const races = script.filter((s) => s.kind === 'race' && !s.mode).map((s) => s.circuit);
    expect(races).toEqual(LAYOUTS.map((l) => l.id));
    expect(script.at(-2)?.mode).toBe('timetrial');
    expect(script.at(-1)?.mode).toBe('timeattack');
  });
  it('shows the tunnel, the castle walls and the Azerbaijan pit lane', () => {
    const flights = (id: string) => script.find((s) => s.circuit === id && !s.mode)?.events?.filter((e) => e.do === 'flight').map((e) => e.place);
    expect(flights('harbour')).toContain('TUNNEL');
    expect(flights('baku')).toEqual(expect.arrayContaining(['PIT LANE', 'CASTLE WALLS']));
  });
  it('uses every team, and ends circuits in champagne', () => {
    expect(new Set(script.map((s) => s.team).filter(Boolean)).size).toBe(TEAMS.length);
    expect(script.filter((s) => s.events?.some((e) => e.do === 'champagne')).length).toBeGreaterThanOrEqual(3);
  });
  it('keeps the crashes to the later part of the reel', () => {
    const at = script.map((s, i) => (s.events?.some((e) => e.do === 'crash') ? i : -1)).filter((i) => i >= 0);
    expect(at.length).toBeGreaterThanOrEqual(2);
    for (const i of at) expect(i).toBeGreaterThan(script.length * 0.5);
  });
  it('adds an end card only with captions', () => {
    expect(all.length).toBe(script.length + 1);
    expect(all.at(-1)?.caption?.[0]).toBe('CORNER CUTTERS');
  });
  it('comes to about five or six minutes', () => {
    const rows = sheetRows(all, LAYOUTS, TEAMS);
    const end = rows.at(-1)!.start + rows.at(-1)!.length;
    expect(end).toBeGreaterThan(4.5 * 60);
    expect(end).toBeLessThan(6.5 * 60);
    expect(REEL_TIMING.load).toBeGreaterThan(0);
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
  // `npm run reel:sheet` writes the timed run sheet (docs/showreel-sheet.md) from the same data
  it.skipIf(!process.env.REEL_SHEET)('writes the run sheet', () => {
    const mmss = (s: number) => `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, '0')}`;
    const rows = sheetRows(all, LAYOUTS, TEAMS);
    const lines = all.map((s, i) => {
      const r = rows[i];
      const cap = s.caption ? s.caption.join(' / ') : s.kind === 'race' ? '(auto: circuit, team, description)' : '';
      return `| ${i + 1} | ${mmss(r.start)} | ${r.length.toFixed(1)} s | ${r.what} | ${cap} |`;
    });
    const end = rows.at(-1)!.start + rows.at(-1)!.length;
    writeFileSync(process.env.REEL_SHEET!, [
      '# Showreel run sheet', '',
      `Generated from \`src/f1/showreel.json\` (\`npm run reel:sheet\`). Total about ${mmss(end)}. Times are estimates: loading card ${REEL_TIMING.load} s, lights ${REEL_TIMING.lights} s, crash replay ${REEL_TIMING.replay} s, ceremony ${REEL_TIMING.ceremony} s on top of each race's racing seconds.`, '',
      '| # | Start | Length | What happens | Caption (with &captions) |', '|---|---|---|---|---|', ...lines, '',
    ].join('\n'));
  });
});
