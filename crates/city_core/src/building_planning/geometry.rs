use super::{BuildingIssue, BuildingMeasurements, BuildingProfile};
use crate::{City, Point, Polygon};

pub(super) const EPS: f64 = 1e-7;
const SCALE: f64 = 4.0;
fn dot(a: Point, b: Point) -> f64 {
    a.x * b.x + a.y * b.y
}
fn cross(a: Point, b: Point) -> f64 {
    a.x * b.y - a.y * b.x
}
fn distance(a: Point, b: Point) -> f64 {
    a.minus(b).length()
}
fn edges(p: &[Point]) -> impl Iterator<Item = (Point, Point)> + '_ {
    p.iter()
        .copied()
        .zip(p.iter().copied().cycle().skip(1))
        .take(p.len())
}
fn signed_area(p: &[Point]) -> f64 {
    edges(p).map(|(a, b)| cross(a, b)).sum::<f64>() / 2.0
}
pub(super) fn area(p: &[Point]) -> f64 {
    signed_area(p).abs()
}
fn project(p: Point, a: Point, b: Point) -> Point {
    let v = b.minus(a);
    let t = (dot(p.minus(a), v) / dot(v, v).max(f64::MIN_POSITIVE)).clamp(0.0, 1.0);
    a.plus(v.scale(t))
}
fn on(p: Point, a: Point, b: Point) -> bool {
    distance(p, project(p, a, b)) <= EPS
}
fn dedup(p: Polygon) -> Polygon {
    p.iter()
        .enumerate()
        .filter_map(|(i, &q)| (distance(q, p[(i + p.len() - 1) % p.len()]) > EPS).then_some(q))
        .collect()
}
pub(super) fn clean(p: &[Point]) -> Polygon {
    let mut p = dedup(p.to_vec());
    while p.len() > 3 {
        let remove =
            (0..p.len()).find(|&i| on(p[i], p[(i + p.len() - 1) % p.len()], p[(i + 1) % p.len()]));
        if let Some(i) = remove {
            p.remove(i);
        } else {
            break;
        }
    }
    if signed_area(&p) < 0.0 {
        p.reverse();
    }
    p
}
pub(super) fn inside(q: Point, p: &[Point], boundary: bool) -> bool {
    if edges(p).any(|(a, b)| on(q, a, b)) {
        return boundary;
    }
    let mut hit = false;
    for (a, b) in edges(p) {
        if (a.y > q.y) != (b.y > q.y) && q.x < (b.x - a.x) * (q.y - a.y) / (b.y - a.y) + a.x {
            hit = !hit;
        }
    }
    hit
}
fn intersect(a: Point, b: Point, c: Point, d: Point) -> bool {
    let r = b.minus(a);
    let s = d.minus(c);
    let v = cross(r, s);
    if v.abs() < EPS {
        return on(a, c, d) || on(b, c, d) || on(c, a, b) || on(d, a, b);
    }
    let t = cross(c.minus(a), s) / v;
    let u = cross(c.minus(a), r) / v;
    (-EPS..=1.0 + EPS).contains(&t) && (-EPS..=1.0 + EPS).contains(&u)
}
pub(super) fn simple(p: &[Point]) -> bool {
    p.len() >= 3
        && area(p) > EPS
        && p.iter().all(|q| q.x.is_finite() && q.y.is_finite())
        && !edges(p).enumerate().any(|(i, (a, b))| {
            edges(p).enumerate().any(|(j, (c, d))| {
                j > i + 1 && !(i == 0 && j == p.len() - 1) && intersect(a, b, c, d)
            })
        })
}
fn hull(p: &[Point]) -> Polygon {
    let mut p = p.to_vec();
    p.sort_by(|a, b| a.x.total_cmp(&b.x).then(a.y.total_cmp(&b.y)));
    p.dedup();
    fn chain(points: impl Iterator<Item = Point>) -> Polygon {
        let mut result: Polygon = vec![];
        for q in points {
            while result.len() > 1
                && cross(
                    result[result.len() - 1].minus(result[result.len() - 2]),
                    q.minus(result[result.len() - 1]),
                ) <= EPS
            {
                result.pop();
            }
            result.push(q);
        }
        result
    }
    if p.len() < 3 {
        return p;
    }
    let mut a = chain(p.iter().copied());
    a.pop();
    let mut b = chain(p.iter().rev().copied());
    b.pop();
    a.extend(b);
    a
}
pub(super) fn assess(
    p: &[Point],
    profile: &BuildingProfile,
) -> (BuildingMeasurements, Vec<BuildingIssue>) {
    let p = clean(p);
    let h = hull(&p);
    let mut best = f64::INFINITY;
    let (mut width, mut depth) = (0.0, 0.0);
    for (a, b) in edges(&h) {
        let length = distance(a, b);
        if length < EPS {
            continue;
        }
        let u = b.minus(a).scale(1.0 / length);
        let v = Point { x: -u.y, y: u.x };
        let extent = |axis| {
            let (lo, hi) = h
                .iter()
                .map(|&q| dot(q, axis))
                .fold((f64::INFINITY, f64::NEG_INFINITY), |(lo, hi), x| {
                    (lo.min(x), hi.max(x))
                });
            hi - lo
        };
        let (w, d) = (extent(u), extent(v));
        if w * d < best {
            best = w * d;
            width = w.min(d) * SCALE;
            depth = w.max(d) * SCALE;
        }
    }
    let mut angle: f64 = 180.0;
    if p.len() >= 3 {
        for i in 0..p.len() {
            let (a, b, c) = (p[(i + p.len() - 1) % p.len()], p[i], p[(i + 1) % p.len()]);
            if cross(b.minus(a), c.minus(b)) <= EPS {
                continue;
            }
            let cosine =
                (dot(a.minus(b), c.minus(b)) / (distance(a, b) * distance(c, b))).clamp(-1.0, 1.0);
            angle = angle.min(cosine.acos().to_degrees());
        }
    }
    let m = BuildingMeasurements {
        area_m2: area(&p) * SCALE * SCALE,
        width_m: width,
        depth_m: depth,
        min_angle_degrees: angle,
    };
    let mut issues = vec![];
    if !simple(&p) {
        issues.push(BuildingIssue::InvalidPolygon);
    }
    if m.area_m2 + EPS < profile.min_area_m2 {
        issues.push(BuildingIssue::TooSmall);
    }
    if width + EPS < profile.min_width_m {
        issues.push(BuildingIssue::TooNarrow);
    }
    if depth + EPS < profile.min_depth_m {
        issues.push(BuildingIssue::TooShort);
    }
    if angle + EPS < profile.min_angle_degrees {
        issues.push(BuildingIssue::AcuteTip);
    }
    (m, issues)
}
/// Union only existing shared boundaries; never construct a convex hull or bridge a gap.
pub(super) fn unite(a: &[Point], b: &[Point]) -> Option<(Polygon, f64)> {
    let a = clean(a);
    let b = clean(b);
    if !simple(&a) || !simple(&b) {
        return None;
    }
    let mut parts = vec![];
    for (p, other) in [(&a, &b), (&b, &a)] {
        for (x, y) in edges(p) {
            let v = y.minus(x);
            let mut points = vec![x, y];
            points.extend(other.iter().copied().filter(|&q| on(q, x, y)));
            points.sort_by(|p, q| dot(p.minus(x), v).total_cmp(&dot(q.minus(x), v)));
            points.dedup_by(|p, q| distance(*p, *q) <= EPS);
            parts.extend(points.windows(2).map(|pair| (pair[0], pair[1])));
        }
    }
    let mut boundary: Vec<(Point, Point)> = vec![];
    let mut shared = 0.0;
    for (p, q) in parts {
        if let Some(i) = boundary
            .iter()
            .position(|&(a, b)| distance(a, q) <= EPS && distance(b, p) <= EPS)
        {
            boundary.remove(i);
            shared += distance(p, q);
        } else {
            if boundary
                .iter()
                .any(|&(a, b)| distance(a, p) <= EPS && distance(b, q) <= EPS)
            {
                return None;
            }
            boundary.push((p, q));
        }
    }
    if shared <= EPS {
        return None;
    }
    let start = boundary.first()?.0;
    let mut current = start;
    let mut result = vec![];
    while !boundary.is_empty() {
        let candidates: Vec<_> = boundary
            .iter()
            .enumerate()
            .filter(|(_, edge)| distance(edge.0, current) <= EPS)
            .map(|(i, _)| i)
            .collect();
        if candidates.len() != 1 {
            return None;
        }
        let (p, q) = boundary.remove(candidates[0]);
        result.push(p);
        current = q;
        if distance(current, start) <= EPS {
            break;
        }
    }
    if !boundary.is_empty() || distance(current, start) > EPS {
        return None;
    }
    let result = clean(&result);
    (simple(&result) && (area(&result) - area(&a) - area(&b)).abs() <= 1e-5)
        .then_some((result, shared * SCALE))
}
pub(super) fn clip(p: &[Point], axis: Point, bound: f64, less: bool) -> Polygon {
    let value = |p| dot(p, axis);
    let keep = |p| {
        if less {
            value(p) <= bound + EPS
        } else {
            value(p) >= bound - EPS
        }
    };
    let mut out = vec![];
    for (a, b) in edges(p) {
        let (ka, kb) = (keep(a), keep(b));
        if ka {
            out.push(a);
        }
        if ka != kb {
            let f = (bound - value(a)) / (value(b) - value(a));
            out.push(a.lerp(b, f));
        }
    }
    dedup(out)
}
/// A replacement chord must stay on/in the old boundary, not fill a concave notch.
pub(super) fn chord_inside(p: &[Point], a: Point, b: Point) -> bool {
    inside(a.lerp(b, 0.5), p, true)
        && !edges(p).any(|(c, d)| {
            let r = b.minus(a);
            let s = d.minus(c);
            let v = cross(r, s);
            if v.abs() < EPS {
                return false;
            }
            let t = cross(c.minus(a), s) / v;
            let u = cross(c.minus(a), r) / v;
            t > EPS && t < 1.0 - EPS && u > EPS && u < 1.0 - EPS
        })
}
pub(super) fn slab(p: &[Point], axis: Point, lo: f64, hi: f64) -> Polygon {
    clip(&clip(p, axis, lo, false), axis, hi, true)
}
pub(super) fn contact(a: Point, b: Point, c: Point, d: Point) -> Option<(f64, f64)> {
    let length = distance(a, b);
    if length < EPS {
        return None;
    }
    let u = b.minus(a).scale(1.0 / length);
    if cross(c.minus(a), u).abs() > EPS || cross(d.minus(a), u).abs() > EPS {
        return None;
    }
    let lo = 0.0_f64.max(dot(c.minus(a), u).min(dot(d.minus(a), u)));
    let hi = length.min(dot(c.minus(a), u).max(dot(d.minus(a), u)));
    (hi - lo > EPS).then_some((dot(a, u) + lo, dot(a, u) + hi))
}
pub(super) fn strip_axes(p: &[Point], measure: &BuildingMeasurements) -> Vec<(Point, Point)> {
    if p.len() != 4 || measure.width_m <= EPS || measure.depth_m / measure.width_m < 2.0 {
        return vec![];
    }
    let signs: Vec<_> = (0..p.len())
        .map(|i| {
            cross(
                p[(i + 1) % p.len()].minus(p[i]),
                p[(i + 2) % p.len()].minus(p[(i + 1) % p.len()]),
            )
        })
        .filter(|v| v.abs() > EPS)
        .collect();
    if signs.is_empty() || signs.iter().any(|s| s * signs[0] < 0.0) {
        return vec![];
    }
    let longest = edges(p).map(|(a, b)| distance(a, b)).fold(0.0, f64::max);
    edges(p)
        .filter(|&(a, b)| distance(a, b) >= longest * 0.9)
        .collect()
}
pub(super) fn axis(a: Point, b: Point) -> Point {
    b.minus(a).normalized(1.0)
}
pub(super) fn projection(p: Point, axis: Point) -> f64 {
    dot(p, axis)
}
pub(super) fn edge_list(p: &[Point]) -> Vec<(Point, Point)> {
    edges(p).collect()
}
fn line_hits(p: &[Point], line: &[Point]) -> bool {
    line.windows(2).any(|q| {
        if inside(q[0], p, false)
            || inside(q[1], p, false)
            || inside(q[0].lerp(q[1], 0.5), p, false)
        {
            return true;
        }
        edges(p).any(|(a, b)| {
            let r = q[1].minus(q[0]);
            let s = b.minus(a);
            let v = cross(r, s);
            if v.abs() < EPS {
                return false;
            }
            let t = cross(a.minus(q[0]), s) / v;
            let u = cross(a.minus(q[0]), r) / v;
            t > EPS && t < 1.0 - EPS && u > EPS && u < 1.0 - EPS
        })
    })
}
fn segment_distance(a: Point, b: Point, c: Point, d: Point) -> f64 {
    if intersect(a, b, c, d) {
        return 0.0;
    }
    distance(a, project(a, c, d))
        .min(distance(b, project(b, c, d)))
        .min(distance(c, project(c, a, b)))
        .min(distance(d, project(d, a, b)))
}
fn buffered_line(p: &[Point], line: &[Point], radius: f64) -> bool {
    line_hits(p, line)
        || line
            .windows(2)
            .any(|q| edges(p).any(|(a, b)| segment_distance(a, b, q[0], q[1]) <= radius + EPS))
}
pub(super) fn blocked(city: &City, p: &[Point]) -> bool {
    let g = &city.original_geometry;
    g.roads.iter().any(|r| line_hits(p, &r.path))
        || g.alleys.iter().any(|r| line_hits(p, r))
        || g.walls.iter().any(|w| {
            w.segments
                .iter()
                .any(|r| buffered_line(p, r, w.thickness / 2.0))
        })
        || g.rivers
            .iter()
            .any(|r| buffered_line(p, &r.path, r.width / 2.0))
        || (!g.water.is_empty()
            && (p.iter().any(|&q| inside(q, &g.water, true))
                || g.water.iter().any(|&q| inside(q, p, true))
                || edges(p).any(|(a, b)| edges(&g.water).any(|(c, d)| intersect(a, b, c, d)))))
}
