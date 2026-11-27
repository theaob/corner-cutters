// The team radio, a port of src/f1/radio.ts: your race engineer on the moments that matter (box, box, and for which
// tyres when the weather turns; the rain coming or stopping; the safety car and the virtual one, and the green; a good
// stop; the last lap; a purple lap; track limits; a wreck; and how it went at the flag), a line at a time, each said a
// few ways so it doesn't repeat itself. The race shows the line in a radio panel and holds the next until it's done
// (and drops a stale one).
using System;
using System.Collections.Generic;
using System.Linq;

namespace CornerCutters.Core
{
    public static class Radio
    {
        /// <summary>Each cue's lines (by the web game's cue names).</summary>
        public static readonly Dictionary<string, string[]> Lines = new Dictionary<string, string[]>
        {
            ["box"] = new[] { "BOX, BOX. BOX THIS LAP.", "BOX, BOX. PIT THIS LAP.", "BOX NOW, BOX NOW." },
            ["box-slick"] = new[] { "BOX, BOX. SOFTS ARE READY, THE TRACK IS DRY.", "BOX FOR SOFTS. IT IS DRY ENOUGH NOW." },
            ["box-hard"] = new[] { "BOX, BOX. HARDS ON, TO THE END.", "BOX THIS LAP. WE GO TO THE HARDS." },
            ["box-inter"] = new[] { "BOX, BOX. INTERS ARE READY.", "BOX FOR INTERMEDIATES. THE TRACK IS DAMP." },
            ["box-wet"] = new[] { "BOX, BOX. FULL WETS, IT IS POURING.", "BOX FOR WETS. THE RAIN IS HEAVY NOW." },
            ["rain"] = new[] { "RAIN STARTING. CAREFUL OUT THERE.", "WE HAVE RAIN. WATCH THE GRIP.", "IT IS RAINING. TRACK WILL GET WET." },
            ["rain-stops"] = new[] { "RAIN HAS STOPPED. TRACK WILL DRY.", "NO MORE RAIN. IT WILL DRY OUT NOW." },
            ["safety-car"] = new[] { "SAFETY CAR, SAFETY CAR. HOLD POSITION.", "SAFETY CAR DEPLOYED. NO OVERTAKING.", "SAFETY CAR. STAY BEHIND, KEEP THE TYRES WARM." },
            ["vsc"] = new[] { "VSC, VSC. KEEP TO THE LIMIT.", "VIRTUAL SAFETY CAR. NO OVERTAKING." },
            ["green"] = new[] { "GREEN, GREEN, GREEN. GO!", "GREEN FLAG. PUSH NOW.", "WE'RE GREEN. RACE ON." },
            ["pit-out"] = new[] { "GOOD STOP. PUSH NOW.", "GREAT STOP. GO, GO, GO.", "NICE STOP. NOW PUSH." },
            ["final-lap"] = new[] { "LAST LAP. BRING IT HOME.", "FINAL LAP. KEEP IT CLEAN.", "LAST LAP. GIVE IT EVERYTHING." },
            ["fastest-lap"] = new[] { "PURPLE! THAT'S FASTEST LAP.", "FASTEST LAP. GREAT PACE.", "MEGA LAP. FASTEST OF THE RACE." },
            ["warning"] = new[] { "TRACK LIMITS. CAREFUL.", "WATCH THE TRACK LIMITS.", "THAT ONE WAS A WARNING. KEEP IT ON THE TRACK." },
            ["penalty"] = new[] { "THAT'S A FIVE SECOND PENALTY.", "PENALTY FOR TRACK LIMITS. KEEP IT CLEAN NOW." },
            ["blue"] = new[] { "BLUE FLAGS. LET THE LEADER THROUGH.", "BLUE FLAG. LEADERS BEHIND, LET THEM BY.", "BLUE FLAGS. DON'T HOLD THEM UP." },
            ["jump-start"] = new[] { "JUMP START. THAT IS FIVE SECONDS.", "YOU JUMPED IT. FIVE SECOND PENALTY." },
            ["wreck"] = new[] { "ARE YOU OK? THE CAR IS DONE.", "YOU OK? WE'RE OUT, I'M SORRY.", "SORRY MATE, THAT'S THE RACE." },
        };

        static string Pick(string[] lines, double roll) => lines[Math.Min(lines.Length - 1, (int)Math.Floor(roll * lines.Length))];

        /// <summary>A line for `cue`, one of its ways round (picked by `roll`, 0 to 1).</summary>
        public static string Line(string cue, double roll) => Pick(Lines[cue], roll);

        /// <summary>The radio's box call (race.ts boxCue): for the tyres the weather wants (when it's turned), or plain.</summary>
        public static string BoxCue(Compound call, Compound on) =>
            call == on || call == Compound.Dirt ? "box" : "box-" + call.ToString().ToLowerInvariant();

        /// <summary>What your engineer says at your flag, finishing `place` (1 = the winner) of `of`.</summary>
        public static string FinishLine(int place, int of, double roll)
        {
            string P(string[] lines) => Pick(lines, roll).Replace("{place}", place.ToString());
            if (place == 1) return P(new[] { "YES! GET IN THERE! P1!", "P1! YOU WON IT! WHAT A RACE!", "CHEQUERED FLAG, P1! FANTASTIC!" });
            if (place <= 3) return P(new[] { "P{place}! PODIUM! GREAT JOB.", "PODIUM, P{place}. WELL DONE." });
            if (place <= Math.Min(10, of)) return P(new[] { "P{place}. GOOD POINTS TODAY.", "P{place}, IN THE POINTS. NICE WORK." });
            return P(new[] { "P{place}. WE'LL GO AGAIN.", "P{place}. TOUGH ONE, WE'LL LEARN FROM IT." });
        }

        /// <summary>s a line stays up (longer lines a little longer), and the most a line may wait behind another before it's stale.</summary>
        public const double Least = 2.2, PerChar = 0.035, Stale = 4;

        /// <summary>s the panel stays up for `text`.</summary>
        public static double For(string text) => Least + text.Length * PerChar;
    }

    /// <summary>The radio's lines: the one up now (and the s it has left), and those waiting (each with how long it has waited).</summary>
    public sealed class RadioQueue
    {
        public string Now;
        public double Left;
        public readonly List<(string text, double waited)> Waiting = new List<(string, double)>();

        /// <summary>Say `text` (now if the radio's free, else after what's up, unless it's said already).</summary>
        public void Say(string text)
        {
            if (Now == text || Waiting.Any(w => w.text == text)) return;
            Waiting.Add((text, 0));
        }

        /// <summary>Move the radio on `dt` s: the line up runs down; the next goes up when it's done (stale ones dropped). The line that went up now, if one did.</summary>
        public string Step(double dt)
        {
            if (Now != null)
            {
                Left -= dt;
                if (Left <= 0) Now = null;
            }
            for (int i = 0; i < Waiting.Count; i++) Waiting[i] = (Waiting[i].text, Waiting[i].waited + dt);
            Waiting.RemoveAll(w => w.waited > Radio.Stale);
            if (Now != null || Waiting.Count == 0) return null;
            var next = Waiting[0];
            Waiting.RemoveAt(0);
            Now = next.text;
            Left = Radio.For(next.text);
            return next.text;
        }

        public void Clear()
        {
            Now = null;
            Waiting.Clear();
        }
    }
}
