// The race in progress, kept on the device (a port of src/f1/raceSave.ts), so a long race survives the game being
// closed: a Quick Race or a Championship round, from the lights going out to your flag. What's kept is the race's state
// as plain data (every car where it is, how fast, how damaged, its laps, its tyres, its strategy, its pit stop; the
// weather; the safety car; the clock), with what's needed to build the same weekend again: the circuit, the set-up,
// the seed and the grid. Coming back, the race is built as it was and the state laid over it; the AI's dice are rolled
// afresh from the seed and the lap (they can't be kept), so the race goes on as it was, if not exactly as it would have.
// The state is read off the Core's own classes field by field (their public fields, by reflection), so a field added
// to a car or an entrant is kept too, with no list here to forget it on.
using System;
using System.Collections;
using System.Collections.Generic;
using System.Linq;
using System.Reflection;
using System.Runtime.Serialization;

namespace CornerCutters.Core
{
    /// <summary>A race kept to come back to: where, how it was set up, and its state.</summary>
    public sealed class KeptRace
    {
        public int V = RaceSave.Version;
        /// <summary>when it was kept (Unix ms)</summary>
        public double At;
        public string Circuit, Name;
        /// <summary>'race' or 'championship'</summary>
        public string Mode;
        /// <summary>the Championship's round it is (it's thrown away if the season's moved on)</summary>
        public int Round = -1;
        public string Team, Difficulty, Weather;
        public int Laps;
        public uint Seed;
        /// <summary>the grid it started from (drivers by slot)</summary>
        public List<int> Grid = new List<int>();
        /// <summary>which entrant's you</summary>
        public int You;
        /// <summary>the race's state (RaceSave.Snapshot)</summary>
        public object State;

        /// <summary>Your lap, for the button that comes back to it: LAP 4/10.</summary>
        public string LapLine()
        {
            int lap = 0, laps = Laps;
            if (State is Dictionary<string, object> s && s.TryGetValue("Entrants", out var es) && es is List<object> list && You < list.Count
                && list[You] is Dictionary<string, object> me && me.TryGetValue("Progress", out var p) && p is Dictionary<string, object> pd && pd.TryGetValue("Lap", out var l) && l is double d)
                lap = (int)d;
            return $"LAP {Math.Min(laps, lap + 1)}/{laps}";
        }
    }

    public static class RaceSave
    {
        /// <summary>The version of a kept race: one of another version is thrown away.</summary>
        public const int Version = 1;
        /// <summary>A kept race older than this (ms) is thrown away: a week.</summary>
        public const double MaxAge = 7 * 24 * 3600 * 1000.0;

        /// <summary>fields not kept: the car's class (every car's an F1 car), the AI's dice and what it's doing to whom (refs)</summary>
        static readonly HashSet<string> Skip = new HashSet<string> { "Cls", "Rng", "Move", "LungeCar", "LungeFrom" };
        /// <summary>the race's own fields that are kept (the rest are the circuit's, built again)</summary>
        static readonly string[] RaceFields = { "Weather", "Wetness", "Rain", "Laps", "Phase", "Clock", "LightsOut", "Sc", "Vsc", "HoldBehind", "Entrants" };

        // ---- plain data from the Core's objects, and back ----

        static IEnumerable<FieldInfo> Fields(Type t) => t.GetFields(BindingFlags.Public | BindingFlags.Instance).Where(f => !Skip.Contains(f.Name) && !f.IsInitOnly);

        static object ToData(object v)
        {
            switch (v)
            {
                case null: return null;
                case bool b: return b;
                case string s: return s;
                case double d: return double.IsPositiveInfinity(d) ? (object)"inf" : double.IsNegativeInfinity(d) ? "-inf" : double.IsNaN(d) ? "nan" : d;
                case float f: return (double)f;
                case int i: return (double)i;
                case uint u: return (double)u;
                case long l: return (double)l;
                case Enum e: return (double)Convert.ToInt32(e);
                case IList list:
                    {
                        var o = new List<object>();
                        foreach (var x in list) o.Add(ToData(x));
                        return o;
                    }
            }
            var obj = new JsonObj();
            foreach (var f in Fields(v.GetType())) obj[f.Name] = ToData(f.GetValue(v));
            return obj;
        }

        static double Num(object d) => d is double x ? x : d is string s ? (s == "inf" ? double.PositiveInfinity : s == "-inf" ? double.NegativeInfinity : double.NaN) : 0;

        /// <summary>`data` as a value of type `t`; an object filled into `into` if there is one (else made new).</summary>
        static object FromData(object data, Type t, object into = null)
        {
            var under = Nullable.GetUnderlyingType(t);
            if (data == null) return null;
            if (under != null) t = under;
            if (t == typeof(bool)) return data is bool b && b;
            if (t == typeof(string)) return data as string;
            if (t == typeof(double)) return Num(data);
            if (t == typeof(float)) return (float)Num(data);
            if (t == typeof(int)) return (int)Num(data);
            if (t == typeof(uint)) return (uint)Num(data);
            if (t == typeof(long)) return (long)Num(data);
            if (t.IsEnum) return Enum.ToObject(t, (int)Num(data));
            if (t.IsArray)
            {
                var src = (List<object>)data;
                var arr = Array.CreateInstance(t.GetElementType(), src.Count);
                for (int i = 0; i < src.Count; i++) arr.SetValue(FromData(src[i], t.GetElementType()), i);
                return arr;
            }
            if (typeof(IList).IsAssignableFrom(t) && t.IsGenericType)
            {
                var item = t.GetGenericArguments()[0];
                var list = (IList)Activator.CreateInstance(t);
                foreach (var x in (List<object>)data) list.Add(FromData(x, item));
                return list;
            }
            var d = (Dictionary<string, object>)data;
            object o = into ?? (t.GetConstructor(Type.EmptyTypes) != null ? Activator.CreateInstance(t) : FormatterServices.GetUninitializedObject(t));
            foreach (var f in Fields(t))
            {
                if (!d.TryGetValue(f.Name, out var fv)) continue;
                bool nested = fv is Dictionary<string, object> && !f.FieldType.IsValueType;
                f.SetValue(o, FromData(fv, f.FieldType, nested ? f.GetValue(o) : null));
            }
            return o;
        }

        // ---- the race ----

        /// <summary>The race's state, as plain data (a copy: the race goes on).</summary>
        public static object Snapshot(Race race)
        {
            var o = new JsonObj();
            foreach (string name in RaceFields) o[name] = ToData(typeof(Race).GetField(name).GetValue(race));
            return o;
        }

        /// <summary>
        /// Lay `state` over `race` (built afresh, as it was: the same field from the same seed and grid). The AI's dice are
        /// rolled afresh from `seed` and the lap. False (and `race` untouched) if it isn't this race's: another field.
        /// </summary>
        public static bool Restore(Race race, object state, uint seed)
        {
            if (!(state is Dictionary<string, object> s) || !(s.TryGetValue("Entrants", out var es) && es is List<object> entrants)) return false;
            if (entrants.Count != race.Entrants.Count || (int)Num(s.TryGetValue("Laps", out var l) ? l : null) != race.Laps) return false;
            var cls = race.Entrants[0].Car.Cls;
            try
            {
                foreach (string name in RaceFields)
                {
                    if (name == "Entrants" || !s.TryGetValue(name, out var v)) continue;
                    var f = typeof(Race).GetField(name);
                    f.SetValue(race, FromData(v, f.FieldType));
                }
                if (race.Sc != null) race.Sc.Car.Cls = cls;
                for (int k = 0; k < entrants.Count; k++)
                {
                    var e = race.Entrants[k];
                    // (laid over the entrant as it is; fields the kept one has none of, a pit stop over say, are gone now)
                    FromData(entrants[k], typeof(Entrant), e);
                    e.Car.Cls = cls;
                    if (e.Ai != null)
                    {
                        e.Ai.Move = null;
                        e.Ai.LungeCar = null;
                        if (e.Ai.Rng != null) e.Ai.Rng = new SeededRandom(DiceFor(seed, k, e.Progress.Lap));
                    }
                }
            }
            catch (Exception)
            {
                return false;
            }
            return true;
        }

        /// <summary>An AI driver's dice afresh (raceSave.ts): from the seed, its place in the field and its lap.</summary>
        public static uint DiceFor(uint seed, int k, int lap)
        {
            int mix = unchecked((int)seed ^ (int)(uint)((ulong)(k + 1) * 2654435761UL));
            uint v = unchecked((uint)(mix + lap * 97));
            return v == 0 ? 1 : v;
        }

        // ---- kept on the device ----

        public static string Write(KeptRace k) => Json.Write(new JsonObj
        {
            { "v", (double)k.V }, { "at", k.At }, { "circuit", k.Circuit }, { "name", k.Name }, { "mode", k.Mode }, { "round", (double)k.Round },
            { "team", k.Team }, { "difficulty", k.Difficulty }, { "weather", k.Weather }, { "laps", (double)k.Laps }, { "seed", (double)k.Seed },
            { "grid", k.Grid.Select(x => (object)(double)x).ToList() }, { "you", (double)k.You }, { "state", k.State },
        });

        /// <summary>The kept race, if there's one and it's sound (this version, not too old).</summary>
        public static KeptRace Parse(string text, double nowMs)
        {
            if (string.IsNullOrEmpty(text)) return null;
            object v;
            try { v = Json.Parse(text); } catch { return null; }
            if (!(v is Dictionary<string, object> o)) return null;
            object G(string key) => o.TryGetValue(key, out var x) ? x : null;
            if (!(G("v") is double ver) || ver != Version || !(G("at") is double at) || nowMs - at > MaxAge) return null;
            if (!(G("circuit") is string circuit) || !(G("mode") is string mode) || (mode != "race" && mode != "championship") || !(G("seed") is double seed)) return null;
            if (!(G("state") is Dictionary<string, object> state) || !(state.TryGetValue("Entrants", out var es) && es is List<object> entrants) || !(G("you") is double you) || you < 0 || you >= entrants.Count) return null;
            if (!(G("grid") is List<object> grid) || !grid.All(x => x is double)) return null;
            return new KeptRace
            {
                At = at, Circuit = circuit, Name = G("name") as string ?? circuit, Mode = mode, Round = G("round") is double r ? (int)r : -1,
                Team = G("team") as string, Difficulty = G("difficulty") as string, Weather = G("weather") as string, Laps = G("laps") is double l ? (int)l : 5,
                Seed = (uint)seed, Grid = grid.Select(x => (int)(double)x).ToList(), You = (int)you, State = state,
            };
        }
    }
}
