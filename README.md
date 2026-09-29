# Corner Cutters

An arcade F1 race in the HD-2D look: start lights, laps, positions, a minimap and results, against up to nine AI cars. Mobile-first portrait layout with a touch control deck.

**Circuits:**
- **Amimo Park**, inspired by Istanbul Park: anticlockwise, flat out almost everywhere, a lap of about 24 s.
- **Silver Heath**, inspired by Silverstone: clockwise and fast, traced from the real circuit's outline (from [bacinger/f1-circuits](https://github.com/bacinger/f1-circuits), MIT), with the Loop and Vale as the places to lift; a lap of about 27 s.

Copied from the `?demo=f1` race in [rpg-platformer](https://github.com/theaob/rpg-platformer) (Grand Theft Monster): its shared `engine/` and the `f1/` game.

## Run it

```sh
npm install
npm run dev        # http://localhost:5173
```

| Command | What it does |
|---|---|
| `npm run dev` | Vite dev server with hot reload |
| `npm run build` | Typecheck + production build to `dist/` |
| `npm test` | Unit tests (Vitest) |
| `npm run typecheck` | TypeScript only |

**Controls:** pick a circuit with the D-pad and A (or tap it). In a race, B drifts, START restarts and SELECT goes back to the circuits. On a keyboard: WASD or the arrow keys steer, X or Shift is B, Z or Space is A, Enter is START, Backspace is SELECT, and V switches between the handheld and wide layouts.

**URL flags:** `?circuit=amimo-park` or `?circuit=silver-heath` goes straight to a race, `?tune` shows the TUNE panel (laps, AI opponents, AI pace, camera zoom and look-ahead), `?debug` shows the FPS / quality readout and exposes `window.__cc` for tests, and `?desktop` / `?mobile` force a layout.

## Publishing to itch.io

`.github/workflows/itch.yml` tests and builds every push and pull request. A push to the default branch (or **Run workflow** in the Actions tab on it) also uploads `dist/` to itch.io with [butler](https://itch.io/docs/butler/) as the `html5` channel, versioned `<package version>+<commit>`.

Setup (once):
1. On itch.io, create the project with kind **HTML**. Under the embed options, tick **Mobile friendly** (portrait) and **Fullscreen button**, and set a viewport of about 390×844.
2. In the GitHub repo, under Settings → Secrets and variables → Actions, add the secret `BUTLER_API_KEY` (itch.io → Settings → API keys) and the variable `ITCH_TARGET` = `<itch-user>/<game-slug>`.
3. Push to the default branch. After the first upload, tick **This file will be played in the browser** on the upload in the project's edit page.

Until both settings exist, the workflow skips the upload and warns which one is missing.

## Layout

```
index.html        The handheld column: game screen (#screen) + control deck (#deck)
src/
  main.ts         Boots the circuit menu, or the race on ?circuit=<id>
  engine/         Controls, deck, layout, storage, TUNE panel, view types, driving physics (driving.ts),
                  ground and collision (sim.ts), vehicle edits, render/ (HD-2D pipeline, quality, effects,
                  car models, daylight, sprites, textures)
  f1/             The race, circuit menu, circuit layouts (layouts.ts), circuit builder and scene, race rules
                  and tuning; uses only engine/
public/fonts/     Pixel font, Silkscreen (SIL Open Font License)
tests/            Driving, circuit, racing, controls, layout, storage, vehicle edits, code boundaries
```

Saves (layout choice, last circuit, TUNE values) live in local storage under the `cc:` prefix. The status strip under the screen shows your position and lap.
