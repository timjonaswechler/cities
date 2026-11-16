# Zurückgestellter Entwurf: modulares Gebäudemodell V1

**Nicht als aktuellen Bauvertrag übernehmen.** Zuerst werden die einzelnen Bausteine im [Feature-Zoo](../road-editor/FEATURE-ZOO.md) geprüft. Ein Bauplatz darf mehrere Komplexe enthalten; ein Komplex verbindet mehrere Aufenthaltsbereiche an einem Hauptknoten, direkt oder indirekt. Die nachstehende Ein-Gebäude-Annahme ist überholt. Maßgeblich sind die gemeinsam präzisierten Begriffe im [Glossar](../GLOSSARY.md).

**Historischer Entwurfsstand, nicht im Generator implementiert.** Der laufende Wegeditor verwendet weiterhin den [aktuellen Blockout-Planer](../road-editor/PLOTS.md). Die hier benannten Geometrieoperatoren, Regeln und Profile sind ein vorgeschlagener Vertrag, keine bereits verfügbaren Funktionen.

Ziel: Eigenschaften und ihre Ausprägungen einzeln definieren, daraus wiederverwendbare Bauteile beschreiben und diese abhängig von Bauform, Nutzung und Bauplatz zu einem Haus zusammenstellen. Meshes sind das abgeleitete Ergebnis, nicht die Quelle der Gebäuderegeln.

[Zusammenhängende JSON-Beispieldaten](../road-editor/design/building-model-v1.example.json) enthalten Eigenschaften, Materialien, Geometrierezepturen, Features, Bauvorlagen, Profile, Bauplätze und Hausanfragen. Die Zahlen sind veränderbare Fantasy-Entwurfsannahmen, keine historischen oder baurechtlichen Normen. Die Anfragen sind noch keine nachgewiesen passenden Entwürfe.

## 1. Die getrennten Ebenen

| Ebene                | Beschreibt                                                             | Beispiel                                                                |
| -------------------- | ---------------------------------------------------------------------- | ----------------------------------------------------------------------- |
| Eigenschaft          | Datentyp, Einheit, Wertebereich, Vorgabe und benannte Werte-Presets    | Dachneigung: 20–60°, Presets flach/normal/steil                         |
| Material             | Darstellungseigenschaften                                              | Putz, Holz, Stein, Dachziegel                                           |
| Geometrierezeptur    | Typisierte Operationen zur Erzeugung oder Veränderung von Geometrie    | Kontur extrudieren, Dach erzeugen, Bogenöffnung ausschneiden            |
| Feature              | Wiederverwendbare bauliche Fähigkeit mit Varianten und Besitzzuordnung | Geschoss, Dach, Durchfahrt, Überhang, Anbau, Mauer                      |
| Bauvorlage           | Wie Features über Eingaben, Ausgaben und Anschlüsse zusammengehören    | Erdgeschoss → Obergeschoss → Dach                                       |
| Bauformprofil        | Erlaubte Ausprägungen einer Bauform und ihre Vorgaben                  | Bauernhaus, Stadthaus, Hallenbau                                        |
| Nutzungsprofil       | Zusätzliche Anforderungen einer Nutzung                                | Wohnen, Landwirtschaft, Werkstatt, Versammlung                          |
| Bauplatz             | Kontur, Straßen, Schutzvolumen, Höhen- und Merkmalsgrenzen             | Hier ist eine Straßenüberbauung erlaubt, aber nur mit freier Durchfahrt |
| Hausanfrage          | Gewünschte Profile, Bauplatz, Seed und explizite Entscheidungen        | Auf Bauplatz A ein Stadthaus mit Satteldach und kleinem Vorstoß         |
| Aufgelöster Hausplan | Konkrete Instanzen, Maße, Platzierung, Endgeometrie und Prüfbericht    | Genau dieses Haus, ohne weitere Zufallsentscheidungen im Renderer       |

Die Begriffe Gebäude, Betrieb, Institution und Grundstück bleiben entsprechend dem [Glossar](../GLOSSARY.md) getrennt. Eine Institution ist nicht automatisch eine bestimmte Gebäudeform; ihr Nutzungsprofil kann etwa einen Hallenbau verlangen. V1 plant weiterhin **ein zusammenhängendes Gebäude je Anfrage**, keine Klosteranlage mit mehreren Häusern.

IDs sind innerhalb ihrer Sammlung eindeutig und an die Katalogrevision gebunden. Varianten-IDs gelten innerhalb ihres Features, Presets innerhalb ihrer Eigenschaft, Knoten innerhalb ihrer Rezeptur und Slots innerhalb ihrer Bauvorlage. Wiederverwendete lokale Namen sind dadurch keine globalen Kollisionen.

## 2. Eigenschaften und ihre Varianten

Eine Zahleneigenschaft enthält `id`, `label`, `type`, `unit`, `domain`, `default` und optionale `presets`. Eine Auswahl enthält stattdessen `options` und einen `valueType`, etwa `material-id`.

```json
{
  "id": "overhang.depth",
  "label": "Obergeschossvorstoß",
  "type": "number",
  "unit": "m",
  "domain": { "min": 0, "max": 1.2 },
  "default": 0.35,
  "presets": [
    { "id": "small", "value": 0.35 },
    { "id": "deep", "value": 0.65 }
  ]
}
```

Eine Eigenschaft kann auf vier Arten ausgewählt werden:

- `{"value": 0.4}`: ausdrücklich dieser Wert.
- `{"preset": "small"}`: ausdrücklich dieses benannte Preset derselben Eigenschaft.
- `{"choose": [{"preset": "small", "weight": 3}, {"preset": "deep", "weight": 1}]}`: gewichtete Auswahl aus den noch gültigen Kandidaten. Einträge können alternativ `value` enthalten.
- `{"range": {"min": 0.2, "max": 0.5}}`: die Suche darf innerhalb dieses zusätzlich eingeschränkten Intervalls variieren.

`value` und `preset` einer Hausanfrage sind feste Wünsche: Ein ungültiger Wert wird nicht heimlich gestaucht. Bei `choose` werden unzulässige Kandidaten entfernt; bleibt keiner übrig, ist die Auswahl widersprüchlich. Eine Range beschreibt einen Suchraum, keine Zusage, jede mögliche Zahl zu prüfen. Gewichte müssen endlich und positiv sein.

**Eigenschafts-Preset und Feature-Variante sind verschieden:** `small` wählt nur die Vorstoßtiefe. Die Dachvarianten `gable` und `hip` wählen dagegen unterschiedliche Geometrierezepturen. Es gibt daneben kein zweites, unabhängig veränderbares Feld „Dachform“, das derselben Entscheidung widersprechen könnte.

## 3. Wie daraus Mesh-Geometrie entsteht

Eine Rezeptur enthält:

- `inputs`: von anderen Bauteilen oder der Platzierung gelieferte Geometrie.
- `properties`: lokale Parameternamen mit Verweisen auf Eigenschaftsdefinitionen.
- `nodes`: ein gerichteter, zyklenfreier Graph registrierter Geometrieoperationen.
- `exports`: benannte, typisierte Ergebnisse für andere Features und den Hausplan.

Verweise haben einen ausdrücklichen Ursprung:

```json
{
  "inputs": { "outline": { "source": "input", "id": "outline" } },
  "parameters": { "height": { "source": "property", "id": "height" } }
}
```

Ein Verweis auf ein Zwischenergebnis lautet beispielsweise `{"source":"node","id":"body","output":"topOutline"}`. Es gibt keine frei auswertbaren JavaScript-Ausdrücke in Katalogdaten.

### Geometrietypen und Einheiten

- `region`: eine ebene Kontur mit Außenring, Löchern, lokalen XY-Punkten und einem räumlichen Bezugssystem. Geschoss- und Dachkonturen liegen horizontal.
- `solid`: geschlossener Körper einschließlich Material- und Flächentags; auch ein Körper mit ausgeschnittener Durchfahrt.
- `volume`: räumlicher Prüf- oder Freihaltebereich, kein zu zeichnendes Bauteil.
- `frame`: Position und Orientierung eines Anschlusses.
- `edge`: eine identifizierte Konturkante, nicht bloß eine instabile Arrayposition.
- `facades`: benannte Fassadenflächen mit Anschlussrahmen und nutzbaren Spannweiten.
- `path` und `segment3`: Linienverlauf beziehungsweise räumliche Durchgangsachse.

Der Browserkonvention folgend: **XY ist der Boden, +Z zeigt nach oben, Längen sind Meter.** Eigenschaftswinkel werden in Grad gespeichert, die Orientierung eines Bezugssystems in Radiant; die Umrechnung gehört in den Geometriekern. Die abweichenden Achsen früherer Rust-Prototypen werden nicht still übernommen.

### Vorgeschlagene Operatoren

| Operator                            | Wirkung                                                                                                 |
| ----------------------------------- | ------------------------------------------------------------------------------------------------------- |
| `solid.extrude`                     | Geschoss aus Kontur und Höhe; liefert Körper, obere Kontur und Fassadenanschlüsse                       |
| `roof.gable`, `roof.hip`            | Dach einschließlich Überstand aus der oberen Kontur; Satteldach zusätzlich mit expliziter Firstrichtung |
| `region.offsetEdge`                 | Versetzt eine gewählte Konturkante für einen Obergeschossvorstoß                                        |
| `solid.archPrism`, `solid.boxPrism` | Erzeugt einen bogenförmigen oder rechteckigen Ausschneidekörper entlang einer Durchgangsachse           |
| `solid.subtract`, `solid.union`     | Subtrahiert beziehungsweise vereinigt Körper, unter Erhalt ihrer Materialzuordnung                      |
| `volume.corridor`                   | Reserviert einen durchgehend freien Durchgang mit Breite und Mindesthöhe                                |
| `wall.sweep`                        | Erzeugt eine Mauer entlang eines Linienverlaufs                                                         |

Der Katalog benennt die benötigten Operatoren und ihre Ein-/Ausgabetypen. Deren Implementierung und zulässige Geometrieklassen müssen im Kern registriert und versioniert werden. Ein neues Bauteil ist nur dann eine reine Datenänderung, wenn die vorhandenen Operatoren es ausdrücken können; ansonsten braucht es eine geprüfte Kernerweiterung. Insbesondere ist damit noch kein beliebiger Dachverschnitt für jede konkave Kontur zugesichert. Nicht unterstützte Eingaben werden begründet abgelehnt, nicht durch einen heimlichen Begrenzungsrahmen ersetzt.

**Ein Geometriemodell für Darstellung und Prüfung:** Aus denselben ausgewerteten Körpern werden Dreiecksmesh, Belegung, Dachhülle und Anschlüsse abgeleitet. Materialfarben oder Texturen ändern keine Kollision. Freiraum ist eine zusätzliche Verpflichtung und muss gegenüber der tatsächlichen Endgeometrie frei bleiben. Vereinfachte Prüfhüllen dürften nur konservative Ableitungen sein, keine zweite, unabhängig gepflegte Hausform.

## 4. Features und Varianten

Ein Feature enthält `id`, `kind`, `owner` und `variants`. Jede Variante verweist auf eine Rezeptur und kann lokale Eigenschaftsvorgaben enthalten. Varianten desselben Features müssen kompatible Eingabe- und Ausgabeanschlüsse besitzen; ihre zusätzlichen Parameter können unterschiedlich sein, etwa der Bogenanstieg nur beim Rundbogen.

Die Beispieldaten enthalten diese sechs Features:

1. **Geschoss:** Kontur → Körper, obere Kontur und Fassaden.
2. **Dach:** obere Kontur → Sattel- oder Walmdach.
3. **Obergeschossvorstoß:** Kontur + Vorderkante → erweiterte Kontur.
4. **Durchfahrt:** Wirtskörper + Durchgangsachse → ausgeschnittener Körper und reservierter Freiraum; bogenförmig oder rechteckig.
5. **Anbau:** angeschlossene Kontur → Geschoss mit eigenem Dach; Wohn-/Wirtschaftsanbau oder höherer Werkstattanbau.
6. **Grundstücksmauer:** Grenzverlauf → Mauer; gehört zum Grundstück, nicht zu einem zusätzlichen Haus.

### Nicht jedes Feature ist ein zusätzliches Mesh

Der Vorstoß verändert die Kontur, aus der das obere Geschoss und anschließend dessen Dach entstehen. Er klebt keine zweite Box an eine unveränderte Außenwand.

Die Durchfahrt ersetzt den Wirtskörper durch dessen ausgeschnittene Fassung. Der ursprüngliche volle Körper darf danach **nicht zusätzlich gerendert oder als belegt geprüft** werden. Ein aufgemaltes Bogentor genügt nicht.

`owner: building` gilt für bauliche Teile; `owner: plot` nur für Grundstückselemente. Ein Körpermodifikator erbt die Zuordnung seines Wirts, ein Konturmodifikator die seines Verbrauchers. Ein aufgelöster Plan darf dies nicht eigenmächtig überschreiben, um die Zusammenhängendkeitsprüfung zu umgehen.

## 5. Bauvorlage und Anschlüsse

Eine Vorlage definiert stabile, benannte **Slots**, keine fertig platzierten Objekte. Im Beispiel:

```text
Platzierungskontur → Erdgeschoss ────────────────→ optional ausgeschnittene Durchfahrt
                         │
                         └→ obere Kontur → optionaler Vorstoß → optionales Obergeschoss
                                                                 │
                                              oberstes Geschoss → Dach
Erdgeschoss-Fassade → angeschlossener Anbau mit Dach
Grundstücksgrenze   → Mauer mit freigehaltenen Zugängen
```

Jeder Slot nennt Feature, mögliche Varianten mit Gewichten, Anzahlbereich und Eingabebindungen. `min=1,max=1` bedeutet erforderlich, `min=0,max=1` optional und `max=0` verboten. Optionale Slots können separate `presenceWeights` für vorhanden/nicht vorhanden erhalten. Gewichte erlauben keine Verletzung harter Grenzen.

**V1 begrenzt einen Slot auf höchstens eine Instanz.** Für einen weiteren Anbau wird ein weiterer benannter Slot ergänzt. So bleiben Bezüge und Seeds eindeutig; eine spätere Wiederholung braucht ausdrücklich stabile Instanzschlüssel, nicht umsortierbare Indizes.

Eine Bindung wie `{"slot":"ground","instance":"only","output":"topOutline"}` führt einen Ausgang zu einem Eingang. `firstEnabled` wählt absichtlich den ersten **aktivierten** Ausgang, etwa Obergeschoss vor Erdgeschoss für das Dach. Ein aktivierter, aber geometrisch ungültiger Ausgang löst eine Ablehnung oder Suchalternative aus; er darf nicht still übersprungen werden.

`placement`-Bindungen werden vom Platzierungsplaner erzeugt: Hauptkontur, angeschlossene Anbaukontur, Durchgangsachse und Mauerverlauf. Diese Namen sind kein Ersatz für die dafür noch zu implementierende geometrische Suche.

Anschlüsse sind zusätzlich explizit: `stack`, `roof-cover` oder `wall-join`, mit erlaubten Fassadentags. Der Prüfer muss räumliche Übereinstimmung, tragenden beziehungsweise vorgesehenen Anschluss und Freihaltung kontrollieren. Ein bloßer Verweis „gehört zum Hauptbau“ oder eine zufällige Überschneidung beweist keinen gültigen Anschluss.

### Nur Endgeometrie zeichnen

`finalGeometry` benennt genau die aktiven Ausgänge, die zum Haus beziehungsweise Grundstück gehören. Für das Erdgeschoss ist das die Durchfahrtsfassung, falls aktiviert, andernfalls der ursprüngliche Körper. Obergeschoss, Dach und Anbau werden nur einmal aufgenommen. Besitzer werden aus Feature und Wirtsbezug abgeleitet. Modifikator-Zwischenstände und Freihaltevolumen sind keine zusätzlichen sichtbaren Bauteile.

## 6. Bauform, Nutzung und Zusammenführungsregeln

Die Beispiele enthalten drei Bauformprofile: `farmhouse`, `townhouse`, `hall-house`. Nutzungen sind separat: `rural-household`, `urban-living`, `smith-workshop`, `guild-hall`.

Damit ist ein Stadthaus nicht automatisch eine Schmiede, und eine Werkstatt braucht keinen eigenen vollständigen Hausgenerator. Im **Beispielprofil**, nicht als allgemeine historische Aussage, verlangt `smith-workshop` einen angeschlossenen Werkstattanbau; das Versammlungsprofil verwendet einen eingeschossigen Hallenbau. Öfen, Brandschutz und Innenraumorganisation sind damit noch nicht modelliert.

Die Zusammenführung ist verbindlich:

1. Vorlagen- und Profil-Anzahlbereiche werden **geschnitten**: größte Untergrenze, kleinste Obergrenze.
2. Erlaubte Feature-Varianten und Eigenschaftsdomänen werden ebenfalls geschnitten. Leere Schnittmenge bedeutet Widerspruch, keinen Zufalls-Fallback.
3. Bauplatz-`propertyLimits` können globale Eigenschaftsbereiche weiter einschränken; sie können sie nicht erweitern.
4. Vorgaben werden der Reihe nach ergänzt: Eigenschaft → Feature-Variante → Bauformprofil → Nutzungsprofil → explizite Hausanfrage. Nur Vorgaben sind überschreibbar, keine harten Grenzen.
5. Variantenlisten in zusätzlichen Slot-Bedingungen schränken die Auswahl ein. Positive Gewichte verbleibender Varianten werden miteinander multipliziert; Vorhanden-/Nichtvorhanden-Gewichte bleiben davon getrennt.
6. Ein explizit angeforderter Wert oder Slot bleibt bindend. „Vorstoß 0,65 m“, aber Bauplatzgrenze 0,5 m ergibt einen erklärten Konflikt. Eine freie Auswahl aus beiden Presets dürfte dagegen nur das kleinere wählen.

Die Auflösung hängt von der gewählten Feature-Variante ab: Bei einem Walmdach wird kein nur für Satteldächer definierter Achsenparameter erfunden. Variantenwechsel lösen die dazugehörigen Defaults und Parameter neu auf; ein ausdrücklich gesetzter, dann nicht mehr anwendbarer Parameter muss gemeldet werden.

## 7. Regeln und Bauplatzfreigaben

`rules` enthält harte Prüfungen und weiche Bewertungsziele. `globalRules` ist für jede Anfrage verbindlich; ein Profil darf diese Liste nicht abschalten. Vorlagenspezifische Abhängigkeiten wie „Vorstoß benötigt Obergeschoss“ stehen zusätzlich in `template.rules`. Nutzungsprofile nennen die Vorlage, deren Slots sie einschränken; ein unpassendes Paar wird abgelehnt, statt unbekannte Bedingungen zu ignorieren. Regel- und Metriknamen gehören zu einer registrierten, versionierten Bibliothek; unbekannte Namen sind Fehler, keine automatisch bestandenen Prüfungen.

Die vorgeschlagenen globalen und vorlagenspezifischen Prüfungen verlangen:

- genau ein räumlich zusammenhängendes Gebäude aus der fertigen 3D-Geometrie; Grundstücksmauern werden nicht als zweites Haus gezählt;
- vollständige Endgeometrie innerhalb des zulässigen Bauraums, einschließlich Dächern und Überständen;
- leere Schutz- und Durchgangsvolumen, auch nach allen Modifikatoren und Anbauten;
- eine berechtigte Straßenüberbauung;
- genau einen Haupteingang mit tatsächlich nutzbarem Anschluss an einen Weg;
- ein Obergeschoss, wenn sein Vorstoß aktiviert ist;
- gültige bauliche Anschlüsse.

Die Eingangsausrichtung kann auf die nächste Straßenkante bezogen werden. Eine grüne Richtungslinie allein beweist aber keinen nutzbaren Zugang. Die künftige Zugangsprüfung muss eine Route mit Breite und freier Höhe prüfen; ein torloser, geschlossener Mauerring darf diese Route nicht blockieren.

### Torbogen und Überhang: höhenabhängig statt pauschal verboten

Ein Bauplatz behält seine geplante Kontur und typisierten Straßen-/Wasserblocker. Ein Weg besitzt eine Fläche und `requiredClearHeight`; daraus entsteht ein immer freizuhaltendes Volumen bis zu dieser Höhe. Gewöhnliche Gebäudeteile dürfen ohne zusätzliche Erlaubnis auch darüber nicht in die Straßenprojektion hineinragen.

`road-overbuild` benötigt **beides**: Freigabe des Bauformprofils und eine Bauplatzfreigabe für die konkret benannten Straßen. Ein Modul erteilt sich diese Erlaubnis nicht selbst. Auch mit Erlaubnis bleiben Durchfahrtsbreite, lichte Höhe, Bauplatzkontur und Maximalhöhe harte Grenzen. Wasser und andere Schutzvolumen werden dadurch nicht freigegeben.

`protectedVolumes` sind Kontur-Prismen mit `id`, `kind`, `area`, `zMin` und `zMax`; `zMax: null` steht für eine nach oben unbeschränkte Sperre. Ein Solid darf deren Inneres nicht schneiden; zulässige Grenzberührung beziehungsweise zusätzlicher Abstand müssen die jeweiligen Prüfregeln explizit festlegen. Das ist keine statische oder baurechtliche Zertifizierung.

Beim Bogen bezeichnet `clearance` die durchgehend verfügbare rechteckige Mindesthöhe unterhalb des Bogenansatzes. `rise` kommt darüber hinzu; die größere Höhe in der Bogenmitte darf nicht als lichte Höhe über die gesamte Breite verkauft werden. Die Achse muss den Wirtskörper vollständig durchqueren. Ein zu schmaler Ausschnitt in einem breiteren geschützten Weg ist ungültig.

## 8. Konkrete Hausanfrage

```json
{
  "id": "urban-example",
  "catalogRevision": "draft-1",
  "site": "urban-plot",
  "buildingProfile": "townhouse",
  "useProfile": "urban-living",
  "seed": 42,
  "choices": {
    "slots": {
      "roof": { "variant": "gable" },
      "projection": { "enabled": true, "depth": { "preset": "small" } }
    }
  }
}
```

Die gleiche Bauform kann mit anderem Nutzungsprofil, anderem Dach oder anderem Vorstoß verwendet werden, ohne einen neuen Hausgenerator zu schreiben. Die Beispieldatei enthält außerdem Bauernhaus, Stadthaus mit Walmdach, Werkstatthaus, Versammlungshaus und Tordurchfahrt. Deren Geometrie muss ein späterer Solver erst nachweisen.

## 9. Aufgelöster Plan, Speicherung und Stabilität

Ein zukünftiger `ResolvedBuildingPlan` benötigt mindestens:

- eigene Formatversion, Anfrage-ID, Katalog- und Geometriekern-Revision sowie Eingabe-Fingerabdruck;
- gewählte Feature-Instanzen mit stabilen IDs, Slot, Variante und vollständig aufgelösten Eigenschaftswerten;
- konkrete Eingabegeometrien, Anschlüsse und lokale beziehungsweise Welt-Bezugssysteme;
- Verweise auf die tatsächlichen Endkörper sowie Freihaltevolumen;
- genau bezeichneten Haupteingang, Zielweg und geprüften Zugang;
- Prüfstatus und Meldungen mit Regel-ID, betroffener Instanz und Herkunft der Grenze;
- Bewertung und Suchbudget, damit „kein Treffer“ nicht als Unbebaubarkeitsbeweis erscheint.

Der Renderer erhält diesen aufgelösten Plan und abgeleitete Meshes, keine Zufallsentscheidungen oder Bauform-Sonderfälle. Solids und Ports müssen aus derselben Geometrieauswertung stammen.

Im Projekt werden Katalogrevision, Profile, Seed und bewusste Auswahlentscheidungen gespeichert. Soll ein bestehender Entwurf nach kleinen Konturänderungen möglichst bleiben, müssen auch die dazu bevorzugten Entscheidungen und Platzierungshinweise als versionierte Eingaben erhalten werden. Ein flüchtiger vorheriger Plan oder ein gleicher Seed allein garantiert keinen stabilen JSON-Roundtrip. Geometriecaches sind nur mit passendem Eingabe-Fingerabdruck wiederverwendbar.

Änderungen erhalten Teil-Seeds aus stabiler Anfrage-/Slot-/Entscheidungsidentität, nicht aus der Reihenfolge eines gemeinsamen Zufallsstroms. Beispielsweise soll eine andere Dachfarbe nicht sämtliche Anbauentscheidungen neu würfeln. Die weiche Metrik `preservePreviousChoices` bevorzugt erhaltene gültige Entwürfe, überstimmt aber keine neue harte Grenze.

## 10. Fehler statt stiller Ersatzlösungen

Meldungen sollten strukturierte Daten sein, beispielsweise:

```json
{
  "code": "property-out-of-domain",
  "requestId": "urban-example",
  "slot": "projection",
  "propertyId": "overhang.depth",
  "requested": 0.65,
  "allowedMax": 0.5,
  "source": { "kind": "site", "id": "urban-plot" }
}
```

Zu unterscheiden sind ungültige Katalogdaten, widersprüchliche Wünsche, nicht unterstützte Geometrieoperatoren, ausgeschöpfte Suche und ein gültiger Plan. Ein erforderliches Modul darf nicht verschwinden, damit die Anfrage scheinbar gelingt.

## 11. Einführung ohne Generator-Neustart

1. Datenformat, Referenzen, Einheiten, Variantenverträge und azyklische Verbindungen validieren.
2. Vorhandene Geschoss-/Satteldachgeometrie hinter die vorgeschlagenen Operatorverträge stellen. Einen Hauptbau mit Dach aus dem aufgelösten Plan darstellen.
3. Anbau und eindeutige Fassadenanschlüsse ergänzen; weiterhin ein verbundenes Gebäude.
4. Obergeschosskontur mit Vorstoß und abgeleitetes Dach ergänzen.
5. Echte Durchfahrt samt Freihaltevolumen, danach Grundstücksmauern und weitere Profile.
6. Erst bei funktionierenden Geometrieverträgen die Kandidatensuche und Bewertung ausbauen.

Vor einer Laufzeitintegration müssen gezielte Gegenbeispiele geprüft werden: Torbogen nur optisch statt ausgeschnitten, alter Wirtskörper doppelt gezeichnet, Dach auf unvergrößerter Kontur, Mauer schließt Zugang, optionale ungültige Geometrie wird heimlich übersprungen, Profile lockern harte Bauplatzgrenzen und Konturänderungen verschieben unbeteiligte Auswahlentscheidungen.

**Noch offen:** ausführbares Schema/Validator, Operatorimplementierungen und ihre exakten Geometriedomänen, Mesh-/Kollisionsprüfungen, Zugangs- und Anschlussprüfung, Suchalgorithmus sowie gestalterische Freigabe der Profile. Die Beispieldaten allein implementieren keinen dieser Schritte.
