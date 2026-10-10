# App Store: the listing and App Store Connect, step by step

Everything to put into App Store Connect for Corner Cutters, ready to paste or upload. The Google Play twin is
`store/README.md`.

- Privacy policy: **https://theaob.github.io/corner-cutters/privacy.html**
- Bundle id: `io.github.theaob.cornercutters`
- In-app purchase: `championship` (non-consumable), as `src/f1/purchase.ts` asks for it. Build the App Store app with
  `npm run ios:appstore` (`VITE_STORE=appstore`: Crescent Park free, the Championship a purchase); plain `ios:sync` builds
  the all-open app.

## Listing

**Name** (30 max): `Corner Cutters`

**Subtitle** (30 max, this is 29): `Pixel-3D arcade Grand Prix`

**Promotional text** (170 max, changeable without a review, this is 154):

> Fifteen pixel-3D circuits, rain and pit stops, a Daily Challenge with a global board. One thumb steers: cut the corners!

**Keywords** (100 max, comma-separated, no spaces, this is 97):

`racing,arcade,grand prix,pixel,retro,formula,drift,time trial,championship,pit stop,offline,car,racer`

**Description** (4000 max):

> Lights out. Corner Cutters is an arcade Grand Prix racer in a crisp pixel-3D look, built for a phone held upright: one thumb steers, the car does the rest, and a race is over in a few minutes.
>
> RACE ON 15 CIRCUITS
> Fast parkland, tight city streets, a figure-of-eight with a bridge, Alpine passes deep in snow, a dirt bowl with monster trucks, a coast of dunes and kites, a volcano with a lava river under the jump, and a neon street circuit at night.
>
> WIN THE CHAMPIONSHIP
> A season of rounds across the circuits, points and standings, and fireworks for the champion.
>
> RAIN, TYRES AND PIT STOPS
> Changeable weather can bring rain mid-race. Box for the right tyres, plan your stops, or gamble and stay out.
>
> RACE THE WORLD
> A Daily Challenge with a global board, where you chase the leader's ghost. Time Trial boards for every circuit in every weather. Time Attack against the clock.
>
> PICK UP AND PLAY
> A controls lap to learn the basics, three difficulties, drift on the dirt, slipstream down the straights, and medals and trophies to collect. A daily reminder, if you want one.
>
> MADE FOR EVERYONE
> Colour-safe splits, larger text, a left-handed layout, reduced motion, and four quality levels for older devices. Gamepads work too.
>
> No ads. No account. Crescent Park is free to race in every mode. The Championship, and every circuit it opens, is a single one-time purchase, restorable on any of your devices.

**What's New** (version 1.0): `The first release. Lights out!`

**Support URL:** `https://github.com/theaob/corner-cutters/issues` (or the site). **Marketing URL:**
`https://theaob.github.io/corner-cutters/`. **Copyright:** `2026 Onur`.

**Category:** primary Games → Racing; secondary Games → Arcade. **Price:** Free (Tier 0).

## In-app purchase

App Store Connect → the app → Monetization → In-App Purchases → + : type **Non-Consumable**, reference name
`Championship`, product id **`championship`** (exactly), price your choice (the Play price is a fair match), display name
`The Championship`, description `A season of rounds on every circuit, and every circuit open to race.` Add a review
screenshot (the Championship shop screen) and submit it with the first build.

## Art (in this folder)

| App Store Connect asks for | Files | Size |
| --- | --- | --- |
| App icon (taken from the build; for reference) | `icon-1024.png` | 1024 × 1024, no transparency |
| iPhone 6.9" screenshots (1 to 10; smaller iPhones scale from these) | `iphone-6.9/01…07` | 1290 × 2796 |
| iPad 13" screenshots (needed, the app runs on iPad) | `ipad-13/01…07` | 2064 × 2752 |

The screenshots are the Play ones (`store/screenshots`) under a caption. `python3 tools/appstore-art.py` redraws them.
The game is portrait on the iPhone; on the iPad it is portrait either way up, so the iPad shots are portrait too.

## App Privacy ("nutrition label")

Same answers as Google's Data safety (`store/README.md`), and the build's `ios/App/App/PrivacyInfo.xcprivacy` agrees.
**Data not used to track you** for everything. Collected, none linked to the player's identity:

- Usage Data → **Product Interaction** (Analytics)
- Diagnostics → **Crash Data**, **Performance Data** (Analytics, App Functionality)
- Identifiers → **Device ID** (a random id the game makes; Analytics, App Functionality)
- User Content → **Other User Content** (leaderboard initials and runs, a REPORT's words) and **Photos or Videos** (the
  REPORT screenshot, only when sent) (App Functionality)

## Age rating

Answer None to every question (violence, sexual content, profanity, gambling, horror, contests, unrestricted web). In-app
purchases don't change it. Expected: 4+.

## App Review

- **Sign-in:** not required. **Notes for the reviewer:**
  > The game needs no account. Crescent Park is free; the Championship (the shop opens from the circuit menu) is a one-time purchase,
  > product `championship`, with RESTORE PURCHASE on the same screen. Stats sent are anonymous and can be switched off
  > under STATS in the settings.
- **Export compliance:** the build says `ITSAppUsesNonExemptEncryption = NO` (HTTPS only), so no question comes up.
- **Content rights:** the music and art are the game's own.

## Steps that need your accounts, in order

1. App Store Connect → Apps → + → New App: iOS, name above, language English (U.S.), the bundle id (register it under
   Certificates, Identifiers & Profiles first if it isn't listed), SKU `cornercutters`.
2. Create the in-app purchase above; fill in the listing, App Privacy, Age Rating and Pricing (Free).
3. Upload the screenshots; paste the texts.
4. On the Mac: `npm run ios:appstore`, open the project (`npm run ios:open`-style, or `npx cap open ios`), set the Team,
   raise **Build** each upload (Version `1.0.0`), Product → Archive → Distribute App → App Store Connect.
5. TestFlight: add yourself as an internal tester; try the purchase with a **Sandbox Apple Account** (Users and Access →
   Sandbox) and RESTORE PURCHASE.
6. Select the build on the version page, attach the in-app purchase, Add for Review → Submit.
