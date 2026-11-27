// The game's languages (src/engine/i18n.ts, the dictionaries src/f1/lang/*.ts baked by tools/unity/lang.ts into
// Resources/Lang): the text is written in English, and the English is the key, so a line without a translation reads
// as written. T() is the web game's t(): a line, its {name}s filled in. Say() is what the screen does with any text it
// draws: the line itself if the dictionary has it; else the same line in the web game's own case (the web game writes
// some lines in lower case and capitals them on the screen, as this port writes them in capitals already); else a line
// with numbers or names in it, matched against the dictionary's lines with {name}s (LAP 3/5 against LAP {lap}/{laps}),
// the names in it said too; else each part of a line put together with " · ", said on its own. What's said is kept, so
// a line drawn every frame is looked up once. Capitals are by the language's rules (Turkish: i to İ). Engine-free.
using System;
using System.Collections.Generic;
using System.Globalization;
using System.Linq;
using System.Text;
using System.Text.RegularExpressions;

namespace CornerCutters.Core
{
    public sealed class Language
    {
        /// <summary>the BCP 47 base code ("tr"), and its own name as its speakers write it (the LANGUAGE row)</summary>
        public string Code, Name;
        /// <summary>English text to its translation</summary>
        public Dictionary<string, string> Words = new Dictionary<string, string>();

        /// <summary>A baked dictionary ({code, name, words}): null if it isn't one.</summary>
        public static Language Parse(string json)
        {
            if (!(Json.Parse(json) is Dictionary<string, object> o) || !(o.TryGetValue("code", out var c) && c is string code)) return null;
            var l = new Language { Code = code, Name = o.TryGetValue("name", out var n) && n is string name ? name : code };
            if (o.TryGetValue("words", out var w) && w is Dictionary<string, object> words)
                foreach (var kv in words) if (kv.Value is string s) l.Words[kv.Key] = s;
            return l;
        }
    }

    public static class Lang
    {
        public static readonly Language English = new Language { Code = "en", Name = "English" };

        /// <summary>the language in use</summary>
        public static Language Current { get; private set; } = English;

        /// <summary>a line with {name}s in it, as a pattern to match a line drawn against</summary>
        sealed class Pattern
        {
            public string Key;
            public Regex Exact, Caps;
            public string[] Vars;
            /// <summary>how much of it is words, not {name}s: the more, the surer a match</summary>
            public int Weight;
        }

        static Dictionary<string, string> caps = new Dictionary<string, string>();
        static List<Pattern> patterns = new List<Pattern>();
        static readonly Dictionary<string, string> said = new Dictionary<string, string>();
        static CultureInfo culture = CultureInfo.InvariantCulture;

        /// <summary>the {name}s that are numbers (counts, places, laps, hours), and those that are times</summary>
        static readonly HashSet<string> Numbers = new HashSet<string> { "n", "hour", "place", "total", "lap", "laps", "h", "m", "field", "strike", "off", "day" };
        static readonly HashSet<string> Times = new HashSet<string> { "time" };

        /// <summary>Use `l` from now on (null: English).</summary>
        public static void Use(Language l)
        {
            Current = l ?? English;
            try { culture = Current.Code == "en" ? CultureInfo.InvariantCulture : CultureInfo.GetCultureInfo(Current.Code); }
            catch (CultureNotFoundException) { culture = CultureInfo.InvariantCulture; }
            caps = new Dictionary<string, string>();
            patterns = new List<Pattern>();
            said.Clear();
            foreach (var kv in Current.Words)
            {
                string up = kv.Key.ToUpperInvariant();
                if (up != kv.Key && !Current.Words.ContainsKey(up) && !caps.ContainsKey(up)) caps[up] = kv.Value;
                if (kv.Key.IndexOf('{') >= 0) patterns.Add(PatternOf(kv.Key));
            }
            patterns.Sort((a, b) => b.Weight.CompareTo(a.Weight));
        }

        static Pattern PatternOf(string key)
        {
            var vars = new List<string>();
            var sb = new StringBuilder("^");
            int i = 0, weight = 0;
            foreach (Match m in Regex.Matches(key, @"\{(\w+)\}"))
            {
                string lit = key.Substring(i, m.Index - i);
                sb.Append(Regex.Escape(lit));
                weight += lit.Trim().Length;
                string v = m.Groups[1].Value;
                vars.Add(v);
                sb.Append(Numbers.Contains(v) ? @"(\d+(?:\.\d+)?)" : Times.Contains(v) ? @"([0-9:.+\-–]+)" : @"((?:(?! · ).)+?)");
                i = m.Index + m.Length;
            }
            string tail = key.Substring(i);
            sb.Append(Regex.Escape(tail)).Append('$');
            weight += tail.Trim().Length;
            string exact = sb.ToString();
            return new Pattern
            {
                Key = key, Vars = vars.ToArray(), Weight = weight,
                Exact = new Regex(exact, RegexOptions.CultureInvariant),
                // (the same line in capitals, as this port writes the web game's lower-case lines)
                Caps = new Regex(Regex.Replace(exact, @"(?<!\\)\p{Ll}", m => m.Value.ToUpperInvariant()), RegexOptions.CultureInvariant),
            };
        }

        /// <summary>The web game's t(): `english` in the language in use, its {name}s filled from `vars` (name, value, name, value…).</summary>
        public static string T(string english, params object[] vars)
        {
            string text = english != null && Current.Words.TryGetValue(english, out var w) ? w : english;
            return vars.Length == 0 ? text : Fill(text, vars);
        }

        static string Fill(string text, object[] vars) => Regex.Replace(text, @"\{(\w+)\}", m =>
        {
            for (int i = 0; i + 1 < vars.Length; i += 2)
                if (vars[i] as string == m.Groups[1].Value) return Convert.ToString(vars[i + 1], CultureInfo.InvariantCulture);
            return m.Value;
        });

        /// <summary>Capitals by the language's rules (Turkish: i to İ, ı to I).</summary>
        public static string Upper(string s) => s == null ? null : culture.TextInfo.ToUpper(s);
        /// <summary>Lower case by the language's rules (i18n.ts lower()).</summary>
        public static string Lower(string s) => s == null ? null : culture.TextInfo.ToLower(s);

        /// <summary>a line in capitals (no lower-case letters in it)</summary>
        static bool InCaps(string s)
        {
            foreach (char c in s) if (char.IsLower(c)) return false;
            return true;
        }

        /// <summary>Any text the screen draws, in the language in use (see the top): as it is if it isn't the dictionary's.</summary>
        public static string Say(string text)
        {
            if (string.IsNullOrEmpty(text) || Current.Words.Count == 0) return text;
            if (said.TryGetValue(text, out var done)) return done;
            string r = Line(text, true) ?? Parts(text) ?? text;
            if (said.Count > 4096) said.Clear();
            said[text] = r;
            return r;
        }

        /// <summary>A whole line (and, `patterned`, one with numbers or names in it): null if the dictionary hasn't it.</summary>
        static string Line(string text, bool patterned)
        {
            if (Current.Words.TryGetValue(text, out var w)) return w;
            bool inCaps = InCaps(text);
            if (inCaps && caps.TryGetValue(text, out var c)) return Upper(c);
            if (!patterned || !HasLetters(text)) return null;
            foreach (var p in patterns)
            {
                var m = p.Exact.Match(text);
                bool up = false;
                if (!m.Success && inCaps) { m = p.Caps.Match(text); up = m.Success; }
                if (!m.Success) continue;
                var vars = new object[p.Vars.Length * 2];
                for (int i = 0; i < p.Vars.Length; i++)
                {
                    string v = m.Groups[i + 1].Value;
                    vars[i * 2] = p.Vars[i];
                    // (a name in it said too: a circuit's, a weather's)
                    vars[i * 2 + 1] = Numbers.Contains(p.Vars[i]) || Times.Contains(p.Vars[i]) ? v : Line(v, true) ?? Parts(v) ?? v;
                }
                string t = Fill(Current.Words[p.Key], vars);
                return up ? Upper(t) : t;
            }
            return null;
        }

        static bool HasLetters(string s)
        {
            foreach (char c in s) if (char.IsLetter(c)) return true;
            return false;
        }

        static readonly string[] Joins = { " · ", "\n" };

        /// <summary>A line put together from parts (" · ", or lines): each said on its own; null if none of them is the dictionary's.</summary>
        static string Parts(string text)
        {
            foreach (var j in Joins)
            {
                if (text.IndexOf(j, StringComparison.Ordinal) < 0) continue;
                var parts = text.Split(new[] { j }, StringSplitOptions.None);
                bool any = false;
                for (int i = 0; i < parts.Length; i++)
                {
                    var s = Line(parts[i], true) ?? Parts(parts[i]);
                    if (s != null) { parts[i] = s; any = true; }
                }
                return any ? string.Join(j, parts) : null;
            }
            return null;
        }

        /// <summary>The language for a device's: the saved choice if the game has it, else the device's if it has it, else English.</summary>
        public static string Pick(string saved, IEnumerable<string> device, IEnumerable<string> have)
        {
            var codes = have.ToList();
            if (saved != null && codes.Contains(saved)) return saved;
            foreach (var d in device)
            {
                string b = d?.ToLowerInvariant().Split('-', '_')[0];
                if (b != null && codes.Contains(b)) return b;
            }
            return "en";
        }
    }
}
