use crate::Point;
pub(crate) const EPS: f64 = 1e-8;
pub(crate) fn add(a: Point, b: Point) -> Point {
    Point {
        x: a.x + b.x,
        z: a.z + b.z,
    }
}
pub(crate) fn sub(a: Point, b: Point) -> Point {
    Point {
        x: a.x - b.x,
        z: a.z - b.z,
    }
}
pub(crate) fn mul(a: Point, t: f64) -> Point {
    Point {
        x: a.x * t,
        z: a.z * t,
    }
}
pub(crate) fn dot(a: Point, b: Point) -> f64 {
    a.x * b.x + a.z * b.z
}
pub(crate) fn length(a: Point) -> f64 {
    a.x.hypot(a.z)
}
pub(crate) fn lerp(a: Point, b: Point, t: f64) -> Point {
    add(a, mul(sub(b, a), t))
}
pub(crate) fn cross(a: Point, b: Point, c: Point) -> f64 {
    let u = sub(b, a);
    let v = sub(c, a);
    u.x * v.z - u.z * v.x
}
pub(crate) fn area(p: &[Point]) -> f64 {
    (1..p.len() - 1)
        .map(|i| cross(p[0], p[i], p[i + 1]))
        .sum::<f64>()
        / 2.
}
pub(crate) fn inside(p: Point, ring: &[Point]) -> bool {
    (0..ring.len()).all(|i| cross(ring[i], ring[(i + 1) % ring.len()], p) >= -EPS)
}
pub(crate) fn convex(p: &[Point]) -> bool {
    (3..=64).contains(&p.len())
        && p.iter()
            .all(|p| p.x.is_finite() && p.z.is_finite() && p.x.abs() <= 1e6 && p.z.abs() <= 1e6)
        && (0..p.len()).all(|i| {
            (0..p.len())
                .filter(|&j| j != i && j != (i + 1) % p.len())
                .all(|j| cross(p[i], p[(i + 1) % p.len()], p[j]) > EPS)
        })
}
pub(crate) fn overlap(a: &[Point], b: &[Point]) -> bool {
    ![a, b].into_iter().any(|ring| {
        (0..ring.len()).any(|i| {
            let d = sub(ring[(i + 1) % ring.len()], ring[i]);
            let n = Point { x: -d.z, z: d.x };
            let range = |p: &[Point]| {
                p.iter()
                    .map(|&p| dot(p, n))
                    .fold((f64::INFINITY, f64::NEG_INFINITY), |(lo, hi), v| {
                        (lo.min(v), hi.max(v))
                    })
            };
            let (al, ah) = range(a);
            let (bl, bh) = range(b);
            ah <= bl + EPS || bh <= al + EPS
        })
    })
}
