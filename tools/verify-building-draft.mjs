// Verify the immutable, accepted HTML examples used by the native Rust tests.
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {createContext,runInContext} from 'node:vm';
import assert from 'node:assert/strict';
const read=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');
const html=read('crates/city_core/prototypes/building-joins-draft.html');
const reference=JSON.parse(read('crates/city_core/tests/building-fixtures/accepted-draft.json'));
const city=JSON.parse(read('crates/city_core/tests/building-fixtures/stormwind.json'));
const sha=s=>createHash('sha256').update(s).digest('hex');
const block=id=>html.match(new RegExp('<script id="'+id+'">([\\s\\S]*?)<\\/script>'))[1];
assert.equal(sha(html),reference.draftSha256,'the accepted HTML reference must remain frozen');
assert.equal(sha(block('baseline-logic')),reference.previousLogicSha256);
const scene=JSON.parse(html.match(/<script id="data" type="application\/json">([\s\S]*?)<\/script>/)[1]);
assert.equal(scene.buildings.length,city.wards.reduce((s,w)=>s+w.buildings.length,0));
for(const source of scene.buildings){
 const [ward,index]=source.id.split(':').map(Number),b=city.wards.find(w=>w.id===ward).buildings[index];
 assert.deepEqual(source.p,b.polygon);assert.equal(source.role,b.role);assert.equal(source.landmark,b.landmark);
}
const context=createContext({});
runInContext(block('baseline-logic')+'\n'+block('draft-logic')+';globalThis.draft=JoinDraft;',context);
for(const expected of reference.cases){
 const result=context.draft.plan(scene,expected.sourceId,expected.minContactM);
 const actual=JSON.parse(JSON.stringify(Object.fromEntries(Object.keys(expected).map(key=>[key,result[key]]))));
 assert.deepEqual(actual,expected);
 console.log(`accepted draft: ${expected.sourceId}, contact ${expected.minContactM} m`);
}
console.log('9 frozen HTML cases and the native city fixture verified.');
