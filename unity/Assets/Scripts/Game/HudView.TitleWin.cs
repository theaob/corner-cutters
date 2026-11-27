// The Championship won (Core/TitleWin.cs, screens/titleWin.ts): drawn over the season's standings until it's closed.
using CornerCutters.Core;
using UnityEngine;

namespace CornerCutters.Game
{
    public sealed partial class HudView
    {
        /// <summary>The title card: your team and your season, and when it opened.</summary>
        public sealed class TitleCard
        {
            public string Team, Line, How;
            public int Body, Trim;
            /// <summary>a still card (less motion): no rays turning, no fireworks or confetti</summary>
            public bool Still;
            public float Opened = Time.unscaledTime;
            public TitleSky Sky;
            public float Age => Time.unscaledTime - Opened;
            /// <summary>it can be closed: up long enough for the tap that got here not to close it</summary>
            public bool Closable => Age >= TitleWin.HoldS;
            /// <summary>closing (title-out: 0.3 s), and when</summary>
            public float Closing = -1;
            public bool Gone => Closing >= 0 && Time.unscaledTime - Closing > 0.3f;
            public void Close() { if (Closable && Closing < 0) Closing = Time.unscaledTime; }
        }

        /// <summary>Draw `c` over everything. True if it was tapped (closing it, once it can be).</summary>
        public bool DrawTitleWin(TitleCard c)
        {
            k = UiK();
            ts = Options.TextScale;
            float w = Screen.width / k, h = Screen.height / k, t = c.Age;
            float fade = c.Closing >= 0 ? 1 - Mathf.Clamp01((Time.unscaledTime - c.Closing) / 0.3f) : Mathf.Clamp01(t / 0.4f);
            var prev = GUI.color;
            GUI.color = new Color(1, 1, 1, fade);
            Fill(new Rect(0, 0, Screen.width, Screen.height), Rgba(14, 13, 22, 0.94f));

            // the rays, turning behind the trophy (centred 38% down), fading out from the middle
            float cx = w / 2, cy = h * 0.38f;
            float turn = c.Still ? 0 : (float)(t / TitleWin.RaysTurnS * 360);
            float reach = Mathf.Max(w, h) * 0.9f;
            var keep = GUI.matrix;
            for (int i = 0; i < 20; i++)
            {
                GUIUtility.RotateAroundPivot(turn + i * 18, new Vector2(cx * k, cy * k));
                for (int s = 0; s < 6; s++)
                {
                    float r0 = reach * s / 6, r1 = reach * (s + 1) / 6, width = (r0 + r1) / 2 * 0.12f;
                    Fill(R(cx + r0, cy - width / 2, r1 - r0, width), new Color(0.95f, 0.76f, 0.31f, 0.16f * (1 - (s + 0.5f) / 6)));
                }
                GUI.matrix = keep;
            }

            // the fireworks and the confetti (in UI px)
            if (!c.Still)
            {
                c.Sky ??= new TitleSky(w, h, (uint)(c.Opened * 1000));
                c.Sky.Step(Time.unscaledDeltaTime);
                foreach (var s in c.Sky.Sparks)
                    Fill(R((float)s.X, (float)s.Y, 3, 3), WithAlpha(TrackView.Hex(s.Color), Mathf.Min(1, (float)s.Life * 1.4f)));
                foreach (var b in c.Sky.Bits)
                    Fill(R((float)b.X, (float)b.Y, (float)b.Size, (float)(b.Size * System.Math.Abs(System.Math.Cos(b.Spin)))), WithAlpha(TrackView.Hex(b.Color), (float)TitleSky.BitAlpha(c.Sky.T - b.Born)));
            }

            // the column: the trophy, WORLD CHAMPION, the team's band, the season in numbers, how it was won, TAP TO CONTINUE
            float cupH = 168, cupW = cupH * 32 / 36;
            var cup = c.Still ? (0.0, 1.0, 1.0) : TitleWin.Cup(t);
            float top = h * 0.5f - 190;
            // (its glow)
            Fill(R(cx - cupW * 0.7f, top + (float)cup.Item1 + cupH * 0.05f, cupW * 1.4f, cupH * 0.9f), new Color(0.95f, 0.76f, 0.31f, 0.10f), cupW * 0.7f * k);
            DrawTrophy(cx, top + (float)cup.Item1, cupH * (float)cup.Item2, (float)cup.Item3);

            float y = top + cupH + 14;
            var head = Style(30, Gold, TextAnchor.MiddleCenter);
            string word = Lang.Say("WORLD CHAMPION");
            float hw = Width(word, head);
            float lx = cx - hw / 2;
            for (int i = 0; i < word.Length; i++)
            {
                string ch = word[i].ToString();
                float cw = Width(ch, head);
                var st = c.Still ? (1.0, 0.0, 1.0) : TitleWin.Stamp(t - (0.5 + i * 0.05));
                if (st.Item3 > 0 && ch != " ")
                {
                    float sc = (float)st.Item1;
                    var one = Style(30 * sc, WithAlpha(Gold, (float)st.Item3), TextAnchor.MiddleCenter);
                    Text(lx + cw / 2 - 40, y + (float)st.Item2, 80, 40, ch, one, WithAlpha(Hex(0x6b4b10), (float)st.Item3));
                }
                lx += cw;
            }
            y += 54;

            var band = c.Still ? (1.0, 0.0, 1.0) : TitleWin.Stamp(t - 1.3, 0.4);
            if (band.Item3 > 0)
            {
                var bandSt = Style(15 * (float)band.Item1, WithAlpha(Ink, (float)band.Item3), TextAnchor.MiddleCenter);
                string name = Lang.Upper(c.Team);
                float bw = Width(name, Style(15, Ink)) + 44;
                float bh = 34 * (float)band.Item1;
                float by = y + (float)band.Item2 - (bh - 34) / 2;
                Fill(R(cx - bw * (float)band.Item1 / 2, by, bw * (float)band.Item1, bh), WithAlpha(TrackView.Hex(c.Body), (float)band.Item3));
                Fill(R(cx - bw * (float)band.Item1 / 2, by, bw * (float)band.Item1, 4), WithAlpha(TrackView.Hex(c.Trim), (float)band.Item3));
                Fill(R(cx - bw * (float)band.Item1 / 2, by + bh - 4, bw * (float)band.Item1, 4), WithAlpha(TrackView.Hex(c.Trim), (float)band.Item3));
                Text(cx - 300, by, 600, bh, name, bandSt, WithAlpha(Color.black, (float)band.Item3));
            }
            y += 48;

            float words = c.Still ? 1 : Mathf.Clamp01((t - 1.6f) / 0.4f);
            if (words > 0)
            {
                Text(cx - 400, y, 800, 20, c.Line, Style(13, WithAlpha(Ink, words), TextAnchor.MiddleCenter));
                Text(cx - 400, y + 24, 800, 18, c.How, Style(11, WithAlpha(Muted, words), TextAnchor.MiddleCenter));
            }
            float tap = c.Still ? 1 : Mathf.Clamp01((t - 2f) / 0.4f);
            if (tap > 0)
            {
                // (blinking, after it's come in: tap-blink)
                bool dim = !c.Still && t > 2.4f && ((t - 2.4f) % 1f) >= 0.5f;
                Text(cx - 300, y + 64, 600, 20, Phone ? "TAP TO CONTINUE" : "PRESS A BUTTON", Style(13, WithAlpha(Accent, tap * (dim ? 0.35f : 1)), TextAnchor.MiddleCenter));
            }
            GUI.color = prev;
            bool tapped = Tapped(new Rect(0, 0, Screen.width, Screen.height), GUIContent.none, GUIStyle.none);
            if (tapped) c.Close();
            return tapped;
        }

        /// <summary>The trophy, `size` px high, its top centre at (cx, top).</summary>
        void DrawTrophy(float cx, float top, float size, float alpha)
        {
            float u = size / 36, left = cx - 16 * u;
            foreach (var b in TitleWin.Trophy) Fill(R(left + b.x * u, top + b.y * u, b.w * u, b.h * u), WithAlpha(TrackView.Hex(b.rgb), alpha));
        }
    }
}
