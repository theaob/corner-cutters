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
  it('shows every circuit once, as a model card or as the race whose card it is, and races only a few', () => {
    expect(script.filter((s) => s.kind !== 'screen' && !s.mode).map((s) => s.circuit).sort()).toEqual(LAYOUTS.map((l) => l.id).sort());
    const raced = script.filter((s) => s.kind === 'race' && !s.mode).map((s) => s.circuit);
    // China, Monaco, the Ardennes, Brazil and Las Vegas
    expect(raced.slice().sort()).toEqual(['ardennes', 'harbour', 'jade-spiral', 'twin-lakes', 'vegas']);
    expect(script.at(-2)?.mode).toBe('timetrial');
    expect(script.at(-1)?.mode).toBe('timeattack');
  });
  it('races Brazil in the wet, with a pit stop and a big crash at La Source in the Ardennes, and the tunnel at Monaco', () => {
    const race = (id: string) => script.find((s) => s.circuit === id && s.kind === 'race' && !s.mode)!;
    expect(race('twin-lakes').weather).toBe('wet');
    expect(race('ardennes').events).toEqual(expect.arrayContaining([{ at: 4, do: 'flight', place: 'PIT LANE' }, expect.objectContaining({ do: 'crash', place: 'LA SOURCE' })]));
    expect(race('harbour').events?.some((e) => e.place === 'TUNNEL')).toBe(true);
  });
  it('opens the circuits with the Ardennes: the crash and the safety car at La Source', () => {
    const first = script.find((s) => s.kind !== 'screen')!;
    expect(first.circuit).toBe('ardennes');
    expect(first.events?.some((e) => e.do === 'crash' && e.place === 'LA SOURCE')).toBe(true);
  });
  it('adds an end card only with captions', () => {
    expect(all.length).toBe(script.length + 1);
    expect(all.at(-1)?.caption?.[0]).toBe('CORNER CUTTERS');
  });
  it('comes to about two to three minutes', () => {
    const rows = sheetRows(all, LAYOUTS, TEAMS);
    const end = rows.at(-1)!.start + rows.at(-1)!.length;
    expect(end).toBeGreaterThan(2 * 60);
    expect(end).toBeLessThan(3.5 * 60);
    expect(REEL_TIMING.load).toBeGreaterThan(0);
  });
  it('addresses its steps and reads them back', () => {
    expect(showIndex('?show')).toBe(0);
    expect(showIndex('?show=7')).toBe(7);
    expect(showIndex('')).toBeUndefined();
    const url = stepUrl('http://x/capture/?show=0&desktop', 4, script[4]); // (a model)
    expect(showIndex(new URL(url).search)).toBe(4);
    expect(new URL(url).searchParams.get('model')).toBe(script[4].circuit);
    expect(new URL(url).searchParams.has('circuit')).toBe(false);
    expect(new URL(url).searchParams.has('desktop')).toBe(true);
    expect(new URL(stepUrl('http://x/?show=3&circuit=a', 3, undefined)).search).toBe('');
  });
  // `npm run reel:sheet` writes the timed run sheet (docs/showreel-sheet.md) from the same data
  it.skipIf(!process.env.REEL_SHEET)('writes the run sheet', () => {
    const mmss = (s: number) => `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, '0')}`;
    const rows = sheetRows(all, LAYOUTS, TEAMS);
    const lines = all.map((s, i) => {
      const r = rows[i];
      const cap = s.caption ? s.caption.join(' / ') : s.kind === 'race' ? '(auto: circuit, team, description)' : s.kind === 'model' ? '(its name and description on the loading card)' : '';
      return `| ${i + 1} | ${mmss(r.start)} | ${r.length.toFixed(1)} s | ${r.what} | ${cap} |`;
    });
    const end = rows.at(-1)!.start + rows.at(-1)!.length;
    writeFileSync(process.env.REEL_SHEET!, [
      '# Showreel run sheet', '',
      `Generated from \`src/f1/showreel.json\` (\`npm run reel:sheet\`). Total about ${mmss(end)}. Times are estimates: a circuit's map card ${REEL_TIMING.load} s (a model step: ${REEL_TIMING.card} s before its seconds), lights ${REEL_TIMING.lights} s, crash replay ${REEL_TIMING.replay} s, ceremony ${REEL_TIMING.ceremony} s on top of each race's racing seconds.`, '',
      '| # | Start | Length | What happens | Caption (with &captions) |', '|---|---|---|---|---|', ...lines, '',
    ].join('\n'));
  });
});
