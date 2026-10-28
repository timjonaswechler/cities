// Reproduce the throwaway market/district experiment using the HTML's pure module.
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { createContext, runInContext } from 'node:vm';

const html = readFileSync(new URL('./market-district-lab.html', import.meta.url), 'utf8');
const scenes = JSON.parse(html.match(/<script id="data" type="application\/json">([\s\S]*?)<\/script>/)[1]);
const context = createContext({ console });
runInContext(html.match(/<script id="logic">([\s\S]*?)<\/script>/)[1] + ';globalThis.lab=MarketLab;', context);
const cases = [
  ['Nur Hauptmarkt', { maxMarkets: 0 }],
  ['100 / 100 m', { mainMin: 100, sideMin: 100 }],
  ['200 / 160 m ohne Distriktgewicht', { districtWeight: 0 }],
  ['200 / 160 m mit Distriktgewicht 1', {}],
  ['200 / 160 m mit Distriktgewicht 2', { districtWeight: 2 }],
  ['300 / 240 m', { mainMin: 300, sideMin: 240 }],
  ['400 / 320 m', { mainMin: 400, sideMin: 320 }],
  ['Hohe Mindestnachfrage', { minBeneficiaries: 80 }],
  ['Kurzer Versorgungsweg', { service: 160 }],
];
const runs = [];
for (const [city, scene] of scenes.entries()) {
  const prepared = context.lab.prepare(scene);
  for (const [name, values] of cases) {
    const configuration = { ...context.lab.defaults(city), ...values };
    const result = context.lab.plan(scene, prepared, configuration);
    runs.push({
      city: scene.label, name, configuration, ...result.metrics,
      markets: result.markets.map(({ route, ...market }) => ({ ...market, routePoints: route.length })),
      pairs: result.pairs.map(({ route, ...pair }) => ({ ...pair, routePoints: route.length })),
      districts: result.districts, rejections: result.reasons,
      mainSpacingViolations: result.markets.filter(m => m.mainDistance + 1e-4 < configuration.mainMin).length,
      secondarySpacingViolations: result.pairs.filter(p => p.distance + 1e-4 < configuration.sideMin).length,
      unreachableSelectedMarkets: result.markets.filter(m => !Number.isFinite(m.mainDistance)).length,
    });
  }
}
console.log(JSON.stringify({
  prototype: 'market-district-lab',
  sourceSha256: createHash('sha256').update(html).digest('hex'),
  inputGeneratorCommit: '8d73abc6ceb6a18c83e8ee87a6cc8c4e5ac4917c',
  node: process.version, runs,
}, null, 2));
