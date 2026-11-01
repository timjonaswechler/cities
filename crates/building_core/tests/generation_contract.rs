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
    serde_json::from_str(include_str!("fixtures/generation-v1.json")).unwrap()
}
fn cross(a: Point, b: Point, c: Point) -> f64 {
    (b.x - a.x) * (c.z - a.z) - (b.z - a.z) * (c.x - a.x)
}
fn area(p: &[Point]) -> f64 {
    (0..p.len())
        .map(|i| p[i].x * p[(i + 1) % p.len()].z - p[i].z * p[(i + 1) % p.len()].x)
        .sum::<f64>()
        / 2.
}
fn inside(p: Point, ring: &[Point]) -> bool {
    (0..ring.len()).all(|i| cross(ring[i], ring[(i + 1) % ring.len()], p) >= -1e-7)
}
fn overlap(a: &[Point], b: &[Point]) -> bool {
    ![a, b].into_iter().any(|p| {
        (0..p.len()).any(|i| {
            let q = p[(i + 1) % p.len()];
            let n = (-(q.z - p[i].z), q.x - p[i].x);
            let range = |r: &[Point]| {
                r.iter()
                    .map(|v| v.x * n.0 + v.z * n.1)
                    .fold((f64::INFINITY, f64::NEG_INFINITY), |(lo, hi), v| {
                        (lo.min(v), hi.max(v))
                    })
            };
            let (al, ah) = range(a);
            let (bl, bh) = range(b);
            ah <= bl + 1e-7 || bh <= al + 1e-7
        })
    })
}
fn validate(d: &Design, s: &Site) {
    assert!(!d.parts.is_empty());
    for part in &d.parts {
        assert!(area(&part.footprint) > 1.);
        assert!(part.base >= 0. && part.wall_top > part.base);
        for i in 0..4 {
            assert!(
                cross(
                    part.footprint[i],
                    part.footprint[(i + 1) % 4],
                    part.footprint[(i + 2) % 4]
                ) > 1e-6
            );
        }
        for p in part.footprint {
            assert!(inside(p, &s.ground));
            assert!(inside(p, &s.envelope));
        }
        for access in &s.access {
            if part.base < access.clearance {
                assert!(
                    !overlap(&part.footprint, &access.footprint),
                    "occupied reserved access"
                );
            }
        }
        for r in part.roof.ridge {
            assert!(r.iter().all(|v| v.is_finite()));
            assert!(r[1] > part.wall_top && r[1] <= s.max_height + 1e-7);
            assert!(inside(Point { x: r[0], z: r[2] }, &part.footprint));
        }
    }
    let meshes = derive_meshes(d);
    assert!(!meshes.is_empty());
    for mesh in meshes {
        assert_eq!(mesh.positions.len(), mesh.normals.len());
        assert_eq!(mesh.indices.len() % 3, 0);
        assert!(!mesh.indices.is_empty());
        for p in &mesh.positions {
            assert!(p.iter().all(|v| v.is_finite()));
            assert!(p[1] >= 0. && p[1] <= s.max_height + 1e-7);
            assert!(inside(Point { x: p[0], z: p[2] }, &s.envelope));
        }
        for n in &mesh.normals {
            assert!((n.iter().map(|v| v * v).sum::<f64>() - 1.).abs() < 1e-7);
        }
        for t in mesh.indices.chunks_exact(3) {
            let a = mesh.positions[t[0] as usize];
            let b = mesh.positions[t[1] as usize];
            let c = mesh.positions[t[2] as usize];
            let u = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
            let v = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
            let n = [
                u[1] * v[2] - u[2] * v[1],
                u[2] * v[0] - u[0] * v[2],
                u[0] * v[1] - u[1] * v[0],
            ];
            assert!(n.iter().map(|v| v * v).sum::<f64>() > 1e-12);
            let stored = mesh.normals[t[0] as usize];
            assert!(n.iter().zip(stored).map(|(a, b)| a * b).sum::<f64>() > 0.);
        }
    }
    if d.parts.len() == 2 {
        let main = &d.parts[0];
        let annex = &d.parts[1];
        assert_eq!(main.role, PartRole::Main);
        assert_eq!(annex.role, PartRole::Annex);
        assert!(area(&main.footprint) > area(&annex.footprint) * 1.5);
        assert!(annex.roof.ridge.iter().all(|p| p[1] < main.wall_top));
        assert!(!overlap(&main.footprint, &annex.footprint));
        // The annex's whole base edge lies on the parent's rear wall, not just a point.
        for p in &annex.footprint[..2] {
            assert!(cross(main.footprint[2], main.footprint[3], *p).abs() < 1e-7);
            assert!(inside(*p, &main.footprint));
        }
        assert!(
            (annex.footprint[0].x - annex.footprint[1].x)
                .hypot(annex.footprint[0].z - annex.footprint[1].z)
                > 2.
        );
    }
}
#[test]
fn frozen_synthetic_contract() {
    let c = corpus();
    assert_eq!(c.version, 1);
    let mut failures = vec![];
    for case in &c.cases {
        let site = &c.sites[&case.site];
        let profile = &c.profiles[&case.profile];
        let result = generate(BuildingType::HouseWithAnnex, site, profile, case.seed);
        match (case.expect.as_str(), &result) {
            ("annex" | "main", Ok(d)) => {
                validate(d, site);
                assert_eq!(
                    d.parts.len(),
                    if case.expect == "annex" { 2 } else { 1 },
                    "{}",
                    case.id
                );
                assert_eq!(
                    result,
                    generate(BuildingType::HouseWithAnnex, site, profile, case.seed)
                );
                if d.parts.len() == 1 && profile.annex == AnnexPolicy::Optional {
                    assert!(!d.notes.is_empty());
                }
            }
            ("NoFit", Err(Rejection::NoFit(reason)))
            | ("InvalidInput", Err(Rejection::InvalidInput(reason))) => assert!(reason.len() > 8),
            _ => failures.push(format!(
                "{}: expected {}, got {:?}",
                case.id, case.expect, result
            )),
        }
    }
    assert!(failures.is_empty(), "{}", failures.join("\n"));
}
#[test]
fn real_variation_and_rigid_equivariance() {
    let c = corpus();
    let p = &c.profiles["standard"];
    let gen_at = |site: &str, profile: &ResolvedProfile, seed| {
        generate(BuildingType::HouseWithAnnex, &c.sites[site], profile, seed).unwrap()
    };
    let a = gen_at("rectangle", p, 7);
    let b = gen_at("rectangle", p, 91);
    let compact = gen_at("rectangle", &c.profiles["compact"], 7);
    let irregular = gen_at("irregular", p, 7);
    assert!((area(&a.parts[0].footprint) - area(&b.parts[0].footprint)).abs() > 1.);
    assert!((area(&a.parts[0].footprint) - area(&compact.parts[0].footprint)).abs() > 5.);
    let q = irregular.parts[0].footprint;
    let d0 = Point {
        x: q[1].x - q[0].x,
        z: q[1].z - q[0].z,
    };
    let d2 = Point {
        x: q[3].x - q[2].x,
        z: q[3].z - q[2].z,
    };
    let d1 = Point {
        x: q[2].x - q[1].x,
        z: q[2].z - q[1].z,
    };
    let d3 = Point {
        x: q[0].x - q[3].x,
        z: q[0].z - q[3].z,
    };
    assert!(
        (d0.x * d2.z - d0.z * d2.x).abs() > 0.01 || (d1.x * d3.z - d1.z * d3.x).abs() > 0.01,
        "not a globally sheared rectangle"
    );
    let rigid = gen_at("transformed", p, 7);
    let angle: f64 = 0.6457718232379019;
    for (a, b) in irregular.parts.iter().zip(&rigid.parts) {
        for (a, b) in a.footprint.iter().zip(&b.footprint) {
            assert!((43. + a.x * angle.cos() - a.z * angle.sin() - b.x).abs() < 1e-7);
            assert!((-27. + a.x * angle.sin() + a.z * angle.cos() - b.z).abs() < 1e-7);
        }
    }
    // Interleaved unrelated calls must not alter subsequent identical generation.
    assert_eq!(a, gen_at("rectangle", p, 7));
}
#[test]
fn rejects_non_finite_invalid_profiles_and_degenerate_sites() {
    let c = corpus();
    let s = &c.sites["rectangle"];
    let p = &c.profiles["standard"];
    for value in [f64::NAN, f64::INFINITY, f64::NEG_INFINITY] {
        let mut bad = s.clone();
        bad.ground[0].x = value;
        assert!(matches!(
            generate(BuildingType::HouseWithAnnex, &bad, p, 7),
            Err(Rejection::InvalidInput(_))
        ));
        let mut bad = p.clone();
        bad.roof_rise = value;
        assert!(matches!(
            generate(BuildingType::HouseWithAnnex, s, &bad, 7),
            Err(Rejection::InvalidInput(_))
        ));
    }
    let mut bad = s.clone();
    bad.ground[1] = bad.ground[0];
    assert!(matches!(
        generate(BuildingType::HouseWithAnnex, &bad, p, 7),
        Err(Rejection::InvalidInput(_))
    ));
    let mut bad = p.clone();
    bad.length = [12., 8.];
    assert!(matches!(
        generate(BuildingType::HouseWithAnnex, s, &bad, 7),
        Err(Rejection::InvalidInput(_))
    ));
}
