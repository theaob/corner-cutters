# Google Play: the store listing and the Console, step by step

Everything to put into the Play Console for Corner Cutters, ready to paste or upload. The steps that need your account
are at the bottom, in order.

- Privacy policy: **https://theaob.github.io/corner-cutters/privacy.html** (from `site/privacy.html`, deployed by the
  pages workflow)
- App id: `io.github.theaob.cornercutters`
- In-app product: `championship` (one-time, "managed"), as `src/f1/purchase.ts` asks for it

## Listing

**App name** (30 max): `Corner Cutters`

**Short description** (80 max, this is 78):

> Short, sharp arcade Grand Prix races on 15 pixel-3D circuits. Cut the corners!

**Full description** (4000 max):

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
> A controls lap to learn the basics, three difficulties, drift on the dirt, slipstream down the straights, and medals and trophies to collect.
>
> MADE FOR EVERYONE
> Colour-safe splits, larger text, a left-handed layout, reduced motion, and four quality levels for older phones. Gamepads work too.
>
> No ads. No account. Crescent Park, Glacier Pass, Dust Bowl and Volcano Isle are free to race in Quick Race, Time Attack and Time Trial. The Championship, and every circuit it opens, is a single one-time purchase.

**Category:** Game → Racing. **Tags:** Arcade, Racing, Casual, Pixel art, Single player, Offline.

**Contact email:** your developer email (Play shows it publicly). **Website:** `https://theaob.github.io/corner-cutters/`
or the itch.io page.

## Art (in this folder)

| Play asks for | File | Size |
| --- | --- | --- |
| App icon | `icon-512.png` | 512 × 512, no transparency (Play rounds the corners) |
| Feature graphic | `feature-graphic-1024x500.png` | 1024 × 500 |
| The Championship's product image (if the Console asks for one) | `championship-512.png` | 512 × 512 |
| Phone screenshots (2 to 8) | `screenshots/01…07` | 1080 × 1920 (9:16) |

The screenshots are from the game itself (Crescent Park, Neon Strip, Glacier Pass, the figure-of-eight, Dune Coast,
Dust Bowl, the title). A trailer is optional (a YouTube link); add it later.

## App content (Policy → App content)

**Privacy policy:** the URL above.

**Ads:** No, the app doesn't contain ads.

**App access:** All functionality is available without special access (no login).

**Content rating** (the IARC questionnaire): category **Game**. Answer No to violence, blood, sexuality, language,
controlled substances, gambling and simulated gambling, and horror. For *Interactive elements*, there are **no users
interacting or sharing content**: initials on a leaderboard aren't chat, so answer No to "users can interact". The
*in-app purchases* answer is **Yes** (digital goods). The expected result is PEGI 3 / ESRB Everyone, with "In-Game
Purchases".

**Target audience and content:** ages **13–15, 16–17 and 18+** (not under 13), so the app stays out of the Families
programme. "Could the store listing unintentionally appeal to children?" No.

**News app:** No. **COVID-19:** No. **Government app:** No. **Financial features:** none.

**Data safety** (what the game sends; `supabase/README.md`, `src/f1/metrics.ts`):

- Does the app collect or share any of the required user data types? **Yes**
- Is all user data encrypted in transit? **Yes** (HTTPS)
- Do you provide a way for users to request that their data be deleted? **Yes**. Give the privacy page; the request
  goes through GitHub issues.
- Data types, all **collected, not shared**, **processed ephemerally: No**, **required: No (users can choose)** unless
  noted:

| Data type | Why (purpose) | Notes |
| --- | --- | --- |
| App activity → **App interactions** | Analytics | races started/finished, circuit, mode, km, time played; STATS → OFF stops it |
| App info and performance → **Crash logs** | Analytics, App functionality | errors nothing caught: message, stack, screen |
| App info and performance → **Diagnostics** | Analytics | platform, version |
| Device or other IDs → **Device or other IDs** | Analytics, App functionality | a random id made by the game (not the advertising id, not hardware ids) |
| App activity → **Other user-generated content** | App functionality | leaderboard initials and runs (Daily ghosts); the screenshot and words of a REPORT the player sends |
| Photos and videos → **Photos** | App functionality | the REPORT screenshot (of the game only), sent only when the player presses SEND |

Google Play Games (achievements, in the Play build) is Google's own sign-in and profile; the game only reports
unlocks to it. Check Google's current Data safety guidance for Play Games Services when filling the form (it lists
what, if anything, its SDK needs declared).

Not collected: name, email, location, contacts, financial info (Google Play handles purchases), advertising id,
messages, health, files.

## Achievements (Google Play Games)

The 24 achievements, their icons and points, and the steps: `store/achievements.md`.

## In-app product

**Monetize → Products → In-app products → Create product**: product id **`championship`** (exactly), name "The
Championship", description "Unlock the Championship and every circuit it opens. One purchase, yours for good.", a
price, then **Activate**. Play lets you create it only after an AAB with the billing permission has been uploaded
(step 4 below).

## The steps, in order

1. **Create the app** (Play Console → Create app): name Corner Cutters, default language English (UK or US), **Game**,
   **Free**, and accept the declarations.
2. **App content**: fill in every section above. The Dashboard lists what's left.
3. **Store listing**: paste the texts and upload the art from this folder.
4. **First upload, by hand**: from the latest `android` workflow run on `main` (Actions → android → the run →
   Artifacts), download **corner-cutters-play-aab** and unzip it. In **Testing → Internal testing → Create new
   release**, keep **Play App Signing** on (Google signs the app for the store; the key in the repo's secrets becomes
   your *upload* key) and upload the `.aab`. Add yourself to the testers list and install from the opt-in link.
5. **The Championship product** (above), now that Play has seen the billing permission. Buy it on the internal test
   with a **license tester** (Settings → License testing → add your Google account) so it isn't charged.
6. **Closed testing**: a new personal developer account must run a closed test with **at least 12 testers opted in
   for 14 days in a row** before it can apply for production (Dashboard → "Apply for production"). Make a Google Group
   or an email list of testers, create the closed track's release (promote the internal one), and share the opt-in link.
7. **Production**: after 14 days, apply for production (a short questionnaire on the test), then promote the release.
   The first review usually takes a few days.

### CI uploads (optional, after step 4)

The `android` workflow can push every Play build from `main` to the **internal testing** track (as a draft release,
so promoting it is still yours). It's off until the secret is set:

1. Google Cloud Console: create a project (or use any), enable the **Google Play Android Developer API**, create a
   **service account**, and make a **JSON key** for it.
2. Play Console → **Users and permissions → Invite new users**: the service account's email, with app permission
   **Release to testing tracks** for Corner Cutters.
3. GitHub → Settings → Secrets and variables → Actions: add **`PLAY_SERVICE_ACCOUNT_JSON`** with the whole JSON key.

Each push to `main` then uploads its AAB (its version code is the run number, higher every time) as a draft
on internal testing.

### Things to know

- **Sideloaded vs. Play:** the APK on itch.io is signed with the upload key; the Play version is signed by Google's app
  signing key. They have the same app id but different signatures, so a phone with the itch.io APK must uninstall it
  before installing from Play (their saves don't carry over). Worth a line on the itch.io page. (To avoid that instead, at step 4 choose **Use a
  different key** and upload the release key itself as the app signing key, with Google's PEPK tool. Both builds
  then share a signature. The default, a key Google makes, is safer if the repo's secrets ever leak.)
- **Version codes** are the workflow's run number. Play refuses a code it has already seen, so always upload a newer
  run's AAB.
- **Names:** the circuits and teams are the game's own, but the drivers' three-letter codes (HAM, NOR, ALO…) match real
  drivers'. Play's impersonation and IP policy can flag that, and changing them to made-up codes before production is
  the safe choice.
