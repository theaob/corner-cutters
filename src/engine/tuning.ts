// Live tuning panel for mechanic demos: sliders over the game screen that edit
// a plain object the demo reads every frame. Values persist per demo in
// localStorage, and "Copy" puts them on the clipboard as JSON for the spec.

import { storeKey } from './storage';

export interface Param {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
}

export type ParamSpec = Record<string, Param>;
export type Values<S extends ParamSpec> = { [K in keyof S]: number };

/** Clamp to [min, max] and snap to the step grid (starting at min). */
export function snap(p: Param, v: number): number {
  const clamped = Math.min(p.max, Math.max(p.min, v));
  const steps = Math.round((clamped - p.min) / p.step);
  return Number((p.min + steps * p.step).toFixed(6));
}

export function defaults<S extends ParamSpec>(spec: S): Values<S> {
  const out = {} as Values<S>;
  for (const k of Object.keys(spec) as (keyof S)[]) out[k] = spec[k].value;
  return out;
}

/** Merge saved JSON over defaults, ignoring unknown keys and non-numbers. */
export function restore<S extends ParamSpec>(spec: S, saved: string | null): Values<S> {
  const out = defaults(spec);
  if (!saved) return out;
  try {
    const parsed = JSON.parse(saved) as Record<string, unknown>;
    for (const k of Object.keys(spec) as (keyof S & string)[]) {
      const v = parsed[k];
      if (typeof v === 'number' && Number.isFinite(v)) out[k] = snap(spec[k], v);
    }
  } catch {
    // corrupt save: fall back to defaults
  }
  return out;
}

function storageGet(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function storageSet(key: string, value: string): void {
  try {
    localStorage.setItem(key, value);
  } catch {
    // storage unavailable (private mode etc.): tuning just won't persist
  }
}

/**
 * Mounts the tuning panel into `host` and returns the live values object.
 * The demo reads from it every frame; edits apply immediately.
 */
export function mountTuning<S extends ParamSpec>(host: HTMLElement, demoId: string, spec: S): Values<S> {
  const key = storeKey(`tune:${demoId}`);
  const values = restore(spec, storageGet(key));
  const save = () => storageSet(key, JSON.stringify(values));

  const toggle = document.createElement('button');
  toggle.className = 'tune-toggle';
  toggle.textContent = 'TUNE';
  toggle.setAttribute('aria-expanded', 'false');

  const panel = document.createElement('div');
  panel.className = 'tune-panel';
  panel.hidden = true;

  const rows: { input: HTMLInputElement; out: HTMLOutputElement; k: keyof S & string }[] = [];
  for (const k of Object.keys(spec) as (keyof S & string)[]) {
    const p = spec[k];
    const row = document.createElement('label');
    row.className = 'tune-row';
    const name = document.createElement('span');
    name.textContent = p.label;
    const input = document.createElement('input');
    input.type = 'range';
    input.min = String(p.min);
    input.max = String(p.max);
    input.step = String(p.step);
    input.value = String(values[k]);
    const out = document.createElement('output');
    out.textContent = String(values[k]);
    input.addEventListener('input', () => {
      values[k] = snap(p, Number(input.value));
      out.textContent = String(values[k]);
      save();
    });
    // Hide the panel while a slider is held so the change can be seen on the game;
    // it comes back when the finger (or mouse button) is released.
    input.addEventListener('pointerdown', () => panel.classList.add('peeking'));
    row.append(name, input, out);
    panel.append(row);
    rows.push({ input, out, k });
  }

  const actions = document.createElement('div');
  actions.className = 'tune-actions';
  const reset = document.createElement('button');
  reset.textContent = 'Reset';
  reset.addEventListener('click', () => {
    Object.assign(values, defaults(spec));
    for (const r of rows) {
      r.input.value = String(values[r.k]);
      r.out.textContent = String(values[r.k]);
    }
    save();
  });
  const copy = document.createElement('button');
  copy.textContent = 'Copy';
  copy.addEventListener('click', async () => {
    const json = JSON.stringify({ demo: demoId, ...values }, null, 2);
    try {
      await navigator.clipboard.writeText(json);
      copy.textContent = 'Copied';
    } catch {
      window.prompt('Tuned values', json);
    }
    setTimeout(() => (copy.textContent = 'Copy'), 1200);
  });
  actions.append(reset, copy);
  panel.append(actions);

  toggle.addEventListener('click', () => {
    panel.hidden = !panel.hidden;
    toggle.setAttribute('aria-expanded', String(!panel.hidden));
  });

  const endPeek = () => panel.classList.remove('peeking');
  window.addEventListener('pointerup', endPeek);
  window.addEventListener('pointercancel', endPeek);
  panel.addEventListener('change', endPeek);

  host.append(toggle, panel);
  return values;
}
