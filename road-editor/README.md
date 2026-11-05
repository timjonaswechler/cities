# Wegwerk — parametrischer Wegeditor

Eigenständige Browserwerkbank in TypeScript/Three.js, neu implementiert statt
Fortsetzung der verworfenen Hausgalerie. Wege, Straßen und Wasser verwenden
dieselben Vektoren: offen mit Breite, ausdrücklich geschlossen als gefüllte
Fläche ohne Breitenparameter. Das Material ist eine Einstellung, kein Szenariotyp.
Ein neues, getrenntes Hausmodul zeigt Satteldach-Varianten auf einem manuell
markierten Bauplatz. Keine Nachbarblocker, automatische Parzellierung oder
Rust-/Archiv-Integration.

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

- Material **Weg/Wasser** und Segmenttyp **Gerade/Quadratisch/Kubisch** wählen,
  dann **Zeichnen** und Start/Endpunkte klicken. Weitere Klicks erweitern denselben
  Vektor; der Segmenttyp darf wechseln. **Esc/Enter/Auswählen** beendet ihn offen.
  Am ersten Anker klicken oder **Pfad schließen** füllt stattdessen sein Inneres.
  Bei offenen Pfaden docken nahe Anker und Mittellinien desselben Materials an;
  Mittellinien werden dabei formerhaltend geteilt. Wasser dockt nicht automatisch
  an Wegknoten an.
- **Offenen** Vektor auswählen; Breiten am Anfang/Ende numerisch eingeben.
  Gleiche Werte bedeuten konstante Breite, sonst linear über gesamte Bogenlänge.
  Das **Kettensymbol** zwischen den Feldern koppelt beide Breiten: Beim Einschalten
  wird die Anfangsbreite für beide übernommen; danach ändert jedes Feld beide Werte.
  Erneutes Klicken löst die Kopplung, ohne die Werte zu ändern. Die Einstellung gilt
  pro Pfad, ist undo-fähig und wird im Graph-JSON gespeichert; ältere Dateien ohne
  diese Einstellung bleiben entkoppelt.
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
  Graphen mit IDs, Segmenten, Griffen, Breiten, Radien und gefüllten Konturen — keine
  abgeleiteten Meshes. Ungültige Importe/Parameter ersetzen nicht den letzten
  gültigen Graphen.

## Offene Vektoren und gefüllte Konturen

Für beide Materialien gilt dieselbe Regel: Ein **offener Vektor** belegt den
Streifen seiner Breite; eine **geschlossene Kontur** belegt ihr Inneres ohne
Breitenangabe. Gerade, quadratische und kubische Segmente können gemischt werden.
Eine Kurvenkontur kann mit zwei Ankern eine Fläche einschließen; degenerierte
oder selbstschneidende Konturen werden nicht übernommen.

1. Vektor zeichnen und am Startanker oder mit **Pfad schließen** schließen.
   Das Schließen ist ein eigener Undo-Schritt. Bei ungültiger Kontur bleibt der
   letzte gültige offene Vektor erhalten, einschließlich seiner Breite.
2. Fläche anklicken. Anker ziehen oder deren XY-Werte eingeben. Nach Ankerwahl
   bestimmt **Kontursegment** den Typ der folgenden Kante. Blaue Kontrollgriffe
   ziehen oder ihre XY-Werte bearbeiten — genauso wie an offenen Vektoren.
   **Punkt einfügen** teilt die folgende Kurve exakt mit De Casteljau;
   **Punkt entfernen** verbindet die Nachbarn geradlinig.
3. **Insel aussparen** bei Wasser bzw. **Aussparung zeichnen** bei Wegen zeichnet
   mit denselben Segmenttypen eine innere Kontur. Am Startanker, mit **Enter**
   oder **Fläche schließen** abschließen. Bis dahin ist sie ein Entwurf:
   **Esc/Abbrechen** verwirft ihn, Undo entfernt den letzten Entwurfsanker.
   Die gültige Aussparung wird als ein Undo-Schritt übernommen. Sie ist ein echtes
   Loch und lässt sich ebenfalls mit Ankern und Griffen bearbeiten.
4. **Kontur öffnen** entfernt das Schließsegment und macht daraus wieder einen
   offenen Vektor mit zunächst gekoppelten 4 m Breite. Vorher Aussparungen entfernen.
   Löschen und Undo/Redo gelten unabhängig für die gewählte Fläche.

Wasser ist blau, seine Oberfläche liegt 1,4 m unter der Wegeebene. Die räumliche
Ansicht zeigt senkrechte Ufer. Wege und Wasser bilden gemeinsam die Sperrfläche;
Überlappungen werden nicht doppelt gezählt. Ein Weg über einer Insel bleibt
gesperrt, der übrige Inselbereich ist nicht automatisch Bauland. Überlappende
Konturen vereinigen sich in der Auswertung, bleiben getrennt editierbar.

Inseln/Aussparungen dürfen das äußere Ufer nicht berühren, nicht außerhalb liegen
und einander nicht überlappen oder verschachteln. Ungültige Änderungen und Importe
ersetzen den letzten gültigen Zustand nicht. Keine Wassersimulation.

Alte Netzringe bleiben Streifen: Ein Zyklus aus verbundenen Wegabschnitten
füllt nicht automatisch seinen Innenbereich. **Pfad schließen** wandelt einen
gewählten Pfad ausdrücklich zur gefüllten Kontur um.
[Begriffe](../GLOSSARY.md).

## Hausvarianten auf einem Bauplatz

1. Einen Weg zeichnen und mit Esc beenden. Unter **Haus am Bauplatz** auf
   **Bauplatz markieren** klicken und zwei gegenüberliegende Ecken setzen.
   Zunächst einen rechteckigen Platz neben einem geraden Weg verwenden.
2. Danach den gewünschten **Wegrand** anklicken; nicht die Mittellinie und
   nicht das Wasser. **Zugang wählen** ändert diesen Punkt später erneut.
3. **Hausvariante** schaltet bis zu drei passende Satteldachhäuser um:
   4 × 6 m/eingeschossig, 6 × 8 m/zweigeschossig, 8 × 5 m/eingeschossig.
   Proportionen und Firstrichtung unterscheiden sich. **Haus-Seed** verändert
   die reproduzierbare Platzierungssuche. Draufsicht und **3D prüfen** zeigen
   denselben Baukörper. Weniger Treffer und Ablehnungsgründe bleiben sichtbar.
4. **Haus übernehmen** fixiert genau diesen Vorschlag. Zum erneuten Vergleichen
   erst **Haus entfernen**; Undo stellt ihn wieder her. Neue Bauplatzecken oder
   ein neuer Zugang erhalten das übernommene Haus und prüfen es erneut.
5. Änderungen an Wegen und Wasser prüfen das konkrete Haus ebenfalls erneut:
   Konflikte erscheinen rot und als Text, statt das Haus still zu ersetzen.
   **Bauplatz löschen** entfernt Platz und Haus. Undo/Redo und JSON speichern
   Bauplatz, Zugang, Seed, Variantenauswahl und übernommenes Haus.

Die vollständige Dachhülle muss in den Bauplatz passen und mindestens 0,5 m
Abstand zu Weg und Wasser halten. Der gerade Zugang ist 1,2 m breit, höchstens
12 m lang und darf kein Wasser oder dazwischenliegende Wege queren. Diese
Versuchswerte sind keine historischen Normen. Die endliche Suche prüft höchstens
27 Platzierungen je Profil; kein Treffer beweist nicht, dass kein Haus möglich ist.
Es gibt zunächst genau einen achsenparallelen Bauplatz, keine Grundstücksautomatik,
Nachbarhäuser, Innenräume, Anbauten oder Fassadendetails.

Das Hausmodul erhält nur Baufläche, Zugang, getrennte Sperrflächen und Seed;
`house-project.ts` adaptiert die bestehende Wege-/Wassergeometrie. `houses.ts`
erzeugt und prüft die Hausbeschreibung; `houseGeometry` ist zugleich Grundlage
der Three.js-Darstellung. Projekte mit Bauplatz verwenden JSON-Version 4.
Versionen 1–3 bleiben ladbar; abgeleitete Vorschläge und Meshes werden nicht gespeichert.
[Checkliste](HOUSE-CHECKLIST.md) · [Feste Hausprüffälle](HOUSE-ACCEPTANCE.md).

## Geometrie-Interface

`src/network.ts`: `Network`, `parse/serialize`, Graphbearbeitung und `History`.
Maße in Metern, XY in der Ebene. Neue Projekte verwenden Version 3:

- Offene Vektoren sind `paths` mit `kind: "road" | "water"`, Segmenten und Breiten.
  Fehlendes Material bedeutet weiterhin Weg.
- Gefüllte Konturen sind `areaBlockers: {id, kind, outer, holes?, outerEdges?, holeEdges?}`.
  Ankerlisten sind umlaufend ohne wiederholten Endpunkt. Optional beschreibt
  jede Kante einen `Curve`-Wert; ohne Kantenliste sind die Kanten gerade.
- `src/curves.ts` definiert dieselbe Linien-/Bézier-Geometrie, adaptive Abtastung
  und exakte Teilung für offene Pfade, Außenkonturen und Aussparungen.
  `closePath/openArea` konvertieren die Quellgeometrie; Schließen entfernt keine
  Knoten, die noch von einem anderen Pfad verwendet werden.

Version-1-Wegnetze und Version-2-Polygongewässer bleiben ladbar. Neue Materialien
und Kurvenkonturen benötigen Version 3; entsprechende Bearbeitungen aktualisieren
die Version. Version 1 mit Flächensperren und alte Versionen mit neuen Kurvenfeldern
werden ausdrücklich abgelehnt.
Eine Arm-ID besteht aus Pfad-ID, Segmentindex und `start/end`.
Knotenidentität ist explizit, Koordinatengleichheit erzeugt keine Verbindung.

`src/geometry.ts` ist unabhängig von Editor, DOM und Three.js:

- `computeSurface(network)` liefert `areas: {outer, holes}[]`, Radiusentscheidungen,
  Topologiekonflikte und Geometriehinweise. Ringe sind umlaufend, ohne wiederholten
  Endpunkt; ihre Kanten bilden die Randverläufe. `areas` ist die gemeinsame
  Sperrfläche von Wegen und Wasser. `roadAreas` enthält die Wege;
  `water.areas` die vereinigten Gewässer und `water.visibleAreas` deren nicht von
  Wegen verdeckte Teile. `water.drop` ist die Absenkung in Metern.
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

`src/view.ts` trianguliert die ausgegebenen Wege- und sichtbaren Wasserringe
inklusive Löchern. Ihre disjunkten Grundflächen ergeben zusammen dieselbe
Sperrfläche ohne Doppelzählung. Wasser wird abgesenkt und um senkrechte Ufer
ergänzt; diese ändern die Grundfläche nicht. Draufsicht und räumliche Ansicht
verwenden dieselben Three.js-Meshes, keine zweite Kollisionsflächenrechnung.

## Prüfen

```sh
npm ci
npx playwright install chromium
npm run check
```

`check` führt Formatprüfung, Typprüfung, Produktionsbuild, Geometrieprüfungen und
echtes Chromium/WebGL aus. Einzelbefehle: `npm run typecheck`, `npm run build`,
`npm test`, `npm run test:browser`. CI verwendet dieselben Prüfungen.
[Feste Abnahme](ACCEPTANCE.md) · [Baseline/Iterationen/Nachweise](evidence/iterations.md) ·
[Wasser-Erweiterung](evidence/water-iterations.md) ·
[Gemeinsame Vektoren und Prüfungen](evidence/vectors-iterations.md).

## Grenzen

Polygonisierte, keine symbolisch exakten Offsetkurven. Sehr enge Kurven mit
gefalteten Rändern werden gemeldet und vereinigt; vor fachlicher Weiterverwendung
korrigieren. Nicht erfüllbare Kreise bleiben explizit ungeglättet.
Unverbundene Überschneidungen sind rot markiert: geometrische Vereinigung ist
**keine** automatische Graphverbindung und erfindet keine Überführung.
Die Sperrfläche bildet eine spätere Grundlage für Gebäudeausrichtung;
Restfläche ist nicht automatisch genehmigtes Bauland. Keine automatische
Stadtplanung; Hausvorschläge benötigen den ausdrücklich markierten Bauplatz.
Desktopbedienung mit Maus/Tastatur; kein zugesagter Touch-/Mobilworkflow.
