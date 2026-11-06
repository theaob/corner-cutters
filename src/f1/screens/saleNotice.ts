// The Championship's sale told on the menu (the Google Play and App Store builds, to a player who hasn't bought it):
// a red strip across the top for as long as the sale lasts, and a modal, once, the first time the menu opens in it.
// Either one leads to the Championship. (The price is the store's own: purchase.ts says when to say so.)

import { SALE, markSaleSeen } from '../purchase';
import { t } from '../../engine/i18n';

/** The red strip over the menu: tapped, `go` (to the Championship). */
export function saleStrip(go: () => void): HTMLElement {
  const b = document.createElement('button');
  b.type = 'button';
  b.className = 'sale-strip';
  b.textContent = t('-{off}% CHAMPIONSHIP · UNTIL THE NEW YEAR', { off: SALE.off });
  b.addEventListener('click', go);
  return b;
}

/** The one-time modal over `host`: SEE IT calls `go`, NOT NOW just closes; gone too when `signal` aborts. */
export function saleModal(host: HTMLElement, go: () => void, signal?: AbortSignal): void {
  markSaleSeen();
  const box = document.createElement('div');
  box.className = 'sale-modal';
  box.setAttribute('role', 'dialog');
  const card = document.createElement('div');
  card.className = 'sale-card';
  const big = document.createElement('div');
  big.className = 'sale-big';
  big.textContent = `-${SALE.off}%`;
  const title = document.createElement('strong');
  title.textContent = t('CHAMPIONSHIP');
  const about = document.createElement('p');
  about.textContent = t('Crown the 2026 champion: a full season and every circuit, yours for good. On sale until the new year.');
  const row = document.createElement('div');
  row.className = 'sale-row';
  const button = (label: string, cls: string, then?: () => void) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = cls;
    b.textContent = label;
    b.addEventListener('click', () => {
      box.remove();
      then?.();
    });
    return b;
  };
  row.append(button(t('NOT NOW'), 'sale-no'), button(t('SEE IT'), 'sale-yes', go));
  card.append(big, title, about, row);
  box.append(card);
  host.append(box);
  signal?.addEventListener('abort', () => box.remove());
}
