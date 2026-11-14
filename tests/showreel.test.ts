import { describe, expect, it } from 'vitest';
import { writeFileSync } from 'node:fs';
import { REEL_TIMING, SHOTS, checkScript, loadScript, sheetRows, showIndex, stepUrl } from '../src/f1/showreel';
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
    expect(race('ardennes').events).toEqual(expect.arrayContaining([expect.objectContaining({ do: 'flight', place: 'PIT LANE' }), expect.objectContaining({ do: 'crash', place: 'LA SOURCE' })]));
    expect(race('harbour').events?.some((e) => e.place === 'TUNNEL')).toBe(true);
  });
  it('opens the circuits with the Ardennes: the crash and the safety car at La Source', () => {
    const first = script.find((s) => s.kind !== 'screen')!;
    expect(first.circuit).toBe('ardennes');
    expect(first.events?.some((e) => e.do === 'crash' && e.place === 'LA SOURCE')).toBe(true);
  });
  it('directs the camera: every race opens on a shot of its own, and every shot named exists', () => {
    const races = script.filter((s) => s.kind === 'race');
    expect(races.every((s) => s.shot && SHOTS[s.shot])).toBe(true);
    const cams = races.flatMap((s) => (s.events ?? []).filter((e) => e.do === 'cam'));
    expect(cams.length).toBeGreaterThan(races.length);
    expect(cams.every((e) => SHOTS[e.shot ?? ''])).toBe(true);
    // (the game's own view is one of them, untouched)
    expect(SHOTS.wide).toEqual({ zoom: 1, yaw: 0, pitch: 0 });
  });
  it('catches a shot that does not exist, and a cut to nowhere on the lap', () => {
    const team = TEAMS[0].id;
    const bad = [
      { kind: 'race' as const, circuit: 'harbour', team, secs: 5, shot: 'upside-down', events: [{ at: 1, do: 'cam' as const, shot: 'sideways' }] },
      { kind: 'race' as const, circuit: 'harbour', team, secs: 5, start: 1.5, events: [{ at: 1, do: 'flight' as const, lap: 2 }] },
    ];
    expect(checkScript(bad, LAYOUTS, TEAMS).length).toBe(4);
    const good = [{ kind: 'race' as const, circuit: 'harbour', team, secs: 5, start: 0.5, shot: 'low', events: [{ at: 1, do: 'flight' as const, lap: 0.25 }, { at: 2, do: 'cam' as const, shot: 'orbit', cut: true }] }];
    expect(checkScript(good, LAYOUTS, TEAMS)).toEqual([]);
  });
  it('starts the short races rolling (no lights), the Ardennes from the grid', () => {
    const race = (id: string) => script.find((s) => s.circuit === id && s.kind === 'race' && !s.mode)!;
    expect(race('ardennes').start).toBeUndefined();
    for (const id of ['jade-spiral', 'harbour', 'twin-lakes', 'vegas']) expect(race(id).start).toBeGreaterThanOrEqual(0);
    const team = TEAMS[0].id;
    const [grid, rolling] = sheetRows([{ kind: 'race', circuit: 'harbour', team, secs: 5 }, { kind: 'race', circuit: 'harbour', team, secs: 5, start: 0.2 }], LAYOUTS, TEAMS);
    expect(grid.length - rolling.length).toBeCloseTo(REEL_TIMING.lights);
    expect(rolling.what).toContain('rolling start');
  });
  it('opens the Ardennes with a flyover up the start-finish straight, then chases the car off the line', () => {
    const ardennes = script.find((s) => s.circuit === 'ardennes' && s.kind === 'race')!;
    expect(ardennes.flyover).toBeGreaterThan(2);
    expect(ardennes.shot).toBe('chase');
    expect(SHOTS.chase.follow).toBe(true);
    const team = TEAMS[0].id;
    // (only before a race's grid start)
    expect(checkScript([{ kind: 'race', circuit: 'harbour', team, secs: 5, flyover: 3, start: 0.2 }, { kind: 'race', mode: 'timetrial', circuit: 'harbour', team, secs: 5, flyover: 3 }], LAYOUTS, TEAMS).length).toBe(2);
    const [plain, flown] = sheetRows([{ kind: 'race', circuit: 'harbour', team, secs: 5 }, { kind: 'race', circuit: 'harbour', team, secs: 5, flyover: 3 }], LAYOUTS, TEAMS);
    expect(flown.length).toBeGreaterThan(plain.length);
    expect(flown.what).toContain('flyover');
  });
  it('adds an end card only with captions', () => {
    expect(all.length).toBe(script.length + 1);
    expect(all.at(-1)?.caption?.[0]).toBe('CORNER CUTTERS');
  });
  it('comes to two to two and a half minutes', () => {
    const rows = sheetRows(all, LAYOUTS, TEAMS);
    const end = rows.at(-1)!.start + rows.at(-1)!.length;
    expect(end).toBeGreaterThan(2 * 60);
    expect(end).toBeLessThan(2.5 * 60);
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
      const cap = s.caption ? s.caption.join(' / ') : s.kind === 'race' ? '(auto: circuit and team)' : s.kind === 'model' ? '(its flag and name on the card)' : '';
      return `| ${i + 1} | ${mmss(r.start)} | ${r.length.toFixed(1)} s | ${r.what} | ${cap} |`;
    });
    const end = rows.at(-1)!.start + rows.at(-1)!.length;
    writeFileSync(process.env.REEL_SHEET!, [
      '# Showreel run sheet', '',
      `Generated from \`src/f1/showreel.json\` (\`npm run reel:sheet\`). Total about ${mmss(end)}. Times are estimates: a race's map card ${REEL_TIMING.load} s (a model step: ${REEL_TIMING.card} s on top of its seconds), lights ${REEL_TIMING.lights} s (none on a rolling start), crash replay ${REEL_TIMING.replay} s, ceremony ${REEL_TIMING.ceremony} s on top of each race's racing seconds.`, '',
      '| # | Start | Length | What happens | Caption (with &captions) |', '|---|---|---|---|---|', ...lines, '',
    ].join('\n'));
  });
});
