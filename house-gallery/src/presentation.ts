import type { Scenario, ScenarioSpec } from "./model";
import { NEIGHBOR_LABELS } from "./model";
import { GROUPS, widthLabel } from "./scenarios";

export interface ContextFacts {
  routeProfiles: string[];
  waterProfiles: string[];
  waterDrop?: number;
  summary: string;
  /** Positive physical facts only: a negated "without road" must not match a road query. */
  searchText: string;
}

/** Catalog factors are bookkeeping, not evidence that a route exists.
 * Only actual centerlines with actual widths are physical width profiles. */
export function describeContext(scenario: Scenario): ContextFacts {
  const routeProfiles: string[] = [],
    waterProfiles: string[] = [];
  for (const surface of scenario.surfaces) {
    if (!surface.centerline || !surface.widths?.length) continue;
    const prefix =
      surface.kind === "road"
        ? "r"
        : surface.kind === "path"
          ? "p"
          : surface.kind === "water"
            ? "w"
            : undefined;
    if (!prefix) continue;
    const first = surface.widths[0],
      last = surface.widths.at(-1)!;
    const token = `${prefix}${first}${first === last ? "" : `-${last}`}`;
    const list = prefix === "w" ? waterProfiles : routeProfiles;
    if (!list.includes(token)) list.push(token);
  }
  const water = scenario.surfaces.filter((s) => s.kind === "water");
  const hasWaterArea = water.some((s) => !s.centerline);
  const hasSquare = scenario.surfaces.some((s) => s.kind === "square");
  const positive = [...routeProfiles, ...waterProfiles].map(widthLabel);
  if (hasWaterArea) positive.push("Freie Wasserfläche · keine Trassenbreite");
  const summary =
    positive.join(" · ") ||
    (hasSquare ? "Freifläche · ohne Straße oder Weg" : "Ohne Straße oder Weg");
  const searchText = [
    ...routeProfiles,
    ...waterProfiles,
    ...positive,
    ...(hasSquare ? ["Freifläche Platz"] : []),
    ...(water.length ? ["Wasser Gewässer Ufer"] : []),
  ]
    .join(" ")
    .toLocaleLowerCase("de");
  return {
    routeProfiles,
    waterProfiles,
    waterDrop: water[0]?.drop,
    summary,
    searchText,
  };
}

export interface ContextFilter {
  route?: string;
  water?: string;
  neighbors?: string;
  search?: string;
}
export function matchesContext(
  spec: ScenarioSpec,
  facts: ContextFacts,
  filter: ContextFilter,
): boolean {
  if (filter.route && !facts.routeProfiles.includes(filter.route)) return false;
  if (filter.water && !facts.waterProfiles.includes(filter.water)) return false;
  if (filter.neighbors && filter.neighbors !== spec.neighbors) return false;
  const query = (filter.search ?? "").trim().toLocaleLowerCase("de");
  // Stable complete IDs remain findable, but neutral tokens do not enter ordinary physical search.
  if (query.includes("~"))
    return spec.id.toLocaleLowerCase("de").includes(query);
  const text =
    `${spec.label} ${GROUPS.find((g) => g.id === spec.group)!.label} ${NEIGHBOR_LABELS[spec.neighbors]} ${facts.searchText}`.toLocaleLowerCase(
      "de",
    );
  return text.includes(query);
}
