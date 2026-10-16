// The flags of the countries the circuits are in, drawn in code (no images to fetch): a small SVG each, 3:2, for the
// menus. A circuit's `country` (layouts.ts) names its flag; the circuits of our own have none.

/** A five-pointed star centred on (cx, cy), r from the middle to a point. */
function star(cx: number, cy: number, r: number, fill = '#fff'): string {
  const pts: string[] = [];
  for (let k = 0; k < 10; k++) {
    const a = (Math.PI * k) / 5 - Math.PI / 2;
    const d = k % 2 ? r * 0.382 : r;
    pts.push(`${(cx + Math.cos(a) * d).toFixed(2)},${(cy + Math.sin(a) * d).toFixed(2)}`);
  }
  return `<polygon points="${pts.join(' ')}" fill="${fill}"/>`;
}

/** A crescent opening to the right, centred on (cx, cy), r wide. */
const crescent = (cx: number, cy: number, r: number, bg: string): string =>
  `<circle cx="${cx}" cy="${cy}" r="${r}" fill="#fff"/><circle cx="${cx + r * 0.3}" cy="${cy}" r="${r * 0.8}" fill="${bg}"/>`;

/** A row of white points down the hoist edge, over the flag's red or maroon: Qatar's and Bahrain's serrated border. */
const serrated = (n: number, x: number, fill: string): string => {
  const h = 20 / n;
  let d = `M0,0 H${x}`;
  for (let k = 0; k < n; k++) d += ` L${x + 3.5},${(k + 0.5) * h} L${x},${(k + 1) * h}`;
  return `<path d="${d} H0 Z" fill="${fill}"/>`;
};

const JACK =
  '<rect width="30" height="20" fill="#012169"/>' +
  '<path d="M0,0 L30,20 M30,0 L0,20" stroke="#fff" stroke-width="4"/>' +
  '<path d="M0,0 L30,20 M30,0 L0,20" stroke="#c8102e" stroke-width="1.4"/>' +
  '<path d="M15,0 V20 M0,10 H30" stroke="#fff" stroke-width="6"/>' +
  '<path d="M15,0 V20 M0,10 H30" stroke="#c8102e" stroke-width="3.4"/>';

const FLAGS: Record<string, string> = {
  GB: JACK,
  US:
    '<rect width="30" height="20" fill="#fff"/>' +
    [0, 2, 4, 6, 8, 10, 12].map((k) => `<rect y="${(k * 20) / 13}" width="30" height="${20 / 13}" fill="#b22234"/>`).join('') +
    '<rect width="13" height="10.8" fill="#3c3b6e"/>' +
    [1, 3.2, 5.4, 7.6, 9.8].flatMap((x, i) => [2, 4.6, 7.2, 9.2].map((y) => ((i + Math.round(y)) % 2 ? '' : star(x + 0.4, y - 0.2, 0.7)))).join(''),
  AU:
    '<rect width="30" height="20" fill="#012169"/>' +
    `<g transform="scale(0.5)">${JACK}</g>` +
    star(7.5, 15, 3) + star(22, 15.5, 1.4) + star(18, 8, 1.4) + star(26, 7, 1.4) + star(22, 3, 1.4) + star(23, 9.5, 0.9),
  CA:
    '<rect width="30" height="20" fill="#fff"/><rect width="7.5" height="20" fill="#d52b1e"/><rect x="22.5" width="7.5" height="20" fill="#d52b1e"/>' +
    '<path d="M15,3.5 L16.4,6.6 L18.6,5.8 L18,9.6 L20.2,8.6 L19.4,11.2 L21.2,12.4 L15.8,13.8 L15.8,17 H14.2 V13.8 L8.8,12.4 L10.6,11.2 L9.8,8.6 L12,9.6 L11.4,5.8 L13.6,6.6 Z" fill="#d52b1e"/>',
  IT: '<rect width="10" height="20" fill="#009246"/><rect x="10" width="10" height="20" fill="#fff"/><rect x="20" width="10" height="20" fill="#ce2b37"/>',
  BE: '<rect width="10" height="20" fill="#000"/><rect x="10" width="10" height="20" fill="#fae042"/><rect x="20" width="10" height="20" fill="#ed2939"/>',
  NL: '<rect width="30" height="20" fill="#21468b"/><rect width="30" height="13.4" fill="#fff"/><rect width="30" height="6.7" fill="#ae1c28"/>',
  AT: '<rect width="30" height="20" fill="#ed2939"/><rect y="6.7" width="30" height="6.6" fill="#fff"/>',
  MC: '<rect width="30" height="20" fill="#fff"/><rect width="30" height="10" fill="#ce1126"/>',
  BR:
    '<rect width="30" height="20" fill="#009c3b"/><path d="M15,2 L27.5,10 L15,18 L2.5,10 Z" fill="#ffdf00"/>' +
    '<circle cx="15" cy="10" r="4.6" fill="#002776"/><path d="M10.6,9 Q15,7.6 19.4,11" stroke="#fff" stroke-width="0.8" fill="none"/>',
  JP: '<rect width="30" height="20" fill="#fff"/><circle cx="15" cy="10" r="6" fill="#bc002d"/>',
  CN: '<rect width="30" height="20" fill="#de2910"/>' + star(5, 5, 3, '#ffde00') + star(10, 2, 1, '#ffde00') + star(12, 4.5, 1, '#ffde00') + star(12, 7.5, 1, '#ffde00') + star(10, 10, 1, '#ffde00'),
  TR: '<rect width="30" height="20" fill="#e30a17"/>' + crescent(11.5, 10, 5, '#e30a17') + star(17.5, 10, 2.2),
  AZ: '<rect width="30" height="20" fill="#00b5e2"/><rect y="6.7" width="30" height="13.3" fill="#ef3340"/><rect y="13.4" width="30" height="6.6" fill="#509e2f"/>' + crescent(14, 10, 3.2, '#ef3340') + star(18.8, 10, 1.2),
  QA: '<rect width="30" height="20" fill="#8d1b3d"/>' + serrated(9, 8, '#fff'),
  BH: '<rect width="30" height="20" fill="#ce1126"/>' + serrated(5, 8, '#fff'),
};

/** Whether there's a flag for this country code. */
/** A flag's drawing (the inside of its SVG), or nothing for a country without one. */
export const flagMarkup = (code?: string): string | undefined => (code && code in FLAGS ? FLAGS[code] : undefined);

export const hasFlag = (code?: string): boolean => !!code && code in FLAGS;

/** The flag of a country (its two-letter code) as an SVG `w` px wide, or nothing for a country without one. */
export function flagSvg(code: string | undefined, w = 24): SVGSVGElement | undefined {
  if (!code || !(code in FLAGS)) return undefined;
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', '0 0 30 20');
  svg.setAttribute('width', `${w}`);
  svg.setAttribute('height', `${(w * 2) / 3}`);
  svg.setAttribute('class', 'flag');
  svg.setAttribute('role', 'img');
  svg.setAttribute('aria-label', `flag ${code}`);
  svg.setAttribute('preserveAspectRatio', 'xMidYMid meet');
  svg.innerHTML = `<g>${FLAGS[code]}</g><rect width="30" height="20" rx="2" fill="none" stroke="rgba(255,255,255,.35)" stroke-width="0.8"/>`;
  return svg;
}
