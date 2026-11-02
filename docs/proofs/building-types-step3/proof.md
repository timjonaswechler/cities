# Schritt 3: kleine echte Stadtanbindung — Evidenz

Schrittbaseline `767e1160f714a99aa25016b680021af9744ef317`; Gesamtbaseline für Review `6ea9dd29c9653035aa077e246ed13769a38b6bc2`. Sauberer vorbereiteter Worktree/HEAD vor Beginn geprüft. Budget konservativ 22:12–23:12 UTC am 2026-11-01, höchstens sechs Implementierungs-/Messiterationen und drei sequentielle Reviews. [Vorab eingefrorener Evaluator](evaluator.md), [Inputprüfsummen](frozen-sha256.txt).

## Baseline und feste Eingaben

Vor Änderungen frisch beobachtet: neun Core-Tests (15 alte + 13 neue Vertragsfälle, Profilgrenzen, fünf exakt replayte alte Entwürfe), Adapter 1/1, Zoo 2/2 grün. Reale Quelle im ursprünglichen Checkout ausschließlich gelesen: `exports/market-v1-city.json`; vollständige City **und** Markt-Export sind mit der frisch erzeugten Baseline JSON-identisch. Quellen V1/V2-Vergleich und Marktprofil gelesen. Purplechurch seed 42 / size 25 mit allen bisherigen Defaultoptionen, 422 Gebäude. Keine Ersatzstadt.

Vor Implementierung Original-/Markt-/Snapshot- und V1-/V2-Exporte erzeugt; kanonische Voll-JSON-Hashes in [baseline-export-hashes.json](baseline-export-hashes.json), Original-/Markt-/Snapshot-Eingaben hier eingefroren. Originalübersicht zuerst mit unverändertem Baselinebinary nativ aufgenommen (Exit 0); später kameraidentisch im ausgeschalteten Modus wiederholt. Detailaufnahmen verwenden nur neue explizite Kameraoptionen, nicht neue Stadtgeometrie.

Feste reale Rohkonturen/Optionen/Profile stehen in `crates/city_bevy/tests/fixtures/city-building-types-v1.json`; ausführbare Konfiguration `assets/building-types/purplechurch.json`, beide vor Stubmessung eingefroren und unverändert. `3:0` Haus, `3:2` Stadthaus, `3:1` absichtlich sieben Ecken. Nur zwei Originalgebäude optisch ersetzt, die restlichen 420 einschließlich des abgelehnten Kandidaten bleiben Originalbestand. Profile entsprechen den bereits geprüften Standardprofilen; harte Versuchsbedingungen 12 m / Anbau erlaubt / maximal 0,6 m Vorstoß. Keine Vergrößerung der originalen Kontur.

## Iterationen

0. [Rote neue Baseline](baseline-red.txt): expliziter Nichtimplementiert-Stub, neuer Adaptervertrag 0/3, Exit 101. Kein Compilefehler als Fortschritt ausgegeben.
1. Konservative Umrechnung/Frontwahl, Prüfung Originalkonturen gegen vorhandenen Bestand, räumliche Reservierungen und profilgewichteter Selector implementiert. [Messung](iteration-1.txt): 1/3; zwei Fälle wegen vermeintlicher Überschneidung `3:2`/`3:3` rot.
2. Hypothese geprüft: nahezu kollineare gemeinsame Kante liefert Kreuzprodukt etwa `8,88e-15`; Produkt mit großer Gegenkante überschreitet irrtümlich Produkttoleranz. Vorzeichen jetzt einzeln mit räumlicher Kreuzprodukttoleranz prüfen, keine Konturänderung. [Identische Eingaben](iteration-2.txt): 3/3 grün. Nachbar-/Duplikatregression zusätzlich, alte Fixturebytes unverändert.
3. Opt-in-CLI, generische native Darstellung und eigener Prototyp-Export sowie Zoo-Requestimport angebunden. [Tests](iteration-3.txt): bestehende native 6/6, Adapter/Zoo 3/3, neue 3/3 grün. Danach neue ECS-Regressionsprüfung derselben echten Keyboard-/Action-Systeme für E/B/Enter/R und alle regenerierenden UI-Aktionen grün; keine Jobs/Seedänderungen/alte Analysen im Prototyp. Vier City-/Zoo-Design- **und Mesh**-Vergleiche exakt; fünf alte Exportvarianten exakt. Capture-Skript zunächst wegen macOS-Bash-3-`set -u` auf leeren Arrays abgebrochen; nur Skript korrigiert, keine Inputs/Assertions geändert. Anschließend native Captures Exit 0.
4. Feste Frontdetails tatsächlich angesehen: Dächer erkennbar, Tor durch Bestand verdeckt; zusätzliche Gegenansicht vor Implementierung im Evaluator festgelegt, alte Ansichten behalten. Importierte Zoo-Kamera auf tatsächlichen Designumfang statt große Bauplatzmitte gerichtet; synthetische Kameras unverändert. Konservative Wasser-/Baum-/Fluss-/Turmreservierungen vervollständigt. [Vollständige fokussierte Messung](iteration-4.txt): Kern 9/9, Adapter 1/1, native Tests 7/7, Cityadapter 4/4, Zoo 2/2, beide Compilechecks und Formatcheck grün. [Capture-Skript](capture.sh), [Lauf](captures.txt): acht native Ansichten Exit 0, kein City-Pipelined-Rendering-Workaround erforderlich. Alle unveränderten alten/neuen Eingaben weiter grün, keine Typgeometrie im Renderer.

Iteration 1 war nicht beste Version; ab Iteration 2 kein grünes festes Kriterium verloren. Alte Kernregressionen wurden nach Anbindung und in der abschließenden fokussierten Gesamtmessung erneut ausgeführt; kein behaupteter Workspace-Gesamtlauf.

## Maschinen- und Runtime-Nachweise

[verify.py](verify.py) prüft die tatsächlichen nativen Programme, keine Ersatzimplementierung des Generators:

- Seeds 7 und 91, beide ausgewählten Plätze: [City 7](city-7.json), [City 91](city-91.json); echte exportierte Requests und Zooergebnisse daneben.
- Vier exakte Vergleiche sämtlicher Design- und Meshdaten, siehe [machine-checks.txt](machine-checks.txt).
- Original-, Markt-, Snapshot-, V1-, V2-Export vollständig gegen vorab erzeugte Baseline, nicht nur Gebäudeanzahl. Marktprofil und Optionen unverändert.
- CLI lehnt Wirtschaft, Marktprofil, Gebäudeplanung, V1-Profil und Originalsnapshot mit Opt-in ab; nicht unterstützte Modi erzeugen keine still veralteten Analysen.
- Native ECS-Prüfung injiziert E/B/Enter/R in dieselben `keyboard`/`apply_actions`-Systeme. Zusätzlich Seed-/Größen-/Feature-/Tor-/Marktsteuerung gesperrt. Kamera/PNG/JSON bleiben möglich. Dies ist kein manueller Bedienertest.
- Harte Höhen-/Vorstoß-/Zugangsgrenzen schlagen Wünsche: 7 m → protokollierter Haus-Fallback statt Stadthaus, 1 m → Original behalten; gesamte Bodenfläche reserviert → kein Kandidat; 0 m Vorstoß → Stadthaus abgelehnt. Geschützte, konkave/degenerierte, überschneidende Konturen und doppelte Kandidaten nicht repariert.
- Frontorientierung und ×4-Umrechnung an tatsächlichen Eingabepunkten geprüft. Keine Scherung oder Rechteckreparatur.

Reproduktion:

```sh
export CARGO_TARGET_DIR=/Users/tim-jonaswechler/workspace/repositories/timjonaswechler/game/experimental/cities_generator/target
cargo test -p building_core --test generation_contract --test profile_limits --test townhouse_contract --test legacy_replay --test townhouse_profile_limits
cargo test -p city_bevy --lib --bin city_bevy --test city_building_types --example building_zoo
cargo check -p city_bevy
cargo check -p city_bevy --example building_zoo
bash docs/proofs/building-types-step3/capture.sh
cargo run -p city_bevy -- --seed 42 --size 25 --building-types assets/building-types/purplechurch.json
cargo run -p city_bevy -- --seed 42 --size 25 --building-types assets/building-types/purplechurch.json --type-seed 91 --detail-lot 3:0
cargo run -p city_bevy --example building_zoo -- --request docs/proofs/building-types-step3/request-7-1.json
```

## Subjektive Bildbefunde, keine Gestaltungsfreigabe

Tatsächlich betrachtete native Aufnahmen: Original-/Prototyp-Übersicht, Original-/Prototyp-Frontdetail `3:0`, Seed-91-Frontdetail, Original-/Prototyp-Gegendetail `3:2`, importierter Zoo-Entwurf. Je Vergleich identische Kamera, gleiche Stadt, gleiche Optionen. Nach finalem Capture nochmals ansehen, falls Code/Artefakte geändert werden.

- Die Übersicht bewahrt den Originalbestand; nur zwei kleine blaue Dächer markieren neue Formen im unteren mittleren Stadtbereich. Keine flächige Umstellung.
- Das Frontdetail zeigt beide geneigten Haupt-/Nebendächer klar gegenüber den großen flachen alten Gebäuden. Die neuen Profile füllen nur einen kleinen Teil der großen ursprünglichen Bauflächen: bewusst keine Anpassung durch Vergrößern/Stauchen.
- Seedvariation ist klein, aber sichtbar. Die Gegenseite bestätigt die zwei ersetzten Plätze und den übrigen Bestand, legt den Torraum jedoch **nicht** frei: Nachbarhöhen und UI/Ansicht verdecken Teile. Die native Übersicht allein ist daher kein Torfreiraum-Beweis. Dafür die alten Kern-/Mesh-Verträge und der identische isolierte Request; keine vorgetäuschte Bildfreigabe.
- Die technische Integration funktioniert, visuelle Einfügung bleibt schwach: große freie Restflächen und viel niedrigere neue Gebäude neben dem alten abstrahierten Bestand. Kein Architekturqualitäts-, Geschoss-/Nutzungs- oder Einwohnernachweis.

## Modellbilanz und Grenzen

Schritt 2 widerlegte „jedes Part hat ein Dach“ und „ein Haus-/Anbauprofil passt für alle Typen“; nötige Korrekturen waren `Option<Roof>`, typspezifische Profile, `ArchOpening` und gemeinsame Fit-/Mesh-Zellen. Schritt 3 erforderte **keine weitere Kernmodellkorrektur**, nur explizite Stadt-Einheiten-/Bauplatzauflösung, Auswahl und ehrliches separates Export-/Modusverhalten. `building_core` ist in diesem Schritt unverändert, ohne City-/Bevy-/DOM-Abhängigkeit.

Weitere Varianten vorhandener Regeln brauchen nur Profile; weitere Erzeugungsregeln innerhalb vorhandener Körper-/Dach-/Öffnungsfähigkeiten ein privates Typ-Modul plus Registry/Profil/Korpus; neue räumliche Fähigkeiten brauchen gemeinsame Modell-/Fit-/Mesh-Erweiterung. Der Selector arbeitet nur über Profiltypen und Gewichte; Renderer ohne Typgeometrie. Damit ist ein weiterer Bautyp lokal ergänzbar, nicht jede denkbare Architektur automatisch unterstützt.

Größte verbleibende Modelllücke: belastbare Grundstücke und begehbare Zugänge, nicht mehr die gemeinsame Generatoranbindung. Originalumrisse sind keine Eigentumsgrenzen; nächste Straßenkante ist kein vermessener Zugang. Versuchsbedingungen sind Konfiguration, keine Normen. Keine Innenräume/Statik/Dachverschnitte/Suche, keine Wirtschaft, Haushalte oder Mehrhausbrücken. Reservierungen sind konservativ, etwa quadratische Turmflächen; sie können geeignete Alternativen ablehnen. Nur eine fest nachgewiesene Stadt/kleine Auswahl, keine flächige Distriktintegration.

## Unabhängiger Gesamt-Review / Ledger

Harness verifiziert: `pi / openai-codex/gpt-6.1-sol`, `thinking=high`, verfügbar; entspricht dem geerbten OpenAI-Modell. Genau ein Reviewer gleichzeitig, read-only, keine Kinder. Gesamtumfang seit `6ea9dd29c9653035aa077e246ed13769a38b6bc2`, nicht nur die letzte Adapterdatei. Usage nur falls exponiert.

Eine Runde, [VERDICT: APPROVE](review-1.txt), keine Blocker/Shoulds/Nits. Reviewer hat zusätzlich die vier exakten City-/Zoo-Design- und Vollmeshvergleiche, gefrorene Hashes, OriginalCity und `3:1` unabhängig verifiziert. Keine Änderungen durch Review erforderlich. Ledger: keine Findings, keine Ablehnungen, keine offenen Punkte. Usage nicht exponiert. Seit Freigabe nur Proof-/Übergabedokumentation, kein Behavior-Diff geändert. Gesamtquell-Diff beim Review und danach unverändert: 26 Dateien, +4968/−13 (ohne Proofartefakte/Cargo-Dateien, feste Auswahl `crates assets docs/building-types-prototype.md`). Schritt-3-Diff vor Review 51 Dateien, +1860/−22 einschließlich kompakter vollständiger JSON-Evidenz; nachher nur zusätzliche Abschlussbelege.

## Handoff-Gate

**Technisch erfolgreich; Übergabe an den Orchestrator darf starten.** Vier Implementierungs-/Messiterationen, eine unabhängige Reviewrunde, Abschluss innerhalb des 60-Minuten-Budgets. Keine offenen technischen Blocker. Diese Aussage ist keine gestalterische Nutzerabnahme; die Bild-/Zugangsmodelllücken oben bleiben ausdrücklich bestehen.

Baseline → final: neuer Adapter von 0/3 auf 4/4 Tests, beide echte Typen auf zwei unvergrößerten realen Bauflächen, vier exakte Zoo-/City-Replays. Alle neun Core-Regressionstests und 14 fokussierten Bevy-Tests grün, beide Compilechecks, Formatcheck, acht native Captures und fünf alte Exportvarianten grün. Finale Quellen/geschützte Pfade in [source-versions.json](source-versions.json), letzte Checks in [final-checks.txt](final-checks.txt). Die fünf Front-/Übersichtscaptures nach Review nochmals frisch betrachtet, die drei anderen finalen Bilder zuvor unmittelbar nach der letzten Aufnahme.

Geänderte Implementierungspfade ausschließlich `crates/city_bevy/{src/city_buildings.rs,src/lib.rs,src/main.rs,src/mesh.rs,examples/building_zoo.rs}`, neue Tests/Fixture `crates/city_bevy/tests/`, Konfiguration `assets/building-types/purplechurch.json`, Anleitung `docs/building-types-prototype.md`; neue Belege nur `docs/proofs/building-types-step3/`. Kern `building_core` und gesamtes `city_core` in diesem Schritt bytegleich zur Schrittbaseline. Ein atomarer lokaler `feat`-Commit einschließlich Belegen; sein vollständiger Hash/HEAD steht im finalen Übergabebericht (keine selbstreferentielle Commit-ID im eigenen Dokument). Kein Push/Merge durch diesen Agenten.

Keine CI/Runner/Workspace-Gesamtsuite, keine Pushes, keine PR-/Merge- oder Fremdbranch-Änderungen. Geschützte alte Quellen und HTML-Referenzen bleiben unverändert; Kamera-Reset der alten Studie kurz gelesen: verändert nur `camera`, ruft `draw/saveState`, nicht `stage/closePassage`.
