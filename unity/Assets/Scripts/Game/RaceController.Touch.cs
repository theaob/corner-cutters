// The touch deck in the race (src/f1/race/deckLabels.ts and the deck calls in race.ts): what A, DRIFT, RESTART and
// PAUSE (or EXIT) do just now, told to the deck before it reads the touches; whether the stick (or the slider and
// pedals) is up; and the deck drawn over the HUD on a phone. EXIT goes back to the menu.
using CornerCutters.Core;

namespace CornerCutters.Game
{
    public sealed partial class RaceController
    {
        /// <summary>Tell the deck what its buttons do now (each frame, before the touches are read).</summary>
        void DeckFrame()
        {
            var d = input.Deck;
            if (race == null || menu != null || Split)
            {
                d.Shown = d.Driving = false;
                d.LabelA = d.LabelB = d.LabelStart = d.LabelSelect = "";
                return;
            }
            var me = Me.Progress;
            var st = new DeckState
            {
                Session = session == Session.Race ? DeckSession.Race
                    : session == Session.Qualifying || session == Session.QualiOver ? DeckSession.Qualifying
                    : session == Session.Trial ? DeckSession.TimeTrial : DeckSession.TimeAttack,
                ResultsUp = results != null || qualiTable != null || attackTable != null,
                RoundOver = season != null && results != null,
                QualifyingOver = session == Session.QualiOver,
                AttackOver = session == Session.AttackOver,
                Watching = panT.HasValue || replay != null,
                Done = me.Finished.HasValue || me.Retired,
                Paused = paused,
            };
            var (a, b, start, select) = DeckLabels.For(st);
            // (the ceremony on the podium: only SKIP; a table up: its own buttons take the taps)
            if (OnSet) { b = start = select = ""; a = "SKIP"; }
            bool tableShown = st.ResultsUp && !paused;
            d.LabelA = tableShown ? "" : a;
            d.LabelB = b;
            d.LabelStart = tableShown ? "" : start;
            d.LabelSelect = tableShown && select != "EXIT" ? "" : select;
            d.Shown = true;
            d.Driving = b == "DRIFT" && !OnSet;
            d.Dirt = race.Track.Dirt;
        }

        /// <summary>The deck over the HUD, on a phone.</summary>
        void DeckGUI()
        {
            if (HudView.Phone && input.Deck.Shown) hud.DrawDeck(input.Deck);
        }
    }
}
