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
        Races(root);
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
            checks += stateChecks + evCount;
            Console.WriteLine($"race {id}: {(firstOff < 0 ? "matched" : $"off at {firstOff * dt:F1} s")}, {evCount} events, {stateChecks} state checks");
        }
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
}
