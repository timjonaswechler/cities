// Check the frozen, user-accepted B + <2 m draft against its native test fixture.
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {createContext,runInContext} from 'node:vm';
import assert from 'node:assert/strict';
const read=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');
const html=read('crates/city_core/prototypes/building-corners-draft.html');
const fixture=JSON.parse(read('crates/city_core/tests/building-fixtures/accepted-refinement.json'));
assert.equal(createHash('sha256').update(html).digest('hex'),fixture.draftSha256);
const scene=JSON.parse(html.match(/<script id="data" type="application\/json">([\s\S]*?)<\/script>/)[1]);
const {city}=JSON.parse(read('exports/market-v1-city.json'));
assert.equal(scene.sourceId,fixture.sourceId);assert.equal(scene.seed,fixture.seed);assert.equal(scene.size,fixture.size);
assert.deepEqual(scene.p,fixture.source);assert.deepEqual(scene.axis,fixture.axis);
for(const b of scene.context){const [ward,index]=b.id.split(':').map(Number);assert.deepEqual(b.p,city.wards.find(w=>w.id===ward).buildings[index].polygon);}
const context=createContext({});
for(const id of ['tip-logic','corner-logic'])runInContext(html.match(new RegExp('<script id="'+id+'">([\\s\\S]*?)<\\/script>'))[1],context);
runInContext('globalThis.tip=TipLab;globalThis.corner=CornerLab',context);
const b=context.tip.plan(scene.p,scene.axis,6),clean=context.corner.simplify(b.polygon,2);
assert.deepEqual(JSON.parse(JSON.stringify(b)),fixture.b);assert.deepEqual(JSON.parse(JSON.stringify(clean)),fixture.clean);
assert.equal(clean.operations.length,2);assert.equal(clean.remainingShortEdges.length,0);assert.equal(clean.polygon.length,5);
console.log('Frozen B + <2 m draft, both marked corners and PR #1 source geometry verified.');
