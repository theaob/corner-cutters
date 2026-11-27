// Medals and achievements in play (race.ts's achieve, showMedal and the medal calls; app.ts's title; today.ts's streak
// achievements): a Time Trial lap or a Time Attack run better than the medal you had here wins the new one (kept, and
// said); the next medal's target shows under the clock; achievements unlock as they happen (a launch, a jump start,
// cars hit off the start at the Ardennes, a stop, lapping a car, a wreck), at your flag from how the race went, as
// medals, titles, the streak and the day's missions bring them, each said with a toast. Kept on the device
// (the save's trophies section, as the web game keeps it).
using System.Collections.Generic;
using System.Linq;
using CornerCutters.Core;
using UnityEngine;

namespace CornerCutters.Game
{
    public sealed partial class RaceController
    {
        public static Trophies LoadTrophies() => Trophies.Parse(Save.SectionText("trophies"));
        public static void SaveTrophies(Trophies t) => Save.SetSectionText("trophies", t.Write());

        /// <summary>the cars you've hit off the start (their places in the field), for TORPEDO</summary>
        readonly HashSet<int> startHits = new HashSet<int>();

        /// <summary>Unlock achievements `ids`: a toast for each new one.</summary>
        public static void Achieve(IEnumerable<string> ids)
        {
            var t = LoadTrophies();
            var fresh = t.Unlock(ids);
            if (fresh.Count == 0) return;
            SaveTrophies(t);
            foreach (var a in fresh) HudView.Toast("ACHIEVEMENT", a.Name, a.About.ToUpperInvariant());
        }

        void FreshTrophies() => startHits.Clear();

        /// <summary>A race's event, for the achievements that happen as they do (in a race).</summary>
        void TrophyEvent(RaceEvent ev)
        {
            if (session != Session.Race || replay != null) return;
            switch (ev.Kind)
            {
                case RaceEventKind.PitStop when ev.Who == you: Achieve(new[] { "box" }); break;
                case RaceEventKind.Contact when (ev.A == you || ev.B == you) && race.Phase == RacePhase.Racing && race.Clock <= Trophies.TorpedoWindow:
                    startHits.Add(ev.A == you ? ev.B : ev.A);
                    if (circuit.id == Trophies.TorpedoCircuit && startHits.Count >= Trophies.TorpedoCars) Achieve(new[] { "torpedo" });
                    break;
                case RaceEventKind.Blue when ev.By == you: Achieve(new[] { "lapped" }); break;
                case RaceEventKind.Wreck when ev.Who == you: Achieve(new[] { "scrapheap" }); break;
            }
        }

        /// <summary>Your flag, the field settled: the achievements for how the race went, and GLOBETROTTER once every circuit's raced.</summary>
        void RaceTrophies()
        {
            var me = Me;
            var order = RaceControl.Order(race);
            var ids = Trophies.RaceAchievements(new RaceSummary
            {
                Place = order.IndexOf(you) + 1, Field = race.Entrants.Count, Grid = you + 1, Fastest = fastest?.who == you,
                Damaged = scratched, Strikes = me.Limits.Strikes, Laps = race.Laps, Difficulty = difficulty.Id, Weather = race.Weather.ToString().ToLowerInvariant(),
                TyresLeft = (int)System.Math.Round((1 - me.Tyres.Wear) * 100), Burning = me.Car.Burn.HasValue, Stops = me.Stops,
            });
            var t = LoadTrophies();
            if (t.RacedOn(circuit.id, ids_)) ids.Add("globetrotter");
            SaveTrophies(t);
            Achieve(ids);
        }

        /// <summary>every circuit in the game (for GLOBETROTTER and GOLD STANDARD)</summary>
        List<string> ids_ => ids.ToList();

        /// <summary>A medal won (better than the one here): kept, said, and the medals' achievements.</summary>
        void WinMedal(MedalKind kind, Medal medal, string what)
        {
            var t = LoadTrophies();
            if (!t.Award(circuit.id, kind, medal)) return;
            SaveTrophies(t);
            sounds?.Record();
            HudView.Toast("MEDAL", $"{Medals.NameOf(medal)} MEDAL", $"{what} · {CircuitName}", Medals.ColorOf(medal));
            Achieve(t.MedalAchievements(ids_));
        }

        string CircuitName => (circuit.name ?? circuit.id).ToUpperInvariant();

        /// <summary>A Time Trial lap done: its medal, if better than the one here.</summary>
        void TrialMedal(Ghost g)
        {
            if (!reference.HasValue) return;
            WinMedal(MedalKind.Trial, Medals.LapMedal(g.Time, reference.Value), Results.FormatTime(g.Time));
        }

        /// <summary>A Time Attack run over: its medal (none in the Daily Challenge's own table: it's the day's), if better than the one here.</summary>
        Medal AttackMedalWon(int passed)
        {
            var medal = Medals.AttackMedal(passed, attack.Generous);
            WinMedal(MedalKind.Attack, medal, Attack.Distance(passed));
            return medal;
        }

        /// <summary>The next medal here and what it asks for, for the HUD (null: not a Time Trial or Time Attack).</summary>
        (string text, Color color)? MedalLine()
        {
            var kind = session == Session.Trial ? MedalKind.Trial : session == Session.Attack ? MedalKind.Attack : (MedalKind?)null;
            if (!kind.HasValue || !reference.HasValue) return null;
            var held = LoadTrophiesCached().MedalOn(circuit.id, kind.Value);
            // (in a Time Attack, the medal this run has reached already counts: past bronze, it's silver you're after)
            if (kind == MedalKind.Attack && attack != null)
            {
                var reached = Medals.AttackMedal(attack.Passed, attack.Generous);
                if (reached > held) held = reached;
            }
            var next = Medals.Next(held);
            if (next == Medal.None) return ("GOLD", TrackView.Hex(Medals.ColorOf(Medal.Gold)));
            string target = kind == MedalKind.Trial ? Results.FormatTime(Medals.LapTarget(reference.Value, next)) : attack != null ? Attack.ShortDistance(Medals.AttackTarget(next, attack.Generous)) : null;
            return target == null ? ((string, Color)?)null : ($"{Medals.NameOf(next)} {target}", TrackView.Hex(Medals.ColorOf(next)));
        }

        // (the HUD asks every frame: read once a second at most)
        Trophies cachedTrophies;
        float cachedAt = -10;
        Trophies LoadTrophiesCached()
        {
            if (cachedTrophies == null || Time.unscaledTime - cachedAt > 1) { cachedTrophies = LoadTrophies(); cachedAt = Time.unscaledTime; }
            return cachedTrophies;
        }

        /// <summary>A Championship won: into the cabinet, and CHAMPION.</summary>
        static void WonTitle()
        {
            var t = LoadTrophies();
            t.Titles++;
            SaveTrophies(t);
            Achieve(new[] { "champion" });
        }
    }
}
