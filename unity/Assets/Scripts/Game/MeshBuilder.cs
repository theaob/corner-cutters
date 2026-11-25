// A tiny mesh builder with vertex colours: the whole look is flat colour shaded by slope, drawn with the built-in
// unlit Sprites/Default shader (always included in builds, takes vertex colours, no render pipeline needed).
using System.Collections.Generic;
using UnityEngine;
using UnityEngine.Rendering;

namespace CornerCutters.Game
{
    public sealed class MeshBuilder
    {
        readonly List<Vector3> verts = new List<Vector3>();
        readonly List<Color32> colors = new List<Color32>();
        readonly List<int> tris = new List<int>();

        public int VertexCount => verts.Count;

        public void Quad(Vector3 a, Vector3 b, Vector3 c, Vector3 d, Color32 color)
        {
            int i = verts.Count;
            verts.Add(a); verts.Add(b); verts.Add(c); verts.Add(d);
            for (int k = 0; k < 4; k++) colors.Add(color);
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

        public Mesh ToMesh(string name)
        {
            var m = new Mesh { name = name, indexFormat = IndexFormat.UInt32 };
            m.SetVertices(verts);
            m.SetColors(colors);
            m.SetTriangles(tris, 0);
            m.RecalculateBounds();
            return m;
        }

        static Material shared;
        /// <summary>The one material: vertex colours, unlit, double-sided.</summary>
        public static Material VertexColorMaterial()
        {
            if (shared == null) shared = new Material(Shader.Find("Sprites/Default")) { name = "VertexColor" };
            return shared;
        }
    }
}
