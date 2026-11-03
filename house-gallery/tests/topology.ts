import type { Point, Surface } from "../src/model";

export const EPS = 1e-5;
const subtract = (a: Point, b: Point): Point => ({
  x: a.x - b.x,
  z: a.z - b.z,
});
const cross = (a: Point, b: Point): number => a.x * b.z - a.z * b.x;
const dot = (a: Point, b: Point): number => a.x * b.x + a.z * b.z;
const length = (a: Point): number => Math.hypot(a.x, a.z);
export const close = (a: Point, b: Point): boolean =>
  length(subtract(a, b)) < EPS;
const pointKey = (p: Point) =>
  `${Math.round(p.x / EPS)},${Math.round(p.z / EPS)}`;
export type Line = Point[];
export const centerlines = (surfaces: Surface[], kinds: string[]): Line[] =>
  surfaces
    .filter((s) => kinds.includes(s.kind) && s.centerline)
    .map((s) => s.centerline!);
const segments = (lines: Line[]) =>
  lines.flatMap((points) =>
    points.slice(1).map((b, i) => ({ a: points[i], b })),
  );

function segmentHit(
  a: Point,
  b: Point,
  c: Point,
  d: Point,
): { point: Point; t: number; u: number } | undefined {
  const r = subtract(b, a),
    s = subtract(d, c),
    delta = subtract(c, a),
    denominator = cross(r, s);
  if (Math.abs(denominator) < EPS) return;
  const t = cross(delta, s) / denominator,
    u = cross(delta, r) / denominator;
  if (t < -EPS || t > 1 + EPS || u < -EPS || u > 1 + EPS) return;
  return {
    point: { x: a.x + t * r.x, z: a.z + t * r.z },
    t: Math.max(0, Math.min(1, t)),
    u: Math.max(0, Math.min(1, u)),
  };
}
export function intersections(first: Line[], second: Line[]): Point[] {
  const found = new Map<string, Point>();
  for (const a of segments(first))
    for (const b of segments(second)) {
      const hit = segmentHit(a.a, a.b, b.a, b.b);
      if (hit) found.set(pointKey(hit.point), hit.point);
    }
  return [...found.values()];
}
export function turns(points: Point[]): number[] {
  return points.slice(1, -1).map((p, i) => {
    const before = subtract(p, points[i]),
      after = subtract(points[i + 2], p);
    return Math.atan2(cross(before, after), dot(before, after));
  });
}
export function headingDifference(first: Line, second: Line): number {
  const a = subtract(first.at(-1)!, first[0]),
    b = subtract(second.at(-1)!, second[0]);
  return Math.abs(cross(a, b)) / (length(a) * length(b));
}
export function pointLineDistance(p: Point, line: Line): number {
  const direction = subtract(line.at(-1)!, line[0]);
  return Math.abs(cross(subtract(p, line[0]), direction)) / length(direction);
}

/** Derive a planar graph by splitting actual segments at their intersections.
 * No motif recipes, titles, IDs, or declared arm counts enter this calculation. */
export function network(lines: Line[]) {
  const source = segments(lines);
  const cuts = source.map(() => [0, 1]);
  for (let i = 0; i < source.length; i++)
    for (let j = i + 1; j < source.length; j++) {
      const a = source[i],
        b = source[j],
        hit = segmentHit(a.a, a.b, b.a, b.b);
      if (hit) {
        cuts[i].push(hit.t);
        cuts[j].push(hit.u);
      } else {
        // Also split collinear touches/overlaps, e.g. one route ending on another.
        for (const [segment, index, endpoints] of [
          [a, i, [b.a, b.b]],
          [b, j, [a.a, a.b]],
        ] as const) {
          const direction = subtract(segment.b, segment.a),
            square = dot(direction, direction);
          for (const p of endpoints) {
            const delta = subtract(p, segment.a),
              t = dot(delta, direction) / square;
            if (Math.abs(cross(delta, direction)) < EPS && t >= 0 && t <= 1)
              cuts[index].push(t);
          }
        }
      }
    }
  const points = new Map<string, Point>(),
    adjacency = new Map<string, Set<string>>(),
    edges = new Set<string>();
  source.forEach((segment, i) => {
    const direction = subtract(segment.b, segment.a);
    const parameters = [
      ...new Set(cuts[i].map((t) => Math.round(t * 1e9) / 1e9)),
    ].sort((a, b) => a - b);
    for (let j = 0; j < parameters.length - 1; j++) {
      const aa = {
        x: segment.a.x + direction.x * parameters[j],
        z: segment.a.z + direction.z * parameters[j],
      };
      const bb = {
        x: segment.a.x + direction.x * parameters[j + 1],
        z: segment.a.z + direction.z * parameters[j + 1],
      };
      if (close(aa, bb)) continue;
      const a = pointKey(aa),
        b = pointKey(bb);
      points.set(a, aa);
      points.set(b, bb);
      if (!adjacency.has(a)) adjacency.set(a, new Set());
      if (!adjacency.has(b)) adjacency.set(b, new Set());
      adjacency.get(a)!.add(b);
      adjacency.get(b)!.add(a);
      edges.add([a, b].sort().join("|"));
    }
  });
  const visited = new Set<string>();
  let components = 0;
  for (const start of adjacency.keys()) {
    if (visited.has(start)) continue;
    components++;
    const pending = [start];
    while (pending.length) {
      const p = pending.pop()!;
      if (visited.has(p)) continue;
      visited.add(p);
      pending.push(...adjacency.get(p)!);
    }
  }
  const nodes = [...adjacency].map(([key, neighbors]) => ({
    point: points.get(key)!,
    degree: neighbors.size,
    directions: [...neighbors].map((key2) =>
      subtract(points.get(key2)!, points.get(key)!),
    ),
  }));
  return { nodes, components, cycles: edges.size - points.size + components };
}
export function armGaps(directions: Point[]): number[] {
  const angles = directions
    .map((p) => (Math.atan2(p.z, p.x) + Math.PI * 2) % (Math.PI * 2))
    .sort((a, b) => a - b);
  return angles.map(
    (a, i) =>
      (((angles[(i + 1) % angles.length] - a + Math.PI * 2) % (Math.PI * 2)) *
        180) /
      Math.PI,
  );
}

/** Match actual ribbon cross-sections to the centerline, then measure their width.
 * Metadata alone cannot satisfy this contract. */
export function geometryWidths(surface: Surface): [number, number][] {
  if (!surface.centerline) return [];
  return surface.centerline.slice(1).map((b, i) => {
    const a = surface.centerline![i];
    const midpoint = (p: Point, q: Point): Point => ({
      x: (p.x + q.x) / 2,
      z: (p.z + q.z) / 2,
    });
    const quad = surface.polygons.find(
      (poly) =>
        poly.length === 4 &&
        close(midpoint(poly[0], poly[3]), a) &&
        close(midpoint(poly[1], poly[2]), b),
    );
    if (!quad) throw Error("No geometric cross-section for centerline segment");
    return [
      length(subtract(quad[0], quad[3])),
      length(subtract(quad[1], quad[2])),
    ];
  });
}
