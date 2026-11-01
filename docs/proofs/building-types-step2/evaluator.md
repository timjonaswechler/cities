# Schritt 2: vorab eingefrorener Evaluator

Baseline: `65e606a06a730f0b5a837fb2c383f53fd3298290`.
Synthetische Metermaße; keine Bildmessungen. Der neue Korpus
`crates/building_core/tests/fixtures/townhouse-v1.json` und
`townhouse_contract.rs` werden vor Generatorimplementierung eingefroren.
Die 15 alten JSON-Fälle bleiben bytegleich. Profilzugriffe werden nur wegen
typspezifischer Profilvarianten mechanisch migriert; Dachzugriffe später zu
`as_ref().unwrap()`, niemals Assertions abschwächen.

## Feste Kriterien

13 Fälle: geeigneter Platz, Seed 91, kompaktes Profil, 90° gedrehte Vorderkante,
lokal unregelmäßige Seiten, enge obere Zone (Ablehnung), verbotenes Überstehen
(Ablehnung), bündige Alternative (Erfolg), erforderlicher Zugang (Erfolg),
vollflächig gesperrter Zugang (Ablehnung), niedriger Höhenraum (Ablehnung),
zu enge Bodenfläche bei unveränderter oberer Zone (Ablehnung), oberes Geschoss
außerhalb der Bodenfreigabe, aber innerhalb der unabhängigen oberen Zone (Erfolg).
Jeder Fall muss bei gleichen Eingaben/Seeds identisch wiederholbar sein.
Separate Tests prüfen Parameter, freie Höhe und starre Transformation.

Durchgang: unabhängiges Dreieck-/Prismen-Clipping auf tatsächlich abgeleiteten
Meshes; mindestens mittlere halbe Torbreite bei 2 m freier Höhe durch beide
Fassaden. Eine eingesetzte echte Wand muss dieselbe Prüfung scheitern lassen.
4,7 m hohe Probe muss den Torbau treffen. Reservierter Zugang separat geprüft.

## Befehle und feste Captures

`cargo test -p building_core --test townhouse_contract`, zusätzlich sämtliche
vier Kern- und drei Adapter-/Zoo-Tests aus Schritt 1 und Zoo-Compile.
Native Captures im identischen Zoo: townhouse-with-gate; town_rectangle /
town_standard / 7 schräg, rear und top; Seed 91 schräg; town_compact / 7
schräg; town_irregular / town_standard / 7 schräg; town_access /
town_access_profile / 7 rear; town_no_overhang / town_flush / 7 rear.
Unveränderte Kameravorgaben des Zoos; CLI wird vor Aufnahme wiederhergestellt.
Haus-mit-Anbau: irregular / standard / 7 schräg als Renderregression.
Capture-Fehlerpfad aus Schritt 1 erneut ausführen, ohne alte Proofdateien zu überschreiben.

Subjektive Rubrik Bild 11 (keine Nutzerabnahme): lesbare untere/obere
Geschosse und Dachhierarchie; begrenzter plausibler Überstand; echter sichtbarer
Durchgang; verständliche Seed-/Profil-/Bauplatzvarianten.
Sockel, Treppe, Erker, Fenster/Fachwerk sind nicht feste Zielkriterien dieses Schritts.
