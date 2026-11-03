# Eingefrorene Abnahme: Hauslabor V1

Referenz ist ausschließlich die Nutzeranforderung **„Mittelalter-Fantasy-Haus-Blockout mit lesbarer lokaler Umgebung“**. Es gibt keine historische oder bildliche Stilreferenz. Diese Abnahme gilt für die eigenständige TypeScript-/Three.js-Galerie, nicht für Stadtplanung, Fassadendetails oder eine Rust-Anbindung.

## Endlicher Katalog

`src/scenarios.ts` definiert ein kartesisches Produkt pro Gruppe. `tests/fixtures.ts` friert die Fallzahlen, Prüf-Seeds und den visuellen Korpus ein. Jede Kombination erhält eine stabile ID:

```text
gruppe~form~breiten~spiegelung~wasserabsenkung~größe~zugang~nachbarschaft
```

In IDs ersetzt `+` den Trenner `/` zwischen Trassen- und Wasserbreite. Maße sind Meter; X/Z horizontal, Y vertikal; Hausboden Y=0.

| Gruppe | Formen | Breitenprofile | Spiegelungen | Wasserhöhen | Größen | Zugänge | Nachbarn | Fälle |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| Straßen | 13 | 4 | 2 | 1 | 1 | 1 | 3 | 312 |
| Wege | 13 | 4 | 2 | 1 | 1 | 1 | 3 | 312 |
| Kreuzungen | 10 | 4 | 4 | 1 | 1 | 1 | 3 | 480 |
| Sackgassen/Höfe | 6 | 6 | 2 | 1 | 1 | 1 | 3 | 216 |
| Freiflächen | 6 | 1 | 2 | 1 | 3 | 3 | 3 | 324 |
| Fließwasser | 10 | 4 | 2 | 3 | 1 | 1 | 3 | 720 |
| Ufer/Inseln | 8 | 1 | 2 | 3 | 3 | 1 | 3 | 432 |
| Straße × Wasser | 8 | 16 | 2 | 3 | 1 | 1 | 3 | 2.304 |
| Weg × Wasser | 8 | 16 | 2 | 3 | 1 | 1 | 3 | 2.304 |
| Straße × Weg × Wasser | 6 | 16 | 2 | 3 | 1 | 1 | 3 | 1.728 |
| Bewusste Grenzfälle | 4 | 1 | 1 | 1 | 1 | 1 | 1 | 4 |
| **Gesamt** | | | | | | | | **9.136** |

Diskrete Ausprägungen:

- Straßenbreiten: 3, 6, 10 und entlang der Trasse 3→9 m.
- Wegbreiten: 1,5, 2,5, 4 und 1,5→4 m. Sackgassen zusätzlich als Wege mit 1,5 oder 3 m.
- Wasserbreiten: 3, 7, 12 und 3→10 m. Kombinationsgruppen enthalten **alle 4×4 Breitenpaare**, nicht nur gleich breite Paare.
- Wasserabsenkungen: 0,6, 1,4, 2,4 m. Neutraler Wert 0 bei Gruppen ohne Wasser. Der absichtlich überflutete Grenzfall hat unabhängig vom neutralen Gruppenfaktor 1,4 m Absenkung.
- Spiegelung 0=Original, 1=Ost/West, 2=Nord/Süd, 3=beides. Kreuzungen 0–3, sonst 0–1; Grenzfälle nur 0.
- Flächengrößen: ×0,75, ×1, ×1,3 bei Freiflächen/Ufern. Andere Gruppen ×1.
- Freiflächenzugänge: kein Zugang, Straße, Weg. Andere Gruppen erhalten ihre Trassen aus dem jeweiligen Rezept.
- Nachbarn: keine, einer, vier dichte Nachbarn; Grenzfälle ohne reguläre Nachbarn. „Vollständig verbaut“ verwendet einen flächendeckenden Sperrblocker.
- **Neutrale Faktoren:** `r6` bei Freiflächen/Grenzfällen und `w7` bei freien Teich-/Uferflächen sind Katalogbuchhaltung, keine Behauptung einer vorhandenen 6-m-Straße oder 7-m-Wassertrasse. Karten, Einzelansicht, gewöhnliche Suche und physische Breitenfilter werden aus den tatsächlichen Flächen/Centerlines abgeleitet. Wegzugang bei Freiflächen hat tatsächlich 1,8→2,8 m. Eine freie Wasserfläche hat keine Trassenbreite. Vollständige IDs mit `~` bleiben als IDs suchbar.
- Zusätzliche Wege in Dreifachkombinationen und Hofzufahrten sind ein eigener fester Verlauf mit 1,8→2,8 m. Sie sind nicht eine weitere unabhängige Breitenachse.
- Vier Hausformen: Giebelhaus, Stadthaus, Langhaus, Winkelhaus; automatische Auswahl berücksichtigt lokalen Kontext.

Die vollständigen Formbezeichnungen und Faktoren sind in `GROUPS` und im Matrixdialog sichtbar und als Katalog-JSON exportierbar. Die Matrix enthält Geraden, weite/enge Links-/Rechtsbögen, S-Kurven, 45°-/90°-Knicke, Kehren; T/Y/Kreuz/versetzte/fünf-/sechsarmige Knoten/Kreisplatz; sechs End-/Hofzufahrten; sechs freie Platzformen; zehn Fließwasserformen; acht Teich-/See-/Küsten-/Inselformen; acht Zweifach- und sechs Dreifachkombinationen.

### Regeln und Ausschlüsse

Dies ist kein Anspruch auf alle kontinuierlich möglichen Radien, Winkel, Ufer oder Grundstücke. Nicht enthalten: Geländegefälle, Flut-/Strömungssimulation, Furtkonstruktion, Tragwerksplanung von Brücken, Innenräume, Fassaden, echte Türöffnungen und Verteilung mehrerer Häuser über ein Stadtviertel. Querungen sind einfache Trassen auf Y≈0 über abgesenktem Wasser. Ungültige Bauplätze bleiben als explizite Ablehnungen sichtbar; sie werden nicht aus dem Katalog gefiltert.

## Unveränderte Prüfeingaben und Kriterien

- **Jeder der 9.136 Einträge:** Seed **42**, zweimal identisch erzeugt; lokale Daten bleiben unverändert. Alle Kollisionsprimitive endlich, konvex und mit positiven Breiten. Beschriftete Hauptbreiten entsprechen den tatsächlichen Geometrien. Jeder Breitenprofilwechsel verändert den Kontext tatsächlich. Nachbarzahl und Sperrflächen werden geprüft.
- **Jede Form jeder Gruppe:** zusätzlich Seeds **0, 42, 91, 4294967295**, alle vier Hausformen. Gültige Ergebnisse werden vollständig geprüft; Ablehnungen müssen begründet sein. Jede gewöhnliche kanonische Form muss mit dem Giebelhaus bebaubar sein. Alle vier absichtlich unbebaubaren Kontrollfälle müssen bei allen Seeds ablehnen.
- **Freiraum:** vollständige Dachhüllen inklusive Überstand und damit alle untergeordneten Wände/Baukörper müssen im Bauraum liegen. Mindestabstände ab Dachkante: Straße 0,45 m; Weg 0,35 m; Wasser 0,85 m; geschützte Freifläche 0,5 m; Nachbar 0,65 m. Höhe ≤ lokaler Höhenbegrenzung. Keine versteckte Stauchung.
- **Lokale Reaktion:** bei gleicher Fall-ID und gleichem Seed nachträglich den alten Standort sperren, überfluten, zur Freifläche machen, den Bauraum verkleinern oder die Straße verbreitern. Der Generator muss den Standort/die Form ändern oder begründet ablehnen. Nur andere Farben oder Zufallswerte reichen nicht.
- **Mesh:** endliche Positionen und Einheitsnormalen, gültige Indizes und nicht entartete Dreiecke für **alle 9.136 Einträge mit Seed 42**, zusätzlich im festen visuellen Korpus bei allen vier Seeds. Der vollständige Mesh-Evaluator ergänzt die ursprüngliche Korpusprüfung, er ersetzt oder schwächt sie nicht.
- **Darstellung:** tatsächliche Wasservertices unter Y=0; tatsächliche rote Blockermaterialien mit `transparent=true` und `0<opacity<1`. Ausblenden ist nur Darstellung und ändert die Kollision nicht.
- **Browser:** funktionierendes WebGL, echte Hausbilder, sämtliche Gruppennavigation, Filter einschließlich unabhängiger Breiten, Suche, Pagination, Seed 0 und Wiederholung, Hausform, Draufsicht, Auswahl, Orbit/Zoom/Pan/Reset, JSON/PNG/Katalogexport, verlinkbare Einzelansicht, Escape, mobile Nutzbarkeit ohne Seitenüberlauf. Keine Console-/Runtime-Fehler im geprüften Ablauf.

`tests/fixtures.ts::VISUAL_CASES` legt zwölf Fälle für reproduzierbare Screenshots fest, darunter sämtliche Themenfamilien, Insel, Zweifach-/Dreifachkombinationen und Ablehnung. Seed 42, Kamera (42,36,48) auf (0,0,0), orthografisch, feste Beleuchtung aus `src/scene.ts`, Browserviewport 1440×1000. Dateien: `test-results/visual/<gruppe>-<form>.png` nach Browserprüfung.

Subjektive visuelle Rubrik, getrennt von technischen Assertions:

1. Haussilhouette und Dachform lesbar, keine Fassadendetails als Ablenkung.
2. Straßen-/Wegbreiten und Verlaufstyp unterscheidbar.
3. Wasserabsenkung und rote transparente Nachbarn erkennbar.
4. Hausstandort, Sperrflächen und lokaler Umgebungsbezug nachvollziehbar.

## Geometriegestützte Topologieprüfung

Die nach Baseline B0 ausdrücklich offengelegte Evaluatorlücke ist mit `tests/topology.ts` und `tests/topology.test.ts` geschlossen; der unveränderte Implementierungsstand wurde vor den folgenden Korrekturen neu gemessen (`topology-baseline.txt`: 100 bestanden, 5 fehlgeschlagen). Keine bisherigen Assertions wurden gelockert.

Die Prüfungen leiten aus den tatsächlichen Segmenten einen planaren Graphen ab, teilen an Schnittpunkten und prüfen Zusammenhang, Knotengrade, Endpunkte, Zyklen und Winkelklassen. Sie enthalten keine kopierten Szenarienrezepte. Vorzeichen der Richtungsänderung unterscheiden Links-/Rechtsbögen und Kehren; S-Verläufe müssen beide Krümmungsvorzeichen in der erwarteten Reihenfolge enthalten. Geometrisch gemessene Radien unterscheiden weite und enge Bögen. Spiegelung kehrt die Krümmung um.

T/Y/Kreuz sowie fünf-/sechsarmige, versetzte Knoten und Kreisplatz werden geometrisch unterschieden. Sackgassen müssen tatsächlich enden; Hofzugänge müssen den Hof erreichen. Parallele und querende Trassen werden über wirkliche Schnittpunkte unterschieden; Kai-Enden müssen mit ihrer **gesamten Breite** vor dem Wasser enden. Zweifach- und Dreifachkombinationen werden mit allen unabhängigen Breitenpaaren geprüft. Tatsächliche Polygon-Querschnitte werden für sämtliche Katalogtrassen gemessen, **ohne Ausnahme für Kreuzungen oder Dreifachgruppen**.

Gepinnte Kontroll-IDs sind unter anderem:

```text
streets~straight~r3~0~0~1~none~none
streets~curve-left-wide~r3~0~0~1~none~none
streets~curve-right-wide~r3~0~0~1~none~none
streets~s-left~r3~0~0~1~none~none
junctions~t~r3~0~0~1~none~none
junctions~y~r3~0~0~1~none~none
junctions~cross~r3~0~0~1~none~none
deadends~plain~r3~0~0~1~none~none
road-water~parallel~r3+w3~0~0.6~1~none~none
road-water~bridge~r3+w3~0~0.6~1~none~none
```

Mutationstests ersetzen einen korrekten Verlauf durch eine vorhandene falsche Geometrie, nicht durch einen anderen Titel: Bogen statt Gerade, Rechts- statt Linksbogen, Bogen statt S, Gerade statt T, Kreuz statt Y, T statt Kreuz, Durchgang statt Sackgasse, Brücke statt Parallelführung und umgekehrt. Die fachlichen Assertions müssen diese Mutanten zurückweisen. Eine versetzte Centerline oder erfundene Breitenmetadaten dürfen die Messung der tatsächlichen Polygonquerschnitte nicht bestehen.

## Beschriftung und physische Filter

Die offengelegte Beschriftungslücke wurde vor einer Änderung mit sieben gepinnten Kontextfällen und einer kombinierten Filter-/Suchprüfung neu baseliniert: **2/8 bestanden, 6/8 fehlgeschlagen**, `label-baseline.txt` und `label-baseline-screenshots/` im Abnahmeprotokoll. Das bisherige technische Grün war deshalb noch keine vollständige Abnahme.

`tests/presentation.test.ts` und `tests/browser/context.spec.ts` prüfen Freiflächen ohne Zugang, mit Straßen- und Wegzugang, kleinen/überfluteten Kontrollfall, Teich/Ufer und echte Fließwassertrasse. Alle dargestellten physischen Profile werden im vollständigen Katalog gegen tatsächliche geometrische Querschnitte geprüft. Änderungen allein an neutralen Katalogfaktoren dürfen die physischen Fakten nicht ändern. Auch negierte Angaben wie „ohne Straße“ dürfen keine positive Straßensuche auslösen. Bestehende Matrix-/Geometrieassertionen bleiben bestehen.

## Evaluator und Iterationsregeln

Ab `house-gallery/`:

```sh
npm ci
npm run typecheck
npm run build
npm test
npx playwright install chromium
npm run test:browser -- --workers=1
# Zusammengesetzter Abschlusslauf:
npm run check
```

Node ≥22.12; konkrete Paketversionen in `package-lock.json`. Browserprüfung verwendet den **Produktionsbuild**, nicht nur Vite-Entwicklung. `test-results/matrix-summary.json` protokolliert Fall-ID-Digest, Erfolge, Ablehnungen und verletzte Eigenschaften pro Gruppe. Laufprotokolle und kompakte Baseline/Iterationsberichte werden unter `../docs/proofs/house-gallery/` aufbewahrt.

Nach der Baseline bleiben Matrix, Seeds, Rubrik und Assertions stabil. Je Iteration eine Fehlerursache auswählen, Hypothese und gezielte Änderung notieren, denselben Evaluator plus Regressionen erneut ausführen. Keine Kategorieumbenennungen, entfernten Tests, abgeschwächten Assertions oder fest codierten Ergebnisse als Verbesserung. Evaluatorfehler ausdrücklich korrigieren und neu baselinen. Keine künstliche Zeit-/Kosten-/Iterationsobergrenze, aber reale Zugriffs- und Plattformgrenzen gelten.
