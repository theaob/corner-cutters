# Corner Cutters

An arcade F1 race in the HD-2D look: start lights, laps, positions, a minimap and results, against up to nine AI cars at Amimo Park, a circuit inspired by Istanbul Park. Mobile-first portrait layout with a touch control deck.

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

**Controls:** on a phone, use the on-screen D-pad; B drifts and START restarts. On a keyboard: WASD or the arrow keys steer, X or Shift is B, Z or Space is A, Enter is START, Backspace is SELECT, and V switches between the handheld and wide layouts.

**URL flags:** `?tune` shows the TUNE panel (laps, AI opponents, AI pace, camera zoom and look-ahead), `?debug` shows the FPS / quality readout and exposes `window.__cc` for tests, and `?desktop` / `?mobile` force a layout.

## Layout

```
index.html        The handheld column: game screen (#screen) + control deck (#deck)
src/
  main.ts         Boots the race
  engine/         Controls, deck, layout, storage, TUNE panel, view types, driving physics (driving.ts),
                  ground and collision (sim.ts), vehicle edits, render/ (HD-2D pipeline, quality, effects,
                  car models, daylight, sprites, textures)
  f1/             The race, circuit, circuit scene, race rules and tuning; uses only engine/
public/fonts/     Pixel fonts (SIL Open Font License)
tests/            Driving, circuit, racing, controls, layout, storage, vehicle edits, code boundaries
```

Saves (layout choice, TUNE values) live in local storage under the `cc:` prefix. The status strip under the screen shows your position and lap.
