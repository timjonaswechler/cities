// Reproduce the standalone prototype's model states; no browser or city generator.
// This records experiments, not an architectural acceptance test.
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {createContext,runInContext} from 'node:vm';
const html=readFileSync(new URL('./house-zoo.html',import.meta.url),'utf8');
const logic=html.match(/<script id="house-logic">([\s\S]*?)<\/script>/)[1];
const context=createContext({});
runInContext(logic+';globalThis.zoo=HouseZoo',context);
const zoo=context.zoo;
const inputs=[...zoo.cases.map(c=>zoo.defaults(c.id)),
 {...zoo.defaults('bridge'),openBridge:true},
 {...zoo.defaults('annexes'),annexes:1,fault:'corner'},
 {...zoo.defaults('annexes'),annexes:1,fault:'collision'},
 {...zoo.defaults('stacked'),fault:'floating'},
 {...zoo.defaults('bridge'),bridgeHeight:0}];
console.log(JSON.stringify({version:1,node:process.version,
 prototypeSha256:createHash('sha256').update(html).digest('hex'),
 logicSha256:createHash('sha256').update(logic).digest('hex'),
 runs:inputs.map(input=>{const scene=zoo.generate(input);return {input,scene,report:zoo.inspect(scene)}})
},null,2));
