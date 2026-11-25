// Replays the web game's golden traces (golden.json, made by `npm run unity:golden`) through the C# core and checks
// it lands in the same place. Run: dotnet run (from this folder).
using System;
using System.Collections.Generic;
using System.IO;
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

        Console.WriteLine(failures == 0 ? $"OK  {checks} checks" : $"{failures} of {checks} checks FAILED");
        return failures == 0 ? 0 : 1;
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
