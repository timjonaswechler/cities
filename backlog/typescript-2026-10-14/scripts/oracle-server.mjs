import { createServer } from 'node:http';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { resolve, extname, basename } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';

const project = fileURLToPath(new URL('../', import.meta.url));
const root = resolve(project, '.rea/oracle');
const fixtures = resolve(project, 'tests/fixtures/original');
const types = { '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json', '.woff': 'font/woff', '.ttf': 'font/ttf', '.txt': 'text/plain' };
const upstream = 'https://watabou.github.io/city-generator/';
const sourceSha256 = 'b67cf2e75dcae555a9de56f49d897a04a0a2cbcdccc9e40df02c9f249459d86e';

async function cachedDownload(path, url) {
  try { return await readFile(path); } catch (error) { if (error.code !== 'ENOENT') throw error; }
  const response = await fetch(url);
  if (!response.ok) throw new Error(`${response.status}: ${url}`);
  const bytes = Buffer.from(await response.arrayBuffer());
  await mkdir(resolve(path, '..'), { recursive: true });
  await writeFile(path, bytes);
  return bytes;
}

// The reference implementation stays in ignored analysis storage, never public/.
await mkdir(resolve(root, 'Assets'), { recursive: true });
const original = await cachedDownload(resolve(project, '.rea/original/mfcg.js'), upstream + 'mfcg.js');
if (createHash('sha256').update(original).digest('hex') !== sourceSha256) {
  throw new Error('Original bundle changed: regenerate and review oracle provenance before using it.');
}
const source = original.toString();
if (source.split('aa.main()').length !== 2) throw new Error('Oracle injection point is not unique.');
const injection = 'window.__mfcgClasses=g;window.__mfcgEnums=y;var __oracleBuild=Ub.prototype.build;Ub.prototype.build=function(){var result=__oracleBuild.apply(this,arguments);window.__mfcgBuildRng=C.seed;window.__originalCoreSnapshot=window.canonicalCity(this,g,y,C.seed);return result;};';
await writeFile(resolve(root, 'mfcg.js'), source.replace('aa.main()', injection + 'aa.main()'));
await writeFile(resolve(root, 'canonical.js'), (await readFile(resolve(project, 'scripts/original-canonical.mjs'), 'utf8')).replace('export function', 'function'));
const fonts = ['IMFellGreatPrimer-Regular', 'ShareTech-Regular', 'ShareTechMono-Regular'];
const assets = ['default.json', 'ink.json', 'bw.json', 'natural.json', 'vivid.json', 'modern.json', 'grammar.json', 'english.txt', 'elven.txt', 'given_male.txt', 'given_female.txt', ...fonts.flatMap(font => [`${font}.woff`, `${font}.ttf`])];
await Promise.all(assets.map(name => cachedDownload(resolve(root, 'Assets', name), upstream + 'Assets/' + name)));
await writeFile(resolve(root, 'index.html'), `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta id="viewport" name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no"><title>Original algorithm oracle</title>
<style>html,body{margin:0;padding:0;height:100%;overflow:hidden}#openfl-content{background:#000;width:100%;height:100%}
@font-face{font-family:'IM FELL Great Primer Roman';src:url('Assets/IMFellGreatPrimer-Regular.woff') format('woff')}
@font-face{font-family:'Share Tech Regular';src:url('Assets/ShareTech-Regular.woff') format('woff')}
@font-face{font-family:'Share Tech Mono';src:url('Assets/ShareTechMono-Regular.woff') format('woff')}
</style><script src="./canonical.js"></script><script src="./mfcg.js"></script></head><body><div id="openfl-content"></div><script>lime.embed('mfcg','openfl-content',0,0,{parameters:{}});</script></body></html>`);

createServer(async (request, response) => {
  try {
    const url = new URL(request.url, 'http://127.0.0.1:5175');
    if (request.method === 'POST' && url.pathname === '/capture') {
      const name = url.searchParams.get('name');
      if (!name || !/^[a-z0-9_-]+\.json$/.test(name) || basename(name) !== name) {
        response.writeHead(400).end('Invalid fixture name');
        return;
      }
      let body = '';
      for await (const chunk of request) {
        body += chunk;
        if (body.length > 64 * 1024 * 1024) throw new Error('Fixture too large');
      }
      const parsed = JSON.parse(body);
      await mkdir(fixtures, { recursive: true });
      await writeFile(resolve(fixtures, name), JSON.stringify(parsed) + '\n');
      response.writeHead(200, { 'Content-Type': 'application/json' }).end(JSON.stringify({ name, bytes: body.length }));
      return;
    }
    const pathname = decodeURIComponent(url.pathname === '/' ? '/index.html' : url.pathname);
    const file = resolve(root, '.' + pathname);
    if (!file.startsWith(root + '/')) {
      response.writeHead(403).end();
      return;
    }
    const body = await readFile(file);
    response.writeHead(200, { 'Content-Type': types[extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-store' });
    response.end(body);
  } catch (error) {
    response.writeHead(404).end(String(error.message));
  }
}).listen(5175, '127.0.0.1', () => console.log('Original algorithm oracle: http://127.0.0.1:5175'));
