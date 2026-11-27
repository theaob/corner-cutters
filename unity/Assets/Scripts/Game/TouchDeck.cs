// The touch screen's controls (src/engine/deck.ts and the phone layout in src/styles/game.css), over the race as on a
// phone: the floating thumbstick (a thumb landing anywhere on its side of the lower screen brings it there; let go, it
// glides back to its corner), or under DRIVING: STEER the steering slider and the GAS and BRAKE pedals in its and A's
// places; A on the other side (what's next: SKIP, RACE, NEXT, AGAIN; none while racing), DRIFT there on dirt; RESTART
// top left and PAUSE (EXIT) top right. STICK in the settings puts the stick on the left or the right. Every other tap is
// a tap on the screen's own buttons (HudView takes them as clicks), so the menus, the pause screen and the tables work
// by touch whether or not the platform turns touches into mouse clicks. Layout in the HUD's units (HudView.UiK).
using System.Collections.Generic;
using CornerCutters.Core;
using UnityEngine;
using UnityEngine.InputSystem;

namespace CornerCutters.Game
{
    public sealed class TouchDeck
    {
        // sizes (px, game.css): the stick and its knob, the face's A button, the slider and its knob, the pedals, the top buttons
        public const float StickD = 108, KnobD = 46, ButtonD = 62, SliderW = 140, SliderH = 60, SliderKnob = 48, GasW = 76, GasH = 100, BrakeW = 56, BrakeH = 68, SysW = 116, SysH = 28;
        const float Edge = 12, Bottom = 16;

        public static DriveStyle Style
        {
            get { int v = PlayerPrefs.GetInt("settings.driving", 0); return v >= 0 && v <= 2 ? (DriveStyle)v : DriveStyle.Auto; }
            set => PlayerPrefs.SetInt("settings.driving", (int)value);
        }

        /// <summary>the thumbstick on the right (A on the left): the web game's default</summary>
        public static bool StickRight
        {
            get => PlayerPrefs.GetInt("settings.stickRight", 1) != 0;
            set => PlayerPrefs.SetInt("settings.stickRight", value ? 1 : 0);
        }

        /// <summary>what each button does now ("" or null: hidden); the driving controls shown (racing, not paused or done); on dirt (DRIFT up)</summary>
        public string LabelA, LabelB, LabelStart, LabelSelect;
        public bool Driving, Dirt, Shown;

        /// <summary>a touch since the keys or a pad were last used</summary>
        public bool Used { get; private set; }
        /// <summary>the stick's reading (screen direction, y down, length 0…1) and its eight ways; the slider and pedals; DRIFT held</summary>
        public Vec2 Stick { get; private set; }
        public Dirs StickDirs { get; private set; }
        public double Turn { get; private set; }
        public bool Gas { get; private set; }
        public bool Brake { get; private set; }
        public bool DriftHeld { get; private set; }
        /// <summary>pressed this frame</summary>
        public bool APressed { get; private set; }
        public bool StartPressed { get; private set; }
        public bool SelectPressed { get; private set; }

        public bool Steering => Style == DriveStyle.Steer;

        enum Part { None, Stick, Slider, Gas, Brake, A, B, Start, Select, Tap }

        sealed class Held
        {
            public Part Part;
            public Vector2 From, At;
            public float Since;
        }

        readonly Dictionary<int, Held> held = new Dictionary<int, Held>();
        /// <summary>where the stick has floated to from its place at rest (UI px), and its knob from its centre</summary>
        public Vector2 StickOffset { get; private set; }
        public Vector2 Knob { get; private set; }
        public bool StickHeld { get; private set; }
        public float SliderAt { get; private set; }

        float W => Screen.width / HudView.UiK();
        float H => Screen.height / HudView.UiK();

        // ---- the layout (UI px, top left origin) ----

        public Vector2 StickHome => new Vector2(StickRight ? W - Edge - StickD / 2 : Edge + StickD / 2, H - Bottom - StickD / 2);
        /// <summary>A's (and DRIFT's) centre: mirrored from the stick's, its column (button, gap, label) centred on the row</summary>
        public Vector2 FaceCentre => new Vector2(StickRight ? Edge + StickD / 2 : W - Edge - StickD / 2, H - Bottom - StickD / 2 - 9);
        public Rect SliderRect => new Rect(StickRight ? W - Edge - SliderW : Edge, H - Bottom - GasH / 2 - SliderH / 2, SliderW, SliderH);
        public Rect GasRect => new Rect(StickRight ? Edge : W - Edge - GasW, H - Bottom - GasH, GasW, GasH);
        public Rect BrakeRect => new Rect(StickRight ? Edge + GasW + 8 : W - Edge - GasW - 8 - BrakeW, H - Bottom - BrakeH, BrakeW, BrakeH);
        public Rect StartRect => new Rect(Edge, Edge, SysW, SysH);
        public Rect SelectRect => new Rect(W - Edge - SysW, Edge, SysW, SysH);
        /// <summary>the floating stick's zone: its side of the lower half, short of the middle</summary>
        Rect Zone => new Rect(StickRight ? W / 2 + 36 : 0, H / 2, W / 2 - 36, H / 2);

        /// <summary>The face button up: A, or DRIFT in its place on dirt while A has nothing to do.</summary>
        public string FaceLabel => !string.IsNullOrEmpty(LabelA) ? LabelA : Dirt ? LabelB : "";
        bool FaceIsDrift => string.IsNullOrEmpty(LabelA) && Dirt && !string.IsNullOrEmpty(LabelB);

        static bool InCircle(Vector2 p, Vector2 c, float d) => (p - c).sqrMagnitude <= d * d / 4;

        Part PartAt(Vector2 p)
        {
            if (!Shown) return Part.Tap;
            if (!string.IsNullOrEmpty(LabelStart) && Grow(StartRect).Contains(p)) return Part.Start;
            if (!string.IsNullOrEmpty(LabelSelect) && Grow(SelectRect).Contains(p)) return Part.Select;
            if (FaceLabel != "" && InCircle(p, FaceCentre, ButtonD + 16)) return FaceIsDrift ? Part.B : Part.A;
            if (Driving && Steering)
            {
                if (Grow(GasRect).Contains(p)) return Part.Gas;
                if (Grow(BrakeRect).Contains(p)) return Part.Brake;
                if (Grow(SliderRect).Contains(p)) return Part.Slider;
            }
            else if (Driving && (Zone.Contains(p) || InCircle(p, StickHome + StickOffset, StickD))) return Part.Stick;
            return Part.Tap;
        }

        static Rect Grow(Rect r) => new Rect(r.x - 6, r.y - 6, r.width + 12, r.height + 12);

        /// <summary>Let go of everything (a key or a pad was used: the touches are no longer driving).</summary>
        public void Forget()
        {
            Used = false;
            held.Clear();
            Release();
        }

        void Release()
        {
            Stick = new Vec2(0, 0);
            StickDirs = Dirs.None;
            Knob = Vector2.zero;
            StickHeld = false;
            Turn = 0;
            SliderAt = 0;
            Gas = Brake = DriftHeld = false;
        }

        /// <summary>Read the touches once a frame: who's holding what, what's pressed, and the taps for the screen's buttons (HudView.Tap).</summary>
        public void Poll()
        {
            APressed = StartPressed = SelectPressed = false;
            HudView.Tap = null;
            var ts = Touchscreen.current;
            float k = HudView.UiK();
            var now = new Dictionary<int, Vector2>();
            if (ts != null)
                foreach (var t in ts.touches)
                {
                    if (!t.press.isPressed) continue;
                    var p = t.position.ReadValue();
                    // (the touchscreen's y up from the bottom; the HUD's down from the top, in its px)
                    now[t.touchId.ReadValue()] = new Vector2(p.x / k, (Screen.height - p.y) / k);
                }
            // lifted: a tap that stayed put is one on the screen's buttons
            var gone = new List<int>();
            foreach (var kv in held)
                if (!now.ContainsKey(kv.Key))
                {
                    var h = kv.Value;
                    if (h.Part == Part.Tap && (h.At - h.From).magnitude < 24 && Time.unscaledTime - h.Since < 0.8f) HudView.Tap = h.From * k;
                    gone.Add(kv.Key);
                }
            foreach (int id in gone) held.Remove(id);
            // landed
            foreach (var kv in now)
            {
                if (held.TryGetValue(kv.Key, out var h))
                {
                    h.At = kv.Value;
                    continue;
                }
                Used = true;
                var part = PartAt(kv.Value);
                held[kv.Key] = new Held { Part = part, From = kv.Value, At = kv.Value, Since = Time.unscaledTime };
                if (part == Part.A) APressed = true;
                else if (part == Part.Start) StartPressed = true;
                else if (part == Part.Select) SelectPressed = true;
                else if (part == Part.Stick && !StickHeld && Zone.Contains(kv.Value))
                {
                    // (the stick floats to the thumb, kept inside the screen)
                    var home = StickHome;
                    var o = TouchStick.FloatOffset(kv.Value.x, kv.Value.y, home.x, home.y, StickD / 2, 0, 0, W, H);
                    StickOffset = new Vector2((float)o.X, (float)o.Y);
                }
            }
            // what's held now
            Release();
            bool stickHeld = false;
            foreach (var h in held.Values)
            {
                switch (h.Part)
                {
                    case Part.Stick:
                        {
                            if (stickHeld) break;
                            stickHeld = true;
                            var c = StickHome + StickOffset;
                            var r = TouchStick.Read(h.At.x - c.x, h.At.y - c.y, (StickD - KnobD) / 2);
                            Stick = r.stick;
                            StickDirs = r.dirs;
                            Knob = new Vector2((float)r.knob.X, (float)r.knob.Y);
                            break;
                        }
                    case Part.Slider:
                        {
                            var sr = SliderRect;
                            float travel = (SliderW - SliderKnob) / 2;
                            Turn = TouchStick.SliderTurn(h.At.x - sr.center.x, travel);
                            SliderAt = (float)Turn * travel;
                            break;
                        }
                    case Part.Gas: Gas = true; break;
                    case Part.Brake: Brake = true; break;
                    case Part.B: DriftHeld = true; break;
                }
            }
            StickHeld = stickHeld;
            // (let go: the stick glides back to its corner)
            if (!stickHeld) StickOffset = Vector2.Lerp(StickOffset, Vector2.zero, Mathf.Min(1, Time.unscaledDeltaTime / 0.05f));
        }

        /// <summary>The wheel from the touches: pointing the way (POINT, or AUTO on a touch screen), or the slider and pedals (STEER).</summary>
        public Racing.WheelPad Wheel()
        {
            if (Steering) return new Racing.WheelPad { Turn = Turn, Gas = Gas ? 1 : 0, Brake = Brake ? 1 : 0, Drift = DriftHeld };
            return new Racing.WheelPad { Point = Stick, Gas = JsMath.Hypot(Stick.X, Stick.Y), Drift = DriftHeld };
        }
    }
}
