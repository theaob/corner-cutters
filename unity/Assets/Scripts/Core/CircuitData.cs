// A baked circuit (unity/Assets/Resources/Circuits/<id>.json, written by tools/unity/bake.ts from the web game's own
// buildCircuit). Public fields and plain arrays so Unity's JsonUtility and System.Text.Json (IncludeFields) both read it.
using System;
using System.Collections.Generic;

namespace CornerCutters.Core
{
    [Serializable]
    public class BakedSamples
    {
        public double[] x, y, s, dir, curve, speed;
    }

    [Serializable]
    public class BakedSlot
    {
        public double x, y, heading;
    }

    /// <summary>Trees as parallel arrays: map px, px tall, kind (0 spruce, 1 broadleaf, 2 palm, 3 rock, 4 blossom), crown colour 0xRRGGBB.</summary>
    [Serializable]
    public class BakedTrees
    {
        public double[] x, y, h;
        public int[] kind, color;
    }

    /// <summary>A grandstand: its middle (map px), the track's direction beside it, which side of the track it is on, px long.</summary>
    [Serializable]
    public class BakedStand
    {
        public double x, y, dir, len;
        public int side;
        public bool atStart;
    }

    [Serializable]
    public class CircuitData
    {
        public string id, name, country, about;
        public double scale;
        public double tile;
        public int width, height;
        /// <summary>one char per tile, row by row: T track, K kerb, G grass, V gravel, A apron, W wall, P pit, Q pit wall</summary>
        public string cells;
        public double[] heights;
        public double spacing, length;
        public BakedSamples samples;
        public BakedSlot[] slots;
        public double tyreWear;
        public bool bridge;
        /// <summary>scenery baked so far (empty for circuits not yet given their look pass)</summary>
        public BakedTrees trees;
        public BakedStand[] stands;

        public Grid ToGrid()
        {
            int n = width * height;
            var solid = new bool[n];
            var rough = new bool[n];
            for (int i = 0; i < n; i++)
            {
                char c = cells[i];
                solid[i] = c == 'W' || c == 'Q';
                rough[i] = c == 'G' || c == 'V';
            }
            return new Grid { Width = width, Height = height, Tile = tile, Solid = solid, Rough = rough, Heights = heights };
        }

        public Track ToTrack() => new Track
        {
            X = samples.x, Y = samples.y, S = samples.s, Dir = samples.dir, Curve = samples.curve, Speed = samples.speed,
            Spacing = spacing, Length = length,
        };
    }
}
