// The race kept on the device to come back to (raceSave.ts, race.ts's keepNow and resumeRace): a Quick Race or a
// Championship round under way (lights out, your flag still to come) is kept (the save's unity.kept: the web game's race.kept is its own shape) as you pause,
// as each lap of yours is done and as the game loses focus or closes; it's thrown away at your flag, or when you
// leave the race or start it again. RESUME on the menu builds the same weekend again (its seed, its grid), lays the
// kept state over it, and waits paused for you to go on.
using System.Collections.Generic;
using System.Linq;
using CornerCutters.Core;
using UnityEngine;

namespace CornerCutters.Game
{
    public sealed partial class RaceController
    {
        /// <summary>the kept race being picked up (its weekend being built); this race is the one kept (its to throw away)</summary>
        KeptRace resuming;
        bool keptHere;

        /// <summary>Keep the race on the device, to come back to if the game's closed: a race under way, not a replay of it.</summary>
        void KeepNow()
        {
            if (race == null || menu != null || session != Session.Race || you2 >= 0 || daily.HasValue || replay != null || podiumTop != null || panT.HasValue || race.Phase != RacePhase.Racing) return;
            if (playMode != "race" && playMode != "championship") return;
            var me = Me.Progress;
            if (me.Finished.HasValue || me.Retired) return;
            try
            {
                var k = new KeptRace
                {
                    At = System.DateTimeOffset.UtcNow.ToUnixTimeMilliseconds(), Circuit = circuit.id, Name = circuit.id, Mode = season != null ? "championship" : "race",
                    Round = season?.Round ?? -1, Team = team.Id, Difficulty = difficulty.Id, Weather = WeatherLooks.Name(weatherChoice), Laps = laps,
                    Seed = seed, Grid = new List<int>(driverOf), You = you, State = RaceSave.Snapshot(race),
                };
                Save.SetText("unity", "kept", RaceSave.Write(k));
                Save.Flush(true);
                keptHere = true;
            }
            catch (System.Exception e)
            {
                // (the device's storage full or off: the race goes on, just not kept)
                Debug.LogWarning($"race not kept: {e.Message}");
            }
        }

        /// <summary>Throw the kept race away, if it's this race's (another session leaves a kept race be).</summary>
        void DropOurs()
        {
            if (keptHere && Save.Has("unity", "kept")) Save.Set("unity", "kept", null);
            keptHere = false;
        }

        /// <summary>The kept race picked up: the race from its grid, its state laid over it, paused till you go on.</summary>
        void ResumeRace()
        {
            var k = resuming;
            resuming = null;
            bool fits = k.Grid.Count == weekend.Drivers.Count && k.Grid.Distinct().Count() == k.Grid.Count && k.Grid.All(d => d >= 0 && d < k.Grid.Count);
            StartRace(fits ? k.Grid : null);
            if (!fits || !RaceSave.Restore(race, k.State, seed) || k.You != you)
            {
                // (not this race after all: a fresh one, and the kept one gone)
                keptHere = true;
                DropOurs();
                StartRace(null);
                return;
            }
            keptHere = true;
            // (straight to where it was: no grid walk, no launch; every car drawn where it is)
            panT = null;
            launch = null;
            for (int i = 0; i < race.Entrants.Count; i++) was[i] = now[i] = PoseOf(race.Entrants[i].Car);
            healthWas = race.Entrants.Select(e => e.Car.Health).ToArray();
            lapsSeen = race.Entrants.Select(e => e.Progress.Lap).ToArray();
            bestLap = Me.Progress.LapTimes.Count > 0 ? Me.Progress.LapTimes.Min() : double.NaN;
            chase.Snap();
            paused = true;
            Notice("RACE RESUMED", TrackView.Hex(0x5fe0d0), 2.5);
        }
    }
}
