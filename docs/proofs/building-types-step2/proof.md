# Schritt 2: technische Evidenz und Übergabe

Baseline: `65e606a06a730f0b5a837fb2c383f53fd3298290`.
Budget konservativ ab 2026-11-01 21:15 UTC; Grenze 22:15 UTC.
Ziel/Inputs/Kamera/Rubrik: [vorab eingefrorener Evaluator](evaluator.md).
Abschluss: technische Endmessung und neun native Captures grün; finaler unabhängiger Review **APPROVE**. Sechs Iterationen, zwei sequentielle Reviews, innerhalb des konservativen 60-Minuten-Budgets.

## Baseline und feste Quellen

- Originaler HEAD vor Beginn geprüft, sauberer vorbereiteter Worktree.
- [Baseline](baseline.txt): eingefrorener Hausvertrag 3/3 (15 Fälle), Profilgrenzfall 1/1 und Zoo-Compile grün.
- Die langen initialen Buildversuche wurden zweimal durch Tool-Timeouts beendet. Ein späterer Adapter-Baselineversuch las während des Builds bereits geänderte Zoo-Quellen gegen das alte Kern-Artefakt; dessen Compilefehler ist **keine fachliche Baseline**.
- Korrektur: ausschließlich eigene Änderungen an `lib.rs`, `generation.rs`, `mesh.rs` und Zoo temporär gesichert, diese vier Dateien bytegenau auf die übergebene Baseline zurückgestellt; unveränderten Adapter/Zoo-Befehl neu ausgeführt und erst nach Abschluss eigene Änderungen wiederhergestellt. [Sauberer Baseline-Nachweis](baseline-adapter-clean.txt): Adapter 1/1, Zoo 2/2, Exit 0. Kein Checkout/Branchwechsel, keine fremden Änderungen betroffen.
- Alter Input SHA-256 unverändert: `481b1f520b5b0c2697e2640e14e11ef65c8f67ca41d726c3fc4c28ab9dab09c4`.
- Neuer Korpus/Test: [eingefrorene SHA-256](frozen-sha256.txt). 13 zusätzliche Fälle; 8 positive Fälle waren vor Implementierung rot.
- [Ausführbare rote Messung](new-baseline-red.txt): Stub `NoFit("Townhouse generator not implemented yet")`, 0/3 neue Tests, Exit 101. Kein Compilefehler als Fortschritt. Wegen geteilter Buildlock/Hostlast wurden die reinen Kernmessungen zunächst mit `CARGO_TARGET_DIR=/tmp/cities-building-core-step2` ausgeführt; anschließend mit dem gemeinsamen Cache wiederholt.

## Minimal erforderliche Migration alter Tests

Die JSON-Bytes und alle 15 Erwartungen/Assertions bleiben erhalten.
`ResolvedProfile` wird typspezifische Enum; drei Feldzugriffe verwenden jetzt
Pattern-Matching-Helfer, der Profilgrenzfall mutiert explizit die Hausvariante.
Die zwei Dachzugriffe verwenden `as_ref().unwrap()`: ein fehlendes Dach
scheitert weiterhin, statt den Check mit `if let` zu überspringen.
Rustfmt bricht einen Ausdruck um, ändert keine Bedingung.
Finaler alter Testhash nach mechanischer Migration:
`generation_contract.rs`: `7c14e3d5d692d943995346e00b484b6e1e84e9da9b10d45d9bf036f08b126b36`;
`profile_limits.rs`: `eb9d02990cb47b7fa8816441f9728e24ca73c632e5f4f39db955c825533ba076`.
Dies ist keine neue Bewertungsleistung; dieselben Inputbytes/Assertions wurden frisch ausgeführt.
Zusätzlicher `legacy_replay`-Test vergleicht fünf unveränderte Schritt-1-Exporte
(Konturen, Höhen, Firste und Notizen) exakt; nur neues `opening: null` wird
für den Formatvergleich entfernt. Die alten Quelldateien wurden nicht als
Ganzes ersetzt, sondern gezielt migriert.

## Iterationsprotokoll

1. **Hypothese:** gemeinsame dachlose Geschosse und Bogen-Zellen tragen den zweiten Typ ohne Renderer-Sonderfälle. Private Typ-Module, Profilvarianten, optionale Dächer, gemeinsame Zellen für Fit/Mesh implementiert. [Messung](iteration-1.txt): alte 4 Tests grün; neue Variation grün; 11/13 neue Fälle erfüllt. Fehlfälle: lokale Verjüngung und reservierter Torzugang.
2. **Fehlfall lokale Verjüngung:** zufällige Frontlänge kann trotz gültiger Gesamtintervalle hinten zu kurz werden. Gemeinsamen Platzierungshelfer um eine ausdrückliche Zwei-Querschnitt-Auflösung ergänzt; Haus bleibt im bisherigen Front-Sampling-Modus. [Identischer Evaluator](iteration-2.txt): 12/13 neue Fälle, keine alte Regression; nur Torzugang offen. Keine geänderten Inputs.
3. **Fehlfall Zugang:** zufälliger Seitenversatz legt den linken Pfeiler in den reservierten Weg. Neuer Typ zentriert die zusammenhängende Haupt-/Torform statt seitlichem Zufallsversatz; Seed variiert weiterhin Länge/Tiefe/Überstand. [Messung](iteration-3.txt): 12/13, Zugang jetzt durch Rundungsfehler bei exakt 8 m abgelehnt. Kein bewiesener Fortschritt dieser isolierten Messung.
4. **Hypothese:** die neue gemeinsame Querschnittsauflösung braucht numerische Toleranz im abschließenden Längenvergleich. Nur Zwei-Querschnitt-Modus erhält `EPS=1e-8`; alter Modus bleibt exakt unverändert. [Messung](iteration-4.txt): alle 13/13 neuen Fälle, neue Tests 3/3, alte Tests 4/4 und zusätzlicher Legacy-Replay 1/1 grün; Zoo-Compile sowie Adapter 1/1 / Zoo 2/2 grün. Die erste native Aufnahme wurde gespeichert, der Prozess hing anschließend beim Pipelined-Render-Abbau; daher ist Iteration 4 als vollständige Runtime-Pipeline nicht grün.

5. **Review S1 / Dachhierarchie:** Torwände waren niedriger, ein großer Tor-Dachanstieg konnte aber den Hauptfirst übersteigen. Separater Test zuerst [rot](iteration-5-red.txt), dann ein zusätzlicher Profilvergleich der beiden maximalen Firsthöhen. [Messung](iteration-5.txt): alle 9 Kerntests, 13+15 feste Fälle, Zoo-Compile, Adapter und Zoo grün. Gefrorene Fälle unverändert.
6. **Runtime-Fehlfall:** PNG gespeichert, Prozess beendet sich nicht. [Thread-Sample](capture-hang-stack.txt) zeigt Winit `internal_exit` → `World::clear_all` → `RenderAppChannels::drop` → wartenden Executor. Gleicher Capture ohne Interaktionsinjektion auch im Vordergrund [nach 80 s hängend](foreground-probe-runtime.txt); eigener Prozess anschließend terminiert. Ein weiterer Vor-Fix-Versuch endete erfolgreich ([Log](pre-fix-repeat.txt)): der Fehler ist nicht deterministisch. Hypothese: pipelined Render-Abbau, nicht Typgeometrie oder Hintergrundstart. Nur im isolierten Zoo PipelinedRenderingPlugin für interaktiv **und** Capture deaktiviert; kein `process::exit(0)` als Abkürzung und kein Eingriff in Stadt/Engine/Registry. Ein anfänglicher Compilefehler durch `.disable` vor dem PluginGroupBuilder wurde korrigiert, nicht als fachliche Messung gezählt. [Checks/Build](iteration-6.txt) anschließend grün; [identisches Capture-Skript](final-captures.txt) mit allen neun festen Ansichten Exit 0 und negativem Speicherpfad Exit 1. Alle finalen Bilder frisch betrachtet. Sechs Implementierungs-/Messiterationen insgesamt; Iteration 3 nicht als beste bewiesene Version gewertet.

## Modellkorrektur und verbleibende Grenzen

Widerlegt: jedes Part hat ein Dach; Haus-/Anbaufelder reichen für jeden Bautyp.
Ersetzt durch optionale Dächer und typspezifische Profilvarianten, keine Dummy-Dächer
oder umbenannten Anbauparameter. Gemeinsame neue räumliche Fähigkeit:
facettierte `ArchOpening`, intern als Pfeiler plus zehn Zellen mit geneigter
Unterseite. Fit und Mesh verwenden identische Zellen. Zoo und Bevy-Adapter
enthalten keine neue Typgeometrie; Stadtlogik, Original/V1/V2 und eingefrorene
HTML-/Proofdateien bleiben unberührt.

Noch keine allgemeinen Innenräume, Öffnungskombinationen, Dachverschnitte,
Statik, Treppen/Sockel/Erker/Konsolen. Zugangskollision konservativ pro Zelle;
ein deterministischer Kandidat, kein Suchoptimierer. Größter praktischer
Engpass dieser Ausführung war der lokale, stark ausgelastete Build; für
Schritt 3 bleibt die explizite Stadt-Konvertierung von Bauplatz/Profil/Einheiten.

## Tatsächliche lokale Befehle

```sh
export CARGO_TARGET_DIR=/Users/tim-jonaswechler/workspace/repositories/timjonaswechler/game/experimental/cities_generator/target
cargo test -p building_core --test generation_contract --test profile_limits --test townhouse_contract --test legacy_replay --test townhouse_profile_limits
cargo check -p city_bevy --example building_zoo
cargo test -p city_bevy --lib --example building_zoo
bash docs/proofs/building-types-step2/capture.sh
cargo run -p city_bevy --example building_zoo -- --type townhouse-with-gate --help
cargo run -p city_bevy --example building_zoo -- --type townhouse-with-gate --geometry-only --export docs/proofs/building-types-step2/default-geometry.json
# Erwartet Exit 1, beobachtet und im cli-checks.txt protokolliert:
cargo run -p city_bevy --example building_zoo -- --type townhouse-with-gate --site town_blocked --geometry-only --export docs/proofs/building-types-step2/rejected-geometry.json
```

[CLI-Nachweis](cli-checks.txt): beide Katalogtypen, typspezifische Profile/Bauplätze, gültiger Standard-Export und begründete Ablehnung mit Prozess-Exit 1. Interaktiver reproduzierbarer Start (nicht als manueller Bediennachweis ausgeführt):

```sh
cargo run -p city_bevy --example building_zoo -- --type townhouse-with-gate
cargo run -p city_bevy --example building_zoo -- --type house-with-annex --site irregular --profile standard --seed 7
```

Das Capture-Skript enthält die festen 9 Ansichten und den negativen Speicherpfad
aus Schritt 1 mit neuem Logziel. Keine CI, GitHub Actions/Runner,
Workspace-Gesamtsuite, Pushes oder PR-Änderungen.

## Subjektive Bildbefunde

Die unveränderte `docs/house-blockout-townhouse.png` einschließlich Bild-11-Vorlage sowie **alle neun finalen PNGs** wurden tatsächlich betrachtet. Subjektive Rubrik:

1. Hauptbau und niedrigerer Torflügel mit gegeneinander gerichteten Satteldächern sind klar lesbar; keine gleichrangige Boxsammlung.
2. Der Überstand bleibt klein. Am linken Giebel bzw. der vorderen Kante ist der Geschossversatz erkennbar; auf den großen untexturierten Wandflächen ist die Geschosstrennung schwächer als in der Bild-11-Vorlage. Keine Konsolen/Statikbehauptung.
3. In der Schrägansicht ist der facettierte Torraum sichtbar; Schatten im Tunnel sind kein Geometriebeweis, deshalb die unabhängige Mesh-Prismenprüfung mit echter Sperrwand. Gegenseitige Ansichten verdecken den Torraum teilweise durch den Hauptbau.
4. Seed-Unterschiede sind moderat, Kompakt verändert Breite/Höhe deutlich. Unregelmäßiger Bauplatz bewahrt die örtlichen Konturen. Bündiges Profil unterscheidet sich am Geschossversatz. Keine Nutzerabnahme, historische Rekonstruktion oder Architekturfreigabe.

Finale feste Aufnahmen (jeweils gleichnamiger JSON-Export und `-runtime.txt`):
- [Standard 7 schräg, inkl. Interaktionen](town_rectangle-town_standard-7-oblique.png)
- [Standard 7 Gegenseite](town_rectangle-town_standard-7-rear.png)
- [Standard 7 oben](town_rectangle-town_standard-7-top.png)
- [Standard 91 schräg](town_rectangle-town_standard-91-oblique.png)
- [Kompakt 7 schräg](town_rectangle-town_compact-7-oblique.png)
- [Unregelmäßig 7 schräg](town_irregular-town_standard-7-oblique.png)
- [Reservierter Torzugang](town_access-town_access_profile-7-rear.png)
- [Ohne Überstand](town_no_overhang-town_flush-7-rear.png)
- [Alter Typ: unregelmäßig 7](irregular-standard-7-oblique.png)

## Unabhängiger Review / Ledger

Capability geprüft: Elternmodell `pi / openai-codex/gpt-6.1-sol`, Option
`thinking=high`, verfügbar. Ein read-only Reviewer gleichzeitig, keine
Kinder/Fanouts/Remote-Jobs. Usage nicht exponiert.

- Runde 1: [CHANGES](review-1.txt), S1 / should, Torfirst kann Hauptfirst überragen. Akzeptiert, separat rot reproduziert und in Iteration 5 minimal behoben. Alte und neue eingefrorene Kriterien weiterhin grün.
- Runde 2: [APPROVE](review-2.txt), **S1 resolved** unabhängig bestätigt. Alle 9 Kern-Tests nochmals unabhängig grün. Zusätzlich Runtime-Abbauänderung geprüft: beide Modi gleich, generischer nativer Renderer und AppExit-Fehlerweitergabe erhalten; Capture-Erfolgs-/Fehlerlogs stützen den Workaround.
- Ledger S1 / should: **resolved**. Keine Findings abgelehnt; keine offenen Blocker/Shoulds/Nits. Finaler Behavior-Diff freigegeben. Nach Review 2 nur Proof-/Handoff-Dokumentation ergänzt.
- Review-1-Diff ohne Proof-Artefakte: 13 Dateien, +1603 / −165. Recheck: 14 Dateien, +1629 / −166; Zuwachs nur fokussierte Regression, ein Hierarchievergleich, Plugin-Deaktivierung und nötige Interface-Doku. Zwei Runden mit demselben verifizierten Modell/Option, Usage nicht exponiert.

## Handoff-Gate

Baseline → final: alter Typ unverändert 15/15; neuer Typ von 0/8 positiven Fällen auf 8/8, insgesamt 13/13 feste Fälle; Kern 9/9, Adapter/Zoo 3/3, Compile, alle neun nativen Captures und negativer Speicherpfad grün. Fünf eingefrorene alte Exportentwürfe exakt replaybar. [Geschützte alte Pfade unverändert](source-boundary.json), [Quellversionen](source-versions.json), [letzte Checks](final-checks.txt).

Keine offenen technischen Blocker. **Schritt 3 darf nach Übernahme des lokalen Commits starten.** Veröffentlichungs-/Merge-Gate bleibt beim Orchestrator; kein Push, keine PR- oder Fremdbranch-Änderung. Die weiterhin schwächere Geschossablesbarkeit in untexturierten Ansichten ist ein subjektiver Bildbefund, keine vorgetäuschte Nutzerabnahme.

Handoff-Interface: `building_core::{generate, BuildingType, REGISTRY, Site, ResolvedProfile, HouseWithAnnexProfile, TownhouseWithGateProfile, Design, Rejection}`; Mesh `derive_meshes`, `SurfaceMesh`, `Material`; unveränderter Bevy-Adapter `city_bevy::building_adapter::{surface_mesh,spawn_design}`. Stadtadapter muss sein aufgelöstes Profil explizit in die passende Enumvariante konvertieren und Bodenfreigabe/obere Projektion/Höhe/Zugänge/Überstand getrennt übertragen. Keine Stadtkoordinaten-Skalierung oder Nutzungsentscheidung im Gebäudekern verstecken.

Geänderte Quellpfade: `crates/building_core/src/{lib.rs,generation.rs,mesh.rs,solid.rs,generation/house_with_annex.rs,generation/townhouse_with_gate.rs}`; Tests `generation_contract.rs`, `profile_limits.rs` (nur mechanisch), neu `townhouse_contract.rs`, `townhouse_profile_limits.rs`, `legacy_replay.rs`, `fixtures/townhouse-v1.json`; Zoo `crates/city_bevy/examples/building_zoo.rs`; zentrale Doku `docs/building-types-prototype.md`; sämtliche neue Evidenz ausschließlich unter `docs/proofs/building-types-step2/`. Der finale Commit/HEAD wird im Übergabebericht nach Commit genannt.
