// The menus, as the web game has them (src/f1/circuitSelect.ts chooseCircuit, menuTiles.ts, settingsRows.ts,
// screens/carShop.ts, screens/championship.ts): the title, the modes as tiles (DAILY CHALLENGE, QUICK RACE,
// CHAMPIONSHIP, TIME ATTACK, TIME TRIAL; SETTINGS and SHOP small under them), the Championship's season screen, a mode's circuit screen (the circuit, then its rows: TEAM, WEATHER, QUALIFYING, LAPS), the
// settings, the shop and your name. Played with the keys, a pad or the mouse: up and down move between the rows, left
// and right change a row, A or ENTER picks, B or ESC goes back. What's picked is kept (PlayerPrefs) for next time.
using CornerCutters.Core;
using System;
using System.Collections.Generic;
using System.Linq;
using UnityEngine;
using UnityEngine.InputSystem;

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
        /// <summary>a country's flag to show before the value (a circuit's)</summary>
        public Texture2D Flag;
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
        public enum Screen { Title, Modes, Circuit, Settings, Shop, Name, Season, Keys }

        /// <summary>What the menu wants done.</summary>
        public enum Go { None, Play, Daily, Round, NewSeason, Resume }

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
        /// <summary>a Quick Race for two, split screen (the second player on a pad)</summary>
        public bool TwoPlayers = PlayerPrefs.GetInt("menu.players", 1) == 2;
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
            if (Array.IndexOf(Modes, Mode) < 1 || Mode == "championship") Mode = "race";
            var index = Resources.Load<TextAsset>("Circuits/index");
            if (index != null && Json.Parse(index.text) is List<object> list)
                foreach (var o in list)
                    if (o is Dictionary<string, object> d && d.TryGetValue("id", out var id) && id is string s)
                    {
                        about[s] = (d.TryGetValue("name", out var n) ? (n as string ?? s) : s, d.TryGetValue("country", out var c) ? c as string : null, d.TryGetValue("about", out var a) ? a as string : null);
                        if (d.TryGetValue("free", out var f) && f is bool fb && fb) free.Add(s);
                    }
        }

        public string CircuitId => ids[Circuit];
        public string NameOf(string id) => (about.TryGetValue(id, out var a) ? a.name : id).ToUpperInvariant();
        public string AboutOf(string id) => about.TryGetValue(id, out var a) ? (a.country ?? "").ToUpperInvariant() : "";

        static readonly Dictionary<string, Texture2D> flags = new Dictionary<string, Texture2D>();

        /// <summary>The flag of the country a circuit's in (flags.ts's, drawn by tools/unity/flags.ts into Resources/Flags), or none: a circuit of our own.</summary>
        public Texture2D FlagOf(string id)
        {
            if (!about.TryGetValue(id, out var a) || string.IsNullOrEmpty(a.country)) return null;
            if (!flags.TryGetValue(a.country, out var tex)) flags[a.country] = tex = Resources.Load<Texture2D>("Flags/" + a.country);
            return tex;
        }

        public void Keep()
        {
            PlayerPrefs.SetString("menu.mode", Mode);
            PlayerPrefs.SetInt("menu.team", Team);
            PlayerPrefs.SetInt("weather", (int)Weather);
            PlayerPrefs.SetInt("menu.qualifying", Qualifying ? 1 : 0);
            PlayerPrefs.SetInt("menu.laps", Laps);
            PlayerPrefs.SetInt("menu.difficulty", Difficulty);
            PlayerPrefs.SetInt("menu.players", TwoPlayers ? 2 : 1);
            PlayerPrefs.SetInt("season.qualifying", SeasonQualifying ? 1 : 0);
            PlayerPrefs.SetInt("season.laps", SeasonLaps);
        }

        public void Open(Screen s, int focus = 0)
        {
            At = s;
            Focus = focus;
        }

        // ---- the modes ----

        public static readonly string[] Modes = { "daily", "race", "championship", "timeattack", "timetrial" };
        /// <summary>the tiles' places: the modes (Modes' order), then SETTINGS and SHOP</summary>
        public const int SettingsTile = 5, ShopTile = 6, ResumeTile = 7;
        /// <summary>where the highlight starts on the modes: RESUME RACE if there's a race to go back to, else QUICK RACE</summary>
        public int FirstTile => Kept != null ? ResumeTile : 1;

        /// <summary>
        /// the race kept on the device to go back to (raceSave.ts), if it's sound: not too old, and a Championship round's
        /// still the season's next (else it's thrown away)
        /// </summary>
        public readonly KeptRace Kept = LoadKept();

        static KeptRace LoadKept()
        {
            var k = RaceSave.Parse(PlayerPrefs.GetString("race.kept", ""), DateTimeOffset.UtcNow.ToUnixTimeMilliseconds());
            if (k != null && k.Mode == "championship")
            {
                var s = Championship.Parse(PlayerPrefs.GetString("season", ""));
                if (s == null || s.Over || s.Round != k.Round || s.Rounds[s.Round] != k.Circuit) k = null;
            }
            if (k == null && PlayerPrefs.HasKey("race.kept")) PlayerPrefs.DeleteKey("race.kept");
            return k;
        }
        /// <summary>a mode's tile</summary>
        public static int TileOf(string mode) => Math.Max(1, Array.IndexOf(Modes, mode));
        /// <summary>a mode's name on its screen</summary>
        public static string TitleOf(string mode) => mode == "timeattack" ? "TIME ATTACK" : mode == "timetrial" ? "TIME TRIAL" : mode == "championship" ? "CHAMPIONSHIP" : "QUICK RACE";

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
                new MenuTile { Icon = "championship", Name = "CHAMPIONSHIP", Line = SeasonLine() },
                new MenuTile { Icon = "timeattack", Name = "TIME ATTACK", Line = "RACE THE CLOCK" },
                new MenuTile { Icon = "timetrial", Name = "TIME TRIAL", Line = "CHASE THE GHOST OF YOUR BEST LAP" },
                new MenuTile { Icon = "settings", Name = "SETTINGS", Small = true },
                new MenuTile { Icon = "shop", Name = "SHOP", Small = true },
            }.Concat(Kept != null ? new[] { new MenuTile { Icon = "flag", Name = $"RESUME · {Kept.LapLine()}", Small = true } } : new MenuTile[0]).ToList();
        }

        /// <summary>A tile picked.</summary>
        public void PickTile(int i)
        {
            if (i == 0) Asked = Go.Daily;
            else if (i == 2) Open(Screen.Season, Season != null && !Season.Over ? 0 : 1);
            else if (i >= 1 && i < Modes.Length)
            {
                Mode = Modes[i];
                if (Mode != "race" && Weather == WeatherChoice.Changeable) Weather = WeatherChoice.Dry;
                Open(Screen.Circuit);
            }
            else if (i == SettingsTile) { Open(Screen.Settings); Page = null; }
            else if (i == ShopTile) Open(Screen.Shop);
            else if (i == ResumeTile && Kept != null) Asked = Go.Resume;
        }

        /// <summary>The big tiles to a row (menuTiles.ts TILE_COLUMNS).</summary>
        public const int Columns = 3;

        /// <summary>
        /// Where the highlight goes on the tiles: the five modes three to a row (menuTiles.ts gridStep: left and right along
        /// a row, wrapping; up and down a row), SETTINGS and SHOP small in a row of their own under them.
        /// </summary>
        public static int TileStep(int at, int dx, int dy, int smalls = 2)
        {
            int bigs = Modes.Length;
            if (at >= bigs)
            {
                // (the small row: along it, or up to the last row of modes)
                if (dx != 0) return bigs + ((at - bigs + dx + smalls) % smalls);
                if (dy < 0) return Math.Min(bigs - 1, (bigs - 1) / Columns * Columns + (at - bigs) * 2);
                return at;
            }
            int row = at / Columns, rowStart = row * Columns, rowLen = Math.Min(Columns, bigs - rowStart);
            if (dx != 0) return rowStart + ((at - rowStart + dx + rowLen) % rowLen);
            if (dy > 0) return at + Columns < bigs ? at + Columns : rowStart + Columns >= bigs ? (at % Columns == 0 ? bigs : bigs + 1) : bigs - 1;
            if (dy < 0) return row > 0 ? at - Columns : at;
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
                new MenuRow { Label = "CIRCUIT", Value = NameOf(CircuitId), About = AboutOf(CircuitId), Flag = FlagOf(CircuitId), Left = () => Circuit = (Circuit + ids.Count - 1) % ids.Count, Right = () => Circuit = (Circuit + 1) % ids.Count, Pick = () => Asked = Go.Play },
                new MenuRow { Label = "TEAM", Value = team.Name.ToUpperInvariant(), About = string.Join(" · ", team.Drivers), Swatch = new[] { team.Body, team.Trim }.Concat(team.Accent >= 0 ? new[] { team.Accent } : new int[0]).ToArray(),
                    Left = () => Team = (Team + Field.Teams.Length - 1) % Field.Teams.Length, Right = () => Team = (Team + 1) % Field.Teams.Length },
                new MenuRow { Label = "WEATHER", Value = WeatherLooks.Name(Weather), About = WeatherAbout[(int)Weather], Left = () => Weather = Turn(weathers, Weather, -1), Right = () => Weather = Turn(weathers, Weather, 1) },
            };
            if (Mode == "race")
            {
                rows.Add(new MenuRow { Label = "PLAYERS", Value = TwoPlayers ? "2" : "1", About = TwoPlayers ? "SPLIT SCREEN · PLAYER 2 ON A PAD" : "JUST YOU", Left = () => TwoPlayers = !TwoPlayers, Right = () => TwoPlayers = !TwoPlayers });
                if (!TwoPlayers) rows.Add(new MenuRow { Label = "QUALIFYING", Value = Qualifying ? "ON" : "OFF", About = Qualifying ? "ONE FLYING LAP SETS YOUR GRID SLOT" : "START MID-GRID", Left = () => Qualifying = !Qualifying, Right = () => Qualifying = !Qualifying });
                rows.Add(new MenuRow { Label = "LAPS", Value = $"{Laps}", About = Laps <= 2 ? "A DASH" : Laps <= 5 ? "A SPRINT" : Laps <= 10 ? "A RACE" : "A LONG ONE: TYRES AND STOPS", Left = () => Laps = Turn(LapChoices, Laps, -1), Right = () => Laps = Turn(LapChoices, Laps, 1) });
            }
            rows.Add(new MenuRow { Label = Mode == "race" ? "RACE" : "GO", Button = true, Pick = () => Asked = Go.Play });
            rows.Add(new MenuRow { Label = "BACK", Button = true, Pick = () => Open(Screen.Modes, TileOf(Mode)) });
            return rows;
        }

        // ---- the Championship (screens/championship.ts) ----

        /// <summary>the season in progress (or just over), kept on the device; null: none yet</summary>
        public Season Season = Championship.Parse(PlayerPrefs.GetString("season", ""));
        /// <summary>a new season's choices: qualifying, each round's laps</summary>
        public bool SeasonQualifying = PlayerPrefs.GetInt("season.qualifying", 1) != 0;
        public int SeasonLaps = PlayerPrefs.GetInt("season.laps", Championship.SprintLaps) == Championship.GrandPrixLaps ? Championship.GrandPrixLaps : Championship.SprintLaps;
        /// <summary>NEW SEASON picked once over a season in progress: picked again, it's thrown away</summary>
        bool sure;

        /// <summary>The Championship tile's line: the round next, or what it is.</summary>
        string SeasonLine()
        {
            if (Season == null) return "A SEASON ACROSS EVERY CIRCUIT: WIN THE TITLE";
            if (Season.Over) return "THE SEASON'S OVER: START ANOTHER";
            return $"ROUND {Season.Round + 1} OF {Season.Rounds.Count} · {NameOf(Season.Rounds[Season.Round])}";
        }

        static readonly string[] DrivingNames = { "AUTO", "POINT", "STEER" };
        static readonly string[] DrivingAbout = { "TOUCH POINTS THE WAY · KEYS AND PADS STEER", "THE CAR GOES WHERE YOU POINT", "TOUCH: A SLIDER, GAS AND BRAKE · KEYS AND PADS STEER" };
        static void TurnDriving(int by) => TouchDeck.Style = (DriveStyle)(((int)TouchDeck.Style + by + 3) % 3);

        /// <summary>The season screen's rows: the next round, then a new season's (team, qualifying, length), and BACK.</summary>
        public List<MenuRow> SeasonRows()
        {
            var rows = new List<MenuRow>();
            var s = Season;
            if (s != null && !s.Over)
            {
                string next = s.Rounds[s.Round];
                var w = Forecast.Round(Championship.RoundSeed(s, s.Round), 1);
                rows.Add(new MenuRow { Label = $"RACE ROUND {s.Round + 1}", Button = true, About = $"{NameOf(next)} · FORECAST: {w.Name}", Pick = () => Asked = Go.Round });
            }
            var team = Field.Teams[Team];
            rows.Add(new MenuRow { Label = "TEAM", Value = team.Name.ToUpperInvariant(), About = "FOR A NEW SEASON", Swatch = new[] { team.Body, team.Trim }.Concat(team.Accent >= 0 ? new[] { team.Accent } : new int[0]).ToArray(),
                Left = () => Team = (Team + Field.Teams.Length - 1) % Field.Teams.Length, Right = () => Team = (Team + 1) % Field.Teams.Length });
            rows.Add(new MenuRow { Label = "QUALIFYING", Value = SeasonQualifying ? "ON" : "OFF", About = SeasonQualifying ? "A FLYING LAP BEFORE EACH ROUND" : "START MID-GRID", Left = () => SeasonQualifying = !SeasonQualifying, Right = () => SeasonQualifying = !SeasonQualifying });
            rows.Add(new MenuRow { Label = "LENGTH", Value = Championship.LengthName(SeasonLaps), About = $"{SeasonLaps} LAPS A ROUND", Left = ToggleLength, Right = ToggleLength });
            bool running = s != null && !s.Over && s.Round > 0;
            rows.Add(new MenuRow { Label = sure ? "SURE? PICK AGAIN" : "NEW SEASON", Button = true, Pick = () =>
            {
                if (running && !sure) { sure = true; return; }
                sure = false;
                Asked = Go.NewSeason;
            } });
            rows.Add(new MenuRow { Label = "BACK", Button = true, Pick = () => { sure = false; Open(Screen.Modes, 2); } });
            return rows;
        }

        void ToggleLength() => SeasonLaps = SeasonLaps == Championship.GrandPrixLaps ? Championship.SprintLaps : Championship.GrandPrixLaps;

        /// <summary>The rounds of a new season: every circuit but the free ones (layouts.ts CHAMPIONSHIP_LAYOUTS), in order.</summary>
        public List<string> SeasonRounds() => ids.Where(id => !free.Contains(id)).ToList();
        readonly HashSet<string> free = new HashSet<string>();

        /// <summary>The standings, as the season screen lists them: place, name, team, points (you in gold).</summary>
        public List<(string place, string name, string team, string points, bool you)> StandingRows()
        {
            var s = Season;
            if (s == null) return null;
            return Championship.Standings(s).Select((r, i) =>
            {
                var d = s.Drivers[r.Driver];
                return ($"{i + 1}", r.Driver == s.You ? (Profile.Initials ?? "YOU") : d.Name, Championship.TeamOf(d).Code, $"{r.Points}", r.Driver == s.You);
            }).ToList();
        }

        /// <summary>The season screen's title: the round next, or the champion.</summary>
        public string SeasonTitle()
        {
            var s = Season;
            if (s == null) return "CHAMPIONSHIP";
            if (!s.Over) return $"CHAMPIONSHIP · ROUND {s.Round + 1} OF {s.Rounds.Count}";
            var top = Championship.Standings(s)[0];
            return top.Driver == s.You ? "YOU ARE THE CHAMPION!" : $"CHAMPION: {s.Drivers[top.Driver].Name}";
        }

        // ---- the settings ----

        /// <summary>the settings' page open (null: the list of them), as the web game's settings pages (settingsRows.ts)</summary>
        public string Page;
        public static readonly string[] Pages = { "controls", "game", "sound", "access", "privacy" };
        static readonly string[] PageNames = { "CONTROLS", "GAME", "SOUND", "ACCESSIBILITY", "PRIVACY & DATA" };
        static readonly string[] PageAbout = { "KEYS, TOUCH, VIBRATION", "DIFFICULTY, NAME, GRAPHICS, THE SCREEN", "ENGINES AND MUSIC", "TEXT, COLOURS, MOTION, SHAKE", "THE PAGES, STATS, YOUR ID" };
        /// <summary>the game page's NAME row (the name screen comes back to it)</summary>
        public const int NameRow = 1;
        /// <summary>the controls page's KEYS row (the keys screen comes back to it)</summary>
        public const int KeysRow = 0;
        public const string PrivacyUrl = "https://theaob.github.io/corner-cutters/privacy.html", TermsUrl = "https://theaob.github.io/corner-cutters/terms.html";

        public string SettingsTitle => Page == null ? "SETTINGS" : PageNames[Array.IndexOf(Pages, Page)];

        /// <summary>B on the settings: from a page back to the list (on that page's row), from the list back to the modes.</summary>
        public void SettingsBack()
        {
            if (Page == null) { Open(Screen.Modes, SettingsTile); return; }
            int at = Array.IndexOf(Pages, Page);
            Page = null;
            Focus = at;
        }

        /// <summary>Back to the settings' page `page`, on row `row` (from the name or the keys screen).</summary>
        public void OpenPage(string page, int row)
        {
            Open(Screen.Settings, row);
            Page = page;
        }

        public List<MenuRow> SettingsRows()
        {
            var rows = new List<MenuRow>();
            if (Page == null)
            {
                for (int i = 0; i < Pages.Length; i++)
                {
                    string page = Pages[i];
                    rows.Add(new MenuRow { Label = PageNames[i], About = PageAbout[i], Button = true, Pick = () => { Page = page; Focus = 0; } });
                }
                rows.Add(new MenuRow { Label = "BACK", Button = true, Pick = SettingsBack });
                return rows;
            }
            switch (Page)
            {
                case "controls":
                    rows.Add(new MenuRow { Label = "KEYS", Value = "CHANGE", About = "THE KEYS AND PAD BUTTONS YOU DRIVE WITH", Pick = () => { Open(Screen.Keys); Listening = -1; } });
                    // (the touch screen's: how the thumb drives, and which side the stick sits; the web game's settings.driving and stick side)
                    rows.Add(new MenuRow { Label = "DRIVING", Value = DrivingNames[(int)TouchDeck.Style], About = DrivingAbout[(int)TouchDeck.Style], Left = () => TurnDriving(-1), Right = () => TurnDriving(1) });
                    rows.Add(new MenuRow { Label = "STICK", Value = TouchDeck.StickRight ? "RIGHT" : "LEFT", About = TouchDeck.StickRight ? "THUMBSTICK RIGHT · A AND B LEFT" : "THUMBSTICK LEFT · A AND B RIGHT", Left = () => TouchDeck.StickRight = !TouchDeck.StickRight, Right = () => TouchDeck.StickRight = !TouchDeck.StickRight });
                    rows.Add(new MenuRow { Label = "VIBRATION", Value = Options.Vibration ? "ON" : "OFF", About = Options.Vibration ? "CRASHES, GRASS, KERBS: THE PAD OR THE PHONE" : "NO BUZZING", Left = ToggleVibration, Right = ToggleVibration });
                    break;
                case "game":
                    {
                        var d = Field.Difficulties[Difficulty];
                        bool walk = PlayerPrefs.GetInt("gridWalk", 1) != 0;
                        var g = Options.Graphics;
                        rows.Add(new MenuRow { Label = "DIFFICULTY", Value = d.Name, About = (d.About ?? "").ToUpperInvariant(), Left = () => Difficulty = (Difficulty + Field.Difficulties.Length - 1) % Field.Difficulties.Length, Right = () => Difficulty = (Difficulty + 1) % Field.Difficulties.Length });
                        rows.Add(new MenuRow { Label = "NAME", Value = Profile.Initials ?? "---", About = "THREE LETTERS, FOR THE WORLD BOARDS", Pick = () => { Edit = new HudView.NameEdit(Profile.Initials); Open(Screen.Name); } });
                        rows.Add(new MenuRow { Label = "GRAPHICS", Value = GraphicsNames[(int)g], About = GraphicsAbout[(int)g], Left = () => Options.Graphics = (GraphicsSetting)(((int)g + 3) % 4), Right = () => Options.Graphics = (GraphicsSetting)(((int)g + 1) % 4) });
                        rows.Add(new MenuRow { Label = "GRID WALK", Value = walk ? "ON" : "SKIP", About = walk ? "THE CAMERA DOWN THE GRID BEFORE THE LIGHTS" : "STRAIGHT TO THE START LIGHTS", Left = ToggleWalk, Right = ToggleWalk });
                        rows.Add(new MenuRow { Label = "UI SCALE", Value = HudView.UiScale == 0 ? "AUTO" : $"{Mathf.RoundToInt(HudView.UiScale * 100)}%", About = "THE HUD AND THE TABLES: AUTO FITS THE WINDOW", Left = () => HudView.UiScale = Turn(HudView.UiScales, Nearest(HudView.UiScales, HudView.UiScale), -1), Right = () => HudView.UiScale = Turn(HudView.UiScales, Nearest(HudView.UiScales, HudView.UiScale), 1) });
                        rows.Add(new MenuRow { Label = "MINIMAP", Value = HudView.MapScale < 1.25f ? "SMALL" : HudView.MapScale < 1.75f ? "LARGE" : "HUGE", About = "THE MAP AND THE TIMING TOWER, TOP RIGHT", Left = () => HudView.MapScale = Turn(HudView.MapScales, Nearest(HudView.MapScales, HudView.MapScale), -1), Right = () => HudView.MapScale = Turn(HudView.MapScales, Nearest(HudView.MapScales, HudView.MapScale), 1) });
                        break;
                    }
                case "sound":
                    rows.Add(new MenuRow { Label = "SOUND", Value = SoundOut.VolumeName(SoundOut.SoundVolume), About = SoundOut.SoundVolume > 0 ? "ENGINES, TYRES, CRASHES, LIGHTS" : "SILENCE", Left = () => SoundOut.SoundVolume = SoundOut.Turn(SoundOut.SoundVolume, -1), Right = () => SoundOut.SoundVolume = SoundOut.Turn(SoundOut.SoundVolume, 1) });
                    rows.Add(new MenuRow { Label = "MUSIC", Value = SoundOut.VolumeName(SoundOut.MusicVolume), About = SoundOut.MusicVolume > 0 ? "MENU AND RACE TRACKS" : "SILENCE", Left = () => SoundOut.MusicVolume = SoundOut.Turn(SoundOut.MusicVolume, -1), Right = () => SoundOut.MusicVolume = SoundOut.Turn(SoundOut.MusicVolume, 1) });
                    break;
                case "access":
                    {
                        var m = Options.Motion;
                        rows.Add(new MenuRow { Label = "TEXT", Value = Options.LargeText ? "LARGE" : "NORMAL", About = Options.LargeText ? "MENUS AND MESSAGES A SIZE UP" : "THE STANDARD SIZE", Left = ToggleText, Right = ToggleText });
                        rows.Add(new MenuRow { Label = "COLOURS", Value = Options.ColourSafe ? "COLOUR-SAFE" : "STANDARD", About = Options.ColourSafe ? "SPLITS IN BLUE, WHITE, ORANGE, AND IN WORDS" : "SPLITS IN PURPLE, GREEN, AMBER", Left = ToggleColours, Right = ToggleColours });
                        rows.Add(new MenuRow { Label = "MOTION", Value = MotionNames[(int)m], About = MotionAbout[(int)m], Left = () => Options.Motion = (MotionSetting)(((int)m + 2) % 3), Right = () => Options.Motion = (MotionSetting)(((int)m + 1) % 3) });
                        rows.Add(new MenuRow { Label = "SCREEN SHAKE", Value = Options.Shake ? "ON" : "OFF", About = Options.Shake ? "CRASHES, KERBS AND GRASS SHAKE THE CAMERA" : "THE CAMERA STAYS STILL", Left = ToggleShake, Right = ToggleShake });
                        break;
                    }
                case "privacy":
                    rows.Add(new MenuRow { Label = "PRIVACY", Value = "OPEN", About = "WHAT THE GAME KEEPS, AND WHAT IT SENDS", Pick = () => Application.OpenURL(PrivacyUrl) });
                    rows.Add(new MenuRow { Label = "TERMS", Value = "OPEN", About = "THE RULES OF PLAYING AND OF THE BOARDS", Pick = () => Application.OpenURL(TermsUrl) });
                    if (Backend.Online)
                    {
                        rows.Add(new MenuRow { Label = "STATS", Value = Profile.StatsOn ? "SHARE" : "OFF", About = Profile.StatsOn ? "ANONYMOUS PLAY COUNTS, TO IMPROVE THE GAME" : "NOTHING SENT", Left = ToggleStats, Right = ToggleStats });
                        rows.Add(new MenuRow { Label = "PLAYER ID", Value = Profile.PlayerId.Substring(0, 8).ToUpperInvariant(), About = "PICK IT TO COPY IT: QUOTE IT TO HAVE YOUR ENTRIES REMOVED", Pick = () => GUIUtility.systemCopyBuffer = Profile.PlayerId });
                    }
                    break;
            }
            rows.Add(new MenuRow { Label = "BACK", Button = true, Pick = SettingsBack });
            return rows;
        }

        static readonly string[] GraphicsNames = { "AUTO", "HIGH", "LOW", "BATTERY SAVER" };
        static readonly string[] GraphicsAbout = { "STEPS DOWN BY ITSELF IF THE DEVICE STRUGGLES", "THE BEST PICTURE, HOWEVER THE DEVICE COPES", "A PLAINER PICTURE, SMOOTHER ON AN OLDER DEVICE", "A PLAINER PICTURE AT 30 FRAMES A SECOND" };
        static readonly string[] MotionNames = { "AUTO", "REDUCED", "FULL" };
        static readonly string[] MotionAbout = { "FOLLOWS THE DEVICE'S REDUCE-MOTION SETTING", "LESS MOVEMENT, WHATEVER THE DEVICE SAYS", "ALL THE MOVEMENT, WHATEVER THE DEVICE SAYS" };
        static void ToggleVibration()
        {
            Options.Vibration = !Options.Vibration;
            // (a buzz to feel it's on)
            Haptics.Vibrate(40, Gamepad.current != null ? InputSource.Gamepad : InputSource.Touch);
        }
        static void ToggleText() => Options.LargeText = !Options.LargeText;
        static void ToggleColours() => Options.ColourSafe = !Options.ColourSafe;
        static void ToggleShake() => Options.Shake = !Options.Shake;

        // ---- the keys (GameInput.Binds) ----

        /// <summary>the control waiting for a new key or button (-1: none), and whether on a pad</summary>
        public int Listening = -1;
        public bool ListenPad;
        public float ListenSince;

        public List<MenuRow> KeyRows(GameInput input)
        {
            var rows = new List<MenuRow>();
            for (int i = 0; i < input.Binds.Length; i++)
            {
                var b = input.Binds[i];
                int at = i;
                bool waiting = Listening == i;
                string value = waiting ? (ListenPad ? "PRESS A BUTTON" : "PRESS A KEY") : GameInput.Label(b.KeyPath) + (b.PadIndex >= 0 ? "  ·  " + GameInput.Label(b.PadPath) : "");
                string about = waiting ? (ListenPad ? "START KEEPS IT" : "ESC KEEPS IT") : b.PadIndex >= 0 ? "KEY · PAD BUTTON: PICK WITH THE ONE TO CHANGE" : "KEY: PICK IT TO CHANGE IT";
                rows.Add(new MenuRow { Label = b.Name, Value = value, About = about, Pick = () => Listen(at, input.Source == InputSource.Gamepad && input.Binds[at].PadIndex >= 0) });
            }
            rows.Add(new MenuRow { Label = "RESET ALL", Button = true, Pick = () => input.ResetBinds() });
            rows.Add(new MenuRow { Label = "BACK", Button = true, Pick = () => OpenPage("controls", KeysRow) });
            return rows;
        }

        void Listen(int i, bool pad)
        {
            Listening = i;
            ListenPad = pad;
            ListenSince = Time.unscaledTime;
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
