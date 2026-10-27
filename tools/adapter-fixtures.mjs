import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {createServer} from '../backlog/typescript-2026-10-14/node_modules/vite/dist/node/index.js';
const root=new URL('../backlog/typescript-2026-10-14/',import.meta.url).pathname;
const server=await createServer({root,server:{middlewareMode:true},appType:'custom'});
try{
  const {generateCity}=await server.ssrLoadModule('/src/model/generator.ts');
  mkdirSync('crates/city_core/tests/adapter-fixtures',{recursive:true});
  for(const name of ['seed-924709892','coast-river','shanty-greens']){
    const {options}=JSON.parse(readFileSync(`crates/city_core/tests/fixtures/${name}.json`));
    const city=generateCity(options);
    delete city.options;
    writeFileSync(`crates/city_core/tests/adapter-fixtures/${name}.json`,JSON.stringify(city)+'\n');
    console.log(name,city.wards.reduce((n,w)=>n+w.buildings.length,0),'buildings',city.trees.length,'trees');
  }
}finally{await server.close();}
