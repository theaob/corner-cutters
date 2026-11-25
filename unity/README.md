# Corner Cutters in Unity (experiment)

A port of the web game to Unity, for desktop now and Nintendo Switch later. It lives in this folder only: the web game
(`src/`), its tests and its Android/iOS/itch.io releases are untouched. The plan and phases are in [PORT_PLAN.md](PORT_PLAN.md).

## What works (phase 1)

One F1 car on any of the 19 circuits, three laps against the clock: start lights, lap and best-lap times, wrong-way
warning, damage, restart, pause, next/previous circuit, chase and top-down cameras. Keyboard and gamepad. Placeholder
art (flat colours, slope-shaded ground, box car) and an IMGUI HUD. No AI, pits, tyres, weather, menus, audio, saves or shop yet.

## Open it

1. Unity **6000.3.29f1** (Unity 6.3 LTS), pinned in `ProjectSettings/ProjectVersion.txt`.
2. Open the `unity/` folder in Unity Hub. First import takes a minute and writes `.meta` files: **commit them**.
3. If asked, enable the new Input System backend (restarts the editor). Or: Project Settings > Player > Active Input Handling = *Input System Package (New)*.
4. Menu **Corner Cutters > Create main scene**, open `Assets/Scenes/Main.unity`, press Play. (The game starts itself from
   code, `GameBootstrap`, so the scene can stay empty.)

Desktop builds: `Unity -batchmode -quit -projectPath unity -executeMethod CornerCutters.Editor.BuildScript.BuildWindows64`
(or `BuildMacOS`, `BuildLinux64`), output in `unity/Builds/`.

## Controls

| | Keyboard | Gamepad (Xbox, PlayStation, Switch Pro, any standard pad) |
|---|---|---|
| Steer | A / D or Left / Right | Left stick |
| Gas | W or Up | Right trigger |
| Brake / reverse | S or Down | Left trigger |
| Drift (handbrake) | Space or Shift | A (south) or X (west) |
| Pause | Esc or P | Start |
| Restart | R | Y (north) |
| Next / previous circuit | Tab or ] / [ | RB / LB |
| Camera | C | B (east) |

What changed from the web game's controls (`src/engine/controls.ts`, a handheld with a D-pad and A/B/START/SELECT):

- **Actions, not a virtual handheld.** Input is defined as named Input System actions (`GameInput.cs`), each with keyboard
  and gamepad bindings, so a rebinding screen later is `PerformInteractiveRebinding` on those actions.
- **Keyboard steering is eased** (`SteeringSmoother`): the web game's keys snap to full lock, which is twitchy on a keyboard
  and for a car this fast. A tap is now a nudge, a hold is full lock, release re-centres, frame-rate independent. The three
  rates are the tuning knobs.
- **Gamepad reading is the web game's own** (`GamepadReader`, same dead zone and curve), so the car feels the same, on the
  standard layout that Xbox, PlayStation and Switch pads all map to.
- **Last device used wins**, and the on-screen hint line follows it.

## Layout

- `Assets/Scripts/Core/`: the game's rules in plain C# (no `UnityEngine`; asmdef `noEngineReferences`): driving, ground and
  walls, lap and sector timing, the wheel, the gamepad reader, the fixed-step clock. Ported from the web game's TypeScript.
- `Assets/Scripts/Game/`: the Unity side: input, track and car meshes, camera, race flow, HUD.
- `Assets/Scripts/Editor/`: scene setup and command-line builds.
- `Assets/Resources/Circuits/*.json`: the circuits, **generated** from the web game (`npm run unity:bake`). Don't edit by hand.
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
