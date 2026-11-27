// You, the play stats and the lap boards, on the backend (Backend.cs), as the web game has them (src/f1/profile.ts,
// metrics.ts, boards.ts). Kept in the save: a random id the device makes for itself the first time (nothing
// personal: it only tells one player's events and board laps from another's), your initials for the boards, whether
// the play stats are sent (STATS: on unless turned off), and the laps waiting to go on a board.
using CornerCutters.Core;
using System;
using System.Collections.Generic;
using System.Text.RegularExpressions;
using UnityEngine;

namespace CornerCutters.Game
{
    public static class Profile
    {
        static readonly Regex Uuid = new Regex("^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$", RegexOptions.IgnoreCase);

        /// <summary>Your id (a v4 UUID, made and kept the first time it's asked for).</summary>
        public static string PlayerId
        {
            get
            {
                string id = Save.String("profile", "id", "");
                if (Uuid.IsMatch(id)) return id;
                string made = Guid.NewGuid().ToString();
                Save.Set("profile", "id", made);
                return made;
            }
        }

        /// <summary>Your initials for the boards (null: not picked yet).</summary>
        public static string Initials
        {
            get
            {
                string n = Save.String("profile", "name", "");
                return Boards.Initials.IsMatch(n) ? n : null;
            }
            set { if (value != null && Boards.Initials.IsMatch(value)) Save.Set("profile", "name", value); }
        }

        /// <summary>STATS: the anonymous play stats sent (on unless turned off).</summary>
        public static bool StatsOn
        {
            get => Save.Bool("settings", "stats", true);
            set => Save.Set("settings", "stats", value);
        }

        /// <summary>The build, as the backend's rows say it (the web's are its package version and commit): unity-, then the player's version.</summary>
        public static string Version
        {
            get
            {
                string v = "unity-" + Application.version;
                return v.Length > 40 ? v.Substring(0, 40) : v;
            }
        }

        /// <summary>
        /// The platform the stats say. The backend's events table only takes web, android and ios (supabase/schema.sql's
        /// events_platform_check), so until it knows a desktop one this build says none, and its version (unity-…) tells
        /// its rows apart.
        /// </summary>
        public const string Platform = null;
    }

    /// <summary>The play stats: noted, and sent every 20 s (and as the game goes to the background or closes).</summary>
    public static class PlayStats
    {
        static readonly StatsQueue queue = new StatsQueue();
        static double untilSend = Metrics.Every;
        /// <summary>this launch of the game (its time in the game is summed by it), and when it was last in front (s)</summary>
        static readonly string launch = Metrics.LaunchId(new System.Random());
        static double? shownAt;

        /// <summary>Note `kind` (with what it was about).</summary>
        public static void Track(string kind, string circuit = null, string mode = null, double? km = null, double? seconds = null, JsonObj data = null)
        {
            if (!Backend.Online || !Profile.StatsOn) return;
            queue.Add(new StatEvent
            {
                Player = Profile.PlayerId, Kind = kind, Platform = Profile.Platform, Version = Profile.Version,
                Circuit = circuit, Mode = mode, Km = km, Seconds = seconds, Data = data,
            });
        }

        /// <summary>A frame (`dt` s of real time): what's waiting goes every so often.</summary>
        public static void Tick(float dt)
        {
            untilSend -= dt;
            if (untilSend > 0) return;
            untilSend = Metrics.Every;
            Flush(false);
        }

        /// <summary>Send what's waiting (`closing`: the game's going, so nothing is kept to try again).</summary>
        public static void Flush(bool closing)
        {
            if (queue.Count == 0) return;
            foreach (var batch in queue.Take())
            {
                var events = batch;
                Backend.Insert("events", Metrics.Batches(events)[0], how => queue.Sent(events, how, closing));
            }
        }

        /// <summary>Start timing the time in the game (from the launch, while it's in front).</summary>
        public static void StartClock() => shownAt = Time.realtimeSinceStartupAsDouble;

        /// <summary>The game went to the background, or is closing: the time in it since it was last in front, then what's waiting, go now.</summary>
        public static void Away()
        {
            if (shownAt.HasValue)
            {
                double s = Time.realtimeSinceStartupAsDouble - shownAt.Value;
                shownAt = null;
                if (s >= 1) Track("session", seconds: Metrics.SessionSeconds(s), data: new JsonObj { { "launch", launch } });
            }
            Flush(true);
        }

        /// <summary>The game's in front again.</summary>
        public static void Back()
        {
            if (!shownAt.HasValue) shownAt = Time.realtimeSinceStartupAsDouble;
        }
    }

    /// <summary>The online lap boards: your new records waiting to go, sent with your initials, and a board read back.</summary>
    public static class LapBoards
    {
        public static List<PendingLap> Pending => Boards.Parse(Save.Text("boards", "pending"));

        static void Keep(IList<PendingLap> laps)
        {
            string s = Boards.Write(laps);
            Save.SetText("boards", "pending", s);
        }

        /// <summary>A new lap record of yours on `circuit` in `weather`: to send (the quicker, if one's waiting there already).</summary>
        public static void Queue(string circuit, string weather, double time)
        {
            if (!Boards.IsBoardWeather(weather)) return;
            Keep(Boards.Queue(Pending, new PendingLap { Circuit = circuit, Weather = weather, Time = time }));
        }

        /// <summary>Send the laps waiting, as `name`: `done` with how many went (those that didn't stay for next time).</summary>
        public static void Send(string name, Action<int> done)
        {
            var laps = Pending;
            string player = Profile.PlayerId, version = Profile.Version;
            var failed = new HashSet<string>();
            int sent = 0;
            void Next(int i)
            {
                if (i == laps.Count)
                {
                    if (laps.Count > 0) Keep(Boards.AfterSend(laps, failed, Pending));
                    done?.Invoke(sent);
                    return;
                }
                Backend.Rpc("submit_lap", Boards.SubmitArgs(laps[i], player, name, version), (ok, _) =>
                {
                    if (ok) sent++;
                    else failed.Add(laps[i].Key);
                    Next(i + 1);
                });
            }
            Next(0);
        }

        /// <summary>`circuit`'s board in `weather` (the top `top`, and your place): `done` with it, or null offline.</summary>
        public static void Fetch(string circuit, string weather, int top, Action<LapBoard> done) =>
            Backend.Rpc("lap_board", Boards.BoardArgs(circuit, weather, Profile.PlayerId, top), (ok, v) => done?.Invoke(ok ? Boards.ParseBoard(v) : null));
    }
}
