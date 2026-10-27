import { readFileSync } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { createContext, runInContext } from 'node:vm';
import { canonicalCity } from './original-canonical.mjs';

const root = new URL('../', import.meta.url);
const expectedSha256 = 'b67cf2e75dcae555a9de56f49d897a04a0a2cbcdccc9e40df02c9f249459d86e';
const sourcePath = new URL('.rea/original/mfcg.js', root);

function validateSource(bytes) {
  if (createHash('sha256').update(bytes).digest('hex') !== expectedSha256) throw new Error('Original oracle bundle digest mismatch');
  const source = bytes.toString();
  if (source.split('aa.main()').length !== 2) throw new Error('Original bootstrap entry is not unique');
  return source.replace('aa.main()', 'globalThis.__classes=g;globalThis.__enums=y');
}

/** Obtain the pinned independent reference on a fresh checkout; never skip parity. */
export async function ensureOriginalBundle() {
  let bytes;
  try { bytes = await readFile(sourcePath); } catch (error) {
    if (error.code !== 'ENOENT') throw error;
    const response = await fetch('https://watabou.github.io/city-generator/mfcg.js', { signal: AbortSignal.timeout(30000) });
    if (!response.ok) throw new Error('Unable to download original oracle: HTTP ' + response.status);
    bytes = Buffer.from(await response.arrayBuffer());
    validateSource(bytes);
    await mkdir(new URL('.rea/original/', root), { recursive: true });
    await writeFile(sourcePath, bytes);
  }
  validateSource(bytes);
}

export function originalAssets() {
  return Object.fromEntries(Object.entries({ grammar: 'grammar.json', english: 'english.txt', elven: 'elven.txt', male: 'given_male.txt', female: 'given_female.txt' }).map(([key, name]) => [key, readFileSync(new URL('src/original/assets/' + name, root), 'utf8')]));
}

export function originalNodeSnapshot(query, assets = originalAssets()) {
  const instrumented = validateSource(readFileSync(sourcePath));
  const traces = [];
  const queryString = typeof query === 'string' ? query : '?' + new URLSearchParams(query);
  const context = createContext({
    console: { log(...values) {
      const message = values.join(' ');
      traces.push(message);
      if (traces.filter(value => value.includes('***')).length > 30) throw new Error('Repeated original generation failure: ' + message);
    } },
    // Use the bundle's existing worker route to initialize all original classes
    // without starting audio, a canvas renderer, or the application scene.
    self: { constructor: { name: 'Worker' }, location: { href: 'http://localhost/' + queryString, search: queryString }, performance },
    URLSearchParams, setTimeout, clearTimeout, setInterval, clearInterval,
  });
  runInContext(instrumented, context, { timeout: 10000, filename: 'original-mfcg.js' });
  context.window = { history: { replaceState() {} }, performance };
  const classes = context.__classes;
  const state = classes['com.watabou.system.State'];
  state.so = { data: {}, flush() {} };
  state.data = state.so.data;
  classes['com.watabou.mfcg.Values'].prepare(state.data);
  // These are storage and asset IO boundaries. Generation methods are original.
  classes['openfl.utils.Assets'].getText = key => {
    if (!Object.hasOwn(assets, key)) throw new Error('Missing original asset: ' + key);
    return assets[key];
  };
  classes['openfl.utils.Assets'].exists = key => Object.hasOwn(assets, key);
  context.__makeSnapshot = canonicalCity;
  return runInContext(`(() => {
    const city = new __classes['com.watabou.mfcg.model.City'](__classes['com.watabou.mfcg.model.Blueprint'].fromURL());
    return __makeSnapshot(city, __classes, __enums, __classes['com.watabou.utils.Random'].seed);
  })()`, context, { timeout: 30000 });
}
