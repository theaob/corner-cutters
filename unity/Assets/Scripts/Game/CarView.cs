// A blocky F1 car in the web game's style, seen mostly from above: livery body with an accent engine cover, a white
// front wing and a rear wing, a helmet, wheels with a red rim round black, and a soft shadow. One mesh, faces +Z at yaw 0 (north).
using UnityEngine;

namespace CornerCutters.Game
{
    public sealed class CarView
    {
        public readonly GameObject Root;

        public CarView(Color body, Color accent)
        {
            Root = new GameObject("Car");
            var mb = new MeshBuilder();
            var dark = new Color(0.08f, 0.08f, 0.09f);
            var white = new Color(0.94f, 0.94f, 0.96f);
            var red = new Color(0.82f, 0.12f, 0.1f);
            mb.Box(new Vector3(0, 0.26f, -0.1f), new Vector3(0.5f, 0.2f, 1.1f), body);                // body
            mb.Box(new Vector3(0, 0.22f, 0.65f), new Vector3(0.26f, 0.13f, 0.6f), body);              // nose
            mb.Box(new Vector3(-0.4f, 0.22f, -0.1f), new Vector3(0.22f, 0.16f, 0.6f), body);          // sidepods
            mb.Box(new Vector3(0.4f, 0.22f, -0.1f), new Vector3(0.22f, 0.16f, 0.6f), body);
            mb.Box(new Vector3(0, 0.4f, -0.3f), new Vector3(0.2f, 0.16f, 0.62f), accent);             // engine cover
            mb.Box(new Vector3(0, 0.42f, 0.12f), new Vector3(0.16f, 0.14f, 0.16f), white);             // helmet
            mb.Box(new Vector3(0, 0.09f, 0.98f), new Vector3(0.95f, 0.05f, 0.22f), white);             // front wing
            mb.Box(new Vector3(0, 0.09f, 0.98f), new Vector3(0.3f, 0.055f, 0.22f), accent);
            mb.Box(new Vector3(0, 0.52f, -0.78f), new Vector3(0.8f, 0.05f, 0.24f), white);             // rear wing
            mb.Box(new Vector3(0, 0.52f, -0.78f), new Vector3(0.3f, 0.055f, 0.24f), accent);
            mb.Box(new Vector3(0, 0.36f, -0.74f), new Vector3(0.06f, 0.25f, 0.12f), dark);             // wing mount
            foreach (float sx in new[] { -1f, 1f })
            {
                Wheel(mb, new Vector3(sx * 0.5f, 0.18f, 0.6f), 0.22f, 0.5f, red, dark);      // front
                Wheel(mb, new Vector3(sx * 0.52f, 0.2f, -0.6f), 0.28f, 0.54f, red, dark);    // rear
            }
            var body3d = new GameObject("body");
            body3d.transform.SetParent(Root.transform, false);
            body3d.AddComponent<MeshFilter>().sharedMesh = mb.ToMesh("car");
            body3d.AddComponent<MeshRenderer>().sharedMaterial = MeshBuilder.VertexColorMaterial();

            // a soft shadow on the ground under it, a little to the lower right (it stays flat: the car's own tilt is not applied)
            var sh = new MeshBuilder();
            var c = new Color(0, 0, 0, 0.32f);
            sh.Quad(new Vector3(-0.2f, 0, 1.2f), new Vector3(1.0f, 0, 1.2f), new Vector3(1.0f, 0, -1.3f), new Vector3(-0.2f, 0, -1.3f), c);
            var shadow = new GameObject("shadow");
            shadow.transform.SetParent(Root.transform, false);
            shadow.transform.localPosition = new Vector3(0, 0.03f, 0);
            shadow.AddComponent<MeshFilter>().sharedMesh = sh.ToMesh("car shadow");
            shadow.AddComponent<MeshRenderer>().sharedMaterial = MeshBuilder.ShadowMaterial();
        }

        static void Wheel(MeshBuilder mb, Vector3 at, float width, float length, Color rim, Color tyre)
        {
            mb.Box(at, new Vector3(width, 0.36f, length), rim);
            mb.Box(at + new Vector3(0, 0.01f, 0), new Vector3(width + 0.02f, 0.36f, length * 0.62f), tyre);
        }
    }
}
