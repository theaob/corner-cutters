// The touch screen's controls, the engine-free half (src/engine/controls.ts's thumbstick, src/engine/deck.ts's floating
// stick and steering slider, src/f1/driveStyle.ts, src/f1/race/deckLabels.ts): how a thumb on the stick reads (an exact
// direction and push, past a dead zone, full before the rim; the menus' eight ways once it's pushed well out), where a
// floating stick comes to rest under a thumb, how far the slider turns the wheel, how each device drives (DRIVING:
// AUTO, POINT, STEER), and what each of the deck's buttons does just now. The drawing and the touches are
// Game/TouchDeck.cs.
using System;

namespace CornerCutters.Core
{
    [Flags]
    public enum Dirs { None = 0, Up = 1, Down = 2, Left = 4, Right = 8 }

    /// <summary>DRIVING in the settings: AUTO (touch points the way, keys and pads steer), POINT (the car goes where you point), STEER (you drive the car itself).</summary>
    public enum DriveStyle { Auto, Point, Steer }

    public static class TouchStick
    {
        /// <summary>shares of the knob's travel: nothing inside the dead zone, full push from `Full`, the direction buttons past `Buttons`</summary>
        public const double DeadZone = 0.12, Full = 0.85, Buttons = 0.5;
        /// <summary>px between a floating stick's base and the screen's edge, at the closest</summary>
        public const double FloatMargin = 8;
        /// <summary>share of the slider's travel either side of the middle that's still straight on</summary>
        public const double SliderDead = 0.06;

        // eight 45° sectors, from "right" round clockwise (screen y down)
        static readonly Dirs[] Sectors = { Dirs.Right, Dirs.Down | Dirs.Right, Dirs.Down, Dirs.Down | Dirs.Left, Dirs.Left, Dirs.Up | Dirs.Left, Dirs.Up, Dirs.Up | Dirs.Right };

        /// <summary>The directions held for a thumb at (dx, dy) from a pad's centre; none inside `deadZone`.</summary>
        public static Dirs DirectionsFromOffset(double dx, double dy, double deadZone)
        {
            if (JsMath.Hypot(dx, dy) < deadZone) return Dirs.None;
            int sector = (int)JsMath.Round(Math.Atan2(dy, dx) / (Math.PI / 4));
            return Sectors[((sector % 8) + 8) % 8];
        }

        /// <summary>
        /// The thumbstick for a thumb (dx, dy) px from its centre, its knob able to travel `travel` px: the reading (an
        /// exact direction, length 0…1), where the knob's drawn (following the thumb, stopped at the rim), and the
        /// direction buttons it holds (only pushed well out).
        /// </summary>
        public static (Vec2 stick, Vec2 knob, Dirs dirs) Read(double dx, double dy, double travel)
        {
            double d = JsMath.Hypot(dx, dy);
            double reach = Math.Min(1, d / travel);
            double t = Math.Min(1, Math.Max(0, (reach - DeadZone) / (Full - DeadZone)));
            double ux = d != 0 ? dx / d : 0, uy = d != 0 ? dy / d : 0;
            return (t != 0 ? new Vec2(ux * t, uy * t) : new Vec2(0, 0), new Vec2(ux * reach * travel, uy * reach * travel), DirectionsFromOffset(dx, dy, travel * Buttons));
        }

        /// <summary>Where a floating stick's base goes for a thumb landing at (x, y): under it, kept inside the bounds; as the offset from its place at rest (centred on homeX, homeY).</summary>
        public static Vec2 FloatOffset(double x, double y, double homeX, double homeY, double radius, double left, double top, double right, double bottom)
        {
            double Clamp(double v, double lo, double hi) => Math.Max(lo, Math.Min(Math.Max(lo, hi), v));
            double r = radius + FloatMargin;
            return new Vec2(Clamp(x, left + r, right - r) - homeX, Clamp(y, top + r, bottom - r) - homeY);
        }

        /// <summary>The steering slider's turn (−1 left … 1 right) for a thumb `dx` px from its middle, `travel` px from the middle to an end.</summary>
        public static double SliderTurn(double dx, double travel)
        {
            double t = Math.Max(-1, Math.Min(1, dx / Math.Max(1, travel)));
            return Math.Abs(t) < SliderDead ? 0 : t;
        }

        /// <summary>Whether a device points the way to go under `style` (else it steers the car): AUTO points on touch only.</summary>
        public static bool PointsOn(bool touch, DriveStyle style) => style == DriveStyle.Auto ? touch : style == DriveStyle.Point;
    }

    public enum DeckSession { Qualifying, Race, TimeTrial, TimeAttack, Tutorial }

    /// <summary>The race as the deck's buttons see it (deckLabels.ts DeckState).</summary>
    public struct DeckState
    {
        public bool Settings, ResultsUp, RoundOver, QualifyingOver, AttackOver, Learnt, Watching, Done, Paused;
        public DeckSession Session;
    }

    public static class DeckLabels
    {
        /// <summary>What A, B, START and SELECT do just now ("" for nothing: hidden): A the session's own action, B drift while driving, START restart, SELECT pause while racing (else exit).</summary>
        public static (string a, string b, string start, string select) For(DeckState s)
        {
            if (s.Settings) return ("", "", "", "");
            string a = "";
            if (s.RoundOver && s.ResultsUp) a = "NEXT";
            else if (s.QualifyingOver) a = "RACE";
            else if (s.AttackOver) a = "AGAIN";
            else if (s.Session == DeckSession.Tutorial) a = s.Learnt ? "MENU" : "SKIP";
            else if (s.Watching) a = "SKIP";
            else if (!s.Done) a = s.Paused ? "" : "PAUSE";
            else if (!s.ResultsUp) a = "SKIP";
            bool driving = !s.Paused && !s.Done && !s.Watching && !s.QualifyingOver && !s.AttackOver;
            bool racing = a == "PAUSE";
            bool holdsRace = s.Watching && s.Session == DeckSession.Race && !s.Done && !s.Paused;
            bool lessonDone = s.Session == DeckSession.Tutorial && s.Learnt;
            return (racing ? "" : a, driving && !lessonDone ? "DRIFT" : "", s.Paused || s.RoundOver || s.QualifyingOver || s.AttackOver ? "" : "RESTART", racing || holdsRace ? "PAUSE" : s.Paused ? "" : "EXIT");
        }
    }
}
