// Circuits are baked from the web game by `npm run unity:bake` into Assets/Resources/Circuits/<id>.json.
using System.Collections.Generic;
using CornerCutters.Core;
using UnityEngine;

namespace CornerCutters.Game
{
    public static class CircuitLoader
    {
        static List<string> ids;

        /// <summary>All baked circuit ids, in a stable order (the web game's own order, crescent-park first).</summary>
        public static IReadOnlyList<string> Ids()
        {
            if (ids != null) return ids;
            ids = new List<string>();
            foreach (var t in Resources.LoadAll<TextAsset>("Circuits")) if (t.name != "index" && t.name != "order") ids.Add(t.name);
            // (the web game's order: the index lists it)
            var index = Resources.Load<TextAsset>("Circuits/order");
            if (index != null)
            {
                var order = JsonUtility.FromJson<Order>(index.text).ids;
                ids.Sort((a, b) => System.Array.IndexOf(order, a).CompareTo(System.Array.IndexOf(order, b)));
            }
            return ids;
        }

        [System.Serializable] class Order { public string[] ids; }

        public static CircuitData Load(string id)
        {
            var text = Resources.Load<TextAsset>("Circuits/" + id);
            return JsonUtility.FromJson<CircuitData>(text.text);
        }
    }
}
