# Wegwerk — parametrischer Wegeditor

Eigenständige Browserwerkbank in TypeScript/Three.js, neu implementiert statt
Fortsetzung der verworfenen Hausgalerie. Wege und Straßen sind dasselbe Modell:
eigene Breite und Breitenverlauf, keine Szenariotypen. Keine Häuser, Wasser,
Blocker, Parzellierung oder Rust-/Archiv-Integration.

## Starten

Node ≥22.12, npm und ein WebGL-fähiger Desktopbrowser:

```sh
cd road-editor
npm ci
npm run dev
```

Die von Vite ausgegebene lokale URL öffnen. Ein direkt editierbares Startnetz
ist geladen; **Neu** beginnt mit leerem Graphen. Keine Serverpersistenz:
Änderungen vor dem Schließen als JSON speichern.

## Bearbeiten

- **Zeichnen** → Segmenttyp wählen → Start und Endpunkte klicken. Weitere
  Klicks erweitern denselben zusammenhängenden Pfad; Segmenttyp darf wechseln.
  **Esc/Auswählen** beendet ihn. Ein Klick nahe einem bestehenden Knoten dockt
  über dessen Identität an. Ein Klick auf eine Mittellinie teilt das Segment
  formerhaltend und verwendet den neuen Knoten.
- Mittellinie auswählen; Breiten am Anfang/Ende numerisch eingeben.
  Gleiche Werte bedeuten konstante Breite, sonst linear über gesamte Bogenlänge.
  **Richtung umkehren** kehrt Segmente, Kontrollgriffe und Breitenzuordnung um,
  ohne die physische Fläche zu ändern.
- Runde Anker ziehen oder deren XY-Position eingeben. Ein gemeinsamer Anker
  bewegt alle Anschlüsse. Blaue Rauten sind unabhängige Kontrollgriffe,
  **keine** Kreuzungsknoten; nach Griffauswahl ist auch numerische Eingabe möglich.
  Es gibt keine automatische Tangenten- oder Knickglättung.
- Knoten auswählen: **Knoten verbinden** ersetzt seine Referenzen durch den
  gewählten Zielknoten (an dessen Position). **Anschluss lösen** kopiert nur
  für den gewählten Pfad die Knotenidentität an derselben Position.
- Unter **Lokale Abrundung** Radius in Metern für das benachbarte Armpaar
  eingeben. Gewünschter und wirksamer Wert sind immer sichtbar.
  Unpassende Radien werden mit Grund abgelehnt (wirksam 0), nicht still gekappt.
- **Pfad löschen**/Entf entfernt den gewählten Pfad, nicht unabhängige Daten.
  **Undo/Redo** (Ctrl/⌘ Z, Ctrl/⌘ Shift Z) arbeitet pro abgeschlossener
  Bearbeitung; eine Ziehbewegung ist ein Schritt. JSON-Import ist ebenfalls undo-fähig.
- Pan: mittlere Taste oder Leertaste + Ziehen; Mausrad zoomt unabhängig vom Modell.
  **Ansicht 0 / 120 m** setzt die Kamera zurück. **3D prüfen** zeigt dieselben
  Flächen räumlich, **Draufsicht** kehrt zum Editieren zurück.
- **JSON speichern/laden** exportiert/importiert den versionierten editierbaren
  Graphen mit IDs, Segmenten, Griffen, Breiten und Radien — keine abgeleiteten Meshes.
  Ungültige Importe/Parameter ersetzen nicht den letzten gültigen Graphen.

## Geometrie-Interface

`src/network.ts`: `Network`, `parse/serialize`, Graphbearbeitung und `History`.
Version 1 enthält `nodes`, `paths`, `junctions`; Maße in Metern, XY in der Ebene.
Eine Arm-ID besteht aus Pfad-ID, Segmentindex und `start/end`.
Knotenidentität ist explizit, Koordinatengleichheit erzeugt keine Verbindung.

`src/geometry.ts` ist unabhängig von Editor, DOM und Three.js:

- `computeSurface(network)` liefert `areas: {outer, holes}[]`, Radiusentscheidungen,
  Topologiekonflikte und Geometriehinweise. Ringe sind umlaufend, ohne wiederholten
  Endpunkt; ihre Kanten bilden die Randverläufe.
- `contains(surface, point)` fragt die Sperrfläche ab.
- `nearestBoundary(surface, point)` liefert den nächsten Randpunkt,
  lokale normierte Randrichtung, nichtnegativen Abstand und Lochrandkennung;
  bei leerer Fläche `null`.
- `areaSize(surface)` gibt die Nettofläche ohne Löcher in m² zurück.

Flache senkrechte Sackgassenkappen; ungerundete Verzweigungen erhalten einen
lokalen polygonalen Kern, bewusste Knicke bleiben erhalten. Breite wird über
polygonisierte Bogenlänge ausgewertet. Bézier-Verläufe werden adaptiv mit
0,2 m maximaler Schrittweite und 0,002 m Sehnenabweichung abgetastet.
`src/overlay.ts` verwendet Clipper 6.4.2 mit Ganzzahlkoordinaten auf einem
10-nm-Raster relativ zu einem lokalen Ursprung. Dadurch bleiben gemeinsame
Ränder auch nach wiederholter Teilung/Umkehr numerisch zusammenhängend.
Der Adapter erhält Loch-/Inselverschachtelung und lehnt Koordinaten außerhalb
seines sicheren Ganzzahlbereichs ausdrücklich ab (maximal 2⁵¹ Rastereinheiten
Abstand zum lokalen Ursprung); er begrenzt keine Breiten oder Radien still.
Glatte zusammengesetzte Verläufe liefern durchgehende Seitenränder, keine
künstlichen Endkappen oder Distanzränder an internen Teilungsankern. Die
Kontinuitätserkennung berücksichtigt Gleitkomma-Fehler aus Weltkoordinaten,
Tangentenlänge und fortgepflanztem Seitenversatz; sie verändert weder Mittellinien noch Knotenidentitäten.
Auch bei stationären Bézier-Endableitungen verwenden Darstellung und
Fehlerabschätzung dieselbe analytische einseitige Grenztangente.
Radien berühren die tatsächlichen polygonisierten Ränder, auch bei veränderlicher
Breite. Die Kandidatensuche berücksichtigt verschobene Kanten **und** die
Kreisorte um innere Randvertices, damit Formerhaltungs-Teilungen die
Erfüllbarkeit nicht durch anders liegende Abtastpunkte verändern. Vertex-Kreisorte
werden auf den Normalkegel beider angrenzender Kanten begrenzt; alle Kandidaten
müssen den tatsächlichen Abstand zu beiden vollständigen Flanken einhalten. Ihre verdeckten Flanken überlappen nur das bereits vorhandene Innere
der Wegstreifen; die freiliegenden Kreise und Tangentialpunkte bleiben unverändert. Die lokale Kreisergänzung wird mit den Streifen vereinigt; kein globaler Puffer.
Polygon-Clipping erhält getrennte Außenflächen, konkave Konturen und Löcher.

`src/view.ts` trianguliert ausschließlich diese Ringe einschließlich Löchern.
Draufsicht und räumliche Ansicht verwenden dasselbe Three.js-Mesh.
Es gibt keine zweite Kollisions- oder Renderflächenrechnung.

## Prüfen

```sh
npm ci
npx playwright install chromium
npm run check
```

`check` führt Formatprüfung, Typprüfung, Produktionsbuild, Geometrieprüfungen und
echtes Chromium/WebGL aus. Einzelbefehle: `npm run typecheck`, `npm run build`,
`npm test`, `npm run test:browser`. CI verwendet dieselben Prüfungen.
[Feste Abnahme](ACCEPTANCE.md) · [Baseline/Iterationen/Nachweise](evidence/iterations.md).

## Grenzen

Polygonisierte, keine symbolisch exakten Offsetkurven. Sehr enge Kurven mit
gefalteten Rändern werden gemeldet und vereinigt; vor fachlicher Weiterverwendung
korrigieren. Nicht erfüllbare Kreise bleiben explizit ungeglättet.
Unverbundene Überschneidungen sind rot markiert: geometrische Vereinigung ist
**keine** automatische Graphverbindung und erfindet keine Überführung.
Die Sperrfläche bildet eine spätere Grundlage für Gebäudeausrichtung;
Restfläche ist nicht automatisch genehmigtes Bauland. Keine Stadt-/Hausplanung.
Desktopbedienung mit Maus/Tastatur; kein zugesagter Touch-/Mobilworkflow.
