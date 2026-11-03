import type { Point, Polygon } from "./model";

export const add = (a: Point, b: Point): Point => ({
  x: a.x + b.x,
  z: a.z + b.z,
});
export const scale = (a: Point, n: number): Point => ({
  x: a.x * n,
  z: a.z * n,
});
export const distance = (a: Point, b: Point): number =>
  Math.hypot(a.x - b.x, a.z - b.z);
export const rotate = (p: Point, angle: number): Point => ({
  x: p.x * Math.cos(angle) - p.z * Math.sin(angle),
  z: p.x * Math.sin(angle) + p.z * Math.cos(angle),
});
export const transform = (p: Point, center: Point, angle: number): Point =>
  add(rotate(p, angle), center);

export function rect(
  center: Point,
  width: number,
  depth: number,
  angle = 0,
): Polygon {
  return [
    { x: -width / 2, z: -depth / 2 },
    { x: width / 2, z: -depth / 2 },
    { x: width / 2, z: depth / 2 },
    { x: -width / 2, z: depth / 2 },
  ].map((p) => transform(p, center, angle));
}

export function circle(center: Point, radius: number, segments = 24): Polygon {
  return Array.from({ length: segments }, (_, i) =>
    add(center, {
      x: Math.cos((i * Math.PI * 2) / segments) * radius,
      z: Math.sin((i * Math.PI * 2) / segments) * radius,
    }),
  );
}

/** Closed segment distance; used for exact convex-polygon clearance. */
function segmentDistance(p: Point, a: Point, b: Point): number {
  const dx = b.x - a.x,
    dz = b.z - a.z;
  const t = Math.max(
    0,
    Math.min(
      1,
      ((p.x - a.x) * dx + (p.z - a.z) * dz) / (dx * dx + dz * dz || 1),
    ),
  );
  return distance(p, { x: a.x + t * dx, z: a.z + t * dz });
}

export function contains(p: Point, polygon: Polygon): boolean {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const a = polygon[i],
      b = polygon[j];
    if (
      a.z > p.z !== b.z > p.z &&
      p.x < ((b.x - a.x) * (p.z - a.z)) / (b.z - a.z) + a.x
    )
      inside = !inside;
  }
  return inside;
}

/** SAT intersection for convex polygons. All collision primitives here are convex. */
export function overlaps(a: Polygon, b: Polygon): boolean {
  if (
    Math.max(...a.map((p) => p.x)) < Math.min(...b.map((p) => p.x)) ||
    Math.max(...b.map((p) => p.x)) < Math.min(...a.map((p) => p.x)) ||
    Math.max(...a.map((p) => p.z)) < Math.min(...b.map((p) => p.z)) ||
    Math.max(...b.map((p) => p.z)) < Math.min(...a.map((p) => p.z))
  )
    return false;
  for (const polygon of [a, b]) {
    for (let i = 0; i < polygon.length; i++) {
      const p = polygon[i],
        q = polygon[(i + 1) % polygon.length];
      const nx = -(q.z - p.z),
        nz = q.x - p.x;
      const aa = a.map((v) => v.x * nx + v.z * nz),
        bb = b.map((v) => v.x * nx + v.z * nz);
      if (
        Math.max(...aa) < Math.min(...bb) - 1e-8 ||
        Math.max(...bb) < Math.min(...aa) - 1e-8
      )
        return false;
    }
  }
  return true;
}

export function separated(a: Polygon, b: Polygon, clearance = 0): boolean {
  if (overlaps(a, b)) return false;
  if (clearance <= 0) return true;
  if (
    Math.max(...a.map((p) => p.x)) + clearance <
      Math.min(...b.map((p) => p.x)) ||
    Math.max(...b.map((p) => p.x)) + clearance <
      Math.min(...a.map((p) => p.x)) ||
    Math.max(...a.map((p) => p.z)) + clearance <
      Math.min(...b.map((p) => p.z)) ||
    Math.max(...b.map((p) => p.z)) + clearance < Math.min(...a.map((p) => p.z))
  )
    return true;
  for (const [first, second] of [
    [a, b],
    [b, a],
  ]) {
    for (const p of first)
      for (let i = 0; i < second.length; i++) {
        if (
          segmentDistance(p, second[i], second[(i + 1) % second.length]) <
          clearance
        )
          return false;
      }
  }
  return true;
}

/** Tapered segments and circular joins: the same primitives drive drawing and fitting. */
export function ribbon(points: Point[], widths: number[]): Polygon[] {
  const polygons: Polygon[] = [];
  for (let i = 0; i < points.length - 1; i++) {
    const a = points[i],
      b = points[i + 1],
      length = distance(a, b);
    if (length < 1e-6) continue;
    const normal = { x: -(b.z - a.z) / length, z: (b.x - a.x) / length };
    polygons.push([
      add(a, scale(normal, widths[i] / 2)),
      add(b, scale(normal, widths[i + 1] / 2)),
      add(b, scale(normal, -widths[i + 1] / 2)),
      add(a, scale(normal, -widths[i] / 2)),
    ]);
  }
  points.forEach((p, i) => polygons.push(circle(p, widths[i] / 2, 16)));
  return polygons;
}

export function hash(text: string): number {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++)
    h = Math.imul(h ^ text.charCodeAt(i), 16777619);
  return h >>> 0;
}

export function random(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state += 0x6d2b79f5;
    let n = Math.imul(state ^ (state >>> 15), 1 | state);
    n ^= n + Math.imul(n ^ (n >>> 7), 61 | n);
    return ((n ^ (n >>> 14)) >>> 0) / 4294967296;
  };
}
