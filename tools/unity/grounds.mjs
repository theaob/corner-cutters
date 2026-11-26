// `npm run unity:grounds [id ...]`: bakes each circuit's ground picture for the Unity port into
// unity/Assets/Resources/Grounds/<id>.png. Serves tools/unity/ground.html with Vite, opens it in headless Chromium
// (Playwright: not one of the game's dependencies; a global install, `npm i -g playwright`, will do), and saves what the web game's own painter drew (circuitScene's paint). No ids: every circuit.
import { createServer } from 'vite';
import { createRequire } from 'node:module';
import { mkdirSync, writeFileSync } from 'node:fs';

// (Playwright from the project if it is there, else a global install)
const { chromium } = await import('playwright').catch(() => createRequire(import.meta.url)('playwright'));

const out = 'unity/Assets/Resources/Grounds';
const sceneryOut = 'unity/Assets/Resources/Scenery';
mkdirSync(out, { recursive: true });
mkdirSync(sceneryOut, { recursive: true });
// (--scenery-only: just the scenery; --no-scenery: just the ground pictures)
const flags = process.argv.slice(2).filter((a) => a.startsWith('--'));
const doGround = !flags.includes('--scenery-only');
const doScenery = !flags.includes('--no-scenery');
const server = await createServer({ server: { port: 5199, strictPort: false }, logLevel: 'warn' });
await server.listen();
const url = server.resolvedUrls.local[0];
const browser = await chromium.launch();
try {
  const page = await browser.newPage();
  page.on('pageerror', (e) => console.error('page error:', e.message));
  await page.goto(`${url}tools/unity/ground.html`);
  await page.waitForFunction(() => window.groundReady === true, null, { timeout: 120000 });
  const all = await page.evaluate(() => window.groundIds);
  const named = process.argv.slice(2).filter((a) => !a.startsWith('--'));
  const ids = named.length ? named : all;
  for (const id of ids) {
    if (!all.includes(id)) throw new Error(`no circuit ${id}`);
    if (doScenery) {
      const sc = await page.evaluate((i) => window.scenery(i), id);
      writeFileSync(`${sceneryOut}/${id}.bytes`, Buffer.from(sc.file, 'base64'));
      if (sc.planes) writeFileSync(`${sceneryOut}/${id}-planes.bytes`, Buffer.from(sc.planes, 'base64'));
      sc.textures.forEach((t, k) => writeFileSync(`${sceneryOut}/${id}-${k}.png`, Buffer.from(t.slice(t.indexOf(',') + 1), 'base64')));
      writeFileSync(`${sceneryOut}/${id}.moving.txt`, sc.moving.join('\n') + '\n');
      console.log(`${id} scenery: ${sc.stats}; moving: ${sc.moving.join(', ') || 'nothing'}`);
    }
    if (!doGround) continue;
    const data = await page.evaluate((i) => window.paintGround(i), id);
    const png = Buffer.from(data.slice(data.indexOf(',') + 1), 'base64');
    writeFileSync(`${out}/${id}.png`, png);
    console.log(`${id}: ${(png.length / 1024).toFixed(0)} kB`);
    const roof = await page.evaluate((i) => window.paintRoof(i), id);
    if (roof) writeFileSync(`${out}/${id}-roof.png`, Buffer.from(roof.slice(roof.indexOf(',') + 1), 'base64'));
  }
} finally {
  await browser.close();
  await server.close();
}
