//! Native port of the recovered Watabou city generator.
mod runtime;
#[rustfmt::skip]
mod generated;
mod adapter;
mod economy;
mod math;
mod model;
mod snapshot;
pub use economy::{BuildingUse, EconomicAnalysis, EconomicUse, MarketSite, analyze_economy};
pub use model::*;

use runtime::{Runtime, V};

#[derive(Debug, Clone)]
pub struct GenerationError(pub String);
impl std::fmt::Display for GenerationError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.write_str(&self.0)
    }
}
impl std::error::Error for GenerationError {}

struct Session {
    rt: Runtime,
    kernel: V,
    model: V,
}
impl Session {
    fn new(options: &CityOptions) -> Result<Self, GenerationError> {
        Self::with_blueprint(options, None)
    }
    fn with_blueprint(
        options: &CityOptions,
        random_features: Option<bool>,
    ) -> Result<Self, GenerationError> {
        options.validate()?;
        let mut rt = Runtime::new();
        let host = rt.object();
        let state = rt.object();
        let assets = rt.object();
        rt.put(host, "state", state);
        rt.put(host, "assets", assets);
        let query = rt.import_json(&options.query());
        rt.put(host, "query", query);
        if let Some(random) = random_features {
            let preferences = rt.import_json(&serde_json::json!({
                "random": random, "green": options.greens, "hub": options.hub,
                "gates": options.gates, "citadel": options.citadel,
                "urban_castle": options.urban_castle, "plaza": options.plaza,
                "temple": options.temple, "walls": options.walls,
                "shantytown": options.shantytown, "coast": options.coast, "river": options.river,
            }));
            rt.put(host, "preferences", preferences);
        }
        for (key, text) in [
            (
                "grammar",
                include_str!("../../../assets/original/grammar.json"),
            ),
            (
                "english",
                include_str!("../../../assets/original/english.txt"),
            ),
            ("elven", include_str!("../../../assets/original/elven.txt")),
            (
                "male",
                include_str!("../../../assets/original/given_male.txt"),
            ),
            (
                "female",
                include_str!("../../../assets/original/given_female.txt"),
            ),
        ] {
            let value = rt.string(text);
            rt.put(assets, key, value);
        }
        let result = (|| -> Result<(V, V), V> {
            let kernel = generated::initialize(&mut rt, host)?;
            let blueprint = rt.get_name(kernel, "Blueprint")?;
            let bp = if random_features.is_some() {
                let random = rt.get_name(kernel, "Random")?;
                rt.invoke(random, "reset", &[V::Number(options.seed as f64)])?;
                let bp = rt.invoke(
                    blueprint,
                    "create",
                    &[
                        V::Number(options.size as f64),
                        V::Number(options.seed as f64),
                    ],
                )?;
                if let Some(name) = &options.name {
                    let value = rt.string(name);
                    rt.put(bp, "name", value);
                }
                bp
            } else {
                rt.invoke(blueprint, "fromURL", &[])?
            };
            let constructor = rt.get_name(kernel, "City")?;
            let model = rt.construct(constructor, &[bp])?;
            Ok((kernel, model))
        })();
        match result {
            Ok((kernel, model)) => Ok(Self { rt, kernel, model }),
            Err(e) => Err(GenerationError(format!(
                "{}\n{}",
                rt.text(e),
                rt.error_stack.join(" -> ")
            ))),
        }
    }
}

/// Full canonical model used to compare the Rust port against the original.
pub fn generate_snapshot(options: &CityOptions) -> Result<serde_json::Value, GenerationError> {
    let options = options.clone();
    std::thread::Builder::new()
        .name("city-generator".into())
        .stack_size(64 * 1024 * 1024)
        .spawn(move || {
            let mut session = Session::new(&options)?;
            snapshot::canonical(&mut session.rt, session.kernel, session.model)
                .map_err(|e| GenerationError(session.rt.text(e)))
        })
        .map_err(|e| GenerationError(e.to_string()))?
        .join()
        .map_err(|_| GenerationError("Generator thread panicked".into()))?
}

/// Generate an owned planar city. No JavaScript runtime, browser, or Bevy ECS
/// is required. Each call has an isolated arena and deterministic seed state.
pub fn generate_city(options: &CityOptions) -> Result<City, GenerationError> {
    generate(options, None)
}

/// Original New/Rebuild semantics, including the size-dependent probabilities
/// when random features are requested and the resolved coastal direction.
pub fn generate_blueprint_city(
    options: &CityOptions,
    random_features: bool,
) -> Result<City, GenerationError> {
    generate(options, Some(random_features))
}

fn generate(options: &CityOptions, random_features: Option<bool>) -> Result<City, GenerationError> {
    let options = options.clone();
    std::thread::Builder::new()
        .name("city-generator".into())
        .stack_size(64 * 1024 * 1024)
        .spawn(move || {
            let mut s = Session::with_blueprint(&options, random_features)?;
            let mut options = options;
            if random_features.is_some() {
                let result = (|| -> Result<(), V> {
                    let bp = s.rt.get_name(s.model, "bp")?;
                    for (key, flag) in [
                        ("citadel", &mut options.citadel),
                        ("inner", &mut options.urban_castle),
                        ("plaza", &mut options.plaza),
                        ("temple", &mut options.temple),
                        ("walls", &mut options.walls),
                        ("shanty", &mut options.shantytown),
                        ("coast", &mut options.coast),
                        ("river", &mut options.river),
                        ("greens", &mut options.greens),
                        ("hub", &mut options.hub),
                    ] {
                        let value = s.rt.get_name(bp, key)?;
                        *flag = s.rt.truthy(value);
                    }
                    let gates = s.rt.get_name(bp, "gates")?;
                    options.gates = s.rt.number(gates) as i32;
                    if options.coast {
                        let sea = s.rt.get_name(bp, "coastDir")?;
                        options.sea = s.rt.number(sea);
                    }
                    Ok(())
                })();
                result.map_err(|e| GenerationError(s.rt.text(e)))?;
            }
            adapter::adapt(&mut s.rt, s.kernel, s.model, options).map_err(|e| {
                GenerationError(format!(
                    "{}\n{}",
                    s.rt.text(e),
                    s.rt.error_stack.join(" -> ")
                ))
            })
        })
        .map_err(|e| GenerationError(e.to_string()))?
        .join()
        .map_err(|_| GenerationError("Generator thread panicked".into()))?
}
