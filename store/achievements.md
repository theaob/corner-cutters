# Google Play Games: the achievements

The game's 27 achievements (`src/f1/achievements.ts`).

## Import them all at once

**`store/achievements-import.zip`** has them all, ready for the Play Console: **Grow users → Play Games Services →
Setup and management → Achievements → Import achievements → Upload**, then **Save as draft**. It holds
`AchievementsMetadata.csv` (each one's name, description, not incremental, revealed, points, list order) and
`AchievementsIconsMappings.csv` (each one's icon), in Google's format (no header rows), and the 27 icons (512 × 512).
There's no `AchievementsLocalizations.csv`: it's optional, and the names and descriptions are the default language's.

Rebuild it after changing an achievement, its points or its icon: `python3 tools/achievements-import.py`.

Play allows no commas in a name or a description, so two read a little differently there than in the game: **BOX BOX**
(BOX, BOX in the game) and HAT TRICK's **Take pole then win the race with its fastest lap.**

**Imported the first 24 already?** Add the three new ones by hand (**Add achievement**: REGULAR, EVERY DAY and BUSY DAY,
rows 25 to 27 below, with their icons), and first lower the points of the twelve below that changed to make room (the
total stays 1,000): GIANT KILLER 70, RAIN MASTER 40, FROM THE BACK 50, HAT TRICK 60, SPOTLESS 30, ENDURANCE 30, BALD 30,
TORCH 30, GOLDEN 30, GOLD STANDARD 100, CHAMPION 90, GLOBETROTTER 70. Points can change only until Play Games is
published. The game finds each one by its name: no ids to copy.

## Or one at a time

**Add achievement** for each, in this order (Play lists them in the order they're made):

- **Name** and **Description** as below (the game's own words).
- **Icon**: the file from `store/achievements/` (512 × 512; Play makes the greyed-out locked version itself).
- **Points**: as below. They add up to **1,000**, Play's most for a game.
- **Incremental achievement**: off. **Initial state**: Revealed. **List order**: as below.
- Save it, and copy the **ID** Play gives it (`CgkI…`).

| # | Icon | Name | Description | Points |
| --- | --- | --- | --- | --- |
| 1 | `finish.png` | CHEQUERED | Finish a race. | 10 |
| 2 | `podium.png` | PODIUM | Finish a race in the top three. | 20 |
| 3 | `win.png` | WINNER | Win a race. | 30 |
| 4 | `hard-win.png` | GIANT KILLER | Win a race on HARD. | 70 |
| 5 | `wet-win.png` | RAIN MASTER | Win a race in the wet. | 40 |
| 6 | `from-back.png` | FROM THE BACK | Win from the back half of the grid. | 50 |
| 7 | `charge.png` | CHARGE | Gain five places in a race. | 30 |
| 8 | `hat-trick.png` | HAT TRICK | Take pole then win the race with its fastest lap. | 60 |
| 9 | `spotless.png` | SPOTLESS | Finish a race with no damage and no track-limits warnings. | 30 |
| 10 | `purple.png` | PURPLE PATCH | Set a race's fastest lap. | 25 |
| 11 | `endurance.png` | ENDURANCE | Finish a race of 15 laps or more. | 30 |
| 12 | `bald.png` | BALD | Finish a race on tyres worn down to 0%. | 30 |
| 13 | `torch.png` | TORCH | Finish a race with your car on fire. | 30 |
| 14 | `rocket.png` | ROCKET START | Get a GREAT LAUNCH off the lights. | 15 |
| 15 | `too-keen.png` | TOO KEEN | Jump the start. | 10 |
| 16 | `torpedo.png` | TORPEDO | Hit three cars or more off the start at the Ardennes. | 30 |
| 17 | `box.png` | BOX BOX | Make a pit stop. | 10 |
| 18 | `no-stop.png` | CAN'T STOP WON'T STOP | Finish a race without a pit stop. | 25 |
| 19 | `lapped.png` | LAPPED | Lap a car. | 30 |
| 20 | `scrapheap.png` | SCRAPHEAP | Wreck your car. | 15 |
| 21 | `golden.png` | GOLDEN | Win a gold medal. | 30 |
| 22 | `gold-standard.png` | GOLD STANDARD | A Time Trial gold on every circuit. | 100 |
| 23 | `champion.png` | CHAMPION | Win a Championship. | 90 |
| 24 | `globetrotter.png` | GLOBETROTTER | Race on every circuit. | 70 |
| 25 | `regular.png` | REGULAR | Play seven days running. | 30 |
| 26 | `devoted.png` | EVERY DAY | Play thirty days running. | 60 |
| 27 | `busy-day.png` | BUSY DAY | Finish all three of a day's missions. | 30 |
| | | | **Total** | **1000** |

## The ids

The app finds each achievement on Play Games by its **name**: once the player's signed in, Play Games lists the
game's achievements with their ids, and each one the game unlocks is matched to its own (letters and digits only,
so "BOX, BOX" in the game is "BOX BOX" on Play). So keep the names as the import made them. Ids can still be pinned in
`PLAY_ACHIEVEMENT_IDS` in `src/f1/playAchievements.ts` (from **Achievements → Get resources**), which win over the
names; that's needed only if a name's changed on one side.

The project id is in `android/app/src/main/res/values/games-ids.xml` (`game_services_project_id`); until it's
there, the app doesn't start Play Games at all.

**Not working?** Send a REPORT from the trophy cabinet: its log says whether Play Games signed in, how many
achievements it listed, and which were sent.

## Testing, and going live

- **Credentials**: Play Games Services → Configuration → Credentials → Add credential → Android, for
  `io.github.theaob.cornercutters`, with the **SHA-1** of both the app signing key (Test and release → App integrity →
  App signing) and the upload key (the same page shows it once a build's uploaded; or the android workflow's signing).
  The app installed from Play is signed with the **app signing key**: without its SHA-1 here, signing in fails
  quietly and no achievement goes. (Each SHA-1 is a credential of its own.)
- **Testers**: Play Games Services → Testers: add your account (and your testers'). Until Play Games is published only
  they can sign in.
- **Publish** (Play Games Services → Publishing): once everything's checked, with the app's production release.
  Achievements can't be deleted once published, only hidden; their points can't be changed.
- To try one again while testing, **Achievements → Reset progress for testers**.

To redraw the icons: `python3 tools/achievement-art.py` (needs Pillow).
