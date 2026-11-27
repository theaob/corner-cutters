// Time Attack, beat the clock: a port of src/f1/timeAttack.ts. On your own, from the standing run-up; at the line a
// countdown starts, with a little more than a sector's worth of time on it, and each checkpoint you pass (each
// sector's end, the line included) adds time: the sector's par (a third of the reference lap) times a factor that's
// generous on the first lap and shrinks lap by lap, so the clock wins in the end. A cut across a marked corner costs
// time. When it runs out: TIME UP, and how far you got is the result. (The Daily Challenge is one a day.)
using System;

namespace CornerCutters.Core
{
    public sealed class Attack
    {
        /// <summary>pars on the clock at the line; a checkpoint on the first lap adds its par times First, less Fade a lap after, down to Floor; s off for a cut</summary>
        public const double Grace = 1.15, First = 1.1, Fade = 0.04, Floor = 0.6, Cut = 3;

        /// <summary>s: a sector's par (a third of the reference lap)</summary>
        public double Par;
        /// <summary>× the time each checkpoint adds, for the difficulty</summary>
        public double Generous;
        /// <summary>s left on the clock; null until you cross the line</summary>
        public double? Left;
        /// <summary>checkpoints passed since the line (a lap is Sectors of them)</summary>
        public int Passed;
        public bool Over;
        /// <summary>s since the clock started, and when the last checkpoint was passed</summary>
        public double Elapsed, LastAt;

        public Attack(double referenceLap, string difficulty = "normal")
        {
            Par = referenceLap / Racing.Sectors;
            Generous = difficulty == "easy" ? 1.08 : difficulty == "hard" ? 0.95 : 1;
        }

        /// <summary>Seconds checkpoint `k` (0: the first after the line) adds to the clock.</summary>
        public double Bonus(int k)
        {
            int lap = k / Racing.Sectors;
            return Par * Generous * Math.Max(Floor, First - Fade * lap);
        }

        public struct Step
        {
            public bool Started, TimeUp;
            public double? Added, Lost;
        }

        /// <summary>One step of the clock, `dt` s: `started` once you've crossed the line, `passed` the checkpoints since, `cut` a cut this step.</summary>
        public Step Advance(double dt, bool started, int passed, bool cut)
        {
            var o = new Step();
            if (Over || !started) return o;
            if (Left == null)
            {
                Left = Par * Grace;
                o.Started = true;
            }
            while (passed > Passed)
            {
                double add = Bonus(Passed);
                Left += add;
                o.Added = (o.Added ?? 0) + add;
                Passed++;
                LastAt = Elapsed;
            }
            if (cut)
            {
                Left -= Cut;
                o.Lost = Cut;
            }
            Left -= dt;
            Elapsed += dt;
            if (Left <= 0)
            {
                Left = 0;
                Over = true;
                o.TimeUp = true;
            }
            return o;
        }

        /// <summary>How far `passed` checkpoints is, short: '5L 1S', '5L', '2S', '0S'.</summary>
        public static string ShortDistance(int passed)
        {
            int laps = passed / Racing.Sectors, sectors = passed % Racing.Sectors;
            return laps != 0 ? (sectors != 0 ? $"{laps}L {sectors}S" : $"{laps}L") : $"{sectors}S";
        }

        /// <summary>How far `passed` checkpoints is, as said on the screen: '2 LAPS + 1 SECTOR', '1 LAP', '2 SECTORS', 'NO SECTORS'.</summary>
        public static string Distance(int passed)
        {
            int laps = passed / Racing.Sectors, sectors = passed % Racing.Sectors;
            string L(int n) => n == 1 ? $"{n} LAP" : $"{n} LAPS";
            string S(int n) => n == 1 ? $"{n} SECTOR" : $"{n} SECTORS";
            if (laps == 0) return sectors != 0 ? S(sectors) : "NO SECTORS";
            return sectors != 0 ? $"{L(laps)} + {S(sectors)}" : L(laps);
        }
    }
}
