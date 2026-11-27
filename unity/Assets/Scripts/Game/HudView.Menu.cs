// The menus' look (game.css .circuit-menu, .menu-tile, .option-row; menuTiles.ts): the race dimmed behind them, the
// title in gold, the modes as tiles with an icon over each name, a screen's rows with ◀ ▶ either side of the value, the
// highlighted one in cyan. Drawn with IMGUI like the HUD, in the same pixel font; what to show comes from Menu.cs.
using System.Collections.Generic;
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
            k = Screen.height / 720f * Mathf.Min(UiScale, 1.25f);
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
        public int DrawTiles(List<MenuTile> tiles, int focus, out int hover)
        {
            float w = Begin(), h = Screen.height / k;
            hover = -1;
            Text(0, h * 0.12f, w, 50, "CORNER CUTTERS", Style(34, Gold, TextAnchor.MiddleCenter), Shadow);
            const float big = 168, small = 120, gap = 14;
            float y = h * 0.12f + 80;
            int clicked = -1;
            int bigs = 0, smalls = 0;
            foreach (var t in tiles) if (t.Small) smalls++; else bigs++;
            float bx = w / 2 - (bigs * big + (bigs - 1) * gap) / 2, sx = w / 2 - (smalls * (big + 40) + (smalls - 1) * gap) / 2;
            for (int i = 0; i < tiles.Count; i++)
            {
                var t = tiles[i];
                float tw = t.Small ? big + 40 : big, th = t.Small ? 52 : big;
                float x = t.Small ? sx : bx, ty = t.Small ? y + big + gap + 30 : y;
                if (t.Small) sx += tw + gap; else bx += tw + gap;
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
                    Icon(t.Icon == "race" ? "flag" : t.Icon == "timeattack" ? "watch" : t.Icon, x + big / 2 - 22, ty + 30, 44, ink);
                    Text(x, ty + 92, tw, 24, t.Name, Style(13, ink, TextAnchor.MiddleCenter));
                    if (t.Line != null)
                    {
                        var st = Style(8, on ? Ink : Muted, TextAnchor.MiddleCenter);
                        st.wordWrap = true;
                        st.clipping = TextClipping.Clip;
                        GUI.Label(R(x + 8, ty + 118, tw - 16, 40), t.Line, st);
                    }
                }
                if (GUI.Button(r, GUIContent.none, GUIStyle.none)) clicked = i;
            }
            return clicked;
        }

        /// <summary>
        /// A screen of rows under its title (and a picture: the circuit's outline): each row's name, its value between ◀ and
        /// ▶, a line about it; a button row centred. The row clicked (-1: none), an arrow clicked on it (-1, 1; 0: the row),
        /// and the row under the mouse.
        /// </summary>
        public int DrawRows(string title, List<MenuRow> rows, int focus, Texture2D picture, string footer, out int arrow, out int hover)
        {
            float w = Begin(), h = Screen.height / k;
            arrow = 0;
            hover = -1;
            const float rw = 460, rh = 44, gap = 8;
            float ph = picture != null ? 190 : 0;
            float total = 46 + ph + rows.Count * (rh + gap);
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
                    float bw = 240;
                    var br = R(w / 2 - bw / 2, y, bw, rh);
                    Fill(br, on ? Hex(0x2e2b47) : KeyBg, 10 * k, Mathf.Max(1, k) * (on ? 2 : 1), on ? Cyan : KeyEdge);
                    Text(w / 2 - bw / 2, y, bw, rh, row.Label, Style(14, ink, TextAnchor.MiddleCenter));
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
