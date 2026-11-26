// The gopher (Maple Island) and the yeti (Glacier Pass), drawn as the web game draws them (buildGopher, buildYeti):
// their runs are Core's GopherRun and YetiRun, driven by your car; their models are the web game's own, baked in pieces
// (Resources/Scenery/<id>-gopher.bytes, -yeti.bytes: npm run unity:scenery) and posed here each frame.
using System.Collections.Generic;
using System.IO;
using System.Text;
using CornerCutters.Core;
using UnityEngine;

namespace CornerCutters.Game
{
    public sealed class CritterView
    {
        readonly CornerCutters.Core.Grid grid;
        readonly GopherRun gopher;
        readonly YetiRun yeti;
        readonly double gopherSize, yetiSize, yetiRoar;
        /// <summary>each piece's mesh by role, and where it hangs on the body at rest (the web game's px and axes)</summary>
        readonly Dictionary<int, Mesh> meshes = new Dictionary<int, Mesh>();
        readonly Dictionary<int, Vector3> pivots = new Dictionary<int, Vector3>();
        readonly Material material;
        readonly List<CritterCar> cars = new List<CritterCar>(1);
        float time;

        CritterView(BinaryReader r, CircuitData c)
        {
            grid = c.ToGrid();
            int len = r.ReadInt32();
            var numbers = JsonUtility.FromJson<CritterNumbers>(Encoding.UTF8.GetString(r.ReadBytes(len)));
            var track = c.ToTrack();
            if (numbers.kind == "gopher")
            {
                gopher = new GopherRun(track, numbers.gopher, numbers.halfWidth);
                gopherSize = numbers.gopher.size;
            }
            if (numbers.kind == "yeti")
            {
                yeti = new YetiRun(track, numbers.yeti, numbers.halfWidth, numbers.avoid);
                yetiSize = numbers.yeti.size;
                yetiRoar = numbers.yeti.roar;
            }
            material = MeshBuilder.VertexColorMaterial();
            var chunks = new Dictionary<int, BakedScenery.Chunk>();
            int count = r.ReadInt32();
            for (int k = 0; k < count; k++)
            {
                int role = r.ReadInt32();
                pivots[role] = new Vector3(r.ReadSingle(), r.ReadSingle(), r.ReadSingle());
                var part = BakedScenery.ReadPart(r);
                var m = BakedScenery.ReadPlace(r, out var tint);
                if (!chunks.TryGetValue(role, out var ch)) chunks[role] = ch = new BakedScenery.Chunk();
                BakedScenery.Add(ch, part, m, m, tint);
            }
            foreach (var kv in chunks) meshes[kv.Key] = kv.Value.ToMesh($"critter {kv.Key}");
        }

        /// <summary>The circuit's gopher and yeti (whichever it has), or null if neither.</summary>
        public static CritterView Load(CircuitData c)
        {
            CritterView view = null;
            foreach (var kind in new[] { "gopher", "yeti" })
            {
                var asset = Resources.Load<TextAsset>($"Scenery/{c.id}-{kind}");
                if (asset == null) continue;
                var r = new BinaryReader(new MemoryStream(asset.bytes));
                if (new string(r.ReadChars(4)) != "CCR1") continue;
                // (a circuit has one or the other)
                view = new CritterView(r, c);
            }
            return view;
        }

        /// <summary>dt s on, your car at (x, y) going (vx, vy) px/s (the camera's on it); draws them (every rendered frame).</summary>
        public void Step(float dt, double x, double y, double vx, double vy)
        {
            time += dt;
            if (gopher != null)
            {
                cars.Clear();
                cars.Add(new CritterCar { X = x, Y = y, Vx = vx, Vy = vy });
                gopher.Step(dt, cars, x, y);
                DrawGopher();
            }
            if (yeti != null)
            {
                yeti.Step(dt, x, y);
                DrawYeti();
            }
        }

        double GroundAt(double x, double y) => Sim.GroundAt(grid, x, y).H;

        void Draw(int role, Matrix4x4 m)
        {
            if (meshes.TryGetValue(role, out var mesh)) Graphics.DrawMesh(mesh, BakedScenery.Mirror(m), material, 0);
        }

        void DrawGopher()
        {
            var c = gopher.Current;
            float s = (float)gopherSize;
            // its holes: there while it's out
            if (c != null)
                foreach (var h in c.Holes)
                    Draw(6, T((float)h.x, (float)GroundAt(h.x, h.y), (float)h.y) * Scale(s, s, s));
            if (!gopher.Pose(out var pose) || pose.Up <= 0) return;
            double ground = GroundAt(pose.X, pose.Y);
            // (popping up out of the hole; bobbing with its stride; up in the air, flung)
            double bob = pose.Running ? System.Math.Abs(System.Math.Sin(pose.Step * System.Math.PI)) * 0.8 : 0;
            var group = T((float)pose.X, (float)(ground + pose.Z + (-(1 - pose.Up) * 6 + bob) * s), (float)pose.Y) * Ry((float)-pose.Heading) * Scale(s, s, s);
            // (tumbling head over heels; sitting up dazed, swaying; sat up on its haunches looking about)
            float rz = pose.Tumble != 0 ? (float)-pose.Tumble : pose.Dazed ? 0.35f : pose.Running ? 0 : 0.35f * (float)pose.Up;
            float rx = pose.Dazed ? Mathf.Sin(time * 5) * 0.2f : 0;
            var body = group * T(0, pose.Tumble != 0 ? 2.5f : 0, 0) * Rx(rx) * Rz(rz);
            Draw(0, body);
            for (int k = 0; k < 4; k++)
            {
                if (!pivots.TryGetValue(1 + k, out var p)) continue;
                float dx = pose.Running ? (float)System.Math.Sin(pose.Step * System.Math.PI * 2 + (k % 2) * System.Math.PI) * 0.8f : 0;
                Draw(1 + k, body * T(p.x + dx, p.y, p.z));
            }
            if (pose.Dazed)
                for (int k = 0; k < 3; k++)
                {
                    float a = time * 4 + k * Mathf.PI * 2 / 3;
                    Draw(5, group * T(2.5f + Mathf.Cos(a) * 3.2f, 8, Mathf.Sin(a) * 3.2f) * Ry(time * 6));
                }
        }

        void DrawYeti()
        {
            var p = yeti.Pose;
            if (p == null) return;
            float s = (float)yetiSize;
            var group = T((float)p.X, (float)GroundAt(p.X, p.Y), (float)p.Y) * Ry((float)-p.Heading) * Scale(s, s, s);
            float stride = (float)(p.Step / 22 * System.Math.PI), t = (float)p.T;
            float bodyY, bodyZ, mouth;
            float[] arm = new float[2], leg = new float[2];
            if (p.Phase == YetiRun.Phase.Wait)
            {
                // (lying in wait: hunched, arms down, swaying a little)
                bodyY = 0; bodyZ = -0.08f + Mathf.Sin(t * 2) * 0.04f; arm[0] = arm[1] = 0.1f; mouth = 1;
            }
            else if (p.Phase == YetiRun.Phase.Roar)
            {
                // (seen you: arms flung up, mouth wide, a hop)
                bodyY = Mathf.Abs(Mathf.Sin(t / (float)yetiRoar * Mathf.PI * 2)) * 4; bodyZ = 0.12f; arm[0] = arm[1] = Mathf.PI * 0.95f; mouth = 2.2f;
            }
            else
            {
                // (bounding along: arms up and pumping in turn, legs striding, a bob in its step)
                bodyY = Mathf.Abs(Mathf.Sin(stride)) * 3; bodyZ = -0.15f;
                for (int k = 0; k < 2; k++)
                {
                    arm[k] = Mathf.PI * 0.8f + Mathf.Sin(stride + k * Mathf.PI) * 0.35f;
                    leg[k] = Mathf.Sin(stride + k * Mathf.PI) * 0.6f;
                }
                mouth = p.Phase == YetiRun.Phase.Chase ? 1.8f : 1;
            }
            var body = group * T(0, bodyY, 0) * Rz(bodyZ);
            Draw(0, body);
            if (pivots.TryGetValue(1, out var mp)) Draw(1, body * T(mp.x, mp.y, mp.z) * Scale(1, mouth, 1));
            for (int k = 0; k < 2; k++)
            {
                if (pivots.TryGetValue(2 + k, out var ap)) Draw(2 + k, body * T(ap.x, ap.y, ap.z) * Rz(arm[k]));
                if (pivots.TryGetValue(4 + k, out var lp)) Draw(4 + k, body * T(lp.x, lp.y, lp.z) * Rz(leg[k]));
            }
        }

        // three.js's moves and turns (the web game's axes, y up)
        static Matrix4x4 T(float x, float y, float z)
        {
            var m = Matrix4x4.identity;
            m[0, 3] = x; m[1, 3] = y; m[2, 3] = z;
            return m;
        }

        static Matrix4x4 Scale(float x, float y, float z)
        {
            var m = Matrix4x4.identity;
            m[0, 0] = x; m[1, 1] = y; m[2, 2] = z;
            return m;
        }

        static Matrix4x4 Rx(float a)
        {
            var m = Matrix4x4.identity;
            float c = Mathf.Cos(a), s = Mathf.Sin(a);
            m[1, 1] = c; m[1, 2] = -s; m[2, 1] = s; m[2, 2] = c;
            return m;
        }

        static Matrix4x4 Ry(float a)
        {
            var m = Matrix4x4.identity;
            float c = Mathf.Cos(a), s = Mathf.Sin(a);
            m[0, 0] = c; m[0, 2] = s; m[2, 0] = -s; m[2, 2] = c;
            return m;
        }

        static Matrix4x4 Rz(float a)
        {
            var m = Matrix4x4.identity;
            float c = Mathf.Cos(a), s = Mathf.Sin(a);
            m[0, 0] = c; m[0, 1] = -s; m[1, 0] = s; m[1, 1] = c;
            return m;
        }
    }
}
