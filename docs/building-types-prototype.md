# Gebäudetypen-Prototyp: gemeinsamer Rust-Kern

Isolierter Prototyp für Bautypen, nicht Betriebe/Nutzungen und noch keine Stadtintegration. Die festen [HTML-Blockouts](house-blockout-lab.md) bleiben unveränderte, **nicht gestalterisch abgenommene** Stilreferenzen.

## Interface und Einheiten

`building_core::generate(BuildingType, &Site, &ResolvedProfile, seed: u64) -> Result<Design, Rejection>` erzeugt ohne I/O, Bevy, DOM, Stadtcode oder globalen Zufallszustand. Die Registry heißt `building_core::REGISTRY`; sie enthält `BuildingType::HouseWithAnnex` / `house-with-annex` und `BuildingType::TownhouseWithGate` / `townhouse-with-gate`.

Alles ist in **Metern**: Planpunkte `Point { x, z }`, Raumpositionen `[x, y, z]`, y nach oben. Ein Meter entspricht im neuen Bevy-Adapter einer Welteinheit; dies ist ausdrücklich **nicht** die alte Stadtkoordinaten-Skalierung.

- `Site.ground`: erlaubte Boden-Baufläche, striktes konvexes CCW-Viereck. Kante 0→1 ist die Vorderkante; anschließend rechte Seite, Rückseite, linke Seite. Es ist nicht automatisch das gesamte Grundstück.
- `Site.envelope`: unabhängige konvexe CCW-Grenze der oberen Projektion; `max_height` begrenzt auch Dächer. `access` reserviert konvexe Flächen von y=0 bis `clearance`. `annex_allowed` ist eine harte räumliche Merkmalsgrenze; `max_overhang` begrenzt den Obergeschossvorstoß gegenüber dem unteren Körper (fehlend: 0 m). Ein freier Durchgang ist eine reservierte Fläche mit freier Höhe, keine Nutzung.
- `ResolvedProfile` ist eine typspezifische Enum: `HouseWithAnnex(HouseWithAnnexProfile)` und `TownhouseWithGate(TownhouseWithGateProfile)`. Serde liest die bisherigen Haus-JSON-Objekte unverändert über eine ungetaggte Enum. Ein Profil des falschen Typs wird begründet als `InvalidInput` abgelehnt. `building_type()` ordnet Profile dem Katalog zu. Hausparameter und `AnnexPolicy::{Forbidden, Optional, Required}` bleiben semantisch unverändert. Stadthausparameter beschreiben separat untere/obere Geschosshöhe, Überstandsintervall sowie Torbreite einschließlich Pfeilern, Pfeilerbreite, Kämpferhöhe, Bogenanstieg, Wandabschluss und Dachanstieg. Keine Umdeutung von Anbaumaßen.
- `length` gilt für vorderen und hinteren Hauptbauquerschnitt, `depth` senkrecht zur Vorderkante. `setback` ist ein lokaler Platzierungsabstand, keine baurechtliche Abstandsprüfung. Alle Korpusmaße sind synthetische Entwurfsannahmen, keine Bildmessungen/Normen.
- `Design.parts`: `Part` mit Rolle, vierseitiger Körperprojektion, `base`, `wall_top`, optionalem `Roof` mit Achse/Firstendpunkten und optionaler `ArchOpening`. Ein dachloses Geschoss hat `roof: None`, kein verstecktes Dummy-Dach. Die Bogenöffnung läuft zwischen zwei Anteilen der Vorderkante durch die ganze Tiefe; Kämpferhöhe ist absolut. Gemeinsame private Zellen zerlegen Pfeiler und zehn Bogenabschnitte für Prüfung **und** Mesh. Nur die Pfeiler berühren den Boden; die Portal-Gesamtprojektion ist keine volle Bodenbelegung.
- `Rejection::{InvalidInput, NoFit}(String)` begründet ungültige Eingaben bzw. räumlich nicht passende Entwürfe. Optionale verhinderte Anbauten entfallen mit `Design.notes`; erforderliche führen zur Ablehnung.

Beide Hauptkonturen folgen zwei unabhängigen lokalen Seitengrenzen, nicht einer gemeinsamen Scherung. Seed/Profile bestimmen Abmessungen, Lage und Anbauanschluss. Beim Haus mit Anbau werden zwei Dachflächen mit der Hauptkontur konstruiert; der niedrigere Querflügel bindet direkt an einen Abschnitt der hinteren Hauptwand an. Kein nachträgliches Abschneiden oder Glätten.

## Start und lokale Nachweise

Voraussetzungen: Rust/Cargo 1.97.1, Bevy 0.20.0, native Grafik-Ausgabe; hier mit macOS/Metal geprüft. Optional den vorhandenen Cache setzen:

```sh
export CARGO_TARGET_DIR=/Users/tim-jonaswechler/workspace/repositories/timjonaswechler/game/experimental/cities_generator/target
cargo test -p building_core --test generation_contract
cargo test -p building_core --test profile_limits
cargo test -p building_core --test townhouse_contract --test legacy_replay --test townhouse_profile_limits
cargo check -p city_bevy --example building_zoo
cargo test -p city_bevy --lib --example building_zoo
bash docs/proofs/building-types-step1/check-capture-failure.sh docs/proofs/building-types-step2/capture-failure-runtime.txt
cargo run -p city_bevy --example building_zoo -- --type house-with-annex --site irregular --profile standard --seed 7
cargo run -p city_bevy --example building_zoo -- --type townhouse-with-gate --site town_rectangle --profile town_standard --seed 7
bash docs/proofs/building-types-step2/capture.sh
```

Rechts ziehen: Orbit; Rad: Zoom; Home: Kamerazustand zurücksetzen; N: nächster Seed; P: nächstes Profil; B: nächster Bauplatz. CLI `--help` listet auch bewusst unpassende Demo-Eingaben. `--camera oblique|rear|top` wählt feste Ansichten. Ein abgelehnter Fall zeigt die Begründung statt Ersatzgeometrie.

```sh
cargo run -p city_bevy --example building_zoo -- \
  --site rectangle --profile standard --seed 7 --camera oblique \
  --screenshot /tmp/building-zoo.png --interaction-smoke --export /tmp/building-zoo.json
bash docs/proofs/building-types-step1/capture.sh
```

Der isolierte Zoo deaktiviert Bevy-Pipelined-Rendering in **beiden** Modi: lokal hing dessen Abbau nach `AppExit` trotz gespeicherter Aufnahme. Es bleibt derselbe native Renderer und dieselbe Mesh-Ableitung, ohne erzwungenen Prozessabbruch. `--smoke-test` rendert in eine 1200×900-Bildtextur, wartet auf Renderpipelines und prüft GPU-Pixel sowie PNG-Speicherung; ohne Aufnahme folgt nach 60 s ein Fehler. Capture-/Speicherfehler und Timeouts liefern einen von null verschiedenen Prozessstatus. `--interaction-smoke` injiziert zusätzlich Maus-/Tastatureingaben in dieselben Bevy-Systeme, prüft Orbit/Zoom/Reset und N/P/B-Regeneration, stellt danach die exakten CLI-Eingaben wieder her. Das ist automatisierte Runtime-Evidenz, kein manueller Bedienertest. `--geometry-only --export FILE` exportiert ohne Fenster und endet bei Ablehnung mit Fehlerstatus.

## Gemeinsames Mesh und Erweiterung

`building_core::derive_meshes(&Design)` liefert `SurfaceMesh` mit Positionen, Normalen, Indizes und `Material::{Wall, Roof}`. Nur unveränderte erfolgreich erzeugte Designs sind hierfür zugesichert. `city_bevy::building_adapter::{surface_mesh, spawn_design}` konvertiert f64→f32 und stellt diese Flächen generisch dar; dort gibt es keine Bautyp-Sonderfälle.

Für einen weiteren Typ: `BuildingType` und `REGISTRY` ergänzen, eine typspezifische Profilvariante und ein privates Typ-Modul hinzufügen, in `generation::generate` zuordnen, dieselben `Design`-/Mesh-Formate nutzen und neue feste Vertragsfälle hinzufügen. Der Zoo liest dieselben synthetischen Profile/Bauplätze wie der Vertrag. Alte Fälle bleiben unverändert. Neue räumliche Fähigkeiten gehören zuerst in Kernmodell und Mesh-Ableitung, nicht in Renderer-Sonderlogik.

## Konkretes Modularitätsexperiment: Stadthaus mit Tor

Nötige Erweiterungspunkte: Typ-/Registryeintrag und Profilvariante in `lib.rs`, privates `generation/townhouse_with_gate.rs`, eigener eingefrorener Korpus/Test sowie synthetischer Demo-Katalogeintrag im Zoo. Auch der alte Typ liegt jetzt privat in `generation/house_with_annex.rs`; RNG, Eingangsprüfung, Konturplatzierung, Satteldach und räumliche Prüfung bleiben gemeinsam.

Die Annahmen „jedes Part trägt ein Dach“ und „ein Profil besteht aus Haus-/Anbaumaßen“ waren widerlegt. Minimale Modellkorrektur: `Option<Roof>`, typspezifische Profile und `ArchOpening`. Die neue gemeinsame Fähigkeit `solid::cells` dient sowohl Fit-Prüfung als auch Mesh-Ableitung; Renderer/Adapter bleiben ohne Typgeometrie. Alte Rust-Testzugriffe ändern sich mechanisch zu Profil-Pattern-Matching und `roof.as_ref().unwrap()`; sämtliche alten Assertions und JSON-Bytes bleiben erhalten. `legacy_replay` vergleicht zusätzlich fünf Schritt-1-Exportentwürfe einschließlich aller Konturen, Firste und Notizen unverändert.

Das Stadthaus hat einen unteren Körper, ein direkt aufliegendes oberes Geschoss und einen seitlich wandgebundenen, niedrigeren Torflügel. Der obere Vorstoß liegt nur vorn und halb so weit links; begrenzt auf 0,8 m und 15 % der Mindesttiefe sowie die harte Bauplatzfreigabe. Das ganze aufgelöste Intervall muss erlaubt sein; kein heimliches Stauchen. Beim Stadthaus werden zulässige vordere/hintere Längen gemeinsam aufgelöst und Haupt-/Torform gemeinsam zentriert; der erste Typ behält seine bisherige Seed-Semantik. Profilprüfung hält auch den Torfirst strikt unter dem maximalen Hauptfirst; nur niedrigere Torwände allein genügen nicht. Das Tor besitzt echte Pfeiler und facettierte Bogenunterseiten, keine Wandtextur. Keine Brücke zwischen getrennten Häusern.

## Grenzen und Übergabe

Aktuell: konvexe Viereckkörper, Satteldächer ohne Dachüberstand, zwei echte Typen mit begrenztem Obergeschossvorstoß und einer geraden, facettierten Bogenöffnung. Keine Innenräume, Türblätter, Dachverschnitte, Sockel/Treppen, Erker oder Konsolen. Kontaktwände bleiben intern geschlossen. Numerischer Prototypbereich: Koordinatenbetrag ≤ 10⁶ m, positive Dimensionen/Höhen/Abstände ≤ 10⁴ m, konvexe Polygone mit 3–64 Punkten; Körperfläche > 1 m². Dies sind Implementierungsgrenzen, keine Architekturnormen.

Es wird genau ein deterministischer Kandidat geprüft, kein Packungs-/Suchoptimierer. Eine Ablehnung kann daher auftreten, obwohl ein anderer Seed passen würde. Die Freiraumprüfung ist konservativ pro Bogenabschnitt: sie kann knappe, tatsächlich freie Teilflächen ablehnen, aber belegt keine reservierte Fläche. Keine allgemeine Kollision-, Statik- oder Polygonreparatur. Größter verbleibender Engpass für Schritt 3 ist die explizite Konvertierung von Stadt-Bauplatz/Profil/Einheiten in dieses Interface; Stadt-Konvertierung erfolgt erst dort.

Original/V1/V2, Marktlogik, alte CLI und eingefrorene Referenzen wurden nicht editiert. Keine CI/Runner, keine Workspace-Gesamtsuite. [Schritt 1: Evaluator und Proof](proofs/building-types-step1/proof.md) · [Schritt 2: Evaluator, Iterationen, Bilder und Review](proofs/building-types-step2/proof.md) trennen technische Evidenz von subjektiven Bildbefunden.
