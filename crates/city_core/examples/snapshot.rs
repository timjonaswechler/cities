use city_core::{CityOptions, generate_snapshot};
fn main() -> Result<(), Box<dyn std::error::Error>> {
    let options = if let Some(path) = std::env::args().nth(1) {
        serde_json::from_str(&std::fs::read_to_string(path)?)?
    } else {
        CityOptions::default()
    };
    let snapshot = generate_snapshot(&options)?;
    println!("{}", serde_json::to_string(&snapshot)?);
    Ok(())
}
