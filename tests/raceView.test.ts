import { describe, expect, it } from 'vitest';
import { deckLabels, type DeckState } from '../src/f1/race/deckLabels';
import { bannerMessage, type BannerState } from '../src/f1/race/banner';
import { blocks, ghostText, limitsText, readoutText, towText, tyreText } from '../src/f1/race/readout';
import { qualifyingRows, resultRows } from '../src/f1/race/resultsView';
import { buildCircuit } from '../src/f1/circuit';
import { CRESCENT_PARK } from '../src/f1/layouts';
import { carClass, newCar } from '../src/engine/driving';
import { lineCornerSpeed, lineDecel } from '../src/f1/racing';
import { newRace } from '../src/f1/raceControl';
import { handlingFor, NORMAL } from '../src/f1/difficulty';

const deck = (s: Partial<DeckState> = {}): DeckState => ({
  settings: false, resultsUp: false, roundOver: false, qualifyingOver: false, attackOver: false, session: 'race', learnt: false, watching: false, done: false, paused: false, ...s,
});

describe('the deck labels', () => {
  it('racing: SELECT pauses (no A on the touch deck), B drifts, START restarts', () => {
    expect(deckLabels(deck())).toEqual({ a: '', b: 'DRIFT', start: 'RESTART', select: 'PAUSE' });
  });
  it('paused: nothing on A (the pause screen resumes), SELECT exits; the settings: DONE alone', () => {
    expect(deckLabels(deck({ paused: true }))).toEqual({ a: '', b: '', start: 'RESTART', select: 'EXIT' });
    expect(deckLabels(deck({ settings: true }))).toEqual({ a: 'DONE', b: '', start: '', select: '' });
  });
  it('skips the grid pan, a replay, qualifying and the wait after the flag; NEXT, RACE and AGAIN once they are over', () => {
    expect(deckLabels(deck({ watching: true })).a).toBe('SKIP');
    expect(deckLabels(deck({ session: 'qualifying' })).a).toBe('SKIP');
    expect(deckLabels(deck({ done: true })).a).toBe('SKIP');
    expect(deckLabels(deck({ done: true, resultsUp: true, roundOver: true }))).toEqual({ a: 'NEXT', b: '', start: '', select: 'EXIT' });
    expect(deckLabels(deck({ qualifyingOver: true })).a).toBe('RACE');
    expect(deckLabels(deck({ attackOver: true })).a).toBe('AGAIN');
    expect(deckLabels(deck({ session: 'tutorial', learnt: true })).a).toBe('MENU');
  });
});

const banner = (s: Partial<BannerState> = {}): BannerState => ({
  replay: false, blink: false, ceremony: false, resultsUp: false, out: false, championship: false, done: false, boxBox: false, pitSide: 'LEFT',
  wrongWay: 0, clock: 30, session: 'race', notice: { text: '', color: '', until: 0 }, beforeLine: false, safetyCar: false, vsc: false, ...s,
});

describe('the banner', () => {
  it('says the most urgent thing', () => {
    expect(bannerMessage(banner())).toEqual(['', '']);
    expect(bannerMessage(banner({ clock: 0.5 }))[0]).toBe('GO!');
    expect(bannerMessage(banner({ replay: true, blink: true }))[0]).toBe('● REPLAY');
    expect(bannerMessage(banner({ done: true, finishedPlace: 2 }))).toEqual(['FINISHED · P2', '#f2c14e']);
    expect(bannerMessage(banner({ done: true, finishedPlace: 7 }))).toEqual(['FINISHED · P7', '#f4f4f8']);
    expect(bannerMessage(banner({ out: true }))[0]).toBe('DNF · RESTART to go again');
    expect(bannerMessage(banner({ out: true, championship: true }))[0]).toBe('DNF');
    expect(bannerMessage(banner({ pit: { stopped: true, left: 1.26, limiter: true } }))[0]).toBe('PIT STOP 1.3');
    expect(bannerMessage(banner({ pit: { stopped: false, left: 0, limiter: true } }))[0]).toBe('PIT LIMITER');
    expect(bannerMessage(banner({ boxBox: true, pitSide: 'RIGHT' }))[0]).toBe('BOX, BOX · PITS RIGHT');
    expect(bannerMessage(banner({ notice: { text: 'SAFETY CAR', color: '#f2c14e', until: 31 } }))[0]).toBe('SAFETY CAR');
    expect(bannerMessage(banner({ ceremony: true }))).toEqual(['', '']);
    expect(bannerMessage(banner({ session: 'timeattack', attackLeft: 3.04 }))).toEqual(['3.0 S', '#d8323c']);
    expect(bannerMessage(banner({ session: 'timetrial', beforeLine: true }))[0]).toBe('TIMING STARTS AT THE LINE');
  });
});

describe('the readout', () => {
  it('lap times, the gaps either side, the car and the tyres as five blocks', () => {
    expect(blocks(1)).toBe('■■■■■');
    expect(blocks(0.41)).toBe('■■■□□');
    const text = readoutText({ lapTime: 12.5, last: 30.1, best: 29.8, health: 0.5, wrecked: false, ahead: { name: 'HAM', gap: 0.42 }, behind: { name: 'LEC' } });
    expect(text).toContain('▲ HAM   +0.42');
    expect(text).toContain('▼ LEC   –');
    expect(text).toContain('CAR  ■■■□□');
    expect(readoutText({ health: 0, wrecked: true })).toContain('CAR  WRECKED');
    expect(readoutText({ health: 1, wrecked: false, attack: { left: 12.34, passed: 3 } })).toMatch(/^TIME 12\.3\n/);
    expect(tyreText('SFT', 0.8, true, 'INTERS')).toBe('TYRE SFT ■□□□□ 20% WORN\nBOX  FOR INTERS\n');
    expect(tyreText('MED', 0, false)).toBe('TYRE MED ■■■■■\n');
    expect(towText(0.05)).toBe('');
    expect(towText(0.5)).toBe('TOW  ▶▶▶\n');
    expect(limitsText(0)).toBe('');
    expect(ghostText(-0.5)).toBe('GAP  −0.50\n');
  });
});

describe('the results rows', () => {
  const f1 = carClass('f1');
  const c = buildCircuit(CRESCENT_PARK, { cornerSpeed: lineCornerSpeed(f1), decel: lineDecel(f1) });
  const field = c.slots.slice(0, 3).map((s) => ({ car: newCar(f1, s.x, s.y, s.heading) }));
  const named = ['VER', 'YOU', 'HAM'].map((name, k) => ({ name, number: k + 1, team: { code: 'MLK' } }));

  it('the winner\'s time, gaps, laps or DNF; places from the grid; penalties and stops', () => {
    const race = newRace(c.track, c.grid, handlingFor(NORMAL), 3, field, 0.5, c.pit);
    race.entrants[1].progress = { ...race.entrants[1].progress, finished: 90, lapTimes: [30, 29.5, 30.5] };
    race.entrants[0].progress = { ...race.entrants[0].progress, finished: 91.25, penalty: 5, lapTimes: [31, 30, 30.25] };
    race.entrants[2].progress = { ...race.entrants[2].progress, retired: true };
    race.entrants[0].stops = 1;
    const rows = resultRows(race, [1, 0, 2], named, 1, 1);
    expect(rows.map((r) => r.name)).toEqual(['YOU', 'VER', 'HAM']);
    expect(rows[0]).toMatchObject({ place: 1, moved: 1, you: true, fastest: true, time: '1:30.00' });
    expect(rows[1]).toMatchObject({ moved: -1, time: '+6.25', notes: '+5S 1P' });
    expect(rows[2]).toMatchObject({ time: 'DNF', best: '–' });
  });

  it("qualifying's: the grid, NO TIME, the gap to pole", () => {
    const rows = qualifyingRows([2, 0, 1], [31.5, undefined, 31.2], named, 1);
    expect(rows.map((r) => r.name)).toEqual(['HAM', 'VER', 'YOU']);
    expect(rows[0].gap).toBe('');
    expect(rows[1].gap).toBe('+0.300');
    expect(rows[2]).toMatchObject({ time: 'NO TIME', gap: '', you: true });
  });
});
