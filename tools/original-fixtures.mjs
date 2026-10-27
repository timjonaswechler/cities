// Regenerate independent fixtures by executing the pinned COMPLETE original
// bundle. This does not execute or import the Rust-translated generation code.
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
import {parse} from '../backlog/typescript-2026-10-14/node_modules/@babel/parser/lib/index.js';
import generate from '../backlog/typescript-2026-10-14/node_modules/@babel/generator/lib/index.js';
import {ensureOriginalBundle,originalAssets,originalNodeSnapshot} from '../backlog/typescript-2026-10-14/scripts/node-original-oracle.mjs';
await ensureOriginalBundle();
const archived='backlog/typescript-2026-10-14';
const destination='crates/city_core/tests/fixtures';mkdirSync(destination,{recursive:true});
const names=['seed-924709892','seed-42','coast-river','all-false','inner-castle','shanty-greens','size-5','size-50'];
const cases=names.map(name=>({name,query:JSON.parse(readFileSync(`${archived}/tests/fixtures/original/${name}.json`)).metadata.query}));
const ast=parse(readFileSync(`${archived}/tests/original-parity.test.ts`,'utf8'),{sourceType:'module',plugins:['typescript']});
const find=name=>ast.program.body.flatMap(n=>n.declarations??[]).find(n=>n.id.name===name).init;
const baseline=runInNewContext(`(${generate(find('baseline')).code})`);
const unseen=runInNewContext(`(${generate(find('unseenCases')).code})`);
unseen.forEach((c,i)=>cases.push({name:`unseen-${String(i+1).padStart(2,'0')}`,query:'?'+new URLSearchParams({...baseline,...c.options}),label:c.label}));
for(const {name,query,label}of cases){const options={};for(const[k,v]of new URLSearchParams(query)){options[k]=['seed','size','gates','sea','population'].includes(k)?Number(v):k==='name'?v:v==='1';}const snapshot=originalNodeSnapshot(query,originalAssets());const fixture={metadata:{query,label,runtime:process.version,architecture:process.arch,platform:process.platform,oracle:'independent full original Watabou 0.11.5 build 2431 bundle',bundleSha256:'b67cf2e75dcae555a9de56f49d897a04a0a2cbcdccc9e40df02c9f249459d86e'},options,snapshot};writeFileSync(`${destination}/${name}.json`,JSON.stringify(fixture)+'\n');console.log(name,snapshot.name);}
