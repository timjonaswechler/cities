# Schritt 1 – lokale Proof-/Hillclimb-Spur

Basis: `6ea9dd29c9653035aa077e246ed13769a38b6bc2`. Arbeitsbeginn 2026-11-01 ca. 20:27 UTC. Budget: höchstens sechs Iterationen/60 Minuten, höchstens drei sequentielle Review-Runden. Keine CI, kein Push, keine PR-Änderung.

## Eingefrorene Messung

Siehe [Evaluator](evaluator.md). Vor der Implementierung wurde ein Syntaxfehler im noch nicht eingefrorenen Testharness korrigiert. Danach wurde die ausführbare rote Baseline gegen `NotImplemented` gemessen: [baseline.txt](baseline.txt), Exit 101, 0/3 Tests; alle 15 Korpusfälle melden den noch nicht implementierten Generator. Kein Compilefehler wird als fachliche Baseline ausgegeben.

Unveränderte SHA-256 seit diesem Freeze:

- `crates/building_core/tests/generation_contract.rs`: `0c8e4639d1e200f3a9ed3c2838e8bb957aea139598cd4d3e2fa9adfc80d2fddc`
- `crates/building_core/tests/fixtures/generation-v1.json`: `481b1f520b5b0c2697e2640e14e11ef65c8f67ca41d726c3fc4c28ab9dab09c4`

Korpusfälle `synthetic-01..15` bleiben in dieser Reihenfolge:
Rechteck/Standard/7; unregelmäßig/Standard/7; starr transformiert/Standard/7; Rechteck/Standard/91; Rechteck/Kompakt/7; erlaubter optionaler Anbau; Profil verbietet Anbau; Bauplatz verbietet optionalen Anbau; Zugang verhindert optionalen Anbau; Bauplatz verhindert erforderlichen Anbau; Zugang verhindert erforderlichen Anbau; zu schmal; zu niedrig; ungültiges Viereck; zu enge obere Projektion. Zusätzliche Checks im eingefrorenen Test prüfen nichtendliche/degenerierte Daten und Variation.

## Iterationen

1. **Fehlfall:** alle fachlichen Vertragsfälle sind rot. **Hypothese:** ein aus unabhängigen lokalen Seitengrenzen konstruierter Hauptbau plus wandgebundener niedriger Querflügel mit gleichzeitig konstruierten Satteldächern genügt dem ersten Typ. **Änderung:** reine Generator-/Geometrie-/Mesh-Implementierung. **Messung:** identischer eingefrorener Befehl, [iteration-1.txt](iteration-1.txt): Exit 0, 3/3 Tests, alle 15 Fälle erfüllt. Neue Zoo-/Adaptertests: [adapter-zoo-tests.txt](adapter-zoo-tests.txt), 1+2 Tests grün; [zoo-check.txt](zoo-check.txt) erfolgreich. Erste reale Metal-Aufnahme und Sichtung, anschließend weitere feste Ansichten. Kein früher grünes Kriterium verloren.
2. **Noch unbewiesener Fall:** Runtime-Bedienpfad für Seed-/Profil-/Bauplatzwechsel. **Hypothese:** deterministische Eingabeinjektion durch die echten Controls mit Abgleich gegen den Kern beweist Regeneration und Kamerarücksetzung besser als reine Helfertests. **Änderung:** nur Zoo-Smokeharness/ASCII-Status. **Messung:** [iteration-2.txt](iteration-2.txt), derselbe Vertrag weiterhin 3/3, Adapter 1/1, Zoo 2/2, Compile erfolgreich. Runtime prüft tatsächlichen Kameratransform, Orbit/Zoom/Home und N/P/B inklusive einer Ablehnung; exakte Eingaben vor Capture wiederhergestellt.
3. **Neu entdeckter Fehlfall, ohne Umdefinition des Korpus:** stark auffächernde Seitengrenzen konnten den hinteren Hauptbauquerschnitt über das aufgelöste Längenintervall dehnen. **Hypothese:** auch die obere Intervallgrenze am hinteren Querschnitt prüfen und unpassende Konturen ablehnen. Separater Regressionstest zuerst rot: [iteration-3-red.txt](iteration-3-red.txt), Exit 101. **Änderung:** fokussierter zusätzlicher Längengrenzvergleich; keine Koordinaten-/Profilanpassung. **Messung:** [iteration-3.txt](iteration-3.txt), eingefrorener Vertrag 3/3 plus neue Regression 1/1, Adapter 1/1, Zoo 2/2, Compile erfolgreich. Alle sieben festen Bilder mit finaler Geometrie neu gerendert und erneut betrachtet.

4. **Review-Fehlfall S1:** Capture-Speicherfehler und Timeouts wurden als Bevy-Fehler gemeldet, aber der Zoo verwarf `AppExit` und lieferte Shell-Exit 0. **Hypothese:** Rückgabe von `App::run()` bis zum vorhandenen Fehlerexit in `main()` weiterreichen. Neuer Shell-Regressionstest zuerst rot: `check-capture-failure.sh .../capture-failure-before.txt` meldete „incorrectly returned exit 0“, Regression-Exit 1. **Änderung:** nur `AppExit` auswerten, keine Geometrieänderung. **Messung:** [iteration-4.txt](iteration-4.txt), identischer Vertrag und sämtliche grünen Regressionen/Compile-/Runtime-Captures erneut bestanden; der absichtlich ungültige PNG-Zielpfad liefert jetzt Prozess-Exit 1, alle sieben regulären Captures weiterhin Exit 0. Finale Bilder erneut betrachtet.

Finale technische Baseline-Gegenprobe: 15/15 feste Fälle und 3/3 eingefrorene Tests statt 0/15 bzw. 0/3; zusätzlicher Profilgrenzfall und Capture-Fehlerpfad grün. Dies ist kein Architekturqualitätsscore. Der unabhängige fokussierte Recheck hat S1 als gelöst bestätigt und den finalen Behavior-Diff freigegeben.

## Tatsächliche Befehle und Runtime

Alle lokalen Cargo-Befehle verwendeten den vorhandenen `CARGO_TARGET_DIR`, siehe [zentrale Doku](../../building-types-prototype.md). Keine gesamte Workspace-Testsuite.

```sh
cargo test -p building_core --test generation_contract
cargo test -p building_core --test profile_limits
cargo check -p city_bevy --example building_zoo
cargo test -p city_bevy --lib --example building_zoo
bash docs/proofs/building-types-step1/check-capture-failure.sh
bash docs/proofs/building-types-step1/capture.sh
```

Der letzte Befehl erzeugte sieben PNGs + Eingabe-/Entwurfs-JSON + Runtime-Logs, alle Exit 0. Die Skriptdatei enthält die vollständigen tatsächlichen CLI-Argumente. Bevy meldete Apple M1 Pro / Metal. Der Winit-Hinweis beim Schließen des unsichtbaren Fensters beeinträchtigte Capture/Exit nicht.

- [Rechteck, Standard, Seed 7](rectangle-standard-7.png) · [Eingabe/Entwurf](rectangle-standard-7.json) · [Runtime inkl. Interaktionen](rectangle-standard-7-runtime.txt)
- [Unregelmäßig, Standard, Seed 7](irregular-standard-7.png) · [Eingabe/Entwurf](irregular-standard-7.json)
- [Rechteck, Kompakt, Seed 91](rectangle-compact-91.png) · [Eingabe/Entwurf](rectangle-compact-91.json)
- [Reservierter Zugang, optionaler Anbau entfällt](rear_access-access-7.png) · [Eingabe/Entwurf](rear_access-access-7.json)
- [Unregelmäßig von oben](irregular-standard-7-top.png)
- [Rechteck von der Gegenseite](rectangle-standard-7-rear.png)
- [Rechteck, Standard, Seed 91](rectangle-standard-91.png)

## Subjektive Bildbefunde (Implementierungsmodell)

Die eingebettete vollständige Bild-1-Vorlage wurde aus der unveränderten HTML-Datei zur Sichtung dekodiert; außerdem wurde `docs/house-blockout-village.png` betrachtet. Keine Bildkoordinaten wurden als Generator übernommen.

Alle finalen sieben Renderbilder wurden tatsächlich betrachtet. Nach der vorab festgelegten Rubrik:
1. Der längliche Hauptbau dominiert bei Standard und Kompakt klar.
2. Der Anbau ist niedriger und sitzt an einem nachvollziehbaren hinteren Wandabschnitt.
3. Beide Satteldächer sind lesbar; der Nebenfirst endet unter der Haupttraufe an der Wand. Es gibt keinen behaupteten komplexen Dachverschnitt.
4. Ein Hauptbau plus ein Querflügel, keine Boxansammlung.
5. Die unregelmäßige Draufsicht zeigt lokale Verjüngung statt gemeinsamer Scherung; der Geometrievertrag prüft die nichtparallelen Seiten zusätzlich.
6. Profil und Seed verändern Flächen/Proportionen und Anbaumaße, nicht nur Translation/Spiegelung. Die Unterschiede zwischen Seeds sind bewusst moderat. Der gesperrte Zugang bleibt frei; der optionale Anbau verschwindet mit Begründung.

Diese Befunde sind subjektiv und **keine gestalterische Nutzerabnahme**, historische Rekonstruktion oder Statikfreigabe. Die Gegenseitenansicht verdeckt den Anbau zum Teil, wie geometrisch zu erwarten. Keine Fenster/Fachwerk/Materialtexturen.

## Source-Diff-Grenze und Lücken

Bestehende `crates/city_core/**`, `crates/city_bevy/src/main.rs`, `crates/city_bevy/src/mesh.rs` und sämtliche alten Docs/HTML/Proof-Dateien bleiben unverändert. Nur neue Kern-/Adapter-/Zoo-Dateien, notwendige Cargo-Einträge und neue Doku-/Proof-Dateien gehören zum Diff. Dies ersetzt keine teure Neuprüfung aller alten Fixtures; alte Pfade wurden bewusst nicht ausgeführt. [Bytevergleich aller 184 geschützten bestehenden Dateien](source-boundary.json) meldet keine Abweichung. Der [normale Dependency-Baum](core-dependencies.txt) bestätigt, dass der Kern nur Serde, nicht Bevy oder city_core verwendet.

Schnittstelle/Registry: `building_core::{generate, BuildingType, REGISTRY, Site, ResolvedProfile, Design, Rejection}`.
Mesh: `building_core::{derive_meshes, SurfaceMesh, Material}`.
Adapter: `city_bevy::building_adapter::{surface_mesh, spawn_design}`.
Zoo: `crates/city_bevy/examples/building_zoo.rs`.
Für Schritt 2: Details und Modellgrenzen in der zentralen Doku. Größter Engpass sind echte Öffnungen und obere Körper im bislang vierseitigen Satteldachformat, nicht das Rendering.

## Unabhängiger sol-loop-Review

Verifiziert in Capability- und Delegate-Antwort: Provider `pi`, OpenAI-Modell `openai-codex/gpt-6.1-sol`, Option `thinking=high` (Elternmodell). Ein read-only Reviewer gleichzeitig, keine Kinder und keine Remote-Jobs. Usage wurde nicht exponiert.

- Runde 1: [VERDICT: CHANGES](review-1.txt). S1 / should: verworfener AppExit lässt Capture-Fehler erfolgreich erscheinen. Unabhängig mit echtem Render-/Speicherfehler reproduziert; vom Implementierungsagenten akzeptiert und in Iteration 4 minimal behoben.
- Runde 2: [VERDICT: APPROVE](review-2.txt). S1 unabhängig als **resolved** bestätigt: negatives PNG-Ziel Exit 1, positives Capture/Export mit Interaktionen Exit 0. Keine neuen Findings. Timeout verwendet denselben korrigierten Rückgabepfad, wurde aber nicht eigens ausgelöst.
- Ledger S1: **resolved**. Keine Findings abgelehnt, keine offenen Blocker/Shoulds/Nits. Zwei Runden insgesamt, kein Fanout; finaler Behavior-Diff abgedeckt.
- Verhaltensänderung seit Review 1: nur `let exit = App::new()...run(); if exit.is_error() { return Err(...) }` plus Shell-Regression und Proof-Aktualisierung.
- Diff vor Review 1: 48 Dateien, 3697 Einfügungen / 1 Löschung einschließlich synthetischer Fixture und Bild-/Proof-Artefakte. Vor Recheck: 53 Dateien, 3810 Einfügungen / 1 Löschung; Zuwachs überwiegend negative Runtime-Evidenz und Regression, Behavior-Fix nur vier Codezeilen. Nach Recheck nur Ergebnis-/Proof-Dokumentation ergänzt.

## Abschluss / Übergabe

Vier Implementierungs-/Messiterationen, zwei sequentielle Reviews, innerhalb des 60-Minuten-Budgets. [Letzte lokale Checks](final-checks.txt) dokumentieren den Stand vor Commit. Keine offenen Blocker für Schritt 1; **Schritt 2 darf nach Übernahme des lokalen Commits starten**. Es gab keinen Push und keine Änderung an PRs/anderen Branches. Die nach wie vor fehlenden Öffnungen/oberen Körper sind der explizite Ausbauauftrag des nächsten Schritts, keine bereits vorhandene Fähigkeit. Bildbefunde bleiben subjektiv und ohne Nutzerabnahme.
