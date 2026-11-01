//! Native, isolated building-core zoo. Synthetic demo inputs, not city generation.
use bevy::{
    input::mouse::{AccumulatedMouseMotion, AccumulatedMouseScroll},
    prelude::*,
    render::view::screenshot::{Screenshot, ScreenshotCaptured},
};
use building_core::{BuildingType, Design, REGISTRY, ResolvedProfile, Site, generate};
use city_bevy::building_adapter::spawn_design;
use serde::Deserialize;
use std::collections::BTreeMap;

const CORPUS: &str = include_str!("../../building_core/tests/fixtures/generation-v1.json");
const TOWN_CORPUS: &str = include_str!("../../building_core/tests/fixtures/townhouse-v1.json");
const DEMOS: &[(&str, &str, &str)] = &[
    (CORPUS, "standard", "rectangle"),
    (TOWN_CORPUS, "town_standard", "town_rectangle"),
];
#[derive(Deserialize, Resource)]
struct Demos {
    profiles: BTreeMap<String, ResolvedProfile>,
    sites: BTreeMap<String, Site>,
}
impl Demos {
    fn for_type(
        kind: BuildingType,
    ) -> Result<(Self, &'static str, &'static str), Box<dyn std::error::Error>> {
        for &(json, profile, site) in DEMOS {
            let demos: Self = serde_json::from_str(json)?;
            if demos.profiles.values().all(|p| p.building_type() == kind) {
                return Ok((demos, profile, site));
            }
        }
        Err("no demo corpus for catalog type".into())
    }
}
#[derive(Resource)]
struct Zoo {
    kind: BuildingType,
    profile: String,
    site: String,
    seed: u64,
    design: Result<Design, building_core::Rejection>,
    entities: Vec<Entity>,
    dirty: bool,
}
#[derive(Component)]
struct Status;
#[derive(Clone, Resource)]
struct Orbit {
    target: Vec3,
    yaw: f32,
    pitch: f32,
    distance: f32,
    initial: [f32; 3],
}
impl Orbit {
    fn for_site(site: &Site, view: &str) -> Self {
        let target = site
            .ground
            .iter()
            .fold(Vec3::ZERO, |s, p| s + Vec3::new(p.x as f32, 0., p.z as f32))
            / 4.
            + Vec3::Y * 2.;
        let a = site.ground[0];
        let b = site.ground[1];
        let rotation = (b.z - a.z).atan2(b.x - a.x) as f32;
        let (yaw, pitch) = match view {
            "rear" => (3.8, 0.62),
            "top" => (0.65, 1.50),
            _ => (0.65, 0.62),
        };
        let initial = [yaw - rotation, pitch, 29.];
        Self {
            target,
            yaw: initial[0],
            pitch: initial[1],
            distance: initial[2],
            initial,
        }
    }
    fn apply(&mut self, motion: Vec2, scroll: f32, reset: bool) {
        if reset {
            [self.yaw, self.pitch, self.distance] = self.initial;
        } else {
            self.yaw -= motion.x * 0.006;
            self.pitch = (self.pitch + motion.y * 0.006).clamp(0.15, 1.50);
            self.distance = (self.distance * (-scroll * 0.06).exp()).clamp(10., 80.);
        }
    }
    fn transform(&self) -> Transform {
        let dir = Vec3::new(
            self.yaw.sin() * self.pitch.cos(),
            self.pitch.sin(),
            self.yaw.cos() * self.pitch.cos(),
        );
        Transform::from_translation(self.target + dir * self.distance)
            .looking_at(self.target, Vec3::Y)
    }
}
#[derive(Resource, Default)]
struct Capture {
    path: Option<String>,
    image: Option<Handle<Image>>,
    smoke: bool,
    interaction: bool,
    interaction_stage: u8,
    interaction_initial: Option<(u64, String, String, Orbit)>,
    frames: u32,
    ready: bool,
    requested: bool,
    completed: bool,
    failed: bool,
}
struct Readiness;
impl Plugin for Readiness {
    fn build(&self, app: &mut App) {
        app.sub_app_mut(bevy::render::RenderApp).add_systems(
            bevy::render::ExtractSchedule,
            |mut main: ResMut<bevy::render::MainWorld>,
             cache: Res<bevy::render::render_resource::PipelineCache>| {
                if let Some(mut c) = main.get_resource_mut::<Capture>() {
                    c.ready =
                        cache.pipelines().count() > 0 && cache.waiting_pipelines().count() == 0;
                }
            },
        );
    }
}
fn main() {
    if let Err(e) = run() {
        eprintln!("{e}");
        std::process::exit(1);
    }
}
fn run() -> Result<(), Box<dyn std::error::Error>> {
    let mut kind = REGISTRY[0].0;
    let mut profile = String::new();
    let mut site = String::new();
    let mut help = false;
    let mut seed = 7;
    let mut view = "oblique".to_string();
    let mut capture = Capture::default();
    let mut export = None;
    let mut geometry_only = false;
    let mut args = std::env::args().skip(1);
    while let Some(arg) = args.next() {
        match arg.as_str() {
            "--type" => {
                let name = args.next().ok_or("--type requires a name")?;
                kind = REGISTRY
                    .iter()
                    .find(|(_, s)| *s == name)
                    .ok_or("unknown building type")?
                    .0;
            }
            "--profile" => profile = args.next().ok_or("--profile requires a name")?,
            "--site" => site = args.next().ok_or("--site requires a name")?,
            "--seed" => seed = args.next().ok_or("--seed requires an integer")?.parse()?,
            "--camera" => {
                view = args
                    .next()
                    .ok_or("--camera requires oblique, rear or top")?
            }
            "--screenshot" => {
                capture.path = Some(args.next().ok_or("--screenshot requires a PNG path")?)
            }
            "--smoke-test" => capture.smoke = true,
            "--interaction-smoke" => {
                capture.smoke = true;
                capture.interaction = true;
            }
            "--export" => export = Some(args.next().ok_or("--export requires a JSON path")?),
            "--geometry-only" => geometry_only = true,
            "--help" | "-h" => help = true,
            _ => return Err(format!("unknown argument {arg}").into()),
        }
    }
    let (demos, default_profile, default_site) = Demos::for_type(kind)?;
    if profile.is_empty() {
        profile = default_profile.into();
    }
    if site.is_empty() {
        site = default_site.into();
    }
    if help {
        println!(
            "cargo run -p city_bevy --example building_zoo -- [--type NAME] [--profile NAME] [--site NAME] [--seed N] [--camera oblique|rear|top] [--screenshot FILE.png --smoke-test] [--interaction-smoke] [--export FILE.json] [--geometry-only]\nTypes: {:?}\nProfiles for {kind:?}: {:?}\nSites: {:?}\nRight drag: orbit; wheel: zoom; Home: reset; N: next seed; P: next profile; B: next site; Escape: quit",
            REGISTRY.iter().map(|(_, name)| name).collect::<Vec<_>>(),
            demos.profiles.keys().collect::<Vec<_>>(),
            demos.sites.keys().collect::<Vec<_>>()
        );
        return Ok(());
    }
    if !["oblique", "rear", "top"].contains(&view.as_str()) {
        return Err("unknown camera view".into());
    }
    if capture.smoke && capture.path.is_none() {
        return Err("--smoke-test requires --screenshot".into());
    }
    let s = demos.sites.get(&site).ok_or("unknown site")?;
    let p = demos.profiles.get(&profile).ok_or("unknown profile")?;
    let design = generate(kind, s, p, seed);
    println!(
        "type={kind:?} profile={profile} site={site} seed={seed}: {}",
        match &design {
            Ok(d) => format!("{} parts; {:?}", d.parts.len(), d.notes),
            Err(e) => e.to_string(),
        }
    );
    if let Some(path) = export {
        let data = serde_json::json!({"corpus_version":1,"type":kind,"profile_name":profile,"site_name":site,"seed":seed,"profile":p,"site":s,"result":design});
        std::fs::write(path, serde_json::to_vec_pretty(&data)?)?;
    }
    if geometry_only {
        design?;
        return Ok(());
    }
    let orbit = Orbit::for_site(s, &view);
    let exit = App::new()
        .add_plugins(
            DefaultPlugins
                .set(bevy::render::RenderPlugin {
                    synchronous_pipeline_compilation: capture.smoke,
                    ..default()
                })
                // Avoid the observed pipelined-render teardown stall in this
                // isolated zoo; interactive and capture modes use the same path.
                .disable::<bevy::render::pipelined_rendering::PipelinedRenderingPlugin>()
                .set(WindowPlugin {
                    primary_window: Some(Window {
                        title: "building_core · synthetic prototype zoo".into(),
                        resolution: (1200, 900).into(),
                        visible: !capture.smoke,
                        ..default()
                    }),
                    ..default()
                }),
        )
        .add_plugins(Readiness)
        .insert_resource(ClearColor(Color::srgb_u8(224, 225, 211)))
        .insert_resource(GlobalAmbientLight {
            brightness: 300.,
            ..default()
        })
        .insert_resource(Zoo {
            kind,
            profile,
            site,
            seed,
            design,
            entities: vec![],
            dirty: true,
        })
        .insert_resource(orbit)
        .insert_resource(demos)
        .insert_resource(capture)
        .add_systems(Startup, setup)
        .add_systems(
            Update,
            (
                inject_interaction,
                controls,
                draw,
                update_camera,
                capture_frame,
            )
                .chain(),
        )
        .run();
    if exit.is_error() {
        return Err("building zoo exited unsuccessfully (capture failure or timeout)".into());
    }
    Ok(())
}
fn setup(
    mut commands: Commands,
    mut images: ResMut<Assets<Image>>,
    mut capture: ResMut<Capture>,
    orbit: Res<Orbit>,
) {
    let target = if capture.smoke {
        let image = images.add(Image::new_target_texture(
            1200,
            900,
            bevy::render::render_resource::TextureFormat::Rgba8UnormSrgb,
            None,
        ));
        capture.image = Some(image.clone());
        bevy::camera::RenderTarget::Image(image.into())
    } else {
        bevy::camera::RenderTarget::default()
    };
    commands.spawn((
        Camera3d::default(),
        IsDefaultUiCamera,
        target,
        orbit.transform(),
    ));
    commands.spawn((
        DirectionalLight {
            illuminance: 10000.,
            shadow_maps_enabled: true,
            ..default()
        },
        Transform::from_rotation(Quat::from_euler(EulerRot::XYZ, -0.95, -0.6, 0.)),
    ));
    commands.spawn((
        Status,
        Text::new(""),
        TextFont {
            font_size: FontSize::Px(17.),
            ..default()
        },
        TextColor(Color::srgb_u8(35, 43, 40)),
        Node {
            position_type: PositionType::Absolute,
            left: px(18),
            top: px(16),
            ..default()
        },
    ));
}
fn next_key<T>(items: &BTreeMap<String, T>, current: &str) -> String {
    let keys: Vec<_> = items.keys().collect();
    keys[(keys.iter().position(|s| s.as_str() == current).unwrap() + 1) % keys.len()].clone()
}
fn controls(
    keys: Res<ButtonInput<KeyCode>>,
    buttons: Res<ButtonInput<MouseButton>>,
    motion: Res<AccumulatedMouseMotion>,
    scroll: Res<AccumulatedMouseScroll>,
    demos: Res<Demos>,
    mut zoo: ResMut<Zoo>,
    mut orbit: ResMut<Orbit>,
    capture: Res<Capture>,
    mut exit: MessageWriter<AppExit>,
) {
    // Automated capture ignores desktop input except the deterministic injection.
    if capture.smoke && !capture.interaction {
        return;
    }
    if keys.just_pressed(KeyCode::Escape) {
        exit.write(AppExit::Success);
    }
    let mut changed = false;
    if keys.just_pressed(KeyCode::KeyN) {
        zoo.seed = zoo.seed.wrapping_add(1);
        changed = true;
    }
    if keys.just_pressed(KeyCode::KeyP) {
        zoo.profile = next_key(&demos.profiles, &zoo.profile);
        changed = true;
    }
    if keys.just_pressed(KeyCode::KeyB) {
        zoo.site = next_key(&demos.sites, &zoo.site);
        *orbit = Orbit::for_site(&demos.sites[&zoo.site], "oblique");
        changed = true;
    }
    if changed {
        zoo.design = generate(
            zoo.kind,
            &demos.sites[&zoo.site],
            &demos.profiles[&zoo.profile],
            zoo.seed,
        );
        zoo.dirty = true;
    }
    orbit.apply(
        if buttons.pressed(MouseButton::Right) {
            motion.delta
        } else {
            Vec2::ZERO
        },
        scroll.delta.y,
        keys.just_pressed(KeyCode::Home),
    );
}
fn draw(
    mut commands: Commands,
    mut zoo: ResMut<Zoo>,
    demos: Res<Demos>,
    mut meshes: ResMut<Assets<Mesh>>,
    mut materials: ResMut<Assets<StandardMaterial>>,
    mut status: Query<&mut Text, With<Status>>,
) {
    if !zoo.dirty {
        return;
    }
    zoo.dirty = false;
    for entity in zoo.entities.drain(..) {
        commands.entity(entity).despawn();
    }
    if let Ok(design) = &zoo.design {
        zoo.entities = spawn_design(&mut commands, &mut meshes, &mut materials, design);
    }
    let site = &demos.sites[&zoo.site];
    let min_x = site
        .ground
        .iter()
        .map(|p| p.x as f32)
        .fold(f32::INFINITY, f32::min)
        - 2.;
    let max_x = site
        .ground
        .iter()
        .map(|p| p.x as f32)
        .fold(f32::NEG_INFINITY, f32::max)
        + 2.;
    let min_z = site
        .ground
        .iter()
        .map(|p| p.z as f32)
        .fold(f32::INFINITY, f32::min)
        - 2.;
    let max_z = site
        .ground
        .iter()
        .map(|p| p.z as f32)
        .fold(f32::NEG_INFINITY, f32::max)
        + 2.;
    zoo.entities.push(
        commands
            .spawn((
                Mesh3d(meshes.add(Plane3d::default().mesh().size(max_x - min_x, max_z - min_z))),
                MeshMaterial3d(materials.add(Color::srgb_u8(182, 192, 166))),
                Transform::from_xyz((min_x + max_x) / 2., -0.04, (min_z + max_z) / 2.),
            ))
            .id(),
    );
    let message = match &zoo.design {
        Ok(d) => format!("{} parts; {}", d.parts.len(), d.notes.join("; ")),
        Err(e) => e.to_string(),
    };
    for mut text in &mut status {
        text.0 = format!(
            "Synthetic prototype | {:?}\n{} / {} / seed {} | {}\nRight drag: orbit | Wheel: zoom | Home: reset | N: seed | P: profile | B: site",
            zoo.kind, zoo.profile, zoo.site, zoo.seed, message
        );
    }
}
fn update_camera(
    orbit: Res<Orbit>,
    mut cameras: Query<&mut Transform, With<Camera3d>>,
    mut gizmos: Gizmos,
    demos: Res<Demos>,
    zoo: Res<Zoo>,
) {
    for mut transform in &mut cameras {
        *transform = orbit.transform();
    }
    let site = &demos.sites[&zoo.site];
    for (ring, color) in std::iter::once((&site.ground, Color::srgb_u8(55, 80, 55))).chain(
        site.access
            .iter()
            .map(|a| (&a.footprint, Color::srgb_u8(180, 60, 45))),
    ) {
        for i in 0..ring.len() {
            let a = ring[i];
            let b = ring[(i + 1) % ring.len()];
            gizmos.line(
                Vec3::new(a.x as f32, 0.02, a.z as f32),
                Vec3::new(b.x as f32, 0.02, b.z as f32),
                color,
            );
        }
    }
}
fn inject_interaction(
    mut c: ResMut<Capture>,
    mut keys: ResMut<ButtonInput<KeyCode>>,
    mut buttons: ResMut<ButtonInput<MouseButton>>,
    mut motion: ResMut<AccumulatedMouseMotion>,
    mut scroll: ResMut<AccumulatedMouseScroll>,
    mut orbit: ResMut<Orbit>,
    mut zoo: ResMut<Zoo>,
    demos: Res<Demos>,
    cameras: Query<&Transform, With<Camera3d>>,
) {
    if !c.interaction {
        return;
    }
    keys.reset_all();
    buttons.reset_all();
    motion.delta = Vec2::ZERO;
    scroll.delta = Vec2::ZERO;
    match c.interaction_stage {
        0 if c.frames >= 20 => {
            c.interaction_initial = Some((
                zoo.seed,
                zoo.profile.clone(),
                zoo.site.clone(),
                orbit.clone(),
            ));
            buttons.press(MouseButton::Right);
            motion.delta = Vec2::new(40., 20.);
            scroll.delta.y = 2.;
            c.interaction_stage = 1;
        }
        1 => {
            assert!((orbit.yaw - (orbit.initial[0] - 0.24)).abs() < 1e-5);
            assert!((orbit.pitch - (orbit.initial[1] + 0.12).min(1.5)).abs() < 1e-5);
            assert!(orbit.distance < orbit.initial[2]);
            assert_eq!(*cameras.single().unwrap(), orbit.transform());
            keys.press(KeyCode::Home);
            c.interaction_stage = 2;
            info!("INTERACTION: injected right-drag and wheel changed the real camera");
        }
        2 => {
            assert_eq!([orbit.yaw, orbit.pitch, orbit.distance], orbit.initial);
            assert_eq!(*cameras.single().unwrap(), orbit.transform());
            keys.press(KeyCode::KeyN);
            c.interaction_stage = 3;
            info!("INTERACTION: Home restored the fixed camera");
        }
        3 => {
            assert_eq!(
                zoo.seed,
                c.interaction_initial.as_ref().unwrap().0.wrapping_add(1)
            );
            assert_eq!(
                zoo.design,
                generate(
                    zoo.kind,
                    &demos.sites[&zoo.site],
                    &demos.profiles[&zoo.profile],
                    zoo.seed
                )
            );
            keys.press(KeyCode::KeyP);
            c.interaction_stage = 4;
            info!("INTERACTION: N regenerated the next deterministic seed");
        }
        4 => {
            assert_eq!(
                zoo.profile,
                next_key(&demos.profiles, &c.interaction_initial.as_ref().unwrap().1)
            );
            assert_eq!(
                zoo.design,
                generate(
                    zoo.kind,
                    &demos.sites[&zoo.site],
                    &demos.profiles[&zoo.profile],
                    zoo.seed
                )
            );
            keys.press(KeyCode::KeyB);
            c.interaction_stage = 5;
            info!("INTERACTION: P selected and regenerated the next profile");
        }
        5 => {
            assert_eq!(
                zoo.site,
                next_key(&demos.sites, &c.interaction_initial.as_ref().unwrap().2)
            );
            assert_eq!(
                zoo.design,
                generate(
                    zoo.kind,
                    &demos.sites[&zoo.site],
                    &demos.profiles[&zoo.profile],
                    zoo.seed
                )
            );
            info!(
                "INTERACTION: B selected and regenerated the next site; result {:?}",
                zoo.design
            );
            let (seed, profile, site, original_orbit) = c.interaction_initial.take().unwrap();
            zoo.seed = seed;
            zoo.profile = profile;
            zoo.site = site;
            zoo.design = generate(
                zoo.kind,
                &demos.sites[&zoo.site],
                &demos.profiles[&zoo.profile],
                zoo.seed,
            );
            zoo.dirty = true;
            *orbit = original_orbit;
            c.interaction_stage = 6;
            info!("INTERACTION: restored exact CLI inputs and camera before capture");
        }
        _ => {}
    }
}
fn capture_frame(
    mut commands: Commands,
    mut c: ResMut<Capture>,
    time: Res<Time<Real>>,
    mut exit: MessageWriter<AppExit>,
) {
    c.frames += 1;
    if c.path.is_some() && !c.requested && c.ready && c.frames > 180 && time.elapsed_secs() > 8. {
        c.requested = true;
        let path = c.path.clone().unwrap();
        let shot = match c.image.clone() {
            Some(image) => Screenshot::image(image),
            None => Screenshot::primary_window(),
        };
        commands.spawn(shot).observe(
            move |event: On<ScreenshotCaptured>, mut c: ResMut<Capture>| {
                let content = event.image.data.as_deref().is_some_and(|data| {
                    data.len() > 4 && data.chunks_exact(4).any(|p| p[..3] != data[..3])
                });
                let result = (|| -> Result<(), Box<dyn std::error::Error>> {
                    if !content {
                        return Err("empty render".into());
                    }
                    if let Some(parent) = std::path::Path::new(&path).parent()
                        && !parent.as_os_str().is_empty()
                    {
                        std::fs::create_dir_all(parent)?;
                    }
                    event.image.clone().try_into_dynamic()?.save(&path)?;
                    Ok(())
                })();
                c.failed = result.is_err();
                c.completed = true;
                match result {
                    Ok(()) => info!("CAPTURE saved {path}"),
                    Err(e) => error!("CAPTURE failed: {e}"),
                };
            },
        );
    }
    if c.smoke && time.elapsed_secs() > 60. && !c.completed {
        error!("CAPTURE timeout");
        exit.write(AppExit::error());
    }
    if c.smoke && c.completed {
        exit.write(if c.failed {
            AppExit::error()
        } else {
            AppExit::Success
        });
    }
}
#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn orbit_reset_and_zoom_limits() {
        let demos: Demos = serde_json::from_str(CORPUS).unwrap();
        let mut o = Orbit::for_site(&demos.sites["rectangle"], "oblique");
        let original = o.transform();
        o.apply(Vec2::new(100., -50.), 5., false);
        assert_ne!(o.transform(), original);
        o.apply(Vec2::ZERO, 0., true);
        assert_eq!(o.transform(), original);
        o.apply(Vec2::new(0., 1e6), -1e6, false);
        assert_eq!(o.pitch, 1.5);
        assert_eq!(o.distance, 80.);
    }
    #[test]
    fn cli_demo_corpus_and_selection_are_shared() {
        let demos: Demos = serde_json::from_str(CORPUS).unwrap();
        assert_eq!(REGISTRY.len(), 2);
        for &(kind, _) in REGISTRY {
            let (demos, profile, site) = Demos::for_type(kind).unwrap();
            assert!(generate(kind, &demos.sites[site], &demos.profiles[profile], 7).is_ok());
            assert!(demos.profiles.values().all(|p| p.building_type() == kind));
        }
        assert_eq!(next_key(&demos.profiles, "standard"), "access");
        assert!(
            generate(
                REGISTRY[0].0,
                &demos.sites["rectangle"],
                &demos.profiles["standard"],
                7
            )
            .is_ok()
        );
    }
}
