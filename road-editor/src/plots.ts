import { contourPoints, ringArea } from "./blockers";
import { HOUSE_RULES, type HouseArea, type HousePoint } from "./house-types";
import { houseGeometry } from "./houses";
import clipping, { type MultiPolygon, type Polygon } from "./overlay";
import type {
  BuildBlocker,
  BuildingComplex,
  ComplexVolume,
  PlannedPlot,
  PlotPlan,
} from "./plot-types";

const INSET = 0.35;
// Per plot, at most 176 roof tests (each at most two overlay operations).
// Geometry is never truncated: only the optional blockout search is bounded.
const MAIN_TESTS = 96;
const WING_TESTS = 32;
const OUTBUILDING_TESTS = 48;
const MAIN_COMPONENTS = 4;
const OUTBUILDINGS = 2;

const polygon = (area: HouseArea): Polygon =>
  [area.outer, ...area.holes].map((ring) => ring.map(({ x, y }) => [x, y]));
const areas = (geometry: MultiPolygon): HouseArea[] =>
  geometry.map(([outer, ...holes]) => ({
    outer: outer.slice(0, -1).map(([x, y]) => ({ x, y })),
    holes: holes.map((ring) => ring.slice(0, -1).map(([x, y]) => ({ x, y }))),
  }));
const areaSize = (area: HouseArea): number =>
  Math.abs(ringArea(area.outer)) -
  area.holes.reduce((sum, ring) => sum + Math.abs(ringArea(ring)), 0);
const totalArea = (values: HouseArea[]): number =>
  values.reduce((sum, area) => sum + areaSize(area), 0);
const clamp = (n: number, low: number, high: number) =>
  Math.max(low, Math.min(high, n));

function random(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let n = Math.imul(state ^ (state >>> 15), state | 1);
    n ^= n + Math.imul(n ^ (n >>> 7), n | 61);
    return ((n ^ (n >>> 14)) >>> 0) / 4294967296;
  };
}
function shuffled<T>(values: T[], next: () => number): T[] {
  for (let i = values.length - 1; i > 0; i--) {
    const j = Math.floor(next() * (i + 1));
    [values[i], values[j]] = [values[j], values[i]];
  }
  return values;
}
function rotate(point: HousePoint, angle: number): HousePoint {
  const c = Math.cos(angle),
    s = Math.sin(angle);
  return { x: c * point.x - s * point.y, y: s * point.x + c * point.y };
}
interface Bounds {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}
function bounds(points: HousePoint[]): Bounds {
  const result = {
    minX: Infinity,
    minY: Infinity,
    maxX: -Infinity,
    maxY: -Infinity,
  };
  for (const { x, y } of points) {
    result.minX = Math.min(result.minX, x);
    result.minY = Math.min(result.minY, y);
    result.maxX = Math.max(result.maxX, x);
    result.maxY = Math.max(result.maxY, y);
  }
  return result;
}
function overlaps(a: Bounds, b: Bounds): boolean {
  return (
    a.minX < b.maxX && b.minX < a.maxX && a.minY < b.maxY && b.minY < a.maxY
  );
}
interface Edge {
  a: HousePoint;
  b: HousePoint;
  length: number;
}
interface Component {
  area: HouseArea;
  polygon: Polygon;
  edges: Edge[];
}
function component(area: HouseArea): Component {
  return {
    area,
    polygon: polygon(area),
    edges: area.outer
      .map((a, i, ring) => {
        const b = ring[(i + 1) % ring.length];
        return { a, b, length: Math.hypot(b.x - a.x, b.y - a.y) };
      })
      .filter((edge) => edge.length > 0)
      .sort((a, b) => b.length - a.length)
      .slice(0, 4),
  };
}
interface Frame {
  origin: HousePoint;
  angle: number;
  bounds: Bounds;
  edges: Edge[];
  winding: number;
}
function frame(part: Component, angle: number): Frame {
  const origin = part.area.outer[0];
  const local = (p: HousePoint) =>
    rotate({ x: p.x - origin.x, y: p.y - origin.y }, -angle);
  return {
    origin,
    angle,
    bounds: bounds(part.area.outer.map(local)),
    edges: part.edges.map(({ a, b, length }) => ({
      a: local(a),
      b: local(b),
      length,
    })),
    winding: Math.sign(ringArea(part.area.outer)),
  };
}
function world(local: HousePoint, space: Frame): HousePoint {
  const point = rotate(local, space.angle);
  return { x: point.x + space.origin.x, y: point.y + space.origin.y };
}
interface Size {
  width: number;
  depth: number;
}
function sizes(space: Frame, scale: number, main?: ComplexVolume): Size[] {
  const width = main
    ? clamp(main.width * 0.55, 3, 6)
    : clamp((space.bounds.maxX - space.bounds.minX) * scale, 4, 14);
  const depth = main
    ? clamp(main.depth * 0.6, 3, 5)
    : clamp((space.bounds.maxY - space.bounds.minY) * scale, 4, 10);
  const minimum = main ? 3 : 4;
  return [
    { width, depth },
    {
      width: Math.max(minimum, width * 0.72),
      depth: Math.max(minimum, depth * 0.72),
    },
    { width: minimum, depth: minimum },
  ].filter(
    (size, i, all) =>
      all.findIndex((s) => s.width === size.width && s.depth === size.depth) ===
      i,
  );
}
function centers(space: Frame, size: Size, next: () => number): HousePoint[] {
  const halfX = size.width / 2 + HOUSE_RULES.overhang,
    halfY = size.depth / 2 + HOUSE_RULES.overhang,
    lowX = space.bounds.minX + halfX + INSET,
    highX = space.bounds.maxX - halfX - INSET,
    lowY = space.bounds.minY + halfY + INSET,
    highY = space.bounds.maxY - halfY - INSET;
  if (lowX > highX || lowY > highY) return [];
  // Edge midpoints, inset by the actual oriented roof support, also reach
  // usable arms of concave sites whose bounding-box center is outside.
  const edgeCenters = space.edges.map(({ a, b, length }) => {
    const nx = (-(b.y - a.y) / length) * space.winding,
      ny = ((b.x - a.x) / length) * space.winding,
      inset = Math.abs(nx) * halfX + Math.abs(ny) * halfY + INSET;
    return { x: (a.x + b.x) / 2 + nx * inset, y: (a.y + b.y) / 2 + ny * inset };
  });
  const local = [
    { x: (lowX + highX) / 2, y: (lowY + highY) / 2 },
    ...shuffled(edgeCenters, next),
    ...shuffled(
      [
        { x: lowX, y: lowY },
        { x: highX, y: lowY },
        { x: highX, y: highY },
        { x: lowX, y: highY },
      ],
      next,
    ),
  ];
  return local
    .filter(
      (p, i) =>
        !local.slice(0, i).some((q) => Math.hypot(p.x - q.x, p.y - q.y) < 1e-7),
    )
    .map((point) => world(point, space));
}
function fits(
  volume: ComplexVolume,
  part: Component,
  blocked: MultiPolygon,
): boolean {
  const roof: Polygon = [houseGeometry(volume).roof.map(({ x, y }) => [x, y])];
  // Do not use corners or area tolerances: an arbitrarily small enclosed
  // obstacle is enough to reject the *whole* unmodified roof envelope.
  return (
    !clipping.difference(roof, part.polygon).length &&
    !clipping.intersection(roof, blocked).length
  );
}
function wings(main: ComplexVolume, next: () => number): ComplexVolume[] {
  const width = clamp(main.width * 0.42, 3, 5),
    depth = clamp(main.depth * 0.65, 3, 6);
  return shuffled([-1, 1], next).flatMap((side) =>
    shuffled([-1, 1], next).map((end) => {
      // A small wall overlap makes the lower wing physically attached. Each
      // roof must independently fit the same component, never bridge a road.
      const offset = rotate(
        {
          x: side * ((main.width + width) / 2 - 0.2),
          y: (end * (main.depth - depth)) / 2,
        },
        main.angle,
      );
      return {
        ...main,
        id: `${main.id}-wing`,
        role: "wing" as const,
        center: { x: main.center.x + offset.x, y: main.center.y + offset.y },
        width,
        depth,
        storeys: 1 as const,
      };
    }),
  );
}
function buildComplex(
  plan: PlotPlan,
  seed: number,
  blocked: MultiPolygon,
): BuildingComplex | undefined {
  const parts = [...plan.buildable]
      .sort((a, b) => areaSize(b) - areaSize(a))
      .map(component),
    next = random(seed),
    scale = 0.46 + next() * 0.08,
    id = `complex-${plan.id}`;
  let mainTests = 0,
    wingTests = 0;
  let chosen:
    | { main: ComplexVolume; part: Component; wing?: ComplexVolume }
    | undefined;
  search: for (const part of parts.slice(0, MAIN_COMPONENTS)) {
    const edge = part.edges[0],
      angle = Math.atan2(edge.b.y - edge.a.y, edge.b.x - edge.a.x);
    for (const orientation of [angle, angle + Math.PI / 2]) {
      const space = frame(part, orientation);
      for (const size of sizes(space, scale))
        for (const center of centers(space, size, next)) {
          if (mainTests++ >= MAIN_TESTS) break search;
          const main: ComplexVolume = {
            id: `${id}-main`,
            role: "main",
            center,
            angle: orientation,
            ...size,
            storeys: 2,
            ridge: "width",
          };
          if (!fits(main, part, blocked)) continue;
          chosen ??= { main, part };
          for (const wing of wings(main, next)) {
            if (wingTests++ >= WING_TESTS) break search;
            if (fits(wing, part, blocked)) {
              chosen = { main, part, wing };
              break search;
            }
          }
        }
    }
  }
  if (!chosen) return undefined;
  const volumes: ComplexVolume[] = [chosen.main];
  if (chosen.wing) volumes.push(chosen.wing);
  let outbuildingTests = 0,
    outbuildings = 0;
  extras: for (const part of parts) {
    if (part === chosen.part) continue;
    if (outbuildings >= OUTBUILDINGS) break;
    const space = frame(part, chosen.main.angle);
    for (const size of sizes(space, scale, chosen.main))
      for (const center of centers(space, size, next)) {
        if (outbuildingTests++ >= OUTBUILDING_TESTS) break extras;
        const outbuilding: ComplexVolume = {
          ...chosen.main,
          id: `${id}-outbuilding-${outbuildings + 1}`,
          role: "outbuilding",
          storeys: 1,
          center,
          ...size,
        };
        if (fits(outbuilding, part, blocked)) {
          volumes.push(outbuilding);
          outbuildings++;
          continue extras;
        }
      }
  }
  if (parts.length > 1 + outbuildings)
    plan.messages.push(
      "Weitere Teilflächen bleiben unbebaut (begrenzte Blockout-Suche).",
    );
  return { id, volumes };
}

export function planPlots(
  plots: PlannedPlot[],
  blockers: BuildBlocker[],
): PlotPlan[] {
  if (!plots.length) return [];
  // Both blocker kinds remain caller-owned source data. Only current ground
  // usability is derived here; never replace the drawn site with its difference.
  const blocked: MultiPolygon = clipping.union(
    blockers.flatMap((blocker) => blocker.areas.map(polygon)),
  );
  const plans: PlotPlan[] = plots.map((plot) => {
    const planned: HouseArea = {
      outer:
        plot.outer.length < 2
          ? plot.outer.map((p) => ({ ...p }))
          : contourPoints(plot.outer, plot.outerEdges),
      holes: (plot.holes ?? []).map((ring, i) =>
        contourPoints(ring, plot.holeEdges?.[i]),
      ),
    };
    const plan: PlotPlan = {
      id: plot.id,
      planned,
      buildable: [],
      excluded: [],
      plannedArea: Math.max(0, areaSize(planned)),
      buildableArea: 0,
      excludedArea: 0,
      messages: [],
    };
    if (plan.plannedArea <= 0) {
      plan.messages.push("Bauplatz hat keine positive Fläche.");
      return plan;
    }
    plan.buildable = areas(clipping.difference(polygon(planned), blocked));
    plan.excluded = areas(clipping.intersection(polygon(planned), blocked));
    plan.buildableArea = totalArea(plan.buildable);
    plan.excludedArea = totalArea(plan.excluded);
    if (plan.buildableArea <= 0)
      plan.messages.push(
        "Keine bebaubare Fläche: Bauplatz vollständig durch Weg oder Wasser gesperrt.",
      );
    return plan;
  });
  const boxes = plans.map((plan) => bounds(plan.planned.outer)),
    conflicts = new Set<number>();
  // Reject both full planned sites, even if their overlap is currently blocked.
  // There is no order-dependent allocation or silently discarded geometry.
  for (let i = 0; i < plans.length; i++)
    for (let j = i + 1; j < plans.length; j++) {
      if (
        plans[i].plannedArea <= 0 ||
        plans[j].plannedArea <= 0 ||
        !overlaps(boxes[i], boxes[j])
      )
        continue;
      if (
        !clipping.intersection(
          polygon(plans[i].planned),
          polygon(plans[j].planned),
        ).length
      )
        continue;
      conflicts.add(i);
      conflicts.add(j);
      plans[i].messages.push(
        `Konflikt: Geplanter Bauplatz überschneidet sich mit „${plans[j].id}“; keine Bebauung.`,
      );
      plans[j].messages.push(
        `Konflikt: Geplanter Bauplatz überschneidet sich mit „${plans[i].id}“; keine Bebauung.`,
      );
    }
  for (let i = 0; i < plans.length; i++) {
    const plan = plans[i];
    if (conflicts.has(i) || plan.buildableArea <= 0) continue;
    const complex = buildComplex(plan, plots[i].seed, blocked);
    if (complex) plan.complex = complex;
    else
      plan.messages.push(
        "Keine passende Dachhülle: Teilflächen zu klein, zu schmal oder innerhalb der begrenzten Suche nicht bebaubar.",
      );
  }
  return plans;
}
