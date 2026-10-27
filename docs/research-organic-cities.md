# Organischere Städte: begrenzte Recherche

Ziel: verteilte kleine Märkte, nachvollziehbare Gebäudenutzungen und sichtbare Wachstumsspuren im bestehenden Rust/Bevy-Generator; keine Empfehlung zum Komplettumbau. **Alle Übertragungen und Experimente unten sind Vorschläge**, keine nachgewiesene historische Rekonstruktion.

## Ausgangspunkt im Repository

Gelesen: [README](../README.md), [model.rs](../crates/city_core/src/model.rs), [adapter.rs](../crates/city_core/src/adapter.rs). `Building` besitzt Grundriss, `role` und `landmark`, aber keine getrennten Angaben zu Grundstück, Zugang, Geschossnutzung oder Bauphase. `Ward` besitzt bereits `market_space`; `CityOptions.plaza` ist ein Boolescher Schalter, keine Marktverteilung. Der Adapter übernimmt Geometrie und ordnet ursprüngliche Klassen Rollen zu; gewöhnliche Gebäude erhalten überwiegend `lot`. Daraus lässt sich **nicht** schließen, dass alle Gebäudenutzungen im ursprünglichen Generator fehlen. Die öffentliche Projektion bildet sie jedenfalls nicht differenziert ab. Straßen, Gassen, Tore und Brücken sind vorhanden, jedoch kein expliziter öffentlicher Routinggraph.

Die README dokumentiert exakte Referenzvergleiche zum Original. Vorschlag: Experimente zunächst separat auf exportierter Geometrie durchführen, mit eigenem Seed; unveränderten Referenzmodus erhalten. Der Adapter bezeichnet sich ausdrücklich als Projektion ohne Layoutgenerierung: neue Stadtplanung dort nicht beiläufig einbauen.

## Sechs relevante Referenzen

### 1. Watabou: unregelmäßige Unterteilung statt bloßem Rauschen

**Primärquellen:** [Oleg Dolya, Version 0.9.0](https://watabou.itch.io/medieval-fantasy-city-generator/devlog/334289/090-new-alleys-and-buildings), [gleichnamiger Autorenbeitrag auf Patreon](https://www.patreon.com/posts/61026228).

**Technik:** Der indexierte Autorenbeitrag beschreibt „twisted bisection“ für Gassen und die Varianten Bisection, Voronoi und Twisted für Gebäudelose. **Beleggrenze:** Direkter Abruf durch HTTP 403 blockiert; diese Details wurden nur über Suchindex-Auszüge der Primärquelle geprüft, nicht am vollständigen Text oder Quellcode.

**Beitrag für uns:** Als Gestaltungsreferenz wichtig: Unregelmäßigkeit auf Block-/Parzellenebene untersuchen, bevor ein neues Straßensystem entsteht. Zuerst prüfen, was der rekonstruierte Stand davon bereits enthält; der Adapter allein beantwortet das nicht.

**Grenzen / Wiederverwendung:** Kein Nachweis für wirtschaftlich verteilte Märkte, Nutzungssimulation oder historische Wachstumsgesetze. Visuelle und algorithmische Referenz, hier kein neuer Codekandidat. Lizenz für Codeübernahme nicht verifiziert; Zugänglichkeit von Generator oder erzeugten Karten wäre keine pauschale Quellcodelizenz.

### 2. ProbableTrain / MapGenerator: kontrollierbare Straßenfelder

**Primärquellen:** [Repository](https://github.com/ProbableTrain/MapGenerator), [Algorithmusbeschreibung, geprüfter Commit](https://github.com/ProbableTrain/MapGenerator/blob/f487e4cee321d105d5b0e14258363fa8b4d004ef/docs/algorithmoverview.md), [README](https://github.com/ProbableTrain/MapGenerator/blob/f487e4cee321d105d5b0e14258363fa8b4d004ef/README.md), [LGPL-Datei](https://github.com/ProbableTrain/MapGenerator/blob/f487e4cee321d105d5b0e14258363fa8b4d004ef/COPYING.LESSER).

**Technik:** Kombinierte Raster- und Radial-Tensorfelder; Straßen entstehen als integrierte Streamlines entlang der Eigenrichtungen. Abstand `dsep` steuert Netzdichte, Rotationsrauschen verändert Richtungen. Danach werden Schnittpunkte und ein Graph aufgebaut; gefundene Blockpolygone werden verkleinert und rekursiv geteilt. Dies beschreibt die Projektdokumentation ausdrücklich. [Algorithmusbeschreibung]

**Beitrag für uns:** Gut nachvollziehbare Referenz für gerichtete lokale Erweiterungen, etwa Uferstraßen oder neue Vorstadtbereiche, statt willkürlicher Verschiebung aller Punkte. Ebenso wertvoll: die Trennung von gezeichneten Polylinien und logischem Straßengraphen.

**Grenzen / Wiederverwendung:** Laut README amerikanisch geprägte Städte, keine mittelalterliche Nutzungssimulation. Die Algorithmusbeschreibung nennt selbst beschädigte T-Kreuzungen durch Vereinfachung und eine problematische Annahme ohne Sackgassen bei der Polygonerkennung. Gerade für kleine Gassen keine unveränderte Komplettübernahme. TypeScript-Code ist ein möglicher Studien-/Portierungskandidat; README und Lizenzdatei bestätigen LGPL-3.0. Vor Codeübernahme konkrete Lizenzpflichten und Abhängigkeiten gesondert prüfen, nicht als permissive Rust-Bibliothek behandeln.

### 3. Chen et al. (2008): interaktive Straßenmodellierung

**Primärquelle:** [Autorenprojektseite, Paper und C++-Download](https://www2.cs.uh.edu/~chengu/Publications/streetModeling/street_modeling.html).

**Technik:** Tensorfeldentwurf plus Bearbeitung des Straßengraphen; die Autoren nennen Pinsel, Glättung, Constraints, Rauschen und Rotationsfelder. Bestehende Straßennetze können verändert werden. ProbableTrain nennt dieses Paper als Grundlage. [Autorenprojektseite; ProbableTrain-Algorithmusbeschreibung]

**Beitrag für uns:** Eine Richtungssteuerung muss nicht automatisch einen vollständigen Generator ersetzen. Vorschlag: nur neu wachsende Bereiche durch ein Feld führen und den Altstadtkern als Constraint bewahren.

**Grenzen / Wiederverwendung:** Belegt geometrische Modellierung, nicht historische Entstehung oder Marktökonomie. Der angebotene Code ist laut Autor C++ für Visual Studio 2005 und später und seit Veröffentlichung unverändert. Lizenz des ZIPs hier nicht geprüft: verfügbarer Download ist keine verifizierte Wiederverwendungserlaubnis. Zunächst Methodenreferenz.

### 4. Parish / Müller (2001): globale Ziele, lokale Zulässigkeit

**Primärquelle:** [Originalpaper: Procedural Modeling of Cities](https://people.eecs.berkeley.edu/~sequin/CS285/PAPERS/Parish_Muller01.pdf), DOI `10.1145/383259.383292`.

**Technik:** Erweiterte L-Systeme verbinden globale Ziele des Straßennetzes mit lokalen Constraints, die vorgeschlagene Segmente an ihre Umgebung anpassen. **Beleggrenze:** Primärpaper über Suchindex geprüft; direkter PDF-Abruf abgebrochen, keine vollständige Detailprüfung.

**Beitrag für uns:** Als Entwurfsmuster: „Einzugsgebiet besser anbinden“ getrennt von „Segment kollisionsfrei, gültige Kreuzung, kein unbeabsichtigter Flussübergang“ behandeln. Dafür muss nicht die komplette L-System-Architektur übernommen werden.

**Grenzen / Wiederverwendung:** Ein Ziel-/Constraint-System allein erzeugt weder historische Nutzungen noch glaubwürdige Bauphasen. Keine Codebasis oder Codelizenz verifiziert. Das Paper ist nicht gleichbedeutend mit einer Freigabe heutiger CityEngine-Software.

### 5. Emilien et al. (2012): wachsendes Dorf und Gelände

**Primärquellen:** [Autorenprojektseite: Procedural Generation of Villages on Arbitrary Terrains](https://perso.liris.cnrs.fr/apeytavi/website/publication/hal-00694525/), [Autoren-PDF](https://perso.liris.cnrs.fr/egalin/Articles/2012-villages.pdf).

**Technik:** Die indexierte Autorenbeschreibung nennt Interest Maps für Gebäude-/Siedlungssamen, schrittweise gekoppelte Gebäude- und Straßenentstehung sowie anisotrope Landaufteilung um die Samen. **Beleggrenze:** Autoren-Webseite direkt nicht erreichbar; Methoden hier auf Ebene der indexierten Beschreibung, nicht anhand einer vollständigen Paperlektüre geprüft.

**Beitrag für uns:** Passender Gegenentwurf zu „Straßen fertig, anschließend Häuser füllen“: zunächst nur einen neuen Siedlungsrand wachsen lassen, bei dem Nutzung und Erschließung aufeinander reagieren. Geländeabhängigkeit wäre perspektivisch anschlussfähig an `HeightField`, ist derzeit aber kein vorhandenes Generatorverhalten.

**Grenzen / Wiederverwendung:** Dorfmodell ist keine belegte mittelalterliche Stadtökonomie. Keine automatische Übertragbarkeit auf dichte Altstädte. Implementierung und Codelizenz nicht verifiziert; Methodenreferenz, kein freigegebener Codekandidat.

### 6. Vanegas et al. (2012): Grundstücke als eigene Ebene

**Primärquelle:** [Eurographics: Procedural Generation of Parcels in Urban Modeling](https://diglib.eg.org/items/ce1eac67-658d-41b2-b937-15396114c1b2), DOI `10.1111/j.1467-8659.2012.03047.x`.

**Technik:** Der gelesene Abstract beschreibt Blockunterteilung anhand vorgegebener Attribute und Stilparameter sowie persistente Zuordnung von Grundstücken vor/nach Bearbeitungen, um Anpassungen zu erhalten. Er beansprucht geometrisch und funktional plausible Grundstücke für nachfolgende Gebäudemodellierung. [Eurographics-Abstract]

**Beitrag für uns:** Grundstück und Gebäude nicht gleichsetzen. Vorschlag: Straßenfront, Zugang und freibleibende Restfläche getrennt bewerten; dadurch können Hof, Garten, Werkbereich oder spätere Anbauten als zusammenhängende Grundstücksnutzung entstehen statt als Zufallsdekoration.

**Grenzen / Wiederverwendung:** Hofbildung und konkrete historische Nutzungen sind hier unsere Übertragung, nicht ein im Abstract nachgewiesenes Verfahren. Nur Abstract geprüft, kein Detailalgorithmus oder Code. Codelizenz unbekannt; zunächst Methodenreferenz.

## Kleine Märkte: überprüfbarer Modellvorschlag

Die Quellen oben liefern Geometrie-, Graph- und Wachstumsansätze, **keine verifizierte Regel für mittelalterliche Marktverteilung**. Folgendes ist deshalb eine eigene, überprüfbare Modellhypothese:

- Nachfrage zunächst durch bewohnte Gebäude oder deren Fläche gewichten; daraus ausdrücklich keine historisch belegte Bevölkerung ableiten.
- Kandidaten an erreichbaren Kreuzungen, vorhandenen Freiflächen und Straßenaufweitungen suchen. Tore, Brücken und Hafenanschlüsse als optionale Szenariogewichte behandeln, nicht automatisch als Marktplätze.
- Einzugsgebiete über kürzeste Wege auf einem korrekt verbundenen Straßen-/Gassengraphen bestimmen, nicht über Luftlinienkreise. Ein Fluss darf nur an modellierten Übergängen passierbar sein; nahe gezeichnete Linien sind nicht automatisch verbunden.
- Eine kleine, begrenzte Anzahl zusätzlicher Standorte nach Verbesserung der gewichteten Wegeabdeckung wählen; Kapazität und Mindestabstand begrenzen Überversorgung. Betweenness-Zentralität höchstens als Diagnose nutzen: ein Engpass ist nicht automatisch ein guter Verkaufsplatz.
- Zuerst nur Standorte und Einzugsgebiete bewerten. Ein Standortlabel schafft noch keine freie Marktfläche. Geometrische Ausräumung separat auf Kollisionen, verbleibende Zugänge und zusammenhängende bebaubare Flächen prüfen.

## Gebäudenutzungen: konditional statt scheinbar historisch

**Vorschlag:** Ein explizites Szenarioprofil für Region, Zeitraum, Siedlungstyp und Institutionen vorsehen; ohne externe Kalibrierung „Fantasy-Plausibilität“, nicht „historisch korrekt“ nennen. Keine universellen Berufsanteile, festen Gehminuten oder Regel „Gerber immer außerhalb der Mauer“ aus dieser Recherche ableiten: Dafür wurden keine historischen Primärbelege erhoben.

Nutzungen zunächst als gewichtete Hypothesen plus Voraussetzungen modellieren: Wohnen; Wohnen mit Werkstatt/Laden; Lager; Gastbetrieb; religiöse/institutionelle Nutzung; Landwirtschaft. Beispielsweise können Laden und Gastbetrieb im Modell Zugang und lokale Erreichbarkeit bevorzugen, Lager einen passenden Lieferzugang benötigen, eine wasserabhängige Werkstatt expliziten Wasserzugang verlangen. Dies sind **Szenarioregeln**, keine hier belegten historischen Verteilungen. Misch- und Geschossnutzungen zulassen, statt jedem Grundriss zwingend genau einen Beruf zuzuweisen. Sonderbauten brauchen zudem Raum und Zugang, nicht nur eine andere Farbe.

## Drei begrenzte Experimente

1. **Markt-Overlay ohne Grundrissänderung:** Zehn feste Seeds mit/ohne Fluss; bestehendes Netz topologisch prüfen, je Stadt höchstens drei kleine Markt-Kandidaten auswählen. Gegen unveränderten Stand und zufällige Kandidaten messen: gewichtete mittlere und 90.-Perzentil-Netzdistanz, unerreichbare Nachfrage, Kapazitätsüberschreitung. Abbruch bei unzuverlässiger Graphverknüpfung; keine Gebäude löschen.
2. **Ein Block mit Grundstück und Nutzung:** Einen überschaubaren Wohnblock auswählen, bestehende Gebäudepolygone bewahren; Grundstücks-/Zugangshypothesen und wenige Nutzungskandidaten ergänzen. Prüfen: jede Nutzung erreichbar, notwendige Freifläche vorhanden, keine Überlappung; nicht auflösbare Fälle explizit ausweisen. Hof-/Nebengebäude erst nach dieser Prüfung als separate Variante untersuchen. Orientierung: Vanegas, nicht ungeprüfte Übernahme seines Detailalgorithmus.
3. **Drei Wachstumsschritte am Stadtrand:** Altstadt einfrieren; außerhalb eines Tores eine kleine feste Zahl zusätzlicher Gebäude in drei Phasen mit lokalem Erschließungsbedarf testen. Interest-Map-Idee aus Emilien; optionale Richtungssteuerung nach Chen/ProbableTrain. Prüfen: Altstadt unverändert, neue Häuser angebunden, keine ungeplanten Wasserquerungen, identischer Seed reproduzierbar. Kein Versuch, schon eine komplette historische Stadtentwicklung zu simulieren.

## Empfehlung und Evidenzgrenzen

**Die drei ergiebigsten Einstiege:** ProbableTrain für konkret dokumentierte Straßen-/Graphtechnik samt bekannten Schwächen; Vanegas für die fehlende Grundstücksebene; Chen für kontrollierte lokale Netzänderungen. Emilien ist der wichtigste zusätzliche Wachstumskandidat, muss vor einer Implementierungsentscheidung aber vollständig gelesen werden.

Volltext geprüft: ProbableTrain-README, Algorithmusbeschreibung und LGPL-Datei; Chen-Autorenprojektseite; Vanegas-Verlagsabstract. Nur indexierte Primärbeschreibungen: Watabou, Parish/Müller und Emilien. Keine der Quellen validiert die vorgeschlagene Marktökonomie oder mittelalterliche Nutzungsanteile. Kein fremder Generator wurde lokal ausgeführt, kein Code übernommen und keine Laufzeit-/Qualitätsmessung durchgeführt.
