// The Daily Challenge and the shop, as the web game has them (src/f1/race.ts startTimeAttack, stepTimeAttack,
// dailyRun; daily.ts; today.ts; screens/carShop.ts): one Time Attack a day on the day's circuit in the day's weather,
// the same for everyone (NORMAL), the clock started at the line and fed at each checkpoint, the day's leading run as a
// gold car to chase, your best on the day's online board; your streak of days played, and the looks it earns for your
// car, picked in the shop.
using System;
using System.Collections.Generic;
using System.Linq;
using CornerCutters.Core;
using UnityEngine;

namespace CornerCutters.Game
{
    public sealed partial class RaceController
    {
        /// <summary>the day's challenge being played (null: a quick race weekend)</summary>
        Challenge? daily;
        Attack attack;
        GhostRecorder attackRec;
        DailyRival rival;
        CarView rivalView;
        HudView.AttackTable attackTable;
        /// <summary>the shop's open on the pause screen</summary>
        bool shopOpen;

        // ---- kept on the device ----

        static DailyLog LoadDaily() => Daily.Parse(PlayerPrefs.GetString("daily", ""));
        static void SaveDaily(DailyLog log) => PlayerPrefs.SetString("daily", Daily.Write(log));
        static Streak LoadStreak() => Streaks.Parse(PlayerPrefs.GetString("streak", ""), LoadDaily());
        static string Today => Streaks.LocalDay(DateTime.Now);

        /// <summary>Your car's look: the one picked in the shop, if your best streak has earned it.</summary>
        static CarStyle MyStyle => Streaks.StyleOf(PlayerPrefs.GetString("carStyle", "standard"), LoadStreak().Best);

        /// <summary>A team's livery with your look over it (yours only).</summary>
        static Livery Styled(Livery look, CarStyle s)
        {
            if (s.Body >= 0) look.Body = TrackView.Hex(s.Body);
            if (s.Stripe >= 0) look.Trim = TrackView.Hex(s.Stripe);
            if (s.Accent >= 0) look.Accent = TrackView.Hex(s.Accent);
            if (s.Pattern != null && Enum.TryParse<LiveryPattern>(s.Pattern, true, out var p)) look.Pattern = p;
            if (s.Gold) look.Helmet = TrackView.Hex(0xe8b830);
            else if (s.Led) look.Helmet = TrackView.Hex(0x7cf6ff);
            else if (s.Helmet >= 0) look.Helmet = TrackView.Hex(s.Helmet);
            return look;
        }

        /// <summary>
        /// Played today (a race finished, a Daily run over): the streak grown, once a day, a missed day forgiven if it can
        /// be; said, with any look it's earned.
        /// </summary>
        void PlayedToday()
        {
            var s = LoadStreak();
            var step = Streaks.PlayedOn(s, Today);
            if (!step.Grew) return;
            PlayerPrefs.SetString("streak", Streaks.Write(s));
            if (step.Rewards.Count > 0) Notice($"NEW LOOK · {step.Rewards[step.Rewards.Count - 1].Name} · IN THE SHOP", TrackView.Hex(0xf2c14e), 4);
            else if (step.Days > 1) Notice($"STREAK · {step.Days} DAYS{(step.Forgave ? " · A MISSED DAY FORGIVEN" : "")}", TrackView.Hex(0xf2c14e), 3);
        }

        // ---- the Daily Challenge ----

        /// <summary>Today's challenge (UTC): its circuit, in its weather, against the clock.</summary>
        void StartDaily()
        {
            var c = Daily.On(Daily.DayOf(DateTime.UtcNow));
            int at = new List<string>(ids).IndexOf(c.Circuit);
            if (at < 0)
            {
                Notice("TODAY'S CIRCUIT ISN'T IN THIS BUILD", TrackView.Hex(0xd8323c), 3);
                return;
            }
            daily = c;
            paused = false;
            LoadCircuit(at);
        }

        /// <summary>Back to a quick race weekend from the Daily Challenge.</summary>
        void LeaveDaily()
        {
            daily = null;
            attack = null;
            attackTable = null;
            if (rivalView != null) rivalView.Root.SetActive(false);
            paused = false;
            NewWeekend();
        }

        string WeatherName(Weather w) => w == Weather.Wet ? "WET" : w == Weather.Damp ? "DAMP" : "DRY";

        /// <summary>A run: you on your own, on the run-up; at the line the clock starts, and each checkpoint adds time.</summary>
        void StartAttack()
        {
            session = Session.Attack;
            var w = daily?.Weather ?? SessionWeather;
            race = Qualifying.NewQualifying(track, grid, difficulty.Handling(), w);
            reference ??= Qualifying.ReferenceLap(track, grid, difficulty.Handling(), w);
            attack = new Attack(reference.Value, difficulty.Id);
            attackRec = new GhostRecorder();
            attackTable = null;
            rival = null;
            Begin(new List<int> { weekend.YouDriver });
            drivenMode = StatsMode;
            NoteStart();
            var best = daily.HasValue && LoadDaily().Best.TryGetValue(daily.Value.Day, out var b) ? b : (DailyRun?)null;
            Notice(best.HasValue && best.Value.Score > 0 ? $"DAILY CHALLENGE · BEAT {Attack.Distance(best.Value.Score)}" : "DAILY CHALLENGE · THE CLOCK STARTS AT THE LINE", TrackView.Hex(0xf2c14e), 3);
            // the day's leading run, as a gold car to chase (once it's here)
            if (daily.HasValue)
            {
                var run = attack;
                Backend.Rpc("daily_ghost", new JsonObj { { "p_day", daily.Value.Day } }, (ok, v) =>
                {
                    var r = ok ? Daily.ParseRival(v) : null;
                    if (r == null || attack != run) return;
                    rival = r;
                    Notice($"CHASING {r.Name} · {Attack.Distance(r.Score)}", TrackView.Hex(0xf2c14e), 3);
                });
            }
        }

        /// <summary>A step against the clock (fresh tyres all the way): time added at each checkpoint, a cut's time off, TIME UP.</summary>
        void StepAttack(List<RaceEvent> events)
        {
            if (attack == null || attack.Over) return;
            var me = Me;
            var p = me.Progress;
            me.Tyres.Wear = 0;
            Tyres.FitTyres(me.Tyres, me.Car, race.Wetness);
            bool cut = events.Any(e => e.Kind == RaceEventKind.TrackLimits && e.Who == you);
            var o = attack.Advance(FixedClock.SimDt, p.LapStart.HasValue, p.LapTimes.Count * Racing.Sectors + p.Sector, cut);
            // (the run, for the board's ghost: from the clock starting)
            if (attack.Left.HasValue) attackRec.Frame(attack.Elapsed, me.Car, p.Idx);
            if (o.Started) Notice("THE CLOCK IS RUNNING", TrackView.Hex(0x5fe0d0), 1.5);
            if (o.Added.HasValue) Notice($"+{o.Added.Value:0.0} S", TrackView.Hex(0x5fe0d0), 1.2);
            if (o.Lost.HasValue) Notice($"CUT · -{o.Lost.Value:0} S", TrackView.Hex(0xd8323c), 2);
            if (o.TimeUp) EndAttack();
        }

        /// <summary>TIME UP: how far you got, your best today and your streak, on to the day's board, and your place there.</summary>
        void EndAttack()
        {
            session = Session.AttackOver;
            tableUp = 0;
            int passed = attack.Passed;
            PlayStats.Track("race_finish", circuit.id, "timeattack", data: new JsonObj { { "passed", passed } });
            NoteDriven();
            PlayedToday();
            var table = attackTable = new HudView.AttackTable { Title = $"TIME UP · {Attack.Distance(passed)}" };
            if (!daily.HasValue) return;
            string day = daily.Value.Day;
            var log = LoadDaily();
            var ghost = attackRec.ToGhost(attack.Elapsed).Pack(Ghost.DefaultHz);
            bool best = Daily.LogRun(log, day, new DailyRun { Score = passed, Time = attack.LastAt }, ghost);
            SaveDaily(log);
            var dayBest = log.Best[day];
            table.Lines.Add((best ? "YOUR BEST TODAY · NEW!" : $"YOUR BEST TODAY · {Attack.Distance(dayBest.Score)}", best ? 0xf2c14e : 0xf4f2fa));
            int streak = Streaks.Now(LoadStreak(), Today);
            if (streak > 0)
            {
                var next = Streaks.NextReward(LoadStreak().Best);
                table.Lines.Add(($"STREAK · {streak} {(streak == 1 ? "DAY" : "DAYS")}{(next != null ? $" · {next.Name} AT {next.Days}" : "")}", 0xf2c14e));
            }
            if (!Backend.Online) return;
            string name = Profile.Initials;
            if (name == null)
            {
                table.Board = "PICK A NAME (PAUSE) FOR THE DAY'S BOARD";
                return;
            }
            SendDaily(log, name, sent =>
            {
                if (sent && best) PlayStats.Track("daily_submit", circuit.id, "daily", data: new JsonObj { { "score", passed } });
                Backend.Rpc("daily_board", Daily.BoardArgs(day, Profile.PlayerId, 3), (ok, v) =>
                {
                    var board = ok ? Daily.ParseBoard(v) : null;
                    if (board == null) return;
                    table.Board = board.You.HasValue ? $"TODAY'S BOARD · #{board.You.Value.Place} OF {board.Entries}" : $"TODAY'S BOARD · {board.Entries} RAN IT";
                    table.BoardTop = board.Top.Count == 0 ? null : string.Join("   ", board.Top.Select(e => $"{e.Place}. {e.Name} {Attack.ShortDistance(e.Score)}"));
                });
            });
        }

        /// <summary>Send the best not yet sent, with its ghost (and again without, for a backend that won't take one): `done(true)` once it's on the board, or there was none.</summary>
        static void SendDaily(DailyLog log, string name, Action<bool> done)
        {
            var run = log.Pending;
            if (run == null) { done?.Invoke(true); return; }
            string player = Profile.PlayerId;
            void Sent(bool ok)
            {
                if (ok)
                {
                    var now = LoadDaily();
                    // (unless a better one came in meanwhile)
                    if (now.Pending != null && now.Pending.Day == run.Day && now.Pending.Run.Score == run.Run.Score && now.Pending.Run.Time == run.Run.Time) now.Pending = null;
                    SaveDaily(now);
                }
                done?.Invoke(ok);
            }
            Backend.Rpc("submit_daily", Daily.SubmitArgs(run, player, name, true), (ok, _) =>
            {
                if (ok || run.Ghost == null) Sent(ok);
                else Backend.Rpc("submit_daily", Daily.SubmitArgs(run, player, name, false), (ok2, __) => Sent(ok2));
            });
        }

        /// <summary>A Daily run waiting for a name, or a connection: on its way (as you pick a name, or the game starts).</summary>
        static void SendWaiting()
        {
            string name = Profile.Initials;
            if (name == null || !Backend.Online) return;
            var log = LoadDaily();
            if (log.Pending != null) SendDaily(log, name, null);
            LapBoards.Send(name, null);
        }

        /// <summary>The day's leading run: a gold car where its ghost is now, while your clock runs.</summary>
        void DrawRival()
        {
            var at = rival != null && attack != null && attack.Left.HasValue && !attack.Over && replay == null ? rival.Ghost.Pose(attack.Elapsed) : null;
            if (at == null)
            {
                if (rivalView != null && rivalView.Root.activeSelf) rivalView.Root.SetActive(false);
                return;
            }
            if (rivalView == null)
            {
                rivalView = new CarView(new Livery { Body = TrackView.Hex(0xf2c14e), Trim = TrackView.Hex(0xfff1c2), Helmet = TrackView.Hex(0xf2c14e) });
                rivalView.Root.name = "Rival";
                rivalView.Root.transform.SetParent(transform, false);
            }
            if (!rivalView.Root.activeSelf) rivalView.Root.SetActive(true);
            var (x, y, h) = at.Value;
            rivalView.Root.transform.SetPositionAndRotation(Units.ToWorld(x, y, Sim.GroundAt(grid, x, y).H), Quaternion.Euler(0, Units.Yaw(h), 0));
        }

        /// <summary>The strip at the top against the clock: where you are, how far you've got.</summary>
        string AttackStrip()
        {
            var p = Me.Progress;
            string lap = p.LapStart == null ? "OUT LAP" : $"LAP {p.LapTimes.Count + 1}";
            return $"{(daily.HasValue ? "DAILY" : "TIME ATTACK")}   {lap}   {Attack.ShortDistance(attack?.Passed ?? 0)}";
        }

        /// <summary>The shop's looks: each one, whether it's yours, and the one you've picked.</summary>
        HudView.ShopState ShopState()
        {
            var s = LoadStreak();
            var owned = new HashSet<string>(Streaks.StylesFor(s.Best).Select(x => x.Id));
            return new HudView.ShopState
            {
                Styles = Streaks.Styles.ToList(), Owned = owned, Picked = MyStyle.Id,
                Streak = Streaks.Now(s, Today), Best = s.Best,
            };
        }

        /// <summary>A look picked in the shop: worn from now on (your car rebuilt in it).</summary>
        void PickStyle(string id)
        {
            PlayerPrefs.SetString("carStyle", id);
            int k = driverOf.IndexOf(weekend.YouDriver);
            if (k >= 0 && k < views.Count) AddView(k);
        }
    }
}
