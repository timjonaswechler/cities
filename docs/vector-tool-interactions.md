# Vektorinteraktionen: kleine Übernahme statt Editor-Neubau

Ziel: etablierte **Vektorbedienung** übernehmen, getrennt von Materialwahl,
Straßen-/Wasserplatzierung und fachlicher Flächenlogik. Keine Hausfunktionen.
Dies ist Dokumentationsrecherche, kein Praxistest der drei Programme.
Die dokumentierten Muster sind von unserer Umsetzung zu unterscheiden. Der erste
umgesetzte Interaktionsschritt ist unten separat beschrieben.

## Dokumentierte Muster

- **Auswahl ≠ Punkte bearbeiten.** Penpot: Objekt auswählen, Doppelklick oder
  Enter öffnet die Punktbearbeitung; darin getrennt „Move nodes“ und „Draw nodes“.
  Figma: ausgewählte Vektoren mit Enter bearbeiten, darin Move für Punkte und Pen
  zum Ergänzen. Inkscape hat dafür ein eigenes Knotenwerkzeug. [P1, F1, I2]
- **Pen: Klick setzt eine Ecke, Ziehen erzeugt Griffe/Krümmung.** Das beschreiben
  alle drei. Penpot erlaubt ausdrücklich die Fortsetzung eines bestehenden
  offenen Endpunkts: im Move-Modus wählen und zu Draw wechseln oder im Draw-Modus
  anklicken. Figma dokumentiert Ergänzen im Vektoreditor und verzweigende Netze;
  daraus folgt nicht automatisch dieselbe Endpunkt-/Fortsetzungsgeste. [P1, F1, F2, I1]
- **Griffkopplung ist nicht nur „gerade/kurvig“.** Figma unterscheidet unabhängig,
  Winkel spiegeln sowie Winkel und Länge spiegeln. Inkscape nennt die entsprechenden
  Grundformen cusp, smooth (kollinear) und symmetric (zusätzlich gleich lang),
  daneben auto-smooth. Eine Ecke kann also weiterhin unabhängige Kurvengriffe
  besitzen. Penpots gelesene Seite beschreibt nur corner/curve; daraus keine
  identische Dreifachkopplung ableiten. [F1, I3, P1]
- **Abschließen, Schließen und Abbrechen unterscheiden:**
  - Penpot: Startpunkt anklicken schließt; Esc **oder Enter** beendet offen;
    weiteres Esc verlässt den Editiermodus. [P1]
  - Figma: Klick auf einen anderen vorhandenen Netzpunkt kann schließen, mit
    Kreisindikator am Cursor; Esc lässt offen und hebt die Netzauswahl auf. [F2]
  - Inkscape: Enter/Rechtsklick beendet ohne letztes unfertiges Segment;
    Shift+Enter schließt. Esc heißt in der Tastaturreferenz ausdrücklich
    „cancel current line“, nicht „offen fertigstellen“. [I1, I5]
- **Segment teilen heißt zunächst Punkt einfügen, nicht Verbindung lösen.**
  Penpot: Alt/Option+Klick auf Segment im Move-Modus; Inkscape: Doppelklick mit
  Knotenwerkzeug. Inkscape führt „Break path“ separat: zwei unverbundene Endpunkte
  am selben Ort. Figma erlaubt mit Pen weitere Punkte entlang eines Pfades;
  keine zusätzliche, hier unbelegte Split-Taste übernehmen. [P1, I4, F1]
- **Modifier sind werkzeugabhängig, kein universeller Standard.** Penpot: Shift
  beim Zeichnen für 15°-Schritte, Knotensnapping standardmäßig an; dessen Schalter
  ist Ctrl/⌘+`'`. Inkscape Pen: Ctrl für Winkelschritte (Standard 15°), Shift beim
  Erzeugen eines Bézierknotens bewegt nur einen Griff. Figma dokumentiert Control
  zum temporären Abschalten des Pixelrasters bei der Breitenbearbeitung — kein
  Beleg für eine allgemeine Pen-Snapping-Regel. [P1, P2, I5, F1]

## Jetzt: ein Slice „Pen-Klick/Ziehen“

**Empfehlung, bewusst nicht der gesamte obige Funktionskatalog:**

1. Klick setzt einen Anker ohne neu herausgezogene Griffe; ohne angrenzende Griffe
   entsteht eine Gerade. Ziehen am neuen Anker bestimmt Tangente und Grifflänge
   statt einer willkürlichen, vorgeformten Kurve. Währenddessen Vorschau, erst beim
   Loslassen übernehmen; eine Geste bleibt ein Undo-Schritt.
2. Weitere Klicks/Ziehgesten setzen denselben aktiven Pfad fort. Wiederaufnahme
   alter Pfade, Verzweigungen und Segmentteilung bekommen in diesem Slice keine
   neuen Gesten.
3. Enter beendet offen. Esc verwirft eine laufende, noch nicht übernommene
   Ziehgeste; ansonsten beendet es offen und wechselt zur Auswahl, ohne bereits
   gesetzte Segmente zu löschen. Das ist **unsere Anpassung**, nicht Inkscapes
   Abbruchvertrag. Bestehende Aussparungsentwürfe behalten ihren eigenen Abbruch.
4. Bestehende Punkt-/Griffbearbeitung weiterverwenden. Gekoppelte Griffe dürfen beim
   Erzeugen symmetrisch initialisiert werden; danach bleiben sie unabhängig.
   Keine dauerhafte „Smooth“-Eigenschaft versprechen, solange sie nicht modelliert
   ist. Explizite Objekt-/Punktmodus-Trennung ist ein eigener Folgeslice, kein
   Anlass für Bounding-Box-, Ebenen- oder Toolbar-Neubau.

## Bewusste Anpassung an die vorhandene Quelle

Geprüft: [Editor-README](../road-editor/README.md),
[`main.ts`](../road-editor/src/main.ts), [`curves.ts`](../road-editor/src/curves.ts),
[`network.ts`](../road-editor/src/network.ts).

- **Quelle bleibt `Network`, nicht das Mesh.** Segmente besitzen eigene absolute
  Kontrollpunkte. Vor dieser Änderung verschob `moveNode` nur den Knoten;
  jetzt folgen die angrenzenden kubischen Griffe dem Anker. Gemeinsame
  Knotenidentität betrifft weiterhin mehrere Pfade. Keine implizite Glättung aller Arme,
  kein Verbinden allein durch gleiche Koordinaten. Figma erlaubt Verzweigungen;
  Inkscapes Pfadmodell dagegen höchstens zwei Nachbarn pro Knoten. [F2, I2]
- **Kubisch passt zum Zwei-Griff-Pen.** `Curve` unterstützt auch Gerade und
  Quadratik; deren einzelner Kontrollpunkt ist kein unabhängiges Griffpaar.
  Für neue Pen-Kurven kubische Segmente verwenden; bestehende Quadratik nicht
  still umdeuten. Dauerhafte Winkel-/Längenkopplung wäre zusätzliche Modellarbeit.
- **Streifen ≠ Füllung.** Hier sind offene `paths` breite Streifen; `closePath`
  konvertiert ausdrücklich zu `areaBlockers` ohne Breite. Figma hat dagegen
  Stroke/Fill und separat füllbare geschlossene Netzregionen. Deshalb bleibt
  „Als Fläche schließen“ eine erkennbare Fachoperation, auch beim Startpunktklick;
  andere Netzknoten oder bloße Zyklen dürfen keine automatische Füllung auslösen.
- **Teilen nicht neu erfinden:** `splitCurve`/`splitSegment` erhalten die
  Quellkurve per De Casteljau; später kann eine Einfügegeste darauf aufsetzen.
  Teilung, Anschluss und Flächenkonvertierung bleiben unterschiedliche Operationen.

## Grenzen und Validierung

Keine Häuser, Parzellen, Platzierungsregeln, neuen Road-/Water-Spezialwerkzeuge,
Figma-Netz-/Paint-Kopie, Auto-Smooth, vollständigen Shortcut-Sätze oder fremden
Assets/Quellcode übernehmen. Nur Interaktionskonventionen adaptieren.

Originalseiten wurden abgerufen und gelesen; Suchzusammenfassungen sind keine
Belege. Nicht im Rahmen der Quellenrecherche geprüft: reale Bedienung der fremden
Programme, aktuelle installierte Produktversionen und Tastaturlayout-/OS-Konflikte. Inkscapes HTML-Tastenreferenz
lieferte HTTP 403; stattdessen wurde ihre offizielle XML-Quelle gelesen. Eine
exakte Inkscape-Geste zum Wiederaufnehmen bestehender Endpunkte ist hier nicht
belegt. Vor Abnahme des Slices im Browser prüfen: Klick/Ziehen, Gerade nach Kurve,
Esc während Ziehen, offenes Fertigstellen, Undo sowie unveränderte bestehende
Quadratiken und ausdrückliche Flächenkonvertierung. Keine Implementierungstests
im Rahmen dieser Recherche.

## Umsetzung im eigenen Editor

Zunächst auf `feat/vector-interactions` erprobt, anschließend auf Wunsch in
`feat/house-variants` für PR #7 übernommen. Vektorbedienung und fachliche
Haus-/Bauplatzregeln bleiben getrennt:
Standard-Stift mit Klick/Ziehen und Live-Vorschau, P/V, offenes Beenden,
Abbruch der laufenden Geste, erster Punkt als nicht gespeicherter Entwurf,
Schließen mit den tatsächlich gezogenen Griffen und dieselben Gesten für
Aussparungen. Beim Verschieben kubischer Anker folgen die zugehörigen Griffe
in offenen Pfaden, Außenkonturen und Aussparungen; alte Quadratiken behalten
ihren einzelnen unabhängigen Kontrollpunkt. Keine dauerhafte Griffkopplung.

Browserprüfung mit echten Maus-/Tastaturereignissen: Kurve nach Griffbewegung,
Gerade nach Ecke, Esc während Ziehen, keine verwaisten Startknoten, Undo/Redo,
Schließen beider Materialien und kurvige Aussparung. Beim zusätzlichen
Ankerverschieben blieb zunächst der Griff zurück; dieser Ablauf schlug
nachweislich fehl und besteht nach der Korrektur. Auch Weiterzeichnen nach
Undo/Redo verlor zunächst den aktiven Pfad; dieser Ablauf wurde reproduziert
und korrigiert, ohne alte Pfade automatisch wieder zu öffnen. In den Browseraufnahmen fiel
außerdem auf, dass der Leerflächenhinweis die laufende Vorschau überlagerte;
er wird jetzt ab dem ersten Entwurf ausgeblendet. Screenshots wurden angesehen,
nicht nur erzeugt. Das ist eine technische und subjektive Sichtung des eigenen
Editors, keine vollständige Usability-Abnahme oder Bedienung der Fremdprodukte.

Prüfbefehle in `road-editor/`: `npm run format:check`, `npm run build`, `npm test`
und Playwright gegen den eigenen Vite-Prozess. Für die lokale Prüfung wurde
zunächst Port 5188 genutzt. Die anschließende Integration mit dem Haus-Editor
wurde auf Port 5189 geprüft, ohne die laufenden Entwicklungsserver zu stoppen.
Die üblichen CI-Prüfungen bleiben auf dem bestehenden Port. Der gemeinsame
Zeichenadapter erhält die Formatversion 4 bestehender Hausprojekte; neue
Pen-/Festtyp-Pfade, Undo/Redo und der Wechsel zurück zur Bauplatzauswahl werden
zusammen geprüft.

Bewusst offen bleiben getrennte Objekt-/Punktauswahl, Mehrfachauswahl,
Fortsetzung alter Pfade per Endpunktklick, gekoppelte Smooth-/Corner-Knoten,
Schritt-/Winkelsnapping und ein Neuaufbau der gesamten Toolbar. Die übrigen
Funktionen der Referenzprogramme wurden nicht als bereits unterstützt dargestellt.

## Primärquellen

- [P1: Penpot – Layers, insbesondere Paths/Edit nodes](https://help.penpot.app/user-guide/designing/layers/)
- [P2: Penpot – Shortcuts, Path editor](https://help.penpot.app/user-guide/first-steps/shortcuts/)
- [F1: Figma – Edit vector layers](https://help.figma.com/hc/en-us/articles/360039957634-Edit-vector-layers)
- [F2: Figma – Vector networks](https://help.figma.com/hc/en-us/articles/360040450213-Vector-networks)
- [I1: Inkscape – Pen Tool](https://inkscape-manuals.readthedocs.io/en/latest/pen-tool.html)
- [I2: Inkscape – Editing Paths](https://inkscape-manuals.readthedocs.io/en/latest/editing-paths.html)
- [I3: Inkscape – Node Types](https://inkscape-manuals.readthedocs.io/en/latest/node-types.html)
- [I4: Inkscape – Node Tool Options](https://inkscape-manuals.readthedocs.io/en/latest/node-operations.html)
- [I5: Inkscape – offizielle Tastatur-/Mausreferenz, XML, Abschnitt Pen (Bezier) tool](https://gitlab.com/inkscape/inkscape-docs/documentation/-/raw/master/keys/keys.xml)
