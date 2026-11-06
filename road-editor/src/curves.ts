import type { Point } from "./network";

export type Curve =
  | { kind: "line" }
  | { kind: "quadratic"; control: Point }
  | { kind: "cubic"; c1: Point; c2: Point };
export interface CurveSample extends Point {
  t: number;
}
const mix = (a: Point, b: Point, t: number): Point => ({
  x: a.x + (b.x - a.x) * t,
  y: a.y + (b.y - a.y) * t,
});
const distance = (a: Point, b: Point) => Math.hypot(a.x - b.x, a.y - b.y);
export function curvePoint(a: Point, b: Point, s: Curve, t: number): Point {
  if (s.kind === "line") return mix(a, b, t);
  if (s.kind === "quadratic")
    return mix(mix(a, s.control, t), mix(s.control, b, t), t);
  return mix(
    mix(mix(a, s.c1, t), mix(s.c1, s.c2, t), t),
    mix(mix(s.c1, s.c2, t), mix(s.c2, b, t), t),
    t,
  );
}
export function curveDerivative(
  a: Point,
  b: Point,
  s: Curve,
  t: number,
): Point {
  const diff = (a: Point, b: Point, k: number) => ({
    x: (b.x - a.x) * k,
    y: (b.y - a.y) * k,
  });
  if (s.kind === "line") return diff(a, b, 1);
  if (s.kind === "quadratic")
    return mix(diff(a, s.control, 2), diff(s.control, b, 2), t);
  return mix(
    mix(diff(a, s.c1, 3), diff(s.c1, s.c2, 3), t),
    mix(diff(s.c1, s.c2, 3), diff(s.c2, b, 3), t),
    t,
  );
}
export function sampleCurve(a: Point, b: Point, s: Curve): CurveSample[] {
  if (s.kind === "line")
    return [
      { ...a, t: 0 },
      { ...b, t: 1 },
    ];
  const evaluate = (t: number) => curvePoint(a, b, s, t);
  const out: CurveSample[] = [{ ...a, t: 0 }];
  function step(t0: number, t1: number, depth: number) {
    const p = evaluate(t0),
      q = evaluate(t1),
      qs = [0.25, 0.5, 0.75].map((t) => evaluate(t0 + (t1 - t0) * t));
    const deviation = Math.max(
      ...qs.map((point) => {
        const dx = q.x - p.x,
          dy = q.y - p.y,
          den = dx * dx + dy * dy;
        const t = den
          ? Math.max(
              0,
              Math.min(1, ((point.x - p.x) * dx + (point.y - p.y) * dy) / den),
            )
          : 0;
        return distance(point, mix(p, q, t));
      }),
    );
    const length = [p, ...qs, q]
      .slice(1)
      .reduce((len, point, i) => len + distance([p, ...qs][i], point), 0);
    if (length <= 0.2 && deviation <= 0.002) {
      out.push({ ...q, t: t1 });
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
export function splitCurve(
  a: Point,
  b: Point,
  s: Curve,
  t: number,
): { point: Point; left: Curve; right: Curve } {
  const point = curvePoint(a, b, s, t);
  if (s.kind === "line")
    return { point, left: { kind: "line" }, right: { kind: "line" } };
  if (s.kind === "quadratic")
    return {
      point,
      left: { kind: "quadratic", control: mix(a, s.control, t) },
      right: { kind: "quadratic", control: mix(s.control, b, t) },
    };
  const a1 = mix(a, s.c1, t),
    b1 = mix(s.c1, s.c2, t),
    c1 = mix(s.c2, b, t);
  return {
    point,
    left: { kind: "cubic", c1: a1, c2: mix(a1, b1, t) },
    right: { kind: "cubic", c1: mix(b1, c1, t), c2: c1 },
  };
}
// An anchor carries its adjacent cubic handle; this does not couple the
// incoming and outgoing handles or introduce a persistent smooth-node type.
export function moveCubicHandle(
  s: Curve,
  end: "start" | "end",
  delta: Point,
): void {
  if (s.kind !== "cubic") return;
  const key = end === "start" ? "c1" : "c2";
  s[key] = { x: s[key].x + delta.x, y: s[key].y + delta.y };
}
export function createCurve(kind: Curve["kind"], a: Point, b: Point): Curve {
  const c = mix(a, b, 0.5),
    v = { x: -(b.y - a.y) * 0.25, y: (b.x - a.x) * 0.25 };
  if (kind === "line") return { kind };
  if (kind === "quadratic")
    return { kind, control: { x: c.x + v.x, y: c.y + v.y } };
  const end = mix(a, b, 2 / 3);
  return { kind, c1: mix(a, b, 1 / 3), c2: { x: end.x + v.x, y: end.y + v.y } };
}
