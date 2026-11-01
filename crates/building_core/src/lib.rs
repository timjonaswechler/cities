//! Deterministic building designs in metres, independent of any renderer or city.
use serde::{Deserialize, Serialize};

#[derive(Clone, Copy, Debug, PartialEq, Serialize, Deserialize)]
pub struct Point {
    pub x: f64,
    pub z: f64,
}
#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
pub enum BuildingType {
    HouseWithAnnex,
    TownhouseWithGate,
}
pub const REGISTRY: &[(BuildingType, &str)] = &[
    (BuildingType::HouseWithAnnex, "house-with-annex"),
    (BuildingType::TownhouseWithGate, "townhouse-with-gate"),
];
#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
pub enum AnnexPolicy {
    Forbidden,
    Optional,
    Required,
}
#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
#[serde(untagged)]
pub enum ResolvedProfile {
    HouseWithAnnex(HouseWithAnnexProfile),
    TownhouseWithGate(TownhouseWithGateProfile),
}
impl ResolvedProfile {
    pub fn building_type(&self) -> BuildingType {
        match self {
            Self::HouseWithAnnex(_) => BuildingType::HouseWithAnnex,
            Self::TownhouseWithGate(_) => BuildingType::TownhouseWithGate,
        }
    }
}
#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
pub struct TownhouseWithGateProfile {
    pub length: [f64; 2],
    pub depth: [f64; 2],
    pub lower_height: f64,
    pub upper_height: f64,
    pub roof_rise: f64,
    pub overhang: [f64; 2],
    pub gate_span: f64,
    pub gate_pier: f64,
    pub gate_spring: f64,
    pub gate_rise: f64,
    pub gate_wall_top: f64,
    pub gate_roof_rise: f64,
    pub setback: f64,
}
#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
pub struct HouseWithAnnexProfile {
    /// Inclusive main-body front/rear section interval, metres.
    pub length: [f64; 2],
    /// Depth perpendicular to the frontage, metres.
    pub depth: [f64; 2],
    pub wall_height: f64,
    pub roof_rise: f64,
    pub annex_width: [f64; 2],
    pub annex_depth: [f64; 2],
    pub annex: AnnexPolicy,
    /// Placement margin in the local frontage frame, not a legal setback rule.
    pub setback: f64,
}
#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
pub struct ReservedAccess {
    /// Strict convex CCW plan area, kept free from y=0 up to clearance.
    pub footprint: Vec<Point>,
    pub clearance: f64,
}
#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
pub struct Site {
    /// Convex CCW quadrilateral: frontage first, then right, rear, left.
    pub ground: Vec<Point>,
    /// Convex CCW upper projection limit, independent of ground permission.
    pub envelope: Vec<Point>,
    pub max_height: f64,
    pub annex_allowed: bool,
    /// Hard upper-storey projection beyond its supporting lower body, metres.
    #[serde(default)]
    pub max_overhang: f64,
    pub access: Vec<ReservedAccess>,
}
#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
pub enum PartRole {
    Main,
    Annex,
    LowerStorey,
    UpperStorey,
    Gate,
}
#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
pub enum RidgeAxis {
    AlongFront,
    IntoSite,
}
#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
pub struct Roof {
    pub axis: RidgeAxis,
    /// Two ridge endpoints in [x, y, z] metres; eaves come from the parent part.
    pub ridge: [[f64; 3]; 2],
}
#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
pub struct Part {
    pub role: PartRole,
    /// Convex CCW body projection; ground contact only when base == 0.
    pub footprint: [Point; 4],
    pub base: f64,
    pub wall_top: f64,
    /// None for roofless storeys; never an internal dummy roof.
    pub roof: Option<Roof>,
    /// Through-opening along edge 0→1, continuing to edge 3→2.
    pub opening: Option<ArchOpening>,
}
#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
pub struct ArchOpening {
    /// Fractions along the front and rear edges, strictly between 0 and 1.
    pub interval: [f64; 2],
    /// Absolute spring height and additional arch rise, metres.
    pub spring: f64,
    pub rise: f64,
}
#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
pub struct Design {
    pub building_type: BuildingType,
    pub parts: Vec<Part>,
    pub notes: Vec<String>,
}
#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
pub enum Material {
    Wall,
    Roof,
}
#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
pub struct SurfaceMesh {
    pub material: Material,
    pub positions: Vec<[f64; 3]>,
    pub normals: Vec<[f64; 3]>,
    pub indices: Vec<u32>,
}
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
pub enum Rejection {
    InvalidInput(String),
    NoFit(String),
}
impl std::fmt::Display for Rejection {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(f, "{self:?}")
    }
}
impl std::error::Error for Rejection {}
mod generation;
mod geometry;
mod mesh;
mod solid;

pub use generation::generate;
pub use mesh::derive_meshes;
