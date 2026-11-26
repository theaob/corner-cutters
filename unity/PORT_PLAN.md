# Port plan: Corner Cutters to Unity (desktop, then Switch)

Status: experiment, phase 1 done. Written 2026-11-25.

## What the web game is (the survey)

About 38,000 lines of TypeScript, 1,500 tests, one codebase shipped to web, YouTube, Android, iOS and itch.io.

| Area | Where | Size / notes | Port approach |
|---|---|---|---|
| Driving rules | `engine/driving.ts`, `engine/sim.ts` | ~850 lines, pure | **Ported, tested** (phase 1) |
| Race rules | `f1/racing.ts`, `raceControl.ts`, `qualifying.ts`, `tyres.ts`, `pits.ts`, `weather.ts`, `slipstream.ts`, `blueFlags.ts` | ~2,500 lines, pure | Port by hand, same golden-trace method |
| AI drivers | `f1/racing.ts` | seeded RNG, deterministic | Port with the RNG (`engine/rng.ts`) so races replay identically |
| Circuits | `f1/layouts.ts` (19), `circuit.ts`, `pits.ts` | data + a builder | **Baked** to JSON by the web game's own builder (phase 1) |
| Rendering | three.js: `engine/render/*`, `f1/*3d.ts`, `circuitScene.ts` (~10k lines) | HD-2D look: tilt-shift, grading, shadows, sprites | Rebuild in Unity (URP). Biggest art task |
| Menus / screens | `app.ts`, `f1/screens/*`, `circuitSelect.ts`, DOM + CSS | ~6k lines | Rebuild in UI Toolkit, gamepad-navigable from day one |
| Text | `f1/lang/*` (8 languages), `engine/i18n.ts` | ~620 lines each | Bake dictionaries to JSON like circuits; same keys |
| Audio | `engine/audio.ts`, `f1/sounds.ts` (WebAudio synthesis), `music.ts`, 3 mp3s | | Music: reuse the mp3s. Effects: synthesis has no direct Unity equivalent; use `OnAudioFilterRead` for engine/skid, clips for the rest |
| Saves | `engine/save.ts` over localStorage | | JSON in `persistentDataPath`; behind an interface so Switch's save-data API drops in |
| Backend | Supabase (`engine/backend.ts`, `supabase/schema.sql`) | 55-line client, REST | `UnityWebRequest` against the same REST endpoints. Backend unchanged. Mind anti-cheat: lap floors per circuit (new circuits need a `lap_floors` row), and a Unity client must keep working with the published web/Android rules |
| IAP | `f1/purchase.ts` (Play Billing / StoreKit via Capacitor) | one non-consumable, `championship` | Desktop: Steam (Steamworks.NET) or itch.io key; Switch: eShop (a paid game or DLC, Nintendo's rules). Abstract behind `IEntitlements` |
| Achievements | `playAchievements.ts` | | Steam / platform achievements behind an interface |
| Input | `engine/controls.ts` | | **Reworked** (phase 1): Input System actions, see README |

Not worth porting: Capacitor/Android/iOS glue, the designer and stats pages (web-only tools), YouTube/itch bundles,
the showreel tooling (can stay web).

## Principles

1. **Single source of truth for data, checked source for rules.** Circuits, dictionaries, tuning and (later) team and
   driver data are *baked* from the TypeScript so there is one copy. Rules are ported by hand to engine-free C#
   (`Core/`) and checked against golden traces from the TypeScript. A rule change on the web side fails the C# test
   until the port catches up.
2. **Deterministic core.** Fixed 60 Hz step, no `UnityEngine` in `Core/`, seeded RNG. Same race on every machine,
   ghosts and daily challenges keep working.
3. **Switch-ready from the start, Switch-built later.** No web-only dependencies; Input System only (a Switch pad is
   a standard gamepad); every platform service (saves, store, achievements, leaderboards) behind an interface; UI
   navigable without a mouse; budgets set for a Tegra X1 (see below). Building for Switch needs Nintendo Developer
   Portal approval, the Unity Switch module and Nintendo's SDK: only Onur's account can obtain those, and the SDK
   is under NDA, so none of it goes in this repo.
4. **The web game keeps shipping.** No change under `src/` for the port; shared tooling lives in `tools/unity/`.

## Phases

**Phase 1: playable core (done in this branch).** One car, any of 19 circuits, keyboard and gamepad, lap timing.
Core verified against the web game (7,666 checks). Unity layer unverified in-editor.

**Phase 2: a real race.** AI drivers and car-vs-car collisions (`collideCars`), race start/finish and standings,
safety car and blue flags, pit lane and tyres, qualifying and the grid, weather. Port `racing.ts` AI, `raceControl.ts`,
`pits.ts`, `tyres.ts` with golden traces for each (a seeded 5-lap race's standings and lap times, from the web game).
Includes a settings model and difficulty. *The longest pure-logic phase; entirely testable without Unity.*
*Status (2026-11-26): the AI, contact, standings, race control (safety car, VSC, blue flags, track limits, penalties,
retirements), pits, tyres, strategy, the weather's rules and difficulty are in, and eight whole races match the web
game's bit for bit. Left: qualifying and the grid it sets, the results, the weather on screen, settings.*

**Phase 3: look and feel.** URP, the HD-2D grade (tilt-shift, colour grading, shadows), scenery per circuit (trees,
stands, town, water, night lights), cars with team liveries, crash debris and fire, camera work, audio (music, engine,
skids, crowd). *The biggest effort and the one needing a Unity artist's eye; do circuit by circuit, Crescent Park first.*

**Phase 4: menus and meta.** Main menu, circuit select, championship, daily challenge, time trial and attack, shop
(helmets, paint), trophies and achievements, settings (controls rebinding, accessibility, language), onboarding,
saves. UI Toolkit with full gamepad navigation and on-screen glyphs that follow the device in use.

**Phase 5: online and store.** Supabase (world board, daily, anti-cheat-compatible submissions), entitlements
(Steam or itch for desktop), crash reporting, localisation QA (Turkish first: the web strings were machine-written).

**Phase 6: Switch.** Needs the developer access above. Then: Switch module and SDK, save data, eShop entitlement,
handheld/docked resolution scaling, performance pass, lotcheck requirements (age rating, accessibility, suspend/resume).

## Switch budget (to design for now)

Handheld 720p, docked up to 1080p, a Tegra X1 (about a quarter of a mid-range laptop GPU). Target 60 fps, fall back to
30 rather than drop below. That means: no full-screen post effects at full resolution (the web game's blur and grade
need half-resolution or a cheaper approximation), baked/blob shadows rather than cascades, draw-call budgets per
circuit (the web game already merges scenery and has a quality governor in `engine/render/quality.ts`: carry the idea),
texture memory under ~1.5 GB, and no runtime shader compilation (warm shaders in a loading screen, as the web game does).

## Risks and open questions

- **Unity layer is unverified in the editor.** First thing to do on a machine with Unity: open, fix compile errors, Play.
- **Look is the real work.** The rules port is mechanical and testable; matching the web game's HD-2D charm in 3D is not.
  Decide how faithful it must be before phase 3.
- **Two codebases.** Every future gameplay change is made twice unless the web game is frozen. Options: freeze web after
  Unity reaches parity; or keep the web game as a free "lite" and Unity as the paid full game. Onur's call.
- **Licences and costs.** Unity personal tier limits (revenue threshold, splash), Steam's one-off fee, Nintendo
  developer programme terms and royalties. Not researched here.
- **Store and IAP model.** The web game's one-time "championship" unlock needs a desktop and Switch equivalent.
- **Ratings, accessibility and legal.** Terms and privacy pages exist for web; consoles add age ratings and platform rules.

## Next step proposed

Open the project in Unity and confirm phase 1 plays (30 minutes), then phase 2 starts with the AI and race rules, which
can proceed in parallel without Unity: it is plain C# against golden traces.
