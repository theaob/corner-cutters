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
            // (vsync decides on desktop, a phone draws 60 a second, BATTERY SAVER 30; a console build sets its own)
            Picture.ApplyFrameCap();
            new GameObject("Corner Cutters").AddComponent<RaceController>();
        }
    }
}
