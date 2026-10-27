# Original generator reference oracle

> Historical report recovered from chat. The original browser snapshots and browser parity report are missing. `tests/fixtures/original/` now contains explicitly marked Node regenerations for the same eight URL cases, not the browser results described below. Current recovery scope: [recovery.md](../../../docs/recovery.md).

Captured on 2026-10-13 from the actual browser implementation, independently of the TypeScript extraction. The reference runs the complete [official `mfcg.js`](https://watabou.github.io/city-generator/mfcg.js) with its original Lime/OpenFL startup and original assets.

Source SHA-256: `b67cf2e75dcae555a9de56f49d897a04a0a2cbcdccc9e40df02c9f249459d86e` (1,311,759 bytes).

## Reproduce

Run `node scripts/oracle-server.mjs`, then open `http://localhost:5175/` with a fixture's `metadata.query`. The script verifies the source digest and caches the original bundle and assets under ignored `.rea/` analysis storage. No original full application bundle is placed under `public/` or imported by production code. The original HTML's analytics script is omitted; the local page uses the same `lime.embed('mfcg', 'openfl-content', 0, 0, {parameters:{}})` invocation.

The shared T3 browser reference tab during capture was `tab_k`. Other agents' `tab_g` and `tab_h` were not navigated. T3 `preview_evaluate` read the original object model and posted JSON to the loopback server's `/capture?name=NAME.json` endpoint. The endpoint only accepts simple `.json` filenames and writes them inside `tests/fixtures/original/`.

## Instrumentation boundary

The unique `aa.main()` call in the original minified source is preceded by an observational insertion. It exposes closure class registry `g` as `window.__mfcgClasses` and enum registry `y` as `window.__mfcgEnums`. It wraps `Ub.prototype.build` (the registered `com.watabou.mfcg.model.City` method), calls the original method with unchanged receiver and arguments, then records its returned model state and `C.seed`. The original return value is returned unchanged. The original algorithm, bootstrap, model dispatch, and random calls are untouched.

`window.__originalCoreSnapshot` is captured after `City.build` and `updateDimensions` have returned, before constructor `ModelDispatcher.newModel` listeners render anything. This boundary matters: for the requested seed, core RNG state is **533246748**, whereas the original renderer subsequently leaves RNG state **1902532254**. Both observations are recorded, but only the former belongs to the canonical comparison.

The pure serializer is [`scripts/original-canonical.mjs`](../scripts/original-canonical.mjs), exported as `canonicalCity(city, classes, enums, rngSeed)`. It retains full JavaScript numeric precision and array order. It records cell shapes and seeds, ward-specific polygons and trees, group blocks and lots, district names and grouping, city name, gates and walls, street/road/artery edge paths with adjacent cell identities, coast outlines, canal courses and widths, and build-end RNG state. References become stable array indices; transient Haxe object IDs, closures, rendering views, and lookup caches are excluded.

This is a structural generation oracle, not a pixel oracle. Renderer-only geometry or decorations created after the snapshot are outside its scope. Haxe ObjectMap fields are not serialized directly; this excludes lookup caches as well as canal bridge and watergate maps. The separately checked adapter projections cover bridge paths and wall openings for the default, river, coast, and coast-with-river cases. Those projection checks do not extend the twenty-four core snapshot comparisons to every omitted map field. Numeric agreement must be assessed against the saved data, not inferred from matching names or counts.

## Captured fixtures

Every fixture includes the original source digest, exact URL options, capture boundary, and canonical `data` object.

| Fixture | Seed | Size | City | Cells | Groups | Group lots | Core RNG |
| --- | ---: | ---: | --- | ---: | ---: | ---: | ---: |
| `seed-924709892.json` | 924709892 | 25 | Beggars Market | 181 | 21 | 577 | 533246748 |
| `seed-42.json` | 42 | 25 | Purplechurch | 181 | 14 | 415 | 1984970261 |
| `coast-river.json` | 924709892 | 25 | Misty Lake | 175 | 17 | 547 | 1640928607 |
| `all-false.json` | 42 | 25 | Skylight | 177 | 11 | 297 | 1872297951 |
| `inner-castle.json` | 924709892 | 25 | Black Market | 181 | 12 | 732 | 1470878815 |
| `shanty-greens.json` | 42 | 25 | Mooncrest | 181 | 16 | 722 | 663645571 |
| `size-5.json` | 924709892 | 5 | Blackchurch | 28 | 3 | 8 | 939406130 |
| `size-50.json` | 924709892 | 50 | Blackwall | 376 | 32 | 1664 | 1493375885 |

Group lots exclude stand-alone castle, temple, and farm buildings. The first fixture reproduces the supplied URL and the visibly observed original title **Beggars Market**. Repeating the reference after restarting the reproducible server yielded the same 381,570-byte `JSON.stringify(data)` and SHA-256 `0e64d5b7f3bab417694b27e94cf35dd778b02d0b8292f50eb1526b863202f5fd`.

Node syntax checks passed for both reference scripts.

## TypeScript comparison in the same browser

[`scripts/browser-parity.html`](../scripts/browser-parity.html) loads the extracted TypeScript kernel directly through Vite, runs each fixture's URL parameters with the original assets, and compares its canonical data against the frozen reference JSON. It bypasses the application adapter and renderer. Open `http://localhost:5173/scripts/browser-parity.html` while the Vite development server is running to repeat the check; `window.__browserParity` contains results and `window.__paritySnapshots` retains objects for diagnosis.

All **eight comparisons matched exactly**, including every serialized coordinate, building lot, ward group, district name, road, canal, wall, and build-end RNG state. There was no numeric tolerance or rounding. The coast-and-river case includes an original failed canal attempt followed by an identical RNG-dependent retry.

Reference and port ran in T3's Electron 44.4.2 / Chromium 152.0.7977.130 on the same host. A separate primitive-math probe established that the local Node 26.7.0 / V8 14.6.202.34-node.28 runtime differs in some transcendental results: `Math.cos(-5.543987035746693)` is `0.7390089172206585` in the browser and `0.7390089172206586` in Node. Across 101 sample inputs and six math functions, 25 results differed. Such tiny differences can later affect geometry branching and random-call counts. Browser fixtures therefore verify parity in their captured runtime; they do not establish bit-identical cross-engine output. Saved probe and result records are under `.rea/oracle/`.

The historical browser parity report included the SHA-256 of each complete canonical fixture and corresponding TypeScript output; that report file was not recovered. The browser harness imports the checked-in original naming assets; it does not need `.rea/` to run against the checked-in fixtures.

## Independent original bundle in Node

[`scripts/node-original-oracle.mjs`](../scripts/node-original-oracle.mjs) evaluates the **complete original shipped bundle** in a fresh `node:vm` context for each case. It selects the bundle's existing Worker initialization branch, replaces only `aa.main()` with registry exports, and supplies URL parameters, a clock, and in-memory storage and asset providers. Generation expressions and methods remain untouched. It invokes the original `Values.prepare`, `Blueprint.fromURL`, and `City` constructor directly. The skipped bootstrap would otherwise start OpenFL's canvas, audio, and application scenes.

[`tests/original-parity.test.ts`](../tests/original-parity.test.ts) compares the independently executed original and TypeScript port in the same Node runtime, across eight saved cases and sixteen unseen combinations. All twenty-four tests passed with exact complete canonical JSON hashes and RNG states. The default city's Node RNG is 1445851543 in **both** implementations; its browser RNG is 533246748 in **both** implementations. This verifies that the cross-runtime difference also exists in the untouched original.

On a fresh checkout, `ensureOriginalBundle` downloads the official artifact to `.rea/original/mfcg.js` and verifies its pinned digest before execution. Tests fail if the network, artifact, or digest is unavailable; parity is never silently skipped. After the initial download the reference is cached. Original text assets come from versioned `src/original/assets/`.
