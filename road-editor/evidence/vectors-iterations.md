# Gemeinsame Vektoren für Weg und Wasser

Lokale Umsetzung der geänderten Zeichenvorgabe: beide Materialien verwenden
dieselben Geraden und Bézier-Kurven. Offen belegt die Breite einen Streifen;
ausdrücklich geschlossen belegt das Innere die Fläche ohne Breitenparameter.
Bedienung und Formatreferenz: [README](../README.md).
Feste Prüfeigenschaften: [Abnahme](../ACCEPTANCE.md).

## Umsetzung und gefundene Fehler

- `src/curves.ts` enthält gemeinsame Kurvenauswertung, Ableitung, adaptive
  Polygonisierung und exakte De-Casteljau-Teilung. Offene Netzpfade und
  gefüllte Außen-/Inselkonturen verwenden dieselben Kurventypen.
- Ein Zeichenwerkzeug mit Material- und Segmentwahl ersetzt den getrennten
  Wasser-Zeichenmodus. Gemeinsame Anker-/Griffbearbeitung gilt für beide Materialien.
  Schließen konvertiert den Pfad in eine Kontur, Öffnen entfernt das Schließsegment
  und erzeugt einen Pfad mit zunächst gekoppelten 4 m Breite.
- Version 3 speichert Material und Kurvenkanten; Versionen 1/2 bleiben ladbar.
  Geometrie und lokale Abrundungen werden je Material berechnet und anschließend
  zur tatsächlichen Sperrfläche vereinigt. Wasser bleibt abgesenkt.
- V01–V10 deckten zunächst fehlende Material-/Konturunterstützung auf. Bei der
  Umsetzung schlugen V03/V04 noch fehl: eine unnötige zweite Union änderte die
  Ringdarstellung und wurde entfernt; V04 enthielt einen falschen analytischen
  Sollwert. Für dessen 40-m-Fixture mit `y(t)=40t(1-t)` sind es 800/3 m²,
  nicht 400/3 m². Der korrigierte Sollwert ist im Test hergeleitet.
- Ein zusätzlicher negativer V10-Fall war zunächst rot: eine explizite
  `null`-Kurvenkante wurde als Gerade behandelt. Nur eine vollständig fehlende
  Kantenliste darf jetzt zu Geraden ergänzt werden; ungültige Einträge werden
  vor Import/Rendering abgelehnt.
- W09/W11 wurden an die ausdrücklich geänderte Semantik angepasst: offenes
  Beenden behält den Wasserstreifen, ungültiges Schließen behält den gültigen
  offenen Vektor. Die bisherigen geometrischen Assertions und Toleranzen wurden
  nicht gelockert.

## Lokale Schlussprüfung

Ausgeführt in `road-editor/`:

```sh
npm run format:check
npm run build
npm test
npm run test:browser -- --output=/tmp/wegwerk-vectors-final
```

- Format, TypeScript und Produktionsbuild erfolgreich.
- 53/53 Geometrieprüfungen einschließlich der bestehenden Netz-/Wasserprüfungen.
  Neue unabhängige Flächenproben, exakte Kurven-Teilungsproben und metamorphische
  Prüfungen für Bewegung, Orientierung und Materialwechsel.
- 14/14 echte Chromium/WebGL-Abläufe erfolgreich, ohne Console-/Runtimefehler.
  Unter anderem beide Materialien mit allen Segmenttypen, Breitenänderung,
  Flächenfüllung, ausgeblendete Breitenfelder, echtes Griffziehen,
  formerhaltendes Kurveneinfügen, numerische Griffe, Inseln, Undo/Redo,
  Öffnen sowie Altformat- und JSON-Roundtrips.
- Der bekannte Vite-Hinweis zum JavaScript-Chunk über 500 kB bleibt bestehen.
  Keine Leistungsverbesserung behauptet.

Die Browserläufe erzeugen `filled-road.png`, `filled-water.png`,
`curved-island.png` und die Wassernachweise in Unterordnern des angegebenen
Ausgabeverzeichnisses. Bilder ergänzen die tatsächlichen Interaktionen und
Geometrieassertions; sie sind kein eigener Korrektheitsnachweis.
Historische, von alten Browsertests überschriebene Evidence-PNGs werden nicht als
neue Belege ausgegeben.

Dies sind endliche lokale Prüfungen, kein Beweis für den gesamten kontinuierlichen
Parameterraum. Für diese Erweiterung wurden keine CI-, unabhängige Review- oder
Merge-Ergebnisse behauptet.
