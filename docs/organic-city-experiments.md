# Experimentierstand: organischere Städte

Dieser PR ist die Arbeitsfläche für wirtschaftlich plausible, historisch inspirierte Stadtentwicklung. Die vorhandene Wirtschaftsanalyse ist der erste Ansatz, keine fertige Gesamtplanung. Die folgenden Wegwerfprototypen untersuchen tatsächliche Grundrissänderungen; noch keine ihrer Regeln wird in den produktiven Generator übernommen.

## Prototyp öffnen und Quellen finden

- [Stadtlabor und Anleitung im separaten Prototypbranch](https://github.com/timjonaswechler/cities/tree/ac8d13eff47ae6a6fa39dec9e22046d4fd2d8d6a/crates/city_core/prototypes)
- [Einzelne HTML-Datei](https://github.com/timjonaswechler/cities/blob/ac8d13eff47ae6a6fa39dec9e22046d4fd2d8d6a/crates/city_core/prototypes/organic-city-lab.html): herunterladen und per Doppelklick öffnen, ohne Server oder Installation.
- [27 aufgezeichnete Läufe](https://github.com/timjonaswechler/cities/blob/ac8d13eff47ae6a6fa39dec9e22046d4fd2d8d6a/crates/city_core/prototypes/organic-city-runs.json) samt Ausgangscommit, HTML-Prüfsumme und Node-Version.
- [Runner](https://github.com/timjonaswechler/cities/blob/ac8d13eff47ae6a6fa39dec9e22046d4fd2d8d6a/crates/city_core/prototypes/run-organic-city-lab.mjs): führt dieselben reinen Planungsfunktionen wie die HTML-Datei aus.

Die Prototypdateien liegen absichtlich außerhalb dieses PR-Diffs und damit einer späteren Übernahme nach `main`. Hier bleiben Beobachtungen und offene Fragen. Der Branch heißt `prototype/organic-city-lab`, die oben verlinkte Quelle ist auf Commit `ac8d13e` fixiert.

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

**Beobachtung:** Wachstum ohne Umbau der Altstadt ist darstellbar, aber gleich große Häuser entlang fertiger Straßen erzeugen noch zu regelmäßige Reihen. **Nächste Hypothese:** Unterschiedliche Grundstücke, Hofzugänge, lokale Nachfrage und neue kurze Wege müssen gemeinsam wachsen. Bauphasen sind hier Klickschritte, keine simulierten Jahre; die Standortwahl der Neubauten ist noch nicht wirtschaftlich begründet.

## Grenzen der Aussage

Dies sind Ausgaben bewusst vereinfachter Regeln auf drei Städten, keine historische oder ökonomische Validierung. Die eingebettete Geometrie ist auf vier Nachkommastellen gerundet. Nach Abriss und Wachstum wird die Wirtschaftsanalyse nicht neu berechnet. Marktpolygone löschen ganze gewöhnliche Gebäude, ohne Bewohner umzusiedeln. Hofumbauten zeigen keine Geschosse oder Türen. Das Vorstadtmodell ignoriert Eigentum und darf Ackerland umwidmen. Keine der Beobachtungen ist bereits als Produktentscheidung bestätigt.

## Offene Versuche und Feature-Spur

Die Reihenfolge ist ein Vorschlag für weitere gemeinsame Experimente, keine Zusage zur Umsetzung aller Punkte in diesem PR.

- [x] Nebenmarkt-Kandidaten und Nutzungsfarben getrennt vom Originalgrundriss untersuchen.
- [x] Echte Marktflächen einschließlich Eingriffskosten und abgewiesenen Standorten erproben.
- [x] Hofumbauten und drei Vorstadtphasen als separate, kombinierbare Prototypen ausführen.
- [ ] Marktstandorte unter Berücksichtigung vorhandener Freiflächen, Kapazität und Abrisskosten vergleichen; kleine Plätze bei neuer Bebauung früh reservieren.
- [ ] Grundstücks-/Blockgruppen, Höfe, Gärten, Nebengebäude und nachvollziehbare Zugänge erproben.
- [ ] Wohnen mit Laden/Werkstatt sowie weitere Gebäudenutzungen durch lokale Nachfrage und Voraussetzungen statt bloßer Farbcodierung begründen; etwa Lager mit Lieferzugang oder wasserabhängiges Gewerbe.
- [ ] Verschiedene Grundstücksgrößen und neue kurze Wege beim Wachstum zulassen, wirtschaftliche Annotation nach jedem Schritt neu bewerten.
- [ ] Ältere Kerne, erhaltene Wege und Besitzgrenzen sowie ehemalige Stadtgrenzen als sichtbare Wachstumsspuren untersuchen.
- [ ] Erst nach gemeinsam bewerteten Ergebnissen geeignete Regeln in Rust/Bevy übernehmen; Originalmodus beibehalten.

Methodische Quellen und deren Beleggrenzen stehen in [research-organic-cities.md](research-organic-cities.md). Der aktuelle Produktivstand und die Bedienung der Wirtschaftsanalyse stehen in der [README](../README.md).
