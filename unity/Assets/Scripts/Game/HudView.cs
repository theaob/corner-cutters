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
//   - the pause screen: the race dimmed behind PAUSED and its buttons.
// Sizes are the web game's CSS px at 720 px high, scaled with the screen.
using CornerCutters.Core;
using System.Linq;
using System.Collections.Generic;
using UnityEngine;

namespace CornerCutters.Game
{
    public sealed class HudView
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
            /// <summary>a call of the race's (SAFETY CAR, a penalty...), or null</summary>
            public string Notice;
            public Color NoticeColor;
            /// <summary>the other cars, for the minimap</summary>
            public List<(double x, double y)> Others;
        }

        /// <summary>A row of the timing tower (towerView.ts): its place, the team's colours, the name, the gap; Gap null: the ··· between the top three and you.</summary>
        public struct TowerRow
        {
            public int Place;
            public Color Body, Trim;
            public string Name, Gap;
            public bool You, Out, Blue;
        }

        public enum PauseChoice { None, Resume, Restart, NextCircuit }

        // the web game's colours (game.css :root, hud.ts)
        static readonly Color Panel = Rgba(21, 20, 31, 0.75f), Strip = Rgba(21, 20, 31, 0.82f), MiniBg = Rgba(21, 20, 31, 0.6f);
        static readonly Color Muted = Hex(0x9d9ab8), Ink = Hex(0xf4f2fa), Gold = Hex(0xf2c14e), Red = Hex(0xd8323c), Cyan = Hex(0x5fe0d0);
        static readonly Color Accent = Hex(0xff4fd8), Line = Hex(0x2b2940), KeyBg = Hex(0x25233a), KeyEdge = Hex(0x3a3858), Shadow = Hex(0x1b1b26);

        readonly Font font;
        readonly Texture2D mini;
        readonly int miniW, miniH;
        readonly double miniScale;
        readonly CircuitData circuit;

        public HudView(CircuitData c)
        {
            circuit = c;
            font = Resources.Load<Font>("Fonts/Silkscreen");
            // the minimap fits the circuit in a 136 x 140 box, whatever its shape; drawn at twice its size, as the web game's canvas
            double s = System.Math.Min(136.0 / c.width, 140.0 / c.height);
            miniW = (int)System.Math.Round(c.width * s);
            miniH = (int)System.Math.Round(c.height * s);
            mini = Minimap(c, miniW * 2, miniH * 2, out miniScale);
        }

        // ---- drawing helpers: rects in the web game's px, scaled ----

        float k;
        Rect R(float x, float y, float w, float h) => new Rect(x * k, y * k, w * k, h * k);

        GUIStyle Style(float px, Color color, TextAnchor anchor = TextAnchor.MiddleLeft)
        {
            var st = new GUIStyle { font = font, fontSize = Mathf.Max(1, Mathf.RoundToInt(px * k)), alignment = anchor, clipping = TextClipping.Overflow, wordWrap = false };
            st.normal.textColor = color;
            return st;
        }

        float Width(string text, GUIStyle st) => st.CalcSize(new GUIContent(text)).x / k;

        static void Fill(Rect r, Color c, float radius = 0, float border = 0, Color? edge = null)
        {
            GUI.DrawTexture(r, Texture2D.whiteTexture, ScaleMode.StretchToFill, true, 0, c, 0, radius);
            if (border > 0) GUI.DrawTexture(r, Texture2D.whiteTexture, ScaleMode.StretchToFill, true, 0, edge ?? c, border, radius);
        }

        void Text(float x, float y, float w, float h, string s, GUIStyle st, Color? shadow = null)
        {
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
            k = Screen.height / 720f;
            if (font != null && font.material != null && font.material.mainTexture != null) font.material.mainTexture.filterMode = FilterMode.Point;
            float w = Screen.width / k, h = Screen.height / k;
            Readout(s);
            LapStrip(s, w);
            Minimap(s, w);
            TowerView(s, w);
            Banner(s, w, h);
            Controls(s, h);
            return s.Paused ? Pause(w, h) : PauseChoice.None;
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
            float x0 = 6, y0 = 6;
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
            var st = Style(17, Gold, TextAnchor.MiddleCenter);
            string text = (s.Cars > 1 ? $"P{s.Place}/{s.Cars}   " : "") + $"LAP {Mathf.Clamp(s.Lap, 1, s.Laps)}/{s.Laps}";
            float tw = Width(text, st), bw = tw + 32, x = w / 2 - bw / 2;
            Fill(R(x, 12, bw, 36), Strip, 8 * k, Mathf.Max(1, k), Line);
            // (the 3 px pink edge on its left)
            GUI.DrawTexture(R(x, 12, bw, 36), Texture2D.whiteTexture, ScaleMode.StretchToFill, true, 0, Accent, new Vector4(3 * k, 0, 0, 0), new Vector4(8 * k, 8 * k, 8 * k, 8 * k));
            Text(x, 12, bw, 36, text, st);
        }

        /// <summary>Top right: the minimap, you a gold square (race.ts, ten times a second there; every frame here).</summary>
        void Minimap(State s, float w)
        {
            float x = w - 6 - miniW, y = 40;
            Fill(R(x, y, miniW, miniH), MiniBg, 6 * k);
            GUI.DrawTexture(R(x, y, miniW, miniH), mini, ScaleMode.StretchToFill, true);
            // (canvas px are half a screen px: the dot is 7 of them)
            if (s.Others != null)
                foreach (var (ox, oy) in s.Others)
                {
                    float ex = (float)(4 + ox * miniScale) / 2, ey = (float)(4 + oy * miniScale) / 2;
                    Fill(R(x + ex - 1.25f, y + ey - 1.25f, 2.5f, 2.5f), Ink);
                }
            float dx = (float)(4 + s.CarX * miniScale) / 2, dy = (float)(4 + s.CarY * miniScale) / 2;
            Fill(R(x + dx - 1.75f, y + dy - 1.75f, 3.5f, 3.5f), Gold);
        }

        /// <summary>Under the minimap: the timing tower, as on TV (towerView.ts): place, a bar in the team's colours, name, gap; your row in gold.</summary>
        void TowerView(State s, float w)
        {
            if (s.Tower == null || s.Tower.Count == 0) return;
            const float line = 12, pad = 2;
            float tw = Mathf.Max(96, miniW), x = w - 6 - tw, y = 40 + miniH + 6;
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
            float y = h * 0.3f;
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
            else if (s.WrongWay > 1) { text = "WRONG WAY"; color = Red; }
            else if (!double.IsNaN(s.SinceGo) && s.SinceGo < 1.2) { text = "GO!"; color = Cyan; }
            else if (s.Notice != null) { text = s.Notice; color = s.NoticeColor; }
            if (text == null) return;
            Text(0, y, w, 30, text, Style(20, color, TextAnchor.MiddleCenter), Shadow);
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
        PauseChoice Pause(float w, float h)
        {
            Fill(new Rect(0, 0, Screen.width, Screen.height), Rgba(14, 13, 22, 0.55f));
            float y = h / 2 - 110;
            Text(0, y, w, 34, "PAUSED", Style(22, Gold, TextAnchor.MiddleCenter), Shadow);
            y += 50;
            var choice = PauseChoice.None;
            (string label, PauseChoice c)[] buttons = { ("RESUME", PauseChoice.Resume), ("RESTART", PauseChoice.Restart), ("NEXT CIRCUIT", PauseChoice.NextCircuit) };
            float bw = Mathf.Min(w * 0.6f, 360);
            var st = Style(14, Ink, TextAnchor.MiddleCenter);
            foreach (var b in buttons)
            {
                var r = R(w / 2 - bw / 2, y, bw, 40);
                bool over = r.Contains(Event.current.mousePosition);
                Fill(r, over ? Hex(0x2e2b47) : KeyBg, 10 * k, Mathf.Max(1, k), KeyEdge);
                Text(w / 2 - bw / 2, y, bw, 40, b.label, st);
                if (GUI.Button(r, GUIContent.none, GUIStyle.none)) choice = b.c;
                y += 50;
            }
            return choice;
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
