use crate::GenerationError;
use serde::{Deserialize, Serialize};

#[derive(Clone, Debug, Serialize, Deserialize, PartialEq)]
#[serde(default)]
pub struct CityOptions {
    pub seed: u32,
    pub size: u32,
    pub citadel: bool,
    pub urban_castle: bool,
    pub plaza: bool,
    pub temple: bool,
    pub walls: bool,
    pub shantytown: bool,
    pub coast: bool,
    pub river: bool,
    pub greens: bool,
    pub gates: i32,
    pub hub: bool,
    pub sea: f64,
    pub name: Option<String>,
    pub population: Option<u32>,
}
impl Default for CityOptions {
    fn default() -> Self {
        Self {
            seed: 924709892,
            size: 25,
            citadel: true,
            urban_castle: false,
            plaza: true,
            temple: true,
            walls: true,
            shantytown: false,
            coast: false,
            river: false,
            greens: false,
            gates: -1,
            hub: false,
            sea: 0.0,
            name: None,
            population: None,
        }
    }
}
impl CityOptions {
    pub fn validate(&self) -> Result<(), GenerationError> {
        if !(1..2147483647).contains(&self.seed) {
            return Err(GenerationError("Seed must be 1..2147483646".into()));
        }
        if !(1..=200).contains(&self.size) {
            return Err(GenerationError("Size must be 1..200".into()));
        }
        if !(-1..=30).contains(&self.gates) {
            return Err(GenerationError("Gates must be -1..30".into()));
        }
        if !self.sea.is_finite() {
            return Err(GenerationError("Sea direction must be finite".into()));
        }
        Ok(())
    }
    pub(crate) fn query(&self) -> serde_json::Value {
        let mut values = serde_json::Map::new();
        for (key, value) in serde_json::to_value(self).unwrap().as_object().unwrap() {
            if value.is_null() {
                continue;
            }
            let text = match value {
                serde_json::Value::Bool(b) => if *b { "1" } else { "0" }.to_string(),
                serde_json::Value::String(s) => s.clone(),
                _ => value.to_string(),
            };
            values.insert(key.clone(), text.into());
        }
        serde_json::Value::Object(values)
    }
}

/// Coordinates retain the original binary64 precision. In Bevy they map to X/Z.
#[derive(Clone, Copy, Debug, Default, Serialize, Deserialize, PartialEq)]
pub struct Point {
    pub x: f64,
    pub y: f64,
}
impl Point {
    pub fn plus(self, b: Self) -> Self {
        Self {
            x: self.x + b.x,
            y: self.y + b.y,
        }
    }
    pub fn minus(self, b: Self) -> Self {
        Self {
            x: self.x - b.x,
            y: self.y - b.y,
        }
    }
    pub fn scale(self, s: f64) -> Self {
        Self {
            x: self.x * s,
            y: self.y * s,
        }
    }
    pub fn length(self) -> f64 {
        (self.x * self.x + self.y * self.y).sqrt()
    }
    pub fn normalized(self, amount: f64) -> Self {
        if self.x == 0.0 && self.y == 0.0 {
            self
        } else {
            self.scale(amount / self.length())
        }
    }
    pub fn lerp(self, b: Self, t: f64) -> Self {
        Self {
            x: self.x + (b.x - self.x) * t,
            y: self.y + (b.y - self.y) * t,
        }
    }
}
pub type Polygon = Vec<Point>;
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct Building {
    pub polygon: Polygon,
    pub landmark: bool,
    pub role: String,
}
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Ward {
    pub id: usize,
    pub polygon: Polygon,
    pub center: Point,
    pub kind: String,
    pub name: String,
    pub buildings: Vec<Building>,
    pub within_city: bool,
    pub original_kind: String,
    pub seed: u32,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub green: Option<Polygon>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub market_space: Option<Polygon>,
}
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct MapLabel {
    pub text: String,
    pub point: Point,
    pub angle: f64,
    pub size: f64,
    pub path: Polygon,
}
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct Road {
    pub course: Polygon,
    pub path: Polygon,
    pub outlines: Vec<Polygon>,
}
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct Bridge {
    pub path: Polygon,
    pub width: f64,
}
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RiverMouth {
    pub origin: Point,
    pub next: Point,
    pub shore_before: Point,
    pub shore_after: Point,
    pub convex: bool,
}
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct River {
    pub course: Polygon,
    pub path: Polygon,
    pub width: f64,
    pub bridges: Vec<Bridge>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub mouth: Option<RiverMouth>,
}
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Wall {
    pub shape: Polygon,
    pub segment_mask: Vec<bool>,
    pub segments: Vec<Polygon>,
    pub towers: Polygon,
    pub gates: Vec<Polygon>,
    pub thickness: f64,
    pub tower_radius: f64,
    pub castle: bool,
}
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct District {
    pub name: String,
    pub polygon: Polygon,
    pub ward_ids: Vec<usize>,
    #[serde(rename = "type", skip_serializing_if = "Option::is_none")]
    pub kind: Option<String>,
}
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct OriginalGeometry {
    pub earth: Polygon,
    pub water: Polygon,
    pub shore: Polygon,
    pub roads: Vec<Road>,
    pub rivers: Vec<River>,
    pub walls: Vec<Wall>,
    pub piers: Vec<Polygon>,
    pub furrows: Vec<Polygon>,
    pub alleys: Vec<Polygon>,
    pub districts: Vec<District>,
    pub tree_crowns: Vec<Polygon>,
}
#[derive(Clone, Copy, Debug, Default, Serialize, Deserialize)]
pub struct Bounds {
    pub x: f64,
    pub y: f64,
    pub width: f64,
    pub height: f64,
}
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct City {
    pub options: CityOptions,
    pub name: String,
    pub wards: Vec<Ward>,
    pub wall: Polygon,
    pub castle_wall: Polygon,
    pub gates: Polygon,
    pub roads: Vec<Polygon>,
    pub river: Polygon,
    pub river_width: f64,
    pub coast: Polygon,
    pub trees: Polygon,
    pub fields: Vec<Polygon>,
    pub labels: Vec<MapLabel>,
    pub bounds: Bounds,
    pub original_geometry: OriginalGeometry,
}
impl City {
    pub fn building_count(&self) -> usize {
        self.wards.iter().map(|w| w.buildings.len()).sum()
    }
}

/// Future terrain integration starts at this boundary. Sampling does not alter
/// the original planar generator or its RNG. Coordinates and heights are metres.
pub trait HeightField: Send + Sync {
    fn height_at(&self, x: f64, z: f64) -> f64;
}
#[derive(Default)]
pub struct FlatTerrain;
impl HeightField for FlatTerrain {
    fn height_at(&self, _x: f64, _z: f64) -> f64 {
        0.0
    }
}
