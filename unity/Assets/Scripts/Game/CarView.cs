// A placeholder F1 car built from boxes (one mesh): body, nose, wings, four wheels. Faces *+Z* at yaw 0 (north).
using UnityEngine;

namespace CornerCutters.Game
{
    public sealed class CarView
    {
        public readonly GameObject Root;

        public CarView(Color livery)
        {
            Root = new GameObject("Car");
            var mb = new MeshBuilder();
            var dark = new Color(0.08f, 0.08f, 0.09f);
            mb.Box(new Vector3(0, 0.28f, -0.05f), new Vector3(0.55f, 0.22f, 1.25f), livery);        // body
            mb.Box(new Vector3(0, 0.24f, 0.78f), new Vector3(0.28f, 0.14f, 0.55f), livery);         // nose
            mb.Box(new Vector3(0, 0.42f, -0.18f), new Vector3(0.22f, 0.14f, 0.35f), dark);          // cockpit / airbox
            mb.Box(new Vector3(0, 0.11f, 1.02f), new Vector3(0.95f, 0.04f, 0.2f), dark);            // front wing
            mb.Box(new Vector3(0, 0.55f, -0.78f), new Vector3(0.8f, 0.05f, 0.22f), dark);           // rear wing
            mb.Box(new Vector3(0, 0.4f, -0.74f), new Vector3(0.06f, 0.25f, 0.12f), dark);           // wing mount
            foreach (float sx in new[] { -1f, 1f })
            {
                mb.Box(new Vector3(sx * 0.48f, 0.19f, 0.58f), new Vector3(0.22f, 0.36f, 0.5f), dark);   // front wheels
                mb.Box(new Vector3(sx * 0.5f, 0.21f, -0.62f), new Vector3(0.28f, 0.42f, 0.55f), dark);  // rear wheels
            }
            Root.AddComponent<MeshFilter>().sharedMesh = mb.ToMesh("car");
            Root.AddComponent<MeshRenderer>().sharedMaterial = MeshBuilder.VertexColorMaterial();
        }
    }
}
