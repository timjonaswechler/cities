import "./style.css";
import {
  ringArea,
  WATER_DROP,
  contourPoints,
  contourEdges,
  setContourEdges,
  moveContourAnchor,
  type Contour,
} from "./blockers";
import { createCurve, splitCurve, type Curve } from "./curves";
import { penCurve, type PenPoint } from "./pen";
import {
  History,
  cleanJunctions,
  closePath,
  openArea,
  connect,
  detach,
  distance,
  emptyNetwork,
  evaluate,
  mix,
  moveNode,
  node,
  parse,
  reversePath,
  serialize,
  splitSegment,
  vectorAreas,
  type Network,
  type Point,
  type Segment,
} from "./network";
import {
  areaSize,
  computeSurface,
  sampleSegment,
  type Surface,
} from "./geometry";
import { SurfaceView, type View } from "./view";
import { generateHouses, validateHouse } from "./houses";
import { housePanel, houseOverlay, plotFromCorners } from "./house-ui";
import { houseRequest, pickHouseAccess } from "./house-project";
import type { House, HouseResult } from "./house-types";
import { evaluateProject } from "./plot-project";
import { updateActionPanel } from "./action-panel";
import { plotPanel, plotOverlay } from "./plot-ui";
import type { PlotPlan, BuildingComplex } from "./plot-types";
const $ = <T extends Element = HTMLElement>(s: string) =>
  document.querySelector<T>(s)!;
const esc = (s: unknown) =>
  String(s).replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ]!,
  );
$("#app").innerHTML =
  `<header><h1>Wegwerk<small>Parametrischer Editor</small></h1><button id="select" class="active" title="Auswählen (V)">Auswählen</button><button id="draw" title="Stift zeichnen (P)">Zeichnen</button><select id="material" aria-label="Zeichenmaterial"><option value="road">Weg</option><option value="water">Wasser</option><option value="plot">Bauplatz</option></select><select id="kind" aria-label="Zeichenmodus"><option value="pen">Stift · Klick / Ziehen</option><option value="line">Gerade (fest)</option><option value="quadratic">Quadratisch (fest)</option><option value="cubic">Kubisch (fest)</option></select><span class="spacer"></span><button id="undo" title="Ctrl/⌘ Z">Undo</button><button id="redo" title="Ctrl/⌘ Shift Z">Redo</button><button id="new">Neu</button><button id="save">JSON speichern</button><button id="load">JSON laden</button><input id="import" type="file" accept="application/json,.json" aria-label="Graph importieren"><button id="spatial">3D prüfen</button></header>
<main><aside><h2>Werkbank / Meter</h2><div id="inspector"></div><div id="plot-picker"></div><div id="plot-inspector"></div><details id="legacy-house-panel" class="section"><summary>Frühere Rechteckplanung</summary><div id="house-inspector"></div></details><div class="section" id="diagnostics" role="status"></div><div class="section hint">Klick: auswählen · Anker und blaue Griffe: ziehen.<br>Stift (P): Klicken setzt Ecken, Ziehen formt Kurven. Vorschau folgt der Maus.<br>Enter: offen beenden · Esc: Ziehgeste verwerfen, sonst beenden · V: Auswahl · Entf: Pfad löschen.<br>Leertaste + Ziehen / mittlere Taste: Pan.<br>Mausrad: Zoom · <button id="home">Ansicht 0 / 120 m</button><br>Weg und Wasser: offener Vektor + Breite; am ersten Anker oder mit „Pfad schließen“ zur gefüllten Fläche. Esc/Enter beendet offen.<br>Wege + Wasser = Sperrfläche; freier Rest ≠ Bauland.</div></aside><section id="viewport" aria-label="Wegewerkbank"><div id="three"></div><svg id="editor" aria-label="Vektorpfade bearbeiten"></svg><div class="overlay-title"><strong>Vektoren formen.</strong><span id="mode-hint">Direkt am Vektor, in Weltkoordinaten.</span></div><div class="legend"><b style="background:#427c70"></b>Weg <b style="background:#2b91b4"></b>Wasser <b style="background:#eddbb6"></b>Bauplatz <b style="background:#edb65a"></b>Auswahl / Radius<br><b style="background:#f8f9ee;border:1px solid #285b4a"></b>Anker <b style="background:#a4c9ed"></b>Kontrollgriff <b style="background:#be503e"></b>Konflikt</div><div class="scale" id="scale">10 m</div></section></main><footer><span id="status" role="status"></span><span id="metrics"></span></footer>`;
const starter: Network = {
  version: 3,
  areaBlockers: [],
  nodes: [
    { id: "a", x: -36, y: -8 },
    { id: "o", x: 0, y: 0 },
    { id: "b", x: 36, y: 8 },
    { id: "c", x: 7, y: 32 },
  ],
  paths: [
    {
      id: "Weg-1",
      startWidth: 4,
      endWidth: 8,
      segments: [
        { kind: "quadratic", from: "a", to: "o", control: { x: -25, y: 26 } },
        { kind: "line", from: "o", to: "b" },
      ],
    },
    {
      id: "Weg-2",
      startWidth: 4,
      endWidth: 4,
      segments: [
        {
          kind: "cubic",
          from: "o",
          to: "c",
          c1: { x: 12, y: 8 },
          c2: { x: -4, y: 22 },
        },
      ],
    },
  ],
  junctions: [],
};
const history = new History(starter),
  renderer = new SurfaceView($("#three")),
  svg = $<SVGSVGElement>("#editor"),
  viewport = $("#viewport");
let draft: Network | undefined,
  surface: Surface = computeSurface(history.value),
  spatial = false,
  mode: "select" | "draw" | "island" = "select",
  notice = "",
  counter = 1;
let selection: {
  area?: string;
  ring?: number;
  vertex?: number;
  path?: string;
  node?: string;
  handle?: { segment: number; key: "control" | "c1" | "c2" };
} = { path: "Weg-1" };
let drawStart: string | undefined,
  drawPath: string | undefined,
  space = false;
let waterDraft: Point[] = [];
let holeEdges: Curve[] = [];
let houseMode: "select" | "plot" | "access" = "select";
let plotCorner: Point | undefined, plotHover: Point | undefined;
let houseResult: HouseResult | undefined, housePreview: House | undefined;
let houseConflicts: string[] = [];
let invalidHouseSeed: string | undefined;
let plotPlans: PlotPlan[] = [];
let penPoints: PenPoint[] = [];
let penPath: string | undefined;
let penHover: Point | undefined;
let penGesture:
  | { press: Point; anchor: PenPoint; pointerId: number }
  | undefined;
const drawingMaterial = () =>
  $<HTMLSelectElement>("#material").value as "road" | "water" | "plot";
const usingPen = () => $<HTMLSelectElement>("#kind").value === "pen";
const drawingKind = () =>
  usingPen() ? "line" : ($<HTMLSelectElement>("#kind").value as Curve["kind"]);
const view: View = { x: 0, y: 0, height: 120 };
const model = () => draft ?? history.value;
const uid = (n: Network, prefix: string) => {
  let id: string;
  do {
    id = `${prefix}-${counter++}`;
  } while (
    n.nodes.some((p) => p.id === id) ||
    n.paths.some((p) => p.id === id) ||
    vectorAreas(n).some((a) => a.id === id)
  );
  return id;
};
const xy = (p: Point) => `${p.x},${-p.y}`;
const curveD = (s: Curve, b: Point) =>
  s.kind === "line"
    ? `L ${xy(b)}`
    : s.kind === "quadratic"
      ? `Q ${xy(s.control)} ${xy(b)}`
      : `C ${xy(s.c1)} ${xy(s.c2)} ${xy(b)}`;
const contourD = (points: Point[], edges: Curve[], closed = true) =>
  `M ${xy(points[0])} ${edges.map((s, i) => curveD(s, points[(i + 1) % points.length])).join(" ")} ${closed ? "Z" : ""}`;
const areaD = (a: Contour) =>
  [a.outer, ...(a.holes ?? [])]
    .map((r, i) => contourD(r, contourEdges(a, i)))
    .join(" ");
function selectedRing(n: Network): Point[] {
  const a = vectorAreas(n).find((a) => a.id === selection.area);
  const ring = selection.ring ? a?.holes?.[selection.ring - 1] : a?.outer;
  if (!ring) throw new Error("Vektorkontur fehlt");
  return ring;
}
function selectedEdges(n: Network): Curve[] {
  const a = vectorAreas(n).find((a) => a.id === selection.area);
  if (!a) throw new Error("Vektorkontur fehlt");
  return contourEdges(a, selection.ring ?? 0);
}
function selectedCurve(
  n: Network,
  index = selection.handle?.segment,
): Curve | undefined {
  if (index === undefined) return;
  return selection.area
    ? selectedEdges(n)[index]
    : n.paths.find((p) => p.id === selection.path)?.segments[index];
}
function pathD(n: Network, s: Segment) {
  return `M ${xy(node(n, s.from))} ${curveD(s, node(n, s.to))}`;
}
function apply(change: (n: Network) => void): boolean {
  let accepted = false;
  const previous = {
    selection: structuredClone(selection),
    drawStart,
    drawPath,
  };
  try {
    const next = structuredClone(history.value);
    change(next);
    evaluateProject(next);
    history.commit(next);
    accepted = true;
    notice = "";
  } catch (e) {
    selection = previous.selection;
    drawStart = previous.drawStart;
    drawPath = previous.drawPath;
    notice = (e as Error).message;
  }
  draft = undefined;
  render();
  return accepted;
}
function cancelPenGesture() {
  if (penGesture && viewport.hasPointerCapture(penGesture.pointerId))
    viewport.releasePointerCapture(penGesture.pointerId);
  penGesture = undefined;
  penHover = undefined;
}
function resetPen() {
  cancelPenGesture();
  penPath = undefined;
  penPoints = [];
}
function deleteSelectedVector() {
  const { area, path } = selection;
  if (!area && !path) return;
  if (
    apply((n) => {
      if (area) {
        n.areaBlockers = n.areaBlockers?.filter((a) => a.id !== area);
        n.plots = n.plots?.filter((a) => a.id !== area);
      } else {
        n.paths = n.paths.filter((p) => p.id !== path);
        cleanJunctions(n);
      }
      selection = {};
    })
  ) {
    resetPen();
    drawStart = drawPath = undefined;
    render();
  }
}
function setMode(next: typeof mode) {
  invalidHouseSeed = undefined;
  houseMode = "select";
  plotCorner = plotHover = undefined;
  resetPen();
  mode = next;
  drawStart = undefined;
  drawPath = undefined;
  waterDraft = [];
  holeEdges = [];
  spatial = false;
  notice = "";
  render();
}
function render() {
  const n = model();
  const area = vectorAreas(n).find((a) => a.id === selection.area);
  if (selection.area && !area) selection = {};
  if (mode === "island" && !area) {
    mode = "select";
    waterDraft = [];
    holeEdges = [];
  }
  if (area && selection.ring && !area.holes?.[selection.ring - 1]) {
    selection.ring = 0;
    selection.vertex = undefined;
  }
  if (area && selection.vertex !== undefined) {
    const points = selection.ring
      ? area.holes?.[selection.ring - 1]
      : area.outer;
    if (!points?.[selection.vertex]) selection.vertex = undefined;
  }
  const selectedPath = n.paths.find((p) => p.id === selection.path);
  if (!selectedPath) {
    selection.path = undefined;
    if (!area) selection.handle = undefined;
  }
  if (selection.node && !n.nodes.some((p) => p.id === selection.node))
    selection.node = undefined;
  if (selection.handle) {
    const segment = selectedCurve(n);
    if (!segment || !(selection.handle.key in segment))
      selection.handle = undefined;
  }
  const evaluated = evaluateProject(n);
  surface = evaluated.surface;
  plotPlans = evaluated.plots;
  const selectedPlot = area?.kind === "plot" ? area : undefined;
  $("#plot-picker").innerHTML = n.plots?.length
    ? `<label>Bauplatz auswählen<select class="inspector-select" id="plot-select"><option value="">Bauplatz wählen …</option>${n.plots.map((p) => `<option value="${esc(p.id)}" ${p.id === selectedPlot?.id ? "selected" : ""}>${esc(p.id)}</option>`).join("")}</select></label>`
    : "";
  updateActionPanel(
    $("#plot-inspector"),
    plotPanel(
      selectedPlot,
      plotPlans.find((p) => p.id === selectedPlot?.id),
    ),
    "data-plot-action",
  );
  $("#plot-inspector").hidden = !selectedPlot && drawingMaterial() !== "plot";
  houseResult = n.housePlot
    ? generateHouses(houseRequest(n.housePlot, surface))
    : undefined;
  housePreview =
    houseResult?.houses.find((h) => h.id === n.housePlot?.previewId) ??
    houseResult?.houses[0];
  houseConflicts = n.housePlot?.accepted
    ? validateHouse(houseRequest(n.housePlot, surface), n.housePlot.accepted)
    : [];
  renderer.setSurface(surface);
  renderer.setComplexes(
    plotPlans.map((p) => p.complex).filter((c): c is BuildingComplex => !!c),
  );
  renderer.setHouse(
    n.housePlot?.accepted ?? housePreview,
    !!houseConflicts.length,
  );
  updateActionPanel(
    $("#house-inspector"),
    housePanel({
      plot: n.housePlot,
      result: houseResult,
      preview: housePreview,
      conflicts: houseConflicts,
      mode: houseMode,
    }),
    "data-house-action",
  );
  if (invalidHouseSeed !== undefined) {
    const seedInput = $<HTMLInputElement>('[data-house-field="seed"]');
    seedInput.value = invalidHouseSeed;
    seedInput.setAttribute("aria-invalid", "true");
  }
  renderView();
  $("#select").classList.toggle("active", mode === "select");
  $("#draw").classList.toggle("active", mode === "draw" || mode === "island");
  viewport.classList.toggle(
    "pen-mode",
    !spatial && usingPen() && (mode === "draw" || mode === "island"),
  );
  $<HTMLButtonElement>("#undo").disabled =
    !history.canUndo && !waterDraft.length && !penPoints.length;
  $<HTMLButtonElement>("#redo").disabled = !history.canRedo;
  $("#spatial").textContent = spatial ? "Draufsicht" : "3D prüfen";
  $("#mode-hint").textContent = spatial
    ? "Dieselben Flächenringe räumlich geprüft. Bearbeiten in der Draufsicht."
    : houseMode === "plot"
      ? plotCorner
        ? "Zweite Bauplatzecke setzen · Esc verwirft."
        : "Erste Bauplatzecke setzen · Esc beendet."
      : houseMode === "access"
        ? "Zugang am Wegrand wählen, nicht am Wasser."
        : usingPen() && (mode === "draw" || mode === "island")
          ? "Klick: Ecke · Ziehen: Kurve · Enter: " +
            (mode === "island" ? "Aussparung schließen" : "offen beenden") +
            " · am Start: als Fläche schließen"
          : mode === "island"
            ? "Aussparung mit denselben Vektoren zeichnen · Enter schließt · Esc verwirft."
            : mode === "draw"
              ? drawStart
                ? "Endpunkt setzen / andocken. Am Start schließen; Esc/Enter beendet offen."
                : "Startpunkt setzen / an Knoten oder Segment andocken."
              : "Direkt am Vektor, in Weltkoordinaten.";
  const p = n.paths.find((p) => p.id === selection.path),
    at = n.nodes.find((p) => p.id === selection.node);
  const input = (label: string, key: string, value: number) =>
    `<label>${label}<input type="number" step="0.1" data-field="${key}" value="${value}"></label>`;
  let panel = p
    ? `<h3>Pfad <span class="tag">${esc(p.id)}</span></h3><div class="muted">${p.segments.length} Segment(e) · ${p.segments.at(-1)!.to === p.segments[0].from ? "Netzring mit Breite" : p.kind === "water" ? "offener Wasservektor" : "offener Wegvektor"}</div><div class="row width-row">${input("Breite Anfang (m)", "startWidth", p.startWidth)}<button type="button" class="width-link ${p.widthsLinked ? "active" : ""}" data-action="link-widths" aria-label="Breiten koppeln" aria-pressed="${!!p.widthsLinked}" title="${p.widthsLinked ? "Kopplung lösen: Breiten unabhängig bearbeiten" : "Breiten koppeln: Anfangsbreite für beide übernehmen"}"><svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="m10 7 2-2a5 5 0 0 1 7 7l-2 2M14 17l-2 2a5 5 0 0 1-7-7l2-2"/>${p.widthsLinked ? '<path d="m8 16 8-8"/>' : '<path d="m3 3 18 18"/>'}</svg></button>${input("Breite Ende (m)", "endWidth", p.endWidth)}</div><div class="row"><button data-action="reverse">Richtung umkehren</button><button data-action="delete" class="danger">Pfad löschen</button></div><button class="full" data-action="close-path">Pfad schließen</button>`
    : `<p class="muted">Pfad oder Knoten auswählen. Mit „Zeichnen“ einen eigenen Verlauf erstellen.</p>`;
  if (p?.kind === "plot")
    panel = `<h3>Bauplatzkontur</h3><p class="muted">Noch offen: erst die Kontur schließen, dann entsteht die Bebauung. Kein Breitenparameter.</p><button class="full" data-action="close-path">Bauplatz schließen</button><button data-action="delete" class="danger">Kontur löschen</button>`;
  if (at) {
    panel += `<div class="section"><h3>Knoten <span class="tag">${esc(at.id)}</span></h3><div class="row">${input("Knoten X (m)", "nodeX", at.x)}${input("Knoten Y (m)", "nodeY", at.y)}</div><label>Verbinden mit<select id="join-target" class="inspector-select"><option value="">Knoten wählen …</option>${n.nodes
      .filter((q) => q.id !== at.id)
      .map(
        (q) =>
          `<option value="${esc(q.id)}">${esc(q.id)} (${q.x.toFixed(1)}, ${q.y.toFixed(1)})</option>`,
      )
      .join(
        "",
      )}</select></label><button class="full" data-action="connect">Knoten verbinden</button>${p?.segments.some((s) => s.from === at.id || s.to === at.id) ? '<button class="full" data-action="detach">Anschluss lösen</button>' : ""}<p class="hint">Verbinden verwendet die Position des Zielknotens. Lösen erzeugt eine eigene Identität an derselben Position.</p></div>`;
    const rs = surface.radii.filter((r) => r.node === at.id);
    if (rs.length)
      panel += `<div class="section"><h3>Lokale Abrundung</h3>${rs.map((r) => `<div class="radius-row"><label>${esc(r.a)} ↔ ${esc(r.b)}<input aria-label="Radius ${esc(r.a)} ${esc(r.b)} (m)" type="number" step="0.5" min="0" data-radius-a="${esc(r.a)}" data-radius-b="${esc(r.b)}" value="${r.requested}"></label><small class="${r.reason ? "warning" : "good"}">gewünscht ${r.requested} m · wirksam ${r.effective} m${r.reason ? `<br>${esc(r.reason)}` : ""}</small></div>`).join("")}</div>`;
  }
  if (area) {
    const outer = contourPoints(area.outer, area.outerEdges),
      holes = (area.holes ?? []).map((r, i) =>
        contourPoints(r, area.holeEdges?.[i]),
      );
    panel = `<h3>${area.kind === "plot" ? "Geplanter Bauplatz" : area.kind === "water" ? "Wasser" : "Wegfläche"} <span class="tag">${esc(area.id)}</span></h3><p class="muted">Geschlossener Vektor · gefüllte Fläche ohne Breite${area.kind === "water" ? ` · Wasser −${WATER_DROP} m` : ""}<br>${(Math.abs(ringArea(outer)) - holes.reduce((sum, r) => sum + Math.abs(ringArea(r)), 0)).toFixed(2)} m²</p><button class="full" data-action="water-hole">${area.kind === "water" ? "Insel aussparen" : "Aussparung zeichnen"}</button><button class="full" data-action="open-area" ${area.holes?.length ? 'disabled title="Zuerst Aussparungen entfernen"' : ""}>Kontur öffnen</button>${area.kind === "plot" ? "" : `<button class="full danger" data-action="water-delete">${area.kind === "water" ? "Wasser löschen" : "Fläche löschen"}</button>`}`;
    if (selection.vertex !== undefined) {
      const q = selectedRing(n)[selection.vertex],
        edge = selectedEdges(n)[selection.vertex],
        label = area.kind === "water" ? "Ufer" : "Kontur";
      panel += `<div class="section"><h3>Konturanker</h3><div class="row">${input(label + " X (m)", "areaX", q.x)}${input(label + " Y (m)", "areaY", q.y)}</div><label>Kontursegment<select id="contour-kind" class="inspector-select">${[
        ["line", "Gerade"],
        ["quadratic", "Quadratisch"],
        ["cubic", "Kubisch"],
      ]
        .map(
          ([kind, label]) =>
            `<option value="${kind}" ${edge.kind === kind ? "selected" : ""}>${label}</option>`,
        )
        .join(
          "",
        )}</select></label><button class="full" data-action="water-insert">Punkt einfügen</button><button class="full" data-action="water-remove">Punkt entfernen</button></div>`;
    }
    if (selection.ring)
      panel += `<button class="full danger" data-action="water-remove-hole">${area.kind === "water" ? "Insel entfernen" : "Aussparung entfernen"}</button>`;
  }
  if (selection.handle) {
    const key = selection.handle.key,
      edge = selectedCurve(n),
      q = edge && (edge as unknown as Record<string, Point>)[key];
    if (q)
      panel += `<div class="section"><h3>Kontrollgriff ${key}</h3><div class="row">${input("Griff X (m)", "handleX", q.x)}${input("Griff Y (m)", "handleY", q.y)}</div><p class="hint">Weg und Wasser verwenden dieselben Vektorkurven.</p></div>`;
  }
  if (mode === "draw" && usingPen())
    panel = `<h3>Stift zeichnen</h3><p class="muted"><strong>Klicken</strong> setzt eine Ecke.<br><strong>Ziehen</strong> bestimmt Richtung und Länge der Kurvengriffe.</p><p class="muted">${penPoints.length} Anker gesetzt. ${penPoints.length ? "Den nächsten Punkt setzen; die gestrichelte Linie zeigt die Vorschau." : "Den ersten Punkt auf der Zeichenfläche setzen."}</p><button class="full" data-action="finish-drawing">Offen beenden · Enter</button><p class="hint">Am Startpunkt schließt ein Klick ausdrücklich als Fläche. Esc verwirft eine laufende Ziehgeste; sonst beendet es das Zeichnen. V wechselt zur Auswahl.</p>`;
  if (mode === "island")
    panel = `<h3>Aussparung zeichnen</h3><p class="muted">${waterDraft.length} Anker · ${usingPen() ? "Klicken setzt Ecken, Ziehen formt Kurven." : "Segmenttyp oben wählen."} Am ersten Anker oder mit Enter schließen. Esc verwirft.</p><button class="full" data-action="water-close" ${waterDraft.length < 2 ? "disabled" : ""}>Fläche schließen</button><button class="full" data-action="water-cancel">Abbrechen</button>`;
  $("#inspector").innerHTML = panel;
  const warnings = [
    ...surface.diagnostics,
    ...surface.conflicts.map(
      (c) =>
        `Ungeklärte Überschneidung: ${c}. Knoten explizit verbinden / Segment teilen.`,
    ),
  ];
  $("#diagnostics").innerHTML = warnings.length
    ? `<h2 class="warning">Geometriehinweise</h2><ul>${warnings.map((w) => `<li>${esc(w)}</li>`).join("")}</ul>`
    : "";
  const statusNotice =
    notice ||
    (invalidHouseSeed !== undefined
      ? "Ungültiger Bauplatz: Haus-Seed muss eine ganze Zahl von 0 bis 4294967295 sein."
      : "");
  $("#status").textContent =
    statusNotice ||
    `${mode === "draw" ? "Zeichnen" : mode === "island" ? "Aussparung" : "Auswahl"} · ${n.nodes.length} Knoten · ${n.paths.length} Pfade · ${(n.areaBlockers?.length ?? 0) + (n.plots?.length ?? 0)} geschlossene Flächen`;
  $("#status").classList.toggle("error", !!statusNotice);
  $("#metrics").textContent =
    `${areaSize(surface).toFixed(2)} m² Sperrfläche · ${surface.areas.length} Fläche(n) · ${surface.areas.reduce((v, a) => v + a.holes.length, 0)} freie Innenbereiche`;
}
function renderView() {
  const n = model(),
    h = svg.clientHeight,
    w = svg.clientWidth,
    unit = view.height / h,
    r = 4.5 * unit;
  svg.setAttribute(
    "viewBox",
    `${view.x - (view.height * w) / h / 2} ${-view.y - view.height / 2} ${(view.height * w) / h} ${view.height}`,
  );
  svg.style.visibility = spatial ? "hidden" : "visible";
  renderer.render(view, spatial);
  const conflicts = new Set(surface.conflicts.flatMap((c) => c.split(" × ")));
  let content = vectorAreas(n)
    .map(
      (a) =>
        `<path class="water-hit" data-area="${esc(a.id)}" d="${areaD(a)}" fill-rule="evenodd"/><path class="water-outline ${a.kind === "plot" ? "plot-outline" : a.kind === "road" ? "road-outline" : ""} ${selection.area === a.id ? "selected-water" : ""}" d="${areaD(a)}"/>`,
    )
    .join("");
  content += n.paths
    .map((p) =>
      p.segments
        .map(
          (s, i) =>
            `<path class="path-hit" data-path="${esc(p.id)}" data-segment="${i}" d="${pathD(n, s)}"/><path class="centerline ${selection.path === p.id ? "selected-line" : ""} ${conflicts.has(p.id) ? "conflict-line" : ""}" d="${pathD(n, s)}"/>`,
        )
        .join(""),
    )
    .join("");
  const p = n.paths.find((p) => p.id === selection.path),
    selectedArea = vectorAreas(n).find((a) => a.id === selection.area);
  const parts =
    usingPen() && (mode === "draw" || mode === "island")
      ? []
      : p
        ? p.segments.map((s) => ({ s, a: node(n, s.from), b: node(n, s.to) }))
        : selectedArea
          ? selectedEdges(n).map((s, i) => {
              const points = selectedRing(n);
              return { s, a: points[i], b: points[(i + 1) % points.length] };
            })
          : [];
  for (const [i, { s, a, b }] of parts.entries()) {
    const handles =
      s.kind === "quadratic"
        ? ([
            ["control", s.control, a],
            ["control", s.control, b],
          ] as const)
        : s.kind === "cubic"
          ? ([
              ["c1", s.c1, a],
              ["c2", s.c2, b],
            ] as const)
          : [];
    const drawn = new Set<string>();
    for (const [key, q, anchor] of handles) {
      content += `<line class="handle-line" x1="${anchor.x}" y1="${-anchor.y}" x2="${q.x}" y2="${-q.y}"/>`;
      if (!drawn.has(key))
        content += `<rect class="handle" data-handle="${key}" data-segment="${i}" x="${q.x - r}" y="${-q.y - r}" width="${2 * r}" height="${2 * r}" transform="rotate(45 ${q.x} ${-q.y})"/>`;
      drawn.add(key);
    }
  }
  content += n.nodes
    .map(
      (q) =>
        `<circle class="anchor ${q.id === selection.node ? "selected" : ""}" data-node="${esc(q.id)}" cx="${q.x}" cy="${-q.y}" r="${r}"/><text class="node-label" x="${q.x + 7 * unit}" y="${-q.y - 7 * unit}" style="font-size:${10 * unit}px;stroke-width:${3 * unit}px">${esc(q.id)}</text>`,
    )
    .join("");
  for (const rs of surface.radii.filter(
    (r) => r.node === selection.node && r.center,
  ))
    content += `<circle class="fillet" cx="${rs.center!.x}" cy="${-rs.center!.y}" r="${rs.effective}"/>`;
  const area = vectorAreas(n).find((a) => a.id === selection.area);
  if (area && mode === "select")
    for (const [index, ring] of [area.outer, ...(area.holes ?? [])].entries()) {
      content += ring
        .map(
          (q, i) =>
            `<circle class="water-vertex ${selection.ring === index && selection.vertex === i ? "selected" : ""}" data-area="${esc(area.id)}" data-area-ring="${index}" data-area-vertex="${i}" cx="${q.x}" cy="${-q.y}" r="${r}"/>`,
        )
        .join("");
    }
  if (waterDraft.length) {
    content += `<path class="water-draft" d="${contourD(waterDraft, holeEdges, false)}"/>`;
    if (waterDraft.length > 2)
      content += `<line class="water-draft closing" x1="${waterDraft.at(-1)!.x}" y1="${-waterDraft.at(-1)!.y}" x2="${waterDraft[0].x}" y2="${-waterDraft[0].y}"/>`;
    content += waterDraft
      .map(
        (q) =>
          `<circle class="water-vertex" cx="${q.x}" cy="${-q.y}" r="${r}"/>`,
      )
      .join("");
  }
  if (
    !n.paths.length &&
    !n.areaBlockers?.length &&
    !n.plots?.length &&
    !waterDraft.length &&
    !penPoints.length &&
    !penGesture
  )
    content += `<text class="empty-instruction" x="${view.x}" y="${-view.y}" style="font-size:${16 * unit}px">Material wählen → Vektor zeichnen → offen beenden oder am Start schließen</text>`;
  let bounds = n.housePlot?.bounds;
  if (
    plotCorner &&
    plotHover &&
    plotCorner.x !== plotHover.x &&
    plotCorner.y !== plotHover.y
  )
    bounds = plotFromCorners(plotCorner, plotHover);
  content += houseOverlay({
    bounds,
    access: n.housePlot?.access,
    house: n.housePlot?.accepted ?? housePreview,
    conflict: !!houseConflicts.length,
    unit,
  });
  content += plotOverlay(plotPlans, selection.area, unit);
  content += penOverlay(unit);
  svg.innerHTML = content;
  $("#scale").style.width = `${10 / unit}px`;
  $("#scale").hidden = spatial;
}
function world(e: { clientX: number; clientY: number }): Point {
  const b = svg.getBoundingClientRect();
  return {
    x: view.x + ((e.clientX - b.left - b.width / 2) * view.height) / b.height,
    y: view.y - ((e.clientY - b.top - b.height / 2) * view.height) / b.height,
  };
}
function closest(
  n: Network,
  q: Point,
  material = drawingMaterial(),
): { path: string; index: number; t: number; distance: number } | undefined {
  let best: ReturnType<typeof closest>;
  for (const p of n.paths.filter((p) => (p.kind ?? "road") === material))
    for (const [index, s] of p.segments.entries()) {
      const samples = sampleSegment(n, s);
      for (let i = 0; i < samples.length - 1; i++) {
        const a = samples[i],
          b = samples[i + 1],
          dx = b.x - a.x,
          dy = b.y - a.y,
          d = dx * dx + dy * dy;
        const u = d
            ? Math.max(
                0,
                Math.min(1, ((q.x - a.x) * dx + (q.y - a.y) * dy) / d),
              )
            : 0,
          t = a.t + (b.t - a.t) * u,
          dist = distance(q, evaluate(n, s, t));
        if (!best || dist < best.distance)
          best = { path: p.id, index, t, distance: dist };
      }
    }
  return best;
}
function finishWater() {
  if (waterDraft.length < 2) {
    notice = "Kontur benötigt mindestens zwei Anker";
    render();
    return;
  }
  const points = structuredClone(waterDraft),
    edges = [
      ...structuredClone(holeEdges),
      usingPen() && penPoints.length
        ? penCurve(penPoints.at(-1)!, penPoints[0])
        : createCurve(drawingKind(), points.at(-1)!, points[0]),
    ];
  if (
    apply((n) => {
      const a = vectorAreas(n).find((a) => a.id === selection.area);
      if (!a) throw new Error("Fläche für Aussparung fehlt");
      if (n.version < 3) n.version = 3;
      a.holeEdges ??= (a.holes ?? []).map((r) =>
        r.map(() => ({ kind: "line" })),
      );
      (a.holes ??= []).push(points);
      a.holeEdges.push(edges);
      selection = { area: a.id, ring: a.holes.length };
    })
  )
    setMode("select");
}
function waterAt(q: Point) {
  const tolerance = (12 * view.height) / svg.clientHeight;
  if (waterDraft.length && distance(q, waterDraft[0]) < tolerance) {
    finishWater();
    return;
  }
  if (waterDraft.length && distance(q, waterDraft.at(-1)!) < tolerance) return;
  if (waterDraft.length)
    holeEdges.push(createCurve(drawingKind(), waterDraft.at(-1)!, q));
  waterDraft.push(q);
  penPoints.push({ point: q });
  notice = "";
  render();
}
function closeSelectedPath() {
  const id = drawPath ?? selection.path,
    p = model().paths.find((p) => p.id === id);
  if (!p) return;
  const a = node(model(), p.segments.at(-1)!.to),
    b = node(model(), p.segments[0].from);
  if (
    apply((n) => {
      closePath(
        n,
        p.id,
        usingPen() && penPoints.length
          ? penCurve(
              { point: a, outgoing: penPoints.at(-1)?.outgoing },
              { point: b, outgoing: penPoints[0].outgoing },
            )
          : createCurve(drawingKind(), a, b),
      );
      selection = { area: p.id, ring: 0 };
    })
  )
    setMode("select");
}
function drawingTarget(n: Network, q: Point) {
  const material = drawingMaterial(),
    tol = (12 * view.height) / svg.clientHeight;
  const eligible = (id: string) =>
    id === drawStart ||
    !n.paths.some((p) =>
      p.segments.some((s) => s.from === id || s.to === id),
    ) ||
    n.paths.some(
      (p) =>
        (p.kind ?? "road") === material &&
        p.segments.some((s) => s.from === id || s.to === id),
    );
  const near = n.nodes
    .filter((p) => eligible(p.id) && distance(p, q) < tol)
    .sort((a, b) => distance(a, q) - distance(b, q))[0];
  if (near) return { point: { x: near.x, y: near.y }, node: near.id };
  const hit = closest(n, q, material);
  if (hit && hit.distance < tol && hit.t > 1e-5 && hit.t < 1 - 1e-5) {
    const segment = n.paths.find((p) => p.id === hit.path)!.segments[hit.index];
    return { point: evaluate(n, segment, hit.t), split: hit };
  }
  return { point: q };
}
function drawingNode(n: Network, q: Point) {
  const target = drawingTarget(n, q);
  if (target.node) return node(n, target.node);
  const id = uid(n, "K");
  if (target.split) {
    const hit = target.split;
    splitSegment(n, hit.path, hit.index, hit.t, id);
  } else n.nodes.push({ id, ...target.point });
  return node(n, id);
}
function appendDrawSegment(n: Network, from: string, to: string, curve: Curve) {
  if (from === to)
    throw new Error("Endpunkt muss sich vom Start unterscheiden");
  let p = n.paths.find((p) => p.id === drawPath);
  if (!p) {
    const material = drawingMaterial();
    if (material === "plot") n.version = 5;
    else if (n.version < 3) n.version = 3;
    drawPath = uid(
      n,
      material === "plot"
        ? "Bauplatz"
        : material === "water"
          ? "Wasser"
          : "Weg",
    );
    p = {
      id: drawPath,
      kind: material,
      ...(material === "plot" ? { plotSeed: 42 } : {}),
      startWidth: 4,
      endWidth: 4,
      segments: [],
    };
    n.paths.push(p);
  }
  p.segments.push({ ...curve, from, to });
  drawStart = to;
  selection = { path: p.id, node: to };
}
function drawAt(q: Point) {
  const current = model().paths.find((p) => p.id === drawPath);
  if (
    current &&
    distance(node(model(), current.segments[0].from), q) <
      (12 * view.height) / svg.clientHeight
  ) {
    closeSelectedPath();
    return;
  }
  apply((n) => {
    const at = drawingNode(n, q);
    if (!drawStart) {
      drawStart = at.id;
      selection = { node: at.id };
      return;
    }
    appendDrawSegment(
      n,
      drawStart,
      at.id,
      createCurve(drawingKind(), node(n, drawStart), at),
    );
  });
}
function beginPen(e: PointerEvent) {
  const q = world(e),
    tol = (12 * view.height) / svg.clientHeight;
  if (
    mode === "island" &&
    waterDraft.length > 1 &&
    distance(q, waterDraft[0]) < tol
  ) {
    finishWater();
    return;
  }
  const current = model().paths.find((p) => p.id === drawPath);
  if (
    mode === "draw" &&
    current &&
    distance(q, node(model(), current.segments[0].from)) < tol
  ) {
    closeSelectedPath();
    return;
  }
  penGesture = {
    press: q,
    anchor: { point: mode === "island" ? q : drawingTarget(model(), q).point },
    pointerId: e.pointerId,
  };
  penHover = undefined;
  viewport.setPointerCapture(e.pointerId);
  renderView();
}
function commitPenPoint(anchor: PenPoint) {
  const previous = penPoints.at(-1);
  if (mode === "island") {
    if (previous) holeEdges.push(penCurve(previous, anchor));
    waterDraft.push(anchor.point);
    penPoints.push(anchor);
    notice = "";
    render();
    return;
  }
  if (!previous) {
    penPoints.push(anchor);
    selection = {};
    notice = "";
    render();
    return;
  }
  if (
    apply((n) => {
      const from = drawStart
        ? node(n, drawStart)
        : drawingNode(n, previous.point);
      const to = drawingNode(n, anchor.point);
      appendDrawSegment(
        n,
        from.id,
        to.id,
        penCurve({ ...previous, point: from }, { ...anchor, point: to }),
      );
    })
  ) {
    penPoints.push(anchor);
    penPath = drawPath;
  }
  render();
}
function restorePenPath() {
  cancelPenGesture();
  const n = history.value,
    p = n.paths.find((p) => p.id === penPath);
  if (!p) {
    penPoints = penPoints.slice(0, 1);
    drawStart = drawPath = undefined;
    selection = {};
    return;
  }
  const handle = (point: Point, control?: Point) =>
    control && distance(point, control) > 1e-8 ? { ...control } : undefined;
  penPoints = p.segments.map((s) => {
    const point = node(n, s.from);
    return {
      point,
      outgoing: handle(point, s.kind === "cubic" ? s.c1 : undefined),
    };
  });
  const last = p.segments.at(-1)!,
    point = node(n, last.to);
  penPoints.push({
    point,
    outgoing: handle(
      point,
      last.kind === "cubic"
        ? { x: 2 * point.x - last.c2.x, y: 2 * point.y - last.c2.y }
        : undefined,
    ),
  });
  drawPath = p.id;
  drawStart = last.to;
  selection = { path: p.id, node: last.to };
}
function penOverlay(unit: number): string {
  if (!usingPen() || (mode !== "draw" && mode !== "island") || spatial)
    return "";
  const previous = penPoints.at(-1);
  let target = penGesture?.anchor;
  if (!target && penHover) {
    let point =
      mode === "island" ? penHover : drawingTarget(model(), penHover).point;
    if (penPoints.length > 1 && distance(point, penPoints[0].point) < 12 * unit)
      point = penPoints[0].point;
    target = { point };
  }
  let content = '<g class="pen-overlay" pointer-events="none">';
  if (previous && target && distance(previous.point, target.point) > 1e-8) {
    const closing =
      penPoints.length > 1 && distance(target.point, penPoints[0].point) < 1e-8;
    const curve = penCurve(previous, closing ? penPoints[0] : target);
    content +=
      '<path class="pen-preview" d="M ' +
      xy(previous.point) +
      " " +
      curveD(curve, target.point) +
      '"/>';
    if (closing)
      content +=
        '<circle class="pen-close" cx="' +
        target.point.x +
        '" cy="' +
        -target.point.y +
        '" r="' +
        9 * unit +
        '"/>';
  }
  for (const anchor of [previous, penGesture?.anchor]) {
    if (!anchor) continue;
    const a = anchor.point;
    if (anchor.outgoing) {
      const h = anchor.outgoing,
        incoming = { x: 2 * a.x - h.x, y: 2 * a.y - h.y };
      content +=
        '<line class="pen-guide" x1="' +
        incoming.x +
        '" y1="' +
        -incoming.y +
        '" x2="' +
        h.x +
        '" y2="' +
        -h.y +
        '"/>';
      for (const p of [incoming, h])
        content +=
          '<circle class="pen-grip" cx="' +
          p.x +
          '" cy="' +
          -p.y +
          '" r="' +
          3.5 * unit +
          '"/>';
    }
    content +=
      '<rect class="pen-anchor" x="' +
      (a.x - 4 * unit) +
      '" y="' +
      (-a.y - 4 * unit) +
      '" width="' +
      8 * unit +
      '" height="' +
      8 * unit +
      '"/>';
  }
  return content + "</g>";
}

let drag:
  | {
      type: "node" | "handle" | "pan" | "area";
      id?: string;
      ring?: number;
      vertex?: number;
      key?: "control" | "c1" | "c2";
      segment?: number;
      start: Point;
      origin: View;
      valid?: Network;
    }
  | undefined;
viewport.addEventListener("pointerdown", (e) => {
  if (penGesture) return;
  if (e.button === 1 || (e.button === 0 && space)) {
    e.preventDefault();
    drag = {
      type: "pan",
      start: { x: e.clientX, y: e.clientY },
      origin: { ...view },
    };
    viewport.setPointerCapture(e.pointerId);
    return;
  }
  if (e.button !== 0 || spatial) return;
  if (houseMode === "plot") {
    const q = world(e);
    if (!plotCorner) {
      plotCorner = q;
      plotHover = undefined;
      render();
    } else {
      const a = plotCorner;
      if (
        apply((n) => {
          const bounds = plotFromCorners(a, q);
          if (n.version < 4) n.version = 4;
          n.housePlot = {
            ...n.housePlot,
            bounds,
            access: n.housePlot?.access ?? null,
            seed: n.housePlot?.seed ?? 42,
          };
        })
      ) {
        plotCorner = plotHover = undefined;
        houseMode = history.value.housePlot?.access ? "select" : "access";
        render();
      }
    }
    return;
  }
  if (houseMode === "access") {
    const access = pickHouseAccess(
      surface,
      world(e),
      (12 * view.height) / svg.clientHeight,
    );
    if (!access) {
      notice =
        "Einen tatsächlichen Wegrand anklicken. Wasser ist kein Wegzugang.";
      render();
    } else if (
      apply((n) => {
        if (n.housePlot) n.housePlot.access = access;
      })
    ) {
      houseMode = "select";
      render();
    }
    return;
  }
  if (usingPen() && (mode === "draw" || mode === "island")) {
    beginPen(e);
    return;
  }
  if (mode === "island") {
    waterAt(world(e));
    return;
  }
  if (mode === "draw") {
    drawAt(world(e));
    return;
  }
  const target = e.target as SVGElement,
    id = target.dataset.node,
    key = target.dataset.handle as "control" | "c1" | "c2" | undefined;
  if (target.dataset.area) {
    const index = Number(target.dataset.areaRing ?? 0),
      vertex =
        target.dataset.areaVertex === undefined
          ? undefined
          : Number(target.dataset.areaVertex);
    selection = { area: target.dataset.area, ring: index, vertex };
    if (vertex !== undefined)
      drag = {
        type: "area",
        id: selection.area,
        ring: index,
        vertex,
        start: world(e),
        origin: { ...view },
      };
  } else if (id) {
    selection.area = undefined;
    selection.ring = undefined;
    selection.vertex = undefined;
    if (
      !model()
        .paths.find((p) => p.id === selection.path)
        ?.segments.some((s) => s.from === id || s.to === id)
    )
      selection.path = model().paths.find((p) =>
        p.segments.some((s) => s.from === id || s.to === id),
      )?.id;
    selection.node = id;
    selection.handle = undefined;
    drag = { type: "node", id, start: world(e), origin: { ...view } };
  } else if (key && (selection.path || selection.area)) {
    selection.handle = { segment: Number(target.dataset.segment), key };
    selection.node = undefined;
    selection.vertex = undefined;
    drag = {
      type: "handle",
      key,
      segment: Number(target.dataset.segment),
      start: world(e),
      origin: { ...view },
    };
  } else if (target.dataset.path) {
    selection = { path: target.dataset.path };
  } else selection = {};
  if (drag) {
    draft = structuredClone(history.value);
    viewport.setPointerCapture(e.pointerId);
  }
  render();
});
viewport.addEventListener("pointermove", (e) => {
  if (!drag && houseMode === "plot" && plotCorner) {
    plotHover = world(e);
    renderView();
  }
  if (penGesture) {
    const q = world(e),
      delta = { x: q.x - penGesture.press.x, y: q.y - penGesture.press.y };
    const a = penGesture.anchor;
    a.outgoing =
      Math.hypot(delta.x, delta.y) >= (3 * view.height) / svg.clientHeight
        ? { x: a.point.x + delta.x, y: a.point.y + delta.y }
        : undefined;
    renderView();
    return;
  }
  if (!drag && usingPen() && (mode === "draw" || mode === "island")) {
    penHover = world(e);
    renderView();
  }
  if (!drag) return;
  if (drag.type === "pan") {
    view.x =
      drag.origin.x -
      ((e.clientX - drag.start.x) * view.height) / svg.clientHeight;
    view.y =
      drag.origin.y +
      ((e.clientY - drag.start.y) * view.height) / svg.clientHeight;
    renderView();
    return;
  }
  const next = structuredClone(history.value),
    q = world(e);
  if (drag.type === "node") moveNode(next, drag.id!, q);
  else if (drag.type === "area") {
    const a = vectorAreas(next).find((a) => a.id === drag!.id)!;
    moveContourAnchor(a, drag.ring ?? 0, drag.vertex!, q);
  } else {
    const s = selectedCurve(next, drag.segment)!;
    (s as unknown as Record<string, Point>)[drag.key!] = q;
  }
  try {
    evaluateProject(next);
    draft = next;
    drag.valid = next;
    notice = "";
  } catch (e) {
    notice = (e as Error).message;
  }
  render();
});
function finishDrag(e: PointerEvent) {
  if (penGesture) {
    const anchor = penGesture.anchor;
    cancelPenGesture();
    commitPenPoint(anchor);
    return;
  }
  if (!drag) return;
  if (drag.type !== "pan" && drag.valid) history.commit(drag.valid);
  drag = undefined;
  draft = undefined;
  if (viewport.hasPointerCapture(e.pointerId))
    viewport.releasePointerCapture(e.pointerId);
  render();
}
viewport.addEventListener("pointerup", finishDrag);
viewport.addEventListener("pointerleave", () => {
  if (!penGesture) {
    penHover = undefined;
    renderView();
  }
});
viewport.addEventListener("pointercancel", (e) => {
  cancelPenGesture();
  drag = undefined;
  draft = undefined;
  if (viewport.hasPointerCapture(e.pointerId))
    viewport.releasePointerCapture(e.pointerId);
  render();
});
$("#viewport").addEventListener(
  "wheel",
  (e) => {
    e.preventDefault();
    if (penGesture) return;
    const w = e as WheelEvent,
      old = world(w);
    view.height = Math.max(
      0.1,
      Math.min(10000, view.height * Math.exp(w.deltaY * 0.001)),
    );
    const next = world(w);
    view.x += old.x - next.x;
    view.y += old.y - next.y;
    renderView();
  },
  { passive: false },
);
$("#inspector").addEventListener("change", (e) => {
  const target = e.target as HTMLInputElement;
  if (target.id === "contour-kind") {
    apply((n) => {
      const a = vectorAreas(n).find((a) => a.id === selection.area)!,
        points = selectedRing(n),
        i = selection.vertex!,
        edges = selectedEdges(n);
      edges[i] = createCurve(
        target.value as Curve["kind"],
        points[i],
        points[(i + 1) % points.length],
      );
      setContourEdges(a, selection.ring ?? 0, edges);
      if (n.version < 3) n.version = 3;
    });
    return;
  }
  if (target.tagName !== "INPUT") return;
  const value = target.value === "" ? NaN : Number(target.value),
    field = target.dataset.field;
  apply((n) => {
    if (!Number.isFinite(value)) throw new Error("Endliche Zahl erforderlich");
    if (target.dataset.radiusA) {
      const a = target.dataset.radiusA,
        b = target.dataset.radiusB!,
        at = selection.node!;
      let j = n.junctions.find(
        (j) =>
          j.node === at &&
          ((j.a === a && j.b === b) || (j.a === b && j.b === a)),
      );
      if (!j) {
        j = { node: at, a, b, radius: 0 };
        n.junctions.push(j);
      }
      j.radius = value;
      return;
    }
    if (
      selection.area &&
      selection.vertex !== undefined &&
      (field === "areaX" || field === "areaY")
    ) {
      const a = vectorAreas(n).find((a) => a.id === selection.area)!;
      const q = {
        ...selectedRing(n)[selection.vertex],
        [field === "areaX" ? "x" : "y"]: value,
      };
      moveContourAnchor(a, selection.ring ?? 0, selection.vertex, q);
      return;
    }
    const p = n.paths.find((p) => p.id === selection.path);
    if (p && (field === "startWidth" || field === "endWidth")) {
      p[field] = value;
      if (p.widthsLinked) p.startWidth = p.endWidth = value;
    }
    if (selection.node && (field === "nodeX" || field === "nodeY")) {
      const q = node(n, selection.node);
      moveNode(n, q.id, {
        x: field === "nodeX" ? value : q.x,
        y: field === "nodeY" ? value : q.y,
      });
    }
    if (selection.handle && (field === "handleX" || field === "handleY")) {
      const q = (selectedCurve(n) as unknown as Record<string, Point>)[
        selection.handle.key
      ];
      q[field === "handleX" ? "x" : "y"] = value;
    }
  });
});
$("#inspector").addEventListener("click", (e) => {
  const action = (e.target as Element).closest<HTMLButtonElement>(
    "button[data-action]",
  )?.dataset.action;
  if (!action) return;
  if (action === "delete" || action === "water-delete") {
    deleteSelectedVector();
    return;
  }
  if (action === "finish-drawing") {
    setMode("select");
    return;
  }
  if (action === "close-path") {
    closeSelectedPath();
    return;
  }
  if (action === "water-close") {
    finishWater();
    return;
  }
  if (action === "water-cancel") {
    setMode("select");
    return;
  }
  if (action === "water-hole") {
    setMode("island");
    return;
  }
  const target = $<HTMLSelectElement>("#join-target")?.value;
  apply((n) => {
    if (action === "open-area" && selection.area) {
      const id = selection.area;
      openArea(n, id);
      selection = { path: id };
    }
    if (action === "water-remove-hole" && selection.area && selection.ring) {
      const a = vectorAreas(n).find((a) => a.id === selection.area)!;
      a.holes!.splice(selection.ring - 1, 1);
      a.holeEdges?.splice(selection.ring - 1, 1);
      selection = { area: a.id, ring: 0 };
    }
    if (
      (action === "water-insert" || action === "water-remove") &&
      selection.vertex !== undefined
    ) {
      const ring = selectedRing(n),
        i = selection.vertex,
        edges = selectedEdges(n),
        a = vectorAreas(n).find((a) => a.id === selection.area)!;
      if (action === "water-insert") {
        const cut = splitCurve(
          ring[i],
          ring[(i + 1) % ring.length],
          edges[i],
          0.5,
        );
        ring.splice(i + 1, 0, cut.point);
        edges.splice(i, 1, cut.left, cut.right);
        selection.vertex = i + 1;
      } else {
        if (ring.length <= 2)
          throw new Error("Kontur benötigt mindestens zwei Anker");
        edges[(i - 1 + edges.length) % edges.length] = { kind: "line" };
        ring.splice(i, 1);
        edges.splice(i, 1);
        selection.vertex = Math.min(i, ring.length - 1);
      }
      if (n.version < 3) n.version = 3;
      setContourEdges(a, selection.ring ?? 0, edges);
    }
    if (action === "link-widths" && selection.path) {
      const p = n.paths.find((p) => p.id === selection.path)!;
      p.widthsLinked = !p.widthsLinked;
      if (p.widthsLinked) p.endWidth = p.startWidth;
    }
    if (action === "reverse" && selection.path) reversePath(n, selection.path);
    if (action === "detach" && selection.path && selection.node) {
      const id = uid(n, "K");
      detach(n, selection.path, selection.node, id);
      selection.node = id;
    }
    if (action === "connect" && selection.node) {
      if (!target) throw new Error("Zielknoten wählen");
      connect(n, selection.node, target);
      selection.node = target;
    }
  });
});
$("#plot-picker").addEventListener("change", (e) => {
  const id = (e.target as HTMLSelectElement).value;
  selection = id ? { area: id, ring: 0 } : {};
  setMode("select");
});
$("#plot-inspector").addEventListener("click", (e) => {
  const action = (e.target as Element).closest<HTMLButtonElement>(
    "[data-plot-action]",
  )?.dataset.plotAction;
  if (action === "new") {
    $<HTMLSelectElement>("#material").value = "plot";
    $<HTMLSelectElement>("#kind").value = "pen";
    lastDrawingMode = "pen";
    selection = {};
    setMode("draw");
  } else if (action === "delete") deleteSelectedVector();
  else if (action === "regenerate")
    apply((n) => {
      const plot = n.plots?.find((p) => p.id === selection.area);
      if (plot) plot.seed = (plot.seed + 1) >>> 0;
    });
});
$("#house-inspector").addEventListener("click", (e) => {
  const action = (e.target as Element).closest<HTMLButtonElement>(
    "[data-house-action]",
  )?.dataset.houseAction;
  if (!action) return;
  if (action === "accept" && invalidHouseSeed !== undefined) {
    render();
    return;
  }
  if (action === "draw-plot" || action === "pick-access") {
    setMode("select");
    selection = {};
    houseMode = action === "draw-plot" ? "plot" : "access";
    render();
    return;
  }
  apply((n) => {
    const plot = n.housePlot;
    if (!plot) return;
    if (action === "accept" && housePreview && !plot.accepted) {
      const errors = validateHouse(
        houseRequest(plot, computeSurface(n)),
        housePreview,
      );
      if (errors.length) throw new Error(errors.join(" "));
      plot.accepted = structuredClone(housePreview);
      plot.previewId = housePreview.id;
    }
    if (action === "remove-house") delete plot.accepted;
    if (action === "delete-plot") {
      invalidHouseSeed = undefined;
      delete n.housePlot;
    }
  });
});
$("#house-inspector").addEventListener("change", (e) => {
  const target = e.target as HTMLInputElement;
  const editingSeed = target.dataset.houseField === "seed";
  if (editingSeed) invalidHouseSeed = target.value;
  const accepted = apply((n) => {
    if (!n.housePlot || n.housePlot.accepted) return;
    if (target.dataset.houseField === "seed") {
      n.housePlot.seed = target.value === "" ? NaN : Number(target.value);
      delete n.housePlot.previewId;
    }
    if (target.dataset.houseField === "preview")
      n.housePlot.previewId = target.value;
  });
  if (editingSeed) {
    if (accepted) invalidHouseSeed = undefined;
    render();
  }
});
$("#select").addEventListener("click", () => setMode("select"));
$("#draw").addEventListener("click", () => setMode("draw"));
let lastDrawingMode = "pen";
$("#kind").addEventListener("change", () => {
  const next = $<HTMLSelectElement>("#kind").value;
  if (mode === "draw" && (lastDrawingMode === "pen" || next === "pen"))
    setMode("draw");
  else cancelPenGesture();
  lastDrawingMode = next;
  render();
});
$("#material").addEventListener("change", () => {
  if (mode === "draw") setMode("draw");
  else render();
});
$("#undo").addEventListener("click", () => {
  if (penGesture) {
    cancelPenGesture();
    render();
    return;
  }
  if (mode === "draw" && penPoints.length && !drawPath) {
    cancelPenGesture();
    penPoints = [];
    render();
    return;
  }
  if (waterDraft.length) {
    penPoints.pop();
    waterDraft.pop();
    holeEdges.pop();
    render();
    return;
  }
  const continuePen = mode === "draw" && usingPen() && penPath !== undefined;
  history.undo();
  invalidHouseSeed = undefined;
  houseMode = "select";
  plotCorner = plotHover = undefined;
  if (continuePen) restorePenPath();
  else {
    resetPen();
    drawStart = undefined;
    drawPath = undefined;
  }
  notice = "";
  render();
});
$("#redo").addEventListener("click", () => {
  const continuePen = mode === "draw" && usingPen() && penPath !== undefined;
  history.redo();
  invalidHouseSeed = undefined;
  houseMode = "select";
  plotCorner = plotHover = undefined;
  if (continuePen) restorePenPath();
  else {
    resetPen();
    drawStart = undefined;
    drawPath = undefined;
  }
  notice = "";
  render();
});
$("#new").addEventListener("click", () => {
  selection = {};
  setMode("select");
  apply((n) => {
    delete n.housePlot;
    delete n.plots;
    Object.assign(n, emptyNetwork());
  });
});
$("#home").addEventListener("click", () => {
  Object.assign(view, { x: 0, y: 0, height: 120 });
  renderView();
});
$("#spatial").addEventListener("click", () => {
  spatial = !spatial;
  render();
});
$("#save").addEventListener("click", () => {
  const blob = new Blob([serialize(history.value)], {
      type: "application/json",
    }),
    url = URL.createObjectURL(blob),
    a = document.createElement("a");
  a.href = url;
  a.download = `wegenetz-v${history.value.version}.json`;
  a.click();
  URL.revokeObjectURL(url);
});
$("#load").addEventListener("click", () =>
  $<HTMLInputElement>("#import").click(),
);
$("#import").addEventListener("change", async (e) => {
  const input = e.target as HTMLInputElement,
    file = input.files?.[0];
  if (!file) return;
  try {
    const n = parse(await file.text());
    evaluateProject(n);
    history.commit(n);
    $<HTMLDetailsElement>("#legacy-house-panel").open = !!n.housePlot;
    resetPen();
    selection = n.plots?.length ? { area: n.plots[0].id, ring: 0 } : {};
    drawStart = undefined;
    drawPath = undefined;
    notice = "";
    mode = "select";
    invalidHouseSeed = undefined;
    houseMode = "select";
    plotCorner = plotHover = undefined;
    waterDraft = [];
    holeEdges = [];
  } catch (e) {
    notice = `Import abgelehnt: ${(e as Error).message}`;
  }
  input.value = "";
  render();
});
window.addEventListener("keydown", (e) => {
  if ((e.target as HTMLElement).matches("input,select,textarea")) return;
  if (e.code === "Space") {
    if ((e.target as HTMLElement).closest("button")) return;
    e.preventDefault();
    space = true;
  }
  if (
    !e.ctrlKey &&
    !e.metaKey &&
    !e.altKey &&
    (e.key.toLowerCase() === "p" || e.key.toLowerCase() === "v")
  ) {
    e.preventDefault();
    if (e.key.toLowerCase() === "p") {
      $<HTMLSelectElement>("#kind").value = "pen";
      lastDrawingMode = "pen";
      setMode("draw");
    } else setMode("select");
    return;
  }
  if (e.key === "Escape") {
    if (penGesture) {
      e.preventDefault();
      cancelPenGesture();
      render();
      return;
    }
    setMode("select");
  }
  if (e.key === "Enter") {
    if (mode === "island") {
      e.preventDefault();
      finishWater();
    } else if (mode === "draw") {
      e.preventDefault();
      setMode("select");
    }
  }
  if (e.key === "Delete" && (selection.area || selection.path)) {
    e.preventDefault();
    deleteSelectedVector();
  }
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "z") {
    e.preventDefault();
    $(e.shiftKey ? "#redo" : "#undo").dispatchEvent(new MouseEvent("click"));
  }
});
window.addEventListener("keyup", (e) => {
  if (e.code === "Space") space = false;
});
window.addEventListener("blur", () => {
  cancelPenGesture();
  space = false;
  renderView();
});
new ResizeObserver(() => renderView()).observe($("#viewport"));
export interface EditorSnapshot {
  network: Network;
  surface: Surface;
  area: number;
  meshArea: number;
  meshTriangles: SurfaceView["triangles"];
  view: View;
  selection: typeof selection;
  waterMesh: { heights: number[]; color: string | null };
  plots: PlotPlan[];
  complexMeshes: SurfaceView["complexMeshes"];
  houses: {
    result?: HouseResult;
    preview?: House;
    conflicts: string[];
    meshes: SurfaceView["houseMeshes"];
  };
}
declare global {
  interface Window {
    __wegwerk: { snapshot: () => EditorSnapshot };
  }
}
window.__wegwerk = {
  snapshot: () =>
    structuredClone({
      network: model(),
      surface,
      area: areaSize(surface),
      meshArea: renderer.meshArea,
      meshTriangles: renderer.triangles,
      view,
      selection,
      waterMesh: { heights: renderer.waterHeights, color: renderer.waterColor },
      plots: plotPlans,
      complexMeshes: renderer.complexMeshes,
      houses: {
        result: houseResult,
        preview: housePreview,
        conflicts: houseConflicts,
        meshes: renderer.houseMeshes,
      },
    }),
};
render();
