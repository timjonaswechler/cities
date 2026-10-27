//! Small native compatibility layer for Haxe's dynamic values. The recovered
//! functions are compiled Rust; this module does not parse or interpret code.
//! Objects use arena IDs so DCEL cycles and identity survive unchanged. The
//! whole arena is dropped after projection into the public, owned city model.
use std::collections::{HashMap, HashSet};

#[derive(Clone, Copy, Debug, PartialEq)]
pub(crate) enum V {
    Undefined,
    Null,
    Bool(bool),
    Number(f64),
    String(usize),
    Object(usize),
}
pub(crate) type R = Result<V, V>;
type Native = fn(&mut Runtime, V, V, &[V]) -> R;

#[derive(Clone)]
enum Kind {
    Plain,
    Array(Vec<V>, u8),
    Function(Native, V, &'static str),
    Builtin(String),
    Bound(V, V, Vec<V>),
    Environment(V, Vec<V>),
    Regex(regex::Regex, bool),
}
struct Object {
    kind: Kind,
    prototype: V,
    properties: Vec<(usize, V)>,
}

pub(crate) struct Runtime {
    objects: Vec<Object>,
    strings: Vec<Vec<u16>>,
    intern: HashMap<Vec<u16>, usize>,
    globals: HashMap<String, V>,
    methods: HashMap<String, V>,
    object_prototype: V,
    function_prototype: V,
    array_prototype: V,
    pub(crate) steps: u64,
    pub(crate) retries: u32,
    stack: Vec<String>,
    pub(crate) error_stack: Vec<String>,
    trace: bool,
    host_random: u64,
}

impl Runtime {
    pub(crate) fn new() -> Self {
        let mut rt = Self {
            objects: vec![],
            strings: vec![],
            intern: HashMap::new(),
            globals: HashMap::new(),
            methods: HashMap::new(),
            object_prototype: V::Null,
            function_prototype: V::Null,
            array_prototype: V::Null,
            steps: 0,
            retries: 0,
            stack: vec![],
            error_stack: vec![],
            trace: std::env::var_os("CITY_TRACE").is_some(),
            host_random: (std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap_or_default()
                .as_nanos() as u64)
                | 1,
        };
        rt.object_prototype = rt.alloc(Kind::Plain, V::Null);
        rt.function_prototype = rt.alloc(Kind::Plain, rt.object_prototype);
        rt.array_prototype = rt.alloc(Kind::Plain, rt.object_prototype);
        for name in [
            "Object",
            "Array",
            "String",
            "Number",
            "Boolean",
            "Function",
            "Error",
            "Date",
            "Float64Array",
            "Uint32Array",
            "Int32Array",
            "Uint16Array",
            "RegExp",
            "parseInt",
            "parseFloat",
            "isNaN",
        ] {
            let value = rt.builtin(name);
            let proto = if name == "Object" {
                rt.object_prototype
            } else if name == "Function" {
                rt.function_prototype
            } else if name == "Array" {
                rt.array_prototype
            } else {
                rt.object()
            };
            rt.put(value, "prototype", proto);
            rt.put(proto, "constructor", value);
            rt.globals.insert(name.into(), value);
        }
        let math = rt.object();
        rt.put(math, "PI", V::Number(std::f64::consts::PI));
        for name in [
            "abs", "sqrt", "sin", "cos", "tan", "atan2", "atan", "acos", "asin", "floor", "ceil",
            "round", "pow", "min", "max", "log", "exp", "random",
        ] {
            let f = rt.builtin(&format!("Math.{name}"));
            rt.put(math, name, f);
        }
        rt.globals.insert("Math".into(), math);
        let json = rt.object();
        for name in ["parse", "stringify"] {
            let f = rt.builtin(&format!("JSON.{name}"));
            rt.put(json, name, f);
        }
        rt.globals.insert("JSON".into(), json);
        rt.globals
            .insert("Infinity".into(), V::Number(f64::INFINITY));
        rt.globals.insert("NaN".into(), V::Number(f64::NAN));
        rt.globals.insert("undefined".into(), V::Undefined);
        for name in ["create", "keys", "hasOwn", "assign", "defineProperty"] {
            let f = rt.builtin(&format!("Object.{name}"));
            rt.put(rt.globals["Object"], name, f);
        }
        let f = rt.builtin("Array.isArray");
        rt.put(rt.globals["Array"], "isArray", f);
        for name in ["fromCodePoint", "fromCharCode"] {
            let f = rt.builtin(&format!("String.{name}"));
            rt.put(rt.globals["String"], name, f);
        }
        let f = rt.builtin("Date.now");
        rt.put(rt.globals["Date"], "now", f);
        for name in ["toString", "hasOwnProperty"] {
            let f = rt.builtin(&format!("Object.{name}"));
            rt.put(rt.object_prototype, name, f);
        }
        for name in ["call", "apply", "bind"] {
            let f = rt.builtin(&format!("Function.{name}"));
            rt.put(rt.function_prototype, name, f);
        }
        rt
    }
    fn alloc(&mut self, kind: Kind, prototype: V) -> V {
        let id = self.objects.len();
        self.objects.push(Object {
            kind,
            prototype,
            properties: vec![],
        });
        V::Object(id)
    }
    pub(crate) fn object(&mut self) -> V {
        self.alloc(Kind::Plain, self.object_prototype)
    }
    pub(crate) fn array(&mut self, values: Vec<V>) -> V {
        self.alloc(Kind::Array(values, 0), self.array_prototype)
    }
    pub(crate) fn string(&mut self, text: &str) -> V {
        self.utf16(text.encode_utf16().collect())
    }
    fn utf16(&mut self, text: Vec<u16>) -> V {
        if let Some(id) = self.intern.get(&text) {
            return V::String(*id);
        }
        let id = self.strings.len();
        self.intern.insert(text.clone(), id);
        self.strings.push(text);
        V::String(id)
    }
    fn key(&mut self, value: V) -> usize {
        if let V::String(id) = value {
            id
        } else {
            let s = self.text(value);
            let V::String(id) = self.string(&s) else {
                unreachable!()
            };
            id
        }
    }
    pub(crate) fn text(&self, value: V) -> String {
        match value {
            V::Undefined => "undefined".into(),
            V::Null => "null".into(),
            V::Bool(b) => b.to_string(),
            V::Number(n) => {
                if n.is_nan() {
                    "NaN".into()
                } else if n == f64::INFINITY {
                    "Infinity".into()
                } else if n == f64::NEG_INFINITY {
                    "-Infinity".into()
                } else if n == 0.0 {
                    "0".into()
                } else {
                    n.to_string()
                }
            }
            V::String(id) => String::from_utf16_lossy(&self.strings[id]),
            V::Object(id) => match &self.objects[id].kind {
                Kind::Array(items, _) => items
                    .iter()
                    .map(|&v| {
                        if self.nullish(v) {
                            String::new()
                        } else {
                            self.text(v)
                        }
                    })
                    .collect::<Vec<_>>()
                    .join(","),
                Kind::Function(_, _, name) => format!("function {name}() {{ [native Rust] }}"),
                Kind::Builtin(name) => format!("function {name}() {{ [native Rust] }}"),
                _ => "[object Object]".into(),
            },
        }
    }
    pub(crate) fn number(&self, v: V) -> f64 {
        match v {
            V::Number(n) => n,
            V::Null => 0.0,
            V::Bool(b) => {
                if b {
                    1.0
                } else {
                    0.0
                }
            }
            V::Undefined => f64::NAN,
            _ => {
                let t = self.text(v);
                let s = t.trim();
                if s.is_empty() {
                    0.0
                } else if s.starts_with("0x") || s.starts_with("0X") {
                    u64::from_str_radix(&s[2..], 16)
                        .map(|v| v as f64)
                        .unwrap_or(f64::NAN)
                } else {
                    s.parse().unwrap_or(f64::NAN)
                }
            }
        }
    }
    pub(crate) fn nullish(&self, v: V) -> bool {
        matches!(v, V::Null | V::Undefined)
    }
    pub(crate) fn truthy(&self, v: V) -> bool {
        match v {
            V::Undefined | V::Null => false,
            V::Bool(b) => b,
            V::Number(n) => n != 0.0 && !n.is_nan(),
            V::String(s) => !self.strings[s].is_empty(),
            _ => true,
        }
    }
    fn uint32(&self, v: V) -> u32 {
        let n = self.number(v);
        if !n.is_finite() || n == 0.0 {
            0
        } else {
            n.trunc().rem_euclid(4294967296.0) as u32
        }
    }
    pub(crate) fn strict_eq(&self, a: V, b: V) -> bool {
        a == b
    }
    fn equal(&self, a: V, b: V) -> bool {
        if self.strict_eq(a, b) || (self.nullish(a) && self.nullish(b)) {
            return true;
        }
        if self.nullish(a) || self.nullish(b) {
            return false;
        }
        match (a, b) {
            (V::Bool(_), _)
            | (_, V::Bool(_))
            | (V::Number(_), V::String(_))
            | (V::String(_), V::Number(_)) => self.number(a) == self.number(b),
            _ => false,
        }
    }
    pub(crate) fn unary(&mut self, op: &str, v: V) -> R {
        Ok(match op {
            "!" => V::Bool(!self.truthy(v)),
            "-" => V::Number(-self.number(v)),
            "+" => V::Number(self.number(v)),
            "~" => V::Number(!(self.uint32(v) as i32) as f64),
            "typeof" => {
                let s = match v {
                    V::Undefined => "undefined",
                    V::Bool(_) => "boolean",
                    V::Number(_) => "number",
                    V::String(_) => "string",
                    V::Object(id)
                        if matches!(
                            self.objects[id].kind,
                            Kind::Function(..) | Kind::Builtin(_) | Kind::Bound(..)
                        ) =>
                    {
                        "function"
                    }
                    _ => "object",
                };
                self.string(s)
            }
            _ => return Err(self.string(&format!("Unsupported unary operation {op}"))),
        })
    }
    pub(crate) fn binary(&mut self, op: &str, a: V, b: V) -> R {
        let x = self.number(a);
        let y = self.number(b);
        Ok(match op {
            "+" if matches!(a, V::String(_)) || matches!(b, V::String(_)) => {
                self.string(&(self.text(a) + &self.text(b)))
            }
            "+" => V::Number(x + y),
            "-" => V::Number(x - y),
            "*" => V::Number(x * y),
            "/" => V::Number(x / y),
            "%" => V::Number(x % y),
            "==" => V::Bool(self.equal(a, b)),
            "!=" => V::Bool(!self.equal(a, b)),
            "===" => V::Bool(self.strict_eq(a, b)),
            "!==" => V::Bool(!self.strict_eq(a, b)),
            "<" | ">" | "<=" | ">=" => {
                let ord = if let (V::String(i), V::String(j)) = (a, b) {
                    self.strings[i].partial_cmp(&self.strings[j])
                } else {
                    x.partial_cmp(&y)
                };
                V::Bool(match op {
                    "<" => ord.is_some_and(|v| v.is_lt()),
                    ">" => ord.is_some_and(|v| v.is_gt()),
                    "<=" => ord.is_some_and(|v| v.is_le()),
                    _ => ord.is_some_and(|v| v.is_ge()),
                })
            }
            "|" => V::Number((self.uint32(a) | self.uint32(b)) as i32 as f64),
            "&" => V::Number((self.uint32(a) & self.uint32(b)) as i32 as f64),
            "^" => V::Number((self.uint32(a) ^ self.uint32(b)) as i32 as f64),
            "<<" => V::Number((self.uint32(a) << (self.uint32(b) & 31)) as i32 as f64),
            ">>>" => V::Number((self.uint32(a) >> (self.uint32(b) & 31)) as f64),
            ">>" => V::Number(((self.uint32(a) as i32) >> (self.uint32(b) & 31)) as f64),
            "instanceof" => {
                let proto = self.get_name(b, "prototype")?;
                let mut p = a;
                let mut yes = false;
                for _ in 0..1024 {
                    let V::Object(id) = p else {
                        break;
                    };
                    p = self.objects[id].prototype;
                    if p == proto {
                        yes = true;
                        break;
                    }
                }
                V::Bool(yes)
            }
            _ => return Err(self.string(&format!("Unsupported binary operation {op}"))),
        })
    }
    pub(crate) fn environment(&mut self, parent: V, count: usize) -> V {
        self.alloc(
            Kind::Environment(parent, vec![V::Undefined; count]),
            V::Null,
        )
    }
    pub(crate) fn local(&self, mut env: V, mut depth: usize, slot: usize) -> V {
        loop {
            let V::Object(id) = env else { unreachable!() };
            let Kind::Environment(parent, ref values) = self.objects[id].kind else {
                unreachable!()
            };
            if depth == 0 {
                return values[slot];
            }
            env = parent;
            depth -= 1;
        }
    }
    pub(crate) fn set_local(&mut self, mut env: V, mut depth: usize, slot: usize, value: V) {
        loop {
            let V::Object(id) = env else { unreachable!() };
            let Kind::Environment(parent, ref mut values) = self.objects[id].kind else {
                unreachable!()
            };
            if depth == 0 {
                values[slot] = value;
                return;
            }
            env = parent;
            depth -= 1;
        }
    }
    pub(crate) fn function(&mut self, f: Native, env: V, name: &'static str) -> V {
        let value = self.alloc(Kind::Function(f, env, name), self.function_prototype);
        let proto = self.object();
        self.put(value, "prototype", proto);
        self.put(proto, "constructor", value);
        value
    }
    fn builtin(&mut self, name: &str) -> V {
        if let Some(&value) = self.methods.get(name) {
            return value;
        }
        let value = self.alloc(Kind::Builtin(name.into()), self.function_prototype);
        self.methods.insert(name.into(), value);
        value
    }
    pub(crate) fn put(&mut self, object: V, name: &str, value: V) {
        let key = self.string(name);
        self.set(object, key, value).expect("object property");
    }
    pub(crate) fn get_name(&mut self, object: V, name: &str) -> R {
        let key = self.string(name);
        self.get(object, key)
    }
    fn own(&self, id: usize, key: usize) -> Option<V> {
        self.objects[id]
            .properties
            .iter()
            .find(|(k, _)| *k == key)
            .map(|(_, v)| *v)
    }
    fn index(&self, key: usize) -> Option<usize> {
        let s = String::from_utf16_lossy(&self.strings[key]);
        let i: u32 = s.parse().ok()?;
        if i == u32::MAX || i.to_string() != s {
            None
        } else {
            Some(i as usize)
        }
    }
    pub(crate) fn get(&mut self, object: V, property: V) -> R {
        let key = self.key(property);
        let name = String::from_utf16_lossy(&self.strings[key]);
        if let V::String(id) = object {
            if name == "length" {
                return Ok(V::Number(self.strings[id].len() as f64));
            }
            if let Some(i) = self.index(key) {
                return Ok(self.strings[id]
                    .get(i)
                    .copied()
                    .map(|c| self.utf16(vec![c]))
                    .unwrap_or(V::Undefined));
            }
            if [
                "charAt",
                "charCodeAt",
                "substring",
                "substr",
                "slice",
                "split",
                "indexOf",
                "lastIndexOf",
                "toLowerCase",
                "toUpperCase",
                "trim",
                "replace",
                "match",
                "toString",
            ]
            .contains(&name.as_str())
            {
                return Ok(self.builtin(&format!("String.{name}")));
            }
        }
        if let V::Number(_) = object
            && name == "toString"
        {
            return Ok(self.builtin("Number.toString"));
        }
        let mut current = object;
        for _ in 0..1024 {
            let V::Object(id) = current else {
                break;
            };
            if let Some(value) = self.own(id, key) {
                return Ok(value);
            }
            if let Kind::Array(ref items, _) = self.objects[id].kind {
                if name == "length" {
                    return Ok(V::Number(items.len() as f64));
                }
                if let Some(index) = self.index(key) {
                    return Ok(items.get(index).copied().unwrap_or(V::Undefined));
                }
                if [
                    "push",
                    "pop",
                    "shift",
                    "unshift",
                    "slice",
                    "splice",
                    "concat",
                    "join",
                    "indexOf",
                    "lastIndexOf",
                    "sort",
                    "reverse",
                    "subarray",
                    "fill",
                    "map",
                    "filter",
                    "some",
                    "every",
                ]
                .contains(&name.as_str())
                {
                    return Ok(self.builtin(&format!("Array.{name}")));
                }
            }
            if matches!(self.objects[id].kind, Kind::Regex(..))
                && ["exec", "test"].contains(&name.as_str())
            {
                return Ok(self.builtin(&format!("RegExp.{name}")));
            }
            current = self.objects[id].prototype;
        }
        if self.nullish(object) {
            Err(self.string(&format!("Cannot read '{name}' of {}", self.text(object))))
        } else {
            Ok(V::Undefined)
        }
    }
    pub(crate) fn set(&mut self, object: V, property: V, value: V) -> R {
        let V::Object(id) = object else {
            return Err(self.string("Cannot assign property on non-object"));
        };
        let key = self.key(property);
        let name = String::from_utf16_lossy(&self.strings[key]);
        let index = self.index(key);
        let number = self.number(value);
        let uint = self.uint32(value);
        if let Kind::Array(ref mut items, ty) = self.objects[id].kind {
            if name == "length" {
                items.resize(number as usize, V::Undefined);
                return Ok(value);
            }
            if let Some(i) = index {
                if ty > 0 && i >= items.len() {
                    return Ok(value);
                }
                if i > 10_000_000 {
                    return Err(self.string("Array allocation limit exceeded"));
                }
                if i >= items.len() {
                    items.resize(i + 1, V::Undefined);
                }
                items[i] = match ty {
                    1 => V::Number(number),
                    2 => V::Number(uint as f64),
                    3 => V::Number(uint as i32 as f64),
                    4 => V::Number(uint as u16 as f64),
                    _ => value,
                };
                return Ok(value);
            }
        }
        if let Some((_, old)) = self.objects[id]
            .properties
            .iter_mut()
            .find(|(k, _)| *k == key)
        {
            *old = value;
        } else {
            self.objects[id].properties.push((key, value));
        }
        Ok(value)
    }
    pub(crate) fn delete(&mut self, object: V, property: V) -> bool {
        let key = self.key(property);
        if let V::Object(id) = object {
            self.objects[id].properties.retain(|(k, _)| *k != key);
        }
        true
    }
    pub(crate) fn enumerate(&mut self, object: V, inherited: bool) -> Vec<V> {
        let mut current = object;
        let mut keys = vec![];
        let mut seen = HashSet::new();
        while let V::Object(id) = current {
            let mut own: Vec<usize> = self.objects[id]
                .properties
                .iter()
                .map(|(k, _)| *k)
                .collect();
            if let Kind::Array(ref arr, _) = self.objects[id].kind {
                let len = arr.len();
                for i in 0..len {
                    let key = self.string(&i.to_string());
                    if let V::String(k) = key {
                        own.push(k);
                    }
                }
            }
            own.sort_by_key(|k| self.index(*k).map(|n| (0, n)).unwrap_or((1, 0)));
            for key in own {
                if seen.insert(key) {
                    keys.push(V::String(key));
                }
            }
            if !inherited {
                break;
            }
            current = self.objects[id].prototype;
        }
        keys
    }
    fn has_own(&mut self, object: V, property: V) -> bool {
        let key = self.key(property);
        if let V::Object(id) = object {
            if self.own(id, key).is_some() {
                return true;
            }
            if let Kind::Array(ref a, _) = self.objects[id].kind {
                return self.index(key).is_some_and(|i| i < a.len())
                    || self.text(V::String(key)) == "length";
            }
        }
        false
    }
    pub(crate) fn values(&self, object: V) -> Vec<V> {
        if let V::Object(id) = object
            && let Kind::Array(ref values, _) = self.objects[id].kind
        {
            return values.clone();
        }
        vec![]
    }
    pub(crate) fn is_array(&self, object: V) -> bool {
        matches!(object,V::Object(id) if matches!(self.objects[id].kind,Kind::Array(..)))
    }
    pub(crate) fn tick(&mut self) -> R {
        self.steps += 1;
        if self.steps > 300_000_000 {
            Err(self.string("Generation exceeded 300 million loop iterations"))
        } else {
            Ok(V::Undefined)
        }
    }
    pub(crate) fn call(&mut self, function: V, this: V, args: &[V]) -> R {
        let V::Object(id) = function else {
            return Err(self.string(&format!("Not callable: {}", self.text(function))));
        };
        let kind = self.objects[id].kind.clone();
        let (label, result) = match kind {
            Kind::Function(f, env, label) => {
                if self.stack.len() > 512 {
                    return Err(self.string("Generation call depth exceeded"));
                }
                self.stack.push(label.into());
                let res = f(self, env, this, args);
                (label.to_owned(), res)
            }
            Kind::Builtin(name) => {
                self.stack.push(name.clone());
                let res = self.call_builtin(&name, this, args);
                (name, res)
            }
            Kind::Bound(f, receiver, mut bound) => {
                bound.extend_from_slice(args);
                return self.call(f, receiver, &bound);
            }
            _ => return Err(self.string("Object is not callable")),
        };
        if result.is_err() && self.error_stack.len() < self.stack.len() {
            self.error_stack = self.stack.clone();
        }
        let _ = label;
        self.stack.pop();
        result
    }
    pub(crate) fn construct(&mut self, function: V, args: &[V]) -> R {
        if let V::Object(id) = function
            && let Kind::Bound(target, _, mut bound) = self.objects[id].kind.clone()
        {
            bound.extend_from_slice(args);
            // JavaScript's new(boundFunction) ignores the bound receiver.
            return self.construct(target, &bound);
        }
        if let V::Object(id) = function
            && let Kind::Builtin(ref name) = self.objects[id].kind
        {
            let name = name.clone();
            return self.call_builtin(&name, V::Undefined, args);
        }
        let prototype = self.get_name(function, "prototype")?;
        let obj = self.alloc(Kind::Plain, prototype);
        let result = self.call(function, obj, args)?;
        Ok(if matches!(result, V::Object(_)) {
            result
        } else {
            obj
        })
    }
    pub(crate) fn invoke(&mut self, object: V, method: &str, args: &[V]) -> R {
        let function = self.get_name(object, method)?;
        self.call(function, object, args)
    }
    pub(crate) fn regexp(&mut self, pattern: &str, flags: &str) -> R {
        let regex = regex::RegexBuilder::new(pattern)
            .case_insensitive(flags.contains('i'))
            .multi_line(flags.contains('m'))
            .build()
            .map_err(|e| self.string(&e.to_string()))?;
        let value = self.alloc(
            Kind::Regex(regex, flags.contains('g')),
            self.object_prototype,
        );
        self.put(value, "lastIndex", V::Number(0.0));
        Ok(value)
    }
    pub(crate) fn import_json(&mut self, json: &serde_json::Value) -> V {
        match json {
            serde_json::Value::Null => V::Null,
            serde_json::Value::Bool(b) => V::Bool(*b),
            serde_json::Value::Number(n) => V::Number(n.as_f64().unwrap()),
            serde_json::Value::String(s) => self.string(s),
            serde_json::Value::Array(items) => {
                let values = items.iter().map(|v| self.import_json(v)).collect();
                self.array(values)
            }
            serde_json::Value::Object(properties) => {
                let object = self.object();
                for (key, value) in properties {
                    let value = self.import_json(value);
                    self.put(object, key, value);
                }
                object
            }
        }
    }
    pub(crate) fn export_json(&mut self, value: V) -> serde_json::Value {
        match value {
            V::Null | V::Undefined => serde_json::Value::Null,
            V::Bool(b) => b.into(),
            V::Number(n) => serde_json::json!(n),
            V::String(_) => self.text(value).into(),
            V::Object(id) => {
                if let Kind::Array(ref items, _) = self.objects[id].kind {
                    let items = items.clone();
                    return serde_json::Value::Array(
                        items.into_iter().map(|v| self.export_json(v)).collect(),
                    );
                }
                let mut result = serde_json::Map::new();
                for key in self.enumerate(value, false) {
                    if let Ok(item) = self.get(value, key)
                        && item != V::Undefined
                    {
                        result.insert(self.text(key), self.export_json(item));
                    }
                }
                serde_json::Value::Object(result)
            }
        }
    }
    pub(crate) fn host_value(&mut self, name: &str, host: V) -> R {
        if let Some(&value) = self.globals.get(name) {
            return Ok(value);
        }
        let result = match name {
            "host" => host,
            "E" => {
                let o = self.object();
                self.put(o, "$haxeUID", V::Number(0.0));
                o
            }
            "state" => self.get_name(host, "state")?,
            "query" => self.get_name(host, "query")?,
            "mfcg_Main" => {
                let o = self.object();
                self.put(o, "preview", V::Bool(false));
                o
            }
            "mfcg_mapping_TreesLayer" => self.object(),
            "openfl_utils_Assets"
            | "system_State"
            | "system_URLState"
            | "haxe_Log"
            | "utils_Stopwatch" => {
                let o = self.object();
                self.put(o, "host", host);
                let methods: &[&str] = match name {
                    "openfl_utils_Assets" => &["getText", "exists"],
                    "system_State" => &["get", "set"],
                    "system_URLState" => &[
                        "get", "getInt", "getFlag", "set", "setFlag", "reset", "update",
                    ],
                    "haxe_Log" => &["trace"],
                    _ => &["measure"],
                };
                for method in methods {
                    let f = self.builtin(&format!("{name}.{method}"));
                    self.put(o, method, f);
                }
                o
            }
            _ => self.builtin("unavailable_display_boundary"),
        };
        Ok(result)
    }
    fn call_builtin(&mut self, name: &str, this: V, args: &[V]) -> R {
        let a = args.first().copied().unwrap_or(V::Undefined);
        let b = args.get(1).copied().unwrap_or(V::Undefined);
        if let Some(method) = name.strip_prefix("Math.") {
            return self.math(method, args);
        }
        if let Some(method) = name.strip_prefix("Array.") {
            return self.array_method(method, this, args);
        }
        if let Some(method) = name.strip_prefix("String.") {
            return self.string_method(method, this, args);
        }
        if name.starts_with("system_")
            || name.starts_with("openfl_utils_")
            || name.starts_with("haxe_Log.")
            || name.starts_with("utils_Stopwatch.")
        {
            return self.host_method(name, this, args);
        }
        Ok(match name {
            "Object" => {
                if self.nullish(a) {
                    self.object()
                } else {
                    a
                }
            }
            "Array" | "Float64Array" | "Uint32Array" | "Int32Array" | "Uint16Array" => {
                let ty = match name {
                    "Float64Array" => 1,
                    "Uint32Array" => 2,
                    "Int32Array" => 3,
                    "Uint16Array" => 4,
                    _ => 0,
                };
                let values = if args.len() == 1 && matches!(a, V::Number(_)) {
                    let len = self.number(a);
                    if !(0.0..=10_000_000.0).contains(&len) {
                        return Err(self.string("Invalid array length"));
                    }
                    vec![
                        if ty == 0 {
                            V::Undefined
                        } else {
                            V::Number(0.0)
                        };
                        len as usize
                    ]
                } else if ty > 0 {
                    self.values(a)
                } else {
                    args.to_vec()
                };
                self.alloc(Kind::Array(values, ty), self.array_prototype)
            }
            "String" => self.string(&if args.is_empty() {
                String::new()
            } else {
                self.text(a)
            }),
            "Number" => V::Number(if args.is_empty() { 0.0 } else { self.number(a) }),
            "Boolean" => V::Bool(self.truthy(a)),
            "Error" => {
                let proto = self.get_name(self.globals["Error"], "prototype")?;
                let e = self.alloc(Kind::Plain, proto);
                let message = self.string(&self.text(a));
                let stack = self.string("");
                self.put(e, "message", message);
                self.put(e, "stack", stack);
                e
            }
            "Date" => {
                let o = self.object();
                for m in [
                    "getTime",
                    "setTime",
                    "setUTCHours",
                    "setUTCMinutes",
                    "setUTCSeconds",
                ] {
                    let f = self.builtin(&format!("Date.{m}"));
                    self.put(o, m, f);
                }
                self.put(o, "time", a);
                o
            }
            "Date.now" => V::Number(0.0),
            "Date.getTime" => self.get_name(this, "time")?,
            "Date.setTime" => {
                self.put(this, "time", a);
                a
            }
            "Date.setUTCHours" | "Date.setUTCMinutes" | "Date.setUTCSeconds" => V::Undefined,
            "RegExp" => {
                return self.regexp(
                    &self.text(a),
                    &if self.nullish(b) {
                        String::new()
                    } else {
                        self.text(b)
                    },
                );
            }
            "RegExp.exec" | "RegExp.test" => {
                return self.regex_exec(this, a, name.ends_with("test"));
            }
            "Object.create" => self.alloc(Kind::Plain, a),
            "Object.keys" => {
                let keys = self.enumerate(a, false);
                self.array(keys)
            }
            "Object.hasOwn" => V::Bool(self.has_own(a, b)),
            "Object.hasOwnProperty" => V::Bool(self.has_own(this, a)),
            "Object.toString" => {
                let kind = if let V::Object(id) = this {
                    match self.objects[id].kind {
                        Kind::Array(..) => "Array",
                        Kind::Function(..) | Kind::Builtin(_) | Kind::Bound(..) => "Function",
                        _ => "Object",
                    }
                } else {
                    match this {
                        V::String(_) => "String",
                        V::Number(_) => "Number",
                        V::Bool(_) => "Boolean",
                        V::Null => "Null",
                        _ => "Undefined",
                    }
                };
                self.string(&format!("[object {kind}]"))
            }
            "Object.assign" => {
                for &source in args.iter().skip(1) {
                    for key in self.enumerate(source, false) {
                        let v = self.get(source, key)?;
                        self.set(a, key, v)?;
                    }
                }
                a
            }
            "Object.defineProperty" => {
                let desc = args.get(2).copied().unwrap_or(V::Undefined);
                let val = self.get_name(desc, "value")?;
                self.set(a, b, val)?;
                a
            }
            "Function.call" => return self.call(this, a, args.get(1..).unwrap_or_default()),
            "Function.apply" => {
                let params = self.values(b);
                return self.call(this, a, &params);
            }
            "Function.bind" => self.alloc(
                Kind::Bound(this, a, args.get(1..).unwrap_or_default().to_vec()),
                self.function_prototype,
            ),
            "JSON.parse" => {
                let text = self.text(a);
                let j = serde_json::from_str(&text).map_err(|e| self.string(&e.to_string()))?;
                self.import_json(&j)
            }
            "JSON.stringify" => {
                let j = self.export_json(a);
                self.string(&j.to_string())
            }
            "parseInt" => V::Number(parse_int(
                &self.text(a),
                if self.nullish(b) {
                    0
                } else {
                    self.number(b) as u32
                },
            )),
            "parseFloat" => {
                let text = self.text(a);
                let s = text.trim_start();
                let mut result = f64::NAN;
                for end in (1..=s.len()).rev() {
                    if s.is_char_boundary(end)
                        && let Ok(v) = s[..end].parse::<f64>()
                    {
                        result = v;
                        break;
                    }
                }
                V::Number(result)
            }
            "isNaN" => V::Bool(self.number(a).is_nan()),
            "Number.toString" => {
                let radix = if self.nullish(a) {
                    10
                } else {
                    self.number(a) as u32
                };
                let n = self.number(this);
                self.string(&if radix == 16 {
                    format!("{:x}", n as i64)
                } else {
                    self.text(this)
                })
            }
            _ => return Err(self.string(&format!("Unavailable host operation: {name}"))),
        })
    }
    fn math(&mut self, method: &str, args: &[V]) -> R {
        let x = self.number(args.first().copied().unwrap_or(V::Undefined));
        let y = self.number(args.get(1).copied().unwrap_or(V::Undefined));
        // libm provides explicit, portable binary64 operations; no fast-math.
        let value = match method {
            "abs" => x.abs(),
            "sqrt" => x.sqrt(),
            "sin" => crate::math::sin(x),
            "cos" => crate::math::cos(x),
            "tan" => libm::tan(x),
            "atan2" => crate::math::atan2(x, y),
            "atan" => crate::math::atan(x),
            "acos" => libm::acos(x),
            "asin" => libm::asin(x),
            "floor" => x.floor(),
            "ceil" => x.ceil(),
            "round" => (x + 0.5).floor(),
            "pow" => x.powf(y),
            "log" => libm::log(x),
            "exp" => libm::exp(x),
            "min" => args
                .iter()
                .map(|&v| self.number(v))
                .fold(f64::INFINITY, |a, b| {
                    if a.is_nan() || b.is_nan() {
                        f64::NAN
                    } else {
                        a.min(b)
                    }
                }),
            "max" => args
                .iter()
                .map(|&v| self.number(v))
                .fold(f64::NEG_INFINITY, |a, b| {
                    if a.is_nan() || b.is_nan() {
                        f64::NAN
                    } else {
                        a.max(b)
                    }
                }),
            "random" => {
                self.host_random ^= self.host_random << 13;
                self.host_random ^= self.host_random >> 7;
                self.host_random ^= self.host_random << 17;
                (self.host_random >> 11) as f64 / 9007199254740992.0
            }
            _ => return Err(self.string("Unknown math function")),
        };
        Ok(V::Number(value))
    }
    fn array_method(&mut self, method: &str, this: V, args: &[V]) -> R {
        let a = args.first().copied().unwrap_or(V::Undefined);
        let b = args.get(1).copied().unwrap_or(V::Undefined);
        if method == "isArray" {
            return Ok(V::Bool(
                matches!(a,V::Object(id) if matches!(self.objects[id].kind,Kind::Array(_,0))),
            ));
        }
        let V::Object(id) = this else {
            return Err(self.string("Array method on non-array"));
        };
        let Kind::Array(ref data, ty) = self.objects[id].kind else {
            return Err(self.string("Array method on non-array"));
        };
        let mut data = data.clone();
        let len = data.len();
        let relative = |n: f64| -> usize {
            if n < 0.0 {
                (len as f64 + n.trunc()).max(0.0) as usize
            } else {
                (n as usize).min(len)
            }
        };
        let result = match method {
            "push" => {
                data.extend_from_slice(args);
                V::Number(data.len() as f64)
            }
            "pop" => data.pop().unwrap_or(V::Undefined),
            "shift" => {
                if data.is_empty() {
                    V::Undefined
                } else {
                    data.remove(0)
                }
            }
            "unshift" => {
                data.splice(0..0, args.iter().copied());
                V::Number(data.len() as f64)
            }
            "slice" | "subarray" => {
                let start = relative(self.number(a));
                let end = if b == V::Undefined {
                    len
                } else {
                    relative(self.number(b))
                };
                return Ok(self.alloc(
                    Kind::Array(
                        data[start..end.max(start)].to_vec(),
                        if method == "subarray" { ty } else { 0 },
                    ),
                    self.array_prototype,
                ));
            }
            "splice" => {
                let start = relative(self.number(a));
                let count = if args.len() == 1 {
                    len - start
                } else {
                    (self.number(b).max(0.0) as usize).min(len - start)
                };
                let removed = data
                    .splice(
                        start..start + count,
                        args.get(2..).unwrap_or_default().iter().copied(),
                    )
                    .collect();
                self.array(removed)
            }
            "concat" => {
                for &item in args {
                    if let V::Object(j) = item
                        && let Kind::Array(ref v, 0) = self.objects[j].kind
                    {
                        data.extend(v.iter().copied());
                        continue;
                    }
                    data.push(item);
                }
                return Ok(self.array(data));
            }
            "join" => {
                let separator = if a == V::Undefined {
                    ",".into()
                } else {
                    self.text(a)
                };
                return Ok(self.string(
                    &data
                        .iter()
                        .map(|&v| {
                            if self.nullish(v) {
                                String::new()
                            } else {
                                self.text(v)
                            }
                        })
                        .collect::<Vec<_>>()
                        .join(&separator),
                ));
            }
            "indexOf" | "lastIndexOf" => {
                let start = if b == V::Undefined {
                    if method == "indexOf" {
                        0
                    } else {
                        len.saturating_sub(1)
                    }
                } else {
                    relative(self.number(b))
                };
                let found = if method == "indexOf" {
                    (start..len).find(|&i| self.strict_eq(data[i], a))
                } else {
                    (0..len.min(start + 1))
                        .rev()
                        .find(|&i| self.strict_eq(data[i], a))
                };
                return Ok(V::Number(found.map(|i| i as f64).unwrap_or(-1.0)));
            }
            "reverse" => {
                data.reverse();
                this
            }
            "fill" => {
                let start = if b == V::Undefined {
                    0
                } else {
                    relative(self.number(b))
                };
                let end = args
                    .get(2)
                    .map(|&v| relative(self.number(v)))
                    .unwrap_or(len);
                for item in &mut data[start..end.max(start)] {
                    *item = a;
                }
                this
            }
            "sort" => {
                // Stable merge sort. Comparison functions in the recovered
                // generator have no RNG side effects, preserving tie order.
                let mut width = 1;
                while width < len {
                    let mut out = data.clone();
                    for start in (0..len).step_by(width * 2) {
                        let mid = (start + width).min(len);
                        let end = (start + width * 2).min(len);
                        let (mut l, mut r) = (start, mid);
                        for item in &mut out[start..end] {
                            let left = if l >= mid {
                                false
                            } else if r >= end {
                                true
                            } else if a == V::Undefined {
                                self.text(data[l]) <= self.text(data[r])
                            } else {
                                let cmp = self.call(a, V::Undefined, &[data[l], data[r]])?;
                                let n = self.number(cmp);
                                n.is_nan() || n <= 0.0
                            };
                            if left {
                                *item = data[l];
                                l += 1
                            } else {
                                *item = data[r];
                                r += 1
                            }
                        }
                    }
                    data = out;
                    width *= 2;
                }
                this
            }
            "map" | "filter" | "some" | "every" => {
                let mut out = vec![];
                for (i, &value) in data.iter().enumerate() {
                    let mapped = self.call(a, b, &[value, V::Number(i as f64), this])?;
                    match method {
                        "map" => out.push(mapped),
                        "filter" => {
                            if self.truthy(mapped) {
                                out.push(value)
                            }
                        }
                        "some" => {
                            if self.truthy(mapped) {
                                return Ok(V::Bool(true));
                            }
                        }
                        "every" if !self.truthy(mapped) => {
                            return Ok(V::Bool(false));
                        }
                        _ => {}
                    }
                }
                return Ok(match method {
                    "some" => V::Bool(false),
                    "every" => V::Bool(true),
                    _ => self.array(out),
                });
            }
            _ => return Err(self.string(&format!("Unknown array method {method}"))),
        };
        self.objects[id].kind = Kind::Array(data, ty);
        Ok(result)
    }
    fn string_method(&mut self, method: &str, this: V, args: &[V]) -> R {
        let a = args.first().copied().unwrap_or(V::Undefined);
        let b = args.get(1).copied().unwrap_or(V::Undefined);
        if method == "fromCodePoint" || method == "fromCharCode" {
            let mut text = vec![];
            for &v in args {
                let n = self.uint32(v);
                if method == "fromCharCode" {
                    text.push(n as u16)
                } else if let Some(c) = char::from_u32(n) {
                    let mut buf = [0; 2];
                    text.extend_from_slice(c.encode_utf16(&mut buf));
                }
            }
            return Ok(self.utf16(text));
        }
        let text = self.text(this);
        let units: Vec<u16> = text.encode_utf16().collect();
        let len = units.len();
        Ok(match method {
            "charAt" => {
                let i = self.number(a) as isize;
                if i < 0 || i as usize >= len {
                    self.string("")
                } else {
                    self.utf16(vec![units[i as usize]])
                }
            }
            "charCodeAt" => {
                let i = self.number(a) as isize;
                V::Number(if i < 0 || i as usize >= len {
                    f64::NAN
                } else {
                    units[i as usize] as f64
                })
            }
            "substring" | "substr" | "slice" => {
                let n = self.number(a);
                let mut start = if method != "substring" && n < 0.0 {
                    (len as f64 + n.trunc()).max(0.0) as usize
                } else {
                    (n.max(0.0) as usize).min(len)
                };
                let mut end = if b == V::Undefined {
                    len
                } else if method == "substr" {
                    (start + self.number(b).max(0.0) as usize).min(len)
                } else {
                    let n = self.number(b);
                    if method == "slice" && n < 0.0 {
                        (len as f64 + n.trunc()).max(0.0) as usize
                    } else {
                        (n.max(0.0) as usize).min(len)
                    }
                };
                if method == "substring" && start > end {
                    std::mem::swap(&mut start, &mut end);
                }
                self.utf16(units[start..end.max(start)].to_vec())
            }
            "split" => {
                if a == V::Undefined {
                    self.array(vec![this])
                } else {
                    let sep = self.text(a);
                    let parts: Vec<V> = if sep.is_empty() {
                        units.iter().map(|&c| self.utf16(vec![c])).collect()
                    } else {
                        text.split(&sep).map(|s| self.string(s)).collect()
                    };
                    self.array(parts)
                }
            }
            "indexOf" | "lastIndexOf" => {
                let needle: Vec<u16> = self.text(a).encode_utf16().collect();
                let start = if b == V::Undefined {
                    if method == "indexOf" { 0 } else { len }
                } else {
                    (self.number(b).max(0.0) as usize).min(len)
                };
                let found = if needle.is_empty() {
                    Some(start)
                } else if method == "indexOf" {
                    (start..=len)
                        .find(|&i| units.get(i..i + needle.len()) == Some(needle.as_slice()))
                } else {
                    (0..=start)
                        .rev()
                        .find(|&i| units.get(i..i + needle.len()) == Some(needle.as_slice()))
                };
                V::Number(found.map(|i| i as f64).unwrap_or(-1.0))
            }
            "toLowerCase" => self.string(&text.to_lowercase()),
            "toUpperCase" => self.string(&text.to_uppercase()),
            "trim" => self.string(text.trim()),
            "toString" => this,
            "replace" => {
                let replacement = self.text(b);
                if let V::Object(id) = a
                    && let Kind::Regex(ref re, global) = self.objects[id].kind
                {
                    let result = if global {
                        re.replace_all(&text, replacement.as_str())
                    } else {
                        re.replace(&text, replacement.as_str())
                    }
                    .into_owned();
                    return Ok(self.string(&result));
                }
                self.string(&text.replacen(&self.text(a), &replacement, 1))
            }
            "match" => return self.regex_exec(a, this, false),
            _ => return Err(self.string(&format!("Unknown string method {method}"))),
        })
    }
    fn regex_exec(&mut self, regex: V, text: V, test: bool) -> R {
        let V::Object(id) = regex else {
            return Err(self.string("Regex expected"));
        };
        let Kind::Regex(re, global) = self.objects[id].kind.clone() else {
            return Err(self.string("Regex expected"));
        };
        let s = self.text(text);
        let last = self.get_name(regex, "lastIndex")?;
        let start = if global {
            self.number(last) as usize
        } else {
            0
        };
        let captures = re.captures_at(&s, start.min(s.len()));
        if let Some(c) = captures {
            let m = c.get(0).unwrap();
            if global {
                self.put(regex, "lastIndex", V::Number(m.end() as f64));
            }
            if test {
                return Ok(V::Bool(true));
            }
            let values = c
                .iter()
                .map(|m| m.map(|m| self.string(m.as_str())).unwrap_or(V::Undefined))
                .collect();
            let array = self.array(values);
            self.put(array, "index", V::Number(m.start() as f64));
            self.put(array, "input", text);
            Ok(array)
        } else {
            if global {
                self.put(regex, "lastIndex", V::Number(0.0));
            }
            Ok(if test { V::Bool(false) } else { V::Null })
        }
    }
    fn host_method(&mut self, name: &str, this: V, args: &[V]) -> R {
        let a = args.first().copied().unwrap_or(V::Undefined);
        let b = args.get(1).copied().unwrap_or(V::Undefined);
        if name == "utils_Stopwatch.measure" {
            self.call(a, V::Undefined, &[])?;
            return Ok(V::Number(0.0));
        }
        if name == "haxe_Log.trace" {
            let text = self.text(a);
            if self.trace {
                eprintln!("{text}");
            }
            if text.starts_with("***") {
                self.retries += 1;
                if self.trace {
                    eprintln!("{}", self.error_stack.join(" -> "));
                }
                if self.retries > 30 || self.steps > 300_000_000 {
                    return Err(self.string(&format!("Original city retry limit: {text}")));
                }
            }
            return Ok(V::Undefined);
        }
        let host = self.get_name(this, "host")?;
        if name.starts_with("openfl_utils_Assets.") {
            let assets = self.get_name(host, "assets")?;
            if name.ends_with("exists") {
                return Ok(V::Bool(self.has_own(assets, a)));
            }
            if !self.has_own(assets, a) {
                return Err(self.string(&format!("Missing original asset {}", self.text(a))));
            }
            return self.get(assets, a);
        }
        let field = if name.starts_with("system_State.") {
            "state"
        } else {
            "query"
        };
        let store = self.get_name(host, field)?;
        let method = name.split('.').nth(1).unwrap();
        match method {
            "get" => {
                if self.has_own(store, a) {
                    self.get(store, a)
                } else {
                    Ok(b)
                }
            }
            "getInt" | "getFlag" => {
                let fallback = if b == V::Undefined { V::Number(0.0) } else { b };
                let value = if self.has_own(store, a) {
                    let v = self.get(store, a)?;
                    V::Number(parse_int(&self.text(v), 0))
                } else {
                    fallback
                };
                Ok(if method == "getFlag" {
                    V::Bool(self.number(value) != 0.0)
                } else {
                    value
                })
            }
            "set" => {
                self.set(store, a, b)?;
                Ok(V::Undefined)
            }
            "setFlag" => {
                let value = self.string(if b == V::Undefined || self.truthy(b) {
                    "1"
                } else {
                    "0"
                });
                self.set(store, a, value)?;
                Ok(V::Undefined)
            }
            "reset" => {
                let fresh = self.object();
                self.put(host, field, fresh);
                Ok(V::Undefined)
            }
            "update" => Ok(V::Undefined),
            _ => Err(self.string("Unknown state method")),
        }
    }
}
fn parse_int(text: &str, mut radix: u32) -> f64 {
    let mut s = text.trim_start();
    let negative = s.starts_with('-');
    if s.starts_with(['-', '+']) {
        s = &s[1..];
    }
    if radix == 0 {
        radix = if s.starts_with("0x") || s.starts_with("0X") {
            16
        } else {
            10
        };
    }
    if !(2..=36).contains(&radix) {
        return f64::NAN;
    }
    if radix == 16 && (s.starts_with("0x") || s.starts_with("0X")) {
        s = &s[2..];
    }
    let mut n = 0.0;
    let mut count = 0;
    for c in s.chars() {
        let Some(v) = c.to_digit(radix) else { break };
        n = n * radix as f64 + v as f64;
        count += 1;
    }
    if count == 0 {
        f64::NAN
    } else if negative {
        -n
    } else {
        n
    }
}
