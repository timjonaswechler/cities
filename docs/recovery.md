# Wiederherstellung aus Archiv.zip

Das aktive Projekt ist die gerettete Rust-/Bevy-Variante. Die TypeScript-Anwendung bleibt ausführbar unter `backlog/typescript-2026-10-14/`.

## Quellen und Verfahren

Die ZIP enthält sechs JSONL-Verläufe. Vier gehören zum verlorenen Projekt `newCites`: Hauptverlauf, Renderer, Originalreferenz und Modellabhängigkeiten. Zwei betreffen `woodpecker` und wurden ausgeschlossen.

Statt ganze Chats einzulesen, wurden Ereignistypen, Quellcode-Patches, Dateischreibvorgänge und relevante Abschlussmeldungen indiziert. 155 Quellereignisse wurden dedupliziert und in zeitlicher Reihenfolge in einem temporären Verzeichnis rekonstruiert. Historische Shell-Sitzungen wurden nicht ungeprüft ausgeführt. Die Fundstellen und die SHA-256 der ZIP stehen in [recovery-source-map.json](recovery-source-map.json).

## Gerettet und neu erzeugt

- Rust-Workspace mit unabhängigem Generator `city_core` und Bevy-Anwendung `city_bevy`, exakt Bevy 0.20.0.
- Generator-Kompatibilitätsschicht, Numerik, öffentliches Datenmodell, Projektion, Triangulation, 3D-Meshes, Bedienung und Exportfunktionen aus den aufgezeichneten Quelländerungen.
- TypeScript-Anwendung einschließlich SVG-Renderer, URL-Zustand, Warp/Undo und Tests.
- Extraktions- und Übersetzungsskripte. Damit wurden der TypeScript-Kern und seine **790 nativen Rust-Funktionen** erneut erzeugt.
- Das noch erreichbare Originalbundle ist bytegleich zum damals verwendeten Artefakt: SHA-256 `b67cf2e75dcae555a9de56f49d897a04a0a2cbcdccc9e40df02c9f249459d86e`. Auch alle fünf Namensassets stimmen mit der im Chat ausgegebenen Provenienz überein.
- Acht URL-Referenzfälle, 24 Rust-Referenzen und drei Adapterreferenzen wurden durch die geretteten Skripte aus dem vollständigen unabhängigen Originalprogramm neu erzeugt. Sie stammen nicht aus der Rust-Implementierung.
- Beide damaligen Vorschaugrafiken ließen sich aus Bilddaten im Chat retten. Die TypeScript-Vorschau bleibt eine historische Aufnahme. `docs/bevy-preview.png` wurde anschließend durch den erfolgreich geprüften neuen Metal-Renderlauf ersetzt.

`Cargo.lock`, `package-lock.json`, Fontmetriken, eingebettete TTF-Schriften und der Webbuild wurden neu erzeugt. Die ursprünglichen Lockfiles waren nicht vollständig im Chat enthalten; neue Patchversionen von Abhängigkeiten sind deshalb möglich. Die neu erzeugten Lockfiles halten den jetzt geprüften Stand fest.

## Verifikation

Auf macOS ARM64 mit Rust 1.97.1 und Node 26.7.0:

- TypeScript: **62 Tests in sieben Dateien bestanden**, einschließlich 24 unabhängiger Originalvergleiche; Strict-Typecheck und Produktionsbuild bestanden.
- Rust-Kern: **fünf Tests bestanden**, darunter alle 24 vollständigen kanonischen Originalmodelle ohne Zahlentoleranz, drei vollständige Adaptervergleiche, Wiederholbarkeit, Eingabevalidierung und Blueprint-Replay.
- Bevy: **drei Tests bestanden** für Triangulation, Meshdaten und asynchrone Bedienung. Zusammen mit dem Kern bestehen alle **acht Rust-Tests** im wiederhergestellten Projektverzeichnis.
- `cargo build`, `cargo fmt --all --check` und Clippy mit `-D warnings` bestanden. Die im alten Verlauf ausgeführten automatischen Clippy-Korrekturen wurden erneut angewandt, geprüft und anschließend durch alle Tests abgesichert.
- Nativer Metal-Renderlauf bestanden; neue Aufnahme mit 1440 × 960 Pixeln unter [bevy-preview.png](bevy-preview.png). Der Smoke-Test prüft, dass die Aufnahme nicht leer ist.
- Fensterloser CLI-JSON-Export für Seed 42 / Größe 5 erfolgreich: `Noonrock`, acht Gebäude, Format `new-cities`, Version 1.
- Archivprüfung: **64 wiederhergestellte Dateien** anhand der neuen Prüfsummenbasis erfolgreich geprüft.

Die Archivdateiliste ist eine neue Prüfsummenbasis der wiederhergestellten TypeScript-Dateien, keine gerettete Liste der verlorenen Originaldateien.

## Grenzen

Die ausführbaren Varianten sind rekonstruierbar, aber keine bytegenaue Wiederherstellung des gesamten damaligen Projektordners:

- Die ursprünglichen acht **Browser**-Snapshotdateien, ihr Browserbericht, mehrere REA-Analyseartefakte und die Git-Objekte fehlen. Historische Dokumentation ist entsprechend markiert. Die jetzigen acht Dateien unter `tests/fixtures/original/` sind gekennzeichnete **Node-Neuerzeugungen**. Vor einem Browservergleich müssen neue Browserreferenzen erfasst werden.
- Die im Chat erwähnte Commit-ID `b949a2b` belegt keinen hier wiederhergestellten Commit; Git-Historie wurde nicht erfunden und kein neuer Commit erstellt.
- Die Bevy-Ansicht extrudiert die ursprünglichen 2D-Grundrisse auf einer Ebene. `HeightField` ist vorbereitet; Geländeangleichung, Terrassierung und hangabhängige Straßenplanung waren noch nicht implementiert.
- Der Rust-Generator ist ein mechanischer nativer Port mit dynamischen Haxe-Werten, kein neu entworfener idiomatischer Geometriealgorithmus. Zur Ausführung benötigt er weder Node noch eine JavaScript-Engine.

Start der Rust-Anwendung: `cargo run` im Projektverzeichnis. Ohne Fenster exportieren: `cargo run -p city_core --example export > city.json`.
