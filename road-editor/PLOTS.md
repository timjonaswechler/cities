# Vektorbauplätze und Gebäudekomplexe

Ein gezeichneter Bauplatz bleibt ein einziges Planungsobjekt. Der Generator erhält seine vollständige Kontur und getrennte Weg-/Wasserblocker. Er erzeugt höchstens einen zusammenhängenden Gebäudekomplex je Bauplatz. Die Bebauung liegt vollständig auf einer bebaubaren Teilfläche; weitere getrennte Bodenflächen bleiben erhalten, aber frei.

## Bedienung

1. Material **Bauplatz** wählen, dann **Zeichnen** oder **Bauplatz zeichnen**. Derselbe Stift wie bei Wegen und Wasser: Klick setzt Ecken, Ziehen formt Kurven.
2. Am ersten Anker schließen oder den offen beendeten Entwurf mit **Bauplatz schließen** schließen. Erst eine gültige geschlossene Kontur erzeugt Bebauung. Enter beendet wie bisher offen; ein offener Bauplatz hat keine wirksame Breite und erzeugt weder Gebäude noch eine Sperrfläche.
3. Die gezeichnete Kontur ist gestrichelt; bebaubare Bodenflächen sind hell hinterlegt, durch Wege/Wasser belegte Bereiche schraffiert. Die Anzeige unterscheidet gezeichnete, bebaubare und ausgeschlossene Quadratmeter.
4. Konturanker und Griffe bearbeiten; **Aussparung zeichnen** hält zusätzliche Flächen frei. **Neue Bebauung** verändert den gespeicherten Seed. Die neue Planung erscheint ohne manuelle Wegzugangswahl oder Übernahmeknopf.
5. Wege oder Wasser ändern: Bodenfläche und Komplex werden neu berechnet, nicht die ursprüngliche Bauplatzkontur verändert. Bei vollständiger Blockierung bleibt der Bauplatz auswählbar und zeigt den Grund für die fehlende Bebauung.
6. **Bauplatz auswählen** erreicht auch Konturen, die von einer Wasserfläche verdeckt sind. **Bauplatz löschen**, Undo/Redo und JSON speichern/laden arbeiten auf den gezeichneten Quellen. **3D prüfen** zeigt dieselben geplanten Baukörper räumlich.

Die frühere Rechteck-/Hausvariantenbedienung wurde aus der Oberfläche entfernt. Bestehende Projekte bleiben ladbar und darstellbar; ihre alten Hausdaten werden nicht still gelöscht oder umgedeutet.

## Modell und aktuelle Regeln

- `Network.plots` speichert geschlossene Konturen mit Kurven, Aussparungen, ID und Seed. Offene Bauplatzentwürfe verwenden die gemeinsame Pfadgeometrie mit `kind: "plot"`; ihre kompatiblen internen Breitenfelder haben keine Flächenwirkung und werden nicht als Bauplatzbreite angeboten.
- Formatversion 5 kennzeichnet Vektorbauplätze. Projekte der Versionen 1–4 bleiben ladbar. Generierte Komplexe und abgeleitete Differenzflächen werden nicht gespeichert.
- Der reale Bauplatz am Boden ist `geplante Fläche − Vereinigung(Weg, Wasser)`. Überlappende Blocker werden nicht doppelt abgezogen. Konkave Umrisse, Löcher und alle getrennten Teilflächen bleiben erhalten.
- Wege und Wasser sind derzeit für sämtliche Baukörper einschließlich Dachüberstand gesperrt. Die vollständige Dachhülle muss in eine erlaubte Teilfläche passen; Gebäude werden nicht passend abgeschnitten oder über einen Weg verbunden.
- Der Komplex ist ein einfacher zusammenhängender Blockout: ein Hauptbaukörper und, wenn möglich, ein niedrigerer direkt angebauter Flügel. Beide müssen vollständig in dieselbe bebaubare Teilfläche passen. Es gibt derzeit keine freistehenden Nebenbauten und keine Gebäudeteile auf weiteren Teilflächen. Diese bleiben sichtbar und werden weiterhin in der Flächenbilanz berücksichtigt; ein Hinweis erklärt die bewusst freie Restfläche.
- Der Komplex hat genau einen Haupteingang in der Mitte einer Fassade des Hauptbaus; ein angebauter Flügel teilt sich diesen Eingang. Das ganze Gebäude wird so gedreht, dass die Fassadennormale am Eingang genau zum nächsten Punkt der tatsächlichen Straßenkante zeigt. Dieser Punkt wird vom Gebäudemittelpunkt aus auf allen endlichen Randsegmenten gesucht; durch die kollineare Lage bleibt er auch vom Eingang aus der nächste Straßenpunkt. Es zählen die vereinigten Wegflächen einschließlich ihrer Lochränder, nicht Wegmittellinien, Wasser oder die Entfernung vom Bauplatz. Bögen verwenden dieselbe segmentierte Außenkontur wie die Straßenfläche in der Darstellung. Ein Flügel übernimmt die Ausrichtung seines Hauptbaus. Die vollständige gedrehte Dachhülle wird danach auf Bebaubarkeit geprüft; eine unpassende Ausrichtung wird nicht still durch eine falsche ersetzt.
- Ein angebauter Flügel darf den 1,2 m breiten und 1 m tiefen Bereich unmittelbar vor einem Eingang nicht belegen. Ohne Straße bleibt ein Eingang an der lokalen Vorderseite; ein Hinweis kennzeichnet diese vorläufige Ausrichtung. Änderungen an Wegen berechnen auch die Gebäudeausrichtung neu. Grüne Markierungen zeigen die Eingänge in der Draufsicht und in 3D. Am ausgewählten Bauplatz zeigt eine gestrichelte grüne Hilfslinie den exakten Zielpunkt an der Straßenkante; sie ist kein geplanter Zugangsweg. Der Zielpunkt ist abgeleitet und wird nicht im Projekt-JSON gespeichert.
- Die Suche ist begrenzt: höchstens vier Kandidaten-Teilflächen für den Hauptbaukörper und 128 Dachhüllenprüfungen pro Bauplatz. Ein fehlender Treffer ist kein Beweis der grundsätzlichen Unbebaubarkeit. Die vollständige nutzbare Geometrie bleibt auch bei unbebauten Teilen sichtbar.
- Überschneiden sich geplante Bauplätze flächig, bleibt die Geometrie erhalten; die betroffenen Plätze melden einen Konflikt statt überlappende Komplexe oder eine unsichtbare Prioritätsverteilung zu erzeugen.
- Es ist noch keine realistische Architektur-, Innenraum- oder Erschließungsplanung. Die Eingangsseite garantiert keinen begehbaren Weg zur Straße; Wasser, andere Bauplätze oder Hindernisse zwischen Eingang und Straße werden dafür noch nicht geprüft. Dachanschlüsse sind einfache überlagerte Blockout-Volumen, keine ausgearbeitete Dachkonstruktion.

## Spätere Überbauung

Die Differenzfläche ersetzt weder die Originalkontur noch die typisierten Blocker im Interface. Für einen späteren Torbau kann daher eine gezielte höhenabhängige Regel ergänzt werden: Durchfahrt unten frei, Baukörper darüber zulässig. Das ist noch nicht implementiert; aktuell gibt es keine Ausnahme zum Überbauen von Wegen oder Wasser.

## Prüfungen

`tests/plots.test.ts` prüft reale Polygonoperationen, Flächenbilanz, getrennte Komponenten, eingeschlossene Hindernisse, Kurven, vollständige Dachhüllen, deterministische Planung und Konflikte. `tests/plot-entrances.test.ts` prüft Straßenwahl, exakte Ausrichtung auf schräge Randsegmente, endliche Straßenenden und Straßenbögen, getrennte Bauplätze auf gegenüberliegenden Straßenseiten, vollständige gedrehte Dachhüllen, freie Eingangsbereiche, Wegänderungen und den Fall ohne Straße. `tests/plot-source.test.ts` prüft Quelle, Versionierung und History. `tests/plot-ui.test.ts` prüft Anzeige und die aus derselben Hausgeometrie erzeugten Meshes. `tests/browser/plots.spec.ts` bedient den vollständigen Ablauf einschließlich Änderungen, JSON, History, verdeckten Bauplätzen und direktem Variantenwechsel nach Koordinateneingabe.

Lokale Browserprüfungen nutzen vorübergehend Port 5189, damit bestehende Entwicklungsserver weiterlaufen können. Die reguläre Playwright-Konfiguration und CI bleiben unverändert.
