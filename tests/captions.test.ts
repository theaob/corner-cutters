import { describe, expect, it } from 'vitest';
import { captionsOn, placeCaption } from '../src/f1/captions';

describe('captions', () => {
  it('are off unless the address asks', () => {
    expect(captionsOn('?show')).toBe(false);
    expect(captionsOn('?show&captions')).toBe(true);
  });
  it('name the set pieces', () => {
    expect(placeCaption('TUNNEL')).toBe('THE TUNNEL');
    expect(placeCaption('PIT LANE', 'AZERBAIJAN')).toBe('AZERBAIJAN PIT LANE');
    expect(placeCaption('JUMP 2')).toBe('THE JUMP');
    expect(placeCaption('CASTLE WALLS')).toBe('THE CASTLE WALLS');
  });
});
