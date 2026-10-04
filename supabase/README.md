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

## Seeing the stats

In the SQL Editor: `select public.game_stats();` gives the totals (players all time, today and over 7 days, launches,
races started and finished, km driven, shares, Daily Challenge players today, players by platform, finished races by
mode and circuit, and players per day over the last 30 days). The raw events are in the `events` table.
