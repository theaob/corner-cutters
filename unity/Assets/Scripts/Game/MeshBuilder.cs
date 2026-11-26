// A tiny mesh builder with vertex colours and atlas UVs: the whole look is the pixel atlas (PixelAtlas) tinted and
// slope-shaded by vertex colours, drawn with the built-in unlit Sprites/Default shader (always included in builds, takes
// vertex colours and a texture, no render pipeline needed). Everything uses the one material.
using System.Collections.Generic;
using UnityEngine;
using UnityEngine.Rendering;

namespace CornerCutters.Game
{
    public sealed class MeshBuilder
    {
        readonly List<Vector3> verts = new List<Vector3>();
        readonly List<Color32> colors = new List<Color32>();
        readonly List<Vector2> uvs = new List<Vector2>();
        readonly List<int> tris = new List<int>();

        /// <summary>Applied to every point added (to place a rotated stand, say).</summary>
        public Matrix4x4 Xf = Matrix4x4.identity;

        public int VertexCount => verts.Count;

        void Add(Vector3 p, Color32 c, Vector2 uv)
        {
            verts.Add(Xf.MultiplyPoint3x4(p)); colors.Add(c); uvs.Add(uv);
        }

        /// <summary>A quad, corners clockwise from the top left as seen from above (nw, ne, se, sw), textured with an atlas cell.</summary>
        public void Quad(Vector3 a, Vector3 b, Vector3 c, Vector3 d, Color32 color, int cell = PixelAtlas.White)
        {
            var uv = PixelAtlas.Uv(cell);
            bool flat = cell == PixelAtlas.White;
            var mid = PixelAtlas.Centre(PixelAtlas.White);
            int i = verts.Count;
            Add(a, color, flat ? mid : new Vector2(uv.x, uv.w));
            Add(b, color, flat ? mid : new Vector2(uv.z, uv.w));
            Add(c, color, flat ? mid : new Vector2(uv.z, uv.y));
            Add(d, color, flat ? mid : new Vector2(uv.x, uv.y));
            tris.Add(i); tris.Add(i + 1); tris.Add(i + 2);
            tris.Add(i); tris.Add(i + 2); tris.Add(i + 3);
        }

        /// <summary>An axis-aligned box centred at <paramref name="centre"/>; faces shaded by direction.</summary>
        public void Box(Vector3 centre, Vector3 size, Color baseColor)
        {
            Vector3 h = size * 0.5f;
            Vector3 p(float x, float y, float z) => centre + new Vector3(x * h.x, y * h.y, z * h.z);
            Color32 shade(float s) => (Color)new Color(baseColor.r * s, baseColor.g * s, baseColor.b * s, 1f);
            Quad(p(-1, 1, -1), p(-1, 1, 1), p(1, 1, 1), p(1, 1, -1), shade(1.0f));      // top
            Quad(p(-1, -1, -1), p(1, -1, -1), p(1, -1, 1), p(-1, -1, 1), shade(0.45f)); // bottom
            Quad(p(-1, -1, 1), p(1, -1, 1), p(1, 1, 1), p(-1, 1, 1), shade(0.85f));     // front (+Z)
            Quad(p(1, -1, -1), p(-1, -1, -1), p(-1, 1, -1), p(1, 1, -1), shade(0.7f));  // back
            Quad(p(-1, -1, -1), p(-1, -1, 1), p(-1, 1, 1), p(-1, 1, -1), shade(0.6f));  // left
            Quad(p(1, -1, 1), p(1, -1, -1), p(1, 1, -1), p(1, 1, 1), shade(0.75f));     // right
        }

        /// <summary>A box with its top face a different colour (a livery's stripe on the top, body colour round the sides).</summary>
        public void Box(Vector3 centre, Vector3 size, Color sides, Color top)
        {
            Vector3 h = size * 0.5f;
            Vector3 p(float x, float y, float z) => centre + new Vector3(x * h.x, y * h.y, z * h.z);
            Color32 shade(Color c, float s) => (Color)new Color(c.r * s, c.g * s, c.b * s, 1f);
            Quad(p(-1, 1, -1), p(-1, 1, 1), p(1, 1, 1), p(1, 1, -1), shade(top, 1.0f));
            Quad(p(-1, -1, -1), p(1, -1, -1), p(1, -1, 1), p(-1, -1, 1), shade(sides, 0.45f));
            Quad(p(-1, -1, 1), p(1, -1, 1), p(1, 1, 1), p(-1, 1, 1), shade(sides, 0.85f));
            Quad(p(1, -1, -1), p(-1, -1, -1), p(-1, 1, -1), p(1, 1, -1), shade(sides, 0.7f));
            Quad(p(-1, -1, -1), p(-1, -1, 1), p(-1, 1, 1), p(-1, 1, -1), shade(sides, 0.6f));
            Quad(p(1, -1, 1), p(1, -1, -1), p(1, 1, -1), p(1, 1, 1), shade(sides, 0.75f));
        }

        /// <summary>A flat patch on the ground or a surface: corners a, b, c, d, one colour.</summary>
        public void Patch(Vector3 a, Vector3 b, Vector3 c, Vector3 d, Color color) => Quad(a, b, c, d, color);

        /// <summary>A many-sided cylinder with its axle along X (a wheel), from -width/2 to +width/2; faces shaded by their turn.</summary>
        public void CylinderX(Vector3 centre, float radius, float width, int segments, Color color)
        {
            float x0 = -width / 2, x1 = width / 2;
            for (int i = 0; i < segments; i++)
            {
                float a0 = i * Mathf.PI * 2f / segments, a1 = (i + 1) * Mathf.PI * 2f / segments;
                var p0 = new Vector3(0, Mathf.Sin(a0) * radius, Mathf.Cos(a0) * radius);
                var p1 = new Vector3(0, Mathf.Sin(a1) * radius, Mathf.Cos(a1) * radius);
                float s = 0.55f + 0.45f * Mathf.Clamp01(Mathf.Sin((a0 + a1) * 0.5f) * 0.5f + 0.5f);
                Color32 c = (Color)new Color(color.r * s, color.g * s, color.b * s, 1f);
                Quad(centre + p0 + new Vector3(x0, 0, 0), centre + p0 + new Vector3(x1, 0, 0), centre + p1 + new Vector3(x1, 0, 0), centre + p1 + new Vector3(x0, 0, 0), c);
                // the two faces
                Color32 cap = (Color)new Color(color.r * 0.8f, color.g * 0.8f, color.b * 0.8f, 1f);
                Quad(centre + new Vector3(x1, 0, 0), centre + p0 + new Vector3(x1, 0, 0), centre + p1 + new Vector3(x1, 0, 0), centre + p1 + new Vector3(x1, 0, 0), cap);
                Quad(centre + new Vector3(x0, 0, 0), centre + p1 + new Vector3(x0, 0, 0), centre + p0 + new Vector3(x0, 0, 0), centre + p0 + new Vector3(x0, 0, 0), cap);
            }
        }

        /// <summary>A small low-poly ball (a helmet), 8 segments by 5 rings.</summary>
        public void Sphere(Vector3 centre, float radius, Color color)
        {
            const int seg = 8, rings = 5;
            Vector3 P(int i, int j) { float a = i * Mathf.PI * 2f / seg, b = Mathf.PI * j / rings; return centre + new Vector3(Mathf.Cos(a) * Mathf.Sin(b), Mathf.Cos(b), Mathf.Sin(a) * Mathf.Sin(b)) * radius; }
            for (int j = 0; j < rings; j++)
                for (int i = 0; i < seg; i++)
                {
                    float s = 0.7f + 0.3f * Mathf.Cos(Mathf.PI * (j + 0.5f) / rings);
                    Quad(P(i, j), P(i + 1, j), P(i + 1, j + 1), P(i, j + 1), (Color)new Color(color.r * s, color.g * s, color.b * s, 1f));
                }
        }

        public Mesh ToMesh(string name)
        {
            var m = new Mesh { name = name, indexFormat = IndexFormat.UInt32 };
            m.SetVertices(verts);
            m.SetColors(colors);
            m.SetUVs(0, uvs);
            m.SetTriangles(tris, 0);
            m.RecalculateBounds();
            return m;
        }

        static Material shared, shadow;
        /// <summary>The one solid material: the pixel atlas, tinted by vertex colours, unlit, opaque, writes depth.</summary>
        public static Material VertexColorMaterial()
        {
            if (shared == null)
            {
                // (Sprites/Default as a fallback if the shader is missing: it won't write depth, so 3D would draw out of order)
                var shader = Resources.Load<Shader>("Shaders/PixelUnlit") ?? Shader.Find("Sprites/Default");
                shared = new Material(shader) { name = "PixelAtlas" };
                shared.mainTexture = PixelAtlas.Texture;
            }
            return shared;
        }

        /// <summary>For shadows: vertex colour's alpha blended over the ground.</summary>
        public static Material ShadowMaterial()
        {
            if (shadow == null)
            {
                var shader = Resources.Load<Shader>("Shaders/PixelShadow") ?? Shader.Find("Sprites/Default");
                shadow = new Material(shader) { name = "PixelShadow" };
            }
            return shadow;
        }
    }
}
