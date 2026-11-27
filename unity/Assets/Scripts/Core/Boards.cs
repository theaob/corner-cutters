// The online lap boards, as the web game keeps them (src/f1/boards.ts): a circuit's quickest laps in each weather, one
// a player, with their initials. A new record of yours waits on the device (the quicker one, per circuit and weather)
// until it's sent with submit_lap; a board is read back with lap_board. The engine-free half: the laps waiting, as
// they're kept (JSON), what goes to the backend, and the board read back.
using System;
using System.Collections.Generic;
using System.Linq;
using System.Text.RegularExpressions;

namespace CornerCutters.Core
{
    /// <summary>A lap waiting to go on a board.</summary>
    public struct PendingLap
    {
        public string Circuit, Weather;
        public double Time;
        public string Key => Boards.KeyOf(Circuit, Weather);
    }

    /// <summary>One place on a board.</summary>
    public struct LapEntry
    {
        public int Place;
        public string Name;
        public double Time;
        public bool You;
    }

    /// <summary>A circuit's board in a weather: how many have a lap there, its top, and your place (if you have one).</summary>
    public sealed class LapBoard
    {
        public int Entries;
        public List<LapEntry> Top = new List<LapEntry>();
        public LapEntry? You;
    }

    public static class Boards
    {
        /// <summary>The weathers a lap is boarded in (a changeable weekend's laps aren't).</summary>
        public static readonly string[] Weathers = { "dry", "damp", "wet" };
        public static bool IsBoardWeather(string w) => Array.IndexOf(Weathers, w) >= 0;

        /// <summary>A weather choice's board (none for changeable).</summary>
        public static string WeatherOf(WeatherChoice w) => w switch
        {
            WeatherChoice.Dry => "dry",
            WeatherChoice.Damp => "damp",
            WeatherChoice.Wet => "wet",
            _ => null,
        };

        /// <summary>Initials: three letters or digits.</summary>
        public static readonly Regex Initials = new Regex("^[A-Z0-9]{3}$");

        public static string KeyOf(string circuit, string weather) => $"{circuit}:{weather}";

        /// <summary>The laps waiting, from how they're kept ({ "circuit:weather": { circuit, weather, time } }); the unsound ones left out.</summary>
        public static List<PendingLap> Parse(string kept)
        {
            var list = new List<PendingLap>();
            if (!(Json.Parse(kept) is Dictionary<string, object> all)) return list;
            foreach (var v in all.Values)
                if (v is Dictionary<string, object> l && l.TryGetValue("circuit", out var c) && c is string circuit
                    && l.TryGetValue("weather", out var w) && w is string weather && IsBoardWeather(weather)
                    && l.TryGetValue("time", out var t) && t is double time && time > 5)
                    list.Add(new PendingLap { Circuit = circuit, Weather = weather, Time = time });
            return list;
        }

        /// <summary>The laps waiting, to keep (null: none, the key removed).</summary>
        public static string Write(IList<PendingLap> laps)
        {
            if (laps.Count == 0) return null;
            var all = new JsonObj();
            foreach (var l in laps) all[l.Key] = new JsonObj { { "circuit", l.Circuit }, { "weather", l.Weather }, { "time", l.Time } };
            return Json.Write(all);
        }

        /// <summary>A new record of yours, `lap`, added to those waiting (the quicker, if one's waiting there already): the laps now.</summary>
        public static List<PendingLap> Queue(IList<PendingLap> pending, PendingLap lap)
        {
            var all = pending.ToList();
            if (!IsBoardWeather(lap.Weather)) return all;
            int at = all.FindIndex(l => l.Key == lap.Key);
            if (at >= 0 && all[at].Time <= lap.Time) return all;
            var kept = new PendingLap { Circuit = lap.Circuit, Weather = lap.Weather, Time = JsMath.Round(lap.Time * 1000) / 1000 };
            if (at >= 0) all[at] = kept;
            else all.Add(kept);
            return all;
        }

        /// <summary>submit_lap's arguments for `lap`, by `player` as `name` from build `version`.</summary>
        public static JsonObj SubmitArgs(PendingLap lap, string player, string name, string version) => new JsonObj
        {
            { "p_circuit", lap.Circuit }, { "p_weather", lap.Weather }, { "p_player", player }, { "p_name", name }, { "p_time", lap.Time }, { "p_version", version },
        };

        /// <summary>lap_board's arguments.</summary>
        public static JsonObj BoardArgs(string circuit, string weather, string player, int top) => new JsonObj
        {
            { "p_circuit", circuit }, { "p_weather", weather }, { "p_player", player }, { "p_top", top },
        };

        /// <summary>
        /// The laps still waiting after a send: of those `tried`, the ones in `failed` (by key), and any that came in while
        /// they were going (a new circuit and weather, or a quicker lap than the one that went).
        /// </summary>
        public static List<PendingLap> AfterSend(IList<PendingLap> tried, ICollection<string> failed, IList<PendingLap> now)
        {
            var left = new List<PendingLap>();
            void Put(PendingLap l)
            {
                int at = left.FindIndex(x => x.Key == l.Key);
                if (at >= 0) left[at] = l;
                else left.Add(l);
            }
            foreach (var l in tried) if (failed.Contains(l.Key)) Put(l);
            foreach (var l in now)
            {
                int went = -1;
                for (int i = 0; i < tried.Count; i++) if (tried[i].Key == l.Key) { went = i; break; }
                if (went < 0 || (!left.Any(x => x.Key == l.Key) && l.Time < tried[went].Time)) Put(l);
            }
            return left;
        }

        /// <summary>A board as lap_board sends it (null if it isn't one).</summary>
        public static LapBoard ParseBoard(object v)
        {
            if (!(v is Dictionary<string, object> d) || !(d.TryGetValue("entries", out var n) && n is double entries)) return null;
            var board = new LapBoard { Entries = (int)entries };
            if (d.TryGetValue("top", out var top) && top is List<object> list)
                foreach (var x in list)
                    if (Entry(x) is LapEntry e) board.Top.Add(e);
            if (d.TryGetValue("you", out var you)) board.You = Entry(you);
            return board;
        }

        static LapEntry? Entry(object v)
        {
            if (!(v is Dictionary<string, object> d)) return null;
            if (!(d.TryGetValue("place", out var p) && p is double place && d.TryGetValue("name", out var nm) && nm is string name && d.TryGetValue("time", out var t) && t is double time)) return null;
            return new LapEntry { Place = (int)place, Name = name, Time = time, You = d.TryGetValue("you", out var y) && y is bool b && b };
        }

        /// <summary>What your place on a board says: a world record, or where you are of how many.</summary>
        public static string PlaceLine(LapBoard b) =>
            b?.You == null ? null : b.You.Value.Place == 1 ? $"WORLD RECORD · #1 OF {b.Entries}" : $"WORLD BOARD · #{b.You.Value.Place} OF {b.Entries}";
    }
}
