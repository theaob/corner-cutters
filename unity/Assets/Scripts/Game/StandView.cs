// The grandstands, as the web game builds them (circuitScene.ts grandstand(), crowd3d.ts buildCrowds): on every circuit,
// three along the main straight and, in the country, one round the outside of each kerbed bend (placed by its
// standsOf, baked). Each has a back wall with the crowd painted on its face toward the track and a roof-coloured top,
// a canopy over the back rows, six grey terraces rising toward the wall, three flags on poles along its back, and the
// crowd standing on the terraces: blocky spectators (shirt, head, two arms) who sway, and hop and wave their arms when
// the car comes by, settling slowly once it has gone.
//
// Everything is worked out in the web game's own space (three.js: px, y up, z = map y) with the same numbers, then
// carried into Unity's by one matrix (x/16, y/16, -z/16): its rotations are the same matrices in both, so the stand and
// each spectator's pose come out exactly as the web game turns them.
using CornerCutters.Core;
using UnityEngine;
using UnityEngine.Rendering;
using Grid = CornerCutters.Core.Grid;

namespace CornerCutters.Game
{
    public sealed class StandView : MonoBehaviour
    {
        // STAND (src/f1/stands.ts), px
        const float Depth = 56, Height = 46, Wall = 14, FlagTop = 62;
        // CROWD (src/f1/crowd3d.ts)
        const int Rows = 6;
        const float StepDeep = 7, Riser = 4.5f;
        const float BodyW = 4.6f, BodyH = 6.4f, BodyD = 3.4f, Head = 3.4f, ArmW = 1.4f, ArmH = 5f;
        const float Near = 360, Full = 120, Rise = 3, Settle = 0.5f, Hop = 4, Hops = 1.3f;

        static readonly int[] Roofs = { 0x3d7fc4, 0xd8323c, 0xf2c14e, 0x3d9a5a, 0x8a3cc8, 0xf4f4f8 };
        static readonly int[] FlagColors = { 0xd8323c, 0xf2c14e, 0x3d7fc4, 0xf4f4f8, 0x5fe0d0, 0xff5fb8, 0x3d9a5a };
        static readonly int[] Shirts = { 0xd8323c, 0xf2c14e, 0x3d7fc4, 0xf4f4f8, 0x5fe0d0, 0xff5fb8, 0x8a3cc8, 0x3d9a5a, 0xf08a2a };
        static readonly int[] Skins = { 0xf1c8a0, 0xd9a273, 0xa86d44, 0x7a4a2c, 0xe8b88e };
        static readonly string[] WallShirts = { "#d8323c", "#f2c14e", "#3d7fc4", "#f4f4f8", "#5fe0d0", "#ff5fb8", "#8a3cc8" };

        /// <summary>The web game's space to Unity's.</summary>
        static readonly Matrix4x4 ToUnity = Matrix4x4.Scale(new Vector3(Units.PerPx, Units.PerPx, -Units.PerPx));

        // a spectator's boxes: body, head, two arms; five faces each (no bottom), four corners a face
        const int BoxesEach = 4, VertsPerBox = 20;

        BakedStand[] stands;
        Matrix4x4[] frames;
        int[] starts;
        float[] excited, away;
        Vector3[] verts;
        Mesh crowd;
        float time;
        int tick;

        public static StandView Build(GameObject root, CircuitData c)
        {
            if (c.stands == null || c.stands.Length == 0) return null;
            var grid = c.ToGrid();
            var go = new GameObject("grandstands");
            go.transform.SetParent(root.transform, false);
            var view = go.AddComponent<StandView>();
            view.Make(go, grid, c.stands);
            return view;
        }

        void Make(GameObject go, Grid grid, BakedStand[] list)
        {
            stands = list;
            frames = new Matrix4x4[list.Length];
            var solid = new MeshBuilder();
            var faces = new MeshBuilder();
            int people = 0;
            for (int k = 0; k < list.Length; k++)
            {
                var s = list[k];
                double h = Sim.GroundAt(grid, s.x, s.y).H;
                // (three.js: at its middle on the ground, turned -dir, and half a turn more on the left: its back, +x, away from the track)
                float yaw = (float)(-s.dir + (s.side < 0 ? System.Math.PI : 0));
                frames[k] = Matrix4x4.TRS(new Vector3((float)s.x, (float)h, (float)s.y), Quaternion.AngleAxis(yaw * Mathf.Rad2Deg, Vector3.up), Vector3.one);
                Structure(solid, faces, k, s);
                people += s.crowd?.x?.Length ?? 0;
            }
            solid.Xf = faces.Xf = Matrix4x4.identity;
            Emit(go, solid, "stands", MeshBuilder.VertexColorMaterial());
            var wallMat = new Material(MeshBuilder.VertexColorMaterial()) { name = "Stand crowd", mainTexture = CrowdWall((int)list[0].len) };
            Emit(go, faces, "stand faces", wallMat);
            if (people > 0) MakeCrowd(go, people);
        }

        static void Emit(GameObject parent, MeshBuilder mb, string name, Material mat)
        {
            if (mb.VertexCount == 0) return;
            var go = new GameObject(name);
            go.transform.SetParent(parent.transform, false);
            go.AddComponent<MeshFilter>().sharedMesh = mb.ToMesh(name);
            go.AddComponent<MeshRenderer>().sharedMaterial = mat;
        }

        /// <summary>The stand's own boxes in its frame (px): back wall, canopy, terraces, flag poles and flags; and the wall's painted crowd.</summary>
        void Structure(MeshBuilder mb, MeshBuilder faces, int k, BakedStand s)
        {
            mb.Xf = faces.Xf = ToUnity * frames[k];
            float len = (float)s.len;
            var grey = TrackView.Hex(0x8e929c);
            var roof = TrackView.Hex(s.atStart ? 0x3d7fc4 : Roofs[k % Roofs.Length]);
            // the back wall, its top the roof's colour
            mb.Box(new Vector3(Depth / 2 - Wall / 2, Height / 2, 0), new Vector3(Wall, Height, len), grey, roof);
            // its face toward the track (-x), the crowd painted on: the whole picture over the whole face
            float fx = Depth / 2 - Wall - 0.05f;
            Color32 w = Color.white;
            faces.QuadUv(new Vector3(fx, Height, -len / 2), new Vector3(fx, Height, len / 2), new Vector3(fx, 0, len / 2), new Vector3(fx, 0, -len / 2),
                new Vector2(0, 1), new Vector2(1, 1), new Vector2(1, 0), new Vector2(0, 0), w, w, w, w);
            // the canopy over the back rows
            mb.Box(new Vector3(Depth / 2 - Wall - 10, Height - 7, 0), new Vector3(24, 2, len), roof);
            // the terraces: the front row nearest the track, lowest; each row back a step higher
            var stepColor = TrackView.Hex(0x9a9ea8);
            for (int row = 0; row < Rows; row++)
            {
                float x = RowX(row), hh = (row + 1) * Riser;
                mb.Box(new Vector3(x, hh / 2, 0), new Vector3(StepDeep, hh, len), stepColor);
            }
            // flags on poles along its back, in the teams' colours
            float[] alongs = { -0.35f, 0f, 0.35f };
            for (int f = 0; f < alongs.Length; f++)
            {
                float z = alongs[f] * len, px = Depth / 2 - Wall / 2;
                mb.CylinderY(new Vector3(px, Height, z), 0.7f, FlagTop - Height, 4, TrackView.Hex(0xc9ccd4));
                var flag = TrackView.Hex(FlagColors[(k * 3 + f) % FlagColors.Length]);
                mb.Quad(new Vector3(px, FlagTop, z), new Vector3(px + 13, FlagTop, z), new Vector3(px + 13, FlagTop - 8, z), new Vector3(px, FlagTop - 8, z), flag);
            }
        }

        static float RowX(int row) => Depth / 2 - Wall - (Rows - row) * StepDeep + StepDeep / 2;

        /// <summary>The crowd painted on a back wall: grey, with a dot of shirt every other px on every third row (circuitScene.ts grandstand(), its own random numbers).</summary>
        static Texture2D CrowdWall(int len)
        {
            int h = (int)Height;
            var tex = new Texture2D(len, h, TextureFormat.RGBA32, false) { filterMode = FilterMode.Point, wrapMode = TextureWrapMode.Clamp, name = "stand crowd" };
            var px = new Color32[len * h];
            ColorUtility.TryParseHtmlString("#6c707a", out var bg);
            for (int i = 0; i < px.Length; i++) px[i] = bg;
            uint seed = (uint)len;
            double R() { seed = unchecked(seed * 1664525u + 1013904223u); return seed / 4294967296.0; }
            for (int row = 2; row < h - 2; row += 3)
            {
                for (int k = 1; k < len - 1; k += 2)
                {
                    if (R() < 0.8)
                    {
                        ColorUtility.TryParseHtmlString(WallShirts[(int)System.Math.Floor(R() * WallShirts.Length)], out var shirt);
                        // (the picture's top row is the wall's top: a texture's row 0 is its bottom)
                        px[(h - 1 - row) * len + k] = shirt;
                        px[(h - 2 - row) * len + k] = shirt;
                    }
                }
            }
            tex.SetPixels32(px);
            tex.Apply(false, true);
            return tex;
        }

        // ---- the crowd ----

        void MakeCrowd(GameObject parent, int people)
        {
            int boxes = people * BoxesEach;
            verts = new Vector3[boxes * VertsPerBox];
            var colors = new Color32[verts.Length];
            var tris = new int[boxes * 5 * 6];
            starts = new int[stands.Length];
            excited = new float[stands.Length];
            away = new float[stands.Length];
            int person = 0;
            for (int k = 0; k < stands.Length; k++)
            {
                starts[k] = person;
                var cr = stands[k].crowd;
                if (cr?.x == null) continue;
                for (int p = 0; p < cr.x.Length; p++, person++)
                {
                    double ph = cr.phase[p];
                    var shirt = TrackView.Hex(Shirts[(int)System.Math.Floor(Frac(ph * 7) * Shirts.Length) % Shirts.Length]);
                    var skin = TrackView.Hex(Skins[(int)System.Math.Floor(Frac(ph * 13) * Skins.Length) % Skins.Length]);
                    for (int b = 0; b < BoxesEach; b++) Paint(colors, (person * BoxesEach + b) * VertsPerBox, b == 0 ? shirt : skin);
                }
            }
            for (int b = 0; b < boxes; b++)
            {
                for (int f = 0; f < 5; f++)
                {
                    int v = b * VertsPerBox + f * 4, t = (b * 5 + f) * 6;
                    tris[t] = v; tris[t + 1] = v + 1; tris[t + 2] = v + 2;
                    tris[t + 3] = v; tris[t + 4] = v + 2; tris[t + 5] = v + 3;
                }
            }
            crowd = new Mesh { name = "crowd", indexFormat = IndexFormat.UInt32 };
            crowd.MarkDynamic();
            for (int k = 0; k < stands.Length; k++) Draw(k);
            crowd.vertices = verts;
            crowd.colors32 = colors;
            crowd.triangles = tris;
            crowd.RecalculateBounds();
            var go = new GameObject("crowd");
            go.transform.SetParent(parent.transform, false);
            go.AddComponent<MeshFilter>().sharedMesh = crowd;
            go.AddComponent<MeshRenderer>().sharedMaterial = MeshBuilder.VertexColorMaterial();
        }

        static double Frac(double v) => v - System.Math.Floor(v);

        // a box's faces shaded by their facing, as MeshBuilder.Box: top, front (+z), back, left (-x), right
        static readonly float[] FaceShade = { 1f, 0.85f, 0.7f, 0.6f, 0.75f };

        static void Paint(Color32[] colors, int at, Color c)
        {
            for (int f = 0; f < 5; f++)
            {
                Color32 s = new Color(c.r * FaceShade[f], c.g * FaceShade[f], c.b * FaceShade[f], 1f);
                for (int i = 0; i < 4; i++) colors[at + f * 4 + i] = s;
            }
        }

        /// <summary>Writes a box (size, its middle at offset in its own space) placed by m into the vertices from at.</summary>
        void PutBox(int at, Matrix4x4 m, Vector3 size, Vector3 offset)
        {
            Vector3 h = size * 0.5f;
            Vector3 P(float x, float y, float z) => m.MultiplyPoint3x4(offset + new Vector3(x * h.x, y * h.y, z * h.z));
            Vector3 a = P(-1, 1, -1), b = P(-1, 1, 1), c = P(1, 1, 1), d = P(1, 1, -1);      // top corners
            Vector3 e = P(-1, -1, -1), f = P(-1, -1, 1), g = P(1, -1, 1), k = P(1, -1, -1);  // bottom corners
            var v = verts;
            v[at] = a; v[at + 1] = b; v[at + 2] = c; v[at + 3] = d;            // top
            v[at + 4] = f; v[at + 5] = g; v[at + 6] = c; v[at + 7] = b;        // front (+z)
            v[at + 8] = k; v[at + 9] = e; v[at + 10] = a; v[at + 11] = d;      // back
            v[at + 12] = e; v[at + 13] = f; v[at + 14] = b; v[at + 15] = a;    // left (-x)
            v[at + 16] = g; v[at + 17] = k; v[at + 18] = d; v[at + 19] = c;    // right
        }

        /// <summary>Puts stand k's spectators in place at the current time (crowd3d.ts spectatorPose).</summary>
        void Draw(int k)
        {
            var cr = stands[k].crowd;
            if (cr?.x == null) return;
            var frame = ToUnity * frames[k];
            float exc = excited[k];
            int person = starts[k];
            for (int p = 0; p < cr.x.Length; p++, person++)
            {
                float phase = (float)cr.phase[p];
                float beat = time * Hops * Mathf.PI * 2 + phase;
                float hop = exc * Hop * Mathf.Abs(Mathf.Sin(beat));
                float arms = exc > 0.25f ? Mathf.Min(1, (exc - 0.25f) * 2) * (0.75f + 0.25f * Mathf.Sin(beat * 1.5f)) : 0;
                float sway = Mathf.Sin(time * 1.3f + phase) * (0.06f + 0.08f * exc);
                float x = (float)cr.x[p], z = (float)cr.z[p], y = (float)cr.floor[p] + hop;
                // facing the track (-x), swaying (three.js Euler YXZ: yaw, then sway, then an arm's swing)
                var face = Quaternion.AngleAxis(-90f, Vector3.up) * Quaternion.AngleAxis(sway * Mathf.Rad2Deg, Vector3.right);
                int at = person * BoxesEach * VertsPerBox;
                PutBox(at, frame * Matrix4x4.TRS(new Vector3(x, y, z), face, Vector3.one), new Vector3(BodyW, BodyH, BodyD), new Vector3(0, BodyH / 2, 0));
                PutBox(at + VertsPerBox, frame * Matrix4x4.TRS(new Vector3(x, y + BodyH, z), face, Vector3.one), new Vector3(Head, Head, Head), new Vector3(0, Head / 2, 0));
                for (int side = 0; side < 2; side++)
                {
                    float sign = side == 0 ? -1 : 1;
                    var q = face * Quaternion.AngleAxis(sign * (0.15f + arms * 2.7f) * Mathf.Rad2Deg, Vector3.forward);
                    var shoulder = new Vector3(x, y + BodyH - 0.4f, z + sign * (BodyW / 2 + 0.2f));
                    PutBox(at + (2 + side) * VertsPerBox, frame * Matrix4x4.TRS(shoulder, q, Vector3.one), new Vector3(ArmW, ArmH, ArmW), new Vector3(0, -ArmH / 2, 0));
                }
            }
        }

        /// <summary>The crowds dt s on, with the car at (x, y) on the map: excited as it nears, settling once it has gone.</summary>
        public void Step(float dt, double carX, double carY)
        {
            if (crowd == null) return;
            time += dt;
            tick++;
            for (int k = 0; k < stands.Length; k++)
            {
                float nearest = (float)System.Math.Sqrt((carX - stands[k].x) * (carX - stands[k].x) + (carY - stands[k].y) * (carY - stands[k].y));
                away[k] = nearest;
                float want = Mathf.Clamp01((Near - nearest) / (Near - Full));
                excited[k] = want > excited[k] ? Mathf.Min(want, excited[k] + Rise * dt) : Mathf.Max(want, excited[k] - Settle * dt);
                // (a stand the car is near, or still settling, every frame; the others' sway a frame in four, staggered)
                if (away[k] < Near * 2 || excited[k] > 0 || (tick + k) % 4 == 0) Draw(k);
            }
            crowd.vertices = verts;
        }
    }
}
