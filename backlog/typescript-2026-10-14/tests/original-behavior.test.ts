import { describe, expect, it } from 'vitest';
import { generateCity, generateRandomCity, generateBlueprintCity, rerollNames } from '../src/model/generator';
import { adaptOriginalCity } from '../src/model/original-adapter';
import { createOriginalKernel } from '../src/original/kernel';
import { ORIGINAL_ASSETS } from '../src/original/assets';
import { cityQuery, DEFAULT_OPTIONS, readOptions } from '../src/state';
import type { CityOptions } from '../src/model/types';

describe('original interactive generation semantics', () => {
  it('uses the original configured blueprint and seed-derived coast angle for fixed-feature New/Rebuild', () => {
    const options = { ...DEFAULT_OPTIONS, coast: true, river: true, greens: true, sea: 0 };
    const kernel = createOriginalKernel({ assets: ORIGINAL_ASSETS, preferences: {
      random: false, green: options.greens, gates: options.gates,
      citadel: options.citadel, urban_castle: options.urban_castle,
      plaza: options.plaza, temple: options.temple, walls: options.walls,
      shantytown: options.shantytown, coast: options.coast, river: options.river,
    } });
    kernel.Random.reset(options.seed);
    const blueprint = kernel.Blueprint.create(options.size, options.seed);
    expect(Number.isNaN(blueprint.coastDir)).toBe(true);
    const raw = new kernel.City(blueprint);
    const expectedOptions = { ...options, sea: blueprint.coastDir };
    const actual = generateBlueprintCity(options, false);
    expect(actual.options.sea).not.toBe(options.sea);
    expect(actual).toEqual(adaptOriginalCity(raw, expectedOptions, kernel.Trees));
    expect(generateCity(readOptions(cityQuery(actual.options)))).toEqual(actual);
  });

  it.each([
    { size: 10, seed: 1, greens: false, hub: false },
    { size: 25, seed: 42, greens: true, hub: true },
    { size: 50, seed: 924709892, greens: false, hub: false },
  ])('uses the original random blueprint and reproduces its full projected city for %j', (settings) => {
    const input = { ...DEFAULT_OPTIONS, ...settings };
    const kernel = createOriginalKernel({ assets: ORIGINAL_ASSETS, preferences: {
      random: true, green: input.greens, gates: input.gates, hub: input.hub,
    } });
    kernel.Random.reset(input.seed);
    const blueprint = kernel.Blueprint.create(input.size, input.seed);
    expect(Number.isNaN(blueprint.coastDir)).toBe(true);
    const raw = new kernel.City(blueprint);
    const expectedOptions: CityOptions = {
      size: blueprint.size, seed: blueprint.seed,
      citadel: blueprint.citadel, urban_castle: blueprint.inner,
      plaza: blueprint.plaza, temple: blueprint.temple, walls: blueprint.walls,
      shantytown: blueprint.shanty, coast: blueprint.coast, river: blueprint.river,
      greens: blueprint.greens, gates: blueprint.gates, hub: blueprint.hub,
    };
    if (blueprint.coast) expectedOptions.sea = blueprint.coastDir;
    const expected = adaptOriginalCity(raw, expectedOptions, kernel.Trees);
    const actual = generateRandomCity(input);
    expect(actual).toEqual(expected);
    expect(generateCity(readOptions(cityQuery(actual.options)))).toEqual(actual);
  });

  it('treats Maximum as the original hub mode rather than a fixed thirty gates', () => {
    const options = { ...DEFAULT_OPTIONS, hub: true, gates: -1 };
    const kernel = createOriginalKernel({ assets: ORIGINAL_ASSETS, query: Object.fromEntries(new URLSearchParams(cityQuery(options))) });
    const blueprint = kernel.Blueprint.fromURL();
    expect(blueprint.hub).toBe(true);
    expect(blueprint.gates).toBe(-1);
    const raw = new kernel.City(blueprint);
    expect(generateCity(options)).toEqual(adaptOriginalCity(raw, options, kernel.Trees));
  });

  it.each([
    { size: 2, citadel: false, plaza: false, temple: false, walls: false },
    { size: 25 },
  ])('restores the named blueprint after cloning and uses the current town name for %j', (settings) => {
    const originalName = 'Founders';
    const options = { ...DEFAULT_OPTIONS, ...settings };
    const live = generateCity(options, originalName);
    const clone = structuredClone(live);
    const kernel = createOriginalKernel({ assets: ORIGINAL_ASSETS, query: Object.fromEntries(new URLSearchParams(cityQuery(options, originalName))) });
    const raw = new kernel.City(kernel.Blueprint.fromURL());
    raw.name = 'Renamed';
    kernel.Random.reset(37);
    kernel.Namer.reset();
    kernel.Namer.nameDistricts(raw);
    const expected = raw.districts.map((district: { name: string }) => district.name);
    if (settings.size === 2) expect(expected).toEqual(['Renamed']);
    for (const city of [live, clone]) {
      const geometry = JSON.stringify(city.wards.map(ward => [ward.polygon, ward.buildings]));
      city.name = 'Renamed';
      rerollNames(city, 37, 'districts');
      expect(city.labels.map(label => label.text)).toEqual(expected);
      expect(city.originalGeometry?.districts.map(district => district.name)).toEqual(expected);
      expect(JSON.stringify(city.wards.map(ward => [ward.polygon, ward.buildings]))).toBe(geometry);
    }
  });
});
