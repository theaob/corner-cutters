// Cameras. Classic is the web game's: north up, a narrow lens (26 degrees) high up at a 52 degree pitch from the south,
// looking a little ahead of the car, pulling back with speed. Chase sits behind the car; TopDown looks straight down.
using UnityEngine;

namespace CornerCutters.Game
{
    public enum CameraMode { Classic, Chase, TopDown }

    public sealed class ChaseCamera
    {
        readonly Camera cam;
        float yaw;
        bool snapped;
        Vector3 focus;
        public CameraMode Mode = CameraMode.Classic;

        // the web game's look (src/engine/look.ts HD2D_VIEW), distance chosen to frame the car as the web game does (about 13 units high)
        const float ClassicFov = 26f, ClassicPitch = 52f, ClassicDistance = 29f;

        public ChaseCamera(Camera camera)
        {
            cam = camera;
            cam.clearFlags = CameraClearFlags.SolidColor;
            cam.backgroundColor = new Color(0.15f, 0.38f, 0.13f);
            cam.nearClipPlane = 0.5f;
            cam.farClipPlane = 600f;
        }

        public void Snap() => snapped = false;
        public void Cycle() => Mode = (CameraMode)(((int)Mode + 1) % 3);

        /// <param name="speed01">0 at rest, 1 at top speed</param>
        /// <param name="lead">where the car is going: world units ahead to look (zero at rest)</param>
        public void Follow(Vector3 car, float carYaw, float speed01, Vector3 lead, float dt)
        {
            bool first = !snapped;
            if (first) { yaw = carYaw; snapped = true; focus = car; }
            yaw = Mathf.LerpAngle(yaw, carYaw, 1f - Mathf.Exp(-5f * dt));
            focus = Vector3.Lerp(focus, car + lead, first ? 1f : 1f - Mathf.Exp(-6f * dt));
            Vector3 pos;
            Quaternion rot;
            float fov;
            if (Mode == CameraMode.Classic)
            {
                float d = ClassicDistance * (1f + 0.35f * speed01);
                float p = ClassicPitch * Mathf.Deg2Rad;
                pos = focus + new Vector3(0, Mathf.Sin(p) * d, -Mathf.Cos(p) * d);
                rot = Quaternion.LookRotation(focus - pos, Vector3.up);
                fov = ClassicFov;
            }
            else if (Mode == CameraMode.TopDown)
            {
                pos = focus + new Vector3(0, 26f + speed01 * 14f, 0);
                rot = Quaternion.Euler(90, 0, 0);
                fov = 45f;
            }
            else
            {
                var back = Quaternion.Euler(0, yaw, 0) * Vector3.back;
                pos = car + back * (5.2f + speed01 * 2.2f) + Vector3.up * (2.4f + speed01 * 0.7f);
                rot = Quaternion.LookRotation((car + Quaternion.Euler(0, yaw, 0) * Vector3.forward * 3f + Vector3.up * 0.5f) - pos, Vector3.up);
                fov = 62f + speed01 * 14f;
            }
            // (the modes switch by easing, the classic view follows exactly: it is already eased through the focus)
            float k = first ? 1f : (Mode == CameraMode.Classic ? 1f : 1f - Mathf.Exp(-14f * dt));
            cam.transform.position = Vector3.Lerp(cam.transform.position, pos, k);
            cam.transform.rotation = Quaternion.Slerp(cam.transform.rotation, rot, k);
            cam.fieldOfView = Mathf.Lerp(cam.fieldOfView, fov, first ? 1f : 1f - Mathf.Exp(-8f * dt));
        }
    }
}
