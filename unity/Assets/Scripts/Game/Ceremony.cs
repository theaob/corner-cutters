// The champagne ceremony, as the web game stages it (src/f1/podium3d.ts createCeremony, race/ceremonyView.ts): parc
// fermé. The top three cars stand nose to the camera on a patch of tarmac in front of a wall in the winner's team
// colours (the circuit's name on it), each with a gold, silver or bronze board at its nose, the winner in the middle,
// second on its left, third on its right, each driver up on their car. Over CEREMONY.len s the drivers climb up, lift
// their trophies (the confetti starts, the winner hops), then the corks pop and the champagne sprays (second and third
// at the winner, the winner at both) under fireworks. The camera holds on third, sweeps across to the winner and
// settles on the three of them. It's a set of its own, far off the circuit, so nothing stands in the camera's way.
// Sizes are the web game's px; its +z (toward the camera) is -Z here.
using CornerCutters.Core;
using System.Collections.Generic;
using UnityEngine;

namespace CornerCutters.Game
{
    public sealed class Ceremony
    {
        /// <summary>s: the ceremony's length, the trophies up, the champagne out, the corks' pop after it's out</summary>
        public const float Len = 10, TrophyAt = 2, SprayAt = 4.5f, Pop = 0.35f;
        static readonly float[] ParcX = { 0, -24, 24 };
        const float Stand = 5.6f, BoardZ = 17;
        const float WallZ = -24, WallW = 112, WallH = 40;
        const float Hold = 1.4f, Sweep = 2.2f, Rise = 10;
        static readonly int[] Tops = { 0xf2c14e, 0xc9ccd4, 0xc98a4b };
        const int Drops = 900, Foam = 60, ConfettiCount = 500, Bursts = 6, SparkCount = 70;
        const float K = Units.PerPx;

        /// <summary>where the set stands: far from every circuit</summary>
        static readonly Vector3 Origin = new Vector3(-4000, 0, -4000);

        public readonly GameObject Root;
        readonly Material wallMat;
        readonly GameObject[] bays = new GameObject[3];
        readonly Driver[] drivers = new Driver[3];
        readonly Pool spray, confetti;
        readonly Pool[] bursts = new Pool[Bursts];
        readonly float[] burstAge = new float[Bursts];
        readonly Billboards points;
        int count;
        float lastT = -1, confettiDue, fireworkDue;
        int seed = 11;

        sealed class Driver
        {
            public GameObject Figure, Lifts, Sprays, Trophy, Bottle, Cork;
            public int Side;
            public Vector3 CorkVel;
            public bool CorkFlying;
        }

        /// <summary>A pool of points: where each is (stage px; y below -500: parked), how fast it goes, its colour.</summary>
        sealed class Pool
        {
            public Vector3[] Pos, Vel;
            public Color32[] Col;
            public float Size, Opacity = 1;
            public int Next;
            public Pool(int n, float size, int[] colors)
            {
                Pos = new Vector3[n]; Vel = new Vector3[n]; Col = new Color32[n];
                Size = size;
                for (int i = 0; i < n; i++) { Pos[i] = new Vector3(0, -999, 0); Col[i] = (Color32)TrackView.Hex(colors[i % colors.Length]); }
            }
            public void Park() { for (int i = 0; i < Pos.Length; i++) Pos[i].y = -999; Next = 0; }
        }

        float Rnd()
        {
            seed = (int)((long)seed * 16807 % 2147483647);
            return seed / 2147483647f;
        }

        static float Smooth(float k)
        {
            float u = Mathf.Clamp01(k);
            return u * u * (3 - 2 * u);
        }

        static void Box(MeshBuilder mb, float w, float h, float d, Color c, float x, float y, float z)
        {
            mb.Box(new Vector3(x * K, y * K, -z * K), new Vector3(w * K, h * K, d * K), c);

        }

        static GameObject Obj(string name, Transform parent, MeshBuilder mb, Material mat = null)
        {
            var go = new GameObject(name);
            go.transform.SetParent(parent, false);
            go.AddComponent<MeshFilter>().sharedMesh = mb.ToMesh(name);
            go.AddComponent<MeshRenderer>().sharedMaterial = mat ?? MeshBuilder.VertexColorMaterial();
            return go;
        }

        public Ceremony(Transform parent)
        {
            Root = new GameObject("Ceremony");
            Root.transform.SetParent(parent, false);
            Root.transform.position = Origin;
            Color H(int c) => TrackView.Hex(c);
            // the set: grass, the parc fermé's tarmac with its bays, the main straight in front and its kerb
            var set = new MeshBuilder();
            Box(set, 1600, 2, 1600, H(0x3f7d38), 0, -1, 0);
            Box(set, 124, 0.4f, 66, H(0x3a3946), 0, 0.2f, 2);
            foreach (float x in new float[] { -36, -12, 12, 36 }) Box(set, 0.8f, 0.5f, 32, H(0xf4f4f8), x, 0.25f, 0);
            Box(set, 1600, 0.4f, 56, H(0x2b2a33), 0, 0.2f, 72);
            for (int x = -240; x < 240; x += 10) Box(set, 10, 0.5f, 3, (x / 10) % 2 != 0 ? H(0xd8323c) : H(0xf4f4f8), x + 5, 0.25f, 42);
            // the boards at the noses (their numbers are drawn over them: Labels)
            for (int k = 0; k < 3; k++)
            {
                Box(set, 10, 6, 0.8f, H(Tops[k]), ParcX[k], 5.5f, BoardZ);
                foreach (float s in new[] { -3.5f, 3.5f }) Box(set, 0.6f, 2.6f, 0.6f, H(0x5d6270), ParcX[k] + s, 1.3f, BoardZ);
            }
            Obj("set", Root.transform, set);
            // the wall behind, in the winner's colours (its material's tint), a stripe of their trim along its top
            var wall = new MeshBuilder();
            Box(wall, WallW, WallH, 3, Color.white, 0, WallH / 2, WallZ);
            wallMat = new Material(MeshBuilder.VertexColorMaterial()) { name = "Ceremony wall" };
            Obj("wall", Root.transform, wall, wallMat);
            // the cars' bays (the race's cars go in, turned nose to the camera)
            for (int k = 0; k < 3; k++)
            {
                bays[k] = new GameObject("bay " + (k + 1));
                bays[k].transform.SetParent(Root.transform, false);
                bays[k].transform.localPosition = new Vector3(ParcX[k] * K, 0, 0);
                bays[k].transform.localRotation = Quaternion.Euler(0, 180, 0);
            }
            spray = new Pool(Drops + Foam * 3, 2.2f, new[] { 0xfff1a8, 0xf2d36b, 0xffffff, 0xfff8dc });
            confetti = new Pool(ConfettiCount, 1.8f, new[] { 0xd8323c, 0x3d7fc4, 0xf2c14e, 0x5fe0d0, 0xff5fb8, 0xf4f4f8 });
            int[] fireworks = { 0xff4fd8, 0xf2c14e, 0x5fe0d0, 0xd8323c, 0xf4f4f8 };
            for (int n = 0; n < Bursts; n++) { bursts[n] = new Pool(SparkCount, 2.4f, new[] { fireworks[n % fireworks.Length] }); burstAge[n] = 9; }
            points = new Billboards("Shaders/PixelSeeThrough", Texture2D.whiteTexture);
            Root.SetActive(false);
        }

        /// <summary>A driver up on their car: dark legs, the suit in the team's colour with its trim, arms (to raise), a helmet with its visor; a trophy, a bottle, a cork.</summary>
        Driver MakeDriver(int k, Color body, Color trim, Color helmet)
        {
            var dark = TrackView.Hex(0x26253a);
            var gold = TrackView.Hex(0xf2c14e);
            var d = new Driver { Side = k == 1 ? 1 : -1 };
            var fig = new MeshBuilder();
            foreach (float x in new[] { -1.1f, 1.1f }) Box(fig, 1.8f, 4.5f, 1.8f, dark, x, 2.25f, 0);
            Box(fig, 4.6f, 5, 2.8f, body, 0, 7, 0);
            Box(fig, 4.7f, 1, 2.9f, trim, 0, 5.6f, 0);
            Box(fig, 3.6f, 3.6f, 3.6f, helmet, 0, 11.4f, 0);
            Box(fig, 3.7f, 1.1f, 1.2f, dark, 0, 11.7f, 1.4f);
            d.Figure = Obj("driver", Root.transform, fig);
            GameObject Arm(int side)
            {
                var arm = new MeshBuilder();
                Box(arm, 1.4f, 4.6f, 1.4f, body, 0, -2.1f, 0);
                var pivot = Obj("arm", d.Figure.transform, arm);
                pivot.transform.localPosition = new Vector3(side * 3 * K, 9.2f * K, 0);
                return pivot;
            }
            var plus = Arm(1);
            var minus = Arm(-1);
            d.Sprays = d.Side > 0 ? plus : minus;
            d.Lifts = d.Side > 0 ? minus : plus;
            var trophy = new MeshBuilder();
            float s = k == 0 ? 1.4f : 1;
            Box(trophy, 2.2f * s, 2.6f * s, 2.2f * s, gold, 0, 1.9f * s, 0);
            Box(trophy, 0.8f * s, 1.3f * s, 0.8f * s, gold, 0, 0.4f * s, 0);
            Box(trophy, 2 * s, 0.5f * s, 2 * s, TrackView.Hex(0xd9a830), 0, -0.25f * s, 0);
            d.Trophy = Obj("trophy", Root.transform, trophy);
            var bottle = new MeshBuilder();
            Box(bottle, 1.1f, 3.2f, 1.1f, TrackView.Hex(0x1f5a2e), 0, 0, 0);
            Box(bottle, 0.6f, 1.1f, 0.6f, gold, 0, 2.1f, 0);
            d.Bottle = Obj("bottle", Root.transform, bottle);
            var cork = new MeshBuilder();
            Box(cork, 0.7f, 0.9f, 0.7f, TrackView.Hex(0xd9b07a), 0, 0, 0);
            d.Cork = Obj("cork", Root.transform, cork);
            d.Cork.SetActive(false);
            return d;
        }

        /// <summary>Dress the top three (winner first): their cars (CarViews built without the helmet), colours, the wall in the winner's.</summary>
        public void SetDrivers(IList<(CarView car, Team team, bool you)> top)
        {
            count = top.Count;
            for (int k = 0; k < 3; k++)
            {
                if (drivers[k] != null)
                {
                    foreach (var go in new[] { drivers[k].Figure, drivers[k].Trophy, drivers[k].Bottle, drivers[k].Cork }) Object.Destroy(go);
                    drivers[k] = null;
                }
                foreach (Transform c in bays[k].transform) Object.Destroy(c.gameObject);
                if (k >= top.Count) continue;
                var who = top[k];
                drivers[k] = MakeDriver(k, TrackView.Hex(who.team.Body), TrackView.Hex(who.team.Trim), who.you ? TrackView.Hex(0xf2c14e) : TrackView.Hex(0xf4f4f8));
                who.car.Root.transform.SetParent(bays[k].transform, false);
                who.car.Root.transform.localPosition = Vector3.zero;
                who.car.Root.transform.localRotation = Quaternion.identity;
            }
            if (top.Count > 0) wallMat.color = TrackView.Hex(top[0].team.Body);
            spray.Park();
            confetti.Park();
            foreach (var b in bursts) b.Park();
            for (int n = 0; n < Bursts; n++) burstAge[n] = 9;
            lastT = -1;
            confettiDue = fireworkDue = 0;
            seed = 11;
        }

        public void Show(bool on) { if (Root.activeSelf != on) Root.SetActive(on); }

        /// <summary>A point of the set (px, its +z toward the camera) in the world.</summary>
        public Vector3 World(Vector3 px) => Origin + new Vector3(px.x * K, px.y * K, -px.z * K);
        Vector3 Stage(Vector3 world) { var v = world - Origin; return new Vector3(v.x / K, v.y / K, -v.z / K); }

        Vector3 HandOf(GameObject pivot) => Stage(pivot.transform.TransformPoint(new Vector3(0, -4.4f * K, 0)));

        /// <summary>Which way each place sprays at `t`: second at the winner, third at the winner, the winner at both.</summary>
        static float Aim(int k, float t) => k == 0 ? Mathf.Sin(t * 2.2f) : k == 1 ? 1 : -1;

        void Launch(Pool p, Vector3 at, float vx, float vy, float vz)
        {
            int i = p.Next;
            p.Next = (p.Next + 1) % p.Pos.Length;
            p.Pos[i] = at;
            p.Vel[i] = new Vector3(vx, vy, vz);
        }

        static void Fly(Pool p, float dt, float gravity, float drag = 0, float fall = float.PositiveInfinity, float sway = 0, float t = 0)
        {
            for (int i = 0; i < p.Pos.Length; i++)
            {
                if (p.Pos[i].y < -500) continue;
                var v = p.Vel[i];
                v.y = Mathf.Max(-fall, v.y - gravity * dt);
                if (drag > 0) { v.x *= 1 - drag * dt; v.z *= 1 - drag * dt; }
                p.Vel[i] = v;
                float ny = p.Pos[i].y + v.y * dt;
                if (ny < 0) p.Pos[i] = new Vector3(0, -999, 0);
                else p.Pos[i] = new Vector3(p.Pos[i].x + (v.x + Mathf.Sin(t * 2 + i) * sway) * dt, ny, p.Pos[i].z + v.z * dt);
            }
        }

        /// <summary>Animate: `t` s since the ceremony began, `dt` since the last frame; drawn to `cam`.</summary>
        public void Update(float t, float dt, Camera cam)
        {
            float popAt = SprayAt + Pop;
            bool pop = lastT < popAt && t >= popAt;
            for (int k = 0; k < 3; k++)
            {
                var d = drivers[k];
                if (d == null) continue;
                float climb = Smooth((t - k * 0.2f) / 0.6f);
                float y = Stand - (1 - climb) * 5;
                if (k == 0 && t > TrophyAt) y += Mathf.Abs(Mathf.Sin((t - TrophyAt) * 6)) * 1.8f;
                d.Figure.transform.position = World(new Vector3(ParcX[k], y, 2.5f));
                float up = Smooth((t - TrophyAt) * 4);
                bool out_ = t > SprayAt;
                // (an arm turned about the set's z: the same way here, its x and y unchanged)
                d.Lifts.transform.localRotation = Quaternion.AngleAxis(-d.Side * up * 2.8f * Mathf.Rad2Deg, Vector3.forward);
                float sprays = d.Side * (out_ ? (k == 0 ? 2.3f + Mathf.Sin(t * 2.2f) * 0.3f : 1.7f) : up * 2.6f + Mathf.Sin(t * 6 + k) * 0.2f * up);
                d.Sprays.transform.localRotation = Quaternion.AngleAxis(sprays * Mathf.Rad2Deg, Vector3.forward);
                // (second and third turn a touch toward the winner; a turn about up runs the other way here)
                float turn = out_ && k > 0 ? (k == 1 ? 0.35f : -0.35f) : 0;
                d.Figure.transform.rotation = Quaternion.AngleAxis(-turn * Mathf.Rad2Deg, Vector3.up);
                d.Trophy.SetActive(t > TrophyAt);
                d.Trophy.transform.position = World(HandOf(d.Lifts) + new Vector3(0, 0.4f, 0));
                d.Bottle.SetActive(out_);
                var bottleAt = HandOf(d.Sprays) + new Vector3(0, 1, 0);
                var bottleTurn = Quaternion.AngleAxis(-Aim(k, t) * 0.7f * Mathf.Rad2Deg, Vector3.forward);
                d.Bottle.transform.position = World(bottleAt);
                d.Bottle.transform.rotation = bottleTurn;
                var neck = bottleAt + bottleTurn * new Vector3(0, 2.7f, 0);
                if (pop)
                {
                    d.Cork.SetActive(true);
                    d.CorkFlying = true;
                    d.Cork.transform.position = World(neck);
                    d.CorkVel = new Vector3(Aim(k, t) * 10 + (Rnd() - 0.5f) * 6, 46 + Rnd() * 10, 6);
                    for (int j = 0; j < Foam; j++)
                    {
                        float a = Rnd() * Mathf.PI * 2;
                        float s = 8 + Rnd() * 14;
                        Launch(spray, neck, Mathf.Cos(a) * s, 10 + Rnd() * 22, Mathf.Sin(a) * s + 4);
                    }
                }
                if (d.CorkFlying)
                {
                    d.CorkVel.y -= 60 * dt;
                    var c = Stage(d.Cork.transform.position) + d.CorkVel * dt;
                    d.Cork.transform.position = World(c);
                    d.Cork.transform.rotation = Quaternion.AngleAxis(-t * 14 * Mathf.Rad2Deg, Vector3.right);
                    if (c.y < 0) { d.CorkFlying = false; d.Cork.SetActive(false); }
                }
                if (t >= popAt && t < Len)
                {
                    int n = Mathf.Max(2, Mathf.RoundToInt(260 * dt));
                    float dir = Aim(k, t);
                    for (int j = 0; j < n; j++) Launch(spray, neck, dir * (24 + Rnd() * 10) + (Rnd() - 0.5f) * 6, 20 + Rnd() * 12, 5 + (Rnd() - 0.5f) * 8);
                }
            }
            Fly(spray, dt, 50);
            if (t > TrophyAt && t < Len)
            {
                confettiDue += dt * 150;
                for (; confettiDue >= 1; confettiDue--)
                    Launch(confetti, new Vector3((Rnd() - 0.5f) * 120, 70 + Rnd() * 25, -14 + Rnd() * 40), (Rnd() - 0.5f) * 8, -6 - Rnd() * 6, (Rnd() - 0.5f) * 8);
            }
            Fly(confetti, dt, 6, 1.5f, 12, 4, t);
            if (t > SprayAt && t < Len)
            {
                fireworkDue -= dt;
                if (fireworkDue <= 0)
                {
                    fireworkDue = 0.6f + Rnd() * 0.6f;
                    int oldest = 0;
                    for (int n = 1; n < Bursts; n++) if (burstAge[n] > burstAge[oldest]) oldest = n;
                    burstAge[oldest] = 0;
                    bursts[oldest].Park();
                    var at = new Vector3((Rnd() - 0.5f) * 100, 54 + Rnd() * 22, WallZ - 20);
                    for (int j = 0; j < SparkCount; j++)
                    {
                        float a = Rnd() * Mathf.PI * 2, e = Rnd() * Mathf.PI - Mathf.PI / 2, s = 22 + Rnd() * 8;
                        Launch(bursts[oldest], at, Mathf.Cos(a) * Mathf.Cos(e) * s, Mathf.Sin(e) * s, Mathf.Sin(a) * Mathf.Cos(e) * s);
                    }
                }
            }
            for (int n = 0; n < Bursts; n++)
            {
                burstAge[n] += dt;
                bursts[n].Opacity = Mathf.Max(0, 1 - burstAge[n] / 1.6f);
                if (burstAge[n] < 1.6f) Fly(bursts[n], dt, 14);
                else if (bursts[n].Pos[0].y > -500) bursts[n].Park();
            }
            lastT = t;
            // the points, drawn
            points.Begin(cam);
            foreach (var p in new[] { spray, confetti }) Draw(p);
            foreach (var b in bursts) Draw(b);
            points.Draw();
        }

        void Draw(Pool p)
        {
            for (int i = 0; i < p.Pos.Length; i++)
            {
                if (p.Pos[i].y < -500) continue;
                var c = p.Col[i];
                c.a = (byte)Mathf.RoundToInt(255 * p.Opacity);
                points.Add(World(p.Pos[i]), p.Size * K, c);
            }
        }

        /// <summary>The camera at `t` s: on third, then across to the winner, pulling back to the three of them, centred.</summary>
        public void Aim(float t, Camera cam)
        {
            float k = Smooth((t - Hold) / Sweep);
            float Mix(float a, float b) => a + (b - a) * k;
            float tanV = Mathf.Tan(cam.fieldOfView / 2 * Mathf.Deg2Rad);
            float halfW = Mix(20, 40), halfH = Mix(14, 30);
            float d = Mathf.Max(halfH / tanV, halfW / (tanV * cam.aspect));
            float rise = Rise * Mathf.Deg2Rad;
            var at = new Vector3(Mix(ParcX[2], 0), Mix(9, 15), 2);
            var eye = at + new Vector3(0, Mathf.Sin(rise) * d, Mathf.Cos(rise) * d);
            cam.transform.position = World(eye);
            cam.transform.rotation = Quaternion.LookRotation(World(at) - World(eye), Vector3.up);
        }

        /// <summary>The set's words, on the screen (the pixel font isn't on the set): where each goes, in the world.</summary>
        public Vector3 WallTop => World(new Vector3(0, WallH * 0.7f, WallZ + 1.6f));
        public Vector3 WallEdge => World(new Vector3(WallW / 2, WallH * 0.7f, WallZ + 1.6f));
        public Vector3 Board(int k) => World(new Vector3(ParcX[k], 5.5f, BoardZ + 0.5f));
        public Vector3 Plate(int k) => World(new Vector3(ParcX[k], 1.2f, BoardZ + 1));
        public int Count => count;
    }
}
