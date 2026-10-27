import { createOriginalKernel } from '../src/original/kernel.ts';
import { ORIGINAL_ASSETS } from '../src/original/assets.ts';
import { canonicalCity } from './original-canonical.mjs';

const files = ['seed-924709892', 'seed-42', 'coast-river', 'all-false', 'inner-castle', 'shanty-greens', 'size-5', 'size-50'];

function differences(expected: any, actual: any) {
  const first: any[] = [];
  let count = 0;
  let numericCount = 0;
  let maxNumericError = 0;
  const visit = (a: any, b: any, path: string) => {
    if (Object.is(a, b)) return;
    if (typeof a === 'number' && typeof b === 'number') {
      numericCount++;
      maxNumericError = Math.max(maxNumericError, Math.abs(a - b));
    } else if (a && b && typeof a === 'object' && typeof b === 'object' && Array.isArray(a) === Array.isArray(b)) {
      for (const key of new Set([...Object.keys(a), ...Object.keys(b)])) visit(a[key], b[key], path + '.' + key);
      return;
    }
    count++;
    if (first.length < 15) first.push({ path, expected: typeof a === 'object' ? JSON.stringify(a).slice(0,180) : a, actual: typeof b === 'object' ? JSON.stringify(b).slice(0,180) : b });
  };
  visit(expected, actual, '$');
  return { count, numericCount, maxNumericError, first };
}

async function run() {
  const assets = ORIGINAL_ASSETS;
  const results = [];
  const snapshots = {};
  for (const file of files) {
    const fixture = await (await fetch('/tests/fixtures/original/' + file + '.json')).json();
    const traces: string[] = [];
    try {
      const kernel = createOriginalKernel({ assets, query: Object.fromEntries(new URLSearchParams(fixture.metadata.query)), trace(message) {
        traces.push(message);
        if (traces.filter(value => value.startsWith('***')).length > 30) throw new Error('Repeated generation failure: ' + message);
      } });
      const city = new kernel.City(kernel.Blueprint.fromURL());
      const actual = canonicalCity(city, kernel.classes, kernel.enums, kernel.Random.seed);
      snapshots[file] = { actual, expected: fixture.data, kernel, city };
      const diff = differences(fixture.data, actual);
      results.push({ file, name: city.name, rngSeed: kernel.Random.seed, expectedRng: fixture.data.rngSeed, equal: diff.count === 0, ...diff, equalFields: Object.keys(actual).filter(key => JSON.stringify(actual[key]) === JSON.stringify(fixture.data[key])), traces });
    } catch (error) {
      results.push({ file, error: String(error), traces });
    }
    document.querySelector('#results').textContent = JSON.stringify(results, null, 2);
  }
  Object.assign(window, { __browserParity: { userAgent: navigator.userAgent, results }, __paritySnapshots: snapshots });
}

run().catch(error => {
  document.querySelector('#results').textContent = String(error.stack || error);
  Object.assign(window, { __browserParity: { error: String(error) } });
});
