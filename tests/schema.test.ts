// supabase/schema.sql is applied by hand, so nothing else notices when it falls behind the game. A circuit without a
// lap_floors row takes no laps on the boards (the anti-cheat drops them), and a platform the game reports that the
// table's check doesn't allow takes no events.

import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { LAYOUTS } from '../src/f1/layouts';

const schema = readFileSync(new URL('../supabase/schema.sql', import.meta.url), 'utf8');

describe('supabase/schema.sql', () => {
  it('has a lap_floors row for every circuit, and none for a circuit that is gone', () => {
    const block = schema.slice(schema.indexOf('insert into public.lap_floors'), schema.indexOf('on conflict (circuit)'));
    const floors = [...block.matchAll(/\('([a-z0-9-]+)',\s*[\d.]+\)/g)].map((m) => m[1]);
    expect([...floors].sort()).toEqual(LAYOUTS.map((l) => l.id).sort());
  });
  it('lets every platform the game reports through (web, android, ios), on events and reports', () => {
    expect(schema.match(/platform in \('web', 'android', 'ios'\)/g)?.length).toBe(4);
    expect(schema).not.toMatch(/platform in \('web', 'android'\)/);
  });
});
