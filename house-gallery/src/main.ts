import "./style.css";
import type {
  Family,
  HouseResult,
  Scenario,
  ScenarioSpec,
  View,
} from "./model";
import { FAMILY_LABELS, NEIGHBOR_LABELS } from "./model";
import { CATALOG, GROUPS, buildScenario, widthLabel } from "./scenarios";
import { generateHouse } from "./generator";
import { describeContext, matchesContext } from "./presentation";
import { InspectorRenderer, ThumbnailRenderer } from "./scene";

const $ = <T extends HTMLElement = HTMLElement>(selector: string): T =>
  document.querySelector<T>(selector)!;
const escape = (text: string): string =>
  text.replace(
    /[&<>"']/g,
    (char) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        char
      ]!,
  );
const format = (value: number): string => value.toLocaleString("de-DE");
const pageSize = 12;
const count = (group: string) =>
  CATALOG.filter((s) => s.group === group).length;
const icon = `<svg viewBox="0 0 32 32" fill="none" aria-hidden="true"><path d="M4 15 16 5l12 10M8 13v14h16V13M13 27v-9h6v9" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/><path d="M23 10V5h-4" stroke="currentColor" stroke-width="1.6"/></svg>`;
const factsById = new Map(
  CATALOG.map((spec) => [spec.id, describeContext(buildScenario(spec))]),
);
const routeTokens = [
  ...new Set([...factsById.values()].flatMap((facts) => facts.routeProfiles)),
];
const waterTokens = [
  ...new Set([...factsById.values()].flatMap((facts) => facts.waterProfiles)),
];
const params = new URLSearchParams(location.search);
const allowedFamilies = Object.keys(FAMILY_LABELS);
const initialSeed = Number(params.get("seed") ?? 42);
let seed =
  Number.isInteger(initialSeed) && initialSeed >= 0 && initialSeed <= 0xffffffff
    ? initialSeed
    : 42;
let family: Family = allowedFamilies.includes(params.get("family") ?? "")
  ? (params.get("family") as Family)
  : "auto";
let view: View = params.get("view") === "top" ? "top" : "perspective";
let group = params.get("group") ?? "overview";
if (!["overview", "all", ...GROUPS.map((g) => g.id)].includes(group))
  group = "overview";
let page = Math.max(0, Math.floor(Number(params.get("page")) || 0));
let selected: ScenarioSpec | undefined;
let thumbnail: ThumbnailRenderer | undefined;
let inspector: InspectorRenderer | undefined;
let revision = 0;
let filtered: ScenarioSpec[] = [];
let current: { scenario: Scenario; result: HouseResult } | undefined;
let webglFailed = false;
const layers = { blockers: true, constraints: false };

$("#app").innerHTML = `
<header class="topbar">
  <a class="brand" href="./" aria-label="Hauslabor Startseite"><span class="brand-icon">${icon}</span><span>HAUS<span class="brand-light">LABOR</span><small>MITTELALTER · FANTASY</small></span></a>
  <div class="topbar-caption"><span class="status-dot"></span> GENERATIVE FORMSTUDIEN <span class="divider">/</span> <span class="muted">V.01</span></div>
  <span class="mode-badge">NUR BLOCKOUTS <span>↗</span></span>
</header>
<div class="workspace">
  <aside class="sidebar" aria-label="Szenarien und Filter">
    <div class="sidebar-heading"><span>01 / SZENARIEN</span><span>${format(CATALOG.length)}</span></div>
    <nav aria-label="Szenariengruppen">
      <button class="nav-button" data-group="overview"><span class="nav-symbol">◈</span><span>Überblick</span><span class="nav-count">12</span></button>
      <button class="nav-button" data-group="all"><span class="nav-symbol">▦</span><span>Alle Fälle</span><span class="nav-count">${format(CATALOG.length)}</span></button>
      <div class="nav-divider"></div>
      ${GROUPS.map((g, i) => `<button class="nav-button" data-group="${g.id}"><span class="nav-number">${String(i + 1).padStart(2, "0")}</span><span>${g.short}</span><span class="nav-count">${format(count(g.id))}</span></button>`).join("")}
    </nav>
    <div class="sidebar-section"><div class="sidebar-heading">02 / EINGRENZEN</div>
      <label class="field-label" for="route-width">Straßen- / Wegbreite</label><select id="route-width"><option value="">Alle Breiten</option>${routeTokens.map((w) => `<option value="${w}">${widthLabel(w)}</option>`).join("")}</select>
      <label class="field-label" for="water-width">Wasserbreite (Trassen)</label><select id="water-width"><option value="">Alle Breiten</option>${waterTokens.map((w) => `<option value="${w}">${widthLabel(w)}</option>`).join("")}</select>
      <label class="field-label" for="neighbors">Nachbarschaft</label><select id="neighbors"><option value="">Alle Nachbarschaften</option>${Object.entries(
        NEIGHBOR_LABELS,
      )
        .map(([id, label]) => `<option value="${id}">${label}</option>`)
        .join("")}</select>
      <button id="clear-filters" class="text-button">Filter zurücksetzen ↺</button>
    </div>
    <div class="legend"><div class="sidebar-heading">LEGENDE / LOKALE DATEN</div>
      <span><i class="swatch house"></i>Generiertes Haus</span><span><i class="swatch road"></i>Straße / Brückenstreifen</span><span><i class="swatch path"></i>Weg / Hofzufahrt</span><span><i class="swatch water"></i>Abgesenktes Wasser</span><span><i class="swatch blocker"></i>Nachbar · Kollisionsblocker</span><span><i class="swatch square"></i>Freizuhaltender Platz</span>
      <p>Meter · Y nach oben<br>Keine Stadt- oder Rust-Daten.</p>
    </div>
  </aside>
  <main>
    <section class="intro">
      <div><p class="eyebrow">EINE WERKBANK FÜR PROZEDURALE HÄUSER</p><h1 id="heading">Ein Haus.<br>Viele Nachbarschaften.</h1><p id="description" class="intro-description">Baukörper und Dächer im lokalen Kontext. Keine Texturen, keine Fassadendetails – zuerst muss die Form stimmen.</p></div>
      <div class="intro-aside"><span class="edition-mark">H<span>/</span>01</span><p>${format(CATALOG.length)} definierte Fälle<br>11 Szenariengruppen · 4 Hausformen</p><button id="show-matrix" class="outline-button">Variantenmatrix ansehen ↗</button></div>
    </section>
    <section class="controls" aria-label="Generator und Darstellung">
      <form id="seed-form" class="seed-control"><label for="seed">SEED</label><input id="seed" type="number" min="0" max="4294967295" step="1" value="${seed}" required aria-label="Generator-Seed"><button type="submit" title="Seed anwenden" aria-label="Seed anwenden">↵</button><button id="next-seed" type="button" title="Nächster Seed" aria-label="Nächster Seed">↻</button></form>
      <label class="family-control"><span>HAUSFORM</span><select id="family" aria-label="Hausform">${Object.entries(
        FAMILY_LABELS,
      )
        .map(([id, label]) => `<option value="${id}">${label}</option>`)
        .join("")}</select></label>
      <div class="view-switch" role="group" aria-label="Kamera"><button data-view="perspective">◈ Perspektive</button><button data-view="top">▦ Draufsicht</button></div>
      <label class="check-control" title="Nur Sichtbarkeit: versteckte Blocker bleiben Kollisionshindernisse."><input id="show-blockers" type="checkbox" checked> Blocker sichtbar</label>
      <label class="check-control"><input id="show-constraints" type="checkbox"> Prüfhüllen</label>
    </section>
    <section class="results-header"><div><span class="eyebrow" id="group-label">AUSGEWÄHLTE SITUATIONEN</span><h2 id="result-count">12 Studien</h2></div><label class="search-box"><span aria-hidden="true">⌕</span><input id="search" type="search" placeholder="Szenario suchen …" aria-label="Szenario suchen"></label><button id="export-catalog" class="text-button">Katalog JSON ↓</button></section>
    <p id="filter-hint" class="filter-hint" hidden></p>
    <div id="error-banner" role="alert" hidden></div>
    <div id="gallery" class="gallery" aria-label="3D-Hausstudien" aria-busy="true"></div>
    <div class="pagination"><span id="page-info" aria-live="polite"></span><div><button id="previous-page" class="outline-button">← Zurück</button><button id="next-page" class="outline-button">Weiter →</button></div></div>
    <footer><span>FORM VOR DETAIL. KONTEXT VOR ZUFALL.</span><span>TypeScript + Three.js · deterministisch · lokal</span></footer>
  </main>
</div>
<dialog id="inspector-dialog" class="inspector-dialog" aria-labelledby="inspector-title">
  <div class="dialog-header"><span class="eyebrow">EINZELSTUDIE / INTERAKTIV</span><button id="close-inspector" class="icon-button" aria-label="Einzelansicht schließen">✕</button></div>
  <div class="inspector-layout"><div class="inspector-visual"><div id="inspector-canvas"></div><div class="viewport-toolbar"><button id="reset-camera" class="outline-button">Kamera zurücksetzen</button><span>Ziehen: drehen · Rad: zoomen · Rechts: verschieben</span></div></div>
  <aside class="inspector-details"><p id="inspector-group" class="eyebrow"></p><h2 id="inspector-title"></h2><div id="inspector-facts"></div><div class="inspector-actions"><button id="download-case" class="primary-button">Anfrage + Modell JSON ↓</button><button id="download-image" class="outline-button">Ansicht PNG ↓</button><button id="copy-link" class="text-button">Link zur Studie kopieren ↗</button><input id="copy-fallback" aria-label="Link zur Studie" readonly hidden><span id="copy-status" role="status"></span></div><div class="case-navigation"><button id="previous-case" class="outline-button">← Vorherige</button><button id="next-case" class="outline-button">Nächste →</button></div></aside></div>
</dialog>
<dialog id="matrix-dialog" class="matrix-dialog" aria-labelledby="matrix-title"><div class="dialog-header"><span class="eyebrow">KATALOG / ABDECKUNG</span><button id="close-matrix" class="icon-button" aria-label="Variantenmatrix schließen">✕</button></div><div class="matrix-content"><h2 id="matrix-title">Systematisch, nicht zufällig gesammelt.</h2><p>Jede Kombination der aufgeführten Achsen wird erzeugt. Straßen- und Wasserbreiten sind in kombinierten Gruppen unabhängig. Neutrale Katalogfaktoren sind keine physischen Breiten: r6 bei Freiflächen und Grenzfällen sowie w7 bei Teich-/Uferflächen werden nur als Buchhaltung mitgeführt. Karten, Suche und Breitenfilter verwenden stattdessen die tatsächlich vorhandenen Trassen; freie Gewässerflächen besitzen keine Trassenbreite. Seed und Hausform variieren zusätzlich.</p><p class="matrix-caveat">Vollständig innerhalb dieser endlichen Matrix – nicht sämtliche denkbaren Kurven, Geometrien oder Verkehrsplanungen. Spiegelungen sind explizite Fälle; Formstudien ohne Zugang bleiben als solche gekennzeichnet. Es gibt keine versteckte Auswahl nur gelungener Häuser.</p><div class="table-scroll"><table><thead><tr><th>Gruppe</th><th>Formen</th><th>Breitenprofile</th><th>Spiegelungen</th><th>Wasserhöhen</th><th>Größen</th><th>Zugänge</th><th>Nachbarschaften</th><th>Fälle</th></tr></thead><tbody>${GROUPS.map((g) => `<tr><th>${g.label}</th><td>${g.motifs.length}</td><td>${g.widths.length}</td><td>${g.sides.length}</td><td>${g.drops.length}</td><td>${g.sizes.length}</td><td>${g.accesses.length}</td><td>${g.neighbors.length}</td><td>${format(count(g.id))}</td></tr>`).join("")}</tbody><tfoot><tr><th colspan="8">Vollständiges kartesisches Produkt je Gruppe</th><td>${format(CATALOG.length)}</td></tr></tfoot></table></div>${GROUPS.map((g) => `<details><summary>${g.label} <span>${format(count(g.id))} Fälle</span></summary><p>${g.description}</p><dl><dt>Formen</dt><dd>${g.motifs.map((m) => m.label).join(" · ")}</dd><dt>Breitenprofile</dt><dd>${g.widths.map(widthLabel).join(" / ")}</dd><dt>Weitere Achsen</dt><dd>Spiegelung ${g.sides.join(", ")}; Wasserabsenkung ${g.drops.join(" / ")} m; Größe ×${g.sizes.join(" / ×")}; Zugang ${g.accesses.join(" / ")}; ${g.neighbors.map((n) => NEIGHBOR_LABELS[n]).join(" / ")}.</dd></dl></details>`).join("")}<p>Spiegelung: 0 = Original, 1 = Ost/West, 2 = Nord/Süd, 3 = beide Achsen. Straßen: 3 / 6 / 10 m und 3–9 m verlaufend. Wege: 1,5 / 2,5 / 4 m und 1,5–4 m verlaufend. Wasser: 3 / 7 / 12 m und 3–10 m verlaufend. Höhen: 0,6 / 1,4 / 2,4 m unter Gelände.</p></div></dialog>
`;

$<HTMLSelectElement>("#family").value = family;
for (const [id, key] of [
  ["search", "q"],
  ["route-width", "route"],
  ["water-width", "water"],
  ["neighbors", "neighbors"],
]) {
  const element = $<HTMLInputElement | HTMLSelectElement>(`#${id}`);
  element.value = params.get(key) ?? "";
}
function syncURL(): void {
  const query = new URLSearchParams({
    seed: String(seed),
    group,
    family,
    view,
  });
  if (page) query.set("page", String(page));
  for (const [id, key] of [
    ["search", "q"],
    ["route-width", "route"],
    ["water-width", "water"],
    ["neighbors", "neighbors"],
  ]) {
    const value = $<HTMLInputElement>(`#${id}`).value;
    if (value) query.set(key, value);
  }
  if (selected) query.set("case", selected.id);
  history.replaceState(null, "", `${location.pathname}?${query}`);
}
function overview(): ScenarioSpec[] {
  const result = GROUPS.filter((g) => g.id !== "limits").map((g, i) => {
    const motif = g.motifs[Math.min((i % 3) + 1, g.motifs.length - 1)];
    return CATALOG.find(
      (s) =>
        s.group === g.id &&
        s.motif === motif.id &&
        s.neighbors === (i % 3 === 0 ? "dense" : "one") &&
        s.side === 0 &&
        s.widths === g.widths[Math.min(1, g.widths.length - 1)] &&
        s.waterDrop === g.drops[Math.min(1, g.drops.length - 1)] &&
        s.size === 1 &&
        s.access === g.accesses[0],
    )!;
  });
  result.push(
    CATALOG.find(
      (s) =>
        s.group === "mixed" &&
        s.motif === "market-water" &&
        s.neighbors === "dense" &&
        s.side === 0 &&
        s.waterDrop === 1.4,
    )!,
  );
  result.push(CATALOG.find((s) => s.group === "limits" && s.motif === "tiny")!);
  return result;
}
const curated = overview();
function applyFilters(): ScenarioSpec[] {
  const search = $<HTMLInputElement>("#search").value.toLocaleLowerCase("de");
  const route = $<HTMLSelectElement>("#route-width").value;
  const water = $<HTMLSelectElement>("#water-width").value;
  const neighbors = $<HTMLSelectElement>("#neighbors").value;
  const base =
    group === "overview"
      ? curated
      : group === "all"
        ? CATALOG
        : CATALOG.filter((s) => s.group === group);
  return base.filter((spec) =>
    matchesContext(spec, factsById.get(spec.id)!, {
      route,
      water,
      neighbors,
      search,
    }),
  );
}
function error(message: string): void {
  $("#error-banner").hidden = false;
  $("#error-banner").textContent = message;
}
const nextFrame = () =>
  new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
async function renderGallery(): Promise<void> {
  const generation = ++revision;
  filtered = applyFilters();
  page = Math.min(page, Math.max(0, Math.ceil(filtered.length / pageSize) - 1));
  const visible = filtered.slice(page * pageSize, (page + 1) * pageSize);
  const info = GROUPS.find((g) => g.id === group);
  $("#heading").innerHTML =
    group === "overview"
      ? "Ein Haus.<br>Viele Nachbarschaften."
      : group === "all"
        ? "Jeder Fall.<br>Ein eigener Kontext."
        : escape(info!.label);
  $("#description").textContent =
    info?.description ??
    (group === "overview"
      ? "Baukörper und Dächer im lokalen Kontext. Keine Texturen, keine Fassadendetails – zuerst muss die Form stimmen."
      : "Der vollständige Szenarienkatalog. Jeder Fall bleibt sichtbar – auch wenn der Generator begründet ablehnt.");
  $("#group-label").textContent =
    group === "overview" ? "AUSGEWÄHLTE SITUATIONEN" : "SYSTEMATISCHER KATALOG";
  $("#result-count").textContent = `${format(filtered.length)} Studien`;
  $("#filter-hint").hidden = group !== "overview";
  $("#filter-hint").textContent =
    "Der Überblick zeigt 12 Beispiele. Für sämtliche Varianten eine Gruppe oder „Alle Fälle“ öffnen.";
  document
    .querySelectorAll<HTMLButtonElement>("[data-group]")
    .forEach((button) => {
      button.classList.toggle("active", button.dataset.group === group);
      button.setAttribute(
        "aria-current",
        button.dataset.group === group ? "page" : "false",
      );
    });
  document
    .querySelectorAll<HTMLButtonElement>("[data-view]")
    .forEach((button) => {
      button.classList.toggle("active", button.dataset.view === view);
      button.setAttribute("aria-pressed", String(button.dataset.view === view));
    });
  const grid = $("#gallery");
  grid.setAttribute("aria-busy", "true");
  grid.innerHTML = visible.length
    ? visible
        .map(
          (s, i) =>
            `<button class="study-card" data-case="${escape(s.id)}" data-testid="study-card"><div class="study-image"><span class="study-number">${String(page * pageSize + i + 1).padStart(3, "0")} / ${escape(GROUPS.find((g) => g.id === s.group)!.short)}</span><span class="expand-icon" aria-hidden="true">↗</span><span class="loading-shape" aria-hidden="true">${icon}</span></div><div class="study-caption"><div class="study-title"><h3>${escape(s.label)}</h3><span class="result-dot pending" aria-label="Wird erzeugt"></span></div><p>${escape(factsById.get(s.id)!.summary)}</p><div class="card-tags"><span>${NEIGHBOR_LABELS[s.neighbors]}</span>${factsById.get(s.id)!.waterDrop !== undefined ? `<span>Wasser −${factsById.get(s.id)!.waterDrop!.toFixed(1)} m</span>` : `<span>Spiegelung ${s.side}</span>`}</div><div class="house-fact">Wird konstruiert …</div></div></button>`,
        )
        .join("")
    : '<div class="empty-state"><h3>Keine passenden Studien.</h3><p>Die Filter gelten gemeinsam. Setze sie zurück oder öffne „Alle Fälle“.</p></div>';
  $("#page-info").textContent = filtered.length
    ? `${format(page * pageSize + 1)}–${format(page * pageSize + visible.length)} von ${format(filtered.length)} · Seite ${page + 1} / ${Math.ceil(filtered.length / pageSize)}`
    : "0 Fälle";
  $<HTMLButtonElement>("#previous-page").disabled = page === 0;
  $<HTMLButtonElement>("#next-page").disabled =
    (page + 1) * pageSize >= filtered.length;
  syncURL();
  await nextFrame();
  try {
    if (!webglFailed) thumbnail ??= new ThumbnailRenderer();
  } catch {
    webglFailed = true;
    error(
      "WebGL konnte nicht gestartet werden. Bitte Hardwarebeschleunigung aktivieren und einen aktuellen Browser verwenden. Der Katalog bleibt bedienbar.",
    );
  }
  const cards = Array.from(
    grid.querySelectorAll<HTMLButtonElement>(".study-card"),
  );
  for (let i = 0; i < visible.length; i++) {
    if (generation !== revision) return;
    const spec = visible[i],
      card = cards[i];
    const scenario = buildScenario(spec),
      result = generateHouse(scenario, seed, family);
    card.dataset.result = result.ok ? "accepted" : "rejected";
    const dot = card.querySelector<HTMLElement>(".result-dot")!;
    dot.className = `result-dot ${result.ok ? "accepted" : "rejected"}`;
    dot.setAttribute(
      "aria-label",
      result.ok ? "Haus passt" : "Begründet abgelehnt",
    );
    card.querySelector(".house-fact")!.textContent = result.ok
      ? `${FAMILY_LABELS[result.house.family]} · ${result.house.height.toFixed(1)} m hoch · ${scenario.blockers.length} Blocker`
      : "Keine Platzierung gefunden · Gründe ansehen";
    const imageContainer = card.querySelector(".study-image")!;
    try {
      if (thumbnail && !webglFailed) {
        const img = document.createElement("img");
        img.src = thumbnail.render(scenario, result, view, layers);
        img.alt = `${spec.label}: ${result.ok ? FAMILY_LABELS[result.house.family] : "abgelehnte Platzierung"} als 3D-Blockout`;
        img.width = 640;
        img.height = 440;
        imageContainer.prepend(img);
      } else imageContainer.classList.add("render-unavailable");
    } catch (cause) {
      card.dataset.result = "render-error";
      error(`Eine 3D-Ansicht konnte nicht erzeugt werden: ${String(cause)}`);
    }
    imageContainer.querySelector(".loading-shape")?.remove();
    await nextFrame();
  }
  if (generation === revision) grid.setAttribute("aria-busy", "false");
}
function download(
  name: string,
  contents: string,
  type = "application/json",
): void {
  const url = URL.createObjectURL(new Blob([contents], { type }));
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = name;
  anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
function refreshInspector(): void {
  if (!selected) return;
  const scenario = buildScenario(selected),
    result = generateHouse(scenario, seed, family);
  current = { scenario, result };
  $("#inspector-title").textContent = selected.label;
  $("#inspector-group").textContent = GROUPS.find(
    (g) => g.id === selected!.group,
  )!.label;
  const houseFacts = result.ok
    ? `<div class="result-banner success">✓ Haus passt in den lokalen Bauraum</div><dl class="facts"><dt>Hausform</dt><dd>${FAMILY_LABELS[result.house.family]}</dd><dt>Höhe</dt><dd>${result.house.height.toFixed(2)} m</dd><dt>Baukörper</dt><dd>${result.house.parts.length}</dd><dt>Ausrichtung</dt><dd>${((result.house.angle * 180) / Math.PI).toFixed(1)}°</dd><dt>Erschließung</dt><dd>${result.house.frontage ? "Direkter, geprüfter Zugang" : "Nicht nachgewiesen · Formstudie"}</dd><dt>Lokale Versuche</dt><dd>${result.attempts}</dd></dl><p class="small-note">${result.house.parts.map((p) => `${p.width.toFixed(2)} × ${p.depth.toFixed(2)} m · Wand ${p.wallHeight.toFixed(1)} m · Dach ${p.roofHeight.toFixed(2)} m`).join("<br>")}</p>`
    : `<div class="result-banner rejected">Keine Platzierung gefunden</div><p>${result.reason}</p><p class="small-note">${result.attempts} endliche Platzierungsversuche.</p>`;
  $("#inspector-facts").innerHTML =
    `<p class="scenario-widths">${escape(describeContext(scenario).summary)}</p><dl class="facts"><dt>Seed</dt><dd>${seed}</dd><dt>Nachbarn</dt><dd>${scenario.blockers.length} rote Blocker</dd><dt>Wasser</dt><dd>${scenario.surfaces.some((s) => s.kind === "water") ? `−${scenario.surfaces.find((s) => s.kind === "water")!.drop!.toFixed(1)} m` : "–"}</dd><dt>Spiegelung</dt><dd>${selected.side}</dd></dl>${houseFacts}<h3 class="notes-heading">Kontext & Grenzen</h3><ul class="notes">${scenario.notes.map((note) => `<li>${escape(note)}</li>`).join("")}<li>Blockout ohne Fassadendetails und ohne bauliche Ausführungsplanung.</li><li>Blocker ausblenden ändert nur die Darstellung, nicht die Kollision.</li></ul><details class="case-id"><summary>Stabile Fall-ID</summary><code>${escape(selected.id)}</code></details>`;
  $("#copy-status").textContent = "";
  $("#copy-fallback").hidden = true;
  const index = filtered.findIndex((s) => s.id === selected!.id);
  $<HTMLButtonElement>("#previous-case").disabled = index <= 0;
  $<HTMLButtonElement>("#next-case").disabled =
    index < 0 || index >= filtered.length - 1;
  try {
    inspector ??= new InspectorRenderer($("#inspector-canvas"));
    inspector.show(scenario, result, view, layers);
  } catch {
    $("#inspector-canvas").textContent =
      "3D-Ansicht nicht verfügbar. WebGL und Hardwarebeschleunigung prüfen.";
  }
  syncURL();
}
function openInspector(spec: ScenarioSpec): void {
  selected = spec;
  const dialog = $<HTMLDialogElement>("#inspector-dialog");
  if (!dialog.open) dialog.showModal();
  refreshInspector();
}
function regenerate(): void {
  void renderGallery();
  if (selected) refreshInspector();
}
function changeFilters(): void {
  page = 0;
  void renderGallery();
}

document.querySelectorAll<HTMLButtonElement>("[data-group]").forEach((button) =>
  button.addEventListener("click", () => {
    group = button.dataset.group!;
    changeFilters();
  }),
);
document.querySelectorAll<HTMLButtonElement>("[data-view]").forEach((button) =>
  button.addEventListener("click", () => {
    view = button.dataset.view as View;
    regenerate();
  }),
);
$("#seed-form").addEventListener("submit", (event) => {
  event.preventDefault();
  if (!$<HTMLFormElement>("#seed-form").reportValidity()) return;
  seed = Number($<HTMLInputElement>("#seed").value);
  regenerate();
});
$("#next-seed").addEventListener("click", () => {
  seed = (seed + 1) >>> 0;
  $<HTMLInputElement>("#seed").value = String(seed);
  regenerate();
});
$("#family").addEventListener("change", () => {
  family = $<HTMLSelectElement>("#family").value as Family;
  regenerate();
});
for (const id of ["route-width", "water-width", "neighbors"])
  $(`#${id}`).addEventListener("change", changeFilters);
$("#search").addEventListener("input", changeFilters);
$("#clear-filters").addEventListener("click", () => {
  for (const id of ["search", "route-width", "water-width", "neighbors"])
    $<HTMLInputElement>(`#${id}`).value = "";
  changeFilters();
});
$("#show-blockers").addEventListener("change", () => {
  layers.blockers = $<HTMLInputElement>("#show-blockers").checked;
  regenerate();
});
$("#show-constraints").addEventListener("change", () => {
  layers.constraints = $<HTMLInputElement>("#show-constraints").checked;
  regenerate();
});
$("#previous-page").addEventListener("click", () => {
  page--;
  void renderGallery();
});
$("#next-page").addEventListener("click", () => {
  page++;
  void renderGallery();
});
$("#gallery").addEventListener("click", (event) => {
  const card = (event.target as HTMLElement).closest<HTMLButtonElement>(
    "[data-case]",
  );
  if (card) openInspector(CATALOG.find((s) => s.id === card.dataset.case)!);
});
$("#close-inspector").addEventListener("click", () =>
  $<HTMLDialogElement>("#inspector-dialog").close(),
);
$("#inspector-dialog").addEventListener("close", () => {
  selected = undefined;
  syncURL();
});
$("#reset-camera").addEventListener("click", () => inspector?.reset(view));
$("#previous-case").addEventListener("click", () => {
  const index = filtered.findIndex((s) => s.id === selected?.id);
  if (index > 0) openInspector(filtered[index - 1]);
});
$("#next-case").addEventListener("click", () => {
  const index = filtered.findIndex((s) => s.id === selected?.id);
  if (index >= 0 && index < filtered.length - 1)
    openInspector(filtered[index + 1]);
});
$("#download-case").addEventListener("click", () => {
  if (current)
    download(
      `hauslabor-${selected!.group}-${seed}.json`,
      JSON.stringify({ version: 1, seed, family, ...current }, null, 2),
    );
});
$("#download-image").addEventListener("click", () => {
  if (!inspector) return;
  const anchor = document.createElement("a");
  anchor.href = inspector.image();
  anchor.download = `hauslabor-${selected!.group}-${seed}.png`;
  anchor.click();
});
$("#copy-link").addEventListener("click", () => {
  void (async () => {
    try {
      await navigator.clipboard.writeText(location.href);
      $("#copy-status").textContent = "Link kopiert.";
    } catch {
      const field = $<HTMLInputElement>("#copy-fallback");
      field.hidden = false;
      field.value = location.href;
      field.select();
      $("#copy-status").textContent = "Link bitte hier kopieren.";
    }
  })();
});
$("#export-catalog").addEventListener("click", () =>
  download(
    "hauslabor-katalog-v1.json",
    JSON.stringify({ version: 1, groups: GROUPS, scenarios: CATALOG }, null, 2),
  ),
);
$("#show-matrix").addEventListener("click", () =>
  $<HTMLDialogElement>("#matrix-dialog").showModal(),
);
$("#close-matrix").addEventListener("click", () =>
  $<HTMLDialogElement>("#matrix-dialog").close(),
);
window.addEventListener("pagehide", () => {
  thumbnail?.dispose();
  inspector?.dispose();
});
void renderGallery();
const linked = CATALOG.find((s) => s.id === params.get("case"));
if (linked) openInspector(linked);
