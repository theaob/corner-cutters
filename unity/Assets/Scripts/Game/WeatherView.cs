// The weather on the screen, as the web game shows it (src/f1/weather.ts lookAt, race.ts, race/drawCars.ts and
// engine/render/effects.ts Particles.spray): the sky's light on everything (the finish pass's light on flat ground,
// from the look's sky colour, its strength and the sun's), the ground darker as the track gets wet (the look's tint,
// on the ground's picture and the green beyond it), redone only as the look changes; and the spray the cars throw up
// off a wet track, soft grey puffs behind each car at speed that rise, spread and fade. The rain falling over the
// picture is HudView's.
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
            cam.backgroundColor = new Color(Beyond.r * tint.r, Beyond.g * tint.g, Beyond.b * tint.b);
            // the light on flat ground (the hemisphere's sky, as the face looks straight up, and the sun), linear, / π
            var sky = Lin(Look.Sky.Sky);
            var key = Lin(Look.Sky.Key);
            float amb = (float)Look.Sky.Ambient, ki = (float)Look.Sky.KeyIntensity * SunUp;
            TiltShiftEffect.Light = new Vector4((sky.r * amb + key.r * ki) / Mathf.PI, (sky.g * amb + key.g * ki) / Mathf.PI, (sky.b * amb + key.b * ki) / Mathf.PI, 0);
        }

        /// <summary>Shown afresh on the next Show (a new circuit's ground).</summary>
        public void Forget() { shownWetness = shownRain = -1; }

        static Color Lin(int rgb)
        {
            var c = TrackView.Hex(rgb);
            return new Color(ToLinear(c.r), ToLinear(c.g), ToLinear(c.b));
        }

        static float ToLinear(float c) => c <= 0.04045f ? c / 12.92f : Mathf.Pow((c + 0.055f) / 1.055f, 2.4f);

        // ---- the spray: a fixed pool of puffs, drawn as one mesh of quads turned to the camera ----

        struct Puff { public float X, Y, Z, Vx, Vy, Vz, Size, Grow, Life, MaxLife; public Color32 Color; }

        readonly Puff[] pool = new Puff[220];
        int next;
        Mesh mesh;
        Material material;
        readonly List<Vector3> verts = new List<Vector3>();
        readonly List<Color32> colors = new List<Color32>();
        readonly List<Vector2> uvs = new List<Vector2>();
        readonly List<int> tris = new List<int>();

        /// <summary>Spray off the track behind each car at speed (drawCars.ts): the faster, and the harder it rains, the more.</summary>
        public void Spray(IList<Entrant> cars, double rain, float dt)
        {
            if (!Look.Spray) return;
            foreach (var e in cars)
            {
                if (e.Progress.Retired) continue;
                var c = e.Car;
                double speed = Driving.SpeedOf(c);
                if (speed > 60 && Random.value < dt * (6 + 8 * rain) * System.Math.Min(1, speed / 250))
                    Spawn((float)(c.X - JsMath.Sin(c.Heading) * 14), (float)(c.Y + JsMath.Cos(c.Heading) * 14), (float)c.Z);
            }
        }

        void Spawn(float x, float y, float z)
        {
            ref var p = ref pool[next];
            next = (next + 1) % pool.Length;
            p.X = x + (Random.value - 0.5f) * 6;
            p.Y = y + (Random.value - 0.5f) * 6;
            p.Z = z + 3;
            p.Color = Random.value < 0.5f ? new Color32(0xd8, 0xde, 0xe8, 255) : new Color32(0xb8, 0xc0, 0xcc, 255);
            p.Size = 9;
            p.Grow = 9 * 1.2f;
            p.Life = p.MaxLife = 0.45f;
            p.Vx = (Random.value - 0.5f) * 6;
            p.Vy = (Random.value - 0.5f) * 6;
            p.Vz = 5;
        }

        /// <summary>The puffs on `dt` s (rising, spreading and fading), drawn to the camera.</summary>
        public void Step(float dt, Camera cam)
        {
            verts.Clear(); colors.Clear(); uvs.Clear(); tris.Clear();
            var right = cam.transform.right;
            var up = cam.transform.up;
            for (int i = 0; i < pool.Length; i++)
            {
                ref var p = ref pool[i];
                if (p.Life <= 0) continue;
                p.Life -= dt;
                if (p.Life <= 0) continue;
                p.X += p.Vx * dt; p.Y += p.Vy * dt; p.Z += p.Vz * dt;
                p.Size = Mathf.Max(0.5f, p.Size + p.Grow * dt);
                var at = Units.ToWorld(p.X, p.Y, p.Z);
                float half = p.Size / 2 * Units.PerPx;
                var col = p.Color;
                col.a = (byte)Mathf.RoundToInt(255 * p.Life / p.MaxLife * 0.8f);
                int b = verts.Count;
                verts.Add(at + (-right - up) * half); verts.Add(at + (right - up) * half); verts.Add(at + (right + up) * half); verts.Add(at + (-right + up) * half);
                for (int k = 0; k < 4; k++) colors.Add(col);
                uvs.Add(new Vector2(0, 0)); uvs.Add(new Vector2(1, 0)); uvs.Add(new Vector2(1, 1)); uvs.Add(new Vector2(0, 1));
                tris.Add(b); tris.Add(b + 1); tris.Add(b + 2); tris.Add(b); tris.Add(b + 2); tris.Add(b + 3);
            }
            if (verts.Count == 0) return;
            if (mesh == null)
            {
                mesh = new Mesh { name = "spray" };
                mesh.MarkDynamic();
                var shader = Resources.Load<Shader>("Shaders/PixelSeeThrough");
                if (shader == null) return;
                material = new Material(shader) { name = "Spray", mainTexture = PuffTexture() };
            }
            if (material == null) return;
            mesh.Clear();
            mesh.SetVertices(verts);
            mesh.SetColors(colors);
            mesh.SetUVs(0, uvs);
            mesh.SetTriangles(tris, 0);
            mesh.RecalculateBounds();
            Graphics.DrawMesh(mesh, Matrix4x4.identity, material, 0);
        }

        /// <summary>No puffs (a new session).</summary>
        public void Clear()
        {
            for (int i = 0; i < pool.Length; i++) pool[i].Life = 0;
        }

        /// <summary>A soft round puff (effects.ts puffTexture: 16 px, white, a radial fade from 1 px out to the edge).</summary>
        static Texture2D PuffTexture()
        {
            const int S = 16;
            var px = new Color32[S * S];
            for (int y = 0; y < S; y++)
                for (int x = 0; x < S; x++)
                {
                    float dx = x + 0.5f - 8, dy = y + 0.5f - 8;
                    float a = Mathf.Clamp01(1 - (Mathf.Sqrt(dx * dx + dy * dy) - 1) / 7);
                    px[y * S + x] = new Color32(255, 255, 255, (byte)Mathf.RoundToInt(255 * a));
                }
            var t = new Texture2D(S, S, TextureFormat.RGBA32, false) { filterMode = FilterMode.Bilinear, wrapMode = TextureWrapMode.Clamp, name = "puff" };
            t.SetPixels32(px);
            t.Apply(false, true);
            return t;
        }
    }
}
