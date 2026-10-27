//! Owned geometry projection. No layout generation occurs at this boundary.
use crate::{
    model::*,
    runtime::{Runtime, V},
};
type Result<T> = std::result::Result<T, V>;
struct Adapter<'a> {
    rt: &'a mut Runtime,
}
impl Adapter<'_> {
    fn get(&mut self, v: V, k: &str) -> Result<V> {
        if self.rt.nullish(v) {
            Ok(V::Undefined)
        } else {
            self.rt.get_name(v, k)
        }
    }
    fn array(&mut self, v: V, k: &str) -> Result<Vec<V>> {
        let a = self.get(v, k)?;
        Ok(self.rt.values(a))
    }
    fn num(&mut self, v: V, k: &str) -> Result<f64> {
        let v = self.get(v, k)?;
        Ok(self.rt.number(v))
    }
    fn text(&mut self, v: V, k: &str) -> Result<String> {
        let v = self.get(v, k)?;
        Ok(self.rt.text(v))
    }
    fn boolean(&mut self, v: V, k: &str) -> Result<bool> {
        let v = self.get(v, k)?;
        Ok(self.rt.truthy(v))
    }
    fn point(&mut self, v: V) -> Result<Point> {
        Ok(Point {
            x: self.num(v, "x")?,
            y: self.num(v, "y")?,
        })
    }
    fn polygon(&mut self, v: V) -> Result<Polygon> {
        self.rt
            .values(v)
            .into_iter()
            .map(|v| self.point(v))
            .collect()
    }
    fn poly(&mut self, v: V, k: &str) -> Result<Polygon> {
        let v = self.get(v, k)?;
        self.polygon(v)
    }
    fn polys(&mut self, v: V, k: &str) -> Result<Vec<Polygon>> {
        let mut out = vec![];
        for p in self.array(v, k)? {
            out.push(self.polygon(p)?);
        }
        Ok(out)
    }
    fn vertex(&mut self, v: V) -> Result<Point> {
        let p = self.get(v, "point")?;
        self.point(p)
    }
    fn origin(&mut self, e: V) -> Result<V> {
        let v = self.get(e, "origin")?;
        self.get(v, "point")
    }
    fn vector(&mut self, e: V) -> Result<Point> {
        let a = self.origin(e)?;
        let next = self.get(e, "next")?;
        let b = self.origin(next)?;
        Ok(self.point(b)?.minus(self.point(a)?))
    }
    fn chain(&mut self, edges: &[V], closed: bool) -> Result<Vec<(V, Point)>> {
        let mut out = vec![];
        for &e in edges {
            let p = self.origin(e)?;
            out.push((p, self.point(p)?));
        }
        if !closed && let Some(&e) = edges.last() {
            let next = self.get(e, "next")?;
            let p = self.origin(next)?;
            out.push((p, self.point(p)?));
        }
        Ok(out)
    }
    fn entries(&mut self, map: V) -> Result<Vec<(V, V)>> {
        let it = self.rt.invoke(map, "keys", &[])?;
        let mut out = vec![];
        loop {
            let more = self.rt.invoke(it, "hasNext", &[])?;
            if !self.rt.truthy(more) {
                break;
            }
            let k = self.rt.invoke(it, "next", &[])?;
            let v = self.rt.invoke(map, "get", &[k])?;
            out.push((k, v));
        }
        Ok(out)
    }
    fn road(&mut self, edges: Vec<V>) -> Result<Road> {
        let points = self.chain(&edges, false)?;
        let mut fixed = vec![];
        let mut outside = vec![];
        for (i, &edge) in edges.iter().enumerate() {
            let vertex = self.get(edge, "origin")?;
            let mut inside = true;
            let mut out = true;
            for neighbor in self.array(vertex, "edges")? {
                let face = self.get(neighbor, "face")?;
                let cell = self.get(face, "data")?;
                if self.boolean(cell, "withinCity")? {
                    out = false;
                } else {
                    inside = false;
                }
            }
            if !out {
                fixed.push(points[i].0);
            }
            if !inside {
                outside.push(i);
            }
        }
        let mut runs: Vec<Vec<usize>> = vec![];
        for (i, &idx) in outside.iter().enumerate() {
            if i == 0 || idx - 1 != outside[i - 1] {
                runs.push(vec![]);
            }
            runs.last_mut().unwrap().push(idx);
        }
        let mut outlines = vec![];
        for mut run in runs {
            if run[0] > 0 {
                run.insert(0, run[0] - 1);
            }
            if *run.last().unwrap() < points.len() - 1 {
                run.push(*run.last().unwrap() + 1);
            }
            outlines.push(smooth_road(
                run.iter().map(|&i| points[i]).collect(),
                &fixed,
            ));
        }
        Ok(Road {
            course: points.iter().map(|v| v.1).collect(),
            path: smooth_road(points, &fixed),
            outlines,
        })
    }
    fn river(&mut self, canal: V, shore: &[(V, Point)]) -> Result<River> {
        let map = self.get(canal, "bridges")?;
        let entries = self.entries(map)?;
        let edges = self.array(canal, "course")?;
        let points = self.chain(&edges, false)?;
        let mut rendered = points.clone();
        let width = self.num(canal, "width")?;
        if !shore.is_empty() && rendered.len() > 1 {
            rendered[0] = (V::Undefined, rendered[0].1.lerp(rendered[1].1, 0.5));
        }
        let mut fixed = vec![];
        for &(v, _) in &entries {
            fixed.push(self.get(v, "point")?);
        }
        let path = chaikin(rendered, &fixed).into_iter().map(|p| p.1).collect();
        let half = (width + 1.2) / 2.0;
        let mut bridges = vec![];
        for (vertex, road) in entries {
            let point = self.vertex(vertex)?;
            let mut index = None;
            for (i, &e) in edges.iter().enumerate() {
                if self.get(e, "origin")? == vertex {
                    index = Some(i);
                    break;
                }
            }
            let Some(i) = index else {
                return Err(self.rt.string("Canal bridge origin missing"));
            };
            let mut direction = self.vector(edges[i])?;
            if i > 0 {
                direction = direction.plus(self.vector(edges[i - 1])?);
            }
            if self.rt.nullish(road) {
                let normal = Point {
                    x: -direction.y,
                    y: direction.x,
                }
                .normalized(half);
                bridges.push(Bridge {
                    path: vec![point.minus(normal), point.plus(normal)],
                    width: 1.2,
                });
                continue;
            }
            let road = self.rt.values(road);
            let mut index = None;
            for (i, &e) in road.iter().enumerate() {
                if self.get(e, "origin")? == vertex {
                    index = Some(i);
                    break;
                }
            }
            let Some(i) = index else {
                return Err(self.rt.string("Road bridge origin missing"));
            };
            let (start, end) = if i == 0 {
                let normal = Point {
                    x: -direction.y,
                    y: direction.x,
                }
                .normalized(half);
                let a = point.plus(normal);
                let b = point.minus(normal);
                let start = point.plus(self.vector(road[i])?.normalized(half));
                (
                    start,
                    if start.minus(a).length() > start.minus(b).length() {
                        a
                    } else {
                        b
                    },
                )
            } else {
                let rd = self.vector(road[i - 1])?.plus(self.vector(road[i])?);
                let sine =
                    ((rd.x * direction.y - rd.y * direction.x) / rd.length() / direction.length())
                        .abs();
                let extent = half / sine;
                (
                    point.plus(self.vector(road[i])?.normalized(extent)),
                    point.minus(self.vector(road[i - 1])?.normalized(extent)),
                )
            };
            bridges.push(Bridge {
                path: vec![start, end],
                width: 2.0,
            });
        }
        let mouth = if !shore.is_empty() {
            let index = shore
                .iter()
                .position(|p| p.0 == points[0].0)
                .ok_or_else(|| self.rt.string("River mouth missing from shore"))?;
            let origin = points[0].1;
            let before = shore[(index + shore.len() - 1) % shore.len()].1;
            let after = shore[(index + 1) % shore.len()].1;
            Some(RiverMouth {
                origin,
                next: points[1].1,
                shore_before: before,
                shore_after: after,
                convex: (origin.x - before.x) * (after.y - origin.y)
                    - (origin.y - before.y) * (after.x - origin.x)
                    > 0.0,
            })
        } else {
            None
        };
        Ok(River {
            course: points.iter().map(|p| p.1).collect(),
            path,
            width,
            bridges,
            mouth,
        })
    }
    fn wall(&mut self, wall: V, castle: bool) -> Result<Wall> {
        let edges = self.array(wall, "edges")?;
        let mut openings: Vec<(V, f64, Polygon)> = vec![];
        let mut gates: Vec<(V, f64)> = self
            .array(wall, "gates")?
            .into_iter()
            .map(|g| (g, 2.0))
            .collect();
        let water = self.get(wall, "watergates")?;
        for (v, canal) in self.entries(water)? {
            gates.push((v, self.num(canal, "width")?));
        }
        for (vertex, width) in gates {
            let mut index = None;
            for (i, &edge) in edges.iter().enumerate() {
                if self.get(edge, "origin")? == vertex {
                    index = Some(i);
                    break;
                }
            }
            let Some(i) = index else {
                return Err(self.rt.string("Wall gate origin missing"));
            };
            let point = self.vertex(vertex)?;
            let opening = vec![
                point.plus(
                    self.vector(edges[(i + edges.len() - 1) % edges.len()])?
                        .normalized(-width / 2.0),
                ),
                point.plus(self.vector(edges[i])?.normalized(width / 2.0)),
            ];
            let uid = self.num(vertex, "__id__")?;
            if let Some(old) = openings.iter_mut().find(|p| p.0 == vertex) {
                *old = (vertex, uid, opening);
            } else {
                openings.push((vertex, uid, opening));
            }
        }
        let mask: Vec<bool> = self
            .array(wall, "segments")?
            .iter()
            .map(|&v| self.rt.truthy(v))
            .collect();
        let mut segments = vec![];
        for (i, &edge) in edges.iter().enumerate() {
            if !mask[i] {
                continue;
            }
            let origin = self.get(edge, "origin")?;
            let next = self.get(edge, "next")?;
            let end = self.get(next, "origin")?;
            let direction = self.vector(edge)?;
            let from = if let Some(p) = openings.iter().find(|p| p.0 == origin) {
                p.2[1].plus(direction.normalized(1.9))
            } else {
                self.vertex(origin)?
            };
            let to = if let Some(p) = openings.iter().find(|p| p.0 == end) {
                p.2[0].plus(direction.normalized(-1.9))
            } else {
                self.vertex(end)?
            };
            segments.push(vec![from, to]);
        }
        let mut towers = vec![];
        for v in self.array(wall, "towers")? {
            towers.push(self.vertex(v)?);
        }
        openings.sort_by(|a, b| a.1.total_cmp(&b.1));
        Ok(Wall {
            shape: self.poly(wall, "shape")?,
            segment_mask: mask,
            segments,
            towers,
            gates: openings.into_iter().map(|p| p.2).collect(),
            thickness: 1.9,
            tower_radius: if castle { 2.5 } else { 1.9 },
            castle,
        })
    }
}
fn center(points: &[Point]) -> Point {
    let mut p = Point::default();
    for &v in points {
        p = p.plus(v);
    }
    if points.is_empty() {
        p
    } else {
        Point {
            x: p.x / points.len() as f64,
            y: p.y / points.len() as f64,
        }
    }
}
fn chaikin(mut points: Vec<(V, Point)>, fixed: &[V]) -> Vec<(V, Point)> {
    if points.len() < 2 {
        return points;
    }
    for _ in 0..3 {
        let mut out = vec![points[0]];
        for i in 1..points.len() - 1 {
            let (id, p) = points[i];
            if fixed.contains(&id) {
                out.push((id, p))
            } else {
                out.push((V::Undefined, p.lerp(points[i - 1].1, 0.25)));
                out.push((V::Undefined, p.lerp(points[i + 1].1, 0.25)));
            }
        }
        out.push(*points.last().unwrap());
        points = out;
    }
    points
}
fn smooth_road(points: Vec<(V, Point)>, fixed: &[V]) -> Polygon {
    let mut result = chaikin(points, fixed);
    for id in fixed {
        let Some(i) = result.iter().position(|p| p.0 == *id) else {
            continue;
        };
        if i == 0 || i == result.len() - 1 {
            continue;
        }
        let point = result[i].1;
        let before = result[i - 1].1;
        let after = result[i + 1].1;
        let bl = before.minus(point).length();
        let al = point.minus(after).length();
        if bl <= 0.5 || al <= 0.5 {
            continue;
        }
        result.splice(
            i..=i,
            [
                (V::Undefined, before.lerp(point, (bl - 1.0) / bl)),
                (V::Undefined, after.lerp(point, (al - 1.0) / al)),
            ],
        );
    }
    result.into_iter().map(|p| p.1).collect()
}

pub(crate) fn adapt(rt: &mut Runtime, kernel: V, model: V, options: CityOptions) -> Result<City> {
    let mut a = Adapter { rt };
    let cells = a.array(model, "cells")?;
    let inner = a.array(model, "inner")?;
    let mut wards = vec![];
    let mut fields = vec![];
    let mut piers = vec![];
    let mut furrows = vec![];
    for (id, &cell) in cells.iter().enumerate() {
        let source = a.get(cell, "ward")?;
        let class = a.get(source, "__class__")?;
        let original = a.text(class, "__name__")?;
        let original = original.rsplit('.').next().unwrap().to_string();
        let kind = match original.as_str() {
            "Alleys" => {
                if options.shantytown && !inner.contains(&cell) {
                    "slum"
                } else {
                    "residential"
                }
            }
            "Castle" => "castle",
            "Cathedral" => "temple",
            "Market" => "market",
            "Farm" => "farm",
            "Park" => "park",
            "Harbour" => "harbour",
            _ => continue,
        };
        let mut buildings = vec![];
        let mut add = |polygon: Polygon, role: &str, landmark: bool| {
            buildings.push(Building {
                polygon,
                role: role.into(),
                landmark,
            })
        };
        match original.as_str() {
            "Alleys" => {
                let group = a.get(source, "group")?;
                let core = a.get(group, "core")?;
                let face = a.get(cell, "face")?;
                if core == face {
                    let church = a.get(group, "church")?;
                    for block in a.array(group, "blocks")? {
                        for lot in a.polys(block, "lots")? {
                            add(
                                lot,
                                if block == church { "church" } else { "lot" },
                                block == church,
                            );
                        }
                    }
                }
            }
            "Castle" => add(a.poly(source, "building")?, "castle", true),
            "Cathedral" => {
                for shape in a.polys(source, "building")? {
                    add(shape, "temple", true)
                }
            }
            "Market" => {
                let monument = a.get(source, "monument")?;
                if a.rt.truthy(monument) {
                    add(a.polygon(monument)?, "monument", true)
                }
            }
            "Farm" => {
                for shape in a.polys(source, "buildings")? {
                    add(shape, "farm", false)
                }
                fields.extend(a.polys(source, "subPlots")?);
                for line in a.array(source, "furrows")? {
                    let start = a.get(line, "start")?;
                    let end = a.get(line, "end")?;
                    furrows.push(vec![a.point(start)?, a.point(end)?]);
                }
            }
            "Harbour" => piers.extend(a.polys(source, "piers")?),
            _ => {}
        }
        let polygon = a.poly(cell, "shape")?;
        let district = a.get(cell, "district")?;
        let name = if !a.rt.nullish(district) {
            a.text(district, "name")?
        } else {
            match original.as_str() {
                "Cathedral" => "Temple",
                "Farm" => "Farmland",
                _ => &original,
            }
            .into()
        };
        let green = a.get(source, "green")?;
        let space = a.get(source, "space")?;
        wards.push(Ward {
            id,
            center: center(&polygon),
            polygon,
            kind: kind.into(),
            name,
            buildings,
            within_city: a.boolean(cell, "withinCity")?,
            original_kind: original,
            seed: a.num(cell, "seed")? as u32,
            green: if a.rt.truthy(green) {
                Some(a.polygon(green)?)
            } else {
                None
            },
            market_space: if a.rt.truthy(space) {
                Some(a.polygon(space)?)
            } else {
                None
            },
        });
    }
    let tree_renderer = a.get(kernel, "Trees")?;
    let mut trees = vec![];
    let mut crowns = vec![];
    for &cell in &cells {
        let ward = a.get(cell, "ward")?;
        let spawned = a.rt.invoke(ward, "spawnTrees", &[])?;
        for v in a.rt.values(spawned) {
            let p = a.point(v)?;
            trees.push(p);
            let crown = a.rt.invoke(tree_renderer, "getTree", &[])?;
            crowns.push(a.polygon(crown)?.into_iter().map(|v| v.plus(p)).collect());
        }
    }
    let mut districts = vec![];
    let mut labels = vec![];
    let mut alleys = vec![];
    for district in a.array(model, "districts")? {
        let name = a.text(district, "name")?;
        let border = a.array(district, "border")?;
        let polygon = a.chain(&border, true)?.into_iter().map(|p| p.1).collect();
        let mut ward_ids = vec![];
        for face in a.array(district, "faces")? {
            let cell = a.get(face, "data")?;
            if let Some(i) = cells.iter().position(|&v| v == cell) {
                ward_ids.push(i);
            }
        }
        let ty = a.get(district, "type")?;
        let type_name = a.get(ty, "_hx_name")?;
        districts.push(District {
            name: name.clone(),
            polygon,
            ward_ids,
            kind: if a.rt.nullish(type_name) {
                None
            } else {
                Some(a.rt.text(type_name))
            },
        });
        let ridge = a.rt.invoke(district, "getRidge", &[])?;
        let path = a.polygon(ridge)?;
        let angle = path
            .first()
            .zip(path.last())
            .map(|(f, l)| crate::math::atan2(l.y - f.y, l.x - f.x) * 180.0 / std::f64::consts::PI)
            .unwrap_or(0.0);
        labels.push(MapLabel {
            text: name,
            point: center(&path),
            angle,
            size: 9.0,
            path,
        });
        for group in a.array(district, "groups")? {
            alleys.extend(a.polys(group, "alleys")?);
        }
    }
    let mut roads = vec![];
    for chain in a.array(model, "arteries")? {
        roads.push(a.road(a.rt.values(chain))?);
    }
    let mut shore = vec![];
    for p in a.array(model, "shore")? {
        shore.push((p, a.point(p)?));
    }
    let mut rivers = vec![];
    for canal in a.array(model, "canals")? {
        rivers.push(a.river(canal, &shore)?);
    }
    let citadel = a.get(model, "citadel")?;
    let ward = a.get(citadel, "ward")?;
    let castle_wall = a.get(ward, "wall")?;
    let mut walls = vec![];
    for wall in a.array(model, "walls")? {
        walls.push(a.wall(wall, wall == castle_wall)?);
    }
    let wall = a.get(model, "wall")?;
    let mut gates = vec![];
    for vertex in a.array(model, "gates")? {
        gates.push(a.vertex(vertex)?);
    }
    let water = a.poly(model, "waterEdge")?;
    let coast = if water.is_empty() {
        vec![]
    } else {
        let ocean = a.rt.invoke(model, "getOcean", &[])?;
        a.polygon(ocean)?
    };
    let bounds = a.get(model, "bounds")?;
    Ok(City {
        options,
        name: a.text(model, "name")?,
        wards,
        wall: if a.rt.nullish(wall) {
            vec![]
        } else {
            a.poly(wall, "shape")?
        },
        castle_wall: if a.rt.nullish(castle_wall) {
            vec![]
        } else {
            a.poly(castle_wall, "shape")?
        },
        gates,
        roads: roads.iter().map(|r| r.course.clone()).collect(),
        river: rivers.first().map(|r| r.course.clone()).unwrap_or_default(),
        river_width: rivers.first().map(|r| r.width).unwrap_or(0.0),
        coast,
        trees,
        fields,
        labels,
        bounds: Bounds {
            x: a.num(bounds, "x")?,
            y: a.num(bounds, "y")?,
            width: a.num(bounds, "width")?,
            height: a.num(bounds, "height")?,
        },
        original_geometry: OriginalGeometry {
            earth: a.poly(model, "earthEdge")?,
            water,
            shore: shore.into_iter().map(|p| p.1).collect(),
            roads,
            rivers,
            walls,
            piers,
            furrows,
            alleys,
            districts,
            tree_crowns: crowns,
        },
    })
}
