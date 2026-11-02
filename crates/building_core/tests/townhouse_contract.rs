use building_core::*;
use serde::Deserialize;
use std::collections::BTreeMap;

#[derive(Deserialize)]
struct Corpus {
    version: u32,
    profiles: BTreeMap<String, ResolvedProfile>,
    sites: BTreeMap<String, Site>,
    cases: Vec<Case>,
}
#[derive(Deserialize)]
struct Case {
    id: String,
    site: String,
    profile: String,
    seed: u64,
    expect: String,
}
fn corpus() -> Corpus {
    serde_json::from_str(include_str!("fixtures/townhouse-v1.json")).unwrap()
}
fn mix(a: Point, b: Point, t: f64) -> Point {
    Point {
        x: a.x + (b.x - a.x) * t,
        z: a.z + (b.z - a.z) * t,
    }
}
fn cross(a: Point, b: Point, c: Point) -> f64 {
    (b.x - a.x) * (c.z - a.z) - (b.z - a.z) * (c.x - a.x)
}
fn inside(p: Point, ring: &[Point]) -> bool {
    (0..ring.len()).all(|i| cross(ring[i], ring[(i + 1) % ring.len()], p) >= -1e-7)
}
// Independent triangle/prism clipping, not generator flags or material colours.
// Positive interior intersection counts; touching the permitted prism boundary does not.
fn triangle_hits(tri: &[[f64; 3]], ring: &[Point], height: f64) -> bool {
    let mut poly = tri.to_vec();
    let mut planes: Vec<[f64; 4]> = (0..ring.len())
        .map(|i| {
            let a = ring[i];
            let b = ring[(i + 1) % ring.len()];
            [
                a.z - b.z,
                0.,
                b.x - a.x,
                (b.z - a.z) * a.x - (b.x - a.x) * a.z - 1e-6,
            ]
        })
        .collect();
    planes.extend([[0., 1., 0., -1e-6], [0., -1., 0., height - 1e-6]]);
    for p in planes {
        let distance = |a: [f64; 3]| p[0] * a[0] + p[1] * a[1] + p[2] * a[2] + p[3];
        let mut out = vec![];
        for i in 0..poly.len() {
            let a = poly[i];
            let b = poly[(i + 1) % poly.len()];
            let da = distance(a);
            let db = distance(b);
            if da >= 0. {
                out.push(a);
            }
            if (da >= 0.) != (db >= 0.) {
                let t = da / (da - db);
                out.push(std::array::from_fn(|j| a[j] + (b[j] - a[j]) * t));
            }
        }
        poly = out;
        if poly.is_empty() {
            return false;
        }
    }
    true
}
fn mesh_clear(meshes: &[SurfaceMesh], ring: &[Point], height: f64) -> bool {
    meshes.iter().all(|m| {
        m.indices.chunks_exact(3).all(|t| {
            !triangle_hits(
                &t.iter()
                    .map(|&i| m.positions[i as usize])
                    .collect::<Vec<_>>(),
                ring,
                height,
            )
        })
    })
}
fn gate_corridor(d: &Design) -> [Point; 4] {
    let p = d
        .parts
        .iter()
        .find(|p| p.role == PartRole::Gate)
        .unwrap()
        .footprint;
    // Middle half of the actual portal, extending through both outer faces.
    let a = mix(p[0], p[1], 0.25);
    let b = mix(p[0], p[1], 0.75);
    let c = mix(p[3], p[2], 0.75);
    let e = mix(p[3], p[2], 0.25);
    [
        mix(e, a, 1.1),
        mix(c, b, 1.1),
        mix(b, c, 1.1),
        mix(a, e, 1.1),
    ]
}
fn validate(d: &Design, s: &Site) {
    assert_eq!(d.building_type, BuildingType::TownhouseWithGate);
    let low = d
        .parts
        .iter()
        .find(|p| p.role == PartRole::LowerStorey)
        .unwrap();
    let high = d
        .parts
        .iter()
        .find(|p| p.role == PartRole::UpperStorey)
        .unwrap();
    assert_eq!(low.base, 0.);
    assert_eq!(high.base, low.wall_top);
    assert!(high.wall_top > high.base);
    assert!(high.footprint.iter().any(|p| inside(*p, &low.footprint)));
    let meshes = derive_meshes(d);
    for m in &meshes {
        assert_eq!(m.positions.len(), m.normals.len());
        assert!(!m.indices.is_empty());
        for p in &m.positions {
            assert!(p.iter().all(|v| v.is_finite()));
            assert!(p[1] >= 0. && p[1] <= s.max_height + 1e-7);
            assert!(inside(Point { x: p[0], z: p[2] }, &s.envelope));
            if p[1] < 1e-7 {
                assert!(inside(Point { x: p[0], z: p[2] }, &s.ground));
            }
        }
        for t in m.indices.chunks_exact(3) {
            let [a, b, c] = [
                m.positions[t[0] as usize],
                m.positions[t[1] as usize],
                m.positions[t[2] as usize],
            ];
            let u = std::array::from_fn::<_, 3, _>(|i| b[i] - a[i]);
            let v = std::array::from_fn::<_, 3, _>(|i| c[i] - a[i]);
            let n = [
                u[1] * v[2] - u[2] * v[1],
                u[2] * v[0] - u[0] * v[2],
                u[0] * v[1] - u[1] * v[0],
            ];
            assert!(n.iter().map(|v| v * v).sum::<f64>() > 1e-12);
            assert!(
                n.iter()
                    .zip(m.normals[t[0] as usize])
                    .map(|(a, b)| a * b)
                    .sum::<f64>()
                    > 0.
            );
        }
        for n in &m.normals {
            assert!((n.iter().map(|v| v * v).sum::<f64>() - 1.).abs() < 1e-7);
        }
    }
    let corridor = gate_corridor(d);
    assert!(
        mesh_clear(&meshes, &corridor, 2.),
        "portal is geometrically blocked"
    );
    // The same geometric query must detect a deliberate, unlabelled obstruction.
    let mut blocked = meshes.clone();
    let a = corridor[0];
    let b = corridor[1];
    let c = corridor[2];
    let e = corridor[3];
    let l = mix(a, e, 0.5);
    let r = mix(b, c, 0.5);
    blocked[0].positions.extend([
        [l.x, 0., l.z],
        [r.x, 0., r.z],
        [r.x, 2.5, r.z],
        [l.x, 2.5, l.z],
    ]);
    let i = blocked[0].positions.len() as u32 - 4;
    blocked[0]
        .indices
        .extend([i, i + 1, i + 2, i, i + 2, i + 3]);
    assert!(
        !mesh_clear(&blocked, &corridor, 2.),
        "counterprobe missed a real barrier"
    );
    assert!(
        !mesh_clear(&meshes, &corridor, 4.7),
        "headroom probe must hit arch/lintel"
    );
    for a in &s.access {
        assert!(mesh_clear(&meshes, &a.footprint, a.clearance));
    }
}
#[test]
fn frozen_townhouse_contract() {
    let c = corpus();
    assert_eq!(c.version, 1);
    let kind = REGISTRY
        .iter()
        .find(|(_, id)| *id == "townhouse-with-gate")
        .unwrap()
        .0;
    let mut failures = vec![];
    for case in &c.cases {
        let s = &c.sites[&case.site];
        let p = &c.profiles[&case.profile];
        let result = generate(kind, s, p, case.seed);
        assert_eq!(
            result,
            generate(kind, s, p, case.seed),
            "repeat {}",
            case.id
        );
        match (&*case.expect, &result) {
            ("ok", Ok(d)) => validate(d, s),
            ("NoFit", Err(Rejection::NoFit(reason))) => assert!(reason.len() > 8),
            _ => failures.push(format!(
                "{} expected {}, got {:?}",
                case.id, case.expect, result
            )),
        }
    }
    assert!(failures.is_empty(), "{}", failures.join("\n"));
}
#[test]
fn independent_headroom_and_parameter_checks() {
    let c = corpus();
    let p = &c.profiles["town_access_profile"];
    let mut s = c.sites["town_access"].clone();
    let d = generate(BuildingType::TownhouseWithGate, &s, p, 7).unwrap();
    validate(&d, &s);
    s.access[0].clearance = 4.7;
    assert!(matches!(
        generate(BuildingType::TownhouseWithGate, &s, p, 7),
        Err(Rejection::NoFit(_))
    ));
    for value in [f64::NAN, -1., 1.1] {
        let mut p = c.profiles["town_standard"].clone();
        let ResolvedProfile::TownhouseWithGate(ref mut t) = p else {
            panic!()
        };
        t.overhang = [value, value];
        assert!(matches!(
            generate(
                BuildingType::TownhouseWithGate,
                &c.sites["town_rectangle"],
                &p,
                7
            ),
            Err(Rejection::InvalidInput(_))
        ));
    }
}
#[test]
fn variants_and_frontage_frame() {
    let c = corpus();
    let make = |s: &str, p: &str, seed| {
        generate(
            BuildingType::TownhouseWithGate,
            &c.sites[s],
            &c.profiles[p],
            seed,
        )
        .unwrap()
    };
    let a = make("town_rectangle", "town_standard", 7);
    let b = make("town_rectangle", "town_standard", 91);
    let compact = make("town_rectangle", "town_compact", 7);
    assert_ne!(a.parts[0].footprint, b.parts[0].footprint);
    let width = |d: &Design| (d.parts[0].footprint[1].x - d.parts[0].footprint[0].x).abs();
    assert!(width(&a) > width(&compact) + 0.4);
    let rotated = make("town_rotated", "town_standard", 7);
    for (a, b) in a.parts.iter().zip(&rotated.parts) {
        for (a, b) in a.footprint.iter().zip(b.footprint) {
            assert!((23. - a.z - b.x).abs() < 1e-7);
            assert!((-17. + a.x - b.z).abs() < 1e-7);
        }
    }
}
