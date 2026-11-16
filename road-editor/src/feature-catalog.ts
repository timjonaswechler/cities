export type FeatureId =
  | "room"
  | "roof"
  | "annex"
  | "overhang"
  | "gate"
  | "wall"
  | "connection";
export type Values = Record<string, number | string>;
export interface NumberProperty {
  kind: "number";
  key: string;
  label: string;
  min: number;
  max: number;
  step: number;
  value: number;
  unit: string;
  when?: { key: string; value: string; not?: boolean };
}
export interface ChoiceProperty {
  kind: "choice" | "material";
  key: string;
  label: string;
  value: string;
  options: { value: string; label: string }[];
  when?: { key: string; value: string; not?: boolean };
}
export type FeatureProperty = NumberProperty | ChoiceProperty;
export interface LimitDefinition {
  key: string;
  label: string;
  metric: "height" | "projection" | "clearance";
  comparison: "max" | "min";
  when?: { key: string; value: string; not?: boolean };
  min: number;
  max: number;
}
export interface FeatureDefinition {
  id: FeatureId;
  label: string;
  short: string;
  owner: "building" | "plot" | "either";
  properties: FeatureProperty[];
  limits: LimitDefinition[];
}
export const materials = [
  { id: "plaster", label: "Putz", color: "#d9c7a7" },
  { id: "timber", label: "Holz", color: "#8c6546" },
  { id: "stone", label: "Stein", color: "#a6a69c" },
  { id: "brick", label: "Ziegelmauerwerk", color: "#ab705b" },
  { id: "tile", label: "Dachziegel", color: "#9e5f47" },
  { id: "shingle", label: "Holzschindeln", color: "#756c5c" },
  { id: "reed", label: "Reet", color: "#b4a06b" },
  { id: "copper", label: "Kupfer", color: "#648a7b" },
] as const;
const number = (
  key: string,
  label: string,
  min: number,
  max: number,
  value: number,
  step = 0.1,
): NumberProperty => ({
  kind: "number",
  key,
  label,
  min,
  max,
  value,
  step,
  unit: "m",
});
const choice = (
  key: string,
  label: string,
  options: [string, string][],
  value = options[0][0],
): ChoiceProperty => ({
  kind: "choice",
  key,
  label,
  value,
  options: options.map(([value, label]) => ({ value, label })),
});
const material = (
  key = "material",
  label = "Material",
  ids: string[] = ["plaster", "timber", "stone", "brick"],
  value = ids[0],
): ChoiceProperty => ({
  kind: "material",
  key,
  label,
  value,
  options: materials
    .filter((m) => ids.includes(m.id))
    .map((m) => ({ value: m.id, label: m.label })),
});
const heightLimit: LimitDefinition = {
  key: "maxHeight",
  label: "Höhe ab Boden max.",
  metric: "height",
  comparison: "max",
  min: 0.2,
  max: 16,
};
const roofs: [string, string][] = [
  ["gable", "Satteldach"],
  ["hip", "Walmdach"],
  ["shed", "Pultdach"],
  ["flat", "Flachdach"],
];
export const features: FeatureDefinition[] = [
  {
    id: "room",
    label: "Raumkörper",
    short: "01",
    owner: "building",
    limits: [heightLimit],
    properties: [
      number("width", "Breite", 2, 14, 6),
      number("depth", "Tiefe", 2, 16, 8),
      number("height", "Raumhöhe", 2.2, 6, 2.8),
      number("thickness", "Wandstärke", 0.1, 0.5, 0.2, 0.05),
      choice("front", "Vorderseite", [
        ["door", "Mit Türöffnung"],
        ["open", "Offen / Schnitt"],
      ]),
      material(),
    ],
  },
  {
    id: "roof",
    label: "Dach",
    short: "02",
    owner: "building",
    limits: [{ ...heightLimit, label: "Dachhöhe max." }],
    properties: [
      choice("shape", "Dachform", roofs),
      number("width", "Breite", 2, 16, 7),
      number("depth", "Tiefe", 2, 18, 9),
      {
        ...number("rise", "Dachhöhe", 0.3, 6, 2.4),
        when: { key: "shape", value: "flat", not: true },
      },
      {
        ...number("thickness", "Dachstärke", 0.1, 0.6, 0.25, 0.05),
        when: { key: "shape", value: "flat" },
      },
      number("eaves", "Dachüberstand", 0, 1.2, 0.4),
      material(
        "material",
        "Dachmaterial",
        ["tile", "shingle", "reed", "copper"],
        "tile",
      ),
    ],
  },
  {
    id: "annex",
    label: "Anbau",
    short: "03",
    owner: "building",
    limits: [heightLimit],
    properties: [
      number("width", "Breite", 2, 8, 4),
      number("depth", "Tiefe", 2, 10, 5),
      number("height", "Wandhöhe", 2.2, 5, 2.6),
      choice("shape", "Dachform", [
        ["shed", "Pultdach"],
        ["gable", "Satteldach"],
      ]),
      number("rise", "Dachhöhe", 0.3, 3, 1.1),
      number("eaves", "Dachüberstand", 0, 0.8, 0.3),
      material(),
      material(
        "roofMaterial",
        "Dachmaterial",
        ["tile", "shingle", "reed", "copper"],
        "tile",
      ),
    ],
  },
  {
    id: "overhang",
    label: "Überhang",
    short: "04",
    owner: "building",
    limits: [
      heightLimit,
      {
        key: "maxProjection",
        label: "Vorstoß max.",
        metric: "projection",
        comparison: "max",
        min: 0,
        max: 2,
      },
    ],
    properties: [
      number("width", "Breite", 3, 12, 6),
      number("depth", "Untere Bautiefe", 3, 12, 6),
      number("base", "Unteres Geschoss", 2.2, 5, 2.8),
      number("height", "Obergeschosshöhe", 2.2, 4.5, 2.6),
      number("projection", "Vorstoß nach vorn", 0, 1.5, 0.5),
      choice("supports", "Konsolen", [
        ["yes", "Mit Konsolen"],
        ["no", "Ohne Konsolen"],
      ]),
      material(),
    ],
  },
  {
    id: "gate",
    label: "Torbogen",
    short: "05",
    owner: "either",
    limits: [
      heightLimit,
      {
        key: "minClearance",
        label: "Lichte Höhe min.",
        metric: "clearance",
        comparison: "min",
        min: 1.8,
        max: 5,
      },
    ],
    properties: [
      choice("shape", "Öffnung", [
        ["arch", "Bogen"],
        ["lintel", "Gerader Sturz"],
      ]),
      number("span", "Lichte Breite", 1.2, 6, 3),
      number("clearance", "Lichte Mindesthöhe", 1.8, 5, 2.8),
      {
        ...number("rise", "Bogenanstieg", 0.2, 2.5, 1.1),
        when: { key: "shape", value: "arch" },
      },
      number("pier", "Pfeilerbreite", 0.25, 1.5, 0.6, 0.05),
      number("lintel", "Wand über Öffnung", 0.15, 1.2, 0.4, 0.05),
      number("depth", "Durchgangstiefe", 0.4, 8, 2),
      material("material", "Material", ["stone", "brick", "plaster"], "stone"),
    ],
  },
  {
    id: "wall",
    label: "Grundstücksmauer",
    short: "06",
    owner: "plot",
    limits: [heightLimit],
    properties: [
      number("length", "Länge", 2, 20, 8),
      number("height", "Mauerhöhe", 0.5, 4, 1.5),
      number("thickness", "Mauerstärke", 0.15, 0.8, 0.35, 0.05),
      choice("cap", "Abdeckung", [
        ["flat", "Flach"],
        ["pitched", "Sattelförmig"],
      ]),
      choice("pillars", "Endpfeiler", [
        ["no", "Ohne Pfeiler"],
        ["yes", "Mit Pfeilern"],
      ]),
      material("material", "Material", ["stone", "brick", "timber"], "stone"),
    ],
  },
  {
    id: "connection",
    label: "Verbindungsgang",
    short: "07",
    owner: "either",
    limits: [
      heightLimit,
      {
        key: "minClearance",
        label: "Durchgangshöhe min.",
        metric: "clearance",
        comparison: "min",
        min: 1.8,
        max: 4,
        when: { key: "cover", value: "covered" },
      },
    ],
    properties: [
      number("length", "Länge", 2, 14, 6),
      number("width", "Breite", 1.2, 5, 2.4),
      number("base", "Bodenhöhe", 0, 4, 0),
      number("clearance", "Freie Höhe", 1.8, 4, 2.5),
      choice("cover", "Ausführung", [
        ["covered", "Überdacht"],
        ["open", "Offener Steg"],
      ]),
      {
        ...number("rise", "Dachhöhe", 0.2, 2, 0.7),
        when: { key: "cover", value: "covered" },
      },
      material("material", "Tragwerk", ["timber", "stone", "brick"], "timber"),
      {
        ...material(
          "roofMaterial",
          "Dachmaterial",
          ["tile", "shingle", "reed", "copper"],
          "shingle",
        ),
        when: { key: "cover", value: "covered" },
      },
    ],
  },
];
export function feature(id: string): FeatureDefinition {
  const result = features.find((f) => f.id === id);
  if (!result) throw new Error(`Unbekanntes Feature: ${id}`);
  return result;
}
export function defaults(id: FeatureId): Values {
  return Object.fromEntries(
    feature(id).properties.map((p) => [p.key, p.value]),
  );
}
export function visible(
  property: { when?: { key: string; value: string; not?: boolean } },
  values: Values,
) {
  return (
    !property.when ||
    (property.when.not
      ? values[property.when.key] !== property.when.value
      : values[property.when.key] === property.when.value)
  );
}
export function validateValues(
  id: FeatureId,
  values: unknown,
): asserts values is Values {
  if (!values || typeof values !== "object" || Array.isArray(values))
    throw new Error("Ungültige Eigenschaften.");
  const map = values as Values,
    definition = feature(id);
  if (Object.keys(map).length !== definition.properties.length)
    throw new Error("Unbekannte oder fehlende Eigenschaft.");
  for (const p of definition.properties) {
    const value = map[p.key];
    if (
      p.kind === "number"
        ? typeof value !== "number" ||
          !Number.isFinite(value) ||
          value < p.min ||
          value > p.max
        : typeof value !== "string" || !p.options.some((o) => o.value === value)
    )
      throw new Error(`Ungültiger Wert für ${p.label}.`);
  }
}
export interface FeaturePolicy {
  allowed: boolean;
  materials: string[];
  limits: Record<string, number>;
}
export interface LocationDefinition {
  id: string;
  label: string;
  features: Record<FeatureId, FeaturePolicy>;
}
export interface ZooConfig {
  format: "wegwerk-feature-zoo";
  version: 1;
  selectedFeature: FeatureId;
  selectedLocation: string;
  values: Record<FeatureId, Values>;
  locations: LocationDefinition[];
}
export function initialConfig(): ZooConfig {
  const locations = [
    {
      id: "free",
      label: "Freie Prüfung",
      allowed: materials.map((m) => m.id),
      height: 16,
      projection: 2,
      clearance: 1.8,
    },
    {
      id: "village",
      label: "Dorf / Landwirtschaft",
      allowed: ["plaster", "timber", "stone", "tile", "shingle", "reed"],
      height: 8,
      projection: 0.4,
      clearance: 2.2,
    },
    {
      id: "town",
      label: "Stadt / Handwerk",
      allowed: [
        "plaster",
        "timber",
        "stone",
        "brick",
        "tile",
        "shingle",
        "copper",
      ],
      height: 10,
      projection: 0.6,
      clearance: 2.5,
    },
    {
      id: "institution",
      label: "Institution / Repräsentation",
      allowed: ["plaster", "stone", "brick", "tile", "copper"],
      height: 12,
      projection: 0.3,
      clearance: 2.8,
    },
  ].map((l) => ({
    id: l.id,
    label: l.label,
    features: Object.fromEntries(
      features.map((f) => [
        f.id,
        {
          allowed: true,
          materials: l.allowed.filter((m) =>
            f.properties.some(
              (p) =>
                p.kind === "material" && p.options.some((o) => o.value === m),
            ),
          ),
          limits: Object.fromEntries(
            f.limits.map((limit) => [
              limit.key,
              limit.key === "maxProjection"
                ? l.projection
                : limit.key === "minClearance"
                  ? l.clearance
                  : f.id === "roof" && l.id !== "free"
                    ? l.id === "village"
                      ? 3
                      : 4
                    : f.id === "wall" && l.id !== "free"
                      ? 2.5
                      : l.height,
            ]),
          ),
        },
      ]),
    ) as Record<FeatureId, FeaturePolicy>,
  }));
  return {
    format: "wegwerk-feature-zoo",
    version: 1,
    selectedFeature: "room",
    selectedLocation: "free",
    values: Object.fromEntries(
      features.map((f) => [f.id, defaults(f.id)]),
    ) as Record<FeatureId, Values>,
    locations,
  };
}
export function policyIssues(
  id: FeatureId,
  values: Values,
  metrics: Record<string, number>,
  policy: FeaturePolicy,
): string[] {
  const f = feature(id),
    issues: string[] = [];
  if (!policy.allowed) issues.push(`${f.label} ist hier nicht freigegeben.`);
  for (const p of f.properties.filter((p) => p.kind === "material"))
    if (visible(p, values) && !policy.materials.includes(String(values[p.key])))
      issues.push(
        `${p.label}: ${materials.find((m) => m.id === values[p.key])?.label ?? values[p.key]} ist hier nicht freigegeben.`,
      );
  for (const limit of f.limits) {
    if (!visible(limit, values)) continue;
    const actual = metrics[limit.metric],
      bound = policy.limits[limit.key];
    if (!Number.isFinite(actual))
      throw new Error(`Fehlende Messgröße: ${limit.metric}`);
    if (
      limit.comparison === "max" ? actual > bound + 1e-6 : actual < bound - 1e-6
    )
      issues.push(
        `${limit.label} ${bound.toFixed(2)} m · aktuell ${actual.toFixed(2)} m.`,
      );
  }
  return issues;
}
export function parseConfig(text: string): ZooConfig {
  const c = JSON.parse(text) as ZooConfig;
  if (
    !c ||
    c.format !== "wegwerk-feature-zoo" ||
    c.version !== 1 ||
    !features.some((f) => f.id === c.selectedFeature) ||
    !c.values ||
    Object.keys(c.values).length !== features.length ||
    !Array.isArray(c.locations) ||
    c.locations.length < 1 ||
    c.locations.length > 16
  )
    throw new Error("Ungültige Zoo-Konfiguration.");
  for (const f of features) validateValues(f.id, c.values[f.id]);
  const ids = new Set<string>();
  for (const l of c.locations) {
    if (
      !l ||
      typeof l.id !== "string" ||
      !l.id.length ||
      ids.has(l.id) ||
      typeof l.label !== "string" ||
      !l.label.length ||
      l.label.length > 80 ||
      !l.features ||
      Object.keys(l.features).length !== features.length
    )
      throw new Error("Ungültige Lokation.");
    ids.add(l.id);
    for (const f of features) {
      const p = l.features[f.id];
      if (
        !p ||
        typeof p.allowed !== "boolean" ||
        !Array.isArray(p.materials) ||
        p.materials.some((m) => !materials.some((x) => x.id === m)) ||
        new Set(p.materials).size !== p.materials.length ||
        !p.limits ||
        Object.keys(p.limits).length !== f.limits.length
      )
        throw new Error("Ungültige Feature-Freigabe.");
      for (const limit of f.limits)
        if (
          !Number.isFinite(p.limits[limit.key]) ||
          p.limits[limit.key] < limit.min ||
          p.limits[limit.key] > limit.max
        )
          throw new Error("Ungültige Lokationsgrenze.");
    }
  }
  if (!ids.has(c.selectedLocation)) throw new Error("Lokation fehlt.");
  return c;
}
