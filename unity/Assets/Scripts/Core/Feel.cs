// The feel of a hit, and the picture's quality: the camera's shake and the hit-stop of a big hit (src/f1/shake.ts), the
// vibration a frame asks for (src/f1/rumble.ts), the speed zoom's ramp, the quality levels and the governor that steps
// down when the device can't keep up (src/engine/render/quality.ts), GRAPHICS (src/f1/graphics.ts) and the
// colour-safe splits (src/f1/access.ts). Engine-free, checked against the web game (feel.json).
namespace CornerCutters.Core
{
    public struct FeelFrame
    {
        public double Dt, Speed, TopSpeed, HealthLost, Landed;
        public bool WreckedNow, OnRough, OnKerb;
    }

    public sealed class ShakeState
    {
        public double Trauma, T, Hold;
    }

    public static class Shake
    {
        public const double PerHealth = 0.035, HitFloor = 0.5, HitLeast = 0.15, Wreck = 1, Landing = 120, PerLanding = 0.004,
            Kerb = 0.22, Rough = 0.3, MinSpeed = 40, Decay = 1.6, Most = 6, Speed = 18, BigHit = 8, HoldFor = 0.07, Crawl = 0.1;

        /// <summary>Move the shake on a frame: what happened adds trauma (and maybe a hit-stop), then it fades.</summary>
        public static void Step(ShakeState s, FeelFrame f)
        {
            s.T += f.Dt;
            s.Hold = System.Math.Max(0, s.Hold - f.Dt);
            s.Trauma = System.Math.Max(0, s.Trauma - Decay * f.Dt);
            double add = 0;
            if (f.WreckedNow) add = Wreck;
            else if (f.HealthLost > HitFloor) add = System.Math.Max(HitLeast, f.HealthLost * PerHealth);
            if (f.Landed > Landing) add = System.Math.Max(add, (f.Landed - Landing) * PerLanding);
            s.Trauma = System.Math.Min(1, s.Trauma + add);
            if (f.WreckedNow || f.HealthLost >= BigHit) s.Hold = HoldFor;
            if (f.Speed > MinSpeed)
            {
                double pace = System.Math.Min(1, f.Speed / f.TopSpeed);
                double floor = f.OnRough ? Rough * pace : f.OnKerb ? Kerb * pace : 0;
                s.Trauma = System.Math.Max(s.Trauma, floor);
            }
        }

        static double Noise(double t, double seed) => (JsMath.Sin(t * 1.7 + seed) + JsMath.Sin(t * 2.9 + seed * 3.1) * 0.6 + JsMath.Sin(t * 4.3 + seed * 1.3) * 0.3) / 1.9;

        /// <summary>px to move the camera across and up the screen now.</summary>
        public static Vec2 Offset(ShakeState s)
        {
            double k = s.Trauma * s.Trauma * Most, t = s.T * Speed;
            return new Vec2(k * Noise(t, 1), k * Noise(t, 7));
        }

        /// <summary>How fast the race runs now: at a crawl through a hit-stop, else 1.</summary>
        public static double TimeScale(ShakeState s) => s.Hold > 0 ? Crawl : 1;

        // the camera pulling back as the car speeds up (ZOOM_OUT), and the share of it kept for less motion
        public const double ZoomFrom = 0.3, ZoomPullBack = 0.14, ZoomCalm = 0.4;

        /// <summary>How far the camera has pulled back (0…1) at `speed` px/s of `top`: a smooth ramp from ZoomFrom of top speed.</summary>
        public static double ZoomOf(double speed, double top)
        {
            double k = System.Math.Min(1, System.Math.Max(0, (speed / System.Math.Max(1, top) - ZoomFrom) / (1 - ZoomFrom)));
            return k * k * (3 - 2 * k);
        }
    }

    public sealed class RumbleState
    {
        public double RoughIn, KerbIn;
        public bool WasRough;
    }

    public static class Rumble
    {
        public const double Wreck = 260, Hit = 30, HitPerHealth = 6, HitMost = 160, HitFloor = 0.5, Landing = 120, LandingMs = 25,
            MinSpeed = 40, RoughInMs = 30, RoughEvery = 0.12, RoughMs = 10, RoughMsAtTop = 14, KerbEvery = 0.09, KerbMs = 6;

        /// <summary>Milliseconds to vibrate this frame (0 = none): the strongest of what happened.</summary>
        public static double Step(RumbleState s, FeelFrame f)
        {
            double ms = 0;
            if (f.WreckedNow) ms = Wreck;
            else if (f.HealthLost > HitFloor) ms = System.Math.Min(HitMost, Hit + f.HealthLost * HitPerHealth);
            if (f.Landed > Landing) ms = System.Math.Max(ms, LandingMs);
            bool moving = f.Speed > MinSpeed;
            s.RoughIn -= f.Dt;
            s.KerbIn -= f.Dt;
            if (f.OnRough && moving)
            {
                if (!s.WasRough)
                {
                    ms = System.Math.Max(ms, RoughInMs);
                    s.RoughIn = RoughEvery;
                }
                else if (s.RoughIn <= 0)
                {
                    ms = System.Math.Max(ms, RoughMs + (RoughMsAtTop - RoughMs) * System.Math.Min(1, f.Speed / f.TopSpeed));
                    s.RoughIn = RoughEvery;
                }
            }
            else if (f.OnKerb && moving && s.KerbIn <= 0)
            {
                ms = System.Math.Max(ms, KerbMs);
                s.KerbIn = KerbEvery;
            }
            s.WasRough = f.OnRough && moving;
            return ms;
        }
    }

    public struct QualityLevel
    {
        public string Name;
        /// <summary>render resolution in multiples of game pixels (2: full, 1: half), bloom and tilt-shift blur on, the sun's shadow map (px square)</summary>
        public int Res;
        public bool Bloom, Blur;
        public int ShadowMap;
    }

    public enum GraphicsSetting { Auto, High, Low, Saver }

    public sealed class QualityGovernor
    {
        public static readonly QualityLevel[] Levels =
        {
            new QualityLevel { Name = "high", Res = 2, Bloom = true, Blur = true, ShadowMap = 2048 },
            new QualityLevel { Name = "medium", Res = 2, Bloom = false, Blur = true, ShadowMap = 1024 },
            new QualityLevel { Name = "low", Res = 1, Bloom = false, Blur = false, ShadowMap = 1024 },
            new QualityLevel { Name = "minimum", Res = 1, Bloom = false, Blur = false, ShadowMap = 512 },
        };

        public const double SlowMs = 20, Patience = 1.5, Warmup = 1.0, Judge = 1.0, Gain = 0.15;
        /// <summary>days a kept level is trusted</summary>
        public const double KeepDays = 3;

        public int Level;
        /// <summary>gave up: stepping down didn't help, so the level stays put</summary>
        public bool Locked;
        double avgMs = 16.7, slowFor, sinceChange;
        bool probing;
        int probeLevel;
        double probeMs;

        public QualityGovernor(int level = 0, bool locked = false)
        {
            Level = level;
            Locked = locked;
        }

        void Change(int level)
        {
            Level = level;
            slowFor = 0;
            sinceChange = 0;
            avgMs = 16.7;
        }

        /// <summary>Feed one frame's duration (seconds); returns the level to use.</summary>
        public int Sample(double dt)
        {
            if (Locked) return Level;
            sinceChange += dt;
            if (sinceChange < Warmup) return Level;
            avgMs += (dt * 1000 - avgMs) * 0.1;
            if (probing && Level != probeLevel && sinceChange >= Warmup + Judge && avgMs <= probeMs * (1 - Gain)) probing = false;
            slowFor = avgMs > SlowMs ? slowFor + dt : 0;
            if (slowFor < Patience) return Level;
            if (Level < Levels.Length - 1)
            {
                if (!probing) { probing = true; probeLevel = Level; probeMs = avgMs; }
                Change(Level + 1);
            }
            else if (probing)
            {
                Change(probeLevel);
                probing = false;
                Locked = true;
            }
            return Level;
        }

        /// <summary>Where a race before settled, if it's still to be trusted: from this version, no older than KeepDays (ms since 1970).</summary>
        public static bool Kept(int level, bool locked, double at, string version, double now, string thisVersion, out int keptLevel, out bool keptLocked)
        {
            keptLevel = 0;
            keptLocked = false;
            if (version != thisVersion || now - at > KeepDays * 86400000 || now < at) return false;
            if (level < 0 || level >= Levels.Length) return false;
            keptLevel = level;
            keptLocked = locked;
            return true;
        }

        /// <summary>The level GRAPHICS holds (HIGH, LOW; SAVER is LOW), or -1 under AUTO: the governor decides.</summary>
        public static int HeldLevel(GraphicsSetting g) => g == GraphicsSetting.High ? 0 : g == GraphicsSetting.Low || g == GraphicsSetting.Saver ? 2 : -1;

        /// <summary>Frames a second the setting draws at most (the screen's own rate when 0).</summary>
        public static int FrameCap(GraphicsSetting g) => g == GraphicsSetting.Saver ? 30 : 0;
    }

    public static class Access
    {
        /// <summary>how much bigger LARGE text is</summary>
        public const float LargeText = 1.2f;

        /// <summary>A split's colour (0xrrggbb): purple, green, amber; colour-safe, blue, white, orange.</summary>
        public static int SplitColor(SplitMark m, bool safe) => safe
            ? (m == SplitMark.Record ? 0x56b4e9 : m == SplitMark.Better ? 0xf4f2fa : 0xe69f00)
            : (m == SplitMark.Record ? 0xb36bff : m == SplitMark.Better ? 0x5fe0d0 : 0xf2c14e);

        /// <summary>What a split says after its time when colour-safe (in words, not colour alone).</summary>
        public static string SplitWord(SplitMark m, bool safe) => !safe ? "" : m == SplitMark.Record ? " · RECORD" : m == SplitMark.Better ? " · BEST" : "";
    }
}
