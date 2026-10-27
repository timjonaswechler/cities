import { describe, expect, it } from 'vitest';
import { generateCity } from '../src/model/generator';
import { DEFAULT_OPTIONS } from '../src/state';
import { warpCity } from '../src/warp';

describe('geometry editing', () => {
  it('visits vertices shared between adjacent layers only once', () => {
    const city = generateCity(DEFAULT_OPTIONS);
    const vertex = city.wall[0];
    city.gates = [vertex];
    const before = { ...vertex };
    warpCity(city, before, { x: 2, y: 3 }, 10, 'move');
    expect(vertex).toEqual({ x: before.x + 2, y: before.y + 3 });
    expect(city.gates[0]).toBe(vertex);
  });

  it('leaves distant geometry unchanged and applies a finite local transformation', () => {
    const city = generateCity(DEFAULT_OPTIONS);
    const distant = structuredClone(city.wards[city.wards.length - 1]);
    warpCity(city, { x: 0, y: 0 }, { x: 1, y: 1 }, 8, 'expand');
    expect(city.wards[city.wards.length - 1]).toEqual(distant);
    expect(JSON.stringify(city)).not.toMatch(/NaN|Infinity|null/);
  });

  it('allows undo snapshots to retain independent geometry and rejects invalid brush sizes', () => {
    const city = generateCity(DEFAULT_OPTIONS);
    const original = structuredClone(city);
    warpCity(city, { x: 0, y: 0 }, { x: 10, y: 0 }, 100, 'rotate');
    expect(city).not.toEqual(original);
    expect(original).toEqual(generateCity(DEFAULT_OPTIONS));
    const warped = structuredClone(city);
    warpCity(city, { x: 0, y: 0 }, { x: 10, y: 0 }, 0, 'move');
    expect(city).toEqual(warped);
  });
});
