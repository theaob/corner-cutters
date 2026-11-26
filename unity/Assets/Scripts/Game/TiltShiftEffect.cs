// The finish pass on the camera (shaders/TiltShift): tilt-shift blur, saturation, contrast, vignette. Built-in render
// pipeline image effect; if the shader is missing it passes the picture through.
using UnityEngine;

namespace CornerCutters.Game
{
    [RequireComponent(typeof(Camera))]
    public sealed class TiltShiftEffect : MonoBehaviour
    {
        Material mat;

        void OnEnable()
        {
            var shader = Resources.Load<Shader>("Shaders/TiltShift");
            if (shader != null && shader.isSupported) mat = new Material(shader);
        }

        void OnRenderImage(RenderTexture src, RenderTexture dst)
        {
            if (mat == null) { Graphics.Blit(src, dst); return; }
            // the blur is in texels: scale it with the picture's height so it looks the same at any resolution (5 at 720p)
            mat.SetFloat("_Blur", 5f * src.height / 720f);
            Graphics.Blit(src, dst, mat);
        }
    }
}
