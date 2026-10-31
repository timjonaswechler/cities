//! Opt-in footprint cleanup. The original generator and its random state are untouched.
mod geometry;
mod refinement;

use crate::{Building, City, GenerationError, Point, Polygon, Ward};
use geometry::{EPS, area, assess};
use serde::{Deserialize, Serialize};
use std::collections::{BTreeMap, BTreeSet};

#[derive(Clone, Debug, Serialize, Deserialize, PartialEq)]
#[serde(default, deny_unknown_fields, rename_all = "camelCase")]
pub struct BuildingProfile {
    pub version: u32,
    pub name: String,
    pub min_area_m2: f64,
    pub min_width_m: f64,
    pub min_depth_m: f64,
    pub min_angle_degrees: f64,
    /// Minimum shared long wall for each allocated strip fragment (metres).
    pub min_contact_m: f64,
    /// V2-only, subtractive refinement after neighbor allocation. V1 stays replayable.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub refinement: Option<BuildingRefinementProfile>,
}
#[derive(Clone, Debug, Serialize, Deserialize, PartialEq)]
#[serde(default, deny_unknown_fields, rename_all = "camelCase")]
pub struct BuildingRefinementProfile {
    pub trim_tips: bool,
    pub min_edge_m: f64,
}
impl Default for BuildingRefinementProfile {
    fn default() -> Self {
        Self {
            trim_tips: true,
            min_edge_m: 2.0,
        }
    }
}
impl Default for BuildingProfile {
    fn default() -> Self {
        Self {
            version: 2,
            name: "Gebäudeformen V2".into(),
            min_area_m2: 24.0,
            min_width_m: 6.0,
            min_depth_m: 4.0,
            min_angle_degrees: 25.0,
            min_contact_m: 6.0,
            refinement: Some(BuildingRefinementProfile::default()),
        }
    }
}
impl BuildingProfile {
    pub fn validate(&self) -> Result<(), GenerationError> {
        if !matches!(
            (self.version, self.refinement.is_some()),
            (1, false) | (2, true)
        ) {
            return Err(GenerationError(
                "Building profile must be version 1 without refinement or version 2 with refinement".into(),
            ));
        }
        if let Some(refinement) = &self.refinement
            && (!refinement.min_edge_m.is_finite() || refinement.min_edge_m < 0.0)
        {
            return Err(GenerationError(
                "refinement.minEdgeM must be finite and nonnegative".into(),
            ));
        }
        for (name, value) in [
            ("minAreaM2", self.min_area_m2),
            ("minWidthM", self.min_width_m),
            ("minDepthM", self.min_depth_m),
            ("minContactM", self.min_contact_m),
        ] {
            if !value.is_finite() || value <= 0.0 {
                return Err(GenerationError(format!(
                    "{name} must be finite and positive"
                )));
            }
        }
        if !self.min_angle_degrees.is_finite() || !(0.0..=90.0).contains(&self.min_angle_degrees) {
            return Err(GenerationError("minAngleDegrees must be 0..90".into()));
        }
        Ok(())
    }
}
#[derive(Clone, Debug, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct BuildingMeasurements {
    pub area_m2: f64,
    pub width_m: f64,
    pub depth_m: f64,
    pub min_angle_degrees: f64,
}
#[derive(Clone, Debug, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub enum BuildingIssue {
    InvalidPolygon,
    TooSmall,
    TooNarrow,
    TooShort,
    AcuteTip,
    NarrowAppendage,
    ShortEdge,
}
#[derive(Clone, Debug, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub enum BuildingDecisionKind {
    SideSplit,
    Merge,
    Omit,
    Refine,
}
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BuildingAssignment {
    /// ID in the unmodified input city: ward ID and original building index.
    pub target_id: String,
    pub added_part: Polygon,
    pub polygon: Polygon,
    pub added_area_m2: f64,
    pub contact_length_m: f64,
}
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DiscardedBuildingPart {
    pub polygon: Polygon,
    pub area_m2: f64,
    pub reason: String,
}
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BuildingDecision {
    pub source_id: String,
    pub kind: BuildingDecisionKind,
    pub issues: Vec<BuildingIssue>,
    pub measurements: BuildingMeasurements,
    pub assignments: Vec<BuildingAssignment>,
    pub discarded: Vec<DiscardedBuildingPart>,
    /// Retained footprint for a subtractive refinement; no recipient assignment.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub polygon: Option<Polygon>,
}
#[derive(Clone, Debug, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BuildingSummary {
    pub original_buildings: usize,
    pub planned_buildings: usize,
    pub flagged_buildings: usize,
    pub assigned_parts: usize,
    pub omitted_buildings: usize,
    #[serde(default)]
    pub refined_buildings: usize,
    #[serde(default)]
    pub remaining_short_edges: usize,
    pub original_footprint_m2: f64,
    pub planned_footprint_m2: f64,
    pub discarded_footprint_m2: f64,
}
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BuildingOrigin {
    pub ward_id: usize,
    pub building_index: usize,
    pub original_building_index: usize,
}
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BuildingPlan {
    /// All non-building geometry and generator options are copied unchanged.
    pub city: City,
    pub profile: BuildingProfile,
    pub decisions: Vec<BuildingDecision>,
    /// Output index to retained original target index; keeps rendering identity stable.
    pub building_origins: Vec<BuildingOrigin>,
    pub summary: BuildingSummary,
}

/// Return a separate planned city and an area ledger. Thresholds are configurable
/// shape proxies, not certified room dimensions or historically calibrated rules.
pub fn plan_buildings(
    city: &City,
    profile: &BuildingProfile,
) -> Result<BuildingPlan, GenerationError> {
    profile.validate()?;
    if city
        .wards
        .iter()
        .flat_map(|w| &w.buildings)
        .flat_map(|b| &b.polygon)
        .any(|p| !p.x.is_finite() || !p.y.is_finite())
    {
        return Err(GenerationError(
            "Building coordinates must be finite".into(),
        ));
    }
    let mut planned = city.clone();
    let mut decisions = vec![];
    let mut building_origins = vec![];
    for (ward, output) in city.wards.iter().zip(&mut planned.wards) {
        let checks: Vec<_> = ward
            .buildings
            .iter()
            .map(|b| assess(&b.polygon, profile))
            .collect();
        let mut sources: Vec<_> = (0..ward.buildings.len())
            .filter(|&i| ordinary(&ward.buildings[i]) && !checks[i].1.is_empty())
            .collect();
        sources.sort_by_key(|&i| format!("{}:{i}", ward.id));
        let mut reserved = BTreeSet::new();
        let mut removed = BTreeSet::new();
        let mut replacements = BTreeMap::new();
        for i in sources {
            let source = &ward.buildings[i];
            let targets: Vec<_> = (0..ward.buildings.len())
                .filter(|&j| {
                    j != i
                        && !reserved.contains(&j)
                        && ordinary(&ward.buildings[j])
                        && checks[j].1.is_empty()
                })
                .collect();
            let work = if checks[i].1.contains(&BuildingIssue::InvalidPolygon) {
                Work::omit(&source.polygon, "Invalid source polygon")
            } else if let Some(split) =
                split_strip(city, ward, source, &targets, profile, &checks[i].0)
            {
                split
            } else if checks[i].0.width_m + EPS < profile.min_width_m
                && checks[i].0.depth_m >= checks[i].0.width_m * 2.0
            {
                Work::omit(
                    &source.polygon,
                    "Unsupported narrow shape; no end-wall fallback",
                )
            } else {
                merge_small(city, ward, source, &targets, profile)
            };
            let kind = if work.assignments.is_empty() {
                BuildingDecisionKind::Omit
            } else if work.split {
                BuildingDecisionKind::SideSplit
            } else {
                BuildingDecisionKind::Merge
            };
            let mut assignments = vec![];
            for (target, assignment) in work.assignments {
                reserved.insert(target);
                replacements.insert(target, assignment.polygon.clone());
                assignments.push(assignment);
            }
            removed.insert(i);
            decisions.push(BuildingDecision {
                source_id: format!("{}:{i}", ward.id),
                kind,
                issues: checks[i].1.clone(),
                measurements: checks[i].0.clone(),
                assignments,
                discarded: work.discarded,
                polygon: None,
            });
        }
        output.buildings = ward
            .buildings
            .iter()
            .enumerate()
            .filter(|(i, _)| !removed.contains(i))
            .enumerate()
            .map(|(building_index, (i, b))| {
                building_origins.push(BuildingOrigin {
                    ward_id: ward.id,
                    building_index,
                    original_building_index: i,
                });
                let mut b = b.clone();
                if let Some(p) = replacements.remove(&i) {
                    b.polygon = p;
                }
                b
            })
            .collect();
        if let Some(settings) = &profile.refinement {
            let indices = (0..ward.buildings.len()).filter(|i| !removed.contains(i));
            for (i, building) in indices.zip(&mut output.buildings) {
                if !ordinary(building) {
                    continue;
                }
                let result = refinement::refine(&building.polygon, profile, settings);
                if result.polygon != building.polygon {
                    decisions.push(BuildingDecision {
                        source_id: format!("{}:{i}", ward.id),
                        kind: BuildingDecisionKind::Refine,
                        issues: result.issues,
                        measurements: assess(&building.polygon, profile).0,
                        assignments: vec![],
                        discarded: result.discarded,
                        polygon: Some(result.polygon.clone()),
                    });
                    building.polygon = result.polygon;
                }
            }
        }
    }
    let footprint = |c: &City| {
        c.wards
            .iter()
            .flat_map(|w| &w.buildings)
            .map(|b| area(&b.polygon) * 16.0)
            .sum::<f64>()
    };
    let summary = BuildingSummary {
        original_buildings: city.building_count(),
        planned_buildings: planned.building_count(),
        flagged_buildings: decisions.len(),
        assigned_parts: decisions.iter().map(|d| d.assignments.len()).sum(),
        omitted_buildings: decisions
            .iter()
            .filter(|d| d.kind == BuildingDecisionKind::Omit)
            .count(),
        refined_buildings: decisions
            .iter()
            .filter(|d| d.kind == BuildingDecisionKind::Refine)
            .count(),
        remaining_short_edges: profile.refinement.as_ref().map_or(0, |settings| {
            planned
                .wards
                .iter()
                .flat_map(|w| &w.buildings)
                .filter(|b| ordinary(b))
                .map(|b| refinement::short_edges(&b.polygon, settings.min_edge_m).len())
                .sum()
        }),
        original_footprint_m2: footprint(city),
        planned_footprint_m2: footprint(&planned),
        discarded_footprint_m2: decisions
            .iter()
            .flat_map(|d| &d.discarded)
            .map(|p| p.area_m2)
            .sum(),
    };
    if [
        summary.original_footprint_m2,
        summary.planned_footprint_m2,
        summary.discarded_footprint_m2,
    ]
    .iter()
    .any(|area| !area.is_finite())
        || (summary.original_footprint_m2
            - summary.planned_footprint_m2
            - summary.discarded_footprint_m2)
            .abs()
            > 1e-3
    {
        return Err(GenerationError(
            "Building footprint ledger does not balance".into(),
        ));
    }
    Ok(BuildingPlan {
        city: planned,
        profile: profile.clone(),
        decisions,
        building_origins,
        summary,
    })
}
fn ordinary(b: &Building) -> bool {
    b.role == "lot" && !b.landmark
}
#[derive(Default)]
struct Work {
    split: bool,
    assignments: Vec<(usize, BuildingAssignment)>,
    discarded: Vec<DiscardedBuildingPart>,
}
impl Work {
    fn omit(p: &[Point], reason: &str) -> Self {
        let mut work = Self::default();
        work.discard(p.to_vec(), reason);
        work
    }
    fn discard(&mut self, p: Polygon, reason: &str) {
        if p.len() >= 3 && area(&p) > EPS {
            self.discarded.push(DiscardedBuildingPart {
                area_m2: area(&p) * 16.0,
                polygon: p,
                reason: reason.into(),
            });
        }
    }
}
fn assignment(
    city: &City,
    ward: &Ward,
    target: usize,
    part: Polygon,
    profile: &BuildingProfile,
) -> Option<BuildingAssignment> {
    let (polygon, contact_length_m) = geometry::unite(&part, &ward.buildings[target].polygon)?;
    if !assess(&polygon, profile).1.is_empty() || geometry::blocked(city, &polygon) {
        return None;
    }
    Some(BuildingAssignment {
        target_id: format!("{}:{target}", ward.id),
        added_area_m2: area(&part) * 16.0,
        added_part: part,
        polygon,
        contact_length_m,
    })
}
fn merge_small(
    city: &City,
    ward: &Ward,
    source: &Building,
    targets: &[usize],
    profile: &BuildingProfile,
) -> Work {
    let mut best: Option<(usize, BuildingAssignment)> = None;
    for &target in targets {
        let Some(candidate) = assignment(city, ward, target, source.polygon.clone(), profile)
        else {
            continue;
        };
        let better = best.as_ref().is_none_or(|(index, b)| {
            candidate.contact_length_m > b.contact_length_m + EPS
                || ((candidate.contact_length_m - b.contact_length_m).abs() <= EPS
                    && (area(&ward.buildings[target].polygon)
                        < area(&ward.buildings[*index].polygon) - EPS
                        || ((area(&ward.buildings[target].polygon)
                            - area(&ward.buildings[*index].polygon))
                        .abs()
                            <= EPS
                            && target < *index)))
        });
        if better {
            best = Some((target, candidate));
        }
    }
    match best {
        Some(value) => Work {
            assignments: vec![value],
            ..Default::default()
        },
        None => Work::omit(
            &source.polygon,
            "No eligible direct neighbor produces a usable footprint",
        ),
    }
}
struct Contact {
    target: usize,
    lo: f64,
    hi: f64,
}
fn split_strip(
    city: &City,
    ward: &Ward,
    source: &Building,
    targets: &[usize],
    profile: &BuildingProfile,
    measure: &BuildingMeasurements,
) -> Option<Work> {
    let normalized = geometry::clean(&source.polygon);
    let sides = geometry::strip_axes(&normalized, measure);
    if sides.is_empty() {
        return None;
    }
    let mut sides: Vec<_> = sides
        .into_iter()
        .map(|(a, b)| {
            let mut intervals = vec![];
            for &target in targets {
                for (c, d) in geometry::edge_list(&ward.buildings[target].polygon) {
                    if let Some((lo, hi)) = geometry::contact(a, b, c, d) {
                        intervals.push(Contact { target, lo, hi });
                    }
                }
            }
            let total = intervals.iter().map(|c| c.hi - c.lo).sum::<f64>();
            (geometry::axis(a, b), intervals, total)
        })
        .collect();
    sides.sort_by(|a, b| b.2.total_cmp(&a.2));
    let (axis, mut intervals, _) = sides.remove(0);
    intervals.sort_by(|a, b| {
        a.lo.total_cmp(&b.lo)
            .then(a.hi.total_cmp(&b.hi))
            .then(a.target.cmp(&b.target))
    });
    let mut seen = BTreeSet::new();
    if intervals.iter().any(|c| !seen.insert(c.target))
        || intervals.windows(2).any(|c| c[1].lo < c[0].hi - EPS)
    {
        return Some(Work::omit(
            &source.polygon,
            "Ambiguous or repeated side contacts",
        ));
    }
    let (start, end) = source
        .polygon
        .iter()
        .map(|&p| geometry::projection(p, axis))
        .fold((f64::INFINITY, f64::NEG_INFINITY), |(lo, hi), x| {
            (lo.min(x), hi.max(x))
        });
    let mut work = Work {
        split: true,
        ..Default::default()
    };
    let mut cursor = start;
    for contact in intervals {
        let lo = contact.lo.max(start);
        let hi = contact.hi.min(end);
        if lo - cursor > EPS {
            work.discard(
                geometry::slab(&source.polygon, axis, cursor, lo),
                "No shared long wall",
            );
        }
        cursor = hi;
        let part = geometry::slab(&source.polygon, axis, lo, hi);
        if (hi - lo) * 4.0 + EPS < profile.min_contact_m {
            work.discard(part, "Side contact shorter than the profile minimum");
            continue;
        }
        match assignment(city, ward, contact.target, part.clone(), profile) {
            Some(a) => work.assignments.push((contact.target, a)),
            None => work.discard(part, "Side union fails geometry, form or barrier checks"),
        }
    }
    if end - cursor > EPS {
        work.discard(
            geometry::slab(&source.polygon, axis, cursor, end),
            "No shared long wall",
        );
    }
    Some(work)
}
