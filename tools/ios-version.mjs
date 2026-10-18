// Stamps the iOS project with the game's version: MARKETING_VERSION (the App Store's version) from package.json,
// and CURRENT_PROJECT_VERSION (the build number, which must rise with every upload to App Store Connect) from
// IOS_BUILD_NUMBER, else the UTC time as yyMMddHHmm, so a later build is always the higher one.
// Run by `npm run ios:sync`; the version is bumped with `npm run bump -- patch|minor|major`.
import { readFileSync, writeFileSync } from 'node:fs';

const file = new URL('../ios/App/App.xcodeproj/project.pbxproj', import.meta.url);
const { version } = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
const build = process.env.IOS_BUILD_NUMBER ?? new Date().toISOString().replace(/\D/g, '').slice(2, 12);
if (!/^\d+\.\d+\.\d+$/.test(version)) throw new Error(`package.json version "${version}" is not x.y.z`);
if (!/^\d+(\.\d+){0,2}$/.test(build)) throw new Error(`build number "${build}" is not dotted integers`);

const text = readFileSync(file, 'utf8')
  .replace(/MARKETING_VERSION = [^;]+;/g, `MARKETING_VERSION = ${version};`)
  .replace(/CURRENT_PROJECT_VERSION = [^;]+;/g, `CURRENT_PROJECT_VERSION = ${build};`);
writeFileSync(file, text);
console.log(`iOS: version ${version}, build ${build}`);
