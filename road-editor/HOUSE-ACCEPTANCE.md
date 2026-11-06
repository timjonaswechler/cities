# Hausvarianten: erster Meilenstein

Vor der Umsetzung festgelegtes Interface: `src/house-types.ts`. Meter, XY-Grundebene, +Z-Höhe, Winkel in Radiant. Ein ausdrücklich markierter achsenparalleler rechteckiger Bauplatz, ein gewählter Zugang am tatsächlichen Wegrand, eine Satteldach-Hausfamilie. Keine automatische Parzellierung und kein Rückgriff auf die verworfene Hausgalerie oder Rust-Hausplanung.

## Versuchsvorgaben

- Drei unterscheidbare Profile: 4 × 6 m / ein Geschoss / First längs; 6 × 8 m / zwei Geschosse / First quer; 8 × 5 m / ein Geschoss / First längs. Breite/Tiefe beziehen sich auf die lokale Hausausrichtung entlang des gewählten Wegrands.
- 2,8 m Geschosshöhe, Satteldach mit 45° Neigung und 0,5 m Überstand. Gesamte Dachhülle innerhalb des Bauplatzes, mindestens 0,5 m Abstand zu Weg und Wasser. Keine Verformung oder Beschneidung, um ein Haus passend zu machen.
- Geradliniger Zugang zwischen Hauseingang und ausgewähltem Wegrand: 1,2 m breit, höchstens 12 m lang, kein Wasser und kein Durchqueren anderer Wegeflächen. Das Ende darf in den ausgewählten Weg münden. Der außerhalb des Wegs liegende Zugang gehört zur Baufläche.
- Endliche Suche: höchstens 27 Kandidaten je Profil, höchstens ein Vorschlag je Profil. Seed bestimmt reproduzierbare Suchreihenfolge; weniger als drei Treffer und Ablehnungsgründe bleiben sichtbar. Kein Vollständigkeitsbeweis für alle möglichen Häuser.
- Übernommene Häuser behalten ihre konkrete Beschreibung. Änderungen an Weg, Wasser oder Bauplatz prüfen diese erneut; kein stilles Ersetzen durch einen neuen Vorschlag. Konflikte werden rot und textlich dargestellt.

Diese Werte sind technische Versuchsvorgaben, keine historischen Normen oder gestalterische Freigabe.

## Feste Prüffälle

Gerader Weg von (-30, 0) nach (30, 0), Breite 4 m; Zugang (0, 2), Tangente (1, 0):

- H01: Bauplatz (-12, 2) bis (12, 23) liefert drei gültige, sichtbar unterschiedliche Profile. Gleiche Anfrage ist reproduzierbar und verändert keine Eingaben.
- H02: Bauplatz (-2, 2) bis (2, 5) liefert keinen Vorschlag und eine Begründung.
- H03: Wasser über dem ganzen Bauplatz verhindert alle Vorschläge; eine kleine eingeschlossene Wasserfläche wird ebenfalls erkannt.
- H04: Nur der Dachüberstand kollidiert mit dem Weg: Haus ablehnen, obwohl der Wandgrundriss frei ist.
- H05: Wasser zwischen Eingang und Wegrand blockiert den Zugang.
- H06: Nachträgliches Verbreitern/Verschieben des Wegs meldet Konflikte am übernommenen Haus, ohne Hausdaten zu ersetzen.
- H07: Browserablauf: Bauplatz markieren, Zugang wählen, Vorschläge durchschalten, Haus übernehmen/entfernen, Undo/Redo und JSON-Roundtrip. Ungültige Hausdaten ersetzen das gültige Projekt nicht; Versionen 1–3 bleiben ladbar.
- H08: Three.js stellt dieselbe Hausgeometrie dar, die der reine Generator prüft; beide Dachrichtungen sowie die räumliche Ansicht sind sichtbar zu prüfen.

`npm run check` in `road-editor/` muss weiterhin sämtliche bisherigen Weg-/Wasserprüfungen bestehen. Visuelle Sichtung bewertet Proportionen, Dachwirkung, Variantenunterschiede und Wegeinbindung getrennt vom technischen Ergebnis.
