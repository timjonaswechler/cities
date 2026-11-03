# sol-loop

Reviewer: OpenAI GPT-6.1 Sol, Provider Pi, `thinking=xhigh` (verfügbar laut Harness-Katalog).
Ein Reviewer je Runde, keine Implementierungsdelegation. Verbrauchsdaten nicht geliefert.

## Runde 1 — CHANGES

| ID | Schwere | Befund | Ergebnis |
| --- | --- | --- | --- |
| S1 | should | Undo entfernt Segment, Griffauswahl bleibt ungültig und wirft Runtimefehler | behoben: Auswahl vor Rendering gegen aktuellen Graphen abgleichen; echter Chromium-Repro erst rot, dann grün |
| S2 | should | formerhaltendes Teilen verkürzt den für Abrundungen betrachteten Arm | behoben: Randverlauf durch glatte gleichpfadige Grad-2-Knoten weiterverfolgen; Gerade UND verjüngte Bézierkurve geprüft |
| S3 | should | Kreuzungskerne/Kreisergänzungen fehlen in Konfliktprüfung | behoben: generiertes Knotenmaterial gegen nicht beteiligte Pfade sowie fremdes Knotenmaterial prüfen |
| S4 | should | Lösen eines zusammengesetzten Pfads löscht dessen interne Abrundung | behoben: Radien beider gemeinsam verschobener Arme auf neue Knotenidentität übertragen; nur getrennte Paare entfernen |

Keine Befunde abgelehnt. Regression vor Fix: 3/24 Geometrieprüfungen und
1/6 Browserabläufe fehlgeschlagen (`review-red-*.txt`).
Nach Fix und zusätzlicher gekrümmter Teilungsregression:
**25/25 Geometrie, 6/6 Browser**, Format/Typen/Build bestanden
(`review-fixed-check.txt`).

Diff vor Review: 62 Dateien, +3922/−5937 Zeilen einschließlich Evidenz/Lockfile.
## Runde 2 — APPROVE für S1–S4

Alle vier IDs unabhängig als **resolved** bestätigt. Reviewer führte 25/25
Geometrieprüfungen, Typprüfung, fokussierten Chromium-S1-Test, eigene Proben
und `git diff --check` aus.

Die Nachprüfung beobachtete zusätzlich einen schon im Runde-1-Stand bestehenden
Clippingfehler bei wiederholter Kurventeilung und Umkehr und schloss ihn als
unverändert aus dem begrenzten Delta-Review aus. Der Umsetzungsagent hat ihn
**nicht** als akzeptierte Grenze behandelt: Richtungs-/Teilungsinvarianz gehört
zum Auftrag.

## S5 — zusätzliche Korrektur vor Veröffentlichung

Reproduzierbar: T-Knoten, E als verjüngte Quadratic (0,0), Griff (15,5),
Ende (30,0), 4→10 m; zwei/drei aufeinanderfolgende Teilungen bei t=0,1,
dann Richtung umkehren. Clipper wirft trotz geometrisch identischer Mittellinie.
Neue Regression zuerst rot: **1/26 fehlgeschlagen** (`clipping-red.txt`).

Hypothese bestätigt: winzige Gleitkomma-Unterschiede an gemeinsamen Rändern.
Gemeinsames Clipping-Eingaberaster **10 nm**, weit unter eingefrorenen 1 µm /
2 mm Toleranzen. Keine Assertion, Testeingabe oder Toleranz geändert.
Gleicher Evaluator nun **26/26 Geometrie und 6/6 Browser**, einschließlich
wiederholter Teilung, Umkehr und Starrbewegung (`clipping-fixed-check.txt`).

## Runde 3 — CHANGES, S5 noch offen

Reviewer fand den Gegenfall: dieselbe geteilte/umgekehrte Kurve nach
Drehung 0,0274 und Translation (−28,24;−22,91) wirft weiterhin.
Nur Eingangsrundung behebt die Gleitkomma-Clipperursache nicht robust.
Neue Gegenfallassertion unverändert übernommen: **1/26 rot**
(`rigid-clipping-red.txt`). Keine Toleranz gelockert.

Strategiewechsel statt weiterer Rasterwerte: `polygon-clipping` entfernt,
verfügbare normale Drittbibliothek `clipper-lib@6.4.2` und Typen verwendet.
Kleiner interner Adapter `src/overlay.ts`: Ganzzahloperationen auf 10-nm-Raster
mit lokalem Ursprung, explizite Bereichsprüfung, normale Außen-/Lochorientierung
und vollständige PolyTree-Ausgabe einschließlich Inseln in Löchern.
Der Radius-/Pfad-/Editorcode wird dadurch nicht neu implementiert.
Die erste Adapterprobe deckte einen unzutreffenden Runtime-Enum im Dritt-Typpaket
auf; direkt verfügbare `StrictlySimple`-Eigenschaft statt nicht existierendem
`InitOptions`-Objekt verwendet. Keine Assertion geändert.

`npm ci` und `npm run check`: **28/28 Geometrie, 6/6 Browser**, Format/Typen/Build.
Zusätzliche feste metamorphe Prüfung mit 24 deterministischen Starrbewegungen
derselben geteilten Kurve und unabhängiger Flächen-/Radiusinvariante; zusätzliche
verschachtelte Insel mit analytischen 648 m². Keine UI-Variantenmatrix.
Belege: `integer-install.txt`, `integer-clipping-check.txt`.

Runde 4 prüft ausschließlich S5/Integer-Adapter und Auswirkungen. Die zusätzliche
fokussierte Runde folgt dem ausdrücklichen Nutzerauftrag, keine künstliche globale
Iterationsobergrenze als Erfolg oder Abbruch auszugeben. Kein weiterer Reviewer
gleichzeitig; S1–S4 bleiben unabhängig bestätigt.

## Runde 4 — CHANGES, S5 Randtopologie noch offen

Integer-Clipping bestand beide vorherigen Ausnahmefälle und alle 28 Tests.
Der Reviewer wies jedoch eine interne Naht nach: zwei Teilungen, Umkehr,
Drehung 2 rad. Fläche blieb nahezu gleich, aber 1→2 Komponenten und Randabstand
am Teilungsknoten 2,567 m→nahe 0. **Echte** falsche Distanzgrundlage, nicht
als Rundungsabweichung abgetan. Zusätzlich bestätigte der Reviewer 96
Winding-/Lochverschachtelungsproben sowie Mesh, Typen und Build.

Neue Assertions in denselben S5-/24-Starrbewegungsfällen prüfen jetzt auch
Komponentenzahl und Randabstand mit unveränderter 0,04-m-Grenze:
**2/28 fehlgeschlagen** (`seam-red.txt`). Keine Eingabe entfernt/ersetzt.

Eine gemeinsame Endpunktmittelung änderte beide Fehler nicht und wurde als
nicht fortschrittlicher eigener Versuch entfernt. Tatsächliche Ursachen:
interne Querschnitte wurden als Clip-Polygongrenzen eingespeist; außerdem
berührte die Kreisergänzung die Streifen nur auf rastergerundeten Grenzlinien.
Fix: glatte gleichpfadige Segmentketten vor Clipping als einen durchgehenden
Streifen bilden (bewusste Knicke und unterschiedliche Knoten bleiben getrennt).
Die Kreisergänzung erhält positive Überdeckung ausschließlich entlang ihrer
verdeckten Flanken innerhalb vorhandener Streifenquerschnitte. Freiliegender
Kreisbogen, Tangentialpunkte und Mittellinien unverändert; kein globaler Puffer.

Nach Kettenbildung 1/28 statt 2/28 offen; nach lokaler Flankenüberdeckung alle
bestanden. Zusätzliche geschlossene glatte Cubic-Schleife sichert Loch und
Randabstand ohne innere Teilungsnähte ab.
Letzte Prüfung: **29/29 Geometrie, 6/6 Browser**, Format/Typen/Build bestanden
(`seam-fixed-check.txt`).

## Runde 5 — CHANGES, S5/S6

S5-Gegenfall: gleiche dreifach geteilte Kurve, Umkehr, 2 rad, Translation
(7000,9000). Die feste 1e-12-Tangentenschwelle war knapp kleiner als der durch
Subtraktion großer Weltkoordinaten entstehende Fehler (1,052329e-12).
Wieder falsche Naht und Randdistanz nahe 0. Schwelle nun aus
`64 × Number.EPSILON × Koordinatenskala / Tangentenlänge` abgeleitet;
gemeinsame Knotenidentität und übereinstimmende Seitenenden bleiben Voraussetzung.
Keine Mittellinienglättung, keine Änderung einer Abnahmetoleranz.

S6 [should]: kubische E-Kurve mit Griffen (10,4)/(20,−4), 4→10 m.
Eine Teilung bei 0,1 wechselte Erfüllbarkeit Radius 2 von 0→2 und Fläche um
1,4 m². Ursache: Der Abstandsort polygonisierter Ränder besteht nicht nur aus
verschobenen endlichen Kanten, sondern auch Kreisbögen um innere Vertices.
Fehlende Kanten/Kreis- und Kreis/Kreis-Kandidaten ergänzt; jede Kandidatur
prüft Vorzeichen, lokale Station, Bogenorientierung und Nichtdurchdringung
beider vollständiger Flanken, statt einen zunächst gewählten ungültigen Kreis
als pauschales Scheitern zu behandeln. Endvertices sind keine zusätzlichen Endkappen.

Beide exakten Gegenfälle zuerst rot: **2/30 fehlgeschlagen**
(`continuity-fillet-red.txt`). Nach Fix **30/30 Geometrie, 6/6 Browser**,
Format/Typen/Build bestanden (`continuity-fillet-check.txt`).
S6 sichert zusätzlich erneute Teilung/Umkehr und drei unveränderte feste
Starrbewegungen ab (einschließlich 7000/9000), mit Flächen-, Komponenten- und
Randabstandsassertionen. Keine Befunde abgelehnt.

## Runde 6 — CHANGES, S5/S6 konkret weiter abgesichert

S5: Teilungen bei 0,37 und danach 0,9999 im ersten Segment, Umkehr,
2 rad und (7000,9000) erzeugten weiterhin Randnähte. Tangentenfehler lag nun
innerhalb der Abschätzung, aber Seitenendpunktfehler 1,746e-9 m überschritt
die noch starre 1e-9-m-Schranke. Seitentoleranz nun konsistent aus
Positionsfehler plus halber Breite × Winkelfehler abgeleitet. Bereits innerhalb
dieses Rechenfehlers als glatt erkannte gleiche Graphanschlüsse erhalten
kanonische Seitenendpunkte (dieselben Punktobjekte auch für Kreuzungskerne),
damit keine numerischen Restdreiecke als freie Außenflächen ausgegeben werden.
Knotenidentität, eigentliche Kontrollgriffe und Mittellinien bleiben unverändert.

S6: Ein voller Vertex-Kreis enthält auch ungültige Mittelpunkte außerhalb des
Normalkegels der beiden angrenzenden Kanten. Die frühere 0,004-m-Durchdringungs-
Zulassung machte einen solchen Kandidaten scheinbar gültig: gemeldeter und
wirklich nächster Tangentialpunkt lagen 0,112838 m auseinander.
Kandidaten nun gegen **beide** Projektionen am inneren Vertex geprüft; tatsächliche
Nichtdurchdringung mit bloßem Gleitkomma-/10-nm-Rasterfehler statt 4 mm zugelassen.
Weiterhin alle Kandidaten prüfen, keine stille Radiuskappung.

Exakte neue Regressionen zuerst **2/31 rot** (`tangent-distance-red.txt`).
S6 fragt zusätzlich die Fläche des einzelnen Arms ab: Radiusabstand mit 1e-6 m,
gemeldeter vs. nächster Randpunkt und Orthogonalität innerhalb eingefrorener
0,04 m. S5c prüft echte Komponenten-/Distanzinvarianz des kurzen Teilsegments.
Nach Fix **31/31 Geometrie, 6/6 Browser**, Format/Typen/Build
(`tangent-distance-check.txt`). Keine Assertions abgeschwächt oder Eingaben ersetzt.

## Runde 7 — S6 resolved, S5 stationärer Endpunkt offen

S6 unabhängig bestätigt: 72 Original-/Teilungs-/Umkehr-/Poseproben mit
Armfläche allein, maximaler Radiusfehler 6,4e-9 m und Tangentialpunktfehler
1,5e-7 m; beide Normalkegelbedingungen erfüllt. S5c ebenfalls bestätigt:
Randdistanz 3,100427960→3,100427957 m, eine Komponente.

Neuer S5-Gegenfall: Quadratic (−30,0)→(0,0), Griff (0,0), dann Gerade
nach (30,3), Breite 4. Stationäres Kurvenende hat Ableitung 0, aber horizontale
analytische Grenztangente. Darstellung verwendete eine Ersatz-Tangente,
Fehlerrechnung dagegen Null/EPS und erlaubte nach (7000,9000) unzulässig
den bewussten 5,71°-Knick zusammenzufassen (Flächendifferenz ca. 0,15 m²).

S5d zunächst **1/32 rot** (`stationary-red.txt`), für Quadratic und Cubic sowie
kleinen nichtstationären Vergleichsgriff. Fix: gemeinsames `tangentVector`
liefert an Enden die erste nichtverschwindende Kante des Kontrollpolygons,
also dieselbe analytische einseitige Grenztangente für Darstellung UND
Fehlerabschätzung, auch bei stationärem Ableitungsgrad 2/3. Keine Division
einer Null-Ableitung durch eine künstliche Länge; Normalisierung dividiert
direkt durch die tatsächlich nichtverschwindende Vektorlänge.

Nach Fix **32/32 Geometrie, 6/6 Browser**, Format/Typen/Build
(`stationary-check.txt`). Alle bisherigen Eingaben und Toleranzen unverändert.
## Runde 8 — APPROVE

S5 abschließend **resolved**, keine beabsichtigten Anwendungsfehler im
fokussierten Recheck gefunden. Reviewer bestätigt:
- exakter stationärer Knick: 240,5980123935→240,5980123952 m² nach Translation;
- 48 analytische Tangentenprüfungen (stationäre Q-/Cubic-Anfänge/Enden,
  Cubic-Ordnung 2/3, Umkehr und Posen) bestanden;
- 72 Flächenproben gegen äquivalente Geradentraces: maximal 1,68e-7 m² Fehler,
  keine innere Naht an glatten Anschlüssen; Graph unverändert;
- fokussierte S5d/G03b-Tests, Typen und `git diff --check` bestanden.

**S1–S6 geschlossen, keine abgelehnten Befunde.** Acht sequenzielle
OpenAI-Runden, jeweils derselbe tatsächlich verfügbare GPT-6.1 Sol / Pi /
`thinking=xhigh`, keine parallelen Ersatzimplementierungen. Keine
Verbrauchsdaten geliefert. Die zusätzlichen Runden korrigierten echte
Abnahmefehler; kein Iterationsbudget wurde als Erfolgsbeweis verwendet.

Abschließender sauberer Installations-/Gesamtlauf: `final-install.txt` und
`final-check.txt`. Veröffentlichung erst nach Rebase; CI-/Review-Merge-Gate
wird zusätzlich auf dem veröffentlichten PR-Head geprüft. PR/Merge-Commit
werden im Abschlussbericht genannt; dieses Reviewprotokoll ersetzt kein CI.
