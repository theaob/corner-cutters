// The finish pass on the camera (shaders/TiltShift), as the web game's (src/engine/render/hd2d.ts): the tilt-shift's
// horizontal, vertical and horizontal blurs at half the screen's size, then the last, vertical, at full size over the
// sharp picture, with the light, warm grade, S-curve, vignette and Neutral tone mapping the web game's picture gets;
// and before it the web game's glow (UnrealBloomPass: the parts brighter than 0.9, blurred at five sizes, added at
// 0.35). All in linear light, in half floats. Built-in render pipeline image effect; if the shader is missing it passes
// the picture through.
using UnityEngine;

namespace CornerCutters.Game
{
    [RequireComponent(typeof(Camera))]
    public sealed class TiltShiftEffect : MonoBehaviour
    {
        /// <summary>the web game's HD2D_VIEW blur</summary>
        public float Amount = 1.2f;
        /// <summary>the light on flat ground, linear (the weather's: WeatherView); the dry day's to start</summary>
        public static Vector4 Light = new Vector4(0.8375f, 0.7537f, 0.7039f, 0);
        /// <summary>
        /// the light the scenery was baked in (BakedScenery's): a pixel's own light (its alpha's the share that isn't: a
        /// lamp, a lit sign) keeps this whatever the weather, the rest takes Light
        /// </summary>
        public static Vector4 Baked = new Vector4(0.8375f, 0.7537f, 0.7039f, 0);
        /// <summary>the glow's strength (UnrealBloomPass: 0.35 by day, 0.7 at night)</summary>
        public static float Bloom = 0.35f;
        /// <summary>the picture's quality level (Picture.cs): the glow, the tilt-shift's blur, and every pass at half the screen's size</summary>
        public static bool BloomOn = true, BlurOn = true, HalfSize;
        Material mat;

        void OnEnable()
        {
            var shader = Resources.Load<Shader>("Shaders/TiltShift");
            if (shader != null && shader.isSupported) mat = new Material(shader);
        }

        static readonly int[] Kernels = { 3, 5, 7, 9, 11 };
        const RenderTextureFormat Hdr = RenderTextureFormat.ARGBHalf;

        void OnRenderImage(RenderTexture src, RenderTexture dst)
        {
            if (mat == null) { Graphics.Blit(src, dst); return; }
            // (a lower quality level: every pass at half size, the last stretched over the screen)
            int W = HalfSize ? Mathf.Max(1, src.width / 2) : src.width, H = HalfSize ? Mathf.Max(1, src.height / 2) : src.height;
            var temps = new System.Collections.Generic.List<RenderTexture>();
            RenderTexture Temp(int w, int h)
            {
                var t = RenderTexture.GetTemporary(Mathf.Max(1, w), Mathf.Max(1, h), 0, Hdr);
                t.filterMode = FilterMode.Bilinear;
                temps.Add(t);
                return t;
            }

            // the picture in linear light, lit
            mat.SetVector("_Light", Light);
            mat.SetVector("_Baked", Baked);
            var lit = Temp(W, H);
            Graphics.Blit(src, lit, mat, 2);

            // the glow: the bright parts, then five mips, each blurred from the last at half its size (none at a lower level)
            var glowed = lit;
            if (BloomOn)
            {
                var bright = Temp(W, H);
                Graphics.Blit(lit, bright, mat, 3);
                RenderTexture input = bright;
                int mw = Mathf.RoundToInt(W / 2f), mh = Mathf.RoundToInt(H / 2f);
                for (int i = 0; i < Kernels.Length; i++)
                {
                    var across = Temp(mw, mh);
                    var down = Temp(mw, mh);
                    mat.SetFloat("_Radius", Kernels[i]);
                    mat.SetVector("_Dir", new Vector4(1, 0, 0, 0));
                    Graphics.Blit(input, across, mat, 4);
                    mat.SetVector("_Dir", new Vector4(0, 1, 0, 0));
                    Graphics.Blit(across, down, mat, 4);
                    mat.SetTexture("_Bloom" + i, down);
                    input = down;
                    mw = Mathf.RoundToInt(mw / 2f); mh = Mathf.RoundToInt(mh / 2f);
                }
                glowed = Temp(W, H);
                mat.SetFloat("_BloomStrength", Bloom);
                Graphics.Blit(lit, glowed, mat, 5);
            }

            // (no blur at a lower level: the grade alone, over the sharp picture)
            if (!BlurOn)
            {
                mat.SetVector("_Res", new Vector4(W, H, 0, 0));
                mat.SetFloat("_Amount", 0);
                mat.SetTexture("_Sharp", glowed);
                Graphics.Blit(glowed, dst, mat, 1);
                foreach (var t in temps) RenderTexture.ReleaseTemporary(t);
                return;
            }

            // the tilt-shift: three blurs at half size, the last at full size over the sharp picture, then the grade
            var a = Temp(W / 2, H / 2);
            var b = Temp(W / 2, H / 2);
            // (the step is measured against the full screen's size, as the web game's is)
            mat.SetVector("_Res", new Vector4(W, H, 0, 0));
            mat.SetFloat("_Amount", Amount);
            mat.SetVector("_Dir", new Vector4(1, 0, 0, 0));
            Graphics.Blit(glowed, a, mat, 0);
            mat.SetVector("_Dir", new Vector4(0, 1, 0, 0));
            Graphics.Blit(a, b, mat, 0);
            mat.SetVector("_Dir", new Vector4(1, 0, 0, 0));
            Graphics.Blit(b, a, mat, 0);
            mat.SetTexture("_Sharp", glowed);
            Graphics.Blit(a, dst, mat, 1);
            foreach (var t in temps) RenderTexture.ReleaseTemporary(t);
        }
    }
}
