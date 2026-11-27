// The airliners over a circuit with an airport next door (Crescent Park's), as the web game flies them (src/f1/planes.ts,
// PlaneRun): now and then one flies over the runway's way, coming in to land (low, gear down, sinking) or just taken
// off (climbing), aimed to pass over where the camera will be when it gets there, its strobe flashing. The models and
// the numbers come from Resources/Scenery/<id>-planes.bytes (npm run unity:scenery).
using System.Collections.Generic;
using System.IO;
using CornerCutters.Core;
using UnityEngine;

namespace CornerCutters.Game
{
    public sealed class ScenePlanes
    {
        sealed class Flight
        {
            public bool Arrive;
            public double X, Y, Z, Vx, Vy, Vz, T;
            public int Model;
        }

        readonly float runway, hides;
        readonly float wait0, waitMore, first, speedArrive, speedDepart, altArrive, altDepart, sink, climb, lead, beyond, aside, arrivals;
        /// <summary>each tail colour's model: its body, its gear and its strobe, each a mesh (Unity's axes, in the plane)</summary>
        readonly List<(Mesh body, Mesh gear, Mesh strobe)> models = new List<(Mesh, Mesh, Mesh)>();
        readonly Material material;
        readonly List<Flight> flights = new List<Flight>();
        double wait;
        float time;
        uint seed = 3;

        ScenePlanes(BinaryReader r)
        {
            runway = r.ReadSingle();
            hides = r.ReadSingle();
            wait0 = r.ReadSingle(); waitMore = r.ReadSingle(); first = r.ReadSingle();
            speedArrive = r.ReadSingle(); speedDepart = r.ReadSingle(); altArrive = r.ReadSingle(); altDepart = r.ReadSingle();
            sink = r.ReadSingle(); climb = r.ReadSingle(); lead = r.ReadSingle(); beyond = r.ReadSingle(); aside = r.ReadSingle();
            arrivals = r.ReadSingle();
            wait = first;
            material = MeshBuilder.PlainMaterial();
            // (lit as they fly: level, along the runway)
            var level = Yaw(-runway);
            int count = r.ReadInt32();
            for (int k = 0; k < count; k++)
            {
                var body = new BakedScenery.Chunk();
                var gear = new BakedScenery.Chunk();
                var strobe = new BakedScenery.Chunk();
                int parts = r.ReadInt32();
                for (int p = 0; p < parts; p++)
                {
                    int role = r.ReadInt32();
                    var part = BakedScenery.ReadPart(r);
                    var m = BakedScenery.ReadPlace(r, out var tint);
                    BakedScenery.Add(role == 2 ? strobe : role == 1 ? gear : body, part, m, level * m, tint);
                }
                models.Add((body.ToMesh($"plane {k}"), gear.ToMesh($"plane {k} gear"), strobe.ToMesh($"plane {k} strobe")));
            }
        }

        /// <summary>The planes for circuit id, or null if it has no airport.</summary>
        public static ScenePlanes Load(string id)
        {
            var asset = Resources.Load<TextAsset>($"Scenery/{id}-planes");
            if (asset == null) return null;
            var r = new BinaryReader(new MemoryStream(asset.bytes));
            if (new string(r.ReadChars(4)) != "CCP1") return null;
            return new ScenePlanes(r);
        }

        float Next()
        {
            unchecked { seed = seed * 1664525u + 1013904223u; }
            return (float)(seed / 4294967296.0);
        }

        /// <summary>dt s on, the camera on (x, y) going (vx, vy) px/s; draws them (call every rendered frame).</summary>
        public void Step(float dt, double x, double y, double vx, double vy)
        {
            if (dt > 0)
            {
                time += dt;
                foreach (var f in flights) { f.T += dt; f.X += f.Vx * dt; f.Y += f.Vy * dt; f.Z += f.Vz * dt; }
                flights.RemoveAll(f => f.T * System.Math.Sqrt(f.Vx * f.Vx + f.Vy * f.Vy) > lead + beyond);
                wait -= dt;
                if (wait <= 0)
                {
                    wait = wait0 + Next() * waitMore;
                    Launch(x, y, vx, vy);
                }
            }
            foreach (var f in flights)
            {
                var (body, gear, strobe) = models[f.Model];
                double h = System.Math.Sqrt(f.Vx * f.Vx + f.Vy * f.Vy);
                float yaw = -(float)System.Math.Atan2(f.Vy, f.Vx), pitch = (float)System.Math.Atan2(f.Vz, h) + (f.Arrive ? 0.05f : 0);
                var m = Matrix4x4.identity;
                m[0, 3] = (float)f.X; m[1, 3] = (float)f.Z; m[2, 3] = (float)f.Y;
                var at = BakedScenery.Mirror(m * Yaw(yaw) * Pitch(pitch));
                Graphics.DrawMesh(body, at, material, 0);
                if (f.Arrive) Graphics.DrawMesh(gear, at, material, 0);
                if ((time + TailOf(f.Model) * 1e-7f) % 1.1f < 0.08f) Graphics.DrawMesh(strobe, at, material, 0);
            }
        }

        static readonly int[] Tails = { 0x2f6fe0, 0xd8323c, 0x2f9a5a, 0xf2a03a, 0x6a3cc8, 0x1f2a5a };
        static float TailOf(int model) => Tails[model % Tails.Length];

        /// <summary>One on its way over: to pass over where the camera will be once it's there.</summary>
        void Launch(double x, double y, double vx, double vy)
        {
            bool arrive = Next() < arrivals;
            double speed = arrive ? speedArrive : speedDepart, alt = arrive ? altArrive : altDepart;
            double T = lead / speed, ux = System.Math.Cos(runway), uy = System.Math.Sin(runway);
            double ax = vx * T, ay = vy * T, ahead = System.Math.Sqrt(ax * ax + ay * ay);
            if (ahead > lead) { ax = ax * lead / ahead; ay = ay * lead / ahead; }
            double side = (Next() * 2 - 1) * aside;
            double px = x + ax - uy * side, py = y + ay + ux * side + alt * hides;
            double vz = arrive ? -sink : climb;
            flights.Add(new Flight
            {
                Arrive = arrive,
                X = px - ux * lead, Y = py - uy * lead, Z = alt - vz * T,
                Vx = ux * speed, Vy = uy * speed, Vz = vz,
                Model = Mathf.FloorToInt(Next() * models.Count),
            });
        }

        // three.js's turns (the web game's axes): about y, and about z (the nose up)
        static Matrix4x4 Yaw(float a)
        {
            var m = Matrix4x4.identity;
            float c = Mathf.Cos(a), s = Mathf.Sin(a);
            m[0, 0] = c; m[0, 2] = s; m[2, 0] = -s; m[2, 2] = c;
            return m;
        }

        static Matrix4x4 Pitch(float a)
        {
            var m = Matrix4x4.identity;
            float c = Mathf.Cos(a), s = Mathf.Sin(a);
            m[0, 0] = c; m[0, 1] = -s; m[1, 0] = s; m[1, 1] = c;
            return m;
        }
    }
}
