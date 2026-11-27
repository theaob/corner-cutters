// A little JSON, for what the game sends to the backend and reads back (Unity's JsonUtility can't write a row of
// mixed values, or read one it has no class for). Written as the web game's JSON.stringify writes it (keys in the
// order given, numbers as JavaScript prints them), and read into plain values: Dictionary<string, object>,
// List<object>, string, double, bool and null.
using System;
using System.Collections;
using System.Collections.Generic;
using System.Globalization;
using System.Text;

namespace CornerCutters.Core
{
    /// <summary>A JSON object to write, its keys in the order they're added.</summary>
    public sealed class JsonObj : IEnumerable<KeyValuePair<string, object>>
    {
        readonly List<KeyValuePair<string, object>> items = new List<KeyValuePair<string, object>>();

        /// <summary>Set `key` (in its place, if it's there already; at the end if not).</summary>
        public object this[string key]
        {
            get { foreach (var kv in items) if (kv.Key == key) return kv.Value; return null; }
            set
            {
                for (int i = 0; i < items.Count; i++)
                    if (items[i].Key == key) { items[i] = new KeyValuePair<string, object>(key, value); return; }
                items.Add(new KeyValuePair<string, object>(key, value));
            }
        }

        public void Add(string key, object value) => this[key] = value;
        public bool Has(string key) { foreach (var kv in items) if (kv.Key == key) return true; return false; }
        public int Count => items.Count;
        public IEnumerator<KeyValuePair<string, object>> GetEnumerator() => items.GetEnumerator();
        IEnumerator IEnumerable.GetEnumerator() => items.GetEnumerator();
    }

    public static class Json
    {
        static readonly CultureInfo Inv = CultureInfo.InvariantCulture;

        public static string Write(object v)
        {
            var sb = new StringBuilder();
            Write(sb, v);
            return sb.ToString();
        }

        static void Write(StringBuilder sb, object v)
        {
            switch (v)
            {
                case null: sb.Append("null"); break;
                case bool b: sb.Append(b ? "true" : "false"); break;
                case string s: Str(sb, s); break;
                case double d: sb.Append(Number(d)); break;
                case float f: sb.Append(Number(f)); break;
                case int i: sb.Append(i.ToString(Inv)); break;
                case long l: sb.Append(Number(l)); break;
                case IEnumerable<KeyValuePair<string, object>> obj:
                    {
                        sb.Append('{');
                        bool first = true;
                        foreach (var kv in obj)
                        {
                            if (!first) sb.Append(',');
                            first = false;
                            Str(sb, kv.Key);
                            sb.Append(':');
                            Write(sb, kv.Value);
                        }
                        sb.Append('}');
                        break;
                    }
                case IEnumerable list:
                    {
                        sb.Append('[');
                        bool first = true;
                        foreach (var x in list)
                        {
                            if (!first) sb.Append(',');
                            first = false;
                            Write(sb, x);
                        }
                        sb.Append(']');
                        break;
                    }
                default: Str(sb, v.ToString()); break;
            }
        }

        /// <summary>A string as JSON.stringify writes it (well-formed: a lone surrogate as \uXXXX).</summary>
        static void Str(StringBuilder sb, string s)
        {
            sb.Append('"');
            for (int i = 0; i < s.Length; i++)
            {
                char c = s[i];
                switch (c)
                {
                    case '"': sb.Append("\\\""); break;
                    case '\\': sb.Append("\\\\"); break;
                    case '\b': sb.Append("\\b"); break;
                    case '\f': sb.Append("\\f"); break;
                    case '\n': sb.Append("\\n"); break;
                    case '\r': sb.Append("\\r"); break;
                    case '\t': sb.Append("\\t"); break;
                    default:
                        if (c < 0x20) sb.Append("\\u").Append(((int)c).ToString("x4"));
                        else if (char.IsHighSurrogate(c) && i + 1 < s.Length && char.IsLowSurrogate(s[i + 1])) { sb.Append(c).Append(s[i + 1]); i++; }
                        else if (char.IsSurrogate(c)) sb.Append("\\u").Append(((int)c).ToString("x4"));
                        else sb.Append(c);
                        break;
                }
            }
            sb.Append('"');
        }

        /// <summary>A number as JavaScript prints it (the shortest digits that read back the same; NaN and ±∞ as null).</summary>
        public static string Number(double d)
        {
            if (double.IsNaN(d) || double.IsInfinity(d)) return "null";
            if (d == 0) return "0";
            // the shortest round-trip digits and their exponent, laid out by JavaScript's Number::toString
            string r = Math.Abs(d).ToString("E16", Inv);
            string shortest = Math.Abs(d).ToString("R", Inv);
            if (double.Parse(shortest, Inv) == Math.Abs(d)) r = ToE(shortest);
            int e = r.IndexOf('E');
            string digits = r.Substring(0, e).Replace(".", "").TrimEnd('0');
            int exp = int.Parse(r.Substring(e + 1), Inv);
            if (digits.Length == 0) digits = "0";
            int k = digits.Length, n = exp + 1;
            string body;
            if (k <= n && n <= 21) body = digits + new string('0', n - k);
            else if (0 < n && n <= 21) body = digits.Substring(0, n) + "." + digits.Substring(n);
            else if (-6 < n && n <= 0) body = "0." + new string('0', -n) + digits;
            else body = digits.Substring(0, 1) + (k > 1 ? "." + digits.Substring(1) : "") + "e" + (n - 1 >= 0 ? "+" : "-") + Math.Abs(n - 1).ToString(Inv);
            return (d < 0 ? "-" : "") + body;
        }

        /// <summary>"123.45" or "1.2345E+20" as d.dddE±x.</summary>
        static string ToE(string s)
        {
            int e = s.IndexOfAny(new[] { 'E', 'e' });
            string mant = e < 0 ? s : s.Substring(0, e);
            int exp = e < 0 ? 0 : int.Parse(s.Substring(e + 1), Inv);
            int dot = mant.IndexOf('.');
            string intPart = dot < 0 ? mant : mant.Substring(0, dot), frac = dot < 0 ? "" : mant.Substring(dot + 1);
            string all = (intPart + frac).TrimStart('0');
            int lead = (intPart + frac).Length - all.Length;
            // the first digit's power of ten
            int p = intPart.Length - 1 - lead + exp;
            if (all.Length == 0) return "0E0";
            return all.Substring(0, 1) + "." + all.Substring(1) + "E" + p.ToString(Inv);
        }

        // ---- reading ----

        /// <summary>Read `text` (null if it isn't JSON).</summary>
        public static object Parse(string text)
        {
            if (text == null) return null;
            try
            {
                int i = 0;
                var v = Value(text, ref i);
                Ws(text, ref i);
                return i == text.Length ? v : null;
            }
            catch (FormatException) { return null; }
            catch (ArgumentOutOfRangeException) { return null; }
            catch (IndexOutOfRangeException) { return null; }
        }

        static void Ws(string s, ref int i) { while (i < s.Length && (s[i] == ' ' || s[i] == '\t' || s[i] == '\n' || s[i] == '\r')) i++; }

        static object Value(string s, ref int i)
        {
            Ws(s, ref i);
            char c = s[i];
            if (c == '{')
            {
                var d = new Dictionary<string, object>();
                i++;
                Ws(s, ref i);
                if (s[i] == '}') { i++; return d; }
                while (true)
                {
                    Ws(s, ref i);
                    if (s[i] != '"') throw new FormatException();
                    string key = ReadStr(s, ref i);
                    Ws(s, ref i);
                    if (s[i++] != ':') throw new FormatException();
                    d[key] = Value(s, ref i);
                    Ws(s, ref i);
                    if (s[i] == ',') { i++; continue; }
                    if (s[i++] == '}') return d;
                    throw new FormatException();
                }
            }
            if (c == '[')
            {
                var l = new List<object>();
                i++;
                Ws(s, ref i);
                if (s[i] == ']') { i++; return l; }
                while (true)
                {
                    l.Add(Value(s, ref i));
                    Ws(s, ref i);
                    if (s[i] == ',') { i++; continue; }
                    if (s[i++] == ']') return l;
                    throw new FormatException();
                }
            }
            if (c == '"') return ReadStr(s, ref i);
            if (Word(s, ref i, "true")) return true;
            if (Word(s, ref i, "false")) return false;
            if (Word(s, ref i, "null")) return null;
            int start = i;
            while (i < s.Length && "+-0123456789.eE".IndexOf(s[i]) >= 0) i++;
            if (i == start) throw new FormatException();
            return double.Parse(s.Substring(start, i - start), NumberStyles.Float, Inv);
        }

        static bool Word(string s, ref int i, string w)
        {
            if (string.CompareOrdinal(s, i, w, 0, w.Length) != 0) return false;
            i += w.Length;
            return true;
        }

        static string ReadStr(string s, ref int i)
        {
            var sb = new StringBuilder();
            i++;
            while (true)
            {
                char c = s[i++];
                if (c == '"') return sb.ToString();
                if (c != '\\') { sb.Append(c); continue; }
                char e = s[i++];
                switch (e)
                {
                    case 'b': sb.Append('\b'); break;
                    case 'f': sb.Append('\f'); break;
                    case 'n': sb.Append('\n'); break;
                    case 'r': sb.Append('\r'); break;
                    case 't': sb.Append('\t'); break;
                    case 'u': sb.Append((char)int.Parse(s.Substring(i, 4), NumberStyles.HexNumber, Inv)); i += 4; break;
                    default: sb.Append(e); break;
                }
            }
        }
    }
}
