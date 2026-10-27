use city_core::{CityOptions, generate_city, generate_snapshot};
use serde_json::Value;

fn difference(expected: &Value, actual: &Value, path: &str) -> Option<String> {
    match (expected, actual) {
        (Value::Number(a), Value::Number(b)) => {
            if a.as_f64() == b.as_f64() {
                None
            } else {
                Some(format!("{path}: original {a}, Rust {b}"))
            }
        }
        (Value::Array(a), Value::Array(b)) => {
            if a.len() != b.len() {
                return Some(format!("{path}: length {} != {}", a.len(), b.len()));
            }
            a.iter()
                .zip(b)
                .enumerate()
                .find_map(|(i, (a, b))| difference(a, b, &format!("{path}[{i}]")))
        }
        (Value::Object(a), Value::Object(b)) => {
            if a.len() != b.len() || a.keys().any(|k| !b.contains_key(k)) {
                return Some(format!("{path}: different object keys"));
            }
            a.iter()
                .find_map(|(k, a)| difference(a, &b[k], &format!("{path}.{k}")))
        }
        _ => {
            if expected == actual {
                None
            } else {
                Some(format!("{path}: original {expected}, Rust {actual}"))
            }
        }
    }
}
#[test]
fn complete_original_snapshots_match_without_rounding_or_tolerance() {
    let root = std::path::Path::new(env!("CARGO_MANIFEST_DIR")).join("tests/fixtures");
    let mut paths = std::fs::read_dir(root)
        .unwrap()
        .map(|p| p.unwrap().path())
        .filter(|p| p.extension().is_some_and(|e| e == "json"))
        .collect::<Vec<_>>();
    paths.sort();
    assert_eq!(
        paths.len(),
        24,
        "the complete reference set must be present"
    );
    for path in paths {
        let fixture: Value = serde_json::from_slice(&std::fs::read(&path).unwrap()).unwrap();
        let options: CityOptions = serde_json::from_value(fixture["options"].clone()).unwrap();
        let result = generate_snapshot(&options).unwrap();
        let diff = difference(&fixture["snapshot"], &result, "$");
        assert!(
            diff.is_none(),
            "{}: {}",
            path.display(),
            diff.unwrap_or_default()
        );
        eprintln!(
            "exact parity: {}",
            path.file_name().unwrap().to_string_lossy()
        );
    }
}
#[test]
fn public_model_is_owned_finite_and_repeatable() {
    let options = CityOptions {
        size: 5,
        seed: 42,
        ..Default::default()
    };
    let a = generate_city(&options).unwrap();
    let b = generate_city(&options).unwrap();
    assert_eq!(
        serde_json::to_value(&a).unwrap(),
        serde_json::to_value(&b).unwrap()
    );
    assert!(!a.wards.is_empty());
    assert!(a.building_count() > 0);
    for ward in &a.wards {
        for p in ward
            .polygon
            .iter()
            .chain(ward.buildings.iter().flat_map(|b| &b.polygon))
        {
            assert!(p.x.is_finite() && p.y.is_finite());
        }
    }
}
#[test]
fn invalid_inputs_fail_before_generation() {
    for options in [
        CityOptions {
            seed: 0,
            ..Default::default()
        },
        CityOptions {
            seed: 2147483647,
            ..Default::default()
        },
        CityOptions {
            size: 0,
            ..Default::default()
        },
        CityOptions {
            size: 201,
            ..Default::default()
        },
        CityOptions {
            gates: -2,
            ..Default::default()
        },
        CityOptions {
            sea: f64::NAN,
            ..Default::default()
        },
    ] {
        assert!(generate_city(&options).is_err());
    }
}

#[test]
fn projected_geometry_matches_archived_typescript() {
    let root = std::path::Path::new(env!("CARGO_MANIFEST_DIR")).join("tests");
    for name in ["seed-924709892", "coast-river", "shanty-greens"] {
        let fixture: Value = serde_json::from_slice(
            &std::fs::read(root.join(format!("fixtures/{name}.json"))).unwrap(),
        )
        .unwrap();
        let options: CityOptions = serde_json::from_value(fixture["options"].clone()).unwrap();
        let mut actual = serde_json::to_value(generate_city(&options).unwrap()).unwrap();
        actual.as_object_mut().unwrap().remove("options");
        let expected: Value = serde_json::from_slice(
            &std::fs::read(root.join(format!("adapter-fixtures/{name}.json"))).unwrap(),
        )
        .unwrap();
        let diff = difference(&expected, &actual, "$");
        assert!(diff.is_none(), "{name}: {}", diff.unwrap_or_default());
    }
}

#[test]
fn original_blueprints_replay_with_their_resolved_options() {
    for random in [false, true] {
        let options = CityOptions {
            seed: 42,
            size: 10,
            coast: true,
            ..Default::default()
        };
        let generated = city_core::generate_blueprint_city(&options, random).unwrap();
        let replay = generate_city(&generated.options).unwrap();
        let diff = difference(
            &serde_json::to_value(generated).unwrap(),
            &serde_json::to_value(replay).unwrap(),
            "$",
        );
        assert!(diff.is_none(), "{}", diff.unwrap_or_default());
    }
}
