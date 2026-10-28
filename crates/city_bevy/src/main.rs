mod mesh;
use bevy::{
    input::{
        ButtonState,
        keyboard::{Key, KeyboardInput},
        mouse::{AccumulatedMouseMotion, AccumulatedMouseScroll},
    },
    picking::hover::Hovered,
    prelude::*,
    render::view::screenshot::{Screenshot, ScreenshotCaptured, save_to_disk},
    ui_widgets::{Activate, Button},
};
use city_core::{
    City, CityOptions, GenerationError, MarketPlan, MarketProfile, generate_city,
    generate_snapshot, plan_markets,
};
use std::sync::{Mutex, mpsc};

#[derive(Resource)]
struct CityState {
    city: City,
    options: CityOptions,
    message: String,
    job: Option<Mutex<mpsc::Receiver<Result<GeneratedCity, GenerationError>>>>,
    seed_edit: Option<String>,
    economy_enabled: bool,
    economy: Option<MarketPlan>,
    market_profile: MarketProfile,
    market_settings: bool,
    market_view: mesh::MarketView,
}
struct GeneratedCity {
    city: City,
    economy: Option<MarketPlan>,
}
fn generate_view(
    options: &CityOptions,
    economy: bool,
    profile: &MarketProfile,
) -> Result<GeneratedCity, GenerationError> {
    profile.validate()?;
    let city = generate_city(options)?;
    let economy = if economy {
        Some(plan_markets(&city, profile, &[])?)
    } else {
        None
    };
    Ok(GeneratedCity { city, economy })
}
#[derive(Resource, Default)]
struct Actions(Vec<Action>);
#[derive(Clone, Copy, Component)]
enum Action {
    New,
    Rebuild,
    Smaller,
    Larger,
    Seed,
    Gates,
    Feature(usize),
    Economy,
    MarketSettings,
    MarketParam(MarketParameter, i8),
    MarketDefaults,
    SaveMarketProfile,
    MarketRoutes,
    MarketDistricts,
    Top,
    Reset,
    Json,
    Png,
}
#[derive(Clone, Copy)]
enum MarketParameter {
    Main,
    Secondary,
    Service,
    District,
    Beneficiaries,
    Maximum,
}
impl MarketParameter {
    fn adjust(self, p: &mut MarketProfile, delta: i8) {
        let d = delta as f64;
        match self {
            Self::Main => p.main_min = (p.main_min + d * 20.0).clamp(0.0, 500.0),
            Self::Secondary => p.side_min = (p.side_min + d * 20.0).clamp(0.0, 400.0),
            Self::Service => p.service = (p.service + d * 20.0).clamp(80.0, 400.0),
            Self::District => p.district_weight = (p.district_weight + d * 0.5).clamp(0.0, 2.0),
            Self::Beneficiaries => {
                p.min_beneficiaries =
                    (p.min_beneficiaries as i64 + delta as i64).clamp(1, 100) as usize
            }
            Self::Maximum => {
                p.max_markets = (p.max_markets as i64 + delta as i64).clamp(0, 5) as usize
            }
        }
        p.name = "Marktplanung V1 (angepasst)".into();
    }
    fn label(self, p: &MarketProfile) -> String {
        match self {
            Self::Main => format!("Hauptmarkt: {:.0} m", p.main_min),
            Self::Secondary => format!("Nebenmärkte: {:.0} m", p.side_min),
            Self::Service => format!("Versorgung: {:.0} m", p.service),
            Self::District => format!("Distriktgewicht: {:.1}", p.district_weight),
            Self::Beneficiaries => format!("Mindestbedarf: {}", p.min_beneficiaries),
            Self::Maximum => format!("Max. Nebenmärkte: {}", p.max_markets),
        }
    }
}
#[derive(Component)]
struct CityControls;
#[derive(Component)]
struct MarketControls;
#[derive(Component)]
struct MarketReportBox;
#[derive(Component)]
struct MarketReportText;
#[derive(Component)]
struct ProfileValue(MarketParameter);
#[derive(Component)]
struct ButtonLabel(Action);
#[derive(Component)]
struct StatusText;
#[derive(Component)]
struct TitleText;
type TitleFilter = (With<TitleText>, Without<ButtonLabel>, Without<StatusText>);
type StatusFilter = (With<StatusText>, Without<ButtonLabel>, Without<TitleText>);
#[derive(Resource)]
struct UiFonts {
    body: Handle<Font>,
    title: Handle<Font>,
}
#[derive(Resource)]
struct Orbit {
    target: Vec3,
    yaw: f32,
    pitch: f32,
    distance: f32,
    extent: f32,
    top: bool,
}
#[derive(Resource, Default)]
struct Capture {
    path: Option<String>,
    image: Option<Handle<Image>>,
    frame: u32,
    requested: bool,
    exit_after: bool,
    completed: bool,
    failed: bool,
    pipelines_ready: bool,
}
struct RenderReadinessPlugin;
impl Plugin for RenderReadinessPlugin {
    fn build(&self, app: &mut App) {
        app.sub_app_mut(bevy::render::RenderApp).add_systems(
            bevy::render::ExtractSchedule,
            |mut main: ResMut<bevy::render::MainWorld>,
             cache: Res<bevy::render::render_resource::PipelineCache>| {
                if let Some(mut capture) = main.get_resource_mut::<Capture>() {
                    let ready =
                        cache.pipelines().count() > 0 && cache.waiting_pipelines().count() == 0;
                    if ready && !capture.pipelines_ready {
                        info!("Render pipelines ready: {}", cache.pipelines().count());
                    }
                    capture.pipelines_ready = ready;
                }
            },
        );
    }
}
const FEATURES: [&str; 10] = [
    "Zitadelle",
    "Burg innerhalb",
    "Marktplatz",
    "Tempel",
    "Stadtmauer",
    "Vorstadt",
    "Küste",
    "Fluss",
    "Grünflächen",
    "Straßennetz / Hub",
];

fn main() {
    if let Err(error) = run() {
        eprintln!("{error}");
        std::process::exit(1);
    }
}
fn run() -> Result<(), Box<dyn std::error::Error>> {
    let mut options = CityOptions::default();
    let mut output = None;
    let mut snapshot = None;
    let mut economy_enabled = false;
    let mut market_profile = MarketProfile::default();
    let mut write_profile = None;
    let mut capture = Capture::default();
    let mut args = std::env::args().skip(1);
    while let Some(arg) = args.next() {
        match arg.as_str() {
            "--help" | "-h" => {
                println!(
                    "New Cities · Rust / Bevy 0.20.0\n\ncargo run -- [--seed N] [--size 1..200] [--options FILE]\n             [--coast] [--river] [--greens] [--no-walls]\n             [--export FILE] [--snapshot FILE] [--economy]\n             [--market-profile FILE] [--write-market-profile FILE]\n             [--screenshot FILE] [--smoke-test]\n\n--export/--snapshot run without a window.\nR: new seed · Enter: rebuild · T: top view · E: economy overlay · Home: reset camera\nRight drag: orbit · Middle drag: pan · Wheel: zoom · Esc: quit"
                );
                return Ok(());
            }
            "--options" => {
                options = serde_json::from_str(&std::fs::read_to_string(
                    args.next().ok_or("--options requires a file")?,
                )?)?
            }
            "--seed" => options.seed = args.next().ok_or("--seed requires a number")?.parse()?,
            "--size" => options.size = args.next().ok_or("--size requires a number")?.parse()?,
            "--economy" => economy_enabled = true,
            "--market-profile" => {
                market_profile = serde_json::from_str(&std::fs::read_to_string(
                    args.next().ok_or("--market-profile requires a file")?,
                )?)?;
                economy_enabled = true;
            }
            "--write-market-profile" => {
                write_profile = Some(
                    args.next()
                        .ok_or("--write-market-profile requires a file")?,
                )
            }
            "--coast" => options.coast = true,
            "--river" => options.river = true,
            "--greens" => options.greens = true,
            "--no-walls" => options.walls = false,
            "--export" => output = Some(args.next().ok_or("--export requires a file")?),
            "--snapshot" => snapshot = Some(args.next().ok_or("--snapshot requires a file")?),
            "--screenshot" => {
                capture.path = Some(args.next().ok_or("--screenshot requires a file")?)
            }
            "--smoke-test" => capture.exit_after = true,
            _ => return Err(format!("Unknown argument {arg}; use --help").into()),
        }
    }
    options.validate()?;
    market_profile.validate()?;
    if let Some(path) = write_profile {
        write_json(&path, &market_profile)?;
        println!("Marktprofil: {path}");
        return Ok(());
    }
    if let Some(path) = snapshot {
        if economy_enabled {
            return Err("--economy annotates cities, not original snapshots; use --export".into());
        }
        write_json(&path, &generate_snapshot(&options)?)?;
        println!("Snapshot: {path}");
        return Ok(());
    }
    let GeneratedCity { city, economy } =
        generate_view(&options, economy_enabled, &market_profile)?;
    if let Some(path) = output {
        write_city(&path, &city, economy.as_ref())?;
        println!(
            "{} · {} buildings → {path}",
            city.name,
            city.building_count()
        );
        return Ok(());
    }
    let orbit = orbit_for(&city);
    App::new()
        .add_plugins(
            DefaultPlugins
                .set(bevy::render::RenderPlugin {
                    synchronous_pipeline_compilation: capture.exit_after,
                    ..default()
                })
                .set(WindowPlugin {
                    primary_window: Some(Window {
                        title: "New Cities · Rust / Bevy 0.20.0".into(),
                        resolution: (1440, 960).into(),
                        ..default()
                    }),
                    ..default()
                }),
        )
        .add_plugins(RenderReadinessPlugin)
        .insert_resource(ClearColor(Color::srgb_u8(210, 208, 176)))
        .insert_resource(GlobalAmbientLight {
            brightness: 450.0,
            ..default()
        })
        .insert_resource(CityState {
            city,
            options,
            message: "Bereit".into(),
            job: None,
            seed_edit: None,
            market_settings: economy_enabled,
            market_profile,
            market_view: mesh::MarketView::default(),
            economy_enabled,
            economy,
        })
        .insert_resource(orbit)
        .insert_resource(capture)
        .init_resource::<Actions>()
        .add_systems(Startup, (setup_scene, setup_ui))
        .add_systems(
            Update,
            (
                assign_fonts,
                keyboard,
                apply_actions,
                poll_generation,
                update_labels,
                update_market_panel,
                button_colors,
                camera,
                position_market_labels,
                capture_frame,
            )
                .chain(),
        )
        .run();
    Ok(())
}
fn write_json(path: &str, value: &impl serde::Serialize) -> Result<(), Box<dyn std::error::Error>> {
    let p = std::path::Path::new(path);
    if let Some(parent) = p.parent()
        && !parent.as_os_str().is_empty()
    {
        std::fs::create_dir_all(parent)?;
    }
    std::fs::write(p, serde_json::to_vec_pretty(value)?)?;
    Ok(())
}
fn write_city(
    path: &str,
    city: &City,
    economy: Option<&MarketPlan>,
) -> Result<(), Box<dyn std::error::Error>> {
    let mut value = serde_json::json!({"format":"new-cities","version":1,"city":city});
    if let Some(economy) = economy {
        value["economy"] = serde_json::to_value(economy)?;
    }
    write_json(path, &value)
}
fn orbit_for(city: &City) -> Orbit {
    let extent = city.bounds.width.max(city.bounds.height) as f32 * 4.0;
    Orbit {
        target: Vec3::new(
            (city.bounds.x + city.bounds.width / 2.0) as f32 * 4.0 - extent * 0.20,
            0.0,
            (city.bounds.y + city.bounds.height / 2.0) as f32 * 4.0,
        ),
        yaw: 0.15,
        pitch: 0.95,
        distance: extent * 1.35,
        extent,
        top: false,
    }
}
fn setup_scene(
    mut commands: Commands,
    mut meshes: ResMut<Assets<Mesh>>,
    mut materials: ResMut<Assets<StandardMaterial>>,
    mut images: ResMut<Assets<Image>>,
    mut capture: ResMut<Capture>,
    state: Res<CityState>,
) {
    mesh::spawn_city(
        &mut commands,
        &mut meshes,
        &mut materials,
        &state.city,
        state.economy.as_ref(),
        &state.market_view,
    );
    // A smoke test must render even when the desktop is locked or the window
    // is occluded. An image target does not depend on a window swap chain.
    let target = if capture.exit_after {
        let image = images.add(Image::new_target_texture(
            1440,
            960,
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
        Projection::Perspective(PerspectiveProjection {
            far: 100_000.0,
            ..default()
        }),
        Transform::default(),
    ));
    commands.spawn((
        DirectionalLight {
            illuminance: 12_000.0,
            shadow_maps_enabled: true,
            ..default()
        },
        Transform::from_rotation(Quat::from_euler(EulerRot::XYZ, -0.95, -0.6, 0.0)),
    ));
}
fn font(size: f32) -> TextFont {
    TextFont {
        font_size: FontSize::Px(size),
        ..default()
    }
}
fn setup_ui(mut commands: Commands, mut fonts: ResMut<Assets<Font>>, state: Res<CityState>) {
    commands.insert_resource(UiFonts {
        body: fonts.add(Font::from_bytes(
            include_bytes!("../../../assets/fonts/ShareTech-Regular.ttf").to_vec(),
        )),
        title: fonts.add(Font::from_bytes(
            include_bytes!("../../../assets/fonts/IMFellGreatPrimer-Regular.ttf").to_vec(),
        )),
    });
    let panel = commands
        .spawn((
            Node {
                position_type: PositionType::Absolute,
                left: px(20),
                top: px(20),
                width: px(265),
                padding: UiRect::all(px(20)),
                flex_direction: FlexDirection::Column,
                row_gap: px(5),
                border_radius: BorderRadius::all(px(12)),
                ..default()
            },
            BackgroundColor(Color::srgba(0.075, 0.095, 0.095, 0.97)),
        ))
        .id();
    commands.entity(panel).with_children(|parent| {
        parent.spawn((Text::new("NEW CITIES"),font(23.0),TextColor(Color::srgb_u8(231,224,203))));
        parent.spawn((Text::new("WATABOU · NATIVE GENERATION"),font(10.5),TextColor(Color::srgb_u8(143,159,150))));
        for action in [Action::Seed,Action::Smaller,Action::Larger,Action::New,Action::Rebuild,Action::Economy,Action::MarketSettings] {
            spawn_button(parent,action);
        }
        parent.spawn((CityControls,Node {
            display: if state.market_settings {Display::None} else {Display::Flex},
            flex_direction:FlexDirection::Column,row_gap:px(5),..default()
        })).with_children(|parent| {
            parent.spawn((Text::new("STADTPLAN"),font(11.0),TextColor(Color::srgb_u8(143,159,150))));
            for i in 0..FEATURES.len() {spawn_button(parent,Action::Feature(i));}
            spawn_button(parent,Action::Gates);
        });
        parent.spawn((MarketControls,Node {
            display: if state.market_settings {Display::Flex} else {Display::None},
            flex_direction:FlexDirection::Column,row_gap:px(5),..default()
        })).with_children(|parent| {
            parent.spawn((Text::new("MARKTPROFIL · METER / WEGE"),font(11.0),TextColor(Color::srgb_u8(143,159,150))));
            for parameter in [MarketParameter::Main,MarketParameter::Secondary,MarketParameter::Service,MarketParameter::District,MarketParameter::Beneficiaries,MarketParameter::Maximum] {
                parent.spawn(Node { flex_direction:FlexDirection::Row,align_items:AlignItems::Center,column_gap:px(4),..default() }).with_children(|row| {
                    row.spawn((ProfileValue(parameter),Text::new(parameter.label(&state.market_profile)),font(11.0),
                        TextColor(Color::srgb_u8(215,220,202)),Node {width:px(155),..default()}));
                    spawn_button(row,Action::MarketParam(parameter,-1));
                    spawn_button(row,Action::MarketParam(parameter,1));
                });
            }
            for action in [Action::MarketDefaults,Action::SaveMarketProfile,Action::MarketRoutes,Action::MarketDistricts] {
                spawn_button(parent,action);
            }
            parent.spawn((Text::new("Abstände sind Netz-Schätzungen.\nKeine Marktpflicht pro Distrikt.\nKeine Plätze freigeräumt."),font(11.0),TextColor(Color::srgb_u8(143,159,150))));
        });
        parent.spawn((Text::new("ANSICHT & EXPORT"),font(11.0),TextColor(Color::srgb_u8(143,159,150))));
        for action in [Action::Top,Action::Reset,Action::Json,Action::Png] {spawn_button(parent,action);}
    });
    commands.spawn((
        TitleText,
        Text::new(""),
        font(29.0),
        TextColor(Color::srgb_u8(48, 57, 49)),
        Node {
            position_type: PositionType::Absolute,
            left: px(320),
            top: px(30),
            ..default()
        },
    ));
    commands.spawn((
        StatusText,
        Text::new(""),
        font(13.0),
        TextColor(Color::srgb_u8(57, 68, 58)),
        Node {
            position_type: PositionType::Absolute,
            left: px(320),
            top: px(72),
            ..default()
        },
    ));
    commands
        .spawn((
            MarketReportBox,
            Node {
                display: if state.economy.is_some() {
                    Display::Flex
                } else {
                    Display::None
                },
                position_type: PositionType::Absolute,
                left: px(310),
                top: px(172),
                width: px(310),
                padding: UiRect::all(px(12)),
                border_radius: BorderRadius::all(px(8)),
                ..default()
            },
            BackgroundColor(Color::srgba(0.90, 0.90, 0.83, 0.94)),
        ))
        .with_children(|p| {
            p.spawn((
                MarketReportText,
                Text::new(""),
                font(11.5),
                TextColor(Color::srgb_u8(48, 57, 49)),
            ));
        });
    commands.spawn((Text::new("Rechte Maustaste: Drehen   Mittlere: Verschieben   Mausrad: Zoom   T: Draufsicht   E: Marktplanung"),font(12.0),TextColor(Color::srgb_u8(57,68,58)),
        Node{position_type:PositionType::Absolute,left:px(320),bottom:px(22),..default()}));
}
type MarketPanelFilter = Or<(
    With<CityControls>,
    With<MarketControls>,
    With<MarketReportBox>,
)>;
fn update_market_panel(
    state: Res<CityState>,
    mut panels: Query<(&mut Node, Has<MarketControls>, Has<MarketReportBox>), MarketPanelFilter>,
    mut values: Query<(&ProfileValue, &mut Text), Without<MarketReportText>>,
    mut report: Query<&mut Text, (With<MarketReportText>, Without<ProfileValue>)>,
    mut layers: Query<(&mesh::MarketLayer, &mut Visibility)>,
) {
    for (mut node, market, report) in &mut panels {
        let visible = if report {
            state.economy.is_some()
        } else {
            market == state.market_settings
        };
        node.display = if visible {
            Display::Flex
        } else {
            Display::None
        };
    }
    for (value, mut text) in &mut values {
        text.0 = value.0.label(&state.market_profile);
    }
    for (layer, mut visibility) in &mut layers {
        *visibility = if layer.visible(&state.market_view) {
            Visibility::Visible
        } else {
            Visibility::Hidden
        };
    }
    if let Some(plan) = &state.economy {
        let mut lines = vec!["MARKTPLANUNG V1 · WEGE".to_string()];
        for (i, m) in plan.markets.iter().enumerate().filter(|(_, m)| m.proposed) {
            let name = m
                .district
                .and_then(|i| plan.districts.get(i))
                .map_or("Ohne Distrikt", |d| d.name.as_str());
            lines.push(format!(
                "M{i}: {name} · {:.0} m ab H",
                m.main_distance_metres.unwrap_or(0.)
            ));
        }
        if !plan.markets.iter().any(|m| m.proposed) {
            lines.push("Keine zulässigen Nebenmärkte.".into());
        }
        for p in &plan.pairs {
            lines.push(format!(
                "M{} - M{}: {:.0} m",
                p.from, p.to, p.distance_metres
            ));
        }
        lines.push("\nDISTRIKTE · NACHFRAGEABDECKUNG".into());
        for d in &plan.districts {
            lines.push(if let (Some(before), Some(after)) = (d.before, d.after) {
                format!(
                    "{}: {:.0}% -> {:.0}% · {} NM",
                    d.name,
                    before * 100.,
                    after * 100.,
                    d.secondary_markets
                )
            } else {
                format!("{}: keine Nachfrage", d.name)
            });
        }
        let rejected = plan
            .candidates
            .iter()
            .filter(|c| c.reason != city_core::MarketCandidateReason::Selected)
            .count();
        lines.push(format!("\n{rejected} nicht gewählte Kandidaten"));
        let count = |reason| {
            plan.candidates
                .iter()
                .filter(|c| c.reason == reason)
                .count()
        };
        lines.push(format!(
            "H-Nähe: {} · NM-Nähe: {}",
            count(city_core::MarketCandidateReason::NearMain),
            count(city_core::MarketCandidateReason::NearSecondary)
        ));
        lines.push(format!(
            "Ohne H-Verbindung: {} · Bedarf: {}",
            count(city_core::MarketCandidateReason::Disconnected),
            count(city_core::MarketCandidateReason::InsufficientDemand)
        ));
        lines.push("NM = eigener Nebenmarkt\nWege und Abdeckung sind Modellwerte.".into());
        let value = lines.join("\n");
        for mut text in &mut report {
            if text.0 != value {
                text.0 = value.clone();
            }
        }
    }
}
fn assign_fonts(
    fonts: Res<UiFonts>,
    mut text: Query<(&mut TextFont, Has<TitleText>), Added<TextFont>>,
) {
    for (mut font, title) in &mut text {
        font.font = if title {
            fonts.title.clone()
        } else {
            fonts.body.clone()
        }
        .into();
    }
}
fn spawn_button(parent: &mut ChildSpawnerCommands, action: Action) {
    parent
        .spawn((
            Button,
            Hovered::default(),
            Node {
                height: px(28),
                padding: UiRect::axes(px(10), px(4)),
                align_items: AlignItems::Center,
                border_radius: BorderRadius::all(px(4)),
                ..default()
            },
            BackgroundColor(Color::srgb_u8(35, 44, 41)),
        ))
        .with_children(|p| {
            p.spawn((
                ButtonLabel(action),
                Text::new(""),
                font(12.0),
                TextColor(Color::srgb_u8(215, 220, 202)),
            ));
        })
        .observe(move |_: On<Activate>, mut actions: ResMut<Actions>| actions.0.push(action));
}
fn feature(options: &CityOptions, index: usize) -> bool {
    [
        options.citadel,
        options.urban_castle,
        options.plaza,
        options.temple,
        options.walls,
        options.shantytown,
        options.coast,
        options.river,
        options.greens,
        options.hub,
    ][index]
}
fn toggle(options: &mut CityOptions, index: usize) {
    let flag = match index {
        0 => &mut options.citadel,
        1 => &mut options.urban_castle,
        2 => &mut options.plaza,
        3 => &mut options.temple,
        4 => &mut options.walls,
        5 => &mut options.shantytown,
        6 => &mut options.coast,
        7 => &mut options.river,
        8 => &mut options.greens,
        _ => &mut options.hub,
    };
    *flag = !*flag;
}
fn keyboard(
    mut events: MessageReader<KeyboardInput>,
    keys: Res<ButtonInput<KeyCode>>,
    mut state: ResMut<CityState>,
    mut actions: ResMut<Actions>,
    mut exit: MessageWriter<AppExit>,
) {
    if let Some(input) = state.seed_edit.as_mut() {
        for event in events.read() {
            if event.state != ButtonState::Pressed {
                continue;
            }
            match &event.logical_key {
                Key::Character(s) => {
                    for c in s.chars().filter(|c| c.is_ascii_digit()) {
                        if input.len() < 10 {
                            input.push(c);
                        }
                    }
                }
                Key::Backspace => {
                    input.pop();
                }
                _ => {}
            }
        }
        if keys.just_pressed(KeyCode::Enter) {
            let text = state.seed_edit.take().unwrap();
            match text.parse::<u32>() {
                Ok(seed) if (1..2147483647).contains(&seed) => {
                    state.options.seed = seed;
                    actions.0.push(Action::Rebuild)
                }
                _ => state.message = "Seed muss zwischen 1 und 2147483646 liegen".into(),
            }
        }
        if keys.just_pressed(KeyCode::Escape) {
            state.seed_edit = None;
        }
        return;
    }
    events.clear();
    for (key, action) in [
        (KeyCode::KeyR, Action::New),
        (KeyCode::Enter, Action::Rebuild),
        (KeyCode::KeyT, Action::Top),
        (KeyCode::KeyE, Action::Economy),
        (KeyCode::Home, Action::Reset),
        (KeyCode::Equal, Action::Larger),
        (KeyCode::Minus, Action::Smaller),
    ] {
        if keys.just_pressed(key) {
            actions.0.push(action);
        }
    }
    if keys.just_pressed(KeyCode::Escape) {
        exit.write(AppExit::Success);
    }
}
fn start_generation(state: &mut CityState) {
    if state.job.is_some() {
        state.message = "Generierung läuft …".into();
        return;
    }
    state.seed_edit = None;
    let options = state.options.clone();
    let economy = state.economy_enabled;
    let profile = state.market_profile.clone();
    let (tx, rx) = mpsc::channel();
    std::thread::spawn(move || {
        let _ = tx.send(generate_view(&options, economy, &profile));
    });
    state.job = Some(Mutex::new(rx));
    state.message = "Generierung läuft …".into();
}
fn apply_actions(
    mut commands: Commands,
    mut actions: ResMut<Actions>,
    mut state: ResMut<CityState>,
    mut orbit: ResMut<Orbit>,
) {
    for action in actions.0.drain(..) {
        let mut regenerate = false;
        match action {
            Action::New => {
                if state.job.is_some() {
                    continue;
                }
                state.options.seed = ((state.options.seed as u64 * 48271) % 2147483647) as u32;
                regenerate = true;
            }
            Action::Rebuild => regenerate = true,
            Action::Smaller => {
                if state.job.is_some() {
                    continue;
                }
                state.options.size = state.options.size.saturating_sub(5).max(5);
                regenerate = true;
            }
            Action::Larger => {
                if state.job.is_some() {
                    continue;
                }
                state.options.size = (state.options.size + 5).min(200);
                regenerate = true;
            }
            Action::Seed => {
                if state.job.is_some() {
                    continue;
                }
                state.seed_edit = Some(String::new());
                state.message = "Seed eingeben, Enter zum Generieren".into();
            }
            Action::Feature(index) => {
                if state.job.is_some() {
                    continue;
                }
                toggle(&mut state.options, index);
                regenerate = true;
            }
            Action::Gates => {
                if state.job.is_some() {
                    continue;
                }
                state.options.gates = match state.options.gates {
                    -1 => 0,
                    0 => 1,
                    1 => 2,
                    2 => 4,
                    4 => 6,
                    _ => -1,
                };
                regenerate = true;
            }
            Action::Economy => {
                if state.job.is_some() {
                    continue;
                }
                state.economy_enabled = !state.economy_enabled;
                regenerate = true;
            }
            Action::MarketSettings => {
                state.market_settings = !state.market_settings;
                if state.market_settings && !state.economy_enabled && state.job.is_none() {
                    state.economy_enabled = true;
                    regenerate = true;
                }
            }
            Action::MarketParam(parameter, delta) => {
                if state.job.is_some() {
                    continue;
                }
                parameter.adjust(&mut state.market_profile, delta);
                state.economy_enabled = true;
                regenerate = true;
            }
            Action::MarketDefaults => {
                if state.job.is_some() {
                    continue;
                }
                state.market_profile = MarketProfile::default();
                state.economy_enabled = true;
                regenerate = true;
            }
            Action::SaveMarketProfile => {
                let path = format!("exports/market-profile-{}.json", state.city.options.seed);
                state.message = match write_json(&path, &state.market_profile) {
                    Ok(()) => format!("Profil gespeichert: {path}"),
                    Err(e) => e.to_string(),
                };
            }
            Action::MarketRoutes => {
                state.market_view.routes = (state.market_view.routes + 1) % 3;
            }
            Action::MarketDistricts => {
                state.market_view.districts = !state.market_view.districts;
            }
            Action::Top => orbit.top = !orbit.top,
            Action::Reset => *orbit = orbit_for(&state.city),
            Action::Json => {
                let path = format!("exports/city-{}.json", state.city.options.seed);
                state.message = match write_city(&path, &state.city, state.economy.as_ref()) {
                    Ok(_) => format!("Gespeichert: {path}"),
                    Err(e) => e.to_string(),
                };
            }
            Action::Png => {
                let _ = std::fs::create_dir_all("exports");
                let path = format!("exports/city-{}.png", state.city.options.seed);
                commands
                    .spawn(Screenshot::primary_window())
                    .observe(save_to_disk(path.clone()));
                state.message = format!("Screenshot angefordert: {path}");
            }
        }
        if regenerate {
            start_generation(&mut state);
        }
    }
}
fn poll_generation(
    mut commands: Commands,
    mut state: ResMut<CityState>,
    mut orbit: ResMut<Orbit>,
    query: Query<Entity, With<mesh::CityMesh>>,
    mut meshes: ResMut<Assets<Mesh>>,
    mut materials: ResMut<Assets<StandardMaterial>>,
) {
    let result = state
        .job
        .as_ref()
        .and_then(|rx| rx.lock().ok()?.try_recv().ok());
    let Some(result) = result else { return };
    state.job = None;
    match result {
        Ok(GeneratedCity { city, economy }) => {
            for entity in &query {
                commands.entity(entity).despawn();
            }
            *orbit = orbit_for(&city);
            mesh::spawn_city(
                &mut commands,
                &mut meshes,
                &mut materials,
                &city,
                economy.as_ref(),
                &state.market_view,
            );
            state.city = city;
            state.economy = economy;
            state.message = "Bereit".into();
        }
        Err(error) => {
            state.options = state.city.options.clone();
            state.economy_enabled = state.economy.is_some();
            if let Some(plan) = &state.economy {
                state.market_profile = plan.profile.clone();
            }
            state.message = format!("Generierung fehlgeschlagen: {error}");
        }
    }
}
fn update_labels(
    state: Res<CityState>,
    orbit: Res<Orbit>,
    mut labels: Query<(&ButtonLabel, &mut Text)>,
    mut title: Query<&mut Text, TitleFilter>,
    mut status: Query<&mut Text, StatusFilter>,
) {
    for (label, mut text) in &mut labels {
        let value = match label.0 {
            Action::New => "Neue Stadt   [R]".into(),
            Action::Rebuild => "Neu berechnen   [Enter]".into(),
            Action::Smaller => format!("-  Kleiner     Größe: {}", state.options.size),
            Action::Larger => "+  Größer".into(),
            Action::Seed => {
                if let Some(edit) = &state.seed_edit {
                    format!("Seed: {edit}|")
                } else {
                    format!("Seed: {}   ändern", state.options.seed)
                }
            }
            Action::Gates => format!(
                "Tore: {}",
                if state.options.gates < 0 {
                    "Automatisch".into()
                } else {
                    state.options.gates.to_string()
                }
            ),
            Action::Feature(i) => format!(
                "{}  {}",
                if feature(&state.options, i) {
                    "[x]"
                } else {
                    "[ ]"
                },
                FEATURES[i]
            ),
            Action::Top => format!(
                "{}   [T]",
                if orbit.top {
                    "Perspektive"
                } else {
                    "Draufsicht"
                }
            ),
            Action::Economy => format!(
                "{} Marktplanung V1  [E]",
                if state.economy_enabled { "[x]" } else { "[ ]" }
            ),
            Action::MarketSettings => {
                if state.market_settings {
                    "Stadtregeln anzeigen".into()
                } else {
                    "Marktregeln anzeigen".into()
                }
            }
            Action::MarketParam(_, delta) => {
                if delta < 0 {
                    "-".into()
                } else {
                    "+".into()
                }
            }
            Action::MarketDefaults => "Profil V1 zurücksetzen".into(),
            Action::SaveMarketProfile => "Marktprofil als JSON speichern".into(),
            Action::MarketRoutes => format!(
                "Wege: {}",
                ["Aus", "Hauptmarkt", "Alle Paare"][state.market_view.routes as usize]
            ),
            Action::MarketDistricts => format!(
                "{} Distriktumrisse",
                if state.market_view.districts {
                    "[x]"
                } else {
                    "[ ]"
                }
            ),
            Action::Reset => "Kamera zurücksetzen   [Home]".into(),
            Action::Json => "Stadt als JSON exportieren".into(),
            Action::Png => "Ansicht als PNG speichern".into(),
        };
        if text.0 != value {
            text.0 = value;
        }
    }
    for mut text in &mut title {
        if text.0 != state.city.name {
            text.0 = state.city.name.clone();
        }
    }
    for mut text in &mut status {
        let analysis = state.economy.as_ref().map(|e| format!(
            "\n{} · {} Nebenmärkte · Nachfrageabdeckung: {:.0}%\nWege-Proxy: {:.0} -> {:.0} m (bei {:.0} m gedeckelt) · Ohne Anschluss: {} · Ohne Markt: {}\nDachfarben: Hauptmarkt braun · M1 gold · M2 blau · M3 grün · unversorgt grau",
            e.profile.name, e.markets.iter().filter(|m| m.proposed).count(), e.served_demand_fraction * 100.0,
            e.baseline_capped_distance_metres, e.planned_capped_distance_metres, e.profile.service,
            e.unlinked_buildings, e.unserved_buildings,
        )).unwrap_or_default();
        let value = format!(
            "{} Gebäude · {} Viertel · Seed {}\n{}{}",
            state.city.building_count(),
            state.city.original_geometry.districts.len(),
            state.city.options.seed,
            state.message,
            analysis
        );
        if text.0 != value {
            text.0 = value;
        }
    }
}
fn button_colors(mut buttons: Query<(&Hovered, &mut BackgroundColor), With<Button>>) {
    for (hovered, mut color) in &mut buttons {
        *color = BackgroundColor(if hovered.get() {
            Color::srgb_u8(58, 73, 65)
        } else {
            Color::srgb_u8(35, 44, 41)
        });
    }
}
fn camera(
    motion: Res<AccumulatedMouseMotion>,
    scroll: Res<AccumulatedMouseScroll>,
    buttons: Res<ButtonInput<MouseButton>>,
    windows: Query<&Window>,
    mut orbit: ResMut<Orbit>,
    mut camera: Query<(&mut Transform, &mut Projection), With<Camera3d>>,
) {
    let over_panel = windows
        .iter()
        .next()
        .and_then(|w| w.cursor_position())
        .is_some_and(|p| p.x < 300.0);
    if !over_panel {
        if buttons.pressed(MouseButton::Right) {
            orbit.yaw -= motion.delta.x * 0.006;
            orbit.pitch = (orbit.pitch + motion.delta.y * 0.006).clamp(0.15, 1.55);
            orbit.top = false;
        }
        if buttons.pressed(MouseButton::Middle) {
            let right = Vec3::new(orbit.yaw.cos(), 0.0, -orbit.yaw.sin());
            let forward = Vec3::new(orbit.yaw.sin(), 0.0, orbit.yaw.cos());
            let delta =
                (right * (-motion.delta.x) + forward * (-motion.delta.y)) * orbit.distance * 0.001;
            orbit.target += delta;
        }
        orbit.distance = (orbit.distance * (-scroll.delta.y * 0.06).exp())
            .clamp(orbit.extent * 0.08, orbit.extent * 6.0);
    }
    for (mut transform, mut projection) in &mut camera {
        if orbit.top {
            *projection = Projection::Orthographic(OrthographicProjection {
                scale: orbit.distance / 800.0,
                far: 100_000.0,
                ..OrthographicProjection::default_3d()
            });
            *transform = Transform::from_translation(orbit.target + Vec3::Y * orbit.distance)
                .looking_at(orbit.target, Vec3::NEG_Z);
        } else {
            if !matches!(*projection, Projection::Perspective(_)) {
                *projection = Projection::Perspective(PerspectiveProjection {
                    far: 100_000.0,
                    ..default()
                });
            }
            let direction = Vec3::new(
                orbit.yaw.sin() * orbit.pitch.cos(),
                orbit.pitch.sin(),
                orbit.yaw.cos() * orbit.pitch.cos(),
            );
            *transform = Transform::from_translation(orbit.target + direction * orbit.distance)
                .looking_at(orbit.target, Vec3::Y);
        }
    }
}
fn position_market_labels(
    cameras: Query<(&Camera, &GlobalTransform), With<Camera3d>>,
    mut labels: Query<(&mesh::MarketPinLabel, &mut Node)>,
) {
    let Some((camera, transform)) = cameras.iter().next() else {
        return;
    };
    for (label, mut node) in &mut labels {
        if let Ok(p) = camera.world_to_viewport(transform, label.0) {
            node.display = Display::Flex;
            node.left = px(p.x - 12.0);
            node.top = px(p.y - 10.0);
        } else {
            node.display = Display::None;
        }
    }
}
fn capture_frame(
    mut commands: Commands,
    mut capture: ResMut<Capture>,
    mut exit: MessageWriter<AppExit>,
    time: Res<Time<Real>>,
) {
    capture.frame += 1;
    // Initial Metal pipelines compile asynchronously. Frame count alone can
    // run ahead of shader compilation and capture an unrendered black frame.
    if capture.frame > 180
        && time.elapsed_secs() > 8.0
        && capture.pipelines_ready
        && !capture.requested
    {
        capture.requested = true;
        if let Some(path) = capture.path.clone() {
            if let Some(parent) = std::path::Path::new(&path).parent() {
                let _ = std::fs::create_dir_all(parent);
            }
            commands
                .spawn(match capture.image.clone() {
                    Some(image) => Screenshot::image(image),
                    None => Screenshot::primary_window(),
                })
                .observe(save_to_disk(path))
                .observe(|event: On<ScreenshotCaptured>, mut c: ResMut<Capture>| {
                    // A successful GPU readback can still contain an unrendered
                    // frame. The smoke test also requires actual scene pixels.
                    let has_content = event.image.data.as_deref().is_some_and(|data| {
                        data.len() >= 4 && data.chunks_exact(4).any(|pixel| pixel[..3] != data[..3])
                    });
                    if c.exit_after && !has_content {
                        error!("Render smoke test returned an empty frame");
                        c.failed = true;
                    }
                    c.completed = true;
                });
        } else {
            capture.completed = true;
        }
    }
    if capture.exit_after && capture.completed && capture.frame > 100 {
        exit.write(if capture.failed {
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
    fn economy_toggle_and_export_preserve_original_city() {
        let options = CityOptions {
            size: 5,
            seed: 42,
            ..Default::default()
        };
        let city = generate_city(&options).unwrap();
        let original = serde_json::to_value(&city).unwrap();
        let orbit = orbit_for(&city);
        let mut app = App::new();
        app.insert_resource(CityState {
            city,
            options,
            message: String::new(),
            job: None,
            seed_edit: None,
            economy_enabled: false,
            economy: None,
            market_profile: MarketProfile::default(),
            market_settings: false,
            market_view: mesh::MarketView::default(),
        })
        .insert_resource(orbit)
        .insert_resource(Actions::default())
        .init_resource::<Assets<Mesh>>()
        .init_resource::<Assets<StandardMaterial>>()
        .add_systems(Update, (apply_actions, poll_generation).chain());
        for enabled in [true, false] {
            app.world_mut()
                .resource_mut::<Actions>()
                .0
                .push(Action::Economy);
            app.update();
            let deadline = std::time::Instant::now() + std::time::Duration::from_secs(20);
            while app.world().resource::<CityState>().job.is_some() {
                assert!(std::time::Instant::now() < deadline);
                std::thread::sleep(std::time::Duration::from_millis(10));
                app.update();
            }
            let state = app.world().resource::<CityState>();
            assert_eq!(state.economy_enabled, enabled);
            assert_eq!(state.economy.is_some(), enabled);
            assert_eq!(serde_json::to_value(&state.city).unwrap(), original);
            let path = std::env::temp_dir().join(format!(
                "cities-economy-export-{}-{enabled}.json",
                std::process::id()
            ));
            write_city(path.to_str().unwrap(), &state.city, state.economy.as_ref()).unwrap();
            let exported: serde_json::Value =
                serde_json::from_slice(&std::fs::read(&path).unwrap()).unwrap();
            std::fs::remove_file(path).unwrap();
            assert_eq!(exported["city"], original);
            assert_eq!(exported.get("economy").is_some(), enabled);
            if let Some(economy) = &state.economy {
                assert_eq!(exported["economy"], serde_json::to_value(economy).unwrap());
            }
        }
    }
    #[test]
    fn market_profile_controls_replan_without_changing_the_city() {
        let options = CityOptions {
            size: 10,
            seed: 42,
            ..Default::default()
        };
        let city = generate_city(&options).unwrap();
        let original = serde_json::to_value(&city).unwrap();
        let orbit = orbit_for(&city);
        let mut app = App::new();
        app.insert_resource(CityState {
            city,
            options,
            message: String::new(),
            job: None,
            seed_edit: None,
            economy_enabled: false,
            economy: None,
            market_profile: MarketProfile::default(),
            market_settings: false,
            market_view: mesh::MarketView::default(),
        })
        .insert_resource(orbit)
        .insert_resource(Actions::default())
        .init_resource::<Assets<Mesh>>()
        .init_resource::<Assets<StandardMaterial>>()
        .add_systems(
            Update,
            (apply_actions, poll_generation, update_market_panel).chain(),
        );
        for action in [
            Action::MarketSettings,
            Action::MarketParam(MarketParameter::Main, 1),
            Action::MarketParam(MarketParameter::Maximum, -1),
        ] {
            app.world_mut().resource_mut::<Actions>().0.push(action);
            app.update();
            let deadline = std::time::Instant::now() + std::time::Duration::from_secs(20);
            while app.world().resource::<CityState>().job.is_some() {
                assert!(std::time::Instant::now() < deadline);
                std::thread::sleep(std::time::Duration::from_millis(10));
                app.update();
            }
        }
        let state = app.world().resource::<CityState>();
        assert!(state.market_settings && state.economy_enabled);
        assert_eq!(state.market_profile.main_min, 220.);
        assert_eq!(state.market_profile.max_markets, 2);
        let plan = state.economy.as_ref().unwrap();
        assert_eq!(plan.profile, state.market_profile);
        assert!(plan.markets.iter().filter(|m| m.proposed).count() <= 2);
        assert_eq!(serde_json::to_value(&state.city).unwrap(), original);
        app.world_mut().resource_mut::<Actions>().0.extend([
            Action::MarketRoutes,
            Action::MarketRoutes,
            Action::MarketDistricts,
        ]);
        app.update();
        let state = app.world().resource::<CityState>();
        assert_eq!(state.market_view.routes, 0);
        assert!(!state.market_view.districts);
        for (_, visibility) in app
            .world_mut()
            .query::<(&mesh::MarketLayer, &Visibility)>()
            .iter(app.world())
        {
            assert_eq!(*visibility, Visibility::Hidden);
        }
    }
    #[test]
    fn native_controls_replace_a_city_after_background_generation() {
        let options = CityOptions {
            size: 5,
            seed: 42,
            ..Default::default()
        };
        let city = generate_city(&options).unwrap();
        let orbit = orbit_for(&city);
        let mut app = App::new();
        app.insert_resource(CityState {
            city,
            options,
            message: String::new(),
            job: None,
            seed_edit: None,
            economy_enabled: false,
            economy: None,
            market_profile: MarketProfile::default(),
            market_settings: false,
            market_view: mesh::MarketView::default(),
        })
        .insert_resource(orbit)
        .insert_resource(Actions(vec![Action::Feature(4)]))
        .init_resource::<Assets<Mesh>>()
        .init_resource::<Assets<StandardMaterial>>()
        .add_systems(Update, (apply_actions, poll_generation).chain());
        app.update();
        assert!(!app.world().resource::<CityState>().options.walls);
        let deadline = std::time::Instant::now() + std::time::Duration::from_secs(20);
        while app.world().resource::<CityState>().job.is_some() {
            assert!(
                std::time::Instant::now() < deadline,
                "background generation did not finish"
            );
            std::thread::sleep(std::time::Duration::from_millis(10));
            app.update();
        }
        let state = app.world().resource::<CityState>();
        assert!(!state.city.options.walls);
        assert!(state.city.wall.is_empty());
        assert_eq!(state.message, "Bereit");
        assert!(
            app.world_mut()
                .query::<&mesh::CityMesh>()
                .iter(app.world())
                .count()
                > 0
        );
    }
}
