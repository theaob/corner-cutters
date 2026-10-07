import { describe, expect, it } from 'vitest';
import { ACHIEVEMENTS } from '../src/f1/achievements';
import { matchName, playAchievements, type PlayGamesBridge } from '../src/f1/playAchievements';

/** A stand-in for the app's bridge: Play Games there or not, signed in or not; what's been sent to it. */
function fakeBridge(o: { available?: boolean; signedIn?: boolean; signsIn?: boolean } = {}) {
  const sent: string[] = [];
  let shown = 0;
  const bridge: PlayGamesBridge = {
    start: async () => ({ available: o.available ?? true, signedIn: o.signedIn ?? true }),
    signIn: async () => ({ available: true, signedIn: o.signsIn ?? true }),
    unlock: async ({ id }) => void sent.push(id),
    showAchievements: async () => void shown++,
  };
  return { bridge, sent, shown: () => shown };
}

const IDS = { finish: 'CgkI_finish', win: 'CgkI_win' };

describe('achievements on Google Play Games', () => {
  it('sends those earned before on start, once signed in, and each one unlocked after', async () => {
    const f = fakeBridge();
    const play = playAchievements(f.bridge, IDS);
    await play.start(['finish', 'podium']);
    expect(play.available() && play.signedIn()).toBe(true);
    // (podium has no Play id: not sent)
    expect(f.sent).toEqual(['CgkI_finish']);
    await play.report(['win']);
    expect(f.sent).toEqual(['CgkI_finish', 'CgkI_win']);
  });

  it('sends nothing until signed in; signing in from the cabinet sends what was earned, then shows Google’s screen', async () => {
    const f = fakeBridge({ signedIn: false });
    const play = playAchievements(f.bridge, IDS);
    await play.start(['finish']);
    await play.report(['win']);
    expect(f.sent).toEqual([]);
    expect(await play.show(['finish', 'win'])).toBe(true);
    expect(f.sent).toEqual(['CgkI_finish', 'CgkI_win']);
    expect(f.shown()).toBe(1);
  });

  it('does nothing without Play Games (another build, or no project set up), or if the player won’t sign in', async () => {
    const off = fakeBridge({ available: false });
    const none = playAchievements(off.bridge, IDS);
    await none.start(['finish']);
    expect(none.available()).toBe(false);
    expect(await none.show(['finish'])).toBe(false);
    expect(off.sent).toEqual([]);

    const declined = fakeBridge({ signedIn: false, signsIn: false });
    const play = playAchievements(declined.bridge, IDS);
    await play.start(['finish']);
    expect(await play.show(['finish'])).toBe(false);
    expect(declined.shown()).toBe(0);
  });

  it('copes with a bridge that fails (Play busy, or not there at all)', async () => {
    const broken: PlayGamesBridge = {
      start: () => Promise.reject(new Error('no plugin')),
      signIn: () => Promise.reject(new Error('no plugin')),
      unlock: () => Promise.reject(new Error('no plugin')),
      showAchievements: () => Promise.reject(new Error('no plugin')),
    };
    const play = playAchievements(broken, IDS);
    await play.start(['finish']);
    expect(play.available()).toBe(false);
  });

  it('only maps achievements the game has', async () => {
    const { PLAY_ACHIEVEMENT_IDS } = await import('../src/f1/playAchievements');
    const known = new Set(ACHIEVEMENTS.map((a) => a.id));
    for (const id of Object.keys(PLAY_ACHIEVEMENT_IDS)) expect(known.has(id)).toBe(true);
  });
});

describe('finding the achievements on Play Games by name', () => {
  it('sends those without an id here by their name as Play lists them (punctuation and case aside)', async () => {
    const sent: string[] = [];
    let listed = 0;
    const bridge: PlayGamesBridge = {
      start: async () => ({ available: true, signedIn: true }),
      signIn: async () => ({ available: true, signedIn: true }),
      unlock: async ({ id }) => void sent.push(id),
      showAchievements: async () => {},
      list: async () => {
        listed++;
        return { achievements: ACHIEVEMENTS.map((a) => ({ id: `play-${a.id}`, name: a.name.replace(/,/g, '').toLowerCase() })) };
      },
    };
    const play = playAchievements(bridge, {});
    await play.start(['box', 'finish']);
    await play.report(['win']);
    // ("BOX, BOX" in the game is "BOX BOX" on Play)
    expect(sent).toEqual(['play-box', 'play-finish', 'play-win']);
    // (listed once)
    expect(listed).toBe(1);
  });

  it('every achievement in the game has a name that matches its own on Play Games, and no two the same', () => {
    const names = ACHIEVEMENTS.map((a) => matchName(a.name));
    expect(new Set(names).size).toBe(names.length);
    expect(names.every((n) => n.length > 0)).toBe(true);
  });

  it('asks again later when Play Games could not list them', async () => {
    const sent: string[] = [];
    let tries = 0;
    const bridge: PlayGamesBridge = {
      start: async () => ({ available: true, signedIn: true }),
      signIn: async () => ({ available: true, signedIn: true }),
      unlock: async ({ id }) => void sent.push(id),
      showAchievements: async () => {},
      list: async () => {
        if (++tries === 1) throw new Error('offline');
        return { achievements: [{ id: 'play-win', name: 'WINNER' }] };
      },
    };
    const play = playAchievements(bridge, {}, { win: 'Winner' });
    await play.start(['win']);
    expect(sent).toEqual([]);
    await play.report(['win']);
    expect(sent).toEqual(['play-win']);
  });
});
