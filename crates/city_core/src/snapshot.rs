//! Same canonical projection as the independent original-bundle test oracle.
use crate::runtime::{Runtime, V};
use serde_json::{Map, Value as J, json};
type Result<T> = std::result::Result<T, V>;
struct Context<'a> {
    rt: &'a mut Runtime,
    cells: Vec<V>,
    districts: Vec<V>,
    groups: Vec<V>,
}
impl Context<'_> {
    fn get(&mut self, v: V, key: &str) -> Result<V> {
        if self.rt.nullish(v) {
            Ok(V::Undefined)
        } else {
            self.rt.get_name(v, key)
        }
    }
    fn class(&mut self, v: V) -> Result<String> {
        let c = self.get(v, "__class__")?;
        let n = self.get(c, "__name__")?;
        Ok(if self.rt.nullish(n) {
            String::new()
        } else {
            self.rt.text(n)
        })
    }
    fn index(items: &[V], value: V) -> J {
        json!(
            items
                .iter()
                .position(|v| *v == value)
                .map(|i| i as i64)
                .unwrap_or(-1)
        )
    }
    fn point(&mut self, value: V) -> Result<J> {
        if self.rt.nullish(value) {
            return Ok(J::Null);
        }
        let x = self.get(value, "x")?;
        let y = self.get(value, "y")?;
        Ok(json!([self.rt.number(x), self.rt.number(y)]))
    }
    fn edge(&mut self, value: V) -> Result<J> {
        let origin = self.get(value, "origin")?;
        let from = self.get(origin, "point")?;
        let next = self.get(value, "next")?;
        let origin = self.get(next, "origin")?;
        let to = self.get(origin, "point")?;
        let data = self.get(value, "data")?;
        let ty = self.get(data, "_hx_index")?;
        let face = self.get(value, "face")?;
        let face = self.get(face, "data")?;
        let twin = self.get(value, "twin")?;
        let twinface = self.get(twin, "face")?;
        let twinface = self.get(twinface, "data")?;
        Ok(
            json!({"from":self.point(from)?,"to":self.point(to)?,"type":self.rt.export_json(ty),"face":Self::index(&self.cells,face),"twinFace":Self::index(&self.cells,twinface)}),
        )
    }
    fn loose(&mut self, value: V) -> Result<Option<J>> {
        if self.rt.nullish(value) {
            return Ok(Some(J::Null));
        }
        if let V::Number(n) = value {
            return Ok(Some(if n.is_finite() {
                json!(n)
            } else {
                self.rt.text(value).into()
            }));
        }
        if !matches!(value, V::Object(_)) {
            return Ok(Some(self.rt.export_json(value)));
        }
        let ty = self.rt.unary("typeof", value)?;
        if self.rt.text(ty) == "function" {
            return Ok(None);
        }
        if self.rt.is_array(value) {
            let mut out = vec![];
            for item in self.rt.values(value) {
                out.push(self.loose(item)?.unwrap_or(J::Null));
            }
            return Ok(Some(out.into()));
        }
        let x = self.get(value, "x")?;
        let y = self.get(value, "y")?;
        if matches!((x, y), (V::Number(_), V::Number(_))) {
            return Ok(Some(self.point(value)?));
        }
        let class = self.class(value)?;
        let special = match class.as_str() {
            "com.watabou.geom.Vertex" => {
                let p = self.get(value, "point")?;
                Some(self.point(p)?)
            }
            "com.watabou.geom.HalfEdge" => Some(self.edge(value)?),
            "com.watabou.geom.Face" => {
                let d = self.get(value, "data")?;
                Some(Self::index(&self.cells, d))
            }
            "com.watabou.mfcg.model.Cell" => Some(Self::index(&self.cells, value)),
            "com.watabou.mfcg.model.District" => Some(Self::index(&self.districts, value)),
            "com.watabou.mfcg.model.wards.WardGroup" => Some(Self::index(&self.groups, value)),
            "haxe.ds.ObjectMap" => return Ok(None),
            _ => None,
        };
        if special.is_some() {
            return Ok(special);
        }
        let mut keys = self.rt.enumerate(value, false);
        keys.sort_by_key(|&k| self.rt.text(k));
        let mut result = Map::new();
        for key in keys {
            let name = self.rt.text(key);
            if name.starts_with("__")
                || name.starts_with("cache")
                || ["hx__closures__", "model", "city", "patch", "view"].contains(&name.as_str())
            {
                continue;
            }
            let item = self.rt.get(value, key)?;
            if let Some(item) = self.loose(item)? {
                result.insert(name, item);
            }
        }
        Ok(Some(result.into()))
    }
    fn fields(&mut self, value: V, keys: &[&str]) -> Result<Map<String, J>> {
        let mut result = Map::new();
        for &key in keys {
            let item = self.get(value, key)?;
            if let Some(j) = self.loose(item)? {
                result.insert(key.into(), j);
            }
        }
        Ok(result)
    }
    fn wall(&mut self, value: V) -> Result<J> {
        if self.rt.nullish(value) {
            return Ok(J::Null);
        }
        let mut out = self.fields(
            value,
            &[
                "real",
                "shape",
                "segments",
                "gates",
                "towers",
                "coastTowers",
            ],
        )?;
        let patches = self.get(value, "patches")?;
        out.insert(
            "patches".into(),
            self.rt
                .values(patches)
                .into_iter()
                .map(|v| Self::index(&self.cells, v))
                .collect(),
        );
        let edges = self.get(value, "edges")?;
        let mut result = vec![];
        for edge in self.rt.values(edges) {
            result.push(self.edge(edge)?);
        }
        out.insert("edges".into(), result.into());
        Ok(out.into())
    }
    fn ward(&mut self, value: V) -> Result<J> {
        let mut out = Map::new();
        out.insert("type".into(), self.class(value)?.into());
        let mut keys = self.rt.enumerate(value, false);
        keys.sort_by_key(|&k| self.rt.text(k));
        for key in keys {
            let name = self.rt.text(key);
            if name.starts_with("__")
                || ["hx__closures__", "model", "patch", "wall"].contains(&name.as_str())
            {
                continue;
            }
            let item = self.rt.get(value, key)?;
            if let Some(j) = self.loose(item)? {
                out.insert(name, j);
            }
        }
        let wall = self.get(value, "wall")?;
        if self.rt.truthy(wall) {
            out.insert("wall".into(), self.wall(wall)?);
        }
        Ok(out.into())
    }
}
pub(crate) fn canonical(rt: &mut Runtime, kernel: V, city: V) -> Result<J> {
    let cells = rt.get_name(city, "cells")?;
    let cells = rt.values(cells);
    let districts = rt.get_name(city, "districts")?;
    let districts = rt.values(districts);
    let mut groups = vec![];
    for &cell in &cells {
        let ward = rt.get_name(cell, "ward")?;
        let group = rt.get_name(ward, "group")?;
        if rt.truthy(group) && !groups.contains(&group) {
            groups.push(group);
        }
    }
    let mut c = Context {
        rt,
        cells,
        districts,
        groups,
    };
    let mut result = Map::new();
    let name = c.get(city, "name")?;
    result.insert("name".into(), c.rt.export_json(name));
    let rng = c.get(kernel, "Random")?;
    let seed = c.get(rng, "seed")?;
    result.insert("rngSeed".into(), c.rt.export_json(seed));
    let bp = c.get(city, "bp")?;
    result.insert("blueprint".into(), c.loose(bp)?.unwrap());
    result.extend(c.fields(city, &["nPatches", "center", "north"])?);
    let bounds = c.get(city, "bounds")?;
    result.insert(
        "bounds".into(),
        c.fields(bounds, &["x", "y", "width", "height"])?.into(),
    );
    let mut cells = vec![];
    for cell in c.cells.clone() {
        let mut out = c.fields(
            cell,
            &[
                "seed",
                "withinCity",
                "withinWalls",
                "waterbody",
                "landing",
                "shape",
            ],
        )?;
        let ward = c.get(cell, "ward")?;
        out.insert("ward".into(), c.ward(ward)?);
        let district = c.get(cell, "district")?;
        out.insert("district".into(), Context::index(&c.districts, district));
        cells.push(J::Object(out));
    }
    result.insert("cells".into(), cells.into());
    let inner = c.get(city, "inner")?;
    result.insert(
        "inner".into(),
        c.rt.values(inner)
            .into_iter()
            .map(|v| Context::index(&c.cells, v))
            .collect(),
    );
    for key in ["plaza", "citadel"] {
        let cell = c.get(city, key)?;
        result.insert(key.into(), Context::index(&c.cells, cell));
    }
    let mut groups = vec![];
    for group in c.groups.clone() {
        let mut out = c.fields(
            group,
            &[
                "faces", "core", "urban", "district", "shape", "inner", "border", "alleys",
                "blocks",
            ],
        )?;
        let blocks = c.get(group, "blocks")?;
        let church = c.get(group, "church")?;
        out.insert(
            "church".into(),
            Context::index(&c.rt.values(blocks), church),
        );
        groups.push(J::Object(out));
    }
    result.insert("groups".into(), groups.into());
    let mut districts = vec![];
    for district in c.districts.clone() {
        districts.push(J::Object(c.fields(
            district,
            &[
                "name", "type", "faces", "greenery", "alleys", "border", "ridge", "equator",
                "groups",
            ],
        )?));
    }
    result.insert("districts".into(), districts.into());
    let wall = c.get(city, "wall")?;
    result.insert("wall".into(), c.wall(wall)?);
    let walls = c.get(city, "walls")?;
    let mut out = vec![];
    for wall in c.rt.values(walls) {
        out.push(c.wall(wall)?);
    }
    result.insert("walls".into(), out.into());
    let border = c.get(city, "border")?;
    result.insert("border".into(), c.wall(border)?);
    result.extend(c.fields(
        city,
        &[
            "gates",
            "streets",
            "roads",
            "arteries",
            "canals",
            "horizon",
            "earthEdge",
            "waterEdge",
            "shore",
            "landmarks",
        ],
    )?);
    Ok(result.into())
}
