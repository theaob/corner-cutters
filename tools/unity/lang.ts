// The web game's languages for the Unity port (src/f1/lang): each dictionary, English text to its translation, as
// Resources/Lang/<code>.json, and the list of them (code and own name, English first) as Resources/Lang/index.json.
// The lines only the port has (langExtra.ts) go in with them, the web game's own winning. Run `npm run unity:lang`
// after a dictionary changes (the Unity tests check every language has every line).
import { mkdirSync, writeFileSync } from 'node:fs';
import { LANGUAGES } from '../../src/f1/lang';
import { LANGUAGE_SOURCES } from '../../src/f1/lang/sources';
import { EXTRA } from './langExtra';

const dir = 'unity/Assets/Resources/Lang';
mkdirSync(dir, { recursive: true });
const byCode = new Map(LANGUAGES.map((l) => [l.code, l]));
const index = [{ code: 'en', name: 'English' }];
for (const s of LANGUAGE_SOURCES) {
  const l = byCode.get(s.code);
  if (!l) throw new Error(`no dictionary for ${s.code}`);
  index.push({ code: s.code, name: s.name });
  const extra = Object.fromEntries(Object.entries(EXTRA).map(([en, line]) => [en, line[s.code as keyof typeof line]]));
  writeFileSync(`${dir}/${s.code}.json`, JSON.stringify({ code: l.code, name: s.name, words: { ...extra, ...l.words } }, null, 1) + '\n');
}
writeFileSync(`${dir}/index.json`, JSON.stringify(index, null, 1) + '\n');
console.log(`languages: ${index.map((l) => l.code).join(' ')}, ${Object.keys(LANGUAGES[0].words).length} lines each and ${Object.keys(EXTRA).length} of the port's own`);
