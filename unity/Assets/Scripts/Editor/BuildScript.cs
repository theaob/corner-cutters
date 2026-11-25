// Menu items and a command-line entry point.
//   Corner Cutters > Create main scene : saves Assets/Scenes/Main.unity (empty: the game starts itself, see GameBootstrap)
//                                        and puts it in the build settings.
//   Command line, desktop builds:
//     Unity -batchmode -quit -projectPath unity -executeMethod CornerCutters.Editor.BuildScript.BuildWindows64
//     Unity -batchmode -quit -projectPath unity -executeMethod CornerCutters.Editor.BuildScript.BuildMacOS
//     Unity -batchmode -quit -projectPath unity -executeMethod CornerCutters.Editor.BuildScript.BuildLinux64
using System.IO;
using UnityEditor;
using UnityEditor.SceneManagement;
using UnityEngine.SceneManagement;

namespace CornerCutters.Editor
{
    public static class BuildScript
    {
        const string ScenePath = "Assets/Scenes/Main.unity";

        [MenuItem("Corner Cutters/Create main scene")]
        public static void EnsureScene()
        {
            if (!File.Exists(ScenePath))
            {
                Directory.CreateDirectory("Assets/Scenes");
                var scene = EditorSceneManager.NewScene(NewSceneSetup.EmptyScene, NewSceneMode.Single);
                EditorSceneManager.SaveScene(scene, ScenePath);
            }
            EditorBuildSettings.scenes = new[] { new EditorBuildSettingsScene(ScenePath, true) };
        }

        static void Build(BuildTarget target, string output)
        {
            EnsureScene();
            PlayerSettings.productName = "Corner Cutters";
            PlayerSettings.companyName = "Corner Cutters";
            var report = BuildPipeline.BuildPlayer(new BuildPlayerOptions
            {
                scenes = new[] { ScenePath },
                locationPathName = output,
                target = target,
                options = BuildOptions.None,
            });
            if (report.summary.result != UnityEditor.Build.Reporting.BuildResult.Succeeded)
                throw new System.Exception("Build failed: " + report.summary.result);
        }

        public static void BuildWindows64() => Build(BuildTarget.StandaloneWindows64, "Builds/Windows/CornerCutters.exe");
        public static void BuildMacOS() => Build(BuildTarget.StandaloneOSX, "Builds/macOS/CornerCutters.app");
        public static void BuildLinux64() => Build(BuildTarget.StandaloneLinux64, "Builds/Linux/CornerCutters.x86_64");
    }
}
