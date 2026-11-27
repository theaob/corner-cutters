// Menu items and a command-line entry point.
//   Corner Cutters > Create main scene : saves Assets/Scenes/Main.unity (empty: the game starts itself, see GameBootstrap)
//                                        and puts it in the build settings.
//   Command line (Unity -batchmode -quit -projectPath unity -executeMethod CornerCutters.Editor.BuildScript.<method>):
//     BuildWindows64, BuildMacOS, BuildLinux64   the desktop builds (Steam's), in Builds/<platform>/
//     BuildAndroid                               Builds/Android/CornerCutters.aab, for Google Play
//     BuildIOS                                   an Xcode project in Builds/iOS/, for the App Store
//     BuildSwitch                                Builds/Switch/ (needs Nintendo's Switch support installed in Unity)
// Every build takes its version from the web game's package.json (one version for every platform). The phone builds
// are the Capacitor apps' replacements, so they keep their ids (io.github.theaob.cornercutters) and, on Android, the
// same upload key, read from the same environment as android/app/build.gradle (ANDROID_KEYSTORE_FILE,
// ANDROID_KEYSTORE_PASSWORD, ANDROID_KEY_ALIAS, ANDROID_KEY_PASSWORD, or the same names as -NAME value on the command
// line; a debug key without them), and a
// versionCode above every Capacitor build's: CC_VERSION_CODE if it's set, else 1,000,000 plus GITHUB_RUN_NUMBER.
using System;
using System.IO;
using System.Text.RegularExpressions;
using UnityEditor;
using UnityEditor.Build;
using UnityEditor.SceneManagement;
using UnityEngine.SceneManagement;

namespace CornerCutters.Editor
{
    public static class BuildScript
    {
        const string ScenePath = "Assets/Scenes/Main.unity";
        /// <summary>the phone apps' id (the Capacitor apps' own, so the Unity build installs over them)</summary>
        public const string AppId = "io.github.theaob.cornercutters";
        /// <summary>added to the run number for the Android versionCode: above every Capacitor build's (those are the run number)</summary>
        public const int VersionCodeBase = 1000000;

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

        /// <summary>The game's version: package.json's (the web game's), else the project's.</summary>
        static string Version()
        {
            try
            {
                var m = Regex.Match(File.ReadAllText(Path.Combine("..", "package.json")), "\"version\"\\s*:\\s*\"([^\"]+)\"");
                if (m.Success) return m.Groups[1].Value;
            }
            catch (IOException) { }
            return PlayerSettings.bundleVersion;
        }

        /// <summary>A setting from the environment, else from the command line as "-NAME value" (game-ci passes those in).</summary>
        static string Env(string name)
        {
            var v = Environment.GetEnvironmentVariable(name);
            if (!string.IsNullOrEmpty(v)) return v;
            var args = Environment.GetCommandLineArgs();
            for (int i = 0; i + 1 < args.Length; i++) if (args[i] == "-" + name) return args[i + 1];
            return null;
        }

        static void Build(BuildTarget target, string output)
        {
            EnsureScene();
            PlayerSettings.productName = "Corner Cutters";
            PlayerSettings.companyName = "Corner Cutters";
            PlayerSettings.bundleVersion = Version();
            var report = BuildPipeline.BuildPlayer(new BuildPlayerOptions
            {
                scenes = new[] { ScenePath },
                locationPathName = output,
                target = target,
                options = BuildOptions.None,
            });
            if (report.summary.result != UnityEditor.Build.Reporting.BuildResult.Succeeded)
                throw new Exception("Build failed: " + report.summary.result);
        }

        public static void BuildWindows64() => Build(BuildTarget.StandaloneWindows64, "Builds/Windows/CornerCutters.exe");
        public static void BuildMacOS() => Build(BuildTarget.StandaloneOSX, "Builds/macOS/CornerCutters.app");
        public static void BuildLinux64() => Build(BuildTarget.StandaloneLinux64, "Builds/Linux/CornerCutters.x86_64");

        public static void BuildAndroid()
        {
            var t = NamedBuildTarget.Android;
            PlayerSettings.SetApplicationIdentifier(t, AppId);
            PlayerSettings.SetScriptingBackend(t, ScriptingImplementation.IL2CPP);
            // (64-bit for Google Play, and 32-bit still: the Capacitor app ran on those phones too)
            PlayerSettings.Android.targetArchitectures = AndroidArchitecture.ARM64 | AndroidArchitecture.ARMv7;
            // (the Capacitor app's: android/variables.gradle)
            PlayerSettings.Android.minSdkVersion = AndroidSdkVersions.AndroidApiLevel24;
            PlayerSettings.Android.targetSdkVersion = (AndroidSdkVersions)36;
            int code = int.TryParse(Env("CC_VERSION_CODE"), out int c) ? c : VersionCodeBase + (int.TryParse(Env("GITHUB_RUN_NUMBER"), out int run) ? run : 0);
            PlayerSettings.Android.bundleVersionCode = code;
            string keystore = Env("ANDROID_KEYSTORE_FILE");
            PlayerSettings.Android.useCustomKeystore = !string.IsNullOrEmpty(keystore);
            if (PlayerSettings.Android.useCustomKeystore)
            {
                PlayerSettings.Android.keystoreName = keystore;
                PlayerSettings.Android.keystorePass = Env("ANDROID_KEYSTORE_PASSWORD");
                PlayerSettings.Android.keyaliasName = Env("ANDROID_KEY_ALIAS");
                PlayerSettings.Android.keyaliasPass = Env("ANDROID_KEY_PASSWORD");
            }
            EditorUserBuildSettings.buildAppBundle = true;
            Build(BuildTarget.Android, "Builds/Android/CornerCutters.aab");
            UnityEngine.Debug.Log($"android: versionCode {code}, signed with {(PlayerSettings.Android.useCustomKeystore ? "the upload key" : "a debug key")}");
        }

        public static void BuildIOS()
        {
            PlayerSettings.SetApplicationIdentifier(NamedBuildTarget.iOS, AppId);
            // (as tools/ios-version.mjs stamps the Capacitor app's: IOS_BUILD_NUMBER, else the UTC time as yyMMddHHmm, always higher)
            PlayerSettings.iOS.buildNumber = Env("IOS_BUILD_NUMBER") ?? DateTime.UtcNow.ToString("yyMMddHHmm");
            Build(BuildTarget.iOS, "Builds/iOS");
        }

        public static void BuildSwitch() => Build(BuildTarget.Switch, "Builds/Switch/CornerCutters.nsp");
    }
}
