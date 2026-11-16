# Hausvarianten am Bauplatz

Erster Meilenstein: Einen rechteckigen Bauplatz neben einem geraden Weg markieren und drei sichtbar unterschiedliche, passende Satteldachhäuser durchschalten. Sind weniger Vorschläge möglich, Anzahl und Gründe offen anzeigen; nichts passend schneiden oder in Sperrflächen quetschen.

Neuer Ansatz auf Basis des [Wegeditors](README.md), keine Wiederaufnahme der verworfenen Hausgalerie. Umsetzung, lokale Prüfungen und unabhängiges Review abgeschlossen. Gemeinsame gestalterische Freigabe noch offen. [Nachweise](evidence/house-variants.md).

## Checkliste und Subthreads

- [x] **1 · Gemeinsames Interface festlegen — Hauptthread, zuerst.**
      Eingabe: Baufläche, Zugang zum Weg, getrennte Weg-/Wassersperrflächen, Hausvorgaben und Seed. Ausgabe: reproduzierbare Hausbeschreibungen mit Platzierung oder begründete Ablehnung. Meter und Koordinatenkonvention festhalten; Versuchswerte für Maße, Abstände, Dachüberstand und Zugang sowie Suchbudget und feste Prüffälle vor der Umsetzung festlegen.

- [x] **2A · Hausgenerator — Subthread A, parallel zu 2B.**
      Reines TypeScript-Modul ohne DOM/Three.js oder Wissen über den Weggraphen. Eine Hausfamilie, Variation von Breite, Tiefe, Geschosszahl und Dachrichtung. Gesamte Dachhülle innerhalb der Baufläche, keine Sperrflächenüberschneidung, freier Zugang. Eigene Tests für Reproduzierbarkeit, unterschiedliche Vorschläge und Ablehnungen. Eigene neue Generator- und Testdateien.

- [x] **2B · Bauplatz und Vorschau — Subthread B, parallel zu 2A.**
      Isolierte Module für rechteckige Bauplatzauswahl, Auswahl des Wegzugangs und Three.js-Hausdarstellung aus dem gemeinsamen Interface. Umschalten und Ablehnungsanzeige vorbereiten; vorläufige Beispieldaten ausdrücklich als solche kennzeichnen. Eigene neue Bedienungs-, Darstellungs- und Testdateien; noch keine Änderungen an den gemeinsamen Editor-Dateien.

- [x] **3 · Im Editor verbinden — Hauptthread, nach 2A und 2B.**
      Bestehende Wege-/Wassergeometrie über einen Adapter anbinden; freie Restfläche nicht automatisch als Bauplatz behandeln. Gemeinsame Editor-Dateien erst hier ändern. Vorschläge am selben Ort durchschalten, einen übernehmen und wieder entfernen. Bauplatz, Hausvorgaben und Auswahl in Undo/Redo und JSON sichern; alte Projekte weiter laden. Wegänderungen müssen betroffene Häuser erneut prüfen und Konflikte sichtbar machen.

- [x] **4 · Technisch prüfen — Hauptthread, nach Integration.**
      Feste Fälle: ausreichend großer Bauplatz, zu kleiner Bauplatz, Wasserhindernis, nur Dachüberstand kollidiert, blockierter Zugang, nachträgliche Wegänderung. Browserablauf einschließlich Variantenwechsel, Übernahme, Undo/Redo und JSON-Roundtrip prüfen. `npm run check` in `road-editor/`; bestehende Weg-/Wassertests unverändert bestehen lassen.

- [x] **5 · Unabhängig prüfen und sichten — Prüf-Subthread und Hauptthread.**
      Drei Review-Runden; alle drei Befunde behoben und bestätigt. Der Hauptthread hat Proportionen, Dachwirkung, Variantenunterschiede und Wegeinbindung in Browseraufnahmen angesehen. Bestandene Tests und Review allein sind keine gestalterische Freigabe.

- [ ] **Gemeinsame gestalterische Freigabe — Nutzer.**
      Hausproportionen und Platzierung gemeinsam beurteilen, bevor weitere Hausfamilien oder Details folgen.

**Reihenfolge:** 1 → (2A ∥ 2B) → 3 → 4 → 5. Jeder Subthread erhält das festgelegte Interface, seine Dateien und Prüfkriterien; keine eigenen weiteren Subthreads.

**Später:** Anbauten, Seitenflügel, weitere Hausfamilien und Fassadendetails. Keine automatische Parzellierung, Innenräume oder Rust-Anbindung in diesem Meilenstein.
