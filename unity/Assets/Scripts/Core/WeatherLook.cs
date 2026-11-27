// How the circuit looks in the weather: a port of src/f1/weather.ts. The sky and light (a hemisphere light's sky and
// ground colours, its strength, the sun's colour and strength), the tint multiplied into the ground's colours (a wet
// track, and grass, is darker), and whether the cars throw up spray; eased between dry, damp and wet as the track
// wets and dries (lookAt), the sky grey as soon as it rains.
using System;

namespace CornerCutters.Core
{
    /// <summary>A weather to race in, as the menu picks it: one of the three, the same all race, or changeable.</summary>
    public enum WeatherChoice { Dry, Damp, Wet, Changeable }

    public struct SkyState
    {
        public int Background, Sky, Ground, Key;
        public double Ambient, KeyIntensity;
    }

    public struct WeatherLook
    {
        public SkyState Sky;
        public int GroundTint;
        public bool Spray;
    }

    public static class WeatherLooks
    {
        /// <summary>
        /// The night (night.ts, its look "a", floodlit): the road's lamps glow on the ground (`NightGlow`, its colour, at
        /// NightGlowIntensity), the glow (bloom) at NightBloom; every weather's sky made its night by Night.
        /// </summary>
        public const int NightGlow = 0xffe2bc, NightTown = 0x13112c;
        public const double NightGlowIntensity = 0.3, NightBloom = 0.7, DayBloom = 0.35;

        /// <summary>A sky (a weather's, by day) at night (night.ts nightSky): a dark violet sky, cool moonlight and the city's warm glow, as much darker as the weather is dull.</summary>
        public static SkyState Night(SkyState sky)
        {
            double day = Math.Min(1, sky.KeyIntensity / 2.6);
            return new SkyState { Background = 0x15133a, Sky = 0x7a7ad0, Ground = 0x6a4658, Ambient = 1.7 + 0.3 * (1 - day), Key = 0xbcc6ff, KeyIntensity = 0.5 + 0.5 * day };
        }

        public static readonly SkyState DrySky = new SkyState { Background = 0x8fb8e8, Sky = 0xb8d4ff, Ground = 0x5a4f48, Ambient = 1.35, Key = 0xffe0b0, KeyIntensity = 2.6 };
        public static readonly SkyState DampSky = new SkyState { Background = 0x9aa6b4, Sky = 0xc0c8d4, Ground = 0x4c4a4c, Ambient = 1.45, Key = 0xe8e4dc, KeyIntensity = 1.5 };
        public static readonly SkyState WetSky = new SkyState { Background = 0x6e7684, Sky = 0xa8b0bc, Ground = 0x3c3a3e, Ambient = 1.5, Key = 0xd0d4dc, KeyIntensity = 0.8 };
        static readonly int[] Tints = { 0xffffff, 0xc8c8d0, 0xa4a4b0 };

        public static string Name(WeatherChoice w) => w switch
        {
            WeatherChoice.Damp => "DAMP",
            WeatherChoice.Wet => "WET",
            WeatherChoice.Changeable => "CHANGEABLE",
            _ => "DRY",
        };

        public static Weather Fixed(WeatherChoice w) => w == WeatherChoice.Wet ? Weather.Wet : w == WeatherChoice.Damp ? Weather.Damp : Weather.Dry;

        /// <summary>Two 0xRRGGBB colours mixed, each channel rounded (Math.round: half up).</summary>
        public static int Mix(int a, int b, double t)
        {
            int C(int sh)
            {
                int x = (a >> sh) & 255, y = (b >> sh) & 255;
                return (int)Math.Floor(x + (y - x) * t + 0.5);
            }
            return (C(16) << 16) | (C(8) << 8) | C(0);
        }

        /// <summary>How the circuit looks with the track `wetness` wet (0 dry … 1 damp … 2 wet) and the rain `rain` hard.</summary>
        public static WeatherLook At(double wetness, double rain)
        {
            int a = wetness <= 1 ? 0 : 1;
            double t = wetness <= 1 ? wetness : wetness - 1;
            double st = Math.Max(rain, Math.Min(1, wetness / 2) * 0.6);
            SkyState sa = DrySky, sb = WetSky;
            var sky = new SkyState
            {
                Background = Mix(sa.Background, sb.Background, st), Sky = Mix(sa.Sky, sb.Sky, st), Ground = Mix(sa.Ground, sb.Ground, st), Key = Mix(sa.Key, sb.Key, st),
                Ambient = sa.Ambient + (sb.Ambient - sa.Ambient) * st, KeyIntensity = sa.KeyIntensity + (sb.KeyIntensity - sa.KeyIntensity) * st,
            };
            return new WeatherLook { Sky = sky, GroundTint = Mix(Tints[a], Tints[a + 1], Math.Max(0, Math.Min(1, t))), Spray = wetness > 0.4 };
        }
    }
}
