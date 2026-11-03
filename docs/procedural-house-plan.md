# Neustart: prozedurale 3D-Häuser

**Ausgangsbasis des Neustarts:** `4434217bbec51fca62c0cf72bc74b5ee576eb358`.
**Abgestimmte Richtung:** eigenständige TypeScript-/Three.js-Browsergalerie; Mittelalter-Fantasy; ausschließlich Haus-Blockouts.

## Ziel und Abgrenzung

Einzelne prozedurale **3D-Häuser** sollen später im lokalen Kontext einer Stadt entstehen. Dies ist kein neuer 2D-Stadtplaner und kein nachträgliches Zusammenführen von Stadtgrundrissen. Spätere Rust-Gebäudekerne, Markt- oder Formplanungen werden weder als Entwurfsgrundlage noch automatisch in den neuen Generator übernommen.

Die Stadt soll später erlaubte Bauflächen, zulässige Nutzungen und lokale Informationen liefern. Der Hausgenerator bestimmt daraus die tatsächliche Hausform und Platzierung. Er darf weder Häuser in beliebige Grundrisse quetschen noch geschützte Flächen überschreiten.

## Aktueller Stand: unabhängige Galerie

[Hauslabor](../house-gallery/README.md) implementiert einen eigenen TypeScript-Hausgenerator und eine Three.js-Darstellung, ohne Rust-Abhängigkeit oder Stadtimport.

- 9.136 synthetische Szenarien in elf Gruppen: Straßen, Wege, Kreuzungen, Sackgassen/Höfe, Freiflächen, Fließwasser, Ufer/Inseln sowie Zweifach-/Dreifachkombinationen und bewusste Grenzfälle.
- Reproduzierbare Seeds und vier einfache Volumenfamilien: Giebelhaus, Stadthaus, Langhaus, Winkelhaus.
- Unterschiedliche Breiten, Links-/Rechtsbögen, S-Kurven, Knicke, Kehren, Knotenarmzahlen und lokale Nachbarschaften.
- Rote teiltransparente Nachbarblocker; echte Sperrflächen; Wasser sichtbar unter Hausboden.
- Galerie, Filter, Einzelansicht, Kamera, Prüfhüllen und JSON-/PNG-Export.

**Gestaltungsreferenz:** ausschließlich die Nutzerbeschreibung „Mittelalter-Fantasy-Haus-Blockout mit lesbarer lokaler Umgebung“. Keine historische Genauigkeit und keine erfundene Bildreferenz. Noch keine Freigabe von Fassadendetails oder einer endgültigen Hausfamilie.

## Konstruktionsprinzip

**Erst plausible Baukörper, dann kontrollierte Variation.** Ein Seed wählt zusammenhängende Proportionen und Geschosse. Die lokale Umgebung beeinflusst Position, Ausrichtung und mögliche Abmessungen. Die vollständigen Dachhüllen einschließlich Überständen müssen in den freigegebenen Bauraum passen und Abstand zu Straßen, Wegen, Wasser, Nachbarn und geschützten Freiflächen halten.

Das reine Generator-Modul liefert eine Hausbeschreibung oder begründete Ablehnung. Three.js stellt diese Beschreibung dar und enthält keine zweite Hauskonstruktion. Alle Maße sind Meter; Y ist Höhe. Eine spätere Kartenumrechnung gehört in einen gesonderten Adapter.

Die endliche Suche ist kein vollständiger geometrischer Lösungsbeweis. Formstudien ohne nachgewiesenen direkten Zugang werden ausdrücklich gekennzeichnet. Ungelöste und absichtlich unmögliche Fälle bleiben sichtbar.

## Abnahme

Die [eingefrorene Matrix und Abnahme](../house-gallery/ACCEPTANCE.md) enthält Faktoren, diskrete Ausprägungen, IDs, Seeds, Ausschlüsse sowie technische und subjektive Kriterien. „Keine Variation ausgelassen“ bedeutet vollständige Abdeckung dieses endlichen Katalogs, nicht unendlich vieler möglicher Geometrien.

Technisch zu prüfen: Determinismus, gültige Geometrie/Meshes, wirkliche Topologien und Breiten, räumliche Einhaltung aller Bauteile, Reaktion auf veränderte lokale Daten, Material-/Wasserhöhen und Browserbedienung. Visuell getrennt: Silhouette, Dachwirkung, Lesbarkeit von Trassen, Wasser und Nachbarn sowie nachvollziehbarer Hausstandort.

Beobachtete Baselines, fokussierte Iterationen und Evidenz stehen im [Abnahmeprotokoll](proofs/house-gallery/README.md). Tests oder zusätzliche Varianten allein bedeuten keine gestalterische Freigabe.

## Spätere Etappen, noch nicht implementiert

1. Blockout-Proportionen gemeinsam beurteilen und eine erste Hausfamilie gestalterisch freigeben.
2. Lokale Anfrage und Erschließungsregeln anhand konkreter Stadtplätze präzisieren. Kein automatischer Import bisheriger Rust-Planungen.
3. Technischen Weg zwischen TypeScript-Generator und bestehender Stadt festlegen; noch keine Zusage einer Rust-Portierung oder Laufzeitbrücke.
4. Auf wenigen gespeicherten Plätzen erproben. Stadtgeometrie unverändert lassen; abgelehnte Plätze behalten ihre bisherige Darstellung.
5. Erst danach Details, weitere Familien und breiteren Stadteinsatz planen.

Innenräume, Wirtschaft, Grundstücksneuverteilung, Sonderbauten und geneigtes Gelände sind nicht Teil dieser Galerie.
