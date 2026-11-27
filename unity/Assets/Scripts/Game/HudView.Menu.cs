// The menus' look (game.css .circuit-menu, .menu-tile, .option-row; menuTiles.ts): the race dimmed behind them, the
// title in gold, the modes as tiles with an icon over each name, a screen's rows with ◀ ▶ either side of the value, the
// highlighted one in cyan. Drawn with IMGUI like the HUD, in the same pixel font; what to show comes from Menu.cs.
using System.Collections.Generic;
using System.Linq;
using UnityEngine;

namespace CornerCutters.Game
{
    public sealed partial class HudView
    {
        static readonly Dictionary<string, Texture2D> outlines = new Dictionary<string, Texture2D>();

        /// <summary>A circuit's outline (as the minimap draws it), made once.</summary>
        public static Texture2D Outline(string id)
        {
            if (outlines.TryGetValue(id, out var t)) return t;
            var c = CircuitLoader.Load(id);
            double s = System.Math.Min(300.0 / c.width, 190.0 / c.height);
            t = Minimap(c, (int)System.Math.Round(c.width * s) * 2, (int)System.Math.Round(c.height * s) * 2, out _);
            outlines[id] = t;
            return t;
        }

        float Begin()
        {
            k = Mathf.Min(UiK(), Screen.height / 720f * 1.25f);
            if (font != null && font.material != null && font.material.mainTexture != null) font.material.mainTexture.filterMode = FilterMode.Point;
            Fill(new Rect(0, 0, Screen.width, Screen.height), Rgba(14, 13, 22, 0.62f));
            return Screen.width / k;
        }

        /// <summary>The title: CORNER CUTTERS, and PRESS A (or ENTER) blinking under it; true when clicked.</summary>
        public bool DrawTitle(float since, InputSource source)
        {
            float w = Begin(), h = Screen.height / k;
            Text(0, h * 0.34f, w, 60, "CORNER CUTTERS", Style(44, Gold, TextAnchor.MiddleCenter), Shadow);
            Text(0, h * 0.34f + 62, w, 20, "A RACING GAME OF SHORT CUTS AND LONG CORNERS", Style(11, Muted, TextAnchor.MiddleCenter));
            if (since % 1.2f < 0.8f) Text(0, h * 0.62f, w, 24, source == InputSource.Gamepad ? "PRESS A" : "PRESS ENTER", Style(16, Ink, TextAnchor.MiddleCenter), Shadow);
            Text(0, h - 30, w, 16, Menu.Version, Style(9, Dim, TextAnchor.MiddleCenter));
            return GUI.Button(new Rect(0, 0, Screen.width, Screen.height), GUIContent.none, GUIStyle.none);
        }

        /// <summary>The modes: three big tiles, two small under them; the highlighted one cyan. The one clicked (-1: none), and the one under the mouse.</summary>
        /// <summary>The menu's TODAY panel (todayPanel.ts): your streak and what it earns next, today's three missions and how far along each is.</summary>
        public sealed class TodayPanel
        {
            public string Streak, Next;
            public List<(string text, int progress, int goal, bool done)> Missions = new List<(string, int, int, bool)>();
        }

        public int DrawTiles(List<MenuTile> tiles, int focus, out int hover, TodayPanel today = null)
        {
            float w = Begin(), h = Screen.height / k;
            hover = -1;
            Text(0, h * 0.12f, w, 50, "CORNER CUTTERS", Style(34, Gold, TextAnchor.MiddleCenter), Shadow);
            const float small = 120, gap = 14;
            float y = h * 0.12f + 70;
            // (TODAY beside the tiles where there's room, else under them: the tiles a little smaller for it)
            const float tw0 = 230;
            bool beside = today != null && w >= 3 * 168 + 2 * gap + 2 * (tw0 + 24);
            float under = today != null && !beside ? 84 : 0;
            int clicked = -1;
            int bigs = 0, smalls = 0;
            foreach (var t in tiles) if (t.Small) smalls++; else bigs++;
            // (the modes three to a row, as big as fit over the small row)
            int cols = System.Math.Min(Menu.Columns, System.Math.Max(1, bigs)), bigRows = (bigs + cols - 1) / cols;
            float big = Mathf.Clamp((h - y - 52 - 30 - 70 - under - gap * (bigRows - 1)) / bigRows, 110, 168);
            if (today != null)
            {
                float rowsW = cols * big + (cols - 1) * gap;
                if (beside) DrawToday(today, w / 2 + rowsW / 2 + 24, y, tw0, false);
                else DrawToday(today, w / 2 - 230, y + bigRows * (big + gap) - gap + 30 + 52 + 12, 460, true);
            }
            float sx = w / 2 - (smalls * (big + 40) + (smalls - 1) * gap) / 2;
            int bi = 0;
            for (int i = 0; i < tiles.Count; i++)
            {
                var t = tiles[i];
                float tw = t.Small ? big + 40 : big, th = t.Small ? 52 : big;
                float x, ty;
                if (t.Small)
                {
                    x = sx;
                    ty = y + bigRows * (big + gap) - gap + 30;
                    sx += tw + gap;
                }
                else
                {
                    int row = bi / cols, col = bi % cols, inRow = System.Math.Min(cols, bigs - row * cols);
                    x = w / 2 - (inRow * big + (inRow - 1) * gap) / 2 + col * (big + gap);
                    ty = y + row * (big + gap);
                    bi++;
                }
                var r = R(x, ty, tw, th);
                if (r.Contains(Event.current.mousePosition)) hover = i;
                bool on = i == focus;
                var ink = on ? Cyan : Ink;
                Fill(r, on ? Hex(0x2e2b47) : KeyBg, 12 * k, Mathf.Max(1, k) * (on ? 2 : 1), on ? Cyan : KeyEdge);
                if (t.Small)
                {
                    Icon(t.Icon, x + 18, ty + th / 2 - 8, 16, ink);
                    Text(x + 44, ty, tw - 50, th, t.Name, Style(13, ink));
                }
                else
                {
                    // (laid out for a 168 px tile, scaled to the tile's size)
                    float u = big / 168f, ic = 44 * u;
                    Icon(t.Icon == "race" ? "flag" : t.Icon == "timeattack" ? "watch" : t.Icon == "championship" ? "cup" : t.Icon == "timetrial" ? "ghost" : t.Icon, x + big / 2 - ic / 2, ty + 30 * u, ic, ink);
                    Text(x, ty + 92 * u, tw, 24, t.Name, Style(13, ink, TextAnchor.MiddleCenter));
                    if (t.Line != null)
                    {
                        var st = Style(8, on ? Ink : Muted, TextAnchor.MiddleCenter);
                        st.wordWrap = true;
                        st.clipping = TextClipping.Clip;
                        GUI.Label(R(x + 8, ty + 92 * u + 24, tw - 16, big - 92 * u - 26), t.Line, st);
                    }
                }
                if (GUI.Button(r, GUIContent.none, GUIStyle.none)) clicked = i;
            }
            return clicked;
        }

        /// <summary>The TODAY panel at (x, y), `pw` wide: the streak, then the missions (`wide`: two to a line, under the tiles).</summary>
        void DrawToday(TodayPanel t, float x, float y, float pw, bool wide)
        {
            const float line = 15, pad = 8;
            int doneCount = t.Missions.Count(m => m.done);
            int lines = wide ? 1 + (t.Missions.Count + 1) / 2 : 2 + t.Missions.Count * 2;
            float ph = pad * 2 + 18 + line * lines + (wide ? 0 : 6);
            Fill(R(x, y, pw, ph), Panel, 8 * k, Mathf.Max(1, k), KeyEdge);
            float ty = y + pad;
            Icon("up", x + pad, ty + 4, 8, Gold);
            Text(x + pad + 12, ty, pw - 2 * pad - 12, 16, t.Streak, Style(11, Gold));
            Text(x + pad, ty, pw - 2 * pad, 16, t.Next, Style(9, Muted, TextAnchor.MiddleRight));
            ty += 18;
            Text(x + pad, ty, pw - 2 * pad, line, "TODAY'S MISSIONS", Style(10, Ink));
            Text(x + pad, ty, pw - 2 * pad, line, $"{doneCount}/3", Style(10, doneCount == 3 ? Cyan : Muted, TextAnchor.MiddleRight));
            ty += line + (wide ? 0 : 4);
            float cw = wide ? (pw - 2 * pad - 12) / 2 : pw - 2 * pad;
            for (int i = 0; i < t.Missions.Count; i++)
            {
                var m = t.Missions[i];
                float mx = x + pad + (wide ? (i % 2) * (cw + 12) : 0);
                float my = wide ? ty + (i / 2) * line : ty + i * line * 2;
                var ink = m.done ? Cyan : Ink;
                Fill(R(mx, my + 4, 7, 7), m.done ? Cyan : KeyBg, 2 * k, Mathf.Max(1, k), m.done ? Cyan : Muted);
                var st = Style(9, ink);
                st.wordWrap = !wide;
                st.clipping = TextClipping.Clip;
                GUI.Label(R(mx + 12, my, cw - 12 - 34, wide ? line : line * 2), m.text, st);
                Text(mx + cw - 32, my, 32, line, $"{m.progress}/{m.goal}", Style(9, m.done ? Cyan : Muted, TextAnchor.MiddleRight));
            }
        }

        /// <summary>
        /// A screen of rows under its title (and a picture: the circuit's outline): each row's name, its value between ◀ and
        /// ▶, a line about it; a button row centred. The row clicked (-1: none), an arrow clicked on it (-1, 1; 0: the row),
        /// and the row under the mouse.
        /// </summary>
        public int DrawRows(string title, List<MenuRow> rows, int focus, Texture2D picture, string footer, out int arrow, out int hover, List<(string place, string name, string team, string points, bool you)> table = null)
        {
            float w = Begin(), h = Screen.height / k;
            arrow = 0;
            hover = -1;
            const float rw = 460, gap = 8, line = 15;
            // (a long screen, the season's standings over its rows: the rows a little shorter)
            float rh = table != null ? 38 : 44;
            float ph = picture != null ? 190 : 0;
            float th = table != null ? 14 + table.Count * line : 0;
            float total = 46 + ph + th + rows.Count * (rh + gap);
            float y = Mathf.Max(12, h / 2 - total / 2);
            Text(0, y, w, 36, title, Style(22, Gold, TextAnchor.MiddleCenter), Shadow);
            y += 46;
            if (picture != null)
            {
                float pw = picture.width / 2f, phh = picture.height / 2f;
                GUI.DrawTexture(R(w / 2 - pw / 2, y + (180 - phh) / 2, pw, phh), picture, ScaleMode.StretchToFill, true);
                y += ph;
            }
            float x = w / 2 - rw / 2;
            if (table != null)
            {
                // the drivers' standings: place, name, team, points (you in gold)
                Fill(R(x, y - 4, rw, th), Rgba(21, 20, 31, 0.8f), 8 * k);
                float ty = y + 2;
                foreach (var r in table)
                {
                    var ink = r.you ? Gold : Ink;
                    Text(x + 14, ty, 30, line, r.place, Style(9, r.you ? Gold : Muted, TextAnchor.MiddleRight));
                    Text(x + 60, ty, 200, line, r.name, Style(9, ink));
                    Text(x + 260, ty, 80, line, r.team, Style(9, r.you ? Gold : Muted));
                    Text(x + rw - 94, ty, 80, line, r.points + " PTS", Style(9, ink, TextAnchor.MiddleRight));
                    ty += line;
                }
                y += th + 6;
            }
            int clicked = -1;
            for (int i = 0; i < rows.Count; i++)
            {
                var row = rows[i];
                bool on = i == focus;
                var ink = on ? Cyan : Ink;
                var r = R(x, y, rw, rh);
                if (r.Contains(Event.current.mousePosition)) hover = i;
                if (row.Button)
                {
                    float bw = row.About != null ? 360 : 240;
                    var br = R(w / 2 - bw / 2, y, bw, rh);
                    Fill(br, on ? Hex(0x2e2b47) : KeyBg, 10 * k, Mathf.Max(1, k) * (on ? 2 : 1), on ? Cyan : KeyEdge);
                    if (row.About == null) Text(w / 2 - bw / 2, y, bw, rh, row.Label, Style(14, ink, TextAnchor.MiddleCenter));
                    else
                    {
                        // (a line under its name: the round's circuit and forecast)
                        Text(w / 2 - bw / 2, y + 3, bw, rh * 0.55f, row.Label, Style(13, ink, TextAnchor.MiddleCenter));
                        Text(w / 2 - bw / 2, y + rh * 0.55f, bw, rh * 0.4f, row.About, Style(7, on ? Ink : Muted, TextAnchor.MiddleCenter));
                    }
                    if (GUI.Button(br, GUIContent.none, GUIStyle.none)) clicked = i;
                }
                else
                {
                    Fill(r, on ? Hex(0x2e2b47) : Rgba(37, 35, 58, 0.85f), 8 * k, Mathf.Max(1, k), on ? Cyan : KeyEdge);
                    Text(x + 14, y + 4, 130, 20, row.Label, Style(10, on ? Cyan : Muted));
                    if (row.About != null) Text(x + 14, y + 22, 200, 18, row.About, Style(7, Dim));
                    float vx = x + rw - 230, vw = 216;
                    bool turns = row.Left != null || row.Right != null;
                    if (turns)
                    {
                        Text(vx, y, 20, rh, "<", Style(14, on ? Cyan : Muted, TextAnchor.MiddleCenter));
                        Text(vx + vw - 20, y, 20, rh, ">", Style(14, on ? Cyan : Muted, TextAnchor.MiddleCenter));
                        if (GUI.Button(R(vx, y, 30, rh), GUIContent.none, GUIStyle.none)) { clicked = i; arrow = -1; }
                        else if (GUI.Button(R(vx + vw - 30, y, 30, rh), GUIContent.none, GUIStyle.none)) { clicked = i; arrow = 1; }
                    }
                    var vst = Style(13, ink, TextAnchor.MiddleCenter);
                    float tw = Width(row.Value ?? "", vst);
                    float cx = vx + vw / 2;
                    if (row.Swatch != null)
                    {
                        float sw = row.Swatch.Length * 9;
                        for (int j = 0; j < row.Swatch.Length; j++) Fill(R(cx - (tw + sw + 6) / 2 + j * 9, y + rh / 2 - 6, 8, 12), Hex(row.Swatch[j]), 2 * k);
                        cx += (sw + 6) / 2;
                    }
                    Text(cx - tw / 2 - 4, y, tw + 8, rh, row.Value ?? "", vst);
                    if (arrow == 0 && GUI.Button(r, GUIContent.none, GUIStyle.none)) clicked = i;
                }
                y += rh + gap;
            }
            if (footer != null) Text(0, h - 30, w, 16, footer, Style(9, Dim, TextAnchor.MiddleCenter));
            return clicked;
        }

        /// <summary>The shop from the menu: the same tiles as the pause screen's, the highlighted one cyan.</summary>
        public PauseChoice DrawShop(ShopState shop, int focus)
        {
            float w = Begin(), h = Screen.height / k;
            return ShopPanel(shop, w, h, focus);
        }

        /// <summary>Your initials from the menu.</summary>
        public PauseChoice DrawName(NameEdit e)
        {
            float w = Begin(), h = Screen.height / k;
            return Naming(e, w, h);
        }

        /// <summary>The key hints along the bottom of a menu.</summary>
        public void MenuHints(InputSource source)
        {
            float w = Screen.width / k, h = Screen.height / k;
            string text = source == InputSource.Gamepad ? "D-PAD MOVE   A PICK   B BACK" : "ARROWS MOVE   ENTER PICK   ESC BACK";
            Text(0, h - 52, w, 16, text, Style(9, Muted, TextAnchor.MiddleCenter));
        }
    }
}
