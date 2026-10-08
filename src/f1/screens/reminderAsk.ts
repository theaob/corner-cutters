// The daily reminder asked for, once, over the menu (the app, after a first day's play: reminder.ts): YES at the
// suggested hour (Android then asks for leave to notify), or NO THANKS. Either way it's not asked again; the settings'
// DAILY REMINDER changes it later.

import { SUGGESTED_HOUR, setReminder } from '../reminder';

/** Ask, over `host`; gone once answered, or when `signal` aborts (the menu left). */
export function askReminder(host: HTMLElement, signal?: AbortSignal): void {
  const box = document.createElement('div');
  box.className = 'reminder-ask';
  box.setAttribute('role', 'dialog');
  const title = document.createElement('strong');
  title.textContent = 'A DAILY REMINDER?';
  const about = document.createElement('p');
  about.textContent = `A note at ${SUGGESTED_HOUR}:00 on a day you haven't played: the day's challenge, and your streak. Change it in the settings.`;
  const row = document.createElement('div');
  row.className = 'reminder-ask-row';
  const button = (label: string, cls: string, answer: () => void) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = cls;
    b.textContent = label;
    // (on the press's release, as every button in the game)
    let armed = false;
    b.addEventListener('pointerdown', () => (armed = true));
    b.addEventListener('pointerleave', () => (armed = false));
    b.addEventListener('pointerup', () => {
      if (!armed) return;
      armed = false;
      box.remove();
      answer();
    });
    return b;
  };
  row.append(
    button('NO THANKS', 'reminder-no', () => void setReminder('off')),
    button(`YES, AT ${SUGGESTED_HOUR}:00`, 'reminder-yes', () => void setReminder(SUGGESTED_HOUR)),
  );
  box.append(title, about, row);
  host.append(box);
  signal?.addEventListener('abort', () => box.remove());
}
