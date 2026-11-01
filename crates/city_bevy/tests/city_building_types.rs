use building_core::{BuildingType, ReservedAccess};
use city_bevy::city_buildings::*;
use city_core::{City, CityOptions, generate_city};
use serde::Deserialize;

#[derive(Deserialize)]
struct Fixture {
    city_options: CityOptions,
    config: Config,
    lots: Vec<RawLot>,
}
#[derive(Deserialize)]
struct RawLot {
    ward_id: usize,
    building_index: usize,
    polygon: Vec<city_core::Point>,
}
fn fixture() -> (City, Fixture) {
    let f: Fixture =
        serde_json::from_str(include_str!("fixtures/city-building-types-v1.json")).unwrap();
    (generate_city(&f.city_options).unwrap(), f)
}
#[test]
fn real_sites_both_types_variation_and_immutable_original() {
    let (city, f) = fixture();
    assert_eq!(city.name, "Purplechurch");
    let before = serde_json::to_value(&city).unwrap();
    for raw in &f.lots {
        assert_eq!(
            city.wards
                .iter()
                .find(|w| w.id == raw.ward_id)
                .unwrap()
                .buildings[raw.building_index]
                .polygon,
            raw.polygon
        );
    }
    let placements = plan(&city, &f.config).unwrap();
    for (i, kind) in [
        BuildingType::HouseWithAnnex,
        BuildingType::TownhouseWithGate,
    ]
    .into_iter()
    .enumerate()
    {
        let p = &placements[i];
        assert_eq!(p.design.as_ref().unwrap().building_type, kind);
        let r = p.request.as_ref().unwrap();
        assert_eq!(p.design.as_ref().unwrap(), &r.generate().unwrap());
        assert_eq!(
            p.meshes,
            building_core::derive_meshes(p.design.as_ref().unwrap())
        );
        let mut other = r.clone();
        other.seed = 91;
        assert_ne!(r.generate().unwrap(), other.generate().unwrap());
        let raw = &f.lots[i].polygon;
        for v in &r.site.ground {
            assert!(
                raw.iter()
                    .any(|p| (p.x * 4. - v.x).abs() < 1e-10 && (p.y * 4. - v.z).abs() < 1e-10)
            );
        }
        let front = if i == 0 { [3, 0] } else { [1, 2] };
        for (j, k) in front.into_iter().enumerate() {
            assert_eq!(r.site.ground[j].x, raw[k].x * 4.);
            assert_eq!(r.site.ground[j].z, raw[k].y * 4.);
        }
        assert!(!r.site.access.is_empty());
        assert_eq!(r.site.ground, r.site.envelope);
        assert_eq!(r.site.max_height, 12.);
    }
    assert!(placements[2].design.is_none());
    assert!(placements[2].attempts[0].contains("quadrilateral"));
    assert_eq!(serde_json::to_value(&city).unwrap(), before);
}
#[test]
fn hard_limits_beat_preferences_and_reservations() {
    let (city, f) = fixture();
    let mut choice = f.config.lots[1].clone();
    let site = resolve_site(&city, &choice).unwrap();
    let mut low = site.clone();
    low.max_height = 7.;
    let p = select(&low, &choice);
    assert_eq!(
        p.design.unwrap().building_type,
        BuildingType::HouseWithAnnex
    );
    assert!(p.attempts.len() >= 2);
    low.max_height = 1.;
    assert!(select(&low, &choice).design.is_none());
    let mut blocked = site.clone();
    blocked.access.push(ReservedAccess {
        footprint: site.ground.clone(),
        clearance: 12.,
    });
    assert!(select(&blocked, &choice).design.is_none());
    let mut no_overhang = site;
    no_overhang.max_overhang = 0.;
    choice.preferences.truncate(1);
    assert!(select(&no_overhang, &choice).design.is_none());
}
#[test]
fn overlapping_originals_and_duplicate_candidates_are_rejected() {
    let (mut city, f) = fixture();
    let choice = &f.config.lots[0];
    let p = city.wards.iter().find(|w| w.id == 3).unwrap().buildings[0]
        .polygon
        .clone();
    city.wards.iter_mut().find(|w| w.id == 3).unwrap().buildings[1].polygon = p;
    assert!(
        resolve_site(&city, choice)
            .unwrap_err()
            .contains("overlaps")
    );
    let mut config = f.config;
    config.lots.push(config.lots[0].clone());
    assert!(plan(&city, &config).unwrap_err().contains("duplicate"));
}
#[test]
fn protected_and_invalid_contours_are_not_repaired() {
    let (mut city, f) = fixture();
    let choice = &f.config.lots[0];
    city.wards.iter_mut().find(|w| w.id == 3).unwrap().buildings[0].landmark = true;
    assert!(
        resolve_site(&city, choice)
            .unwrap_err()
            .contains("protected")
    );
    city.wards.iter_mut().find(|w| w.id == 3).unwrap().buildings[0].landmark = false;
    let p = &mut city.wards.iter_mut().find(|w| w.id == 3).unwrap().buildings[0].polygon;
    p[2] = p[0].lerp(p[1], 0.5);
    assert!(resolve_site(&city, choice).is_err());
}
