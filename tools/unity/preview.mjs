// `node tools/unity/preview.mjs '[["name","id=crescent-park&d=60"]]'`: screenshots of tools/unity/preview.html (what unity:scenery
// wrote, drawn as the port draws it) into $OUT (default: here). Needs Playwright (a global install will do).
import { createServer } from 'vite';
import { createRequire } from 'node:module';
const { chromium } = createRequire(import.meta.url)('playwright');

const server = await createServer({ server: { port: 5198 }, logLevel: 'error' });
await server.listen();
const url = server.resolvedUrls.local[0];
const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const p = await b.newPage({ viewport: { width: 1280, height: 720 } });
p.on('pageerror', (e) => console.log('err', e.message));
for (const [name, query] of JSON.parse(process.argv[2])) {
  await p.goto(`${url}tools/unity/preview.html?${query}`);
  await p.waitForFunction(() => window.previewReady === true, null, { timeout: 120000 });
  await p.screenshot({ path: `${process.env.OUT ?? '.'}/${name}.png` });
}
await b.close(); await server.close();
