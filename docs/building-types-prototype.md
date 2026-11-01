# Gebäudetypen-Prototyp: gemeinsamer Rust-Kern

Isolierter Prototyp für Bautypen, nicht Betriebe/Nutzungen und noch keine Stadtintegration. Die festen [HTML-Blockouts](house-blockout-lab.md) bleiben unveränderte, **nicht gestalterisch abgenommene** Stilreferenzen.

## Interface und Einheiten

`building_core::generate(BuildingType, &Site, &ResolvedProfile, seed: u64) -> Result<Design, Rejection>` erzeugt ohne I/O, Bevy, DOM, Stadtcode oder globalen Zufallszustand. Die Registry heißt `building_core::REGISTRY`; aktuell enthält sie `BuildingType::HouseWithAnnex` / `house-with-annex`.

Alles ist in **Metern**: Planpunkte `Point { x, z }`, Raumpositionen `[x, y, z]`, y nach oben. Ein Meter entspricht im neuen Bevy-Adapter einer Welteinheit; dies ist ausdrücklich **nicht** die alte Stadtkoordinaten-Skalierung.

- `Site.ground`: erlaubte Boden-Baufläche, striktes konvexes CCW-Viereck. Kante 0→1 ist die Vorderkante; anschließend rechte Seite, Rückseite, linke Seite. Es ist nicht automatisch das gesamte Grundstück.
- `Site.envelope`: unabhängige konvexe CCW-Grenze der oberen Projektion; `max_height` begrenzt auch Dächer. `access` reserviert konvexe Flächen von y=0 bis `clearance`. `annex_allowed` ist eine harte räumliche Merkmalsgrenze.
- `ResolvedProfile`: bereits aufgelöste Dimensionsintervalle, Wand-/Dachhöhe und `AnnexPolicy::{Forbidden, Optional, Required}`. `length` gilt für vorderen und hinteren Hauptbauquerschnitt, `depth` senkrecht zur Vorderkante. `setback` ist ein Platzierungsabstand im lokalen Vorderkantenrahmen, keine baurechtliche Abstandsprüfung. Die Zahlen im Demo-Korpus sind synthetische Entwurfsannahmen, keine Bildmessungen/Normen.
- `Design.parts`: `Part` mit Rolle, vierseitiger Körperprojektion, `base`, `wall_top` und `Roof` mit Achse/Firstendpunkten. Bodenberührung liegt nur bei `base == 0` vor; eine obere Projektion ist nicht pauschal Bodenfläche. Der erste Typ hat noch keine Überhänge.
- `Rejection::{InvalidInput, NoFit}(String)` begründet ungültige Eingaben bzw. räumlich nicht passende Entwürfe. Optionale verhinderte Anbauten entfallen mit `Design.notes`; erforderliche führen zur Ablehnung.

Die Hauptkontur folgt zwei unabhängigen lokalen Seitengrenzen, nicht einer gemeinsamen Scherung. Seed/Profile bestimmen Abmessungen, Lage und Anbauanschluss. Zwei Dachflächen werden mit der Hauptkontur konstruiert; der niedrigere Querflügel bindet direkt an einen Abschnitt der hinteren Hauptwand an. Kein nachträgliches Abschneiden oder Glätten.

## Start und lokale Nachweise

Voraussetzungen: Rust/Cargo 1.97.1, Bevy 0.20.0, native Grafik-Ausgabe; hier mit macOS/Metal geprüft. Optional den vorhandenen Cache setzen:

```sh
export CARGO_TARGET_DIR=/Users/tim-jonaswechler/workspace/repositories/timjonaswechler/game/experimental/cities_generator/target
cargo test -p building_core --test generation_contract
cargo test -p building_core --test profile_limits
cargo check -p city_bevy --example building_zoo
cargo test -p city_bevy --lib --example building_zoo
bash docs/proofs/building-types-step1/check-capture-failure.sh
cargo run -p city_bevy --example building_zoo -- --type house-with-annex --site irregular --profile standard --seed 7
```

Rechts ziehen: Orbit; Rad: Zoom; Home: Kamerazustand zurücksetzen; N: nächster Seed; P: nächstes Profil; B: nächster Bauplatz. CLI `--help` listet auch bewusst unpassende Demo-Eingaben. `--camera oblique|rear|top` wählt feste Ansichten. Ein abgelehnter Fall zeigt die Begründung statt Ersatzgeometrie.

```sh
cargo run -p city_bevy --example building_zoo -- \
  --site rectangle --profile standard --seed 7 --camera oblique \
  --screenshot /tmp/building-zoo.png --interaction-smoke --export /tmp/building-zoo.json
bash docs/proofs/building-types-step1/capture.sh
```

`--smoke-test` rendert in eine 1200×900-Bildtextur, wartet auf Renderpipelines und prüft GPU-Pixel sowie PNG-Speicherung; ohne Aufnahme folgt nach 60 s ein Fehler. Capture-/Speicherfehler und Timeouts liefern einen von null verschiedenen Prozessstatus. `--interaction-smoke` injiziert zusätzlich Maus-/Tastatureingaben in dieselben Bevy-Systeme, prüft Orbit/Zoom/Reset und N/P/B-Regeneration, stellt danach die exakten CLI-Eingaben wieder her. Das ist automatisierte Runtime-Evidenz, kein manueller Bedienertest. `--geometry-only --export FILE` exportiert ohne Fenster und endet bei Ablehnung mit Fehlerstatus.

## Gemeinsames Mesh und Erweiterung

`building_core::derive_meshes(&Design)` liefert `SurfaceMesh` mit Positionen, Normalen, Indizes und `Material::{Wall, Roof}`. Nur unveränderte erfolgreich erzeugte Designs sind hierfür zugesichert. `city_bevy::building_adapter::{surface_mesh, spawn_design}` konvertiert f64→f32 und stellt diese Flächen generisch dar; dort gibt es keine Bautyp-Sonderfälle.

Für einen weiteren Typ: `BuildingType` und `REGISTRY` ergänzen, die Typverzweigung in `generation::generate` und die nötigen aufgelösten Profilfelder/-varianten erweitern, dieselben `Design`-/Mesh-Formate nutzen und neue feste Vertragsfälle hinzufügen. Der Zoo liest dieselben synthetischen Profile/Bauplätze wie der Vertrag. Alte Fälle bleiben unverändert. Neue räumliche Fähigkeiten gehören zuerst in Kernmodell und Mesh-Ableitung, nicht in Renderer-Sonderlogik.

## Grenzen und Übergabe

Aktuell: konvexe Viereckkörper, Satteldächer ohne Überstand, ein Hauptbau und höchstens ein niedrigerer Anbau. Keine Innenräume, Türen, Dachverschnitte, oberen Auskragungen oder Bögen. Kontaktwände bleiben intern geschlossen. Numerischer Prototypbereich: Koordinatenbetrag ≤ 10⁶ m, positive Dimensionen/Höhen/Abstände ≤ 10⁴ m, konvexe Polygone mit 3–64 Punkten; Körperfläche > 1 m². Dies sind Implementierungsgrenzen, keine Architekturnormen.

Es wird genau ein deterministischer Kandidat geprüft, kein Packungs-/Suchoptimierer. Eine Ablehnung kann daher auftreten, obwohl ein anderer Seed passen würde. Größter Engpass für Schritt 2 ist das noch auf vierseitige Wandkörper und Satteldächer begrenzte Entwurfsformat; echte Öffnungen/obere Körper müssen geometrisch erweitert und geprüft werden. Stadt-Konvertierung folgt erst Schritt 3.

Original/V1/V2, Marktlogik, alte CLI und eingefrorene Referenzen wurden nicht editiert. Keine CI/Runner, keine Workspace-Gesamtsuite. [Evaluator, Iterationen, Befehle, Bilder und Review-Ledger](proofs/building-types-step1/proof.md) trennen technische Evidenz von subjektiven Bildbefunden.
