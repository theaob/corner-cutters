import { afterEach, describe, expect, it } from 'vitest';
import { LANGUAGES } from '../src/f1/lang';
import { setLanguage, useLanguages } from '../src/engine/i18n';
import { RADIO, RADIO_LINES, finishLine, newRadio, radioFor, radioLine, say, stepRadio, type RadioCue } from '../src/f1/radio';

describe('the team radio', () => {
  it('has a few ways of saying each thing, short enough for the panel', () => {
    for (const [cue, lines] of Object.entries(RADIO_LINES)) {
      expect(lines.length, cue).toBeGreaterThan(1);
      for (const l of lines) expect(l.length).toBeLessThanOrEqual(48);
    }
    expect(radioLine('box', () => 0)).toBe(RADIO_LINES.box[0]);
    expect(radioLine('box', () => 0.999)).toBe(RADIO_LINES.box[RADIO_LINES.box.length - 1]);
    const said = new Set(Array.from({ length: 40 }, (_, k) => radioLine('green' as RadioCue, () => (k % 10) / 10)));
    expect(said.size).toBeGreaterThan(1);
  });

  it('says how it went at the flag: a win, a podium, points, or not', () => {
    expect(finishLine(1, 10, () => 0)).toMatch(/P1/);
    expect(finishLine(3, 10, () => 0)).toMatch(/PODIUM/);
    expect(finishLine(7, 10, () => 0)).toMatch(/P7.*POINTS/);
    expect(finishLine(12, 20, () => 0)).toMatch(/P12/);
    expect(finishLine(12, 20, () => 0)).not.toMatch(/POINTS/);
  });

  it('says one line at a time, the next once it is done, the same line never twice over', () => {
    const q = newRadio();
    say(q, 'BOX, BOX.');
    say(q, 'BOX, BOX.');
    say(q, 'GREEN.');
    expect(stepRadio(q, 0.016)).toBe('BOX, BOX.');
    expect(stepRadio(q, 0.5)).toBeUndefined();
    expect(q.now?.text).toBe('BOX, BOX.');
    let next: string | undefined;
    for (let t = 0; t < radioFor('BOX, BOX.') && !next; t += 0.1) next = stepRadio(q, 0.1);
    expect(next).toBe('GREEN.');
  });

  it("drops a line that's waited too long (it's stale)", () => {
    const q = newRadio();
    say(q, 'A VERY LONG LINE ABOUT SOMETHING THAT GOES ON AND ON');
    stepRadio(q, 0.016);
    say(q, 'LATE.');
    let heard = false;
    for (let t = 0; t < 10; t += 0.1) if (stepRadio(q, 0.1) === 'LATE.') heard = true;
    expect(radioFor('A VERY LONG LINE ABOUT SOMETHING THAT GOES ON AND ON')).toBeGreaterThan(RADIO.stale);
    expect(heard).toBe(false);
  });
});

describe('the radio in another language', () => {
  afterEach(() => useLanguages([]));

  it('says every line in the chosen language, with the place filled in', () => {
    useLanguages(LANGUAGES);
    setLanguage('tr');
    expect(radioLine('box', () => 0)).toBe('PİTE, PİTE. BU TURDA PİTE GEL.');
    expect(finishLine(2, 10, () => 0)).toBe('P2! PODYUM! HARİKA İŞ.');
    for (const l of LANGUAGES) {
      setLanguage(l.code);
      for (const lines of Object.values(RADIO_LINES)) for (const en of lines) expect(l.words[en], `${l.code}: ${en}`).toBeTruthy();
    }
  });
});
