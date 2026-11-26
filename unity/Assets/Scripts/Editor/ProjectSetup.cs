// One-time project settings the look depends on, applied when the editor loads the project.
// Gamma colour space: the web game's colours were chosen in the browser's gamma space, and the shaders here are unlit and
// simple (the atlas times vertex colour), so gamma space reproduces them exactly; linear would wash them out.
using UnityEditor;
using UnityEngine;

namespace CornerCutters.Editor
{
    [InitializeOnLoad]
    public static class ProjectSetup
    {
        static ProjectSetup()
        {
            if (PlayerSettings.colorSpace != ColorSpace.Gamma) PlayerSettings.colorSpace = ColorSpace.Gamma;
        }
    }
}
