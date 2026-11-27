// The game's backend, as the web game reaches it (src/engine/backend.ts): the Supabase project's REST API, with its
// public (anon) key. Where the address and key come from (never written into the code):
//  * Resources/Backend.json, { "url": "https://….supabase.co", "key": "…" }: kept out of git (.gitignore), written by
//    a build from the same SUPABASE_URL / SUPABASE_ANON_KEY the web builds use, or by hand for a local try.
//  * else the environment: SUPABASE_URL and SUPABASE_ANON_KEY (or the web build's VITE_ names).
// Without them it's off: every call says so, and the game plays on offline.
using CornerCutters.Core;
using System;
using System.Collections.Generic;
using System.Text;
using UnityEngine;
using UnityEngine.Networking;

namespace CornerCutters.Game
{
    public static class Backend
    {
        static bool configured;
        static string url, key;

        static void Configure()
        {
            if (configured) return;
            configured = true;
            var asset = Resources.Load<TextAsset>("Backend");
            if (asset != null && Json.Parse(asset.text) is Dictionary<string, object> d)
            {
                url = d.TryGetValue("url", out var u) ? u as string : null;
                key = d.TryGetValue("key", out var k) ? k as string : null;
            }
            url = Nonempty(url) ?? Env("SUPABASE_URL") ?? Env("VITE_SUPABASE_URL");
            key = Nonempty(key) ?? Env("SUPABASE_ANON_KEY") ?? Env("VITE_SUPABASE_ANON_KEY");
            url = url?.TrimEnd('/');
        }

        static string Nonempty(string s) => string.IsNullOrWhiteSpace(s) ? null : s.Trim();
        static string Env(string name)
        {
            try { return Nonempty(Environment.GetEnvironmentVariable(name)); }
            catch (Exception) { return null; }
        }

        /// <summary>Whether the build has a backend.</summary>
        public static bool Online
        {
            get
            {
                Configure();
                return url != null && key != null;
            }
        }

        static UnityWebRequest Post(string path, string body)
        {
            var req = new UnityWebRequest(url + path, "POST")
            {
                uploadHandler = new UploadHandlerRaw(Encoding.UTF8.GetBytes(body)),
                downloadHandler = new DownloadHandlerBuffer(),
                timeout = 20,
            };
            req.SetRequestHeader("apikey", key);
            req.SetRequestHeader("Authorization", "Bearer " + key);
            req.SetRequestHeader("Content-Type", "application/json");
            return req;
        }

        /// <summary>Add `rows` to `table` (all with the same keys: the database takes a batch only so); `done` says how it went.</summary>
        public static void Insert(string table, IList<JsonObj> rows, Action<Sent> done)
        {
            if (!Online || rows.Count == 0) { done?.Invoke(Sent.Offline); return; }
            var req = Post("/rest/v1/" + table, Json.Write(rows));
            req.SetRequestHeader("Prefer", "return=minimal");
            req.SendWebRequest().completed += _ =>
            {
                var how = req.result == UnityWebRequest.Result.Success ? Sent.Ok : req.result == UnityWebRequest.Result.ProtocolError ? Sent.Refused : Sent.Offline;
                req.Dispose();
                done?.Invoke(how);
            };
        }

        /// <summary>Call the database function `name` with `args`: `done(true, its result)`, or `done(false, null)` if it didn't go.</summary>
        public static void Rpc(string name, JsonObj args, Action<bool, object> done)
        {
            if (!Online) { done?.Invoke(false, null); return; }
            var req = Post("/rest/v1/rpc/" + name, Json.Write(args));
            req.SendWebRequest().completed += _ =>
            {
                bool ok = req.result == UnityWebRequest.Result.Success;
                string text = ok ? req.downloadHandler.text : null;
                req.Dispose();
                done?.Invoke(ok, string.IsNullOrEmpty(text) ? null : Json.Parse(text));
            };
        }
    }
}
