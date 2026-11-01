use crate::{geometry::*, *};

struct Rng(u64);
impl Rng {
    fn unit(&mut self) -> f64 {
        self.0 = self.0.wrapping_add(0x9e3779b97f4a7c15);
        let mut z = self.0;
        z = (z ^ (z >> 30)).wrapping_mul(0xbf58476d1ce4e5b9);
        z = (z ^ (z >> 27)).wrapping_mul(0x94d049bb133111eb);
        ((z ^ (z >> 31)) >> 11) as f64 / ((1u64 << 53) as f64)
    }
    fn range(&mut self, r: [f64; 2]) -> f64 {
        r[0] + (r[1] - r[0]) * self.unit()
    }
}
fn invalid(reason: &str) -> Rejection {
    Rejection::InvalidInput(reason.into())
}
fn no_fit(reason: &str) -> Rejection {
    Rejection::NoFit(reason.into())
}
fn positive(v: f64) -> bool {
    v.is_finite() && v > 0. && v <= 1e4
}
fn validate(s: &Site, p: &ResolvedProfile) -> Result<(), Rejection> {
    if s.ground.len() != 4 || !convex(&s.ground) || !convex(&s.envelope) {
        return Err(invalid(
            "Ground must be a strict convex CCW quadrilateral; envelope a convex CCW polygon",
        ));
    }
    if !positive(s.max_height)
        || s.access
            .iter()
            .any(|a| !convex(&a.footprint) || !positive(a.clearance))
    {
        return Err(invalid(
            "Height and reserved-access polygons/clearances must be finite and positive",
        ));
    }
    if [p.length, p.depth, p.annex_width, p.annex_depth]
        .into_iter()
        .any(|r| !positive(r[0]) || !positive(r[1]) || r[0] > r[1])
        || !positive(p.wall_height)
        || !positive(p.roof_rise)
        || !positive(p.setback)
    {
        return Err(invalid(
            "Resolved profile requires finite positive ordered dimensions, heights and setback",
        ));
    }
    Ok(())
}
fn roof(foot: [Point; 4], wall: f64, rise: f64, axis: RidgeAxis) -> Roof {
    let q = roof_order(foot, axis);
    // Two equally pitched planes over the long eaves. Their bisector meets
    // each end wall locally; no common shear and no forced corner-angle pair.
    let distance = |a: Point, b: Point, p: Point| cross(a, b, p) / length(sub(b, a));
    let mid = |a: Point, b: Point| {
        let da = distance(q[3], q[0], a) - distance(q[1], q[2], a);
        let db = distance(q[3], q[0], b) - distance(q[1], q[2], b);
        lerp(a, b, da / (da - db))
    };
    let a = mid(q[0], q[1]);
    let b = mid(q[3], q[2]);
    let da = distance(q[3], q[0], a);
    let db = distance(q[3], q[0], b);
    let scale = rise / da.max(db);
    Roof {
        axis,
        ridge: [[a.x, wall + da * scale, a.z], [b.x, wall + db * scale, b.z]],
    }
}
pub(crate) fn roof_order(p: [Point; 4], axis: RidgeAxis) -> [Point; 4] {
    match axis {
        RidgeAxis::AlongFront => [p[1], p[2], p[3], p[0]],
        RidgeAxis::IntoSite => p,
    }
}
fn fits(part: &Part, s: &Site) -> bool {
    convex(&part.footprint)
        && area(&part.footprint) > 1.
        && part
            .footprint
            .iter()
            .all(|&p| inside(p, &s.ground) && inside(p, &s.envelope))
        && part.roof.ridge.iter().all(|r| {
            r.iter().all(|v| v.is_finite())
                && r[1] > part.wall_top
                && r[1] <= s.max_height + EPS
                && inside(Point { x: r[0], z: r[2] }, &part.footprint)
        })
        && !s
            .access
            .iter()
            .any(|a| part.base < a.clearance && overlap(&part.footprint, &a.footprint))
}

/// Generate a complete design or a reasoned rejection. No I/O or shared RNG.
/// Coordinates/heights are metres. Ground vertices start with the frontage.
pub fn generate(
    kind: BuildingType,
    s: &Site,
    p: &ResolvedProfile,
    seed: u64,
) -> Result<Design, Rejection> {
    validate(s, p)?;
    match kind {
        BuildingType::HouseWithAnnex => house(s, p, seed),
    }
}
fn house(s: &Site, p: &ResolvedProfile, seed: u64) -> Result<Design, Rejection> {
    let mut rng = Rng(seed);
    let origin = s.ground[0];
    let u = mul(
        sub(s.ground[1], origin),
        1. / length(sub(s.ground[1], origin)),
    );
    let v = Point { x: -u.z, z: u.x };
    let local = |q: Point| Point {
        x: dot(sub(q, origin), u),
        z: dot(sub(q, origin), v),
    };
    let world = |q: Point| add(origin, add(mul(u, q.x), mul(v, q.z)));
    let q: Vec<_> = s.ground.iter().copied().map(local).collect();
    if q[2].z <= EPS || q[3].z <= EPS {
        return Err(no_fit(
            "Rear corners must lie behind the frontage for this type",
        ));
    }
    let length = rng.range(p.length);
    let depth = rng.range(p.depth);
    let front = p.setback;
    let back = front + depth;
    // Sample the two *independent* local side limits at the front and rear.
    // Their tapered section is retained rather than repaired into a rectangle.
    let left = |y: f64| q[3].x * y / q[3].z + p.setback;
    let right = |y: f64| q[1].x + (q[2].x - q[1].x) * y / q[2].z - p.setback;
    let span = right(front) - left(front);
    if span < length {
        return Err(no_fit(
            "Frontage is too narrow for the resolved main-body dimensions",
        ));
    }
    let fraction = length / span;
    let start = (1. - fraction) * rng.range([0.25, 0.75]);
    let point = |y: f64, t: f64| {
        world(Point {
            x: left(y) + (right(y) - left(y)) * t,
            z: y,
        })
    };
    let foot = [
        point(front, start),
        point(front, start + fraction),
        point(back, start + fraction),
        point(back, start),
    ];
    let rear_length = crate::geometry::length(sub(foot[2], foot[3]));
    if rear_length < p.length[0] || rear_length > p.length[1] {
        return Err(no_fit(
            "Local taper puts the rear main-body length outside the resolved profile interval",
        ));
    }
    let main = Part {
        role: PartRole::Main,
        footprint: foot,
        base: 0.,
        wall_top: p.wall_height,
        roof: roof(foot, p.wall_height, p.roof_rise, RidgeAxis::AlongFront),
    };
    if !fits(&main, s) {
        return Err(no_fit(
            "Main body including roof violates ground, upper envelope, height or reserved access",
        ));
    }
    let mut design = Design {
        building_type: BuildingType::HouseWithAnnex,
        parts: vec![main],
        notes: vec![],
    };
    if p.annex == AnnexPolicy::Forbidden {
        return Ok(design);
    }
    let annex_result = (|| {
        if !s.annex_allowed {
            return Err(no_fit("Annex forbidden by the site's hard feature limit"));
        }
        let width = rng.range(p.annex_width);
        let depth = rng.range(p.annex_depth);
        let rear = crate::geometry::length(sub(foot[3], foot[2]));
        if width >= rear * 0.6 {
            return Err(no_fit(
                "Annex is too wide to remain subordinate to the main body",
            ));
        }
        let t = rng.range([0.10, 0.30]);
        if t + width / rear >= 0.95 {
            return Err(no_fit(
                "No wall interval remains for the required annex width",
            ));
        }
        let a = lerp(foot[2], foot[3], t);
        let b = lerp(foot[2], foot[3], t + width / rear);
        let edge = mul(sub(foot[3], foot[2]), 1. / rear);
        let out = Point {
            x: edge.z,
            z: -edge.x,
        };
        let annex_foot = [b, a, add(a, mul(out, depth)), add(b, mul(out, depth))];
        let wall = p.wall_height * 0.62;
        let annex = Part {
            role: PartRole::Annex,
            footprint: annex_foot,
            base: 0.,
            wall_top: wall,
            roof: roof(annex_foot, wall, p.roof_rise * 0.42, RidgeAxis::IntoSite),
        };
        if !fits(&annex, s)
            || overlap(&foot, &annex_foot)
            || area(&foot) <= area(&annex_foot) * 1.5
            || annex.roof.ridge.iter().any(|r| r[1] >= p.wall_height)
        {
            return Err(no_fit(
                "Annex including roof cannot fit with free access and a lower wall-bound roof connection",
            ));
        }
        Ok(annex)
    })();
    match annex_result {
        Ok(annex) => design.parts.push(annex),
        Err(e) if p.annex == AnnexPolicy::Optional => {
            design.notes.push(format!("Optional annex omitted: {e}"))
        }
        Err(e) => return Err(e),
    }
    Ok(design)
}
