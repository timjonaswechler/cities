# Bauteil-Zoo

Unter **http://localhost:5173/feature-zoo.html** einzelne Bausteine prüfen, bevor wir sie zu Häusern und Gebäudekomplexen zusammensetzen. Der Wegeditor und sein Karten-Generator bleiben getrennt.

## Erste Feature-Liste

| Feature          | Einstellbar                                                           |
| ---------------- | --------------------------------------------------------------------- |
| Raumkörper       | Breite, Tiefe, Höhe, Wandstärke, Tür/Schnitt, Material                |
| Dach             | Sattel-/Walm-/Pult-/Flachdach, Maße, Höhe, Überstand, Material        |
| Anbau            | Raummaße, Dachform/-höhe, Wand- und Dachmaterial                      |
| Überhang         | Unterbauhöhe, oberer Raum, Vorstoß, Konsolen, Material                |
| Torbogen         | Bogen/gerader Sturz, lichte Breite/Höhe, Bogenanstieg, Pfeiler, Tiefe |
| Grundstücksmauer | Länge, Höhe, Stärke, Abdeckung, Endpfeiler, Material                  |
| Verbindungsgang  | Länge, Breite, Bodenhöhe, Durchgangshöhe, offener/überdachter Gang    |

Anschlüsse sind farbige Pfeile; **Nutzraum** zeigt Aufenthalts- beziehungsweise Verkehrsbereiche getrennt von der festen Geometrie. Gestrichelte graue Körper sind nur Anschlussreferenzen, keine zusätzlichen Gebäude. Toröffnungen sind ausgesparte Geometrie, keine Textur.

## Prüfen

1. Feature links wählen, Eigenschaften rechts ändern. Jedes Feature behält seine Werte beim Wechsel.
2. Eine **Lokation** wählen. Dorf, Stadt und Institution sind editierbare Beispielprofile, keine historischen Normen.
3. Unter **Lokationsregeln** das Feature freigeben/sperren, Höhen- beziehungsweise Vorstoßgrenzen ändern und Baustoffe wählen. Diese Einstellungen gelten nur für dieses Feature in dieser Lokation.
4. Ungültige Versuche bleiben sichtbar, mit rotem Prüfergebnis. Eigenschaften werden nicht heimlich auf Grenzwerte gekürzt. Die Höhe wird aus der tatsächlichen Geometrie gemessen, einschließlich Abdeckung/Pfeilern und einer erhöhten Bodenlage.
5. **Konfiguration speichern** exportiert alle Feature-Einstellungen und Lokationsregeln als versioniertes JSON. **Laden** stellt sie wieder her; ungültige Dateien ersetzen den aktuellen Stand nicht.

Materialien sind zunächst unterscheidbare Farbtöne mit einfachen Oberflächeneigenschaften, noch keine Textur-Bibliothek. Die Prüfung umfasst die im Zoo angebotenen Freigaben und Grenzwerte, keine Statik, Bauplatzkollision oder vollständige Erschließung.

## Wie daraus später Häuser werden

Ein Bauelement ist nicht automatisch ein Aufenthaltsbereich. Ein Gebäudekomplex verbindet mehrere solcher Bereiche über einen gemeinsamen Hauptknoten, direkt oder indirekt. Ein Bauplatz kann mehrere Komplexe tragen; eine Grundstücksmauer ist kein zusätzliches Haus. Die Begriffe stehen im [Glossar](../GLOSSARY.md).

Die Anschlüsse und Nutzräume des Zoos sind die erste sichtbare Grundlage dafür. Das Zusammenstecken, der Hauptknoten-/Verbindungsgraph und die Zuordnung echter Bauplätze sind **noch nicht implementiert**. Die Ein-Gebäude-Begrenzung des bisherigen Karten-Blockouts ist keine allgemeine Domänenregel.

## Dateien

- `src/feature-catalog.ts`: Feature-Liste, Eigenschaften, Lokationsprofile, Freigaben und Importprüfung.
- `src/feature-geometry.ts`: gemeinsame parametrische Geometrie, gemessene Grenzen, Nutzräume und Anschlüsse.
- `src/feature-view.ts`: Darstellung, Kamera und Prüf-Overlays.
- `src/feature-zoo.ts`: Bedienelemente und JSON-Roundtrip.
- `tests/features.test.ts`: Geometrie einschließlich echter Öffnungen und material-/featurebezogener Regeln.
- `tests/browser/feature-zoo.spec.ts`: Bedienung, Variantenwechsel, Grenzwerte und Speicherung.

`npm run build` erzeugt Wegeditor und Zoo als getrennte HTML-Einstiege. Es gibt keine neue Laufzeitabhängigkeit und keinen automatischen Import des zurückgestellten großen Katalogentwurfs.
