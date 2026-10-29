//! Market planning V1: an immutable, configurable analysis of planar city geometry.
use crate::market_model::*;
use crate::{City, GenerationError, Point};
use std::{
    cmp::Ordering,
    collections::{BTreeMap, BinaryHeap},
};

// Match the accepted HTML model, including its four-decimal reference geometry.
const EPS: f64 = 1e-4;
const ACCESS: f64 = 20.0;
const SCALE: f64 = 4.0;

#[derive(Clone, Copy)]
struct Segment(Point, Point);
#[derive(Default)]
struct Graph {
    points: Vec<Point>,
    edges: Vec<Vec<(usize, f64)>>,
    main_entries: Vec<usize>,
}
struct Paths {
    distances: Vec<f64>,
    previous: Vec<Option<usize>>,
}
impl Paths {
    fn route(&self, graph: &Graph, target: usize) -> Vec<Point> {
        if !self.distances[target].is_finite() {
            return vec![];
        }
        let mut route = vec![];
        let mut next = Some(target);
        while let Some(i) = next {
            route.push(graph.points[i]);
            next = self.previous[i];
        }
        route.reverse();
        route
    }
}
#[derive(Clone, Copy, PartialEq)]
struct Visit(f64, usize);
impl Eq for Visit {}
impl Ord for Visit {
    fn cmp(&self, other: &Self) -> Ordering {
        other
            .0
            .total_cmp(&self.0)
            .then_with(|| other.1.cmp(&self.1))
    }
}
impl PartialOrd for Visit {
    fn partial_cmp(&self, other: &Self) -> Option<Ordering> {
        Some(self.cmp(other))
    }
}
fn distance(a: Point, b: Point) -> f64 {
    a.minus(b).length()
}
fn dot(a: Point, b: Point) -> f64 {
    a.x * b.x + a.y * b.y
}
fn cross(a: Point, b: Point) -> f64 {
    a.x * b.y - a.y * b.x
}
fn projection(p: Point, s: Segment) -> (Point, f64) {
    let d = s.1.minus(s.0);
    let t = if dot(d, d) < EPS * EPS {
        0.0
    } else {
        (dot(p.minus(s.0), d) / dot(d, d)).clamp(0.0, 1.0)
    };
    (s.0.lerp(s.1, t), t)
}
fn intersection(a: Segment, b: Segment) -> Option<(f64, f64)> {
    let r = a.1.minus(a.0);
    let s = b.1.minus(b.0);
    let denominator = cross(r, s);
    if denominator.abs() < EPS {
        return None;
    }
    let delta = b.0.minus(a.0);
    let t = cross(delta, s) / denominator;
    let u = cross(delta, r) / denominator;
    ((-EPS..=1.0 + EPS).contains(&t) && (-EPS..=1.0 + EPS).contains(&u))
        .then_some((t.clamp(0.0, 1.0), u.clamp(0.0, 1.0)))
}
fn contact(a: Segment, b: Segment) -> Option<Point> {
    if let Some((t, _)) = intersection(a, b) {
        return Some(a.0.lerp(a.1, t));
    }
    [a.0, a.1]
        .into_iter()
        .find(|&p| distance(p, projection(p, b).0) < EPS)
        .or_else(|| {
            [b.0, b.1]
                .into_iter()
                .find(|&p| distance(p, projection(p, a).0) < EPS)
        })
}
fn segments(line: &[Point]) -> impl Iterator<Item = Segment> + '_ {
    line.windows(2).map(|p| Segment(p[0], p[1]))
}
fn area(poly: &[Point]) -> f64 {
    (0..poly.len())
        .map(|i| cross(poly[i], poly[(i + 1) % poly.len()]))
        .sum::<f64>()
        .abs()
        * 0.5
}
fn center(poly: &[Point]) -> Point {
    poly.iter()
        .fold(Point::default(), |a, &p| a.plus(p))
        .scale(1.0 / poly.len().max(1) as f64)
}
fn contains(poly: &[Point], p: Point) -> bool {
    let mut inside = false;
    for i in 0..poly.len() {
        let a = poly[i];
        let b = poly[(i + 1) % poly.len()];
        if (a.y > p.y) != (b.y > p.y) && p.x < (b.x - a.x) * (p.y - a.y) / (b.y - a.y) + a.x {
            inside = !inside;
        }
    }
    inside
}

/// Conservative barriers: access legs cannot cross river centrelines or walls.
/// Street edges may cross only inside an explicit bridge/gate corridor.
fn blocked(city: &City, edge: Segment, street: bool) -> bool {
    if contains(&city.coast, edge.0)
        || contains(&city.coast, edge.1)
        || (0..city.coast.len()).any(|i| {
            contact(
                edge,
                Segment(city.coast[i], city.coast[(i + 1) % city.coast.len()]),
            )
            .is_some()
        })
    {
        return true;
    }
    for river in &city.original_geometry.rivers {
        for s in segments(&river.path) {
            if let Some(p) = contact(edge, s) {
                let bridge = street
                    && river.bridges.iter().any(|b| {
                        segments(&b.path)
                            .any(|s| distance(p, projection(p, s).0) <= b.width / 2.0 + EPS)
                    });
                if !bridge {
                    return true;
                }
            }
        }
    }
    for wall in &city.original_geometry.walls {
        for s in wall.segments.iter().flat_map(|p| segments(p)) {
            if let Some(p) = contact(edge, s) {
                let gate = city
                    .gates
                    .iter()
                    .chain(wall.gates.iter().flatten())
                    .any(|&g| distance(p, g) <= wall.tower_radius * 2.0);
                if !gate {
                    return true;
                }
            }
        }
    }
    false
}
impl Graph {
    fn node(&mut self, p: Point) -> usize {
        if let Some(i) = self.points.iter().position(|&q| distance(p, q) < EPS) {
            return i;
        }
        self.points.push(p);
        self.edges.push(vec![]);
        self.points.len() - 1
    }
    fn join(&mut self, a: Point, b: Point) {
        let cost = distance(a, b);
        if cost < EPS {
            return;
        }
        let a = self.node(a);
        let b = self.node(b);
        if !self.edges[a].iter().any(|e| e.0 == b) {
            self.edges[a].push((b, cost));
            self.edges[b].push((a, cost));
        }
    }
    fn from_city(city: &City) -> Self {
        let lines = city
            .original_geometry
            .roads
            .iter()
            .map(|r| &r.course)
            .chain(city.original_geometry.alleys.iter())
            .collect::<Vec<_>>();
        let mut streets: Vec<_> = lines
            .iter()
            .flat_map(|p| segments(p))
            .filter(|s| distance(s.0, s.1) > EPS)
            .collect();
        // Drawing paths inset some alley ends. Infer only short endpoint-to-line
        // access links, never arbitrary proximity links between parallel roads.
        for (i, line) in lines
            .iter()
            .enumerate()
            .skip(city.original_geometry.roads.len())
        {
            for &p in line.first().into_iter().chain(line.last()) {
                let nearest = lines
                    .iter()
                    .enumerate()
                    .filter(|&(j, _)| i != j)
                    .flat_map(|(_, line)| segments(line))
                    .map(|s| projection(p, s).0)
                    .map(|q| (q, distance(p, q)))
                    .filter(|&(q, d)| d <= 2.0 && !blocked(city, Segment(p, q), false))
                    .min_by(|a, b| a.1.total_cmp(&b.1));
                if let Some((q, d)) = nearest
                    && d > EPS
                {
                    streets.push(Segment(p, q));
                }
            }
        }
        let mut cuts = vec![vec![0.0, 1.0]; streets.len()];
        for (i, &a) in streets.iter().enumerate() {
            for (j, &b) in streets.iter().enumerate().skip(i + 1) {
                if let Some((t, u)) = intersection(a, b) {
                    cuts[i].push(t);
                    cuts[j].push(u);
                }
                // Also node collinear overlaps and exact T-junctions.
                for (p, target, index) in [(a.0, b, j), (a.1, b, j), (b.0, a, i), (b.1, a, i)] {
                    let (q, t) = projection(p, target);
                    if distance(p, q) < EPS {
                        cuts[index].push(t);
                    }
                }
            }
        }
        let mut graph = Self::default();
        for (s, mut ts) in streets.into_iter().zip(cuts) {
            ts.sort_by(f64::total_cmp);
            ts.dedup_by(|a, b| (*a - *b).abs() < EPS);
            for t in ts.windows(2) {
                let a = s.0.lerp(s.1, t[0]);
                let b = s.0.lerp(s.1, t[1]);
                if blocked(city, Segment(a, b), true) {
                    continue;
                }
                // Bound estimated access distance on long, sparsely sampled streets.
                let steps = (distance(a, b) / 8.0).ceil().max(1.0) as usize;
                for step in 0..steps {
                    graph.join(
                        a.lerp(b, step as f64 / steps as f64),
                        a.lerp(b, (step + 1) as f64 / steps as f64),
                    );
                }
            }
        }
        for ward in &city.wards {
            if let Some(space) = &ward.market_space {
                let sources = graph.market_access(city, space);
                for &(i, _) in &sources {
                    if !graph.main_entries.contains(&i) {
                        graph.main_entries.push(i);
                    }
                }
                for (index, &(i, _)) in sources.iter().enumerate() {
                    for &(j, _) in &sources[index + 1..] {
                        let a = graph.points[i];
                        let b = graph.points[j];
                        if !blocked(city, Segment(a, b), false) {
                            graph.join(a, b);
                        }
                    }
                }
            }
        }
        graph
    }
    fn access(&self, city: &City, p: Point) -> Option<(usize, f64)> {
        self.points
            .iter()
            .enumerate()
            .map(|(i, &q)| (i, distance(p, q)))
            .filter(|&(i, d)| d <= ACCESS && !blocked(city, Segment(p, self.points[i]), false))
            .min_by(|a, b| a.1.total_cmp(&b.1).then(a.0.cmp(&b.0)))
    }
    fn market_access(&self, city: &City, space: &[Point]) -> Vec<(usize, f64)> {
        let origin = center(space);
        let sources: Vec<_> = self
            .points
            .iter()
            .enumerate()
            .filter(|&(_, &p)| {
                let incident = contains(space, p)
                    || (0..space.len()).any(|i| {
                        distance(
                            p,
                            projection(p, Segment(space[i], space[(i + 1) % space.len()])).0,
                        ) < EPS
                    });
                incident && !blocked(city, Segment(origin, p), false)
            })
            .map(|(i, _)| (i, 0.0))
            .collect();
        sources
    }
    #[cfg(test)]
    fn distances(&self, sources: &[(usize, f64)]) -> Vec<f64> {
        self.paths(sources).distances
    }
    fn paths(&self, sources: &[(usize, f64)]) -> Paths {
        let mut distances = vec![f64::INFINITY; self.points.len()];
        let mut previous = vec![None; self.points.len()];
        let mut heap = BinaryHeap::new();
        for &(i, d) in sources {
            if d < distances[i] {
                distances[i] = d;
                heap.push(Visit(d, i));
            }
        }
        while let Some(Visit(d, i)) = heap.pop() {
            if d > distances[i] {
                continue;
            }
            for &(j, cost) in &self.edges[i] {
                if d + cost < distances[j] {
                    distances[j] = d + cost;
                    previous[j] = Some(i);
                    heap.push(Visit(d + cost, j));
                }
            }
        }
        Paths {
            distances,
            previous,
        }
    }
}
struct Demand {
    ward_id: usize,
    building_index: usize,
    district: Option<usize>,
    weight: f64,
    access: Option<(usize, f64)>,
}
struct Candidate {
    node: usize,
    district: Option<usize>,
    paths: Paths,
}
struct Evaluation {
    reason: MarketCandidateReason,
    score: f64,
    beneficiaries: usize,
}
fn trip(d: &Demand, paths: &Paths) -> f64 {
    d.access
        .map_or(f64::INFINITY, |(i, leg)| paths.distances[i] + leg)
}
fn mean(demand: &[Demand], best: &[f64], cap: f64) -> f64 {
    let total = demand.iter().map(|d| d.weight).sum::<f64>();
    if total == 0.0 {
        return 0.0;
    }
    demand
        .iter()
        .zip(best)
        .map(|(d, &distance)| d.weight * distance.min(cap))
        .sum::<f64>()
        / total
        * SCALE
}
fn district(city: &City, point: Point) -> Option<usize> {
    city.original_geometry
        .districts
        .iter()
        .position(|d| contains(&d.polygon, point))
}
fn needs(city: &City, demand: &[Demand], best: &[f64], cap: f64) -> Vec<f64> {
    let mut total = vec![0.0; city.original_geometry.districts.len()];
    let mut unserved = total.clone();
    for (d, &distance) in demand.iter().zip(best) {
        if let Some(i) = d.district {
            total[i] += d.weight;
            if distance > cap {
                unserved[i] += d.weight;
            }
        }
    }
    total
        .iter()
        .zip(unserved)
        .map(|(&t, u)| if t > 0.0 { u / t } else { 0.0 })
        .collect()
}
struct DemandContext<'a> {
    demand: &'a [Demand],
    best: &'a [f64],
    needs: &'a [f64],
}
fn evaluate(
    candidate: &Candidate,
    main: &Paths,
    chosen: &[usize],
    candidates: &[Candidate],
    state: &DemandContext<'_>,
    profile: &MarketProfile,
) -> Evaluation {
    let (demand, best, needs) = (state.demand, state.best, state.needs);
    let main_distance = main.distances[candidate.node] * SCALE;
    let reject = |reason| Evaluation {
        reason,
        score: 0.0,
        beneficiaries: 0,
    };
    if !main_distance.is_finite() {
        return reject(MarketCandidateReason::Disconnected);
    }
    if main_distance + EPS < profile.main_min {
        return reject(MarketCandidateReason::NearMain);
    }
    if chosen
        .iter()
        .any(|&i| candidates[i].paths.distances[candidate.node] * SCALE + EPS < profile.side_min)
    {
        return reject(MarketCandidateReason::NearSecondary);
    }
    let cap = profile.service / SCALE;
    let mut beneficiaries = 0;
    let mut score = 0.0;
    let mut gain = 0.0;
    for (d, &before) in demand.iter().zip(best) {
        let next = trip(d, &candidate.paths);
        let delta = (before.min(cap) - next.min(cap)).max(0.0);
        gain += d.weight * delta;
        if d.weight > 0.0 && next <= cap && before - next >= 10.0 / SCALE {
            beneficiaries += 1;
        }
        score += d.weight
            * delta
            * (1.0 + profile.district_weight * d.district.map_or(0.0, |i| needs[i]));
    }
    if beneficiaries < profile.min_beneficiaries {
        return reject(MarketCandidateReason::InsufficientDemand);
    }
    if gain < EPS {
        return reject(MarketCandidateReason::NoGain);
    }
    Evaluation {
        reason: MarketCandidateReason::Alternative,
        score,
        beneficiaries,
    }
}

/// V1 planning with the default named profile and footprint demand.
pub fn analyze_economy(city: &City) -> MarketPlan {
    plan_markets(city, &MarketProfile::default(), &[])
        .expect("default market profile and generated geometry are valid")
}

/// Plan without mutating geometry or consuming the generator RNG.
/// Demand overrides are supplied before planning; derived market uses never
/// produce their own demand. Empty overrides retain the footprint-area proxy.
pub fn plan_markets(
    city: &City,
    profile: &MarketProfile,
    overrides: &[MarketDemandOverride],
) -> Result<MarketPlan, GenerationError> {
    profile.validate()?;
    let mut weights = BTreeMap::new();
    for input in overrides {
        if !input.weight.is_finite()
            || input.weight < 0.0
            || weights
                .insert((input.ward_id, input.building_index), input.weight)
                .is_some()
        {
            return Err(GenerationError(
                "Demand weights must be finite, nonnegative and unique".into(),
            ));
        }
    }
    let graph = Graph::from_city(city);
    let mut demand = vec![];
    for ward in &city.wards {
        for (i, b) in ward
            .buildings
            .iter()
            .enumerate()
            .filter(|(_, b)| b.role == "lot")
        {
            let p = center(&b.polygon);
            demand.push(Demand {
                ward_id: ward.id,
                building_index: i,
                district: district(city, p),
                weight: weights
                    .remove(&(ward.id, i))
                    .unwrap_or_else(|| area(&b.polygon)),
                access: graph.access(city, p),
            });
        }
    }
    if !weights.is_empty() {
        return Err(GenerationError(
            "Demand override must identify an ordinary lot building".into(),
        ));
    }
    let total = demand.iter().map(|d| d.weight).sum::<f64>();
    if !total.is_finite() {
        return Err(GenerationError("Demand weights overflow".into()));
    }
    let main = graph.paths(
        &graph
            .main_entries
            .iter()
            .map(|&i| (i, 0.0))
            .collect::<Vec<_>>(),
    );
    let mut best: Vec<_> = demand.iter().map(|d| trip(d, &main)).collect();
    let baseline = mean(&demand, &best, profile.service / SCALE);
    let spaces: Vec<_> = city
        .wards
        .iter()
        .filter_map(|w| w.market_space.as_ref())
        .collect();
    let candidates: Vec<_> = graph
        .points
        .iter()
        .enumerate()
        .filter(|&(i, p)| {
            graph.edges[i].len() >= 3
                && !spaces.iter().any(|s| {
                    contains(s, *p)
                        || (0..s.len()).any(|j| {
                            distance(*p, projection(*p, Segment(s[j], s[(j + 1) % s.len()])).0)
                                < EPS
                        })
                })
                && !city
                    .wards
                    .iter()
                    .flat_map(|w| &w.buildings)
                    .any(|b| contains(&b.polygon, *p))
        })
        .map(|(i, &p)| Candidate {
            node: i,
            district: district(city, p),
            paths: graph.paths(&[(i, 0.0)]),
        })
        .collect();
    let mut chosen = vec![];
    let mut beneficiaries = vec![];
    for _ in 0..profile.max_markets {
        let need = needs(city, &demand, &best, profile.service / SCALE);
        let mut winner = None;
        let mut score = 0.0;
        for (i, c) in candidates.iter().enumerate() {
            if chosen.contains(&i) {
                continue;
            }
            let e = evaluate(
                c,
                &main,
                &chosen,
                &candidates,
                &DemandContext {
                    demand: &demand,
                    best: &best,
                    needs: &need,
                },
                profile,
            );
            if !e.score.is_finite() {
                return Err(GenerationError("Demand score overflow".into()));
            }
            if e.score > score + EPS {
                score = e.score;
                winner = Some((i, e.beneficiaries));
            }
        }
        let Some((i, count)) = winner else { break };
        chosen.push(i);
        beneficiaries.push(count);
        for (d, best) in demand.iter().zip(&mut best) {
            *best = best.min(trip(d, &candidates[i].paths));
        }
    }
    let planned = mean(&demand, &best, profile.service / SCALE);
    if !baseline.is_finite() || !planned.is_finite() {
        return Err(GenerationError("Demand distance overflow".into()));
    }
    let mut markets = vec![];
    if let Some(space) = spaces.first() {
        let p = center(space);
        markets.push(MarketSite {
            position: p,
            proposed: false,
            district: district(city, p),
            main_distance_metres: None,
            beneficiaries: 0,
            served_demand_weight: 0.0,
            served_districts: vec![],
            route: vec![],
        });
    }
    for (index, &i) in chosen.iter().enumerate() {
        let c = &candidates[i];
        markets.push(MarketSite {
            position: graph.points[c.node],
            proposed: true,
            district: c.district,
            main_distance_metres: Some(main.distances[c.node] * SCALE),
            beneficiaries: beneficiaries[index],
            served_demand_weight: 0.0,
            served_districts: vec![],
            route: main.route(&graph, c.node),
        });
    }
    let mut buildings = vec![];
    let mut served_weight = 0.0;
    for d in &demand {
        let mut nearest = (None, f64::INFINITY);
        if !markets.is_empty() {
            for (i, paths) in std::iter::once(&main)
                .chain(chosen.iter().map(|&i| &candidates[i].paths))
                .enumerate()
            {
                let value = trip(d, paths);
                if value * SCALE <= profile.service && value < nearest.1 {
                    nearest = (Some(i), value);
                }
            }
        }
        if let Some(i) = nearest.0 {
            served_weight += d.weight;
            markets[i].served_demand_weight += d.weight;
            if let Some(district) = d.district
                && !markets[i].served_districts.contains(&district)
            {
                markets[i].served_districts.push(district);
            }
        }
        buildings.push(MarketAssignment {
            ward_id: d.ward_id,
            building_index: d.building_index,
            district: d.district,
            market: nearest.0,
            distance_metres: nearest.0.map(|_| nearest.1 * SCALE),
        });
    }
    let mut districts = vec![];
    for (i, district) in city.original_geometry.districts.iter().enumerate() {
        let mut weight = 0.0;
        let mut before = 0.0;
        let mut after = 0.0;
        let mut suppliers = vec![];
        let mut count = 0;
        for (d, a) in demand
            .iter()
            .zip(&buildings)
            .filter(|(d, _)| d.district == Some(i))
        {
            count += 1;
            weight += d.weight;
            if trip(d, &main) * SCALE <= profile.service {
                before += d.weight;
            }
            if let Some(market) = a.market {
                after += d.weight;
                if !suppliers.contains(&market) {
                    suppliers.push(market);
                }
            }
        }
        districts.push(DistrictCoverage {
            name: district.name.clone(),
            buildings: count,
            before: (weight > 0.0).then_some(before / weight),
            after: (weight > 0.0).then_some(after / weight),
            secondary_markets: chosen
                .iter()
                .filter(|&&c| candidates[c].district == Some(i))
                .count(),
            suppliers,
        });
    }
    let mut pairs = vec![];
    for (i, &a) in chosen.iter().enumerate() {
        for (j, &b) in chosen.iter().enumerate().skip(i + 1) {
            let target = candidates[b].node;
            pairs.push(MarketPair {
                from: i + 1,
                to: j + 1,
                distance_metres: candidates[a].paths.distances[target] * SCALE,
                route: candidates[a].paths.route(&graph, target),
            });
        }
    }
    let need = needs(city, &demand, &best, profile.service / SCALE);
    let reasons = candidates
        .iter()
        .enumerate()
        .map(|(i, c)| MarketCandidate {
            position: graph.points[c.node],
            district: c.district,
            main_distance_metres: main.distances[c.node]
                .is_finite()
                .then_some(main.distances[c.node] * SCALE),
            reason: if chosen.contains(&i) {
                MarketCandidateReason::Selected
            } else {
                evaluate(
                    c,
                    &main,
                    &chosen,
                    &candidates,
                    &DemandContext {
                        demand: &demand,
                        best: &best,
                        needs: &need,
                    },
                    profile,
                )
                .reason
            },
        })
        .collect();
    Ok(MarketPlan {
        profile: profile.clone(),
        markets,
        buildings,
        districts,
        pairs,
        candidates: reasons,
        graph_nodes: graph.points.len(),
        main_entrances: graph.main_entries.len(),
        unlinked_buildings: demand.iter().filter(|d| d.access.is_none()).count(),
        unserved_buildings: best
            .iter()
            .filter(|&&d| d * SCALE > profile.service)
            .count(),
        unassigned_district_buildings: demand.iter().filter(|d| d.district.is_none()).count(),
        served_demand_fraction: if total > 0.0 {
            served_weight / total
        } else {
            0.0
        },
        baseline_capped_distance_metres: baseline,
        planned_capped_distance_metres: planned,
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::{
        Bounds, Bridge, Building, CityOptions, OriginalGeometry, Polygon, River, Road, Ward,
    };
    fn p(x: f64, y: f64) -> Point {
        Point { x, y }
    }
    fn square(x: f64, y: f64) -> Polygon {
        vec![
            p(x - 1.0, y - 1.0),
            p(x + 1.0, y - 1.0),
            p(x + 1.0, y + 1.0),
            p(x - 1.0, y + 1.0),
        ]
    }
    fn city(lines: Vec<Polygon>) -> City {
        let mut city = City {
            options: CityOptions::default(),
            name: "Test".into(),
            wards: vec![],
            wall: vec![],
            castle_wall: vec![],
            gates: vec![],
            roads: vec![],
            river: vec![],
            river_width: 0.,
            coast: vec![],
            trees: vec![],
            fields: vec![],
            labels: vec![],
            bounds: Bounds::default(),
            original_geometry: OriginalGeometry {
                earth: vec![],
                water: vec![],
                shore: vec![],
                roads: vec![],
                rivers: vec![],
                walls: vec![],
                piers: vec![],
                furrows: vec![],
                alleys: vec![],
                districts: vec![],
                tree_crowns: vec![],
            },
        };
        city.original_geometry.roads = lines
            .into_iter()
            .map(|course| Road {
                path: course.clone(),
                course,
                outlines: vec![],
            })
            .collect();
        city.original_geometry.alleys.clear();
        city.original_geometry.rivers.clear();
        city.original_geometry.walls.clear();
        city
    }
    fn add_houses(city: &mut City, positions: &[Point]) {
        city.wards.push(Ward {
            id: 7,
            polygon: vec![],
            center: Point::default(),
            kind: "residential".into(),
            name: "Test".into(),
            buildings: positions
                .iter()
                .map(|p| Building {
                    polygon: square(p.x, p.y),
                    landmark: false,
                    role: "lot".into(),
                })
                .collect(),
            within_city: true,
            original_kind: "Alleys".into(),
            seed: 42,
            green: None,
            market_space: None,
        });
    }
    #[test]
    fn nodes_crossings_t_junctions_and_overlaps_without_proximity_shortcuts() {
        let c = city(vec![
            vec![p(-20., 0.), p(20., 0.)],
            vec![p(0., -20.), p(0., 20.)],
            vec![p(10., 0.), p(10., 10.)],
            vec![p(-10., 0.), p(10., 0.)],
            vec![p(-20., 0.01), p(20., 0.01)],
        ]);
        let g = Graph::from_city(&c);
        let start = g
            .points
            .iter()
            .position(|&q| distance(q, p(-20., 0.)) < EPS)
            .unwrap();
        let end = g
            .points
            .iter()
            .position(|&q| distance(q, p(10., 10.)) < EPS)
            .unwrap();
        let close = g
            .points
            .iter()
            .position(|&q| distance(q, p(-20., 0.01)) < EPS)
            .unwrap();
        let ds = g.distances(&[(start, 0.)]);
        assert!((ds[end] - 40.).abs() < EPS);
        // The nearby parallel road is connected only where the vertical roads truly cross it.
        assert!(ds[close] > 39.);
    }
    #[test]
    fn inset_alley_ends_connect_but_not_across_a_barrier() {
        let mut c = city(vec![vec![p(-20., 0.), p(20., 0.)]]);
        c.original_geometry.alleys.push(vec![p(0., 1.), p(0., 10.)]);
        let g = Graph::from_city(&c);
        let start = g.access(&c, p(0., 10.)).unwrap().0;
        let end = g.access(&c, p(10., 0.)).unwrap().0;
        assert!(g.distances(&[(start, 0.)])[end].is_finite());
        c.original_geometry.rivers.push(River {
            course: vec![],
            path: vec![p(-30., 0.5), p(30., 0.5)],
            width: 0.1,
            bridges: vec![],
            mouth: None,
        });
        let g = Graph::from_city(&c);
        let start = g.access(&c, p(0., 10.)).unwrap().0;
        let end = g.access(&c, p(10., 0.)).unwrap().0;
        assert!(g.distances(&[(start, 0.)])[end].is_infinite());
    }
    #[test]
    fn walls_and_coastal_inlets_block_shortcuts() {
        let mut c = city(vec![]);
        c.coast = square(0., 0.);
        assert!(blocked(&c, Segment(p(-3., 0.), p(3., 0.)), true));
        c.coast.clear();
        c.original_geometry.walls.push(crate::Wall {
            shape: vec![],
            segment_mask: vec![],
            segments: vec![vec![p(0., -10.), p(0., 10.)]],
            towers: vec![],
            gates: vec![],
            thickness: 1.,
            tower_radius: 1.,
            castle: false,
        });
        assert!(blocked(&c, Segment(p(-3., 0.), p(3., 0.)), true));
        c.gates.push(p(0., 0.));
        assert!(!blocked(&c, Segment(p(-3., 0.), p(3., 0.)), true));
        assert!(blocked(&c, Segment(p(-3., 8.), p(3., 8.)), true));
    }
    #[test]
    fn river_crossing_requires_a_declared_bridge() {
        let mut c = city(vec![vec![p(-20., 0.), p(20., 0.)]]);
        c.original_geometry.rivers.push(River {
            course: vec![p(0., -30.), p(0., 30.)],
            path: vec![p(0., -30.), p(0., 30.)],
            width: 4.,
            bridges: vec![],
            mouth: None,
        });
        assert!(Graph::from_city(&c).points.is_empty());
        c.original_geometry.rivers[0].bridges.push(Bridge {
            path: vec![p(-3., 0.), p(3., 0.)],
            width: 2.,
        });
        let g = Graph::from_city(&c);
        assert!(!g.points.is_empty());
        assert!(blocked(&c, Segment(p(-2., 1.), p(2., 1.)), false));
        assert!(!blocked(&c, Segment(p(-20., 0.), p(20., 0.)), true));
    }
    #[test]
    fn proposals_improve_demand_and_leave_city_unchanged() {
        let mut c = city(vec![
            vec![p(-60., 0.), p(60., 0.)],
            vec![p(-40., -10.), p(-40., 10.)],
            vec![p(40., -10.), p(40., 10.)],
        ]);
        add_houses(&mut c, &[p(-40., 4.), p(-35., 4.), p(35., 4.), p(40., 4.)]);
        c.wards[0].market_space = Some(square(0., 0.));
        let profile = MarketProfile {
            main_min: 100.,
            side_min: 100.,
            service: 320.,
            min_beneficiaries: 1,
            ..Default::default()
        };
        let before = serde_json::to_value(&c).unwrap();
        let a = plan_markets(&c, &profile, &[]).unwrap();
        assert_eq!(a, plan_markets(&c, &profile, &[]).unwrap());
        assert_eq!(before, serde_json::to_value(&c).unwrap());
        assert_eq!(a.markets.iter().filter(|m| m.proposed).count(), 2);
        assert!(a.planned_capped_distance_metres < a.baseline_capped_distance_metres);
        assert_eq!(a.unlinked_buildings, 0);
        assert!(a.buildings.iter().all(|b| b.market.is_some()));
        assert_eq!(
            a.markets
                .iter()
                .map(|m| m.served_demand_weight)
                .sum::<f64>(),
            16.
        );
        assert!(a.markets.iter().all(|m| {
            !c.wards[0]
                .buildings
                .iter()
                .any(|b| contains(&b.polygon, m.position))
        }));
    }
    #[test]
    fn missing_main_market_is_not_treated_as_infinite_eligible_distance() {
        let mut c = city(vec![
            vec![p(-60., 0.), p(60., 0.)],
            vec![p(0., -20.), p(0., 20.)],
        ]);
        add_houses(&mut c, &[p(3., 3.)]);
        let a = analyze_economy(&c);
        assert!(a.markets.is_empty());
        assert_eq!(a.main_entrances, 0);
        assert!(!a.candidates.is_empty());
        assert!(
            a.candidates
                .iter()
                .all(|c| c.reason == MarketCandidateReason::Disconnected)
        );
        assert_eq!(a.unserved_buildings, 1);
    }
    #[test]
    fn empty_and_disconnected_demand_is_explicit_not_nan() {
        let mut c = city(vec![]);
        let empty = analyze_economy(&c);
        assert_eq!(empty.planned_capped_distance_metres, 0.);
        add_houses(&mut c, &[p(0., 0.)]);
        let a = analyze_economy(&c);
        assert_eq!(a.unlinked_buildings, 1);
        assert_eq!(a.planned_capped_distance_metres, 240.);
        assert_eq!(a.buildings[0].market, None);
        assert!(a.markets.is_empty());
        serde_json::to_string(&a).unwrap();
    }
    #[test]
    fn existing_plaza_serves_all_incident_streets_without_crossing_barriers() {
        let mut c = city(vec![
            vec![p(-20., 0.), p(-5., 0.)],
            vec![p(5., 0.), p(20., 0.)],
        ]);
        add_houses(&mut c, &[p(-12., 3.), p(12., 3.)]);
        c.wards[0].market_space = Some(vec![p(-5., -5.), p(5., -5.), p(5., 5.), p(-5., 5.)]);
        let a = analyze_economy(&c);
        assert_eq!(a.markets.len(), 1);
        assert_eq!(
            a.unserved_buildings, 0,
            "both streets open onto the same plaza"
        );
        assert!(a.baseline_capped_distance_metres < 80.);
        assert!(a.buildings.iter().all(|b| b.market == Some(0)));

        c.original_geometry.rivers.push(River {
            course: vec![],
            path: vec![p(3., -10.), p(3., 10.)],
            width: 1.,
            bridges: vec![],
            mouth: None,
        });
        let a = analyze_economy(&c);
        assert_eq!(
            a.unserved_buildings, 1,
            "plaza access must still respect barriers"
        );
        assert_eq!(a.buildings[0].market, Some(0));
        assert_eq!(a.buildings[1].market, None);
    }
    #[test]
    fn existing_market_prevents_redundant_proposal_and_special_buildings_are_preserved() {
        let mut c = city(vec![
            vec![p(-20., 0.), p(20., 0.)],
            vec![p(0., -20.), p(0., 20.)],
        ]);
        add_houses(&mut c, &[p(4., 4.)]);
        c.wards[0].market_space = Some(square(0., 0.));
        c.wards[0].buildings.push(Building {
            polygon: square(8., 8.),
            role: "church".into(),
            landmark: true,
        });
        let a = analyze_economy(&c);
        assert_eq!(a.markets.len(), 1);
        assert!(!a.markets[0].proposed);
        assert_eq!(a.buildings.len(), 1);
        assert_eq!(a.buildings[0].market, Some(0));
        assert_eq!(
            a.baseline_capped_distance_metres,
            a.planned_capped_distance_metres
        );
    }
}
