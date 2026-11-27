// The web game's own scenery for a circuit (Resources/Scenery/<id>.bytes, written by `npm run unity:scenery` from its
// createCircuitScene: towns and cities, buildings, landmarks, trees, grandstands, pits, barriers, bridges, lakes, the
// coast, the volcano, and what moves: planes, boats, birds, animals, petals...). Each shape comes once with every place
// it stands; here they are put in place, each face lit as the web game lights it (its sky and sun, Lambert) relative to
// flat ground (the finish pass lights that), and merged per texture into chunks the camera can cull. What moves comes
// with its tracks, recorded from the web game's own animation: SceneryMovers plays them back. The crowds and the
// stands' flags are StandView's.
using System.Collections.Generic;
using System.IO;
using CornerCutters.Core;
using UnityEngine;
using UnityEngine.Rendering;

namespace CornerCutters.Game
{
    public static class BakedScenery
    {
        internal const int SeeThrough = 1, Nearest = 2, Repeat = 4, Unlit = 8, TwoSided = 16, Glowing = 32, Scrolling = 64;
        const float ChunkUnits = 64;
        const int MaxVerts = 600000;

        // the web game's light (src/engine/render/daylight.ts at noon): sky and ground of a hemisphere light, and the sun
        static readonly Vector3 SunDir = new Vector3(140, 260, 170).normalized;
        // (at night, night.ts's: the night's sky and the moon; and what the light on flat ground is divided by is the
        // ground's floodlit light, the night's flat light and the lamps' glow, which the finish pass lights the picture with)
        static Color Sky = Lin(0xb8d4ff), Ground = Lin(0x5a4f48), Sun = Lin(0xffe0b0);
        static float Ambient = 1.35f, SunIntensity = 2.6f;
        static Color Flat = LightOn(Vector3.up);

        /// <summary>The light the circuit's scenery is baked in: the dry day's, or the dry night's.</summary>
        static void LightFor(CircuitData c)
        {
            var sky = c.night ? WeatherLooks.Night(WeatherLooks.DrySky) : WeatherLooks.DrySky;
            Sky = Lin(sky.Sky); Ground = Lin(sky.Ground); Sun = Lin(sky.Key);
            Ambient = (float)sky.Ambient; SunIntensity = (float)sky.KeyIntensity;
            Flat = LightOn(Vector3.up);
            if (c.night) Flat += NightGlow();
        }

        /// <summary>The night lamps' glow on the ground, linear (three.js's emissive: not divided by π).</summary>
        internal static Color NightGlow()
        {
            var g = Lin(WeatherLooks.NightGlow);
            float i = (float)WeatherLooks.NightGlowIntensity;
            return new Color(g.r * i, g.g * i, g.b * i, 0);
        }

        static Color Lin(int rgb) => new Color(ToLinear(((rgb >> 16) & 255) / 255f), ToLinear(((rgb >> 8) & 255) / 255f), ToLinear((rgb & 255) / 255f), 1);
        static float ToLinear(float c) => c <= 0.04045f ? c / 12.92f : Mathf.Pow((c + 0.055f) / 1.055f, 2.4f);
        static float ToSrgb(float c) => c <= 0.0031308f ? c * 12.92f : 1.055f * Mathf.Pow(c, 1 / 2.4f) - 0.055f;

        /// <summary>The light on a face turned to n (the web game's axes: y up), Lambert.</summary>
        static Color LightOn(Vector3 n)
        {
            float t = 0.5f * n.y + 0.5f, s = SunIntensity * Mathf.Max(0, Vector3.Dot(n, SunDir));
            float k = 1f / Mathf.PI;
            return new Color(((Ground.r + (Sky.r - Ground.r) * t) * Ambient + Sun.r * s) * k, ((Ground.g + (Sky.g - Ground.g) * t) * Ambient + Sun.g * s) * k, ((Ground.b + (Sky.b - Ground.b) * t) * Ambient + Sun.b * s) * k, 1);
        }

        internal sealed class Chunk
        {
            public readonly List<Vector3> Pos = new List<Vector3>();
            public readonly List<Color32> Col = new List<Color32>();
            public readonly List<Vector2> Uv = new List<Vector2>();
            public readonly List<int> Idx = new List<int>();

            public Mesh ToMesh(string name)
            {
                var mesh = new Mesh { name = name, indexFormat = IndexFormat.UInt32 };
                mesh.SetVertices(Pos);
                mesh.SetColors(Col);
                mesh.SetUVs(0, Uv);
                mesh.SetTriangles(Idx, 0);
                mesh.RecalculateBounds();
                return mesh;
            }
        }

        /// <summary>One shape with one material, in the web game's px and axes.</summary>
        internal sealed class Part
        {
            public int Tex, Flags;
            public float Opacity;
            public Color Emissive;
            /// <summary>a glowing part's light map (the flame towers' flames): its texture, its uv from the part's (scale u,
            /// v, offset u, v) and its scroll (uv a second)</summary>
            public int GlowTex = -1;
            public Vector4 GlowUv;
            public Vector2 GlowRate;
            /// <summary>a scrolling part's texture offset over time, per axis: drift a second, sway (amp, rad/s, phase); and the
            /// offset its uvs carry (u, v)</summary>
            public Vector4 ScrollU, ScrollV;
            public Vector2 ScrollAt;
            /// <summary>drawn by the glowing shader (its own light map, or its texture scrolling)</summary>
            public bool Own => (Flags & (Glowing | Scrolling)) != 0;
            public Vector3[] Pos, Nor;
            public Color[] Col;
            public Vector2[] Uv;
            public int[] Idx;
        }

        internal static Part ReadPart(BinaryReader r)
        {
            var p = new Part { Tex = r.ReadInt32(), Flags = r.ReadInt32(), Opacity = r.ReadSingle() };
            p.Emissive = new Color(r.ReadSingle(), r.ReadSingle(), r.ReadSingle());
            if ((p.Flags & Glowing) != 0)
            {
                p.GlowTex = r.ReadInt32();
                p.GlowUv = new Vector4(r.ReadSingle(), r.ReadSingle(), r.ReadSingle(), r.ReadSingle());
                p.GlowRate = new Vector2(r.ReadSingle(), r.ReadSingle());
            }
            if ((p.Flags & Scrolling) != 0)
            {
                p.ScrollU = new Vector4(r.ReadSingle(), r.ReadSingle(), r.ReadSingle(), r.ReadSingle());
                float atU = r.ReadSingle();
                p.ScrollV = new Vector4(r.ReadSingle(), r.ReadSingle(), r.ReadSingle(), r.ReadSingle());
                p.ScrollAt = new Vector2(atU, r.ReadSingle());
            }
            int nv = r.ReadInt32(), ni = r.ReadInt32();
            p.Pos = new Vector3[nv];
            for (int i = 0; i < nv; i++) p.Pos[i] = new Vector3(r.ReadSingle(), r.ReadSingle(), r.ReadSingle());
            p.Nor = new Vector3[nv];
            for (int i = 0; i < nv; i++) { p.Nor[i] = new Vector3(r.ReadSByte(), r.ReadSByte(), r.ReadSByte()) / 127f; r.ReadByte(); }
            p.Col = new Color[nv];
            for (int i = 0; i < nv; i++) p.Col[i] = new Color(ToLinear(r.ReadByte() / 255f), ToLinear(r.ReadByte() / 255f), ToLinear(r.ReadByte() / 255f), r.ReadByte() / 255f);
            p.Uv = new Vector2[p.Tex >= 0 ? nv : 0];
            for (int i = 0; i < p.Uv.Length; i++) p.Uv[i] = new Vector2(r.ReadSingle(), r.ReadSingle());
            p.Idx = new int[ni];
            for (int i = 0; i < ni; i++) p.Idx[i] = nv < 65536 ? r.ReadUInt16() : r.ReadInt32();
            return p;
        }

        /// <summary>A place: float12 matrix (3 rows of 4, the web game's px) and its tint.</summary>
        internal static Matrix4x4 ReadPlace(BinaryReader r, out Color tint)
        {
            var m = Matrix4x4.identity;
            for (int row = 0; row < 3; row++)
                for (int cc = 0; cc < 4; cc++) m[row, cc] = r.ReadSingle();
            tint = new Color(ToLinear(r.ReadByte() / 255f), ToLinear(r.ReadByte() / 255f), ToLinear(r.ReadByte() / 255f));
            r.ReadByte();
            return m;
        }

        /// <summary>Part p into ch, its vertices put by place (web px, then into Unity units, mirrored) and its faces lit as they
        /// face under light (where it stands in the world).</summary>
        internal static void Add(Chunk ch, Part p, Matrix4x4 place, Matrix4x4 light, Color tint)
        {
            var nm = light.inverse.transpose;
            int at = ch.Pos.Count, flags = p.Flags;
            for (int i = 0; i < p.Pos.Length; i++)
            {
                var w = place.MultiplyPoint3x4(p.Pos[i]);
                ch.Pos.Add(new Vector3(w.x * Units.PerPx, w.y * Units.PerPx, -w.z * Units.PerPx));
                var c0 = p.Col[i] * tint;
                Color lit;
                if ((flags & Unlit) != 0) lit = new Color(c0.r / Flat.r, c0.g / Flat.g, c0.b / Flat.b);
                else
                {
                    var n = nm.MultiplyVector(p.Nor[i]).normalized;
                    if ((flags & TwoSided) != 0 && n.y < 0) n = -n;
                    var L = LightOn(n);
                    lit = new Color(c0.r * L.r / Flat.r, c0.g * L.g / Flat.g, c0.b * L.b / Flat.b);
                }
                // (a glowing part's light is its map's, drawn by the shader)
                if ((flags & Glowing) == 0) lit += new Color(p.Emissive.r / Flat.r, p.Emissive.g / Flat.g, p.Emissive.b / Flat.b, 0);
                ch.Col.Add(new Color(ToSrgb(Mathf.Clamp01(lit.r)), ToSrgb(Mathf.Clamp01(lit.g)), ToSrgb(Mathf.Clamp01(lit.b)), (flags & SeeThrough) != 0 ? p.Opacity * p.Col[i].a : 1));
                ch.Uv.Add(p.Tex >= 0 ? p.Uv[i] : Vector2.zero);
            }
            for (int i = 0; i < p.Idx.Length; i++) ch.Idx.Add(at + p.Idx[i]);
        }

        public static bool Has(string id) => Resources.Load<TextAsset>("Scenery/" + id) != null;

        /// <summary>Builds the circuit's baked scenery under parent: the still parts, and what moves (played by the returned
        /// SceneryMovers' Step); null if it has none.</summary>
        public static SceneryMovers Build(GameObject parent, CircuitData c)
        {
            var asset = Resources.Load<TextAsset>("Scenery/" + c.id);
            if (asset == null) return null;
            LightFor(c);
            var r = new BinaryReader(new MemoryStream(asset.bytes));
            if (new string(r.ReadChars(4)) != "CCS3") { Debug.LogWarning($"Scenery/{c.id}: not a scenery file (run npm run unity:scenery)"); return null; }
            int texCount = r.ReadInt32(), partCount = r.ReadInt32();
            var root = new GameObject("scenery");
            root.transform.SetParent(parent.transform, false);
            var chunks = new Dictionary<(int, int, int, int, int), Chunk>();
            var done = new List<((int tex, int flags) key, Part glow, Chunk chunk)>();

            for (int pi = 0; pi < partCount; pi++)
            {
                var p = ReadPart(r);
                int places = r.ReadInt32();
                for (int q = 0; q < places; q++)
                {
                    var m = ReadPlace(r, out var tint);
                    // which chunk: by where its first vertex lands (in Unity units)
                    var first = m.MultiplyPoint3x4(p.Pos[p.Idx.Length > 0 ? p.Idx[0] : 0]);
                    var key = (p.Tex, p.Flags, p.Own ? pi : -1, Mathf.FloorToInt(first.x / 16 / ChunkUnits), Mathf.FloorToInt(first.z / 16 / ChunkUnits));
                    if (!chunks.TryGetValue(key, out var ch) || ch.Pos.Count + p.Pos.Length > MaxVerts)
                    {
                        ch = new Chunk();
                        chunks[key] = ch;
                        done.Add(((p.Tex, p.Flags), p.Own ? p : null, ch));
                    }
                    Add(ch, p, m, m, tint);
                }
            }

            // the textures, and a material for each texture and kind
            var texes = new Texture2D[texCount];
            for (int t = 0; t < texCount; t++) texes[t] = Resources.Load<Texture2D>($"Scenery/{c.id}-{t}");
            var solid = MeshBuilder.VertexColorMaterial();
            var seeThrough = Resources.Load<Shader>("Shaders/PixelSeeThrough");
            var glowing = Resources.Load<Shader>("Shaders/PixelGlow");
            var mats = new Dictionary<(int, int), Material>();
            var glows = new Dictionary<Part, Material>();
            Texture2D TexAt(int tex, int flags)
            {
                Texture2D t = tex >= 0 && tex < texes.Length ? texes[tex] : null;
                if (t != null)
                {
                    t.filterMode = (flags & Nearest) != 0 ? FilterMode.Point : FilterMode.Bilinear;
                    t.wrapMode = (flags & Repeat) != 0 ? TextureWrapMode.Repeat : TextureWrapMode.Clamp;
                }
                return t;
            }
            Material MaterialFor(int tex, int flags, Part glow = null)
            {
                if (glow != null && glowing != null)
                {
                    if (glows.TryGetValue(glow, out var gm)) return gm;
                    gm = new Material(glowing);
                    var main = TexAt(tex, flags);
                    gm.mainTexture = main != null ? (Texture)main : Texture2D.whiteTexture;
                    // (the flames' texture repeats, as three.js's does)
                    var lights = (flags & Glowing) != 0 ? TexAt(glow.GlowTex, flags | Repeat) : null;
                    gm.SetTexture("_GlowTex", lights != null ? (Texture)lights : Texture2D.blackTexture);
                    gm.SetVector("_ScrollU", glow.ScrollU);
                    gm.SetVector("_ScrollV", glow.ScrollV);
                    gm.SetVector("_ScrollAt", new Vector4(glow.ScrollAt.x, glow.ScrollAt.y, 0, 0));
                    gm.SetVector("_GlowUv", glow.GlowUv);
                    gm.SetVector("_GlowRate", new Vector4(glow.GlowRate.x, glow.GlowRate.y, 0, 0));
                    gm.SetColor("_GlowColor", (flags & Glowing) != 0 ? new Color(glow.Emissive.r / Flat.r, glow.Emissive.g / Flat.g, glow.Emissive.b / Flat.b, 1) : new Color(0, 0, 0, 1));
                    gm.name = $"scenery {tex} {((flags & Glowing) != 0 ? "glowing " + glow.GlowTex : "scrolling")}";
                    glows[glow] = gm;
                    return gm;
                }
                var key = (tex, flags & (SeeThrough | Nearest | Repeat));
                if (mats.TryGetValue(key, out var m)) return m;
                bool clear = (flags & SeeThrough) != 0;
                m = clear && seeThrough != null ? new Material(seeThrough) : new Material(solid);
                // (no texture: the white one, so vertex colour alone shows)
                var t = TexAt(tex, flags);
                m.mainTexture = t != null ? (Texture)t : Texture2D.whiteTexture;
                m.name = $"scenery {tex} {flags}";
                mats[key] = m;
                return m;
            }

            int count = 0;
            foreach (var (key, glow, ch) in done)
            {
                if (ch.Idx.Count == 0) continue;
                var mesh = ch.ToMesh($"scenery {count}");
                var go = new GameObject(mesh.name);
                go.transform.SetParent(root.transform, false);
                go.AddComponent<MeshFilter>().sharedMesh = mesh;
                go.AddComponent<MeshRenderer>().sharedMaterial = MaterialFor(key.tex, key.flags, glow);
                count++;
            }

            // what moves: the tracks (in Unity's axes: S T S^-1, S the px-to-units mirror), then the parts riding them
            int trackCount = r.ReadInt32();
            float dt = r.ReadSingle();
            int frames = r.ReadInt32();
            var tracks = new SceneryMovers.Track[trackCount];
            var firstSeen = new Matrix4x4[trackCount];
            for (int t = 0; t < trackCount; t++)
            {
                var origin = new Vector3(r.ReadSingle(), r.ReadSingle(), r.ReadSingle());
                var tr = new SceneryMovers.Track { At = new Matrix4x4[frames], Shown = new bool[frames] };
                bool seen = false;
                for (int f = 0; f < frames; f++)
                {
                    var m = Matrix4x4.identity;
                    var d = new Vector3(Mathf.HalfToFloat(r.ReadUInt16()), Mathf.HalfToFloat(r.ReadUInt16()), Mathf.HalfToFloat(r.ReadUInt16()));
                    bool any = false;
                    for (int row = 0; row < 3; row++)
                        for (int cc = 0; cc < 3; cc++) { m[row, cc] = Mathf.HalfToFloat(r.ReadUInt16()); any |= m[row, cc] != 0; }
                    tr.Shown[f] = any;
                    if (!any) continue;
                    var w = origin + d;
                    m[0, 3] = w.x; m[1, 3] = w.y; m[2, 3] = w.z;
                    if (!seen) { firstSeen[t] = m; seen = true; }
                    tr.At[f] = Mirror(m);
                }
                tracks[t] = tr;
            }
            // (each track's parts in one mesh per material, in place on the track: S L v, lit as at its first sight)
            var rides = new Dictionary<(int, int, int, Part), Chunk>();
            int moverParts = r.ReadInt32();
            for (int pi = 0; pi < moverParts; pi++)
            {
                var p = ReadPart(r);
                int copies = r.ReadInt32();
                for (int q = 0; q < copies; q++)
                {
                    int t = r.ReadInt32();
                    var local = ReadPlace(r, out var tint);
                    var key = (t, p.Tex, p.Flags, p.Own ? p : null);
                    if (!rides.TryGetValue(key, out var ch)) rides[key] = ch = new Chunk();
                    Add(ch, p, local, firstSeen[t] * local, tint);
                }
            }
            var movers = new SceneryMovers(dt, frames, tracks);
            foreach (var kv in rides)
            {
                var (t, tex, flags, glow) = kv.Key;
                movers.Add(t, kv.Value.ToMesh($"mover {t}"), MaterialFor(tex, flags, glow));
            }
            return movers;
        }

        /// <summary>A matrix in the web game's px and axes as one in Unity's: S m S^-1 (S: x/16, y/16, -z/16).</summary>
        internal static Matrix4x4 Mirror(Matrix4x4 m)
        {
            var o = m;
            o[0, 2] = -m[0, 2]; o[1, 2] = -m[1, 2]; o[2, 0] = -m[2, 0]; o[2, 1] = -m[2, 1];
            o[0, 3] = m[0, 3] * Units.PerPx; o[1, 3] = m[1, 3] * Units.PerPx; o[2, 3] = -m[2, 3] * Units.PerPx;
            return o;
        }
    }
}
