# Corner Cutters in Unity (experiment)

A port of the web game to Unity, for desktop now and Nintendo Switch later. It lives in this folder only: the web game
(`src/`), its tests and its Android/iOS/itch.io releases are untouched. The plan and phases are in [PORT_PLAN.md](PORT_PLAN.md).

## What works

A weekend on any of the 19 circuits: qualifying first, one flying lap on your own from the run-up (track limits delete
the lap, and the next one is timed afresh; the AI's times come from a reference lap and each driver's pace, as the web
game's do), its times as a table, then a five-lap race from the grid they set against ten AI rivals in their team liveries, run by the web
game's own race rules (`Core/RaceControl.cs`): start lights and each driver's reaction off them; the AI's racing (passing,
defending, giving room, mistakes into bends, misjudged dives); contact; tyre wear and each car's strategy (SOFTs or HARDs,
one stop or two, as the web game's crews plan them); pit stops for tyres and repairs (drive into the pit entry and the car
takes itself down the lane); the slipstream; blue flags; track limits and penalties; the safety car and the virtual one;
wrecks cleared and retired; after the flag a cool-down lap and home to the garages, and the results (your race in five
boxes, the table with places made, gaps, best laps, the fastest lap in purple, stops and penalties), live as the others
finish. Weather: F (or Select, or the pause screen) picks dry, damp, wet or changeable for a new weekend; the race runs to
its forecast (showers, a drying track, rain setting in), qualifying in the weather it starts in; the rain falls over the
picture, the track darkens as it wets, the light greys, and the cars throw up spray. Restart replays the session (the race
from the same grid); SKIP QUALIFYING on the pause screen starts you mid-grid; a new circuit draws a new weekend. HUD: your place, the timing tower with gaps, your tyres, the race's calls. Lap and
best-lap times, wrong-way warning, damage, pause, next/previous circuit, three cameras (C: the web game's classic view,
chase, top-down). Keyboard and gamepad. Before the lights the camera walks down the grid, naming each car (GRID WALK on the pause
screen turns it off). A big crash throws the car's nose, and on a wreck a wheel or two, clear to tumble and bounce and
lie a while; a damaged car smokes, a burning one flames and blackens, a wreck smoulders charred; hits throw sparks; and
a moment later the crash plays again, slowed through the impact. A few seconds after your flag your finish plays again,
then the top three spray champagne in parc fermé (trophies, confetti, fireworks, the camera's sweep from third to the
winner), then the results. Enter or A skips the walk, a replay or the ceremony. Not yet: skid marks, menus, audio,
saves, shop.

**Look.** The camera is the web game's (north up, 26 degree lens, 52 degree pitch). Each circuit's ground is the web
game's own picture (asphalt, white edge lines, kerbs, mown grass, gravel, pit lane, grid boxes, chequered line: baked from its
painter, one texel per map pixel, nearest-neighbour). Everything standing on it is the web game's own scene, built by its
own code and baked (`BakedScenery`): towns and cities, custom buildings and landmarks, trees, grandstands, pits, barriers,
bridges, lakes, the coast and the volcano, each face lit as the web game lights it. What moves in that scene (monster
trucks, kangaroos, moose and geese, boats, the tramway, petals...) is recorded from the web game's own animation as a
40 s loop and played back (`SceneryMovers`); the airliners over Crescent Park are flown as the web game flies them, over
wherever you are (`ScenePlanes`), and the gopher at Maple Island and the yeti at Glacier Pass react to your car as they
do in the web game (`Core/Critters.cs`, drawn by `CritterView`): the gopher freezes, bolts, or gets flung and sits dazed;
the yeti waits up the road, roars and gives chase. The crowds and flags are `StandView`'s and cheer as the car passes. HUD: the web game's
wide-screen layout in its pixel font (`HudView`). Finish: its glow, tilt-shift, grade and tone mapping (`TiltShift` shader).

Known gaps: the scene is lit for day on every circuit (night circuits like Vegas show their neon but not the dark).
Still placeholder: sound. The weather's light is one change of light over the whole scene, so lamps and
glowing signs grey a little with it (the web game's stay bright).

## Layout

- `Assets/Scripts/Core/`: the game's rules in plain C# (no `UnityEngine`; asmdef `noEngineReferences`): driving, ground and
  walls, lap and sector timing, the wheel, the gamepad reader, the fixed-step clock; the AI (`Ai.cs`), race control
  (`RaceControl.cs`), tyres, strategy, pits, the smaller rules (`RaceRules.cs`: slipstream, blue flags, track limits,
  weather, bridges), the field (`Field.cs`: teams, drivers, difficulties, a weekend drawn from its seed), timing gaps,
  qualifying (`Qualifying.cs`), the results' rows (`Results.cs`), the weather's look (`WeatherLook.cs`), the replays'
  recording and the grid walk (`Replay.cs`) and debris (`Debris.cs`).
  Ported from the web game's TypeScript. `JsMath.cs` holds JavaScript's arithmetic where C#'s differs (V8's sin, cos,
  atan, atan2 and exp, which are fdlibm's; Math.hypot; Math.round; a stable sort; the seeded random numbers), so the
  port makes the same decisions from the same numbers, on every platform.
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
- `Tests~/Core.Tests/`: the core's tests; `golden.json`, `critters.json`, `races.json`, `qualifying.json`, `fx.json` and `math.json` are **generated**
  from the web game (`npm run unity:golden`).

## Keeping the port honest

The port is checked against the web game, not against itself. `npm run unity:golden` runs the web game's real driving
rules (two laps of a recorded autopilot, plus a rough-driving run into walls and grass) and records every input and the
resulting car state. Then:

    cd unity/Tests~/Core.Tests && dotnet run

replays those inputs through the C# and compares positions, speeds, health, lap counts and lap times, and runs the gopher
and the yeti beside a scripted car against the web game's (`critters.json`). It also runs whole races (`races.json`):
eight weekends on different circuits (pit stops, rain, dirt, a bridge, HARD, the virtual safety car), each field drawn
from its seed, lights to flag, every car's state every second and every race event compared, and they match **bit for
bit**, as do their results tables. Qualifying (`qualifying.json`) is checked the same way: the reference lap in dry, damp
and wet, the AI's times off it, the grid and its table, where the session starts; the weather's look at nine
wetness and rain mixes; and (`fx.json`) debris flown over hills, the grid walk's path and the replay's recording read
back between frames, all bit for bit. (`GOLDEN_ONLY=fx npm run unity:golden` remakes that one alone, in a second.) JsMath's trig and exp are checked against V8's on 29,000 values, also bit for bit. Today: about 340,000 checks.
(The player's wheel still uses .NET's `Math.Pow`, a last bit off now and then: the recorded lap drifts about 2e-12 px.) If the web game's tuning changes, re-run `npm run unity:bake && npm run unity:golden`
and the test says whether the C# still agrees. (Needs the .NET SDK, not Unity.)

## Not verified yet

The Unity layer (`Game/`, `Editor/`) was written without a Unity editor to hand: it type-checks against stand-ins for the
Unity API but has **not been opened in Unity**. Expect a first-open fix or two. The core is fully tested.
