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
mod house_with_annex;
mod townhouse_with_gate;

fn interval(r: [f64; 2]) -> bool {
    positive(r[0]) && positive(r[1]) && r[0] <= r[1]
}
fn validate_site(s: &Site) -> Result<(), Rejection> {
    if s.ground.len() != 4 || !convex(&s.ground) || !convex(&s.envelope) {
        return Err(invalid(
            "Ground must be a strict convex CCW quadrilateral; envelope a convex CCW polygon",
        ));
    }
    if !positive(s.max_height)
        || !s.max_overhang.is_finite()
        || s.max_overhang < 0.
        || s.max_overhang > 1e4
        || s.access
            .iter()
            .any(|a| !convex(&a.footprint) || !positive(a.clearance))
    {
        return Err(invalid(
            "Height, overhang limit and reserved access must be finite and valid",
        ));
    }
    Ok(())
}
fn validate_house(p: &HouseWithAnnexProfile) -> Result<(), Rejection> {
    if [p.length, p.depth, p.annex_width, p.annex_depth]
        .into_iter()
        .any(|r| !interval(r))
        || [p.wall_height, p.roof_rise, p.setback]
            .into_iter()
            .any(|v| !positive(v))
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

enum SectionSampling {
    Front,
    Both,
}
fn place(
    s: &Site,
    length_range: [f64; 2],
    depth_range: [f64; 2],
    setback: f64,
    reserve: f64,
    sampling: SectionSampling,
    rng: &mut Rng,
) -> Result<[Point; 4], Rejection> {
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
    let length = rng.range(length_range);
    let depth = rng.range(depth_range);
    let front = setback;
    let back = front + depth;
    // Sample the two *independent* local side limits at the front and rear.
    // Their tapered section is retained rather than repaired into a rectangle.
    let left = |y: f64| q[3].x * y / q[3].z + setback;
    let right = |y: f64| q[1].x + (q[2].x - q[1].x) * y / q[2].z - setback;
    let span = right(front) - left(front);
    let length = match sampling {
        SectionSampling::Front => length,
        SectionSampling::Both => {
            let ratio = (right(back) - left(back)) / span;
            let feasible = [
                length_range[0].max(length_range[0] / ratio),
                length_range[1].min(length_range[1] / ratio),
            ];
            if !ratio.is_finite() || ratio <= 0. || feasible[0] > feasible[1] {
                return Err(no_fit(
                    "No section length can satisfy both local front and rear limits",
                ));
            }
            let unit = if length_range[1] > length_range[0] {
                (length - length_range[0]) / (length_range[1] - length_range[0])
            } else {
                0.
            };
            feasible[0] + (feasible[1] - feasible[0]) * unit
        }
    };
    if span < length {
        return Err(no_fit(
            "Frontage is too narrow for the resolved main-body dimensions",
        ));
    }
    let fraction = (length + reserve) / span;
    if fraction > 1. {
        return Err(no_fit("Frontage cannot fit main body and side wing"));
    }
    let main_fraction = length / span;
    let lateral = rng.range([0.25, 0.75]);
    let start = (1. - fraction)
        * match sampling {
            SectionSampling::Front => lateral,
            SectionSampling::Both => 0.5,
        };
    let point = |y: f64, t: f64| {
        world(Point {
            x: left(y) + (right(y) - left(y)) * t,
            z: y,
        })
    };
    let foot = [
        point(front, start),
        point(front, start + main_fraction),
        point(back, start + main_fraction),
        point(back, start),
    ];
    let rear_length = crate::geometry::length(sub(foot[2], foot[3]));
    let tolerance = match sampling {
        SectionSampling::Front => 0., // Preserve the first type's exact replay contract.
        SectionSampling::Both => EPS,
    };
    if rear_length < length_range[0] - tolerance || rear_length > length_range[1] + tolerance {
        return Err(no_fit(
            "Local taper puts the rear main-body length outside the resolved profile interval",
        ));
    }
    Ok(foot)
}
fn fits(part: &Part, s: &Site) -> bool {
    if !convex(&part.footprint)
        || area(&part.footprint) <= 1.
        || !part.base.is_finite()
        || part.base < 0.
        || !part.wall_top.is_finite()
        || part.wall_top <= part.base
        || part.wall_top > s.max_height + EPS
        || !part.footprint.iter().all(|&p| inside(p, &s.envelope))
    {
        return false;
    }
    if let Some(r) = &part.roof {
        if !r.ridge.iter().all(|r| {
            r.iter().all(|v| v.is_finite())
                && r[1] > part.wall_top
                && r[1] <= s.max_height + EPS
                && inside(Point { x: r[0], z: r[2] }, &part.footprint)
        }) {
            return false;
        }
    }
    let cells = crate::solid::cells(part);
    cells.iter().all(|cell| {
        cell.footprint
            .iter()
            .zip(cell.bottom)
            .all(|(&p, y)| y > EPS || inside(p, &s.ground))
            && !s.access.iter().any(|a| {
                cell.bottom.iter().copied().fold(f64::INFINITY, f64::min) < a.clearance
                    && overlap(&cell.footprint, &a.footprint)
            })
    }) && !s.access.iter().any(|a| {
        part.roof.is_some() && a.clearance > part.wall_top && overlap(&part.footprint, &a.footprint)
    })
}

/// Generate a complete design or a reasoned rejection. No I/O or shared RNG.
/// Coordinates/heights are metres. Ground vertices start with the frontage.
pub fn generate(
    kind: BuildingType,
    s: &Site,
    p: &ResolvedProfile,
    seed: u64,
) -> Result<Design, Rejection> {
    validate_site(s)?;
    match (kind, p) {
        (BuildingType::HouseWithAnnex, ResolvedProfile::HouseWithAnnex(p)) => {
            validate_house(p)?;
            house_with_annex::generate(s, p, seed)
        }
        (BuildingType::TownhouseWithGate, ResolvedProfile::TownhouseWithGate(p)) => {
            townhouse_with_gate::generate(s, p, seed)
        }
        _ => Err(invalid("Building type and resolved profile do not match")),
    }
}
