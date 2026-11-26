// The new controls, on Unity's Input System. Defined in code (no .inputactions asset to merge or lose) so a binding is a
// one-line change and a rebinding screen can later override them with InputAction.PerformInteractiveRebinding.
//
// Design (see unity/README.md, "Controls"):
//  * Keyboard: W/Up gas, S/Down brake and reverse, A/D or Left/Right steer, Space or Shift drift. The wheel is eased
//    (SteeringSmoother) so a tap is a nudge and a hold is full lock; the web game's keys snapped to full lock.
//  * Gamepad: left stick steers, right trigger gas, left trigger brake, A or X drift. Read through the same
//    GamepadReader the web game uses (dead zone, rescale), from the standard layout, so Xbox, PlayStation and Switch pads
//    (and Joy-Cons / Pro Controller on desktop) all arrive alike.
//  * Both at once are fine: the device used last drives, and the on-screen hints follow it.
//  * Menus/pausing: Esc or Start pause, R or Y restart, [ ] / Tab or the bumpers change circuit, C or B changes camera,
//    F or Select the weather (a new weekend in it), Enter or A on from qualifying's table and the results.
using CornerCutters.Core;
using UnityEngine;
using UnityEngine.InputSystem;

namespace CornerCutters.Game
{
    public enum InputSource { Keyboard, Gamepad }

    public sealed class GameInput
    {
        readonly InputAction steerKeys = new InputAction("SteerKeys", InputActionType.Value, expectedControlType: "Axis");
        readonly InputAction gasKey = new InputAction("GasKey", InputActionType.Value, expectedControlType: "Axis");
        readonly InputAction brakeKey = new InputAction("BrakeKey", InputActionType.Value, expectedControlType: "Axis");
        readonly InputAction drift = new InputAction("Drift", InputActionType.Button);
        readonly InputAction pause = new InputAction("Pause", InputActionType.Button);
        readonly InputAction restart = new InputAction("Restart", InputActionType.Button);
        readonly InputAction nextCircuit = new InputAction("NextCircuit", InputActionType.Button);
        readonly InputAction prevCircuit = new InputAction("PrevCircuit", InputActionType.Button);
        readonly InputAction camera = new InputAction("Camera", InputActionType.Button);
        readonly InputAction accept = new InputAction("Accept", InputActionType.Button);
        readonly InputAction weather = new InputAction("Weather", InputActionType.Button);
        readonly InputAction[] all;

        readonly SteeringSmoother smoother = new SteeringSmoother();
        readonly PadState pad = new PadState();

        // sampled once a frame (Poll), used by every simulation step of that frame
        double keySteer, padTurn, padGas, padBrake, keyGas, keyBrake;
        bool driftHeld;

        public InputSource Source { get; private set; } = InputSource.Keyboard;
        public bool PausePressed { get; private set; }
        public bool RestartPressed { get; private set; }
        public int CircuitStep { get; private set; }
        public bool CameraPressed { get; private set; }
        /// <summary>on to what's next: the race from qualifying's table, the next circuit from the results</summary>
        public bool AcceptPressed { get; private set; }
        /// <summary>the next weather (a new weekend in it)</summary>
        public bool WeatherPressed { get; private set; }

        public GameInput()
        {
            steerKeys.AddCompositeBinding("1DAxis").With("Negative", "<Keyboard>/a").With("Positive", "<Keyboard>/d");
            steerKeys.AddCompositeBinding("1DAxis").With("Negative", "<Keyboard>/leftArrow").With("Positive", "<Keyboard>/rightArrow");
            gasKey.AddBinding("<Keyboard>/w");
            gasKey.AddBinding("<Keyboard>/upArrow");
            brakeKey.AddBinding("<Keyboard>/s");
            brakeKey.AddBinding("<Keyboard>/downArrow");
            drift.AddBinding("<Keyboard>/space");
            drift.AddBinding("<Keyboard>/leftShift");
            drift.AddBinding("<Keyboard>/rightShift");
            drift.AddBinding("<Gamepad>/buttonSouth");
            drift.AddBinding("<Gamepad>/buttonWest");
            pause.AddBinding("<Keyboard>/escape");
            pause.AddBinding("<Keyboard>/p");
            pause.AddBinding("<Gamepad>/start");
            restart.AddBinding("<Keyboard>/r");
            restart.AddBinding("<Gamepad>/buttonNorth");
            nextCircuit.AddBinding("<Keyboard>/tab");
            nextCircuit.AddBinding("<Keyboard>/rightBracket");
            nextCircuit.AddBinding("<Gamepad>/rightShoulder");
            prevCircuit.AddBinding("<Keyboard>/leftBracket");
            prevCircuit.AddBinding("<Gamepad>/leftShoulder");
            camera.AddBinding("<Keyboard>/c");
            camera.AddBinding("<Gamepad>/buttonEast");
            accept.AddBinding("<Keyboard>/enter");
            accept.AddBinding("<Keyboard>/numpadEnter");
            accept.AddBinding("<Gamepad>/buttonSouth");
            weather.AddBinding("<Keyboard>/f");
            weather.AddBinding("<Gamepad>/select");
            all = new[] { steerKeys, gasKey, brakeKey, drift, pause, restart, nextCircuit, prevCircuit, camera, accept, weather };
        }

        public void Enable() { foreach (var a in all) a.Enable(); }
        public void Disable() { foreach (var a in all) a.Disable(); }

        /// <summary>Read the devices once per frame.</summary>
        public void Poll()
        {
            keySteer = steerKeys.ReadValue<float>();
            keyGas = gasKey.ReadValue<float>();
            keyBrake = brakeKey.ReadValue<float>();
            driftHeld = drift.IsPressed();
            PausePressed = pause.WasPressedThisFrame();
            RestartPressed = restart.WasPressedThisFrame();
            CameraPressed = camera.WasPressedThisFrame();
            AcceptPressed = accept.WasPressedThisFrame();
            WeatherPressed = weather.WasPressedThisFrame();
            CircuitStep = (nextCircuit.WasPressedThisFrame() ? 1 : 0) - (prevCircuit.WasPressedThisFrame() ? 1 : 0);

            var g = Gamepad.current;
            bool padActive = false;
            padTurn = padGas = padBrake = 0;
            if (g != null)
            {
                var p = pad;
                p.AxisX = g.leftStick.x.ReadValue();
                p.AxisY = -g.leftStick.y.ReadValue();   // the web layout has y down
                p.LeftTrigger = g.leftTrigger.ReadValue();
                p.RightTrigger = g.rightTrigger.ReadValue();
                p.Pressed[0] = g.buttonSouth.isPressed;
                p.Pressed[3] = g.buttonNorth.isPressed;
                p.Pressed[8] = g.selectButton.isPressed;
                p.Pressed[9] = g.startButton.isPressed;
                p.Pressed[12] = g.dpad.up.isPressed;
                p.Pressed[13] = g.dpad.down.isPressed;
                p.Pressed[14] = g.dpad.left.isPressed;
                p.Pressed[15] = g.dpad.right.isPressed;
                var buttons = GamepadReader.Read(p, out var d);
                padTurn = d.Turn; padGas = d.Gas; padBrake = d.Brake;
                padActive = buttons.Count > 0 || d.Turn != 0 || d.Gas > 0.05 || d.Brake > 0.05;
            }
            var kb = Keyboard.current;
            bool keysActive = kb != null && kb.anyKey.isPressed;
            if (padActive && !keysActive) Source = InputSource.Gamepad;
            else if (keysActive && !padActive) Source = InputSource.Keyboard;
        }

        /// <summary>The wheel for one simulation step (dt s): the last-used device's reading.</summary>
        public Racing.WheelPad Wheel(double dt)
        {
            double eased = smoother.Step(keySteer, dt);
            if (Source == InputSource.Gamepad)
                return new Racing.WheelPad { Turn = padTurn, Gas = padGas, Brake = padBrake, Drift = driftHeld };
            return new Racing.WheelPad { Turn = eased, Gas = keyGas, Brake = keyBrake, Drift = driftHeld };
        }

        public void ResetWheel() => smoother.Reset();

        public string Hints => Source == InputSource.Gamepad
            ? "L-STICK steer   RT gas   LT brake / reverse   A drift   Y restart   START pause   LB/RB circuit   B camera   SELECT weather"
            : "A/D steer   W gas   S brake / reverse   SPACE drift   R restart   ESC pause   [ ] circuit   C camera   F weather";
    }
}
