// The start gantry: five red lights over the line that come on one by one (every 0.6 s) and all go out for the start.
// A 3D gantry over the start line (so you see it from the grid) and the same five lights on the HUD (RaceController.OnGUI).
using CornerCutters.Core;
using UnityEngine;

namespace CornerCutters.Game
{
    public sealed class StartLights
    {
        public const int Count = 5;
        public const double Interval = 0.6;   // (the web game's: raceControl.ts LIGHTS, a light every 0.6 s)
        static readonly Color Off = new Color(0.18f, 0.03f, 0.03f);
        static readonly Color On = new Color(1f, 0.08f, 0.05f);

        readonly Material[] bulbs = new Material[Count];

        /// <summary>How many lights are lit this long into the lights phase.</summary>
        public static int LitAt(double seconds) => Mathf.Clamp((int)System.Math.Floor(seconds / Interval), 0, Count);

        public StartLights(Transform parent, CircuitData c)
        {
            double x = c.samples.x[0], y = c.samples.y[0], dir = c.samples.dir[0];
            double z = Sim.GroundAt(c.ToGrid(), x, y).H;
            var root = new GameObject("start gantry");
            root.transform.SetParent(parent, false);
            root.transform.SetPositionAndRotation(Units.ToWorld(x, y, z), Quaternion.Euler(0, Units.Yaw(dir), 0));

            var frame = new MeshBuilder();
            var steel = new Color(0.25f, 0.26f, 0.3f);
            frame.Box(new Vector3(-3.2f, 2.6f, 0), new Vector3(0.35f, 5.2f, 0.35f), steel);   // posts
            frame.Box(new Vector3(3.2f, 2.6f, 0), new Vector3(0.35f, 5.2f, 0.35f), steel);
            frame.Box(new Vector3(0, 5.2f, 0), new Vector3(6.9f, 1.1f, 0.5f), steel);          // beam
            var body = new GameObject("frame");
            body.transform.SetParent(root.transform, false);
            body.AddComponent<MeshFilter>().sharedMesh = frame.ToMesh("gantry");
            body.AddComponent<MeshRenderer>().sharedMaterial = MeshBuilder.VertexColorMaterial();

            var bulb = new MeshBuilder();
            bulb.Box(Vector3.zero, new Vector3(0.7f, 0.7f, 0.3f), Color.white);
            var bulbMesh = bulb.ToMesh("bulb");
            for (int i = 0; i < Count; i++)
            {
                var go = new GameObject("light " + (i + 1));
                go.transform.SetParent(root.transform, false);
                go.transform.localPosition = new Vector3((i - (Count - 1) / 2f) * 1.1f, 5.2f, 0);
                go.AddComponent<MeshFilter>().sharedMesh = bulbMesh;
                bulbs[i] = new Material(MeshBuilder.VertexColorMaterial()) { color = Off };
                go.AddComponent<MeshRenderer>().sharedMaterial = bulbs[i];
            }
        }

        public void Show(int lit)
        {
            for (int i = 0; i < Count; i++) bulbs[i].color = i < lit ? On : Off;
        }
    }
}
