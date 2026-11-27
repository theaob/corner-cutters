// The Championship won: the title's celebration (Core/TitleWin.cs, HudView.TitleWin.cs) over the season screen,
// with its fanfare and buzz, until A, START or a tap closes it (after 1.5 s).
using System.Linq;
using CornerCutters.Core;
using UnityEngine;

namespace CornerCutters.Game
{
    public sealed partial class RaceController
    {
        HudView.TitleCard titleCard;
        /// <summary>the second buzz, waiting for the chord</summary>
        float titleBuzzAt = -1;

        HudView.TitleCard TitleCardOf(Season s)
        {
            var table = Championship.Standings(s);
            var you = table[0];
            var t = Championship.TeamOf(s.Drivers[s.You]);
            int runnerUp = table.Count > 1 ? table[1].Points : 0;
            return new HudView.TitleCard
            {
                Team = t.Name, Body = t.Body, Trim = t.Trim, Still = Options.MotionReduced,
                Line = TitleWin.Line(you.Points, you.Wins, you.Points - runnerUp),
                How = $"{Lang.T((Field.DifficultyById(s.Difficulty) ?? Field.Normal).Name)} · {Lang.T(Championship.LengthName(s.Laps))} · {Lang.T("{n} ROUNDS", "n", s.Rounds.Count)}",
            };
        }

        void ShowTitle(HudView.TitleCard c)
        {
            titleCard = c;
            if (SoundOut.Synth != null) foreach (var n in TitleWin.Fanfare) Shots.Beep(SoundOut.Synth, n.hz, n.len, 0.07, Wave.Square, n.at);
            Haptics.Vibrate(TitleWin.Buzzes[0].ms, input.Source);
            titleBuzzAt = Time.unscaledTime + (float)TitleWin.Buzzes[1].at;
        }

        /// <summary>The title card's frame: A or START closes it; nothing else on the menu under it moves. True while it's up.</summary>
        bool TitleFrame()
        {
            if (titleCard == null) return false;
            if (titleBuzzAt >= 0 && Time.unscaledTime >= titleBuzzAt) { Haptics.Vibrate(TitleWin.Buzzes[1].ms, input.Source); titleBuzzAt = -1; }
            if (input.AcceptPressed || input.PausePressed) titleCard.Close();
            if (titleCard.Gone) titleCard = null;
            return true;
        }
    }
}
