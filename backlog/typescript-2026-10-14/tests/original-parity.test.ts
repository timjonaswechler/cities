/// <reference types="node" />
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { beforeAll, describe, expect, test } from 'vitest';
import { createOriginalKernel } from '../src/original/kernel';
import { canonicalCity } from '../scripts/original-canonical.mjs';
import { ensureOriginalBundle, originalAssets, originalNodeSnapshot } from '../scripts/node-original-oracle.mjs';

const cases = ['seed-924709892', 'seed-42', 'coast-river', 'all-false', 'inner-castle', 'shanty-greens', 'size-5', 'size-50'];
const digest = (value: unknown) => createHash('sha256').update(JSON.stringify(value)).digest('hex');
const baseline = { size: 25, seed: 1, citadel: 1, urban_castle: 0, plaza: 1, temple: 1, walls: 1, shantytown: 0, coast: 0, river: 0, greens: 0, gates: -1 };
const unseenCases: Array<{ label: string; options: Record<string, string | number> }> = [
  { label: 'small open named settlement', options: { size: 5, seed: 1, citadel: 0, plaza: 0, temple: 0, walls: 0, gates: 0, name: "Alder's Rest", population: 125 } },
  { label: 'small unwalled settlement', options: { size: 5, seed: 7, walls: 0, gates: 0, greens: 1 } },
  { label: 'one gate and greenery', options: { size: 10, seed: 48271, gates: 1, greens: 1 } },
  { label: 'maximum seed and shantytown', options: { size: 10, seed: 2147483646, gates: 2, temple: 0, shantytown: 1 } },
  { label: 'east-facing coast', options: { seed: 1, coast: 1, sea: Math.PI / 2, gates: 2 } },
  { label: 'south-facing coast and river', options: { seed: 7, coast: 1, river: 1, sea: Math.PI, gates: 2 } },
  { label: 'inland river and inner castle', options: { seed: 48271, river: 1, urban_castle: 1, gates: 2 } },
  { label: 'unwalled river hub', options: { seed: 2147483646, walls: 0, citadel: 0, plaza: 0, temple: 0, river: 1, greens: 1, hub: 1, gates: 0 } },
  { label: 'six gates and inner castle', options: { size: 40, seed: 1, gates: 6, shantytown: 1, greens: 1, urban_castle: 1 } },
  { label: 'west-facing green coast', options: { size: 40, seed: 7, coast: 1, river: 1, sea: -Math.PI / 2, gates: 2, greens: 1 } },
  { label: 'single-gate hub', options: { size: 40, seed: 48271, hub: 1, gates: 1 } },
  { label: 'coastal hub without gates', options: { size: 40, seed: 2147483646, coast: 1, sea: 0.75, citadel: 0, plaza: 0, gates: 0, hub: 1 } },
  { label: 'large city with six gates', options: { size: 80, seed: 1, gates: 6, shantytown: 1 } },
  { label: 'large coast river and inner castle', options: { size: 80, seed: 7, coast: 1, river: 1, sea: -1.2, urban_castle: 1, greens: 1, gates: 6 } },
  { label: 'large open hub with inner castle', options: { size: 80, seed: 48271, walls: 0, urban_castle: 1, plaza: 0, temple: 0, greens: 1, hub: 1, gates: 0 } },
  { label: 'large named coast maximum seed', options: { size: 80, seed: 2147483646, coast: 1, sea: Math.PI * 1.25, gates: 2, name: 'Rivière Noire' } },
];

function firstDifference(expected: unknown, actual: unknown, path = '$'): string | undefined {
  if (Object.is(expected, actual)) return;
  if (expected && actual && typeof expected === 'object' && typeof actual === 'object') {
    const a = expected as Record<string, unknown>;
    const b = actual as Record<string, unknown>;
    for (const key of new Set([...Object.keys(a), ...Object.keys(b)])) {
      const difference = firstDifference(a[key], b[key], `${path}.${key}`);
      if (difference) return difference;
    }
    return;
  }
  return `${path}: original=${JSON.stringify(expected)?.slice(0, 120)}, port=${JSON.stringify(actual)?.slice(0, 120)}`;
}

function compareWithOriginal(query: string) {
  const assets = originalAssets();
  const expected = originalNodeSnapshot(query, assets);
  let failures = 0;
  const kernel = createOriginalKernel({
    assets, query: Object.fromEntries(new URLSearchParams(query)),
    trace(message) {
      if (message.startsWith('***') && ++failures > 30) throw new Error('Repeated kernel generation failure: ' + message);
    },
  });
  const city = new kernel.City(kernel.Blueprint.fromURL());
  const actual = canonicalCity(city, kernel.classes, kernel.enums, kernel.Random.seed);

  // Complete canonical JSON, preserving every number and original array order.
  // Hashes keep a regression report readable even for large models.
  const actualDigest = digest(actual);
  const expectedDigest = digest(expected);
  const difference = actualDigest === expectedDigest ? undefined : firstDifference(expected, actual);
  expect(actualDigest, difference).toBe(expectedDigest);
}

describe('exact original algorithm parity in the same Node runtime', () => {
  beforeAll(ensureOriginalBundle, 40000);

  test.each(cases)('%s matches the independently executed original bundle', (name) => {
    const fixture = JSON.parse(readFileSync(new URL(`./fixtures/original/${name}.json`, import.meta.url), 'utf8'));
    compareWithOriginal(fixture.metadata.query);
  });

  test.each(unseenCases)('unseen case: $label', ({ options }) => {
    const query = new URLSearchParams(Object.entries({ ...baseline, ...options }).map(([key, value]) => [key, String(value)])).toString();
    compareWithOriginal('?' + query);
  });
});
