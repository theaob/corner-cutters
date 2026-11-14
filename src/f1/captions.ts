// The capture build's showreel captions (capture/?show&captions): short promotional lines over the footage, off unless
// the address asks. Plain text laid over the page, put up for a few seconds and faded out; nothing to press.

let box: HTMLElement | undefined;
let timer: ReturnType<typeof setTimeout> | undefined;

/** Whether this address asks for captions (?captions). */
export const captionsOn = (search: string): boolean => new URLSearchParams(search).has('captions');

/** Show `lines` (the first the biggest) for `secs`, in place of any caption up. */
export function showCaption(lines: string[], secs: number, doc: Document = document): void {
  if (!box) {
    box = doc.createElement('div');
    box.className = 'show-caption';
    box.setAttribute('aria-hidden', 'true');
    doc.body.append(box);
  }
  clearTimeout(timer);
  box.replaceChildren(...lines.map((text, i) => {
    const line = doc.createElement('div');
    line.className = i === 0 ? 'show-caption-title' : 'show-caption-line';
    line.textContent = text;
    return line;
  }));
  // (restarts the fade-in)
  box.classList.remove('on');
  void box.offsetWidth;
  box.classList.add('on');
  timer = setTimeout(() => box?.classList.remove('on'), secs * 1000);
}

/** What a set piece is called in a caption. */
export const placeCaption = (label: string, roof?: string): string =>
  label === 'PIT LANE' ? `${roof ? `${roof} ` : 'THE '}PIT LANE` : label.startsWith('JUMP') ? 'THE JUMP' : label.startsWith('BANKING') ? 'THE BANKING' : `THE ${label}`;
