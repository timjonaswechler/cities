import type { City, CityOptions } from './types';
import { createOriginalKernel } from '../original/kernel';
import { ORIGINAL_ASSETS } from '../original/assets';
import { adaptOriginalCity } from './original-adapter';

type Kernel = ReturnType<typeof createOriginalKernel>;
interface Session { kernel: Kernel; model: InstanceType<Kernel['City']> }
const sessions = new WeakMap<City, Session>();

function validateOptions(options: CityOptions): void {
  if (!Number.isSafeInteger(options.size) || options.size < 1) throw new RangeError('Size must be a positive integer.');
  if (!Number.isSafeInteger(options.seed) || options.seed < 1 || options.seed >= 2147483647) throw new RangeError('Seed must be between 1 and 2147483646.');
  if (!Number.isSafeInteger(options.gates) || options.gates < -1) throw new RangeError('Gates must be -1 or a nonnegative integer.');
  if (options.sea !== undefined && !Number.isFinite(options.sea)) throw new RangeError('Sea direction must be finite.');
}

function adaptSession(kernel: Kernel, model: Session['model'], options: CityOptions, name?: string): City {
  const city = adaptOriginalCity(model, options, kernel.Trees);
  if (name) city.generationName = name;
  sessions.set(city, { kernel, model });
  return city;
}

/** Run the original MFCG 0.11.5 algorithm with its URL blueprint semantics. */
export function generateCity(options: CityOptions, name?: string): City {
  validateOptions(options);
  const query = Object.fromEntries(Object.entries(options).map(([key, value]) => [key, typeof value === 'boolean' ? (value ? '1' : '0') : String(value)]));
  if (name) query.name = name;
  const kernel = createOriginalKernel({ assets: ORIGINAL_ASSETS, query });
  const model = new kernel.City(kernel.Blueprint.fromURL());
  return adaptSession(kernel, model, options, name);
}

/** Original New/Rebuild random-feature blueprint, including its random coast angle. */
export function generateRandomCity(options: CityOptions, name?: string): City {
  return generateBlueprintCity(options, true, name);
}

/** Original New/Rebuild blueprint with either configured or randomly sampled features. */
export function generateBlueprintCity(options: CityOptions, random: boolean, name?: string): City {
  validateOptions(options);
  const kernel = createOriginalKernel({ assets: ORIGINAL_ASSETS, preferences: {
    random, green: options.greens, hub: options.hub ?? false, gates: options.gates,
    citadel: options.citadel, urban_castle: options.urban_castle,
    plaza: options.plaza, temple: options.temple, walls: options.walls,
    shantytown: options.shantytown, coast: options.coast, river: options.river,
  } });
  kernel.Random.reset(options.seed);
  const blueprint = kernel.Blueprint.create(options.size, options.seed);
  if (name) blueprint.name = name;
  const model = new kernel.City(blueprint);
  const generatedOptions: CityOptions = {
    size: blueprint.size, seed: blueprint.seed,
    citadel: blueprint.citadel, urban_castle: blueprint.inner,
    plaza: blueprint.plaza, temple: blueprint.temple, walls: blueprint.walls,
    shantytown: blueprint.shanty, coast: blueprint.coast, river: blueprint.river,
    greens: blueprint.greens, gates: blueprint.gates,
  };
  if (options.hub !== undefined) generatedOptions.hub = blueprint.hub;
  // City.buildPatches resolves the initial NaN angle inside Random.save/restore.
  // Replaying this finite angle through fromURL preserves the same geometry.
  if (blueprint.coast) generatedOptions.sea = blueprint.coastDir;
  return adaptSession(kernel, model, generatedOptions, name);
}

/** Original Tracery/Markov naming, retaining all existing (possibly warped) points. */
export function rerollNames(city: City, seed: number, scope: 'all' | 'city' | 'districts' = 'all'): void {
  let session = sessions.get(city);
  if (!session) {
    const regenerated = generateCity(city.options, city.generationName);
    session = sessions.get(regenerated)!;
    sessions.set(city, session);
  }
  const { kernel, model } = session;
  model.name = city.name;
  kernel.Random.reset(seed);
  kernel.Namer.reset();
  if (scope !== 'districts') city.name = model.name = model.rerollName();
  if (scope !== 'city') {
    kernel.Namer.nameDistricts(model);
    const names = new Map<number, string>();
    model.cells.forEach((cell: { district?: { name: string } }, index: number) => {
      if (cell.district) names.set(index, cell.district.name);
    });
    for (const ward of city.wards) if (names.has(ward.id)) ward.name = names.get(ward.id)!;
    city.labels.forEach((label, index) => { label.text = model.districts[index].name; });
    city.originalGeometry?.districts.forEach((district, index) => { district.name = model.districts[index].name; });
  }
}
