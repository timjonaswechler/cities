# Rust-Port

## Abgrenzung

Das aktive Projekt ist ein Cargo-Workspace mit `city_core` und `city_bevy`. Der ausführbare TypeScript-Vorgänger ist unter `backlog/typescript-2026-10-14` rekonstruiert; Herkunft und Wiederherstellungslücken stehen in [recovery.md](recovery.md). Der Rust-Generator lädt und interpretiert kein JavaScript. Alle ursprünglichen Berechnungen sind native Rust-Funktionen.

Die Übertragung ist bewusst mechanisch: Die dynamischen Haxe-Interna wurden nicht gleichzeitig in einen neuen Geometriealgorithmus umgebaut. Ein solcher Umbau würde Reihenfolgen und Objektidentitäten verändern können. Das öffentliche Modell, die Projektion und die Bevy-Anwendung sind handgeschriebener Rust-Code. `generated.rs` bleibt generierter Code mit Verweisen auf die ursprünglichen Quellzeilen.

## Aufbau

| Pfad | Verantwortung |
| --- | --- |
| `crates/city_core/src/generated.rs` | 790 native Funktionen des ursprünglichen Kernels |
| `crates/city_core/src/runtime.rs` | Haxe-Werte, Prototypen, gebundene Funktionen, Objektreihenfolge, Arena |
| `crates/city_core/src/math.rs` | V8/fdlibm-kompatible Sinus-, Kosinus- und Arkustangensberechnungen |
| `crates/city_core/src/model.rs` | Öffentliche Optionen und eigenes, serialisierbares Modell |
| `crates/city_core/src/adapter.rs` | Originalgrundrisse und Zeichenpfade in eigene Daten übernehmen |
| `crates/city_core/src/snapshot.rs` | Vollständiges kanonisches Modell für Originalvergleiche |
| `crates/city_bevy/src/mesh.rs` | Triangulation, Gebäudeextrusion, Wege, Mauern und Vegetation |
| `crates/city_bevy/src/main.rs` | Native Bedienung, Kamera, Hintergrundgenerierung und Exporte |
| `tools/port-kernel.mjs` | Nachvollziehbare Übersetzung des archivierten Kernels nach Rust |

Pro Generatoraufruf wird eine eigene Arena angelegt. Referenzen sind IDs, sodass zyklische DCEL-Strukturen ohne `Rc`-Zyklen erhalten bleiben. Nach der Übernahme in das öffentliche Modell wird die gesamte Arena freigegeben. Generatoraufrufe können parallel erfolgen, ohne globale Zufallszustände zu teilen. Ein Worker mit größerem Stack trägt die rekursiven Originalfunktionen.

Die ursprünglichen Wiederholungsversuche bei ungültiger Geometrie bleiben erhalten. Nach 31 Fehlversuchen oder mehr als 300 Millionen Schleifeniterationen liefert die API einen Fehler. Die Oberfläche behält dann die bisherige Stadt. Unterstützte Eingaben sind Größe 1–200, Seed 1–2147483646 und Tore −1–30. Die Oberfläche beginnt bei Größe 5.

## Numerik und Originaltreue

Das Original ist Watabou MFCG 0.11.5, Build 2431, Bundle-SHA-256:

```text
b67cf2e75dcae555a9de56f49d897a04a0a2cbcdccc9e40df02c9f249459d86e
```

`tools/port-provenance.json` hält die Prüfsumme des archivierten TypeScript-Kernels und die Quellzeilen aller übertragenen Funktionen fest. Statische Initialisierung, RNG-Resets, Benennung vor Gebäudegenerierung, Objektidentitäten und numerische Schlüsselreihenfolge bleiben erhalten.

Rusts normale trigonometrische Funktionen und `libm` allein reproduzierten die V8-Ergebnisse nicht überall. `math.rs` erhält deshalb die ursprünglichen Polynome und die auf der Node-Referenz verwendeten zusammengefassten Multiplikations-/Additionsschritte explizit mit `mul_add`. Die übrige Generatorarithmetik wird ohne Fast-Math ausgeführt. Das gilt insbesondere für Zwischenergebnisse der Delaunay- und Polygonberechnung.

Die Referenzen in `tests/fixtures` werden durch das vollständige Originalbundle in Node 26.7.0 auf macOS ARM64 erzeugt. Die Tests vergleichen alle kanonischen Felder und Zahlen exakt, nicht nur Stadtnamen oder Gebäudeanzahlen. Die Referenzfälle decken ursprüngliche und zusätzliche Seeds, kleine bis große Städte, Küstenrichtungen, Flüsse, Mauern, innere Burgen, Vorstädte, Grünflächen, Hubs und vorgegebene Namen ab. Die öffentlichen Zeichenpfade einschließlich Brücken, Mauertoren, Baumkronen und Beschriftungspfaden werden zusätzlich gegen den archivierten TypeScript-Adapter geprüft.

Die Bitgleichheit anderer Betriebssysteme und CPU-Architekturen ist separat zu prüfen: `powf` verwendet weiterhin die jeweilige Systemimplementierung. Sinus und Kosinus extrem großer Winkel außerhalb der V8-Mittelbereichsreduktion verwenden `libm`. Die ursprünglichen Browser-Referenzdateien fehlen im Chatarchiv. Die acht URL-Fälle wurden mit dem vollständigen Originalbundle in Node neu erzeugt und sind entsprechend gekennzeichnet. Browser und Node unterschieden sich schon vor dem Rust-Port. Es wird keine universelle Bitgleichheit aller Laufzeiten behauptet.

`Math.random` dient im hier verwendeten Originalpfad nur der Vorwahl einer künftigen Stadtgröße. Es hat einen getrennten Host-Zufallszustand. Der eigentliche Generator verwendet ausschließlich seine übertragene ursprüngliche Seed-Folge. Assets und Namenskorpora werden unverändert ins Rust-Binary eingebettet.

## Reproduzieren

Zum normalen Build werden nur Rust und Cargo benötigt. Für die erneute Quellübersetzung oder Referenzerzeugung werden die archivierten Node-Entwicklungsabhängigkeiten benötigt:

```sh
node tools/port-kernel.mjs
node tools/original-fixtures.mjs
node tools/adapter-fixtures.mjs
cargo test --workspace
```

Die erste Referenzerzeugung lädt gegebenenfalls das gepinnte Originalbundle und prüft dessen SHA-256. Die eingecheckten Rust-Tests brauchen keinen Download und überspringen keine fehlenden Referenzen.

Für einen nativen Renderlauf mit anschließendem Beenden:

```sh
cargo run -- --screenshot exports/bevy.png --smoke-test
```

Der Smoke-Test rendert Stadt und UI in eine eigene GPU-Textur. Damit hängt die Aufnahme nicht von einem sichtbaren Fenster ab und funktioniert auch bei aktivem Bildschirmschoner. Eine leere Aufnahme lässt den Test fehlschlagen. Die interaktive Anwendung rendert weiterhin direkt ins Fenster.

Verifiziert auf macOS ARM64: 24 vollständige Originalmodelle ohne Zahlenabweichung, drei vollständige Geometrievergleiche mit dem TypeScript-Adapter sowie Tests für Wiederholbarkeit, Optionen, die ursprüngliche Blueprint-Generierung, Triangulation und asynchrone Bedienung. Insgesamt bestehen acht Rust-Tests. `cargo fmt`, Clippy mit `-D warnings` und die Archivprüfung bestehen ebenfalls. Ein nativer Metal-Renderlauf ist in [bevy-preview.png](bevy-preview.png) festgehalten.

## Bevy und Terrain

Bevy ist exakt auf 0.20.0 gepinnt. Layoutberechnungen behalten `f64`; erst der Mesh-Aufbau wandelt nach `f32`. Gebäude, Mauern und Bäume werden nach Material zusammengefasst. Die Dachtriangulation unterstützt konkave Grundrisse. Stadtgenerierung läuft außerhalb des Renderthreads.

Die Darstellung erzeugt zunächst eine ebene Szene. Gebäudehöhen und Dachoberseiten sind Visualisierung, keine aus dem 2D-Original rekonstruierten Höhen. `HeightField` ist die vorbereitete Abfrage für Gelände in Metern. Die Bevy-Ansicht nutzt noch keine Heightmap. Geländeangepasste Fundamente, Straßenneigungen und eine veränderte, geländebewusste Planung sind weitere Arbeit; der Referenzmodus bleibt davon unabhängig.
