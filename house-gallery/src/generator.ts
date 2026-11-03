import type {
  Family,
  House,
  HousePart,
  HouseResult,
  Point,
  Polygon,
  Scenario,
} from "./model";
import { FAMILY_LABELS } from "./model";
import {
  add,
  contains,
  distance,
  hash,
  random,
  rect,
  rotate,
  ribbon,
  separated,
  transform,
} from "./geometry";

interface Anchor {
  center: Point;
  angle: number;
  frontage?: string;
  target?: Point;
  score: number;
}
export const CLEARANCE = {
  water: 0.85,
  road: 0.45,
  path: 0.35,
  square: 0.5,
  blocker: 0.65,
};
const OVERHANG = 0.35;

function partsFor(
  family: Exclude<Family, "auto">,
  width: number,
  depth: number,
  floors: number,
): HousePart[] {
  const wallHeight = floors * 2.7;
  const base: HousePart = {
    center: { x: 0, z: 0 },
    width,
    depth,
    wallHeight,
    roofHeight: width * 0.64,
    roof: family === "longhouse" ? "hip" : "gable",
    overhang: OVERHANG,
  };
  if (family !== "winghouse") return [base];
  const mainWidth = width * 0.57;
  return [
    {
      ...base,
      width: mainWidth,
      center: { x: -(width - mainWidth) / 2, z: 0 },
      roofHeight: mainWidth * 0.68,
    },
    {
      ...base,
      width: width - mainWidth,
      depth: depth * 0.52,
      center: { x: mainWidth / 2, z: depth * 0.24 },
      wallHeight: Math.max(2.7, wallHeight - 0.8),
      roof: "shed",
      roofHeight: 1.5,
      overhang: 0.25,
    },
  ];
}

function envelopesFor(
  parts: HousePart[],
  center: Point,
  angle: number,
): Polygon[] {
  return parts.map((part) =>
    rect(
      transform(part.center, center, angle),
      part.width + part.overhang * 2,
      part.depth + part.overhang * 2,
      angle,
    ),
  );
}

export function placementIsValid(
  scenario: Scenario,
  envelopes: Polygon[],
  height: number,
): boolean {
  if (!Number.isFinite(height) || height > scenario.maxHeight) return false;
  for (const polygon of envelopes) {
    if (
      !polygon.every(
        (p) =>
          Number.isFinite(p.x) &&
          Number.isFinite(p.z) &&
          contains(p, scenario.buildArea),
      )
    )
      return false;
    for (const surface of scenario.surfaces) {
      if (
        surface.polygons.some(
          (obstacle) => !separated(polygon, obstacle, CLEARANCE[surface.kind]),
        )
      )
        return false;
    }
    for (const blocker of scenario.blockers) {
      if (
        !separated(
          polygon,
          rect(blocker.center, blocker.width, blocker.depth, blocker.angle),
          CLEARANCE.blocker,
        )
      )
        return false;
    }
  }
  return true;
}

/** Local context selects a form preference. No city-wide planning or renderer dependency. */
function chooseFamily(
  scenario: Scenario,
  roll: number,
): Exclude<Family, "auto"> {
  const widestRoad = Math.max(
    0,
    ...scenario.surfaces
      .filter((s) => s.kind === "road")
      .flatMap((s) => s.widths ?? [0]),
  );
  const waterfront = scenario.surfaces.some((s) => s.kind === "water");
  const options: Exclude<Family, "auto">[] =
    widestRoad >= 6
      ? ["townhouse", "winghouse", "townhouse", "longhouse"]
      : waterfront
        ? ["longhouse", "cottage", "winghouse", "cottage"]
        : ["cottage", "townhouse", "longhouse", "winghouse"];
  return options[Math.floor(roll * options.length)];
}

function candidateAnchors(
  scenario: Scenario,
  depth: number,
  jitter: number,
): Anchor[] {
  const anchors: Anchor[] = [];
  for (const surface of scenario.surfaces) {
    if (!surface.centerline || !surface.widths || surface.kind === "water")
      continue;
    const points = surface.centerline;
    for (let i = 0; i < points.length - 1; i++) {
      const a = points[i],
        b = points[i + 1];
      const angle = Math.atan2(b.z - a.z, b.x - a.x);
      for (const t of [0.25, 0.5, 0.75]) {
        const target = { x: a.x + (b.x - a.x) * t, z: a.z + (b.z - a.z) * t };
        const width =
          surface.widths[i] + (surface.widths[i + 1] - surface.widths[i]) * t;
        for (const side of [1, -1]) {
          const offset = width / 2 + depth / 2 + OVERHANG + 1.1;
          const center = add(target, rotate({ x: 0, z: offset * side }, angle));
          if (Math.abs(center.x) > 16 || Math.abs(center.z) > 17) continue;
          anchors.push({
            center,
            angle: angle + (side === -1 ? Math.PI : 0),
            frontage: surface.id,
            target,
            score: distance(center, { x: jitter, z: 2 }),
          });
        }
      }
    }
  }
  // A finite fallback lattice is also used for isolated form studies without street access.
  // These candidates do NOT claim a road connection.
  for (const x of [-8, -4, 0, 4, 8])
    for (const z of [-7, -3, 1, 5, 9]) {
      for (const angle of [0, Math.PI / 2])
        anchors.push({
          center: { x, z },
          angle,
          score: 30 + Math.hypot(x - jitter, z - 2),
        });
    }
  return anchors.sort((a, b) => a.score - b.score).slice(0, 180);
}

function accessClear(
  scenario: Scenario,
  entrance: Point,
  target: Point,
): boolean {
  const corridor = ribbon([entrance, target], [1, 1]);
  for (const s of scenario.surfaces.filter((s) => s.kind === "water")) {
    if (
      corridor.some((poly) =>
        s.polygons.some((obstacle) => !separated(poly, obstacle)),
      )
    )
      return false;
  }
  return !scenario.blockers.some((b) =>
    corridor.some(
      (poly) =>
        !separated(poly, rect(b.center, b.width, b.depth, b.angle), 0.1),
    ),
  );
}

/** Bounded constructive fitting. Invalid inputs are rejected; no scaling of a finished model. */
export function generateHouse(
  scenario: Scenario,
  seed: number,
  requested: Family = "auto",
): HouseResult {
  if (!Number.isInteger(seed) || seed < 0 || seed > 0xffffffff)
    return {
      ok: false,
      reason: "Seed muss eine ganze Zahl zwischen 0 und 4294967295 sein.",
      attempts: 0,
    };
  if (
    scenario.buildArea.length < 3 ||
    !scenario.buildArea.every(
      (p) => Number.isFinite(p.x) && Number.isFinite(p.z),
    )
  )
    return { ok: false, reason: "Ungültiger Bauraum.", attempts: 0 };
  const rng = random(seed ^ hash(scenario.spec.id));
  const family =
    requested === "auto" ? chooseFamily(scenario, rng()) : requested;
  const dimensions: Record<
    Exclude<Family, "auto">,
    [number, number, number]
  > = {
    cottage: [5.4, 7.2, 1],
    townhouse: [5.6, 7.8, 2],
    longhouse: [7, 11, 1],
    winghouse: [8.5, 8.5, 2],
  };
  const [baseWidth, baseDepth, baseFloors] = dimensions[family];
  const floors = Math.min(3, baseFloors + (rng() > 0.72 ? 1 : 0));
  const proportion = 0.94 + rng() * 0.14;
  const jitter = (rng() - 0.5) * 5;
  let attempts = 0;
  for (const size of [1.12, 1, 0.86, 0.74]) {
    const width = baseWidth * size * proportion,
      depth = baseDepth * size;
    const parts = partsFor(family, width, depth, floors);
    const height = Math.max(
      ...parts.map((part) => part.wallHeight + part.roofHeight),
    );
    const anchors = candidateAnchors(scenario, depth, jitter);
    for (const anchor of anchors) {
      attempts++;
      const envelopes = envelopesFor(parts, anchor.center, anchor.angle);
      if (!placementIsValid(scenario, envelopes, height)) continue;
      const main = parts[0];
      const entrance = transform(
        { x: main.center.x, z: main.center.z - main.depth / 2 - 0.05 },
        anchor.center,
        anchor.angle,
      );
      if (anchor.target && !accessClear(scenario, entrance, anchor.target))
        continue;
      const house: House = {
        family,
        center: anchor.center,
        angle: anchor.angle,
        parts,
        envelopes,
        entrance,
        frontage: anchor.frontage,
        height,
      };
      return { ok: true, house, attempts };
    }
  }
  return {
    ok: false,
    reason: `Für die Hausform „${FAMILY_LABELS[family]}“ wurde in vier zulässigen Größen und den geprüften Positionen keine kollisionsfreie Platzierung gefunden. Das ist kein mathematischer Unbebaubarkeitsnachweis. Nichts wurde gestaucht oder über Hindernisse gesetzt.`,
    attempts,
  };
}
