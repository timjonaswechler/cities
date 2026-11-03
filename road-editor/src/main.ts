import "./style.css";
import {
  History,
  cleanJunctions,
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
  `<header><h1>Wegwerk<small>Parametrischer Editor</small></h1><button id="select" class="active">Auswählen</button><button id="draw">Zeichnen</button><select id="kind" aria-label="Segmenttyp"><option value="line">Gerade</option><option value="quadratic">Quadratisch</option><option value="cubic">Kubisch</option></select><span class="spacer"></span><button id="undo" title="Ctrl/⌘ Z">Undo</button><button id="redo" title="Ctrl/⌘ Shift Z">Redo</button><button id="new">Neu</button><button id="save">JSON speichern</button><button id="load">JSON laden</button><input id="import" type="file" accept="application/json,.json" aria-label="Graph importieren"><button id="spatial">3D prüfen</button></header>
<main><aside><h2>Werkbank / Meter</h2><div id="inspector"></div><div class="section" id="diagnostics" role="status"></div><div class="section hint">Klick: auswählen · Anker und blaue Griffe: ziehen.<br>Zeichnen: Start, Ende, weitere Endpunkte. An Knoten und Mittellinien andocken.<br>Esc: Pfad beenden · Entf: Pfad löschen.<br>Leertaste + Ziehen / mittlere Taste: Pan.<br>Mausrad: Zoom · <button id="home">Ansicht 0 / 120 m</button><br>Flache Endkappen. Wegefläche = Sperrfläche; freier Rest ≠ Bauland.</div></aside><section id="viewport" aria-label="Wegewerkbank"><div id="three"></div><svg id="editor" aria-label="Vektorpfade bearbeiten"></svg><div class="overlay-title"><strong>Wege formen.</strong><span id="mode-hint">Direkt am Vektor, in Weltkoordinaten.</span></div><div class="legend"><b style="background:#427c70"></b>Sperrfläche <b style="background:#edb65a"></b>Auswahl / Radius<br><b style="background:#f8f9ee;border:1px solid #285b4a"></b>Anker <b style="background:#a4c9ed"></b>Kontrollgriff <b style="background:#be503e"></b>Konflikt</div><div class="scale" id="scale">10 m</div></section></main><footer><span id="status" role="status"></span><span id="metrics"></span></footer>`;
const starter: Network = {
  version: 1,
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
  mode: "select" | "draw" = "select",
  notice = "",
  counter = 1;
let selection: {
  path?: string;
  node?: string;
  handle?: { segment: number; key: "control" | "c1" | "c2" };
} = { path: "Weg-1" };
let drawStart: string | undefined,
  drawPath: string | undefined,
  space = false;
const view: View = { x: 0, y: 0, height: 120 };
const model = () => draft ?? history.value;
const uid = (n: Network, prefix: string) => {
  let id: string;
  do {
    id = `${prefix}-${counter++}`;
  } while (
    n.nodes.some((p) => p.id === id) ||
    n.paths.some((p) => p.id === id)
  );
  return id;
};
const xy = (p: Point) => `${p.x},${-p.y}`;
function pathD(n: Network, s: Segment) {
  const a = node(n, s.from),
    b = node(n, s.to);
  return `M ${xy(a)} ${s.kind === "line" ? `L ${xy(b)}` : s.kind === "quadratic" ? `Q ${xy(s.control)} ${xy(b)}` : `C ${xy(s.c1)} ${xy(s.c2)} ${xy(b)}`}`;
}
function apply(change: (n: Network) => void) {
  const previous = {
    selection: structuredClone(selection),
    drawStart,
    drawPath,
  };
  try {
    const next = structuredClone(history.value);
    change(next);
    computeSurface(next);
    history.commit(next);
    notice = "";
  } catch (e) {
    selection = previous.selection;
    drawStart = previous.drawStart;
    drawPath = previous.drawPath;
    notice = (e as Error).message;
  }
  draft = undefined;
  render();
}
function setMode(next: "select" | "draw") {
  mode = next;
  drawStart = undefined;
  drawPath = undefined;
  spatial = false;
  notice = "";
  render();
}
function render() {
  const n = model();
  const selectedPath = n.paths.find((p) => p.id === selection.path);
  if (!selectedPath) {
    selection.path = undefined;
    selection.handle = undefined;
  }
  if (selection.node && !n.nodes.some((p) => p.id === selection.node))
    selection.node = undefined;
  if (selection.handle) {
    const segment = selectedPath?.segments[selection.handle.segment];
    if (!segment || !(selection.handle.key in segment))
      selection.handle = undefined;
  }
  surface = computeSurface(n);
  renderer.setSurface(surface);
  renderView();
  $("#select").classList.toggle("active", mode === "select");
  $("#draw").classList.toggle("active", mode === "draw");
  $<HTMLButtonElement>("#undo").disabled = !history.canUndo;
  $<HTMLButtonElement>("#redo").disabled = !history.canRedo;
  $("#spatial").textContent = spatial ? "Draufsicht" : "3D prüfen";
  $("#mode-hint").textContent = spatial
    ? "Dieselben Flächenringe räumlich geprüft. Bearbeiten in der Draufsicht."
    : mode === "draw"
      ? drawStart
        ? "Endpunkt setzen / andocken. Esc beendet den Verlauf."
        : "Startpunkt setzen / an Knoten oder Segment andocken."
      : "Direkt am Vektor, in Weltkoordinaten.";
  const p = n.paths.find((p) => p.id === selection.path),
    at = n.nodes.find((p) => p.id === selection.node);
  const input = (label: string, key: string, value: number) =>
    `<label>${label}<input type="number" step="0.1" data-field="${key}" value="${value}"></label>`;
  let panel = p
    ? `<h3>Pfad <span class="tag">${esc(p.id)}</span></h3><div class="muted">${p.segments.length} Segment(e) · linear über Bogenlänge</div><div class="row">${input("Breite Anfang (m)", "startWidth", p.startWidth)}${input("Breite Ende (m)", "endWidth", p.endWidth)}</div><div class="row"><button data-action="reverse">Richtung umkehren</button><button data-action="delete" class="danger">Pfad löschen</button></div>`
    : `<p class="muted">Pfad oder Knoten auswählen. Mit „Zeichnen“ einen eigenen Verlauf erstellen.</p>`;
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
  if (p && selection.handle) {
    const s = p.segments[selection.handle.segment],
      key = selection.handle.key,
      q = (s as unknown as Record<string, Point>)[key];
    if (q)
      panel += `<div class="section"><h3>Kontrollgriff ${key}</h3><div class="row">${input("Griff X (m)", "handleX", q.x)}${input("Griff Y (m)", "handleY", q.y)}</div><p class="hint">Kein Kreuzungsknoten. Keine automatische Glättung.</p></div>`;
  }
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
  $("#status").textContent =
    notice ||
    `${mode === "draw" ? "Zeichnen" : "Auswahl"} · ${n.nodes.length} Knoten · ${n.paths.length} Pfade`;
  $("#status").classList.toggle("error", !!notice);
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
  let content = n.paths
    .map((p) =>
      p.segments
        .map(
          (s, i) =>
            `<path class="path-hit" data-path="${esc(p.id)}" data-segment="${i}" d="${pathD(n, s)}"/><path class="centerline ${selection.path === p.id ? "selected-line" : ""} ${conflicts.has(p.id) ? "conflict-line" : ""}" d="${pathD(n, s)}"/>`,
        )
        .join(""),
    )
    .join("");
  const p = n.paths.find((p) => p.id === selection.path);
  if (p)
    for (const [i, s] of p.segments.entries()) {
      const handles =
        s.kind === "quadratic"
          ? ([
              ["control", s.control, node(n, s.from)],
              ["control", s.control, node(n, s.to)],
            ] as const)
          : s.kind === "cubic"
            ? ([
                ["c1", s.c1, node(n, s.from)],
                ["c2", s.c2, node(n, s.to)],
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
  if (!n.paths.length)
    content += `<text class="empty-instruction" x="${view.x}" y="${-view.y}" style="font-size:${16 * unit}px">„Zeichnen“ wählen → Start → Ende → Verlauf erweitern</text>`;
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
): { path: string; index: number; t: number; distance: number } | undefined {
  let best: ReturnType<typeof closest>;
  for (const p of n.paths)
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
function drawAt(q: Point) {
  apply((n) => {
    const tol = (12 * view.height) / svg.clientHeight,
      near = n.nodes
        .filter((p) => distance(p, q) < tol)
        .sort((a, b) => distance(a, q) - distance(b, q))[0];
    let id = near?.id;
    if (!id) {
      const hit = closest(n, q);
      id = uid(n, "K");
      if (hit && hit.distance < tol && hit.t > 1e-5 && hit.t < 1 - 1e-5)
        splitSegment(n, hit.path, hit.index, hit.t, id);
      else n.nodes.push({ id, ...q });
    }
    if (!drawStart) {
      drawStart = id;
      selection = { node: id };
      return;
    }
    if (drawStart === id)
      throw new Error("Endpunkt muss sich vom Start unterscheiden");
    const kind = $<HTMLSelectElement>("#kind").value as Segment["kind"],
      a = node(n, drawStart),
      b = node(n, id),
      c = mix(a, b, 0.5),
      v = { x: -(b.y - a.y) * 0.25, y: (b.x - a.x) * 0.25 };
    const segment: Segment =
      kind === "line"
        ? { kind, from: drawStart, to: id }
        : kind === "quadratic"
          ? {
              kind,
              from: drawStart,
              to: id,
              control: { x: c.x + v.x, y: c.y + v.y },
            }
          : {
              kind,
              from: drawStart,
              to: id,
              c1: mix(a, b, 1 / 3),
              c2: { x: mix(a, b, 2 / 3).x + v.x, y: mix(a, b, 2 / 3).y + v.y },
            };
    let p = n.paths.find((p) => p.id === drawPath);
    if (!p) {
      drawPath = uid(n, "Weg");
      p = { id: drawPath, startWidth: 4, endWidth: 4, segments: [] };
      n.paths.push(p);
    }
    p.segments.push(segment);
    drawStart = id;
    selection = { path: p.id, node: id };
  });
}
let drag:
  | {
      type: "node" | "handle" | "pan";
      id?: string;
      key?: "control" | "c1" | "c2";
      segment?: number;
      start: Point;
      origin: View;
      valid?: Network;
    }
  | undefined;
viewport.addEventListener("pointerdown", (e) => {
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
  if (mode === "draw") {
    drawAt(world(e));
    return;
  }
  const target = e.target as SVGElement,
    id = target.dataset.node,
    key = target.dataset.handle as "control" | "c1" | "c2" | undefined;
  if (id) {
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
  } else if (key && selection.path) {
    selection.handle = { segment: Number(target.dataset.segment), key };
    selection.node = undefined;
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
  else {
    const s = next.paths.find((p) => p.id === selection.path)!.segments[
      drag.segment!
    ];
    (s as unknown as Record<string, Point>)[drag.key!] = q;
  }
  try {
    computeSurface(next);
    draft = next;
    drag.valid = next;
    notice = "";
  } catch (e) {
    notice = (e as Error).message;
  }
  render();
});
function finishDrag(e: PointerEvent) {
  if (!drag) return;
  if (drag.type !== "pan" && drag.valid) history.commit(drag.valid);
  drag = undefined;
  draft = undefined;
  if (viewport.hasPointerCapture(e.pointerId))
    viewport.releasePointerCapture(e.pointerId);
  render();
}
viewport.addEventListener("pointerup", finishDrag);
viewport.addEventListener("pointercancel", (e) => {
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
    const p = n.paths.find((p) => p.id === selection.path);
    if (p && (field === "startWidth" || field === "endWidth")) p[field] = value;
    if (selection.node && (field === "nodeX" || field === "nodeY")) {
      const q = node(n, selection.node);
      moveNode(n, q.id, {
        x: field === "nodeX" ? value : q.x,
        y: field === "nodeY" ? value : q.y,
      });
    }
    if (p && selection.handle && (field === "handleX" || field === "handleY")) {
      const q = (
        p.segments[selection.handle.segment] as unknown as Record<string, Point>
      )[selection.handle.key];
      q[field === "handleX" ? "x" : "y"] = value;
    }
  });
});
$("#inspector").addEventListener("click", (e) => {
  const action = (e.target as HTMLElement).dataset.action;
  if (!action) return;
  const target = $<HTMLSelectElement>("#join-target")?.value;
  apply((n) => {
    if (action === "reverse" && selection.path) reversePath(n, selection.path);
    if (action === "delete" && selection.path) {
      n.paths = n.paths.filter((p) => p.id !== selection.path);
      cleanJunctions(n);
      selection = {};
    }
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
$("#select").addEventListener("click", () => setMode("select"));
$("#draw").addEventListener("click", () => setMode("draw"));
$("#undo").addEventListener("click", () => {
  history.undo();
  drawStart = undefined;
  drawPath = undefined;
  notice = "";
  render();
});
$("#redo").addEventListener("click", () => {
  history.redo();
  drawStart = undefined;
  drawPath = undefined;
  notice = "";
  render();
});
$("#new").addEventListener("click", () => {
  selection = {};
  setMode("select");
  apply((n) => Object.assign(n, emptyNetwork()));
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
  a.download = "wegenetz-v1.json";
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
    computeSurface(n);
    history.commit(n);
    selection = {};
    drawStart = undefined;
    drawPath = undefined;
    notice = "";
    mode = "select";
  } catch (e) {
    notice = `Import abgelehnt: ${(e as Error).message}`;
  }
  input.value = "";
  render();
});
window.addEventListener("keydown", (e) => {
  if ((e.target as HTMLElement).matches("input,select,textarea")) return;
  if (e.code === "Space") {
    e.preventDefault();
    space = true;
  }
  if (e.key === "Escape") {
    setMode("select");
  }
  if (e.key === "Delete" && selection.path) {
    e.preventDefault();
    $('#inspector [data-action="delete"]').dispatchEvent(
      new MouseEvent("click", { bubbles: true }),
    );
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
  space = false;
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
    }),
};
render();
