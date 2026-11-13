// The pause screen's contents: its buttons (RESUME, SKIP QUALIFYING, RESTART,
// SETTINGS, REPORT, EXIT), the settings from the pause screen (the menu's, but
// difficulty: each remembered as it changes), and in place of the buttons once
// EXIT is pressed, the question: leave? (STAY first, MAIN MENU beside it).

import { t as tr } from '../../engine/i18n';
import { YOUTUBE } from '../../engine/host';
import { menuPick } from '../sounds';
import { settingsPages, settingsRows } from '../settingsRows';
import { openReport } from '../report';
import { style } from './dom';

/** What the pause menu asks of the race around it. */
export interface PauseMenuDeps {
  host: HTMLElement;
  pauseScreen: HTMLElement;
  pauseTitle: HTMLElement;
  pauseButton: (label: string, action: () => void) => HTMLButtonElement;
  /** the race: RESUME, SKIP QUALIFYING (straight to the race), RESTART, and leaving (the MAIN MENU button) */
  resume: () => void;
  skipQualifying: () => void;
  restart: () => void;
  leave: () => void;
  /** the report's circuit and mode */
  reportOf: () => { circuit: string; mode: string };
  /** a qualifying session still going (SKIP is offered) */
  qualifying: () => boolean;
  /** 'race' | 'qualifying' | ... : what's left, and what leaving loses */
  session: () => string;
  championship: () => boolean;
  daily: () => boolean;
}

export function createPauseMenu(d: PauseMenuDeps) {
  const { host, pauseScreen, pauseTitle, pauseButton } = d;
  // the settings, from the pause screen: the menu's (but difficulty, not changed mid-race), each remembered as it
  // changes; tapped and swiped, or up/down and left/right on the deck, A, START or B back to the pause screen
  const pauseSettings = document.createElement('div');
  pauseSettings.className = 'circuit-menu pause-settings';
  // (the race still shows through, blurred: index.html .pause-settings; dark enough to read the rows on)
  style(pauseSettings, { zIndex: '5', display: 'none', justifyContent: 'center', background: 'rgba(8,8,14,.72)' });
  const pausePages = settingsPages(settingsRows(), () => openPauseSettings(false));
  pauseSettings.append(...pausePages.els);
  host.append(pauseSettings);
  /** the settings are up */
  let pauseSettingsOn = false;
  const openPauseSettings = (on: boolean) => {
    if (on === pauseSettingsOn) return;
    menuPick();
    pauseSettingsOn = on;
    pauseSettings.style.display = on ? 'flex' : 'none';
    // (the pause screen's buttons out of the way under it)
    pauseScreen.style.visibility = on ? 'hidden' : '';
    pausePages.reset();
  };
  // the pause screen's buttons, and in their place once EXIT is pressed, the question: leave? (STAY first)
  // qualifying's SKIP lives here (not on the deck): straight to the race, from mid-grid
  const skipQualifying = pauseButton('SKIP QUALIFYING', d.skipQualifying);
  const showSkipQualifying = () => {
    skipQualifying.style.display = d.session() === 'qualifying' && d.qualifying() && !asking ? '' : 'none';
  };
  const pauseMain = [
    pauseButton('RESUME', d.resume),
    skipQualifying,
    pauseButton('RESTART', d.restart),
    pauseButton('SETTINGS', () => openPauseSettings(true)),
    // a report: the race as it is (the pause screen out of the picture), to draw on and say what happened (not on
    // YouTube: it goes to the game's own backend)
    ...(YOUTUBE ? [] : [pauseButton('REPORT', () => void openReport(d.reportOf(), [pauseScreen]))]),
    pauseButton('EXIT', () => askExit(true)),
  ];
  const exitLine = document.createElement('div');
  style(exitLine, { color: '#9d9ab8', font: 'calc(11px * var(--ts, 1)) Silkscreen, monospace', textAlign: 'center', margin: '-4px 16px 6px', textWrap: 'balance' });
  const stayButton = pauseButton('STAY', () => askExit(false));
  const leaveButton = pauseButton('MAIN MENU', d.leave);
  style(leaveButton, { borderColor: '#d8323c', color: '#ff6b6b' });
  // (side by side, STAY on the left, wide enough for MAIN MENU on one line in larger text)
  const exitRow = document.createElement('div');
  style(exitRow, { width: '84%', maxWidth: '420px', gap: '10px' });
  for (const b of [stayButton, leaveButton]) style(b, { width: 'auto', flex: '1 1 0', whiteSpace: 'nowrap' });
  exitRow.append(stayButton, leaveButton);
  const exitParts = [exitLine, exitRow];
  const showExitParts = (on: boolean) => {
    for (const el of exitParts) el.style.display = on ? (el === exitRow ? 'flex' : '') : 'none';
  };
  /** EXIT pressed: asked once more (the button the deck's on: 0 STAY, 1 MAIN MENU) */
  let asking = false;
  let exitFocus = 0;
  const showExitFocus = () => {
    // (focused as every box in the menus is: a cyan edge, one pixel more round it; MAIN MENU's red)
    style(stayButton, { borderColor: exitFocus === 0 ? '#5fe0d0' : '#3a3858', boxShadow: exitFocus === 0 ? '0 0 0 1px #5fe0d0' : '' });
    leaveButton.style.boxShadow = exitFocus === 1 ? '0 0 0 1px #d8323c' : '';
  };
  /** What leaving loses, said under the question. */
  const exitCost = () => d.championship() ? "THE ROUND WON'T COUNT" : d.daily() ? 'THIS RUN WON\'T COUNT' : d.session() === 'race' || d.session() === 'qualifying' ? "THIS RACE WON'T COUNT" : 'BACK TO THE CIRCUITS';
  const askExit = (on: boolean) => {
    if (on === asking) return;
    if (on) menuPick();
    asking = on;
    pauseTitle.textContent = tr(!on ? 'PAUSED' : d.session() === 'race' || d.session() === 'qualifying' ? 'LEAVE THE RACE?' : 'LEAVE THE SESSION?');
    exitLine.textContent = tr(exitCost());
    for (const el of pauseMain) el.style.display = on ? 'none' : '';
    showSkipQualifying();
    showExitParts(on);
    exitFocus = 0;
    showExitFocus();
  };
  pauseScreen.append(pauseTitle, ...pauseMain, ...exitParts);
  showSkipQualifying();
  showExitParts(false);
  return {
    pauseSettings,
    pausePages,
    askExit,
    openPauseSettings,
    showSkipQualifying,
    /** the settings are up */
    get settingsOn() {
      return pauseSettingsOn;
    },
    /** the question is up */
    get asking() {
      return asking;
    },
    /** the deck's pick between STAY and MAIN MENU: 0 STAY, 1 MAIN MENU */
    get focus() {
      return exitFocus;
    },
    /** the deck moves between STAY and MAIN MENU */
    toggleFocus() {
      exitFocus = 1 - exitFocus;
      showExitFocus();
    },
  };
}
