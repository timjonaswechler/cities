import fs from 'node:fs';
import crypto from 'node:crypto';
import { parse } from '@babel/parser';
import traverseModule from '@babel/traverse';
import generateModule from '@babel/generator';
import * as t from '@babel/types';

const traverse = traverseModule.default ?? traverseModule;
const generate = generateModule.default ?? generateModule;
const sourcePath = '.rea/original/mfcg.js';
if (!fs.existsSync(sourcePath)) {
  const response = await fetch('https://watabou.github.io/city-generator/mfcg.js');
  if (!response.ok) throw new Error('Could not download original bundle: ' + response.status);
  fs.mkdirSync('.rea/original', { recursive: true });
  fs.writeFileSync(sourcePath, Buffer.from(await response.arrayBuffer()));
}
const source = fs.readFileSync(sourcePath, 'utf8');
const expectedSha = 'b67cf2e75dcae555a9de56f49d897a04a0a2cbcdccc9e40df02c9f249459d86e';
if (crypto.createHash('sha256').update(source).digest('hex') !== expectedSha) throw new Error('Original bundle digest mismatch; re-audit the new version before extracting.');
const ast = parse(source, { sourceType: 'script' });
let kernelPath;
traverse(ast, { FunctionExpression(path) {
  if (path.node.body.body.some(s => t.isVariableDeclaration(s) && s.declarations.some(d => t.isIdentifier(d.id, { name: 'g' }))) && path.node.body.body.length > 1000) {
    kernelPath = path; path.stop();
  }
} });
if (!kernelPath) throw new Error('Original Haxe closure not found');

// Split declarations and comma statements without changing their execution order.
const statements = [];
function expand(statement) {
  if (t.isVariableDeclaration(statement)) {
    for (const declaration of statement.declarations) statements.push(t.variableDeclaration(statement.kind, [declaration]));
  } else if (t.isExpressionStatement(statement) && t.isSequenceExpression(statement.expression)) {
    for (const expression of statement.expression.expressions) expand(t.expressionStatement(expression));
  } else statements.push(statement);
}
kernelPath.node.body.body.forEach(expand);
kernelPath.node.body.body = statements;
kernelPath.scope.crawl();
const scope = kernelPath.scope;
const names = new Map();
const enums = new Map();
for (const statement of statements) {
  if (t.isExpressionStatement(statement) && t.isAssignmentExpression(statement.expression)) {
    const { left, right } = statement.expression;
    if (t.isMemberExpression(left) && t.isIdentifier(left.object) && t.isIdentifier(left.property, { name: '__name__' }) && t.isStringLiteral(right)) names.set(left.object.name, right.value);
  }
  if (t.isVariableDeclaration(statement)) {
    const declaration = statement.declarations[0];
    const expression = declaration.init;
    if (t.isAssignmentExpression(expression) && t.isMemberExpression(expression.left) && t.isIdentifier(expression.left.object, { name: 'y' }) && t.isStringLiteral(expression.left.property)) enums.set(declaration.id.name, expression.left.property.value);
  }
}
const rootIdentifier = node => t.isIdentifier(node) ? node.name : t.isMemberExpression(node) ? rootIdentifier(node.object) : null;
function owner(statement) {
  if (t.isVariableDeclaration(statement)) return statement.declarations[0].id.name;
  if (t.isFunctionDeclaration(statement)) return statement.id.name;
  if (t.isExpressionStatement(statement) && t.isAssignmentExpression(statement.expression)) {
    const { left, right } = statement.expression;
    if (t.isMemberExpression(left) && t.isIdentifier(left.object, { name: 'g' }) && t.isIdentifier(right)) return right.name;
    return rootIdentifier(left);
  }
  return null;
}
const entries = statements.map((node, index) => ({ node, index, owner: owner(node), dependencies: new Set() }));
const nodeEntries = new Map(entries.map(entry => [entry.node, entry]));
kernelPath.traverse({ ReferencedIdentifier(path) {
  const binding = path.scope.getBinding(path.node.name);
  if (binding?.scope !== scope) return;
  let statement = path;
  while (statement.parentPath !== kernelPath.get('body') && statement.parentPath && statement.parentPath.node !== kernelPath.node.body) statement = statement.parentPath;
  nodeEntries.get(statement.node)?.dependencies.add(path.node.name);
} });
const byOwner = new Map();
for (const entry of entries) {
  if (!byOwner.has(entry.owner)) byOwner.set(entry.owner, []);
  byOwner.get(entry.owner).push(entry);
}
const hostSymbols = new Set(['ac', 'ba', 'Aa', 'gb', 'id', 'sb', 'Ra']);
const boundary = symbol => {
  if (symbol === 'K' || symbol === 'gc') return false;
  const name = names.get(symbol) ?? '';
  return hostSymbols.has(symbol) || /^(com\.watabou\.(coogee|mfcg\.(scenes|ui|mapping)|system\.(Exporter|State|URLState))|openfl\.(display|events|text|net|media|utils)|lime\.(graphics|media|net|system))\./.test(name);
};
const roots = [...names].filter(([, name]) => /^(com\.watabou\.(geom|mfcg\.model|mfcg\.linguistics|mfcg\.utils\.(PolyUtils|Bisector|Bloater|Cutter)|nlp|tracery)\.|com\.watabou\.mfcg\.Values$)/.test(name)).map(([symbol]) => symbol);
roots.push('Ub', 'Fd', 'Ma', 'kd', 'r', 'v', 'l', 'E');
const selected = new Set();
const selectedEntries = new Set();
function select(symbol) {
  if (selected.has(symbol)) return;
  selected.add(symbol);
  if (boundary(symbol)) return;
  for (const entry of byOwner.get(symbol) ?? []) {
    if (symbol === 'gc') {
      const target = entry.node.expression?.left;
      if (!t.isMemberExpression(target) || !['getTree', 'getCrown', 'resetForests', 'cache'].includes(target.property.name)) continue;
    }
    selectedEntries.add(entry.index);
    for (const dependency of entry.dependencies) select(dependency);
  }
}
roots.forEach(select);
const selectedNames = [...selected].sort().map(symbol => ({ symbol, name: names.get(symbol) ?? enums.get(symbol) ?? null, boundary: boundary(symbol), statements: selectedEntries.size && (byOwner.get(symbol)?.length ?? 0) }));
fs.mkdirSync('.rea/extracted', { recursive: true });
fs.writeFileSync('.rea/extracted/manifest.json', JSON.stringify({ source: sourcePath, sourceSha256: crypto.createHash('sha256').update(source).digest('hex'), symbols: selectedNames, statements: selectedEntries.size }, null, 2));
const rawNodes = entries.filter(entry => selectedEntries.has(entry.index)).map(entry => t.cloneNode(entry.node, true));
fs.mkdirSync('.rea/focused', { recursive: true });
for (const symbol of ['Ub', 'C', 'hi', '$k', 'Ma']) {
  fs.writeFileSync('.rea/focused/' + symbol.replace('$', '_') + '.js', generate(t.file(t.program((byOwner.get(symbol) ?? []).map(entry => t.cloneNode(entry.node, true)))), { comments: false }).code);
}

fs.writeFileSync('.rea/extracted/kernel.js', generate(t.file(t.program(rawNodes)), { comments: false }).code);
console.log(JSON.stringify({ totalStatements: statements.length, selectedStatements: rawNodes.length, selectedSymbols: selected.size, boundaries: selectedNames.filter(item => item.boundary), unknown: selectedNames.filter(item => !item.name).map(item => item.symbol) }, null, 2));

// Add only type annotations; preserve expression order and arithmetic exactly.
const header = `
export type HaxeValue = any;
export interface KernelHost {
  assets: Record<string, string>;
  preferences?: Record<string, unknown>;
  query?: Record<string, string>;
  trace?: (message: string) => void;
}
export function createOriginalKernel(this: HaxeValue, host: KernelHost) {
  const E: HaxeValue = { $haxeUID: 0 };
  const Error: HaxeValue = globalThis.Error;
  const Function: HaxeValue = globalThis.Function;
  const Array: HaxeValue = globalThis.Array;
  const String: HaxeValue = globalThis.String;
  const Date: HaxeValue = globalThis.Date;
  const Float64Array: HaxeValue = globalThis.Float64Array;
  const Uint32Array: HaxeValue = globalThis.Uint32Array;
  const state: HaxeValue = {};
  let query: HaxeValue = { ...host.query };
  const boundary = (name: string): HaxeValue => new Proxy(function () {}, {
    get(_target, key) { throw new Error('Unavailable display boundary: ' + name + '.' + String(key)); },
    apply() { throw new Error('Unavailable display boundary: ' + name); },
    construct() { throw new Error('Unavailable display boundary: ' + name); }
  });
  const ac: HaxeValue = { getText(key: string) {
    if (!Object.hasOwn(host.assets, key)) throw new Error('Missing original asset: ' + key);
    return host.assets[key];
  }, exists(key: string) { return Object.hasOwn(host.assets, key); } };
  const ba: HaxeValue = { get(key: string, fallback?: unknown) { return Object.hasOwn(state, key) ? state[key] : fallback; }, set(key: string, value: unknown) { state[key] = value; } };
  const Aa: HaxeValue = {
    get(key: string, fallback?: unknown) { return Object.hasOwn(query, key) ? query[key] : fallback; },
    getInt(key: string, fallback = 0) { return Object.hasOwn(query, key) ? H.parseInt(query[key]) : fallback; },
    getFlag(key: string, fallback = false) { return 0 != Aa.getInt(key, fallback ? 1 : 0); },
    reset() { query = {}; }, set(key: string, value: unknown) { query[key] = value; },
    setFlag(key: string, value = true) { query[key] = value ? '1' : '0'; }, update() {}
  };
  const gb: HaxeValue = { trace(message: string) { host.trace?.(message); } };
  const id: HaxeValue = { measure(fn: () => void) { fn(); return 0; } };
  const sb: HaxeValue = { preview: false };
  const gc: HaxeValue = {};
`;
const adapted = new Set(['ac','ba','Aa','gb','id','sb','gc']);
const missing = selectedNames.filter(item => item.boundary && !adapted.has(item.symbol));
const declarations = missing.map(item => `const ${item.symbol}: HaxeValue = boundary(${JSON.stringify(item.name ?? item.symbol)});`).join('\n');
const footer = `
  g.Math = Math; g.String = String; g.Array = Array; g.Date = Date;
  kd.prepare(state);
  Object.assign(state, host.preferences);
  return { classes: g, enums: y, Random: C, City: Ub, Blueprint: Fd, Namer: Ma, Trees: gc, state };
}`;
const wrapped = parse(header + declarations + '\n' + generate(t.file(t.program(rawNodes)), { comments: false }).code + footer, { sourceType: 'module', plugins: ['typescript'] });
traverse(wrapped, {
  Function(path) {
    if (path.node.start < header.length) return;
    path.node.returnType = t.tsTypeAnnotation(t.tsTypeReference(t.identifier('HaxeValue')));
    for (const param of path.node.params) if (t.isIdentifier(param)) {
      param.typeAnnotation = t.tsTypeAnnotation(t.tsTypeReference(t.identifier('HaxeValue')));
      param.optional = true;
    }
    if (!t.isArrowFunctionExpression(path.node)) {
      const self = t.identifier('this');
      self.typeAnnotation = t.tsTypeAnnotation(t.tsTypeReference(t.identifier('HaxeValue')));
      path.node.params.unshift(self);
    }
  },
  VariableDeclarator(path) {
    if (path.node.start < header.length || !t.isIdentifier(path.node.id) || path.node.id.typeAnnotation) return;
    if (path.parentPath.parentPath.isForInStatement() || path.parentPath.parentPath.isForOfStatement()) return;
    path.node.id.typeAnnotation = t.tsTypeAnnotation(t.tsTypeReference(t.identifier('HaxeValue')));
  },
  CatchClause(path) {
    if (t.isIdentifier(path.node.param)) path.node.param.typeAnnotation = t.tsTypeAnnotation(t.tsAnyKeyword());
  }
});
let factory;
traverse(wrapped, { FunctionDeclaration(path) { if (path.node.id?.name === 'createOriginalKernel') { factory = path; path.stop(); } } });
const readable = new Map([...names, ...enums].map(([symbol, name]) => [symbol, name.replace(/^com\.watabou\./, '').replace(/[^a-zA-Z0-9_$]/g, '_')]));
for (const [symbol, name] of readable) if (factory.scope.hasOwnBinding(symbol)) factory.scope.rename(symbol, name);
fs.mkdirSync('src/original', { recursive: true });
fs.writeFileSync('src/original/kernel.ts', '// Generated by scripts/extract-original.mjs from Watabou MFCG 0.11.5 (build 2431).\n// Haxe dynamic values preserve original prototypes, enums and object identity.\n// Do not hand-edit generation expressions: regenerate and run the original parity tests.\n' + generate(wrapped, { comments: false }).code + '\n');

const provenance = {
  title: 'Medieval Fantasy City Generator', author: 'Oleg Dolya / Watabou',
  version: '0.11.5', build: 2431,
  url: 'https://watabou.github.io/city-generator/mfcg.js', sourceSha256: expectedSha,
  transforms: ['AST dependency closure', 'split top-level comma/declaration statements', 'host adapters', 'explicit Haxe dynamic type annotations', 'scope-safe readable class identifiers'],
  classes: selectedNames.map(({ symbol, name, boundary }) => ({ symbol, name, boundary })),
  assets: Object.fromEntries(fs.readdirSync('src/original/assets').sort().map(file => [file, crypto.createHash('sha256').update(fs.readFileSync('src/original/assets/' + file)).digest('hex')])),
};
fs.writeFileSync('src/original/provenance.json', JSON.stringify(provenance, null, 2) + '\n');
