// The weather on the screen, as the web game shows it (src/f1/weather.ts lookAt, race.ts, race/drawCars.ts and
// engine/render/effects.ts Particles.spray): the sky's light on everything (the finish pass's light on flat ground,
// from the look's sky colour, its strength and the sun's), the ground darker as the track gets wet (the look's tint,
// on the ground's picture and the green beyond it), redone only as the look changes; and the spray the cars throw up
// off a wet track, soft grey puffs behind each car at speed that rise, spread and fade (Effects.cs Particles). The
// rain falling over the picture is HudView's.
using CornerCutters.Core;
using System.Collections.Generic;
using UnityEngine;

namespace CornerCutters.Game
{
    public sealed class WeatherView
    {
        /// <summary>the colour beyond the circuit's map (ChaseCamera's), before the tint</summary>
        static readonly Color Beyond = new Color(0.15f, 0.38f, 0.13f);
        /// <summary>the sun's height (the web game's sun offset 140, 260, 170: the share of it on flat ground)</summary>
        static readonly float SunUp = 260f / Mathf.Sqrt(140f * 140f + 260f * 260f + 170f * 170f);

        double shownWetness = -1, shownRain = -1;
        /// <summary>the circuit's raced at night (Neon Strip): every weather's sky its night, the ground floodlit, the glow stronger</summary>
        public bool Night;
        public WeatherLook Look { get; private set; } = WeatherLooks.At(0, 0);

        /// <summary>The look for the track `wetness` wet and the rain `rain` hard, put on the scene if it's changed enough to see.</summary>
        public void Show(double wetness, double rain, Camera cam)
        {
            if (System.Math.Abs(wetness - shownWetness) <= 0.02 && System.Math.Abs(rain - shownRain) <= 0.02) return;
            shownWetness = wetness;
            shownRain = rain;
            Look = WeatherLooks.At(wetness, rain);
            var tint = TrackView.Hex(Look.GroundTint);
            if (TrackView.Ground != null) TrackView.Ground.color = tint;
            var beyond = Night ? TrackView.Hex(WeatherLooks.NightTown) : Beyond;
            cam.backgroundColor = new Color(beyond.r * tint.r, beyond.g * tint.g, beyond.b * tint.b);
            // the light on flat ground (the hemisphere's sky, as the face looks straight up, and the sun), linear, / π;
            // at night the night's, and the lamps' glow on top (BakedScenery's scenery is baked against both)
            var look = Night ? WeatherLooks.Night(Look.Sky) : Look.Sky;
            var sky = Lin(look.Sky);
            var key = Lin(look.Key);
            float amb = (float)look.Ambient, ki = (float)look.KeyIntensity * SunUp;
            var glow = Night ? BakedScenery.NightGlow() : new Color(0, 0, 0, 0);
            TiltShiftEffect.Light = new Vector4((sky.r * amb + key.r * ki) / Mathf.PI + glow.r, (sky.g * amb + key.g * ki) / Mathf.PI + glow.g, (sky.b * amb + key.b * ki) / Mathf.PI + glow.b, 0);
            TiltShiftEffect.Bloom = (float)(Night ? WeatherLooks.NightBloom : WeatherLooks.DayBloom);
        }

        /// <summary>Shown afresh on the next Show (a new circuit's ground).</summary>
        public void Forget() { shownWetness = shownRain = -1; }

        static Color Lin(int rgb)
        {
            var c = TrackView.Hex(rgb);
            return new Color(ToLinear(c.r), ToLinear(c.g), ToLinear(c.b));
        }

        static float ToLinear(float c) => c <= 0.04045f ? c / 12.92f : Mathf.Pow((c + 0.055f) / 1.055f, 2.4f);

        /// <summary>Spray off the track behind each car at speed (drawCars.ts): the faster, and the harder it rains, the more.</summary>
        public void Spray(IList<Entrant> cars, double rain, float dt, Particles particles)
        {
            if (!Look.Spray) return;
            foreach (var e in cars)
            {
                if (e.Progress.Retired) continue;
                var c = e.Car;
                double speed = Driving.SpeedOf(c);
                if (speed > 60 && Random.value < dt * (6 + 8 * rain) * System.Math.Min(1, speed / 250))
                    particles.Spray((float)(c.X - JsMath.Sin(c.Heading) * 14), (float)(c.Y + JsMath.Cos(c.Heading) * 14), (float)c.Z);
            }
        }
    }
}
