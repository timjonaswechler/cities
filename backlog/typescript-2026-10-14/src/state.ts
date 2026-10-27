import type { CityOptions, MapStyle, PaletteName } from './model/types';

export const DEFAULT_OPTIONS: CityOptions = {
  size: 25, seed: 924709892, citadel: true, urban_castle: false,
  plaza: true, temple: true, walls: true, shantytown: false,
  coast: false, river: false, greens: false, gates: -1,
};
export const FEATURE_KEYS = ['citadel', 'urban_castle', 'plaza', 'temple', 'walls', 'shantytown', 'coast', 'river', 'greens'] as const;
export const PALETTE_NAMES: PaletteName[] = ['default', 'ink', 'bw', 'natural', 'vivid', 'modern'];

export function boundedInteger(value: unknown, fallback: number, min: number, max: number): number {
  if (typeof value !== 'string' && typeof value !== 'number') return fallback;
  if (typeof value === 'string' && value.trim() === '') return fallback;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) ? Math.max(min, Math.min(max, parsed)) : fallback;
}

export function readOptions(search: string): CityOptions {
  const query = new URLSearchParams(search);
  const options = { ...DEFAULT_OPTIONS };
  options.size = boundedInteger(query.get('size'), options.size, 5, 200);
  options.seed = boundedInteger(query.get('seed'), options.seed, 1, 2147483646);
  options.gates = boundedInteger(query.get('gates'), options.gates, -1, 30);
  for (const key of FEATURE_KEYS) {
    const value = query.get(key);
    if (value === '0' || value === '1') options[key] = value === '1';
  }
  const hub = query.get('hub');
  if (hub === '0' || hub === '1') options.hub = hub === '1';
  const sea = query.get('sea');
  if (sea !== null && sea.trim() !== '' && Number.isFinite(Number(sea))) options.sea = Number(sea);
  return options;
}

export function cityQuery(options: CityOptions, name?: string, palette?: PaletteName): string {
  const query = new URLSearchParams();
  query.set('size', String(options.size));
  query.set('seed', String(options.seed));
  for (const key of FEATURE_KEYS) query.set(key, options[key] ? '1' : '0');
  query.set('gates', String(options.gates));
  if (options.hub !== undefined) query.set('hub', options.hub ? '1' : '0');
  if (options.sea !== undefined && Number.isFinite(options.sea)) query.set('sea', String(options.sea));
  if (name) query.set('name', name.slice(0, 80));
  if (palette && palette !== 'default') query.set('style', palette);
  return `?${query}`;
}

export function freshSeed(): number {
  return (crypto.getRandomValues(new Uint32Array(1))[0] % 2147483646) + 1;
}

export function readStyle(defaults: MapStyle, search: string, saved: string | null): MapStyle {
  const style = { ...defaults };
  try {
    const value: unknown = saved ? JSON.parse(saved) : null;
    if (value && typeof value === 'object') {
      for (const key of Object.keys(defaults) as (keyof MapStyle)[]) {
        const candidate: unknown = Reflect.get(value, key);
        if (key === 'palette') {
          if (PALETTE_NAMES.includes(candidate as PaletteName)) style.palette = candidate as PaletteName;
        } else if (key === 'strokeWidth') {
          if (typeof candidate === 'number' && Number.isFinite(candidate)) style.strokeWidth = Math.max(0.4, Math.min(2, candidate));
        } else if (typeof candidate === 'boolean') style[key] = candidate;
      }
    }
  } catch { /* Invalid stored preferences should not prevent opening a map. */ }
  const palette = new URLSearchParams(search).get('style');
  if (PALETTE_NAMES.includes(palette as PaletteName)) style.palette = palette as PaletteName;
  return style;
}

export function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]!);
}
