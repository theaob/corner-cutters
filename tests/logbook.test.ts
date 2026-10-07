import { beforeEach, describe, expect, it } from 'vitest';
import { LOGBOOK, clearNotes, fromUserAgent, lines, note, recent, withCrumbs } from '../src/engine/logbook';
import { CRASH_DATA_MAX, crashData } from '../src/f1/crashes';

describe('the logbook', () => {
  beforeEach(() => clearNotes());

  it('keeps the latest notes, each with the seconds since launch, short', () => {
    for (let k = 0; k < LOGBOOK.keep + 10; k++) note(`n${k}`);
    expect(recent()).toHaveLength(LOGBOOK.keep);
    expect(recent()[0].what).toBe('n10');
    expect(recent(2).map((n) => n.what)).toEqual([`n${LOGBOOK.keep + 8}`, `n${LOGBOOK.keep + 9}`]);
    note('x'.repeat(500));
    expect(recent(1)[0].what).toHaveLength(LOGBOOK.length);
    expect(lines(recent(1))[0]).toMatch(/^\d+\.\d x+$/);
  });

  it('fits as many of the latest notes as the room allows, the oldest let go first', () => {
    const crumbs = Array.from({ length: 40 }, (_, k) => `${k}.0 press a`);
    const out = withCrumbs({ message: 'boom' }, crumbs, 200);
    expect(JSON.stringify(out).length).toBeLessThanOrEqual(200);
    expect(out.crumbs.at(-1)).toBe('39.0 press a');
    expect(out.crumbs.length).toBeGreaterThan(3);
  });
});

describe('the device, from its user agent', () => {
  it('reads an Android phone: its model, Android and Chrome versions', () => {
    const ua = 'Mozilla/5.0 (Linux; Android 14; SM-S911B Build/UP1A.231005.007; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/129.0.6668.81 Mobile Safari/537.36';
    expect(fromUserAgent(ua)).toEqual({ model: 'SM-S911B', android: '14', webview: '129' });
  });

  it("leaves out a model the browser hides ('K'), and a desktop has none", () => {
    expect(fromUserAgent('Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Mobile Safari/537.36')).toEqual({ model: undefined, android: '10', webview: '130' });
    expect(fromUserAgent('Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36')).toEqual({ model: undefined, android: undefined, webview: '131' });
  });
});

describe("an error's details", () => {
  it('fit the database (the crash, the device, and the notes before it, as many as there is room for)', () => {
    const crash = { kind: 'error' as const, message: 'TypeError: '.padEnd(200, 'x'), where: '/assets/race.js:1:2'.padEnd(120, 'y'), stack: 'at f ('.padEnd(600, 'z') };
    const dev = { model: 'SM-S911B', android: '14', webview: '129', gpu: 'Adreno (TM) 740', mem: 8, cores: 8, screen: '390x844@3', quality: 'high', unknown: undefined };
    const crumbs = Array.from({ length: 60 }, (_, k) => `${k}.0 press a after something happened`);
    const data = crashData(crash, 'race', dev, crumbs);
    expect(JSON.stringify(data).length).toBeLessThanOrEqual(CRASH_DATA_MAX);
    expect(data.screen).toBe('race');
    expect(data.device).toEqual({ model: 'SM-S911B', android: '14', webview: '129', gpu: 'Adreno (TM) 740', mem: 8, cores: 8, screen: '390x844@3', quality: 'high' });
    const kept = data.crumbs as string[];
    expect(kept.length).toBeGreaterThan(5);
    expect(kept.at(-1)).toBe('59.0 press a after something happened');
  });
});
