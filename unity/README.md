# Corner Cutters in Unity (experiment)

A port of the web game to Unity, for desktop now and Nintendo Switch later. It lives in this folder only: the web game
(`src/`), its tests and its Android/iOS/itch.io releases are untouched. The plan and phases are in [PORT_PLAN.md](PORT_PLAN.md).

## What works (phase 1)

One F1 car on any of the 19 circuits, three laps against the clock: start lights, lap and best-lap times, wrong-way
warning, damage, restart, pause, next/previous circuit, three cameras (C: the web game's classic view, chase, top-down).
Keyboard and gamepad. No AI, pits, tyres, weather, menus, audio, saves or shop yet.

**Look.** The camera is the web game's (north up, 26 degree lens, 52 degree pitch). Each circuit's ground is the web
game's own picture (asphalt, white edge lines, kerbs, mown grass, gravel, pit lane, grid boxes, chequered line: baked from its
painter, one texel per map pixel, nearest-neighbour). Everything standing on it is the web game's own scene, built by its
own code and baked (`BakedScenery`): towns and cities, custom buildings and landmarks, trees, grandstands, pits, barriers,
bridges, lakes, the coast and the volcano, each face lit as the web game lights it. What moves in that scene (monster
trucks, kangaroos, moose and geese, boats, the tramway, petals...) is recorded from the web game's own animation as a
40 s loop and played back (`SceneryMovers`); the airliners over Crescent Park are flown as the web game flies them, over
wherever you are (`ScenePlanes`). The crowds and flags are `StandView`'s and cheer as the car passes. HUD: the web game's
wide-screen layout in its pixel font (`HudView`). Finish: its glow, tilt-shift, grade and tone mapping (`TiltShift` shader).

Known gaps: the scene is lit for day on every circuit (night circuits like Vegas show their neon but not the dark), and
recorded animals react to a recorded car going round, not to yours (the gopher and the yeti). Still placeholder: other
cars, weather, sky, sound.

## Layout

- `Assets/Scripts/Core/`: the game's rules in plain C# (no `UnityEngine`; asmdef `noEngineReferences`): driving, ground and
  walls, lap and sector timing, the wheel, the gamepad reader, the fixed-step clock. Ported from the web game's TypeScript.
- `Assets/Scripts/Game/`: the Unity side: input, track and car meshes, camera, race flow, HUD.
- `Assets/Scripts/Editor/`: scene setup and command-line builds.
- `Assets/Resources/Circuits/*.json`: the circuits, **generated** from the web game (`npm run unity:bake`). Don't edit by hand.
- `Assets/Resources/Grounds/*.png`: each circuit's ground picture, **generated** from the web game's painter
  (`npm run unity:grounds [id ...]`; needs Playwright, e.g. `npm i -g playwright && npx playwright install chromium`).
  `Editor/GroundImport.cs` imports them full size, point-filtered, uncompressed. About 28 MB for all 19.
- `Assets/Resources/Scenery/`: each circuit's scene (`<id>.bytes`, its textures `<id>-<n>.png`, what moves in
  `<id>.moving.txt`, and `<id>-planes.bytes` where there's an airport), **generated** from the web game's createCircuitScene
  by the same command (`npm run unity:grounds -- --scenery-only [id ...]`). The file format is at the top of
  `tools/unity/scenery.ts`. About 45 MB for all 19. `node tools/unity/preview.mjs` renders one without Unity, as a check.
- `Tests~/Core.Tests/`: the core's tests; `golden.json` is **generated** from the web game (`npm run unity:golden`).

## Keeping the port honest

The port is checked against the web game, not against itself. `npm run unity:golden` runs the web game's real driving
rules (two laps of a recorded autopilot, plus a rough-driving run into walls and grass) and records every input and the
resulting car state. Then:

    cd unity/Tests~/Core.Tests && dotnet run

replays those inputs through the C# and compares positions, speeds, health, lap counts and lap times. Today: 7,666 checks,
worst difference about 3e-12 px over two laps. If the web game's tuning changes, re-run `npm run unity:bake && npm run unity:golden`
and the test says whether the C# still agrees. (Needs the .NET SDK, not Unity.)

## Not verified yet

The Unity layer (`Game/`, `Editor/`) was written without a Unity editor to hand: it type-checks against stand-ins for the
Unity API but has **not been opened in Unity**. Expect a first-open fix or two. The core is fully tested.
