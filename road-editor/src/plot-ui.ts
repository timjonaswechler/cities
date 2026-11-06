import type { HouseArea, HousePoint } from "./house-types";
import type { PlannedPlot, PlotPlan } from "./plot-types";

const esc = (value: unknown) =>
  String(value).replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ]!,
  );
const areaFormat = new Intl.NumberFormat("de-DE", { maximumFractionDigits: 1 });
const areaLabel = (area: number) =>
  `${Number.isFinite(area) ? areaFormat.format(area) : "–"} m²`;
const bodyCount = (plan: PlotPlan) => plan.complex?.volumes.length ?? 0;
const bodiesLabel = (count: number) => `${count} Baukörper`;

export function plotPanel(
  plot: PlannedPlot | undefined,
  plan: PlotPlan | undefined,
): string {
  const result = plot && plan?.id === plot.id ? plan : undefined;
  let html = '<div class="section plot-panel"><h3>Bauplatz</h3>';
  if (!plot) {
    html +=
      '<p class="hint">Material „Bauplatz“ wählen und einen geschlossenen Vektor zeichnen. Ein Gebäudekomplex wird automatisch erzeugt.</p>';
  } else {
    html += `<p class="muted">Ausgewählt: <span class="tag">${esc(plot.id)}</span></p>`;
    if (result) {
      const parts = result.buildable.length,
        bodies = bodyCount(result);
      html += `<p class="muted">Gezeichnet: <strong>${areaLabel(result.plannedArea)}</strong><br>Bebaubar: <strong>${areaLabel(result.buildableArea)}</strong><br>Ausgeschlossen: <strong>${areaLabel(result.excludedArea)}</strong></p><p class="muted">${parts} ${parts > 1 ? "getrennte Teilflächen" : parts === 1 ? "Teilfläche" : "Teilflächen"} · ${bodies ? "1 Gebäudekomplex" : "0 Gebäudekomplexe"} · ${bodiesLabel(bodies)}</p>`;
      if (!bodies)
        html += `<p class="warning">${parts ? "Keine passende Bebauung gefunden." : "Keine bebaubare Fläche."}</p>`;
      if (result.messages.length)
        html += `<ul class="warning">${result.messages.map((message) => `<li>${esc(message)}</li>`).join("")}</ul>`;
    } else {
      html += '<p class="muted">Noch kein Planungsergebnis.</p>';
    }
  }
  html += `<div data-plot-actions><div class="row"><button type="button" data-plot-action="new">Bauplatz zeichnen</button><button type="button" data-plot-action="regenerate"${plot ? "" : " disabled"}>Neue Bebauung</button></div><div class="row"><button type="button" class="danger" data-plot-action="delete"${plot ? "" : " disabled"}>Bauplatz löschen</button></div></div></div>`;
  return html;
}

const point = (p: HousePoint) => `${p.x},${-p.y}`;
const areaD = (area: HouseArea) =>
  area.outer.length < 3
    ? ""
    : [area.outer, ...area.holes]
        .filter((ring) => ring.length >= 3)
        .map((ring) => `M ${ring.map(point).join(" L ")} Z`)
        .join(" ");

export function plotOverlay(
  plans: PlotPlan[],
  selectedId: string | undefined,
  unit: number,
): string {
  const scale = Number.isFinite(unit) && unit > 0 ? unit : 1,
    stroke = 'vector-effect="non-scaling-stroke"',
    hatchSize = 8 * scale;
  let html =
    '<g class="plot-overlay" pointer-events="none" aria-hidden="true">';
  if (plans.some((plan) => plan.excluded.length))
    html += `<defs><pattern id="plot-excluded-hatch" patternUnits="userSpaceOnUse" width="${hatchSize}" height="${hatchSize}"><path d="M 0,${hatchSize} L ${hatchSize},0" fill="none" stroke="#b95e50" stroke-opacity="0.25" stroke-width="${scale}"/></pattern></defs>`;
  for (const plan of plans) {
    const selected = plan.id === selectedId,
      planned = areaD(plan.planned);
    html += `<g class="plot-plan" data-plot-id="${esc(plan.id)}">`;
    for (const area of plan.buildable) {
      const d = areaD(area);
      if (d)
        html += `<path class="plot-buildable" d="${d}" fill-rule="evenodd" fill="#eddbb6" fill-opacity="0.24" stroke="#ab9064" stroke-opacity="0.5" stroke-width="1" ${stroke}/>`;
    }
    for (const area of plan.excluded) {
      const d = areaD(area);
      if (d)
        html += `<path class="plot-excluded" d="${d}" fill-rule="evenodd" fill="url(#plot-excluded-hatch)" stroke="#b95e50" stroke-opacity="0.35" stroke-width="0.75" ${stroke}/>`;
    }
    if (planned) {
      html += `<path class="plot-planned" d="${planned}" fill-rule="evenodd" fill="none" stroke="#93734a" stroke-opacity="0.8" stroke-width="1.25" stroke-dasharray="6 4" ${stroke}/>`;
      if (selected) {
        html += `<path class="plot-selection" d="${planned}" fill-rule="evenodd" fill="none" stroke="#c88d36" stroke-width="2.5" ${stroke}/>`;
        const x = Math.min(...plan.planned.outer.map((p) => p.x)),
          y = -Math.max(...plan.planned.outer.map((p) => p.y)) - 7 * scale;
        html += `<text class="plot-label" x="${x}" y="${y}" font-size="${11 * scale}" font-family="system-ui, sans-serif" font-weight="600" fill="#674c2c" stroke="#fffaf0" stroke-width="${3 * scale}" stroke-linejoin="round" paint-order="stroke">${esc(plan.id)} · ${areaLabel(plan.buildableArea)} bebaubar · ${bodiesLabel(bodyCount(plan))}</text>`;
      }
    }
    html += "</g>";
  }
  return `${html}</g>`;
}
