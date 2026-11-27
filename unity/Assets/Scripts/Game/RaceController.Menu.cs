// The menus over the game (Menu.cs for what's on them, HudView.Menu.cs for their look): the title as the game starts,
// then the modes; MAIN MENU on the pause screen, and the end of a Time Attack, come back to them. While a menu's up
// the circuit behind it holds still, blurred.
using CornerCutters.Core;
using UnityEngine;

namespace CornerCutters.Game
{
    public sealed partial class RaceController
    {
        /// <summary>the menu up (null: playing)</summary>
        Menu menu;
        float menuT;
        int pauseFocus;
        /// <summary>the mode being played: "race", "championship", "timeattack" (not the Daily Challenge's), "timetrial"</summary>
        string playMode = "race";
        bool attackMode => playMode == "timeattack";
        /// <summary>a Quick Race's laps, and whether it has a qualifying lap first</summary>
        int laps = 5;
        bool qualifying = true;

        /// <summary>The menu, at `screen` (the title as the game starts; the modes after).</summary>
        void OpenMenu(Menu.Screen screen = Menu.Screen.Modes)
        {
            OneScreen();
            DropOurs();
            menu = new Menu(ids, circuitIndex);
            menu.Open(screen, screen == Menu.Screen.Modes ? 1 : 0);
            menuT = 0;
            paused = false;
            ApplyMenu();
        }

        /// <summary>What's picked on the menu, into the game: your team, the difficulty, the weather, laps, qualifying.</summary>
        void ApplyMenu()
        {
            team = Field.Teams[menu.Team];
            difficulty = Field.Difficulties[menu.Difficulty];
            weatherChoice = menu.Weather;
            laps = menu.Laps;
            qualifying = menu.Qualifying;
            twoPlayers = menu.TwoPlayers && menu.Mode == "race";
        }

        /// <summary>A frame of the menu: the keys or the pad on the screen it's at.</summary>
        void MenuUpdate(float frame)
        {
            menuT += frame;
            switch (menu.At)
            {
                case Menu.Screen.Title:
                    if (input.AcceptPressed) menu.Open(Menu.Screen.Modes, menu.FirstTile);
                    break;
                case Menu.Screen.Modes:
                    if (input.NavX != 0 || input.NavY != 0) menu.Focus = Menu.TileStep(menu.Focus, input.NavX, input.NavY, menu.Kept != null ? 3 : 2);
                    if (input.AcceptPressed) menu.PickTile(menu.Focus);
                    else if (input.BackPressed) menu.Open(Menu.Screen.Title);
                    break;
                case Menu.Screen.Circuit:
                    menu.Steer(menu.CircuitRows(), input, () => menu.Open(Menu.Screen.Modes, Menu.TileOf(menu.Mode)));
                    break;
                case Menu.Screen.Settings:
                    menu.Steer(menu.SettingsRows(), input, () => menu.Open(Menu.Screen.Modes, Menu.SettingsTile));
                    break;
                case Menu.Screen.Season:
                    menu.Steer(menu.SeasonRows(), input, () => menu.Open(Menu.Screen.Modes, 2));
                    break;
                case Menu.Screen.Shop:
                    {
                        var shop = ShopState();
                        int n = shop.Styles.Count;
                        if (input.NavX != 0) menu.Focus = Mathf.Clamp(menu.Focus + input.NavX, 0, n);
                        if (input.NavY != 0) menu.Focus = menu.Focus == n ? (input.NavY < 0 ? n - 1 : n) : Mathf.Clamp(menu.Focus + input.NavY * 3, 0, n);
                        if (input.AcceptPressed)
                        {
                            if (menu.Focus >= n) menu.Open(Menu.Screen.Modes, Menu.ShopTile);
                            else if (shop.Owned.Contains(shop.Styles[menu.Focus].Id)) PickStyle(shop.Styles[menu.Focus].Id);
                        }
                        else if (input.BackPressed) menu.Open(Menu.Screen.Modes, Menu.ShopTile);
                        break;
                    }
                case Menu.Screen.Name:
                    menu.Edit.Steer(input.NavX, input.NavY);
                    if (input.AcceptPressed) SaveName();
                    else if (input.BackPressed) menu.Open(Menu.Screen.Settings, 4);
                    break;
            }
            Asked();
        }

        void SaveName()
        {
            Profile.Initials = menu.Edit.ToString();
            SendWaiting();
            menu.Open(Menu.Screen.Settings, 4);
        }

        /// <summary>What the menu asked for: a race or a Time Attack on the circuit picked, or today's challenge.</summary>
        void Asked()
        {
            if (menu == null || menu.Asked == Menu.Go.None) return;
            var go = menu.Asked;
            menu.Asked = Menu.Go.None;
            menu.Keep();
            ApplyMenu();
            if (go == Menu.Go.NewSeason)
            {
                // (a new season: kept, and the season screen again, its first round next)
                menu.Season = NewSeason(menu);
                menu.Open(Menu.Screen.Season, 0);
                return;
            }
            int at = menu.Circuit;
            playMode = go == Menu.Go.Round ? "championship" : menu.Mode;
            season = go == Menu.Go.Round ? menu.Season : null;
            if (go == Menu.Go.Resume && menu.Kept != null)
            {
                // (the race kept on the device: its set-up, its weekend built again from its seed, then its state)
                var k = resuming = menu.Kept;
                playMode = k.Mode == "championship" ? "championship" : "race";
                season = k.Mode == "championship" ? menu.Season : null;
                team = Field.TeamById(k.Team) ?? team;
                difficulty = Field.DifficultyById(k.Difficulty) ?? difficulty;
                foreach (WeatherChoice w in System.Enum.GetValues(typeof(WeatherChoice))) if (WeatherLooks.Name(w) == k.Weather) weatherChoice = w;
                laps = k.Laps;
                twoPlayers = false;
                at = IndexOf(k.Circuit);
            }
            menu = null;
            daily = null;
            attack = null;
            attackTable = null;
            trial = null;
            if (go == Menu.Go.Daily) StartDaily();
            else if (season != null && resuming == null) LoadCircuit(IndexOf(season.Rounds[season.Round]));
            else LoadCircuit(at);
        }

        Vector2 lastMouse;

        /// <summary>Whether the mouse has moved since the last repaint (then it, not the keys, says what's highlighted).</summary>
        bool MouseMoved()
        {
            if (Event.current.type != EventType.Repaint) return false;
            var m = Event.current.mousePosition;
            bool moved = (m - lastMouse).sqrMagnitude > 1;
            lastMouse = m;
            return moved;
        }

        /// <summary>The menu's screen drawn, and what's clicked on it.</summary>
        void MenuGUI()
        {
            var src = input.Source;
            switch (menu.At)
            {
                case Menu.Screen.Title:
                    if (hud.DrawTitle(menuT, src) && menuT > 0.3f) menu.Open(Menu.Screen.Modes, menu.FirstTile);
                    break;
                case Menu.Screen.Modes:
                    {
                        int picked = hud.DrawTiles(menu.Tiles(), menu.Focus, out int hover, TodayPanel());
                        if (hover >= 0 && MouseMoved()) menu.Focus = hover;
                        if (picked >= 0) { menu.Focus = picked; menu.PickTile(picked); }
                        break;
                    }
                case Menu.Screen.Circuit:
                case Menu.Screen.Settings:
                case Menu.Screen.Season:
                    {
                        bool onCircuit = menu.At == Menu.Screen.Circuit, onSeason = menu.At == Menu.Screen.Season;
                        var rows = onCircuit ? menu.CircuitRows() : onSeason ? menu.SeasonRows() : menu.SettingsRows();
                        string title = onCircuit ? Menu.TitleOf(menu.Mode) : onSeason ? menu.SeasonTitle() : "SETTINGS";
                        int picked = hud.DrawRows(title, rows, menu.Focus, onCircuit ? HudView.Outline(menu.CircuitId) : null, menu.At == Menu.Screen.Settings ? Menu.Version : null, out int arrow, out int hover, onSeason ? menu.StandingRows() : null);
                        if (hover >= 0 && MouseMoved()) menu.Focus = hover;
                        if (picked >= 0)
                        {
                            menu.Focus = picked;
                            var r = rows[picked];
                            if (arrow < 0) r.Left?.Invoke();
                            else if (arrow > 0) r.Right?.Invoke();
                            else (r.Pick ?? r.Right)?.Invoke();
                        }
                        break;
                    }
                case Menu.Screen.Shop:
                    {
                        var c = hud.DrawShop(ShopState(), menu.Focus);
                        if (c == HudView.PauseChoice.ShopPick && hud.Picked != null) PickStyle(hud.Picked);
                        else if (c == HudView.PauseChoice.ShopClose) menu.Open(Menu.Screen.Modes, Menu.ShopTile);
                        break;
                    }
                case Menu.Screen.Name:
                    {
                        var c = hud.DrawName(menu.Edit);
                        if (c == HudView.PauseChoice.NameSave) SaveName();
                        else if (c == HudView.PauseChoice.NameCancel) menu.Open(Menu.Screen.Settings, 4);
                        break;
                    }
            }
            if (menu != null && menu.At != Menu.Screen.Title) hud.MenuHints(src);
            Asked();
        }

        /// <summary>The pause screen with the keys or the pad: up and down along its buttons, A to pick, B to go on.</summary>
        void PauseKeys()
        {
            var items = hud?.PauseItems;
            if (items == null || items.Count == 0) return;
            if (input.NavY != 0) pauseFocus = (pauseFocus + input.NavY + items.Count) % items.Count;
            pauseFocus = Mathf.Clamp(pauseFocus, 0, items.Count - 1);
            if (input.AcceptPressed) ApplyPause(items[pauseFocus]);
            else if (input.BackPressed && !input.PausePressed) paused = false;
        }

        /// <summary>A button on the pause screen picked.</summary>
        void ApplyPause(HudView.PauseChoice choice)
        {
            if (choice == HudView.PauseChoice.Resume) paused = false;
            else if (choice == HudView.PauseChoice.Restart) Restart();
            else if (choice == HudView.PauseChoice.SkipQualifying) StartRace(null);
            else if (choice == HudView.PauseChoice.Weather && !daily.HasValue) NextWeather();
            else if (choice == HudView.PauseChoice.GridWalk) PlayerPrefs.SetInt("gridWalk", PlayerPrefs.GetInt("gridWalk", 1) != 0 ? 0 : 1);
            else if (choice == HudView.PauseChoice.MainMenu) OpenMenu();
        }
    }
}
