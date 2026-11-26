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
            EnableInputSystem();
        }

        /// <summary>
        /// Player Settings > Active Input Handling: the game reads the keyboard and pads through the Input System package,
        /// whose native backends are off in a fresh project (Unity then asks, on load, to turn them on and restart). There's
        /// no public API for it, so it's set on the settings asset; it takes effect on the editor's next start.
        /// (0 = the old Input Manager, 1 = the Input System, 2 = both)
        /// </summary>
        static void EnableInputSystem()
        {
            var assets = AssetDatabase.LoadAllAssetsAtPath("ProjectSettings/ProjectSettings.asset");
            if (assets == null || assets.Length == 0) return;
            var so = new SerializedObject(assets[0]);
            var handler = so.FindProperty("activeInputHandler");
            if (handler == null || handler.intValue != 0) return;
            handler.intValue = 2;
            so.ApplyModifiedPropertiesWithoutUndo();
            AssetDatabase.SaveAssets();
            Debug.Log("Corner Cutters: Active Input Handling set to Both (Input System on). Restart the editor once for it to take effect.");
        }
    }
}
