// The anonymous play stats, as the web game sends them (src/f1/metrics.ts): the game launched, a race started and
// finished (its mode and circuit), the km driven and the time on each circuit, the time in the game. Queued, and sent
// in batches every so often to the backend's events table, by a random id the device made for itself; nothing at all
// when STATS is off, or the build has no backend. The engine-free half: the events, their batches' rows (the same keys
// on every row of a batch, as the database wants), and the queue with its retry rule.
using System;
using System.Collections.Generic;
using System.Linq;

namespace CornerCutters.Core
{
    public sealed class StatEvent
    {
        public string Player, Kind, Platform, Version, Circuit, Mode;
        public double? Km, Seconds;
        public JsonObj Data;

        object Field(string c) => c switch
        {
            "player" => Player, "kind" => Kind, "platform" => Platform, "version" => Version, "circuit" => Circuit, "mode" => Mode,
            "km" => Km, "seconds" => Seconds, "data" => Data, _ => null,
        };

        /// <summary>This event as a row with just `columns` (what it hasn't: null).</summary>
        public JsonObj Row(IEnumerable<string> columns)
        {
            var row = new JsonObj();
            foreach (var c in columns)
            {
                var v = Field(c);
                row[c] = v is double d ? d : v;
            }
            return row;
        }
    }

    public static class Metrics
    {
        /// <summary>m of the real world in a px of track (Silver Heath's 8,800 px lap is the 5.9 km circuit it's traced from)</summary>
        public const double MetresPerPx = 0.67;
        /// <summary>s between sends</summary>
        public const double Every = 20;
        /// <summary>the most events kept to send again after a send that didn't go</summary>
        public const int KeepAtMost = 200;

        /// <summary>The kinds the backend takes.</summary>
        public static readonly string[] Kinds = { "launch", "race_start", "race_finish", "drive", "share", "daily_submit", "session", "error" };

        /// <summary>The columns each kind of batch sends: the time in the game apart (a backend whose schema is older refuses only those).</summary>
        public static readonly string[] Columns = { "player", "kind", "platform", "version", "circuit", "mode", "km", "data" };
        public static readonly string[] SessionColumns = { "player", "kind", "platform", "version", "seconds", "data" };

        static int GroupOf(StatEvent e) => e.Kind == "session" ? 1 : e.Kind == "error" ? 2 : 0;

        /// <summary>The events in their batches: the events, the time in the game, the errors (the empty ones left out).</summary>
        public static List<List<StatEvent>> Grouped(IList<StatEvent> events) =>
            new[] { 0, 1, 2 }.Select(g => events.Where(e => GroupOf(e) == g).ToList()).Where(b => b.Count > 0).ToList();

        /// <summary>The events as the batches to send, each row with its batch's keys (no time on them: the database stamps them).</summary>
        public static List<List<JsonObj>> Batches(IList<StatEvent> events) =>
            Grouped(events).Select(list => list.Select(e => e.Row(list[0].Kind == "session" ? SessionColumns : Columns)).ToList()).ToList();

        /// <summary>The km in `px` of driving.</summary>
        public static double KmOf(double px) => px * MetresPerPx / 1000;

        /// <summary>km as sent: to the metre.</summary>
        public static double RoundKm(double km) => JsMath.Round(km * 1000) / 1000;

        /// <summary>The time in the game as a 'session' event says it: whole s, at most a day.</summary>
        public static double SessionSeconds(double s) => JsMath.Round(Math.Min(s, 86400));

        /// <summary>A launch's id: 10 base-36 digits (the web game's Math.random().toString(36).slice(2, 12)).</summary>
        public static string LaunchId(Random rng)
        {
            const string digits = "0123456789abcdefghijklmnopqrstuvwxyz";
            var c = new char[10];
            for (int i = 0; i < c.Length; i++) c[i] = digits[rng.Next(36)];
            return new string(c);
        }
    }

    /// <summary>How a send went: in, refused by the database (it never will be, however often it's tried), or not sent (offline).</summary>
    public enum Sent { Ok, Refused, Offline }

    /// <summary>The events waiting to be sent.</summary>
    public sealed class StatsQueue
    {
        readonly List<StatEvent> queue = new List<StatEvent>();
        public int Count => queue.Count;

        public void Add(StatEvent e)
        {
            if (e.Km.HasValue) e.Km = Metrics.RoundKm(e.Km.Value);
            queue.Add(e);
        }

        /// <summary>All that's waiting, in its batches (the queue emptied).</summary>
        public List<List<StatEvent>> Take()
        {
            var all = queue.ToList();
            queue.Clear();
            return Metrics.Grouped(all);
        }

        /// <summary>A batch sent and how it went: back at the front to try again if it didn't go (not if the game's closing, or the queue's long).</summary>
        public void Sent(List<StatEvent> batch, Sent how, bool closing)
        {
            if (how == Core.Sent.Offline && !closing && queue.Count < Metrics.KeepAtMost) queue.InsertRange(0, batch);
        }
    }
}
