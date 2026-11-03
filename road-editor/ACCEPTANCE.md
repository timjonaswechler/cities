# Abnahme: parametrischer Wegeditor

Eingefrorener Evaluator vor Implementierung. Keine Galerie und keine alte Fallmatrix.
Bestätigte Seams aus dem Auftrag: editierbarer Graph/JSON/History; reine TS-Fläche
(ohne Three.js/DOM); Browseraktionen und dieselben Flächenringe im Renderer.

## Geometrievertrag

Meter, XY, positive Breiten; Verlauf linear über Bogenlänge des gesamten Pfads.
Sackgassen haben **flache, senkrechte Endkappen** (butt), keine zusätzlichen Kreise.
Bewusste Knicke bleiben erhalten. Radius ist ein lokaler Kreis zwischen benachbarten
Armen, nicht Mittellinienglättung. Nicht passende Radien: wirksam 0, mit Grund,
ohne stille Kappung. Ungeklärte Überschneidungen vereinigen sich geometrisch,
bleiben aber ein gemeldeter Topologiekonflikt.
Polygonringe enthalten Außenkonturen und Löcher; Restflächen sind kein Baurecht.

Sampling: maximale Schrittweite 0,2 m, Bézier-Abweichung 0,002 m.
Testtoleranzen: gerade Koordinaten/Flächen 1e-6 m/m²; gekrümmte Querschnitte
0,04 m; Flächen unter Richtungsumkehr/Starrbewegung 0,02 m²;
Kreistangentialität bei geraden Armen 1e-6 m, Kurvenpolygonisierung 0,04 m.
Diese Grenzen folgen der Weltkoordinaten-Polygonisierung, nicht Bildschirmauflösung.

## Feste Eingaben und Eigenschaften

Exakte IDs/Koordinaten/Breiten stehen in `tests/fixtures.ts`, Assertions in
`tests/geometry.test.ts`; die Browseransicht ist 1440×1000, Startkamera
Mittelpunkt (0,0), 120 m vertikal. Keine Variantenliste in der Anwendung.

- G01: L, (-20,0)→(20,0), Breite 6: 240 m², Enden ±20, Kanten ±3.
  Q: (-20,0), Griff (0,20), (20,0), Breite 4: Querschnitt am Scheitel.
- G02: kubische S-Kurve und gemischter zusammenhängender Verlauf, endliche Fläche.
- G03: L 3→9, analytische Querschnitte und Fläche; Breite verändert Fläche.
- G04: umgekehrte Segmente/Griffe UND Breiten ergeben dieselbe Sperrfläche.
- G05: gemeinsamer Knoten bleibt bei Bewegung verbunden; gleiche Position ≠ Identität.
- G06: T, schiefes Y, Vierarm, unterschiedliche Armbreiten, zyklische Armreihenfolge.
- G07: Radius 0, 3, 1000: lokale Änderung, Kreistangentialität oder erklärtes Scheitern.
- G08: 2 m lange Sackgasse, flache Kappe; unpassender Radius wird ausgewiesen.
- G09: geschlossener quadratischer Weg um ±20, Breite 4: Innenbereich bleibt frei.
- G10: zwei getrennte Geraden: zwei Flächen.
- G11: kreuzende unabhängige Pfade: Konflikt, keine heimliche Graphmutation.
- G12: formerhaltendes Teilen von quadratischen/kubischen Segmenten bei t=0,37.
- G13: versionierter JSON-Roundtrip, Undo/Redo und reproduzierbare Fläche.
- G14: NaN/Infinity, Breite ≤0, fehlende Referenz, leere/degenerierte Segmente,
  doppelte IDs, unzusammenhängender Pfad werden abgelehnt.
- G15: unabhängige analytische Kontrollfälle; Translation/Rotation; Randabstand,
  Lochrandrichtung; absichtlich falsche Erwartungen unterscheiden sich vom Ergebnis.

## Browser

B01: neu zeichnen, selektieren, Anker/Griff ziehen, Breite und Position eingeben:
Graph UND gemessene Fläche ändern sich. B02: an Knoten andocken, Segment teilen,
verbinden/lösen; gemeinsame Bewegung. B03: Radius eingeben, effektiven Radius
und Flächenänderung prüfen. B04: JSON speichern/laden, Undo/Redo, Löcher,
Konflikte und 3D-Abgleich. Keine Console-/Runtimefehler dieser Abläufe.
Screenshots ergänzen Assertions. Sichtkriterien: unterscheidbare Anker/Griffe,
gut lesbare Kontur/Breite/Radius, erkennbare freie Innenbereiche und Konflikte.
Gestaltungsurteile bleiben subjektiv.

## Erweiterung: Wasser als zusätzliche Flächensperre

Die bisherigen Wege-Assertions und Toleranzen bleiben unverändert. Die erste
Wasser-Erweiterung ergänzte polygonale Flächensperren. Diese Fixtures bleiben
bestehen; die nachfolgende Vektorvorgabe erweitert das Zeichnen für beide Materialien.
Kein Rückgriff auf die verworfene Galerie oder deren Matrix.

`tests/blockers.test.ts` friert die zusätzlichen Eingaben ein:

- W01: konkave Uferkontur, 128 m² und unabhängige Innen-/Außen-/Randabstandsproben.
- W02: 40 × 30 m See mit 10 × 8 m Insel, 1.120 m² Sperrfläche; Insel bleibt Loch.
- W03: 240 m² Weg plus 400 m² Wasser, 120 m² Überlappung: 520 m² Union.
  Sichtbares Wasser und Wege sind disjunkte Render-Grundflächen derselben Union.
- W04: Weg durch eine Insel: 504 m² Union; Straße gesperrt, Inselreste frei.
- W05: überlappende/getrennte Gewässer sowie ein Teich innerhalb einer Insel.
- W06: Version-2-JSON und History erhalten Gewässer und Breitenkopplung;
  Version-1-Wegnetze bleiben ladbar, Wasser in Version 1 wird abgelehnt.
- W07: ungültige Zahlen, Konturen, IDs, Selbstschnitte sowie berührende,
  überlappende, verschachtelte oder außerhalb liegende Inselringe ablehnen.
- W08: Ringumkehr und starre Bewegung erhalten Flächen und Randabstände.

W09–W11 in `tests/browser/editor.spec.ts` prüfen Zeichnen/Schließen/offenes Beenden,
Ziehen, numerische Änderungen, Punkteinfügen/-entfernen, Inseln, Löschen,
Undo/Redo, Import/Export und die echte gemeinsame Three.js-Grundfläche.
Wasservertices liegen tatsächlich unter Z=0; das tatsächliche Material ist blau.
Offene Vektoren belegen bereits ihren Breitenstreifen; nur unfertige Aussparungen
sind Entwürfe. Unzulässige Änderungen ersetzen nicht den letzten gültigen Zustand. Keine Console-/Runtimefehler im Ablauf.
Diese Ansichten bleiben bei 1440×1000 und derselben festen Startkamera prüfbar.

Die Absenkung beträgt 1,4 m. Keine Wassersimulation. Screenshotnachweise werden
in das jeweilige Playwright-Ausgabeverzeichnis geschrieben, nicht als neue
Behauptungen in die historischen Abnahmebelege übernommen.

## Erweiterung: ein Vektor-Zeichenablauf für Weg und Wasser

Die aktuelle Vorgabe ersetzt die getrennten Zeichenmodelle: Offen entsteht eine
Fläche durch Breite; ausdrücklich geschlossen wird das Innere gefüllt, ohne
Breitenparameter. Beide Materialien unterstützen Gerade, quadratische/kubische
Bézier-Segmente und dieselben Anker/Kontrollgriffe.

`tests/vectors.test.ts`:

- V01–V02: identische variable Streifen und lokale Abrundungen für beide Materialien.
- V03–V04: analytische gefüllte Kurvenflächen, keine versteckten Breiten;
  Schließen erzeugt eine Fläche statt eines dicken Rings.
- V05–V06: kubische Konturen, exakte De-Casteljau-Teilung und gekrümmte Löcher.
- V07: materialübergreifende Überlappung erzeugt keine Weg-Wasser-Kreuzungsabrundung.
- V08–V10: Öffnen, Version-3-Roundtrip, Altformat-Kompatibilität und strikte
  Ablehnung ungültiger Kurven einschließlich `null`-Kanten.
- V14: gemeinsam genutzte Knoten anderer Pfade bleiben beim Schließen erhalten;
  ungültiges Schließen verändert die Quelle nicht.
- V15: gekrümmte Flächen behalten Fläche und Belegung bei starrer Bewegung,
  Konturumkehr einschließlich kubischer Griffe und Materialwechsel.

V11–V13 in `tests/browser/vectors.spec.ts` prüfen beide Materialien mit allen
drei Segmenttypen, echte Breitenänderungen, Schließen am Anker/per Button,
fehlende Breitenfelder bei Flächen, Griffziehen und numerische Griffänderungen,
formerhaltendes Einfügen, Undo/Redo, Import/Export, Öffnen, gekrümmte Inseln und
nachträgliche Bézier-Kanten an alten Polygongewässern. Keine Console-/Runtimefehler.
Die bisherigen Geometrie-Assertions und Toleranzen bleiben unverändert.
Nachweise: [Vektor-Iterationen](evidence/vectors-iterations.md).

## Befehle und Nachweis

`npm ci`, `npm run build`, `npm test`, `npm run test:browser` in `road-editor/`.
`npm run check` bündelt Build, Geometrie und Chromium. Iterationen und tatsächliche
Ergebnisse: `evidence/iterations.md`. Browserbilder: `evidence/*.png`.
