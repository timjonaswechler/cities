use city_core::*;
use serde_json::Value;

fn scenes() -> Vec<Value> {
    let html = include_str!("../prototypes/market-district-lab.html");
    let data = html
        .split_once("<script id=\"data\" type=\"application/json\">")
        .unwrap()
        .1
        .split_once("</script>")
        .unwrap()
        .0;
    serde_json::from_str(data).unwrap()
}
fn poly(value: &Value) -> Polygon {
    serde_json::from_value(value.clone()).unwrap()
}
fn from_scene(s: &Value) -> City {
    let mut wards: Vec<Ward> = vec![];
    for b in s["buildings"].as_array().unwrap() {
        let (ward, index) = b["id"].as_str().unwrap().split_once(':').unwrap();
        let id: usize = ward.parse().unwrap();
        if !wards.iter().any(|w| w.id == id) {
            wards.push(Ward {
                id,
                polygon: vec![],
                center: Point::default(),
                kind: "residential".into(),
                name: String::new(),
                buildings: vec![],
                within_city: true,
                original_kind: String::new(),
                seed: 1,
                green: None,
                market_space: None,
            });
        }
        let w = wards.iter_mut().find(|w| w.id == id).unwrap();
        assert_eq!(w.buildings.len(), index.parse::<usize>().unwrap());
        w.buildings.push(Building {
            polygon: poly(&b["p"]),
            role: b["role"].as_str().unwrap().into(),
            landmark: b["role"] != "lot",
        });
    }
    for (i, space) in s["mainMarkets"].as_array().unwrap().iter().enumerate() {
        wards.push(Ward {
            id: usize::MAX - i,
            polygon: vec![],
            center: Point::default(),
            kind: "market".into(),
            name: String::new(),
            buildings: vec![],
            within_city: true,
            original_kind: String::new(),
            seed: 1,
            green: None,
            market_space: Some(poly(space)),
        });
    }
    City {
        options: CityOptions {
            seed: s["seed"].as_u64().unwrap() as u32,
            size: 25,
            ..Default::default()
        },
        name: s["label"].as_str().unwrap().into(),
        wards,
        wall: vec![],
        castle_wall: vec![],
        gates: poly(&s["gates"]),
        roads: vec![],
        river: vec![],
        river_width: 0.,
        coast: poly(&s["coast"]),
        trees: vec![],
        fields: vec![],
        labels: vec![],
        bounds: Bounds::default(),
        original_geometry: OriginalGeometry {
            earth: vec![],
            water: vec![],
            shore: vec![],
            piers: vec![],
            furrows: vec![],
            tree_crowns: vec![],
            roads: s["roadCourses"]
                .as_array()
                .unwrap()
                .iter()
                .zip(s["roads"].as_array().unwrap())
                .map(|(c, p)| Road {
                    course: poly(c),
                    path: poly(p),
                    outlines: vec![],
                })
                .collect(),
            alleys: s["alleys"].as_array().unwrap().iter().map(poly).collect(),
            rivers: s["rivers"]
                .as_array()
                .unwrap()
                .iter()
                .map(|r| River {
                    course: vec![],
                    path: poly(&r["path"]),
                    width: r["width"].as_f64().unwrap(),
                    bridges: serde_json::from_value(r["bridges"].clone()).unwrap(),
                    mouth: None,
                })
                .collect(),
            walls: s["walls"]
                .as_array()
                .unwrap()
                .iter()
                .map(|w| Wall {
                    shape: vec![],
                    segment_mask: vec![],
                    segments: serde_json::from_value(w["segments"].clone()).unwrap(),
                    towers: vec![],
                    gates: vec![poly(&w["gates"])],
                    thickness: 1.,
                    tower_radius: w["towerRadius"].as_f64().unwrap(),
                    castle: false,
                })
                .collect(),
            districts: s["districts"]
                .as_array()
                .unwrap()
                .iter()
                .map(|d| District {
                    name: d["name"].as_str().unwrap().into(),
                    polygon: poly(&d["p"]),
                    ward_ids: vec![],
                    kind: None,
                })
                .collect(),
        },
    }
}
fn close(a: f64, b: f64) {
    assert!((a - b).abs() < 1e-6, "{a} != {b}");
}

#[test]
fn v1_matches_all_27_accepted_html_runs() {
    let input = scenes();
    let cities: Vec<_> = input.iter().map(from_scene).collect();
    let reference: Value =
        serde_json::from_str(include_str!("../prototypes/market-district-runs.json")).unwrap();
    let runs = reference["runs"].as_array().unwrap();
    assert_eq!(runs.len(), 27);
    for run in runs {
        let mut config = run["configuration"].clone();
        let city = config
            .as_object_mut()
            .unwrap()
            .remove("city")
            .unwrap()
            .as_u64()
            .unwrap() as usize;
        let profile: MarketProfile = serde_json::from_value(config).unwrap();
        let plan = plan_markets(&cities[city], &profile, &[]).unwrap();
        eprintln!("V1 reference: {} / {}", run["city"], run["name"]);
        assert_eq!(
            plan.graph_nodes,
            run["graphNodes"].as_u64().unwrap() as usize
        );
        assert_eq!(
            plan.main_entrances,
            run["mainEntrances"].as_u64().unwrap() as usize
        );
        assert_eq!(
            plan.markets.iter().filter(|m| m.proposed).count(),
            run["selected"].as_u64().unwrap() as usize
        );
        assert_eq!(
            plan.unlinked_buildings,
            run["unlinkedBuildings"].as_u64().unwrap() as usize
        );
        assert_eq!(
            plan.unserved_buildings,
            run["unservedBuildings"].as_u64().unwrap() as usize
        );
        close(
            plan.served_demand_fraction,
            run["servedFootprintFraction"].as_f64().unwrap(),
        );
        close(
            plan.baseline_capped_distance_metres,
            run["baselineCappedMetres"].as_f64().unwrap(),
        );
        close(
            plan.planned_capped_distance_metres,
            run["plannedCappedMetres"].as_f64().unwrap(),
        );
        for (actual, expected) in plan
            .markets
            .iter()
            .filter(|m| m.proposed)
            .zip(run["markets"].as_array().unwrap())
        {
            close(
                actual.position.x,
                expected["position"]["x"].as_f64().unwrap(),
            );
            close(
                actual.position.y,
                expected["position"]["y"].as_f64().unwrap(),
            );
            close(
                actual.main_distance_metres.unwrap(),
                expected["mainDistance"].as_f64().unwrap(),
            );
            assert!(actual.main_distance_metres.unwrap() + 1e-4 >= profile.main_min);
            assert_eq!(
                actual.beneficiaries,
                expected["beneficiaries"].as_u64().unwrap() as usize
            );
        }
        assert_eq!(plan.pairs.len(), run["pairs"].as_array().unwrap().len());
        for (actual, expected) in plan.pairs.iter().zip(run["pairs"].as_array().unwrap()) {
            close(
                actual.distance_metres,
                expected["distance"].as_f64().unwrap(),
            );
            assert!(actual.distance_metres + 1e-4 >= profile.side_min);
            let route: f64 = actual
                .route
                .windows(2)
                .map(|p| p[0].minus(p[1]).length() * 4.)
                .sum();
            close(route, actual.distance_metres);
        }
        for (actual, expected) in plan
            .districts
            .iter()
            .zip(run["districts"].as_array().unwrap())
        {
            assert_eq!(actual.name, expected["name"].as_str().unwrap());
            assert_eq!(
                actual.buildings,
                expected["buildings"].as_u64().unwrap() as usize
            );
            assert_eq!(
                actual.secondary_markets,
                expected["markets"].as_u64().unwrap() as usize
            );
            for (value, key) in [(actual.before, "before"), (actual.after, "after")] {
                if let Some(v) = value {
                    close(v, expected[key].as_f64().unwrap())
                } else {
                    assert!(expected[key].is_null())
                }
            }
        }
    }
}

#[test]
fn named_profile_and_external_demand_are_explicit_and_non_destructive() {
    let city = from_scene(&scenes()[0]);
    let before = serde_json::to_value(&city).unwrap();
    let profile = MarketProfile::default();
    assert_eq!(
        profile,
        serde_json::from_str::<MarketProfile>(include_str!(
            "../../../assets/market-profiles/market-v1.json"
        ))
        .unwrap()
    );
    let json = serde_json::to_string(&profile).unwrap();
    assert_eq!(profile, serde_json::from_str(&json).unwrap());
    let demand: Vec<_> = city
        .wards
        .iter()
        .flat_map(|w| {
            w.buildings
                .iter()
                .enumerate()
                .filter(|(_, b)| b.role == "lot")
                .map(|(i, _)| MarketDemandOverride {
                    ward_id: w.id,
                    building_index: i,
                    weight: 0.,
                })
        })
        .collect();
    let zero = plan_markets(&city, &profile, &demand).unwrap();
    assert!(!zero.markets.iter().any(|m| m.proposed));
    assert_eq!(zero.served_demand_fraction, 0.);
    assert_eq!(before, serde_json::to_value(&city).unwrap());
    assert_eq!(
        analyze_economy(&city),
        plan_markets(&city, &profile, &[]).unwrap()
    );
    for overrides in [
        vec![MarketDemandOverride {
            ward_id: usize::MAX,
            building_index: 0,
            weight: 1.,
        }],
        vec![MarketDemandOverride {
            weight: -1.,
            ..demand[0].clone()
        }],
        vec![demand[0].clone(), demand[0].clone()],
    ] {
        assert!(plan_markets(&city, &profile, &overrides).is_err());
    }
}
#[test]
fn invalid_profiles_fail_before_planning() {
    let city = from_scene(&scenes()[0]);
    for profile in [
        MarketProfile {
            version: 2,
            ..Default::default()
        },
        MarketProfile {
            main_min: f64::NAN,
            ..Default::default()
        },
        MarketProfile {
            service: 0.,
            ..Default::default()
        },
        MarketProfile {
            max_markets: 6,
            ..Default::default()
        },
        MarketProfile {
            district_weight: -1.,
            ..Default::default()
        },
    ] {
        assert!(plan_markets(&city, &profile, &[]).is_err());
    }
    assert!(serde_json::from_str::<MarketProfile>(r#"{"mainMni":200}"#).is_err());
}
