// Chase camera behind the car (eased, pulling back and widening with speed), or straight down from above (north up).
using UnityEngine;

namespace CornerCutters.Game
{
    public enum CameraMode { Chase, TopDown }

    public sealed class ChaseCamera
    {
        readonly Camera cam;
        float yaw;
        bool snapped;
        public CameraMode Mode = CameraMode.Chase;

        public ChaseCamera(Camera camera)
        {
            cam = camera;
            cam.clearFlags = CameraClearFlags.SolidColor;
            cam.backgroundColor = new Color(0.45f, 0.62f, 0.85f);
            cam.nearClipPlane = 0.1f;
            cam.farClipPlane = 600f;
        }

        public void Snap() => snapped = false;
        public void Cycle() => Mode = Mode == CameraMode.Chase ? CameraMode.TopDown : CameraMode.Chase;

        /// <param name="speed01">0 at rest, 1 at top speed</param>
        public void Follow(Vector3 car, float carYaw, float speed01, float dt)
        {
            bool first = !snapped;
            if (first) { yaw = carYaw; snapped = true; }
            // ease the yaw round the shortest way
            yaw = Mathf.LerpAngle(yaw, carYaw, 1f - Mathf.Exp(-5f * dt));
            Vector3 pos;
            Quaternion rot;
            float fov;
            if (Mode == CameraMode.TopDown)
            {
                pos = car + new Vector3(0, 26f + speed01 * 14f, 0);
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
            float k = first ? 1f : 1f - Mathf.Exp(-14f * dt);
            cam.transform.position = Vector3.Lerp(cam.transform.position, pos, k);
            cam.transform.rotation = Quaternion.Slerp(cam.transform.rotation, rot, k);
            cam.fieldOfView = Mathf.Lerp(cam.fieldOfView, fov, k);
        }
    }
}
