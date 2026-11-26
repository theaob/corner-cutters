// The finish pass on the camera (shaders/TiltShift), as the web game's (src/engine/render/hd2d.ts): the tilt-shift's
// horizontal, vertical and horizontal blurs at half the screen's size, then the last, vertical, at full size over the
// sharp picture, with the light, warm grade, S-curve, vignette and Neutral tone mapping the web game's picture gets.
// (Its bloom, a soft glow on the brightest parts only, is not ported yet.) Built-in render pipeline image effect; if the
// shader is missing it passes the picture through.
using UnityEngine;

namespace CornerCutters.Game
{
    [RequireComponent(typeof(Camera))]
    public sealed class TiltShiftEffect : MonoBehaviour
    {
        /// <summary>the web game's HD2D_VIEW blur</summary>
        public float Amount = 1.2f;
        Material mat;

        void OnEnable()
        {
            var shader = Resources.Load<Shader>("Shaders/TiltShift");
            if (shader != null && shader.isSupported) mat = new Material(shader);
        }

        void OnRenderImage(RenderTexture src, RenderTexture dst)
        {
            if (mat == null) { Graphics.Blit(src, dst); return; }
            int w = Mathf.Max(1, src.width / 2), h = Mathf.Max(1, src.height / 2);
            var a = RenderTexture.GetTemporary(w, h, 0, src.format);
            var b = RenderTexture.GetTemporary(w, h, 0, src.format);
            a.filterMode = b.filterMode = FilterMode.Bilinear;
            // (the step is measured against the full screen's size, as the web game's is)
            mat.SetVector("_Res", new Vector4(src.width, src.height, 0, 0));
            mat.SetFloat("_Amount", Amount);
            mat.SetVector("_Dir", new Vector4(1, 0, 0, 0));
            Graphics.Blit(src, a, mat, 0);
            mat.SetVector("_Dir", new Vector4(0, 1, 0, 0));
            Graphics.Blit(a, b, mat, 0);
            mat.SetVector("_Dir", new Vector4(1, 0, 0, 0));
            Graphics.Blit(b, a, mat, 0);
            mat.SetTexture("_Sharp", src);
            Graphics.Blit(a, dst, mat, 1);
            RenderTexture.ReleaseTemporary(a);
            RenderTexture.ReleaseTemporary(b);
        }
    }
}
