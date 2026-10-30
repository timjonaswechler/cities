use city_core::{
    Building, BuildingDecisionKind, BuildingProfile, City, Point, Polygon, Road, Ward,
    generate_city, plan_buildings,
};
use serde_json::Value;

fn stormwind() -> City {
    serde_json::from_str(include_str!("building-fixtures/stormwind.json")).unwrap()
}
fn area(p: &[Point]) -> f64 {
    p.iter()
        .zip(p.iter().cycle().skip(1))
        .take(p.len())
        .map(|(a, b)| a.x * b.y - a.y * b.x)
        .sum::<f64>()
        .abs()
        * 8.0
}
fn polygon_matches(a: &[Point], b: &[Point]) -> bool {
    a.len() == b.len()
        && (0..b.len()).any(|start| {
            [false, true].into_iter().any(|reverse| {
                a.iter().enumerate().all(|(i, p)| {
                    let q = b[if reverse {
                        (start + b.len() - i) % b.len()
                    } else {
                        (start + i) % b.len()
                    }];
                    (p.x - q.x).abs() < 1e-6 && (p.y - q.y).abs() < 1e-6
                })
            })
        })
}
#[test]
fn accepted_strip_is_split_sideways_instead_of_becoming_an_arm() {
    let city = stormwind();
    let original = serde_json::to_value(&city).unwrap();
    let plan = plan_buildings(&city, &BuildingProfile::default()).unwrap();
    let decision = plan
        .decisions
        .iter()
        .find(|d| d.source_id == "2:66")
        .expect("strip must be planned");
    assert_eq!(decision.kind, BuildingDecisionKind::SideSplit);
    let mut targets = decision
        .assignments
        .iter()
        .map(|a| a.target_id.as_str())
        .collect::<Vec<_>>();
    targets.sort();
    assert_eq!(targets, vec!["2:67", "2:68"]);
    assert!(
        !targets.contains(&"2:69"),
        "do not repeat the rejected end-wall join"
    );
    assert!(
        (decision.discarded.iter().map(|p| p.area_m2).sum::<f64>() - 27.281659529921512).abs()
            < 1e-5
    );
    assert_eq!(serde_json::to_value(&city).unwrap(), original);
    assert_eq!(plan.city.building_count(), 365);
    assert_eq!(plan.summary.original_buildings, 368);
    assert!(
        (plan.summary.original_footprint_m2
            - plan.summary.planned_footprint_m2
            - plan.summary.discarded_footprint_m2)
            .abs()
            < 1e-5
    );
    assert_eq!(
        serde_json::to_value(&plan).unwrap(),
        serde_json::to_value(plan_buildings(&city, &BuildingProfile::default()).unwrap()).unwrap()
    );
    assert_eq!(plan.building_origins.len(), plan.city.building_count());
    let mut seen = std::collections::BTreeSet::new();
    for origin in &plan.building_origins {
        assert!(seen.insert((origin.ward_id, origin.building_index)));
        let output = plan
            .city
            .wards
            .iter()
            .find(|w| w.id == origin.ward_id)
            .unwrap();
        let input = city.wards.iter().find(|w| w.id == origin.ward_id).unwrap();
        let id = format!("{}:{}", origin.ward_id, origin.original_building_index);
        if !plan
            .decisions
            .iter()
            .flat_map(|d| &d.assignments)
            .any(|a| a.target_id == id)
        {
            assert_eq!(
                serde_json::to_value(&output.buildings[origin.building_index]).unwrap(),
                serde_json::to_value(&input.buildings[origin.original_building_index]).unwrap()
            );
        }
    }
    let mut planned = serde_json::to_value(&plan.city).unwrap();
    let mut input = original;
    for value in [&mut planned, &mut input] {
        for ward in value["wards"].as_array_mut().unwrap() {
            ward.as_object_mut().unwrap().remove("buildings");
        }
    }
    assert_eq!(
        planned, input,
        "no roads, water, walls, wards or options may change"
    );
}
#[test]
fn rust_matches_all_nine_accepted_draft_cases() {
    let city = stormwind();
    let expected: Value =
        serde_json::from_str(include_str!("building-fixtures/accepted-draft.json")).unwrap();
    for case in expected["cases"].as_array().unwrap() {
        let profile = BuildingProfile {
            min_contact_m: case["minContactM"].as_f64().unwrap(),
            ..Default::default()
        };
        let plan = plan_buildings(&city, &profile).unwrap();
        let d = plan
            .decisions
            .iter()
            .find(|d| d.source_id == case["sourceId"].as_str().unwrap())
            .unwrap();
        assert_eq!(
            d.assignments.len(),
            case["assignments"].as_array().unwrap().len(),
            "{case}"
        );
        for e in case["assignments"].as_array().unwrap() {
            let actual = d
                .assignments
                .iter()
                .find(|a| a.target_id == e["neighborId"].as_str().unwrap())
                .unwrap();
            let polygon: Polygon = serde_json::from_value(e["polygon"].clone()).unwrap();
            assert!(
                polygon_matches(&actual.polygon, &polygon),
                "{} target {}",
                d.source_id,
                actual.target_id
            );
            assert!((actual.added_area_m2 - e["partAreaM2"].as_f64().unwrap()).abs() < 1e-5);
            assert!((actual.contact_length_m - e["contactM"].as_f64().unwrap()).abs() < 1e-5);
        }
        assert!(
            (d.discarded.iter().map(|p| p.area_m2).sum::<f64>()
                - case["metrics"]["discardedAreaM2"].as_f64().unwrap())
            .abs()
                < 1e-5
        );
    }
}
fn rectangle(x: f64, y: f64, w: f64, h: f64) -> Building {
    Building {
        polygon: vec![
            Point { x, y },
            Point { x: x + w, y },
            Point { x: x + w, y: y + h },
            Point { x, y: y + h },
        ],
        role: "lot".into(),
        landmark: false,
    }
}
fn synthetic(buildings: Vec<Building>) -> City {
    let mut city = stormwind();
    let mut ward: Ward = city.wards[0].clone();
    ward.id = 0;
    ward.buildings = buildings;
    ward.kind = "residential".into();
    city.wards = vec![ward];
    city.original_geometry.roads.clear();
    city.original_geometry.alleys.clear();
    city.original_geometry.rivers.clear();
    city.original_geometry.walls.clear();
    city.original_geometry.water.clear();
    city.coast.clear();
    city
}
#[test]
fn small_square_can_merge_without_erasing_area_or_a_protected_neighbor() {
    let city = synthetic(vec![rectangle(0., 0., 1., 1.), rectangle(1., 0., 2., 2.)]);
    let p = plan_buildings(&city, &BuildingProfile::default()).unwrap();
    assert_eq!(p.city.building_count(), 1);
    assert_eq!(p.decisions[0].kind, BuildingDecisionKind::Merge);
    assert!((area(&p.city.wards[0].buildings[0].polygon) - 80.).abs() < 1e-6);
    let mut protected = city.clone();
    protected.wards[0].buildings[1].landmark = true;
    let p = plan_buildings(&protected, &BuildingProfile::default()).unwrap();
    assert_eq!(p.decisions[0].kind, BuildingDecisionKind::Omit);
    assert_eq!(p.city.wards[0].buildings.len(), 1);
    assert_eq!(
        serde_json::to_value(&p.city.wards[0].buildings[0]).unwrap(),
        serde_json::to_value(&protected.wards[0].buildings[1]).unwrap()
    );
}
#[test]
fn corner_touches_gaps_and_paths_do_not_become_building_connections() {
    for neighbor in [rectangle(1., 1., 2., 2.), rectangle(1.1, 0., 2., 2.)] {
        let p = plan_buildings(
            &synthetic(vec![rectangle(0., 0., 1., 1.), neighbor]),
            &BuildingProfile::default(),
        )
        .unwrap();
        assert_eq!(p.decisions[0].kind, BuildingDecisionKind::Omit);
        assert!(p.decisions[0].assignments.is_empty());
    }
    let mut city = synthetic(vec![rectangle(0., 0., 1., 1.), rectangle(1., 0., 2., 2.)]);
    city.original_geometry.roads.push(Road {
        course: vec![],
        outlines: vec![],
        path: vec![Point { x: 1., y: 0. }, Point { x: 1., y: 1. }],
    });
    let p = plan_buildings(&city, &BuildingProfile::default()).unwrap();
    assert!(
        p.decisions[0].assignments.is_empty(),
        "must not close the existing path at the shared wall"
    );
}
#[test]
fn collinear_vertices_do_not_enable_a_short_end_connection() {
    let mut strip = rectangle(0., 0., 4., 0.5);
    strip.polygon.insert(1, Point { x: 2., y: 0. });
    let p = plan_buildings(
        &synthetic(vec![strip, rectangle(4., 0., 2., 2.)]),
        &BuildingProfile::default(),
    )
    .unwrap();
    assert_eq!(p.decisions[0].kind, BuildingDecisionKind::Omit);
    assert!(p.decisions[0].assignments.is_empty());
}
#[test]
fn named_profile_and_unflagged_irregular_buildings_are_preserved() {
    let profile: BuildingProfile = serde_json::from_str(include_str!(
        "../../../assets/building-profiles/buildings-v1.json"
    ))
    .unwrap();
    assert_eq!(profile, BuildingProfile::default());
    let mut building = rectangle(0., 0., 4., 4.);
    building.polygon = vec![
        Point { x: 0., y: 0. },
        Point { x: 4., y: 0. },
        Point { x: 4., y: 2. },
        Point { x: 2., y: 2. },
        Point { x: 2., y: 4. },
        Point { x: 0., y: 4. },
    ];
    let city = synthetic(vec![building]);
    let p = plan_buildings(&city, &profile).unwrap();
    assert!(p.decisions.is_empty());
    assert_eq!(
        serde_json::to_value(p.city).unwrap(),
        serde_json::to_value(city).unwrap()
    );
}
#[test]
fn planning_is_finite_and_balanced_on_mixed_generated_cities() {
    for (seed, size, river, coast) in [
        (42, 5, false, false),
        (42, 25, true, false),
        (42, 10, true, true),
        (12345, 25, false, false),
        (924709892, 10, false, false),
    ] {
        let city = generate_city(&city_core::CityOptions {
            seed,
            size,
            river,
            coast,
            ..Default::default()
        })
        .unwrap();
        let original = serde_json::to_value(&city).unwrap();
        let p = plan_buildings(&city, &BuildingProfile::default()).unwrap();
        let output_area = p
            .city
            .wards
            .iter()
            .flat_map(|w| &w.buildings)
            .map(|b| area(&b.polygon))
            .sum::<f64>();
        assert!(output_area.is_finite());
        assert!(
            (output_area + p.summary.discarded_footprint_m2 - p.summary.original_footprint_m2)
                .abs()
                < 1e-3
        );
        assert_eq!(serde_json::to_value(&city).unwrap(), original);
        assert_eq!(
            p.city.building_count() + p.summary.flagged_buildings,
            city.building_count()
        );
    }
}
#[test]
fn profile_is_validated_and_original_generation_stays_reproducible() {
    let city = stormwind();
    for profile in [
        BuildingProfile {
            version: 2,
            ..Default::default()
        },
        BuildingProfile {
            min_width_m: f64::NAN,
            ..Default::default()
        },
        BuildingProfile {
            min_area_m2: -1.,
            ..Default::default()
        },
        BuildingProfile {
            min_angle_degrees: 91.,
            ..Default::default()
        },
    ] {
        assert!(plan_buildings(&city, &profile).is_err());
    }
    let original = generate_city(&city.options).unwrap();
    assert_eq!(
        serde_json::to_value(&original).unwrap(),
        serde_json::to_value(&city).unwrap()
    );
    let _ = plan_buildings(&original, &BuildingProfile::default()).unwrap();
    assert_eq!(
        serde_json::to_value(generate_city(&city.options).unwrap()).unwrap(),
        serde_json::to_value(&original).unwrap()
    );
}
