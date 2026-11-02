use city_core::{CityOptions, analyze_economy, generate_city};

#[test]
fn economic_overlay_is_repeatable_non_destructive_and_bounded_on_ten_cities() {
    for seed in [42, 924709892, 12345, 987654, 271828] {
        for river in [false, true] {
            let city = generate_city(&CityOptions {
                seed,
                size: 10,
                river,
                ..Default::default()
            })
            .unwrap();
            let original = serde_json::to_value(&city).unwrap();
            let analysis = analyze_economy(&city);
            assert_eq!(
                analysis,
                analyze_economy(&city),
                "seed {seed}, river {river}"
            );
            assert_eq!(original, serde_json::to_value(&city).unwrap());
            assert!(analysis.markets.iter().filter(|m| m.proposed).count() <= 3);
            assert!(
                analysis.planned_capped_distance_metres <= analysis.baseline_capped_distance_metres
            );
            assert!(analysis.planned_capped_distance_metres.is_finite());
            let ordinary = city
                .wards
                .iter()
                .flat_map(|w| &w.buildings)
                .filter(|b| b.role == "lot")
                .count();
            assert_eq!(analysis.buildings.len(), ordinary);
            assert!(analysis.unlinked_buildings <= analysis.unserved_buildings);
            assert_eq!(
                analysis.unserved_buildings,
                analysis
                    .buildings
                    .iter()
                    .filter(|b| b.market.is_none())
                    .count()
            );
            for b in &analysis.buildings {
                let ward = city.wards.iter().find(|w| w.id == b.ward_id).unwrap();
                assert_eq!(ward.buildings[b.building_index].role, "lot");
                if let Some(market) = b.market {
                    assert!(market < analysis.markets.len());
                }
            }
            eprintln!(
                "seed={seed} river={river}: proposed={} capped_metres={:.1}->{:.1} unlinked={} unserved={}/{}",
                analysis.markets.iter().filter(|m| m.proposed).count(),
                analysis.baseline_capped_distance_metres,
                analysis.planned_capped_distance_metres,
                analysis.unlinked_buildings,
                analysis.unserved_buildings,
                ordinary
            );
            serde_json::to_string(&analysis).unwrap();
        }
    }
}
