import { houseGeometry } from "./houses";
import type {
  House,
  HouseAccess,
  HousePlot,
  HousePoint,
  HouseResult,
  PlotBounds,
} from "./house-types";

const esc = (value: unknown) =>
  String(value).replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ]!,
  );

export function plotFromCorners(a: HousePoint, b: HousePoint): PlotBounds {
  if (![a.x, a.y, b.x, b.y].every(Number.isFinite))
    throw new Error("Bauplatzecken müssen endliche Koordinaten haben.");
  const min = { x: Math.min(a.x, b.x), y: Math.min(a.y, b.y) },
    max = { x: Math.max(a.x, b.x), y: Math.max(a.y, b.y) };
  if (
    ![max.x - min.x, max.y - min.y].every(
      (extent) => Number.isFinite(extent) && extent > 0,
    )
  )
    throw new Error(
      "Bauplatz benötigt eine endliche Breite und Tiefe größer 0.",
    );
  return { min, max };
}

const description = (house: House) =>
  `${house.width} × ${house.depth} m · ${house.storeys} ${house.storeys === 1 ? "Geschoss" : "Geschosse"} · First entlang ${house.ridge === "width" ? "Breite" : "Tiefe"}`;

export function housePanel(state: {
  plot?: HousePlot;
  result?: HouseResult;
  preview?: House;
  conflicts: string[];
  mode: "select" | "plot" | "access";
}): string {
  const { plot, result, conflicts, mode } = state,
    houses = result?.houses ?? [],
    preview =
      state.preview ?? houses.find((house) => house.id === plot?.previewId),
    selected = preview?.id,
    canAccept =
      !!plot?.access && !!preview && !plot.accepted && !conflicts.length,
    hint =
      mode === "plot"
        ? "Zwei gegenüberliegende Ecken markieren. Esc beendet die Auswahl."
        : mode === "access"
          ? "Einen Punkt am tatsächlichen Wegrand als Zugang anklicken."
          : "Zwei gegenüberliegende Ecken des Bauplatzes markieren, danach einen Zugang am tatsächlichen Wegrand wählen.";
  let html = `<div class="section"><h3>Haus am Bauplatz</h3><p class="hint">${hint}</p><div class="row"><button type="button" data-house-action="draw-plot" class="${mode === "plot" ? "active" : ""}" aria-pressed="${mode === "plot"}">Bauplatz markieren</button><button type="button" data-house-action="pick-access" class="${mode === "access" ? "active" : ""}" aria-pressed="${mode === "access"}" ${plot ? "" : "disabled"}>Zugang wählen</button></div>`;
  if (plot) {
    html += `<p class="muted">Bauplatz: ${esc(plot.bounds.max.x - plot.bounds.min.x)} × ${esc(plot.bounds.max.y - plot.bounds.min.y)} m<br>${plot.access ? `Zugang am Wegrand: (${esc(plot.access.point.x)}, ${esc(plot.access.point.y)}) m` : "Noch kein Zugang gewählt: zuerst den Wegrand anklicken."}</p>`;
  }
  html += `<label>Haus-Seed<input type="number" step="1" data-house-field="seed" value="${esc(plot?.seed ?? "")}" ${plot && !plot.accepted ? "" : "disabled"}></label><label>Hausvariante<select class="inspector-select" data-house-field="preview" aria-label="Hausvariante" ${houses.length && plot?.access && !plot.accepted ? "" : "disabled"}>${houses.some((house) => house.id === selected) ? "" : `<option value="" selected disabled>${result ? "Keine Variante ausgewählt" : "Noch keine Vorschläge"}</option>`}${houses.map((house) => `<option value="${esc(house.id)}" ${house.id === selected ? "selected" : ""}>${esc(description(house))}</option>`).join("")}</select></label>`;
  if (result) {
    html += `<p class="${houses.length ? "muted" : "warning"}">${houses.length} von 3 Varianten · ${esc(result.tested)} Kandidaten geprüft.${houses.length === 0 ? " Keine passende Variante gefunden." : ""}</p>`;
    if (houses.length < 3)
      html +=
        '<p class="hint">Weniger Treffer in der endlichen Suche; keine Garantie, alle möglichen Platzierungen zu finden.</p>';
    if (result.rejections.length)
      html += `<div class="warning"><strong>Ablehnungsgründe</strong><ul>${result.rejections.map((reason) => `<li>${esc(reason)}</li>`).join("")}</ul></div>`;
  }
  if (preview)
    html += `<p class="muted"><strong>Vorschau · ${plot?.accepted?.id === preview.id ? "bereits übernommen" : "noch nicht übernommen"}</strong><br>${esc(description(preview))}</p>`;
  if (plot?.accepted)
    html += `<p class="${conflicts.length ? "danger" : "good"}"><strong>Übernommenes Haus</strong> <span class="tag">${esc(plot.accepted.id)}</span><br>${esc(description(plot.accepted))}</p><p class="hint">Seed und Variantenwechsel ersetzen das übernommene Haus nicht. Zum Vergleichen erst das Haus entfernen; Undo stellt es wieder her.</p>`;
  if (conflicts.length)
    html += `<div class="danger" role="alert"><strong>Hauskonflikte – Haus ungültig</strong><ul>${conflicts.map((reason) => `<li>${esc(reason)}</li>`).join("")}</ul></div>`;
  html += `<div data-house-actions><button type="button" class="full" data-house-action="accept" ${canAccept ? "" : "disabled"}>Haus übernehmen</button><div class="row"><button type="button" class="danger" data-house-action="remove-house" ${plot?.accepted ? "" : "disabled"}>Haus entfernen</button><button type="button" class="danger" data-house-action="delete-plot" ${plot ? "" : "disabled"}>Bauplatz löschen</button></div></div></div>`;
  return html;
}

export function houseOverlay(state: {
  bounds?: PlotBounds;
  access?: HouseAccess | null;
  house?: House;
  conflict?: boolean;
  unit: number;
}): string {
  const { bounds, access, house, conflict } = state,
    unit = Number.isFinite(state.unit) && state.unit > 0 ? state.unit : 1,
    color = conflict ? "#be503e" : "#82613e",
    stroke = `stroke="${color}" stroke-width="1.5" vector-effect="non-scaling-stroke"`,
    point = (p: HousePoint) => `${esc(p.x)},${esc(-p.y)}`;
  let html =
    '<g class="house-overlay" pointer-events="none" aria-hidden="true">';
  if (bounds)
    html += `<rect class="house-plot" x="${esc(bounds.min.x)}" y="${esc(-bounds.max.y)}" width="${esc(bounds.max.x - bounds.min.x)}" height="${esc(bounds.max.y - bounds.min.y)}" fill="${color}" fill-opacity="0.06" ${stroke} stroke-dasharray="6 4"/>`;
  if (house) {
    const geometry = houseGeometry(house);
    html += `<polygon class="house-roof" points="${geometry.roof.map(point).join(" ")}" fill="${color}" fill-opacity="0.18" ${stroke}/><polygon class="house-footprint" points="${geometry.footprint.map(point).join(" ")}" fill="${conflict ? "#edc0b6" : "#f0e6d3"}" ${stroke}/><polyline class="house-ridge" points="${geometry.ridge.map(point).join(" ")}" fill="none" ${stroke}/>`;
    if (access)
      html += `<polyline class="house-access" points="${point(geometry.entrance)} ${point(access.point)}" fill="none" ${stroke} stroke-dasharray="4 3"/>`;
    html += `<circle class="house-entrance" cx="${esc(geometry.entrance.x)}" cy="${esc(-geometry.entrance.y)}" r="${esc(3 * unit)}" fill="${color}" stroke="#fffaf0" stroke-width="1" vector-effect="non-scaling-stroke"/>`;
  }
  if (access) {
    const length = Math.hypot(access.tangent.x, access.tangent.y);
    if (Number.isFinite(length) && length > 0) {
      const dx = (access.tangent.x / length) * 7 * unit,
        dy = (access.tangent.y / length) * 7 * unit;
      html += `<line class="house-access-edge" x1="${esc(access.point.x - dx)}" y1="${esc(-access.point.y + dy)}" x2="${esc(access.point.x + dx)}" y2="${esc(-access.point.y - dy)}" ${stroke}/>`;
    }
    html += `<circle class="house-access-point" cx="${esc(access.point.x)}" cy="${esc(-access.point.y)}" r="${esc(4 * unit)}" fill="${conflict ? "#be503e" : "#edb65a"}" ${stroke}/>`;
  }
  return `${html}</g>`;
}
