// The save on this device (src/engine/save.ts): the one document (Core/SaveDoc) in PlayerPrefs under "cc:save", the
// web game's key, read once and written at the end of the frame something changed in (and at once when the game's
// put away), so a lap's records, its ghost and a kept race are one write. The ghosts (about 18 KB each) live under
// keys of their own, "cc:ghosts.<name>", the document holding a marker for each, as the web game's do. A save from a
// newer game is read, never written over; one that isn't JSON is set aside under "cc:save.bad" and the game starts
// afresh. EXPORT and IMPORT in the settings move a save to and from another device (the web game, the Android app,
// another computer) as the document's JSON; and a save the Android app leaves in its files ("cc-save.json", in the
// app's own storage, which Unity's persistentDataPath is) is taken in at the first start, so its players keep what
// they've won.
using System.Collections.Generic;
using System.IO;
using CornerCutters.Core;
using UnityEngine;

namespace CornerCutters.Game
{
    public static class Save
    {
        const string Key = "cc:save", BadKey = "cc:save.bad", BakKey = "cc:save.bak", HandedKey = "cc:save.handed";
        /// <summary>the file a save is handed over in (the Android app's own files: Unity's persistentDataPath on Android)</summary>
        public const string HandOver = "cc-save.json";
        const double Mark = 1;

        static SaveDoc doc;
        static bool readOnly, dirty;

        static string SplitKey(string section, string name) => $"cc:{section}.{name}";

        static SaveDoc Doc
        {
            get
            {
                if (doc != null) return doc;
                string text = PlayerPrefs.GetString(Key, "");
                if (string.IsNullOrEmpty(text)) doc = new SaveDoc();
                else
                {
                    var d = SaveDoc.Parse(text);
                    if (d == null)
                    {
                        // (damaged: set aside, and a fresh start)
                        PlayerPrefs.SetString(BadKey, text);
                        d = new SaveDoc();
                        dirty = true;
                    }
                    readOnly = d.At > SaveDoc.Version;
                    if (!readOnly && d.At < SaveDoc.Version) { d.Migrated(); dirty = true; }
                    doc = d;
                }
                TakeHandOver();
                return doc;
            }
        }

        /// <summary>A value (parsed JSON: string, double, bool, list, dictionary), or null.</summary>
        public static object Get(string section, string name)
        {
            var v = Doc.Get(section, name);
            if (SaveDoc.IsSplit(section) && v != null)
            {
                string kept = PlayerPrefs.GetString(SplitKey(section, name), "");
                if (string.IsNullOrEmpty(kept)) return null;
                try { return Json.Parse(kept); } catch { return null; }
            }
            return v;
        }

        public static void Set(string section, string name, object value)
        {
            if (readOnly) return;
            if (SaveDoc.IsSplit(section))
            {
                // (kept under its own key; the document holds its marker)
                if (value == null) PlayerPrefs.DeleteKey(SplitKey(section, name));
                else PlayerPrefs.SetString(SplitKey(section, name), Json.Write(value));
                Doc.Set(section, name, value == null ? null : (object)Mark);
            }
            else Doc.Set(section, name, Plain(value));
            dirty = true;
        }

        /// <summary>A value written as the document holds it (numbers as doubles, a JsonObj a dictionary: as parsed JSON reads back).</summary>
        static object Plain(object v) => v switch
        {
            int i => (double)i,
            long l => (double)l,
            float f => (double)f,
            string _ => v,
            JsonObj _ or System.Collections.IEnumerable _ => Json.Parse(Json.Write(v)),
            _ => v,
        };

        public static string String(string section, string name, string fallback = null) => Get(section, name) as string ?? fallback;
        public static double Number(string section, string name, double fallback) => Get(section, name) is double d ? d : fallback;
        public static bool Bool(string section, string name, bool fallback) => Get(section, name) is bool b ? b : fallback;
        public static bool Has(string section, string name) => Get(section, name) != null;

        /// <summary>A value as JSON text ("" if none), for the parsers that read their kept value as text.</summary>
        public static string Text(string section, string name) { var v = Get(section, name); return v == null ? "" : Json.Write(v); }
        /// <summary>Set a value from its JSON text (null or empty: gone).</summary>
        public static void SetText(string section, string name, string json)
        {
            object v = null;
            if (!string.IsNullOrEmpty(json)) { try { v = Json.Parse(json); } catch { return; } }
            Set(section, name, v);
        }

        /// <summary>A whole section as a JSON object's text ("" if none), and set from one (each of its names; the rest gone).</summary>
        public static string SectionText(string section) => Doc.Data.TryGetValue(section, out var s) ? Json.Write(s) : "";
        public static void SetSectionText(string section, string json)
        {
            if (readOnly) return;
            object v = null;
            try { v = string.IsNullOrEmpty(json) ? null : Json.Parse(json); } catch { return; }
            Doc.Data.Remove(section);
            if (v is Dictionary<string, object> o) foreach (var kv in o) if (kv.Value != null) Doc.Set(section, kv.Key, kv.Value);
            dirty = true;
        }

        /// <summary>Write the document if anything changed (the end of a frame; at once when the game's put away).</summary>
        public static void Flush(bool toDisk = false)
        {
            if (dirty && doc != null && !readOnly)
            {
                PlayerPrefs.SetString(Key, doc.Write());
                dirty = false;
            }
            if (toDisk) PlayerPrefs.Save();
        }

        // ---- moving a save between devices ----

        /// <summary>The whole save as the JSON to move to another device: the device's own sections left out, the ghosts put back whole.</summary>
        public static string Export()
        {
            var d = Doc.ForExport();
            foreach (var section in SaveDoc.SplitSections)
                if (d.Data.TryGetValue(section, out var s))
                    foreach (var name in new List<string>(s.Keys)) { var v = Get(section, name); if (v != null) s[name] = v; else s.Remove(name); }
            return d.Write();
        }

        /// <summary>A save moved here, read (null: not one, or from a newer game).</summary>
        public static SaveDoc Read(string json)
        {
            var d = SaveDoc.Parse(json?.Trim());
            return d == null || d.At > SaveDoc.Version ? null : d;
        }

        /// <summary>Replace this save with `incoming` (the one before kept aside under cc:save.bak): false if it can't be.</summary>
        public static bool Replace(SaveDoc incoming)
        {
            var d = Doc.Replaced(incoming);
            if (d == null) return false;
            string before = PlayerPrefs.GetString(Key, "");
            if (!string.IsNullOrEmpty(before)) PlayerPrefs.SetString(BakKey, before);
            // (this save's ghosts go; the new ones are moved out to keys of their own)
            foreach (var section in SaveDoc.SplitSections)
                if (doc.Data.TryGetValue(section, out var old)) foreach (var name in old.Keys) PlayerPrefs.DeleteKey(SplitKey(section, name));
            doc = new SaveDoc { At = d.At };
            readOnly = false;
            foreach (var kv in d.Data)
                foreach (var v in kv.Value)
                    if (SaveDoc.IsSplit(kv.Key)) { if (!(v.Value is double)) Set(kv.Key, v.Key, v.Value); }
                    else doc.Set(kv.Key, v.Key, v.Value);
            dirty = true;
            Flush(true);
            Replaced?.Invoke();
            return true;
        }

        /// <summary>told when the save's been replaced (what's read from it at the start is read again)</summary>
        public static event System.Action Replaced;

        /// <summary>A save handed over in the app's files (the Android app's, on the switch to this one): taken in once, if nothing's been played here yet.</summary>
        static void TakeHandOver()
        {
            string path;
            try { path = Path.Combine(Application.persistentDataPath, HandOver); } catch { return; }
            if (PlayerPrefs.GetInt(HandedKey, 0) != 0 || !File.Exists(path)) return;
            PlayerPrefs.SetInt(HandedKey, 1);
            try
            {
                var incoming = Read(File.ReadAllText(path));
                // (only over a save with nothing in it yet: never over progress made here)
                if (incoming != null && doc.Data.Count == 0) Replace(incoming);
            }
            catch (System.Exception e) { Debug.LogWarning($"save hand-over: {e.Message}"); }
        }
    }
}
