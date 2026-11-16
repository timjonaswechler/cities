import "./feature-zoo.css";
import { Vector3 } from "three";
import {
  features,
  feature,
  materials,
  defaults,
  initialConfig,
  parseConfig,
  policyIssues,
  validateValues,
  visible,
  type FeatureProperty,
} from "./feature-catalog";
import { createFeature, type FeatureGeometry } from "./feature-geometry";
import { FeatureView } from "./feature-view";

const $ = <T extends Element = HTMLElement>(selector: string) =>
  document.querySelector<T>(selector)!;
const esc = (value: unknown) =>
  String(value).replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ]!,
  );
let config = initialConfig(),
  built: FeatureGeometry,
  issues: string[] = [];
const requested = new URLSearchParams(location.search).get("feature");
if (features.some((f) => f.id === requested))
  config.selectedFeature = requested as typeof config.selectedFeature;
$("#app").innerHTML = `
<header><a class="brand" href="/">WEGWERK <span>Bauteil-Zoo</span></a><span class="header-note">Bausteine prüfen, noch keine Häuser würfeln.</span><div class="header-actions"><button id="save-config">Konfiguration speichern</button><button id="load-config">Laden</button><input id="config-file" type="file" accept="application/json,.json" hidden aria-label="Zoo-Konfiguration importieren"></div></header>
<main>
  <nav aria-label="Feature-Liste"><div class="eyebrow">BAUSTEINE <span>07</span></div><div id="feature-list"></div><div class="location-section"><label class="eyebrow" for="location">LOKATION</label><select id="location"></select><div class="location-note">Freigaben und Baustoffe gelten je Feature.</div></div><a class="back-link" href="/">← Zum Wegeditor</a></nav>
  <section class="workbench" aria-label="Bauteil-Vorschau"><div class="view-heading"><div><span class="eyebrow" id="feature-kind"></span><h1 id="feature-title"></h1></div><button id="reset-feature">Bauteil zurücksetzen</button></div><div class="view-toolbar"><div class="view-buttons"><button data-view="3d" class="active">3D</button><button data-view="front">Vorn</button><button data-view="side">Seite</button><button data-view="top">Oben</button><button data-view="fit">Einpassen</button></div><label><input id="show-ports" type="checkbox" checked> Anschlüsse</label><label><input id="show-spaces" type="checkbox"> Nutzraum</label></div><div id="preview"><div id="canvas"></div><div class="preview-caption">Raster 1 m · Ziehen: drehen · Rad: zoomen</div><div id="measurements"></div></div><div id="check" role="status"></div><div class="port-line"><span class="port-key"><i></i>Zugang <i></i>Wand <i></i>Dach</span><span id="ports"></span></div></section>
  <aside><div class="property-heading"><h2>Eigenschaften</h2><span>LIVE</span></div><div id="properties"></div><details open class="policy"><summary>Lokationsregeln <span id="policy-location"></span></summary><label class="toggle"><input id="feature-allowed" type="checkbox"> Feature hier freigeben</label><div id="limits"></div><h3>Freigegebene Baustoffe</h3><div id="policy-materials"></div><button id="reset-policy" class="quiet">Regeln zurücksetzen</button></details></aside>
</main><div id="notice" role="alert" hidden></div>`;
const view = new FeatureView($("#canvas"));
function currentLocation() {
  return config.locations.find((l) => l.id === config.selectedLocation)!;
}
function currentPolicy() {
  return currentLocation().features[config.selectedFeature];
}
function setNotice(message = "") {
  $("#notice").textContent = message;
  $("#notice").hidden = !message;
}
function numeric(
  key: string,
  label: string,
  value: number,
  min: number,
  max: number,
  step: number,
  scope: string,
) {
  return `<div class="number-control"><label for="${scope}-${key}">${esc(label)}</label><div class="number-inputs"><input id="${scope}-${key}" type="range" min="${min}" max="${max}" step="${step}" value="${value}" aria-label="${esc(label)}" data-${scope}="${key}"><input type="number" min="${min}" max="${max}" step="${step}" value="${value}" aria-label="${esc(label)} als Zahl" data-${scope}="${key}"><span>m</span></div></div>`;
}
function propertyControl(p: FeatureProperty) {
  const value = config.values[config.selectedFeature][p.key];
  if (p.kind === "number")
    return numeric(
      p.key,
      p.label,
      value as number,
      p.min,
      p.max,
      p.step,
      "property",
    );
  return `<div class="choice-control"><label for="property-${p.key}">${esc(p.label)}</label><select id="property-${p.key}" data-property="${p.key}">${p.options.map((o) => `<option value="${esc(o.value)}" ${o.value === value ? "selected" : ""}>${esc(o.label)}${p.kind === "material" && !currentPolicy().materials.includes(o.value) ? " · hier gesperrt" : ""}</option>`).join("")}</select></div>`;
}
function renderProperties() {
  $("#properties").innerHTML = feature(config.selectedFeature)
    .properties.filter((p) => visible(p, config.values[config.selectedFeature]))
    .map(propertyControl)
    .join("");
}
function renderPolicy() {
  const f = feature(config.selectedFeature),
    policy = currentPolicy();
  $("#policy-location").textContent = currentLocation().label;
  $<HTMLInputElement>("#feature-allowed").checked = policy.allowed;
  $("#limits").innerHTML = f.limits
    .filter((l) => visible(l, config.values[f.id]))
    .map((l) =>
      numeric(l.key, l.label, policy.limits[l.key], l.min, l.max, 0.1, "limit"),
    )
    .join("");
  const possible = materials.filter((m) =>
    f.properties.some(
      (p) => p.kind === "material" && p.options.some((o) => o.value === m.id),
    ),
  );
  $("#policy-materials").innerHTML = possible
    .map(
      (m) =>
        `<label><input type="checkbox" data-material="${m.id}" ${policy.materials.includes(m.id) ? "checked" : ""}><i style="background:${m.color}"></i>${esc(m.label)}<span class="sr-only"> zulassen</span></label>`,
    )
    .join("");
}
function renderSelection() {
  const f = feature(config.selectedFeature);
  $("#feature-list").innerHTML = features
    .map(
      (item) =>
        `<button data-feature="${item.id}" aria-pressed="${item.id === f.id}"><span>${item.short}</span>${esc(item.label)}<b>↗</b></button>`,
    )
    .join("");
  $("#location").innerHTML = config.locations
    .map(
      (l) =>
        `<option value="${esc(l.id)}" ${l.id === config.selectedLocation ? "selected" : ""}>${esc(l.label)}</option>`,
    )
    .join("");
  $("#feature-title").textContent = f.label;
  $("#feature-kind").textContent =
    f.owner === "plot"
      ? "GRUNDSTÜCKSELEMENT"
      : f.owner === "either"
        ? "GEBÄUDE / GRUNDSTÜCK"
        : "GEBÄUDEELEMENT";
  renderProperties();
  renderPolicy();
}
function refresh(fit = false) {
  built = createFeature(
    config.selectedFeature,
    config.values[config.selectedFeature],
  );
  issues = policyIssues(
    config.selectedFeature,
    config.values[config.selectedFeature],
    built.metrics,
    currentPolicy(),
  );
  view.setFeature(built, fit, !!issues.length);
  view.helpers(
    $<HTMLInputElement>("#show-ports").checked,
    $<HTMLInputElement>("#show-spaces").checked,
  );
  const size = built.bounds.getSize(new Vector3());
  if (fit)
    document
      .querySelectorAll<HTMLButtonElement>("[data-view]")
      .forEach((button) =>
        button.classList.toggle("active", button.dataset.view === "3d"),
      );
  $("#measurements").textContent =
    `${size.x.toFixed(2)} × ${size.y.toFixed(2)} × ${size.z.toFixed(2)} m`;
  $("#check").className = issues.length ? "invalid" : "valid";
  $("#check").innerHTML = issues.length
    ? `<strong><span>!</span> Lokationsprüfung: nicht freigegeben</strong><ul>${issues.map((issue) => `<li>${esc(issue)}</li>`).join("")}</ul>`
    : "<strong><span>✓</span> Lokationsprüfung: freigegeben</strong><small>Geometrie und Anschlüsse können einzeln geprüft werden.</small>";
  $("#ports").textContent = built.ports.map((p) => p.id).join(" · ");
}
function updatePair(scope: string, key: string, value: number) {
  document
    .querySelectorAll<HTMLInputElement>(`[data-${scope}="${key}"]`)
    .forEach((input) => {
      input.value = String(value);
      input.removeAttribute("aria-invalid");
    });
}
$("#feature-list").addEventListener("click", (e) => {
  const id = (e.target as Element).closest<HTMLButtonElement>("[data-feature]")
    ?.dataset.feature;
  if (!id) return;
  config.selectedFeature = feature(id).id;
  setNotice();
  renderSelection();
  refresh(true);
});
$("#location").addEventListener("change", (e) => {
  config.selectedLocation = (e.target as HTMLSelectElement).value;
  setNotice();
  renderProperties();
  renderPolicy();
  refresh();
});
$("#properties").addEventListener("input", (e) => {
  const target = e.target as HTMLInputElement,
    key = target.dataset.property;
  if (!key) return;
  const f = feature(config.selectedFeature),
    p = f.properties.find((p) => p.key === key)!,
    old = config.values[f.id],
    value =
      p.kind === "number"
        ? target.value === ""
          ? NaN
          : Number(target.value)
        : target.value;
  const next = { ...old, [key]: value };
  try {
    validateValues(f.id, next);
    config.values[f.id] = next;
    setNotice();
    if (p.kind === "number") updatePair("property", key, value as number);
    else {
      renderProperties();
      renderPolicy();
    }
    refresh();
  } catch (error) {
    target.setAttribute("aria-invalid", "true");
    setNotice((error as Error).message);
  }
});
$("#limits").addEventListener("input", (e) => {
  const target = e.target as HTMLInputElement,
    key = target.dataset.limit;
  if (!key) return;
  const definition = feature(config.selectedFeature).limits.find(
      (l) => l.key === key,
    )!,
    value = target.value === "" ? NaN : Number(target.value);
  if (
    !Number.isFinite(value) ||
    value < definition.min ||
    value > definition.max
  ) {
    target.setAttribute("aria-invalid", "true");
    setNotice("Ungültige Lokationsgrenze.");
    return;
  }
  currentPolicy().limits[key] = value;
  updatePair("limit", key, value);
  setNotice();
  refresh();
});
$("#feature-allowed").addEventListener("change", (e) => {
  currentPolicy().allowed = (e.target as HTMLInputElement).checked;
  setNotice();
  refresh();
});
$("#policy-materials").addEventListener("change", (e) => {
  const target = e.target as HTMLInputElement,
    id = target.dataset.material;
  if (!id) return;
  currentPolicy().materials = target.checked
    ? [...currentPolicy().materials, id]
    : currentPolicy().materials.filter((m) => m !== id);
  setNotice();
  renderProperties();
  refresh();
});
$("#reset-feature").addEventListener("click", () => {
  config.values[config.selectedFeature] = defaults(config.selectedFeature);
  setNotice();
  renderProperties();
  renderPolicy();
  refresh(true);
});
$("#reset-policy").addEventListener("click", () => {
  const source =
    initialConfig().locations.find((l) => l.id === config.selectedLocation) ??
    initialConfig().locations[0];
  currentLocation().features[config.selectedFeature] = structuredClone(
    source.features[config.selectedFeature],
  );
  setNotice();
  renderProperties();
  renderPolicy();
  refresh();
});
for (const id of ["show-ports", "show-spaces"])
  $("#" + id).addEventListener("change", () =>
    view.helpers(
      $<HTMLInputElement>("#show-ports").checked,
      $<HTMLInputElement>("#show-spaces").checked,
    ),
  );
document.querySelectorAll<HTMLButtonElement>("[data-view]").forEach((button) =>
  button.addEventListener("click", () => {
    const mode = button.dataset.view!;
    view.fit(mode === "fit" ? "3d" : (mode as "3d" | "front" | "side" | "top"));
    document
      .querySelectorAll("[data-view]")
      .forEach((b) => b.classList.toggle("active", b === button));
  }),
);
$("#save-config").addEventListener("click", () => {
  const url = URL.createObjectURL(
      new Blob([JSON.stringify(config, null, 2)], { type: "application/json" }),
    ),
    a = document.createElement("a");
  a.href = url;
  a.download = "wegwerk-feature-zoo.json";
  a.click();
  URL.revokeObjectURL(url);
});
$("#load-config").addEventListener("click", () =>
  $<HTMLInputElement>("#config-file").click(),
);
$("#config-file").addEventListener("change", async (e) => {
  const input = e.target as HTMLInputElement,
    file = input.files?.[0];
  if (!file) return;
  try {
    const next = parseConfig(await file.text());
    config = next;
    setNotice();
    renderSelection();
    refresh(true);
  } catch (error) {
    setNotice(`Import abgelehnt: ${(error as Error).message}`);
  }
  input.value = "";
});
declare global {
  interface Window {
    __featureZoo: {
      snapshot: () => {
        config: typeof config;
        issues: string[];
        metrics: Record<string, number>;
        bounds: { min: number[]; max: number[] };
        ports: FeatureGeometry["ports"];
        spaces: FeatureGeometry["spaces"];
        view: ReturnType<FeatureView["snapshot"]>;
      };
    };
  }
}
window.__featureZoo = {
  snapshot: () =>
    structuredClone({
      config,
      issues,
      metrics: built.metrics,
      bounds: {
        min: built.bounds.min.toArray(),
        max: built.bounds.max.toArray(),
      },
      ports: built.ports,
      spaces: built.spaces,
      view: view.snapshot(),
    }),
};
renderSelection();
refresh(true);
