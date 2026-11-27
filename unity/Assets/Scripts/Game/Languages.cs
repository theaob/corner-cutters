// LANGUAGE (src/engine/i18n.ts): the web game's languages, baked into Resources/Lang (tools/unity/lang.ts), only the
// chosen one's words read. The choice is the save's settings.language; until one's made it follows the device's
// language where the game has it, else English. Japanese is drawn in DotGothic16 (Silkscreen has no Japanese).
using System.Collections.Generic;
using CornerCutters.Core;
using UnityEngine;

namespace CornerCutters.Game
{
    public static class Languages
    {
        static List<(string code, string name)> all;

        /// <summary>the languages the game has, English first: (code, own name)</summary>
        public static List<(string code, string name)> All
        {
            get
            {
                if (all != null) return all;
                all = new List<(string, string)> { ("en", "English") };
                var index = Resources.Load<TextAsset>("Lang/index");
                if (index != null && Json.Parse(index.text) is List<object> list)
                    foreach (var o in list)
                        if (o is Dictionary<string, object> d && d.TryGetValue("code", out var c) && c is string code && code != "en")
                            all.Add((code, d.TryGetValue("name", out var n) && n is string name ? name : code));
                return all;
            }
        }

        /// <summary>The language as saved (or the device's), into use: once as the game starts, and again after a save's moved here.</summary>
        public static void Apply()
        {
            var codes = new List<string>();
            foreach (var l in All) codes.Add(l.code);
            Use(Lang.Pick(Save.String("settings", "language"), new[] { DeviceCode() }, codes));
        }

        /// <summary>LANGUAGE in the settings: remembered.</summary>
        public static void Choose(string code)
        {
            Save.Set("settings", "language", code);
            Use(code);
        }

        static void Use(string code)
        {
            Language l = null;
            if (code != "en")
            {
                var words = Resources.Load<TextAsset>("Lang/" + code);
                if (words != null) l = Language.Parse(words.text);
                if (l == null) Debug.LogWarning($"language {code}: no words baked (npm run unity:lang)");
            }
            Lang.Use(l);
            Changed?.Invoke();
        }

        /// <summary>told when the language changes (the font to draw it in, say)</summary>
        public static event System.Action Changed;

        /// <summary>The device's language as a base code (Unity says it by name).</summary>
        static string DeviceCode() => Application.systemLanguage switch
        {
            SystemLanguage.Spanish => "es",
            SystemLanguage.French => "fr",
            SystemLanguage.German => "de",
            SystemLanguage.Portuguese => "pt",
            SystemLanguage.Italian => "it",
            SystemLanguage.Turkish => "tr",
            SystemLanguage.Japanese => "ja",
            _ => "en",
        };

        /// <summary>the name of the language in use, as its speakers write it</summary>
        public static string NameOf(string code)
        {
            foreach (var l in All) if (l.code == code) return l.name;
            return code;
        }

        /// <summary>The next language along (or back) from the one in use: for LANGUAGE's left and right.</summary>
        public static string Turn(int step)
        {
            var list = All;
            int at = list.FindIndex(l => l.code == Lang.Current.Code);
            if (at < 0) at = 0;
            return list[((at + step) % list.Count + list.Count) % list.Count].code;
        }
    }
}
