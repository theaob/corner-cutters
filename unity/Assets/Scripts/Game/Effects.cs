// What a crash looks like, as the web game draws it (src/engine/render/effects.ts, src/f1/race/drawCars.ts):
//   - Particles: a fixed pool of puffs turned to the camera (smoke, flame, sparks, dust, mud, spray), each fading as
//     it lives out, rising, spreading or falling; flames and sparks glow (added over the picture), the rest are soft;
//   - CarFx: a damaged car smokes, a burning one flames and blackens, a wreck smoulders charred;
//   - DebrisView: parts torn off in a big crash (the nose, a wheel or two), thrown clear from where they sat and flown
//     by Core.Debris on the race's clock in fixed steps, so the replay throws them again just as they flew (and takes
//     the parts off the cars, and puts them back after a repair, when it did).
using CornerCutters.Core;
using System.Collections.Generic;
using UnityEngine;
using Grid = CornerCutters.Core.Grid;

namespace CornerCutters.Game
{
    public sealed class Particles
    {
        struct Puff
        {
            public float X, Y, H, Vx, Vy, Vh, Size, Grow, Fall, Life, MaxLife;
            public Color32 Color;
            public bool Glow;
        }

        Puff[] pool;
        int next;
        readonly Billboards soft, glow;

        public Particles(int size = 220)
        {
            pool = new Puff[size];
            var puff = PuffTexture();
            soft = new Billboards("Shaders/PixelSeeThrough", puff);
            glow = new Billboards("Shaders/PixelAdditive", puff);
        }

        static Color32 Rgb(int c) => new Color32((byte)(c >> 16), (byte)(c >> 8), (byte)c, 255);

        /// <summary>A puff at (x, y) on the map, `h` px up: its colour, life (s), size (px), rise (px/s), and whether it glows.</summary>
        ref Puff Spawn(float x, float y, float h, int color, float life, float size, float rise, bool additive)
        {
            ref var p = ref pool[next];
            next = (next + 1) % pool.Length;
            p.X = x + (Random.value - 0.5f) * 6;
            p.Y = y + (Random.value - 0.5f) * 6;
            p.H = h;
            p.Color = Rgb(color);
            p.Glow = additive;
            p.Size = size;
            p.Life = p.MaxLife = life;
            p.Vx = (Random.value - 0.5f) * 6;
            p.Vy = (Random.value - 0.5f) * 6;
            p.Vh = rise;
            p.Grow = size * 1.2f;
            p.Fall = 0;
            return ref p;
        }

        public void Smoke(float x, float y, bool dark, float h) => Spawn(x, y, h + 10, dark ? 0x2a2830 : 0x8a8894, 1.4f, 6, 14, false);
        public void Flame(float x, float y, float h) => Spawn(x, y, h + 13, Random.value < 0.5f ? 0xff7a1a : 0xffc23a, 0.5f, 10, 24, true);
        public void Dust(float x, float y, float h) => Spawn(x, y, h + 4, Random.value < 0.5f ? 0xe0cca4 : 0xc8a878, 1.0f, 10, 6, false);
        public void Spray(float x, float y, float h) => Spawn(x, y, h + 3, Random.value < 0.5f ? 0xd8dee8 : 0xb8c0cc, 0.45f, 9, 5, false);

        public void Mud(float x, float y, float h)
        {
            ref var p = ref Spawn(x, y, h + 3, Random.value < 0.5f ? 0x4a3020 : 0x5e3d28, 0.55f, 6, 30, false);
            p.Fall = 90;
            p.Grow = 2;
        }

        /// <summary>Sparks off a hit at (x, y), `h` px up: `n` bright specks flung out along (dx, dy) (or every way), up and out, falling.</summary>
        public void Sparks(float x, float y, float h, int n, float dx = 0, float dy = 0)
        {
            for (int k = 0; k < n; k++)
            {
                ref var p = ref Spawn(x, y, h + 3, Random.value < 0.5f ? 0xffe08a : 0xff9a3a, 0.25f + Random.value * 0.25f, 3.5f, 0, true);
                float a = Random.value * Mathf.PI * 2;
                float o = 60 + Random.value * 120;
                p.Vx = (dx + Mathf.Cos(a) * 0.7f) * o;
                p.Vy = (dy + Mathf.Sin(a) * 0.7f) * o;
                p.Vh = 40 + Random.value * 80;
                p.Fall = 420;
                p.Grow = -4;
                p.X = x; p.Y = y; p.H = h + 3;
            }
        }

        /// <summary>The puffs on `dt` s, drawn to the camera.</summary>
        public void Step(float dt, Camera cam)
        {
            soft.Begin(cam);
            glow.Begin(cam);
            for (int i = 0; i < pool.Length; i++)
            {
                ref var p = ref pool[i];
                if (p.Life <= 0) continue;
                p.Life -= dt;
                if (p.Life <= 0) continue;
                p.Vh -= p.Fall * dt;
                p.X += p.Vx * dt; p.Y += p.Vy * dt; p.H += p.Vh * dt;
                p.Size = Mathf.Max(0.5f, p.Size + p.Grow * dt);
                var c = p.Color;
                c.a = (byte)Mathf.RoundToInt(255 * p.Life / p.MaxLife * 0.8f);
                (p.Glow ? glow : soft).Add(Units.ToWorld(p.X, p.Y, p.H), p.Size * Units.PerPx, c);
            }
            soft.Draw();
            glow.Draw();
        }

        public void Clear()
        {
            for (int i = 0; i < pool.Length; i++) pool[i].Life = 0;
        }

        /// <summary>A pool of `size` puffs, all gone (race.ts: 90, or 220 in the wet and on dirt, where every car throws up spray or mud).</summary>
        public void Resize(int size)
        {
            if (pool.Length != size) pool = new Puff[size];
            next = 0;
            Clear();
        }

        /// <summary>A soft round puff (effects.ts puffTexture: 16 px, white, a radial fade from 1 px out to the edge).</summary>
        public static Texture2D PuffTexture()
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

    /// <summary>Quads turned to the camera, built into one mesh a frame and drawn with one material.</summary>
    public sealed class Billboards
    {
        readonly Mesh mesh;
        readonly Material material;
        readonly List<Vector3> verts = new List<Vector3>();
        readonly List<Color32> colors = new List<Color32>();
        readonly List<Vector2> uvs = new List<Vector2>();
        readonly List<int> tris = new List<int>();
        Vector3 right, up;

        public Billboards(string shader, Texture2D texture)
        {
            mesh = new Mesh { name = "billboards" };
            mesh.MarkDynamic();
            var s = Resources.Load<Shader>(shader);
            if (s != null) material = new Material(s) { name = shader, mainTexture = texture };
        }

        public void Begin(Camera cam)
        {
            verts.Clear(); colors.Clear(); uvs.Clear(); tris.Clear();
            right = cam.transform.right;
            up = cam.transform.up;
        }

        /// <summary>A quad `size` units across at `at`.</summary>
        public void Add(Vector3 at, float size, Color32 c)
        {
            float half = size / 2;
            int b = verts.Count;
            verts.Add(at + (-right - up) * half); verts.Add(at + (right - up) * half); verts.Add(at + (right + up) * half); verts.Add(at + (-right + up) * half);
            for (int k = 0; k < 4; k++) colors.Add(c);
            uvs.Add(new Vector2(0, 0)); uvs.Add(new Vector2(1, 0)); uvs.Add(new Vector2(1, 1)); uvs.Add(new Vector2(0, 1));
            tris.Add(b); tris.Add(b + 1); tris.Add(b + 2); tris.Add(b); tris.Add(b + 2); tris.Add(b + 3);
        }

        public void Draw()
        {
            if (verts.Count == 0 || material == null) return;
            mesh.Clear();
            mesh.SetVertices(verts);
            mesh.SetColors(colors);
            mesh.SetUVs(0, uvs);
            mesh.SetTriangles(tris, 0);
            mesh.RecalculateBounds();
            Graphics.DrawMesh(mesh, Matrix4x4.identity, material, 0);
        }
    }

    /// <summary>A car's smoke, fire and charred paint (effects.ts CarFx), and its dust off rough ground.</summary>
    public sealed class CarFx
    {
        float emit, dustEmit;

        /// <summary>`at`: the car's place (px, h up); `dust` (0…1): how hard it's kicking up dust.</summary>
        public void Update(float dt, CarCondition condition, Particles particles, CarView view, float x, float y, float h, float dust = 0)
        {
            dustEmit -= dt;
            if (dust > 0 && dustEmit <= 0)
            {
                particles.Dust(x, y, h);
                dustEmit = 0.2f - dust * 0.15f;
            }
            emit -= dt;
            if (emit <= 0 && condition != CarCondition.Ok)
            {
                if (condition == CarCondition.Smoking)
                {
                    particles.Smoke(x, y, false, h);
                    emit = 0.18f;
                }
                else if (condition == CarCondition.Burning)
                {
                    particles.Flame(x, y, h);
                    if (Random.value < 0.5f) particles.Smoke(x, y, true, h);
                    emit = 0.05f;
                }
                else
                {
                    particles.Smoke(x, y, true, h);
                    emit = 0.35f;
                }
            }
            view.Char(condition == CarCondition.Wrecked ? 0.22f : condition == CarCondition.Burning ? 0.6f : 1f);
        }
    }

    public sealed class DebrisView
    {
        /// <summary>debris steps a second: a fixed step, so a piece flies the same way live and again in the replay</summary>
        const double Hz = 60;
        /// <summary>s of throws kept, for the replay</summary>
        const double Kept = 40;

        sealed class Shed
        {
            public GameObject Part, Obj;
            public CarView Car;
            public double At;
            public double? Fixed;
            public Piece Start, Piece, Replay;
            public int Steps, ReplaySteps;
            public bool Live;
            /// <summary>its resting pose (lying as it lands), which its tumble turns; how high its origin stands lying so (px)</summary>
            public Quaternion Pose;
            public float Lift;
        }

        readonly List<Shed> shed = new List<Shed>();
        readonly Transform parent;
        readonly Grid grid;

        public DebrisView(Transform parent, Grid grid)
        {
            this.parent = parent;
            this.grid = grid;
        }

        double Ground(double x, double y) => Sim.GroundAt(grid, x, y).H;

        /// <summary>
        /// Tear `part` off `car` (if it's still on) at race time `at`, moving with the car at (vx, vy) px/s; `power` (0…1)
        /// throws it harder. `onItsSide` lays it down on its side (a wheel).
        /// </summary>
        public void Tear(CarView car, GameObject part, double at, double vx, double vy, double power, bool onItsSide = false)
        {
            if (!part.activeSelf) return;
            var where = part.transform.position;
            var quat = part.transform.rotation;
            var centre = car.Root.transform.position;
            // (in the map's px: x east, y south)
            double ox = (where.x - centre.x) / Units.PerPx, oy = -(where.z - centre.z) / Units.PerPx;
            double d = JsMath.Hypot(ox, oy);
            if (d == 0) d = 1;
            var copy = new GameObject(part.name + " (debris)");
            copy.transform.SetParent(parent, false);
            var mesh = part.GetComponent<MeshFilter>().sharedMesh;
            copy.AddComponent<MeshFilter>().sharedMesh = mesh;
            copy.AddComponent<MeshRenderer>().sharedMaterial = car.Paint;
            var pose = onItsSide ? quat * Quaternion.AngleAxis(90, Vector3.forward) : quat;
            float lift = LowestBelow(mesh, pose) / Units.PerPx;
            part.SetActive(false);
            double h = where.y / Units.PerPx - lift;
            var start = Debris.Fling(where.x / Units.PerPx, -where.z / Units.PerPx, h, vx, vy, ox / d, oy / d, power, () => Random.value);
            shed.Add(new Shed { Part = part, Obj = copy, Car = car, At = at, Start = start, Piece = start.Clone(), Live = true, Pose = pose, Lift = lift });
            Place(shed[shed.Count - 1], start);
        }

        /// <summary>How far below its origin a mesh reaches, turned by `q` (units).</summary>
        static float LowestBelow(Mesh mesh, Quaternion q)
        {
            float low = 0;
            foreach (var v in mesh.vertices) low = Mathf.Min(low, (q * v).y);
            return -low;
        }

        /// <summary>The parts torn off `car` put back on at race time `at` (a repaired car).</summary>
        public void Refit(CarView car, double at)
        {
            foreach (var s in shed)
            {
                if (s.Fixed.HasValue || s.Car != car) continue;
                s.Fixed = at;
                s.Part.SetActive(true);
            }
        }

        /// <summary>Move the pieces on to race time `now`.</summary>
        public void Update(double now)
        {
            foreach (var s in shed)
            {
                if (!s.Live) continue;
                s.Steps = FlyTo(s.Piece, s.Steps, (now - s.At) * Hz);
                if (Debris.Gone(s.Piece))
                {
                    s.Live = false;
                    s.Obj.SetActive(false);
                    continue;
                }
                Place(s, s.Piece);
            }
            for (int i = shed.Count - 1; i >= 0; i--)
                if (!shed[i].Live && now - shed[i].At > Kept)
                {
                    Object.Destroy(shed[i].Obj);
                    shed.RemoveAt(i);
                }
        }

        bool OffAt(GameObject part, double t) => shed.Exists(s => s.Part == part && s.At <= t && (s.Fixed == null || s.Fixed > t));

        /// <summary>The pieces as they were at race time `t`, for the replay (and the parts on the cars, then).</summary>
        public void Replay(double t)
        {
            foreach (var s in shed)
            {
                bool off = s.At <= t && (s.Fixed == null || s.Fixed > t);
                s.Part.SetActive(!OffAt(s.Part, t));
                if (!off) { s.Obj.SetActive(false); continue; }
                double target = (t - s.At) * Hz;
                if (s.Replay == null || s.ReplaySteps > target) { s.Replay = s.Start.Clone(); s.ReplaySteps = 0; }
                s.ReplaySteps = FlyTo(s.Replay, s.ReplaySteps, target);
                if (Debris.Gone(s.Replay)) { s.Obj.SetActive(false); continue; }
                s.Obj.SetActive(true);
                Place(s, s.Replay);
            }
        }

        /// <summary>Back from the replay: the pieces, and the parts on the cars, as they are now.</summary>
        public void Back()
        {
            foreach (var s in shed)
            {
                s.Replay = null;
                s.Part.SetActive(!OffAt(s.Part, double.PositiveInfinity));
                s.Obj.SetActive(s.Live);
                if (s.Live) Place(s, s.Piece);
            }
        }

        public void Clear()
        {
            foreach (var s in shed) Object.Destroy(s.Obj);
            shed.Clear();
        }

        int FlyTo(Piece p, int from, double to)
        {
            int k = from;
            for (; k + 1 <= to + 1e-6; k++) Debris.Step(p, 1 / Hz, Ground);
            return k;
        }

        void Place(Shed s, Piece p)
        {
            double h = p.H + s.Lift - Debris.Sunk(p) * (s.Lift + 6);
            s.Obj.transform.position = Units.ToWorld(p.X, p.Y, h);
            // (its tumble about the ground's axes, three.js's x, y and z in that order; here, with z flipped, the turns about
            // x and up run the other way and the one about z the same)
            const float Deg = 180f / Mathf.PI;
            var turn = Quaternion.AngleAxis(-(float)p.Rot[0] * Deg, Vector3.right) * Quaternion.AngleAxis(-(float)p.Rot[1] * Deg, Vector3.up) * Quaternion.AngleAxis((float)p.Rot[2] * Deg, Vector3.forward);
            s.Obj.transform.rotation = turn * s.Pose;
        }
    }
}
