// Your pit stops, as the web game shows them (race.ts, race/banner.ts): the pit wall calls you in near the entry when a
// stop pays (BOX, BOX · PITS LEFT), then down the lane the banner says PIT LANE or PIT LIMITER, and in the box PIT STOP
// and the seconds left. Driving into the lane is the stop: RaceControl takes the car from there (Core/Pits.cs). On the
// way to your box in the dry, left and right pick your next set (NEXT: SOFT · HARD), as the web game's tyre pick.
using CornerCutters.Core;

namespace CornerCutters.Game
{
    public sealed partial class RaceController
    {
        /// <summary>Your stop's banner (null: none), in gold.</summary>
        string PitBanner()
        {
            if (session != Session.Race || race.Pit == null) return null;
            var me = Me;
            var p = me.Progress;
            if (p.Finished.HasValue || p.Retired || me.Car.Wrecked) return null;
            var stop = me.Pit;
            if (stop != null)
            {
                if (stop.Phase == PitPhase.Garage) return null;
                if (stop.Phase == PitPhase.Stopped) return $"PIT STOP {System.Math.Max(0, stop.Left):0.0}";
                return Pits.InLimitZone(race.Pit, race.Pit.Points[stop.At].S) ? "PIT LIMITER" : "PIT LANE";
            }
            return BoxBox() ? $"BOX, BOX · PITS {(race.Pit.Side < 0 ? "LEFT" : "RIGHT")}" : null;
        }

        /// <summary>The pit wall calls you in: on the run up to the entry, when a stop pays.</summary>
        bool BoxBox()
        {
            var me = Me;
            var p = me.Progress;
            int n = track.Count;
            if (p.LapStart == null || p.Finished.HasValue || !Pits.Between(p.Idx, race.Pit.Entry - 60, race.Pit.Entry + 4, n)) return false;
            return RaceControl.StopCalled(race, me);
        }

        /// <summary>Your next set, on the way to your box: what the pit wall fits (null: not in the lane, or not in the dry,
        /// when there's no choice). Left or right swaps soft and hard.</summary>
        string TyrePick(out UnityEngine.Color color)
        {
            color = default;
            if (session != Session.Race || paused || replay != null) return null;
            var me = Me;
            if (me.Pit == null || me.Pit.Phase != PitPhase.In) return null;
            var call = RaceControl.TyreCall(race, me);
            if (!Tyres.IsDry(call)) return null;
            if (input.NavX != 0)
            {
                me.Next = call == Compound.Slick ? Compound.Hard : Compound.Slick;
                call = me.Next.Value;
            }
            color = TrackView.Hex(Tyres.Color(call));
            return $"NEXT: {Tyres.Name(call)}";
        }
    }
}
