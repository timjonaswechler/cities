# Eingefrorener Evaluator – Schritt 1

Stand vor Generatorimplementierung, Basis `6ea9dd29c9653035aa077e246ed13769a38b6bc2`.
Synthetische Prototypdaten in Metern, keine vermessenen oder aus Bildern abgeleiteten Normen.

- Korpus: `crates/building_core/tests/fixtures/generation-v1.json`, Version 1, 15 benannte Fälle.
- Vertrag: `crates/building_core/tests/generation_contract.rs`.
- Befehl: `cargo test -p building_core --test generation_contract`.
- Positiv: Rechteck, lokales unregelmäßiges Viereck, starre Drehung/Translation, Seeds 7/91, Standard-/Kompaktprofil.
- Optionalität: zulässiger, verbotener und durch reservierten Zugang verhinderter Anbau; erforderlicher unpassender Anbau wird abgelehnt.
- Negativ: schmaler Bauplatz, zu geringe Dachhöhe, ungültiges Viereck, zu enger oberer Raum; zusätzlich nichtendliche Geometrie/Profile, degenerierte Kanten und umgekehrte Parameterintervalle.
- Prüfungen: deterministisch auch nach anderen Aufrufen, positive konvexe Geometrie, endliche Meshes mit Einheitsnormalen und positiven Dreiecken, Boden/obere Projektion/Höhe, reservierter Zugang, echter Wandkontakt, Größen-/Höhenhierarchie, Parameter-/Seed-/Konturvariation, starre Äquivarianz.

## Feste visuelle Messung

Nativer Zoo, 1200 × 900 Pixel, perspektivische Kamera auf Grundstücksmitte + 2 m Höhe, Entfernung 29 m, yaw 0.65 rad, pitch 0.62 rad. Weitere festgelegte Ansichten: rückseitig yaw 3.8/pitch 0.62; Draufsicht pitch 1.50/yaw 0.65. Alle Varianten behalten diese relativen Ansichten. Fälle: Rechteck/Standard/7, Unregelmäßig/Standard/7, Rechteck/Kompakt/91, Zugang/Optional/7. Beim gedrehten Bauplatz dreht die relative Kamera mit.

Subjektive Rubrik gegenüber Bild 1 in `docs/house-blockout-village.png`:
1. Ein klar größerer Hauptbau.
2. Ein niedrigerer, sinnvoll wandgebundener Anbau, sofern räumlich erlaubt.
3. Geneigte Haupt-/Nebendächer mit verständlichem Anschluss.
4. Keine zufällige Boxansammlung.
5. Keine globale Scherung.
6. Verschiedene geeignete Inputs ergeben nachvollziehbar verschiedene Häuser.

Keine Nutzerabnahme, historische oder statische Freigabe. Bilder ergänzen den geometrischen Vertrag und die separat geprüften Kamerainteraktionen. Noch nicht ausgeführte Runtime-/Bildchecks gelten nicht als bestanden.
