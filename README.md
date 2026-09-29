# Corner Cutters

An arcade F1 race in the HD-2D look: start lights, laps, positions, a minimap and results, against up to nine AI cars. Mobile-first portrait layout with a touch control deck.

**Circuits:**
- **Amimo Park**, inspired by Istanbul Park: anticlockwise, flat out almost everywhere, a lap of about 24 s.
- **Silver Heath**, inspired by Silverstone: clockwise and fast, traced from the real circuit's outline (from [bacinger/f1-circuits](https://github.com/bacinger/f1-circuits), MIT), with the Loop and Vale as the places to lift; a lap of about 27 s.

**Damage and the safety car:** every car, yours and the AI's, takes damage from walls, landings and contact. A damaged car smokes, then burns, and loses up to 30% of its top speed; your health shows as five blocks in the readout. A wrecked car is cleared off the track and classified DNF. A big crash (a wreck, or one hit taking 40% of a car's health) brings out the safety car: it joins ahead of the leader, the field queues behind it on a 200 px/s limiter with no overtaking (and nobody gets past the safety car itself), and after 12 s with the leader lined up behind it, it goes in. Passing a car under it costs 5 s a place, added at the flag. The rules are in `src/f1/raceControl.ts`.

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

**URL flags:** `?circuit=amimo-park` or `?circuit=silver-heath` goes straight to a race, `?tune` shows the TUNE panel (laps, AI opponents, AI pace, camera zoom and look-ahead), `?inputlog` lists the input events the page receives and the buttons held (for debugging controls on a phone), `?debug` shows the FPS / quality readout and exposes `window.__cc` for tests (`__cc.wreck(3)` wrecks the car in P3), and `?desktop` / `?mobile` force a layout.

## Publishing to itch.io

`.github/workflows/itch.yml` tests and builds every push and pull request. A push to the default branch (or **Run workflow** in the Actions tab on it) also uploads `dist/` to itch.io with [butler](https://itch.io/docs/butler/) as the `html5` channel, versioned `<package version>+<commit>`.

Setup (once):
1. On itch.io, create the project with kind **HTML**. Under the embed options, tick **Mobile friendly** (portrait) and **Fullscreen button**, and set a viewport of about 390×844.
2. In the GitHub repo, under Settings → Secrets and variables → Actions, add the secret `BUTLER_API_KEY` (itch.io → Settings → API keys) and the variable `ITCH_TARGET` = `<itch-user>/<game-slug>`.
3. Push to the default branch. After the first upload, tick **This file will be played in the browser** on the upload in the project's edit page.

Until both settings exist, the workflow skips the upload and warns which one is missing.

## Android

The same web build, wrapped by [Capacitor](https://capacitorjs.com) into an Android app (`android/`, `capacitor.config.ts`): full screen, portrait, the screen kept on, played offline; the back button goes from a race to the circuit menu, then out.

`.github/workflows/android.yml` builds an APK on every push and pull request (a download under the run's **Artifacts**). A push to the default branch also uploads it to the itch.io page as the `android` channel, so it can be downloaded there on a phone. To install, allow installs from your browser or files app when Android asks. Each build has a higher version code, so it installs as an update over the last.

**Signing:** without secrets, the APK is signed with `android/app/sideload.keystore`, a key committed to the repo so every build updates the last one (like Android's debug key, it isn't a secret, so don't rely on it for anything you publish widely). For your own key, create one once and keep it safe (an update must always be signed with the same key):

```sh
keytool -genkeypair -keystore release.keystore -alias cornercutters -keyalg RSA -keysize 2048 -validity 10000
base64 -w0 release.keystore      # the value for ANDROID_KEYSTORE_BASE64
```

then add the repo secrets `ANDROID_KEYSTORE_BASE64`, `ANDROID_KEYSTORE_PASSWORD`, `ANDROID_KEY_ALIAS` (`cornercutters`) and `ANDROID_KEY_PASSWORD`. Switching from the sideload key to yours changes the app's signature: uninstall the sideloaded build once before installing the first one signed with your key.

Locally (with the Android SDK and JDK 21): `npm run android:apk` builds `android/app/build/outputs/apk/release/app-release.apk`. `npm run android:art` redraws the launcher icons and splash screens (`tools/android-art.py`, needs Pillow).

## Layout

```
index.html        The handheld column: game screen (#screen) + control deck (#deck)
src/
  main.ts         Boots the circuit menu, or the race on ?circuit=<id>
  engine/         Controls, deck, layout, storage, TUNE panel, view types, driving physics (driving.ts),
                  ground and collision (sim.ts), vehicle edits, render/ (HD-2D pipeline, quality, effects,
                  car models, daylight, sprites, textures)
  f1/             The race, race control (raceControl.ts: wrecks, safety car, penalties), circuit menu,
                  circuit layouts (layouts.ts), circuit builder and scene, race rules and tuning; uses only engine/
public/fonts/     Pixel font, Silkscreen (SIL Open Font License)
tests/            Driving, circuit, racing, race control, controls, layout, storage, vehicle edits, code boundaries
```

Saves (layout choice, last circuit, TUNE values) live in local storage under the `cc:` prefix. The status strip under the screen shows your position and lap.
