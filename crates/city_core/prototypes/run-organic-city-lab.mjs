// Throwaway experiment runner. Uses the exact pure planning module embedded in
// organic-city-lab.html; no browser, server, dependencies or production changes.
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { createContext, runInContext } from 'node:vm';

const html = readFileSync(new URL('./organic-city-lab.html', import.meta.url), 'utf8');
const scenes = JSON.parse(html.match(/<script id="data" type="application\/json">([\s\S]*?)<\/script>/)[1]);
const context = createContext({ console });
runInContext(html.match(/<script id="logic">([\s\S]*?)<\/script>/)[1] + ';globalThis.lab=Lab;', context);
const cases = [
  ['Original', {}],
  ['Kleine Märkte', { markets: true, radius: 4 }],
  ['Mittlere Märkte', { markets: true, radius: 6 }],
  ['Große Märkte', { markets: true, radius: 8 }],
  ['Höfe', { courts: true }],
  ['Bauphase 1', { phase: 1 }],
  ['Bauphase 2', { phase: 2 }],
  ['Bauphase 3', { phase: 3 }],
  ['Kombiniert', { markets: true, courts: true, phase: 3 }],
];
const runs = [];
for (const [city, scene] of scenes.entries()) {
  for (const [name, config] of cases) {
    const state = { ...context.lab.create(city), ...config };
    const result = context.lab.compute(scene, state);
    runs.push({
      city: scene.label, name, configuration: state, ...result.metrics,
      growthAttempts: result.growth.attempts, growthRejections: result.growth.blocked,
      blockedSites: result.sites.filter(s => s.blocked).map(s => ({ id: s.id, reason: s.reason })),
      removedBuildingIds: result.removed.map(b => b.id),
      courtyardBuildingIds: result.courts.map(c => c.id),
    });
  }
}
console.log(JSON.stringify({
  prototype: 'organic-city-lab',
  sourceSha256: createHash('sha256').update(html).digest('hex'),
  originalAnalysisCommit: '8d73abc6ceb6a18c83e8ee87a6cc8c4e5ac4917c',
  node: process.version, runs,
}, null, 2));
