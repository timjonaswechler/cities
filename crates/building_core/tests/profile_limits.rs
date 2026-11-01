use building_core::*;
use serde_json::Value;

#[test]
fn rejects_local_taper_that_stretches_past_resolved_length() {
    let corpus: Value = serde_json::from_str(include_str!("fixtures/generation-v1.json")).unwrap();
    let mut site: Site = serde_json::from_value(corpus["sites"]["rectangle"].clone()).unwrap();
    let mut profile: ResolvedProfile =
        serde_json::from_value(corpus["profiles"]["standard"].clone()).unwrap();
    let ResolvedProfile::HouseWithAnnex(ref mut house) = profile else {
        panic!("expected house profile")
    };
    house.annex = AnnexPolicy::Forbidden;
    // This ground fans out sharply. Respect it by rejection, not by stretching
    // a sampled 10..12.5 m main body into a much broader rear section.
    site.ground[2].x = 30.;
    site.ground[3].x = -30.;
    site.envelope = site.ground.clone();
    assert!(matches!(
        generate(BuildingType::HouseWithAnnex, &site, &profile, 7),
        Err(Rejection::NoFit(_))
    ));
}
