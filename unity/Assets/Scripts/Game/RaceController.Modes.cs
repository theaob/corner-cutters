// The Championship and the Time Trial, as the web game plays them (app.ts, race.ts, championship.ts, timeTrial.ts).
// A Championship round is a race weekend with the season's field (its drivers, teams and each one's pace all season),
// the round's own seed and forecast, the season's difficulty, qualifying and laps; at the flag the result goes to the
// season (kept on the device), and back to the season screen. A Time Trial is you on your own, flying laps on fresh
// tyres against your best lap here (in this weather): its ghost drives beside you, each sector's split against it
// (purple: a record; green: quicker than the lap you're chasing; amber: slower), a cut lap deleted.
using System.Collections.Generic;
using System.Linq;
using CornerCutters.Core;
using UnityEngine;

namespace CornerCutters.Game
{
    public sealed partial class RaceController
    {
        // ---- the Championship ----

        /// <summary>the season whose round is being raced (null: not a Championship round)</summary>
        Season season;
        /// <summary>the round's result gone to the season</summary>
        bool roundDone;

        int IndexOf(string id)
        {
            for (int i = 0; i < ids.Count; i++) if (ids[i] == id) return i;
            return 0;
        }

        /// <summary>A circuit unlocked (the save's progress.unlocked, unlocks.ts).</summary>
        static void Unlock(string id)
        {
            var list = Save.Get("progress", "unlocked") as List<object> ?? new List<object>();
            if (list.Contains(id)) return;
            list = new List<object>(list) { id };
            Save.Set("progress", "unlocked", list);
        }

        static void SaveSeason(Season s) => Save.SetText("championship", "season", s == null ? null : Championship.Write(s));

        /// <summary>A new season with the team, qualifying and length picked, the difficulty from the settings: a round on every circuit (but the free ones), kept.</summary>
        Season NewSeason(Menu m)
        {
            var s = Championship.NewSeason((uint)Random.Range(1, int.MaxValue), Field.Teams[m.Team], 0, Field.Difficulties[m.Difficulty].Id, m.SeasonQualifying, m.SeasonRounds(), 11, m.SeasonLaps);
            SaveSeason(s);
            return s;
        }

        /// <summary>A round's weekend: the season's field, the round's seed and forecast, the season's own choices. False: not a round.</summary>
        bool SeasonWeekend()
        {
            if (season == null || season.Over) return false;
            seed = Championship.RoundSeed(season, season.Round);
            difficulty = Field.DifficultyById(season.Difficulty) ?? Field.Normal;
            team = Championship.TeamOf(season.Drivers[season.You]);
            laps = season.RoundLaps;
            qualifying = season.Qualifying;
            weekend = Field.SeasonWeekend(seed, season, difficulty);
            double raceSeconds = laps * track.Length / 300;
            forecast = Forecast.Round(seed, raceSeconds);
            // (the weather it makes, for the records and the tables: fixed, or changeable)
            weatherChoice = !forecast.Fixed ? WeatherChoice.Changeable : forecast.Start >= 2 ? WeatherChoice.Wet : forecast.Start >= 1 ? WeatherChoice.Damp : WeatherChoice.Dry;
            roundDone = false;
            return true;
        }

        /// <summary>The round's result to the season: the drivers in finishing order, those who didn't finish; then the season screen.</summary>
        void FinishRound()
        {
            if (season != null && !roundDone)
            {
                roundDone = true;
                var order = RaceControl.Order(race);
                var finish = order.Select(i => driverOf[i]).ToList();
                var out_ = new HashSet<int>(order.Where(i => race.Entrants[i].Progress.Retired).Select(i => driverOf[i]));
                Championship.RecordRound(season, finish, out_);
                SaveSeason(season);
                // (reaching the next round's circuit unlocks it, as the web game keeps it: everything's open here, but a
                // save moved to the phone, where circuits open as a season goes, keeps what's been reached)
                if (!season.Over && season.Round < season.Rounds.Count) Unlock(season.Rounds[season.Round]);
                // the season won: into the trophy cabinet
                if (season.Over && Championship.Standings(season)[0].Driver == season.You) WonTitle();
            }
            season = null;
            playMode = "race";
            OpenMenu(Menu.Screen.Season);
        }

        /// <summary>The results' way on: the season screen in a Championship, else the next circuit.</summary>
        void ResultsGo()
        {
            if (season != null) FinishRound();
            else LoadCircuit(circuitIndex + 1);
        }

        // ---- the Time Trial ----

        sealed class TrialState
        {
            public GhostRecorder Rec = new GhostRecorder();
            public double? LapStart;
            public int Sector;
            public QualiLap Lap = new QualiLap();
            /// <summary>this session's best lap, and your record lap here (the ghost you chase, kept on the device)</summary>
            public Ghost Best, Record;
        }

        TrialState trial;
        CarView ghostView;

        /// <summary>your records' id here in this weather (race.ts recordId): the circuit's, with ':weather' after it unless dry</summary>
        string RecordId => Records.IdOf(circuit.id, WeatherLooks.Name(weatherChoice).ToLowerInvariant());

        /// <summary>your records on every circuit (the save's records section, as the web game keeps it)</summary>
        static Records LoadRecords() => Records.From(Save.Get("records", "circuits"));
        static void SaveRecords(Records r) => Save.Set("records", "circuits", r.ToValue());

        // (the splits' colours as COLOURS says: purple, green, amber, or colour-safe blue, white, orange and in words too)
        static Color SplitRecord => Options.SplitColor(SplitMark.Record);
        static Color SplitBetter => Options.SplitColor(SplitMark.Better);
        static Color SplitWorse => Options.SplitColor(SplitMark.Worse);
        static Color SplitColor(SplitMark m) => Options.SplitColor(m);
        static string Signed(double d) => $"{(d < 0 ? "-" : "+")}{System.Math.Abs(d):0.00}";

        /// <summary>A Time Trial: you on your own, on the run-up to your first flying lap, your record lap's ghost to chase.</summary>
        void StartTrial()
        {
            session = Session.Trial;
            race = Qualifying.NewQualifying(track, grid, difficulty.Handling(), SessionWeather);
            Ghost record = null;
            try { record = Ghost.Parse(Save.Get("ghosts", RecordId)); } catch { }
            trial = new TrialState { Record = record };
            // (the medals' laps are shares of it)
            reference ??= Qualifying.ReferenceLap(track, grid, difficulty.Handling(), SessionWeather);
            Begin(new List<int> { weekend.YouDriver });
            drivenMode = StatsMode;
            NoteStart();
            Notice(record != null ? $"TIME TRIAL · BEAT {Results.FormatTime(record.Time)}" : "TIME TRIAL", TrackView.Hex(0xf2c14e), 3);
        }

        /// <summary>A Time Trial step (fresh tyres every lap): the lap's verdict at the line, its splits, its frames for a ghost.</summary>
        void StepTrial(List<RaceEvent> events)
        {
            if (trial == null) return;
            var me = Me;
            var p = me.Progress;
            me.Tyres.Wear = 0;
            Tyres.FitTyres(me.Tyres, me.Car, race.Wetness);
            bool cut = events.Any(e => (e.Kind == RaceEventKind.TrackLimits || e.Kind == RaceEventKind.OffTrack) && e.Who == you);
            var verdict = Qualifying.JudgeLap(trial.Lap, p, cut, out double time);
            if (p.LapStart != trial.LapStart)
            {
                // over the line: the lap before is over (as the verdict says), and the next is timed
                var done = trial.Rec;
                trial.Rec = new GhostRecorder();
                trial.LapStart = p.LapStart;
                trial.Sector = 0;
                if (verdict == QualiCall.Time) TrialLapDone(done.ToGhost(time));
                else if (verdict == QualiCall.Void) Notice("LAP DELETED · GO AGAIN", TrackView.Hex(0xf2c14e), 2);
                else Notice("FLYING LAP", TrackView.Hex(0x5fe0d0), 1.5);
            }
            if (verdict == QualiCall.Deleted) Notice("LAP DELETED · TRACK LIMITS", TrackView.Hex(0xd8323c), 3);
            if (p.LapStart == null) return;
            double t = race.Clock - p.LapStart.Value;
            // a sector's split, against the session's best lap and your record
            if (p.Sector > trial.Sector)
            {
                trial.Sector = p.Sector;
                trial.Rec.Splits.Add(t);
                if (!trial.Lap.Deleted)
                {
                    int k = p.Sector - 1;
                    var mark = Splits.Mark(t, k, trial.Best ?? trial.Record, trial.Record, out var delta);
                    Notice($"S{k + 1} {Results.FormatTime(t)}{(delta.HasValue ? " · " + Signed(delta.Value) : "")}{Options.SplitWord(mark)}", SplitColor(mark), 2);
                }
            }
            trial.Rec.Frame(t, me.Car, p.Idx);
        }

        /// <summary>A lap done: a new record (kept, and the ghost from now on), the session's best, or neither.</summary>
        void TrialLapDone(Ghost g)
        {
            var record = trial.Record;
            var best = trial.Best;
            // (a lap, and a Time Trial lap, towards the day's missions; and it counts as having played today)
            Play(new PlayEvent { Kind = PlayKind.Lap });
            Play(new PlayEvent { Kind = PlayKind.TrialLap, Record = record != null && g.Time < record.Time });
            PlayedToday();
            if (record == null || g.Time < record.Time)
            {
                trial.Record = g;
                Save.Set("ghosts", RecordId, g.ToJson());
                Notice($"NEW RECORD {Results.FormatTime(g.Time)}{(record != null ? " · " + Signed(g.Time - record.Time) : "")}", SplitRecord, 3);
                sounds?.Record();
                // (on to the circuit's world board, as a record lap of qualifying's is)
                string weather = Boards.WeatherOf(weatherChoice);
                if (weather != null && Backend.Online)
                {
                    LapBoards.Queue(circuit.id, weather, g.Time);
                    if (Profile.Initials != null) LapBoards.Send(Profile.Initials, _ => { });
                }
            }
            else if (best == null || g.Time < best.Time) Notice($"BEST LAP {Results.FormatTime(g.Time)} · {Signed(g.Time - record.Time)}", SplitBetter, 3);
            else Notice($"LAP {Results.FormatTime(g.Time)} · {Signed(g.Time - best.Time)}", SplitWorse, 3);
            if (best == null || g.Time < best.Time) trial.Best = g;
            // a medal here, better than the one you had
            TrialMedal(g);
        }

        /// <summary>The ghost: your record lap from the line, where it was as far into its lap as you are into yours.</summary>
        void DrawGhost(float alpha)
        {
            var p = race != null && trial != null && session == Session.Trial && replay == null ? Me.Progress : null;
            var at = p != null && p.LapStart.HasValue && trial.Record != null ? trial.Record.Pose(race.Clock - p.LapStart.Value - (1 - alpha) * FixedClock.SimDt) : null;
            if (at == null)
            {
                if (ghostView != null && ghostView.Root.activeSelf) ghostView.Root.SetActive(false);
                return;
            }
            if (ghostView == null)
            {
                ghostView = new CarView(new Livery { Body = TrackView.Hex(0xf4f4f8), Trim = TrackView.Hex(0x9d9ab8), Helmet = TrackView.Hex(0xf4f4f8) });
                ghostView.Root.name = "Ghost";
                ghostView.Root.transform.SetParent(transform, false);
            }
            if (!ghostView.Root.activeSelf) ghostView.Root.SetActive(true);
            var (x, y, h) = at.Value;
            ghostView.Root.transform.SetPositionAndRotation(Units.ToWorld(x, y, Sim.GroundAt(Bridge.GridFor(track, grid, Racing.NearestSample(track, x, y)), x, y).H), Quaternion.Euler(0, Units.Yaw(h), 0));
        }

        /// <summary>The strip at the top in a Time Trial: the lap you're on, your best this session and your record.</summary>
        string TrialStrip()
        {
            var p = Me.Progress;
            string lap = p.LapStart == null ? "OUT LAP" : trial.Lap.Deleted ? "LAP DELETED" : $"LAP {p.LapTimes.Count + 1}";
            string best = trial.Best != null ? $"   BEST {Results.FormatTime(trial.Best.Time)}" : "";
            return $"TIME TRIAL   {lap}{best}";
        }
    }
}
