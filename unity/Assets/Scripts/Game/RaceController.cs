// One car on one circuit: lights, three laps, lap times, restart, pause, next circuit. The driving rules are the web
// game's (CornerCutters.Core, tested against it); this class only wires input, the fixed-step clock, the views and a
// placeholder HUD. No AI, pits, tyres, weather or menus yet (see unity/README.md for the phases).
using System.Collections.Generic;
using CornerCutters.Core;
using UnityEngine;
using Grid = CornerCutters.Core.Grid;

namespace CornerCutters.Game
{
    public sealed class RaceController : MonoBehaviour
    {
        const int Laps = 3;
        const double LightsSeconds = 3.0;
        // the web game's F1 car tops out at 320 px/s; shown as a real-looking number
        const double KmhPerPx = 340.0 / 320.0;

        enum Phase { Lights, Racing, Finished }

        readonly FixedClock clock = new FixedClock();
        readonly HandlingParams handling = HandlingParams.Race();
        GameInput input;
        ChaseCamera chase;
        CarView carView;
        GameObject circuitView;
        StartLights lights;
        CircuitData circuit;
        Grid grid;
        Track track;
        Car car;
        RaceProgress progress;
        Phase phase;
        double phaseTime, raceTime;
        bool paused;
        int circuitIndex;
        IReadOnlyList<string> ids;
        double bestLap = double.NaN;

        // the last two simulation poses, for drawing between steps
        double px, py, ph, pz, cx, cy, ch, cz;

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
            carView = new CarView(new Color(0.12f, 0.2f, 0.5f), new Color(0.96f, 0.72f, 0.12f));
            carView.Root.transform.SetParent(transform, false);
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
            circuitView = TrackView.Build(circuit);
            circuitView.transform.SetParent(transform, false);
            SceneryView.Build(circuitView, circuit);
            lights = new StartLights(circuitView.transform, circuit);
            bestLap = double.NaN;
            Restart();
        }

        void Restart()
        {
            var slot = circuit.slots[0];
            car = new Car(CarClass.F1(), slot.x, slot.y, slot.heading);
            car.Z = Sim.GroundAt(grid, car.X, car.Y).H;
            progress = Racing.NewProgress(Racing.NearestSample(track, car.X, car.Y));
            phase = Phase.Lights;
            phaseTime = raceTime = 0;
            paused = false;
            clock.Carry = 0;
            input.ResetWheel();
            px = cx = car.X; py = cy = car.Y; ph = ch = car.Heading; pz = cz = car.Z;
            chase.Snap();
        }

        void Update()
        {
            input.Poll();
            if (input.PausePressed) paused = !paused;
            if (input.RestartPressed) Restart();
            if (input.CircuitStep != 0) LoadCircuit(circuitIndex + input.CircuitStep);
            if (input.CameraPressed) chase.Cycle();

            float frame = Time.unscaledDeltaTime;
            if (!paused)
            {
                clock.Advance(frame, out int steps, out double alpha);
                for (int i = 0; i < steps; i++) Step();
                alpha = System.Math.Min(1, clock.Carry / clock.Step);
                Draw(alpha, frame);
            }
            else
            {
                Draw(1, frame);
            }
        }

        void Step()
        {
            double dt = FixedClock.SimDt;
            px = cx; py = cy; ph = ch; pz = cz;
            phaseTime += dt;
            DriveInput drive;
            if (phase == Phase.Lights)
            {
                // lights: the wheel is held until they go out (a jump start is a later phase's rule)
                drive = new DriveInput();
                if (phaseTime >= LightsSeconds) { phase = Phase.Racing; phaseTime = 0; }
            }
            else if (phase == Phase.Racing)
            {
                drive = Racing.WheelInput(input.Wheel(dt), car);
                raceTime += dt;
            }
            else
            {
                drive = new DriveInput();   // chequered flag: coast to a stop
            }
            Driving.StepCar(car, drive, handling, dt, grid);
            if (phase == Phase.Racing)
            {
                int lapsBefore = progress.Lap;
                progress = Racing.StepProgress(progress, track, car, raceTime, Laps, dt);
                if (progress.Lap > lapsBefore)
                {
                    double t = progress.LapTimes[progress.LapTimes.Count - 1];
                    if (double.IsNaN(bestLap) || t < bestLap) bestLap = t;
                }
                if (progress.Finished.HasValue) { phase = Phase.Finished; phaseTime = 0; }
            }
            cx = car.X; cy = car.Y; ch = car.Heading; cz = car.Z;
        }

        void Draw(double alpha, float frame)
        {
            lights.Show(phase == Phase.Lights ? StartLights.LitAt(phaseTime) : 0);
            double x = px + (cx - px) * alpha, y = py + (cy - py) * alpha, z = pz + (cz - pz) * alpha;
            double h = ph + Driving.AngleDiff(ch, ph) * alpha;
            var pos = Units.ToWorld(x, y, z);
            carView.Root.transform.SetPositionAndRotation(pos, Units.Rotation(car, grid, h));
            float speed01 = Mathf.Clamp01((float)(Driving.SpeedOf(car) / car.Cls.TopSpeed));
            // look a little ahead of where the car is going (the web game's lead: about 40 px at full speed)
            var lead = new Vector3((float)(car.Vx / car.Cls.TopSpeed * 2.5), 0, (float)(-car.Vy / car.Cls.TopSpeed * 2.5));
            chase.Follow(pos, Units.Yaw(h), speed01, lead, frame);
        }

        // ---- placeholder HUD (IMGUI: no UI assets yet) ----

        static string Time3(double t) => double.IsNaN(t) ? "--:--.---" : $"{(int)(t / 60)}:{t % 60:00.000}";

        void OnGUI()
        {
            if (car == null) return;
            float s = Screen.height / 720f;
            GUI.matrix = Matrix4x4.Scale(new Vector3(s, s, 1));
            float w = Screen.width / s, h = Screen.height / s;
            var big = new GUIStyle(GUI.skin.label) { fontSize = 54, fontStyle = FontStyle.Bold, alignment = TextAnchor.MiddleCenter };
            var mid = new GUIStyle(GUI.skin.label) { fontSize = 24, fontStyle = FontStyle.Bold };
            var small = new GUIStyle(GUI.skin.label) { fontSize = 15 };
            var centre = new GUIStyle(small) { alignment = TextAnchor.MiddleCenter };

            double kmh = Driving.SpeedOf(car) * KmhPerPx;
            GUI.Label(new Rect(w - 250, h - 90, 230, 50), $"{kmh:0} km/h", new GUIStyle(mid) { alignment = TextAnchor.MiddleRight, fontSize = 36 });
            double hp = car.Health / car.Cls.Health;
            GUI.Label(new Rect(w - 250, h - 40, 230, 24), $"damage {(1 - hp) * 100:0}%" + (car.Wrecked ? "  WRECKED" : ""), new GUIStyle(small) { alignment = TextAnchor.MiddleRight });

            GUI.Label(new Rect(20, 14, 500, 30), $"{circuit.name}   ({circuitIndex + 1}/{ids.Count})", mid);
            double lapNow = progress.LapStart.HasValue ? raceTime - progress.LapStart.Value : double.NaN;
            GUI.Label(new Rect(20, 48, 500, 24), $"LAP {System.Math.Min(Laps, progress.Lap + 1)}/{Laps}    {Time3(lapNow)}", small);
            GUI.Label(new Rect(20, 70, 500, 24), $"LAST {Time3(progress.LapTimes.Count > 0 ? progress.LapTimes[progress.LapTimes.Count - 1] : double.NaN)}    BEST {Time3(bestLap)}", small);
            if (progress.WrongWay > 0.8) GUI.Label(new Rect(0, 120, w, 60), "WRONG WAY", big);

            if (phase == Phase.Lights)
            {
                // the five lights, coming on one by one, all out for the start
                int lit = StartLights.LitAt(phaseTime);
                for (int i = 0; i < StartLights.Count; i++)
                {
                    GUI.color = i < lit ? new Color(1f, 0.08f, 0.05f) : new Color(0.25f, 0.05f, 0.05f);
                    GUI.DrawTexture(new Rect(w / 2 - 125 + i * 52, h * 0.2f, 42, 42), Texture2D.whiteTexture);
                }
                GUI.color = Color.white;
            }
            else if (phase == Phase.Racing && phaseTime < 1.0) GUI.Label(new Rect(0, h * 0.25f, w, 80), "GO", big);
            else if (phase == Phase.Finished)
            {
                GUI.Label(new Rect(0, h * 0.25f, w, 80), "FINISH", big);
                GUI.Label(new Rect(0, h * 0.25f + 70, w, 30), $"race {Time3(progress.Finished ?? 0)}   best lap {Time3(bestLap)}", centre);
            }
            if (paused) GUI.Label(new Rect(0, h * 0.4f, w, 80), "PAUSED", big);
            GUI.Label(new Rect(0, h - 28, w, 24), input.Hints, centre);
        }
    }
}
