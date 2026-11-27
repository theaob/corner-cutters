// The save's document (src/engine/save.ts, src/f1/save.ts): everything the game keeps, in one JSON document with a
// version number, {version, data: {section: {name: value}}}: the web game's own format, the same sections and the same
// values (settings, choices, ghosts, championship, progress, records, trophies, boards, daily, profile, streak,
// missions, device), so a save from the web game or the Android app reads here as it is, and one from here reads
// there. A save from an older version is brought up to date by the web game's migrations; one from a newer game is
// read as far as it can be, never written over. The Unity port's own values (the UI's scale, the keys, a race kept in
// its own form) are in a section of their own, 'unity', which the web game leaves alone. Engine-free, checked
// against the web game (save.json).
using System;
using System.Collections.Generic;
using System.Linq;

namespace CornerCutters.Core
{
    public sealed class SaveDoc
    {
        /// <summary>this game's save version (src/f1/save.ts CC_SAVE)</summary>
        public const int Version = 2;
        /// <summary>the sections that belong to the device, not the player: left out of a save moved to another</summary>
        public static readonly string[] DeviceSections = { "device" };
        /// <summary>the sections kept one key to a value, apart from the document (which holds a marker 1 for each)</summary>
        public static readonly string[] SplitSections = { "ghosts" };

        public int At = Version;
        public readonly Dictionary<string, Dictionary<string, object>> Data = new Dictionary<string, Dictionary<string, object>>();

        public static bool IsSplit(string section) => Array.IndexOf(SplitSections, section) >= 0;

        /// <summary>A stored save's JSON as a document: null if it isn't one (not JSON, or no version of 1 or more).</summary>
        public static SaveDoc Parse(string json)
        {
            if (string.IsNullOrEmpty(json)) return null;
            object raw;
            try { raw = Json.Parse(json); } catch { return null; }
            if (!(raw is Dictionary<string, object> o) || !o.TryGetValue("version", out var v) || !(v is double n) || n != Math.Floor(n) || n < 1) return null;
            var d = new SaveDoc { At = (int)n };
            if (o.TryGetValue("data", out var data) && data is Dictionary<string, object> sections)
                foreach (var kv in sections)
                    if (kv.Value is Dictionary<string, object> s) d.Data[kv.Key] = new Dictionary<string, object>(s);
            return d;
        }

        public string Write()
        {
            var data = new JsonObj();
            foreach (var kv in Data)
            {
                var s = new JsonObj();
                foreach (var v in kv.Value) if (v.Value != null) s[v.Key] = v.Value;
                data[kv.Key] = s;
            }
            return Json.Write(new JsonObj { { "version", (double)At }, { "data", data } });
        }

        /// <summary>Brought up to this game's version by the web game's migrations (a newer one left as it is).</summary>
        public SaveDoc Migrated()
        {
            // (0 → 1 built the first save from the web game's separate keys of before: a save that reaches here has a version already)
            if (At < 2)
            {
                // 1 → 2: the thumbstick's default moved to the right; the old default, 'left', was saved whether picked or not, so it's dropped
                if (!Data.TryGetValue("settings", out var s)) Data["settings"] = s = new Dictionary<string, object>();
                if (s.TryGetValue("stickSide", out var side) && side as string == "left") s.Remove("stickSide");
                At = 2;
            }
            return this;
        }

        public object Get(string section, string name) => Data.TryGetValue(section, out var s) && s.TryGetValue(name, out var v) ? v : null;

        /// <summary>Set a value (null: gone; an emptied section goes too).</summary>
        public void Set(string section, string name, object value)
        {
            if (!Data.TryGetValue(section, out var s))
            {
                if (value == null) return;
                Data[section] = s = new Dictionary<string, object>();
            }
            if (value == null)
            {
                s.Remove(name);
                if (s.Count == 0) Data.Remove(section);
            }
            else s[name] = value;
        }

        /// <summary>The document to move to another device: the device's own sections left out (the split values put back whole by the caller).</summary>
        public SaveDoc ForExport()
        {
            var d = new SaveDoc { At = At };
            foreach (var kv in Data) if (Array.IndexOf(DeviceSections, kv.Key) < 0) d.Data[kv.Key] = new Dictionary<string, object>(kv.Value);
            return d;
        }

        /// <summary>
        /// This save replaced by `incoming` (moved from another device), migrated: null if it's from a newer game than this
        /// one (it couldn't be read as it should be). This device's own sections stay.
        /// </summary>
        public SaveDoc Replaced(SaveDoc incoming)
        {
            if (incoming == null || incoming.At > Version) return null;
            var d = incoming.Migrated();
            foreach (var k in DeviceSections)
            {
                if (Data.TryGetValue(k, out var s)) d.Data[k] = new Dictionary<string, object>(s);
                else d.Data.Remove(k);
            }
            return d;
        }

        /// <summary>A save moved here, in brief: what's in it (for the player to check before it replaces theirs).</summary>
        public string Summary()
        {
            var parts = new List<string>();
            if (Get("streak", "now") is Dictionary<string, object> st && st.TryGetValue("best", out var best) && best is double b && b > 0) parts.Add($"BEST STREAK {b:0}");
            if (Get("records", "circuits") is Dictionary<string, object> rc && rc.Count > 0) parts.Add($"RECORDS ON {rc.Keys.Select(k => k.Split(':')[0]).Distinct().Count()} CIRCUITS");
            if (Get("trophies", "titles") is double t && t > 0) parts.Add($"{t:0} TITLE{(t == 1 ? "" : "S")}");
            if (Get("trophies", "achievements") is List<object> a && a.Count > 0) parts.Add($"{a.Count} ACHIEVEMENTS");
            if (Data.TryGetValue("ghosts", out var g) && g.Count > 0) parts.Add($"{g.Count} GHOSTS");
            if (Get("championship", "season") != null) parts.Add("A CHAMPIONSHIP");
            if (Get("profile", "name") is string n) parts.Add(n);
            return parts.Count > 0 ? string.Join(" · ", parts) : "AN EMPTY SAVE";
        }
    }

    /// <summary>Your records on each circuit (src/f1/records.ts): best race lap, qualifying lap, race time by laps, Time Attack checkpoints.</summary>
    public sealed class CircuitRecords
    {
        public double? BestLap, BestQualifying;
        public readonly SortedDictionary<int, double> BestRace = new SortedDictionary<int, double>();
        public int? BestAttack;
    }

    public sealed class Records
    {
        /// <summary>by the record's id: the circuit's, with ':weather' after it unless dry (race.ts recordId)</summary>
        public readonly Dictionary<string, CircuitRecords> Circuits = new Dictionary<string, CircuitRecords>();

        /// <summary>a circuit's records' id in a weather ("dry", "damp", "wet", "changeable")</summary>
        public static string IdOf(string circuit, string weather) => weather == "dry" ? circuit : $"{circuit}:{weather}";

        static double? Time(object v) => v is double d && !double.IsNaN(d) && !double.IsInfinity(d) && d > 0 ? d : (double?)null;

        /// <summary>Records from the saved 'circuits' value, keeping whatever is valid.</summary>
        public static Records From(object circuits)
        {
            var r = new Records();
            if (!(circuits is Dictionary<string, object> all)) return r;
            foreach (var kv in all)
            {
                if (!(kv.Value is Dictionary<string, object> c)) continue;
                var cr = new CircuitRecords { BestLap = c.TryGetValue("bestLap", out var l) ? Time(l) : null, BestQualifying = c.TryGetValue("bestQualifying", out var q) ? Time(q) : null };
                if (c.TryGetValue("bestRace", out var br) && br is Dictionary<string, object> races)
                    foreach (var rk in races)
                        if (int.TryParse(rk.Key, System.Globalization.NumberStyles.None, System.Globalization.CultureInfo.InvariantCulture, out int laps) && laps > 0 && Time(rk.Value) is double t) cr.BestRace[laps] = t;
                if (c.TryGetValue("bestAttack", out var a) && a is double ad && ad == Math.Floor(ad) && ad > 0) cr.BestAttack = (int)ad;
                r.Circuits[kv.Key] = cr;
            }
            return r;
        }

        public object ToValue()
        {
            var all = new JsonObj();
            foreach (var kv in Circuits)
            {
                var c = new JsonObj();
                if (kv.Value.BestLap.HasValue) c["bestLap"] = kv.Value.BestLap.Value;
                var races = new JsonObj();
                foreach (var r in kv.Value.BestRace) races[r.Key.ToString(System.Globalization.CultureInfo.InvariantCulture)] = r.Value;
                c["bestRace"] = races;
                if (kv.Value.BestQualifying.HasValue) c["bestQualifying"] = kv.Value.BestQualifying.Value;
                if (kv.Value.BestAttack.HasValue) c["bestAttack"] = (double)kv.Value.BestAttack.Value;
                all[kv.Key] = c;
            }
            return all;
        }

        CircuitRecords On(string id) => Circuits.TryGetValue(id, out var c) ? c : Circuits[id] = new CircuitRecords();

        /// <summary>A race lap on `id`: true if it's a new best (the first counts).</summary>
        public bool Lap(string id, double seconds)
        {
            var c = On(id);
            if (c.BestLap.HasValue && c.BestLap.Value <= seconds) return false;
            c.BestLap = seconds;
            return true;
        }

        public bool Qualifying(string id, double seconds)
        {
            var c = On(id);
            if (c.BestQualifying.HasValue && c.BestQualifying.Value <= seconds) return false;
            c.BestQualifying = seconds;
            return true;
        }

        public bool Race(string id, int laps, double seconds)
        {
            var c = On(id);
            if (c.BestRace.TryGetValue(laps, out var best) && best <= seconds) return false;
            c.BestRace[laps] = seconds;
            return true;
        }

        /// <summary>A Time Attack run that passed `checkpoints`: true if a new best there (none passed never is).</summary>
        public bool Attack(string id, int checkpoints)
        {
            if (checkpoints <= 0) return false;
            var c = On(id);
            if (c.BestAttack.HasValue && c.BestAttack.Value >= checkpoints) return false;
            c.BestAttack = checkpoints;
            return true;
        }
    }
}
