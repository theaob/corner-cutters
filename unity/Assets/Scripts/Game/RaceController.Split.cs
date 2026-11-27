// Two players, split screen (desktop and Switch): a Quick Race for two against the AI field, side by side. The second
// player takes the car next to yours on the grid (its AI taken off it) and drives it on a pad of its own (GameInput:
// the last pad plugged in); each half has its own camera and its own HUD, the pause screen over both. Two up there's
// no qualifying (it's one car on its own), no crash replays (they'd take the screen from the other), and no finish
// replay: once you're both home (or out), the ceremony and the results.
using CornerCutters.Core;
using UnityEngine;

namespace CornerCutters.Game
{
    public sealed partial class RaceController
    {
        /// <summary>two players picked on the menu (a Quick Race)</summary>
        bool twoPlayers;
        /// <summary>the second player's entrant this session (-1: none), and their driver in the weekend</summary>
        int you2 = -1;
        int p2Driver = -1;
        Camera cam2;
        /// <summary>the second player's own call on their half (as `notice` is yours)</summary>
        string notice2;
        Color noticeColor2;
        double noticeUntil2;
        ChaseCamera chase2;
        HudView hud2;

        /// <summary>This weekend is for two: a Quick Race (not a season's round, the Daily or a mode on your own).</summary>
        bool TwoUp => twoPlayers && season == null && !daily.HasValue && playMode == "race";

        /// <summary>The picture in two halves: both players racing (the grid walk, a replay and the ceremony take the whole screen).</summary>
        bool Split => you2 >= 0 && race != null && replay == null && !panT.HasValue && !OnSet && menu == null;

        Entrant Them => race.Entrants[you2];

        /// <summary>The second camera, off till a race for two.</summary>
        void MakeSecondCamera()
        {
            var go = new GameObject("Camera 2");
            go.transform.SetParent(transform, false);
            cam2 = go.AddComponent<Camera>();
            go.AddComponent<TiltShiftEffect>();
            chase2 = new ChaseCamera(cam2);
            cam2.enabled = false;
        }

        /// <summary>A weekend drawn: for two, the car next to yours is the second player's (no AI in it).</summary>
        void SecondDriver()
        {
            input.TwoPlayer = TwoUp;
            p2Driver = -1;
            if (!TwoUp) return;
            p2Driver = (weekend.YouDriver + 1) % weekend.Drivers.Count;
            weekend.Drivers[p2Driver].Ai = null;
        }

        /// <summary>The whole screen for one again (the menu over the circuit).</summary>
        void OneScreen()
        {
            if (cam != null) cam.rect = new Rect(0, 0, 1, 1);
            if (cam2 != null) cam2.enabled = false;
        }

        /// <summary>Each player's wheel: the second player's car on their pad, the rest (yours) on yours.</summary>
        System.Func<Entrant, DriveInput> Wheels(Racing.WheelPad wheel, Racing.WheelPad wheel2)
        {
            if (you2 < 0) return e => Racing.PadInput(wheel, e.Car);
            var them = race.Entrants[you2];
            return e => Racing.PadInput(ReferenceEquals(e, them) ? wheel2 : wheel, e.Car);
        }

        /// <summary>Both players home or out (one at least home), a few seconds since the last flag: on to the ceremony.</summary>
        bool PlayersDone()
        {
            var a = Me.Progress;
            var b = Them.Progress;
            bool done = (a.Finished.HasValue || a.Retired) && (b.Finished.HasValue || b.Retired);
            if (!done || (!a.Finished.HasValue && !b.Finished.HasValue)) return false;
            double last = System.Math.Max(a.Finished ?? 0, b.Finished ?? 0);
            return race.Clock >= last + 3;
        }

        /// <summary>The cameras: one over the whole screen, or each player's half (the second following their car).</summary>
        void SplitCameras(double alpha, float frame)
        {
            bool split = Split;
            cam.rect = split ? new Rect(0, 0, 0.5f, 1) : new Rect(0, 0, 1, 1);
            if (cam2.enabled != split) cam2.enabled = split;
            if (!split) return;
            chase2.Mode = chase.Mode;
            // (a narrower picture each: the classic view drawn back a little to show as much ahead)
            chase2.Zoom = 0.85f;
            var post = cam2.GetComponent<TiltShiftEffect>();
            if (post != null) post.Amount = blur;
            cam2.backgroundColor = cam.backgroundColor;
            var p = Between(you2, alpha);
            var car = Them.Car;
            float speed01 = Mathf.Clamp01((float)(Driving.SpeedOf(car) / car.Cls.TopSpeed));
            var lead = new Vector3((float)(car.Vx / car.Cls.TopSpeed * 2.5), 0, (float)(-car.Vy / car.Cls.TopSpeed * 2.5));
            chase2.Follow(Units.ToWorld(p.X, p.Y, p.Z), Units.Yaw(p.H), speed01, lead, frame);
        }
    }
}
