// The web game's F1 car, box for box (src/engine/render/vehicles3d.ts createCarMesh, in its px, scaled to units): a narrow
// tub with a long nose, sidepods, cockpit, helmet, intake and T-camera, engine cover carrying the team's pattern, front and
// rear wings with end plates, and fat 12-sided tyres (bigger at the back) with a red soft-compound band. Facing +Z (north)
// at yaw 0. One mesh and a soft shadow.
using UnityEngine;

namespace CornerCutters.Game
{
    /// <summary>How the second colour runs over the top of the car (the web game's LiveryPattern).</summary>
    public enum LiveryPattern { Plain, Stripe, Twin, Band, Chevron, Halves, Split, Nose }

    public sealed class Livery
    {
        public Color Body, Trim;
        public Color? Accent;
        public LiveryPattern Pattern = LiveryPattern.Plain;
        /// <summary>the T-camera: null = carbon (a team's first car), bright green marks the second</summary>
        public Color? TCam;

        static Color Hex(int rgb) => new Color(((rgb >> 16) & 255) / 255f, ((rgb >> 8) & 255) / 255f, (rgb & 255) / 255f);

        /// <summary>Milk Energy, the web game's first team: navy with gold nose and wings (src/f1/teams.ts).</summary>
        public static Livery MilkEnergy() => FromTeam(CornerCutters.Core.Field.Teams[0], 0);

        /// <summary>A team's livery (src/f1/teams.ts), its second car with the bright green T-camera (race.ts TCAM_GREEN).</summary>
        public static Livery FromTeam(CornerCutters.Core.Team t, int seat) => new Livery
        {
            Body = Hex(t.Body), Trim = Hex(t.Trim), Accent = t.Accent >= 0 ? Hex(t.Accent) : (Color?)null,
            Pattern = System.Enum.TryParse<LiveryPattern>(t.Pattern, true, out var p) ? p : LiveryPattern.Plain,
            TCam = seat == 1 ? Hex(0x39ff14) : (Color?)null,
        };
    }

    public sealed class CarView
    {
        public readonly GameObject Root;
        const float K = Units.PerPx;
        // the car's numbers (web: driving.ts f1 class): px
        const float W = 14, L = 30;

        /// <summary>Is the point (u across 0..1, v from the front 0..1) of a w x h px surface in the pattern's second colour?</summary>
        static bool Second(LiveryPattern p, float u, float v, float w, float h)
        {
            float x = u * w, y = v * h;
            switch (p)
            {
                case LiveryPattern.Stripe: return u >= 0.36f && u <= 0.64f;
                case LiveryPattern.Twin: return (u >= 0.14f && u <= 0.32f) || (u >= 0.68f && u <= 0.86f);
                case LiveryPattern.Band: return v >= 0.12f && ((v - 0.12f) % 0.3f) < 0.12f;
                case LiveryPattern.Chevron:
                    {
                        float t = y - Mathf.Abs(x - w / 2) - 0.2f * h;
                        float m = ((t % (0.34f * h)) + 0.34f * h) % (0.34f * h);
                        return m < 0.18f * w * 1.4f;
                    }
                case LiveryPattern.Halves: return v < 0.5f;
                case LiveryPattern.Split: return u >= 0.5f;
                case LiveryPattern.Nose: return v < 0.34f;
                default: return false;
            }
        }

        // a box in the web game's frame (x across, y up, z along with the nose at -z; px) as a box here (z flipped, scaled)
        static void Box(MeshBuilder mb, float w, float h, float l, float y, float z, Color sides, float x = 0, Color? top = null)
        {
            var c = new Vector3(x * K, y * K, -z * K);
            var s = new Vector3(w * K, h * K, l * K);
            if (top.HasValue) mb.Box(c, s, sides, top.Value); else mb.Box(c, s, sides);
        }

        /// <summary>A box whose top face is painted with the livery's pattern: a grid of small patches.</summary>
        static void PatternBox(MeshBuilder mb, float w, float h, float l, float y, float z, Color body, Color second, LiveryPattern p, Color sides)
        {
            Box(mb, w, h, l, y, z, sides, 0, body);
            if (p == LiveryPattern.Plain) return;
            int nu = Mathf.Max(1, Mathf.RoundToInt(w / 1f)), nv = Mathf.Max(1, Mathf.RoundToInt(l / 1f));
            float top = (y + h / 2 + 0.02f) * K;
            for (int j = 0; j < nv; j++)
                for (int i = 0; i < nu; i++)
                {
                    float u = (i + 0.5f) / nu, v = (j + 0.5f) / nv;   // v from the front (nose) backward
                    if (!Second(p, u, v, w, l)) continue;
                    float x0 = (-w / 2 + w * i / nu) * K, x1 = (-w / 2 + w * (i + 1) / nu) * K;
                    // the front is at -z in the web frame: z there = z - l/2 + l*v ... here flipped
                    float zf0 = -(z - l / 2 + l * j / nv) * K, zf1 = -(z - l / 2 + l * (j + 1) / nv) * K;
                    mb.Quad(new Vector3(x0, top, zf0), new Vector3(x1, top, zf0), new Vector3(x1, top, zf1), new Vector3(x0, top, zf1), (Color32)second);
                }
        }

        /// <param name="band">the tyres' compound colour (0xRRGGBB: the soft's red unless given)</param>
        public CarView(Livery look, int band = 0xe8463c)
        {
            Root = new GameObject("Car");
            var mb = new MeshBuilder();
            var body = look.Body;
            var trim = look.Trim;
            var pods = look.Accent ?? body;
            var carbon = new Color(0.106f, 0.106f, 0.149f);
            var dark = new Color(0.07f, 0.07f, 0.07f);

            PatternBox(mb, 5, 3.5f, L - 6, 3.5f, 1, body, trim, look.Pattern, body);       // tub, the pattern along its top
            Box(mb, 3, 2.5f, 8, 3, -(L / 2 - 6), body, 0, trim);                              // nose (its top in the trim colour)
            foreach (float sx in new[] { -4f, 4f }) Box(mb, 3, 3, 9, 3, 3, pods, sx);         // sidepods
            Box(mb, 3.5f, 1.5f, 5, 5.8f, 0, carbon);                                          // cockpit
            if (look.Pattern != LiveryPattern.Plain) PatternBox(mb, 11, 0.6f, 8, 5.4f, 7, body, trim, look.Pattern, pods); // engine cover
            Box(mb, 2.6f, 2.4f, 3, 7.6f, 2.6f, body);                                         // air intake
            Box(mb, 4.2f, 1, 1.6f, 9.3f, 2.4f, look.TCam ?? carbon);                          // T-camera
            mb.Sphere(new Vector3(0, 7.2f * K, -0.5f * K), 1.7f * K, new Color(0.91f, 0.91f, 0.93f)); // helmet
            Box(mb, W, 0.8f, 3, 1.4f, -(L / 2 - 1.5f), trim);                                 // front wing
            Box(mb, W - 3, 0.8f, 2.5f, 8.5f, L / 2 - 1.5f, trim, 0, body);                    // rear wing
            foreach (float sx in new[] { -(W - 3) / 2, (W - 3) / 2 }) Box(mb, 0.6f, 5, 3, 6.5f, L / 2 - 1.5f, carbon, sx); // end plates

            // wheels: [z, radius, width, half-track] per axle; the compound band (soft: red) round the outer edge
            var rubber = new Color(0.082f, 0.082f, 0.082f);
            var bandColor = TrackView.Hex(band);
            foreach (var (z, r, w, half) in new[] { (-(L / 2 - 8), 3.2f, 3f, W / 2 - 1.5f), (L / 2 - 6, 3.8f, 3.6f, W / 2 - 1.2f) })
                foreach (float sx in new[] { -1f, 1f })
                {
                    var hub = new Vector3(sx * half * K, r * K, -z * K);
                    mb.CylinderX(hub, r * K, w * K, 12, rubber);
                    mb.CylinderX(hub + new Vector3(sx * (w / 2 - 0.4f) * K, 0, 0), (r + 0.12f) * K, 0.8f * K, 12, bandColor, openEnded: true);
                }

            var body3d = new GameObject("body");
            body3d.transform.SetParent(Root.transform, false);
            body3d.AddComponent<MeshFilter>().sharedMesh = mb.ToMesh("car");
            body3d.AddComponent<MeshRenderer>().sharedMaterial = MeshBuilder.VertexColorMaterial();

            // a soft shadow on the ground, a little to the lower right
            var sh = new MeshBuilder();
            var c = new Color(0, 0, 0, 0.3f);
            float hw = W * 0.6f * K, hl = L * 0.55f * K, ox = 0.12f, oz = -0.1f;
            sh.Quad(new Vector3(ox - hw, 0, oz + hl), new Vector3(ox + hw, 0, oz + hl), new Vector3(ox + hw, 0, oz - hl), new Vector3(ox - hw, 0, oz - hl), c);
            var shadow = new GameObject("shadow");
            shadow.transform.SetParent(Root.transform, false);
            shadow.transform.localPosition = new Vector3(0, 0.03f, 0);
            shadow.AddComponent<MeshFilter>().sharedMesh = sh.ToMesh("car shadow");
            shadow.AddComponent<MeshRenderer>().sharedMaterial = MeshBuilder.ShadowMaterial();
        }
    }

    /// <summary>The safety car (src/f1/safetyCar3d.ts): a low road car in silver with a green stripe, and an amber light bar
    /// whose two lamps take turns while it leads the field.</summary>
    public sealed class SafetyCarView
    {
        public readonly GameObject Root;
        readonly GameObject[] on = new GameObject[2], off = new GameObject[2];
        float time;
        const float K = Units.PerPx;

        public SafetyCarView(float w = 14, float l = 28)
        {
            Root = new GameObject("Safety car");
            var mb = new MeshBuilder();
            var silver = TrackView.Hex(0xc9ccd4);
            var stripe = TrackView.Hex(0x2f9a5a);
            var glass = TrackView.Hex(0x2e3b5c);
            // (the web game's boxes: x across, y up, z along with the nose at -z, px; here z flipped and scaled)
            void Box(float bw, float h, float bl, float y, float z, Color sides, Color? top = null)
            {
                var c = new Vector3(0, y * K, -z * K);
                var size = new Vector3(bw * K, h * K, bl * K);
                if (top.HasValue) mb.Box(c, size, sides, top.Value); else mb.Box(c, size, sides);
            }
            Box(w, 5, l, 4.5f, 0, silver);
            Box(4, 0.4f, l + 0.2f, 7.1f, 0, stripe);
            Box(w - 3, 3.5f, l * 0.42f, 8.7f, 2, glass, silver);
            var tyre = TrackView.Hex(0x151515);
            foreach (float z in new[] { -(l / 2 - 5), l / 2 - 5 })
                foreach (float x in new[] { -w / 2, w / 2 })
                    mb.CylinderX(new Vector3(x * K, 3 * K, -z * K), 3 * K, 2 * K, 12, tyre);
            var body = new GameObject("body");
            body.transform.SetParent(Root.transform, false);
            body.AddComponent<MeshFilter>().sharedMesh = mb.ToMesh("safety car");
            body.AddComponent<MeshRenderer>().sharedMaterial = MeshBuilder.VertexColorMaterial();
            for (int i = 0; i < 2; i++)
            {
                float x = i == 0 ? -2.5f : 2.5f;
                on[i] = Lamp(x, new Color(1f, 0.75f, 0.2f), "lamp on");
                off[i] = Lamp(x, new Color(0.25f, 0.14f, 0.02f), "lamp off");
            }
        }

        GameObject Lamp(float x, Color c, string name)
        {
            var mb = new MeshBuilder();
            mb.Box(new Vector3(x * K, 11.2f * K, -2 * K), new Vector3(4 * K, 1.4f * K, 2.4f * K), c);
            var go = new GameObject(name);
            go.transform.SetParent(Root.transform, false);
            go.AddComponent<MeshFilter>().sharedMesh = mb.ToMesh(name);
            go.AddComponent<MeshRenderer>().sharedMaterial = MeshBuilder.VertexColorMaterial();
            return go;
        }

        /// <summary>Flash the light bar.</summary>
        public void Step(float dt)
        {
            time += dt;
            bool phase = Mathf.FloorToInt(time * 5) % 2 == 0;
            on[0].SetActive(phase); off[0].SetActive(!phase);
            on[1].SetActive(!phase); off[1].SetActive(phase);
        }
    }
}
