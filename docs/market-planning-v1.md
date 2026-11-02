# Marktplanung V1

Die gemeinsam akzeptierte Marktlogik aus dem [HTML-Stadtlabor](../crates/city_core/prototypes/market-district-lab.html) ist als natives Rust-Feature übernommen. Das Regelwerk ist die Basis für weitere Entwicklung; Profilwerte bleiben veränderbar. Dies ist keine Freigabe baulicher Marktflächen oder der früheren Hof-/Wachstumsprototypen.

## Bedienung

```sh
cargo run -- --seed 42 --size 25 --economy
cargo run -- --seed 42 --size 25 --market-profile assets/market-profiles/market-v1.json
cargo run -- --write-market-profile exports/market-profile.json
cargo run -- --market-profile exports/market-profile.json --export exports/city.json
```

`--market-profile` lädt ein Profil und aktiviert die Planung. `--write-market-profile` schreibt das gewählte Profil und beendet sich ohne Stadtgenerierung. `--export` bleibt fensterlos; die separate Analyse steht in `economy`, die ursprüngliche Stadt unverändert in `city`. Ohne aktivierte Marktplanung bleibt das bisherige Exportformat erhalten. Original-Snapshots können nicht mit Marktplanung kombiniert werden.

In Bevy aktiviert `E` die Planung. „Marktregeln anzeigen“ öffnet die Profilsteuerung: Plus/Minus ändern Hauptmarkt-Abstand, Nebenmarkt-Abstand, Versorgungsweg, Distriktgewicht, Mindestbedarf und Höchstzahl. Die Stadt wird im Hintergrund mit denselben Optionen erneut erzeugt und neu bewertet. „Profil V1 zurücksetzen“ lädt die V1-Ausgangswerte. „Marktprofil als JSON speichern“ schreibt `exports/market-profile-<seed>.json`; die Profilsteuerung wird nicht automatisch auf der Festplatte gespeichert.

Dachfarben zeigen **Markteinzug, keine Gebäudenutzung**: H braun, M1 gold, M2 blau, M3 grün, M4 violett, M5 rot, unversorgt grau. Beschriftete Pins sind Standortvorschläge, keine neuen Plätze. Wege können ausgeblendet, ab Hauptmarkt oder einschließlich Nebenmarkt-Paaren gezeigt werden; Distriktumrisse sind separat schaltbar. Der Bericht nennt Laufwege, gewichtete Distriktabdeckung und Ablehnungszahlen.

![Native Marktplanung V1](market-v1-preview.png)

Das HTML-Stadtlabor bleibt als interaktive Referenz einschließlich seiner Regler und Tabellen erhalten. Die native Anwendung benötigt weder HTML noch JavaScript zur Planung.

## Profil und feste Regeln

Das benannte [V1-Ausgangsprofil](../assets/market-profiles/market-v1.json) hat Version 1: Hauptmarkt 200 m, Nebenmärkte untereinander 160 m, Versorgung 240 m, Distriktgewicht 1, mindestens zwölf begünstigte Gebäude und höchstens drei Nebenmärkte. Dies sind veränderbare Ausgangswerte, keine historischen Festwerte. Die nativen Regler haben dieselben Bereiche wie das Stadtlabor; über die Rust-Schnittstelle und JSON sind auch andere endliche, gültige Distanzen möglich.

Profile akzeptieren nur bekannte Felder. Version muss 1 sein; Mindestabstände müssen endlich und nichtnegativ, Versorgungsweg endlich und positiv sein. Distriktgewicht liegt zwischen 0 und 2, Mindestbedarf ist positiv, Höchstzahl zwischen 0 und 5. Fehlende Felder erhalten die V1-Ausgangswerte. Das V1-Profil und die HTML-Referenz bleiben als Vergleichsbasis erhalten, statt zukünftige Regeländerungen stillschweigend darin umzudefinieren.

- Hauptmarkt-Abstand und gegenseitiger Nebenmarkt-Abstand sind getrennte harte Filter. Vom Hauptmarkt unerreichbare Kandidaten sind nicht zulässig.
- Gültige Zugänge der ursprünglichen Hauptmarktfläche sind verbunden. Wege zum Hauptmarkt beginnen an seinem nächst erreichbaren Zugang, nicht am Platzmittelpunkt. Nebenmärkte bleiben Kandidatenpunkte an Kreuzungen.
- Verbleibende Kandidaten konkurrieren um den nach Nachfrage gewichteten, beim Versorgungsweg gedeckelten Wegegewinn. Gebäude zählen als begünstigt, wenn ihr Weg mindestens 10 m kürzer wird und der neue Markt in Reichweite liegt.
- Distriktdefizite gewichten den Wegegewinn weich mit `1 + districtWeight × unversorgter Nachfrageanteil`. Es gibt keine Marktquote pro Distrikt; mehrere Märkte pro großem Distrikt und gemeinsame Versorgung mehrerer Distrikte sind möglich.
- Null Nebenmärkte sind zulässig. Keine Grundrisse werden verändert und keine Marktflächen freigeräumt.

## Kleines Interface für künftige Nachfrage

```rust
use city_core::{MarketProfile, plan_markets};

let profile = MarketProfile::default();
let plan = plan_markets(&city, &profile, &[])?;
```

`analyze_economy(&city)` ist die Kurzform mit dem V1-Profil und ursprünglicher Gebäudegrundfläche als Nachfrage-Proxy. `plan_markets` liefert einen eigenständigen `MarketPlan` mit Profil, Standorten, Gebäudezuordnung, Distriktabdeckung, paarweisen Wegen und Kandidaten-Ablehnungsgründen; ungültige Profile oder Nachfrageeingaben liefern einen Fehler.

Der dritte Parameter nimmt eine Liste von `MarketDemandOverride { ward_id, building_index, weight }` entgegen. Sie ersetzt Gewichte einzelner gewöhnlicher `lot`-Gebäude; ausgelassene Gebäude behalten die ursprüngliche Grundfläche als Gewicht. Gewichte müssen endlich, nichtnegativ und die IDs gültig und eindeutig sein. Gewicht null unterdrückt Nachfrage, nicht das Gebäude oder seine räumliche Marktzuordnung. Abdeckung und versorgte Gewichte sind dann nachfragegewichtet und keine Quadratmeter- oder Einwohnerangaben.

Künftige Nutzungs-/Bevölkerungsfeatures können diese Daten **vor** der Planung liefern. Der Planer verändert weder Stadt noch Nachfrage und erzeugt keine Gebäudenutzungen, die anschließend ihren eigenen Marktbedarf rechtfertigen. Es gibt bewusst noch kein Plugin-System, keine Bevölkerungssimulation und keine automatische Rückkopplungsschleife. Die native Oberfläche verwendet zunächst nur die Grundflächen-Nachfrage.

## Verifikation und Grenzen

`crates/city_core/tests/market_v1.rs` vergleicht alle 27 gespeicherten Konfigurationen der HTML-Referenz mit dem Rust-Planer: Standorte, Abstände, Anzahl, Wege, Abdeckung und Distriktergebnisse. Verwendet werden dieselben auf vier Nachkommastellen gerundeten Referenzdaten; reale native Städte behalten weiterhin ihre ursprünglichen `f64`-Koordinaten. Zahlenvergleiche dieser Portierungsreferenz erlauben 1e-6 Abweichung, die gesonderten Originalgenerator-Tests bleiben exakt.

Weitere Tests prüfen Profil-Serialisierung, Nachfrageeingaben, den Null-Nachfrage- und fehlenden-Hauptmarkt-Fall, unveränderte Stadtgeometrie, asynchrone Profiländerungen, Anzeige-Umschaltung und JSON-Exporte. Die HTML-Datei und ihre aufgezeichneten Läufe wurden für den Port nicht verändert.

Die Netzrekonstruktion bleibt eine Annäherung. Gassenenden erhalten gegebenenfalls kurze Verbindungen; Gebäudezugänge sind geschätzte Geraden und können andere Gebäude schneiden. Flussmittellinien, Küsten und Mauersegmente werden mit Brücken-/Torkorridoren berücksichtigt, aber nicht sämtliche Uferbreiten und baulichen Hindernisse. Gedeckelte Wegemittel und gewichtete Abdeckung sind Modellwerte, keine garantierten realen Gehstrecken. Kapazität, Abrisskosten, Grundstücke, Gewerbecharakter und wirtschaftliche Wachstumsschritte sind weiterhin offen.
