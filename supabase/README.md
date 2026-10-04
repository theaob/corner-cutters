# The backend (Supabase)

The game talks to one Supabase project for two things, and plays on fine without it (offline, or before it's set up):

- **Play stats**: anonymous events (the game launched, a race started or finished, km driven, a result shared), so you
  can see how many players there are and what they play. A player is a random id made on the device; STATS in the
  settings turns it off.
- **The Daily Challenge's board**: each day's best runs, by three initials, top 100 and your own place.

## Setting it up (once)

1. Make a free project at [supabase.com](https://supabase.com) (any name and region).
2. In its **SQL Editor**, paste all of [`schema.sql`](schema.sql) and run it.
3. In **Project Settings → API**, copy the **Project URL** and the **anon public** key.
4. In GitHub, **Settings → Secrets and variables → Actions → Variables**, add `SUPABASE_URL` and `SUPABASE_ANON_KEY`
   with those two values. (The anon key is meant to be public: it can only add events and call the board's functions.)
5. Push (or re-run the itch.io and android workflows): the builds pick them up.

For a local build, put them in `.env.local` as `VITE_SUPABASE_URL=…` and `VITE_SUPABASE_ANON_KEY=…`.

## Updating it

When `schema.sql` changes, paste all of it into the SQL Editor again and run it. It's safe to run over the project as it is: it keeps every event and run, and adds what's new. For example, the time in the game, and the team and driver picks on the dashboard, need the `seconds` column and the `session` kind, added after the first version.

## Seeing the stats

**The dashboard** (`stats.html`, `src/stats/main.ts`) shows them, live:
- the totals: players (all time, today, last 7 days), launches, races finished and started (and per player), km driven, time per visit (the median, and the mean), hours played, players who came back another day, results shared, and today's Daily Challenge players;
- who players pick: the most and least picked team and driver (ties named together, the never-picked ones at 0), and every team and driver by sessions started;
- players per day over the last 30 days;
- players by platform, and finished sessions by mode and by circuit;
- today's Daily Challenge board.

It refreshes every minute. `.github/workflows/stats.yml` publishes it to GitHub Pages, at https://theaob.github.io/corner-cutters/. To switch it on, once: **Settings → Pages → Build and deployment → Source: GitHub Actions**, then **Actions → stats → Run workflow**. After that it redeploys itself when the dashboard changes. It reads with the same public key as the game, and shows only totals (no player's events). `npm run stats` runs it locally (with `.env.local` as above).

In the SQL Editor:
`select public.game_stats();` gives the totals (players all time, today and over 7 days, launches,
races started and finished, km driven, shares, Daily Challenge players today, players by platform, finished races by
mode and circuit, and players per day over the last 30 days). The raw events are in the `events` table.
