# Eingefrorener Schritt-3-Evaluator

Baseline HEAD `767e1160f714a99aa25016b680021af9744ef317`; Gesamt-Review gegen `6ea9dd29c9653035aa077e246ed13769a38b6bc2`. Beginn konservativ 2026-11-01 22:12 UTC; Ende spätestens 23:12 UTC. Maximal sechs Iterationen, drei sequentielle Reviews.

## Vor Implementierung festgelegt

- Purplechurch, seed 42, size 25, unveränderte Defaultoptionen. Die echte Quelle `exports/market-v1-city.json` im ursprünglichen Checkout wurde gelesen: vollständige City und Markt-Export sind zum frisch erzeugten Baselineexport JSON-identisch. V1/V2-Vergleichsdokumente und Marktprofil gelesen.
- Native Skalierung laut `mesh.rs`: Plan x/y → Welt x/z ×4; Höhen schon Meter. Keine Spiegelung. Bauplätze sind originale Gebäude-`polygon`-Konturen, **keine vermessenen Besitzgrenzen**.
- Feste Kandidaten: `3:0` Haus mit Anbau, `3:2` Stadthaus mit Tor; `3:1` (sieben Ecken) muss ohne Rechteckreparatur ausgelassen werden. Ausschließlich gewöhnliche `lot`, nicht `landmark`. IDs wählen Eingaben, nicht Generatorverhalten.
- Neue feste Fälle: beide positiven Plätze mit seed 7 und 91; `3:1` Ablehnung; geschütztes Sondergebäude Ablehnung; Wunsch Stadthaus bei 7 m Höhe → begründeter Haus-Fallback; 1 m Höhe → Nichtplatzieren; reservierte vollständige Bodenfläche → Nichtplatzieren; verbotener Überstand → Stadthaus ablehnen; Frontkante ist die zur echten Straßenmittellinie nächste Konturkante (nur Orientierungsheuristik, kein garantierter Zugang). Exakte Rohkonturen/Settings im Fixture.
- Obere Projektion bleibt dieselbe Kontur, nicht vergrößert. Standard 12 m Höhe, 0,6 m maximaler Vorstoß, Anbau erlaubt: explizite Versuchsbedingungen, keine alten impliziten Stadtwerte oder Normen. Boden-/obere Form/Zugang werden separat an den Kern gegeben. Straßen-/Mauerkorridore werden reserviert; Überschneidungen mit anderem Originalbestand werden konservativ abgelehnt.
- OriginalCity und nicht ausgewählte Gebäude bleiben Originalbestand. Neue City-Ausgabe eigener klar benannter Prototyp-Export mit OriginalCity und Entscheidungen/Requests/Designs/Meshes, keine alten Flächen als aktuelle Wirtschaftsanalyse. CLI und Aktionen E/B/Enter/R sowie sämtliche regenerierenden/profiländernden Aktionen werden in diesem kleinen statischen Opt-in-Modus ausdrücklich gesperrt.
- Maschineller Zoo-Import derselben Requests: Design und vollständige Meshdaten müssen JSON-identisch sein.
- Kamera Gesamtansicht: unverändertes `orbit_for`: yaw 0,15, pitch 0,95, extent×1,35, bisheriges Target. Detailvergleich `3:0`: identischer Target an Originalkontur, yaw 0,15, pitch 0,95, distance 85 m. Keine Ersatzstadt. Übersicht und Details jeweils Baseline/Prototyp tatsächlich ansehen.
- Bildrubrik (subjektiv): neue Typen auffindbar; Haupt-/Nebenform und geneigte Dächer lesbar; Tor im Detail möglichst erkennbar; alter Bestand bleibt sichtbar. Technische Abnahme ist keine gestalterische Freigabe.

## Ergänzende Ansicht (vor Implementierung festgelegt, 22:28 UTC)

Die festen Front-Details zeigen beide Dächer, aber verdecken den Torraum durch Originalbestand. Ergänzung, kein Ersatz: `--detail-lot 3:2 --detail-rear`, Target derselbe originale Konturmittelpunkt, yaw 0,15+π, pitch 0,65, distance 55 m, jeweils Original/Prototyp. Importierte Zoo-Requests richten ihre Kamera auf die tatsächliche Designprojektion statt die große Bauplatzmitte; synthetische Zoo-Kameras bleiben unverändert. Rubrik unverändert.

## Messung

Vor Adapterimplementierung neuen Evaluator mit einem ausdrücklichen Nichtimplementiert-Stub rot ausführen; Compilefehler zählt nicht. Danach identische feste Inputs und alte Korpora erneut. Lokale Checks: neun Core-Tests, Adapter/Zoo-Tests, neue Cityadapter-Tests und native CLI/Aktionsregressionen, `cargo check -p city_bevy`. Original-/Markt-/Snapshot-/V1-/V2-Exporte vor/nach JSON-identisch. Keine Workspace-Suite oder CI.

Bereits frisch beobachtet vor Änderungen: neun Core-Tests und drei Adapter-/Zoo-Tests grün; Original-/Markt-/Snapshot-Baselines erzeugt, Originalübersicht nativ gespeichert, Exit 0. Der neue Adapter existiert zu diesem Zeitpunkt noch nicht; keine neue Anforderung als bestanden behauptet.
