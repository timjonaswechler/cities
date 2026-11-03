# Hauslabor · Mittelalter-Fantasy-Blockouts

Eigenständige Browsergalerie mit TypeScript und Three.js. Sie erzeugt **einzelne 3D-Hausformen im lokalen Kontext**, keinen Stadtplan. Alle Szenarien sind synthetisch; weder Rust-Code noch Daten des archivierten Stadtgenerators werden übernommen.

## Starten

Voraussetzung: Node.js ≥22.12 und npm. Geprüfte lokale Umgebung: Node 26.7.0.

```sh
cd house-gallery
npm ci
npm run dev
```

Die ausgegebene lokale Adresse öffnen, standardmäßig `http://127.0.0.1:5173`. Die Anwendung braucht WebGL und einen aktuellen Browser. Keine externen Texturen, Schriftarten, Modelle oder Laufzeitdienste.

```sh
npm run build
npm run preview
```

Der Produktionsbuild liegt in `dist/` und lässt sich auf einem statischen Webhost unter einem beliebigen Verzeichnispfad bereitstellen. Der Browser lädt nur diese Dateien, nicht `node_modules/`. Der lokale Build enthält ungefähr 665 kB JavaScript, etwa 174 kB gzip; exakte Werte stehen im jeweiligen Vite-Buildprotokoll. Der größere Vite-Chunk wird nicht durch angehobene Warnschwellen versteckt.

## Bedienung

- **Überblick:** zwölf fest ausgewählte Fälle einschließlich eines Grenzfalls. Kein Ersatz für den vollständigen Katalog.
- **Gruppen / Alle Fälle:** sämtliche 9.136 Einträge, zwölf je Seite. Auch abgelehnte Anfragen bleiben sichtbar.
- **Filter:** Straße/Weg und Wassertrassen unabhängig nach **tatsächlich vorhandener** Breite; zusätzlich Nachbarschaft und Textsuche. Neutrale Katalogfaktoren sind keine physischen Filterwerte: Teich-/Uferflächen haben keine Trassenbreite, und eine Freifläche ohne Zugang ist keine 6-m-Straße. Ein Wegzugang wird mit seinen tatsächlichen 1,8→2,8 m angezeigt. Vollständige Fall-IDs mit `~` bleiben direkt suchbar. Filter gelten gemeinsam innerhalb der gewählten Gruppe; Zurücksetzen hebt sie auf.
- **Seed:** ganze Zahl von 0 bis 4294967295, mit Eingabetaste oder Pfeil anwenden. Der Kreispfeil erhöht um eins. Seed, Hausform, Filter und Seite stehen in der URL.
- **Hausform:** lokale Vorauswahl oder Giebelhaus, Stadthaus, Langhaus, Winkelhaus. Die automatische Vorauswahl ist eine Kontextpräferenz, keine erschöpfende Suche über sämtliche Familien.
- **Kamera:** Perspektive und Draufsicht gelten für alle Karten. Eine Karte öffnet eine interaktive Einzelansicht: links ziehen dreht, Mausrad zoomt, rechts ziehen verschiebt. Kamera zurücksetzen stellt die feste Ausgangsansicht wieder her.
- **Blocker sichtbar:** Nachbarn sind rot und tatsächlich teiltransparent. Ausblenden ändert nur das Bild, nicht die Kollisionsprüfung.
- **Prüfhüllen:** gestrichelter Bauraum, vollständige Dachhüllen und Eingangsmarker; keine Fassadendetails.
- **Einzelstudie:** Maße, tatsächliche Nachbarzahl, Zugangsnachweis oder dessen Fehlen, Ablehnungsgrund, stabile ID, PNG, Anfrage/Modell als JSON und kopierbarer Link. Escape schließt Dialoge.
- **Variantenmatrix / Katalog JSON:** sämtliche Faktoren und Kombinationen, nicht nur eine kuratierte Auswahl.

Straßen sind graugrün, Wege sandfarben, geschützte Freiflächen hellocker. Wasser liegt 0,6 / 1,4 / 2,4 m unter dem Hausboden und zeigt eine senkrechte Uferkante. Brücken sind bewusst nur einfache Trassenstreifen auf Bodenniveau.

## Konstruktion und Freiraum

```text
Synthetisches Szenario + Seed + Hausform
  → lokaler Hausgenerator (ohne Three.js)
  → Hausbeschreibung mit vollständigen Dachhüllen oder begründete Ablehnung
  → Three.js-Darstellung
```

Der Generator bestimmt innerhalb zulässiger Proportionen Größe, Geschosse, Position und Ausrichtung. Straßen-/Wegeverlauf und freie Flächen beeinflussen die Platzierung; Wasser und Nachbarn sind echte Sperrflächen. **Auch Dächer und Überstände**, nicht nur Wände, müssen im erlaubten Bauraum bleiben. Ein Zugang wird nur angegeben, wenn der direkte Korridor zur Trasse geprüft ist. Formstudien ohne solchen Nachweis werden ausdrücklich gekennzeichnet.

Die Suche ist endlich: vier Größen, höchstens 180 Positionen je Größe. Eine Ablehnung bedeutet, dass die gewählte Hausform dort nicht gefunden wurde – keinen mathematischen Beweis, dass auf der Fläche überhaupt kein Haus möglich ist. Es gibt keine nachträgliche Stauchung und keinen Wechsel zu einem anderen Seed.

`src/model.ts` beschreibt lokale Daten und Hausmodelle, `generator.ts` konstruiert und prüft, `scenarios.ts` erzeugt den Katalog, `scene.ts` stellt dar, `presentation.ts` leitet Beschriftungen und Filter aus tatsächlichen Flächen ab, `main.ts` bedient die Galerie. Vorschaubilder verwenden einen gemeinsamen WebGL-Kontext statt eines Kontexts pro Karte; die Einzelansicht einen zweiten.

## Prüfen

```sh
npm run typecheck
npm run build
npm test
npx playwright install chromium
npm run test:browser -- --workers=1
# Alle Prüfungen:
npm run check
```

Unter Linux gegebenenfalls `npx playwright install --with-deps chromium`. Playwright startet die Vorschau des Produktionsbuilds selbst; einen bereits vorhandenen Server an Port 4173 nur verwenden, wenn er genau diesen Build bereitstellt.

[ACCEPTANCE.md](ACCEPTANCE.md) friert Matrix, IDs, Seeds, Geometrie-/Topologieeigenschaften, Mutationstests und visuelle Rubrik ein. [Abnahmeprotokoll und Evidenz](../docs/proofs/house-gallery/README.md) trennen Baseline, Fehlerbehebung und tatsächliche Ergebnisse.

## Grenzen

Blockout, keine Ausführungsplanung: keine Fenster, Fassadentexturen, Innenräume, Tragwerks-/Brückenplanung oder Wassersimulation. Ufer sind senkrechte Schnitte in ebenem Gelände. Vier Volumenfamilien sind keine historisch abgenommenen Architekturstile. Straßenanschluss eines Hauses bedeutet nicht, dass das gesamte synthetische Wegenetz bis zu einem Stadttor erreichbar wäre. Die spätere Anbindung an die Stadt ist noch nicht implementiert.
