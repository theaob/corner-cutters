# Corner Cutters: design and development plan

A plan for taking Corner Cutters from a playable prototype (one race, two circuits) to a
small, finished arcade racer on Google Play and itch.io. It starts from what the code does
today, sets out what the game should feel like, and orders the work into milestones that
each end in a build worth putting on itch.io.

## 1. Where the game is today

What's built and working (`src/`, about 4,300 lines, 12 test files):

| Area | State |
|---|---|
| Driving | Arcade physics with torque/power, sliding, drift, kerbs, grass and gravel, elevation and jumps (`engine/driving.ts`, `engine/sim.ts`) |
| Race | Start lights, laps and sectors, positions, lap times, results, cool-down lap (`f1/racing.ts`, `f1/race.ts`) |
| Race control | Damage for every car, smoke → fire → wreck, DNF, safety car with limiter, no-overtaking rule and 5 s penalties (`f1/raceControl.ts`) |
| AI | Follows a precomputed racing line at a per-driver pace and lane, moves over for slower cars, holds station under the safety car (`aiInput`) |
| Circuits | Crescent Park (~24 s lap) and Silver Heath (~27 s), built from a centreline + elevation profile (`f1/layouts.ts`, `f1/circuit.ts`) |
| Teams | Eleven look-alike teams with liveries, patterns and logos; five teams of two per race (`f1/teams.ts`, `f1/logos.ts`) |
| Controls | Two schemes (analogue stick, pedals), touch deck, keyboard (`engine/controls.ts`, `engine/deck.ts`) |
| Look | HD-2D pipeline (tilt-shift blur, bloom), three quality levels with an automatic governor (`engine/render/`) |
| Menus | Touch circuit menu with TEAM and CONTROLS rows; TUNE panel for laps, grid, AI pace, camera (`f1/circuitSelect.ts`, `engine/tuning.ts`) |
| Shipping | CI tests + builds every push and publishes to itch.io; Android APK via Capacitor (paused) |

What's missing for it to feel like a game rather than a tech demo:

- **No reason to play a second race.** Nothing is saved but settings: no lap records, no
  wins, no unlocks, no championship.
- **No sound at all.** For a racing game this is the single biggest gap in feel.
- **No pause.** A phone game has to survive a notification, a call or a tab switch.
- **Difficulty is a debug slider.** AI pace lives in TUNE; a new player isn't told what to pick.
- **No onboarding.** The two control schemes are explained only in the README.
- **Two circuits**, both fast and flowing; there's no slow, technical or street-style track.
- **The AI never makes mistakes or defends**; races are decided at the start or by damage.

## 2. Design

### Pitch

*Pocket-sized F1 in the HD-2D style: 1–3 minute races you can play one-handed on a phone,
where cutting a corner is a risk you choose to take. Once you've mastered the sprints,
longer Grand Prix races add tyres and pit stops.*

### Pillars

Every feature below is judged against these. If it doesn't serve one of them, it waits.

1. **A race in your pocket.** A full session (menu → race → results) fits in two or three
   minutes. Everything works in portrait with thumbs, offline, and survives interruption.
2. **Readable at a glance.** Tiny screen, fast cars: you can always tell who's who, where
   you are, and what just happened (team patterns and T-cameras already do this for cars).
3. **Risk you choose.** The name is the design: kerbs, run-off, contact and damage make
   aggression pay off *sometimes*. The safety car and penalties are the price.
4. **One more race.** Short loops that reward coming back: a record to beat, a
   championship round to finish, a team to unlock.

### Core loop

```
pick circuit + team ─▶ race (1–3 laps) ─▶ results: position, best lap, record? ─▶ reward / next round
        ▲                                                                              │
        └──────────────────────────────────────────────────────────────────────────────┘
```

### Game modes (target)

| Mode | What it is | Why |
|---|---|---|
| **Quick Race** | Today's race: any circuit, any team, grid size and laps from settings | The fastest route into the game |
| **Time Trial** | Alone on track, against your best-lap ghost; sector splits | Pure driving mastery; cheap to build on the existing sim; teaches the circuits |
| **Championship** | A season of rounds across the circuits, points per finish, standings between races, team standings | The long-term "one more race" loop |
| **Grand Prix** *(later, M6)* | Longer races (8–15 laps, about 4–7 minutes) with tyre wear and a pit stop; also a Championship length option | The step up once the sprints are mastered; brings strategy in |
| **Daily Challenge** *(later)* | One seeded circuit + conditions per day, one best result kept | Gives a reason to open the game daily; seeds make it fair without a server |

### Difficulty

Replace the raw AI-pace slider (it stays in TUNE for development) with three named levels
chosen on the menu:

| Level | AI pace | AI mistakes | Damage to you | Notes |
|---|---|---|---|---|
| Rookie | ~0.86 | frequent small ones | halved | Assisted braking into the tightest bends (optional) |
| Pro | ~0.94 (today's default) | occasional | normal | |
| Legend | ~1.00 | rare | normal | AI defends its line |

The exact numbers come from playtesting with the existing headless race tests (a whole race
already runs in a test), e.g. "a clean player lap on Rookie wins by ≥ 3 s on every circuit".

### AI improvements

- **Mistakes:** occasional small errors scaled by difficulty (a late brake, running wide
  onto the kerb, a lock-up), so positions change during a race and not only at the start.
- **Defending:** a car being closed on picks the inside into the next braking zone.
- **Personalities:** each named AI driver (VOLT, RAZZ…) gets a fixed pace/aggression/
  consistency so players learn their rivals across a championship.
- **Rubber-banding:** only mild, and only on Rookie; it should never feel like the field is
  being dragged along.

### Circuits

Two now; target **six** for a first full season, each with its own character so no two feel
the same:

| Circuit | Character | Idea |
|---|---|---|
| Crescent Park | flowing, flat out | done |
| Silver Heath | fast, two hard stops | done |
| Harbour street circuit | tight, walls close, slow corners | punishes cutting; damage matters most here |
| Mountain / hill track | big elevation, blind crests, jumps | shows off the height model and airborne physics |
| Night desert track | long straights, slipstream battles | needs a slipstream effect (see below) |
| Rain / forest track | low grip sections | introduces weather (later) |

Each layout stays a centreline + elevation profile in `f1/layouts.ts`; any traced outline must
come from permissively licensed data and use an invented name (no real circuit or team names,
as now).

### Racecraft features (in priority order)

1. **Slipstream:** a car close behind another gains top speed on straights. Makes overtakes
   happen on straights, not only through contact.
2. **Corner-cutting rule:** all four wheels off track beyond a limit at a marked corner →
   warning, then a time penalty (reuses the penalty system from the safety car). This is
   where the game's name becomes a mechanic.
3. **Qualifying (short):** one flying lap sets your grid slot; skippable. Today the player is
   always mid-grid.
4. **Tyres and pit stops:** only in Grand Prix races (M6). Sprints stay 1–3 laps with no
   tyre model. Two compounds (soft: fast, wears quickly; hard: slower, lasts), with grip
   falling off as they wear, shown as a bar next to the health blocks. One pit stop: enter
   the pit lane, the car drives itself through at a speed limit, the stop takes a fixed
   time, and you pick the next compound. The AI chooses when to stop from its tyre wear and
   the gap behind, and some AI cars gamble on a different strategy.

   To get ready for this, circuits built in M4 get a pit lane along the main straight in
   their layout data, even though sprints don't use it yet.
5. **Weather:** wet sections with lower grip and spray. Later milestone; touches the look and
   the handling.

### Feel and presentation

- **Sound effects:** engine note that follows speed and throttle (synthesised with Web Audio,
  so no big assets), tyre squeal while sliding, impacts, start-light beeps, a crowd swell at
  the flag, UI clicks.
- **Music, made for the game:** an original soundtrack, which also gives the game its identity
  on the store pages. Planned tracks:
  - a menu theme (loops seamlessly)
  - race music: one track per circuit, or a shared race loop at first; it ducks under the
    engine and lifts on the final lap
  - short cues (stings): lights out, fastest lap, podium, winning the championship
  - later: a results/standings loop and a Grand Prix "final laps" track

  Delivery format: 44.1 kHz stereo, loops cut sample-accurately with the loop points
  written down, exported as Ogg Vorbis (with an AAC/M4A fallback for iOS Safari), aiming
  for under about 1 MB per minute. Separate music and effects volume sliders, both
  remembered.
- **Haptics:** a short vibration on impacts and kerbs on Android (Capacitor Haptics) and
  where `navigator.vibrate` exists.
- **HUD:** a lap/position readout that grows at key moments (new lap, overtake, fastest lap),
  a gap to the car ahead/behind, sector colours (purple/green/yellow) in Time Trial.
- **Camera:** a short "start of race" pan over the grid; a replay of the last 10 s after the
  flag (the sim is deterministic enough to record inputs and re-run them).
- **Results:** points and championship change shown after the table.

### Progression and saves

- Saved per circuit: best lap, best race time, wins, podiums (local storage, `cc:` prefix,
  through `engine/storage.ts`).
- Championship save: current round, points per driver and team, so a season can be finished
  over several sessions.
- **Unlocks, light touch:** new circuits unlock by finishing a championship round there; all
  teams stay available from the start (they're cosmetic; locking them adds nothing).
- A save-format version number from the first change, so later versions can migrate old saves.

### Onboarding

- First launch: a 20-second "learn the controls" lap on Crescent Park with prompts for
  steering, drifting (B) and, in pedals mode, braking; skippable, never shown again.
- A one-line description of each control scheme on the CONTROLS row.

### Out of scope (for now)

Online multiplayer, accounts, paid content or ads, real team/driver/circuit names or logos,
and car setup screens. Each would take more than it gives at this size of game. (Longer races
with strategy, once out of scope, are now the Grand Prix mode in M6.)

### Release and pricing

- **itch.io:** pay what you want (minimum $0, with a suggested price). Web build to play in
  the browser, plus the Android APK as a download.
- **Google Play:** Play has no pay-what-you-want pricing: an app is either free or has one
  fixed price. To keep the same spirit, the Play version is **free with an optional
  "support the game" purchase** (one or a few amounts, using Play Billing), which unlocks
  nothing except a thank-you (for example a special livery or a credits mention). Play's
  policy requires in-app tips to use its own billing, so there are no outside donation
  links in the app. Check the current Play payments policy before building this.
- The game is the same everywhere: no content locked behind payment, no ads.

## 3. Technical approach

Keep what already works:

- **Engine / game split** stays enforced by `tests/boundaries.test.ts`: generic pieces (audio,
  save slots, replays, haptics) go in `src/engine/`; F1 rules, modes and content in `src/f1/`.
- **Rules are engine-free and unit-tested.** New rules (slipstream, track limits, qualifying,
  championship points) go in plain modules like `raceControl.ts` and get headless tests that
  run whole races, as the safety-car tests do today.
- **The renderer only reads state.** `race.ts` draws; it doesn't decide anything.

New pieces:

| Piece | Where | Notes |
|---|---|---|
| Game state / screens | `src/f1/screens/` (menu, mode select, championship standings, results) | Replace the "reload the page with `?circuit=`" flow with an in-page screen stack, so a championship can carry state between races without saving and reloading; keep `?circuit=` as a shortcut |
| Save data | `src/engine/save.ts` | Versioned JSON over `storage.ts`, with migrations and tests |
| Audio | `src/engine/audio.ts` | Web Audio: one synthesised engine voice per nearby car, pooled one-shots; unlocked on the first touch (mobile browsers require it); separate music/effects volumes |
| Music | `src/engine/music.ts`, files in `public/audio/` | Streams the soundtrack files, loops at the written loop points, crossfades between menu and race, ducks under effects; loads lazily so the first screen isn't slower |
| Support purchase | `src/engine/store.ts` | Only in the Android build: Play Billing through a Capacitor plugin; does nothing on the web |
| Tyres and pits | `src/f1/tyres.ts`, `src/f1/pits.ts` | Engine-free rules with headless tests, like `raceControl.ts`; pit lane geometry in `layouts.ts` |
| Pause | `src/f1/race.ts` + `main.ts` | Pause on `visibilitychange`, on Android's app pause, and from a PAUSE button; the sim clock stops |
| Fixed-step sim | `f1/raceControl.ts` | Step the race at a fixed 1/120 s and render interpolated; needed for ghosts and replays to be reproducible, and makes tests match the game exactly |
| Seeded randomness | `src/engine/random.ts` | One seeded RNG for lights-out, team draw and AI mistakes; needed for Daily Challenge and replays |
| Ghost / replay | `src/f1/ghost.ts` | Record the player's inputs (or sampled positions) per lap; store the best one per circuit |

Performance budget (keep the phone at 60 fps on the "medium" quality level): the audio and
AI changes are cheap; new circuits must keep their tile counts close to today's; weather
spray must go through the existing particle system and respect the quality governor.

## 4. Milestones

Each milestone ends with a build pushed to itch.io, played on a real phone, and a short
changelog in the README.

### M1: Feels like a game (polish the one race)

The goal: someone who opens the itch.io page plays three races in a row.

- [ ] Pause: PAUSE button, auto-pause when the tab or app is hidden, resume/restart/quit menu
- [ ] Sound effects: engine note, tyre squeal, impacts, lights beeps, flag; volume, remembered
- [ ] Music playback (`engine/music.ts`) with a placeholder loop, so the composed tracks can be dropped in
- [ ] Music: menu theme and a first race loop
- [ ] Difficulty levels on the menu (Rookie / Pro / Legend) replacing AI pace as the player's choice
- [ ] Saved best lap and best race per circuit, shown on the menu and at the results ("NEW RECORD")
- [ ] HUD: gap to the car ahead/behind; a flash on position change and fastest lap
- [ ] Save format with a version number (`engine/save.ts`) and tests
- [ ] Haptics on impacts (Android and where supported)

### M2: Racecraft

The goal: races are won by overtaking, not just by surviving the start.

- [ ] Fixed-step sim and seeded RNG (prerequisite for M3's ghosts; do it first here)
- [ ] Slipstream
- [ ] AI mistakes and defending, scaled by difficulty; named driver personalities
- [ ] Corner-cutting rule: marked corners, warnings, time penalties
- [ ] Short qualifying lap that sets the grid (skippable, off by default in Quick Race)
- [ ] Headless balance tests: per circuit and difficulty, a reference player lap vs. the AI

### M3: Modes

The goal: a reason to come back tomorrow.

- [ ] In-page screen stack replacing the page-reload flow; mode select on the menu
- [ ] Time Trial with best-lap ghost and sector splits
- [ ] Championship: season of rounds, points, driver and team standings, resumable save
- [ ] Circuit unlocks through the championship
- [ ] First-launch controls lap (onboarding)

### M4: Content

The goal: a full first season.

- [ ] Harbour street circuit (tight, walls)
- [ ] Mountain circuit (elevation, crests, jumps)
- [ ] Night desert circuit (straights, slipstream) with a night variant of `render/daylight.ts`
- [ ] Rain/forest circuit with wet-grip sections and spray (weather)
- [ ] Start-of-race grid pan; 10-second replay after the flag
- [ ] Music: a race track per circuit (or per pair of circuits), stings for fastest lap / podium / title
- [ ] Pit lane in every circuit's layout data (not used until M6)

### M5: Release

The goal: version 1.0 on Google Play and itch.io.

Google Play:
- [ ] Google Play developer account and app created in the Play Console
- [ ] Resume the Android workflow on push; build an **AAB** (Play's upload format) as well as the APK
- [ ] Release **upload key** in the repo's secrets, and Play App Signing turned on (Google holds
      the app signing key). The sideloaded APK signed with the repo key can't update to the
      Play version: say so on the itch.io page.
- [ ] Target SDK level up to Play's current requirement; test on Android 8 up to the newest version
- [ ] CI uploads the AAB to Play's **internal testing** track (Play Developer API with a service
      account key in the repo's secrets); promoting to closed/open testing and production stays manual
- [ ] Closed test with enough testers for long enough to meet Play's rule for new personal
      developer accounts (check the current numbers) before production is allowed
- [ ] Store listing: icon, feature graphic, phone screenshots, short and full description,
      a trailer with the game's music
- [ ] Privacy policy page (the game collects nothing; say so), Data safety form, content rating
      questionnaire, ads declaration (none)
- [ ] Optional support purchase with Play Billing (see *Release and pricing*)
- [ ] Android extras: Play Games sign-in is **not** needed; save data backed up with Android's
      Auto Backup so a new phone keeps records

Everywhere:
- [ ] Performance pass on a low-end Android phone; quality governor thresholds re-checked
- [ ] Accessibility: colour-blind-safe position/HUD colours, larger-text option, left-handed deck
- [ ] Daily Challenge (seeded circuit + conditions, best result kept locally)
- [ ] itch.io page: pay what you want with a suggested price; screenshots, GIF, soundtrack
      as an optional download; version 1.0.0

### M6: Grand Prix (after 1.0)

The goal: longer races with strategy, once players have mastered the sprints.

- [ ] Tyre model: two compounds, wear, grip falling off; tyre bar in the HUD
- [ ] Pit lane: entry and exit, speed limit, the car drives itself through, a fixed stop time,
      pick the next compound
- [ ] AI strategy: when to stop and which compound, from wear and gaps; some AI cars take a
      different strategy
- [ ] Grand Prix mode (8–15 laps) and a Grand Prix length option in Championship
- [ ] Mid-race save, so a long race survives the app being closed
- [ ] Headless tests: a whole Grand Prix with stops runs in a test; strategies are balanced
      (no single strategy always wins)
- [ ] Music: a "final laps" track

## 5. Working practice

- One feature per branch/PR; CI (typecheck, tests, build) must be green before merging, as today.
- Every rule change comes with a headless test; every visible change is checked on a phone in
  itch.io's frame (the source of most touch bugs so far).
- Tuning goes through TUNE first; values that feel right are copied into the code as defaults.
- `?debug` and `window.__cc` grow with each system (ghosts, championship state) so behaviour can
  be scripted in tests and checked in the browser.

## 6. Risks

| Risk | Mitigation |
|---|---|
| Audio on mobile browsers (autoplay rules, itch.io iframe, latency) | Unlock on first touch; synthesise rather than stream; test in the itch.io frame on iOS Safari and Android Chrome early in M1 |
| Frame rate on low-end phones as effects and audio grow | Quality governor already steps down; add audio voice limits; keep a low-end test phone in the loop |
| Variable timestep makes ghosts/replays drift | Fixed-step sim before any recording (M2) |
| Scope creep (online, car setup) | The out-of-scope list above; each new idea must serve a pillar |
| Play review delays or rejection (policy, closed-testing rule for new accounts) | Create the developer account and start the closed test early (during M4), not at the end |
| Losing the Play upload key | Play App Signing lets Google reset the upload key; keep a backup of it outside the repo secrets |
| Music files making the download big or the first load slow | Size budget per minute, lazy loading, one shared race loop until the per-circuit tracks are ready |
| Grand Prix races too long for the "pocket" pillar | Mid-race save; sprints stay the default in Quick Race |
| Look-alike teams and traced circuits too close to real ones | Keep invented names and logos; only use permissively licensed outline data, credited in the README |

## 7. Decisions

| Question | Decision |
|---|---|
| Store release | **Google Play** is a target for 1.0 (M5), alongside itch.io |
| Race length | Short races (1–3 laps) first; longer **Grand Prix** races with tyres and pit stops after 1.0 (M6) |
| Music | **Custom soundtrack** made for the game |
| Pricing | **Pay what you want** on itch.io; free with an optional support purchase on Play, which has no pay-what-you-want option |

### Still open

1. Is the support purchase on Play wanted, or should the Play version just be free?
2. Is an iOS / App Store version wanted later? The Capacitor setup would allow it, but it
   needs a Mac to build and a paid Apple developer account.
