// Where the save's text is kept (Save.cs writes through one of these): text under keys ("cc:save", "cc:ghosts.<name>").
// On a computer, files in the game's own folder (Application.persistentDataPath/save), one a key, each written whole
// to a file beside it and then moved over the old one, so a crash mid-write never leaves half a save; and that's the
// folder Steam Cloud keeps in step across computers (Steam Auto-Cloud, set in Steamworks: README "Steam"). On a phone,
// PlayerPrefs (the app's own preferences, kept over an update). On the Switch, the console's save data (SwitchSave.cs).
using System.Collections.Generic;
using System.IO;
using System.Text;
using UnityEngine;

namespace CornerCutters.Game
{
    public interface ISaveStore
    {
        /// <summary>the text kept under `key`, or null</summary>
        string Get(string key);
        void Set(string key, string text);
        void Delete(string key);
        /// <summary>everything set so far made to last (the game put away: PlayerPrefs to disk, the Switch's save data committed)</summary>
        void Commit();
    }

    public sealed class PrefsStore : ISaveStore
    {
        public string Get(string key) => PlayerPrefs.HasKey(key) ? PlayerPrefs.GetString(key, "") : null;
        public void Set(string key, string text) => PlayerPrefs.SetString(key, text);
        public void Delete(string key) => PlayerPrefs.DeleteKey(key);
        public void Commit() => PlayerPrefs.Save();
    }

    /// <summary>A file a key in `folder`, read once and kept; written as it's set.</summary>
    public class FileStore : ISaveStore
    {
        readonly string folder;
        readonly Dictionary<string, string> kept = new Dictionary<string, string>();

        public FileStore(string folder) { this.folder = folder; }

        /// <summary>The file for `key`: what a file name can't hold made "_" ("cc:save" is cc_save.json).</summary>
        public static string FileOf(string key)
        {
            var sb = new StringBuilder();
            foreach (char c in key) sb.Append(char.IsLetterOrDigit(c) || c == '-' || c == '.' ? c : '_');
            return sb.Append(".json").ToString();
        }

        string PathOf(string key) => Path.Combine(folder, FileOf(key));

        public string Get(string key)
        {
            if (kept.TryGetValue(key, out var t)) return t;
            string text = null;
            try { var p = PathOf(key); if (File.Exists(p)) text = File.ReadAllText(p, Encoding.UTF8); }
            catch (System.Exception e) { Debug.LogWarning($"save: {key} not read ({e.Message})"); }
            kept[key] = text;
            return text;
        }

        public void Set(string key, string text)
        {
            if (Get(key) == text) return;
            kept[key] = text;
            try
            {
                Directory.CreateDirectory(folder);
                string p = PathOf(key), fresh = p + ".new";
                File.WriteAllText(fresh, text, Encoding.UTF8);
                if (File.Exists(p)) File.Replace(fresh, p, null);
                else File.Move(fresh, p);
                Wrote();
            }
            catch (System.Exception e) { Debug.LogWarning($"save: {key} not written ({e.Message})"); }
        }

        public void Delete(string key)
        {
            kept[key] = null;
            try { var p = PathOf(key); if (File.Exists(p)) { File.Delete(p); Wrote(); } }
            catch (System.Exception e) { Debug.LogWarning($"save: {key} not deleted ({e.Message})"); }
        }

        /// <summary>(a file written or deleted: the Switch's save data notes it has something to commit)</summary>
        protected virtual void Wrote() { }

        public virtual void Commit() { }
    }
}
