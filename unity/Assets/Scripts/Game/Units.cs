// The web game's map is in px with y pointing down and heading 0 = north; Unity's is metres-ish with y up and +Z north.
// One tile (16 px) is one Unity unit, so an F1 car (30 px long) is a little under 2 units and a lap is a few hundred.
using CornerCutters.Core;
using UnityEngine;
using Grid = CornerCutters.Core.Grid;

namespace CornerCutters.Game
{
    public static class Units
    {
        public const float PerPx = 1f / 16f;

        public static Vector3 ToWorld(double x, double y, double z) => new Vector3((float)(x * PerPx), (float)(z * PerPx), (float)(-y * PerPx));

        /// <summary>Heading (radians, 0 = north, clockwise) as a Unity yaw in degrees: Y rotation is clockwise seen from above too.</summary>
        public static float Yaw(double heading) => (float)(heading * 180.0 / System.Math.PI);

        public static Quaternion Rotation(Car car, Grid grid, double heading)
        {
            Driving.BodyTilt(car, grid, out double pitch, out double roll);
            // Unity's +X rotation pitches the nose down (the map's z is mirrored), so pitch flips; +Z turns +X toward +Y, raising
            // the right side as three.js's does, so roll keeps its sign (flipped, the cars leaned out of a banking)
            return Quaternion.Euler((float)(-pitch * 180.0 / System.Math.PI), Yaw(heading), (float)(roll * 180.0 / System.Math.PI));
        }
    }
}
