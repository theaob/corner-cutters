import { describe, expect, it, vi } from 'vitest';
import { goFullscreen, wantsFullscreen } from '../src/engine/fullscreen';

const phone = (over: { standalone?: boolean; coarse?: boolean } = {}) => ({
  matchMedia: (q: string) => ({ matches: q.includes('coarse') ? (over.coarse ?? true) : q.includes('display-mode') ? !!over.standalone : false }),
  screen: { orientation: { type: 'portrait-primary', lock: vi.fn().mockResolvedValue(undefined) } },
}) as unknown as Window;
const page = (over: { enabled?: boolean; full?: boolean } = {}) => {
  const request = vi.fn().mockResolvedValue(undefined);
  return { doc: { fullscreenEnabled: over.enabled ?? true, fullscreenElement: over.full ? {} : null, documentElement: { requestFullscreen: request } } as unknown as Document, request };
};

describe('full screen at the title tap', () => {
  it('asks on a touch screen, with the address bar hidden', () => {
    const { doc, request } = page();
    goFullscreen(false, phone(), doc);
    expect(request).toHaveBeenCalledWith({ navigationUI: 'hide' });
  });
  it('holds the screen turn when asked (the showreel)', async () => {
    const { doc } = page();
    const w = phone();
    goFullscreen(true, w, doc);
    await Promise.resolve();
    await Promise.resolve();
    expect((w.screen.orientation as unknown as { lock: ReturnType<typeof vi.fn> }).lock).toHaveBeenCalledWith('portrait-primary');
  });
  it('does nothing with a mouse, when installed or already full screen, or where it is refused', () => {
    for (const [w, p] of [[phone({ coarse: false }), page()], [phone({ standalone: true }), page()], [phone(), page({ full: true })], [phone(), page({ enabled: false })]] as const) {
      expect(wantsFullscreen(w, p.doc)).toBe(false);
      goFullscreen(false, w, p.doc);
      expect(p.request).not.toHaveBeenCalled();
    }
  });
});
