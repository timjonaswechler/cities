//! Subtractive V2 cleanup: one narrow end, then safe short-edge simplification.
use super::{
    BuildingIssue, BuildingProfile, BuildingRefinementProfile, DiscardedBuildingPart, geometry,
};
use crate::{Point, Polygon};
use geometry::{EPS, area, assess, edge_list, projection, simple};

const SCALE: f64 = 4.0;
const STABLE_DEPTH_M: f64 = 2.0;

pub(super) struct Refinement {
    pub polygon: Polygon,
    pub issues: Vec<BuildingIssue>,
    pub discarded: Vec<DiscardedBuildingPart>,
}
fn part(polygon: Polygon, reason: &str) -> DiscardedBuildingPart {
    DiscardedBuildingPart {
        area_m2: area(&polygon) * SCALE * SCALE,
        polygon,
        reason: reason.into(),
    }
}
fn distance(a: Point, b: Point) -> f64 {
    a.minus(b).length()
}

/// A single connected cross-section. Multiple intervals are not a usable width.
fn section(p: &[Point], axis: Point, bound: f64) -> Option<(Point, Point)> {
    let mut hits = vec![];
    for (a, b) in edge_list(p) {
        let (va, vb) = (projection(a, axis), projection(b, axis));
        if (va < bound) != (vb < bound) {
            let q = a.lerp(b, (bound - va) / (vb - va));
            if !hits.iter().any(|&h| distance(h, q) < EPS) {
                hits.push(q);
            }
        }
    }
    if hits.len() != 2 || !geometry::chord_inside(p, hits[0], hits[1]) {
        return None;
    }
    Some((hits[0], hits[1]))
}
fn trim_end(p: &[Point], axis: Point, profile: &BuildingProfile) -> Option<(Polygon, Polygon)> {
    let (lo, hi) = p
        .iter()
        .map(|&q| projection(q, axis))
        .fold((f64::INFINITY, f64::NEG_INFINITY), |(lo, hi), v| {
            (lo.min(v), hi.max(v))
        });
    let good = |t| {
        [0.0, STABLE_DEPTH_M / 2.0, STABLE_DEPTH_M].iter().all(|d| {
            section(p, axis, t + d / SCALE)
                .is_some_and(|(a, b)| distance(a, b) * SCALE + EPS >= profile.min_width_m)
        })
    };
    let mut previous = lo;
    let mut cut = None;
    for i in 1..=800 {
        let t = lo + (hi - lo) * i as f64 / 800.0;
        if good(t) {
            let (mut a, mut b) = (previous, t);
            for _ in 0..30 {
                let mid = (a + b) / 2.0;
                if good(mid) {
                    b = mid;
                } else {
                    a = mid;
                }
            }
            cut = Some(b);
            break;
        }
        previous = t;
    }
    let cut = cut?;
    // A normal corner broadens quickly; do not chamfer every polygon corner.
    if (cut - lo) * SCALE + EPS < profile.min_width_m {
        return None;
    }
    let kept = geometry::clip(p, axis, cut, false);
    let removed = geometry::clip(p, axis, cut, true);
    if !simple(&kept)
        || !simple(&removed)
        || !assess(&kept, profile).1.is_empty()
        || area(&removed) <= EPS
        || (area(p) - area(&kept) - area(&removed)).abs() > 1e-5
    {
        return None;
    }
    Some((kept, removed))
}
fn trim_tip(p: &[Point], profile: &BuildingProfile) -> Option<(Polygon, Polygon)> {
    // Infer the pictured direction from geometry, never a city/ward/building ID.
    // One longest-boundary axis, both ends, at most one cut: no repeated erosion.
    let (a, b) = edge_list(p)
        .into_iter()
        .max_by(|&(a, b), &(c, d)| distance(a, b).total_cmp(&distance(c, d)))?;
    if distance(a, b) <= EPS {
        return None;
    }
    let axis = geometry::axis(a, b);
    [axis, axis.scale(-1.0)]
        .into_iter()
        .filter_map(|axis| trim_end(p, axis, profile))
        .min_by(|a, b| area(&a.1).total_cmp(&area(&b.1)))
}
pub(super) fn short_edges(p: &[Point], min_m: f64) -> Vec<usize> {
    edge_list(p)
        .iter()
        .enumerate()
        .filter_map(|(i, &(a, b))| (distance(a, b) * SCALE + EPS < min_m).then_some(i))
        .collect()
}
fn simplify(p: &mut Polygon, profile: &BuildingProfile, min_m: f64) -> Vec<DiscardedBuildingPart> {
    let mut discarded = vec![];
    while p.len() > 3 {
        let shorts = short_edges(p, min_m);
        if shorts.is_empty() {
            break;
        }
        let mut best: Option<(Polygon, Polygon, f64)> = None;
        for i in 0..p.len() {
            if !shorts.iter().any(|&j| j == i || (j + 1) % p.len() == i) {
                continue;
            }
            let (a, b, c) = (p[(i + p.len() - 1) % p.len()], p[i], p[(i + 1) % p.len()]);
            let candidate: Polygon = p
                .iter()
                .enumerate()
                .filter_map(|(j, &q)| (j != i).then_some(q))
                .collect();
            let loss = area(p) - area(&candidate);
            if loss < -EPS
                || !simple(&candidate)
                || !assess(&candidate, profile).1.is_empty()
                || !geometry::chord_inside(p, a, c)
            {
                continue;
            }
            if best.as_ref().is_none_or(|(_, _, old)| loss < old - EPS) {
                best = Some((candidate, vec![a, b, c], loss));
            }
        }
        let Some((candidate, triangle, loss)) = best else {
            break;
        };
        if loss > EPS {
            discarded.push(part(
                triangle,
                "Short edge simplified without extending footprint",
            ));
        }
        *p = candidate;
    }
    discarded
}
pub(super) fn refine(
    p: &[Point],
    profile: &BuildingProfile,
    settings: &BuildingRefinementProfile,
) -> Refinement {
    let mut result = Refinement {
        polygon: p.to_vec(),
        issues: vec![],
        discarded: vec![],
    };
    if !simple(p) {
        return result;
    }
    if settings.trim_tips
        && let Some((kept, removed)) = trim_tip(p, profile)
    {
        result.polygon = kept;
        result.issues.push(BuildingIssue::NarrowAppendage);
        result
            .discarded
            .push(part(removed, "Long narrow end trimmed"));
    }
    let before = result.polygon.clone();
    result
        .discarded
        .extend(simplify(&mut result.polygon, profile, settings.min_edge_m));
    if before != result.polygon {
        result.issues.push(BuildingIssue::ShortEdge);
    }
    result
}

#[cfg(test)]
mod tests {
    use super::*;
    fn relaxed() -> BuildingProfile {
        BuildingProfile {
            min_area_m2: 1.0,
            min_width_m: 1.0,
            min_depth_m: 1.0,
            min_angle_degrees: 0.0,
            ..Default::default()
        }
    }
    #[test]
    fn exactly_two_metres_stays_and_short_collinear_edges_are_coalesced() {
        let square = vec![
            Point { x: 0., y: 0. },
            Point { x: 0.5, y: 0. },
            Point { x: 0.5, y: 0.5 },
            Point { x: 0., y: 0.5 },
        ];
        let mut p = square.clone();
        assert!(simplify(&mut p, &relaxed(), 2.0).is_empty());
        assert_eq!(p, square);
        p.insert(1, Point { x: 0.25, y: 0. });
        let old = area(&p);
        simplify(&mut p, &relaxed(), 2.0);
        assert_eq!(p, square);
        assert_eq!(old, area(&p));
    }
    #[test]
    fn short_concave_notch_is_not_filled() {
        // Both endpoints of this short edge are concave: removing either adds area.
        let mut p = vec![
            Point { x: 0., y: 0. },
            Point { x: 4., y: 0. },
            Point { x: 4., y: 4. },
            Point { x: 2.2, y: 4. },
            Point { x: 2.2, y: 2. },
            Point { x: 2., y: 2. },
            Point { x: 2., y: 4. },
            Point { x: 0., y: 4. },
        ];
        let original = p.clone();
        assert!(simplify(&mut p, &relaxed(), 2.0).is_empty());
        assert_eq!(p, original);
        assert_eq!(short_edges(&p, 2.0).len(), 1);
    }
    #[test]
    fn ordinary_rectangular_ends_and_large_l_and_u_shapes_are_not_trimmed() {
        for p in [
            vec![(0., 0.), (8., 0.), (8., 4.), (0., 4.)],
            vec![(0., 0.), (4., 0.), (4., 2.), (2., 2.), (2., 4.), (0., 4.)],
            vec![
                (0., 0.),
                (6., 0.),
                (6., 6.),
                (4., 6.),
                (4., 2.),
                (2., 2.),
                (2., 6.),
                (0., 6.),
            ],
        ] {
            let p: Polygon = p.into_iter().map(|(x, y)| Point { x, y }).collect();
            assert!(trim_tip(&p, &BuildingProfile::default()).is_none());
        }
    }
}
