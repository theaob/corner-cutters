// The race's sound in play (race/feel.ts, and race.ts's sounds calls): your car heard each frame (its engine, tyres and
// what it's on, the nearest rival, the slipstream, the crowd by the stands, a plane overhead, the pit limiter), its
// hits and scrapes; the start lights' beeps and lights out (the crowd roaring them away), overtakes and crashes
// cheered, track limits buzzed, the last lap's bell, your flag's arpeggio, a record's chime, the champagne cork, the
// team radio's click and squelch. And the music: the race's track from the start of a session, the menu's tune after
// your flag, the march for the ceremony, the theme on the menus. Paused, or the game out of sight, it's all silent.
using System.Linq;
using CornerCutters.Core;
using UnityEngine;

namespace CornerCutters.Game
{
    public sealed partial class RaceController
    {
        RaceSounds sounds;
        /// <summary>your car's health as last heard, and whether it was wrecked in the frame's steps</summary>
        double heardHealth;
        bool wreckedNow;
        /// <summary>the start lights beeped so far; your place last frame; the rain as last heard</summary>
        int lightsHeard;
        int heardPlace;
        double heardRain = -1;

        /// <summary>A session's start: the race's sounds afresh, and the race's music.</summary>
        void FreshSounds()
        {
            SoundOut.Make();
            sounds?.Dispose();
            sounds = new RaceSounds(SoundOut.Synth, race.Rain);
            heardHealth = Me.Car.Health;
            heardRain = race.Rain;
            wreckedNow = false;
            lightsHeard = 0;
            heardPlace = 0;
            SoundOut.Music.Play(Music.Race);
        }

        /// <summary>A frame of the race heard (not paused): `frame` s.</summary>
        void StepSounds(float frame)
        {
            if (sounds == null) return;
            var me = Me;
            double lost = heardHealth - me.Car.Health;
            heardHealth = me.Car.Health;
            bool replaying = replay != null;
            double landedNow = landed.Length > you ? landed[you] : 0;
            // (and its vibration and the camera's shake: RaceController.Feel)
            StepFeel(frame, lost, landedNow, wreckedNow);
            if (!replaying)
            {
                // hits, and the scrape of metal with the sparks
                if (wreckedNow) sounds.Hit(1);
                else if (lost > 0.5) sounds.Hit(System.Math.Min(1, 0.25 + lost / 15));
                if (lost > 0.5 || landedNow > 160) sounds.Scrape(System.Math.Min(1, 0.3 + System.Math.Max(lost, 0) / 10));
            }
            wreckedNow = false;
            bool held = session == Session.QualiOver || session == Session.AttackOver;
            if (replaying || held || me.Progress.Retired || me.Car.Wrecked) sounds.Quiet();
            else
            {
                var car = me.Car;
                double fx = JsMath.Sin(car.Heading), fy = -JsMath.Cos(car.Heading);
                double rivalSpeed = 0, rivalDistance = double.NaN;
                for (int i = 0; i < race.Entrants.Count; i++)
                {
                    var o = race.Entrants[i];
                    if (i == you || o.Progress.Retired || o.Car.Wrecked || (o.Pit != null && o.Pit.Phase == PitPhase.Garage)) continue;
                    double d = JsMath.Hypot(o.Car.X - car.X, o.Car.Y - car.Y);
                    if (double.IsNaN(rivalDistance) || d < rivalDistance)
                    {
                        rivalDistance = d;
                        rivalSpeed = Driving.SpeedOf(o.Car);
                    }
                }
                char cell = CellAt(car.X, car.Y);
                var ev = lastEvents.Length > you ? lastEvents[you] : default;
                sounds.Update(new SoundFrame
                {
                    Dt = frame, Speed = Driving.SpeedOf(car), Top = car.Cls.TopSpeed, Slide = System.Math.Abs(car.Vx * -fy + car.Vy * fx),
                    OnRough = ev.OnRough, OnKerb = cell == 'K', OnGravel = cell == 'V', RivalSpeed = rivalSpeed, RivalDistance = rivalDistance, Tow = me.Tow,
                    Crowd = circuit.stands != null ? Crowd.Near(circuit.stands.Select(st => (st.x, st.y)), car.X, car.Y) : 0,
                    Limiter = me.Pit != null && Pits.InLimitZone(race.Pit, race.Pit.Points[me.Pit.At].S),
                });
                // (a plane flying over: its roar as near as it is, up there)
                if (planes != null) sounds.SetJet(System.Math.Max(0, System.Math.Min(1, 1 - (planes.Nearest(car.X, car.Y) - 220) / 700)));
            }
            if (System.Math.Abs(race.Rain - heardRain) > 0.02)
            {
                heardRain = race.Rain;
                sounds.SetRain(race.Rain);
            }
            // a beep as each start light comes on
            if (race.Phase == RacePhase.Lights && race.Clock < 0)
            {
                int lit = StartLights.LitAt(race.Clock + RaceControl.Lights);
                if (lit > lightsHeard) sounds.Light();
                lightsHeard = System.Math.Max(lightsHeard, lit);
            }
            // a place gained in the race: the crowd's with you
            if (session == Session.Race && race.Phase == RacePhase.Racing && !me.Progress.Finished.HasValue)
            {
                int place = RaceControl.Order(race).IndexOf(you) + 1;
                if (heardPlace > 0 && place < heardPlace) sounds.Cheer(0.35);
                heardPlace = place;
            }
            // the ceremony to a march, and its champagne cork
            if (OnSet)
            {
                SoundOut.Music.Play(Music.Podium, 1);
                float popAt = Ceremony.SprayAt + Ceremony.Pop;
                if (podiumT >= popAt && podiumT - frame < popAt)
                {
                    sounds.Cork();
                    sounds.Cheer(0.6);
                }
            }
        }

        /// <summary>The kind of ground at (x, y): the baked cells' letter (K kerb, V gravel, G grass…; ' ' off the map).</summary>
        char CellAt(double x, double y)
        {
            int tx = (int)System.Math.Floor(x / circuit.tile), ty = (int)System.Math.Floor(y / circuit.tile);
            if (tx < 0 || ty < 0 || tx >= circuit.width || ty >= circuit.height) return ' ';
            return circuit.cells[ty * circuit.width + tx];
        }

        /// <summary>The menus' music and clicks: the theme, a tick as the focus moves, a click as you pick.</summary>
        void MenuSounds()
        {
            SoundOut.Make();
            sounds?.Quiet();
            SoundOut.Music.Play(Music.Theme);
            if (input.NavX != 0 || input.NavY != 0) SoundOut.Tick();
            if (input.AcceptPressed) SoundOut.Pick();
        }
    }
}
