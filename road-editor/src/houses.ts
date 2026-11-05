import {
  HOUSE_RULES,
  HOUSE_PROFILES,
  type House,
  type HouseArea,
  type HouseGeometry,
  type HousePoint,
  type HouseRequest,
  type HouseResult,
} from "./house-types";
import clipping, { type MultiPolygon, type Polygon } from "./overlay";

const EPS = 1e-8;
const add = (a: HousePoint, b: HousePoint): HousePoint => ({
  x: a.x + b.x,
  y: a.y + b.y,
});
const sub = (a: HousePoint, b: HousePoint): HousePoint => ({
  x: a.x - b.x,
  y: a.y - b.y,
});
const mul = (a: HousePoint, n: number): HousePoint => ({
  x: a.x * n,
  y: a.y * n,
});
const dot = (a: HousePoint, b: HousePoint) => a.x * b.x + a.y * b.y;
const cross = (a: HousePoint, b: HousePoint) => a.x * b.y - a.y * b.x;
const length = (p: HousePoint) => Math.hypot(p.x, p.y);
const normal = (p: HousePoint): HousePoint => ({ x: -p.y, y: p.x });
const finitePoint = (p: HousePoint) =>
  p && Number.isFinite(p.x) && Number.isFinite(p.y);
const polygon = (points: HousePoint[]): Polygon => [
  points.map((p) => [p.x, p.y]),
];
const areaPolygon = (area: HouseArea): Polygon => [
  polygon(area.outer)[0],
  ...area.holes.map((hole) => polygon(hole)[0]),
];
const rings = (areas: MultiPolygon): HousePoint[][] =>
  areas.flatMap((area) => area.map((ring) => ring.map(([x, y]) => ({ x, y }))));
const union = (areas: HouseArea[]): MultiPolygon =>
  areas.length
    ? clipping.union(areaPolygon(areas[0]), ...areas.slice(1).map(areaPolygon))
    : [];

/** The only construction of the wall, roof, ridge and front entrance geometry. */
export function houseGeometry(house: House): HouseGeometry {
  const c = Math.cos(house.angle),
    s = Math.sin(house.angle);
  const world = (x: number, y: number): HousePoint => ({
    x: house.center.x + c * x - s * y,
    y: house.center.y + s * x + c * y,
  });
  const rectangle = (w: number, d: number) => [
    world(-w, -d),
    world(w, -d),
    world(w, d),
    world(-w, d),
  ];
  const w = house.width / 2,
    d = house.depth / 2,
    rw = w + HOUSE_RULES.overhang,
    rd = d + HOUSE_RULES.overhang,
    eaveHeight = house.storeys * HOUSE_RULES.storeyHeight;
  return {
    footprint: rectangle(w, d),
    roof: rectangle(rw, rd),
    ridge:
      house.ridge === "width"
        ? [world(-rw, 0), world(rw, 0)]
        : [world(0, -rd), world(0, rd)],
    eaveHeight,
    ridgeHeight: eaveHeight + (house.ridge === "width" ? rd : rw),
    entrance: world(0, -d),
  };
}

function projection(p: HousePoint, a: HousePoint, b: HousePoint): HousePoint {
  const v = sub(b, a),
    den = dot(v, v),
    t = den ? Math.max(0, Math.min(1, dot(sub(p, a), v) / den)) : 0;
  return add(a, mul(v, t));
}
function segmentDistance(
  a: HousePoint,
  b: HousePoint,
  c: HousePoint,
  d: HousePoint,
): number {
  const v = sub(b, a),
    w = sub(d, c),
    den = cross(v, w);
  if (Math.abs(den) > EPS) {
    const t = cross(sub(c, a), w) / den,
      u = cross(sub(c, a), v) / den;
    if (t >= 0 && t <= 1 && u >= 0 && u <= 1) return 0;
  }
  return Math.min(
    length(sub(a, projection(a, c, d))),
    length(sub(b, projection(b, c, d))),
    length(sub(c, projection(c, a, b))),
    length(sub(d, projection(d, a, b))),
  );
}
function ringDistance(a: HousePoint[], others: HousePoint[][]): number {
  let best = Infinity;
  for (const b of others)
    for (let i = 0; i < a.length; i++)
      for (let j = 0; j < b.length; j++)
        best = Math.min(
          best,
          segmentDistance(
            a[i],
            a[(i + 1) % a.length],
            b[j],
            b[(j + 1) % b.length],
          ),
        );
  return best;
}
function pointInRing(point: HousePoint, ring: Polygon[number]): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [x, y] = ring[i],
      [px, py] = ring[j];
    if (
      y > point.y !== py > point.y &&
      point.x < ((px - x) * (point.y - y)) / (py - y) + x
    )
      inside = !inside;
  }
  return inside;
}
function pointInAreas(point: HousePoint, areas: MultiPolygon): boolean {
  return areas.some(
    ([outer, ...holes]) =>
      pointInRing(point, outer) &&
      !holes.some((hole) => pointInRing(point, hole)),
  );
}
interface Edge {
  point: HousePoint;
  tangent: HousePoint;
  distance: number;
}
interface Context {
  plot: Polygon;
  roads: MultiPolygon;
  water: MultiPolygon;
  roadRings: HousePoint[][];
  waterRings: HousePoint[][];
  edge: Edge;
}
function prepare(request: HouseRequest): Context | string[] {
  const { min, max } = request.bounds;
  if (
    !finitePoint(min) ||
    !finitePoint(max) ||
    min.x >= max.x ||
    min.y >= max.y ||
    !Number.isFinite(request.seed)
  )
    return [
      "Bauplatz und Seed müssen endlich, der Bauplatz muss positiv sein.",
    ];
  const access = request.access;
  if (
    !access ||
    !finitePoint(access.point) ||
    !finitePoint(access.tangent) ||
    length(access.tangent) < EPS
  )
    return ["Zugang am aktuellen Wegrand wählen."];
  for (const area of [...request.roads, ...request.water])
    if (
      ![area.outer, ...area.holes].every(
        (ring) => ring.length >= 3 && ring.every(finitePoint),
      )
    )
      return ["Ungültige Weg- oder Wassergeometrie."];
  const roads = union(request.roads),
    water = union(request.water),
    roadRings = rings(roads),
    waterRings = rings(water);
  let edge: Edge | undefined;
  for (const ring of roadRings)
    for (let i = 0; i < ring.length; i++) {
      const a = ring[i],
        b = ring[(i + 1) % ring.length],
        v = sub(b, a),
        size = length(v);
      if (size < EPS) continue;
      const point = projection(access.point, a, b),
        distance = length(sub(point, access.point));
      if (!edge || distance < edge.distance)
        edge = { point, tangent: mul(v, 1 / size), distance };
    }
  if (!edge || edge.distance > HOUSE_RULES.accessTolerance + EPS)
    return ["Zugang liegt nicht am aktuellen Wegrand."];
  if (
    pointInAreas(access.point, water) ||
    pointInAreas(edge.point, water) ||
    ringDistance([access.point, edge.point], waterRings) <= EPS
  )
    return ["Zugang am Wegrand liegt im Wasser."];
  return {
    plot: polygon([min, { x: max.x, y: min.y }, max, { x: min.x, y: max.y }]),
    roads,
    water,
    roadRings,
    waterRings,
    edge,
  };
}
function parameterErrors(house: House): string[] {
  if (
    !house ||
    typeof house.id !== "string" ||
    !house.id ||
    !finitePoint(house.center) ||
    !Number.isFinite(house.angle)
  )
    return ["Ungültige Hausparameter."];
  if (
    !HOUSE_PROFILES.some(
      (p) =>
        house.width === p.width &&
        house.depth === p.depth &&
        house.storeys === p.storeys &&
        house.ridge === p.ridge,
    )
  )
    return ["Haus entspricht keinem der drei festen Profile."];
  return [];
}
function checkHouse(
  request: HouseRequest,
  house: House,
  context: Context,
): string[] {
  const errors = parameterErrors(house);
  if (errors.length) return errors;
  const geometry = houseGeometry(house),
    roof = polygon(geometry.roof),
    { min, max } = request.bounds;
  if (
    geometry.roof.some(
      (p) =>
        p.x < min.x - EPS ||
        p.y < min.y - EPS ||
        p.x > max.x + EPS ||
        p.y > max.y + EPS,
    )
  )
    errors.push("Dachhülle liegt außerhalb des Bauplatzes.");
  for (const [name, areas, boundaries] of [
    ["Weg", context.roads, context.roadRings],
    ["Wasser", context.water, context.waterRings],
  ] as const)
    if (
      clipping.intersection(roof, areas).length ||
      ringDistance(geometry.roof, boundaries) < HOUSE_RULES.clearance - EPS
    )
      errors.push(`Dachhülle benötigt mindestens 0,5 m Abstand zu ${name}.`);

  const delta = sub(context.edge.point, geometry.entrance),
    size = length(delta),
    front = { x: Math.sin(house.angle), y: -Math.cos(house.angle) };
  if (size < EPS || size > HOUSE_RULES.maxAccessLength + EPS)
    errors.push("Gerader Zugang muss positiv und höchstens 12 m lang sein.");
  if (dot(delta, front) <= EPS)
    errors.push("Der vordere Eingang muss zum gewählten Zugang zeigen.");
  if (errors.length) return errors;

  const direction = mul(delta, 1 / size),
    side = mul(normal(direction), HOUSE_RULES.accessWidth / 2),
    edgeNormal = normal(context.edge.tangent),
    approach = dot(direction, edgeNormal);
  if (Math.abs(approach) < EPS)
    return ["Zugang muss am gewählten Wegrand münden, nicht entlanglaufen."];

  // Cap the constant-width corridor on the actual road edge, not perpendicular
  // to an oblique approach: the latter would incorrectly cross into the road.
  const capOffset = dot(side, edgeNormal) / approach,
    capSide = sub(side, mul(direction, capOffset));
  if (Math.abs(capOffset) >= size - EPS)
    return ["Für einen 1,2 m breiten Zugang fehlt Platz vor dem Wegrand."];
  const nearPlus = add(geometry.entrance, side),
    nearMinus = sub(geometry.entrance, side),
    endPlus = add(context.edge.point, capSide),
    endMinus = sub(context.edge.point, capSide),
    corridorPoints = [nearPlus, nearMinus, endMinus, endPlus],
    corridor = polygon(corridorPoints);
  if (
    clipping.intersection(corridor, context.water).length ||
    ringDistance(corridorPoints, context.waterRings) <= EPS
  )
    errors.push("Der 1,2 m breite Zugang wird durch Wasser blockiert.");

  // A thin continuation must enter road over the full mouth, while the body
  // must not cross any road (even another part of the selected road polygon).
  const step = mul(direction, 1e-5),
    mouth = polygon([
      endPlus,
      endMinus,
      add(endMinus, step),
      add(endPlus, step),
    ]),
    body = [nearPlus, nearMinus, sub(endMinus, step), sub(endPlus, step)];
  // Clipper's 10 nm grid can leave a one-grid-step sliver along an oblique
  // shared edge. Tolerate only contact on the terminal cap, never a small-area
  // obstacle elsewhere in the corridor.
  const awayFromMouth = (areas: MultiPolygon) =>
    areas.some((area) =>
      area.some((ring) =>
        ring.some(([x, y]) => {
          const point = { x, y };
          return (
            length(sub(point, projection(point, endMinus, endPlus))) > 2 * EPS
          );
        }),
      ),
    );
  if (
    awayFromMouth(clipping.intersection(corridor, context.roads)) ||
    awayFromMouth(clipping.difference(mouth, context.roads)) ||
    ringDistance(body, context.roadRings) <= EPS
  )
    errors.push("Zugang darf Wegeflächen nur am gewählten Ende betreten.");
  if (
    clipping.difference(
      clipping.difference(corridor, context.roads),
      context.plot,
    ).length
  )
    errors.push("Der Zugang außerhalb des Wegs muss im Bauplatz liegen.");
  return errors;
}
function geometryFailure(error: unknown): string[] {
  return [
    `Geometrie konnte nicht geprüft werden: ${error instanceof Error ? error.message : String(error)}`,
  ];
}

export function validateHouse(request: HouseRequest, house: House): string[] {
  try {
    const context = prepare(request);
    return Array.isArray(context)
      ? context
      : checkHouse(request, house, context);
  } catch (error) {
    return geometryFailure(error);
  }
}

function random(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let n = Math.imul(state ^ (state >>> 15), state | 1);
    n ^= n + Math.imul(n ^ (n >>> 7), n | 61);
    return ((n ^ (n >>> 14)) >>> 0) / 4294967296;
  };
}
function shuffle<T>(values: T[], next: () => number): T[] {
  for (let i = values.length - 1; i > 0; i--) {
    const j = Math.floor(next() * (i + 1));
    [values[i], values[j]] = [values[j], values[i]];
  }
  return values;
}

export function generateHouses(request: HouseRequest): HouseResult {
  const result: HouseResult = { houses: [], rejections: [], tested: 0 };
  try {
    const context = prepare(request);
    if (Array.isArray(context)) return { ...result, rejections: context };
    const next = random(request.seed),
      { min, max } = request.bounds,
      middle = mul(add(min, max), 0.5);
    let tangent = mul(
      request.access!.tangent,
      1 / length(request.access!.tangent),
    );
    if (dot(sub(middle, context.edge.point), normal(tangent)) < 0)
      tangent = mul(tangent, -1);
    const inward = normal(tangent),
      angle = Math.atan2(tangent.y, tangent.x);
    for (const [index, profile] of HOUSE_PROFILES.entries()) {
      const label = `${profile.width} × ${profile.depth} m`,
        halfWidth = profile.width / 2 + HOUSE_RULES.overhang,
        halfDepth = profile.depth / 2 + HOUSE_RULES.overhang,
        insetX =
          Math.abs(tangent.x) * halfWidth + Math.abs(inward.x) * halfDepth,
        insetY =
          Math.abs(tangent.y) * halfWidth + Math.abs(inward.y) * halfDepth,
        low = { x: min.x + insetX, y: min.y + insetY },
        high = { x: max.x - insetX, y: max.y - insetY };
      if (low.x > high.x + EPS || low.y > high.y + EPS) {
        result.rejections.push(
          `${label}: Dachhülle passt nicht in den Bauplatz.`,
        );
        continue;
      }
      const corners = [
        low,
        { x: high.x, y: low.y },
        high,
        { x: low.x, y: high.y },
      ];
      const lateral = corners.map((p) =>
          dot(sub(p, context.edge.point), tangent),
        ),
        lateralMin = Math.min(...lateral),
        lateralMax = Math.max(...lateral),
        offsets = [
          Math.max(lateralMin, Math.min(lateralMax, 0)),
          lateralMin,
          lateralMax,
        ],
        candidates: House[] = [];
      // Three lateral positions × nine setbacks; orientation is always along
      // the chosen edge, with the local negative-depth front facing the road.
      for (const offset of offsets) {
        const base = add(context.edge.point, mul(tangent, offset));
        let from = halfDepth + HOUSE_RULES.clearance,
          to = profile.depth / 2 + HOUSE_RULES.maxAccessLength;
        for (const axis of ["x", "y"] as const) {
          if (Math.abs(inward[axis]) < EPS) {
            if (base[axis] < low[axis] - EPS || base[axis] > high[axis] + EPS)
              to = -Infinity;
          } else {
            const a = (low[axis] - base[axis]) / inward[axis],
              b = (high[axis] - base[axis]) / inward[axis];
            from = Math.max(from, Math.min(a, b));
            to = Math.min(to, Math.max(a, b));
          }
        }
        if (from > to + EPS) continue;
        for (let depth = 0; depth < 9; depth++)
          candidates.push({
            id: `house-${request.seed >>> 0}-${index}-${candidates.length}`,
            center: add(base, mul(inward, from + ((to - from) * depth) / 8)),
            angle,
            ...profile,
          });
      }
      const reasons = new Set<string>();
      let accepted = false;
      for (const candidate of shuffle(candidates, next)) {
        result.tested++;
        const errors = checkHouse(request, candidate, context);
        if (!errors.length) {
          result.houses.push(candidate);
          accepted = true;
          break;
        }
        errors.forEach((error) => reasons.add(error));
      }
      if (!accepted)
        result.rejections.push(
          `${label}: ${reasons.size ? [...reasons].join(" ") : "Kein Platz für Dachhülle und geraden Zugang im Bauplatz."}`,
        );
    }
    return result;
  } catch (error) {
    return {
      ...result,
      rejections: [...result.rejections, ...geometryFailure(error)],
    };
  }
}
