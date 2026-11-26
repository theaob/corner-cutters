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
        /// <summary>its crowd, as the web game's crowd3d places it</summary>
        public BakedCrowd crowd;
    }

    /// <summary>Spectators in a stand's own space (px): x toward its back (the track is at -x), z along it, the floor they stand on, and each one's own phase.</summary>
    [Serializable]
    public class BakedCrowd
    {
        public double[] x, z, floor, phase;
    }

    /// <summary>The barriers as the web game stands them, as tile indices (j * width + i).</summary>
    [Serializable]
    public class BakedBarriers
    {
        /// <summary>tyre walls (or a street circuit's steel, or hay bales on dirt): wall tiles that meet the run-off, but not behind the garages</summary>
        public int[] walls;
        /// <summary>beside a banking: a concrete wall with a catch fence</summary>
        public int[] bank;
        /// <summary>the Wall of Champions: green and white concrete</summary>
        public int[] champions;
    }

    [Serializable]
    public class BakedGarage
    {
        public double x, y, dir;
    }

    [Serializable]
    public class BakedRoof
    {
        /// <summary>a garage's middle (map px), and the way its share of the word reads along it</summary>
        public double x, y, tx, tz;
    }

    [Serializable]
    public class BakedPoints
    {
        public double[] x, y, dir;
    }

    /// <summary>The pit buildings, placed as the web game's circuitScene places them.</summary>
    [Serializable]
    public class BakedPits
    {
        /// <summary>-1: the lane is on the left of the way of the race; +1: on the right</summary>
        public int side;
        /// <summary>the lane's line, entry to exit</summary>
        public BakedPoints lane;
        public double boxSpacing;
        /// <summary>one garage behind each box: its middle and the lane's direction there</summary>
        public BakedGarage[] garages;
        /// <summary>the pit wall's run: a block between each two points, wallThick px thick, wallAcross px across from them</summary>
        public BakedPoints wall;
        public double wallThick, wallAcross;
        /// <summary>a word across the roofs (Resources/Grounds/&lt;id&gt;-roof.png), and the roofs in reading order</summary>
        public string roof;
        public BakedRoof[] roofs;
    }

    [Serializable]
    public class BakedLanePoints
    {
        public double[] x, y, s, dir, off;
        public int[] idx;
    }

    [Serializable]
    public class BakedPodiumSpot
    {
        public int idx;
        public double lane;
    }

    /// <summary>The pit lane as race control drives it (pits.ts's buildPitLane).</summary>
    [Serializable]
    public class BakedPitLane
    {
        public int side;
        public double length;
        public int entry, exit, wallFrom, wallTo;
        public double[] boxes;
        public double limitFrom, limitTo;
        public BakedPodiumSpot[] podium;
        public BakedLanePoints points;
    }

    /// <summary>A bridge: the deck's stretch, the crossing, and the deck's own grid ('1' or '0' a tile).</summary>
    [Serializable]
    public class BakedLevels
    {
        public int from, to, over, under;
        public double height;
        public double[] heights;
        public string solid, rough;
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
        public BakedBarriers barriers;
        /// <summary>tyres, steel or bales</summary>
        public string barrierKind;
        public BakedPits pits;
        public bool dirt;
        public BakedPitLane pitLane;
        public BakedLevels levels;

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
            Spacing = spacing, Length = length, Dirt = dirt, TyreWear = tyreWear > 0 ? tyreWear : 1, Levels = ToLevels(),
        };

        /// <summary>The bridge's levels (null: no bridge; JsonUtility fills an absent one with an empty object).</summary>
        public Levels ToLevels()
        {
            if (levels == null || string.IsNullOrEmpty(levels.solid)) return null;
            int n = width * height;
            var solid = new bool[n];
            bool[] rough = string.IsNullOrEmpty(levels.rough) ? null : new bool[n];
            for (int i = 0; i < n; i++)
            {
                solid[i] = levels.solid[i] == '1';
                if (rough != null) rough[i] = levels.rough[i] == '1';
            }
            return new Levels
            {
                Upper = new Grid { Width = width, Height = height, Tile = tile, Solid = solid, Rough = rough, Heights = levels.heights },
                From = levels.from, To = levels.to, Over = levels.over, Under = levels.under, Height = levels.height,
            };
        }

        /// <summary>The pit lane (null: none).</summary>
        public PitLane ToPitLane()
        {
            if (pitLane == null || pitLane.points == null || pitLane.points.x == null || pitLane.points.x.Length == 0) return null;
            var p = pitLane;
            var pts = new PitLanePoint[p.points.x.Length];
            for (int k = 0; k < pts.Length; k++)
                pts[k] = new PitLanePoint { X = p.points.x[k], Y = p.points.y[k], S = p.points.s[k], Dir = p.points.dir[k], Idx = p.points.idx[k], Off = p.points.off[k] };
            var podium = new PitLane.Spot[p.podium?.Length ?? 0];
            for (int k = 0; k < podium.Length; k++) podium[k] = new PitLane.Spot { Idx = p.podium[k].idx, Lane = p.podium[k].lane };
            return new PitLane
            {
                Side = p.side, Points = pts, Length = p.length, Entry = p.entry, Exit = p.exit, WallFrom = p.wallFrom, WallTo = p.wallTo,
                Boxes = p.boxes, LimitFrom = p.limitFrom, LimitTo = p.limitTo, Podium = podium,
            };
        }
    }
}
