// The race's HUD as the web game lays it out on a wide screen (src/f1/race/hud.ts, readout.ts, icons.ts, banner.ts and
// game.css's .desktop rules), in its pixel font (Silkscreen, Resources/Fonts, OFL), drawn with IMGUI:
//   - the readout, top left: a 7 x 7 pixel icon, a label and a value a line (LAP, LAST, BEST, REC, CAR as five blocks)
//     on a dark rounded panel, the columns lined up;
//   - your place and the lap, top centre, in gold on the strip with its pink edge;
//   - the minimap, top right: the track in white, the pit lane thin and grey, the field in white, you a gold square;
//   - the timing tower under it (towerView.ts): the top three, then the cars round you, with their gaps;
//   - the banner, a third of the way down: the start lights as red dots (one every 0.6 s), GO!, WRONG WAY, FINISHED,
//     and the race's calls (SAFETY CAR, a penalty, blue flags, your stop);
//     and under the lights your team's card;
//   - the controls along the bottom left, the keys (or the pad's buttons) as keycaps;
//   - the pause screen: the race dimmed behind PAUSED and its buttons;
//   - the rain, falling over the picture (screenFx.ts createRain: streaks, as many as it's raining hard);
//   - qualifying's times and the results at the flag (resultsView.ts: the rows from Core.Results), as tables on a
//     panel in the middle, your row in gold, with their buttons.
// Sizes are the web game's CSS px at 720 px high, scaled with the screen.
using CornerCutters.Core;
using System.Linq;
using System.Collections.Generic;
using UnityEngine;

namespace CornerCutters.Game
{
    public sealed partial class HudView
    {
        public struct State
        {
            public double LapTime, Last, Best, Record;   // NaN: none
            public double Health;                        // 0..1
            public bool Wrecked;
            public int Lap, Laps;
            public bool Lights;
            public int Lit;                              // 0..5 while the lights are on
            public bool AllLit;                          // all five, held till they go out
            public double SinceGo;                       // s since lights out (or NaN)
            public double WrongWay;
            public bool Finished;
            public double RaceTime;
            public bool Paused;
            public double CarX, CarY;
            public InputSource Source;
            public string Team, Difficulty, Weather;
            /// <summary>your place in the race, of how many</summary>
            public int Place, Cars;
            /// <summary>the timing tower (null: not shown)</summary>
            public List<TowerRow> Tower;
            /// <summary>your tyres: compound and how much is left, in its colour</summary>
            public string Tyre;
            public Color TyreColor;
            /// <summary>your pit stop's banner (BOX, BOX · PITS LEFT; PIT LIMITER; PIT STOP 2.4), or null</summary>
            public string Pit;
            /// <summary>your next set, picked on the way to your box (NEXT: SOFT), in its colour; null: no pick</summary>
            public string TyreNext;
            public Color TyreNextColor;
            /// <summary>a call of the race's (SAFETY CAR, a penalty...), or null</summary>
            public string Notice;
            public Color NoticeColor;
            /// <summary>the team radio's line up now (null: none), and your team's brightest colour for its panel</summary>
            public string Radio;
            public Color RadioColor;
            /// <summary>the other cars, for the minimap</summary>
            public List<(double x, double y)> Others;
            /// <summary>the lap strip's own text (qualifying: QUALI · OUT LAP...), or null for place and lap</summary>
            public string Strip;
            /// <summary>how hard it's raining, 0…1</summary>
            public double Rain;
            /// <summary>in qualifying (the pause screen offers to skip it)</summary>
            public bool Quali;
            /// <summary>the weather picked, on its pause button</summary>
            public string WeatherChoice;
            /// <summary>the banner's own text over everything else (the grid walk's car, REPLAY), and its colour</summary>
            public string Banner;
            public Color BannerColor;
            /// <summary>what Enter or A does now (SKIP), shown at the bottom right; null for nothing</summary>
            public string Skip;
            /// <summary>GRID WALK in the settings: the pan down the grid before each race</summary>
            public bool GridWalk;
            /// <summary>the backend's there (STATS and NAME on the pause screen), STATS on, your initials (null: none yet)</summary>
            public bool Online, StatsOn;
            public string Name;
            /// <summary>your initials being picked on the pause screen (null: not)</summary>
            public NameEdit Edit;
            /// <summary>the Daily Challenge on (QUICK RACE back on the pause screen); the shop open on it (null: not)</summary>
            public bool Daily;
            /// <summary>the weather's the weekend's own (a Daily, a Championship round): no WEATHER button</summary>
            public bool WeatherFixed;
            /// <summary>split screen: this HUD is one player's half</summary>
            public bool Split;
            public ShopState Shop;
            /// <summary>s left on the Time Attack's clock (null: no clock, or not started)</summary>
            public double? Clock;
            /// <summary>the next medal here and what it asks for (GOLD: all won), in its colour; null: not a Time Trial or a Time Attack</summary>
            public (string text, Color color)? Medal;
            /// <summary>the pause screen's button the keys or the pad are on</summary>
            public int PauseFocus;
        }

        /// <summary>A row of the timing tower (towerView.ts): its place, the team's colours, the name, the gap; Gap null: the ··· between the top three and you.</summary>
        public struct TowerRow
        {
            public int Place;
            public Color Body, Trim;
            public string Name, Gap;
            public bool You, Out, Blue;
        }

        public enum PauseChoice { None, Resume, Restart, SkipQualifying, Weather, GridWalk, NextCircuit, Stats, Name, NameSave, NameCancel, Daily, QuickRace, Shop, ShopClose, ShopPick, MainMenu }

        /// <summary>The shop: every look, the ones yours, the one picked, and your streak (now and best).</summary>
        public sealed class ShopState
        {
            public List<CarStyle> Styles;
            public HashSet<string> Owned;
            public string Picked;
            public int Streak, Best;
        }

        /// <summary>the look clicked in the shop (with ShopPick)</summary>
        public string Picked { get; private set; }

        /// <summary>A Time Attack's end: TIME UP and how far, lines (text, colour), the day's board.</summary>
        public sealed class AttackTable
        {
            public string Title, Board, BoardTop;
            public List<(string text, int color)> Lines = new List<(string, int)>();
        }

        /// <summary>Initials being picked: three letters or digits, and the one being changed.</summary>
        public sealed class NameEdit
        {
            public const string Chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
            public readonly char[] Letters;
            public int Slot;
            public NameEdit(string name) { Letters = (name ?? "AAA").ToCharArray(); }
            /// <summary>The keys or the pad: up and down turn the letter, left and right move along. (Letters typed come as they're typed.)</summary>
            public void Steer(int dx, int dy)
            {
                if (dy != 0) Turn(Slot, -dy);
                if (dx != 0) Slot = System.Math.Max(0, System.Math.Min(2, Slot + dx));
            }
            public override string ToString() => new string(Letters);
            public void Turn(int slot, int by)
            {
                int i = Chars.IndexOf(Letters[slot]);
                Letters[slot] = Chars[((i + by) % Chars.Length + Chars.Length) % Chars.Length];
                Slot = slot;
            }
        }

        /// <summary>Qualifying's table: the title, the rows, where you start, the record line.</summary>
        public sealed class QualiTable
        {
            public string Title, Start, Note;
            public bool NoteNew;
            public List<QualifyingRow> Rows;
            /// <summary>the world board for this circuit and weather (null: none, or not read yet): your place, and its top</summary>
            public string Board, BoardTop;
        }

        /// <summary>The results: the title, your race at a glance, the rows, the record lines.</summary>
        public sealed class ResultsTable
        {
            public string Title;
            public List<SummaryBox> Summary;
            public List<ResultRow> Rows;
            public List<(string text, bool isNew)> Notes;
            /// <summary>the way on (NEXT CIRCUIT; CHAMPIONSHIP in a season), and whether the race can be run again</summary>
            public string Go = "NEXT CIRCUIT";
            public bool Again = true;
        }

        public enum TableChoice { None, Go, Again }

        // the web game's colours (game.css :root, hud.ts)
        static readonly Color Panel = Rgba(21, 20, 31, 0.75f), Strip = Rgba(21, 20, 31, 0.82f), MiniBg = Rgba(21, 20, 31, 0.6f);
        static readonly Color Muted = Hex(0x9d9ab8), Ink = Hex(0xf4f2fa), Gold = Hex(0xf2c14e), Red = Hex(0xd8323c), Cyan = Hex(0x5fe0d0);
        static readonly Color Accent = Hex(0xff4fd8), Line = Hex(0x2b2940), KeyBg = Hex(0x25233a), KeyEdge = Hex(0x3a3858), Shadow = Hex(0x1b1b26);

        Font font => Lang.Current.Code == "ja" ? Japanese : Pixel;
        static Font pixel, japanese;
        /// <summary>Silkscreen, the web game's; DotGothic16 for Japanese, which Silkscreen hasn't</summary>
        static Font Pixel => pixel ??= Resources.Load<Font>("Fonts/Silkscreen");
        static Font Japanese => japanese ??= Resources.Load<Font>("Fonts/DotGothic16") ?? Pixel;
        readonly Texture2D mini;
        readonly int miniW, miniH;
        readonly double miniScale;
        readonly CircuitData circuit;

        public HudView(CircuitData c)
        {
            circuit = c;
            // the minimap fits the circuit in a 136 x 140 box, whatever its shape; drawn at twice its size, as the web game's canvas
            double s = System.Math.Min(136.0 / c.width, 140.0 / c.height);
            miniW = (int)System.Math.Round(c.width * s);
            miniH = (int)System.Math.Round(c.height * s);
            mini = Minimap(c, miniW * 2, miniH * 2, out miniScale);
        }

        // ---- drawing helpers: rects in the web game's px, scaled ----

        float k;
        /// <summary>the text's size: TEXT: LARGE makes the menus' text and the race's messages (the banner, the radio, the pause screen) a fifth bigger</summary>
        float ts = 1;
        Rect R(float x, float y, float w, float h) => new Rect(x * k, y * k, w * k, h * k);

        GUIStyle Style(float px, Color color, TextAnchor anchor = TextAnchor.MiddleLeft)
        {
            var st = new GUIStyle { font = font, fontSize = Mathf.Max(1, Mathf.RoundToInt(px * k * ts)), alignment = anchor, clipping = TextClipping.Overflow, wordWrap = false };
            st.normal.textColor = color;
            return st;
        }

        /// <summary>(text is measured and drawn in the language in use: Lang.Say)</summary>
        float Width(string text, GUIStyle st) => st.CalcSize(new GUIContent(Lang.Say(text))).x / k;

        static void Fill(Rect r, Color c, float radius = 0, float border = 0, Color? edge = null)
        {
            GUI.DrawTexture(r, Texture2D.whiteTexture, ScaleMode.StretchToFill, true, 0, c, 0, radius);
            if (border > 0) GUI.DrawTexture(r, Texture2D.whiteTexture, ScaleMode.StretchToFill, true, 0, edge ?? c, border, radius);
        }

        void Text(float x, float y, float w, float h, string s, GUIStyle st, Color? shadow = null)
        {
            s = Lang.Say(s);
            if (shadow.HasValue)
            {
                var c = st.normal.textColor;
                st.normal.textColor = shadow.Value;
                GUI.Label(R(x, y + 2, w, h), s, st);
                st.normal.textColor = c;
            }
            GUI.Label(R(x, y, w, h), s, st);
        }

        void Icon(string name, float x, float y, float size, Color color)
        {
            var prev = GUI.color;
            GUI.color = color;
            GUI.DrawTexture(R(x, y, size, size), Icons.Get(name), ScaleMode.StretchToFill, true);
            GUI.color = prev;
        }

        // ---- the HUD ----

        public PauseChoice Draw(State s)
        {
            k = UiK();
            ts = 1;
            if (font != null && font.material != null && font.material.mainTexture != null) font.material.mainTexture.filterMode = FilterMode.Point;
            // (split screen: this player's half, the HUD a little smaller in it, no key hints)
            var area = Area ?? new Rect(0, 0, Screen.width, Screen.height);
            if (Area.HasValue) GUI.BeginGroup(area);
            if (s.Split) k *= 0.85f;
            float w = area.width / k, h = area.height / k;
            Rain(s.Rain, s.Paused, area.width, area.height);
            Readout(s);
            LapStrip(s, w);
            ClockView(s, w);
            Minimap(s, w);
            TowerView(s, w);
            ts = Options.TextScale;
            Banner(s, w, h);
            RadioPanel(s, w, h);
            ts = 1;
            if (!s.Split && !Phone) Controls(s, h);
            if (!Phone) SkipHint(s.Skip, s.Source, w, h);
            if (Area.HasValue) GUI.EndGroup();
            return s.Paused ? DrawPause(s) : PauseChoice.None;
        }

        /// <summary>where on the screen the HUD goes (null: all of it; split screen, a player's half)</summary>
        public Rect? Area;

        /// <summary>The pause screen alone, over the whole screen.</summary>
        public PauseChoice DrawPause(State s)
        {
            k = UiK();
            ts = Options.TextScale;
            var choice = Pause(s, Screen.width / k, Screen.height / k);
            ts = 1;
            return choice;
        }

        // ---- the rain (screenFx.ts createRain): 90 drops, as many falling as it's raining hard ----

        struct Drop { public float X, Y, V; }
        readonly Drop[] drops = Enumerable.Range(0, 90).Select(_ => new Drop { X = Random.value, Y = Random.value, V = 0.9f + Random.value * 0.6f }).ToArray();
        Texture2D streak;

        void Rain(double rain, bool paused, float sw0, float sh0)
        {
            int falling = Mathf.RoundToInt(drops.Length * (float)rain);
            if (falling <= 0 || Event.current.type != EventType.Repaint) return;
            if (streak == null) streak = Streak();
            float dt = paused ? 0 : Time.unscaledDeltaTime;
            // (in screen px: the web game's are CSS px, a stroke from the drop 4 across and 16 up)
            float sw = 5 * k, sh = 17 * k;
            for (int i = 0; i < falling; i++)
            {
                ref var d = ref drops[i];
                d.Y += d.V * dt * 1.6f;
                d.X -= d.V * dt * 0.25f;
                if (d.Y > 1) { d.Y -= 1; d.X = Random.value + 0.1f; }
                if (d.X < 0) d.X += 1.1f;
                GUI.DrawTexture(new Rect(d.X * sw0, d.Y * sh0 - sh, sw, sh), streak, ScaleMode.StretchToFill, true);
            }
        }

        /// <summary>A drop's streak: a 1 px line 4 across and 16 up, rgba(210,220,236,.45).</summary>
        static Texture2D Streak()
        {
            const int W = 5, H = 17;
            var px = new Color32[W * H];
            for (int y = 0; y < H; y++)
            {
                // (row y counted up from the bottom, where the line starts at x 0)
                float x = y * 4f / 16f;
                for (int i = 0; i < W; i++)
                {
                    float a = Mathf.Clamp01(1 - Mathf.Abs(i + 0.5f - (x + 0.5f)));
                    px[y * W + i] = new Color32(210, 220, 236, (byte)Mathf.RoundToInt(255 * 0.45f * a));
                }
            }
            var t = new Texture2D(W, H, TextureFormat.RGBA32, false) { filterMode = FilterMode.Bilinear, wrapMode = TextureWrapMode.Clamp, name = "rain" };
            t.SetPixels32(px);
            t.Apply(false, true);
            return t;
        }

        /// <summary>the phone's layout (game.css html:not(.desktop), race/hud.ts place): the controls on the screen, the HUD round them</summary>
        public static bool Phone;
        /// <summary>a tap on the touch screen this frame (screen px from the top left; TouchDeck), for the buttons</summary>
        public static Vector2? Tap;

        /// <summary>
        /// A button: clicked with the mouse, or tapped on the touch screen (TouchDeck's taps, taken once a frame; a touch the
        /// platform turns into a click is left to them, so a tap never counts twice).
        /// </summary>
        static bool Tapped(Rect r, GUIContent c, GUIStyle st)
        {
            var e = Event.current;
            if (Tap.HasValue && e != null && e.type == EventType.Repaint && r.Contains(GUIUtility.ScreenToGUIPoint(Tap.Value))) return true;
            if (e != null && e.isMouse && e.pointerType == PointerType.Touch) return false;
            return GUI.Button(r, c, st);
        }

        static string Fmt(double t) => double.IsNaN(t) ? "–" : $"{(int)(t / 60)}:{(t % 60):00.00}";

        /// <summary>Top left: icon, label, value a line, in three lined-up columns (readout.ts, readoutView.ts).</summary>
        void Readout(State s)
        {
            var st = Style(12, Muted);
            (string icon, string label, string value)[] rows =
            {
                ("watch", "LAP", Fmt(s.LapTime)), ("lap", "LAST", Fmt(s.Last)), ("star", "BEST", Fmt(s.Best)), ("cup", "REC", Fmt(s.Record)),
                ("car", "CAR", s.Wrecked ? "WRECKED" : null),
            };
            if (s.Tyre != null) rows = rows.Append(("lap", "TYRE", s.Tyre)).ToArray();
            const float icon = 8, gap = 4, line = 15, padX = 6, padY = 2;
            float labelW = 0, valueW = 5 * 7 + 4 * 2;
            foreach (var r in rows)
            {
                labelW = Mathf.Max(labelW, Width(r.label, st));
                if (r.value != null) valueW = Mathf.Max(valueW, Width(r.value, st));
            }
            float x0 = Phone ? 12 : 6, y0 = Phone ? 48 : 6;
            Fill(R(x0, y0, padX * 2 + icon + gap + labelW + gap + valueW, padY * 2 + line * rows.Length), Panel, 6 * k);
            for (int i = 0; i < rows.Length; i++)
            {
                float y = y0 + padY + i * line;
                Icon(rows[i].icon, x0 + padX, y + (line - icon) / 2, icon, Muted);
                Text(x0 + padX + icon + gap, y, labelW, line, rows[i].label, st);
                float vx = x0 + padX + icon + gap + labelW + gap;
                if (rows[i].label == "TYRE")
                {
                    var ts = Style(12, s.TyreColor);
                    Text(vx, y, valueW, line, rows[i].value, ts);
                }
                else if (rows[i].value != null) Text(vx, y, valueW, line, rows[i].value, st);
                else
                {
                    // five blocks, the health's share of them filled (■ and □)
                    int n = Mathf.CeilToInt((float)s.Health * 5);
                    for (int b = 0; b < 5; b++)
                    {
                        var box = R(vx + b * 9, y + (line - 7) / 2, 7, 7);
                        if (b < n) Fill(box, Muted);
                        else Fill(box, new Color(0, 0, 0, 0), 0, Mathf.Max(1, k), Muted);
                    }
                }
            }
        }

        /// <summary>Top centre: the lap, gold, on the strip with its pink left edge (game.css .desktop .strip).</summary>
        void LapStrip(State s, float w)
        {
            if (Phone)
            {
                // the phone's: your lap in a small panel under the minimap (your place is in the tower)
                string lap = s.Strip ?? $"LAP {Mathf.Clamp(s.Lap, 1, s.Laps)}/{s.Laps}";
                var ps = Style(12, Ink, TextAnchor.MiddleCenter);
                var mr = MiniRect(w);
                float pw = Width(lap, ps) + 16;
                Fill(R(w / 2 - pw / 2, mr.yMax + 6, pw, 20), Panel, 6 * k);
                Text(w / 2 - pw / 2, mr.yMax + 6, pw, 20, lap, ps);
                return;
            }
            var st = Style(17, Gold, TextAnchor.MiddleCenter);
            string text = s.Strip ?? (s.Cars > 1 ? $"P{s.Place}/{s.Cars}   " : "") + $"LAP {Mathf.Clamp(s.Lap, 1, s.Laps)}/{s.Laps}";
            float tw = Width(text, st), bw = tw + 32, x = w / 2 - bw / 2;
            Fill(R(x, 12, bw, 36), Strip, 8 * k, Mathf.Max(1, k), Line);
            // (the 3 px pink edge on its left)
            GUI.DrawTexture(R(x, 12, bw, 36), Texture2D.whiteTexture, ScaleMode.StretchToFill, true, 0, Accent, new Vector4(3 * k, 0, 0, 0), new Vector4(8 * k, 8 * k, 8 * k, 8 * k));
            Text(x, 12, bw, 36, text, st);
        }

        /// <summary>UI SCALE in the settings: AUTO (0, the default: sized by the window), or the HUD and the tables this much
        /// over the web game's size on a 720 px high screen.</summary>
        public static readonly float[] UiScales = { 0f, 1f, 1.2f, 1.4f, 1.6f, 1.8f };
        public static float UiScale
        {
            // (the device's own: a save moved to another screen leaves it)
            get { float v = (float)Save.Number("device", "uiScale", 0); return v == 0f || (v >= 0.9f && v <= 2f) ? v : 0f; }
            set => Save.Set("device", "uiScale", System.Math.Round(value, 2));
        }

        /// <summary>
        /// Pixels per UI unit (the web game's px on a 1280 x 720 screen). AUTO: 1.4 x as much as fits the window both ways
        /// (so a narrow or short window shrinks it, to keep the HUD on the screen), but never under 1 where the window is
        /// at least 720 high, so text stays readable; otherwise the chosen scale on the window's height.
        /// </summary>
        public static float UiK()
        {
            float h = Screen.height, w = Screen.width;
            float s = UiScale;
            // (on a phone: sized as the web game is on one, its layout drawn for a screen 390 px across, the short way)
            if (Phone) return Mathf.Min(w, h) / 390f * (s > 0 ? s : 1);
            if (s > 0) return h / 720f * s;
            float fit = Mathf.Min(w / 1280f, h / 720f);
            return Mathf.Max(fit * 1.4f, Mathf.Min(1f, h / 720f));
        }
        /// <summary>MINIMAP in the settings: its size over the web game's.</summary>
        public static readonly float[] MapScales = { 1f, 1.5f, 2f };
        public static float MapScale
        {
            get { float v = (float)Save.Number("device", "mapScale", 1.5); return v >= 0.9f && v <= 2.5f ? v : 1.5f; }
            set => Save.Set("device", "mapScale", System.Math.Round(value, 2));
        }

        /// <summary>Top right: the minimap, you a gold square (race.ts, ten times a second there; every frame here).</summary>
        /// <summary>Where the minimap goes (UI px) and its scale: top right; on a phone, top centre between the corners' buttons, as big as fits.</summary>
        Rect MiniRect(float w) => MiniRect(w, out _);

        Rect MiniRect(float w, out float m)
        {
            m = MapScale;
            if (Phone)
            {
                m = Mathf.Min(m, Mathf.Max(0.3f, (w - 2 * (12 + TouchDeck.SysW + 8)) / miniW), 1.2f);
                return new Rect(w / 2 - miniW * m / 2, 12, miniW * m, miniH * m);
            }
            return new Rect(w - 6 - miniW * m, 40, miniW * m, miniH * m);
        }

        void Minimap(State s, float w)
        {
            var mr = MiniRect(w, out float m);
            float mw = mr.width, mh = mr.height, x = mr.x, y = mr.y;
            Fill(R(x, y, mw, mh), MiniBg, 6 * k);
            GUI.DrawTexture(R(x, y, mw, mh), mini, ScaleMode.StretchToFill, true);
            // (canvas px are half a screen px: the dot is 7 of them)
            if (s.Others != null)
                foreach (var (ox, oy) in s.Others)
                {
                    float ex = (float)(4 + ox * miniScale) / 2 * m, ey = (float)(4 + oy * miniScale) / 2 * m;
                    Fill(R(x + ex - 1.25f * m, y + ey - 1.25f * m, 2.5f * m, 2.5f * m), Ink);
                }
            float dx = (float)(4 + s.CarX * miniScale) / 2 * m, dy = (float)(4 + s.CarY * miniScale) / 2 * m;
            Fill(R(x + dx - 1.75f * m, y + dy - 1.75f * m, 3.5f * m, 3.5f * m), Gold);
        }

        /// <summary>Under the minimap: the timing tower, as on TV (towerView.ts): place, a bar in the team's colours, name, gap; your row in gold.</summary>
        void TowerView(State s, float w)
        {
            if (s.Tower == null || s.Tower.Count == 0) return;
            const float line = 12, pad = 2;
            float tw = Phone ? 116 : Mathf.Max(96, miniW * MapScale), x = Phone ? w - 12 - tw : w - 6 - tw, y = Phone ? 48 : 40 + miniH * MapScale + 6;
            Fill(R(x, y, tw, pad * 2 + line * s.Tower.Count), Panel, 6 * k);
            var dim = Hex(0x6c6a88);
            for (int i = 0; i < s.Tower.Count; i++)
            {
                var r = s.Tower[i];
                float ry = y + pad + i * line;
                if (r.Gap == null)
                {
                    Text(x, ry, tw, line, "···", Style(10, dim, TextAnchor.MiddleCenter));
                    continue;
                }
                if (r.You) Fill(R(x, ry, tw, line), Rgba(242, 193, 78, 0.18f));
                var ink = r.You ? Gold : r.Out ? Hex(0x6c707a) : Ink;
                Text(x + 4, ry, 16, line, r.Place.ToString(), Style(10, ink));
                // the team's bar: its colour, its trim along the bottom
                Fill(R(x + 24, ry + (line - 9) / 2, 3, 9), r.Body);
                Fill(R(x + 24, ry + (line - 9) / 2 + 7, 3, 2), r.Trim);
                Text(x + 31, ry, 28, line, r.Name, Style(10, ink));
                Text(x + 31, ry, tw - 31 - 6, line, r.Gap, Style(10, r.Blue ? Hex(0x4fa3ff) : Muted, TextAnchor.MiddleRight));
            }
        }

        /// <summary>A third of the way down: the lights, then the most urgent message (banner.ts); the team card under the lights.</summary>
        void Banner(State s, float w, float h)
        {
            float y = Phone ? 198 : h * 0.3f;
            if (s.Banner != null)
            {
                Text(0, y, w, 30, s.Banner, Style(20, s.BannerColor, TextAnchor.MiddleCenter), Shadow);
                return;
            }
            if (s.Lights)
            {
                // ● ● ○ ○ ○ in red, 20 px type: drawn as dots, the font has no circles
                int lit = s.AllLit ? 5 : s.Lit;
                float d = 12, step = 24, x0 = w / 2 - (step * 4 + d) / 2;
                for (int i = 0; i < 5; i++)
                {
                    var r = R(x0 + i * step, y + 6, d, d);
                    Fill(new Rect(r.x, r.y + 2 * k, r.width, r.height), i < lit ? Shadow : new Color(0, 0, 0, 0), d * k / 2);
                    if (i < lit) Fill(r, Red, d * k / 2);
                    else Fill(r, new Color(0, 0, 0, 0), d * k / 2, Mathf.Max(1, 1.5f * k), Red);
                }
                // your team's card: name · difficulty · weather
                var cs = Style(12, Ink, TextAnchor.MiddleCenter);
                string card = $"{s.Team} · {s.Difficulty} · {s.Weather}";
                float cw = Width(card, cs) + 20;
                Fill(R(w / 2 - cw / 2, y + 34, cw, 26), Rgba(21, 20, 31, 0.8f), 10 * k);
                Text(w / 2 - cw / 2, y + 34, cw, 26, card, cs);
                return;
            }
            string text = null;
            Color color = Ink;
            if (s.Finished) { text = $"FINISHED · {Fmt(s.RaceTime)}"; color = Gold; }
            else if (s.Pit != null) { text = s.Pit; color = Gold; }
            else if (s.WrongWay > 1) { text = "WRONG WAY"; color = Red; }
            else if (!double.IsNaN(s.SinceGo) && s.SinceGo < 1.2) { text = "GO!"; color = Cyan; }
            else if (s.Notice != null) { text = s.Notice; color = s.NoticeColor; }
            if (text != null) Text(0, y, w, 30, text, Style(20, color, TextAnchor.MiddleCenter), Shadow);
            // (your next set, on the way to your box: under the banner, ◀ ▶ either side)
            if (s.TyreNext != null)
            {
                var ts = Style(13, s.TyreNextColor, TextAnchor.MiddleCenter);
                float tw = Mathf.Max(Width(s.TyreNext, ts) + 24, 150), bw = tw + 2 * 44 + 12, x = w / 2 - bw / 2, ty = y + 40;
                Fill(R(x, ty, bw, 52), Rgba(18, 17, 28, 0.82f), 14 * k, Mathf.Max(1, k), KeyEdge);
                var ks = Style(14, Ink, TextAnchor.MiddleCenter);
                Fill(R(x + 6, ty + 6, 44, 40), Rgba(37, 35, 58, 0.85f), 10 * k, Mathf.Max(1, k), KeyEdge);
                Text(x + 6, ty + 6, 44, 40, "<", ks);
                Text(x + 56, ty, tw, 52, s.TyreNext, ts, Shadow);
                Fill(R(x + bw - 50, ty + 6, 44, 40), Rgba(37, 35, 58, 0.85f), 10 * k, Mathf.Max(1, k), KeyEdge);
                Text(x + bw - 50, ty + 6, 44, 40, ">", ks);
            }
        }

        /// <summary>The team radio (race/hud.ts): your engineer's line along the bottom (above the key hints), in a dark panel
        /// edged and labelled in your team's colour.</summary>
        void RadioPanel(State s, float w, float h)
        {
            if (s.Radio == null) return;
            var label = Style(9, s.RadioColor);
            var text = Style(11, Ink);
            float ph = 4 + 12 + 2 + 15 + 4, bottom = 12 + 30 + 8;
            float x = Phone ? 36 : 6, y = Phone ? 236 : h - bottom - ph, pw = Phone ? w - 72 : w - 12;
            Fill(R(x, y, pw, ph), Rgba(21, 20, 31, 0.88f), 6 * k);
            Fill(R(x, y, 3, ph), s.RadioColor);
            // (◉ drawn as a ring and a dot: the pixel font has no circles)
            Fill(R(x + 11, y + 6, 8, 8), new Color(0, 0, 0, 0), 4 * k, Mathf.Max(1, k), s.RadioColor);
            Fill(R(x + 13.5f, y + 8.5f, 3, 3), s.RadioColor, 1.5f * k);
            Text(x + 23, y + 4, pw - 31, 12, "RADIO", label);
            Text(x + 11, y + 4 + 12 + 2, pw - 19, 15, s.Radio, text);
        }

        /// <summary>Bottom right: what Enter (or A) does now, as a keycap and its word.</summary>
        void SkipHint(string what, InputSource source, float w, float h)
        {
            if (what == null) return;
            string key = source == InputSource.Gamepad ? "A" : "ENTER";
            var keySt = Style(10, Ink, TextAnchor.MiddleCenter);
            var labelSt = Style(10, Muted);
            float kw = Width(key, keySt) + 12, lw = Width(what, labelSt), bw = 6 + kw + 5 + lw + 8;
            float x = w - 12 - bw, y = h - 12 - 30;
            Fill(R(x, y, bw, 30), Strip, 8 * k);
            Fill(R(x + 6, y + 5, kw, 20), KeyBg, 6 * k, Mathf.Max(1, k), KeyEdge);
            Text(x + 6, y + 5, kw, 20, key, keySt);
            Text(x + 6 + kw + 5, y, lw, 30, what, labelSt);
        }

        /// <summary>The ceremony's words over the picture (the set has no lettering of its own): each at a screen point (px from top left), in the pixel font.</summary>
        public void Words(IEnumerable<(Vector2 at, string text, Color color, float px, bool panel)> words, string skip, InputSource source)
        {
            k = UiK();
            ts = 1;
            foreach (var wd in words)
            {
                var st = Style(wd.px, wd.color, TextAnchor.MiddleCenter);
                float tw = Width(wd.text, st), th = wd.px * 1.6f;
                float x = wd.at.x / k - tw / 2, y = wd.at.y / k;
                if (wd.panel)
                {
                    Fill(R(x - 8, y, tw + 16, th + 6), Rgba(21, 20, 31, 0.85f), 6 * k);
                    Text(x, y + 3, tw, th, wd.text, st);
                }
                else Text(x, y - th / 2, tw, th, wd.text, st);
            }
            SkipHint(skip, source, Screen.width / k, Screen.height / k);
        }

        /// <summary>Bottom left: the controls, each as its key and what it does (the deck's key prompts on a wide screen).</summary>
        void Controls(State s, float h)
        {
            (string key, string label)[] items = s.Source == InputSource.Gamepad
                ? new[] { ("RT", "GAS"), ("LT", "BRAKE"), ("L", "STEER"), ("A", "DRIFT"), ("START", "PAUSE"), ("Y", "RESTART") }
                : new[] { ("W", "GAS"), ("S", "BRAKE"), ("A D", "STEER"), ("SPACE", "DRIFT"), ("ESC", "PAUSE"), ("R", "RESTART") };
            var keySt = Style(10, Ink, TextAnchor.MiddleCenter);
            var labelSt = Style(10, Muted);
            float x = 12, y = h - 12 - 30, pad = 6;
            float total = pad;
            foreach (var it in items) total += Width(it.key, keySt) + 12 + 5 + Width(it.label, labelSt) + 12;
            Fill(R(x, y, total - 12 + pad, 30), Strip, 8 * k);
            float cx = x + pad;
            foreach (var it in items)
            {
                float kw = Width(it.key, keySt) + 12;
                Fill(R(cx, y + 5, kw, 20), KeyBg, 6 * k, Mathf.Max(1, k), KeyEdge);
                Text(cx, y + 5, kw, 20, it.key, keySt);
                cx += kw + 5;
                float lw = Width(it.label, labelSt);
                Text(cx, y, lw, 30, it.label, labelSt);
                cx += lw + 12;
            }
        }

        /// <summary>The pause screen: the race dimmed, PAUSED in gold, and its buttons.</summary>
        /// <summary>the pause screen's buttons as last drawn (the keys and the pad pick among them)</summary>
        public List<PauseChoice> PauseItems { get; } = new List<PauseChoice>();

        PauseChoice Pause(State s, float w, float h)
        {
            Fill(new Rect(0, 0, Screen.width, Screen.height), Rgba(14, 13, 22, 0.55f));
            var list = new List<(string label, PauseChoice c)> { ("RESUME", PauseChoice.Resume), ("RESTART", PauseChoice.Restart) };
            if (s.Quali) list.Add(("SKIP QUALIFYING", PauseChoice.SkipQualifying));
            if (!s.Daily && !s.WeatherFixed && !s.Clock.HasValue) list.Add(($"WEATHER: {s.WeatherChoice}", PauseChoice.Weather));
            list.Add(($"GRID WALK: {(s.GridWalk ? "ON" : "OFF")}", PauseChoice.GridWalk));
            list.Add(("MAIN MENU", PauseChoice.MainMenu));
            PauseItems.Clear();
            PauseItems.AddRange(list.Select(b => b.c));
            float y = h / 2 - 25 * (list.Count + 1) - 10;
            Text(0, y, w, 34, "PAUSED", Style(22, Gold, TextAnchor.MiddleCenter), Shadow);
            y += 50;
            var choice = PauseChoice.None;
            float bw = Mathf.Min(w * 0.6f, 360);
            for (int i = 0; i < list.Count; i++)
            {
                var b = list[i];
                var r = R(w / 2 - bw / 2, y, bw, 40);
                bool on = i == s.PauseFocus;
                bool over = r.Contains(Event.current.mousePosition) || on;
                Fill(r, over ? Hex(0x2e2b47) : KeyBg, 10 * k, Mathf.Max(1, k) * (on ? 2 : 1), on ? Cyan : KeyEdge);
                Text(w / 2 - bw / 2, y, bw, 40, b.label, Style(14, on ? Cyan : Ink, TextAnchor.MiddleCenter));
                if (Tapped(r, GUIContent.none, GUIStyle.none)) choice = b.c;
                y += 50;
            }
            return choice;
        }

        /// <summary>Your initials for the world boards: three letters or digits, each turned with its arrows or typed; SAVE or CANCEL.</summary>
        PauseChoice Naming(NameEdit e, float w, float h)
        {
            var ev = Event.current;
            if (ev.type == EventType.KeyDown)
            {
                char c = char.ToUpperInvariant(ev.character);
                if (NameEdit.Chars.IndexOf(c) >= 0 && c != '\0') { e.Letters[e.Slot] = c; e.Slot = System.Math.Min(2, e.Slot + 1); ev.Use(); }
                else if (ev.keyCode == KeyCode.Backspace) { e.Slot = System.Math.Max(0, e.Slot - 1); ev.Use(); }
            }
            float y = h / 2 - 120;
            Text(0, y, w, 34, "YOUR NAME", Style(22, Gold, TextAnchor.MiddleCenter), Shadow);
            Text(0, y + 34, w, 18, "THREE LETTERS, FOR THE WORLD BOARDS", Style(11, Muted, TextAnchor.MiddleCenter));
            y += 70;
            const float cell = 56, gap = 14;
            float x0 = w / 2 - (cell * 3 + gap * 2) / 2;
            var big = Style(30, Ink, TextAnchor.MiddleCenter);
            for (int i = 0; i < 3; i++)
            {
                float x = x0 + i * (cell + gap);
                if (TapAt(x, y, cell, 24)) e.Turn(i, 1);
                Icon("up", x + cell / 2 - 5, y + 7, 10, Muted);
                Fill(R(x, y + 26, cell, 64), KeyBg, 8 * k, Mathf.Max(1, k) * (i == e.Slot ? 2 : 1), i == e.Slot ? Gold : KeyEdge);
                if (TapAt(x, y + 26, cell, 64)) e.Slot = i;
                Text(x, y + 26, cell, 64, e.Letters[i].ToString(), big);
                if (TapAt(x, y + 92, cell, 24)) e.Turn(i, -1);
                Icon("down", x + cell / 2 - 5, y + 99, 10, Muted);
            }
            y += 136;
            float bw = 150;
            if (Button(w / 2 - bw - 6, y, bw, 34, "SAVE", null)) return PauseChoice.NameSave;
            if (Button(w / 2 + 6, y, bw, 34, "CANCEL", null)) return PauseChoice.NameCancel;
            return PauseChoice.None;
        }

        /// <summary>The shop (carShop.ts): your car's looks, earned by your streak, three across; the one you wear in gold, locked ones dim with their days.</summary>
        PauseChoice ShopPanel(ShopState shop, float w, float h, int focus = -1)
        {
            const float tw = 150, th = 64, gap = 10;
            int cols = 3, rows = (shop.Styles.Count + cols - 1) / cols;
            float pw = cols * tw + (cols - 1) * gap, ph = rows * th + (rows - 1) * gap;
            float y = Mathf.Max(10, h / 2 - (ph + 130) / 2);
            Text(0, y, w, 34, "SHOP", Style(22, Gold, TextAnchor.MiddleCenter), Shadow);
            var next = Streaks.NextReward(shop.Best);
            Text(0, y + 32, w, 18, $"STREAK {shop.Streak} · BEST {shop.Best}" + (next != null ? $" · NEXT: {next.Name} AT {next.Days} DAYS" : ""), Style(11, Muted, TextAnchor.MiddleCenter));
            y += 60;
            float x0 = w / 2 - pw / 2;
            var choice = PauseChoice.None;
            for (int i = 0; i < shop.Styles.Count; i++)
            {
                var st = shop.Styles[i];
                float x = x0 + (i % cols) * (tw + gap), ty = y + (i / cols) * (th + gap);
                bool owned = shop.Owned.Contains(st.Id), picked = st.Id == shop.Picked;
                var r = R(x, ty, tw, th);
                bool over = owned && r.Contains(Event.current.mousePosition) || i == focus;
                Fill(r, over ? Hex(0x2e2b47) : KeyBg, 8 * k, Mathf.Max(1, k) * (picked || i == focus ? 2 : 1), i == focus ? Cyan : picked ? Gold : KeyEdge);
                // (a swatch of the look: its paint, and its helmet)
                var body = st.Body >= 0 ? Hex(st.Body) : Hex(0x3a3858);
                var stripe = st.Stripe >= 0 ? Hex(st.Stripe) : Muted;
                var helmet = st.Gold ? Hex(0xe8b830) : st.Led ? Hex(0x7cf6ff) : st.Helmet >= 0 ? Hex(st.Helmet) : Hex(0xe8e8ee);
                Fill(R(x + 10, ty + 12, 34, 40), body, 4 * k);
                Fill(R(x + 22, ty + 12, 10, 40), stripe);
                Fill(R(x + 21, ty + 24, 12, 12), helmet, 6 * k);
                var ink = owned ? (picked ? Gold : Ink) : Dim;
                Text(x + 52, ty + 10, tw - 58, 22, st.Name, Style(10, ink));
                Text(x + 52, ty + 32, tw - 58, 20, picked ? "WEARING" : owned ? "PICK" : $"{st.Days}-DAY STREAK", Style(9, picked ? Gold : owned ? Cyan : Dim));
                if (owned && !picked && Tapped(r, GUIContent.none, GUIStyle.none)) { Picked = st.Id; choice = PauseChoice.ShopPick; }
            }
            y += ph + 16;
            if (focus == shop.Styles.Count) Fill(R(w / 2 - 77, y - 2, 154, 38), Cyan, 9 * k);
            if (Button(w / 2 - 75, y, 150, 34, "BACK", null)) choice = PauseChoice.ShopClose;
            return choice;
        }

        /// <summary>Against the clock: the time left, big, under the strip (red in its last five seconds).</summary>
        void ClockView(State s, float w)
        {
            // (the next medal's target, under the clock, or where it would be)
            if (s.Medal.HasValue)
            {
                var m = s.Medal.Value;
                float my = s.Clock.HasValue ? 98 : 54;
                var mst = Style(11, m.color, TextAnchor.MiddleCenter);
                float mw = Width(m.text, mst) + 34;
                Fill(R(w / 2 - mw / 2, my, mw, 22), Strip, 6 * k);
                Fill(R(w / 2 - mw / 2 + 8, my + 6, 10, 10), m.color, 5 * k);
                Text(w / 2 - mw / 2 + 14, my, mw - 14, 22, m.text, mst, Shadow);
            }
            if (!s.Clock.HasValue) return;
            double left = s.Clock.Value;
            var st = Style(26, left < 5 ? Red : Cyan, TextAnchor.MiddleCenter);
            string text = $"{System.Math.Floor(left / 60)}:{(left % 60).ToString("00.0", System.Globalization.CultureInfo.InvariantCulture)}";
            float bw = 150, x = w / 2 - bw / 2;
            Fill(R(x, 54, bw, 40), Strip, 8 * k, Mathf.Max(1, k), Line);
            Text(x, 54, bw, 40, text, st, Shadow);
        }

        /// <summary>A Time Attack's end: TIME UP and how far, your best today and streak, the day's board; AGAIN or MENU.</summary>
        public TableChoice DrawAttack(AttackTable t, float since, InputSource source)
        {
            k = UiK(); ts = 1;
            float w = Screen.width / k, h = Screen.height / k;
            const float pw = 420;
            int lines = t.Lines.Count + (t.Board != null ? 1 : 0) + (t.BoardTop != null ? 1 : 0);
            float ph = 50 + 20 * lines + 64;
            float x = w / 2 - pw / 2, y = h / 2 - ph / 2;
            float a = Mathf.Clamp01(since / 0.3f);
            var panel = Rgba(21, 20, 31, 0.9f);
            panel.a *= a;
            Fill(R(x, y, pw, ph), panel, 10 * k, Mathf.Max(1, k), KeyEdge);
            Text(x, y + 12, pw, 26, t.Title, Style(17, Gold, TextAnchor.MiddleCenter), Shadow);
            float ty = y + 50;
            foreach (var (text, color) in t.Lines) { Text(x, ty, pw, 18, text, Style(12, Hex(color), TextAnchor.MiddleCenter)); ty += 20; }
            if (t.Board != null) { Text(x, ty, pw, 18, t.Board, Style(12, Cyan, TextAnchor.MiddleCenter)); ty += 20; }
            if (t.BoardTop != null) { Text(x, ty, pw, 18, t.BoardTop, Style(10, Muted, TextAnchor.MiddleCenter)); ty += 20; }
            ty += 12;
            if (Button(w / 2 - 205, ty, 200, 30, "AGAIN", source == InputSource.Gamepad ? "A" : "ENTER")) return TableChoice.Again;
            if (Button(w / 2 + 5, ty, 200, 30, "MENU", null)) return TableChoice.Go;
            return TableChoice.None;
        }

        bool TapAt(float x, float y, float bw, float bh) => Tapped(R(x, y, bw, bh), GUIContent.none, GUIStyle.none);

        // ---- qualifying's times and the results (resultsView.ts renderQualifying, renderResults) ----

        static readonly Color Purple = Hex(0xb36bff), Dim = Hex(0x6c6a88);

        /// <summary>A button on a table's panel; true when clicked.</summary>
        bool Button(float x, float y, float bw, float bh, string label, string key)
        {
            var r = R(x, y, bw, bh);
            bool over = r.Contains(Event.current.mousePosition);
            Fill(r, over ? Hex(0x2e2b47) : KeyBg, 8 * k, Mathf.Max(1, k), KeyEdge);
            Text(x, y, bw, bh, key == null || Phone ? label : $"{label}  ({key})", Style(12, Ink, TextAnchor.MiddleCenter));
            return Tapped(r, GUIContent.none, GUIStyle.none);
        }

        float RowIn(int place, float since) => Mathf.Clamp01((since - 0.15f - (place - 1) * 0.07f) / 0.35f);

        /// <summary>Qualifying's times: the title, the table (your row in gold), where you start, the record, RACE.</summary>
        public TableChoice DrawQualifying(QualiTable t, float since, InputSource source)
        {
            k = UiK(); ts = 1;
            float w = Screen.width / k, h = Screen.height / k;
            const float line = 15, pw = 380;
            int boardLines = (t.Board != null ? 1 : 0) + (t.BoardTop != null ? 1 : 0);
            float ph = 40 + 16 + line * t.Rows.Count + 20 + 18 + 18 + 48 + 16 * boardLines;
            float x = w / 2 - pw / 2, y = h / 2 - ph / 2;
            Fill(R(x, y, pw, ph), Rgba(21, 20, 31, 0.9f), 10 * k, Mathf.Max(1, k), KeyEdge);
            Text(x, y + 12, pw, 20, t.Title, Style(15, Gold, TextAnchor.MiddleCenter));
            float ty = y + 40;
            var head = Style(10, Muted);
            float c0 = x + 18, c1 = c0 + 26, c2 = c1 + 70, c3 = x + pw - 110, c4 = x + pw - 18;
            Text(c1, ty, 60, line, "NAME", head);
            Text(c2, ty, 50, line, "TEAM", head);
            Text(c3 - 80, ty, 80, line, "TIME", Style(10, Muted, TextAnchor.MiddleRight));
            Text(c4 - 80, ty, 80, line, "GAP", Style(10, Muted, TextAnchor.MiddleRight));
            ty += 16;
            foreach (var r in t.Rows)
            {
                float a = RowIn(r.Place, since);
                var ink = r.You ? Gold : Ink;
                ink.a = a;
                if (r.You) Fill(R(x + 8, ty, pw - 16, line), Rgba(242, 193, 78, 0.14f * a));
                float dx = (1 - a) * 12;
                Text(c0 - 20 + dx, ty, 32, line, r.Place.ToString(), Style(12, ink, TextAnchor.MiddleRight));
                Text(c1 + dx, ty, 70, line, r.Name, Style(12, ink));
                Text(c2 + dx, ty, 60, line, r.Team, Style(12, ink));
                Text(c3 - 90 + dx, ty, 90, line, r.Time, Style(12, ink, TextAnchor.MiddleRight));
                Text(c4 - 80 + dx, ty, 80, line, r.Gap, Style(12, ink, TextAnchor.MiddleRight));
                ty += line;
            }
            ty += 10;
            Text(x, ty, pw, 18, t.Start, Style(12, Gold, TextAnchor.MiddleCenter));
            ty += 18;
            NoteLine(x, ty, pw, t.Note, t.NoteNew);
            ty += 18;
            if (t.Board != null) { Text(x, ty, pw, 16, t.Board, Style(11, Cyan, TextAnchor.MiddleCenter)); ty += 16; }
            if (t.BoardTop != null) { Text(x, ty, pw, 16, t.BoardTop, Style(10, Muted, TextAnchor.MiddleCenter)); ty += 16; }
            ty += 8;
            return Button(w / 2 - 110, ty, 220, 30, "RACE", source == InputSource.Gamepad ? "A" : "ENTER") ? TableChoice.Go : TableChoice.None;
        }

        void NoteLine(float x, float y, float pw, string text, bool isNew)
        {
            var st = Style(12, isNew ? Gold : Ink);
            string s = isNew ? text + " · NEW!" : text;
            float tw = Width(s, st) + 12;
            Icon("cup", x + pw / 2 - tw / 2, y + 5, 8, isNew ? Gold : Ink);
            Text(x + pw / 2 - tw / 2 + 12, y, tw, 18, s, st);
        }

        /// <summary>The results: the title, your race in five boxes, the table, the key, the records, and the buttons.</summary>
        public TableChoice DrawResults(ResultsTable t, float since, InputSource source)
        {
            k = UiK(); ts = 1;
            float w = Screen.width / k, h = Screen.height / k;
            const float line = 15, pw = 460;
            float ph = 36 + (t.Summary.Count > 0 ? 50 : 0) + 16 + line * t.Rows.Count + 22 + 18 * t.Notes.Count + 48;
            float x = w / 2 - pw / 2, y = Mathf.Max(8, h / 2 - ph / 2);
            Fill(R(x, y, pw, ph), Rgba(21, 20, 31, 0.9f), 10 * k, Mathf.Max(1, k), KeyEdge);
            Text(x, y + 10, pw, 20, t.Title, Style(15, Gold, TextAnchor.MiddleCenter));
            float ty = y + 36;
            if (t.Summary.Count > 0)
            {
                const float bw = 80, gap = 5;
                float bx = w / 2 - (bw * t.Summary.Count + gap * (t.Summary.Count - 1)) / 2;
                foreach (var b in t.Summary)
                {
                    Fill(R(bx, ty, bw, 42), Rgba(255, 255, 255, 0.05f), 6 * k, Mathf.Max(1, k), KeyEdge);
                    var hs = Style(8, Muted);
                    float lw = Width(b.Label, hs) + 10;
                    Icon(b.Icon, bx + bw / 2 - lw / 2, ty + 7, 7, Muted);
                    Text(bx + bw / 2 - lw / 2 + 10, ty + 4, lw, 12, b.Label, hs);
                    ArrowText(bx, ty + 20, bw, 18, b.Value, Style(13, b.Color < 0 ? Ink : Hex(b.Color), TextAnchor.MiddleCenter));
                    bx += bw + gap;
                }
                ty += 50;
            }
            // place, ▲▼ moved, NAME, TEAM, TIME, BEST, notes
            float c0 = x + 30, c1 = x + 38, c2 = x + 76, c3 = x + 146, c4 = x + 290, c5 = x + 370, c6 = x + 380;
            Text(c2, ty, 60, line, "NAME", Style(10, Muted));
            Text(c3, ty, 60, line, "TEAM", Style(10, Muted));
            Text(c4 - 80, ty, 80, line, "TIME", Style(10, Muted, TextAnchor.MiddleRight));
            Text(c5 - 70, ty, 70, line, "BEST", Style(10, Muted, TextAnchor.MiddleRight));
            ty += 16;
            foreach (var r in t.Rows)
            {
                float a = RowIn(r.Place, since), dx = (1 - a) * 12;
                Color A(Color c) { c.a = a; return c; }
                var ink = A(r.You ? Gold : Ink);
                if (r.You) Fill(R(x + 8, ty, pw - 16, line), Rgba(242, 193, 78, 0.14f * a));
                Text(c0 - 30 + dx, ty, 30, line, r.Place.ToString(), Style(12, ink, TextAnchor.MiddleRight));
                if (r.Moved != 0)
                {
                    var mc = A(r.Moved > 0 ? Cyan : Red);
                    Icon(r.Moved > 0 ? "up" : "down", c1 + dx, ty + 4, 7, mc);
                    Text(c1 + 9 + dx, ty, 24, line, System.Math.Abs(r.Moved).ToString(), Style(12, mc));
                }
                else Text(c1 + dx, ty, 24, line, "–", Style(12, A(Dim)));
                Text(c2 + dx, ty, 70, line, r.Name, Style(12, ink));
                Text(c3 + dx, ty, 60, line, r.Team, Style(12, ink));
                Text(c4 - 120 + dx, ty, 120, line, r.Time, Style(12, ink, TextAnchor.MiddleRight));
                Text(c5 - 80 + dx, ty, 80, line, r.Best, Style(12, r.Fastest ? A(Purple) : ink, TextAnchor.MiddleRight));
                float nx = c6 + dx;
                if (r.Stops > 0)
                {
                    Icon("wrench", nx, ty + 4, 7, ink);
                    Text(nx + 9, ty, 20, line, r.Stops.ToString(), Style(12, ink));
                    nx += 22;
                }
                if (r.Penalty != 0)
                {
                    var pc = A(Red);
                    Icon("warn", nx, ty + 4, 7, pc);
                    Text(nx + 9, ty, 40, line, $"+{r.Penalty:0}S", Style(12, pc));
                }
                ty += line;
            }
            ty += 6;
            // the key: ▲▼ FROM THE GRID · wrench STOPS · warn PENALTY
            {
                var ks = Style(10, Muted);
                string a = "FROM THE GRID ·", b = "STOPS ·", c = "PENALTY";
                float tw = 16 + Width(a, ks) + 14 + Width(b, ks) + 14 + Width(c, ks), kx = w / 2 - tw / 2;
                Icon("up", kx, ty + 4, 7, Muted); Icon("down", kx + 7, ty + 4, 7, Muted); kx += 18;
                Text(kx, ty, 200, 15, a, ks); kx += Width(a, ks) + 4;
                Icon("wrench", kx, ty + 4, 7, Muted); kx += 10;
                Text(kx, ty, 200, 15, b, ks); kx += Width(b, ks) + 4;
                Icon("warn", kx, ty + 4, 7, Muted); kx += 10;
                Text(kx, ty, 200, 15, c, ks);
            }
            ty += 18;
            foreach (var n in t.Notes) { NoteLine(x, ty, pw, n.text, n.isNew); ty += 18; }
            ty += 6;
            bool pad = source == InputSource.Gamepad;
            if (!t.Again) return Button(w / 2 - 100, ty, 200, 30, t.Go, pad ? "A" : "ENTER") ? TableChoice.Go : TableChoice.None;
            if (Button(w / 2 - 205, ty, 200, 30, "RACE AGAIN", pad ? "Y" : "R")) return TableChoice.Again;
            if (Button(w / 2 + 5, ty, 200, 30, t.Go, pad ? "A" : "ENTER")) return TableChoice.Go;
            return TableChoice.None;
        }

        /// <summary>A value that may hold ▲ or ▼ (the font has neither): the arrows drawn as icons in its colour.</summary>
        void ArrowText(float x, float y, float bw, float bh, string text, GUIStyle st)
        {
            int at = text.IndexOfAny(new[] { '▲', '▼' });
            if (at < 0) { Text(x, y, bw, bh, text, st); return; }
            string head = text.Substring(0, at).TrimEnd(), tail = text.Substring(at + 1);
            float hw = Width(head, st), tw = Width(tail, st), total = hw + 4 + 8 + tw;
            float x0 = x + bw / 2 - total / 2;
            var left = new GUIStyle(st) { alignment = TextAnchor.MiddleLeft };
            Text(x0, y, hw + 4, bh, head, left);
            Icon(text[at] == '▲' ? "up" : "down", x0 + hw + 4, y + bh / 2 - 3.5f, 7, st.normal.textColor);
            Text(x0 + hw + 13, y, tw + 4, bh, tail, left);
        }

        // ---- the minimap's picture (circuitScene.ts minimap) ----

        static Texture2D Minimap(CircuitData c, int mw, int mh, out double scale)
        {
            double sc = System.Math.Min((mw - 8) / (c.width * c.tile), (mh - 8) / (c.height * c.tile));
            scale = sc;
            var px = new Color32[mw * mh];
            void Plot(double x, double y, float r, Color32 col)
            {
                int x0 = Mathf.FloorToInt((float)(x - r)), x1 = Mathf.CeilToInt((float)(x + r));
                int y0 = Mathf.FloorToInt((float)(y - r)), y1 = Mathf.CeilToInt((float)(y + r));
                for (int j = y0; j <= y1; j++)
                    for (int i = x0; i <= x1; i++)
                    {
                        if (i < 0 || j < 0 || i >= mw || j >= mh) continue;
                        double ddx = i + 0.5 - x, ddy = j + 0.5 - y;
                        if (ddx * ddx + ddy * ddy > r * r) continue;
                        px[(mh - 1 - j) * mw + i] = col;   // (texture rows run up)
                    }
            }
            void Stroke(double[] xs, double[] ys, bool closed, float width, Color32 col)
            {
                int n = xs.Length;
                for (int i = 0; i < (closed ? n : n - 1); i++)
                {
                    double ax = 4 + xs[i] * sc, ay = 4 + ys[i] * sc, bx = 4 + xs[(i + 1) % n] * sc, by = 4 + ys[(i + 1) % n] * sc;
                    int steps = Mathf.Max(1, Mathf.CeilToInt((float)System.Math.Sqrt((bx - ax) * (bx - ax) + (by - ay) * (by - ay)) * 2));
                    for (int t = 0; t <= steps; t++) Plot(ax + (bx - ax) * t / steps, ay + (by - ay) * t / steps, width / 2, col);
                }
            }
            Stroke(c.samples.x, c.samples.y, true, 2, (Color32)Ink);
            if (c.pits?.lane?.x != null) Stroke(c.pits.lane.x, c.pits.lane.y, false, 1, (Color32)Muted);
            var tex = new Texture2D(mw, mh, TextureFormat.RGBA32, false) { filterMode = FilterMode.Bilinear, wrapMode = TextureWrapMode.Clamp, name = "minimap" };
            tex.SetPixels32(px);
            tex.Apply(false, true);
            return tex;
        }

        static Color Hex(int rgb) => TrackView.Hex(rgb);
        static Color Rgba(int r, int g, int b, float a) => new Color(r / 255f, g / 255f, b / 255f, a);
    }

    /// <summary>The race's little pixel icons (src/f1/race/icons.ts): 7 x 7, drawn in the text's colour.</summary>
    public static class Icons
    {
        static readonly System.Collections.Generic.Dictionary<string, string[]> Art = new System.Collections.Generic.Dictionary<string, string[]>
        {
            ["watch"] = new[] { "..###..", "...#...", ".#####.", "#..#..#", "#..##.#", "#.....#", ".#####." },
            ["lap"] = new[] { ".####..", "#....#.", "#...###", "#....#.", "#......", "#.....#", ".#####." },
            ["star"] = new[] { "...#...", "...#...", "#######", ".#####.", "..###..", ".##.##.", ".#...#." },
            ["cup"] = new[] { "#######", "#.###.#", "#.###.#", ".#####.", "...#...", "...#...", ".#####." },
            ["car"] = new[] { ".#####.", "##.#.##", "...#...", "..###..", "##.#.##", "##.#.##", ".#####." },
            ["tyre"] = new[] { "..###..", ".#...#.", "#..#..#", "#.###.#", "#..#..#", ".#...#.", "..###.." },
            ["warn"] = new[] { "...#...", "..###..", "..#.#..", ".##.##.", ".#####.", "##.#.##", "#######" },
            ["wrench"] = new[] { ".#..#..", ".#..#..", ".####..", "..##...", "..##...", "..##...", "..##..." },
            ["flag"] = new[] { "#.#.#..", "##.#.#.", "#.#.#..", "##.#.#.", "#......", "#......", "#......" },
            ["ghost"] = new[] { "..###..", ".#####.", "##.#.##", "#######", "#######", "#######", "#.#.#.#" },
            // (▲ and ▼: the pixel font has neither)
            ["daily"] = new[] { ".#...#.", "#######", "#.....#", "#######", "#.....#", "#..#..#", "#######" },
            ["settings"] = new[] { "..#....", "#######", "..#....", ".....#.", "#######", ".....#.", "......." },
            ["shop"] = new[] { "..###..", ".#...#.", "#######", "#.....#", "#.#.#.#", "#..#..#", "#######" },
            ["play"] = new[] { ".#.....", ".##....", ".###...", ".####..", ".###...", ".##....", ".#....." },
            ["up"] = new[] { ".......", "...#...", "..###..", ".#####.", "#######", ".......", "......." },
            ["down"] = new[] { ".......", ".......", "#######", ".#####.", "..###..", "...#...", "......." },
        };
        static readonly System.Collections.Generic.Dictionary<string, Texture2D> made = new System.Collections.Generic.Dictionary<string, Texture2D>();

        public static Texture2D Get(string name)
        {
            if (made.TryGetValue(name, out var t) && t != null) return t;
            var rows = Art[name];
            t = new Texture2D(7, 7, TextureFormat.RGBA32, false) { filterMode = FilterMode.Point, wrapMode = TextureWrapMode.Clamp, name = name };
            var px = new Color32[49];
            for (int y = 0; y < 7; y++)
                for (int x = 0; x < 7; x++)
                    px[(6 - y) * 7 + x] = rows[y][x] == '#' ? new Color32(255, 255, 255, 255) : new Color32(255, 255, 255, 0);
            t.SetPixels32(px);
            t.Apply(false, true);
            made[name] = t;
            return t;
        }
    }
}
