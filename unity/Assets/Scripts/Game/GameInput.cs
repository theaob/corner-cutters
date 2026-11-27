// The new controls, on Unity's Input System. Defined in code (no .inputactions asset to merge or lose) so a binding is a
// one-line change; the KEYS screen in the settings rebinds the driving keys and pad buttons (binding overrides, kept on
// the device: the save's device section, keys.*, left out of a save moved elsewhere).
//
// Design (see unity/README.md, "Controls"):
//  * Keyboard: W/Up gas, S/Down brake and reverse, A/D or Left/Right steer, Space or Shift drift. The wheel is eased
//    (SteeringSmoother) so a tap is a nudge and a hold is full lock; the web game's keys snapped to full lock.
//  * Gamepad: left stick steers, right trigger gas, left trigger brake, A or X drift. Read through the same
//    GamepadReader the web game uses (dead zone, rescale), from the standard layout, so Xbox, PlayStation and Switch pads
//    (and Joy-Cons / Pro Controller on desktop) all arrive alike.
//  * Both at once are fine: the device used last drives, and the on-screen hints follow it.
//  * Two players (split screen): the second drives the last pad plugged in; the first the keyboard and, with two pads or
//    more, the first pad.
//  * Touch (a phone or a tablet; TouchDeck): the floating thumbstick points the way to go (DRIVING: STEER, a steering
//    slider and GAS and BRAKE pedals), A on what's next, RESTART and PAUSE in the top corners; every other tap is a tap
//    on the screen's buttons. Touching hands the controls to the screen; a key or a pad takes them back.
//  * Menus/pausing: Esc or Start pause, R or Y restart, [ ] / Tab or the bumpers change circuit, C or B changes camera,
//    F or Select the weather (a new weekend in it), Enter or A on from qualifying's table and the results.
using CornerCutters.Core;
using UnityEngine;
using UnityEngine.InputSystem;

namespace CornerCutters.Game
{
    public enum InputSource { Keyboard, Gamepad, Touch }

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
        readonly PadState pad = new PadState(), pad2 = new PadState();

        /// <summary>two players, split screen: the second on a pad of its own</summary>
        public bool TwoPlayer;
        /// <summary>the second player's pad is there</summary>
        public bool SecondPad { get; private set; }
        /// <summary>any pad plugged in (the second player needs one)</summary>
        public static bool AnyPad => Gamepad.all.Count > 0;
        double p2Turn, p2Gas, p2Brake;
        bool p2Drift;

        // sampled once a frame (Poll), used by every simulation step of that frame
        double keySteer, padTurn, padGas, padBrake, keyGas, keyBrake;
        bool driftHeld;

        public InputSource Source { get; private set; } = Application.isMobilePlatform ? InputSource.Touch : InputSource.Keyboard;
        /// <summary>the touch screen's controls</summary>
        public readonly TouchDeck Deck = new TouchDeck();
        /// <summary>EXIT on the touch deck: back to the menu</summary>
        public bool ExitPressed { get; private set; }
        public bool PausePressed { get; private set; }
        public bool RestartPressed { get; private set; }
        public int CircuitStep { get; private set; }
        public bool CameraPressed { get; private set; }
        /// <summary>on to what's next: the race from qualifying's table, the next circuit from the results</summary>
        public bool AcceptPressed { get; private set; }
        /// <summary>the next weather (a new weekend in it)</summary>
        public bool WeatherPressed { get; private set; }
        /// <summary>menus: a step left/right (-1, 0, 1) and up/down (up -1), and back (Esc, B)</summary>
        public int NavX { get; private set; }
        public int NavY { get; private set; }
        public bool BackPressed { get; private set; }

        /// <summary>the stick's last menu direction, and when it steps again while held</summary>
        int stickX, stickY;
        float stickAgain;

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
            Binds = new[]
            {
                new Bind("STEER LEFT", steerKeys, 1, "<Keyboard>/a", -1, null),
                new Bind("STEER RIGHT", steerKeys, 2, "<Keyboard>/d", -1, null),
                new Bind("GAS", gasKey, 0, "<Keyboard>/w", -1, null),
                new Bind("BRAKE", brakeKey, 0, "<Keyboard>/s", -1, null),
                new Bind("DRIFT", drift, 0, "<Keyboard>/space", 3, "<Gamepad>/buttonSouth"),
                new Bind("RESTART", restart, 0, "<Keyboard>/r", 1, "<Gamepad>/buttonNorth"),
                new Bind("CAMERA", camera, 0, "<Keyboard>/c", 1, "<Gamepad>/buttonEast"),
                new Bind("WEATHER", weather, 0, "<Keyboard>/f", 1, "<Gamepad>/select"),
            };
            LoadBinds();
        }

        /// <summary>The bindings kept on the device put on the controls (again, after a save's been moved here).</summary>
        public void LoadBinds()
        {
            foreach (var a in all) a.RemoveAllBindingOverrides();
            for (int i = 0; i < Binds.Length; i++)
            {
                var b = Binds[i];
                b.KeyPath = Save.String("device", $"keys.{i}.key", b.KeyDefault);
                if (b.KeyPath != b.KeyDefault) b.Action.ApplyBindingOverride(b.KeyIndex, b.KeyPath);
                if (b.PadIndex < 0) continue;
                b.PadPath = Save.String("device", $"keys.{i}.pad", b.PadDefault);
                if (b.PadPath != b.PadDefault) b.Action.ApplyBindingOverride(b.PadIndex, b.PadPath);
            }
        }

        // ---- rebinding (the settings' KEYS screen) ----

        /// <summary>A control that can be rebound: its name, its action, and the binding of it on the keys and (some) on a pad.</summary>
        public sealed class Bind
        {
            public readonly string Name, KeyDefault, PadDefault;
            public readonly InputAction Action;
            public readonly int KeyIndex, PadIndex;
            public string KeyPath, PadPath;
            public Bind(string name, InputAction action, int keyIndex, string keyDefault, int padIndex, string padDefault)
            {
                Name = name; Action = action; KeyIndex = keyIndex; KeyDefault = keyDefault; PadIndex = padIndex; PadDefault = padDefault;
                KeyPath = keyDefault; PadPath = padDefault;
            }
        }

        public readonly Bind[] Binds;

        /// <summary>the pad's buttons a control can go on (the d-pad and START stay the menus' and pause's), as paths and as their names</summary>
        static readonly (string path, string label, System.Func<Gamepad, bool> pressed, System.Func<Gamepad, bool> held)[] PadButtons =
        {
            ("<Gamepad>/buttonSouth", "A", g => g.buttonSouth.wasPressedThisFrame, g => g.buttonSouth.isPressed),
            ("<Gamepad>/buttonEast", "B", g => g.buttonEast.wasPressedThisFrame, g => g.buttonEast.isPressed),
            ("<Gamepad>/buttonWest", "X", g => g.buttonWest.wasPressedThisFrame, g => g.buttonWest.isPressed),
            ("<Gamepad>/buttonNorth", "Y", g => g.buttonNorth.wasPressedThisFrame, g => g.buttonNorth.isPressed),
            ("<Gamepad>/leftShoulder", "LB", g => g.leftShoulder.wasPressedThisFrame, g => g.leftShoulder.isPressed),
            ("<Gamepad>/rightShoulder", "RB", g => g.rightShoulder.wasPressedThisFrame, g => g.rightShoulder.isPressed),
            ("<Gamepad>/leftStickPress", "L3", g => g.leftStickButton.wasPressedThisFrame, g => g.leftStickButton.isPressed),
            ("<Gamepad>/rightStickPress", "R3", g => g.rightStickButton.wasPressedThisFrame, g => g.rightStickButton.isPressed),
            ("<Gamepad>/select", "SELECT", g => g.selectButton.wasPressedThisFrame, g => g.selectButton.isPressed),
        };

        /// <summary>A binding's path as a key cap: "&lt;Keyboard&gt;/leftShift" LEFT SHIFT, a pad's button by its name.</summary>
        public static string Label(string path)
        {
            if (string.IsNullOrEmpty(path)) return "-";
            foreach (var b in PadButtons) if (b.path == path) return b.label;
            string n = path.Substring(path.LastIndexOf('/') + 1);
            var sb = new System.Text.StringBuilder();
            for (int i = 0; i < n.Length; i++)
            {
                if (i > 0 && char.IsUpper(n[i]) && !char.IsUpper(n[i - 1])) sb.Append(' ');
                sb.Append(char.ToUpperInvariant(n[i]));
            }
            return sb.ToString();
        }

        /// <summary>Listening for a new key (or pad button): the one pressed this frame, if any. Esc (START on a pad) gives up.</summary>
        public bool Listen(bool pad, out string path, out bool cancelled)
        {
            path = null;
            cancelled = false;
            if (pad)
            {
                var g = Gamepad.current;
                if (g == null) return false;
                if (g.startButton.wasPressedThisFrame) { cancelled = true; return false; }
                foreach (var b in PadButtons) if (b.pressed(g)) { path = b.path; return true; }
                return false;
            }
            var kb = Keyboard.current;
            if (kb == null) return false;
            if (kb.escapeKey.wasPressedThisFrame) { cancelled = true; return false; }
            foreach (var key in kb.allKeys)
                if (key != null && key.wasPressedThisFrame)
                {
                    // (Enter stays the menus'; P and Esc pause)
                    if (key.name == "enter" || key.name == "numpadEnter" || key.name == "p") return false;
                    path = "<Keyboard>/" + key.name;
                    return true;
                }
            return false;
        }

        /// <summary>Put control i on `path` (a key, or a pad button), kept; a control already on it swaps to i's old one.</summary>
        public void Rebind(int i, bool pad, string path)
        {
            var b = Binds[i];
            string old = pad ? b.PadPath : b.KeyPath;
            if (old == path) return;
            for (int j = 0; j < Binds.Length; j++)
            {
                if (j == i) continue;
                var o = Binds[j];
                if (pad ? o.PadIndex >= 0 && o.PadPath == path : o.KeyPath == path) Set(j, pad, old);
            }
            Set(i, pad, path);
        }

        void Set(int i, bool pad, string path)
        {
            var b = Binds[i];
            if (pad) b.PadPath = path; else b.KeyPath = path;
            b.Action.ApplyBindingOverride(pad ? b.PadIndex : b.KeyIndex, path);
            Save.Set("device", $"keys.{i}.{(pad ? "pad" : "key")}", path);
        }

        /// <summary>Every control back on its own keys and buttons.</summary>
        public void ResetBinds()
        {
            for (int i = 0; i < Binds.Length; i++)
            {
                var b = Binds[i];
                b.KeyPath = b.KeyDefault;
                b.PadPath = b.PadDefault;
                Save.Set("device", $"keys.{i}.key", null);
                Save.Set("device", $"keys.{i}.pad", null);
            }
            foreach (var a in all) a.RemoveAllBindingOverrides();
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
            // (two players: the first's pad is the first of two or more, the second's the last)
            var pads = Gamepad.all;
            Gamepad mine = g, theirs = null;
            if (TwoPlayer)
            {
                mine = pads.Count >= 2 ? pads[0] : null;
                theirs = pads.Count >= 1 ? pads[pads.Count - 1] : null;
                driftHeld = KeyDrift() || PadDrift(mine);
            }
            bool padActive = ReadPad(mine, pad, out padTurn, out padGas, out padBrake);
            SecondPad = theirs != null;
            ReadPad(theirs, pad2, out p2Turn, out p2Gas, out p2Brake);
            p2Drift = PadDrift(theirs);
            Nav(g);
            var kb = Keyboard.current;
            bool keysActive = kb != null && kb.anyKey.isPressed;
            if (padActive && !keysActive) Source = InputSource.Gamepad;
            else if (keysActive && !padActive) Source = InputSource.Keyboard;
            // the touch screen: touching hands it the controls, a key or a pad takes them back
            if (padActive || keysActive) { if (Deck.Used) Deck.Forget(); }
            Deck.Poll();
            if (Deck.Used) Source = InputSource.Touch;
            HudView.Phone = Source == InputSource.Touch;
            ExitPressed = false;
            if (Source == InputSource.Touch && !TwoPlayer)
            {
                AcceptPressed |= Deck.APressed;
                RestartPressed |= Deck.StartPressed;
                if (Deck.SelectPressed)
                {
                    if (Deck.LabelSelect == "PAUSE") PausePressed = true;
                    else ExitPressed = true;
                }
            }
        }

        /// <summary>A pad's wheel, through the web game's GamepadReader; whether it's being used.</summary>
        static bool ReadPad(Gamepad g, PadState p, out double turn, out double gas, out double brake)
        {
            turn = gas = brake = 0;
            if (g == null) return false;
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
            turn = d.Turn; gas = d.Gas; brake = d.Brake;
            return buttons.Count > 0 || d.Turn != 0 || d.Gas > 0.05 || d.Brake > 0.05;
        }

        /// <summary>A pad's drift: its DRIFT button (A unless rebound) or X.</summary>
        bool PadDrift(Gamepad g)
        {
            if (g == null) return false;
            if (g.buttonWest.isPressed) return true;
            string path = Binds[4].PadPath;
            foreach (var b in PadButtons) if (b.path == path) return b.held(g);
            return false;
        }

        /// <summary>The keys' drift: the DRIFT key (Space unless rebound) or a Shift.</summary>
        bool KeyDrift()
        {
            var kb = Keyboard.current;
            if (kb == null) return false;
            if (kb.leftShiftKey.isPressed || kb.rightShiftKey.isPressed) return true;
            string name = Binds[4].KeyPath.Substring(Binds[4].KeyPath.LastIndexOf('/') + 1);
            foreach (var key in kb.allKeys) if (key != null && key.name == name) return key.isPressed;
            return false;
        }

        /// <summary>The menus' steps: arrow keys or WASD, the d-pad, or the stick (stepping again while it's held).</summary>
        void Nav(Gamepad g)
        {
            var kb = Keyboard.current;
            int nx = 0, ny = 0;
            bool back = false;
            if (kb != null)
            {
                if (kb.leftArrowKey.wasPressedThisFrame || kb.aKey.wasPressedThisFrame) nx--;
                if (kb.rightArrowKey.wasPressedThisFrame || kb.dKey.wasPressedThisFrame) nx++;
                if (kb.upArrowKey.wasPressedThisFrame || kb.wKey.wasPressedThisFrame) ny--;
                if (kb.downArrowKey.wasPressedThisFrame || kb.sKey.wasPressedThisFrame) ny++;
                back |= kb.escapeKey.wasPressedThisFrame;
            }
            if (g != null)
            {
                if (g.dpad.left.wasPressedThisFrame) nx--;
                if (g.dpad.right.wasPressedThisFrame) nx++;
                if (g.dpad.up.wasPressedThisFrame) ny--;
                if (g.dpad.down.wasPressedThisFrame) ny++;
                back |= g.buttonEast.wasPressedThisFrame;
                float sx = g.leftStick.x.ReadValue(), sy = g.leftStick.y.ReadValue();
                int dx = sx > 0.6f ? 1 : sx < -0.6f ? -1 : 0, dy = sy > 0.6f ? -1 : sy < -0.6f ? 1 : 0;
                float now = Time.unscaledTime;
                if ((dx != stickX || dy != stickY) && (dx != 0 || dy != 0)) { nx += dx; ny += dy; stickAgain = now + 0.4f; }
                else if ((dx != 0 || dy != 0) && now >= stickAgain) { nx += dx; ny += dy; stickAgain = now + 0.12f; }
                stickX = dx;
                stickY = dy;
            }
            NavX = System.Math.Sign(nx);
            NavY = System.Math.Sign(ny);
            BackPressed = back;
        }

        /// <summary>The wheel for one simulation step (dt s): the last-used device's reading.</summary>
        public Racing.WheelPad Wheel(double dt)
        {
            double eased = smoother.Step(keySteer, dt);
            if (Source == InputSource.Touch && !TwoPlayer) return Deck.Wheel();
            if (Source == InputSource.Gamepad)
                return new Racing.WheelPad { Turn = padTurn, Gas = padGas, Brake = padBrake, Drift = driftHeld };
            return new Racing.WheelPad { Turn = eased, Gas = keyGas, Brake = keyBrake, Drift = driftHeld };
        }

        /// <summary>The second player's wheel for one simulation step: their pad's reading (nothing without one).</summary>
        public Racing.WheelPad Wheel2(double dt) => new Racing.WheelPad { Turn = p2Turn, Gas = p2Gas, Brake = p2Brake, Drift = p2Drift };

        public void ResetWheel() => smoother.Reset();

        /// <summary>The keys along the bottom of the race, as they're bound now.</summary>
        public string Hints => Source == InputSource.Gamepad
            ? $"L-STICK steer   RT gas   LT brake / reverse   {Label(Binds[4].PadPath)} drift   {Label(Binds[5].PadPath)} restart   START pause   LB/RB circuit   {Label(Binds[6].PadPath)} camera   {Label(Binds[7].PadPath)} weather"
            : $"{Label(Binds[0].KeyPath)}/{Label(Binds[1].KeyPath)} steer   {Label(Binds[2].KeyPath)} gas   {Label(Binds[3].KeyPath)} brake / reverse   {Label(Binds[4].KeyPath)} drift   {Label(Binds[5].KeyPath)} restart   ESC pause   [ ] circuit   {Label(Binds[6].KeyPath)} camera   {Label(Binds[7].KeyPath)} weather";
    }
}
