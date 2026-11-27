// The feel of your car (race/feel.ts, race/camera.ts): the vibration a crash, a hard landing, the grass or the kerbs
// ask for (a pad's motors, a phone's vibrator), the camera's shake and a big hit's hit-stop (the race at a crawl for a
// few hundredths of a second), and the classic camera pulling back with speed (less of it under less motion) and a
// little more wheel to wheel with a rival.
using CornerCutters.Core;
using UnityEngine;

namespace CornerCutters.Game
{
    public sealed partial class RaceController
    {
        ShakeState shake = new ShakeState();
        RumbleState rumbleState = new RumbleState();
        float zoomNow, battleNow;
        const double BattleNear = 50, BattlePullBack = 0.08;

        void FreshFeel()
        {
            shake = new ShakeState();
            rumbleState = new RumbleState();
            zoomNow = battleNow = 0;
            Haptics.Stop();
        }

        /// <summary>A frame of your car felt (not paused): `lost` health and a landing at `landedNow` px/s this frame.</summary>
        void StepFeel(float frame, double lost, double landedNow, bool wrecked)
        {
            var me = Me;
            var car = me.Car;
            var ev = lastEvents.Length > you ? lastEvents[you] : default;
            var felt = new FeelFrame
            {
                Dt = frame, Speed = Driving.SpeedOf(car), TopSpeed = car.Cls.TopSpeed, HealthLost = lost, WreckedNow = wrecked,
                Landed = landedNow, OnRough = ev.OnRough, OnKerb = CellAt(car.X, car.Y) == 'K',
            };
            bool replaying = replay != null;
            // (no buzz in a replay, the grid walk, or two players on one pad's vibration)
            if (!replaying && !panT.HasValue && !Split) Haptics.Vibrate(Rumble.Step(rumbleState, felt), input.Source);
            // the shake: not in the replay, nor once you're out
            if (replaying || !RaceControl.Running(me)) felt = new FeelFrame { Dt = felt.Dt, Speed = felt.Speed, TopSpeed = felt.TopSpeed };
            Shake.Step(shake, felt);
        }

        /// <summary>The race's time this frame: at a crawl through a big hit's hit-stop.</summary>
        float FeltTime(float frame) => (float)(frame * Shake.TimeScale(shake));

        /// <summary>The classic camera's pull back and shake for this frame (`frame` s).</summary>
        void FeelCamera(float frame, bool following)
        {
            var me = Me;
            bool live = following && replay == null && podiumTop == null && !panT.HasValue && RaceControl.Running(me) && me.Pit == null;
            float zoomWant = live ? (float)(Shake.ZoomOf(Driving.SpeedOf(me.Car), me.Car.Cls.TopSpeed) * (Options.MotionReduced ? Shake.ZoomCalm : 1)) : 0;
            zoomNow += (zoomWant - zoomNow) * Mathf.Min(1, frame * 1.5f);
            bool battle = false;
            if (live && session == Session.Race && race.Phase == RacePhase.Racing)
                for (int i = 0; i < race.Entrants.Count && !battle; i++)
                {
                    var e = race.Entrants[i];
                    battle = i != you && RaceControl.Running(e) && e.Pit == null && JsMath.Hypot(e.Car.X - me.Car.X, e.Car.Y - me.Car.Y) < BattleNear;
                }
            float battleWant = battle ? 1 : 0;
            battleNow += (battleWant - battleNow) * Mathf.Min(1, frame * (battle ? 2 : 0.8f));
            chase.PullBack = (float)(Shake.ZoomPullBack * zoomNow + BattlePullBack * battleNow);
            // (SCREEN SHAKE off in the settings: still)
            var o = Options.Shake ? Shake.Offset(shake) : new Vec2(0, 0);
            chase.Shake = new Vector2((float)o.X, (float)o.Y);
        }
    }
}
