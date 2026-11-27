// The touch deck drawn (game.css's phone deck): the floating thumbstick, dimmed at rest in its corner; or the steering
// slider and the GAS and BRAKE pedals; A (or DRIFT on dirt) with what it does under it; RESTART and PAUSE (EXIT) in the
// top corners. Where they are and what's held is TouchDeck's.
using UnityEngine;

namespace CornerCutters.Game
{
    public sealed partial class HudView
    {
        /// <summary>A glyph on a face button for what it does (the pixel font's: the web game draws icons).</summary>
        static string Glyph(string label) => label == "DRIFT" ? "~" : label == "AGAIN" || label == "RESTART" ? "R" : label == "MENU" || label == "EXIT" ? "<" : ">";

        public void DrawDeck(TouchDeck d)
        {
            if (!d.Shown) return;
            k = UiK();
            ts = 1;
            if (d.Driving && !d.Steering)
            {
                // the thumbstick: its well, the four ticks, the knob following the thumb
                var c = d.StickHome + d.StickOffset;
                float a = d.StickHeld ? 1 : 0.6f;
                float sd = TouchDeck.StickD;
                Fill(R(c.x - sd / 2, c.y - sd / 2, sd, sd), Rgba(37, 35, 58, 0.6f * a), sd / 2 * k, Mathf.Max(1, k), WithAlpha(KeyEdge, a));
                float inner = sd * 0.58f;
                Fill(R(c.x - inner / 2, c.y - inner / 2, inner, inner), Rgba(27, 26, 41, 0.45f * a), inner / 2 * k);
                var tick = Style(10, WithAlpha(Hex(0x6f6c8c), a), TextAnchor.MiddleCenter);
                Text(c.x - sd / 2 + 2, c.y - 6, 12, 12, "<", tick);
                Text(c.x + sd / 2 - 14, c.y - 6, 12, 12, ">", tick);
                float kd = TouchDeck.KnobD;
                var kc = c + d.Knob;
                Fill(R(kc.x - kd / 2, kc.y - kd / 2 + 3, kd, kd), Rgba(0, 0, 0, 0.35f * a), kd / 2 * k);
                Fill(R(kc.x - kd / 2, kc.y - kd / 2, kd, kd), WithAlpha(Hex(0x34324c), a), kd / 2 * k, Mathf.Max(1, k), d.StickHeld ? Cyan : WithAlpha(Hex(0x5a577c), a));
            }
            if (d.Driving && d.Steering)
            {
                // the steering slider: a well with a line down its middle, the knob as far as the thumb is from it
                var sr = d.SliderRect;
                Fill(R(sr.x, sr.y, sr.width, sr.height), Rgba(27, 26, 41, 0.55f), sr.height / 2 * k, Mathf.Max(1, k), KeyEdge);
                Fill(R(sr.center.x - 1, sr.y + 6, 2, sr.height - 12), Rgba(111, 108, 140, 0.5f));
                var tick = Style(10, Hex(0x6f6c8c), TextAnchor.MiddleCenter);
                Text(sr.x + 6, sr.center.y - 6, 12, 12, "<", tick);
                Text(sr.xMax - 18, sr.center.y - 6, 12, 12, ">", tick);
                float kd = TouchDeck.SliderKnob, kx = sr.center.x + d.SliderAt;
                Fill(R(kx - kd / 2, sr.center.y - kd / 2, kd, kd), Hex(0x34324c), kd / 2 * k, Mathf.Max(1, k), d.Turn != 0 ? Cyan : Hex(0x5a577c));
                Pedal(d.BrakeRect, "BRAKE", Hex(0xff8a8a), 10, d.Brake);
                Pedal(d.GasRect, "GAS", Cyan, 14, d.Gas);
            }
            // A (or DRIFT, on dirt): a round button, its glyph on it, what it does under it
            string face = d.FaceLabel;
            if (face != "")
            {
                var fc = d.FaceCentre;
                float bd = TouchDeck.ButtonD;
                bool drift = face == "DRIFT";
                Fill(R(fc.x - bd / 2, fc.y - bd / 2, bd, bd), drift ? Cyan : Accent, bd / 2 * k);
                Text(fc.x - bd / 2, fc.y - bd / 2, bd, bd, Glyph(face), Style(20, Hex(0x15141f), TextAnchor.MiddleCenter));
                Text(fc.x - 60, fc.y + bd / 2 + 4, 120, 14, face, Style(12, Ink, TextAnchor.MiddleCenter), Rgba(0, 0, 0, 0.9f));
            }
            // RESTART top left, PAUSE (EXIT) top right
            Sys(d.StartRect, d.LabelStart);
            Sys(d.SelectRect, d.LabelSelect);
        }

        void Pedal(Rect r, string label, Color color, float px, bool down)
        {
            float dy = down ? 2 : 0;
            Fill(R(r.x, r.y + dy, r.width, r.height), down ? KeyEdge : Rgba(37, 35, 58, 0.78f), 14 * k, Mathf.Max(1, k), down ? color : KeyEdge);
            Text(r.x, r.y + dy, r.width, r.height, label, Style(px, color, TextAnchor.MiddleCenter));
        }

        void Sys(Rect r, string label)
        {
            if (string.IsNullOrEmpty(label)) return;
            Fill(R(r.x, r.y, r.width, r.height), Rgba(37, 35, 58, 0.75f), 14 * k, Mathf.Max(1, k), KeyEdge);
            Text(r.x, r.y, r.width, r.height, label, Style(12, Hex(0xa9a6c0), TextAnchor.MiddleCenter));
        }

        static Color WithAlpha(Color c, float a) => new Color(c.r, c.g, c.b, c.a * a);
    }
}
