import clipping, {
  type MultiPolygon,
  type Polygon,
  type Ring,
} from "./overlay";
import {
  armId,
  derivative,
  distance,
  evaluate,
  node,
  validate,
  type Network,
  type Point,
  type Segment,
} from "./network";
export interface Area {
  outer: Point[];
  holes: Point[][];
}
export interface RadiusResult {
  node: string;
  a: string;
  b: string;
  requested: number;
  effective: number;
  reason?: string;
  center?: Point;
  tangentA?: Point;
  tangentB?: Point;
}
export interface Surface {
  areas: Area[];
  radii: RadiusResult[];
  conflicts: string[];
  diagnostics: string[];
}
export interface Sample extends Point {
  t: number;
}
interface Stroke {
  path: string;
  index: number;
  segment: Segment;
  points: Sample[];
  left: Point[];
  right: Point[];
}
interface Arm {
  id: string;
  path: string;
  opposite: string;
  node: string;
  angle: number;
  left: Point[];
  right: Point[];
}
const EPS = 1e-9;
const cross = (a: Point, b: Point) => a.x * b.y - a.y * b.x;
const sub = (a: Point, b: Point): Point => ({ x: a.x - b.x, y: a.y - b.y });
const add = (a: Point, b: Point): Point => ({ x: a.x + b.x, y: a.y + b.y });
const mul = (a: Point, t: number): Point => ({ x: a.x * t, y: a.y * t });
const unit = (p: Point): Point => {
  const l = Math.hypot(p.x, p.y);
  if (!Number.isFinite(l) || l === 0) throw new Error("Degenerierte Tangente");
  return { x: p.x / l, y: p.y / l };
};
const normal = (p: Point): Point => ({ x: -p.y, y: p.x });
const ring = (pts: Point[]): Ring => [...pts, pts[0]].map((p) => [p.x, p.y]);
const polygon = (pts: Point[]): Polygon => [ring(pts)];
function signedArea(pts: Point[]): number {
  return (
    pts.reduce((a, p, i) => a + cross(p, pts[(i + 1) % pts.length]), 0) / 2
  );
}
function union(polys: Polygon[]): MultiPolygon {
  return polys.length ? clipping.union(polys[0], ...polys.slice(1)) : [];
}
function projection(p: Point, a: Point, b: Point) {
  const d = sub(b, a),
    q = sub(p, a),
    den = d.x * d.x + d.y * d.y;
  const t = den ? Math.max(0, Math.min(1, (q.x * d.x + q.y * d.y) / den)) : 0;
  return { point: add(a, mul(d, t)), t };
}
export function sampleSegment(n: Network, s: Segment): Sample[] {
  if (s.kind === "line")
    return [
      { ...evaluate(n, s, 0), t: 0 },
      { ...evaluate(n, s, 1), t: 1 },
    ];
  const out: Sample[] = [{ ...evaluate(n, s, 0), t: 0 }];
  function step(t0: number, t1: number, depth: number) {
    const a = evaluate(n, s, t0),
      b = evaluate(n, s, t1),
      ts = [0.25, 0.5, 0.75].map((t) => t0 + (t1 - t0) * t),
      qs = ts.map((t) => evaluate(n, s, t));
    const deviation = Math.max(
      ...qs.map((q) => distance(q, projection(q, a, b).point)),
    );
    const length = [a, ...qs, b]
      .slice(1)
      .reduce((len, p, i) => len + distance([a, ...qs][i], p), 0);
    if (length <= 0.2 && deviation <= 0.002) {
      out.push({ ...b, t: t1 });
      return;
    }
    if (depth >= 32) throw new Error("Geometrie numerisch nicht auflösbar");
    const mid = (t0 + t1) / 2;
    step(t0, mid, depth + 1);
    step(mid, t1, depth + 1);
  }
  step(0, 1, 0);
  return out;
}
function tangentVector(n: Network, s: Segment, t: number): Point {
  // At stationary endpoints the first noncoincident control-polygon edge
  // gives the analytic one-sided limiting direction (also for cubic order 2/3).
  // Use this SAME vector for rendering and uncertainty, never a zero derivative
  // in one place and a finite-difference fallback in the other.
  if (t === 0 || t === 1) {
    const a = node(n, s.from),
      b = node(n, s.to),
      points = [
        a,
        ...(s.kind === "quadratic"
          ? [s.control]
          : s.kind === "cubic"
            ? [s.c1, s.c2]
            : []),
        b,
      ];
    const candidates =
      t === 0 ? points.slice(1) : points.slice(0, -1).reverse();
    for (const q of candidates) {
      const d = t === 0 ? sub(q, a) : sub(b, q);
      if (Math.hypot(d.x, d.y) > 0) return d;
    }
    throw new Error("Degenerierte Tangente");
  }
  let d = derivative(n, s, t);
  if (Math.hypot(d.x, d.y) < EPS)
    d = sub(
      evaluate(n, s, Math.min(1, t + 1e-5)),
      evaluate(n, s, Math.max(0, t - 1e-5)),
    );
  return d;
}
function tangent(n: Network, s: Segment, t: number): Point {
  return unit(tangentVector(n, s, t));
}
function hull(points: Point[]): Point[] {
  const p = points
    .slice()
    .sort((a, b) => a.x - b.x || a.y - b.y)
    .filter((p, i, a) => !i || distance(p, a[i - 1]) > EPS);
  if (p.length < 3) return p;
  const half = (p: Point[]) => {
    const h: Point[] = [];
    for (const q of p) {
      while (
        h.length > 1 &&
        cross(sub(h.at(-1)!, h.at(-2)!), sub(q, h.at(-1)!)) <= EPS
      )
        h.pop();
      h.push(q);
    }
    return h;
  };
  return [...half(p).slice(0, -1), ...half(p.slice().reverse()).slice(0, -1)];
}
function intersect(
  a: Point,
  b: Point,
  c: Point,
  d: Point,
): { p: Point; t: number; u: number } | null {
  const v = sub(b, a),
    w = sub(d, c),
    den = cross(v, w);
  if (Math.abs(den) < 1e-12) return null;
  const t = cross(sub(c, a), w) / den,
    u = cross(sub(c, a), v) / den;
  if (t < -EPS || t > 1 + EPS || u < -EPS || u > 1 + EPS) return null;
  return { p: add(a, mul(v, t)), t, u };
}
function lengths(p: Point[]): number[] {
  const l = [0];
  for (let i = 1; i < p.length; i++)
    l.push(l[i - 1] + distance(p[i - 1], p[i]));
  return l;
}
// Subdivision is not an end cap: follow unchanged sides through smooth,
// same-path degree-two nodes, stopping at a real corner, branch or dead end.
function extendedArm(
  arm: Arm,
  byId: Map<string, Arm>,
  byNode: Map<string, Arm[]>,
): Arm {
  const left = arm.left.slice(),
    right = arm.right.slice(),
    seen = new Set([arm.id]);
  let current = arm;
  for (;;) {
    const reverse = byId.get(current.opposite)!,
      at = byNode.get(reverse.node)!;
    if (at.length !== 2) break;
    const next = at.find((a) => a.id !== reverse.id)!;
    if (
      seen.has(next.id) ||
      next.path !== arm.path ||
      Math.cos(reverse.angle - next.angle) > -1 + 1e-10
    )
      break;
    if (
      distance(left.at(-1)!, next.left[0]) > 1e-6 ||
      distance(right.at(-1)!, next.right[0]) > 1e-6
    )
      break;
    seen.add(next.id);
    left.push(...next.left.slice(1));
    right.push(...next.right.slice(1));
    current = next;
  }
  return { ...arm, left, right };
}
function fillet(
  a: Arm,
  b: Arm,
  r: number,
): { patch: Point[]; center: Point; tangentA: Point; tangentB: Point } | null {
  const A = a.left,
    B = b.right,
    la = lengths(A),
    lb = lengths(B);
  let corner: { p: Point; sa: number; sb: number } | undefined;
  for (let i = 0; i < A.length - 1; i++)
    for (let j = 0; j < B.length - 1; j++) {
      const v = intersect(A[i], A[i + 1], B[j], B[j + 1]);
      if (!v) continue;
      const sa = la[i] + distance(A[i], v.p),
        sb = lb[j] + distance(B[j], v.p);
      if (!corner || sa + sb < corner.sa + corner.sb)
        corner = { p: v.p, sa, sb };
    }
  if (!corner) return null;
  let best:
    | {
        center: Point;
        tangentA: Point;
        tangentB: Point;
        sa: number;
        sb: number;
      }
    | undefined;
  const consider = (
    center: Point,
    ta: Point,
    tb: Point,
    sa: number,
    sb: number,
    ia: number,
    ib: number,
    vertexA = false,
    vertexB = false,
  ) => {
    if (
      sa < corner!.sa - EPS ||
      sb < corner!.sb - EPS ||
      (best && sa + sb >= best.sa + best.sb)
    )
      return;
    if (
      cross(sub(A[ia + 1], A[ia]), sub(center, ta)) < -EPS ||
      cross(sub(B[ib + 1], B[ib]), sub(center, tb)) > EPS
    )
      return;
    // At a vertex the centre must project beyond the incoming edge and
    // before the outgoing edge. Only this normal-cone arc belongs to the
    // true distance locus; the rest of the full vertex circle is invalid.
    const inNormalCone = (edge: Point[], index: number) => {
      const d = sub(center, edge[index]),
        incoming = sub(edge[index], edge[index - 1]),
        outgoing = sub(edge[index + 1], edge[index]);
      return (
        d.x * incoming.x + d.y * incoming.y >= -EPS &&
        d.x * outgoing.x + d.y * outgoing.y <= EPS
      );
    };
    if ((vertexA && !inNormalCone(A, ia)) || (vertexB && !inNormalCone(B, ib)))
      return;
    let delta =
      Math.atan2(tb.y - center.y, tb.x - center.x) -
      Math.atan2(ta.y - center.y, ta.x - center.x);
    while (delta >= 0) delta -= 2 * Math.PI;
    if (delta < -Math.PI - EPS) return;
    // Test every candidate, not just the first edge intersection: a curved
    // flank may invalidate that candidate while another is feasible.
    const numericError =
      1e-8 +
      64 *
        Number.EPSILON *
        Math.max(1, r, Math.abs(center.x), Math.abs(center.y));
    for (const edge of [A, B])
      for (let i = 0; i < edge.length - 1; i++)
        if (
          distance(center, projection(center, edge[i], edge[i + 1]).point) <
          r - numericError
        )
          return;
    best = { center, tangentA: ta, tangentB: tb, sa, sb };
  };
  const lineCircle = (from: Point, to: Point, center: Point): Point[] => {
    const v = sub(to, from),
      length = Math.hypot(v.x, v.y),
      direction = mul(v, 1 / length);
    const along =
      (center.x - from.x) * direction.x + (center.y - from.y) * direction.y;
    const foot = add(from, mul(direction, along)),
      squared = r * r - distance(center, foot) ** 2;
    if (squared < -EPS) return [];
    const offset = Math.sqrt(Math.max(0, squared));
    return [along - offset, along + offset]
      .filter((s) => s >= -EPS && s <= length + EPS)
      .map((s) => add(from, mul(direction, Math.max(0, Math.min(length, s)))));
  };
  for (let i = 0; i < A.length - 1; i++) {
    const oa = mul(normal(unit(sub(A[i + 1], A[i]))), r);
    for (let j = 0; j < B.length - 1; j++) {
      const ob = mul(normal(unit(sub(B[j + 1], B[j]))), -r);
      const hit = intersect(
        add(A[i], oa),
        add(A[i + 1], oa),
        add(B[j], ob),
        add(B[j + 1], ob),
      );
      if (hit) {
        const ta = sub(hit.p, oa),
          tb = sub(hit.p, ob);
        consider(
          hit.p,
          ta,
          tb,
          la[i] + distance(A[i], ta),
          lb[j] + distance(B[j], tb),
          i,
          j,
        );
      }
    }
    for (let j = 1; j < B.length - 1; j++)
      for (const center of lineCircle(add(A[i], oa), add(A[i + 1], oa), B[j])) {
        const ta = sub(center, oa);
        consider(
          center,
          ta,
          B[j],
          la[i] + distance(A[i], ta),
          lb[j],
          i,
          j,
          false,
          true,
        );
      }
  }
  // A polyline's radius-distance locus includes arcs at INTERNAL vertices,
  // not just shifted finite edges. Omitting them made feasibility depend on
  // where an otherwise identical Bézier happened to be subdivided.
  for (let i = 1; i < A.length - 1; i++) {
    for (let j = 0; j < B.length - 1; j++) {
      const ob = mul(normal(unit(sub(B[j + 1], B[j]))), -r);
      for (const center of lineCircle(add(B[j], ob), add(B[j + 1], ob), A[i])) {
        const tb = sub(center, ob);
        consider(
          center,
          A[i],
          tb,
          la[i],
          lb[j] + distance(B[j], tb),
          i,
          j,
          true,
          false,
        );
      }
    }
    for (let j = 1; j < B.length - 1; j++) {
      if (best && la[i] + lb[j] >= best.sa + best.sb) continue;
      const d = distance(A[i], B[j]);
      if (d < EPS || d > 2 * r + EPS) continue;
      const mid = add(A[i], mul(sub(B[j], A[i]), 0.5)),
        offset = mul(
          normal(unit(sub(B[j], A[i]))),
          Math.sqrt(Math.max(0, r * r - (d * d) / 4)),
        );
      for (const center of [add(mid, offset), sub(mid, offset)])
        consider(center, A[i], B[j], la[i], lb[j], i, j, true, true);
    }
  }
  if (!best) return null;
  const start = Math.atan2(
      best.tangentA.y - best.center.y,
      best.tangentA.x - best.center.x,
    ),
    end = Math.atan2(
      best.tangentB.y - best.center.y,
      best.tangentB.x - best.center.x,
    );
  let delta = end - start;
  while (delta >= 0) delta -= 2 * Math.PI;
  if (delta < -Math.PI - EPS) return null;
  const steps = Math.max(
    2,
    Math.ceil(
      Math.abs(delta) / Math.min(Math.PI / 24, Math.sqrt((8 * 0.002) / r)),
    ),
  );
  const center = best.center;
  const arc = Array.from({ length: steps + 1 }, (_, i) =>
    add(center, {
      x: r * Math.cos(start + (delta * i) / steps),
      y: r * Math.sin(start + (delta * i) / steps),
    }),
  );
  // Extend ONLY the hidden flanks into the existing stroke quads. Tangency
  // points and the exposed circle are unchanged. Positive interior overlap
  // avoids treating a raster-rounded, boundary-only contact as a free slit.
  const interiorFlank = (
    edge: Point[],
    opposite: Point[],
    positions: number[],
    from: number,
    to: number,
  ) => {
    const stations = [
      from,
      ...positions.filter((s) => s > from + EPS && s < to - EPS),
      to,
    ];
    return stations.map((station) => {
      let i = 0;
      while (i < positions.length - 2 && positions[i + 1] < station) i++;
      const t = (station - positions[i]) / (positions[i + 1] - positions[i]);
      const at = add(edge[i], mul(sub(edge[i + 1], edge[i]), t));
      const across = add(
        opposite[i],
        mul(sub(opposite[i + 1], opposite[i]), t),
      );
      return add(at, mul(sub(across, at), 1e-4));
    });
  };
  const patch = [
    ...interiorFlank(A, a.right, la, corner.sa, best.sa),
    ...arc,
    ...interiorFlank(B, b.left, lb, corner.sb, best.sb).reverse(),
  ];
  return {
    patch,
    center: best.center,
    tangentA: best.tangentA,
    tangentB: best.tangentB,
  };
}
function pointInRing(pts: Point[], p: Point): boolean {
  let inside = false;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const a = pts[i],
      b = pts[j];
    if (
      a.y > p.y !== b.y > p.y &&
      p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x
    )
      inside = !inside;
  }
  return inside;
}
function fromMulti(m: MultiPolygon): Area[] {
  return m.map((poly) => ({
    outer: poly[0].slice(0, -1).map(([x, y]) => ({ x, y })),
    holes: poly.slice(1).map((r) => r.slice(0, -1).map(([x, y]) => ({ x, y }))),
  }));
}
export function computeSurface(n: Network): Surface {
  validate(n);
  const strokes: Stroke[] = [],
    arms = new Map<string, Arm[]>(),
    polys: Polygon[] = [],
    materials: { node: string; owners: string[]; polygon: Polygon }[] = [],
    diagnostics: string[] = [];
  const register = (a: Arm) => {
    const list = arms.get(a.node) ?? [];
    list.push(a);
    arms.set(a.node, list);
  };
  for (const p of n.paths) {
    const samples = p.segments.map((s) => sampleSegment(n, s)),
      lens = samples.map(lengths),
      total = lens.reduce((sum, l) => sum + l.at(-1)!, 0);
    let walked = 0;
    if (!Number.isFinite(total) || total < EPS)
      throw new Error("Pfadlänge ungültig");
    p.segments.forEach((s, index) => {
      const points = samples[index],
        left: Point[] = [],
        right: Point[] = [];
      points.forEach((at, i) => {
        const h =
            (p.startWidth +
              ((p.endWidth - p.startWidth) * (walked + lens[index][i])) /
                total) /
            2,
          v = mul(normal(tangent(n, s, at.t)), h);
        left.push(add(at, v));
        right.push(sub(at, v));
      });
      for (let i = 1; i < points.length - 1; i++) {
        const a = points[i - 1],
          b = points[i],
          c = points[i + 1],
          twiceArea = Math.abs(cross(sub(b, a), sub(c, a)));
        if (twiceArea < EPS) continue;
        const radius =
          (distance(a, b) * distance(b, c) * distance(a, c)) / (2 * twiceArea);
        if (distance(left[i], right[i]) / 2 >= radius) {
          diagnostics.push(
            `${p.id}: Breite übersteigt den lokalen Kurvenradius; gefalteter Rand wird vereinigt, vor Weiterverwendung korrigieren.`,
          );
          break;
        }
      }
      strokes.push({
        path: p.id,
        index,
        segment: s,
        points,
        left,
        right,
      });
      const ta = tangent(n, s, 0),
        tb = mul(tangent(n, s, 1), -1);
      register({
        id: armId(p.id, index, "start"),
        path: p.id,
        opposite: armId(p.id, index, "end"),
        node: s.from,
        angle: Math.atan2(ta.y, ta.x),
        left,
        right,
      });
      register({
        id: armId(p.id, index, "end"),
        path: p.id,
        opposite: armId(p.id, index, "start"),
        node: s.to,
        angle: Math.atan2(tb.y, tb.x),
        left: right.slice().reverse(),
        right: left.slice().reverse(),
      });
      walked += lens[index].at(-1)!;
    });
  }
  // A smooth compound run has only two side boundaries, not a cap at every
  // editable subdivision. Never send internal cross-sections to the clipper:
  // even a sub-grid sliver there would be a false external distance boundary.
  const pathPolygons = new Map<string, Polygon[]>();
  const tangentUncertainty = (s: Segment, t: number) => {
    const points = [
      node(n, s.from),
      node(n, s.to),
      ...(s.kind === "quadratic"
        ? [s.control]
        : s.kind === "cubic"
          ? [s.c1, s.c2]
          : []),
    ];
    const scale = points.reduce(
      (v, p) => Math.max(v, Math.abs(p.x), Math.abs(p.y)),
      1,
    );
    const d = tangentVector(n, s, t);
    const position = 64 * Number.EPSILON * scale;
    return {
      position,
      angular: position / Math.hypot(d.x, d.y),
    };
  };
  const continuous = (a: Stroke, b: Stroke) => {
    if (a.segment.to !== b.segment.from) return false;
    const ua = tangentUncertainty(a.segment, 1),
      ub = tangentUncertainty(b.segment, 0),
      angle = Math.max(1e-12, ua.angular + ub.angular);
    const halfWidth =
      Math.max(
        distance(a.left.at(-1)!, a.right.at(-1)!),
        distance(b.left[0], b.right[0]),
      ) / 2;
    const side = Math.max(EPS, ua.position + ub.position + halfWidth * angle);
    return (
      distance(tangent(n, a.segment, 1), tangent(n, b.segment, 0)) < angle &&
      distance(a.left.at(-1)!, b.left[0]) < side &&
      distance(a.right.at(-1)!, b.right[0]) < side
    );
  };
  for (const path of n.paths) {
    let own = strokes.filter((s) => s.path === path.id);
    // Canonicalize only a join already proven smooth within arithmetic error.
    // All arm arrays share these point objects, so tiny false junction-core
    // slivers disappear as well as the internal cap in the base strip.
    own.forEach((a, i) => {
      const b = own[(i + 1) % own.length];
      if (!continuous(a, b)) return;
      for (const [p, q] of [
        [a.left.at(-1)!, b.left[0]],
        [a.right.at(-1)!, b.right[0]],
      ]) {
        const shared = add(p, mul(sub(q, p), 0.5));
        Object.assign(p, shared);
        Object.assign(q, shared);
      }
    });
    if (continuous(own.at(-1)!, own[0])) {
      const corner = own.findIndex(
        (s, i) => !continuous(own[(i + own.length - 1) % own.length], s),
      );
      if (corner > 0) own = [...own.slice(corner), ...own.slice(0, corner)];
    }
    const parts: Polygon[] = [];
    let left: Point[] = [],
      right: Point[] = [];
    const flush = () => {
      if (left.length)
        parts.push(polygon([...left, ...right.slice().reverse()]));
    };
    own.forEach((stroke, i) => {
      if (i === 0 || !continuous(own[i - 1], stroke)) {
        flush();
        left = stroke.left.slice();
        right = stroke.right.slice();
      } else {
        left.push(...stroke.left.slice(1));
        right.push(...stroke.right.slice(1));
      }
    });
    if (!parts.length && continuous(own.at(-1)!, own[0])) {
      left[left.length - 1] = left[0];
      right[right.length - 1] = right[0];
    }
    flush();
    pathPolygons.set(path.id, parts);
    polys.push(...parts);
  }
  const byId = new Map([...arms.values()].flat().map((a) => [a.id, a]));
  const junctionMaterial = (poly: Polygon, list: Arm[]) => {
    polys.push(poly);
    materials.push({
      node: list[0].node,
      owners: [...new Set(list.map((a) => a.path))],
      polygon: poly,
    });
  };
  const radii: RadiusResult[] = [],
    processed = new Set<Network["junctions"][number]>();
  for (const [id, list] of arms) {
    list.sort((a, b) => a.angle - b.angle || a.id.localeCompare(b.id));
    if (list.length < 2) continue;
    const core = hull([
      node(n, id),
      ...list.flatMap((a) => [a.left[0], a.right[0]]),
    ]);
    if (core.length >= 3 && Math.abs(signedArea(core)) > EPS)
      junctionMaterial(polygon(core), list);
    for (let i = 0; i < list.length; i++) {
      const a = list[i],
        b = list[(i + 1) % list.length],
        gap = (b.angle - a.angle + 2 * Math.PI) % (2 * Math.PI);
      if (gap >= Math.PI - EPS || gap < EPS) continue;
      const j = n.junctions.find(
        (j) =>
          j.node === id &&
          ((j.a === a.id && j.b === b.id) || (j.b === a.id && j.a === b.id)),
      );
      if (j) processed.add(j);
      const result: RadiusResult = {
        node: id,
        a: a.id,
        b: b.id,
        requested: j?.radius ?? 0,
        effective: 0,
      };
      if (result.requested > 0) {
        const f = fillet(
          extendedArm(a, byId, arms),
          extendedArm(b, byId, arms),
          result.requested,
        );
        if (f) {
          junctionMaterial(polygon(f.patch), list);
          Object.assign(result, {
            effective: result.requested,
            center: f.center,
            tangentA: f.tangentA,
            tangentB: f.tangentB,
          });
        } else
          result.reason =
            "Radius passt nicht zwischen die endlichen Wegränder (Winkel, Kurve oder Segmentlänge).";
      }
      radii.push(result);
    }
  }
  for (const j of n.junctions)
    if (!processed.has(j) && j.radius > 0)
      radii.push({
        node: j.node,
        a: j.a,
        b: j.b,
        requested: j.radius,
        effective: 0,
        reason: "Keine abrundbare Ecke zwischen diesen benachbarten Armen.",
      });
  const conflicts: string[] = [];
  for (let i = 0; i < n.paths.length; i++)
    for (let j = i + 1; j < n.paths.length; j++) {
      const pa = n.paths[i],
        pb = n.paths[j],
        A = strokes.filter((s) => s.path === pa.id),
        B = strokes.filter((s) => s.path === pb.id);
      const aIds = new Set(pa.segments.flatMap((s) => [s.from, s.to])),
        shared = new Set(
          pb.segments
            .flatMap((s) => [s.from, s.to])
            .filter((id) => aIds.has(id)),
        );
      const overlap = fromMulti(
        clipping.intersection(
          union(pathPolygons.get(pa.id)!),
          union(pathPolygons.get(pb.id)!),
        ),
      );
      // A shared node only explains the overlap component at that node, not remote overlaps.
      let conflict = overlap.some((area) => {
        const region: Surface = {
          areas: [area],
          radii: [],
          conflicts: [],
          diagnostics: [],
        };
        return (
          areaSize(region) > 1e-7 &&
          ![...shared].some(
            (id) =>
              contains(region, node(n, id)) ||
              (nearestBoundary(region, node(n, id))?.distance ?? Infinity) <
                0.004,
          )
        );
      });
      if (shared.size)
        outer: for (const a of A)
          for (const b of B)
            for (let u = 0; u < a.points.length - 1; u++)
              for (let v = 0; v < b.points.length - 1; v++) {
                const hit = intersect(
                  a.points[u],
                  a.points[u + 1],
                  b.points[v],
                  b.points[v + 1],
                );
                if (
                  hit &&
                  ![...shared].some(
                    (id) => distance(node(n, id), hit.p) < 0.004,
                  )
                ) {
                  conflict = true;
                  break outer;
                }
              }
      if (conflict) conflicts.push(`${pa.id} × ${pb.id}`);
    }
  // A compound path can also cross itself without an explicit anchor at the crossing.
  for (const path of n.paths) {
    const own = strokes.filter((s) => s.path === path.id);
    let unresolved = false;
    outer: for (let i = 0; i < own.length; i++)
      for (let j = i; j < own.length; j++) {
        const a = own[i],
          b = own[j],
          shared = [a.segment.from, a.segment.to].filter(
            (id) => id === b.segment.from || id === b.segment.to,
          );
        for (let u = 0; u < a.points.length - 1; u++)
          for (let v = i === j ? u + 2 : 0; v < b.points.length - 1; v++) {
            const hit = intersect(
              a.points[u],
              a.points[u + 1],
              b.points[v],
              b.points[v + 1],
            );
            if (
              hit &&
              !shared.some((id) => distance(node(n, id), hit.p) < 0.004)
            ) {
              unresolved = true;
              break outer;
            }
          }
      }
    if (unresolved) conflicts.push(`${path.id} × ${path.id}`);
  }
  // Generated junction material is also occupied area, not merely decoration.
  // Incident paths explain it at this node; unrelated paths do not.
  const addConflict = (a: string, b: string) => {
    const pair = n.paths
      .filter((p) => p.id === a || p.id === b)
      .map((p) => p.id)
      .join(" × ");
    if (!conflicts.includes(pair)) conflicts.push(pair);
  };
  const overlaps = (a: Polygon | MultiPolygon, b: Polygon | MultiPolygon) =>
    fromMulti(clipping.intersection(a, b)).some(
      (area) =>
        Math.abs(signedArea(area.outer)) -
          area.holes.reduce((sum, h) => sum + Math.abs(signedArea(h)), 0) >
        1e-7,
    );
  for (const material of materials)
    for (const path of n.paths) {
      if (material.owners.includes(path.id)) continue;
      if (overlaps(material.polygon, union(pathPolygons.get(path.id)!)))
        material.owners.forEach((owner) => addConflict(owner, path.id));
    }
  for (let i = 0; i < materials.length; i++)
    for (let j = i + 1; j < materials.length; j++) {
      const a = materials[i],
        b = materials[j];
      if (a.node === b.node || a.owners.some((id) => b.owners.includes(id)))
        continue;
      if (overlaps(a.polygon, b.polygon))
        for (const x of a.owners) for (const y of b.owners) addConflict(x, y);
    }
  const areas = fromMulti(union(polys));
  if (
    areas
      .flatMap((a) => [a.outer, ...a.holes])
      .flat()
      .some((p) => !Number.isFinite(p.x) || !Number.isFinite(p.y))
  )
    throw new Error("Nicht endliche Flächenkoordinaten");
  if (n.paths.length && !areas.length)
    throw new Error("Degenerierte Wegefläche");
  for (const a of areas)
    if (a.outer.length < 3 || Math.abs(signedArea(a.outer)) < EPS)
      diagnostics.push("Degenerierte Außenkontur");
  return { areas, radii, conflicts, diagnostics };
}
export function areaSize(s: Surface): number {
  return s.areas.reduce(
    (sum, a) =>
      sum +
      Math.abs(signedArea(a.outer)) -
      a.holes.reduce((sum, h) => sum + Math.abs(signedArea(h)), 0),
    0,
  );
}
export function contains(s: Surface, p: Point): boolean {
  return s.areas.some(
    (a) => pointInRing(a.outer, p) && !a.holes.some((h) => pointInRing(h, p)),
  );
}
export function nearestBoundary(
  s: Surface,
  p: Point,
): { point: Point; direction: Point; distance: number; hole: boolean } | null {
  let best: ReturnType<typeof nearestBoundary> = null;
  for (const area of s.areas)
    for (const [index, edge] of [area.outer, ...area.holes].entries())
      for (let i = 0; i < edge.length; i++) {
        const a = edge[i],
          b = edge[(i + 1) % edge.length],
          hit = projection(p, a, b).point,
          d = distance(p, hit);
        if (distance(a, b) > EPS && (!best || d < best.distance))
          best = {
            point: hit,
            direction: unit(sub(b, a)),
            distance: d,
            hole: index > 0,
          };
      }
  return best;
}
