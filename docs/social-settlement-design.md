# Entwurf: Betriebe, soziale Unterschiede und Institutionen

Gestaltungsrahmen aus der gemeinsamen Diskussion, noch keine neue Generatorfunktion. Die [Begriffe](../GLOSSARY.md) trennen Betriebe und Institutionen von Gebäuden und Grundstücken. Vorgaben sind von folgenden Vorschlägen und offenen Zahlenwerten zu unterscheiden.

## Festgehaltene Vorgaben

- Die gezeigte besonders dichte Mietbebauung gehört in arme Viertel, nicht als allgemeiner Bautyp zufällig in die ganze Stadt. Eine soziale Zuordnung der bestehenden Generatorbebauung ist noch nicht implementiert.
- In kleinteiliger Bebauung können Wohnung und Werkstatt getrennt, aber direkt benachbart liegen; ein gemeinsames Grundstück mit Arbeitsbereich ist möglich.
- In höheren Gebäuden sind Betriebe unten und Wohnungen darüber erwünscht, **wenn der konkrete Betrieb diese Kombination zulässt**. Geschosszahl allein erzwingt keine Mischnutzung.
- Beim Ausbau dürfen keine zusätzlichen individuellen Straßen-/Zufahrtsstummel zu den Häusern entstehen. Bestehende Straßen bleiben erhalten; eine Erreichbarkeitsprüfung ist keine neu zu zeichnende Straße.
- Manche Betriebe brauchen weiterhin eigene Gebäude oder Grundstücke. Andere sollen wegen Sicherheitsrisiken, Schmutz oder ähnlicher Belastungen eher außerhalb dichter Wohnbebauung liegen.
- Anwesen sind der ausdrücklich berechtigten obersten Elite vorbehalten. Sie entstehen nicht zufällig aus einem Wohlstandswert und sind keine Standardbelohnung für jeden reichen Haushalt. Die konkrete Berechtigung und Anzahl sind noch zu bestimmen.
- Klöster und weitere Institutionen sollen als mögliche stadtprägende Einrichtungen untersucht werden, nicht bloß als beliebige zusätzliche Gebäude.
- Nicht jeder Siedlungsgröße steht dieselbe vollständige Gebäude-/Institutionsauswahl zu. Bedarf, Umfang und Entstehungsregeln sollen mit der Siedlungsgröße variieren; konkrete Grenzwerte stehen noch nicht fest.

## Vorgeschlagenes Unterbringungsmodell

Ein Betrieb erhält ein Eignungsprofil statt einer pauschalen Handwerksplatzierung: Verträglichkeit mit Wohnungen darüber, Flächenbedarf, Lieferzugang, Wasserbedarf sowie modellierte Feuer-, Lärm- und Schmutzbelastung. Dieses Profil begründet Mischnutzung, benachbarte getrennte Gebäude oder einen abgesetzten Standort. Einzelne Gewerbeprofile und deren historische Einordnung sind noch nicht recherchiert oder abgestimmt; Beispiele sind keine allgemeingültigen historischen Regeln.

Grundstück und Gebäudetyp werden danach gemeinsam gewählt. Dadurch sind ein Vorderhaus mit rückwärtiger Werkstatt, ein gemischt genutztes Geschossgebäude oder ein eigenständiger Produktionshof darstellbar, ohne dass jeder Betrieb zum selben Haustyp wird. Der frühere zufällig wirkende Einzelgebäude-Hofausschnitt ist weiterhin nicht akzeptiert.

## Siedlungsgröße ist nicht die einzige Voraussetzung

Vorschlag: Siedlungsmaßstab und Siedlungsrolle getrennt betrachten. Einwohner-/Haushaltsbedarf und verfügbare Arbeitskräfte können Häufigkeit und Kapazität bestimmen; eine Handels-, Herrschafts-, Hafen- oder Klosterfunktion kann besondere Einrichtungen begründen. Ein Kloster könnte im Modell selbst Anlass einer kleinen Siedlung sein, statt ausschließlich über eine Größenfreischaltung zu entstehen. Diese Rollen und Voraussetzungen sind noch kein beschlossenes Erzeugungssystem.

Die derzeitige Generatoroption `size` ist nicht als Einwohnerzahl kalibriert; `CityOptions` führt eine optionale `population` separat. Größenregeln dürfen daher noch keine scheinbar belastbaren Einwohnergrenzen aus dem Geometrieparameter ableiten.

## Anschluss an Marktplanung V1

Haushalte, Betriebe und Institutionen können künftig unterschiedliche, explizite Nachfrageeingaben liefern. Grundversorgung soll nicht vom Vermögen abhängen. Vermögen oder institutionelle Funktion können andere Angebote und Lieferbedarfe begründen, nicht automatisch einen eigenen Markt.

Das ist noch nicht implementiert: Die native Anwendung verwendet weiterhin den Grundflächen-Proxy. Das [V1-Interface](market-planning-v1.md) bietet nur den Anschluss für vorab berechnete Nachfragegewichte; keine automatische Rückkopplung oder Gebäudeverteilung. Geschlossene Grundstücke und Institutionen müssten außerdem bei späteren Wegeänderungen berücksichtigt werden, statt Hofverbindungen pauschal als öffentlich begehbar anzunehmen.

## Offene Gestaltungsfragen

- Welche Betriebe sind mit welchen Wohn-/Gebäudetypen verträglich, welche brauchen getrennte Standorte?
- Wie werden Haushalte, Arbeitsplätze und Betriebsgrößen plausibel mit dem Siedlungsmaßstab verbunden?
- Welche konkrete Person/Funktion berechtigt zu einem Anwesen, und wie wird deren Zahl begrenzt?
- Welche Institutionen werden zuerst erprobt, welche benötigen eine besondere Siedlungsrolle?
- Welche Unterschiede sollen schon ohne Nutzungsfarben im Grundriss erkennbar sein?

Es wurden noch keine neuen Prototypläufe oder historischen Belege für diese Vorgaben erhoben. Die bisherige [Experimentierspur](organic-city-experiments.md) und der produktive Originalmodus bleiben unverändert.
