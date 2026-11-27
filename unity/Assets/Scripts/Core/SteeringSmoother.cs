// Keyboard steering. The web game's keys are on/off: full lock the instant a key goes down, which is fine on a thumb
// stick but twitchy on a keyboard at a desktop's frame rate and for a car this fast. The smoother eases the wheel to
// where the keys point (and back to centre when they're let go), so a tap is a nudge and a hold is full lock.
// A gamepad's analogue stick isn't smoothed: it already is a wheel. Rates are the tuning knobs (per second, wheel
// units: full lock to full lock is 2).
using System;

namespace CornerCutters.Core
{
    public sealed class SteeringSmoother
    {
        /// <summary>how fast the wheel moves toward the key (away from centre)</summary>
        public double Rise = 7;
        /// <summary>how fast it comes back to centre when no key is held</summary>
        public double Fall = 10;
        /// <summary>how fast it swings across when the opposite key is pressed</summary>
        public double Cross = 14;
        public double Value { get; private set; }

        public double Step(double target, double dt)
        {
            double rate = target == 0 ? Fall : (Math.Sign(target) != Math.Sign(Value) && Value != 0 ? Cross : Rise);
            double d = target - Value;
            double move = rate * dt;
            Value = Math.Abs(d) <= move ? target : Value + Math.Sign(d) * move;
            return Value;
        }

        public void Reset() => Value = 0;
    }
}
