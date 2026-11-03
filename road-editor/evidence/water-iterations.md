# Wasser als zusätzliche Flächensperre

> Historischer Zwischenstand der ersten Wasser-Erweiterung. Der aktuelle gemeinsame
> Zeichenablauf ist im [README](../README.md) und im
> [Vektor-Nachweis](vectors-iterations.md) beschrieben; offene Wasserpfade sind dort
> bereits breite Streifen statt unverbindlicher Konturentwürfe.

Lokale Erweiterung nach der Nutzeranforderung, Wasser als weiteren Area-Blocker
hinzuzufügen. Die bestehende Breitenkopplung sowie alle Wegeprüfungen bleiben erhalten.
Kein neuer Variantenkatalog, keine Haus- oder Stadtintegration.

## Baseline und Umsetzung

- Neue W01–W08-Geometrieprüfungen vor der Implementierung ausgeführt:
  sieben fehlgeschlagen. W07 bestand zunächst nur, weil Formatversion 2 insgesamt
  abgelehnt wurde; das war noch kein Nachweis einer Wasser-Konturvalidierung.
- W09/W10 im echten Chromium vor der UI-Änderung: beide fehlgeschlagen,
  da der Zeichenmodus für Wasser noch fehlte.
- Eigenständiges `src/blockers.ts` validiert einfache, konkave Polygonkonturen und
  innere, disjunkte Inselkonturen. Graphversion 2 speichert `areaBlockers`; alte
  Version-1-Wegnetze bleiben ladbar. Punkte der Wasserflächen sind keine Wegknoten.
- Die Geometrie vereinigt Wege und Wasser als Bausperre. Die sichtbaren horizontalen
  Renderflächen sind disjunkt, damit Überlappungen nicht doppelt gezählt werden.
  Wasser liegt 1,4 m tiefer, einschließlich senkrechter Ufer und echter Insel-Löcher.
- Zeichnen bis zum Schließen bleibt ein Entwurf; Abbrechen verändert das Netz nicht.
  Geschlossene Flächen, Punktänderungen, Löschen und Inseln sind undo-/JSON-fähig.
- Zusätzlicher W11-Browserrepro zuerst rot: Nach Undo einer Insel blieb die Auswahl
  ihres entfernten Rings bestehen. Auswahl und Zeichenmodus werden nun gegen die
  tatsächlich noch vorhandene Wasserfläche und deren Ringe abgeglichen.

## Ausgeführte Abschlussprüfungen

Ab `road-editor/`:

```sh
npm run format:check
npm run build
npm test
npm run test:browser -- --output=/tmp/wegwerk-water-final
```

Ergebnis: Format und TypeScript/Produktionsbuild erfolgreich; **41/41 fachliche
Tests und 11/11 Chromium/WebGL-Abläufe bestanden**, ohne erfasste Console- oder
Runtimefehler. Die unveränderten Wege- und Breitenkopplungsregressionen sind enthalten.
Analytische Wasser-/Wegekontrollen prüfen unter anderem 520 m² gemeinsame Fläche
bei 240 m² Weg, 400 m² Wasser und 120 m² Überlappung sowie 504 m² mit einer Insel.

W09/W10 erzeugen tatsächlich angesehene Ansichten `water-area.png` und
`water-island-3d.png` in ihren Unterordnern des genannten temporären
Playwright-Ausgabeverzeichnisses. Wasserfarbe und Höhen werden zusätzlich an
Material und Meshvertices geprüft; Screenshots allein sind kein Verhaltenstest.
Die Sichtprüfung ist subjektiv: blaue Gewässer, editierbare Ufer und abgesenkte
Oberfläche mit freiem Inselbereich sind lesbar.

Vite weist weiterhin auf den einzelnen JS-Chunk über 500 kB hin; die Warnschwelle
wurde nicht verändert. Kein Performanceziel, keine CI-/PR-/Merge-Abnahme für diese
lokale Erweiterung behauptet.

## Grenzen

Geradlinige Polygonufer, keine Bézier-Ufer oder Fluss-Mittellinien mit Breitenprofil.
Inseln müssen innerhalb eines Gewässers liegen und dürfen einander oder das Ufer
nicht berühren. Das Freibleiben einer Insel ist noch kein Baurecht. Keine
Wassersimulation, keine Hausplatzierung und keine Änderung des Rust-/Archivcodes.
