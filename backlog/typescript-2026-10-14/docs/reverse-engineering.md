# REA: Originalalgorithmus nach TypeScript

Untersucht und umgesetzt am 13.–14. Oktober 2026.

> Historischer, aus dem Chat geretteter Bericht. Die genannten Browserreferenzdateien, Browserberichte und REA-Evidenzspeicher sind nicht wiederhergestellt. Die acht Referenzdateien wurden stattdessen aus dem gepinnten Originalbundle in Node neu erzeugt. Aktueller Nachweis und Grenzen: [Wiederherstellung](../../../docs/recovery.md).

## Ergebnis

Die anfängliche Näherung wurde durch eine mechanische Portierung des tatsächlich ausgelieferten Generierungskerns ersetzt. Der [vorgegebene Link](https://watabou.github.io/city-generator/?size=25&seed=924709892&citadel=1&urban_castle=0&plaza=1&temple=1&walls=1&shantytown=0&coast=0&river=0&greens=0&gates=-1) ergibt jetzt **Beggars Market** mit derselben Geometrie wie das Original innerhalb derselben Laufzeit.

24 unabhängige Node-Vergleiche und acht Browservergleiche sind exakt gleich, ohne Rundung oder numerische Toleranz. Dies ist beobachtete Parität der geprüften Fälle; keine Behauptung eines formalen Beweises für sämtliche Seeds oder einer pixelidentischen gesamten Benutzeroberfläche.

## Artefakt und Herkunft

- [Offizielles Bundle](https://watabou.github.io/city-generator/mfcg.js): 1.311.759 Bytes.
- SHA-256: `b67cf2e75dcae555a9de56f49d897a04a0a2cbcdccc9e40df02c9f249459d86e`.
- Version **0.11.5**, Build **2431**, aus den Metadaten des Bundles. Die darin enthaltene ältere URL `0.10.0` ist keine verlässliche Versionsangabe.
- Haxe-Programm mit OpenFL/Lime; interne Klassen- und Methodennamen sind im ausgelieferten JavaScript erhalten.
- Originalgrammar und vier Sprachkorpora unter `src/original/assets/`. Ihre vollständigen Bytes sind relevant, weil die Namensgenerierung Zufallswerte vor der Gebäudeerzeugung verbraucht.
- [Provenienzmanifest](../src/original/provenance.json): Klassen, Hostgrenzen, Asset-Hashes und Transformationsschritte.

## REA-Evidenz und technische Grenzen

| Untersuchung | Zurückbehaltener Datensatz | Zusammenfassung |
| --- | --- | --- |
| Originalbundle | `ev_47d3ded718109567d0b7972cad221e90b1a188f3414cfac1fd0853fb8cb3afe0` | `ev_2bb7e094d34ce97fd44610385b8567c7b5622fd239bde229b1dcaa7d1ae0e0d0` |
| Fünf extrahierte Kernklassen | `ev_98d1d182ace763db6db18e4293e95ae1377920a568fdfc496885de254e9b3857` | `ev_3e3fd734e219e157d3b29883d240d584b3ed16436c6f7b84a5753c086d1f0d72` |

Die erste Analyse konnte 435.095 AST-Knoten ohne Parsefehler lesen, erschöpfte aber beim semantischen Graphen den Worker-Heap. Eine gezielte zweite Analyse mit fünf Dateien, 40.765 Bytes und erhöhtem 2-GB-Limit parste alle Dateien; die City-Klasse überschritt weiterhin den Speicherrahmen der semantischen Analyse. REAs Graph bleibt daher ausdrücklich unvollständig. Fehlende Kanten sind kein Beleg für fehlendes Verhalten.

Diese Grenze wurde durch eine eigene AST-basierte Abhängigkeitsanalyse und tatsächliche Ausführungsvergleiche umgangen. Babel verfolgt Bindungen im Original-Haxe-Scope, ohne den großen allgemeinen Semantikgraphen aufzubauen. Es extrahiert nur Geometrie, Modell, Namensgenerierung und ihre benötigten Laufzeitklassen. REAs statische Beobachtungen und die anschließend ausgeführten Tests sind getrennte Evidenzarten.

## Erhaltene Semantik

`scripts/extract-original.mjs` liest direkt das per Hash geprüfte Originalbundle. Es trennt ausschließlich Deklarations-/Komma-Anweisungen, bildet die Abhängigkeitshülle, ersetzt Browser-IO durch explizite Adapter, benennt gebundene Klassenvariablen um und ergänzt TypeScript-Typen. Reihenfolge, Rechenausdrücke, Schleifen, Prototypen und Zustandsänderungen des Generators bleiben erhalten.

Insbesondere erhalten sind:

- Originale DCEL, Delaunator/Voronoi, Punktarithmetik, Polygonoperationen und Nachbarschaftsidentitäten.
- Park–Miller-Folge, statische Initialisierung, Patch-Seeds, Rücksetzpunkte und einteiliger Save/Restore-Zustand.
- Numerische UID-Schlüsselreihenfolge der Haxe-ObjectMaps; kein Austausch durch anders iterierende JavaScript-Maps.
- URL-Blueprint mit `sea=0` als Standard, State-Defaults wie `processing=Offset` und `lots_method=Twisted`.
- Vollständige Pipeline von Zellen über Mauern, Straßen, Kanäle und Bezirke bis zu Gruppen, Blocks und Lots.
- Namensgrammatik, Markov-Korpora und Namensaufrufe an den ursprünglichen Stellen der Zufallsfolge.
- Ursprüngliche Fehlerwiederholung beim Stadtbau; gültige problematische Geometrieversuche werden wie im Original wiederholt.

Auch zufällige neue Städte laufen durch `Blueprint.create` mit den ursprünglichen größenabhängigen Wahrscheinlichkeiten. Der zufällige Küstenwinkel wird nach dem Bau für den Permalink gespeichert. Maximale Tore verwenden `hub=true` statt einer künstlich gewählten Torzahl; innere Burg und Zitadelle bleiben unabhängige Originalflags.

Die dynamischen Haxe-Interna verwenden einen gekennzeichneten `HaxeValue`-Typ. Der TypeScript-Compiler läuft im Strict-Modus ohne `ts-nocheck`. Die API und das serialisierbare Geometriemodell sind typisiert.

## Hostgrenzen und Darstellung

Assets werden aus eingecheckten Texten geladen; State und URL werden im Speicher gehalten. Die Stoppuhr führt ihren Callback unverändert einmal aus. Logging ist optional. Nicht benötigte OpenFL-UI-Aufrufe melden eine explizite Grenze, statt still Geometriedaten zu erfinden. Jede Stadt erhält einen eigenen Kernelzustand.

Der Adapter kopiert ungerundete Originalpunkte und erhält gemeinsame Punktidentität. Er emittiert die Lots einer Gruppe nur an deren Kernzelle. Mauern verwenden originale Segmentmasken, Türme und Tore; Straßen, Flussmündungen, Brücken, Stege, Furchen und Baumkronen folgen den ursprünglichen Zeichenpfaden. Warp bearbeitet alle zusätzlichen Schichten gemeinsam.

Die Projektionen wurden zusätzlich gegen ausgeführte Originalmethoden aus RoadsView, RiverView, WallsView und TreesLayer geprüft: Standardkarte, Fluss, Küste und Küste mit Fluss stimmten bei Wegen, Wänden, Brücken und Baumkronen exakt überein. Das ist Geometrievergleich; Schrift-Rasterisierung und Canvas-/SVG-Pixel wurden nicht gleichgesetzt.

## Unabhängige Prüfung

[Originalvergleich und Reproduktion](oracle-notes.md) erläutert beide Referenzpfade:

1. **Browser:** vollständiges Originalbundle mit normalem OpenFL-Bootstrap. Ein Beobachter erfasst das Modell unmittelbar nach `City.build`, vor den Renderer-Listeners. Acht unveränderliche Referenzen enthalten Koordinaten in voller Präzision, Reihenfolge, Klassen, Namen und RNG. Die damaligen Vergleichshashes und Laufzeitdaten sind nicht als Datei wiederhergestellt.
2. **Node:** vollständiges Originalbundle in einem frischen VM-Kontext über dessen vorhandenen Worker-Pfad. Nur der UI-Bootstrap wird durch Registry-Exporte ersetzt. Die unveränderten Originalmethoden werden mit Speicher-/Asset-Adaptern ausgeführt. 24 Fälle vergleichen den vollständigen kanonischen JSON-Hash mit der TS-Portierung.

Die zusätzlichen Fälle prüfen unbekannte Seeds, Größen 5–80, explizite Torzahlen, verschiedene Küstenrichtungen, benannte Städte, Unicode, Einwohnerzahl, Hub und Featurekombinationen. Die finale Gesamtsuite besteht aus 62 erfolgreichen Tests in sieben Dateien; TypeScript-Prüfung und Vite-Produktionsbuild bestehen. Weitere Integrationstests prüfen Größe 200, Datenprojektion, Zustandstrennung, Umbenennen, SVG-Escaping, Kamera, Warp und URL-Zustand.

Mathematische Bibliotheken verschiedener V8-Versionen können geringfügig voneinander abweichen. Beispielsweise ergibt `Math.cos(-5.543987035746693)` im geprüften Chromium `0.7390089172206585`, in Node `0.7390089172206586`. Solche Abweichungen können später Verzweigungen beeinflussen. Im Browser beträgt der abschließende RNG für den Referenzseed bei Original und Portierung jeweils `533246748`; unter Node bei beiden `1445851543`. Deshalb wird Parität stets innerhalb derselben Laufzeit geprüft.

Der Produktionsbuild wurde zusätzlich im T3-Browser geöffnet: Titel **Beggars Market**, geladene Schriften und sämtliche **586 Gebäude-/Grundstückspolygone** stimmen in voller Koordinatenpräzision mit der unabhängigen Browserreferenz überein. Der [PNG-Kartenexport](preview.png) stammt aus diesem Produktions-SVG. Die T3-Screenshotfunktion meldete einen Clientfehler; das Bild ist ausdrücklich ein Kartenexport, kein Screenshot der Oberfläche.

## Verbleibender Umfang

- Der Generatorvergleich betrifft die ursprüngliche Stadtgenerierung im Standard-Lots-Modus. Complex/Simple sind keine wählbaren Darstellungsmodi der neuen Oberfläche.
- HTML-Bedienung und SVG-Renderer sind eigenständige Komponenten. Wappen, POI-Editor, Legenden und weitere Original-Warpwerkzeuge wurden nicht in die Oberfläche übernommen.
- Zusätzliche Dachfirstlinien sind schematische Darstellung; standardmäßig sind sie aus.
- JSON verwendet weiterhin das eigene Format `new-cities`, Version 1. SVG/PNG und JSON enthalten aktuelle Warp-Änderungen; Seed-Links enthalten keine Warp-Geometrie.
- Automatische Gesamtauswertung des REA-Semantikgraphen bleibt unvollständig; die dokumentierten Ausführungsvergleiche ersetzen keine Behauptung vollständiger statischer Analyse.

Originalalgorithmus: Oleg Dolya / Watabou. Schriftlizenzen: [IM FELL Great Primer](../public/fonts/OFL-imfellgreatprimer.txt), [Share Tech](../public/fonts/OFL-sharetech.txt).
