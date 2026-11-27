// The day's missions in play (missions.ts, today.ts, race.ts's play): each thing you do in a session (a race
// finished, a lap, a launch, a pit stop, a Time Trial lap, a Time Attack run) counts towards today's three missions,
// kept on the device for the day (PlayerPrefs "missions", the web game's JSON); a mission done is said on the screen
// (and, at a race's end, on the results). And the launch off the lights (launch.ts): on the throttle before they're
// out is a jump start (5 s at the flag); a quick reaction once they're out, a great or good getaway (a kick of speed).
using System.Collections.Generic;
using CornerCutters.Core;
using UnityEngine;

namespace CornerCutters.Game
{
    public sealed partial class RaceController
    {
        static DayProgress LoadMissions() => Missions.Parse(PlayerPrefs.GetString("missions", ""), Today);

        /// <summary>the missions done this race, for the results' notes; the race counted towards them; your car scratched</summary>
        readonly List<string> missionNotes = new List<string>();
        bool raceCounted, scratched;
        Launch launch;
        /// <summary>the day's news waiting for the screen (a notice up already)</summary>
        readonly Queue<(string text, Color color, double seconds)> dayNews = new Queue<(string, Color, double)>();

        static readonly Color MissionColor = TrackView.Hex(0x5fe0d0);

        /// <summary>`e` done now: the day's missions brought on, kept, and those it finishes said.</summary>
        List<string> Play(PlayEvent e)
        {
            var p = LoadMissions();
            string before = Missions.Write(p);
            var done = Missions.Count(p, e, out bool all);
            string after = Missions.Write(p);
            if (after != before) PlayerPrefs.SetString("missions", after);
            var said = new List<string>();
            if (done.Count == 0) return said;
            int doneToday = 0;
            foreach (var m in Missions.On(p.Day)) if (Missions.IsDone(p, m)) doneToday++;
            foreach (var m in done)
            {
                string text = $"MISSION DONE · {Missions.TextOf(m)} · {(all && m == done[done.Count - 1] ? "ALL THREE TODAY" : $"{doneToday} OF 3 TODAY")}";
                said.Add(text);
                News(text, MissionColor, 3);
            }
            return said;
        }

        /// <summary>A line of the day's news on the screen: now, or after the notice that's up.</summary>
        void News(string text, Color color, double seconds)
        {
            if (sinceStart < noticeUntil) dayNews.Enqueue((text, color, seconds));
            else Notice(text, color, seconds);
        }

        /// <summary>The next line of news, once the notice before it is down.</summary>
        void NextNews()
        {
            if (dayNews.Count > 0 && sinceStart >= noticeUntil)
            {
                var n = dayNews.Dequeue();
                Notice(n.text, n.color, n.seconds);
            }
        }

        /// <summary>A race's start: a launch to judge, nothing counted yet.</summary>
        void FreshRace()
        {
            launch = new Launch();
            raceCounted = scratched = false;
            missionNotes.Clear();
            dayNews.Clear();
        }

        /// <summary>A step of the lights and the getaway: your throttle judged against them.</summary>
        void StepLaunch(Racing.WheelPad wheel)
        {
            if (launch == null || session != Session.Race) return;
            bool lit = race.Phase == RacePhase.Lights && race.Clock >= 0;
            double? since = race.Phase == RacePhase.Racing ? race.Clock : (double?)null;
            var v = launch.Step(lit, since, wheel.Gas);
            if (v == LaunchVerdict.Jump)
            {
                Me.Progress.Penalty += Launch.JumpPenalty;
                Notice($"JUMP START · +{Launch.JumpPenalty:0} S", TrackView.Hex(0xd8323c), 3);
            }
            else if (v == LaunchVerdict.Great || v == LaunchVerdict.Good)
            {
                var car = Me.Car;
                double kick = Launch.KickOf(v);
                car.Vx += JsMath.Sin(car.Heading) * kick;
                car.Vy -= JsMath.Cos(car.Heading) * kick;
                Notice($"{(v == LaunchVerdict.Great ? "GREAT" : "GOOD")} LAUNCH · {launch.Reaction:0.00} S", TrackView.Hex(v == LaunchVerdict.Great ? 0xb36bff : 0x5fe0d0), 2);
                Play(new PlayEvent { Kind = PlayKind.Launch, Great = v == LaunchVerdict.Great });
            }
        }

        /// <summary>Your race over and the field settled: it counts (where you finished, from where, how it went).</summary>
        void CountRace()
        {
            if (raceCounted || session != Session.Race || !Me.Progress.Finished.HasValue || !RaceControl.Settled(race)) return;
            raceCounted = true;
            var order = RaceControl.Order(race);
            missionNotes.AddRange(Play(new PlayEvent
            {
                Kind = PlayKind.Race, Place = order.IndexOf(you) + 1, Grid = you + 1, Field = race.Entrants.Count, Fastest = fastest?.who == you,
                Clean = !scratched && Me.Limits.Strikes == 0, Weather = race.Weather.ToString().ToLowerInvariant(), Circuit = circuit.id, Difficulty = difficulty.Id,
            }));
        }

        /// <summary>The menu's TODAY panel: your streak, and today's three missions and how far along each is.</summary>
        HudView.TodayPanel TodayPanel()
        {
            var s = LoadStreak();
            int days = Streaks.Now(s, Today);
            var next = Streaks.NextReward(days);
            var p = LoadMissions();
            var panel = new HudView.TodayPanel
            {
                Streak = days > 0 ? $"{days}-DAY STREAK" : "START A STREAK",
                Next = next != null ? $"{next.Days - days} MORE: {next.Name}" : "EVERY LOOK EARNED",
            };
            foreach (var m in Missions.On(p.Day)) panel.Missions.Add((Missions.TextOf(m), Missions.ProgressOf(p, m), m.Goal, Missions.IsDone(p, m)));
            return panel;
        }
    }
}
