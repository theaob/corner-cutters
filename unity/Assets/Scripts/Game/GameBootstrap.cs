// Starts the game from code, so the project needs no hand-made scene: whatever scene is open (even an empty one),
// pressing Play or running a build creates the race. Keeps the experiment free of scene/prefab YAML that only the
// editor can write; a proper scene comes when there are menus to lay out.
using UnityEngine;

namespace CornerCutters.Game
{
    public static class GameBootstrap
    {
        [RuntimeInitializeOnLoadMethod(RuntimeInitializeLoadType.AfterSceneLoad)]
        static void Start()
        {
            if (Object.FindFirstObjectByType<RaceController>() != null) return;
            Application.targetFrameRate = -1;   // vsync decides on desktop; a console build sets its own
            new GameObject("Corner Cutters").AddComponent<RaceController>();
        }
    }
}
