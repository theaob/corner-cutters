// The toasts (screens/celebrate.ts achievementToast): an achievement, a medal, a mission, the streak, a reward, one at
// a time from the top of the screen, 3.2 s each, sliding in (still under less motion). And the trophy cabinet
// (circuitSelect.ts's TROPHIES): the Championships won, the medals tallied, then two tabs: each circuit's medals in a
// Time Trial and a Time Attack, and the achievements (those unlocked in gold, the rest dimmed with what they take).
using System.Collections.Generic;
using CornerCutters.Core;
using UnityEngine;

namespace CornerCutters.Game
{
    public sealed partial class HudView
    {
        struct ToastItem
        {
            public string Head, Name, About;
            public Color Color;
        }

        static readonly Queue<ToastItem> toasts = new Queue<ToastItem>();
        static ToastItem? toastUp;
        static float toastSince;
        /// <summary>s a toast stays up</summary>
        public const float ToastFor = 3.2f;

        /// <summary>A toast: its heading (ACHIEVEMENT, MEDAL, MISSION, STREAK, REWARD), what, and a line on it, in turn after any up.</summary>
        public static void Toast(string head, string name, string about, int color = 0xf2c14e)
        {
            toasts.Enqueue(new ToastItem { Head = head, Name = name, About = about, Color = Hex(color) });
        }

        /// <summary>The toast up now, over everything (the next in turn when it's done).</summary>
        public void DrawToasts()
        {
            float now = Time.unscaledTime;
            if (toastUp.HasValue && now - toastSince > ToastFor) toastUp = null;
            if (!toastUp.HasValue && toasts.Count > 0) { toastUp = toasts.Dequeue(); toastSince = now; }
            if (!toastUp.HasValue) return;
            var t = toastUp.Value;
            k = UiK();
            ts = Options.TextScale;
            float w = Screen.width / k, since = now - toastSince;
            // (in from the top, and out again; under less motion it only fades)
            float a = Mathf.Clamp01(Mathf.Min(since / 0.3f, (ToastFor - since) / 0.35f));
            float drop = Options.MotionReduced ? 0 : (1 - a) * -40;
            var name = Style(13, WithAlpha(Ink, a));
            var about = Style(9, WithAlpha(Muted, a));
            float tw = Mathf.Max(Width(t.Name, name), Width(t.About, about), 160);
            float bw = Mathf.Min(w - 32, tw + 56), bh = 50, x = w / 2 - bw / 2, y = 10 + drop;
            Fill(R(x, y, bw, bh), WithAlpha(Rgba(21, 20, 31, 0.94f), a), 8 * k, Mathf.Max(1, k), WithAlpha(t.Color, a));
            // the mark: a badge in the toast's colour
            Fill(R(x + 12, y + 13, 24, 24), WithAlpha(t.Color, a), 12 * k);
            Fill(R(x + 18, y + 19, 12, 12), WithAlpha(Rgba(21, 20, 31, 1), a), 6 * k);
            Text(x + 46, y + 6, bw - 52, 12, t.Head, Style(9, WithAlpha(t.Color, a)));
            Text(x + 46, y + 18, bw - 52, 16, t.Name, name);
            Text(x + 46, y + 34, bw - 52, 12, t.About, about);
            ts = 1;
        }

        /// <summary>The cabinet's contents: the circuits in the calendar's order (id, name, flag) and what's in it.</summary>
        public sealed class Cabinet
        {
            public List<(string id, string name, Texture2D flag)> Circuits = new List<(string, string, Texture2D)>();
            public Trophies Trophies;
            /// <summary>the achievements tab up (else the medals)</summary>
            public bool Achievements;
            /// <summary>how far down the achievements (rows scrolled)</summary>
            public int Scroll;
        }

        public enum CabinetChoice { None, Medals, Achievements, Back, Up, Down }

        public CabinetChoice DrawCabinet(Cabinet c, int focus)
        {
            float w = Begin(), h = Screen.height / k;
            var choice = CabinetChoice.None;
            const float pw = 520;
            float x = w / 2 - pw / 2, y = Mathf.Max(10, h * 0.04f);
            Text(0, y, w, 32, "TROPHIES", Style(22, Gold, TextAnchor.MiddleCenter), Shadow);
            y += 36;
            var t = c.Trophies;
            string titles = t.Titles == 0 ? "NO CHAMPIONSHIPS WON YET" : t.Titles == 1 ? "× 1 CHAMPIONSHIP WON" : $"× {t.Titles} CHAMPIONSHIPS WON";
            Text(0, y, w, 18, titles, Style(12, t.Titles > 0 ? Gold : Muted, TextAnchor.MiddleCenter));
            y += 22;
            // the tally: golds, silvers, bronzes
            int Count(Medal m)
            {
                int n = 0;
                foreach (var ci in c.Circuits) { if (t.MedalOn(ci.id, MedalKind.Trial) == m) n++; if (t.MedalOn(ci.id, MedalKind.Attack) == m) n++; }
                return n;
            }
            float tx = w / 2 - 105;
            foreach (var m in new[] { Medal.Gold, Medal.Silver, Medal.Bronze })
            {
                Badge(tx, y + 2, 16, m);
                Text(tx + 22, y, 40, 20, Count(m).ToString(), Style(13, Hex(Medals.ColorOf(m))));
                tx += 75;
            }
            y += 28;
            // the tabs
            int got = t.Unlocked.Count;
            if (Tab(w / 2 - 205, y, 200, "MEDALS", !c.Achievements, focus == 0)) choice = CabinetChoice.Medals;
            if (Tab(w / 2 + 5, y, 200, $"ACHIEVEMENTS {got}/{Trophies.Achievements.Length}", c.Achievements, focus == 1)) choice = CabinetChoice.Achievements;
            y += 36;
            float bottom = h - 70;
            if (!c.Achievements)
            {
                Text(x + 10, y, 220, 14, "CIRCUIT", Style(9, Muted));
                Text(x + 260, y, 120, 14, "TIME TRIAL", Style(9, Muted));
                Text(x + 390, y, 120, 14, "TIME ATTACK", Style(9, Muted));
                y += 16;
                float line = Mathf.Min(18, (bottom - 20 - y) / Mathf.Max(1, c.Circuits.Count));
                foreach (var ci in c.Circuits)
                {
                    float nx = x + 10;
                    if (ci.flag != null) { GUI.DrawTexture(R(nx, y + line / 2 - 5, 15, 10), ci.flag, ScaleMode.StretchToFill, true); nx += 20; }
                    Text(nx, y, 230, line, ci.name, Style(Mathf.Min(10, line * 0.6f), Ink));
                    MedalCell(x + 260, y, line, t.MedalOn(ci.id, MedalKind.Trial));
                    MedalCell(x + 390, y, line, t.MedalOn(ci.id, MedalKind.Attack));
                    y += line;
                }
                Text(0, y + 4, w, 14, "A LAP OR A RUN AS QUICK AS THE QUICKEST AI ON EASY: BRONZE · NORMAL: SILVER · HARD: GOLD", Style(8, Dim, TextAnchor.MiddleCenter));
            }
            else
            {
                const float line = 22;
                int rows = Mathf.Max(1, Mathf.FloorToInt((bottom - y) / line));
                c.Scroll = Mathf.Clamp(c.Scroll, 0, Mathf.Max(0, Trophies.Achievements.Length - rows));
                for (int i = c.Scroll; i < Trophies.Achievements.Length && i < c.Scroll + rows; i++)
                {
                    var a = Trophies.Achievements[i];
                    bool on = t.Unlocked.Contains(a.Id);
                    Fill(R(x + 10, y + 7, 9, 9), on ? Gold : Dim, 4.5f * k);
                    Text(x + 28, y, 180, line, a.Name, Style(10, on ? Gold : Muted));
                    Text(x + 200, y, pw - 210, line, a.About.ToUpperInvariant(), Style(8, on ? Ink : Dim));
                    y += line;
                }
                if (c.Scroll > 0) Text(x, bottom - 4 - rows * line - 14, pw, 12, "MORE ABOVE", Style(9, Muted, TextAnchor.MiddleRight));
                if (c.Scroll + rows < Trophies.Achievements.Length) Text(x, bottom - 2, pw, 12, "MORE BELOW", Style(9, Muted, TextAnchor.MiddleRight));
                // (the mouse's wheel scrolls)
                var e = Event.current;
                if (e != null && e.type == EventType.ScrollWheel) { choice = e.delta.y > 0 ? CabinetChoice.Down : CabinetChoice.Up; e.Use(); }
            }
            if (Button(w / 2 - 75, h - 56, 150, 32, "BACK", null)) choice = CabinetChoice.Back;
            if (focus == 2) Fill(R(w / 2 - 75, h - 56, 150, 32), Rgba(0, 0, 0, 0), 8 * k, Mathf.Max(1, k) * 2, Cyan);
            return choice;
        }

        bool Tab(float x, float y, float bw, string label, bool on, bool focused)
        {
            var r = R(x, y, bw, 28);
            Fill(r, on ? Hex(0x2e2b47) : KeyBg, 8 * k, Mathf.Max(1, k) * (focused ? 2 : 1), focused ? Cyan : on ? Gold : KeyEdge);
            Text(x, y, bw, 28, label, Style(11, on ? Gold : Ink, TextAnchor.MiddleCenter));
            return Tapped(r, GUIContent.none, GUIStyle.none);
        }

        void MedalCell(float x, float y, float line, Medal m)
        {
            if (m == Medal.None) { Text(x, y, 120, line, "-", Style(10, Dim)); return; }
            Badge(x, y + line / 2 - 6, 12, m);
            Text(x + 17, y, 100, line, Medals.NameOf(m), Style(Mathf.Min(10, line * 0.6f), Hex(Medals.ColorOf(m))));
        }

        /// <summary>A medal: a disc in its colour with a darker heart.</summary>
        void Badge(float x, float y, float d, Medal m)
        {
            var c = Hex(Medals.ColorOf(m));
            Fill(R(x, y, d, d), c, d / 2 * k);
            Fill(R(x + d * 0.28f, y + d * 0.28f, d * 0.44f, d * 0.44f), Color.Lerp(c, Color.black, 0.35f), d * 0.22f * k);
        }
    }
}
