# Nachweise des Neustarts

Basis: `2b02fa1391a254f9836cf4f9f5a4bca9caedcb0e`, nach `git fetch origin`
identisch zu `origin/main`. Worktree/Branch `parametric-road-editor` war sauber.
Keine weiteren Implementierungsagenten oder Worktrees. Hausgalerie entfernt,
neuer Code in `road-editor/`; Rust, Assets, Archiv und Experimente unverändert.
Historische Hausnachweise bleiben erhalten, nur ihre Verweise wurden historisiert.

## Baseline und Evaluatorintegrität

Vor produktiver Implementierung: Graph-/Flächenstubs, feste Eingaben in
`tests/fixtures.ts`, Kriterien in `ACCEPTANCE.md`, ausführbare Assertions.

- `npm test`: **14 fehlgeschlagen, 1 bestanden** (`baseline-geometry.txt`).
  Der bestandene G14 akzeptierte keine ungültigen Eingaben, weil noch jede
  Operation warf; dies ist **kein** Nachweis implementierter Validierung.
- `npm run test:browser`: **0/4 bestanden** (`baseline-browser.txt`).
  Editor und Bearbeitungsabläufe fehlten.

Offengelegte Evaluatorfehler, keine Produktkorrekturen:
1. G07 handgerechnete Vierarmfläche 585 war falsch:
   30×(6+4+8+3) − (6+8+6+4,5) = **605,5 m²**.
2. Der ursprüngliche Punkt (3,4) liegt **innerhalb** des Ausschlusskreises mit
   Zentrum (5,6), Radius 3 (Abstand √8). Er darf nicht hinzugefüllt werden.
   Nun wird weiterhin sein Ausschluss **und** die hinzugefügte Fläche bei
   (2,5;3,5), Abstand √12,5 > 3, geprüft. Zusätzlich unabhängige
   Flächenzunahme r²(1−π/4) mit unveränderter Polygonisierungstoleranz 0,02 m².
3. JSON-Dateiimport liest asynchron; B03 wartet auf denselben geforderten
   Graphen statt vor Abschluss des File-Reads zu prüfen. Keine Modellassertion entfiel.

Neue Baseline nach 1/2: **15/15 Geometrie**, Browser zunächst **2/4**.
Zusätzliche Regressionen verschärfen dieselben Kriterien (keine Variantenmatrix):
stationäres Bézier-Ende/Bogenlänge, gekrümmte und verjüngte Radiusränder,
Identitäten beim Lösen, Starrbewegung mit Radien, entfernte Überschneidung,
Selbstkreuzung und gefaltete Offsets. Browser B05 ergänzt gemischte Verläufe,
numerische Griffe, Löschen/Undo und atomare Ablehnung ungültiger Bearbeitung.

## Fokussierte Iterationen

| Fall / Hypothese | Änderung | Vorher → Nachher / Evidenz |
| --- | --- | --- |
| G01–G05/G12–G15: Graph-/Flächenrechnung fehlt | Graphvalidierung, De Casteljau, History; adaptive Offsets und Polygonvereinigung hinter reinem TS-Interface | 1/15 → 14/15; verbleibender G07-Oraclefehler wie oben offengelegt |
| G06–G09: lokale Kreise müssen tatsächliche Seitenränder berühren | benachbarte Arme geometrisch sortiert; Schnitt der versetzten Ränder, tangentiale Kreisergänzung, explizite Ablehnung | 15/15 nach Oraclekorrektur; keine globale Pufferung |
| B01–B04: direkter Editor fehlt | SVG-Manipulation über Three.js-Fläche; numerische Parameter, Andocken/Lösen, JSON und Historie | 0/4 → 2/4; B01 Griff nach Undo/Redo nicht mehr auswählbar, B03 asynchroner Evaluatorfehler |
| B01: Undo/Redo verwirft unnötig die gültige Auswahl | Auswahl erhalten, Zeichenkette beenden | 2/4 → 4/4 nach separater B03-Wartekorrektur |
| G11b: gemeinsamer Knoten erklärt entfernte Flächenüberschneidung nicht | Überlappungskomponenten und explizite Selbstkreuzungen prüfen | 18/19 → 19/19 |
| G14b: gefaltete breite Kurvenränder bisher ungemeldet | lokale Krümmungsdiagnose mit nachvollziehbarem Hinweis | 20/21 → 21/21 |
| Renderer/Kamera: dieselben Ringe müssen überall gelten | Mesh-Dreiecke gegen Flächenanfragen prüfen; Kamerapan separat, Maßstab in Perspektive ausgeblendet | 5/5 Browser inkl. B05; kein eigener Renderflächenalgorithmus |

## Fehlererkennung durch gezielte Mutationen

Nur eigene produktive Rechnung vorübergehend verfälscht, anschließend exakt
wiederhergestellt; keine Assertions geändert:
- Endbreite ignoriert → **5/19 Tests fehlgeschlagen** (`mutation-width.txt`).
- Löcher aus Flächenergebnis entfernt → **2/19 fehlgeschlagen** (`mutation-holes.txt`).

## Letzte lokale Messung

`npm run check` in `road-editor/`: Formatprüfung, Typprüfung,
Produktionsbuild, **32/32 Geometrieprüfungen** und **6/6 Chromium/WebGL-Abläufe** nach Reviewkorrekturen.
Vollständige Ausgabe des abschließenden sauberen Laufs: `final-check.txt`,
Installation: `final-install.txt`; Stand vor Review: `local-check.txt`. Browser startet und beendet seinen
lokalen Vite-Server selbst. In allen geprüften Abläufen **0 Console-/Runtimefehler**.
`python3 tools/verify-archive.py`: **64 wiederhergestellte Archivdateien/Symlinks bestätigt**.

Vite meldet den transparenten Hinweis auf einen JS-Chunk >500 kB; keine
Warnschwelle erhöht und kein Performanceziel erfunden. `npm install` meldete
0 bekannte Schwachstellen; macOS meldet das optionale fsevents-Installationsskript.
Kein Produktionsdeploy. Rust-Tests wurden nicht als Editorbeweis ausgegeben.

## Tatsächlich angesehene feste Ansichten — subjektiv

1440×1000, Mittelpunkt (0,0), vertikaler Ausschnitt 120 m;
Perspektive kontrolliert aus derselben Kameraeinstellung:
- [Bearbeitung](editing.png): orange Auswahl/Mittellinie, runde Anker,
  blaue Rauten und Kontrolllinien unterscheidbar; Breitenverlauf sichtbar.
- [Verbindung](connections.png): geteilter Kurvenanker mit abgehendem Weg.
- [Radius gültig](radius-valid.png) und [Ablehnung](radius-feedback.png):
  örtliche Fläche und gewünschter/wirksamer Wert nachvollziehbar.
- [Innenbereich](hole-top.png) und [3D](hole-3d.png):
  Außenkontur und unbebauter Innenbereich erkennbar.
- [Konflikt](conflict.png): rote Mittellinien und expliziter Topologiehinweis.

Dies sind subjektive Lesbarkeitsurteile anhand der Nutzeranforderung
„direkt manipulierbare Vektorpfade wie in einem Vektorgrafikprogramm“,
keine erfundene Bildreferenz oder gestalterische Nutzerfreigabe.
Screenshots ergänzen die ausgeführten Modell-/Flächenassertionen, ersetzen sie nicht.

## Review und Veröffentlichung

OpenAI-sol-loop Runde 1 fand vier echte Fehler (S1–S4), alle reproduziert:
ungültige Griffauswahl nach Undo; Abrundungsverlust bei glatter Teilung;
fehlende Konflikte mit Knotenmaterial; Radiusverlust beim gemeinsamen Lösen.
Fokussierte Regressionen vor Fix: 3/24 Geometrietests und 1/6 Browserabläufe
fehlgeschlagen, genaue Ausgabe in `review-red-geometry.txt` / `review-red-browser.txt`.
Nach Fix und zusätzlicher gekrümmter Teilungsregression: 25/25 und 6/6 bestanden.

Ein erster S3-Ansatz ordnete jedem Pfad die gesamte Kreuzungsgeometrie zu;
das erzeugte falsche Konflikte und Clippingfehler in zwei bestehenden Tests.
Dieser eigene Iterationsansatz wurde verworfen, nicht die Assertions geändert.
Der engere Fix prüft generiertes Knotenmaterial nur gegen nicht beteiligte
Pfade bzw. fremdes Knotenmaterial. Alle ursprünglichen Invarianten bestehen.

Runde 2 bestätigte S1–S4. Eine zusätzliche Probe zeigte aber eine schon
vorher bestehende Clipping-Ausnahme bei wiederholtem Kurventeilen/Umkehren.
Neue Regression: 25/26 bestanden, 1 fehlgeschlagen (`clipping-red.txt`).
10-nm-Eingabevereinheitlichung für gemeinsame Ränder behebt die numerische Ursache;
26/26 und 6/6 bestanden, ohne geänderte Toleranzen (`clipping-fixed-check.txt`).
Runde 3 fand aber eine weitere normale Starrbewegung, bei der die Rundung nicht
hilft: 25/26 grün, derselbe S5-Gegenfall rot (`rigid-clipping-red.txt`).
Dieser lokale Rundungsansatz wurde daher verworfen. Ein interner Adapter für
Clipper 6.4.2 führt die tatsächliche Polygonoperation jetzt auf Ganzzahlen mit
lokalem Ursprung und 10-nm-Raster aus; Außenringe, Löcher und verschachtelte
Inseln werden aus dem PolyTree erhalten. Nach sauberem `npm ci` und unveränderten
Toleranzen: 28/28 Geometrie, 6/6 Browser (`integer-clipping-check.txt`), darunter
beide Review-Gegenfälle und 24 deterministische Starrbewegungsproben.
Keine Rasterwert-Suche, keine ausgetauschten Assertions.

Runde 4 zeigte danach eine innere Naht bei Drehung 2 rad: unveränderter
Flächeninhalt verbarg 1→2 Komponenten und einen falschen Randabstand nahe 0
statt 2,567 m. Dieselben S5-Fälle und alle 24 Bewegungen prüfen jetzt zusätzlich
Topologie und Randabstand: 2/28 rot (`seam-red.txt`). Endpunktmittelung war
wirkungslos und wurde entfernt. Durchgehende Seitenränder glatter Segmentketten
beseitigen künstliche interne Querschnitte (noch 1/28 offen). Positive lokale
Überdeckung der verdeckten Radiusflanken innerhalb der vorhandenen Streifen
beseitigt auch die nur linienberührende Kreisnaht; freier Kreisbogen unverändert.
Kein globaler Puffer. Mit geschlossener Cubic-Lochregression: **29/29 Geometrie,
6/6 Browser** (`seam-fixed-check.txt`), weiterhin unveränderte Toleranzen.

Runde 5 zeigte dieselbe Naht nach Translation (7000,9000): feste
Tangentenschwelle war nicht maßstabs-/koordinatenfehlerfest. Außerdem wechselte
Radius-2-Erfüllbarkeit bei einer Cubic mit Griffen (10,4)/(20,−4) nach Teilung.
Beide Regressionen zuerst rot: 2/30 (`continuity-fillet-red.txt`).
Kontinuitätsschwelle jetzt aus Gleitkomma-Fehlerfortpflanzung statt starrer
Weltlage abgeleitet. Fillet-Suche ergänzt die fehlenden inneren Vertex-Kreisorte
zwischen versetzten Kanten sowie vollständige Kandidatenvalidierung.
30/30 und 6/6 bestanden (`continuity-fillet-check.txt`), einschließlich weiterer
Cubic-Teilung/Umkehr, Topologie und Randdistanz bei allen drei Gegenfallbewegungen.
Keine Änderung der eingefrorenen numerischen Abnahmegrenzen.

Runde 6 zeigte einen Seitenendpunktfehler von 1,746 nm bei einem sehr kurzen
Teilsegment (0,37/0,9999) an derselben Translation; außerdem einen nur scheinbar
tangentialen Cubic-Vertexkandidaten mit 0,112838 m Randpunktabweichung.
Beides zuerst rot: 2/31 (`tangent-distance-red.txt`). Seitenabgleich folgt nun
der vollständigen Fehlerfortpflanzung, gemeinsam glatte Endpunkte werden auch
für Kreuzungskerne kanonisch. Vertex-Kreisorte sind auf die echten Normalkegel
beider angrenzender Kanten beschränkt; Nichtdurchdringung prüft tatsächlichen
Randabstand statt der früheren 4-mm-Zulassung. Neue Abstands-/Orthogonalitäts-
und Topologieassertionen bestehen: 31/31 und 6/6 (`tangent-distance-check.txt`).

Runde 7 bestätigte S6 mit 72 unabhängigen Arm-/Tangentialitätsproben, fand aber
S5 bei stationärer Quadratic-Endableitung und bewusstem 5,71°-Knick:
Darstellung und Fehlerrechnung nutzten unterschiedliche Tangentenquellen.
Neue Quadratic-/Cubic-Regression zuerst 1/32 rot (`stationary-red.txt`).
Ein gemeinsamer analytischer Endpunkt-Grenztangentenvektor aus dem ersten
nichtverschwindenden Kontrollpolygonabschnitt ersetzt diese Inkonsistenz,
ohne Kontrollgriffe oder Mittellinien zu glätten. 32/32 und 6/6 bestanden
(`stationary-check.txt`), alte Toleranzen/Assertions bleiben bestehen.

Reviewentscheidungen und abschließende Veröffentlichung: `review-ledger.md`.
Runde 8 hat S5 abschließend freigegeben; S1–S6 sind geschlossen, keine Befunde
abgelehnt. Letzter sauberer Installations-/Gesamtlauf: `final-install.txt` und
`final-check.txt`. Das GitHub-Merge-Gate wird zusätzlich am veröffentlichten
PR-Head geprüft; PR und Merge-Commit stehen im Abschlussbericht.
Lokale Prüfungen allein behaupten keinen Merge.
