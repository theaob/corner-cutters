-- Corner Cutters' backend (Supabase): the play stats and the Daily Challenge's board.
-- Run it once in the project's SQL editor (it can be run again: it replaces what it made).
-- The game only ever uses the public (anon) key: it can add events and call the three functions below, nothing else.
-- Nothing personal is kept: a player is a random id made on the device, and their initials on the board.

-- ---------------------------------------------------------------- play stats
create table if not exists public.events (
  id bigint generated always as identity primary key,
  at timestamptz not null default now(),
  -- the random id the device made for itself
  player uuid not null,
  kind text not null,
  platform text check (platform in ('web', 'android')),
  version text check (char_length(version) <= 40),
  circuit text check (char_length(circuit) <= 40),
  mode text check (char_length(mode) <= 20),
  -- km driven (a 'drive' event: since the last one), and a little more about the event
  km real check (km >= 0 and km < 5000),
  -- s in the game (a 'session' event: a stretch of a launch, while the page was showing; data.launch says which)
  seconds real check (seconds >= 0 and seconds <= 86400),
  data jsonb check (pg_column_size(data) <= 2000)
);
-- (run again on a project made before: the columns and kinds added since)
alter table public.events add column if not exists seconds real check (seconds >= 0 and seconds <= 86400);
alter table public.events drop constraint if exists events_kind_check;
alter table public.events add constraint events_kind_check
  check (kind in ('launch', 'race_start', 'race_finish', 'drive', 'share', 'daily_submit', 'session'));
create index if not exists events_at on public.events (at);
create index if not exists events_kind on public.events (kind);
alter table public.events enable row level security;
drop policy if exists "the game adds events" on public.events;
create policy "the game adds events" on public.events for insert to anon with check (at > now() - interval '1 minute');
grant insert on public.events to anon;
revoke select, update, delete on public.events from anon;
-- (no reading them with the public key: the totals come from game_stats(), for the dashboard)

-- ---------------------------------------------------------------- the Daily Challenge's board
create table if not exists public.daily_times (
  day date not null,
  player uuid not null,
  -- three letters or digits, as on an arcade board
  name text not null check (name ~ '^[A-Z0-9]{3}$'),
  -- checkpoints passed before the clock ran out, and s from the clock starting to the last of them (the tie-break)
  score int not null check (score between 0 and 2000),
  time real not null check (time >= 0 and time < 7200),
  at timestamptz not null default now(),
  primary key (day, player)
);
create index if not exists daily_board on public.daily_times (day, score desc, time asc);
alter table public.daily_times enable row level security;
revoke all on public.daily_times from anon;
-- (no direct access with the public key: only submit_daily() and daily_board())

-- A run of today's (or, round midnight, yesterday's or tomorrow's) challenge: kept if it's the player's best.
create or replace function public.submit_daily(p_day date, p_player uuid, p_name text, p_score int, p_time real) returns void
language plpgsql security definer set search_path = public as $$
begin
  if abs(p_day - (now() at time zone 'utc')::date) > 1 then raise exception 'not a challenge being played'; end if;
  insert into daily_times (day, player, name, score, time) values (p_day, p_player, upper(p_name), p_score, p_time)
  on conflict (day, player) do update set
    name = excluded.name,
    score = case when (excluded.score, -excluded.time) > (daily_times.score, -daily_times.time) then excluded.score else daily_times.score end,
    time = case when (excluded.score, -excluded.time) > (daily_times.score, -daily_times.time) then excluded.time else daily_times.time end,
    at = case when (excluded.score, -excluded.time) > (daily_times.score, -daily_times.time) then now() else daily_times.at end;
end;
$$;
revoke all on function public.submit_daily(date, uuid, text, int, real) from public;
grant execute on function public.submit_daily(date, uuid, text, int, real) to anon;

-- A day's board: the top `p_top`, and the player's own place and run (if they have one), and how many have run it.
create or replace function public.daily_board(p_day date, p_player uuid, p_top int default 100) returns jsonb
language sql stable security definer set search_path = public as $$
  with ranked as (
    select player, name, score, time, rank() over (order by score desc, time asc) as place from daily_times where day = p_day
  )
  select jsonb_build_object(
    'entries', (select count(*) from ranked),
    'top', (select coalesce(jsonb_agg(jsonb_build_object('place', place, 'name', name, 'score', score, 'time', time, 'you', player = p_player) order by place, time), '[]')
            from (select * from ranked order by place, time limit least(greatest(p_top, 1), 100)) t),
    'you', (select jsonb_build_object('place', place, 'name', name, 'score', score, 'time', time) from ranked where player = p_player)
  );
$$;
revoke all on function public.daily_board(date, uuid, int) from public;
grant execute on function public.daily_board(date, uuid, int) to anon;

-- ---------------------------------------------------------------- the stats, for the dashboard
-- The totals: players, launches, races, km driven, all time, today and over the last 7 days, and by circuit and mode;
-- and each circuit's plays, km and minutes, by mode.
create or replace function public.game_stats() returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'players', (select count(distinct player) from events),
    'players_today', (select count(distinct player) from events where at > date_trunc('day', now())),
    'players_7d', (select count(distinct player) from events where at > now() - interval '7 days'),
    'launches', (select count(*) from events where kind = 'launch'),
    'launches_today', (select count(*) from events where kind = 'launch' and at > date_trunc('day', now())),
    'races_started', (select count(*) from events where kind = 'race_start'),
    'races_finished', (select count(*) from events where kind = 'race_finish'),
    'km', (select coalesce(round(sum(km)::numeric, 1), 0) from events where kind = 'drive'),
    'shares', (select count(*) from events where kind = 'share'),
    -- time in the game: each launch's stretches summed, the median and the mean of them, and all of it
    'median_session_secs', (select coalesce(round(percentile_cont(0.5) within group (order by t)::numeric), 0) from
      (select sum(seconds) t from events where kind = 'session' group by player, data->>'launch') s),
    'mean_session_secs', (select coalesce(round(avg(t)::numeric), 0) from (select sum(seconds) t from events where kind = 'session' group by player, data->>'launch') s),
    'hours_played', (select coalesce(round((sum(seconds) / 3600)::numeric, 1), 0) from events where kind = 'session'),
    -- players who came back on another day, and races started per player
    'returning_players', (select count(*) from (select player from events group by player having count(distinct (at at time zone 'utc')::date) > 1) r),
    'races_per_player', (select coalesce(round(avg(n)::numeric, 1), 0) from (select count(*) n from events where kind = 'race_start' group by player) r),
    -- the team and driver picked for each session started
    'by_team', (select coalesce(jsonb_object_agg(t, n), '{}') from (select data->>'team' t, count(*) n from events where kind = 'race_start' and data ? 'team' group by 1) x),
    'by_driver', (select coalesce(jsonb_object_agg(d, n), '{}') from (select data->>'driver' d, count(*) n from events where kind = 'race_start' and data ? 'driver' group by 1) x),
    'daily_players_today', (select count(*) from daily_times where day = (now() at time zone 'utc')::date),
    'by_platform', (select coalesce(jsonb_object_agg(platform, n), '{}') from (select platform, count(distinct player) n from events where platform is not null group by platform) p),
    'by_mode', (select coalesce(jsonb_object_agg(mode, n), '{}') from (select mode, count(*) n from events where kind = 'race_finish' and mode is not null group by mode) m),
    'by_circuit', (select coalesce(jsonb_object_agg(circuit, n), '{}') from (select circuit, count(*) n from events where kind = 'race_finish' and circuit is not null group by circuit) c),
    'daily_players', (select coalesce(jsonb_agg(jsonb_build_object('day', d, 'players', n) order by d), '[]') from
      (select (at at time zone 'utc')::date d, count(distinct player) n from events where at > now() - interval '30 days' group by 1) x),
    -- and the launches, and the time in the game (s), on each of the last 30 days
    'daily_launches', (select coalesce(jsonb_agg(jsonb_build_object('day', d, 'launches', n) order by d), '[]') from
      (select (at at time zone 'utc')::date d, count(*) n from events where kind = 'launch' and at > now() - interval '30 days' group by 1) x),
    'daily_seconds', (select coalesce(jsonb_agg(jsonb_build_object('day', d, 'seconds', n) order by d), '[]') from
      (select (at at time zone 'utc')::date d, round(sum(seconds)) n from events where kind = 'session' and at > now() - interval '30 days' group by 1) x),
    -- each circuit: the sessions started on it, the races finished, the km driven and the minutes on it (a 'drive'
    -- event's data.seconds), all of it and by mode; the most played first
    'circuits', (select coalesce(jsonb_agg(jsonb_build_object('circuit', circuit, 'plays', plays, 'finishes', finishes, 'km', km, 'minutes', minutes, 'modes', modes)
      order by plays desc, minutes desc, circuit), '[]') from (
        select circuit, sum(plays) plays, sum(finishes) finishes, round(sum(km)::numeric, 1) km, round(sum(secs)::numeric / 60, 1) minutes,
          jsonb_object_agg(mode, jsonb_build_object('plays', plays, 'finishes', finishes, 'km', round(km::numeric, 1), 'minutes', round(secs::numeric / 60, 1))) modes
        from (
          select circuit, coalesce(mode, '?') mode,
            count(*) filter (where kind = 'race_start') plays,
            count(*) filter (where kind = 'race_finish') finishes,
            coalesce(sum(km) filter (where kind = 'drive'), 0) km,
            coalesce(sum(case when jsonb_typeof(data->'seconds') = 'number' then (data->>'seconds')::real end) filter (where kind = 'drive'), 0) secs
          from events where circuit is not null and kind in ('race_start', 'race_finish', 'drive') group by 1, 2
        ) by_mode group by circuit
      ) c)
  );
$$;
revoke all on function public.game_stats() from public;
grant execute on function public.game_stats() to anon;
