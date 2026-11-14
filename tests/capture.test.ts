import { describe, expect, it } from 'vitest';
import { capturePlaces } from '../src/f1/capture';
import { LAYOUTS, layoutById } from '../src/f1/layouts';

describe('capture build places', () => {
  const n = 500;
  const spacing = 24;
  it('every circuit offers the start and the pit lane, all inside the lap', () => {
    for (const l of LAYOUTS) {
      const places = capturePlaces(l, n, spacing, 40);
      expect(places.map((p) => p.label).slice(0, 2)).toEqual(['START / FINISH', 'PIT LANE']);
      for (const p of places) expect(p.idx >= 0 && p.idx < n).toBe(true);
    }
  });
  it('Harbour has its tunnel, Caspian Shores its castle walls, Maple Island its wall', () => {
    const labels = (id: string) => capturePlaces(layoutById(id)!, n, spacing, 40).map((p) => p.label);
    expect(labels('harbour')).toContain('TUNNEL');
    expect(labels('baku')).toContain('CASTLE WALLS');
    expect(labels('maple-island')).toContain('WALL OF CHAMPIONS');
  });
});
