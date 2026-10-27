import { describe, expect, it } from 'vitest';
import { generateCity, rerollNames } from '../src/model/generator';
import { createOriginalKernel } from '../src/original/kernel';
import { ORIGINAL_ASSETS } from '../src/original/assets';
import { DEFAULT_OPTIONS, cityQuery } from '../src/state';
import type { Point, Polygon } from '../src/model/types';

const defaults = { ...DEFAULT_OPTIONS };
function finite(value: unknown): boolean {
  if (typeof value === 'number') return Number.isFinite(value);
  if (Array.isArray(value)) return value.every(finite);
  if (value && typeof value === 'object') return Object.values(value).every(finite);
  return true;
}

describe('original generator integration', () => {
  it('retains the original RNG and independent per-city state', () => {
    const { Random } = createOriginalKernel({ assets: ORIGINAL_ASSETS });
    Random.reset(1);
    expect(Random.float()).toBe(48271 / 2147483647);
    expect(Random.float()).toBe(182605794 / 2147483647);
    expect(Random.float()).toBe(1291394886 / 2147483647);
    const first = generateCity(defaults);
    expect(first.name).toBe('Beggars Market');
    expect(first.labels).toHaveLength(6);
    expect(generateCity({ ...defaults, seed: 42 }).wards).not.toEqual(first.wards);
    expect(generateCity(defaults)).toEqual(first);
    expect(defaults).toEqual(DEFAULT_OPTIONS);
  });

  it('projects every original lot once, preserving order and unrounded coordinates', () => {
    const kernel = createOriginalKernel({ assets: ORIGINAL_ASSETS, query: Object.fromEntries(new URLSearchParams(cityQuery(defaults))) });
    const raw = new kernel.City(kernel.Blueprint.fromURL());
    const city = generateCity(defaults);
    const plain = (polygon: Polygon) => polygon.map(({ x, y }: Point) => ({ x, y }));
    for (const ward of city.wards) {
      const cell = raw.cells[ward.id];
      expect(ward.seed).toBe(cell.seed);
      expect(ward.polygon).toEqual(plain(cell.shape));
      if (ward.originalKind !== 'Alleys') continue;
      const group = cell.ward.group;
      const expected = group.core === cell.face ? group.blocks.flatMap((block: { lots: Polygon[] }) => block.lots.map(plain)) : [];
      expect(ward.buildings.map(building => building.polygon)).toEqual(expected);
    }
    expect(city.originalGeometry?.districts.map(district => district.name)).toEqual(raw.districts.map((district: { name: string }) => district.name));
    expect(city.gates).toEqual(raw.gates.map((gate: { point: Point }) => ({ x: gate.point.x, y: gate.point.y })));
    expect(city.options).toEqual(defaults);
  });

  it.each([
    { seed: 1, coast: true, river: true, greens: true },
    { seed: 42, coast: true, river: true },
    { seed: 48271, shantytown: true },
    { seed: 924709892, urban_castle: true },
    { seed: 2147483646, size: 5 },
    { seed: 12345, size: 200, gates: 30 },
  ])('keeps the complete projected geometry finite for %j', (overrides) => {
    const city = generateCity({ ...defaults, ...overrides });
    expect(finite(city)).toBe(true);
    expect(city.wards.length).toBeGreaterThan(0);
    expect(city.bounds.width).toBeGreaterThan(0);
    expect(city.bounds.height).toBeGreaterThan(0);
    expect(city.wards.flatMap(ward => ward.buildings).length).toBeGreaterThan(0);
    expect(city.originalGeometry).toBeDefined();
  }, 10000);

  it('retains original feature semantics, including automatically chosen gates and farm trees', () => {
    const plain = generateCity({ ...defaults, citadel: false, plaza: false, temple: false, walls: false });
    expect(plain.wall).toEqual([]);
    expect(plain.castleWall).toEqual([]);
    expect(plain.wards.some(ward => ['market', 'temple', 'castle'].includes(ward.kind))).toBe(false);
    const original = generateCity(defaults);
    expect(original.wards.filter(ward => ward.kind === 'castle')).toHaveLength(1);
    expect(original.wards.filter(ward => ward.kind === 'temple')).toHaveLength(1);
    expect(original.wards.filter(ward => ward.kind === 'market')).toHaveLength(1);
    expect(original.trees.length).toBeGreaterThan(0);
    expect(original.coast).toEqual([]);
    expect(original.river).toEqual([]);
    // The outer wall gets zero gates; the original keeps the citadel's gate.
    expect(generateCity({ ...defaults, gates: 0 }).gates).toHaveLength(1);
  });

  it('uses original naming without modifying geometry, including after an undo clone', () => {
    const city = structuredClone(generateCity(defaults));
    const geometry = () => JSON.stringify(city.wards.map(ward => [ward.polygon, ward.buildings]));
    const before = geometry();
    rerollNames(city, 2);
    expect(city.name).not.toBe('Beggars Market');
    expect(geometry()).toBe(before);
    expect(city.labels.map(label => label.text)).toEqual(city.originalGeometry?.districts.map(district => district.name));
    const name = city.name;
    rerollNames(city, 37, 'districts');
    expect(city.name).toBe(name);
  });

  it('rejects invalid requests before entering the original retry loop', () => {
    expect(() => generateCity({ ...defaults, seed: NaN })).toThrow(RangeError);
    expect(() => generateCity({ ...defaults, size: 0 })).toThrow(RangeError);
    expect(() => generateCity({ ...defaults, gates: -2 })).toThrow(RangeError);
  });
});
