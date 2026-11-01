// Record the fixed reference studies; not an architectural acceptance test.
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {createContext,runInContext} from 'node:vm';
const html=readFileSync(new URL('./house-blockout-lab.html',import.meta.url),'utf8');
const logic=html.match(/<script id="blockout-logic">([\s\S]*?)<\/script>/)[1];
const context=createContext({});runInContext(logic+';globalThis.lab=BlockoutLab',context);
const lab=context.lab,runs=[];
for(const item of lab.cases){
 const scene=lab.build(item.id);runs.push({id:item.id,closePassage:false,scene,report:lab.inspect(scene)});
 if(scene.passages.length){const blocked=lab.build(item.id,{closePassage:true});runs.push({id:item.id,closePassage:true,scene:blocked,report:lab.inspect(blocked)});}
}
console.log(JSON.stringify({version:1,node:process.version,
 prototypeSha256:createHash('sha256').update(html).digest('hex'),
 logicSha256:createHash('sha256').update(logic).digest('hex'),runs},null,2));
