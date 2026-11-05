# Hausvarianten: lokale Nachweise

Erster neuer Haus-Meilenstein gemäß [Checkliste](../HOUSE-CHECKLIST.md) und vorab festgelegten [Prüffällen](../HOUSE-ACCEPTANCE.md). Kein Rückgriff auf die verworfene Hausgalerie. Zwei getrennte Implementierungs-Subthreads für Generator bzw. Bedienung/Darstellung; Integration im Hauptthread.

## Beobachtete Prüfungen

- Ausgangsstand: `npm ci && npm run check` erfolgreich, 53 Geometrieprüfungen und 14 Chromium/WebGL-Browserprüfungen.
- Nach Integration: `npm run check` erfolgreich, 128 reine Prüfungen und 22 Chromium/WebGL-Browserprüfungen, einschließlich aller bisherigen Weg-/Wassertests. Formatprüfung, Typecheck und Produktionsbuild erfolgreich. Keine beobachteten Browser-/Konsolenfehler.
- Neue reine Prüfungen: drei reproduzierbare Profile, unveränderte Eingaben, begrenzte Suche, vollständige Dachhülle, Abstände einschließlich eingeschlossener Hindernisse und Löcher, tatsächlicher Wegrand, volle Zugangsbreite, Wasser-/Wegeblockierung, beide Firstrichtungen, endliche und geschlossene Rendergeometrie, JSON-Versionen 1–4 und Undo/Redo.
- Neue Browserabläufe: echten Weg zeichnen, Bauplatz markieren, Wegrand wählen, drei Vorschläge durchschalten, übernehmen/entfernen, Undo/Redo, JSON-Roundtrip, abgelehnte kleine/nasse Bauplätze, ungültige Eingaben/Importe sowie Konfliktanzeige nach Wegänderung ohne Hausersatz.
- Während der ersten Browserprüfung unterschieden sich `-0` und `0` im direkten Objektvergleich nach JSON-Laden. Der Roundtrip-Vergleich verwendet jetzt die JSON-repräsentierbaren Projektdaten; keine Geometrie oder Erwartung an Hausmaße wurde dafür verändert.

Der bereits im Ausgangsstand vorhandene Vite-Hinweis zum großen JavaScript-Bundle bleibt bestehen. Keine neuen Abhängigkeiten. Rust-Code und Rust-Assets wurden nicht verändert; Rust-Tests wurden nicht ausgeführt.

## Visuelle Sichtung

Im lokalen Chromium bei 1440 × 1000 geöffnet, bedient, aufgenommen und angesehen:

- [Draufsicht mit Bauplatz und Zugang](house-top.png).
- [Eingeschossiger Baukörper mit längs gerichtetem First](house-spatial-0.png).
- [Zweigeschossiger Baukörper mit quer gerichtetem First](house-spatial-1.png).
- [Konflikt am unverändert übernommenen Haus nach Wegänderung](house-conflict.png).

Beide Dachrichtungen, unterschiedliche Volumen, der Abstand zum Weg und die rote Konfliktmarkierung sind sichtbar. Dies ist eine subjektive Blockout-Sichtung des Hauptthreads, keine gemeinsame gestalterische Freigabe oder historische Validierung. Der nächste gemeinsame Schritt bleibt die Beurteilung der Proportionen.

## Grenzen

Genau ein manuell markierter achsenparalleler rechteckiger Bauplatz und eine Hausfamilie mit drei festen Profilen. Kein Nachbarhausmodell, keine automatische Parzellierung, keine Innenräume oder Fassadendetails. Scharf geknickte Zugänge können konservativ abgelehnt werden; die endliche Suche beweist nicht, dass ein abgelehnter Platz grundsätzlich unbebaubar ist. Übernommene Häuser müssen vor einem neuen Variantenvergleich ausdrücklich entfernt werden; Undo erhält die alte Auswahl.

## Unabhängiges Review

Sol-loop, GPT-6.1 Sol über Pi, `thinking: xhigh`; höchstens drei Runden. Verbrauchsdaten wurden nicht gemeldet. Umfang vor Runde 1: 24 Dateien, +2.508/−23 Zeilen.

| ID  | Schwere | Befund                                                                             | Ergebnis                                                                                                                                                                                                            |
| --- | ------- | ---------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| S1  | should  | Seed-Änderung per Blur ersetzte die Aktion vor dem direkten Übernahmeklick.        | Behoben: Aktionsbuttons bleiben eingehängt; Browserregression ohne Tab erst fehlgeschlagen, danach bestanden.                                                                                                       |
| S2  | should  | Import prüfte Maße, Geschosse und First nicht als zusammengehöriges Profil.        | Behoben: gemeinsamer Profilkatalog für Generator und Import; reine und Browserregression, letztere erst fehlgeschlagen, danach bestanden. Räumliche Konflikte bleiben weiterhin ladbar.                             |
| S3  | should  | Nach ungültigem Seed konnte der erhaltene Übernahmeklick das alte Haus übernehmen. | Behoben: ungültigen Eingabetext und Fehler erhalten, Übernahme bis zur Korrektur abbrechen. Negative/leere Eingabe mit direktem Klick sowie anschließende Korrektur ohne Tab erst fehlgeschlagen, danach bestanden. |

Runde 1: `CHANGES`. Runde 2: S1/S2 aufgelöst, S3 gefunden. Nach S3-Korrektur vollständiger Check mit 128 reinen und 22 Browserprüfungen bestanden. Runde 3: `APPROVE`; S3 aufgelöst, S1/S2 weiterhin aufgelöst, keine neuen Befunde. Der Reviewer hat zusätzlich alle fünf betroffenen Chromium-Regressionen erfolgreich ausgeführt. Keine offenen oder abgelehnten Befunde. Umfang nach Verhaltenskorrekturen vor Abschluss der Dokumentation: 24 Dateien, +2.646/−25 Zeilen.
