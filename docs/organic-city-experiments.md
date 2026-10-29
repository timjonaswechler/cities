# Experimentierstand: organischere Städte

Dieser PR ist die Arbeitsfläche für wirtschaftlich plausible, historisch inspirierte Stadtentwicklung. Die akzeptierte Marktlogik aus Runde 2 ist als [Marktplanung V1](market-planning-v1.md) in Rust übernommen, ohne fertige Gesamtplanung zu behaupten. Die früheren Wegwerfprototypen zu tatsächlichen Grundrissänderungen bleiben getrennt; ihre Hof-, Abriss- und Wachstumsregeln werden nicht übernommen.

**Gestaltungsstatus nach gemeinsamer Sichtung:** Das Marktregelwerk aus Runde 2 ist als V1-Basis akzeptiert; Profilwerte bleiben veränderbar. Höfe und Wachstum sind weiterhin nicht zufriedenstellend, insbesondere die zu kleinteiligen und willkürlich wirkenden Hofumbauten. Die Freigabe der Marktlogik ist keine Freigabe realer Marktflächen oder dieser anderen Features.

## Prototyp öffnen und Quellen finden

**Aktueller Featurestand:** [Marktplanung V1](market-planning-v1.md) portiert die akzeptierte Logik mit Profilsteuerung und Vergleichstests nach Rust/Bevy. [Marktwege und Distrikte](market-district-experiment.md) hält die 27 eingefrorenen Referenzläufe fest; Hof- und Wachstumsregeln bleiben unverändert.

Die folgenden festgehaltenen Quellen gehören zu **Runde 1**:

- [Stadtlabor und Anleitung im separaten Prototypbranch](https://github.com/timjonaswechler/cities/tree/ac8d13eff47ae6a6fa39dec9e22046d4fd2d8d6a/crates/city_core/prototypes)
- [Einzelne HTML-Datei](https://github.com/timjonaswechler/cities/blob/ac8d13eff47ae6a6fa39dec9e22046d4fd2d8d6a/crates/city_core/prototypes/organic-city-lab.html): herunterladen und per Doppelklick öffnen, ohne Server oder Installation.
- [27 aufgezeichnete Läufe](https://github.com/timjonaswechler/cities/blob/ac8d13eff47ae6a6fa39dec9e22046d4fd2d8d6a/crates/city_core/prototypes/organic-city-runs.json) samt Ausgangscommit, HTML-Prüfsumme und Node-Version.
- [Runner](https://github.com/timjonaswechler/cities/blob/ac8d13eff47ae6a6fa39dec9e22046d4fd2d8d6a/crates/city_core/prototypes/run-organic-city-lab.mjs): führt dieselben reinen Planungsfunktionen wie die HTML-Datei aus.

Die Prototypdateien liegen inzwischen zusätzlich unter [`crates/city_core/prototypes/`](../crates/city_core/prototypes/README.md) im selben PR-Branch. Damit sind Quellcode, Rohdaten und Ergebnisspur gemeinsam verfügbar; die Prototypen bleiben klar vom produktiven Rust-Generator getrennt. Der ursprüngliche Prototypbranch `prototype/organic-city-lab` und die oben auf Commit `ac8d13e` fixierten Quellen bleiben als Experimentnachweis erhalten.

![Landstadt mit Marktflächen, Hofumbauten und drei Vorstadtphasen](https://github.com/timjonaswechler/cities/blob/ac8d13eff47ae6a6fa39dec9e22046d4fd2d8d6a/crates/city_core/prototypes/organic-city-combined.png?raw=true)

## Drei Fragen, 27 Läufe

Grundlage sind drei echte Exporte des aktuellen Rust-Generators: Größe 25, Seed 42 mit/ohne Fluss und Seed 12345 ohne Fluss. Je Stadt wurden neun Konfigurationen ausgeführt: Original, Marktflächen mit maximal 16/24/32 Metern Radius, Hofumbauten, Bauphase 1/2/3 und die Kombination. Der zweite Lauf reproduzierte die JSON-Ergebnisse bytegleich. Drei interaktive Ansichten wurden ausgeführt und angesehen; keine Konsolenfehler. Keine formalen Tests für den Wegwerfprototyp ergänzt.

### 1. Marktflächen statt Standort-Pins

Die vorhandenen Standortvorschläge werden als unregelmäßige Platzpolygone erprobt. Gewöhnliche Gebäude, die die Fläche berühren, entfallen vollständig. Wasser-, Mauer- und Sonderbaukonflikte können einen Standort ablehnen.

| Stadt | Marktflächen bei max. 24 m Radius | dafür entfernte Gebäude | entfernte Gebäude bei max. 16 m Radius |
| --- | ---: | ---: | ---: |
| Landstadt, Seed 42 | 3 | 16 | 13 |
| Flussstadt, Seed 42 | 3 | 19 | 12 |
| Cloudhill, Seed 12345 | 3 | 20 | 13 |

Bei max. 32 Metern Radius lehnt Cloudhill einen Standort wegen eines Sonder- oder Landwirtschaftsgebäudes ab. Ein wirtschaftlich gut erreichbarer Punkt ist also nicht automatisch eine passende Marktfläche.

**Beobachtung:** Nachträgliches Freiräumen ist teuer in bestehender Bebauung. **Nächste Hypothese:** Vorhandene Restflächen, Straßenaufweitungen und früh reservierte Plätze sollten vor Abriss bevorzugt werden. Noch nicht erprobt: Kapazität, Umsiedlung, Grundstückswert und wirtschaftliche Neubewertung nach dem Eingriff.

### 2. Hofumbauten bei gleichem Außenumriss

Große, geeignete konvexe Einzelgebäude werden in Flügel um einen Innenhof zerlegt. Der äußere Umriss bleibt, Dachfläche wird zu Hoffläche. Von 422/556/579 Gebäuden eignen sich mit diesen einfachen Regeln nur 4/4/5 für den Hofversuch allein; die kombinierte Variante kann weitere Kandidaten durch Marktabriss verlieren.

**Beobachtung:** Einzelne Gebäudepolygone reichen für viele Hofsituationen nicht. **Nächste Hypothese:** Zusammenhängende Grundstücks-/Blockgruppen mit Zugang und Nebengebäuden sind ergiebiger. Noch fehlen Parzellen, Türen, Geschosse, Belichtung und wirtschaftliche Nutzung des Hofes.

### 3. Vorstadt in drei Bauphasen

Je Phase werden höchstens acht Häuser an vorhandenen Ausfallstraßen in Tornähe versucht. Modellierte Wasser-, Mauer-, Straßen- und Gebäudekonflikte führen zur Ablehnung. Die bestehende Altstadt wird nicht verschoben. Nach drei Phasen entstehen 23/20/15 zusätzliche Gebäude in den drei Städten.

**Korrektur nach gemeinsamer Sichtung:** Die individuellen Zufahrtsstummel zu Neubauten wurden aus dem aktuellen Runde-1-Stadtlabor entfernt. Bestehende Straßen bleiben unverändert, und eine virtuelle Zugangsprobe prüft nur noch die Platzierung. Die oben verlinkten Quellen auf `ac8d13e` zeigen den historischen Erststand; die korrigierte HTML-Datei liegt im PR-Branch unter `crates/city_core/prototypes/organic-city-lab.html`.

**Beobachtung:** Wachstum ohne Umbau der Altstadt ist darstellbar, aber gleich große Häuser entlang fertiger Straßen erzeugen noch zu regelmäßige Reihen. **Nächste Hypothese:** Unterschiedliche Grundstücke, Hofzugänge, lokale Nachfrage und neue kurze Wege müssen gemeinsam wachsen. Bauphasen sind hier Klickschritte, keine simulierten Jahre; die Standortwahl der Neubauten ist noch nicht wirtschaftlich begründet.

## Grenzen der Aussage

Dies sind Ausgaben bewusst vereinfachter Regeln auf drei Städten, keine historische oder ökonomische Validierung. Die eingebettete Geometrie ist auf vier Nachkommastellen gerundet. Nach Abriss und Wachstum wird die Wirtschaftsanalyse nicht neu berechnet. Marktpolygone löschen ganze gewöhnliche Gebäude, ohne Bewohner umzusiedeln. Hofumbauten zeigen keine Geschosse oder Türen. Das Vorstadtmodell ignoriert Eigentum und darf Ackerland umwidmen. Keine der Beobachtungen ist bereits als Produktentscheidung bestätigt.

## Gestaltungsregeln für die nächsten Versuche

### Märkte: Laufwege und Distrikte statt Standortquote

- Ein Nebenmarkt kommt erst ab einer ausreichenden Mindest-Laufwegentfernung zum **Hauptmarkt** infrage. Diese Bedingung muss auch nach Auswahl weiterer Nebenmärkte erhalten bleiben.
- Zusätzlich müssen Nebenmärkte **untereinander** eine Mindest-Laufwegentfernung einhalten. Beide Abstandsbedingungen sind gesondert auszuwerten; die konkreten Entfernungen sind noch nicht festgelegt.
- Entfernungen beziehen sich auf begehbare Wege und gültige Zugänge, nicht auf Luftlinie oder den Abstand der Platzmittelpunkte. Die Genauigkeit des rekonstruierten Netzes bleibt dabei eine zu prüfende Grenze.
- Distrikte sollen die Standortwahl und die versorgten Gebiete mitprägen. Es gibt **keine Pflicht zu einem eigenen Markt pro Distrikt**. Wie Nutzungscharakter und Nachfrage eines Distrikts gewichtet werden und wann ein Markt mehrere Distrikte versorgt, ist im nächsten Versuch zu untersuchen.
- Ein Versuch soll die Laufwege zum Hauptmarkt und zwischen allen Marktstandorten sowie die Distriktzuordnung zeigen. Abgewiesene Standorte und schlecht versorgte Gebiete müssen erkennbar bleiben. Gute Darstellung allein reicht nicht als Bewertung der Standortlogik.

**Portierter Stand:** Die frühere pauschale Rust-Regel wurde durch [Marktplanung V1](market-planning-v1.md) ersetzt: gesonderte Haupt-/Nebenmarkt-Abstände, weiche Distriktdefizit-Gewichtung, expliziter Bedarf und Diagnosen. Die 27 Fälle des Markt-/Distriktprototyps dienen als Regression; das alte Stadtlabor aus Runde 1 bleibt ein historischer Experimentnachweis.

### Höfe und übrige Features: nicht freigegeben

Die bisherigen Hofumbauten wirken zu klein und ihre Verteilung zu beliebig. Die aktuelle Regel „geeigneten Einzelgrundriss innen ausschneiden“ ist deshalb keine bestätigte Ziellösung. Größere, räumlich zusammenhängende Hof-/Grundstücks- oder Blockkonzepte bleiben mögliche neue Versuche, nicht bereits beschlossene Lösungen.

Auch die übrigen Features sind gestalterisch noch nicht zufriedenstellend. Die bisherigen Wachstumsreihen und Nutzungszuordnungen bleiben Untersuchungsstände. Weitere reine Mengenvergleiche oder reproduzierbare Läufe ersetzen nicht die gemeinsame Beurteilung von Maßstab, innerer Logik und Stadtbild.

## Offene Versuche und Feature-Spur

Die Reihenfolge ist ein Vorschlag für weitere gemeinsame Experimente, keine Zusage zur Umsetzung aller Punkte in diesem PR. Abgehakte Punkte bedeuten **Versuch durchgeführt**, nicht **Feature zufriedenstellend fertig**.

- [x] Nebenmarkt-Kandidaten und Nutzungsfarben getrennt vom Originalgrundriss untersuchen.
- [x] Echte Marktflächen einschließlich Eingriffskosten und abgewiesenen Standorten erproben.
- [x] Hofumbauten und drei Vorstadtphasen als separate, kombinierbare Prototypen ausführen.
- [x] Erste Marktvariante mit gesonderten Haupt-/Nebenmarkt-Laufwegabständen, Distriktgewicht ohne Marktpflicht, sichtbaren Entfernungen und versorgten Distrikten in Runde 2 erproben.
- [x] Akzeptierte Marktlogik als V1 mit benanntem Profil, Rust-Port, Bevy-Steuerung und 27 HTML-Vergleichsfällen übernehmen.
- [ ] Profileinstellungen und zukünftige Nachfrageeinflüsse weiter untersuchen; insbesondere verbleibend schlecht versorgte Distrikte und die Grenzen der Netzrekonstruktion beurteilen.
- [ ] Marktstandorte unter Berücksichtigung vorhandener Freiflächen, Kapazität und Abrisskosten vergleichen; kleine Plätze bei neuer Bebauung früh reservieren.
- [ ] Hofkonzept hinsichtlich Maßstab, nachvollziehbarer Auswahl und zusammenhängenden Grundstücks-/Blockgruppen neu erproben; nicht bloß weitere kleine Ausschnitte in Einzelgebäuden erzeugen.
- [ ] Grundstücks-/Blockgruppen, Gärten, Nebengebäude und nachvollziehbare Zugänge erproben.
- [ ] Wohnen mit Laden/Werkstatt sowie weitere Gebäudenutzungen durch lokale Nachfrage und Voraussetzungen statt bloßer Farbcodierung begründen; etwa Lager mit Lieferzugang oder wasserabhängiges Gewerbe.
- [ ] Verschiedene Grundstücksgrößen und neue kurze Wege beim Wachstum zulassen, wirtschaftliche Annotation nach jedem Schritt neu bewerten.
- [ ] Ältere Kerne, erhaltene Wege und Besitzgrenzen sowie ehemalige Stadtgrenzen als sichtbare Wachstumsspuren untersuchen.
- [ ] Weitere Grundriss-, Hof- und Wachstumsregeln erst nach gemeinsamer Bewertung übernehmen; Originalmodus weiterhin beibehalten.

Methodische Quellen und deren Beleggrenzen stehen in [research-organic-cities.md](research-organic-cities.md). Der aktuelle Produktivstand und die Bedienung der Wirtschaftsanalyse stehen in der [README](../README.md).
