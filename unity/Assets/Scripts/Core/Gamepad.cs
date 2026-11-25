// A gamepad as the game reads it. Port of readGamepad in src/engine/controls.ts, kept identical so the car feels the
// same: left stick steers (dead zone, then rescaled), right trigger gas, left trigger brake, the face and d-pad buttons
// as the handheld's buttons. The state is in the "standard layout" (the Web Gamepad API's, and what Unity's Input
// System Gamepad exposes: south, north, select/start, d-pad), so a Switch pad, an Xbox or a PlayStation pad all arrive
// as the same thing.
using System;
using System.Collections.Generic;

namespace CornerCutters.Core
{
    public enum Button { Up, Down, Left, Right, A, B, Start, Select }

    /// <summary>A pad in the standard layout: buttons by standard index (0 south, 3 north, 8 back/select, 9 start, 12-15 d-pad).</summary>
    public sealed class PadState
    {
        public bool[] Pressed = new bool[17];
        public double AxisX, AxisY;
        public double LeftTrigger, RightTrigger;
    }

    public struct PadDrive
    {
        public double Turn, Gas, Brake;
        public Vec2 Stick;
    }

    public static class GamepadReader
    {
        /// <summary>Stick travel ignored around the centre (worn sticks don't rest at 0).</summary>
        public const double DeadZone = 0.15;

        // A drifts (B), Start pauses (A), Y restarts (START), Back is SELECT, the d-pad moves: in the web game's order.
        static readonly (int index, Button button)[] Map =
        {
            (0, Button.B), (9, Button.A), (3, Button.Start), (8, Button.Select),
            (12, Button.Up), (13, Button.Down), (14, Button.Left), (15, Button.Right),
        };

        public static List<Button> Read(PadState pad, out PadDrive drive)
        {
            var buttons = new List<Button>();
            foreach (var (index, button) in Map) if (index < pad.Pressed.Length && pad.Pressed[index]) buttons.Add(button);
            double x = pad.AxisX;
            double turn = Math.Abs(x) < DeadZone ? 0 : Math.Sign(x) * ((Math.Abs(x) - DeadZone) / (1 - DeadZone));
            double y = pad.AxisY;
            double len = Math.Sqrt(x * x + y * y);
            double outv = len < DeadZone ? 0 : Math.Min(1, (len - DeadZone) / (1 - DeadZone));
            var stick = outv != 0 ? new Vec2(x / len * outv, y / len * outv) : new Vec2(0, 0);
            drive = new PadDrive { Turn = turn, Gas = pad.RightTrigger, Brake = pad.LeftTrigger, Stick = stick };
            return buttons;
        }
    }
}
