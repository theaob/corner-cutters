// Skid marks (engine/render/effects.ts SkidLayer): dark lines left by sliding tyres, painted into textures laid over
// the ground. The ground is split into 256 px chunks, made on first use, each its own small texture (uploaded at most
// 15 times a second, and only once it's changed), bent over sloped ground one segment per 16 px. A line is drawn as
// the canvas draws it: 2 px wide, its edges soft, its darkness laid over what's there (source-over), so a long slide
// darkens as the marks cross. Under both rear wheels, joined from the frame before; lifted between slides so they
// don't join up.
using System;
using System.Collections.Generic;
using CornerCutters.Core;
using UnityEngine;

namespace CornerCutters.Game
{
    public sealed class SkidLayer
    {
        const int Chunk = 256, Seg = 16;
        static readonly Color32 Ink = new Color32(20, 18, 24, 0);
        static Material material;

        sealed class Piece
        {
            public Texture2D Tex;
            public Color32[] Px;
            public Mesh Mesh;
            public Material Mat;
            public bool Dirty;
        }

        public readonly GameObject Root;
        readonly Func<double, double, double> heightAt;
        readonly Dictionary<(int, int), Piece> chunks = new Dictionary<(int, int), Piece>();
        readonly Dictionary<int, (double x, double y)[]> last = new Dictionary<int, (double x, double y)[]>();
        float sinceUpload;

        /// <summary>Marks over `parent`'s ground, laid on its heights (`heightAt`: world px → px).</summary>
        public SkidLayer(Transform parent, Func<double, double, double> heightAt, string name = "skids")
        {
            Root = new GameObject(name);
            Root.transform.SetParent(parent, false);
            this.heightAt = heightAt;
            if (material == null)
            {
                var shader = Resources.Load<Shader>("Shaders/PixelSeeThrough") ?? Shader.Find("Sprites/Default");
                material = new Material(shader) { name = "Skids" };
            }
        }

        Piece ChunkAt(int cx, int cy)
        {
            if (chunks.TryGetValue((cx, cy), out var ch)) return ch;
            var tex = new Texture2D(Chunk, Chunk, TextureFormat.RGBA32, false) { filterMode = FilterMode.Point, wrapMode = TextureWrapMode.Clamp, name = $"skids {cx},{cy}" };
            var px = new Color32[Chunk * Chunk];
            for (int i = 0; i < px.Length; i++) px[i] = Ink;
            tex.SetPixels32(px);
            tex.Apply(false);
            // (a grid of vertices over the chunk, each on the ground there, a little above it; uv v is the texture's row: px y)
            int n = Chunk / Seg + 1;
            var verts = new Vector3[n * n];
            var uvs = new Vector2[n * n];
            var colors = new Color32[n * n];
            for (int j = 0; j < n; j++)
                for (int i = 0; i < n; i++)
                {
                    double x = cx * Chunk + i * Seg, y = cy * Chunk + j * Seg;
                    verts[j * n + i] = Units.ToWorld(x, y, heightAt(x, y) + 0.3);
                    uvs[j * n + i] = new Vector2(i * Seg / (float)Chunk, j * Seg / (float)Chunk);
                    colors[j * n + i] = new Color32(255, 255, 255, 255);
                }
            var tris = new List<int>();
            for (int j = 0; j < n - 1; j++)
                for (int i = 0; i < n - 1; i++)
                {
                    int a = j * n + i, b = a + 1, c = a + n, d = c + 1;
                    tris.AddRange(new[] { a, c, b, b, c, d });
                }
            var mesh = new Mesh { name = tex.name, vertices = verts, uv = uvs, colors32 = colors };
            mesh.SetTriangles(tris, 0);
            mesh.RecalculateBounds();
            var go = new GameObject(tex.name);
            go.transform.SetParent(Root.transform, false);
            go.AddComponent<MeshFilter>().sharedMesh = mesh;
            var mat = new Material(material) { name = tex.name, mainTexture = tex };
            go.AddComponent<MeshRenderer>().sharedMaterial = mat;
            ch = new Piece { Tex = tex, Px = px, Mesh = mesh, Mat = mat };
            chunks[(cx, cy)] = ch;
            return ch;
        }

        /// <summary>A line from a to b (world px), `alpha` dark, into every chunk it touches.</summary>
        void Line((double x, double y) a, (double x, double y) b, float alpha)
        {
            int x0 = (int)Math.Floor((Math.Min(a.x, b.x) - 2) / Chunk), x1 = (int)Math.Floor((Math.Max(a.x, b.x) + 2) / Chunk);
            int y0 = (int)Math.Floor((Math.Min(a.y, b.y) - 2) / Chunk), y1 = (int)Math.Floor((Math.Max(a.y, b.y) + 2) / Chunk);
            for (int cy = y0; cy <= y1; cy++)
                for (int cx = x0; cx <= x1; cx++) Paint(ChunkAt(cx, cy), a.x - cx * Chunk, a.y - cy * Chunk, b.x - cx * Chunk, b.y - cy * Chunk, alpha);
        }

        /// <summary>A 2 px line in one chunk's pixels, its edge a pixel soft, laid over what's there.</summary>
        static void Paint(Piece ch, double ax, double ay, double bx, double by, float alpha)
        {
            int px0 = Math.Max(0, (int)Math.Floor(Math.Min(ax, bx) - 2)), px1 = Math.Min(Chunk - 1, (int)Math.Ceiling(Math.Max(ax, bx) + 2));
            int py0 = Math.Max(0, (int)Math.Floor(Math.Min(ay, by) - 2)), py1 = Math.Min(Chunk - 1, (int)Math.Ceiling(Math.Max(ay, by) + 2));
            double dx = bx - ax, dy = by - ay, len2 = dx * dx + dy * dy;
            for (int py = py0; py <= py1; py++)
                for (int px = px0; px <= px1; px++)
                {
                    double qx = px + 0.5 - ax, qy = py + 0.5 - ay;
                    double t = len2 > 0 ? Math.Max(0, Math.Min(1, (qx * dx + qy * dy) / len2)) : 0;
                    double ex = qx - t * dx, ey = qy - t * dy;
                    double cover = Math.Max(0, Math.Min(1, 1.5 - Math.Sqrt(ex * ex + ey * ey)));
                    if (cover <= 0) continue;
                    int k = py * Chunk + px;
                    float sa = alpha * (float)cover, da = ch.Px[k].a / 255f;
                    ch.Px[k].a = (byte)Mathf.RoundToInt(Mathf.Clamp01(sa + da * (1 - sa)) * 255);
                    ch.Dirty = true;
                }
        }

        /// <summary>
        /// The marks under both rear wheels of car `id` at (x, y) facing `heading` carried on (`strength` 0…1, darker
        /// faster); `width` and `length` its size, px. Lift it on frames it isn't skidding.
        /// </summary>
        public void Mark(int id, double x, double y, double heading, double strength, double width = 14, double length = 26)
        {
            double fx = JsMath.Sin(heading), fy = -JsMath.Cos(heading);
            double back = length / 2 - 5, half = width / 2 - 1;
            var wheels = new (double x, double y)[2];
            for (int i = 0; i < 2; i++)
            {
                int s = i == 0 ? -1 : 1;
                wheels[i] = (x - fx * back - fy * s * half, y - fy * back + fx * s * half);
            }
            last.TryGetValue(id, out var prev);
            float alpha = (float)Math.Min(0.55, 0.2 + strength * 0.35);
            for (int i = 0; i < 2; i++) Line(prev != null ? prev[i] : wheels[i], (wheels[i].x + 0.01, wheels[i].y), alpha);
            last[id] = wheels;
        }

        public void Lift(int id) => last.Remove(id);

        /// <summary>Every mark gone (a new session).</summary>
        public void Clear()
        {
            foreach (var ch in chunks.Values)
            {
                for (int i = 0; i < ch.Px.Length; i++) ch.Px[i] = Ink;
                ch.Dirty = true;
            }
            last.Clear();
        }

        /// <summary>Upload the chunks that changed, at most ~15 times a second.</summary>
        public void Update(float dt)
        {
            sinceUpload += dt;
            if (sinceUpload < 1f / 15) return;
            sinceUpload = 0;
            foreach (var ch in chunks.Values)
            {
                if (!ch.Dirty) continue;
                ch.Tex.SetPixels32(ch.Px);
                ch.Tex.Apply(false);
                ch.Dirty = false;
            }
        }

        /// <summary>Let go of the textures and meshes (the circuit's being left).</summary>
        public void Dispose()
        {
            foreach (var ch in chunks.Values)
            {
                UnityEngine.Object.Destroy(ch.Tex);
                UnityEngine.Object.Destroy(ch.Mesh);
                UnityEngine.Object.Destroy(ch.Mat);
            }
            chunks.Clear();
            UnityEngine.Object.Destroy(Root);
        }
    }
}
