// The menus, as the web game has them (src/f1/circuitSelect.ts chooseCircuit, menuTiles.ts, settingsRows.ts,
// screens/carShop.ts): the title, the modes as tiles (DAILY CHALLENGE, QUICK RACE, TIME ATTACK; SETTINGS and SHOP
// small under them), a mode's circuit screen (the circuit, then its rows: TEAM, WEATHER, QUALIFYING, LAPS), the
// settings, the shop and your name. Played with the keys, a pad or the mouse: up and down move between the rows, left
// and right change a row, A or ENTER picks, B or ESC goes back. What's picked is kept (PlayerPrefs) for next time.
using CornerCutters.Core;
using System;
using System.Collections.Generic;
using System.Linq;
using UnityEngine;

namespace CornerCutters.Game
{
    /// <summary>A row on a menu screen: its name and value, or a button; what left, right and picking it do.</summary>
    public sealed class MenuRow
    {
        public string Label, Value, About;
        /// <summary>a button (no value: picked, not changed)</summary>
        public bool Button;
        /// <summary>colours to show beside the value (a team's livery)</summary>
        public int[] Swatch;
        public Action Left, Right, Pick;
    }

    /// <summary>A tile on the modes screen: its icon and name, a line under it, and whether it's a small one.</summary>
    public struct MenuTile
    {
        public string Icon, Name, Line;
        public bool Small;
    }

    public sealed class Menu
    {
        public enum Screen { Title, Modes, Circuit, Settings, Shop, Name }

        /// <summary>What the menu wants done.</summary>
        public enum Go { None, Play, Daily }

        public Screen At = Screen.Title;
        public int Focus;
        public Go Asked;
        public HudView.NameEdit Edit;

        // what's picked (kept for next time)
        public string Mode = PlayerPrefs.GetString("menu.mode", "race");
        public int Circuit;
        public int Team = Mathf.Clamp(PlayerPrefs.GetInt("menu.team", 0), 0, Field.Teams.Length - 1);
        public WeatherChoice Weather = (WeatherChoice)Mathf.Clamp(PlayerPrefs.GetInt("weather", 0), 0, 3);
        public bool Qualifying = PlayerPrefs.GetInt("menu.qualifying", 1) != 0;
        public int Laps = PlayerPrefs.GetInt("menu.laps", 5);
        public int Difficulty = Mathf.Clamp(PlayerPrefs.GetInt("menu.difficulty", 1), 0, Field.Difficulties.Length - 1);

        /// <summary>a Quick Race's laps to choose from (laps.ts LAP_CHOICES)</summary>
        public static readonly int[] LapChoices = { 1, 2, 3, 5, 7, 10, 15, 20 };

        readonly IReadOnlyList<string> ids;
        /// <summary>each circuit's name, country and line about it (Circuits/index.json, baked with them)</summary>
        readonly Dictionary<string, (string name, string country, string about)> about = new Dictionary<string, (string, string, string)>();

        public Menu(IReadOnlyList<string> ids, int circuit)
        {
            this.ids = ids;
            Circuit = circuit;
            if (Array.IndexOf(LapChoices, Laps) < 0) Laps = 5;
            if (Mode != "race" && Mode != "timeattack") Mode = "race";
            var index = Resources.Load<TextAsset>("Circuits/index");
            if (index != null && Json.Parse(index.text) is List<object> list)
                foreach (var o in list)
                    if (o is Dictionary<string, object> d && d.TryGetValue("id", out var id) && id is string s)
                        about[s] = (d.TryGetValue("name", out var n) ? (n as string ?? s) : s, d.TryGetValue("country", out var c) ? c as string : null, d.TryGetValue("about", out var a) ? a as string : null);
        }

        public string CircuitId => ids[Circuit];
        public string NameOf(string id) => (about.TryGetValue(id, out var a) ? a.name : id).ToUpperInvariant();
        public string AboutOf(string id) => about.TryGetValue(id, out var a) ? (a.country ?? "").ToUpperInvariant() : "";

        public void Keep()
        {
            PlayerPrefs.SetString("menu.mode", Mode);
            PlayerPrefs.SetInt("menu.team", Team);
            PlayerPrefs.SetInt("weather", (int)Weather);
            PlayerPrefs.SetInt("menu.qualifying", Qualifying ? 1 : 0);
            PlayerPrefs.SetInt("menu.laps", Laps);
            PlayerPrefs.SetInt("menu.difficulty", Difficulty);
        }

        public void Open(Screen s, int focus = 0)
        {
            At = s;
            Focus = focus;
        }

        // ---- the modes ----

        public static readonly string[] Modes = { "daily", "race", "timeattack" };

        public List<MenuTile> Tiles()
        {
            var c = Daily.On(Daily.DayOf(DateTime.UtcNow));
            var streak = Streaks.Parse(PlayerPrefs.GetString("streak", ""), Daily.Parse(PlayerPrefs.GetString("daily", "")));
            int days = Streaks.Now(streak, Streaks.LocalDay(DateTime.Now));
            string w = c.Weather == Core.Weather.Wet ? "WET" : c.Weather == Core.Weather.Damp ? "DAMP" : "DRY";
            return new List<MenuTile>
            {
                new MenuTile { Icon = "daily", Name = "DAILY CHALLENGE", Line = $"{NameOf(c.Circuit)} · {w}" + (days > 0 ? $" · STREAK {days}" : "") },
                new MenuTile { Icon = "race", Name = "QUICK RACE", Line = "ONE RACE AGAINST THE FIELD" },
                new MenuTile { Icon = "timeattack", Name = "TIME ATTACK", Line = "RACE THE CLOCK" },
                new MenuTile { Icon = "settings", Name = "SETTINGS", Small = true },
                new MenuTile { Icon = "shop", Name = "SHOP", Small = true },
            };
        }

        /// <summary>A tile picked.</summary>
        public void PickTile(int i)
        {
            if (i == 0) Asked = Go.Daily;
            else if (i == 1 || i == 2)
            {
                Mode = i == 1 ? "race" : "timeattack";
                if (Mode == "timeattack" && Weather == WeatherChoice.Changeable) Weather = WeatherChoice.Dry;
                Open(Screen.Circuit);
            }
            else if (i == 3) Open(Screen.Settings);
            else if (i == 4) Open(Screen.Shop);
        }

        /// <summary>Where the highlight goes on the tiles: three big ones in a row, two small under (menuTiles.ts gridStep's way, by hand).</summary>
        public static int TileStep(int at, int dx, int dy)
        {
            if (dx != 0) return at < 3 ? (at + dx + 3) % 3 : 3 + ((at - 3 + dx + 2) % 2);
            if (dy > 0 && at < 3) return at == 2 ? 4 : 3;
            if (dy < 0 && at >= 3) return at == 3 ? 0 : 2;
            return at;
        }

        // ---- a mode's circuit screen ----

        static T Turn<T>(IList<T> list, T now, int by)
        {
            int i = Math.Max(0, list.IndexOf(now));
            return list[((i + by) % list.Count + list.Count) % list.Count];
        }

        static float Nearest(float[] list, float v) => list.OrderBy(x => Mathf.Abs(x - v)).First();

        static readonly string[] WeatherAbout = { "SUN ALL RACE", "A DAMP TRACK, LESS GRIP", "RAIN: INTERS OR WETS", "IT MAY RAIN, OR DRY OUT" };

        public List<MenuRow> CircuitRows()
        {
            var team = Field.Teams[Team];
            var weathers = Mode == "race" ? new[] { WeatherChoice.Dry, WeatherChoice.Damp, WeatherChoice.Wet, WeatherChoice.Changeable } : new[] { WeatherChoice.Dry, WeatherChoice.Damp, WeatherChoice.Wet };
            var rows = new List<MenuRow>
            {
                new MenuRow { Label = "CIRCUIT", Value = NameOf(CircuitId), About = AboutOf(CircuitId), Left = () => Circuit = (Circuit + ids.Count - 1) % ids.Count, Right = () => Circuit = (Circuit + 1) % ids.Count, Pick = () => Asked = Go.Play },
                new MenuRow { Label = "TEAM", Value = team.Name.ToUpperInvariant(), About = string.Join(" · ", team.Drivers), Swatch = new[] { team.Body, team.Trim }.Concat(team.Accent >= 0 ? new[] { team.Accent } : new int[0]).ToArray(),
                    Left = () => Team = (Team + Field.Teams.Length - 1) % Field.Teams.Length, Right = () => Team = (Team + 1) % Field.Teams.Length },
                new MenuRow { Label = "WEATHER", Value = WeatherLooks.Name(Weather), About = WeatherAbout[(int)Weather], Left = () => Weather = Turn(weathers, Weather, -1), Right = () => Weather = Turn(weathers, Weather, 1) },
            };
            if (Mode == "race")
            {
                rows.Add(new MenuRow { Label = "QUALIFYING", Value = Qualifying ? "ON" : "OFF", About = Qualifying ? "ONE FLYING LAP SETS YOUR GRID SLOT" : "START MID-GRID", Left = () => Qualifying = !Qualifying, Right = () => Qualifying = !Qualifying });
                rows.Add(new MenuRow { Label = "LAPS", Value = $"{Laps}", About = Laps <= 2 ? "A DASH" : Laps <= 5 ? "A SPRINT" : Laps <= 10 ? "A RACE" : "A LONG ONE: TYRES AND STOPS", Left = () => Laps = Turn(LapChoices, Laps, -1), Right = () => Laps = Turn(LapChoices, Laps, 1) });
            }
            rows.Add(new MenuRow { Label = Mode == "race" ? "RACE" : "GO", Button = true, Pick = () => Asked = Go.Play });
            rows.Add(new MenuRow { Label = "BACK", Button = true, Pick = () => Open(Screen.Modes, Mode == "race" ? 1 : 2) });
            return rows;
        }

        // ---- the settings ----

        public List<MenuRow> SettingsRows()
        {
            var d = Field.Difficulties[Difficulty];
            bool walk = PlayerPrefs.GetInt("gridWalk", 1) != 0;
            var rows = new List<MenuRow>
            {
                new MenuRow { Label = "DIFFICULTY", Value = d.Name, About = (d.About ?? "").ToUpperInvariant(), Left = () => Difficulty = (Difficulty + Field.Difficulties.Length - 1) % Field.Difficulties.Length, Right = () => Difficulty = (Difficulty + 1) % Field.Difficulties.Length },
                new MenuRow { Label = "GRID WALK", Value = walk ? "ON" : "SKIP", About = walk ? "THE CAMERA DOWN THE GRID BEFORE THE LIGHTS" : "STRAIGHT TO THE START LIGHTS", Left = ToggleWalk, Right = ToggleWalk },
                new MenuRow { Label = "UI SCALE", Value = HudView.UiScale == 0 ? "AUTO" : $"{Mathf.RoundToInt(HudView.UiScale * 100)}%", About = "THE HUD AND THE TABLES: AUTO FITS THE WINDOW", Left = () => HudView.UiScale = Turn(HudView.UiScales, Nearest(HudView.UiScales, HudView.UiScale), -1), Right = () => HudView.UiScale = Turn(HudView.UiScales, Nearest(HudView.UiScales, HudView.UiScale), 1) },
                new MenuRow { Label = "MINIMAP", Value = HudView.MapScale < 1.25f ? "SMALL" : HudView.MapScale < 1.75f ? "LARGE" : "HUGE", About = "THE MAP AND THE TIMING TOWER, TOP RIGHT", Left = () => HudView.MapScale = Turn(HudView.MapScales, Nearest(HudView.MapScales, HudView.MapScale), -1), Right = () => HudView.MapScale = Turn(HudView.MapScales, Nearest(HudView.MapScales, HudView.MapScale), 1) },
                new MenuRow { Label = "NAME", Value = Profile.Initials ?? "---", About = "THREE LETTERS, FOR THE WORLD BOARDS", Pick = () => { Edit = new HudView.NameEdit(Profile.Initials); Open(Screen.Name); } },
            };
            if (Backend.Online)
            {
                rows.Add(new MenuRow { Label = "STATS", Value = Profile.StatsOn ? "SHARE" : "OFF", About = Profile.StatsOn ? "ANONYMOUS PLAY COUNTS, TO IMPROVE THE GAME" : "NOTHING SENT", Left = ToggleStats, Right = ToggleStats });
                rows.Add(new MenuRow { Label = "PLAYER ID", Value = Profile.PlayerId.Substring(0, 8).ToUpperInvariant(), About = "QUOTE IT TO HAVE YOUR ENTRIES REMOVED" });
            }
            rows.Add(new MenuRow { Label = "BACK", Button = true, Pick = () => Open(Screen.Modes, 3) });
            return rows;
        }

        static void ToggleWalk() => PlayerPrefs.SetInt("gridWalk", PlayerPrefs.GetInt("gridWalk", 1) != 0 ? 0 : 1);
        static void ToggleStats() => Profile.StatsOn = !Profile.StatsOn;

        public static string Version => $"VERSION {Application.version.ToUpperInvariant()}";

        /// <summary>Up and down among `count` rows (wrapping), left and right on the one highlighted, A to pick it, B to go back.</summary>
        public void Steer(List<MenuRow> rows, GameInput input, Action back)
        {
            if (rows.Count == 0) return;
            Focus = Mathf.Clamp(Focus, 0, rows.Count - 1);
            if (input.NavY != 0) Focus = (Focus + input.NavY + rows.Count) % rows.Count;
            var r = rows[Focus];
            if (input.NavX < 0) r.Left?.Invoke();
            if (input.NavX > 0) r.Right?.Invoke();
            if (input.AcceptPressed) (r.Pick ?? r.Right)?.Invoke();
            if (input.BackPressed) back();
        }
    }
}
