import { describe, expect, it, vi } from 'vitest';
import { parkBackdrop } from '../src/f1/screens/menuBackdrop';

describe('parkBackdrop', () => {
  it('stops a backdrop that is not the one racing (nothing to carry on)', () => {
    const stop = vi.fn();
    parkBackdrop(stop);
    expect(stop).toHaveBeenCalledOnce();
  });
});
