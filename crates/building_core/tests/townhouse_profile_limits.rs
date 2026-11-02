use building_core::*;
use serde_json::Value;

#[test]
fn gate_roof_cannot_overtop_main_roof() {
    let c: Value = serde_json::from_str(include_str!("fixtures/townhouse-v1.json")).unwrap();
    let site: Site = serde_json::from_value(c["sites"]["town_rectangle"].clone()).unwrap();
    let mut profile: ResolvedProfile =
        serde_json::from_value(c["profiles"]["town_standard"].clone()).unwrap();
    let ResolvedProfile::TownhouseWithGate(ref mut p) = profile else {
        panic!()
    };
    p.gate_roof_rise = 6.;
    assert!(
        matches!(
            generate(BuildingType::TownhouseWithGate, &site, &profile, 7),
            Err(Rejection::InvalidInput(_))
        ),
        "gate ridge 10.8 m must not tower over the main ridge at 8.8 m"
    );
}
