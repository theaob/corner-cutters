// Replays the web game's golden traces (golden.json, made by `npm run unity:golden`) through the C# core and checks
// it lands in the same place. Run: dotnet run (from this folder).
using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Text.Json;
using CornerCutters.Core;

static class Program
{
    static int failures, checks;

    static void Check(bool ok, string what)
    {
        checks++;
        if (!ok) { failures++; Console.WriteLine("FAIL  " + what); }
    }

    static void Near(double got, double want, double tol, string what)
    {
        // relative to the value's size, with an absolute floor: positions are in hundreds of px, speeds in hundreds of px/s
        Check(Math.Abs(got - want) <= tol * Math.Max(1, Math.Abs(want)), $"{what}: got {got:R}, want {want:R}");
    }

    static double D(JsonElement e, string k) => e.GetProperty(k).GetDouble();

    static int Main()
    {
        string root = FindRoot();
        var golden = JsonDocument.Parse(File.ReadAllText(Path.Combine(root, "Tests~/Core.Tests/golden.json"))).RootElement;
        string id = golden.GetProperty("circuit").GetString();
        var opts = new JsonSerializerOptions { IncludeFields = true };
        var circuit = JsonSerializer.Deserialize<CircuitData>(File.ReadAllText(Path.Combine(root, $"Assets/Resources/Circuits/{id}.json")), opts);
        var grid = circuit.ToGrid();
        var track = circuit.ToTrack();
        double dt = D(golden, "dt");
        var handling = HandlingParams.Race();

        Check(circuit.cells.Length == circuit.width * circuit.height, "cells length matches width*height");
        Check(circuit.heights.Length == (circuit.width + 1) * (circuit.height + 1), "heights length matches corners");

        foreach (var name in new[] { "lap", "crash" }) Replay(name, golden.GetProperty(name), circuit, grid, track, handling, dt);
        WheelMapping(golden.GetProperty("wheel"));
        GamepadMapping(golden.GetProperty("gamepad"));
        Smoother();
        Clock();
        MathBits(root);
        Critters(root);
        Petals(root);
        Seasons(root);
        MissionsAndLaunches(root);
        KeptRaces(root);
        TeamRadio(root);
        RaceSoundModels(root);
        SynthSounds();
        TouchControls(root);
        FeelChecks(root);
        TrophyChecks(root);
        SaveChecks(root);
        LangChecks(root);
        NightChecks(root);
        PaywallChecks(root);
        Races(root);
        QualifyingSessions(root);
        Fx(root);
        Net(root);
        DailyChallenge(root);
        PlayerRace(root);

        Console.WriteLine(failures == 0 ? $"OK  {checks} checks" : $"{failures} of {checks} checks FAILED");
        return failures == 0 ? 0 : 1;
    }

    /// <summary>JsMath's sin, cos, atan, atan2 and exp against V8's (math.json): the same bits.</summary>
    static void MathBits(string root)
    {
        var g = JsonDocument.Parse(File.ReadAllText(Path.Combine(root, "Tests~/Core.Tests/math.json"))).RootElement;
        int off = 0, n = 0;
        void One(string what, double got, double want, string args)
        {
            n++;
            if (BitConverter.DoubleToInt64Bits(got) == BitConverter.DoubleToInt64Bits(want) || (double.IsNaN(got) && double.IsNaN(want))) return;
            if (off++ < 5) Console.WriteLine($"FAIL  {what}({args}): got {got:R}, want {want:R}");
        }
        foreach (var r in g.GetProperty("sin").EnumerateArray()) One("sin", JsMath.Sin(r[0].GetDouble()), r[1].GetDouble(), r[0].ToString());
        foreach (var r in g.GetProperty("cos").EnumerateArray()) One("cos", JsMath.Cos(r[0].GetDouble()), r[1].GetDouble(), r[0].ToString());
        foreach (var r in g.GetProperty("atan").EnumerateArray()) One("atan", JsMath.Atan(r[0].GetDouble()), r[1].GetDouble(), r[0].ToString());
        foreach (var r in g.GetProperty("atan2").EnumerateArray()) One("atan2", JsMath.Atan2(r[0].GetDouble(), r[1].GetDouble()), r[2].GetDouble(), $"{r[0]}, {r[1]}");
        foreach (var r in g.GetProperty("exp").EnumerateArray()) One("exp", JsMath.Exp(r[0].GetDouble()), r[1].GetDouble(), r[0].ToString());
        int libm = 0;
        foreach (var r in g.GetProperty("sin").EnumerateArray()) if (Math.Sin(r[0].GetDouble()) != r[1].GetDouble()) libm++;
        Check(off == 0, $"JsMath gives V8's bits ({off} of {n} differ)");
        Console.WriteLine($"math: {n} values, {off} off (the platform's Math.Sin is off on {libm} of the sines)");
        checks += n;
    }

    /// <summary>A race as the Unity game runs it (RaceController): you in your slot on the wheel, the field drawn from a seed.
    /// You hold the gas and steer for the line ahead; the race must run to its end with the AI all home.</summary>
    static void PlayerRace(string root)
    {
        var opts = new JsonSerializerOptions { IncludeFields = true };
        var circuit = JsonSerializer.Deserialize<CircuitData>(File.ReadAllText(Path.Combine(root, "Assets/Resources/Circuits/crescent-park.json")), opts);
        var grid = circuit.ToGrid();
        var track = circuit.ToTrack();
        var w = Field.DrawWeekend(2024, circuit.slots.Length, Field.Teams[0], Field.Normal);
        var field = new List<FieldEntry>();
        for (int k = 0; k < w.Drivers.Count; k++)
            field.Add(new FieldEntry { Car = new Car(CarClass.F1(), circuit.slots[k].x, circuit.slots[k].y, circuit.slots[k].heading), Ai = w.Drivers[k].Ai, Box = w.Drivers[k].Box });
        var race = RaceControl.NewRace(track, grid, Field.Normal.Handling(), 3, field, w.LightsOut, circuit.ToPitLane());
        var gaps = new GapTimer(race.Entrants.Count);
        int steps = 0, calls = 0;
        DriveInput Player(Entrant e)
        {
            calls++;
            int idx = e.Progress.Idx, n = track.Count;
            int t = (idx + 8 + (int)(Driving.SpeedOf(e.Car) / 40)) % n;
            double want = Math.Atan2(track.X[t] - e.Car.X, -(track.Y[t] - e.Car.Y));
            double turn = Math.Max(-1, Math.Min(1, Driving.AngleDiff(want, e.Car.Heading) * 2.2));
            bool slow = Driving.SpeedOf(e.Car) > track.Speed[idx] * 0.85;
            return Racing.WheelInput(new Racing.WheelPad { Turn = turn, Gas = slow ? 0 : 1, Brake = slow ? 0.6 : 0 }, e.Car);
        }
        while (steps < 60 * 400 && !race.Entrants.All(e => e.Progress.Retired || e.InLap?.Parked == true))
        {
            RaceControl.StepRace(race, 1.0 / 60, Player);
            if (race.Phase == RacePhase.Racing) gaps.Step(race.Entrants.Select(e => e.Progress).ToList(), track, race.Clock);
            steps++;
        }
        var order = RaceControl.Order(race);
        int you = w.YouDriver;
        var rows = Tower.Rows(order, you);
        Check(calls > 0, "player race: your input asked for");
        Check(race.Entrants.Where((e, i) => i != you).All(e => e.Progress.Retired || e.Progress.Finished != null), "player race: the AI field all took the flag or retired");
        Check(rows.Contains(you), "player race: you're on the tower");
        Console.WriteLine($"player race: {steps / 60.0:F0} s, you P{order.IndexOf(you) + 1} of {order.Count}, laps {race.Entrants[you].Progress.Lap}, tower [{string.Join(" ", rows)}], gap to the leader {gaps.Between(order[0], you)?.ToString("0.0") ?? "-"} s");
    }

    /// <summary>Whole races (Core/RaceControl.cs, Field.cs) against the web game's (races.json): the same field from the same
    /// seed, every car's state every half second and every race event the same, lights to flag.</summary>
    static void Races(string root)
    {
        var g = JsonDocument.Parse(File.ReadAllText(Path.Combine(root, "Tests~/Core.Tests/races.json"))).RootElement;
        var opts = new JsonSerializerOptions { IncludeFields = true };
        double dt = D(g, "dt");
        foreach (var spec in g.GetProperty("races").EnumerateArray())
        {
            string id = spec.GetProperty("id").GetString();
            uint seed = (uint)spec.GetProperty("seed").GetInt64();
            int laps = spec.GetProperty("laps").GetInt32();
            string weather = spec.GetProperty("weather").GetString();
            var circuit = JsonSerializer.Deserialize<CircuitData>(File.ReadAllText(Path.Combine(root, $"Assets/Resources/Circuits/{id}.json")), opts);
            var grid = circuit.ToGrid();
            var track = circuit.ToTrack();
            var pit = circuit.ToPitLane();
            var level = Field.DifficultyById(spec.GetProperty("difficulty").GetString());
            var w = Field.DrawWeekend(seed, circuit.slots.Length, Field.Teams[0], level);
            var draw = spec.GetProperty("draw");
            int failedBefore = failures;
            Near(w.LightsOut, D(draw, "lightsOut"), 1e-12, $"{id}: lights out");
            int k0 = 0;
            foreach (var t in draw.GetProperty("teams").EnumerateArray()) { Check(w.Drivers[k0].Team.Id == t.GetString(), $"{id}: team {k0}"); k0++; }
            k0 = 0;
            foreach (var d in draw.GetProperty("drivers").EnumerateArray())
            {
                var ai = w.Drivers[k0].Ai;
                if (d.ValueKind == JsonValueKind.Null) Check(ai == null, $"{id}: driver {k0} is you");
                else
                {
                    Near(ai.Pace, D(d, "pace"), 1e-12, $"{id}: driver {k0} pace");
                    Near(ai.Craft ?? -1, D(d, "craft"), 1e-12, $"{id}: driver {k0} craft");
                    Near(ai.Mistakes, D(d, "mistakes"), 1e-12, $"{id}: driver {k0} mistakes");
                    Near(ai.Reaction, D(d, "reaction"), 1e-12, $"{id}: driver {k0} reaction");
                    Near(ai.Lane, D(d, "lane"), 0, $"{id}: driver {k0} lane");
                }
                k0++;
            }
            w.Drivers[w.YouDriver].Ai = new AiDriver { Lane = 0, Pace = 0.94 };
            var field = new List<FieldEntry>();
            for (int i = 0; i < w.Drivers.Count; i++)
                field.Add(new FieldEntry { Car = new Car(CarClass.F1(), circuit.slots[i].x, circuit.slots[i].y, circuit.slots[i].heading), Ai = w.Drivers[i].Ai, Box = w.Drivers[i].Box });
            Race race;
            if (weather == "changeable") race = RaceControl.NewRace(track, grid, level.Handling(), laps, field, w.LightsOut, pit, Weather.Dry, Forecast.Changeable(seed, laps * track.Length / 300));
            else race = RaceControl.NewRace(track, grid, level.Handling(), laps, field, w.LightsOut, pit, weather == "wet" ? Weather.Wet : weather == "damp" ? Weather.Damp : Weather.Dry);
            var practice = spec.GetProperty("practice");
            if (practice.ValueKind != JsonValueKind.Null)
            {
                Near(race.Practice.LapTime, D(practice, "lapTime"), 1e-9, $"{id}: practice lap");
                Near(race.Practice.PerLap, D(practice, "perLap"), 1e-9, $"{id}: practice wear");
            }
            var compounds = new[] { "slick", "hard", "inter", "wet", "dirt" };
            k0 = 0;
            foreach (var pl in spec.GetProperty("plans").EnumerateArray())
            {
                var mine = race.Entrants[k0].Plan;
                if (pl.ValueKind == JsonValueKind.Null) Check(mine == null, $"{id}: entrant {k0} has no plan");
                else if (mine == null) Check(false, $"{id}: entrant {k0} has a plan");
                else
                {
                    var stints = pl.GetProperty("stints");
                    Check(mine.Plan.Stints.Count == stints.GetArrayLength(), $"{id}: entrant {k0} stints");
                    int s0 = 0;
                    foreach (var st in stints.EnumerateArray())
                    {
                        if (s0 < mine.Plan.Stints.Count) Check(compounds[(int)mine.Plan.Stints[s0].Compound] == st[0].GetString() && mine.Plan.Stints[s0].Laps == st[1].GetDouble(), $"{id}: entrant {k0} stint {s0}");
                        s0++;
                    }
                    Check((mine.StopAt ?? -1) == pl.GetProperty("stopAt").GetInt32(), $"{id}: entrant {k0} stop lap");
                }
                k0++;
            }
            // the race, step by step: the states every 60 steps, the events every step
            var states = spec.GetProperty("states");
            var events = spec.GetProperty("events");
            int steps = spec.GetProperty("steps").GetInt32();
            var evIt = events.EnumerateArray().GetEnumerator();
            bool evMore = evIt.MoveNext();
            int stateK = 0, firstOff = -1;
            string offWhat = null;
            var kinds = new Dictionary<RaceEventKind, string>
            {
                [RaceEventKind.LightsOut] = "lights-out", [RaceEventKind.Crash] = "crash", [RaceEventKind.Wreck] = "wreck", [RaceEventKind.Retired] = "retired",
                [RaceEventKind.SafetyCar] = "safety-car", [RaceEventKind.Vsc] = "vsc", [RaceEventKind.VscEnding] = "vsc-ending", [RaceEventKind.Green] = "green",
                [RaceEventKind.Penalty] = "penalty", [RaceEventKind.PitIn] = "pit-in", [RaceEventKind.PitStop] = "pit-stop", [RaceEventKind.PitOut] = "pit-out",
                [RaceEventKind.PitRepaired] = "pit-repaired", [RaceEventKind.Mistake] = "mistake", [RaceEventKind.Blue] = "blue", [RaceEventKind.TrackLimits] = "track-limits",
                [RaceEventKind.OffTrack] = "off-track", [RaceEventKind.Rain] = "rain", [RaceEventKind.TrackCondition] = "track",
            };
            int evCount = 0, stateChecks = 0;
            for (int step = 1; step <= steps && firstOff < 0; step++)
            {
                var r = RaceControl.StepRace(race, dt);
                foreach (var ev in r.Race)
                {
                    if (ev.Kind == RaceEventKind.Contact) continue;
                    evCount++;
                    if (!evMore || evIt.Current[0].GetInt32() != step || evIt.Current[1].GetString() != kinds[ev.Kind] || evIt.Current[2].GetInt32() != ev.Who)
                    {
                        firstOff = step;
                        offWhat = $"event {kinds[ev.Kind]} {ev.Who}, want " + (evMore ? evIt.Current.ToString() : "none");
                        break;
                    }
                    evMore = evIt.MoveNext();
                }
                if (firstOff < 0 && evMore && evIt.Current[0].GetInt32() == step) { firstOff = step; offWhat = "missing event " + evIt.Current; }
                if (firstOff >= 0 || step % 60 != 0) continue;
                var want = states[stateK++];
                for (int i = 0; i < race.Entrants.Count && firstOff < 0; i++)
                {
                    var e = race.Entrants[i];
                    var p = e.Progress;
                    double[] got =
                    {
                        e.Car.X, e.Car.Y, e.Car.Heading, e.Car.Vx, e.Car.Vy, e.Car.Health, e.Car.Z, p.Lap, p.Idx, p.Penalty, p.Retired ? 1 : 0, p.Finished ?? -1,
                        e.Tyres.Wear, (int)e.Tyres.Compound, e.Stops, e.Pit == null ? -1 : (int)e.Pit.Phase,
                    };
                    var wi = want[i];
                    for (int c = 0; c < got.Length; c++)
                    {
                        stateChecks++;
                        double wv = wi[c].GetDouble();
                        if (BitConverter.DoubleToInt64Bits(got[c]) != BitConverter.DoubleToInt64Bits(wv) && got[c] != wv) { firstOff = step; offWhat = $"entrant {i} field {c}: got {got[c]:R}, want {wv:R}"; break; }
                    }
                }
            }
            Check(firstOff < 0, $"{id}: race matches the web game's to the flag" + (firstOff < 0 ? "" : $" (first off at step {firstOff} of {steps}, {firstOff * dt:F1} s: {offWhat})"));
            if (firstOff < 0) Check(!evMore, $"{id}: every event seen");
            if (firstOff < 0) ResultsOf(id, race, w, spec.GetProperty("results"));
            checks += stateChecks + evCount;
            Console.WriteLine($"race {id}: {(firstOff < 0 ? "matched" : $"off at {firstOff * dt:F1} s")}, {evCount} events, {stateChecks} state checks");
        }
    }

    /// <summary>A finished race's results (Core/Results.cs) against the web game's: the order, the rows, your summary.</summary>
    static void ResultsOf(string id, Race race, Weekend w, JsonElement want)
    {
        var names = w.Drivers.Select((d, k) => k == w.YouDriver ? "YOU" : d.Code).ToList();
        var teams = w.Drivers.Select(d => d.Team.Code).ToList();
        int? fastest = null;
        double best = double.PositiveInfinity;
        for (int i = 0; i < race.Entrants.Count; i++) foreach (double t in race.Entrants[i].Progress.LapTimes) if (t < best) { best = t; fastest = i; }
        var order = RaceControl.Order(race);
        Check(order.SequenceEqual(want.GetProperty("order").EnumerateArray().Select(x => x.GetInt32())), $"{id}: results order");
        Check((fastest ?? -1) == want.GetProperty("fastest").GetInt32(), $"{id}: fastest lap");
        var rows = Results.ResultRows(race, order, names, teams, w.YouDriver, fastest);
        int k = 0;
        foreach (var r in want.GetProperty("rows").EnumerateArray())
        {
            var g = rows[k++];
            string got = $"{g.Place}|{g.Moved}|{g.Name}|{g.Team}|{g.Time}|{g.Best}|{g.Fastest}|{g.Notes}|{g.Out}|{g.Finished}|{g.You}";
            string exp = $"{r.GetProperty("place")}|{r.GetProperty("moved")}|{r.GetProperty("name").GetString()}|{r.GetProperty("team").GetString()}|{r.GetProperty("time").GetString()}|"
                + $"{r.GetProperty("best").GetString()}|{r.GetProperty("fastest").GetBoolean()}|{r.GetProperty("notes").GetString()}|{r.GetProperty("out").GetBoolean()}|{r.GetProperty("finished").GetBoolean()}|{r.GetProperty("you").GetBoolean()}";
            Check(got == exp, $"{id}: result row {k}: got {got}, want {exp}");
        }
        var summary = Results.RaceSummary(rows);
        k = 0;
        foreach (var b in want.GetProperty("summary").EnumerateArray())
        {
            var g = summary[k++];
            string color = g.Color < 0 ? "" : "#" + g.Color.ToString("x6");
            Check(g.Icon == b[0].GetString() && g.Label == b[1].GetString() && g.Value == b[2].GetString() && color == b[3].GetString(),
                $"{id}: summary box {k}: got {g.Icon} {g.Label} {g.Value} {color}, want {b}");
        }
    }

    /// <summary>Qualifying (Core/Qualifying.cs) against the web game's (qualifying.json): the reference lap, the AI's
    /// times off it, the grid, its rows, and where a session starts.</summary>
    static void QualifyingSessions(string root)
    {
        var g = JsonDocument.Parse(File.ReadAllText(Path.Combine(root, "Tests~/Core.Tests/qualifying.json"))).RootElement;
        var opts = new JsonSerializerOptions { IncludeFields = true };
        foreach (var f in g.GetProperty("formats").EnumerateArray())
            Check(Results.FormatTime(f[0].GetDouble()) == f[1].GetString(), $"format {f[0]}: got {Results.FormatTime(f[0].GetDouble())}, want {f[1].GetString()}");
        foreach (var spec in g.GetProperty("sessions").EnumerateArray())
        {
            string id = spec.GetProperty("id").GetString();
            uint seed = (uint)spec.GetProperty("seed").GetInt64();
            string wid = spec.GetProperty("weather").GetString();
            var weather = wid == "wet" ? Weather.Wet : wid == "damp" ? Weather.Damp : Weather.Dry;
            var circuit = JsonSerializer.Deserialize<CircuitData>(File.ReadAllText(Path.Combine(root, $"Assets/Resources/Circuits/{id}.json")), opts);
            var grid = circuit.ToGrid();
            var track = circuit.ToTrack();
            var handling = Field.Normal.Handling();
            double reference = Qualifying.ReferenceLap(track, grid, handling, weather);
            Check(BitConverter.DoubleToInt64Bits(reference) == BitConverter.DoubleToInt64Bits(D(spec, "reference")), $"{id}: reference lap: got {reference:R}, want {D(spec, "reference"):R}");
            var w = Field.DrawWeekend(seed, circuit.slots.Length, Field.Teams[0], Field.Normal);
            var paces = w.Drivers.Select(d => d.Ai == null ? (double?)null : d.Ai.Pace).ToList();
            var times = Qualifying.AiTimes(paces, D(spec, "reference"), new SeededRandom(seed + 1));
            var you = spec.GetProperty("you");
            times[w.YouDriver] = you.ValueKind == JsonValueKind.Null ? (double?)null : you.GetDouble();
            int k = 0;
            foreach (var t in spec.GetProperty("times").EnumerateArray())
            {
                var mine = times[k++];
                Check(t.ValueKind == JsonValueKind.Null ? mine == null : mine != null && BitConverter.DoubleToInt64Bits(mine.Value) == BitConverter.DoubleToInt64Bits(t.GetDouble()), $"{id}: time {k - 1}");
            }
            var order = Qualifying.GridOrder(times);
            Check(order.SequenceEqual(spec.GetProperty("order").EnumerateArray().Select(x => x.GetInt32())), $"{id}: grid order");
            var rows = Results.QualifyingRows(order, times, w.Drivers.Select((d, i) => i == w.YouDriver ? "YOU" : d.Code).ToList(), w.Drivers.Select(d => d.Team.Code).ToList(), w.YouDriver);
            k = 0;
            foreach (var r in spec.GetProperty("rows").EnumerateArray())
            {
                var q = rows[k++];
                string got = $"{q.Place}|{q.Name}|{q.Team}|{q.Time}|{q.Gap}|{q.You}";
                string exp = $"{r.GetProperty("place")}|{r.GetProperty("name").GetString()}|{r.GetProperty("team").GetString()}|{r.GetProperty("time").GetString()}|{r.GetProperty("gap").GetString()}|{r.GetProperty("you").GetBoolean()}";
                Check(got == exp, $"{id}: qualifying row {k}: got {got}, want {exp}");
            }
            var session = Qualifying.NewQualifying(track, grid, handling, weather);
            var st = spec.GetProperty("start");
            var c = session.Entrants[0].Car;
            Check(c.X == D(st, "x") && c.Y == D(st, "y") && c.Heading == D(st, "heading") && session.Entrants[0].Progress.Idx == st.GetProperty("idx").GetInt32(), $"{id}: flying start");
            Console.WriteLine($"qualifying {id}: reference {reference:F3} s, pole {rows[0].Name} {rows[0].Time}");
        }
        foreach (var l in g.GetProperty("looks").EnumerateArray())
        {
            var a = WeatherLooks.At(l[0].GetDouble(), l[1].GetDouble());
            double[] got = { a.Sky.Background, a.Sky.Sky, a.Sky.Ground, a.Sky.Key, a.Sky.Ambient, a.Sky.KeyIntensity, a.GroundTint, a.Spray ? 1 : 0 };
            for (int c = 0; c < got.Length; c++) Check(got[c] == l[c + 2].GetDouble(), $"weather look {l[0]} {l[1]} field {c}: got {got[c]}, want {l[c + 2]}");
        }
        // judging the lap: a cut on the run-up doesn't count, one on the lap deletes it, the next is timed afresh
        var q2 = new QualiLap();
        var p2 = Racing.NewProgress(0);
        Check(Qualifying.JudgeLap(q2, p2, true, out _) == QualiCall.None, "a cut on the run-up doesn't count");
        p2.LapStart = 1;
        Check(Qualifying.JudgeLap(q2, p2, true, out _) == QualiCall.Deleted, "a cut on the lap deletes it");
        Check(Qualifying.JudgeLap(q2, p2, true, out _) == QualiCall.None, "deleted once");
        p2.LapTimes.Add(80);
        Check(Qualifying.JudgeLap(q2, p2, false, out _) == QualiCall.Void, "a deleted lap ends void");
        p2.LapTimes.Add(79);
        Check(Qualifying.JudgeLap(q2, p2, false, out double t2) == QualiCall.Time && t2 == 79, "a good lap is timed");
    }

    /// <summary>Championship seasons and Time Trial's split marks (Core/Championship.cs, Ghost.cs) against the web game's (season.json).</summary>
    /// <summary>The team radio (Core/Radio.cs) against the web game's radio.ts: its lines, a roll's pick, the finish line, the queue.</summary>
    static void TeamRadio(string root)
    {
        var g = JsonDocument.Parse(File.ReadAllText(Path.Combine(root, "Tests~/Core.Tests/radio.json"))).RootElement;
        var lines = g.GetProperty("lines").EnumerateObject().ToList();
        Check(lines.Count == Radio.Lines.Count, "radio: cues");
        foreach (var c in lines) Check(Radio.Lines.TryGetValue(c.Name, out var mine) && mine.SequenceEqual(c.Value.EnumerateArray().Select(x => x.GetString())), $"radio: {c.Name}'s lines");
        var r = g.GetProperty("radio");
        Check(Radio.Least == r.GetProperty("least").GetDouble() && Radio.PerChar == r.GetProperty("perChar").GetDouble() && Radio.Stale == r.GetProperty("stale").GetDouble(), "radio: timing");
        foreach (var p in g.GetProperty("picks").EnumerateArray()) Check(Radio.Line(p[0].GetString(), p[1].GetDouble()) == p[2].GetString(), $"radio: {p[0]} at {p[1]}");
        foreach (var f in g.GetProperty("finishes").EnumerateArray()) Check(Radio.FinishLine(f[0].GetInt32(), f[1].GetInt32(), f[2].GetDouble()) == f[3].GetString(), $"radio: finish P{f[0]} of {f[1]}: {Radio.FinishLine(f[0].GetInt32(), f[1].GetInt32(), f[2].GetDouble())}");
        var q = new RadioQueue();
        int k = 0;
        foreach (var s in g.GetProperty("queue").EnumerateArray())
        {
            if (s[0].ValueKind == JsonValueKind.String) q.Say(s[0].GetString());
            string up = q.Step(s[1].GetDouble());
            Check(up == (s[2].ValueKind == JsonValueKind.Null ? null : s[2].GetString()) && q.Now == (s[3].ValueKind == JsonValueKind.Null ? null : s[3].GetString()) && q.Waiting.Count == s[4].GetInt32(), $"radio queue step {k}");
            k++;
        }
        Console.WriteLine($"radio: {lines.Count} cues, {k} queue steps");
    }

    static bool Near(double a, double b, double eps = 1e-9) => Math.Abs(a - b) <= eps * Math.Max(1, Math.Abs(b));

    /// <summary>The sounds' models against the web game's: the engine note, the Doppler bend, the crowd, the engine's
    /// orders, the menu tune's notes, and a loop's tail folded back.</summary>
    static void RaceSoundModels(string root)
    {
        var g = JsonDocument.Parse(File.ReadAllText(Path.Combine(root, "Tests~/Core.Tests/sounds.json"))).RootElement;
        foreach (var n in g.GetProperty("notes").EnumerateArray())
        {
            var mine = EngineSound.Note(n[0].GetDouble(), n[1].GetDouble(), n[2].GetDouble());
            Check(Near(mine.freq, n[3].GetDouble()) && Near(mine.gain, n[4].GetDouble()) && Near(mine.brightness, n[5].GetDouble()) && mine.gear == n[6].GetInt32(), $"engine note at {n[0]} of {n[1]}, throttle {n[2]}");
        }
        foreach (var d in g.GetProperty("dopplers").EnumerateArray()) Check(Near(EngineSound.Doppler(d[0].GetDouble()), d[1].GetDouble()), $"doppler {d[0]}");
        var stands = g.GetProperty("stands").EnumerateArray().Select(st => (st.GetProperty("x").GetDouble(), st.GetProperty("y").GetDouble())).ToList();
        foreach (var p in g.GetProperty("near").EnumerateArray())
        {
            double near = Crowd.Near(stands, p[0].GetDouble(), p[1].GetDouble());
            Check(Near(near, p[2].GetDouble()) && Near(Crowd.Gain(near, p[3].GetDouble()), p[4].GetDouble()), $"crowd at {p[0]}, {p[1]}");
        }
        var c = g.GetProperty("crowd");
        Check(Crowd.Murmur == c.GetProperty("murmur").GetDouble() && Crowd.Cheer == c.GetProperty("cheer").GetDouble() && Crowd.Close == c.GetProperty("close").GetDouble()
            && Crowd.Reach == c.GetProperty("reach").GetDouble() && Crowd.Everywhere == c.GetProperty("everywhere").GetDouble() && Crowd.Fade == c.GetProperty("fade").GetDouble(), "crowd constants");
        Check(RaceSounds.LimiterBeep == g.GetProperty("limiterBeep").GetDouble(), "limiter beep");
        var orders = g.GetProperty("orders").EnumerateArray().Select(x => x.GetDouble()).ToArray();
        Check(orders.Length == EngineVoice.Orders.Length && orders.Zip(EngineVoice.Orders, (a, b) => Near(a, b)).All(x => x), "engine orders");
        var menu = g.GetProperty("menu");
        var song = Music.MenuSong();
        var notes = menu.GetProperty("notes").EnumerateArray().ToList();
        Check(song.Bpm == menu.GetProperty("bpm").GetDouble() && song.Bars == menu.GetProperty("bars").GetInt32() && notes.Count == song.Notes.Count, "menu song: bpm, bars, notes");
        for (int i = 0; i < Math.Min(notes.Count, song.Notes.Count); i++)
        {
            var n = notes[i];
            var m = song.Notes[i];
            Check(Near(m.At, n.GetProperty("at").GetDouble()) && Near(m.Len, n.GetProperty("len").GetDouble()) && m.Midi == n.GetProperty("midi").GetInt32()
                && m.Voice.ToString().ToLowerInvariant() == n.GetProperty("voice").GetString() && Near(m.Vel, n.GetProperty("vel").GetDouble()), $"menu note {i}");
        }
        var fold = Music.FoldTail(Enumerable.Range(0, 23).Select(i => (float)(i * 0.25 - 2)).ToArray(), 10);
        Check(fold.Zip(g.GetProperty("fold").EnumerateArray(), (a, b) => Near(a, b.GetDouble(), 1e-6)).All(x => x) && fold.Length == 10, "fold tail");
        Console.WriteLine($"sounds: {g.GetProperty("notes").GetArrayLength()} engine notes, {notes.Count} menu notes");
    }

    static (double peak, double rms, bool finite) Measure(float[] d)
    {
        double peak = 0, sum = 0;
        bool finite = true;
        foreach (float x in d)
        {
            if (float.IsNaN(x) || float.IsInfinity(x)) finite = false;
            peak = Math.Max(peak, Math.Abs(x));
            sum += x * x;
        }
        return (peak, Math.Sqrt(sum / Math.Max(1, d.Length)), finite);
    }

    /// <summary>The synth does what Web Audio would: silence when nothing plays, filters that pass and stop where they
    /// should, one-shots that end, voices that stop when told, the limiter in bounds, a pause that's silent.</summary>
    static void SynthSounds()
    {
        const int rate = 48000;
        var s = new Synth(rate, 0.7, seed: 3);
        Check(Measure(s.Render(4800)).peak == 0, "synth: silent with nothing playing");
        Shots.Beep(s, 1000, 0.15, 0.25);
        var beep = Measure(s.Render(rate / 10));
        Check(beep.finite && beep.peak > 0.05 && beep.peak <= 1, $"synth: a beep sounds ({beep.peak:0.000})");
        s.Render(rate / 5);
        Check(s.Count == 0 && Measure(s.Render(4800)).peak == 0, "synth: a beep ends");
        // filters (as Web Audio's): a 1 kHz lowpass passes 100 Hz and stops 10 kHz; a bandpass passes its middle
        double Through(Biquad f, double hz)
        {
            double peak = 0;
            for (int i = 0; i < rate; i++)
            {
                double y = f.Next(Math.Sin(2 * Math.PI * hz * i / rate));
                if (i > rate / 2) peak = Math.Max(peak, Math.Abs(y));
            }
            return peak;
        }
        Check(Math.Abs(Through(new Biquad(FilterKind.Lowpass, 1000, 0, rate), 100) - 1) < 0.02, "lowpass passes below");
        Check(Through(new Biquad(FilterKind.Lowpass, 1000, 0, rate), 10000) < 0.02, "lowpass stops above");
        Check(Through(new Biquad(FilterKind.Highpass, 1000, 0, rate), 100) < 0.02, "highpass stops below");
        Check(Math.Abs(Through(new Biquad(FilterKind.Bandpass, 1000, 2, rate), 1000) - 1) < 0.02 && Through(new Biquad(FilterKind.Bandpass, 1000, 2, rate), 8000) < 0.1, "bandpass passes its middle only");
        Check(Near(Limiter.Curve(-20), -20) && Near(Limiter.Curve(0), -10 + 10 / 8.0), "limiter curve");
        // the race's sounds: an engine through the gears, a rival, the crowd; all finite and in bounds; gone when disposed
        var rs = new RaceSounds(s, 0.5);
        double speed = 0;
        var all = new List<float>();
        for (int f = 0; f < 300; f++)
        {
            speed = f < 200 ? speed + 2.5 : speed - 6;
            rs.Update(new SoundFrame { Dt = 1 / 60.0, Speed = speed, Top = 500, Slide = f % 50 < 10 ? 150 : 0, OnRough = f % 70 < 5, OnKerb = f % 30 < 3, RivalSpeed = 400, RivalDistance = 100 + f, Tow = 0.5, Crowd = 0.7, Limiter = f > 280 });
            if (f == 10) rs.Cheer(0.9);
            if (f == 100) { rs.Hit(1); rs.Scrape(0.8); rs.Radio(); rs.Flag(); }
            all.AddRange(s.Render(rate / 60));
        }
        var race = Measure(all.ToArray());
        Check(race.finite && race.rms > 0.01 && race.peak <= 1, $"race sounds: finite, heard, in bounds (rms {race.rms:0.000}, peak {race.peak:0.000})");
        rs.Dispose();
        s.Render(rate);
        Check(s.Count == 0, "race sounds: every voice gone once disposed");
        // a pause: silent, its one-shots not played
        s.Paused = true;
        Shots.Beep(s, 800);
        Check(s.Count == 0 && Measure(s.Render(4800)).peak == 0, "synth: silent and still while paused");
        s.Paused = false;
        // the menu's placeholder: a loop of the song's length, peaking at 0.9
        var loop = Music.Render(Music.MenuSong(), 8000);
        var m = Measure(loop);
        Check(loop.Length == (int)Math.Round(Music.MenuSong().Seconds * 8000) && m.finite && Math.Abs(m.peak - 0.9) < 1e-4 && m.rms > 0.05, $"menu placeholder: {loop.Length} samples, peak {m.peak:0.000}, rms {m.rms:0.000}");
        Console.WriteLine($"synth: race rms {race.rms:0.000} peak {race.peak:0.000}; menu loop {Music.MenuSong().Seconds:0.0} s");
    }

    /// <summary>The touch deck against the web game's: the thumbstick, the floating stick, the slider, the deck's labels.</summary>
    /// <summary>JSON with its keys sorted, numbers as doubles: two documents the same whatever their keys' order.</summary>
    static string Canon(JsonElement e) => e.ValueKind switch
    {
        JsonValueKind.Object => "{" + string.Join(",", e.EnumerateObject().OrderBy(p => p.Name, StringComparer.Ordinal).Select(p => JsonSerializer.Serialize(p.Name) + ":" + Canon(p.Value))) + "}",
        JsonValueKind.Array => "[" + string.Join(",", e.EnumerateArray().Select(Canon)) + "]",
        JsonValueKind.Number => e.GetDouble().ToString("R", System.Globalization.CultureInfo.InvariantCulture),
        _ => e.GetRawText(),
    };
    static string Canon(string json) => json == null ? "null" : Canon(JsonDocument.Parse(json).RootElement);

    static void LangChecks(string root)
    {
        string dir = Path.Combine(root, "Assets/Resources/Lang");
        var index = (List<object>)Json.Parse(File.ReadAllText(Path.Combine(dir, "index.json")));
        Check(index.Count == 8 && ((Dictionary<string, object>)index[0])["code"] as string == "en", "languages: English first, and seven more");
        var langs = index.Skip(1).Select(o => Language.Parse(File.ReadAllText(Path.Combine(dir, ((Dictionary<string, object>)o)["code"] + ".json")))).ToList();
        var keys = langs[0].Words.Keys.ToHashSet();
        foreach (var l in langs)
        {
            Check(l != null && keys.All(l.Words.ContainsKey), $"language {l?.Code}: every line");
            // (a translation fills the same {name}s as its English)
            foreach (var kv in l.Words)
            {
                var want = System.Text.RegularExpressions.Regex.Matches(kv.Key, @"\{(\w+)\}").Select(m => m.Value).OrderBy(x => x).ToList();
                var got = System.Text.RegularExpressions.Regex.Matches(kv.Value, @"\{(\w+)\}").Select(m => m.Value).OrderBy(x => x).ToList();
                Check(want.SequenceEqual(got), $"language {l.Code}: {{names}} of {kv.Key}");
            }
        }
        // (Japanese is drawn in DotGothic16, cut down to what it needs: nothing it needs left out)
        var ja = langs.First(l => l.Code == "ja");
        var font = new HashSet<char>(File.ReadAllText(Path.Combine(root, "Assets/Resources/Fonts/DotGothic16.chars.txt")).Trim('\n'));
        var missing = new HashSet<char>(ja.Words.Values.SelectMany(v => v).Where(c => c > 0x2fff && c < 0xfff0 && !char.IsSurrogate(c) && !font.Contains(c)));
        Check(missing.Count == 0, $"Japanese font: has {string.Concat(missing)}");

        var tr = langs.First(l => l.Code == "tr");
        Lang.Use(tr);
        Check(Lang.T("SETTINGS") == tr.Words["SETTINGS"] && Lang.T("NO SUCH LINE") == "NO SUCH LINE", "lang: t()");
        Check(Lang.T("DAY {n}", "n", 4) == tr.Words["DAY {n}"].Replace("{n}", "4"), "lang: t() fills {n}");
        Check(Lang.Say("LAP 3/5") == tr.Words["LAP {lap}/{laps}"].Replace("{lap}", "3").Replace("{laps}", "5"), $"lang: a line with numbers ({Lang.Say("LAP 3/5")})");
        Check(Lang.Say("PIT") == "PIT" || tr.Words.ContainsKey("PIT"), "lang: P{place} wants a number");
        Check(Lang.Say("THE LANGUAGE OF THE MENUS") == Lang.Upper(tr.Words["the language of the menus"]), "lang: a lower-case line, in capitals");
        Check(Lang.Upper("istanbul") == "İSTANBUL", "lang: Turkish capitals");
        Check(Lang.Say("QUALIFYING · WET") == tr.Words["QUALIFYING"] + " · " + tr.Words["WET"], "lang: the parts of a line");
        Check(Lang.Say("LEC") == "LEC" && Lang.Say("1:12.34") == "1:12.34", "lang: a name or a time as it is");
        Lang.Use(null);
        Check(Lang.Say("SETTINGS") == "SETTINGS" && Lang.Upper("istanbul") == "ISTANBUL", "lang: English");
        var have = new[] { "en", "es", "tr", "ja" };
        Check(Lang.Pick("tr", new[] { "ja" }, have) == "tr" && Lang.Pick(null, new[] { "ja-JP" }, have) == "ja" && Lang.Pick("xx", new[] { "nl" }, have) == "en", "lang: the pick");
    }

    static void PaywallChecks(string root)
    {
        var g = JsonDocument.Parse(File.ReadAllText(Path.Combine(root, "Tests~/Core.Tests/paywall.json"))).RootElement;
        var ids = g.GetProperty("ids").EnumerateArray().Select(e => e.GetString()).ToList();
        var free = g.GetProperty("free").EnumerateArray().Select(e => e.GetString()).ToList();
        // (the circuits baked here in the web game's order, the free ones marked as its are)
        var order = JsonDocument.Parse(File.ReadAllText(Path.Combine(root, "Assets/Resources/Circuits/order.json"))).RootElement.GetProperty("ids").EnumerateArray().Select(e => e.GetString()).ToList();
        Check(order.SequenceEqual(ids), "paywall: the circuits in the web game's order");
        var index = JsonDocument.Parse(File.ReadAllText(Path.Combine(root, "Assets/Resources/Circuits/index.json"))).RootElement;
        var bakedFree = index.EnumerateArray().Where(e => e.TryGetProperty("free", out var f) && f.ValueKind == JsonValueKind.True).Select(e => e.GetProperty("id").GetString()).OrderBy(x => x).ToList();
        Check(bakedFree.SequenceEqual(free.OrderBy(x => x)), $"paywall: the free circuits ({string.Join(", ", bakedFree)})");
        foreach (var c in g.GetProperty("open").EnumerateArray())
        {
            List<string> L(string k) => c.GetProperty(k).EnumerateArray().Select(e => e.GetString()).ToList();
            var reached = Paywall.Reached(ids, L("unlocked"), L("records"), free);
            var open = Paywall.CircuitsOpen(c.GetProperty("owned").GetBoolean(), ids[0], reached, free);
            Check(reached.OrderBy(x => x, StringComparer.Ordinal).SequenceEqual(L("reached")) && open.OrderBy(x => x, StringComparer.Ordinal).SequenceEqual(L("open")), $"paywall: open with {string.Join(",", L("unlocked"))} / {string.Join(",", L("records"))}");
        }
        foreach (var gate in g.GetProperty("gates").EnumerateArray())
            Check(Paywall.ChampionshipOpen(gate[0].GetBoolean(), gate[1].GetBoolean()) == gate[2].GetBoolean(), "paywall: the Championship's gate");
        foreach (var r in g.GetProperty("reminders").EnumerateArray())
        {
            string day = r.GetProperty("day").GetString();
            var ch = Daily.On(day);
            var (title, body) = Reminders.Text(r.GetProperty("name").GetString(), r.GetProperty("weather").GetString(), r.GetProperty("streak").GetInt32());
            Check(ch.Circuit == r.GetProperty("circuit").GetString() && title == r.GetProperty("title").GetString() && body == r.GetProperty("body").GetString(), $"reminder {day}: {title} / {body}");
        }
        // the plan: a week ahead at 18:00, from tomorrow once today's played, an hour gone by left out
        var now = new DateTime(2026, 11, 27, 19, 0, 0, DateTimeKind.Local);
        var played = new Streak { Last = "2026-11-27", Days = 3, Best = 3 };
        var plan = Reminders.Plan(now, 18, played, id => id);
        Check(plan.Count == 6 && plan[0].Id == Reminders.FirstId + 1 && plan[0].At == new DateTime(2026, 11, 28, 18, 0, 0) && plan[0].Title.Contains("3-day"), $"reminders: the week planned ({plan.Count}, {(plan.Count > 0 ? plan[0].Title : "")})");
        var morning = Reminders.Plan(new DateTime(2026, 11, 27, 8, 0, 0, DateTimeKind.Local), 9, new Streak(), id => id);
        Check(morning.Count == 7 && morning[0].Id == Reminders.FirstId && morning[0].Title == "Today's Daily Challenge", "reminders: today's too, before its hour");
    }

    static void NightChecks(string root)
    {
        var g = JsonDocument.Parse(File.ReadAllText(Path.Combine(root, "Tests~/Core.Tests/night.json"))).RootElement;
        // (the look the game ships, a: floodlit; b and c were tried on the web with ?look=, and aren't shipped)
        var a = g.GetProperty("looks").GetProperty("a");
        Check(WeatherLooks.NightGlow == a.GetProperty("glow").GetProperty("color").GetInt32() && WeatherLooks.NightGlowIntensity == a.GetProperty("glow").GetProperty("intensity").GetDouble(), "night: the lamps' glow on the ground");
        Check(WeatherLooks.NightTown == Convert.ToInt32(a.GetProperty("town").GetProperty("town").GetString().Substring(1), 16), "night: the town beyond");
        Check(WeatherLooks.NightBloom == g.GetProperty("night").GetProperty("bloom").GetDouble(), "night: the bloom");
        void Same(SkyState n, JsonElement w, string what) => Check(n.Background == w.GetProperty("background").GetInt32() && n.Sky == w.GetProperty("sky").GetInt32() && n.Ground == w.GetProperty("ground").GetInt32()
            && n.Key == w.GetProperty("key").GetInt32() && Near(n.Ambient, w.GetProperty("ambient").GetDouble()) && Near(n.KeyIntensity, w.GetProperty("keyIntensity").GetDouble()), $"night sky: {what}");
        foreach (var s in g.GetProperty("skies").EnumerateArray())
            Same(WeatherLooks.Night(WeatherLooks.At(s[0].GetDouble(), s[1].GetDouble()).Sky), s[2], $"wetness {s[0]}, rain {s[1]}");
        var days = new Dictionary<string, SkyState> { ["dry"] = WeatherLooks.DrySky, ["damp"] = WeatherLooks.DampSky, ["wet"] = WeatherLooks.WetSky };
        foreach (var w in g.GetProperty("weathers").EnumerateArray()) Same(WeatherLooks.Night(days[w[0].GetString()]), w[1], w[0].GetString());
    }

    static void SaveChecks(string root)
    {
        var g = JsonDocument.Parse(File.ReadAllText(Path.Combine(root, "Tests~/Core.Tests/save.json"))).RootElement;
        Check(SaveDoc.Version == g.GetProperty("version").GetInt32(), "save: the version");
        foreach (var p in g.GetProperty("parsed").EnumerateArray())
        {
            var d = SaveDoc.Parse(p[0].GetString());
            Check(Canon(d?.Write()) == Canon(p[1]), $"save read: {p[0].GetString()}");
        }
        foreach (var m in g.GetProperty("migrated").EnumerateArray())
        {
            var d = SaveDoc.Parse(m[0].GetRawText()).Migrated();
            Check(Canon(d.Write()) == Canon(m[1]), $"save migrated: {m[0].GetRawText()}");
        }
        foreach (var r in g.GetProperty("records").EnumerateArray())
        {
            var raw = Json.Parse(r[0].GetRawText());
            var rec = Records.From(raw is Dictionary<string, object> o && o.TryGetValue("circuits", out var c) ? c : null);
            Check(Canon(Json.Write(rec.ToValue())) == Canon(r[1].GetProperty("circuits")), $"records read: {r[0].GetRawText()}");
        }
        var recs = Records.From(null);
        foreach (var op in g.GetProperty("ops").EnumerateArray())
        {
            string kind = op[0].GetString(), id = op[1].GetString();
            bool got = kind switch
            {
                "lap" => recs.Lap(id, op[2].GetDouble()),
                "qualifying" => recs.Qualifying(id, op[2].GetDouble()),
                "race" => recs.Race(id, op[2].GetInt32(), op[3].GetDouble()),
                _ => recs.Attack(id, op[2].GetInt32()),
            };
            Check(got == op[op.GetArrayLength() - 1].GetBoolean(), $"record noted: {op.GetRawText()}");
        }
        Check(Canon(Json.Write(recs.ToValue())) == Canon(g.GetProperty("final")), "records: after them all");
        // (written and read back: the same; the device's sections left out of a save moved, and kept over one moved here)
        var full = SaveDoc.Parse(g.GetProperty("parsed")[13][0].GetString());
        Check(Canon(SaveDoc.Parse(full.Write()).Write()) == Canon(full.Write()), "save: written and read back");
        var ex = full.ForExport();
        Check(!ex.Data.ContainsKey("device") && ex.Data.ContainsKey("trophies"), "save export: no device section");
        var here = new SaveDoc();
        here.Set("device", "uiScale", 1.4);
        var moved = here.Replaced(ex);
        Check(moved != null && moved.Get("device", "uiScale") is double u && u == 1.4 && moved.Get("choices", "circuit") as string == "maple-island", "save replaced: the device's own kept");
        Check(here.Replaced(new SaveDoc { At = SaveDoc.Version + 1 }) == null, "save replaced: not by a newer game's");
        Check(Records.IdOf("a", "dry") == "a" && Records.IdOf("a", "wet") == "a:wet", "records: ids");
        Check(full.Summary().Contains("BEST STREAK 9") && new SaveDoc().Summary() == "AN EMPTY SAVE", $"save summary: {full.Summary()}");
    }

    static void TrophyChecks(string root)
    {
        var g = JsonDocument.Parse(File.ReadAllText(Path.Combine(root, "Tests~/Core.Tests/trophies.json"))).RootElement;
        var title = g.GetProperty("title");
        Check(TitleWin.FireworksS * 1000 == title.GetProperty("fireworks").GetDouble() && TitleWin.HoldS * 1000 == title.GetProperty("hold").GetDouble(), "title card: its timings");
        foreach (var l in title.GetProperty("lines").EnumerateArray())
            Check(TitleWin.Line(l[0].GetInt32(), l[1].GetInt32(), l[2].GetInt32()) == l[3].GetString(), $"title card: {l[3].GetString()}");
        var sky = new TitleSky(1280, 720, 7);
        int most = 0, bits = 0;
        for (int i = 0; i < 600; i++) { sky.Step(1 / 60.0); most = Math.Max(most, sky.Sparks.Count); bits = Math.Max(bits, sky.Bits.Count); }
        // (and all gone by 10 s: the fireworks stop at 7, the last wave of confetti at 9.1)
        Check(most >= 36 && bits >= 90 && sky.Sparks.Count == 0 && sky.Bits.Count == 0, "title card: fireworks and confetti");
        for (int i = 0; i < 300; i++) sky.Step(1 / 60.0);
        Check(sky.Sparks.Count == 0 && sky.Bits.Count == 0, "title card: the sky clears");
        Medal M(JsonElement e) => e.ValueKind == JsonValueKind.Null ? Medal.None : Medals.FromId(e.GetString());
        foreach (var m in Medals.All)
        {
            Check(Medals.PaceOf(m) == g.GetProperty("pace").GetProperty(Medals.IdOf(m)).GetDouble(), $"medal pace {m}");
            Check(Medals.ColorOf(m) == Convert.ToInt32(g.GetProperty("colors").GetProperty(Medals.IdOf(m)).GetString().Substring(1), 16), $"medal colour {m}");
        }
        foreach (var l in g.GetProperty("laps").EnumerateArray())
        {
            double reference = l[0].GetDouble();
            Check(Near(Medals.LapTarget(reference, Medal.Bronze), l[1].GetDouble()) && Near(Medals.LapTarget(reference, Medal.Silver), l[2].GetDouble()) && Near(Medals.LapTarget(reference, Medal.Gold), l[3].GetDouble()), $"lap targets at {reference}");
            Check(Medals.LapMedal(l[4].GetDouble(), reference) == M(l[5]), $"lap medal {l[4]} of {reference}");
        }
        foreach (var a in g.GetProperty("attacks").EnumerateArray())
        {
            double generous = a.GetProperty("generous").GetDouble();
            var t = a.GetProperty("targets");
            Check(Medals.AttackTarget(Medal.Bronze, generous) == t[0].GetInt32() && Medals.AttackTarget(Medal.Silver, generous) == t[1].GetInt32() && Medals.AttackTarget(Medal.Gold, generous) == t[2].GetInt32(), $"attack targets at {generous}");
            int passed = 0;
            foreach (var m in a.GetProperty("medals").EnumerateArray()) { Check(Medals.AttackMedal(passed, generous) == M(m), $"attack medal {passed} at {generous}"); passed++; }
        }
        var ach = g.GetProperty("achievements");
        Check(ach.GetArrayLength() == Trophies.Achievements.Length, "achievements: as many");
        for (int i = 0; i < Trophies.Achievements.Length; i++)
        {
            var a = Trophies.Achievements[i];
            Check(a.Id == ach[i].GetProperty("id").GetString() && a.Name == ach[i].GetProperty("name").GetString() && a.About == ach[i].GetProperty("about").GetString(), $"achievement {a.Id}");
        }
        var tp = g.GetProperty("torpedo");
        Check(Trophies.TorpedoCircuit == tp.GetProperty("circuit").GetString() && Trophies.TorpedoWindow == tp.GetProperty("window").GetDouble() && Trophies.TorpedoCars == tp.GetProperty("cars").GetInt32(), "torpedo");
        Check(Trophies.RegularDays == g.GetProperty("streak").GetProperty("regular").GetInt32() && Trophies.DevotedDays == g.GetProperty("streak").GetProperty("devoted").GetInt32(), "streak achievements");
        int races = 0;
        foreach (var r in g.GetProperty("races").EnumerateArray())
        {
            var o = r[0];
            int? Opt(string k) => o.TryGetProperty(k, out var v) ? v.GetInt32() : (int?)null;
            var sum = new RaceSummary
            {
                Place = o.GetProperty("place").GetInt32(), Field = o.GetProperty("field").GetInt32(), Grid = o.GetProperty("grid").GetInt32(), Fastest = o.GetProperty("fastest").GetBoolean(),
                Damaged = o.GetProperty("damaged").GetBoolean(), Strikes = o.GetProperty("strikes").GetInt32(), Laps = o.GetProperty("laps").GetInt32(), Difficulty = o.GetProperty("difficulty").GetString(),
                Weather = o.GetProperty("weather").GetString(), TyresLeft = Opt("tyresLeft"), Burning = o.GetProperty("burning").GetBoolean(), Stops = Opt("stops"),
            };
            var want = r[1].EnumerateArray().Select(x => x.GetString()).ToList();
            Check(Trophies.RaceAchievements(sum).SequenceEqual(want), $"race achievements {races}");
            races++;
        }
        var circuits = g.GetProperty("circuits").EnumerateArray().Select(x => x.GetString()).ToList();
        foreach (var c in g.GetProperty("cabinets").EnumerateArray())
        {
            var t = Trophies.Parse(c[0].GetRawText());
            Check(t.MedalAchievements(circuits).SequenceEqual(c[1].EnumerateArray().Select(x => x.GetString())), $"medal achievements {c[0].GetRawText()}");
        }
        foreach (var p in g.GetProperty("parsed").EnumerateArray())
        {
            var t = Trophies.Parse(p[0].GetRawText());
            var w = p[1];
            bool ok = t.Titles == w.GetProperty("titles").GetInt32();
            var medals = w.GetProperty("medals");
            ok &= t.Medals.Count == medals.EnumerateObject().Count();
            foreach (var kv in medals.EnumerateObject())
                ok &= t.MedalOn(kv.Name, MedalKind.Trial) == (kv.Value.TryGetProperty("trial", out var tr) ? Medals.FromId(tr.GetString()) : Medal.None)
                    && t.MedalOn(kv.Name, MedalKind.Attack) == (kv.Value.TryGetProperty("attack", out var at) ? Medals.FromId(at.GetString()) : Medal.None);
            Check(ok, $"trophies parsed from {p[0].GetRawText()}");
            // (and back: what's written reads the same)
            var again = Trophies.Parse(t.Write());
            Check(again.Write() == t.Write(), "trophies written and read again");
        }
        // unlocking: once each, in the list's order
        var tt = new Trophies();
        Check(tt.Unlock(new[] { "win", "finish", "nonsense" }).Select(a => a.Id).SequenceEqual(new[] { "finish", "win" }) && tt.Unlock(new[] { "win" }).Count == 0, "achievements unlock once");
        Check(tt.Award("x", MedalKind.Trial, Medal.Silver) && !tt.Award("x", MedalKind.Trial, Medal.Bronze) && tt.Award("x", MedalKind.Trial, Medal.Gold) && tt.MedalOn("x", MedalKind.Attack) == Medal.None, "medals kept at their best");
        Console.WriteLine($"trophies: {races} races");
    }

    static void FeelChecks(string root)
    {
        var g = JsonDocument.Parse(File.ReadAllText(Path.Combine(root, "Tests~/Core.Tests/feel.json"))).RootElement;
        var sh = g.GetProperty("shake");
        Check(Shake.PerHealth == sh.GetProperty("perHealth").GetDouble() && Shake.HitFloor == sh.GetProperty("hitFloor").GetDouble() && Shake.Decay == sh.GetProperty("decay").GetDouble()
            && Shake.Most == sh.GetProperty("most").GetDouble() && Shake.BigHit == sh.GetProperty("bigHit").GetDouble() && Shake.HoldFor == sh.GetProperty("hold").GetDouble() && Shake.Crawl == sh.GetProperty("crawl").GetDouble(), "feel: shake constants");
        var ru = g.GetProperty("rumble");
        Check(Rumble.Wreck == ru.GetProperty("wreck").GetDouble() && Rumble.HitMost == ru.GetProperty("hitMost").GetDouble() && Rumble.RoughEvery == ru.GetProperty("roughEvery").GetDouble() && Rumble.KerbMs == ru.GetProperty("kerbMs").GetDouble(), "feel: rumble constants");
        var zo = g.GetProperty("zoomOut");
        Check(Shake.ZoomFrom == zo.GetProperty("from").GetDouble() && Shake.ZoomPullBack == zo.GetProperty("pullBack").GetDouble() && Shake.ZoomCalm == zo.GetProperty("calm").GetDouble(), "feel: zoom constants");
        int frames = 0;
        foreach (var run in g.GetProperty("runs").EnumerateArray())
        {
            var s = new ShakeState();
            var r = new RumbleState();
            foreach (var f in run.EnumerateArray())
            {
                var v = Enumerable.Range(0, 15).Select(i => f[i].GetDouble()).ToArray();
                var frame = new FeelFrame { Dt = v[0], Speed = v[1], TopSpeed = v[2], HealthLost = v[3], WreckedNow = v[4] != 0, Landed = v[5], OnRough = v[6] != 0, OnKerb = v[7] != 0 };
                double ms = Rumble.Step(r, frame);
                Shake.Step(s, frame);
                var o = Shake.Offset(s);
                Check(Near(ms, v[8]) && Near(s.Trauma, v[9]) && Near(s.T, v[10]) && Near(s.Hold, v[11]) && Near(o.X, v[12]) && Near(o.Y, v[13]) && Shake.TimeScale(s) == v[14], $"feel: frame {frames}");
                frames++;
            }
        }
        foreach (var z in g.GetProperty("zooms").EnumerateArray()) Check(Near(Shake.ZoomOf(z[0].GetDouble(), z[1].GetDouble()), z[2].GetDouble()), $"zoom at {z[0]}");
        var levels = g.GetProperty("levels");
        Check(levels.GetArrayLength() == QualityGovernor.Levels.Length, "quality: as many levels");
        for (int i = 0; i < QualityGovernor.Levels.Length; i++)
        {
            var l = levels[i];
            var q = QualityGovernor.Levels[i];
            Check(q.Name == l.GetProperty("name").GetString() && q.Res == l.GetProperty("res").GetInt32() && q.Bloom == l.GetProperty("bloom").GetBoolean() && q.Blur == l.GetProperty("blur").GetBoolean() && q.ShadowMap == l.GetProperty("shadowMap").GetInt32(), $"quality level {q.Name}");
        }
        var gp = g.GetProperty("governor");
        Check(QualityGovernor.SlowMs == gp.GetProperty("slowMs").GetDouble() && QualityGovernor.Patience == gp.GetProperty("patience").GetDouble() && QualityGovernor.Warmup == gp.GetProperty("warmup").GetDouble()
            && QualityGovernor.Judge == gp.GetProperty("judge").GetDouble() && QualityGovernor.Gain == gp.GetProperty("gain").GetDouble(), "quality: governor constants");
        int traces = 0;
        foreach (var t in g.GetProperty("governors").EnumerateArray())
        {
            var st = t.GetProperty("start");
            var gov = st.ValueKind == JsonValueKind.Null ? new QualityGovernor() : new QualityGovernor(st.GetProperty("level").GetInt32(), st.GetProperty("locked").GetBoolean());
            int k = 0;
            foreach (var f in t.GetProperty("trace").EnumerateArray())
            {
                int level = gov.Sample(f[0].GetDouble());
                Check(level == f[1].GetInt32() && gov.Locked == (f[2].GetInt32() != 0), $"governor trace {traces} frame {k}");
                k++;
            }
            traces++;
        }
        double now = g.GetProperty("now").GetDouble();
        foreach (var kq in g.GetProperty("kept").EnumerateArray())
        {
            bool ok = QualityGovernor.Kept(kq[0].GetInt32(), kq[1].GetInt32() != 0, kq[2].GetDouble(), kq[3].GetString(), now, "v1", out int lv, out bool lk);
            Check(ok ? lv == kq[4].GetInt32() && (lk ? 1 : 0) == kq[5].GetInt32() : kq[4].GetInt32() == -1, $"kept quality {kq[0]} at {kq[2]}");
        }
        var settings = new Dictionary<string, GraphicsSetting> { ["auto"] = GraphicsSetting.Auto, ["high"] = GraphicsSetting.High, ["low"] = GraphicsSetting.Low, ["saver"] = GraphicsSetting.Saver };
        foreach (var gs in g.GetProperty("graphics").EnumerateArray())
        {
            var set = settings[gs[0].GetString()];
            Check(QualityGovernor.HeldLevel(set) == gs[1].GetInt32() && QualityGovernor.FrameCap(set) == gs[2].GetInt32(), $"graphics {gs[0]}");
        }
        var marks = new Dictionary<string, SplitMark> { ["record"] = SplitMark.Record, ["better"] = SplitMark.Better, ["worse"] = SplitMark.Worse };
        foreach (var sp in g.GetProperty("splits").EnumerateArray())
        {
            var m = marks[sp[0].GetString()];
            Check(Access.SplitColor(m, false) == Convert.ToInt32(sp[1].GetString().Substring(1), 16) && Access.SplitColor(m, true) == Convert.ToInt32(sp[2].GetString().Substring(1), 16), $"split colour {sp[0]}");
        }
        Console.WriteLine($"feel: {frames} frames, {traces} governor traces");
    }

    static void TouchControls(string root)
    {
        var g = JsonDocument.Parse(File.ReadAllText(Path.Combine(root, "Tests~/Core.Tests/touch.json"))).RootElement;
        var t = g.GetProperty("thumbstick");
        Check(TouchStick.DeadZone == t.GetProperty("deadZone").GetDouble() && TouchStick.Full == t.GetProperty("full").GetDouble() && TouchStick.Buttons == t.GetProperty("buttons").GetDouble()
            && TouchStick.FloatMargin == g.GetProperty("floatMargin").GetDouble() && TouchStick.SliderDead == g.GetProperty("sliderDead").GetDouble(), "touch: constants");
        Dirs DirsOf(JsonElement a)
        {
            var d = Dirs.None;
            foreach (var x in a.EnumerateArray()) d |= x.GetString() switch { "up" => Dirs.Up, "down" => Dirs.Down, "left" => Dirs.Left, _ => Dirs.Right };
            return d;
        }
        foreach (var s in g.GetProperty("sticks").EnumerateArray())
        {
            var r = TouchStick.Read(s[0].GetDouble(), s[1].GetDouble(), s[2].GetDouble());
            Check(Near(r.stick.X, s[3].GetDouble()) && Near(r.stick.Y, s[4].GetDouble()) && Near(r.knob.X, s[5].GetDouble()) && Near(r.knob.Y, s[6].GetDouble()) && r.dirs == DirsOf(s[7]), $"thumbstick at {s[0]}, {s[1]}");
        }
        foreach (var f in g.GetProperty("floats").EnumerateArray())
        {
            var v = Enumerable.Range(0, 11).Select(i => f[i].GetDouble()).ToArray();
            var o = TouchStick.FloatOffset(v[0], v[1], v[2], v[3], v[4], v[5], v[6], v[7], v[8]);
            Check(Near(o.X, v[9]) && Near(o.Y, v[10]), $"float offset at {v[0]}, {v[1]}");
        }
        foreach (var s in g.GetProperty("sliders").EnumerateArray()) Check(Near(TouchStick.SliderTurn(s[0].GetDouble(), s[1].GetDouble()), s[2].GetDouble()), $"slider at {s[0]}");
        var sessions = new Dictionary<string, DeckSession> { ["qualifying"] = DeckSession.Qualifying, ["race"] = DeckSession.Race, ["timetrial"] = DeckSession.TimeTrial, ["timeattack"] = DeckSession.TimeAttack, ["tutorial"] = DeckSession.Tutorial };
        int n = 0;
        foreach (var l in g.GetProperty("labels").EnumerateArray())
        {
            int bits = l[1].GetInt32();
            bool B(int i) => (bits & (1 << i)) != 0;
            var st = new DeckState { Session = sessions[l[0].GetString()], Settings = B(0), ResultsUp = B(1), RoundOver = B(2), QualifyingOver = B(3), AttackOver = B(4), Learnt = B(5), Watching = B(6), Done = B(7), Paused = B(8) };
            var mine = DeckLabels.For(st);
            Check(mine.a == l[2].GetString() && mine.b == l[3].GetString() && mine.start == l[4].GetString() && mine.select == l[5].GetString(), $"deck labels {l[0]} {bits}");
            n++;
        }
        Check(TouchStick.PointsOn(true, DriveStyle.Auto) && !TouchStick.PointsOn(false, DriveStyle.Auto) && TouchStick.PointsOn(false, DriveStyle.Point) && !TouchStick.PointsOn(true, DriveStyle.Steer), "points on");
        Console.WriteLine($"touch: {g.GetProperty("sticks").GetArrayLength()} sticks, {n} deck states");
    }

    /// <summary>A race kept (RaceSave) and picked up: built afresh from its seed, the state laid over it, it goes on as the
    /// race it was (the AI's dice rolled afresh alike in both), car for car, step for step.</summary>
    static void KeptRaces(string root)
    {
        var opts = new JsonSerializerOptions { IncludeFields = true };
        foreach (var (id, seed, laps, weather) in new[] { ("crescent-park", 77u, 5, Weather.Dry), ("harbour", 1234u, 7, Weather.Wet), ("dust-bowl", 9u, 3, Weather.Damp) })
        {
            var circuit = JsonSerializer.Deserialize<CircuitData>(File.ReadAllText(Path.Combine(root, $"Assets/Resources/Circuits/{id}.json")), opts);
            var grid = circuit.ToGrid();
            var track = circuit.ToTrack();
            Race Build()
            {
                var w = Field.DrawWeekend(seed, circuit.slots.Length, Field.Teams[0], Field.Normal);
                var field = new List<FieldEntry>();
                for (int k = 0; k < w.Drivers.Count; k++)
                    field.Add(new FieldEntry { Car = new Car(CarClass.F1(), circuit.slots[k].x, circuit.slots[k].y, circuit.slots[k].heading), Ai = w.Drivers[k].Ai, Box = w.Drivers[k].Box });
                return RaceControl.NewRace(track, grid, Field.Normal.Handling(), laps, field, w.LightsOut, circuit.ToPitLane(), weather, Forecast.Changeable(seed, 200));
            }
            DriveInput Player(Entrant e)
            {
                int idx = e.Progress.Idx, n = track.Count;
                int t = (idx + 8 + (int)(Driving.SpeedOf(e.Car) / 40)) % n;
                double want = Math.Atan2(track.X[t] - e.Car.X, -(track.Y[t] - e.Car.Y));
                double turn = Math.Max(-1, Math.Min(1, Driving.AngleDiff(want, e.Car.Heading) * 2.2));
                bool slow = Driving.SpeedOf(e.Car) > track.Speed[idx] * 0.85;
                return Racing.WheelInput(new Racing.WheelPad { Turn = turn, Gas = slow ? 0 : 1, Brake = slow ? 0.6 : 0 }, e.Car);
            }
            var a = Build();
            for (int i = 0; i < 60 * 70; i++) RaceControl.StepRace(a, 1.0 / 60, Player);
            int you = a.Entrants.FindIndex(e => e.Ai == null);
            var kept = new KeptRace { At = 1000, Circuit = id, Name = id, Mode = "race", Team = "milk-energy", Difficulty = "normal", Weather = "dry", Laps = laps, Seed = seed, Grid = Enumerable.Range(0, a.Entrants.Count).ToList(), You = you, State = RaceSave.Snapshot(a) };
            string text = RaceSave.Write(kept);
            var back = RaceSave.Parse(text, 2000);
            Check(back != null && back.Seed == seed && back.You == you && back.Grid.Count == a.Entrants.Count, $"{id}: kept race read back");
            Check(RaceSave.Parse(text, 1000 + RaceSave.MaxAge + 1) == null, $"{id}: a kept race too old is thrown away");
            var b = Build();
            Check(RaceSave.Restore(b, back.State, seed), $"{id}: laid over a fresh race");
            // (the AI's dice afresh in the race that went on too, so both roll alike from here)
            Check(RaceSave.Restore(a, RaceSave.Parse(text, 2000).State, seed), $"{id}: laid over itself");
            Check(RaceSave.Write(new KeptRace { State = RaceSave.Snapshot(b) }) == RaceSave.Write(new KeptRace { State = RaceSave.Snapshot(a) }), $"{id}: the same state both ways");
            int same = 0;
            for (int i = 0; i < 60 * 60; i++)
            {
                RaceControl.StepRace(a, 1.0 / 60, Player);
                RaceControl.StepRace(b, 1.0 / 60, Player);
                bool ok = true;
                for (int k = 0; k < a.Entrants.Count; k++)
                    ok &= a.Entrants[k].Car.X == b.Entrants[k].Car.X && a.Entrants[k].Car.Y == b.Entrants[k].Car.Y && a.Entrants[k].Progress.Lap == b.Entrants[k].Progress.Lap && a.Entrants[k].Car.Health == b.Entrants[k].Car.Health;
                if (ok) same++;
            }
            Check(same == 60 * 60, $"{id}: picked up, the race goes on as it was ({same} of {60 * 60} steps the same)");
            Check(RaceSave.Restore(b, new Dictionary<string, object> { { "Entrants", new List<object>() } }, seed) == false, $"{id}: another field's state isn't laid over");
            Console.WriteLine($"kept race {id}: {text.Length / 1024} kB, {back.LapLine()}, {same} steps the same after");
        }
    }

    static PlayEvent EventOf(JsonElement e)
    {
        string kind = e.GetProperty("kind").GetString();
        var p = new PlayEvent { Kind = kind switch { "race" => PlayKind.Race, "lap" => PlayKind.Lap, "launch" => PlayKind.Launch, "pit" => PlayKind.Pit, "trial-lap" => PlayKind.TrialLap, _ => PlayKind.Attack } };
        if (p.Kind == PlayKind.Race)
        {
            p.Place = e.GetProperty("place").GetInt32(); p.Grid = e.GetProperty("grid").GetInt32(); p.Field = e.GetProperty("field").GetInt32();
            p.Fastest = e.GetProperty("fastest").GetBoolean(); p.Clean = e.GetProperty("clean").GetBoolean();
            p.Weather = e.GetProperty("weather").GetString(); p.Circuit = e.GetProperty("circuit").GetString();
        }
        if (p.Kind == PlayKind.Launch) p.Great = e.GetProperty("great").GetBoolean();
        if (p.Kind == PlayKind.TrialLap) p.Record = e.GetProperty("record").GetBoolean();
        if (p.Kind == PlayKind.Attack) { p.Passed = e.GetProperty("passed").GetInt32(); p.Daily = e.GetProperty("daily").GetBoolean(); }
        return p;
    }

    static void MissionsAndLaunches(string root)
    {
        var g = JsonDocument.Parse(File.ReadAllText(Path.Combine(root, "Tests~/Core.Tests/missions.json"))).RootElement;
        var ids = g.GetProperty("ids").EnumerateArray().ToList();
        Check(ids.Count == Missions.All.Length, $"missions: {Missions.All.Length}, want {ids.Count}");
        for (int k = 0; k < ids.Count && k < Missions.All.Length; k++)
        {
            var m = Missions.All[k];
            var w = ids[k];
            Check(m.Id == w[0].GetString() && m.Text == w[1].GetString() && m.Goal == w[2].GetInt32() && m.Max == w[3].GetBoolean() && m.Circuit == (w[4].ValueKind == JsonValueKind.Null ? null : w[4].GetString()), $"mission {k}: {m.Id}, want {w}");
        }
        var circuits = g.GetProperty("circuits").EnumerateArray().Select(c => (c.GetProperty("id").GetString(), c.GetProperty("name").GetString())).ToList();
        Check(circuits.SequenceEqual(Missions.Circuits), "mission circuits");
        foreach (var d in g.GetProperty("days").EnumerateArray())
        {
            string day = d[0].GetString();
            var want = d[1].EnumerateArray().Select(x => x.GetString()).ToArray();
            Check(Missions.On(day).Select(m => m.Id).SequenceEqual(want), $"missions on {day}: {string.Join(",", Missions.On(day).Select(m => m.Id))}, want {string.Join(",", want)}");
        }
        foreach (var c in g.GetProperty("counts").EnumerateArray())
        {
            var e = EventOf(c.GetProperty("e"));
            var want = c.GetProperty("n").EnumerateArray().Select(x => x.GetInt32()).ToArray();
            Check(Missions.All.Select(m => m.Count(e)).SequenceEqual(want), $"counts of {c.GetProperty("e")}");
        }
        foreach (var r in g.GetProperty("runs").EnumerateArray())
        {
            var p = new DayProgress { Day = r.GetProperty("day").GetString() };
            foreach (var s in r.GetProperty("steps").EnumerateArray())
            {
                var done = Missions.Count(p, EventOf(s.GetProperty("e")), out bool all);
                var wantDone = s.GetProperty("done").EnumerateArray().Select(x => x.GetString()).ToArray();
                Check(done.Select(m => m.Id).SequenceEqual(wantDone) && all == s.GetProperty("all").GetBoolean(), $"{p.Day}: done {string.Join(",", done.Select(m => m.Id))}");
                var wantP = s.GetProperty("progress").EnumerateObject().ToDictionary(x => x.Name, x => x.Value.GetInt32());
                Check(wantP.Count == p.Progress.Count && wantP.All(kv => p.Progress.TryGetValue(kv.Key, out int n) && n == kv.Value), $"{p.Day}: progress");
            }
            var back = Missions.Parse(Missions.Write(p), p.Day);
            Check(back.Progress.Count == p.Progress.Count && back.Progress.All(kv => p.Progress[kv.Key] == kv.Value), $"{p.Day}: saved and read back");
        }
        foreach (var l in g.GetProperty("launches").EnumerateArray())
        {
            var launch = new Launch();
            foreach (var f in l.GetProperty("frames").EnumerateArray())
            {
                double? @out = f[1].ValueKind == JsonValueKind.Null ? null : f[1].GetDouble();
                var v = launch.Step(f[0].GetBoolean(), @out, f[2].GetDouble());
                string want = f[3].ValueKind == JsonValueKind.Null ? "none" : f[3].GetString();
                Check(v.ToString().ToLowerInvariant() == want, $"launch: {v}, want {want}");
            }
            var rw = l.GetProperty("reaction");
            Check(rw.ValueKind == JsonValueKind.Null ? launch.Reaction == null : launch.Reaction == rw.GetDouble(), "launch reaction");
        }
        Console.WriteLine($"missions: {Missions.All.Length} missions, {g.GetProperty("days").GetArrayLength()} days, {g.GetProperty("launches").GetArrayLength()} launches");
    }

    static void Seasons(string root)
    {
        var g = JsonDocument.Parse(File.ReadAllText(Path.Combine(root, "Tests~/Core.Tests/season.json"))).RootElement;
        var ids = g.GetProperty("rounds").EnumerateArray().Select(e => e.GetString()).ToList();
        int n = 0;
        foreach (var w in g.GetProperty("seasons").EnumerateArray())
        {
            uint seed = (uint)w.GetProperty("seed").GetDouble();
            var f = w.GetProperty("field");
            var team = Field.TeamById(w.GetProperty("team").GetString());
            int lapsWant = f.GetProperty("laps").GetInt32();
            var s = Championship.NewSeason(seed, team, f.GetProperty("seat").GetInt32(), f.GetProperty("difficulty").GetString(), f.GetProperty("qualifying").GetBoolean(), ids, 11, lapsWant);
            int k = 0;
            foreach (var d in f.GetProperty("drivers").EnumerateArray())
            {
                var mine = s.Drivers[k++];
                Check(mine.Name == d.GetProperty("name").GetString() && mine.Team == d.GetProperty("team").GetString() && mine.Rank == d.GetProperty("rank").GetInt32(), $"season {seed}: driver {k - 1} {mine.Name} {mine.Team} {mine.Rank}, want {d}");
            }
            Check(s.You == f.GetProperty("you").GetInt32() && s.Laps == lapsWant, $"season {seed}: you, laps");
            k = 0;
            foreach (var r in w.GetProperty("seeds").EnumerateArray()) Check(Championship.RoundSeed(s, k++) == (uint)r.GetDouble(), $"season {seed}: round {k - 1}'s seed");
            var tables = w.GetProperty("tables").EnumerateArray().ToList();
            k = 0;
            foreach (var row in w.GetProperty("places").EnumerateArray())
            {
                var places = row.EnumerateArray().Select(x => x.GetInt32()).ToArray();
                // (the finish order and the DNFs that made these places)
                var finish = Enumerable.Range(0, places.Length).Where(i => places[i] >= 0).OrderBy(i => places[i]).Concat(Enumerable.Range(0, places.Length).Where(i => places[i] < 0)).ToList();
                var outs = new HashSet<int>(Enumerable.Range(0, places.Length).Where(i => places[i] < 0));
                Championship.RecordRound(s, finish, outs);
                var want = tables[k++].EnumerateArray().Select(t => t.EnumerateArray().Select(x => x.GetInt32()).ToArray()).ToList();
                var got = Championship.Standings(s);
                for (int i = 0; i < want.Count; i++) Check(got[i].Driver == want[i][0] && got[i].Points == want[i][1] && got[i].Wins == want[i][2], $"season {seed} round {k}: standing {i}");
                n++;
            }
            Check(s.Over, $"season {seed}: over");
            var back = Championship.Parse(Championship.Write(s));
            Check(back != null && Championship.Write(back) == Championship.Write(s), $"season {seed}: saved and read back");
            var web = Championship.Parse(w.GetProperty("saved").GetString());
            Check(web != null && Championship.Write(web) == Championship.Write(s), $"season {seed}: the web game's save read");
        }
        foreach (var m in g.GetProperty("marks").EnumerateArray())
        {
            Ghost G(JsonElement e) => e.ValueKind == JsonValueKind.Null ? null : new Ghost { Time = 90, Splits = e.EnumerateArray().Select(x => x.GetDouble()).ToList() };
            var mark = Splits.Mark(m[0].GetDouble(), m[1].GetInt32(), G(m[2]), G(m[3]), out var delta);
            Check(mark.ToString().ToLowerInvariant() == m[5].GetString(), $"split mark {m}: {mark}");
            if (m[4].ValueKind == JsonValueKind.Null) Check(!delta.HasValue, $"split mark {m}: no delta");
            else Near(delta ?? double.NaN, m[4].GetDouble(), 1e-12, $"split mark {m}: delta");
        }
        Console.WriteLine($"seasons: {n} rounds' standings, {g.GetProperty("marks").GetArrayLength()} split marks");
    }

    /// <summary>The cherry blossom's petals (Core/Petals.cs) against the web game's PetalField (petals.json).</summary>
    static void Petals(string root)
    {
        var g = JsonDocument.Parse(File.ReadAllText(Path.Combine(root, "Tests~/Core.Tests/petals.json"))).RootElement;
        var opts = new JsonSerializerOptions { IncludeFields = true };
        var c = JsonSerializer.Deserialize<CircuitData>(File.ReadAllText(Path.Combine(root, "Assets/Resources/Circuits/suzuka.json")), opts);
        var trees = JsonSerializer.Deserialize<BlossomTrees>(File.ReadAllText(Path.Combine(root, "Assets/Resources/Scenery/suzuka-blossoms.json")), opts).trees;
        var field = new PetalField(c.ToGrid(), c.ToTrack(), trees);
        Check(PetalTuning.Max == g.GetProperty("max").GetInt32(), "petals: the most at once");
        var start = g.GetProperty("start");
        Check(field.Petals.Count == start[0].GetInt32(), "petals: on the track at the start");
        double sum0 = 0;
        foreach (var p in field.Petals) sum0 += p.X + p.Y + p.Z + p.Spin;
        Near(sum0, start[1].GetDouble(), 1e-6, "petals: where they lie at the start");
        double dt = D(g, "dt");
        var cars = new List<JsonElement>(g.GetProperty("cars").EnumerateArray());
        var marks = new List<JsonElement>(g.GetProperty("marks").EnumerateArray());
        var two = new List<PetalCar>(2);
        int m = 0;
        for (int f = 0; f * 2 < cars.Count; f++)
        {
            two.Clear();
            for (int k = 0; k < 2; k++)
            {
                var r = cars[f * 2 + k];
                two.Add(new PetalCar { X = r[0].GetDouble(), Y = r[1].GetDouble(), Vx = r[2].GetDouble(), Vy = r[3].GetDouble(), Z = r[4].GetDouble(), Airborne = r[5].GetDouble() != 0 });
            }
            field.Step(dt, two, two[0].X, two[0].Y);
            if (f % 30 != 29) continue;
            var w = marks[m++];
            field.Counts(out int resting, out int flying);
            Check(field.Petals.Count == w[1].GetInt32() && resting == w[2].GetInt32() && flying == w[3].GetInt32(), $"petals frame {f}: {field.Petals.Count} ({resting} lying, {flying} flying), want {w[1]} ({w[2]}, {w[3]})");
            double sum = 0;
            foreach (var p in field.Petals) sum += p.X + p.Y + p.Z + p.Vx + p.Vy + p.Vz + p.Spin;
            Near(sum, w[4].GetDouble(), 1e-5, $"petals frame {f}: sum");
            for (int i = 0; i < Math.Min(4, field.Petals.Count); i++)
            {
                var p = field.Petals[i];
                var got = new[] { p.X, p.Y, p.Z, p.Vx, p.Vy, p.Vz, p.Spin, p.Tumble, p.Resting ? 1 : 0, double.IsInfinity(p.Life) ? -1 : p.Life, p.OnTrack ? 1 : 0, p.Shade, p.Phase };
                for (int j = 0; j < got.Length; j++) Near(got[j], w[5 + i * 13 + j].GetDouble(), 1e-7, $"petals frame {f}: petal {i} [{j}]");
            }
        }
        Check(m == marks.Count, "petals: every mark checked");
    }

    /// <summary>Debris, the grid pan and the replay's recording (Core/Debris.cs, Replay.cs) against the web game's (fx.json).</summary>
    static void Fx(string root)
    {
        var g = JsonDocument.Parse(File.ReadAllText(Path.Combine(root, "Tests~/Core.Tests/fx.json"))).RootElement;
        bool Same(double a, double b) => BitConverter.DoubleToInt64Bits(a) == BitConverter.DoubleToInt64Bits(b) || a == b;
        double Ground(double x, double y) => 6 * JsMath.Sin(x / 40) + 4 * JsMath.Cos(y / 55);
        int n = 0;
        foreach (var d in g.GetProperty("debris").EnumerateArray())
        {
            var rng = new SeededRandom((uint)d.GetProperty("seed").GetInt32());
            double power = D(d, "power");
            double x0 = 400 + n * 30;
            var p = Debris.Fling(x0, 300, Ground(x0, 300) + 5, 220 - n * 90, -140 + n * 60, 0.6, -0.8, power, rng.Next);
            int k = 0, off = -1;
            foreach (var row in d.GetProperty("trace").EnumerateArray())
            {
                for (int s = 0; s < 10; s++) Debris.Step(p, 1.0 / 60, Ground);
                double[] got = { p.X, p.Y, p.H, p.Vx, p.Vy, p.Vh, p.Rot[0], p.Rot[1], p.Rot[2], p.Rest ? 1 : 0, p.Rested };
                for (int c = 0; c < got.Length && off < 0; c++) { checks++; if (!Same(got[c], row[c].GetDouble())) off = k * 10 + 10; }
                k++;
            }
            Check(off < 0, $"debris {n}: flies as the web game's" + (off < 0 ? "" : $" (off at step {off})"));
            n++;
        }
        var circuit = JsonSerializer.Deserialize<CircuitData>(File.ReadAllText(Path.Combine(root, "Assets/Resources/Circuits/crescent-park.json")), new JsonSerializerOptions { IncludeFields = true });
        var xs = circuit.slots.Take(11).Select(s => s.x).ToList();
        var ys = circuit.slots.Take(11).Select(s => s.y).ToList();
        var pan = g.GetProperty("pan");
        Check(Same(GridPan.LengthOf(11), D(pan, "length")), "grid pan length");
        foreach (var a in pan.GetProperty("at").EnumerateArray())
        {
            var at = GridPan.At(xs, ys, a[0].GetDouble());
            Check(Same(at.x, a[1].GetDouble()) && Same(at.y, a[2].GetDouble()) && at.car == a[3].GetInt32(), $"grid pan at {a[0]}");
        }
        var rec = new ReplayRecorder(3);
        var rng2 = new SeededRandom(5);
        var poses = g.GetProperty("poses").EnumerateArray().GetEnumerator();
        int poseOff = 0, poseCount = 0;
        for (double t = 0; t < 22; t += 1.0 / 60)
        {
            var cars = new ReplayPose?[3];
            for (int i = 0; i < 3; i++)
                cars[i] = i == 2 && t > 8 && t < 9 ? (ReplayPose?)null : new ReplayPose
                {
                    X = 100 + t * 200 + i * 13.37, Y = 50 - t * 31 * i, Z = JsMath.Sin(t) * 3, Heading = ((t * 2.3 + i) % (2 * Math.PI)) - Math.PI,
                    Condition = (CarCondition)((int)Math.Floor(t / 4 + i) % 4),
                };
            rec.Record(t, cars);
            if (JsMath.Round(t * 60) % 37 == 0)
            {
                double q = t - rng2.Next() * 14;
                for (int i = 0; i < 3; i++)
                {
                    poses.MoveNext();
                    var w = poses.Current;
                    var p = rec.Pose(i, q);
                    poseCount++;
                    bool ok = Same(w[2].GetDouble(), q) && (w.GetArrayLength() == 3 ? p == null
                        : p != null && Same(p.Value.X, w[3].GetDouble()) && Same(p.Value.Y, w[4].GetDouble()) && Same(p.Value.Z, w[5].GetDouble()) && Same(p.Value.Heading, w[6].GetDouble()) && (int)p.Value.Condition == w[7].GetInt32());
                    if (!ok) poseOff++;
                }
            }
        }
        Check(poseOff == 0, $"replay poses: {poseOff} of {poseCount} off");
        Check(Same(rec.Start, D(g, "start")) && rec.Frames.Count == g.GetProperty("frames").GetInt32(), "replay keeps the last 15 s");
        var ws = g.GetProperty("windows").EnumerateArray().ToList();
        var mine = new[] { rec.FinishWindow(20), rec.FinishWindow(21.5), rec.CrashWindow(15), rec.CrashWindow(21) };
        for (int i = 0; i < 4; i++) Check(Same(mine[i].from, ws[i][0].GetDouble()) && Same(mine[i].to, ws[i][1].GetDouble()), $"replay window {i}");
        Console.WriteLine($"fx: {n} pieces of debris, {poseCount} replay poses");
    }

    /// <summary>The gopher and the yeti (Core/Critters.cs) against the web game's (critters.json): the same car, the same poses.</summary>
    static void Critters(string root)
    {
        var g = JsonDocument.Parse(File.ReadAllText(Path.Combine(root, "Tests~/Core.Tests/critters.json"))).RootElement;
        var opts = new JsonSerializerOptions { IncludeFields = true };
        double dt = D(g, "dt"), half = D(g, "halfWidth");
        Track TrackOf(string id) => JsonSerializer.Deserialize<CircuitData>(File.ReadAllText(Path.Combine(root, $"Assets/Resources/Circuits/{id}.json")), opts).ToTrack();
        double[] Row(JsonElement e) { var a = new double[e.GetArrayLength()]; int i = 0; foreach (var v in e.EnumerateArray()) a[i++] = v.GetDouble(); return a; }

        var go = g.GetProperty("gopher");
        var gopher = new GopherRun(TrackOf("maple-island"), JsonSerializer.Deserialize<GopherTuning>(go.GetProperty("tuning").GetRawText(), opts), half);
        var cars = new List<CritterCar>();
        var poses = new List<JsonElement>(go.GetProperty("poses").EnumerateArray());
        int f = 0;
        foreach (var c in go.GetProperty("cars").EnumerateArray())
        {
            var k = Row(c);
            cars.Clear();
            cars.Add(new CritterCar { X = k[0], Y = k[1], Vx = k[2], Vy = k[3] });
            gopher.Step(dt, cars, k[0], k[1]);
            if (f % 6 == 5)
            {
                var want = poses[f / 6];
                bool has = gopher.Pose(out var p);
                Check(has == (want.ValueKind != JsonValueKind.Null), $"gopher frame {f}: out of its hole");
                if (has && want.ValueKind != JsonValueKind.Null)
                {
                    var w = Row(want);
                    var got = new[] { p.X, p.Y, p.Z, p.Heading, p.Up, p.Step, p.Tumble, p.Running ? 1 : 0, p.Dazed ? 1 : 0 };
                    for (int i = 0; i < w.Length; i++) Near(got[i], w[i], 1e-6, $"gopher frame {f} [{i}]");
                }
            }
            f++;
        }
        Check(gopher.Crossings == go.GetProperty("crossings").GetInt32() && gopher.Bolts == go.GetProperty("bolts").GetInt32() && gopher.Hits == go.GetProperty("hits").GetInt32(),
            $"gopher: {gopher.Crossings} crossings, {gopher.Bolts} bolts, {gopher.Hits} hits");

        var ye = g.GetProperty("yeti");
        var yeti = new YetiRun(TrackOf("glacier-pass"), JsonSerializer.Deserialize<YetiTuning>(ye.GetProperty("tuning").GetRawText(), opts), half, new Avoid[0]);
        poses = new List<JsonElement>(ye.GetProperty("poses").EnumerateArray());
        f = 0;
        foreach (var c in ye.GetProperty("cars").EnumerateArray())
        {
            var k = Row(c);
            yeti.Step(dt, k[0], k[1]);
            if (f % 6 == 5)
            {
                var want = poses[f / 6];
                var p = yeti.Pose;
                Check((p != null) == (want.ValueKind != JsonValueKind.Null), $"yeti frame {f}: out");
                if (p != null && want.ValueKind != JsonValueKind.Null)
                {
                    var w = Row(want);
                    var got = new[] { p.X, p.Y, p.Heading, (double)(int)p.Phase, p.T, p.Step };
                    for (int i = 0; i < w.Length; i++) Near(got[i], w[i], 1e-6, $"yeti frame {f} [{i}]");
                }
            }
            f++;
        }
        Check(yeti.Chases == ye.GetProperty("chases").GetInt32(), $"yeti: {yeti.Chases} chases");
    }

    static string FindRoot()
    {
        // run from the test folder or its bin/obj: walk up to the Unity project (the folder with Assets/)
        var d = new DirectoryInfo(AppContext.BaseDirectory);
        while (d != null && !Directory.Exists(Path.Combine(d.FullName, "Assets", "Scripts"))) d = d.Parent;
        if (d == null) throw new Exception("Unity project folder not found");
        return d.FullName;
    }

    static void Replay(string name, JsonElement run, CircuitData circuit, Grid grid, Track track, HandlingParams handling, double dt)
    {
        var start = circuit.slots[0];
        var car = new Car(CarClass.F1(), start.x, start.y, start.heading);
        var prog = Racing.NewProgress(Racing.NearestSample(track, car.X, car.Y));
        var frames = run.GetProperty("frames");
        var checks = run.GetProperty("checks");
        int ci = 0, step = 0;
        double worst = 0;
        foreach (var fr in frames.EnumerateArray())
        {
            var pad = new Racing.WheelPad { Turn = D(fr, "turn"), Gas = D(fr, "gas"), Brake = D(fr, "brake"), Drift = fr.GetProperty("drift").GetBoolean() };
            Driving.StepCar(car, Racing.WheelInput(pad, car), handling, dt, grid);
            step++;
            prog = Racing.StepProgress(prog, track, car, step * dt, 99, dt);
            if (ci < checks.GetArrayLength() && (int)D(checks[ci], "step") == step)
            {
                var c = checks[ci++];
                string at = $"{name} step {step}";
                // chaotic after a wall hit, so the tolerance is loose in absolute terms and the check is still tight on the lap
                Near(car.X, D(c, "x"), 1e-6, at + " x");
                Near(car.Y, D(c, "y"), 1e-6, at + " y");
                Near(car.Heading, D(c, "heading"), 1e-6, at + " heading");
                Near(car.Vx, D(c, "vx"), 1e-6, at + " vx");
                Near(car.Vy, D(c, "vy"), 1e-6, at + " vy");
                Near(car.Health, D(c, "health"), 1e-6, at + " health");
                Near(car.Z, D(c, "z"), 1e-6, at + " z");
                Check((car.Airborne ? 1 : 0) == (int)D(c, "airborne"), at + " airborne");
                Check((car.Wrecked ? 1 : 0) == (int)D(c, "wrecked"), at + " wrecked");
                Check(prog.Lap == (int)D(c, "lap"), at + $" lap {prog.Lap} vs {D(c, "lap")}");
                Check(prog.Idx == (int)D(c, "idx"), at + $" idx {prog.Idx} vs {D(c, "idx")}");
                Check(prog.Sector == (int)D(c, "sector"), at + " sector");
                Near(prog.LapStart ?? -1, D(c, "lapStart"), 1e-9, at + " lapStart");
                worst = Math.Max(worst, Math.Abs(car.X - D(c, "x")));
            }
        }
        var times = run.GetProperty("lapTimes");
        Check(prog.LapTimes.Count == times.GetArrayLength(), $"{name}: lap count {prog.LapTimes.Count} vs {times.GetArrayLength()}");
        for (int i = 0; i < Math.Min(prog.LapTimes.Count, times.GetArrayLength()); i++) Near(prog.LapTimes[i], times[i].GetDouble(), 1e-9, $"{name}: lap {i + 1} time");
        Console.WriteLine($"{name}: {step} steps replayed, {ci} checkpoints, worst x drift {worst:E2}, laps [{string.Join(", ", prog.LapTimes.ConvertAll(t => t.ToString("F2")))}]");
    }

    static void WheelMapping(JsonElement cases)
    {
        int i = 0;
        foreach (var c in cases.EnumerateArray())
        {
            var cj = c.GetProperty("car");
            var car = new Car(CarClass.F1(), 0, 0, D(cj, "heading")) { Vx = D(cj, "vx"), Vy = D(cj, "vy") };
            var pj = c.GetProperty("pad");
            var pad = new Racing.WheelPad { Turn = D(pj, "turn"), Gas = D(pj, "gas"), Brake = D(pj, "brake"), Drift = pj.GetProperty("drift").GetBoolean() };
            var got = Racing.WheelInput(pad, car);
            var want = c.GetProperty("out");
            var w = want.GetProperty("wheel");
            string at = $"wheel case {i++}";
            Near(got.Wheel.Value.Turn, D(w, "turn"), 1e-12, at + " turn");
            Near(got.Wheel.Value.Gas, D(w, "gas"), 1e-12, at + " gas");
            Check(got.Wheel.Value.Reverse == w.GetProperty("reverse").GetBoolean(), at + " reverse");
            Check(got.Handbrake == want.GetProperty("handbrake").GetBoolean(), at + " handbrake");
            bool wantBrake = want.TryGetProperty("brake", out var b) && b.GetBoolean();
            Check(got.Brake == wantBrake, at + " brake");
        }
    }

    static void GamepadMapping(JsonElement cases)
    {
        string[] names = { "up", "down", "left", "right", "a", "b", "start", "select" };
        int i = 0;
        foreach (var c in cases.EnumerateArray())
        {
            var pj = c.GetProperty("pad");
            var pad = new PadState { AxisX = pj.GetProperty("axes")[0].GetDouble(), AxisY = pj.GetProperty("axes")[1].GetDouble() };
            int k = 0;
            foreach (var b in pj.GetProperty("buttons").EnumerateArray())
            {
                pad.Pressed[k] = b.GetProperty("pressed").GetBoolean();
                if (k == 6) pad.LeftTrigger = b.GetProperty("value").GetDouble();
                if (k == 7) pad.RightTrigger = b.GetProperty("value").GetDouble();
                k++;
            }
            var buttons = GamepadReader.Read(pad, out var drive);
            var want = c.GetProperty("out");
            var wantButtons = new List<string>();
            foreach (var e in want.GetProperty("buttons").EnumerateArray()) wantButtons.Add(e.GetString());
            var gotButtons = buttons.ConvertAll(b => names[(int)b]);
            string at = $"gamepad case {i++}";
            Check(string.Join(",", gotButtons) == string.Join(",", wantButtons), at + $" buttons [{string.Join(",", gotButtons)}] vs [{string.Join(",", wantButtons)}]");
            var d = want.GetProperty("drive");
            Near(drive.Turn, D(d, "turn"), 1e-12, at + " turn");
            Near(drive.Gas, D(d, "gas"), 1e-12, at + " gas");
            Near(drive.Brake, D(d, "brake"), 1e-12, at + " brake");
            Near(drive.Stick.X, D(d.GetProperty("stick"), "x"), 1e-12, at + " stick x");
            Near(drive.Stick.Y, D(d.GetProperty("stick"), "y"), 1e-12, at + " stick y");
        }
    }

    static void Smoother()
    {
        var s = new SteeringSmoother();
        // a tap: 3 frames at 60 Hz is a nudge, not full lock
        for (int i = 0; i < 3; i++) s.Step(1, 1.0 / 60);
        Check(s.Value > 0.2 && s.Value < 0.5, $"smoother tap is a nudge ({s.Value:F2})");
        for (int i = 0; i < 30; i++) s.Step(1, 1.0 / 60);
        Near(s.Value, 1, 1e-12, "smoother holds full lock");
        // frame-rate independent: half a second at 30 fps and at 240 fps land together
        var a = new SteeringSmoother(); var b = new SteeringSmoother();
        for (int i = 0; i < 15; i++) a.Step(-1, 1.0 / 30);
        for (int i = 0; i < 120; i++) b.Step(-1, 1.0 / 240);
        Near(a.Value, b.Value, 1e-9, "smoother is frame-rate independent");
        // swinging across takes the quicker rate, and release returns to centre
        for (int i = 0; i < 5; i++) s.Step(-1, 1.0 / 60);
        Check(s.Value < 1 - 0.5, "smoother swings across");
        for (int i = 0; i < 60; i++) s.Step(0, 1.0 / 60);
        Near(s.Value, 0, 1e-12, "smoother returns to centre");
    }

    static void Clock()
    {
        var c = new FixedClock();
        int total = 0;
        for (int i = 0; i < 144; i++) { c.Advance(1.0 / 144, out int st, out _); total += st; }
        Check(total == 60, $"clock: one second at 144 fps is 60 steps (got {total})");
        c = new FixedClock();
        c.Advance(1.0, out int steps, out double alpha);
        Check(steps == 4 && alpha == 0, "clock: a stalled frame runs at most 4 steps and drops the rest");
    }

    /// <summary>A golden JSON value as Json.cs's (objects keep their keys' order).</summary>
    static object Plain(JsonElement e) => e.ValueKind switch
    {
        JsonValueKind.Object => e.EnumerateObject().Aggregate(new JsonObj(), (o, p) => { o[p.Name] = Plain(p.Value); return o; }),
        JsonValueKind.Array => e.EnumerateArray().Select(Plain).ToList(),
        JsonValueKind.String => e.GetString(),
        JsonValueKind.Number => e.GetDouble(),
        JsonValueKind.True => true,
        JsonValueKind.False => false,
        _ => null,
    };

    /// <summary>The play stats' and boards' wire (net.json): JSON's numbers, the events' batches byte for byte, the laps waiting.</summary>
    static void Net(string root)
    {
        var net = JsonDocument.Parse(File.ReadAllText(Path.Combine(root, "Tests~/Core.Tests/net.json"))).RootElement;
        int off = 0, n = 0;
        foreach (var x in net.GetProperty("numbers").EnumerateArray())
        {
            n++;
            string got = Json.Number(x[0].GetDouble()), want = x[1].GetString();
            if (got != want && off++ < 5) Console.WriteLine($"  number {x[0].GetDouble():R}: got {got}, want {want}");
        }
        Check(off == 0, $"numbers written as JSON.stringify writes them ({off} of {n} differ)");
        var events = net.GetProperty("events").EnumerateArray().Select(e =>
        {
            string S(string k) => e.TryGetProperty(k, out var v) && v.ValueKind == JsonValueKind.String ? v.GetString() : null;
            double? N(string k) => e.TryGetProperty(k, out var v) && v.ValueKind == JsonValueKind.Number ? v.GetDouble() : (double?)null;
            return new StatEvent
            {
                Player = S("player"), Kind = S("kind"), Platform = S("platform"), Version = S("version"), Circuit = S("circuit"), Mode = S("mode"),
                Km = N("km"), Seconds = N("seconds"), Data = e.TryGetProperty("data", out var d) ? (JsonObj)Plain(d) : null,
            };
        }).ToList();
        var lists = new[] { events, events.Take(2).ToList(), events.Where(e => e.Kind == "session").ToList() };
        int b = 0;
        foreach (var want in net.GetProperty("batches").EnumerateArray())
        {
            string got = Json.Write(Metrics.Batches(lists[b]));
            Check(got == want.GetString(), $"batch set {b} as the web game sends it" + (got == want.GetString() ? "" : $"\n  got  {got}\n  want {want.GetString()}"));
            b++;
        }
        // the queue: offline batches back at the front (not when closing, nor past 200); refused ones dropped
        var q = new StatsQueue();
        foreach (var e in events) q.Add(e);
        var taken = q.Take();
        Check(taken.Count == 2 && taken[0].Count == 6 && taken[1].Count == 1 && q.Count == 0, "queue: taken in its batches");
        q.Add(new StatEvent { Kind = "launch" });
        q.Sent(taken[0], Sent.Offline, false);
        Check(q.Count == 7 && q.Take()[0][0].Kind == "launch" && true, "queue: an offline batch kept to try again, at the front");
        q.Sent(taken[0], Sent.Refused, false);
        q.Sent(taken[1], Sent.Offline, true);
        Check(q.Count == 0, "queue: refused, or offline as the game closes: dropped");
        var km = new StatEvent { Kind = "drive", Km = Metrics.KmOf(12345.678) };
        q.Add(km);
        Check(km.Km == JsMath.Round(Metrics.KmOf(12345.678) * 1000) / 1000, "queue: km to the metre");
        Check(Math.Abs(Metrics.KmOf(8800) - 5.9) < 0.05, "a lap of Silver Heath is about 5.9 km");
        Check(Metrics.LaunchId(new Random(3)).Length == 10, "a launch id: 10 digits");

        // the laps waiting, as records come in (and as they're kept, read back)
        var pending = new List<PendingLap>();
        int k = 0;
        foreach (var step in net.GetProperty("pending").EnumerateArray())
        {
            var l = step.GetProperty("lap");
            pending = Boards.Queue(pending, new PendingLap { Circuit = l[0].GetString(), Weather = l[1].GetString(), Time = l[2].GetDouble() });
            pending = Boards.Parse(Boards.Write(pending));
            var want = step.GetProperty("pending").EnumerateArray().Select(x => $"{x.GetProperty("circuit").GetString()}:{x.GetProperty("weather").GetString()}={x.GetProperty("time").GetDouble():R}");
            var got = pending.Select(x => $"{x.Key}={x.Time:R}");
            Check(got.SequenceEqual(want), $"pending laps after lap {k}: got {string.Join(", ", got)}, want {string.Join(", ", want)}");
            k++;
        }
        // sent (boards.test.ts): one that didn't go stays; one that came in while they went stays; a quicker one too
        var tried = new List<PendingLap> { new PendingLap { Circuit = "baku", Weather = "dry", Time = 81.2 }, new PendingLap { Circuit = "suzuka", Weather = "dry", Time = 99 } };
        var left = Boards.AfterSend(tried, new HashSet<string> { "suzuka:dry" }, tried);
        Check(left.Count == 1 && left[0].Key == "suzuka:dry", "sent: the one that didn't go stays");
        var now = new List<PendingLap> { new PendingLap { Circuit = "baku", Weather = "dry", Time = 80 }, tried[1], new PendingLap { Circuit = "monza", Weather = "wet", Time = 90 } };
        left = Boards.AfterSend(tried, new HashSet<string>(), now);
        Check(string.Join(",", left.Select(x => $"{x.Key}={x.Time}")) == "baku:dry=80,monza:wet=90", "sent: a quicker lap, and a new one, that came in while they went stay");
        Check(Boards.Write(new List<PendingLap>()) == null && Boards.Parse("nonsense").Count == 0 && Boards.Parse(null).Count == 0, "no laps: nothing kept; a damaged one read as none");
        Check(Json.Write(Boards.SubmitArgs(tried[0], "p", "ABC", "1.0")) == "{\"p_circuit\":\"baku\",\"p_weather\":\"dry\",\"p_player\":\"p\",\"p_name\":\"ABC\",\"p_time\":81.2,\"p_version\":\"1.0\"}", "submit_lap's arguments");
        // a board as lap_board sends it
        var board = Boards.ParseBoard(Json.Parse("{\"entries\": 12, \"top\": [{\"place\": 1, \"name\": \"ZED\", \"time\": 60.25, \"you\": false}, {\"place\": 2, \"name\": \"ABC\", \"time\": 61.5, \"you\": true}], \"you\": {\"place\": 2, \"name\": \"ABC\", \"time\": 61.5}}"));
        Check(board != null && board.Entries == 12 && board.Top.Count == 2 && board.Top[1].You && board.You?.Place == 2, "a board read back");
        Check(Boards.PlaceLine(board) == "WORLD BOARD · #2 OF 12", "your place on it");
        Check(Boards.ParseBoard(Json.Parse("{\"entries\": 0, \"top\": [], \"you\": null}")).You == null && Boards.ParseBoard(null) == null, "an empty board; none");
        Check(Json.Write(Json.Parse("[1,\"a\\u00e9\\n\",{\"b\":[true,false,null]},-2.5e-7]")) == "[1,\"a\u00e9\\n\",{\"b\":[true,false,null]},-2.5e-7]", "JSON read and written back");
    }

    static bool Same(double a, double b) => BitConverter.DoubleToInt64Bits(a) == BitConverter.DoubleToInt64Bits(b);

    /// <summary>The Daily Challenge, Time Attack's clock, the streak and its looks, ghosts (daily.json), against the web game's.</summary>
    static void DailyChallenge(string root)
    {
        var g = JsonDocument.Parse(File.ReadAllText(Path.Combine(root, "Tests~/Core.Tests/daily.json"))).RootElement;
        Check(g.GetProperty("layouts").EnumerateArray().Select(x => x.GetString()).SequenceEqual(Daily.Layouts), "daily: the web game's circuits, in its order");
        int off = 0, n = 0;
        foreach (var c in g.GetProperty("challenges").EnumerateArray())
        {
            n++;
            var got = Daily.On(c[0].GetString());
            string w = got.Weather == Weather.Dry ? "dry" : got.Weather == Weather.Damp ? "damp" : "wet";
            if ((got.Circuit != c[1].GetString() || w != c[2].GetString()) && off++ < 5) Console.WriteLine($"  {c[0].GetString()}: got {got.Circuit} {w}, want {c[1].GetString()} {c[2].GetString()}");
        }
        Check(off == 0, $"daily: each day's circuit and weather ({off} of {n} days differ)");
        var pool = g.GetProperty("fixedPool").EnumerateArray().Select(x => x.GetString()).ToList();
        var days = g.GetProperty("challenges").EnumerateArray().Take(60).Select(c => c[0].GetString()).ToList();
        Check(days.Select(d => Daily.On(d, pool).Circuit).SequenceEqual(g.GetProperty("pooled").EnumerateArray().Select(x => x.GetString())), "daily: out of a given pool");

        var log = new DailyLog();
        int k = 0;
        foreach (var st in g.GetProperty("logSteps").EnumerateArray())
        {
            string day = st.GetProperty("day").GetString();
            var run = new DailyRun { Score = st.GetProperty("run").GetProperty("score").GetInt32(), Time = st.GetProperty("run").GetProperty("time").GetDouble() };
            bool best = Daily.LogRun(log, day, run);
            log = Daily.Parse(Daily.Write(log));
            var pend = st.GetProperty("pending");
            bool pendOk = pend.ValueKind == JsonValueKind.Null ? log.Pending == null : log.Pending != null && log.Pending.Day == pend[0].GetString() && log.Pending.Run.Score == pend[1].GetInt32() && Same(log.Pending.Run.Time, pend[2].GetDouble());
            int on = Daily.StreakOn(log, Streaks.AddDays(day, k % 3));
            Check(best == st.GetProperty("best").GetBoolean() && log.Streak == st.GetProperty("streak").GetInt32() && on == st.GetProperty("streakOn").GetInt32()
                && log.Best.Keys.SequenceEqual(st.GetProperty("days").EnumerateArray().Select(x => x.GetString())) && pendOk, $"daily log: run {k} on {day}");
            k++;
        }

        foreach (var a in g.GetProperty("attacks").EnumerateArray())
        {
            string diff = a.GetProperty("diff").GetString();
            var at = new Attack(a.GetProperty("ref").GetDouble(), diff);
            var r = new SeededRandom(5);
            var want = a.GetProperty("trace").EnumerateArray().ToList();
            int w = 0, bad = 0, passed = 0;
            for (int step = 0; step < 60 * 400 && !at.Over; step++)
            {
                bool started = step > 90;
                if (started && r.Next() < 0.0016) passed++;
                bool cut = started && r.Next() < 0.0008;
                var o = at.Advance(1.0 / 60, started, passed, cut);
                if (step % 7 == 0 || o.Started || o.Added.HasValue || o.Lost.HasValue || o.TimeUp)
                {
                    if (w >= want.Count) { bad++; continue; }
                    var x = want[w++];
                    bool ok = x[0].GetInt32() == step && Same(at.Left ?? -1, x[1].GetDouble()) && at.Passed == x[2].GetInt32() && Same(at.Elapsed, x[3].GetDouble()) && Same(at.LastAt, x[4].GetDouble())
                        && (o.Started ? 1 : 0) == x[5].GetInt32() && Same(o.Added ?? 0, x[6].GetDouble()) && Same(o.Lost ?? 0, x[7].GetDouble()) && (o.TimeUp ? 1 : 0) == x[8].GetInt32();
                    if (!ok) bad++;
                }
            }
            Check(bad == 0 && w == want.Count && at.Over, $"time attack ({diff}): the clock as the web game's, bit for bit, to TIME UP ({bad} off, {w}/{want.Count})");
        }
        foreach (var d in g.GetProperty("distances").EnumerateArray())
            Check(Attack.Distance(d[0].GetInt32()) == d[1].GetString() && Attack.ShortDistance(d[0].GetInt32()) == d[2].GetString(), $"distance {d[0].GetInt32()}");

        var s = new Streak();
        k = 0;
        foreach (var st in g.GetProperty("streakSteps").EnumerateArray())
        {
            var o = Streaks.PlayedOn(s, st[0].GetString());
            s = Streaks.Parse(Streaks.Write(s));
            Check(o.Days == st[1].GetInt32() && (o.Grew ? 1 : 0) == st[2].GetInt32() && (o.Forgave ? 1 : 0) == st[3].GetInt32() && string.Join(",", o.Rewards.Select(x => x.Id)) == st[4].GetString()
                && s.Best == st[5].GetInt32() && (s.Forgiven ?? "") == st[6].GetString() && Streaks.Now(s, Streaks.AddDays(st[0].GetString(), k % 4)) == st[7].GetInt32(), $"streak: day {k} ({st[0].GetString()})");
            k++;
        }
        var styles = g.GetProperty("styles").EnumerateArray().ToList();
        Check(styles.Count == Streaks.Styles.Length, "car looks: as many as the web game's");
        for (int i = 0; i < styles.Count && i < Streaks.Styles.Length; i++)
        {
            var c = Streaks.Styles[i];
            var look = JsonDocument.Parse(styles[i][3].GetString()).RootElement;
            string Hex(int v) => v < 0 ? null : "#" + v.ToString("x6");
            string L(string key) => look.TryGetProperty(key, out var v) ? v.GetString() : null;
            string helmet = c.Gold ? "gold" : c.Led ? "led" : Hex(c.Helmet);
            Check(c.Id == styles[i][0].GetString() && c.Name == styles[i][1].GetString() && c.Days == styles[i][2].GetInt32() && helmet == L("helmet")
                && Hex(c.Body) == L("body") && Hex(c.Stripe) == L("stripe") && Hex(c.Accent) == L("accent") && c.Pattern == L("pattern"), $"car look {c.Id}");
        }
        Check(Streaks.StylesFor(14).Select(x => x.Id).SequenceEqual(new[] { "standard", "silver-helmet", "neon-helmet", "gold-wings" }) && Streaks.StyleOf("chequered", 30).Id == "standard", "car looks: earned by the best streak");

        // a ghost recorded as the web game records it, read back between frames, and packed to send
        var rec = new GhostRecorder();
        var car = new Car(CarClass.F1(), 0, 0, 0);
        for (int step = 0; step <= 60 * 35; step++)
        {
            double t = step / 60.0;
            car.X = 400 * JsMath.Cos(t * 0.4) + 3.217 * t;
            car.Y = 260 * JsMath.Sin(t * 0.4);
            car.Heading = ((t * 0.4 + Math.PI) % (2 * Math.PI)) - Math.PI;
            rec.Frame(t, car, step % 977);
        }
        var ghost = rec.ToGhost(35);
        Check(Json.Write(ghost.ToJson()) == g.GetProperty("ghost").GetString(), "ghost: recorded as the web game records it");
        void Poses(Ghost gh, JsonElement list, string what)
        {
            foreach (var p in list.EnumerateArray())
            {
                var got = gh.Pose(p[0].GetDouble());
                bool ok = p.GetArrayLength() == 1 ? got == null : got != null && Same(got.Value.x, p[1].GetDouble()) && Same(got.Value.y, p[2].GetDouble()) && Same(got.Value.heading, p[3].GetDouble());
                Check(ok, $"{what} at {p[0].GetDouble()} s");
            }
        }
        Poses(ghost, g.GetProperty("poses"), "ghost pose");
        var packed = ghost.Pack(20);
        Check(packed != null && Json.Write(packed.ToJson()) == g.GetProperty("packed").GetString(), "ghost: packed to send as the web game packs it");
        if (packed != null) Poses(packed, g.GetProperty("packedPoses"), "packed ghost pose");
        Check(Json.Write(Ghost.Parse(Json.Parse(g.GetProperty("packed").GetString())).ToJson()) == g.GetProperty("packed").GetString() && Ghost.Parse(Json.Parse("{\"time\":3,\"splits\":[],\"frames\":[1,2]}")) == null, "ghost: read back; a broken one isn't one");
        var rival = Daily.ParseRival(Json.Parse("{\"name\":\"ZED\",\"score\":40,\"time\":120.5,\"ghost\":" + g.GetProperty("packed").GetString() + "}"));
        Check(rival != null && rival.Name == "ZED" && rival.Score == 40 && Daily.ParseRival(Json.Parse("{\"name\":\"ZED\",\"score\":40,\"time\":120.5,\"ghost\":{\"frames\":\"x\"}}")) == null, "the day's leading run to chase");
        var pending = new DailyPending { Day = "2026-11-27", Run = new DailyRun { Score = 7, Time = 61.23456 }, Ghost = packed };
        Check(Json.Write(Daily.SubmitArgs(pending, "p", "ABC", false)) == "{\"p_day\":\"2026-11-27\",\"p_player\":\"p\",\"p_name\":\"ABC\",\"p_score\":7,\"p_time\":61.23}" && Daily.SubmitArgs(pending, "p", "ABC", true).Has("p_ghost"), "submit_daily's arguments, with and without the ghost");
        var board = Daily.ParseBoard(Json.Parse("{\"entries\":3,\"top\":[{\"place\":1,\"name\":\"ZED\",\"score\":9,\"time\":80.1,\"you\":false}],\"you\":{\"place\":3,\"name\":\"ABC\",\"score\":5,\"time\":50}}"));
        Check(board != null && board.Entries == 3 && board.Top[0].Score == 9 && board.You?.Place == 3, "a day's board read back");
        Check(Daily.DayOf(new DateTime(2026, 11, 27, 23, 59, 0, DateTimeKind.Utc)) == "2026-11-27" && Daily.DayBefore("2026-03-01") == "2026-02-28" && Daily.UntilNext(new DateTime(2026, 11, 27, 23, 0, 0, DateTimeKind.Utc)) == TimeSpan.FromHours(1), "days, UTC");
    }
}
