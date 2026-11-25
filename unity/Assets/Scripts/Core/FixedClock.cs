// A fixed-step clock: the simulation advances in steps of exactly 1/hz s whatever the frame time (the web game's
// src/engine/fixedStep.ts), so a race runs the same at 30, 60 or 144 fps. Alpha (0…1 of a step) is for drawing between steps.
using System;

namespace CornerCutters.Core
{
    public sealed class FixedClock
    {
        public const int SimHz = 60;
        public const double SimDt = 1.0 / SimHz;
        public readonly double Step;
        public readonly int MaxSteps;
        public double Carry;

        public FixedClock(int hz = SimHz, int maxSteps = 4) { Step = 1.0 / hz; MaxSteps = maxSteps; }

        public void Advance(double dt, out int steps, out double alpha)
        {
            double total = Carry + Math.Max(0, dt);
            steps = (int)Math.Floor(total / Step + 1e-9);
            double carry = total - steps * Step;
            if (steps > MaxSteps) { steps = MaxSteps; carry = 0; }
            Carry = Math.Max(0, carry);
            alpha = Math.Min(1, Carry / Step);
        }
    }
}
