use building_core::*;
use serde_json::Value;

#[test]
fn step1_exported_designs_replay_without_geometry_changes() {
    let snapshots = [
        include_str!("../../../docs/proofs/building-types-step1/rectangle-standard-7.json"),
        include_str!("../../../docs/proofs/building-types-step1/rectangle-standard-91.json"),
        include_str!("../../../docs/proofs/building-types-step1/rectangle-compact-91.json"),
        include_str!("../../../docs/proofs/building-types-step1/irregular-standard-7.json"),
        include_str!("../../../docs/proofs/building-types-step1/rear_access-access-7.json"),
    ];
    for snapshot in snapshots {
        let input: Value = serde_json::from_str(snapshot).unwrap();
        let site: Site = serde_json::from_value(input["site"].clone()).unwrap();
        let profile: ResolvedProfile = serde_json::from_value(input["profile"].clone()).unwrap();
        let d = generate(
            BuildingType::HouseWithAnnex,
            &site,
            &profile,
            input["seed"].as_u64().unwrap(),
        )
        .unwrap();
        let mut actual = serde_json::to_value(d).unwrap();
        for part in actual["parts"].as_array_mut().unwrap() {
            assert!(part["opening"].is_null());
            part.as_object_mut().unwrap().remove("opening");
        }
        assert_eq!(actual, input["result"]["Ok"], "{}", input["site_name"]);
    }
}
