// The circuits' country flags for the Unity port (src/f1/flags.ts's drawings, as the menus show them): each drawn
// by the browser from its SVG into a PNG, 3:2, with the web game's faint rounded edge, to
// unity/Assets/Resources/Flags/<code>.png. Run with `npm run unity:flags` after a flag's drawn or a circuit's country
// is added.
import { mkdirSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { flagMarkup } from '../../src/f1/flags';
import { LAYOUTS } from '../../src/f1/layouts';

const W = 120;
const H = 80;
const out = 'unity/Assets/Resources/Flags';

const codes = [...new Set(LAYOUTS.map((l) => l.country).filter((c): c is string => !!c && !!flagMarkup(c)))].sort();
const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: W, height: H }, deviceScaleFactor: 1 });
mkdirSync(out, { recursive: true });
for (const code of codes) {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 30 20" width="${W}" height="${H}"><g>${flagMarkup(code)}</g><rect width="30" height="20" rx="2" fill="none" stroke="rgba(255,255,255,.35)" stroke-width="0.8"/></svg>`;
  await page.setContent(`<html><body style="margin:0;background:transparent">${svg}</body></html>`);
  writeFileSync(`${out}/${code}.png`, await page.locator('svg').screenshot({ omitBackground: true }));
}
await browser.close();
console.log(`flags: ${codes.length} (${codes.join(' ')}) to ${out}`);
