# Hauslabor: Abnahmeprotokoll

Die verbindlichen Eingaben und Kriterien stehen in [ACCEPTANCE.md](../../../house-gallery/ACCEPTANCE.md). Dies sind beobachtete Ergebnisse dieser Sitzung, keine aus Paket-Skripten abgeleiteten Erfolgsbehauptungen. In Textprotokollen sind ausschließlich nachlaufende Leerzeichen/Leerzeilen entfernt und absolute Checkout-Pfade als `<repo>` normalisiert; Prüfergebnisse und Fall-IDs sind unverändert.

## Baseline B0

Matrix: **9.136 IDs**, SHA-256 der mit Zeilenumbruch verbundenen IDs:
`36795df925cee09365ce22aa2f94d8186c05fd1d7b6044215a649a87c258c7a3`.
Seeds: Gesamtkatalog zweimal mit 42; jede kanonische Form zusätzlich mit 0, 42, 91, 4294967295 und vier Hausformen. Zwölf feste visuelle Fälle, Kamera/Beleuchtung und Rubrik laut Abnahme.

| Prüfung | Beobachtung | Evidenz |
| --- | --- | --- |
| `npm run typecheck` | fehlgeschlagen: zwei Anwendungstypfehler und fünf Typfehler im neuen Mesh-Evaluator | `baseline-typecheck.txt` |
| `npm run build` | wegen derselben Typfehler nicht erfolgreich | `baseline-build.txt` |
| `npm test` | 26 Tests: 20 bestanden, 6 fehlgeschlagen | `baseline-tests.txt` |
| Vollständige Matrix | 7.300 erzeugte Häuser, 1.836 explizite Ablehnungen; alle erzeugten Dachhüllen innerhalb ihrer Freiräume | `baseline-matrix.json` |
| Kontextdaten | 242 Fälle bilden die angeforderte Nachbarzahl nicht ab: 8 Kreuzungs-, 18 Insel-, 36 Straße/Wasser-, 180 Dreifachfälle | `baseline-matrix.json` |
| Breitenreaktion | `mixed/island-access`: Wasserprofile 3 und 3→10 erzeugen denselben Kontext | `baseline-tests.txt` |
| Mesh | degeneriertes Dreieck bei `paths~s-left~p1.5~0~0~1~none~dense` | `baseline-tests.txt` |
| Browser | nicht gestartet: Produktionsbuild fehlt, Webserver-Wartezeit abgelaufen; keine Browserabnahme | `baseline-browser.txt` |

Die fünf Typmeldungen im Mesh-Evaluator waren ein Evaluatorfehler: Three.js' generischer Indexarray wurde als `unknown[]` inferiert. Eine explizite Zahlentypisierung korrigiert ausschließlich den Zugriff, keine Assertion. Der Fall-ID-Digest wird zusätzlich als unveränderte Identitätsassertion fixiert. Eine erneute Messung folgt; B0 bleibt als ursprünglicher Messpunkt erhalten.

## Fokussierte Iterationen

| Nr. | Fehler/Hypothese | Gezielte Änderung | Beobachtung/Evidenz |
| --- | --- | --- | --- |
| 01 | Typverträge verhindern den Build | unbenutzten Import entfernen, Select korrekt typisieren; Evaluator-Indexarray explizit numerisch | Produktionsbuild erfolgreich; CSS-Importwarnung und Größenhinweis sichtbar. `iteration-01-build.txt` |
| 02 | Leerer CSS-Import erzeugt eine Buildwarnung | ungültigen Import entfernen | Build erfolgreich ohne CSS-Warnung; unverändert 20/26 Tests bestanden. `iteration-02-build.txt`, `iteration-02-tests.txt` |
| 03 | Insel-Wasserbreite ignoriert den Endwert | echten umlaufenden Kanal mit unabhängigem, gegebenenfalls veränderlichem Querschnitt erzeugen | Breitenreaktion besteht; 21/26 Tests bestanden. `iteration-03-tests.txt` |
| 04 | Bevorzugte Blockerpositionen decken kleine Landflächen nicht ab | deterministisches Kandidatengitter ergänzen, Maße/Anzahl beibehalten | verbleibende Nachbarzahlfehler 78 statt 242; 23/26 Tests bestanden. `iteration-04-tests.txt` |
| 05 | Gierige Anfangspositionen verhindern mögliche Packungen | bei unvollständigem Layout vollständig neu auf regelmäßigem Packraster platzieren; gleiche Blockermaße und Abstände | Nachbarzahlfehler 0; 25/26 Tests bestanden. `iteration-05-tests.txt` |
| 06 | Clip-Triangulierung kollabiert nach Float32-Konvertierung | numerisch flächenlose Dreiecke entfernen, Materialgruppen erhalten | degenerierter erster Fall behoben; danach bisher verdeckter Sweep-Line-Fehler sichtbar. `iteration-06-tests.txt` |
| 07 | Trigonometrische Fast-Duplikate stören Polygonvereinigung | Koordinaten vor dem Clipping auf Mikrometer runden, weit unter Renderpräzision/Freiraum | 26/26 Tests bestanden. `iteration-07-tests.txt` |
| 08 | Mobile Grid-Spalte übernimmt die Mindestbreite der gesamten Navigationsleiste | mobile Spalte explizit `minmax(0,1fr)`, Sidebar `min-width:0` | mobiler Browserablauf bestanden. `iteration-08-mobile.txt` |
| 09 | Rechtskehre hat positives statt negatives Krümmungsvorzeichen | rechten Kreisbogen spiegelrichtig parametrisieren | 102/105 Tests bestanden; beide Kehrenfehler weg. `iteration-09-tests.txt` |
| 10 | Hofzufahrt erreicht den Hof nicht | fehlendes kurzes Wegstück bis in die Freifläche ergänzen | 103/105 Tests bestanden. `iteration-10-tests.txt` |
| 11 | Kai-Ende berücksichtigt nur Centerline, nicht Endkappe/variable Breite | Endposition aus maximaler Wasser-/Trassenbreite plus Abstand bestimmen | 105/105 Tests bestanden. `iteration-11-tests.txt` |

### Offengelegte Evaluatorvervollständigungen

- Der erste tatsächlich gestartete Browserlauf bestand drei Abläufe und meldete vier Fehler (`first-browser.txt`). Zwei Tests überschritten die Playwright-Standardzeit von 30 Sekunden, obwohl ihre eigene Warteoperation 90 Sekunden zuließ. Außerdem wurde die URL vor dem asynchronen `close`-Ereignis geprüft. Der Evaluator wartet nun auf dieselbe geforderte URL-Eigenschaft und erlaubt die tatsächlich benötigte Browserarbeit; keine Funktionsassertion wurde entfernt. Separate Ausgabeverzeichnisse verhindern, dass Playwright den Matrixbericht löscht. Nach Korrekturen am numerischen Rendering und mobilen Layout: **7/7 Browserabläufe bestanden**, `browser-after-numeric-fixes.txt`.
- Zusätzlich zur ursprünglichen Mesh-Stichprobe wurden sämtliche 9.136 Katalogfälle mit Seed 42 trianguliert und geprüft: **37/37 Tests bestanden**, `full-mesh-baseline.txt`. Dies verstärkt die Abnahme, ohne Matrix/Seeds zu ändern.
- Die fehlenden fachlichen Topologieassertionen wurden ergänzt, **vor** Änderungen an den dadurch aufgedeckten Implementierungsfehlern. Neue Baseline: **100/105 Tests bestanden, 5 fehlgeschlagen**, `topology-baseline.txt`. Typprüfung erfolgreich: `topology-baseline-typecheck.txt`. Gefundene IDs unter anderem `streets~hairpin-right~r3~0~0~1~none~none`, `paths~hairpin-right~p1.5~0~0~1~none~none`, `deadends~court~r3~0~0~1~none~none`, `road-water~quay-end~r3+w3~0~0.6~1~none~none`, `path-water~quay-end~p1.5+w3~0~0.6~1~none~none`. Graph-, Krümmungs-, Verbindungs-, Breiten- und Mutationsprüfungen stehen in `tests/topology*.ts`.
- Die Ablehnungsbeschreibung wurde präzisiert: eine erfolglose endliche Suche ist kein Unbebaubarkeitsbeweis. Der überflutete Kontrollfall zeigt jetzt seine tatsächliche Wasserabsenkung aus den Geometriedaten, nicht den neutralen Gruppenfaktor. Ein zusätzlicher Browserregressionstest sichert beides.

Keine Matrixeinträge, Seeds oder fachlichen Assertions wurden entfernt oder gelockert. Änderungen an Typisierung, Wartebedingungen und zusätzliche Assertions sind hier ausdrücklich als Evaluatoränderungen von Implementierungskorrekturen getrennt.

## Beschriftungs-Baseline und Iteration 12

Der erste grüne Gesamtcheck reichte nicht zur Abnahme: Neutrale Katalogfaktoren wurden in der Oberfläche als physische Breiten ausgegeben. Konkrete zusätzliche Browserregressionen wurden **vor** der Implementierungsänderung ausgeführt: **2/8 bestanden, 6/8 fehlgeschlagen** (`label-baseline.txt`, `label-baseline-screenshots/`).

Repros: `spaces~triangle~r6~0~0~1~none~none`, dieselbe Freifläche mit Zugang `path`, `limits~tiny~r6~0~0~1~none~none` und `limits~flooded~r6~0~0~1~none~none` zeigten fälschlich „Straße 6 m“. `shores~long-pond~w7~0~0.6~1~none~none` zeigte fälschlich „Wasser 7 m“. Der physische Straßenfilter lieferte bei freien Plätzen ohne Nachbarn 108 statt 36 tatsächlich erschlossene Fälle. Straßen- und echtes Fließwasser-Kontrollbeispiel waren bereits korrekt.

Gemeinsame Ursache: `spec.widths` war zugleich Matrixbuchhaltung und physische Beschriftung/Filter. Gezielte Änderung: `presentation.ts` leitet einheitliche Fakten aus den tatsächlich erzeugten Flächen, Centerlines und Breiten ab. Karte, Einzelansicht, Suche und Filter verwenden diese Fakten. Freie Gewässer nennen keine Trassenbreite; fehlender Zugang erfindet keine Straße; Zusatzwege erscheinen mit tatsächlichem Querschnitt. Vollständige IDs bleiben explizit suchbar. Matrix/IDs/Seeds und Geometrien sind unverändert.

Gezielter Nachweis: **113/113 fachliche Tests** und **8/8 neue Kontext-Browserregressionen** bestanden (`iteration-12-tests.txt`, `iteration-12-labels.txt`). Sämtliche alten fachlichen Assertions bleiben bestehen; alle dargestellten Profile werden zusätzlich für den Gesamtkatalog gegen echte Polygonquerschnitte geprüft. Neutrale Faktoren sind im Matrixdialog ausdrücklich erklärt. Der anschließend wiederholte vollständige Gesamtcheck besteht: **113/113 fachliche Tests und 16/16 Browserabläufe**, `final-check.txt`. Feste Ansichten wurden unter `screenshots/` erneuert; sieben konkrete Kontextansichten stehen unter `context-screenshots/`. Gegenüber der Beschriftungs-Baseline sind Anzeige, Suche und Filter jetzt korrekt.

## Abschließende lokale Messung

`npm ci`, `npm run typecheck` und der vollständige `npm run check` waren erfolgreich. Exakte Ausgaben: `final-install.txt`, `final-typecheck.txt`, `final-check.txt`.

| Kriterium | Baseline B0 | Letzte lokale Messung |
| --- | --- | --- |
| Matrixidentität | 9.136 IDs, Digest wie oben | unverändert |
| ursprüngliche fachliche Tests | 20/26 bestanden | alle bestanden; zusätzlich vollständige Mesh-/Topologieprüfung |
| gesamter fachlicher Evaluator | noch unvollständig | **113/113 Tests bestanden** |
| Kontext-/Nachbarzahlfehler | 242 | **0** |
| Mesh-Abdeckung | Stichprobe bricht an degeneriertem Dreieck ab | **9.136 Szenen, 1.177.059 gültige Dreiecke, 0 Fehler**; zusätzlich 12 visuelle Fälle × 4 Seeds |
| Browser | kein erfolgreicher Startnachweis | **16/16 Abläufe bestanden**, einschließlich echtem WebGL und ohne Console-/Runtime-Fehler im geprüften Ablauf |
| Produktionsbuild | Typfehler | erfolgreich: JS 664,86 kB / 174,00 kB gzip, CSS 18,69 kB / 5,05 kB gzip |

`final-matrix.json` enthält pro Gruppe sämtliche Ablehnungs-IDs und **keine** verletzte Eigenschaft. Seed 42 liefert 7.290 Häuser und 1.846 explizite Ablehnungen. Die Zahl der erfolgreichen Häuser ist kein Optimierungsscore: Korrekt dargestellte zusätzliche Nachbarn oder korrekt vor dem Wasser endende Trassen dürfen eine zuvor mögliche Platzierung verhindern. Keine freigegebenen Geometrie-/Freiraumeigenschaften wurden dafür gelockert. `final-mesh.json` dokumentiert die vollständige Triangulierung.

Die vier bewusst unbebaubaren Kontrollfälle lehnen bei allen festen Seeds ab. Andere Ablehnungen beziehen sich nur auf die gewählte Hausfamilie und die endliche Suche; der Generator behauptet keine allgemeine Unbebaubarkeit. Jede gewöhnliche kanonische Form besitzt im geprüften Korpus eine gültige Giebelhauslösung bei allen vier festen Seeds.

Der Build meldet weiterhin transparent den Vite-Hinweis zum einzelnen JS-Chunk über 500 kB. Es wurde keine Warnschwelle angehoben und kein Performanceziel erfunden. `npm ci` meldete 0 bekannte Schwachstellen sowie unter macOS einen Hinweis auf das optionale, nicht freigegebene Installationsskript von `fsevents`; Installation, Build und sämtliche Prüfungen liefen erfolgreich.

Weitere Prüfungen: Workflow-YAML geparst, lokale Dokumentationslinks auf vorhandene Ziele geprüft, `git diff --check` erfolgreich. Rust-Code wurde weder geändert noch für die Galerie ausgewertet; Rust-Prüfungen sind kein Nachweis dieser eigenständigen Anwendung und wurden nicht als solche ausgegeben.

## Visuelle Prüfung — subjektiv

Alle zwölf fixierten Einzelstudien sowie Desktop-/Mobilüberblick wurden tatsächlich angesehen. Screenshots stehen unter `screenshots/`; sie sind **Evidenz**, keine nachträglich erfundene Stilreferenz.

- **Haussilhouette:** bei erzeugten Häusern sind Hauptkörper, Geschosse und Giebel-/Walm-/Pultdächer lesbar. Keine Fassadendetails oder Texturen. Dies ist keine gestalterische Freigabe einer historischen Architektur.
- **Trassen:** Bögen, S-Verlauf, schräge Kreuzung, Hofzufahrt und querende Brückenstreifen sind unterscheidbar. Die technische Breitenmessung ergänzt die subjektive Sichtprüfung.
- **Wasser/Nachbarn:** senkrechte Uferkante und abgesenkte blaue Oberfläche sind erkennbar; rote Blocker sind sichtbar transparent, nicht deckend rot.
- **Umgebungsbezug:** Häuser stehen am Weg, am Hof, am Ufer oder zwischen Trassen und geschützten Flächen. Nicht nachgewiesene Zugänge werden benannt. Im unverändert fixierten Korpus zeigen mehrere dichte Kontexte eine begründete Ablehnung statt eines Hauses; diese Fälle wurden nicht gegen schönere Seeds ausgetauscht. Freiflächen sind bewusst dezent hellocker und in der Einzelansicht lesbar.

[Desktopüberblick](screenshots/overview.png) · [Mobilüberblick](screenshots/mobile.png) · [Hofzufahrt](screenshots/deadends-court.png) · [Insel](screenshots/shores-island.png) · [Dreifachkombination](screenshots/mixed-market-water.png)

## Entscheidungen und verbleibende Grenzen

- TypeScript/Three.js als eigenständiges Browserwerkzeug; kein Rust-Import, kein Stadtumbau.
- Endliche, vollständig enumerierte 9.136-Fälle-Matrix statt eines unmöglichen Vollständigkeitsversprechens über kontinuierliche Geometrie.
- Vier einfache Volumenfamilien, feste Kamera/Beleuchtung und reproduzierbare Seeds; keine Fassadenarbeit.
- Vollständige Dachhüllen inklusive Überständen als konservative Kollisionsgrenze, keine gestauchten Gebäude.
- Ein Nachbar ist ein 4,2 × 4,8 m großer roter teiltransparenter Blocker; dichte Fälle enthalten vier davon. Ihre Platzierung bleibt auf Land und außerhalb von Trassen/Freiflächen.
- Wasser liegt unter Y=0; Brücken sind nur Blockout-Streifen, Ufer senkrecht, Gelände eben.
- Automatische Hausfamilie ist eine lokale Präferenz. Ein endlicher Fehlversuch führt zu transparenter Ablehnung, nicht zu einer erschöpfenden Suche über sämtliche Familien und nicht zu einem mathematischen Unbebaubarkeitsbeweis.
- Stadtadapter, tatsächliche Grundstücke, Fassaden, Innenräume, begehbare Geschosse, Verkehrs-/Wassersimulation und Tragwerksplanung bleiben außerhalb dieser Umsetzung.

Start und Bedienung: [Galerie-README](../../../house-gallery/README.md). Unabhängiges Review: sol-loop, eine Runde mit GPT-6.1 Sol (Provider Pi, `thinking=xhigh`), **APPROVE**, keine fachlichen Befunde, keine abgelehnten Befunde und keine Verhaltensänderung durch das Review. Der Reviewer führte Typprüfung, 113 Tests und eigene Platzierungs-/Zugangsproben über alle 9.136 Seed-42-Fälle aus; Browserprüfungen wurden von ihm nicht erneut ausgeführt. Verbrauchsdaten wurden nicht geliefert. Der vorgelegte Diff umfasste 95 Dateien/14.318 hinzugefügte Zeilen einschließlich Protokollen und Lockfile; danach wurde nur dieser Reviewvermerk ergänzt. CI wird zusätzlich am veröffentlichten PR-Stand geprüft; lokale grüne Prüfungen allein behaupten noch keinen erfolgreichen Merge.
