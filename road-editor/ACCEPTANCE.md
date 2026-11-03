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

## Befehle und Nachweis

`npm ci`, `npm run build`, `npm test`, `npm run test:browser` in `road-editor/`.
`npm run check` bündelt Build, Geometrie und Chromium. Iterationen und tatsächliche
Ergebnisse: `evidence/iterations.md`. Browserbilder: `evidence/*.png`.
