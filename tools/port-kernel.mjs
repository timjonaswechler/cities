// Build-time translator for the pinned, recovered Haxe kernel. The resulting
// executable contains Rust functions, not JavaScript source or an interpreter.
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { parse } from '../backlog/typescript-2026-10-14/node_modules/@babel/parser/lib/index.js';

const input = 'backlog/typescript-2026-10-14/src/original/kernel.ts';
const source = readFileSync(input, 'utf8');
const ast = parse(source, { sourceType: 'module', plugins: ['typescript'] });
const kernel = ast.program.body.find(n => n.declaration?.id?.name === 'createOriginalKernel').declaration;
// Replace only the browser/host preamble. All recovered algorithm statements,
// starting at the Haxe inheritance helper, are translated without rewriting.
const start = kernel.body.body.findIndex(n => n.type === 'FunctionDeclaration' && n.id.name === 'v');
const preamble = ['host', 'E', 'state', 'query', 'openfl_utils_Assets', 'system_State', 'system_URLState', 'haxe_Log', 'utils_Stopwatch', 'mfcg_Main', 'mfcg_mapping_TreesLayer', 'openfl_net_URLRequest', 'openfl_Lib', 'mfcg_scenes_TownScene', 'openfl_text_TextFormat'];
const builtins = ['Object', 'Array', 'String', 'Number', 'Boolean', 'Function', 'Error', 'Date', 'Float64Array', 'Uint32Array', 'Int32Array', 'Uint16Array', 'RegExp', 'Math', 'JSON', 'parseInt', 'parseFloat', 'isNaN', 'Infinity', 'NaN', 'undefined'];
const functions = []; const locations = [];
let counter = 0;
const quote = s => JSON.stringify(s).replace(/\\u([0-9a-fA-F]{4})/g, '\\u{$1}');
const walkLocal = (n, fn, root = true) => {
  if (!n || typeof n !== 'object') return;
  fn(n);
  if (!root && ['FunctionExpression', 'FunctionDeclaration', 'ArrowFunctionExpression', 'ObjectMethod'].includes(n.type)) return;
  for (const [key, child] of Object.entries(n)) {
    if (['loc', 'start', 'end', 'comments', 'leadingComments', 'trailingComments', 'typeAnnotation', 'returnType'].includes(key)) continue;
    if (Array.isArray(child)) child.forEach(c => walkLocal(c, fn, false));
    else if (child?.type) walkLocal(child, fn, false);
  }
};

class Emitter {
  constructor(node, parent, root = false) {
    this.node = node; this.parent = parent; this.root = root;
    this.names = new Map(); this.code = []; this.controls = []; this.returnOption = false;
    const add = name => { if (!this.names.has(name)) this.names.set(name, this.names.size); };
    if (root) [...preamble, ...builtins].forEach(add);
    for (const p of node.params ?? []) if (p.name !== 'this') add(p.name);
    walkLocal(node.body, n => {
      if (n.type === 'VariableDeclarator') add(n.id.name);
      if (n.type === 'FunctionDeclaration') add(n.id.name);
      if (n.type === 'CatchClause') add(n.param.name);
    });
  }
  emit(s) { this.code.push(s); }
  tmp(expr) { const n = `t${counter++}`; this.emit(`let ${n} = ${expr};`); return n; }
  resolve(name) {
    let e = this, depth = 0;
    while (e) { if (e.names.has(name)) return [depth, e.names.get(name)]; e = e.parent; depth++; }
    throw new Error(`Unbound ${name} at ${this.node.loc?.start.line}`);
  }
  read(name) { const [d, i] = this.resolve(name); return this.tmp(`rt.local(env, ${d}, ${i})`); }
  write(name, val) { const [d, i] = this.resolve(name); this.emit(`rt.set_local(env, ${d}, ${i}, ${val});`); }
  ref(node) {
    if (node.type === 'Identifier') return { name: node.name };
    if (node.type !== 'MemberExpression') throw new Error(`Bad reference ${node.type}`);
    const obj = this.expr(node.object);
    const key = node.computed ? this.expr(node.property) : this.tmp(`rt.string(${quote(node.property.name)})`);
    return { obj, key };
  }
  get(ref) { return ref.name ? this.read(ref.name) : this.tmp(`rt.get(${ref.obj}, ${ref.key})?`); }
  put(ref, val) { if (ref.name) this.write(ref.name, val); else this.emit(`rt.set(${ref.obj}, ${ref.key}, ${val})?;`); return val; }
  expr(n) {
    if (!n) return 'V::Undefined';
    switch (n.type) {
      case 'Identifier': return this.read(n.name);
      case 'ThisExpression': return 'this';
      case 'NumericLiteral': return `V::Number(${String(n.value).includes('.') || /e/i.test(String(n.value)) ? n.value : n.value + '.0'})`;
      case 'StringLiteral': return this.tmp(`rt.string(${quote(n.value)})`);
      case 'BooleanLiteral': return `V::Bool(${n.value})`;
      case 'NullLiteral': return 'V::Null';
      case 'ArrayExpression': { const items = n.elements.map(e => this.expr(e)); return this.tmp(`rt.array(vec![${items.join(', ')}])`); }
      case 'ObjectExpression': {
        const obj = this.tmp('rt.object()');
        for (const p of n.properties) {
          const key = p.computed ? this.expr(p.key) : this.tmp(`rt.string(${quote(p.key.name ?? String(p.key.value))})`);
          const val = p.type === 'ObjectMethod' ? this.fn(p) : this.expr(p.value);
          this.emit(`rt.set(${obj}, ${key}, ${val})?;`);
        }
        return obj;
      }
      case 'MemberExpression': return this.get(this.ref(n));
      case 'FunctionExpression': case 'ArrowFunctionExpression': return this.fn(n);
      case 'CallExpression': case 'NewExpression': {
        let fn, receiver = 'V::Undefined';
        if (n.type === 'CallExpression' && n.callee.type === 'MemberExpression') { const ref = this.ref(n.callee); receiver = ref.obj; fn = this.get(ref); }
        else fn = this.expr(n.callee);
        const args = n.arguments.map(a => this.expr(a));
        return this.tmp(n.type === 'NewExpression' ? `rt.construct(${fn}, &[${args.join(', ')}])?` : `rt.call(${fn}, ${receiver}, &[${args.join(', ')}])?`);
      }
      case 'AssignmentExpression': {
        const ref = this.ref(n.left);
        let before;
        if (n.operator !== '=') before = this.get(ref);
        let val = this.expr(n.right);
        if (before) val = this.tmp(`rt.binary(${quote(n.operator.slice(0, -1))}, ${before}, ${val})?`);
        return this.put(ref, val);
      }
      case 'UpdateExpression': {
        const ref = this.ref(n.argument), old = this.get(ref);
        const number = this.tmp(`V::Number(rt.number(${old}))`);
        const val = this.tmp(`V::Number(rt.number(${number}) ${n.operator === '++' ? '+' : '-'} 1.0)`);
        this.put(ref, val); return n.prefix ? val : number;
      }
      case 'UnaryExpression': {
        if (n.operator === 'delete') { const ref = this.ref(n.argument); return this.tmp(`V::Bool(rt.delete(${ref.obj}, ${ref.key}))`); }
        const v = this.expr(n.argument); return this.tmp(`rt.unary(${quote(n.operator)}, ${v})?`);
      }
      case 'BinaryExpression': { const a = this.expr(n.left), b = this.expr(n.right); return this.tmp(`rt.binary(${quote(n.operator)}, ${a}, ${b})?`); }
      case 'LogicalExpression': {
        const a = this.expr(n.left), out = `t${counter++}`;
        this.emit(`let ${out} = if ${n.operator === '&&' ? '' : '!'}rt.truthy(${a}) {`);
        const b = this.expr(n.right); this.emit(`${b}\n} else { ${a} };`); return out;
      }
      case 'ConditionalExpression': {
        const cond = this.expr(n.test), out = `t${counter++}`; this.emit(`let ${out} = if rt.truthy(${cond}) {`);
        const a = this.expr(n.consequent); this.emit(`${a}\n} else {`);
        const b = this.expr(n.alternate); this.emit(`${b}\n};`); return out;
      }
      case 'SequenceExpression': { let last; for (const expr of n.expressions) last = this.expr(expr); return last; }
      case 'RegExpLiteral': return this.tmp(`rt.regexp(${quote(n.pattern)}, ${quote(n.flags)})?`);
      default: throw new Error(`Expression ${n.type} at ${n.loc?.start.line}`);
    }
  }
  fn(node) {
    const id = functions.length; functions.push(''); locations[id] = node.loc?.start.line;
    const child = new Emitter(node, this);
    child.emit(`let env = rt.environment(captured, ${child.names.size});`);
    let arg = 0;
    for (const p of node.params ?? []) {
      if (p.name === 'this') continue;
      child.write(p.name, `args.get(${arg++}).copied().unwrap_or(V::Undefined)`);
    }
    child.hoist(node.body);
    child.stmt(node.body); child.emit('Ok(V::Undefined)');
    functions[id] = `// Original kernel.ts:${locations[id]}\nfn f${id}(rt: &mut Runtime, captured: V, this: V, args: &[V]) -> R {\n${child.code.join('\n')}\n}\n`;
    return this.tmp(`rt.function(f${id}, env, ${quote(`kernel.ts:${locations[id]}`)})`);
  }
  hoist(body) {
    walkLocal(body, n => { if (n.type === 'FunctionDeclaration') { const val = this.fn(n); this.write(n.id.name, val); } });
  }
  result(val) { return this.returnOption ? `Ok(Some(${val}))` : `Ok(${val})`; }
  stmt(n, explicitLabel) {
    if (!n) return;
    switch (n.type) {
      case 'BlockStatement': {
        if (explicitLabel) { const label = `block${counter++}`; this.controls.push({ label, explicitLabel }); this.emit(`'${label}: {`); }
        // Temporaries never cross source statements (locals live in the
        // captured frame). Bound debug scopes avoid deeply nested LLVM DIEs.
        for (const c of n.body) { this.emit('{'); this.stmt(c); this.emit('}'); }
        if (explicitLabel) { this.emit('}'); this.controls.pop(); }
        break;
      }
      case 'FunctionDeclaration': case 'EmptyStatement': break;
      case 'ExpressionStatement': this.expr(n.expression); break;
      case 'VariableDeclaration': for (const d of n.declarations) if (d.init) this.write(d.id.name, this.expr(d.init)); break;
      case 'ReturnStatement': this.emit(`return ${this.result(this.expr(n.argument))};`); break;
      case 'ThrowStatement': this.emit(`return Err(${this.expr(n.argument)});`); break;
      case 'IfStatement': {
        const cond = this.expr(n.test); this.emit(`if rt.truthy(${cond}) {`); this.stmt(n.consequent);
        if (n.alternate) { this.emit('} else {'); this.stmt(n.alternate); } this.emit('}'); break;
      }
      case 'LabeledStatement': this.stmt(n.body, n.label.name); break;
      case 'ForStatement': case 'DoWhileStatement': case 'WhileStatement': {
        const id = counter++, label = `loop${id}`, cont = `body${id}`;
        this.controls.push({ label, cont, explicitLabel });
        if (n.init) n.init.type === 'VariableDeclaration' ? this.stmt(n.init) : this.expr(n.init);
        this.emit(`'${label}: loop { rt.tick()?;`);
        if (n.type !== 'DoWhileStatement' && n.test) { const cond = this.expr(n.test); this.emit(`if !rt.truthy(${cond}) { break '${label}; }`); }
        this.emit(`'${cont}: {`); this.stmt(n.body); this.emit('}');
        if (n.update) this.expr(n.update);
        if (n.type === 'DoWhileStatement') { const cond = this.expr(n.test); this.emit(`if !rt.truthy(${cond}) { break '${label}; }`); }
        this.emit('}'); this.controls.pop(); break;
      }
      case 'ForInStatement': {
        const obj = this.expr(n.right); const keys = this.tmp(`rt.enumerate(${obj}, true)`);
        const label = `loop${counter++}`, cont = `body${counter++}`, key = `key${counter++}`;
        this.controls.push({ label, cont, explicitLabel });
        this.emit(`'${label}: for ${key} in ${keys} { rt.tick()?;`);
        const ref = this.ref(n.left.type === 'VariableDeclaration' ? n.left.declarations[0].id : n.left); this.put(ref, key);
        this.emit(`'${cont}: {`); this.stmt(n.body); this.emit('}\n}'); this.controls.pop(); break;
      }
      case 'BreakStatement': case 'ContinueStatement': {
        const target = [...this.controls].reverse().find(c => n.label ? c.explicitLabel === n.label.name : n.type === 'BreakStatement' || c.cont);
        if (!target) throw new Error(`Unknown label at ${n.loc.start.line}`);
        this.emit(`break '${n.type === 'BreakStatement' ? target.label : target.cont};`); break;
      }
      case 'SwitchStatement': {
        const v = this.expr(n.discriminant), selected = `selected${counter++}`, label = `switch${counter++}`;
        this.emit(`let mut ${selected}: usize = ${n.cases.findIndex(c => c.test == null) < 0 ? n.cases.length : n.cases.findIndex(c => c.test == null)};`);
        // Evaluate labels in source order, then execute all subsequent cases
        // until an explicit break (including JavaScript fallthrough).
        const choose = `choose${counter++}`; this.emit(`'${choose}: {`);
        n.cases.forEach((c, i) => { if (c.test) { const t = this.expr(c.test); this.emit(`if rt.strict_eq(${v}, ${t}) { ${selected} = ${i}; break '${choose}; }`); } });
        this.emit('}'); this.emit(`'${label}: {`); this.controls.push({ label, explicitLabel });
        n.cases.forEach((c, i) => { this.emit(`if ${selected} <= ${i} {`); c.consequent.forEach(s => this.stmt(s)); this.emit('}'); });
        this.controls.pop(); this.emit('}'); break;
      }
      case 'TryStatement': {
        if (n.finalizer) throw new Error('Unexpected finally');
        const was = this.returnOption; const result = `result${counter++}`;
        this.emit(`let ${result} = (|| -> Result<Option<V>, V> {`); this.returnOption = true;
        this.stmt(n.block); this.emit('Ok(None)\n})();'); this.returnOption = was;
        this.emit(`match ${result} { Ok(Some(value)) => return ${this.result('value')}, Ok(None) => {}, Err(error) => {`);
        this.write(n.handler.param.name, 'error'); this.stmt(n.handler.body); this.emit('} }'); break;
      }
      default: throw new Error(`Statement ${n.type} at ${n.loc?.start.line}`);
    }
  }
}

const body = { type: 'BlockStatement', body: kernel.body.body.slice(start) };
const root = new Emitter({ body, params: [] }, null, true);
root.emit(`let env = rt.environment(V::Null, ${root.names.size});`);
root.emit('let this = V::Undefined;');
for (const name of [...preamble, ...builtins]) { const val = root.tmp(`rt.host_value(${quote(name)}, host)?`); root.write(name, val); }
root.hoist(body);
root.stmt(body);
root.emit('Ok(V::Undefined)');
const header = `//! Mechanically ported original generation functions. See tools/port-kernel.mjs.\n//! Source SHA-256: ${createHash('sha256').update(source).digest('hex')}\n#![allow(unused_variables, unused_mut, unused_labels, unreachable_code, clippy::all)]\nuse crate::runtime::{Runtime, V, R};\n`;
mkdirSync('crates/city_core/src', { recursive: true });
writeFileSync('crates/city_core/src/generated.rs', `${header}\npub(crate) fn initialize(rt: &mut Runtime, host: V) -> R {\n${root.code.join('\n')}\n}\n${functions.join('\n')}`);
writeFileSync('tools/port-provenance.json', JSON.stringify({ source: input, sourceSha256: createHash('sha256').update(source).digest('hex'), functions: functions.length, functionSourceLines: locations, hostBoundary: preamble, compilation: 'Ahead-of-time native Rust; no JavaScript interpreter or Node runtime dependency.' }, null, 2) + '\n');
console.log(`Translated ${functions.length} functions to native Rust.`);
