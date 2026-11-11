import { describe, expect, it, vi } from 'vitest';
import { useSave, type SaveStore } from '../src/engine/save';
import { CC_SAVE } from '../src/f1/save';

// a ?debug session: its laps and Daily Challenge runs are never queued for the boards
vi.mock('../src/engine/debugSession', () => ({ debugSession: true }));

const { pendingLaps, queueLap } = await import('../src/f1/boards');
const { loadDaily, logRun } = await import('../src/f1/daily');

describe('a ?debug session', () => {
  const fresh = () => {
    const items = new Map<string, string>();
    const store: SaveStore = { getItem: (k) => items.get(k) ?? null, setItem: (k, v) => void items.set(k, v), removeItem: (k) => void items.delete(k) };
    useSave(CC_SAVE, store);
  };

  it('queues no lap for the Time Trial boards', () => {
    fresh();
    queueLap({ circuit: 'baku', weather: 'dry', time: 81.2 });
    expect(pendingLaps()).toEqual([]);
  });

  it('keeps its Daily Challenge run to itself (the best is still logged, nothing is pending)', () => {
    fresh();
    const log = loadDaily();
    expect(logRun(log, '2026-11-11', { score: 500, time: 70 })).toBe(true);
    expect(log.best['2026-11-11']).toBeDefined();
    expect(log.pending).toBeUndefined();
  });
});
