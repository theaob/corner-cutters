// Vehicle edits from the car editor (?demo=cars): per-class stat changes and
// paint palettes, saved on this device and applied to the game and demos here.
// "Copy" in the editor exports them as JSON so they can be made permanent in
// the class table (engine/driving.ts) and DEFAULT_COLORS below.

import { CAR_CLASS_IDS, STAT_KEYS, setStatOverrides, type CarClassId, type StatOverrides, type VehicleStats } from './driving';
import { storeKey } from './storage';

/** Paint colours each class can spawn in; the first is its showroom colour. */
export const DEFAULT_COLORS: Record<CarClassId, string[]> = {
  sedan: ['#f08a24', '#3d7fc4', '#e9e5dc', '#5b5566', '#c8323c'],
  taxi: ['#f2c14e'],
  muscle: ['#8a3cc8', '#1b1b26', '#d8323c', '#2f7a3a'],
  sports: ['#d8323c', '#f2c14e', '#f4f4f8', '#3d7fc4'],
  cop: ['#f4f4f8'],
  van: ['#e9e5dc', '#6f86a8', '#8a4b3c'],
  trash: ['#4f8a4a', '#3d5a80'],
  bus: ['#3d7fc4', '#c8323c'],
  pickup: ['#a8302a', '#3d5a80', '#e9e5dc', '#5b7a3a'],
  offroad: ['#5b7a3a', '#8a6a48', '#1b1b26'],
  tractor: ['#3f9a4c', '#c8323c', '#3d7fc4'],
  combine: ['#e9c46a', '#3f9a4c', '#c8323c'],
  f1: ['#d8323c', '#3d7fc4', '#1b1b26', '#f08a24', '#5fe0d0', '#f4f4f8'],
};

export interface VehicleEdit extends Partial<VehicleStats> {
  colors?: string[];
}
export type VehicleEdits = Partial<Record<CarClassId, VehicleEdit>>;

const KEY = () => storeKey('vehicles');
const HEX = /^#[0-9a-f]{6}$/i;

/** Keep only known classes, known stats with finite positive numbers, and #rrggbb colours. */
export function parseVehicleEdits(json: string | null): VehicleEdits {
  const out: VehicleEdits = {};
  if (!json) return out;
  let raw: unknown;
  try {
    raw = JSON.parse(json);
  } catch {
    return out;
  }
  if (!raw || typeof raw !== 'object') return out;
  for (const id of CAR_CLASS_IDS) {
    const r = (raw as Record<string, unknown>)[id];
    if (!r || typeof r !== 'object') continue;
    const edit: VehicleEdit = {};
    for (const k of STAT_KEYS) {
      const v = (r as Record<string, unknown>)[k];
      if (typeof v === 'number' && Number.isFinite(v) && v >= 0) edit[k] = v;
    }
    const colors = (r as Record<string, unknown>).colors;
    if (Array.isArray(colors)) {
      const ok = colors.filter((c): c is string => typeof c === 'string' && HEX.test(c)).map((c) => c.toLowerCase());
      if (ok.length) edit.colors = ok;
    }
    if (Object.keys(edit).length) out[id] = edit;
  }
  return out;
}

/** The stat part of the edits, for the driving rules. */
export function statOverrides(edits: VehicleEdits): StatOverrides {
  const out: StatOverrides = {};
  for (const id of CAR_CLASS_IDS) {
    const e = edits[id];
    if (!e) continue;
    const { colors: _colors, ...stats } = e;
    if (Object.keys(stats).length) out[id] = stats;
  }
  return out;
}

export function vehicleColors(id: CarClassId, edits: VehicleEdits): string[] {
  return edits[id]?.colors ?? DEFAULT_COLORS[id];
}

/** Read this device's edits and apply the stats to the driving rules. */
export function loadVehicleEdits(): VehicleEdits {
  let json: string | null = null;
  try {
    json = localStorage.getItem(KEY());
  } catch {
    // storage unavailable: no edits
  }
  const edits = parseVehicleEdits(json);
  setStatOverrides(statOverrides(edits));
  return edits;
}

/** Save and apply. */
export function saveVehicleEdits(edits: VehicleEdits): void {
  setStatOverrides(statOverrides(edits));
  try {
    localStorage.setItem(KEY(), JSON.stringify(edits));
  } catch {
    // storage unavailable: edits last until the page closes
  }
}
