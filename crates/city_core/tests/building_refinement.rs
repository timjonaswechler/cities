use city_core::{
    BuildingDecisionKind, BuildingIssue, BuildingProfile, BuildingRefinementProfile, City, Point,
    Polygon, plan_buildings,
};
use serde_json::Value;

fn reference() -> Value {
    serde_json::from_str(include_str!("building-fixtures/accepted-refinement.json")).unwrap()
}
fn purplechurch() -> City {
    let export: Value =
        serde_json::from_str(include_str!("../../../exports/market-v1-city.json")).unwrap();
    serde_json::from_value(export["city"].clone()).unwrap()
}
fn matches(a: &[Point], b: &[Point]) -> bool {
    a.len() == b.len()
        && (0..b.len()).any(|offset| {
            [false, true].into_iter().any(|reverse| {
                a.iter().enumerate().all(|(i, p)| {
                    let q = b[if reverse {
                        (offset + b.len() - i) % b.len()
                    } else {
                        (offset + i) % b.len()
                    }];
                    (p.x - q.x).abs() < 1e-6 && (p.y - q.y).abs() < 1e-6
                })
            })
        })
}
#[test]
fn accepted_b_and_two_metre_cleanup_are_applied_without_a_manual_axis_or_building_id() {
    let city = purplechurch();
    let expected = reference();
    let original: Polygon = serde_json::from_value(expected["source"].clone()).unwrap();
    assert_eq!(
        city.wards.iter().find(|w| w.id == 21).unwrap().buildings[7].polygon,
        original
    );
    let untouched = serde_json::to_value(&city).unwrap();
    let plan = plan_buildings(&city, &BuildingProfile::default()).unwrap();
    assert_eq!(serde_json::to_value(&city).unwrap(), untouched);
    assert_eq!(
        serde_json::to_value(&plan).unwrap(),
        serde_json::to_value(plan_buildings(&city, &BuildingProfile::default()).unwrap()).unwrap()
    );
    let decision = plan
        .decisions
        .iter()
        .find(|d| d.source_id == "21:7")
        .unwrap();
    assert_eq!(decision.kind, BuildingDecisionKind::Refine);
    assert_eq!(
        decision.issues,
        vec![BuildingIssue::NarrowAppendage, BuildingIssue::ShortEdge]
    );
    assert!(decision.assignments.is_empty());
    let discarded: f64 = decision.discarded.iter().map(|p| p.area_m2).sum();
    assert!(
        (discarded
            - expected["b"]["removedM2"].as_f64().unwrap()
            - expected["clean"]["removedM2"].as_f64().unwrap())
        .abs()
            < 1e-5
    );
    let origin = plan
        .building_origins
        .iter()
        .find(|o| o.ward_id == 21 && o.original_building_index == 7)
        .unwrap();
    let actual = &plan
        .city
        .wards
        .iter()
        .find(|w| w.id == 21)
        .unwrap()
        .buildings[origin.building_index]
        .polygon;
    let target: Polygon = serde_json::from_value(expected["clean"]["polygon"].clone()).unwrap();
    assert!(
        matches(actual, &target),
        "accepted five-corner footprint must replace the pictured form: {actual:?}"
    );
    assert_eq!(decision.polygon.as_ref().unwrap(), actual);
    let mut planned = serde_json::to_value(&plan.city).unwrap();
    let mut input = untouched;
    for value in [&mut planned, &mut input] {
        for ward in value["wards"].as_array_mut().unwrap() {
            ward.as_object_mut().unwrap().remove("buildings");
        }
    }
    assert_eq!(planned, input, "only buildings may change");
    assert!(
        actual
            .iter()
            .zip(actual.iter().cycle().skip(1))
            .take(actual.len())
            .all(|(a, b)| a.minus(*b).length() * 4.0 >= 2.0 - 1e-7)
    );
}

#[test]
fn profile_v2_is_default_and_v1_and_b_only_stay_replayable() {
    let profile: BuildingProfile = serde_json::from_str(include_str!(
        "../../../assets/building-profiles/buildings-v2.json"
    ))
    .unwrap();
    assert_eq!(profile, BuildingProfile::default());
    let city = purplechurch();
    let expected = reference();
    let legacy: BuildingProfile = serde_json::from_str(include_str!(
        "../../../assets/building-profiles/buildings-v1.json"
    ))
    .unwrap();
    for (profile, key) in [
        (legacy, "source"),
        (
            BuildingProfile {
                refinement: Some(BuildingRefinementProfile {
                    min_edge_m: 0.0,
                    ..Default::default()
                }),
                ..Default::default()
            },
            "b",
        ),
    ] {
        let plan = plan_buildings(&city, &profile).unwrap();
        let origin = plan
            .building_origins
            .iter()
            .find(|o| o.ward_id == 21 && o.original_building_index == 7)
            .unwrap();
        let p = &plan
            .city
            .wards
            .iter()
            .find(|w| w.id == 21)
            .unwrap()
            .buildings[origin.building_index]
            .polygon;
        let target: Polygon = serde_json::from_value(if key == "source" {
            expected[key].clone()
        } else {
            expected[key]["polygon"].clone()
        })
        .unwrap();
        assert!(matches(p, &target));
    }
    for invalid in [
        BuildingProfile {
            version: 1,
            ..Default::default()
        },
        BuildingProfile {
            refinement: None,
            ..Default::default()
        },
        BuildingProfile {
            refinement: Some(BuildingRefinementProfile {
                min_edge_m: -1.0,
                ..Default::default()
            }),
            ..Default::default()
        },
        BuildingProfile {
            refinement: Some(BuildingRefinementProfile {
                min_edge_m: f64::NAN,
                ..Default::default()
            }),
            ..Default::default()
        },
    ] {
        assert!(invalid.validate().is_err());
    }
}

#[test]
fn unsafe_short_concave_edge_is_retained_and_reported_instead_of_filled() {
    let mut city = purplechurch();
    let mut ward = city.wards.iter().find(|w| w.id == 21).unwrap().clone();
    let mut building = ward.buildings[7].clone();
    building.polygon = vec![
        (0., 0.),
        (4., 0.),
        (4., 4.),
        (2.2, 4.),
        (2.2, 2.),
        (2., 2.),
        (2., 4.),
        (0., 4.),
    ]
    .into_iter()
    .map(|(x, y)| Point { x, y })
    .collect();
    ward.buildings = vec![building];
    city.wards = vec![ward];
    let profile = BuildingProfile {
        refinement: Some(BuildingRefinementProfile {
            trim_tips: false,
            ..Default::default()
        }),
        ..Default::default()
    };
    let plan = plan_buildings(&city, &profile).unwrap();
    assert_eq!(
        serde_json::to_value(&plan.city).unwrap(),
        serde_json::to_value(&city).unwrap()
    );
    assert_eq!(plan.summary.remaining_short_edges, 1);
    assert_eq!(plan.summary.refined_buildings, 0);
    assert_eq!(plan.summary.omitted_buildings, 0);
}

#[test]
fn refinement_is_rotation_translation_and_index_independent_and_skips_special_buildings() {
    let expected = reference();
    let source: Polygon = serde_json::from_value(expected["source"].clone()).unwrap();
    let target: Polygon = serde_json::from_value(expected["clean"]["polygon"].clone()).unwrap();
    let transform = |p: Point| {
        let (s, c) = 0.73_f64.sin_cos();
        Point {
            x: p.x * c - p.y * s - 141.0,
            y: p.x * s + p.y * c + 117.0,
        }
    };
    for reverse in [false, true] {
        let mut city = purplechurch();
        let mut ward = city.wards.iter().find(|w| w.id == 21).unwrap().clone();
        let mut building = ward.buildings[7].clone();
        building.polygon = source.iter().copied().map(transform).collect();
        if reverse {
            building.polygon.reverse();
        }
        ward.id = 903;
        ward.buildings = vec![building];
        city.wards = vec![ward];
        let plan = plan_buildings(&city, &BuildingProfile::default()).unwrap();
        assert!(matches(
            &plan.city.wards[0].buildings[0].polygon,
            &target.iter().copied().map(transform).collect::<Polygon>()
        ));
        assert_eq!(plan.decisions[0].source_id, "903:0");
        for special_role in [false, true] {
            let mut protected = city.clone();
            if special_role {
                protected.wards[0].buildings[0].role = "temple".into();
            } else {
                protected.wards[0].buildings[0].landmark = true;
            }
            let plan = plan_buildings(&protected, &BuildingProfile::default()).unwrap();
            assert_eq!(
                serde_json::to_value(&plan.city).unwrap(),
                serde_json::to_value(&protected).unwrap()
            );
        }
    }
}
