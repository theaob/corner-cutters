// The Switch's save data (only in a Switch build, which needs Nintendo's Unity support and SDK: never in this repo).
// The save's keys are files on the save data's mount, as on a computer (FileStore), and a write is made to last by
// committing the mount: at most once a few seconds while playing, and at once as the game's put away (Commit), which
// is what the console's guidelines ask (no commit storms, nothing lost on the HOME button).
//
// TO DO with the SDK to hand (README "Platforms", Switch): the three marked calls below are the SDK's (mount the
// user's save data at the game's start, commit it), named as in Nintendo's Unity documentation; they're left as
// comments because that API is under NDA and can't be checked here.
#if UNITY_SWITCH && !UNITY_EDITOR
using UnityEngine;

namespace CornerCutters.Game
{
    public sealed class SwitchSave : FileStore
    {
        public const string Mount = "save";
        const float CommitEvery = 5;
        static bool mounted;
        bool unsaved;
        float lastCommit;

        static SwitchSave on;

        public SwitchSave() : base(Mount + ":/") { MountOnce(); on = this; }

        /// <summary>A frame: what's been written and not yet committed, committed once it's due.</summary>
        public static void Tick()
        {
            if (on != null && on.unsaved && Time.unscaledTime - on.lastCommit >= CommitEvery) on.Commit();
        }

        static void MountOnce()
        {
            if (mounted) return;
            mounted = true;
            // SDK: nn.account.Account.Initialize(); open the preselected user (nn.account.Account.TryOpenPreselectedUser)
            // SDK: nn.fs.SaveData.Mount(Mount, that user's id)
            Debug.Log("switch: save data mounted as " + Mount);
        }

        protected override void Wrote()
        {
            unsaved = true;
            if (Time.unscaledTime - lastCommit >= CommitEvery) Commit();
        }

        public override void Commit()
        {
            if (!unsaved) return;
            unsaved = false;
            lastCommit = Time.unscaledTime;
            // SDK: nn.fs.FileSystem.Commit(Mount)
        }
    }
}
#endif
