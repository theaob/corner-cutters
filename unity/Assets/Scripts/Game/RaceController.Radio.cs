// The team radio in play (race.ts's sayRadio, boxCue and the radio panel): your race engineer's line on the moments
// that matter (Core/Radio.cs), said in a race or qualifying (once your car's wrecked, only that), one at a time along
// the bottom of the screen in your team's colour. Off the race (a replay, the ceremony, the results) it's hidden: held
// over a crash's replay (the race goes on after it), dropped for good after your flag. The radio's yours: in split
// screen it's on player 1's half. (No click and squelch yet: the Unity port has no sound for it.)
using System.Linq;
using CornerCutters.Core;
using UnityEngine;

namespace CornerCutters.Game
{
    public sealed partial class RaceController
    {
        readonly RadioQueue radioQ = new RadioQueue();
        /// <summary>the lap the box call was last said on; your last lap called, your flag said</summary>
        int boxLap = -1;
        bool finalLapSaid, flagSaid;

        /// <summary>Your engineer says `cue` (in a race or qualifying; once your car's wrecked, only that: the rest is no news to a driver who's out).</summary>
        void SayRadio(string cue)
        {
            if (session != Session.Race && session != Session.Qualifying) return;
            if (Me.Car.Wrecked && cue != "wreck") return;
            radioQ.Say(Radio.Line(cue, Random.value));
        }

        /// <summary>A race's start: the radio quiet, nothing said yet.</summary>
        void FreshRadio()
        {
            radioQ.Clear();
            boxLap = -1;
            finalLapSaid = flagSaid = false;
        }

        bool RadioHidden => replay != null || podiumTop != null || results != null;

        /// <summary>A frame of the radio (not paused): your last lap and your flag called, the box call once a lap, and the next line up once the last is done.</summary>
        void StepRadio(float frame)
        {
            var p = Me.Progress;
            if (session == Session.Race && race.Phase == RacePhase.Racing)
            {
                // your last lap: called as you start it
                if (!finalLapSaid && p.LapStart.HasValue && !p.Finished.HasValue && !p.Retired && p.Lap == laps - 1)
                {
                    finalLapSaid = true;
                    Notice("FINAL LAP", TrackView.Hex(0xf4f4f8), 3, you);
                    SayRadio("final-lap");
                }
                if (p.Finished.HasValue && !flagSaid)
                {
                    flagSaid = true;
                    radioQ.Say(Radio.FinishLine(RaceControl.Order(race).IndexOf(you) + 1, race.Entrants.Count, Random.value));
                }
                // box, box: once a lap, as the pit wall's call goes up
                if (boxLap != p.Lap && BoxBox())
                {
                    boxLap = p.Lap;
                    SayRadio(Radio.BoxCue(RaceControl.TyreCall(race, Me), Me.Tyres.Compound));
                }
            }
            if (RadioHidden)
            {
                if (replay == null || !replay.Crash) radioQ.Clear();
            }
            else radioQ.Step(frame);
        }

        /// <summary>The radio panel's colour: the brightest of your team's (so it reads on the dark panel).</summary>
        Color RadioColor()
        {
            var t = weekend.Drivers[driverOf[you]].Team;
            double Light(int c) => 0.299 * ((c >> 16) & 255) + 0.587 * ((c >> 8) & 255) + 0.114 * (c & 255);
            var colours = t.Accent >= 0 ? new[] { t.Body, t.Trim, t.Accent } : new[] { t.Body, t.Trim };
            return TrackView.Hex(colours.Aggregate((a, c) => Light(c) > Light(a) ? c : a));
        }
    }
}
