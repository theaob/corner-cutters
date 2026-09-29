// Canvas helpers and the small drawn sprites shared by every game: a crisp
// pixel canvas, a top-down car, and a soft ground shadow.

export function canvas(w: number, h: number): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const x = c.getContext('2d')!;
  x.imageSmoothingEnabled = false;
  return [c, x];
}

function shade(hex: string, amt: number): string {
  const n = parseInt(hex.slice(1), 16);
  const f = (v: number) => Math.max(0, Math.min(255, Math.round(amt < 0 ? v * (1 + amt) : v + (255 - v) * amt)));
  return '#' + [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => f(v).toString(16).padStart(2, '0')).join('');
}

/** A top-down car facing north, 16x28 with the body centred. */
export function carSprite(body: string, stripe?: string): HTMLCanvasElement {
  const [c, x] = canvas(16, 28);
  const r = (px: number, py: number, w: number, h: number, col: string) => {
    x.fillStyle = col;
    x.fillRect(px, py, w, h);
  };
  const L = 26;
  const W = 14;
  const hx = 1;
  const hy = 1;
  for (const [wx, wy] of [[hx - 1, hy + 4], [hx + W - 1, hy + 4], [hx - 1, hy + L - 9], [hx + W - 1, hy + L - 9]]) r(wx, wy, 2, 5, '#111');
  r(hx, hy, W, L, '#1b1b26');
  r(hx + 1, hy + 1, W - 2, L - 2, body);
  r(hx + 1, hy + 1, W - 2, 1, shade(body, 0.35));
  r(hx + 1, hy + 1, 1, L - 2, shade(body, 0.2));
  r(hx + W - 2, hy + 1, 1, L - 2, shade(body, -0.25));
  r(hx + 2, hy + 6, W - 4, 4, '#9ec5e8');
  r(hx + 3, hy + 6, 3, 1, '#e8f4ff');
  r(hx + 2, hy + 10, W - 4, 8, shade(body, 0.15));
  r(hx + 2, hy + 18, W - 4, 3, '#6d86b8');
  r(hx + 1, hy, 3, 1, '#fff6c2');
  r(hx + W - 4, hy, 3, 1, '#fff6c2');
  r(hx + 1, hy + L - 1, 3, 1, '#ff4b4b');
  r(hx + W - 4, hy + L - 1, 3, 1, '#ff4b4b');
  if (stripe) {
    r(hx + 5, hy + 1, 1, L - 2, stripe);
    r(hx + W - 6, hy + 1, 1, L - 2, stripe);
  }
  return c;
}

/** Soft oval ground shadow for flat (C) sprites. */
export function shadowSprite(w: number, h: number): HTMLCanvasElement {
  const [c, x] = canvas(w, h);
  x.fillStyle = 'rgba(15,15,30,0.3)';
  x.beginPath();
  x.ellipse(w / 2, h / 2, w / 2, h / 2, 0, 0, Math.PI * 2);
  x.fill();
  return c;
}
