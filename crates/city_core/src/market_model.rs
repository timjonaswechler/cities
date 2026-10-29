use crate::{GenerationError, Point, Polygon};
use serde::{Deserialize, Serialize};

/// Named, serializable settings for the accepted V1 rule set. All distances are metres.
#[derive(Clone, Debug, Serialize, Deserialize, PartialEq)]
#[serde(default, deny_unknown_fields, rename_all = "camelCase")]
pub struct MarketProfile {
    pub version: u32,
    pub name: String,
    pub main_min: f64,
    pub side_min: f64,
    pub service: f64,
    pub district_weight: f64,
    pub min_beneficiaries: usize,
    pub max_markets: usize,
}
impl Default for MarketProfile {
    fn default() -> Self {
        Self {
            version: 1,
            name: "Marktplanung V1".into(),
            main_min: 200.0,
            side_min: 160.0,
            service: 240.0,
            district_weight: 1.0,
            min_beneficiaries: 12,
            max_markets: 3,
        }
    }
}
impl MarketProfile {
    pub fn validate(&self) -> Result<(), GenerationError> {
        if self.version != 1 {
            return Err(GenerationError(
                "Only market profile version 1 is supported".into(),
            ));
        }
        if [
            self.main_min,
            self.side_min,
            self.service,
            self.district_weight,
        ]
        .iter()
        .any(|v| !v.is_finite())
            || self.main_min < 0.0
            || self.side_min < 0.0
            || self.service <= 0.0
            || !(0.0..=2.0).contains(&self.district_weight)
            || self.min_beneficiaries == 0
            || self.max_markets > 5
        {
            return Err(GenerationError("Invalid market profile: nonnegative distances, positive service/minBeneficiaries, districtWeight 0..2, maxMarkets 0..5 required".into()));
        }
        Ok(())
    }
}

/// Sparse, caller-supplied demand weights for ordinary `lot` buildings.
/// Omitted buildings use footprint area. Zero suppresses demand; no market-derived
/// building use feeds back into demand. IDs must exist and may occur only once.
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(deny_unknown_fields, rename_all = "camelCase")]
pub struct MarketDemandOverride {
    pub ward_id: usize,
    pub building_index: usize,
    pub weight: f64,
}
#[derive(Clone, Debug, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct MarketSite {
    pub position: Point,
    pub proposed: bool,
    pub district: Option<usize>,
    pub main_distance_metres: Option<f64>,
    pub beneficiaries: usize,
    pub served_demand_weight: f64,
    pub served_districts: Vec<usize>,
    pub route: Polygon,
}
#[derive(Clone, Debug, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct MarketAssignment {
    pub ward_id: usize,
    pub building_index: usize,
    pub district: Option<usize>,
    /// Index into `MarketPlan.markets`, with 0 being the existing main market.
    pub market: Option<usize>,
    pub distance_metres: Option<f64>,
}
#[derive(Clone, Debug, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct DistrictCoverage {
    pub name: String,
    pub buildings: usize,
    /// None for districts with zero demand weight.
    pub before: Option<f64>,
    pub after: Option<f64>,
    pub secondary_markets: usize,
    pub suppliers: Vec<usize>,
}
#[derive(Clone, Debug, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct MarketPair {
    pub from: usize,
    pub to: usize,
    pub distance_metres: f64,
    pub route: Polygon,
}
#[derive(Clone, Copy, Debug, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum MarketCandidateReason {
    Selected,
    Disconnected,
    NearMain,
    NearSecondary,
    InsufficientDemand,
    NoGain,
    Alternative,
}
#[derive(Clone, Debug, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct MarketCandidate {
    pub position: Point,
    pub district: Option<usize>,
    pub main_distance_metres: Option<f64>,
    pub reason: MarketCandidateReason,
}
#[derive(Clone, Debug, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct MarketPlan {
    pub profile: MarketProfile,
    pub markets: Vec<MarketSite>,
    pub buildings: Vec<MarketAssignment>,
    pub districts: Vec<DistrictCoverage>,
    pub pairs: Vec<MarketPair>,
    pub candidates: Vec<MarketCandidate>,
    pub graph_nodes: usize,
    pub main_entrances: usize,
    pub unlinked_buildings: usize,
    pub unserved_buildings: usize,
    pub unassigned_district_buildings: usize,
    pub served_demand_fraction: f64,
    /// Demand-weighted estimates, capped at `profile.service` for each building.
    pub baseline_capped_distance_metres: f64,
    pub planned_capped_distance_metres: f64,
}
