import type { Point } from "./network";
import { sampleCurve, type Curve } from "./curves";

export interface AreaBlocker {
  id: string;
  kind: "road" | "water";
  outer: Point[];
  holes?: Point[][];
  outerEdges?: Curve[];
  holeEdges?: Curve[][];
}
export const WATER_DROP = 1.4;
export function contourEdges(a: AreaBlocker, ring = 0): Curve[] {
  const points = ring ? a.holes?.[ring - 1] : a.outer;
  return (
    (ring ? a.holeEdges?.[ring - 1] : a.outerEdges) ??
    points!.map(() => ({ kind: "line" }))
  );
}
export function setContourEdges(
  a: AreaBlocker,
  ring: number,
  edges: Curve[],
): void {
  if (!ring) a.outerEdges = edges;
  else {
    a.holeEdges ??= (a.holes ?? []).map((points) =>
      points.map(() => ({ kind: "line" })),
    );
    a.holeEdges[ring - 1] = edges;
  }
}
export function contourPoints(points: Point[], edges?: Curve[]): Point[] {
  if (!Array.isArray(points) || points.length < 2)
    throw new Error("Kontur benötigt mindestens zwei Anker");
  const finite = (p: Point) =>
    p && typeof p === "object" && Number.isFinite(p.x) && Number.isFinite(p.y);
  if (!points.every(finite))
    throw new Error("Konturpunkte müssen endlich sein");
  if (
    edges !== undefined &&
    (!Array.isArray(edges) || edges.length !== points.length)
  )
    throw new Error("Kontursegmente müssen zu den Ankern passen");
  const result: Point[] = [];
  for (let i = 0; i < points.length; i++) {
    const edge = edges === undefined ? { kind: "line" as const } : edges[i];
    if (
      !edge ||
      !["line", "quadratic", "cubic"].includes(edge.kind) ||
      (edge.kind === "quadratic" && !finite(edge.control)) ||
      (edge.kind === "cubic" && (!finite(edge.c1) || !finite(edge.c2)))
    )
      throw new Error("Ungültiger Kontrollgriff der Kontur");
    result.push(
      ...sampleCurve(points[i], points[(i + 1) % points.length], edge)
        .slice(0, -1)
        .map(({ x, y }) => ({ x, y })),
    );
  }
  return result;
}
const EPS = 1e-9;
const cross = (a: Point, b: Point, c: Point) =>
  (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);
export function ringArea(ring: Point[]): number {
  const origin = ring[0];
  return (
    ring.reduce(
      (sum, p, i) => sum + cross(origin, p, ring[(i + 1) % ring.length]),
      0,
    ) / 2
  );
}
function side(a: Point, b: Point, p: Point): number {
  const signed = cross(a, b, p);
  return Math.abs(signed) <= EPS * Math.hypot(b.x - a.x, b.y - a.y)
    ? 0
    : Math.sign(signed);
}
function onSegment(p: Point, a: Point, b: Point): boolean {
  return (
    side(a, b, p) === 0 &&
    p.x >= Math.min(a.x, b.x) - EPS &&
    p.x <= Math.max(a.x, b.x) + EPS &&
    p.y >= Math.min(a.y, b.y) - EPS &&
    p.y <= Math.max(a.y, b.y) + EPS
  );
}
function touches(a: Point, b: Point, c: Point, d: Point): boolean {
  const ac = side(a, b, c),
    ad = side(a, b, d),
    ca = side(c, d, a),
    cb = side(c, d, b);
  return (
    (ac * ad < 0 && ca * cb < 0) ||
    onSegment(c, a, b) ||
    onSegment(d, a, b) ||
    onSegment(a, c, d) ||
    onSegment(b, c, d)
  );
}
function ringsTouch(a: Point[], b: Point[]): boolean {
  return a.some((p, i) =>
    b.some((q, j) =>
      touches(p, a[(i + 1) % a.length], q, b[(j + 1) % b.length]),
    ),
  );
}
function inside(p: Point, ring: Point[]): boolean {
  let result = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const a = ring[i],
      b = ring[j];
    if (
      a.y > p.y !== b.y > p.y &&
      p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x
    )
      result = !result;
  }
  return result;
}
function validateRing(value: unknown): asserts value is Point[] {
  if (!Array.isArray(value) || value.length < 3)
    throw new Error("Kontur benötigt mindestens drei Punkte");
  const ring = value as Point[];
  for (const p of ring) {
    if (
      !p ||
      typeof p !== "object" ||
      !Number.isFinite(p.x) ||
      !Number.isFinite(p.y)
    )
      throw new Error("Konturpunkte müssen endlich sein");
  }
  const area = ringArea(ring);
  if (!Number.isFinite(area) || Math.abs(area) <= EPS)
    throw new Error("Kontur muss eine echte Fläche einschließen");
  for (let i = 0; i < ring.length; i++) {
    const a = ring[i],
      b = ring[(i + 1) % ring.length],
      c = ring[(i + 2) % ring.length];
    if (Math.hypot(b.x - a.x, b.y - a.y) <= EPS)
      throw new Error("Kontur enthält doppelte Punkte");
    if (
      side(a, b, c) === 0 &&
      (b.x - a.x) * (c.x - b.x) + (b.y - a.y) * (c.y - b.y) < 0
    )
      throw new Error("Kontur darf nicht auf sich zurücklaufen");
    for (let j = i + 1; j < ring.length; j++) {
      if (j === i + 1 || (i === 0 && j === ring.length - 1)) continue;
      if (touches(a, b, ring[j], ring[(j + 1) % ring.length]))
        throw new Error(
          "Kontur darf sich nicht selbst schneiden oder berühren",
        );
    }
  }
}
export function validateAreaBlockers(
  value: unknown,
): asserts value is AreaBlocker[] | undefined {
  if (value === undefined) return;
  if (!Array.isArray(value))
    throw new Error("Flächensperren müssen eine Liste sein");
  const ids = new Set<string>();
  for (const item of value) {
    if (
      !item ||
      typeof item !== "object" ||
      typeof item.id !== "string" ||
      !item.id ||
      ids.has(item.id)
    )
      throw new Error("Ungültige oder doppelte Flächensperren-ID");
    ids.add(item.id);
    if (item.kind !== "water" && item.kind !== "road")
      throw new Error("Unbekannte Flächensperre");
    const outer = contourPoints(item.outer, item.outerEdges);
    validateRing(outer);
    if (item.holes !== undefined && !Array.isArray(item.holes))
      throw new Error("Inseln müssen eine Liste von Konturen sein");
    const rawHoles: Point[][] = item.holes ?? [];
    if (
      item.holeEdges !== undefined &&
      (!Array.isArray(item.holeEdges) ||
        item.holeEdges.length !== rawHoles.length)
    )
      throw new Error("Inselsegmente müssen zu den Konturen passen");
    const holes = rawHoles.map((points, i) =>
      contourPoints(points, item.holeEdges?.[i]),
    );
    for (let i = 0; i < holes.length; i++) {
      const hole = holes[i];
      validateRing(hole);
      if (!hole.every((p) => inside(p, outer)) || ringsTouch(hole, outer))
        throw new Error(
          "Inselkontur muss vollständig innerhalb der Wasserfläche liegen",
        );
      for (let j = 0; j < i; j++) {
        if (
          ringsTouch(hole, holes[j]) ||
          inside(hole[0], holes[j]) ||
          inside(holes[j][0], hole)
        )
          throw new Error(
            "Inselkonturen dürfen sich nicht überlappen oder einschließen",
          );
      }
    }
  }
}
