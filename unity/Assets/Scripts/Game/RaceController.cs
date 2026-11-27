// A race on one circuit: you and the AI field, lights to flag, with the web game's race rules (CornerCutters.Core's
// RaceControl, checked bit for bit against the web game's own races): rivals in their team liveries, contact, pit
// stops for tyres and repairs, the safety car and the virtual one, track limits and penalties, blue flags, the
// cool-down lap and home to the garages. A weekend is qualifying first (one flying lap on your own: Core.Qualifying;
// the AI's times off a reference lap; the grid they make, as a table), then the race from that grid, then the results
// at the flag (Core.Results), live as the others finish. The weather is picked (F: dry, damp, wet or changeable) and
// the race runs to its forecast, the rain falling, the track darkening and the cars throwing up spray as it wets.
// This class wires input, the fixed-step clock, the views and the HUD (the timing tower, your place, the race's
// calls). Restart replays the session; a new circuit, or a new weather, draws a new weekend.
// Before the lights the camera walks down the grid naming each car (GridPan); a big crash throws the car's nose and a
// wheel or two clear (DebrisView), sets it smoking or alight (CarFx, Particles), and a moment later plays again slowed
// through the impact; after your flag your finish plays again, then the top three spray champagne in parc fermé
// (Ceremony), then the results. Enter or A skips the grid walk, a replay or the ceremony.
using System.Collections.Generic;
using System.Linq;
using CornerCutters.Core;
using UnityEngine;
using Grid = CornerCutters.Core.Grid;

namespace CornerCutters.Game
{
    public sealed class RaceController : MonoBehaviour
    {
        /// <summary>the web game's race length (src/f1/laps.ts RACE_LAPS: a SPRINT)</summary>
        const int Laps = 5;

        readonly FixedClock clock = new FixedClock();
        GameInput input;
        ChaseCamera chase;
        GameObject circuitView;
        StartLights lights;
        StandView stands;
        HudView hud;
        /// <summary>the best lap ever on this circuit (PlayerPrefs)</summary>
        double record = double.NaN;
        CircuitData circuit;
        Grid grid;
        Track track;
        PitLane pit;
        bool paused;
        SceneryMovers movers;
        ScenePlanes planes;
        CritterView critters;
        int circuitIndex;
        IReadOnlyList<string> ids;
        double bestLap = double.NaN;

        enum Session { Qualifying, QualiOver, Race }

        // the weekend: its seed (restart replays it), the field drawn from it, its weather, the session on now
        uint seed;
        Session session;
        WeatherChoice weatherChoice = WeatherChoice.Dry;
        ForecastPlan forecast;
        WeatherView weatherView;
        Camera cam;
        /// <summary>the driver (an index into weekend.Drivers) in each entrant's place: qualifying just you; the race the grid</summary>
        List<int> driverOf = new List<int>();
        // qualifying: your lap, whether you're on it, the AI's reference lap (once a weekend), its times and grid
        QualiLap qualiLap;
        bool flying;
        double? reference;
        double?[] qualiTimes;
        List<int> qualiGrid;
        bool newQualiRecord;
        HudView.QualiTable qualiTable;
        // the race: its fastest lap, the laps seen of each car, your flag, the results
        (double time, int who)? fastest;
        int[] lapsSeen = new int[0];
        double? flagAt;
        bool newLapRecord;
        HudView.ResultsTable results;
        float tableUp;

        // the picture's own: the puffs, the debris, each car's smoke and fire, last frame's health (for sparks)
        Particles particles;
        DebrisView debris;
        readonly List<CarFx> fx = new List<CarFx>();
        double[] healthWas = new double[0];
        StepEvents[] lastEvents = new StepEvents[0];
        double[] landed = new double[0];
        // the replays: every car recorded; the one playing (its race time now, its end, the moment it's of, the car followed)
        ReplayRecorder recorder;
        sealed class Playing { public double T, To, At; public bool Crash; public int Follow; }
        Playing replay;
        (double at, int who)? crashDue;
        double lastCrashReplay;
        bool replayed;
        // the grid walk (s in, and its length), and the ceremony (its top three and s in)
        double? panT;
        double panLength;
        float zoom = 1;
        Ceremony ceremony;
        List<int> podiumTop;
        float podiumT;
        float blur = 1.2f;
        readonly Team team = Field.Teams[0];
        readonly Difficulty difficulty = Field.Normal;
        Weekend weekend;
        Race race;
        int you;
        GapTimer gaps;
        readonly List<CarView> views = new List<CarView>();
        readonly List<Compound> viewTyres = new List<Compound>();
        SafetyCarView safetyCar;
        // a call of the race's on the screen (SAFETY CAR, a penalty, your pit stop...), till a race time
        string notice;
        Color noticeColor;
        double noticeUntil;
        double sinceStart;

        /// <summary>each car's last two simulation poses (the safety car last), for drawing between steps</summary>
        Pose[] was = new Pose[0], now = new Pose[0];
        struct Pose { public double X, Y, Z, H; }

        void Start()
        {
            input = new GameInput();
            input.Enable();
            var camGo = new GameObject("Camera");
            camGo.transform.SetParent(transform, false);
            var cam = camGo.AddComponent<Camera>();
            camGo.AddComponent<TiltShiftEffect>();
            camGo.tag = "MainCamera";
            camGo.AddComponent<AudioListener>();
            chase = new ChaseCamera(cam);
            this.cam = cam;
            weatherView = new WeatherView();
            particles = new Particles(220);
            ceremony = new Ceremony(transform);
            weatherChoice = (WeatherChoice)Mathf.Clamp(PlayerPrefs.GetInt("weather", 0), 0, 3);
            safetyCar = new SafetyCarView();
            safetyCar.Root.transform.SetParent(transform, false);
            safetyCar.Root.SetActive(false);
            ids = CircuitLoader.Ids();
            circuitIndex = Mathf.Max(0, new List<string>(ids).IndexOf(PlayerPrefs.GetString("circuit", "crescent-park")));
            LoadCircuit(circuitIndex);
        }

        void OnDestroy() => input?.Disable();

        void LoadCircuit(int index)
        {
            circuitIndex = ((index % ids.Count) + ids.Count) % ids.Count;
            if (circuitView != null) Destroy(circuitView);
            circuit = CircuitLoader.Load(ids[circuitIndex]);
            PlayerPrefs.SetString("circuit", circuit.id);
            grid = circuit.ToGrid();
            track = circuit.ToTrack();
            pit = circuit.ToPitLane();
            // the web game's own scenery, baked (BakedScenery: towns, buildings, trees, stands, pits, barriers...); without it,
            // the hand-built stand-ins
            bool baked = BakedScenery.Has(circuit.id);
            circuitView = TrackView.Build(circuit, barriers: !baked);
            circuitView.transform.SetParent(transform, false);
            movers = baked ? BakedScenery.Build(circuitView, circuit) : null;
            planes = baked ? ScenePlanes.Load(circuit.id) : null;
            critters = baked ? CritterView.Load(circuit) : null;
            if (!baked)
            {
                SceneryView.Build(circuitView, circuit);
                PitView.Build(circuitView, circuit);
            }
            stands = StandView.Build(circuitView, circuit, structure: !baked);
            lights = new StartLights(circuitView.transform, circuit);
            debris?.Clear();
            debris = new DebrisView(transform, grid);
            hud = new HudView(circuit);
            record = PlayerPrefs.HasKey("rec." + circuit.id) ? PlayerPrefs.GetFloat("rec." + circuit.id) : double.NaN;
            bestLap = double.NaN;
            weatherView.Forget();
            NewWeekend();
        }

        /// <summary>A new weekend here: a new seed (new rivals, a new grid), its weather's forecast, and qualifying.</summary>
        void NewWeekend()
        {
            seed = (uint)Random.Range(1, int.MaxValue);
            weekend = Field.DrawWeekend(seed, circuit.slots.Length, team, difficulty);
            // (a changeable weekend's forecast timed to the race: its laps at a typical pace)
            double raceSeconds = Laps * track.Length / 300;
            forecast = weatherChoice == WeatherChoice.Changeable ? Forecast.Changeable(seed, raceSeconds) : Forecast.Fixed(WeatherLooks.Fixed(weatherChoice));
            reference = null;
            // (a bigger pool of puffs in the wet, and on dirt: every car throws up spray, or mud)
            particles.Resize(weatherChoice != WeatherChoice.Dry || track.Dirt ? 220 : 90);
            StartQualifying();
        }

        /// <summary>The weather for a session on your own (it doesn't change there): the race's at the start.</summary>
        Weather SessionWeather => Forecast.ConditionOf(forecast.Start);

        /// <summary>The session again: qualifying from the run-up, or the race from the same grid.</summary>
        void Restart()
        {
            if (session == Session.Race) StartRace(driverOf);
            else StartQualifying();
        }

        /// <summary>Qualifying: you on your own, on the run-up to a flying lap.</summary>
        void StartQualifying()
        {
            session = Session.Qualifying;
            race = Qualifying.NewQualifying(track, grid, difficulty.Handling(), SessionWeather);
            qualiLap = new QualiLap();
            flying = false;
            qualiTable = null;
            Begin(new List<int> { weekend.YouDriver });
            Notice("QUALIFYING · ONE FLYING LAP", TrackView.Hex(0xf2c14e), 3);
        }

        /// <summary>Qualifying's over: your time (none if you wrecked) against the AI's, the grid they make, up until A.</summary>
        void EndQualifying(double? time)
        {
            reference ??= Qualifying.ReferenceLap(track, grid, difficulty.Handling(), SessionWeather);
            qualiTimes = Qualifying.AiTimes(weekend.Drivers.Select(d => d.Ai == null ? (double?)null : d.Ai.Pace).ToList(), reference.Value, new SeededRandom(seed + 1));
            qualiTimes[weekend.YouDriver] = time;
            newQualiRecord = false;
            string key = "quali." + circuit.id + "." + WeatherLooks.Name(weatherChoice);
            double best = PlayerPrefs.HasKey(key) ? PlayerPrefs.GetFloat(key) : double.NaN;
            if (time.HasValue && (double.IsNaN(best) || time.Value < best)) { best = time.Value; newQualiRecord = true; PlayerPrefs.SetFloat(key, (float)best); }
            qualiGrid = Qualifying.GridOrder(qualiTimes);
            var rows = Results.QualifyingRows(qualiGrid, qualiTimes, weekend.Drivers.Select((d, k) => DriverName(k)).ToList(), weekend.Drivers.Select(d => d.Team.Code).ToList(), weekend.YouDriver);
            int place = rows.First(r => r.You).Place;
            qualiTable = new HudView.QualiTable
            {
                Title = $"QUALIFYING · {difficulty.Name} · {WeatherLooks.Name(weatherChoice)}", Rows = rows,
                Start = place == 1 ? "POLE POSITION!" : $"YOU START P{place}",
                Note = $"QUALIFYING RECORD {Results.FormatTime(double.IsNaN(best) ? (double?)null : best)}", NoteNew = newQualiRecord,
            };
            session = Session.QualiOver;
            tableUp = 0;
        }

        string DriverName(int k) => k == weekend.YouDriver ? "YOU" : weekend.Drivers[k].Code;

        /// <summary>The race from the lights: the drivers in `slots` order on the grid (null: as drawn, you mid-grid).</summary>
        void StartRace(List<int> slots)
        {
            session = Session.Race;
            slots ??= Enumerable.Range(0, weekend.Drivers.Count).ToList();
            var field = new List<FieldEntry>();
            for (int i = 0; i < slots.Count; i++)
            {
                var slot = circuit.slots[i];
                var d = weekend.Drivers[slots[i]];
                field.Add(new FieldEntry { Car = new Car(CarClass.F1(), slot.x, slot.y, slot.heading), Ai = d.Ai, Box = d.Box });
            }
            race = RaceControl.NewRace(track, grid, difficulty.Handling(), Laps, field, weekend.LightsOut, pit, Weather.Dry, forecast);
            fastest = null;
            flagAt = null;
            newLapRecord = false;
            results = null;
            Begin(new List<int>(slots));
            lapsSeen = new int[race.Entrants.Count];
            // the grid walk first (Enter or A skips it; GRID WALK off in the settings: straight to the lights)
            if (PlayerPrefs.GetInt("gridWalk", 1) != 0)
            {
                panT = 0;
                panLength = GridPan.LengthOf(slots.Count);
            }
        }

        /// <summary>A session's cars on the screen, `drivers` in the entrants' places, and a clean slate for the rest.</summary>
        void Begin(List<int> drivers)
        {
            driverOf = drivers;
            you = drivers.IndexOf(weekend.YouDriver);
            foreach (var e in race.Entrants) e.Car.Z = Sim.GroundAt(grid, e.Car.X, e.Car.Y).H;
            gaps = new GapTimer(race.Entrants.Count);
            foreach (var v in views) Destroy(v.Root);
            views.Clear();
            viewTyres.Clear();
            for (int k = 0; k < race.Entrants.Count; k++) AddView(k);
            was = new Pose[race.Entrants.Count + 1];
            now = new Pose[race.Entrants.Count + 1];
            for (int k = 0; k < race.Entrants.Count; k++) was[k] = now[k] = PoseOf(race.Entrants[k].Car);
            notice = null;
            sinceStart = 0;
            paused = false;
            particles.Clear();
            debris.Clear();
            fx.Clear();
            for (int k = 0; k < race.Entrants.Count; k++) fx.Add(new CarFx());
            healthWas = race.Entrants.Select(e => e.Car.Health).ToArray();
            lastEvents = new StepEvents[race.Entrants.Count];
            landed = new double[race.Entrants.Count];
            recorder = new ReplayRecorder(race.Entrants.Count + 1);
            replay = null;
            crashDue = null;
            lastCrashReplay = double.NegativeInfinity;
            replayed = false;
            panT = null;
            podiumTop = null;
            ceremony.Show(false);
            clock.Carry = 0;
            input.ResetWheel();
            chase.Snap();
        }

        /// <summary>Entrant k's car, in its team's livery, on the tyres it's on (built again when they change).</summary>
        void AddView(int k)
        {
            var d = weekend.Drivers[driverOf[k]];
            var tyres = race.Entrants[k].Tyres.Compound;
            var view = new CarView(Livery.FromTeam(d.Team, d.Seat), Tyres.Color(tyres));
            view.Root.transform.SetParent(transform, false);
            if (k < views.Count)
            {
                Destroy(views[k].Root);
                views[k] = view;
                viewTyres[k] = tyres;
            }
            else
            {
                views.Add(view);
                viewTyres.Add(tyres);
            }
        }

        static Pose PoseOf(Car c) => new Pose { X = c.X, Y = c.Y, Z = c.Z, H = c.Heading };

        Entrant Me => race.Entrants[you];

        void Update()
        {
            input.Poll();
            if (input.PausePressed) paused = !paused;
            if (input.RestartPressed) Restart();
            if (input.CircuitStep != 0) LoadCircuit(circuitIndex + input.CircuitStep);
            if (input.WeatherPressed) NextWeather();
            if (input.AcceptPressed && !paused)
            {
                if (session == Session.QualiOver) StartRace(qualiGrid);
                else if (panT.HasValue) panT = null;
                else if (replay != null) EndReplay();
                else if (podiumTop != null && results == null) podiumT = Ceremony.Len;
                else if (results != null) LoadCircuit(circuitIndex + 1);
            }
            if (input.CameraPressed) chase.Cycle();

            float frame = Time.unscaledDeltaTime;
            if (!paused)
            {
                if (session == Session.Race) Watching(frame);
                // (during the grid walk and a replay nothing moves: the race holds)
                if (panT.HasValue || replay != null) Draw(1, frame);
                else
                {
                    clock.Advance(frame, out int steps, out double alpha);
                    for (int k = 0; k < landed.Length; k++) landed[k] = 0;
                    for (int i = 0; i < steps; i++) Step();
                    alpha = System.Math.Min(1, clock.Carry / clock.Step);
                    Draw(alpha, frame);
                }
            }
            else
            {
                Draw(1, frame);
            }
            if (session == Session.Race) UpdateResults();
            if (qualiTable != null || results != null) tableUp += frame;
        }

        /// <summary>
        /// What the race holds for: the grid walk till it's down the grid; a few seconds after your flag your finish
        /// again; a moment after a big crash, the seconds round it; and once your finish has played, the ceremony.
        /// </summary>
        void Watching(float frame)
        {
            if (panT.HasValue)
            {
                panT += frame;
                if (panT >= panLength) panT = null;
            }
            var mine = Me.Progress;
            if (replay == null && !replayed && mine.Finished.HasValue && race.Clock >= mine.Finished.Value + ReplayRecorder.StartAt && podiumTop == null && results == null)
            {
                var w = recorder.FinishWindow(mine.Finished.Value);
                replay = new Playing { T = w.from, To = w.to, At = mine.Finished.Value, Follow = you };
            }
            if (replay == null && crashDue.HasValue && race.Clock >= crashDue.Value.at + CrashReplay.Delay)
            {
                var w = recorder.CrashWindow(crashDue.Value.at);
                replay = new Playing { T = w.from, To = w.to, At = crashDue.Value.at, Crash = true, Follow = crashDue.Value.who };
                crashDue = null;
            }
            if (replay != null)
            {
                replay.T += frame * (replay.Crash ? CrashReplay.SpeedAt(replay.T, replay.At) : ReplayRecorder.FinishSpeed(replay.T, replay.At));
                if (replay.T >= replay.To) EndReplay();
            }
            if (podiumTop == null && mine.Finished.HasValue && replayed && results == null) StartCeremony();
            if (podiumTop != null && results == null) podiumT += frame;
        }

        /// <summary>The replay over (or skipped): back to the race, live (after your flag, the ceremony follows).</summary>
        void EndReplay()
        {
            if (replay != null && !replay.Crash) replayed = true;
            replay = null;
            debris.Back();
        }

        /// <summary>The ceremony: the race finished at once (the rest at their pace, everyone put in their garage), and the top three on the podium.</summary>
        void StartCeremony()
        {
            podiumTop = RaceControl.SkipToParked(race).Take(3).ToList();
            podiumT = 0;
            var top = new List<(CarView, Team, bool)>();
            foreach (int i in podiumTop)
            {
                var d = weekend.Drivers[driverOf[i]];
                var car = new CarView(Livery.FromTeam(d.Team, d.Seat), Tyres.Color(race.Entrants[i].Tyres.Compound), helmet: false);
                top.Add((car, d.Team, i == you));
            }
            ceremony.SetDrivers(top);
        }

        bool OnSet => podiumTop != null && results == null;

        /// <summary>The next weather (dry, damp, wet, changeable), remembered, and a new weekend in it.</summary>
        void NextWeather()
        {
            weatherChoice = (WeatherChoice)(((int)weatherChoice + 1) % 4);
            PlayerPrefs.SetInt("weather", (int)weatherChoice);
            NewWeekend();
        }

        /// <summary>After your flag (4 s on) or, if you're out, once the rest are home: the results, live as the others finish.</summary>
        void UpdateResults()
        {
            var p = Me.Progress;
            if (p.Finished.HasValue && flagAt == null) flagAt = sinceStart;
            bool show = results != null || (podiumTop != null && podiumT >= Ceremony.Len) || (!p.Finished.HasValue && p.Retired && RaceControl.Settled(race));
            if (!show) return;
            if (results == null) tableUp = 0;
            var order = RaceControl.Order(race);
            var names = driverOf.Select(DriverName).ToList();
            var teams = driverOf.Select(k => weekend.Drivers[k].Team.Code).ToList();
            var rows = Results.ResultRows(race, order, names, teams, you, fastest?.who);
            results = new HudView.ResultsTable
            {
                Title = $"CHEQUERED FLAG · {difficulty.Name} · {WeatherLooks.Name(weatherChoice)}", Rows = rows, Summary = Results.RaceSummary(rows),
                Notes = new List<(string, bool)> { ($"LAP RECORD {Results.FormatTime(double.IsNaN(record) ? (double?)null : record)}", newLapRecord) },
            };
        }

        void Step()
        {
            double dt = FixedClock.SimDt;
            sinceStart += dt;
            for (int k = 0; k < now.Length; k++) was[k] = now[k];
            // (the wheel read every step, held or not, so its smoothing runs on through the lights)
            var wheel = input.Wheel(dt);
            int lapsBefore = Me.Progress.Lap;
            bool scWasOut = race.Sc != null;
            // (qualifying over: your car rolls to a stop while the table's up)
            if (session == Session.QualiOver) wheel = new Racing.WheelPad();
            var result = RaceControl.StepRace(race, dt, e => Racing.WheelInput(wheel, e.Car));
            if (race.Phase == RacePhase.Racing) gaps.Step(race.Entrants.Select(e => e.Progress).ToList(), track, race.Clock);
            // your laps: the best this weekend, and (race laps only: qualifying keeps its own) the circuit's record
            if (Me.Progress.Lap > lapsBefore && Me.Progress.LapTimes.Count > 0)
            {
                double t = Me.Progress.LapTimes[Me.Progress.LapTimes.Count - 1];
                if (session != Session.QualiOver && (double.IsNaN(bestLap) || t < bestLap)) bestLap = t;
                if (session == Session.Race && (double.IsNaN(record) || t < record)) { record = t; newLapRecord = true; PlayerPrefs.SetFloat("rec." + circuit.id, (float)t); }
            }
            for (int k = 0; k < result.Cars.Length && k < landed.Length; k++)
            {
                lastEvents[k] = result.Cars[k];
                landed[k] = System.Math.Max(landed[k], result.Cars[k].Landed);
            }
            foreach (var ev in result.Race) Call(ev);
            if (session == Session.Race) Record();
            if (session == Session.Qualifying) JudgeQualifying(result.Race);
            if (session == Session.Race) FastestLap();
            for (int k = 0; k < race.Entrants.Count; k++) now[k] = PoseOf(race.Entrants[k].Car);
            int sc = race.Entrants.Count;
            if (race.Sc != null)
            {
                // (just out: drawn where it joins, not swept there from the last place it was)
                now[sc] = PoseOf(race.Sc.Car);
                if (!scWasOut) was[sc] = now[sc];
            }
        }

        /// <summary>Every car on the track (and the safety car) for the replays, as it is now.</summary>
        void Record()
        {
            var cars = new ReplayPose?[race.Entrants.Count + 1];
            for (int i = 0; i < race.Entrants.Count; i++)
            {
                var e = race.Entrants[i];
                if (e.Progress.Retired || (e.Pit != null && e.Pit.Phase == PitPhase.Garage)) continue;
                cars[i] = new ReplayPose { X = e.Car.X, Y = e.Car.Y, Z = e.Car.Z, Heading = e.Car.Heading, Condition = Driving.Condition(e.Car) };
            }
            if (race.Sc != null) cars[race.Entrants.Count] = new ReplayPose { X = race.Sc.Car.X, Y = race.Sc.Car.Y, Z = race.Sc.Car.Z, Heading = race.Sc.Car.Heading };
            recorder.Record(race.Clock, cars);
        }

        /// <summary>A big crash: replayed in a moment (in a race, before your flag); the nose torn off, and on a wreck a wheel or two.</summary>
        void Crashed(RaceEvent ev)
        {
            var them = race.Entrants[ev.Who].Car;
            if (session == Session.Race && !Me.Progress.Finished.HasValue && crashDue == null
                && CrashReplay.Wants(ev.Who == you, ev.Wrecked, ev.Hit, RaceControl.BigHit, JsMath.Hypot(them.X - Me.Car.X, them.Y - Me.Car.Y), race.Clock, lastCrashReplay))
            {
                crashDue = (race.Clock, ev.Who);
                lastCrashReplay = race.Clock;
            }
            var view = views[ev.Who];
            double power = ev.Wrecked ? 1 : System.Math.Min(1, ev.Hit * 1.5);
            debris.Tear(view, view.Nose, race.Clock, ev.Vx, ev.Vy, power);
            if (ev.Wrecked)
            {
                int first = Random.Range(0, 4);
                var lost = Random.value < 0.5f ? new[] { first } : new[] { first, (first + 1 + Random.Range(0, 3)) % 4 };
                foreach (int k in lost) debris.Tear(view, view.Wheels[k], race.Clock, ev.Vx, ev.Vy, power, onItsSide: true);
            }
        }

        /// <summary>Qualifying this step: a cut (track limits, or all four wheels off anywhere) deletes the lap you're on; a good lap, or a wreck, ends it.</summary>
        void JudgeQualifying(List<RaceEvent> events)
        {
            bool cut = events.Any(e => (e.Kind == RaceEventKind.TrackLimits || e.Kind == RaceEventKind.OffTrack) && e.Who == you);
            var verdict = Qualifying.JudgeLap(qualiLap, Me.Progress, cut, out double time);
            if (verdict == QualiCall.Deleted) Notice("LAP DELETED · TRACK LIMITS", TrackView.Hex(0xd8323c), 3);
            else if (verdict == QualiCall.Void) Notice("FLYING LAP · GO AGAIN", TrackView.Hex(0xf2c14e), 2);
            else if (verdict == QualiCall.Time) EndQualifying(time);
            else if (Me.Car.Wrecked) EndQualifying(null);
            else if (!flying && Me.Progress.LapStart.HasValue)
            {
                // over the line from the run-up: the clock's running
                flying = true;
                Notice("FLYING LAP", TrackView.Hex(0x5fe0d0), 1.5);
            }
        }

        /// <summary>The race's fastest lap: announced as it falls (not the first lap anyone completes), purple in the results.</summary>
        void FastestLap()
        {
            for (int i = 0; i < race.Entrants.Count; i++)
            {
                var times = race.Entrants[i].Progress.LapTimes;
                if (times.Count <= lapsSeen[i]) continue;
                double lap = times[times.Count - 1];
                lapsSeen[i] = times.Count;
                if (fastest.HasValue && lap >= fastest.Value.time) continue;
                bool first = fastest == null;
                fastest = (lap, i);
                if (!first && sinceStart >= noticeUntil) Notice($"FASTEST LAP · {DriverName(driverOf[i])} {Results.FormatTime(lap)}", TrackView.Hex(0xb36bff), 2.5);
            }
        }

        /// <summary>The race's calls, as the web game's banner makes them: for the whole field, and for you.</summary>
        void Call(RaceEvent ev)
        {
            var gold = TrackView.Hex(0xf2c14e);
            var red = TrackView.Hex(0xd8323c);
            var ink = TrackView.Hex(0xf4f2fa);
            var blue = TrackView.Hex(0x4fa3ff);
            bool mine = ev.Who == you;
            switch (ev.Kind)
            {
                case RaceEventKind.SafetyCar: Notice("SAFETY CAR", gold, 4); break;
                case RaceEventKind.Vsc: Notice("VIRTUAL SAFETY CAR", gold, 4); break;
                case RaceEventKind.VscEnding: Notice("VSC ENDING", gold, 3); break;
                case RaceEventKind.Green: Notice("GREEN FLAG", TrackView.Hex(0x3ccf4e), 3); break;
                case RaceEventKind.Penalty when mine: Notice($"+{ev.Seconds:0}S PENALTY · NO OVERTAKING", red, 4); break;
                case RaceEventKind.TrackLimits when mine:
                    Notice(ev.Seconds > 0 ? $"TRACK LIMITS · +{ev.Seconds:0}S" : $"TRACK LIMITS · WARNING {ev.Strike}", ev.Seconds > 0 ? red : gold, 3);
                    break;
                case RaceEventKind.Blue when mine: Notice("BLUE FLAG · LET THEM BY", blue, 3); break;
                case RaceEventKind.PitStop when mine: Notice($"PIT STOP · {ev.Seconds:0.0}S · {Tyres.Name(Me.Tyres.Compound)}", ink, 3); break;
                case RaceEventKind.Wreck when mine: Notice("WRECKED", red, 4); break;
                case RaceEventKind.Crash: Crashed(ev); break;
                case RaceEventKind.PitRepaired: debris.Refit(views[ev.Who], race.Clock); break;
                case RaceEventKind.Retired when !mine: Notice($"{DriverName(driverOf[ev.Who])} OUT", ink, 3); break;
                case RaceEventKind.Rain: Notice(ev.On ? "RAIN · THE TRACK IS GETTING WET" : "THE RAIN HAS STOPPED · THE TRACK WILL DRY", TrackView.Hex(0x8fb8e8), 2.5); break;
                case RaceEventKind.TrackCondition when sinceStart >= noticeUntil:
                    Notice($"TRACK {ev.Condition.ToString().ToUpperInvariant()} · {Tyres.Name(Tyres.TyreFor(Tyres.WetnessOf(ev.Condition), track.Dirt))}", TrackView.Hex(0x8fb8e8), 2);
                    break;
            }
        }

        void Notice(string text, Color color, double seconds)
        {
            notice = text;
            noticeColor = color;
            noticeUntil = sinceStart + seconds;
        }

        Pose Between(int k, double alpha)
        {
            var a = was[k];
            var b = now[k];
            return new Pose { X = a.X + (b.X - a.X) * alpha, Y = a.Y + (b.Y - a.Y) * alpha, Z = a.Z + (b.Z - a.Z) * alpha, H = a.H + Driving.AngleDiff(b.H, a.H) * alpha };
        }

        void Draw(double alpha, float frame)
        {
            float dt = paused ? 0 : frame;
            // the ceremony: its set alone (far off the circuit), its own shot, no tilt-shift
            ceremony.Show(OnSet);
            var post = cam.GetComponent<TiltShiftEffect>();
            if (post != null) post.Amount = OnSet ? 0 : blur;
            if (OnSet)
            {
                ceremony.Aim(podiumT, cam);
                ceremony.Update(podiumT, dt, cam);
                return;
            }
            lights.Show(race.Phase == RacePhase.Lights ? StartLights.LitAt(race.Clock + RaceControl.Lights) : 0);
            bool replaying = replay != null;
            bool spray = weatherView.Look.Spray, muddy = track.Dirt && !spray;
            for (int k = 0; k < race.Entrants.Count; k++)
            {
                var e = race.Entrants[k];
                var view = views[k];
                if (viewTyres[k] != e.Tyres.Compound) { AddView(k); view = views[k]; }
                double x, y, z, h;
                Quaternion turn;
                CarCondition condition;
                if (replaying)
                {
                    // (in the replay, where it was then, as it was then: whole before its crash)
                    var then = recorder.Pose(k, replay.T);
                    if (view.Root.activeSelf != then.HasValue) view.Root.SetActive(then.HasValue);
                    if (then == null) continue;
                    x = then.Value.X; y = then.Value.Y; z = then.Value.Z; h = then.Value.Heading;
                    turn = Quaternion.Euler(0, Units.Yaw(h), 0);
                    condition = then.Value.Condition;
                }
                else
                {
                    // (a wreck cleared off by the marshals is gone)
                    bool shown = !e.Progress.Retired;
                    if (view.Root.activeSelf != shown) view.Root.SetActive(shown);
                    if (!shown) continue;
                    var p = Between(k, alpha);
                    x = p.X; y = p.Y; z = p.Z; h = p.H;
                    turn = Units.Rotation(e.Car, Bridge.GridFor(track, grid, e.Progress.Idx), p.H);
                    condition = Driving.Condition(e.Car);
                }
                view.Root.transform.SetPositionAndRotation(Units.ToWorld(x, y, z), turn);
                double speed = Driving.SpeedOf(e.Car);
                var ev = lastEvents[k];
                float dust = !replaying && ev.OnRough && speed > 25 ? (float)System.Math.Min(1, speed / 120) : 0;
                fx[k].Update(dt, condition, particles, view, (float)x, (float)y, (float)z, dust);
                if (replaying || dt == 0) continue;
                // sparks: off a hit (a wall, another car), thrown back the way it was going, and off a hard landing
                double lost = healthWas[k] - e.Car.Health;
                healthWas[k] = e.Car.Health;
                float bx = speed > 1 ? (float)(-e.Car.Vx / speed) : 0, by = speed > 1 ? (float)(-e.Car.Vy / speed) : 0;
                if (lost > 0.5) particles.Sparks((float)x, (float)y, (float)z, System.Math.Min(14, 4 + (int)System.Math.Round(lost)), bx * 0.6f, by * 0.6f);
                if (landed[k] > 160) particles.Sparks((float)x, (float)y, (float)z, 6);
                // on dirt, mud flung up behind it at speed (and more while it slides)
                if (muddy && !ev.Airborne && speed > 50 && Random.value < dt * (12 * System.Math.Min(1, speed / 250) + (ev.Skidding ? 16 : 0)))
                    particles.Mud((float)(x - JsMath.Sin(h) * 15), (float)(y + JsMath.Cos(h) * 15), (float)z);
            }
            if (replaying) debris.Replay(replay.T); else debris.Update(race.Clock);
            // the safety car (in the replay, if it was out then)
            var scThen = replaying ? recorder.Pose(race.Entrants.Count, replay.T) : null;
            bool scOut = replaying ? scThen.HasValue : race.Sc != null;
            if (safetyCar.Root.activeSelf != scOut) safetyCar.Root.SetActive(scOut);
            if (scOut)
            {
                if (replaying) safetyCar.Root.transform.SetPositionAndRotation(Units.ToWorld(scThen.Value.X, scThen.Value.Y, scThen.Value.Z), Quaternion.Euler(0, Units.Yaw(scThen.Value.Heading), 0));
                else
                {
                    var p = Between(race.Entrants.Count, alpha);
                    safetyCar.Root.transform.SetPositionAndRotation(Units.ToWorld(p.X, p.Y, p.Z), Units.Rotation(race.Sc.Car, grid, p.H));
                }
                safetyCar.Step(frame);
            }
            weatherView.Show(race.Wetness, race.Rain, cam);
            if (!paused && !replaying) weatherView.Spray(race.Entrants, race.Rain, frame, particles);
            particles.Step(dt, cam);
            var me = Between(you, alpha);
            var car = Me.Car;
            // (the crowds sway on while paused, as the web game's: frame is 0 then only if the clock stops)
            if (stands != null) stands.Step(frame, me.X, me.Y);
            movers?.Step(frame);
            planes?.Step(frame, me.X, me.Y, car.Vx, car.Vy);
            critters?.Step(frame, me.X, me.Y, car.Vx, car.Vy);
            // the camera: down the grid (closer in), on the car a replay follows as it was, or on yours
            zoom += ((panT.HasValue ? (float)GridPan.Zoom : 1) - zoom) * (1 - Mathf.Exp(-frame * 4));
            chase.Zoom = zoom;
            var followed = replaying ? recorder.Pose(replay.Follow, replay.T) : null;
            if (panT.HasValue)
            {
                var at = GridPan.At(circuit.slots.Take(race.Entrants.Count).Select(q => q.x).ToList(), circuit.slots.Take(race.Entrants.Count).Select(q => q.y).ToList(), panT.Value);
                chase.Follow(Units.ToWorld(at.x, at.y, Sim.GroundAt(grid, at.x, at.y).H * 0.5), 0, 0, Vector3.zero, frame);
            }
            else if (followed.HasValue)
            {
                var f = followed.Value;
                // (looking ahead along its way, as the web game's replay does)
                var ahead = new Vector3((float)(JsMath.Sin(f.Heading) * 2.5 * 0.6), 0, (float)(JsMath.Cos(f.Heading) * 2.5 * 0.6));
                chase.Follow(Units.ToWorld(f.X, f.Y, f.Z), Units.Yaw(f.Heading), 0, ahead, frame);
            }
            else
            {
                var pos = Units.ToWorld(me.X, me.Y, me.Z);
                float speed01 = Mathf.Clamp01((float)(Driving.SpeedOf(car) / car.Cls.TopSpeed));
                // look a little ahead of where the car is going (the web game's lead: about 40 px at full speed)
                var lead = new Vector3((float)(car.Vx / car.Cls.TopSpeed * 2.5), 0, (float)(-car.Vy / car.Cls.TopSpeed * 2.5));
                chase.Follow(pos, Units.Yaw(me.H), speed01, lead, frame);
            }
        }

        // ---- the HUD (HudView: the web game's, in its pixel font) ----

        /// <summary>The timing tower's rows (race.ts drawTower): the top three, then the cars round you.</summary>
        List<HudView.TowerRow> TowerRows(List<int> order)
        {
            int n = track.Count;
            int lead = order[0];
            double Along(int i) => (double)race.Entrants[i].Progress.Lap * n + race.Entrants[i].Progress.Idx;
            var rows = new List<HudView.TowerRow>();
            foreach (int i in Tower.Rows(order, you))
            {
                if (i < 0) { rows.Add(new HudView.TowerRow { Gap = null }); continue; }
                var e = race.Entrants[i];
                var d = weekend.Drivers[driverOf[i]];
                int place = order.IndexOf(i) + 1;
                string gap = e.Progress.Retired ? "OUT" : e.Pit != null ? "PIT" : e.Blue != null ? "BLUE"
                    : Tower.Gap(place, gaps.Between(lead, i), System.Math.Max(0, (int)System.Math.Floor((Along(lead) - Along(i)) / n)));
                rows.Add(new HudView.TowerRow
                {
                    Place = place, Body = TrackView.Hex(d.Team.Body), Trim = TrackView.Hex(d.Team.Trim), Name = DriverName(driverOf[i]), Gap = gap,
                    You = i == you, Out = e.Progress.Retired, Blue = e.Blue != null,
                });
            }
            return rows;
        }

        /// <summary>The grid walk's banner: the car the camera's on, by grid place, name and team (you in gold).</summary>
        string PanBanner(out Color color)
        {
            color = TrackView.Hex(0xf4f4f8);
            if (!panT.HasValue) return null;
            int k = GridPan.At(circuit.slots.Take(race.Entrants.Count).Select(q => q.x).ToList(), circuit.slots.Take(race.Entrants.Count).Select(q => q.y).ToList(), panT.Value).car;
            if (k == you) color = TrackView.Hex(0xf2c14e);
            return $"P{k + 1} {DriverName(driverOf[k])} · {weekend.Drivers[driverOf[k]].Team.Code}";
        }

        /// <summary>The ceremony's words: the circuit's name and GRAND PRIX on the wall, the boards' numbers, the name plates.</summary>
        void CeremonyWords()
        {
            Vector2 Screen2(Vector3 world)
            {
                var v = cam.WorldToScreenPoint(world);
                return new Vector2(v.x, Screen.height - v.y);
            }
            var words = new List<(Vector2, string, Color, float, bool)>();
            var winner = weekend.Drivers[driverOf[podiumTop[0]]].Team;
            var body = TrackView.Hex(winner.Body);
            var ink = 0.299f * body.r + 0.587f * body.g + 0.114f * body.b > 0.55f ? TrackView.Hex(0x1b1b26) : TrackView.Hex(0xf4f4f8);
            // (sized to the wall as it's seen: its half width on the screen)
            var top = Screen2(ceremony.WallTop);
            float half = Mathf.Abs(Screen2(ceremony.WallEdge).x - top.x) / (Screen.height / 720f);
            float px = Mathf.Clamp(half * 2 / Mathf.Max(8, circuit.name.Length) * 1.2f, 8, 40);
            words.Add((top - new Vector2(0, px * 0.9f * Screen.height / 720f), circuit.name.ToUpperInvariant(), ink, px, false));
            words.Add((top + new Vector2(0, px * 0.9f * Screen.height / 720f), "GRAND PRIX", ink, px, false));
            for (int k = 0; k < ceremony.Count; k++)
            {
                words.Add((Screen2(ceremony.Board(k)), $"{k + 1}", TrackView.Hex(0x1b1b26), Mathf.Clamp(half / 6, 8, 30), false));
                var at = Screen2(ceremony.Plate(k));
                if (at.x < Screen.width * 0.05f || at.x > Screen.width * 0.95f) continue;
                int i = podiumTop[k];
                words.Add((at, $"P{k + 1} {DriverName(driverOf[i])}", i == you ? TrackView.Hex(0xf2c14e) : TrackView.Hex(0xf4f4f8), 11, true));
            }
            hud.Words(words, "SKIP", input.Source);
        }

        void OnGUI()
        {
            if (race == null || hud == null) return;
            if (OnSet && !paused)
            {
                CeremonyWords();
                return;
            }
            var p = Me.Progress;
            bool racing = race.Phase == RacePhase.Racing;
            bool quali = session != Session.Race;
            bool finished = p.Finished.HasValue && session == Session.Race;
            var order = RaceControl.Order(race);
            double lapNow = p.LapStart.HasValue && racing && !finished ? race.Clock - p.LapStart.Value : double.NaN;
            string held = Me.Held.HasValue ? (race.Sc != null ? "SAFETY CAR" : "VSC") : null;
            var choice = hud.Draw(new HudView.State
            {
                LapTime = lapNow,
                Last = p.LapTimes.Count > 0 ? p.LapTimes[p.LapTimes.Count - 1] : double.NaN,
                Best = bestLap,
                Record = record,
                Health = Me.Car.Health / Me.Car.Cls.Health,
                Wrecked = Me.Car.Wrecked,
                Lap = System.Math.Min(Laps, p.Lap + 1),
                Laps = Laps,
                Lights = race.Phase == RacePhase.Lights,
                Lit = StartLights.LitAt(race.Clock + RaceControl.Lights),
                AllLit = race.Phase == RacePhase.Lights && race.Clock >= 0,
                SinceGo = racing && !quali ? race.Clock : double.NaN,
                WrongWay = p.WrongWay,
                Finished = finished,
                RaceTime = (p.Finished ?? 0) + p.Penalty,
                Paused = paused,
                CarX = now[you].X, CarY = now[you].Y,
                Source = input.Source,
                Team = team.Name.ToUpperInvariant(), Difficulty = difficulty.Name, Weather = forecast.Name,
                Place = order.IndexOf(you) + 1,
                Cars = order.Count,
                Tower = racing && !quali && !panT.HasValue ? TowerRows(order) : null,
                Strip = quali ? "QUALI   " + (p.LapStart == null ? "OUT LAP" : qualiLap.Deleted ? "LAP DELETED" : "FLYING LAP") : null,
                Rain = race.Rain,
                Quali = session == Session.Qualifying,
                WeatherChoice = WeatherLooks.Name(weatherChoice),
                Banner = PanBanner(out var bannerColor) ?? (replay != null && (Time.unscaledTime * 2 % 2) < 1.4f ? "REPLAY" : null),
                BannerColor = replay != null ? TrackView.Hex(0xd8323c) : bannerColor,
                Skip = panT.HasValue || replay != null ? "SKIP" : null,
                GridWalk = PlayerPrefs.GetInt("gridWalk", 1) != 0,
                Tyre = $"{Tyres.Short(Me.Tyres.Compound)} {System.Math.Round((1 - Me.Tyres.Wear) * 100):0}%",
                TyreColor = TrackView.Hex(Tyres.Color(Me.Tyres.Compound)),
                Notice = sinceStart < noticeUntil ? notice : held,
                NoticeColor = sinceStart < noticeUntil ? noticeColor : TrackView.Hex(0xf2c14e),
                Others = race.Entrants.Select((e, i) => (e, i)).Where(t => t.i != you && !t.e.Progress.Retired).Select(t => (t.e.Car.X, t.e.Car.Y)).ToList(),
            });
            if (choice == HudView.PauseChoice.Resume) paused = false;
            else if (choice == HudView.PauseChoice.Restart) Restart();
            else if (choice == HudView.PauseChoice.SkipQualifying) StartRace(null);
            else if (choice == HudView.PauseChoice.Weather) NextWeather();
            else if (choice == HudView.PauseChoice.GridWalk) PlayerPrefs.SetInt("gridWalk", PlayerPrefs.GetInt("gridWalk", 1) != 0 ? 0 : 1);
            else if (choice == HudView.PauseChoice.NextCircuit) LoadCircuit(circuitIndex + 1);
            if (paused) return;
            // qualifying's times, then the results at the flag
            if (session == Session.QualiOver && qualiTable != null)
            {
                if (hud.DrawQualifying(qualiTable, tableUp, input.Source) == HudView.TableChoice.Go) StartRace(qualiGrid);
            }
            else if (results != null)
            {
                var pick = hud.DrawResults(results, tableUp, input.Source);
                if (pick == HudView.TableChoice.Again) StartRace(driverOf);
                else if (pick == HudView.TableChoice.Go) LoadCircuit(circuitIndex + 1);
            }
        }
    }
}
