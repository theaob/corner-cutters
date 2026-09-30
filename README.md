# Corner Cutters

An arcade F1 race in the HD-2D look: start lights, laps, positions, a minimap and results, against up to nine AI cars. Mobile-first portrait layout with a touch control deck.

**Circuits:**
- **Crescent Park**: anticlockwise, flat out almost everywhere, a lap of about 24 s.
- **Silver Heath**: clockwise and fast, with a hairpin and a tight complex as the places to lift; a lap of about 27 s. Its outline is traced from circuit outline data by [bacinger/f1-circuits](https://github.com/bacinger/f1-circuits) (MIT).

**Teams:** eleven, each in its own colours: Milk Energy, Prancing Monkey, Golden Arrows, Calrissian Racing, British Lime, Reneé, Frankie's Groove, Cheaper Milk, DMW – DEUTCHE MOTOR WERKE, MaaS and Grandma's Fave (`src/f1/teams.ts`), each with its own logo (`src/f1/logos.ts`), shown on the menu's TEAM row and under the start lights. So teams tell apart from afar, every car carries its team's pattern along the top (a stripe, twin stripes, bands, chevrons, halves, a split or a coloured nose; teams sharing a pattern have far-apart colours), and teammates by the T-camera on the air intake: dark on the team's first car, bright green on its second. Pick yours on the menu's TEAM row; a race runs five teams of two: yours (you and an AI teammate) and four drawn at random. The results show each car's team.

**Damage and the safety car:** every car, yours and the AI's, takes damage from walls, landings and contact. A damaged car smokes, then burns, and loses up to 30% of its top speed; your health shows as five blocks in the readout. A wrecked car is cleared off the track and classified DNF. A big crash (a wreck, or one hit taking 40% of a car's health) brings out the safety car: it joins ahead of the leader, the field queues behind it on a 200 px/s limiter with no overtaking (and nobody gets past the safety car itself), and after 12 s with the leader lined up behind it, it goes in. Passing a car under it costs 5 s a place, added at the flag. The rules are in `src/f1/raceControl.ts`.

**Difficulty:** EASY, NORMAL or HARD, on the menu's DIFFICULTY row and remembered (`src/f1/difficulty.ts`). It sets how much a crash costs every car (the damage from walls, landings and contact, and how much a damaged car slows) and how quick and closely matched the AI field is: EASY halves crash damage against a slower, spread-out field; HARD takes 1.75× the damage against a field at the racing line's full pace, closely matched.

**Tyres:** every car's tyres wear as it drives: with speed, faster while sliding (a drift eats them) and on grass or gravel (`src/f1/tyres.ts`). Worn tyres grip and turn less and lose top speed, a little at first, then sharply past about 70% wear; gone, they cost about a fifth of a lap. A set lasts about two laps at its best, so races are 5 laps by default: in 3 laps no stop pays, in 5 one does, in 8 two. The readout shows your tyres: the compound, blocks and the share left (WORN past the cliff), in the compound's colour.

**Weather:** DRY, DAMP or WET, on the menu's WEATHER row and remembered (`src/f1/weather.ts`). Three tyre compounds, each marked by a coloured band round every car's tyres, as in F1: **yellow slicks** for the dry, **green intermediates** for a damp track, **blue full wets** for rain. The wrong tyre grips less and is slower (wets on a dry track also wear out fast), and a wet track is slower than a dry one even on the right tyres: in AI races, damp is about 5% slower and wet about 11%. The crews fit the right compound for the weather at the start and at every stop. Damp and wet races are overcast with a darker track and spray behind the cars; wet has falling rain. Lap records are kept apart for each weather.

**Pit stops:** each circuit has a pit lane beside its main straight, behind a pit wall, with a box for each team and garages behind. Leave the track on the pit side at the entry and you're committed: the car drives itself down the lane on a 120 px/s limiter, stops in your team's box while the crew fits new tyres and repairs its damage (1.2 s, plus up to 3 s for a wreck's worth of repairs), and hands it back at the exit. A stop costs about 7 s in all. The pit wall calls **BOX, BOX** on the way to the entry when a stop now pays (worn tyres, damage, or both, against the laps left), and the AI stops on the same sums. Passing a car in the pits under the safety car is no penalty. The rules are in `src/f1/pits.ts`.

Where it's going: the design and development plan is in [`docs/PLAN.md`](docs/PLAN.md).

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

**Controls:** the analogue thumbstick points where you want to go, and how far you push it is the throttle (full from about 85% of the way out). B drifts.

The menu is all touch (the deck is hidden there): tap a circuit to race it, swipe the TEAM row (or tap its sides) to change it; on a keyboard, up/down, left/right and Enter. In a race, A pauses (so does switching to another app or tab), START restarts and SELECT (once let go) goes back to the circuits. The pause screen has RESUME, RESTART and CIRCUITS to tap, and A resumes. On a keyboard: WASD or the arrow keys steer, X or Shift is B, Z or Space is A, Enter is START, Backspace is SELECT, Esc or P pauses, and V switches between the handheld and wide layouts.

**Records:** your best lap on each circuit, and your best race time there for each number of laps (penalties included), are kept on the device between races (`src/f1/records.ts`). Each lap is saved as soon as it's done. The menu shows each circuit's lap record, the race readout has it as REC, a lap that beats it is announced (NEW LAP RECORD), and the results show both records, marked NEW! when this race set them.

**Frame rate:** the readout at the top left shows the frames per second and the picture quality (HIGH, MEDIUM, LOW). When a phone can't keep up, the quality steps down; if even the lowest level is no quicker, the browser is holding the page to 30 fps (Low Power Mode, or Safari throttling a game embedded in another site's page, as on itch.io), so it goes back to where it started. Embedded like that, the menu offers **PLAY IN ITS OWN TAB**, which isn't throttled; saves carry over.

**TUNE:** the button at the top right of a race opens sliders for laps, AI opponents, an AI pace adjustment (× the difficulty's), camera zoom and look-ahead; changes apply at once and are kept on the device (Reset puts the defaults back).

**URL flags:** `?circuit=crescent-park` or `?circuit=silver-heath` goes straight to a race, `?inputlog` lists the input events the page receives and the buttons held (for debugging controls on a phone), `?debug` shows the FPS / quality readout and exposes `window.__cc` for tests (`__cc.wreck(3)` wrecks the car in P3, `__cc.toPits()` damages your car and puts it in the pit entry), and `?desktop` / `?mobile` force a layout.

## Publishing to itch.io

`.github/workflows/itch.yml` tests and builds every push and pull request. A push to the default branch (or **Run workflow** in the Actions tab on it) also uploads `dist/` to itch.io with [butler](https://itch.io/docs/butler/) as the `html5` channel, versioned `<package version>+<commit>`.

Setup (once):
1. On itch.io, create the project with kind **HTML**. Under the embed options, tick **Mobile friendly** (portrait) and **Fullscreen button**, and set a viewport of about 390×844.
2. In the GitHub repo, under Settings → Secrets and variables → Actions, add the secret `BUTLER_API_KEY` (itch.io → Settings → API keys) and the variable `ITCH_TARGET` = `<itch-user>/<game-slug>`.
3. Push to the default branch. After the first upload, tick **This file will be played in the browser** on the upload in the project's edit page.

Until both settings exist, the workflow skips the upload and warns which one is missing.

## Android

The same web build, wrapped by [Capacitor](https://capacitorjs.com) into an Android app (`android/`, `capacitor.config.ts`): full screen, portrait, the screen kept on, played offline; the back button goes from a race to the circuit menu, then out.

`.github/workflows/android.yml` builds an APK (a download under the run's **Artifacts**) and uploads it to the itch.io page as the `android` channel, so it can be downloaded there on a phone. It runs on every push and pull request (and by hand: Actions → android → Run workflow); only a push to the default branch uploads to itch.io. To install, allow installs from your browser or files app when Android asks. Each build has a higher version code, so it installs as an update over the last.

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
  f1/             The race, race control (raceControl.ts: wrecks, safety car, penalties), pit lane and stops (pits.ts), circuit menu,
                  circuit layouts (layouts.ts), circuit builder and scene, race rules and tuning; uses only engine/
public/fonts/     Pixel font, Silkscreen (SIL Open Font License)
tests/            Driving, circuit, racing, race control, pit stops, controls, layout, storage, vehicle edits, code boundaries
```

Saves (layout choice, last circuit, team, TUNE values, and your records) live in local storage under the `cc:` prefix. The status strip under the screen shows your position and lap.
