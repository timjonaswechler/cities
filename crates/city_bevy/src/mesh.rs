use bevy::{
    asset::RenderAssetUsages, mesh::Indices, prelude::*, render::render_resource::PrimitiveTopology,
};
use city_core::{BuildingOrigin, City, MarketPlan, Point, Polygon};
use std::collections::BTreeMap;

/// One original map unit is four metres. Conversion to f32 happens only here.
const SCALE: f64 = 4.0;
#[derive(Default)]
struct Geometry {
    positions: Vec<[f32; 3]>,
    normals: Vec<[f32; 3]>,
    indices: Vec<u32>,
}
impl Geometry {
    fn triangle(&mut self, a: Vec3, b: Vec3, c: Vec3) {
        let n = (b - a).cross(c - a);
        if n.length_squared() < 1e-12 {
            return;
        }
        let n = n.normalize().to_array();
        let start = self.positions.len() as u32;
        self.positions
            .extend([a.to_array(), b.to_array(), c.to_array()]);
        self.normals.extend([n; 3]);
        self.indices.extend([start, start + 1, start + 2]);
    }
    fn polygon(&mut self, points: &[Point], height: f64) {
        for [a, b, c] in triangulate(points) {
            let (a, mut b, mut c) = (
                world(points[a], height),
                world(points[b], height),
                world(points[c], height),
            );
            if (b - a).cross(c - a).y < 0.0 {
                std::mem::swap(&mut b, &mut c);
            }
            self.triangle(a, b, c);
        }
    }
    fn prism(&mut self, points: &[Point], bottom: f64, top: f64) {
        self.polygon(points, top);
        if points.len() < 3 {
            return;
        }
        let clockwise = signed_area(points) < 0.0;
        for i in 0..points.len() {
            let p = points[i];
            let q = points[(i + 1) % points.len()];
            let (mut a, mut b) = (world(p, bottom), world(q, bottom));
            let (mut c, mut d) = (world(q, top), world(p, top));
            if !clockwise {
                std::mem::swap(&mut a, &mut b);
                std::mem::swap(&mut c, &mut d);
            }
            self.triangle(a, b, c);
            self.triangle(a, c, d);
        }
    }
    fn path(&mut self, points: &[Point], width: f64, height: f64) {
        for pair in points.windows(2) {
            let d = pair[1].minus(pair[0]);
            if d.length() < 1e-9 {
                continue;
            }
            let n = Point { x: -d.y, y: d.x }.normalized(width / 2.0);
            self.polygon(
                &[
                    pair[0].plus(n),
                    pair[0].minus(n),
                    pair[1].minus(n),
                    pair[1].plus(n),
                ],
                height,
            );
        }
    }
    fn mesh(self) -> Mesh {
        let uv = vec![[0.0, 0.0]; self.positions.len()];
        Mesh::new(
            PrimitiveTopology::TriangleList,
            RenderAssetUsages::default(),
        )
        .with_inserted_attribute(Mesh::ATTRIBUTE_POSITION, self.positions)
        .with_inserted_attribute(Mesh::ATTRIBUTE_NORMAL, self.normals)
        .with_inserted_attribute(Mesh::ATTRIBUTE_UV_0, uv)
        .with_inserted_indices(Indices::U32(self.indices))
    }
}
fn world(p: Point, height: f64) -> Vec3 {
    Vec3::new((p.x * SCALE) as f32, height as f32, (p.y * SCALE) as f32)
}
fn signed_area(p: &[Point]) -> f64 {
    (0..p.len())
        .map(|i| {
            let q = p[(i + 1) % p.len()];
            p[i].x * q.y - q.x * p[i].y
        })
        .sum::<f64>()
        / 2.0
}
fn cross(a: Point, b: Point, c: Point) -> f64 {
    (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x)
}
fn triangulate(p: &[Point]) -> Vec<[usize; 3]> {
    if p.len() < 3 {
        return vec![];
    }
    let mut ring: Vec<_> = (0..p.len()).collect();
    if signed_area(p) < 0.0 {
        ring.reverse();
    }
    let mut triangles = vec![];
    while ring.len() > 3 {
        let mut found = false;
        for i in 0..ring.len() {
            let a = ring[(i + ring.len() - 1) % ring.len()];
            let b = ring[i];
            let c = ring[(i + 1) % ring.len()];
            let area = cross(p[a], p[b], p[c]);
            if area.abs() < 1e-10 {
                ring.remove(i);
                found = true;
                break;
            }
            if area < 0.0 {
                continue;
            }
            if ring.iter().any(|&j| {
                j != a
                    && j != b
                    && j != c
                    && cross(p[a], p[b], p[j]) > 1e-10
                    && cross(p[b], p[c], p[j]) > 1e-10
                    && cross(p[c], p[a], p[j]) > 1e-10
            }) {
                continue;
            }
            triangles.push([a, b, c]);
            ring.remove(i);
            found = true;
            break;
        }
        if !found {
            break;
        }
    }
    if ring.len() == 3 {
        triangles.push([ring[0], ring[1], ring[2]]);
    }
    triangles
}
fn disk(p: Point, r: f64) -> Polygon {
    (0..16)
        .map(|i| {
            let a = i as f64 * std::f64::consts::TAU / 16.0;
            p.plus(Point {
                x: a.cos() * r,
                y: a.sin() * r,
            })
        })
        .collect()
}
fn segment(p: Point, q: Point, width: f64) -> Polygon {
    let d = q.minus(p);
    let n = Point { x: -d.y, y: d.x }.normalized(width / 2.0);
    vec![p.plus(n), p.minus(n), q.minus(n), q.plus(n)]
}

#[derive(Clone, Copy)]
pub struct MarketView {
    pub routes: u8,
    pub districts: bool,
}
impl Default for MarketView {
    fn default() -> Self {
        Self {
            routes: 1,
            districts: true,
        }
    }
}
#[derive(Clone, Copy, Component)]
pub enum MarketLayer {
    MainRoutes,
    PairRoutes,
    Districts,
}
impl MarketLayer {
    pub fn visible(self, view: &MarketView) -> bool {
        match self {
            Self::MainRoutes => view.routes >= 1,
            Self::PairRoutes => view.routes >= 2,
            Self::Districts => view.districts,
        }
    }
}
fn market_color(i: usize) -> Color {
    let [r, g, b] = [
        [179, 145, 112],
        [201, 154, 52],
        [97, 152, 179],
        [103, 156, 119],
        [153, 128, 174],
        [196, 120, 105],
        [184, 184, 170],
    ][i];
    Color::srgb_u8(r, g, b)
}
#[derive(Component)]
pub struct MarketPinLabel(pub Vec3);
#[derive(Component)]
pub struct CityMesh;
pub fn spawn_city(
    commands: &mut Commands,
    meshes: &mut Assets<Mesh>,
    materials: &mut Assets<StandardMaterial>,
    city: &City,
    economy: Option<&MarketPlan>,
    view: &MarketView,
    origins: Option<&[BuildingOrigin]>,
) {
    let style_indices: BTreeMap<_, _> = origins
        .into_iter()
        .flatten()
        .map(|o| ((o.ward_id, o.building_index), o.original_building_index))
        .collect();
    let mut land = Geometry::default();
    let mut water = Geometry::default();
    let mut road = Geometry::default();
    let mut walls = Geometry::default();
    let mut trees = Geometry::default();
    let mut farms = Geometry::default();
    let mut houses: [Geometry; 4] = std::array::from_fn(|_| Geometry::default());
    let uses: BTreeMap<_, _> = economy
        .into_iter()
        .flat_map(|e| &e.buildings)
        .map(|b| ((b.ward_id, b.building_index), b.market))
        .collect();
    let mut economic_roofs: [Geometry; 7] = std::array::from_fn(|_| Geometry::default());
    let mut market_markers: [Geometry; 6] = std::array::from_fn(|_| Geometry::default());
    let mut main_market = Geometry::default();
    let mut main_routes = Geometry::default();
    let mut pair_routes = Geometry::default();
    let mut districts = Geometry::default();
    let mut landmarks = Geometry::default();
    let mut sides = Geometry::default();
    let original = &city.original_geometry;
    let radius = city.bounds.width.max(city.bounds.height) * 0.8;
    land.polygon(
        &[
            Point {
                x: -radius,
                y: -radius,
            },
            Point {
                x: radius,
                y: -radius,
            },
            Point {
                x: radius,
                y: radius,
            },
            Point {
                x: -radius,
                y: radius,
            },
        ],
        -0.5,
    );
    water.polygon(&city.coast, 0.0);
    for field in &city.fields {
        farms.polygon(field, 0.03);
    }
    for line in &original.furrows {
        road.path(line, 0.12, 0.05);
    }
    for r in &original.roads {
        road.path(&r.path, 2.0, 0.12);
    }
    for river in &original.rivers {
        water.path(&river.path, river.width, 0.18);
        for bridge in &river.bridges {
            road.path(&bridge.path, bridge.width, 0.35);
        }
    }
    for pier in &original.piers {
        road.path(pier, 1.3, 0.4);
    }
    for ward in &city.wards {
        if let Some(space) = &ward.market_space {
            road.polygon(space, 0.15);
            if economy.is_some() {
                main_market.polygon(space, 0.20);
            }
        }
        for (i, building) in ward.buildings.iter().enumerate() {
            let original_index = style_indices.get(&(ward.id, i)).copied().unwrap_or(i);
            let bucket = (ward.seed as usize + original_index * 31) % 4;
            let height = match building.role.as_str() {
                "castle" => 28.0,
                "temple" | "church" => 23.0,
                "monument" => 7.0,
                "farm" => 7.5,
                _ => 9.0 + bucket as f64 * 1.5,
            };
            sides.prism(&building.polygon, 0.15, height);
            if building.landmark {
                landmarks.polygon(&building.polygon, height + 0.02);
            } else {
                let use_index = uses.get(&(ward.id, i)).map(|market| market.unwrap_or(6));
                if let Some(i) = use_index {
                    economic_roofs[i].polygon(&building.polygon, height + 0.03);
                } else {
                    houses[bucket].polygon(&building.polygon, height + 0.02);
                }
            }
        }
    }
    if let Some(plan) = economy {
        for (i, site) in plan.markets.iter().enumerate() {
            commands.spawn((
                CityMesh,
                MarketPinLabel(world(site.position, 36.0)),
                Text::new(if site.proposed {
                    format!("M{i}")
                } else {
                    "H".into()
                }),
                TextFont {
                    font_size: FontSize::Px(13.0),
                    ..default()
                },
                TextColor(Color::srgb_u8(245, 239, 215)),
                BackgroundColor(Color::srgba(0.12, 0.16, 0.14, 0.94)),
                Node {
                    position_type: PositionType::Absolute,
                    padding: UiRect::all(px(3)),
                    border_radius: BorderRadius::all(px(3)),
                    ..default()
                },
            ));
        }
        for (i, site) in plan.markets.iter().enumerate().filter(|(_, m)| m.proposed) {
            // Pins are proposals, not cleared plazas.
            market_markers[i].prism(&disk(site.position, 0.3), 0.5, 30.0);
            market_markers[i].prism(&disk(site.position, 2.0), 30.0, 33.0);
            main_routes.path(&site.route, 0.35, 0.50);
        }
        for pair in &plan.pairs {
            pair_routes.path(&pair.route, 0.25, 0.55);
        }
        for district in &original.districts {
            let mut ring = district.polygon.clone();
            if let Some(&p) = ring.first() {
                ring.push(p);
            }
            districts.path(&ring, 0.13, 0.40);
        }
    }
    for wall in &original.walls {
        for edge in &wall.segments {
            if edge.len() == 2 {
                walls.prism(&segment(edge[0], edge[1], wall.thickness), 0.15, 18.0);
            }
        }
        for &tower in &wall.towers {
            walls.prism(&disk(tower, wall.tower_radius), 0.15, 25.0);
        }
        for gate in &wall.gates {
            for &p in gate {
                walls.prism(&disk(p, wall.tower_radius * 0.8), 0.15, 24.0);
            }
        }
    }
    for crown in &original.tree_crowns {
        trees.prism(crown, 0.2, 6.0);
    }
    let mut layers = vec![
        (land, Color::srgb_u8(210, 208, 176)),
        (farms, Color::srgb_u8(188, 182, 139)),
        (water, Color::srgb_u8(106, 146, 151)),
        (road, Color::srgb_u8(231, 223, 199)),
        (sides, Color::srgb_u8(188, 174, 144)),
        (walls, Color::srgb_u8(121, 121, 105)),
        (landmarks, Color::srgb_u8(104, 125, 126)),
        (trees, Color::srgb_u8(119, 145, 103)),
        (main_market, Color::srgb_u8(228, 207, 140)),
    ];
    for (i, g) in houses.into_iter().enumerate() {
        layers.push((
            g,
            [
                Color::srgb_u8(153, 119, 97),
                Color::srgb_u8(171, 137, 112),
                Color::srgb_u8(140, 119, 101),
                Color::srgb_u8(183, 148, 117),
            ][i],
        ));
    }
    for (i, geometry) in economic_roofs.into_iter().enumerate() {
        layers.push((geometry, market_color(i)));
    }
    for (i, geometry) in market_markers.into_iter().enumerate() {
        layers.push((geometry, market_color(i)));
    }
    for (geometry, color) in layers {
        if geometry.positions.is_empty() {
            continue;
        }
        commands.spawn((
            CityMesh,
            Mesh3d(meshes.add(geometry.mesh())),
            MeshMaterial3d(materials.add(StandardMaterial {
                base_color: color,
                perceptual_roughness: 1.0,
                ..default()
            })),
        ));
    }
    for (geometry, color, layer) in [
        (
            main_routes,
            Color::srgb_u8(154, 97, 52),
            MarketLayer::MainRoutes,
        ),
        (
            pair_routes,
            Color::srgb_u8(79, 122, 155),
            MarketLayer::PairRoutes,
        ),
        (
            districts,
            Color::srgb_u8(90, 115, 96),
            MarketLayer::Districts,
        ),
    ] {
        if geometry.positions.is_empty() {
            continue;
        }
        commands.spawn((
            CityMesh,
            layer,
            if layer.visible(view) {
                Visibility::Visible
            } else {
                Visibility::Hidden
            },
            Mesh3d(meshes.add(geometry.mesh())),
            MeshMaterial3d(materials.add(StandardMaterial {
                base_color: color,
                perceptual_roughness: 1.0,
                ..default()
            })),
        ));
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn concave_roof_covers_footprint() {
        let p = vec![
            Point { x: 0., y: 0. },
            Point { x: 4., y: 0. },
            Point { x: 4., y: 1. },
            Point { x: 1., y: 1. },
            Point { x: 1., y: 4. },
            Point { x: 0., y: 4. },
        ];
        let triangles = triangulate(&p);
        assert_eq!(triangles.len(), 4);
        let area: f64 = triangles
            .iter()
            .map(|t| cross(p[t[0]], p[t[1]], p[t[2]]).abs() / 2.0)
            .sum();
        assert_eq!(area, 7.0);
        let mut reversed = p;
        reversed.reverse();
        let area: f64 = triangulate(&reversed)
            .iter()
            .map(|t| cross(reversed[t[0]], reversed[t[1]], reversed[t[2]]).abs() / 2.0)
            .sum();
        assert_eq!(area, 7.0);
    }
    #[test]
    fn triangle_normals_and_indices_are_finite() {
        let mut g = Geometry::default();
        g.prism(&disk(Point::default(), 1.9), 0., 18.);
        assert!(g.positions.iter().flatten().all(|v| v.is_finite()));
        assert_eq!(g.positions.len(), g.normals.len());
        assert!(
            g.normals
                .iter()
                .all(|n| (Vec3::from_array(*n).length() - 1.).abs() < 1e-5)
        );
        assert!(g.indices.iter().all(|&i| i < (g.positions.len() as u32)));
    }
}
