//! Opt-in, conservative original-contour test sites. Not a property/land-use model.
use building_core::{Design, ResolvedProfile, Site, SurfaceMesh};
use city_core::City;
use serde::{Deserialize, Serialize};

pub const METRES_PER_MAP_UNIT: f64 = 4.;
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct Preference {
    pub weight: u32,
    pub profile: ResolvedProfile,
}
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct LotChoice {
    pub ward_id: usize,
    pub building_index: usize,
    pub max_height: f64,
    pub annex_allowed: bool,
    pub max_overhang: f64,
    pub seed: u64,
    pub preferences: Vec<Preference>,
}
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct Config {
    pub lots: Vec<LotChoice>,
}
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct Request {
    pub site: Site,
    pub profile: ResolvedProfile,
    pub seed: u64,
}
impl Request {
    pub fn generate(&self) -> Result<Design, building_core::Rejection> {
        building_core::generate(
            self.profile.building_type(),
            &self.site,
            &self.profile,
            self.seed,
        )
    }
}
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct Placement {
    pub ward_id: usize,
    pub building_index: usize,
    pub attempts: Vec<String>,
    pub request: Option<Request>,
    pub design: Option<Design>,
    pub meshes: Vec<SurfaceMesh>,
}
type P = building_core::Point;
fn metres(p: city_core::Point) -> P {
    P {
        x: p.x * METRES_PER_MAP_UNIT,
        z: p.y * METRES_PER_MAP_UNIT,
    }
}
fn cross(a: P, b: P, c: P) -> f64 {
    (b.x - a.x) * (c.z - a.z) - (b.z - a.z) * (c.x - a.x)
}
fn area(p: &[P]) -> f64 {
    (0..p.len())
        .map(|i| p[i].x * p[(i + 1) % p.len()].z - p[(i + 1) % p.len()].x * p[i].z)
        .sum::<f64>()
        / 2.
}
fn segment_distance(p: P, a: P, b: P) -> f64 {
    let dx = b.x - a.x;
    let dz = b.z - a.z;
    let t = (((p.x - a.x) * dx + (p.z - a.z) * dz) / (dx * dx + dz * dz).max(1e-20)).clamp(0., 1.);
    (p.x - a.x - t * dx).hypot(p.z - a.z - t * dz)
}
fn midpoint(a: P, b: P) -> P {
    P {
        x: (a.x + b.x) / 2.,
        z: (a.z + b.z) / 2.,
    }
}
fn inside(p: P, ring: &[P]) -> bool {
    if ring
        .iter()
        .enumerate()
        .any(|(i, &a)| segment_distance(p, a, ring[(i + 1) % ring.len()]) < 1e-7)
    {
        return false;
    }
    let mut hit = false;
    for (i, &a) in ring.iter().enumerate() {
        let b = ring[(i + 1) % ring.len()];
        if (a.z > p.z) != (b.z > p.z) && p.x < (b.x - a.x) * (p.z - a.z) / (b.z - a.z) + a.x {
            hit = !hit;
        }
    }
    hit
}
fn overlaps(a: &[P], b: &[P]) -> bool {
    for (i, &p) in a.iter().enumerate() {
        let q = a[(i + 1) % a.len()];
        if inside(p, b) || inside(midpoint(p, q), b) {
            return true;
        }
        for (j, &r) in b.iter().enumerate() {
            let s = b[(j + 1) % b.len()];
            let opposite = |x: f64, y: f64| (x > 1e-7 && y < -1e-7) || (y > 1e-7 && x < -1e-7);
            if opposite(cross(p, q, r), cross(p, q, s)) && opposite(cross(r, s, p), cross(r, s, q))
            {
                return true;
            }
        }
    }
    b.iter()
        .enumerate()
        .any(|(i, &p)| inside(p, a) || inside(midpoint(p, b[(i + 1) % b.len()]), a))
        || inside(
            P {
                x: a.iter().map(|p| p.x).sum::<f64>() / a.len() as f64,
                z: a.iter().map(|p| p.z).sum::<f64>() / a.len() as f64,
            },
            b,
        )
}
fn corridor(a: P, b: P, width: f64) -> Option<Vec<P>> {
    let len = (b.x - a.x).hypot(b.z - a.z);
    if len < 1e-7 {
        return None;
    }
    let dx = -(b.z - a.z) / len * width / 2.;
    let dz = (b.x - a.x) / len * width / 2.;
    Some(vec![
        P {
            x: a.x + dx,
            z: a.z + dz,
        },
        P {
            x: a.x - dx,
            z: a.z - dz,
        },
        P {
            x: b.x - dx,
            z: b.z - dz,
        },
        P {
            x: b.x + dx,
            z: b.z + dz,
        },
    ])
}
pub fn resolve_site(city: &City, choice: &LotChoice) -> Result<Site, String> {
    let ward = city
        .wards
        .iter()
        .find(|w| w.id == choice.ward_id)
        .ok_or("unknown ward")?;
    let building = ward
        .buildings
        .get(choice.building_index)
        .ok_or("unknown building")?;
    if building.landmark || building.role != "lot" || ward.kind != "residential" {
        return Err("protected/nonordinary building: original retained".into());
    }
    if building.polygon.len() != 4 {
        return Err("requires strict convex quadrilateral; original retained, no repair".into());
    }
    let mut ground: Vec<_> = building.polygon.iter().copied().map(metres).collect();
    if ground.iter().any(|p| !p.x.is_finite() || !p.z.is_finite()) {
        return Err("nonfinite contour".into());
    }
    if area(&ground) < 0. {
        ground.reverse();
    }
    if (0..4).any(|i| cross(ground[i], ground[(i + 1) % 4], ground[(i + 2) % 4]) <= 1e-7) {
        return Err("requires strict convex quadrilateral; original retained, no repair".into());
    }
    for w in &city.wards {
        for (i, b) in w.buildings.iter().enumerate() {
            if w.id == choice.ward_id && i == choice.building_index {
                continue;
            }
            let other: Vec<_> = b.polygon.iter().copied().map(metres).collect();
            if other.len() >= 3 && overlaps(&ground, &other) {
                return Err(format!(
                    "original contour overlaps existing building {}:{i}; original retained",
                    w.id
                ));
            }
        }
    }
    for obstacle in std::iter::once(&city.coast).chain(city.original_geometry.tree_crowns.iter()) {
        let ring: Vec<_> = obstacle.iter().copied().map(metres).collect();
        if ring.len() >= 3 && overlaps(&ground, &ring) {
            return Err("test contour overlaps water/tree geometry; original retained".into());
        }
    }
    let roads: Vec<_> = city
        .original_geometry
        .roads
        .iter()
        .flat_map(|r| r.path.windows(2))
        .map(|p| (metres(p[0]), metres(p[1])))
        .collect();
    if roads.is_empty() {
        return Err("no road reference for frontage orientation".into());
    }
    let front = (0..4)
        .min_by(|&i, &j| {
            let distance = |k: usize| {
                roads
                    .iter()
                    .map(|&(a, b)| segment_distance(midpoint(ground[k], ground[(k + 1) % 4]), a, b))
                    .fold(f64::INFINITY, f64::min)
            };
            distance(i).total_cmp(&distance(j))
        })
        .unwrap();
    ground.rotate_left(front);
    let mut access = vec![];
    // Same road width as native mesh::spawn_city: two map units = eight metres.
    let mut reserve = |a, b, width| {
        if let Some(footprint) = corridor(a, b, width) {
            access.push(building_core::ReservedAccess {
                footprint,
                clearance: choice.max_height,
            });
        }
    };
    for &(a, b) in &roads {
        reserve(a, b, 2. * METRES_PER_MAP_UNIT);
    }
    for alley in &city.original_geometry.alleys {
        for p in alley.windows(2) {
            reserve(metres(p[0]), metres(p[1]), 1.);
        }
    }
    for river in &city.original_geometry.rivers {
        for p in river.path.windows(2) {
            reserve(
                metres(p[0]),
                metres(p[1]),
                river.width * METRES_PER_MAP_UNIT,
            );
        }
    }
    for wall in &city.original_geometry.walls {
        for segment in &wall.segments {
            for p in segment.windows(2) {
                reserve(
                    metres(p[0]),
                    metres(p[1]),
                    wall.thickness * METRES_PER_MAP_UNIT,
                );
            }
        }
        for (point, radius) in wall.towers.iter().map(|p| (*p, wall.tower_radius)).chain(
            wall.gates
                .iter()
                .flatten()
                .map(|p| (*p, wall.tower_radius * 0.8)),
        ) {
            let p = metres(point);
            let r = radius * METRES_PER_MAP_UNIT;
            reserve(P { x: p.x - r, z: p.z }, P { x: p.x + r, z: p.z }, 2. * r);
        }
    }
    Ok(Site {
        envelope: ground.clone(),
        ground,
        max_height: choice.max_height,
        annex_allowed: choice.annex_allowed,
        max_overhang: choice.max_overhang,
        access,
    })
}
fn empty(choice: &LotChoice) -> Placement {
    Placement {
        ward_id: choice.ward_id,
        building_index: choice.building_index,
        attempts: vec![],
        request: None,
        design: None,
        meshes: vec![],
    }
}
pub fn select(site: &Site, choice: &LotChoice) -> Placement {
    let mut out = empty(choice);
    let mut preferences: Vec<_> = choice.preferences.iter().filter(|p| p.weight > 0).collect();
    preferences.sort_by_key(|p| std::cmp::Reverse(p.weight));
    for p in preferences {
        let request = Request {
            site: site.clone(),
            profile: p.profile.clone(),
            seed: choice.seed,
        };
        match request.generate() {
            Ok(design) => {
                out.attempts.push(format!(
                    "{:?}: accepted (weight {})",
                    p.profile.building_type(),
                    p.weight
                ));
                out.meshes = building_core::derive_meshes(&design);
                out.design = Some(design);
                out.request = Some(request);
                break;
            }
            Err(reason) => out
                .attempts
                .push(format!("{:?}: {reason}", p.profile.building_type())),
        }
    }
    if out.attempts.is_empty() {
        out.attempts
            .push("no positive preference; original retained".into());
    }
    out
}
pub fn plan(city: &City, config: &Config) -> Result<Vec<Placement>, String> {
    if config.lots.len() > 8 {
        return Err("prototype supports at most eight explicit candidates".into());
    }
    let mut ids = std::collections::BTreeSet::new();
    for c in &config.lots {
        if !ids.insert((c.ward_id, c.building_index)) {
            return Err("duplicate candidate".into());
        }
        if !c.max_height.is_finite()
            || c.max_height <= 0.
            || !c.max_overhang.is_finite()
            || c.max_overhang < 0.
        {
            return Err("invalid hard site limits".into());
        }
    }
    Ok(config
        .lots
        .iter()
        .map(|choice| match resolve_site(city, choice) {
            Ok(site) => select(&site, choice),
            Err(reason) => {
                let mut out = empty(choice);
                out.attempts.push(reason);
                out
            }
        })
        .collect())
}
