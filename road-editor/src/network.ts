export interface Point {
  x: number;
  y: number;
}
export interface Node extends Point {
  id: string;
}
export type Segment =
  | { kind: "line"; from: string; to: string }
  | { kind: "quadratic"; from: string; to: string; control: Point }
  | { kind: "cubic"; from: string; to: string; c1: Point; c2: Point };
export interface Path {
  id: string;
  segments: Segment[];
  startWidth: number;
  endWidth: number;
  widthsLinked?: boolean;
}
export interface Junction {
  node: string;
  a: string;
  b: string;
  radius: number;
}
export interface Network {
  version: 1;
  nodes: Node[];
  paths: Path[];
  junctions: Junction[];
}
export const emptyNetwork = (): Network => ({
  version: 1,
  nodes: [],
  paths: [],
  junctions: [],
});
export const mix = (a: Point, b: Point, t: number): Point => ({
  x: a.x + (b.x - a.x) * t,
  y: a.y + (b.y - a.y) * t,
});
export const distance = (a: Point, b: Point) =>
  Math.hypot(a.x - b.x, a.y - b.y);
export function node(n: Network, id: string): Node {
  const p = n.nodes.find((p) => p.id === id);
  if (!p) throw new Error(`Knoten ${id} fehlt`);
  return p;
}
export const armId = (path: string, segment: number, end: "start" | "end") =>
  `${path}:${segment}:${end}`;

export function validate(value: unknown): asserts value is Network {
  const fail = (message: string): never => {
    throw new Error(message);
  };
  if (!value || typeof value !== "object") fail("Graph muss ein Objekt sein");
  const n = value as Network;
  if (
    n.version !== 1 ||
    !Array.isArray(n.nodes) ||
    !Array.isArray(n.paths) ||
    !Array.isArray(n.junctions)
  )
    fail("Ungültiges Format / Version (erwartet 1)");
  const point = (p: Point) =>
    p && typeof p === "object" && Number.isFinite(p.x) && Number.isFinite(p.y);
  const id = (s: string) => typeof s === "string" && s.length > 0;
  const nodes = new Map<string, Node>(),
    paths = new Set<string>(),
    arms = new Map<string, string>();
  for (const p of n.nodes) {
    if (!p || !id(p.id) || !point(p) || nodes.has(p.id))
      fail("Ungültiger oder doppelter Knoten");
    nodes.set(p.id, p);
  }
  for (const p of n.paths) {
    if (!p || !id(p.id) || paths.has(p.id))
      fail("Ungültige oder doppelte Pfad-ID");
    paths.add(p.id);
    if (
      !Number.isFinite(p.startWidth) ||
      !Number.isFinite(p.endWidth) ||
      p.startWidth <= 0 ||
      p.endWidth <= 0
    )
      fail("Breite muss endlich und positiv sein");
    if (p.widthsLinked !== undefined && typeof p.widthsLinked !== "boolean")
      fail("Breitenkopplung muss ein Wahrheitswert sein");
    if (p.widthsLinked && p.startWidth !== p.endWidth)
      fail("Gekoppelte Breiten müssen gleich sein");
    if (!Array.isArray(p.segments) || p.segments.length === 0)
      fail("Pfad benötigt Segmente");
    p.segments.forEach((s, i) => {
      if (
        !s ||
        !["line", "quadratic", "cubic"].includes(s.kind) ||
        !nodes.has(s.from) ||
        !nodes.has(s.to)
      )
        fail("Segmenttyp oder Knotenreferenz ungültig");
      if (i > 0 && p.segments[i - 1].to !== s.from)
        fail("Pfad ist nicht zusammenhängend");
      const pts: Point[] = [nodes.get(s.from)!, nodes.get(s.to)!];
      if (s.kind === "quadratic") {
        if (!point(s.control)) fail("Ungültiger Kontrollgriff");
        pts.push(s.control);
      }
      if (s.kind === "cubic") {
        if (!point(s.c1) || !point(s.c2)) fail("Ungültige Kontrollgriffe");
        pts.push(s.c1, s.c2);
      }
      if (pts.every((q) => distance(pts[0], q) < 1e-9))
        fail("Degeneriertes Segment");
      arms.set(armId(p.id, i, "start"), s.from);
      arms.set(armId(p.id, i, "end"), s.to);
    });
  }
  const pairs = new Set<string>();
  for (const j of n.junctions) {
    if (
      !j ||
      !nodes.has(j.node) ||
      arms.get(j.a) !== j.node ||
      arms.get(j.b) !== j.node ||
      j.a === j.b ||
      !Number.isFinite(j.radius) ||
      j.radius < 0
    )
      fail("Ungültige Radius-/Armreferenz");
    const key = JSON.stringify([j.node, ...[j.a, j.b].sort()]);
    if (pairs.has(key)) fail("Doppelter Armradius");
    pairs.add(key);
  }
}
export function parse(json: string): Network {
  const value: unknown = JSON.parse(json);
  validate(value);
  return value;
}
export function serialize(n: Network): string {
  validate(n);
  return JSON.stringify(n, null, 2);
}
export function evaluate(n: Network, s: Segment, t: number): Point {
  const a = node(n, s.from),
    b = node(n, s.to);
  if (s.kind === "line") return mix(a, b, t);
  if (s.kind === "quadratic")
    return mix(mix(a, s.control, t), mix(s.control, b, t), t);
  return mix(
    mix(mix(a, s.c1, t), mix(s.c1, s.c2, t), t),
    mix(mix(s.c1, s.c2, t), mix(s.c2, b, t), t),
    t,
  );
}
export function derivative(n: Network, s: Segment, t: number): Point {
  const a = node(n, s.from),
    b = node(n, s.to);
  if (s.kind === "line") return { x: b.x - a.x, y: b.y - a.y };
  const diff = (a: Point, b: Point, k: number) => ({
    x: (b.x - a.x) * k,
    y: (b.y - a.y) * k,
  });
  if (s.kind === "quadratic")
    return mix(diff(a, s.control, 2), diff(s.control, b, 2), t);
  return mix(
    mix(diff(a, s.c1, 3), diff(s.c1, s.c2, 3), t),
    mix(diff(s.c1, s.c2, 3), diff(s.c2, b, 3), t),
    t,
  );
}
export function moveNode(n: Network, id: string, p: Point): void {
  if (!Number.isFinite(p.x) || !Number.isFinite(p.y))
    throw new Error("Position muss endlich sein");
  Object.assign(node(n, id), p); // Controls are independent world positions; no implicit smoothing.
}
export function reversePath(n: Network, id: string): void {
  const p = n.paths.find((p) => p.id === id);
  if (!p) throw new Error("Pfad fehlt");
  const len = p.segments.length;
  p.segments = p.segments
    .slice()
    .reverse()
    .map((s) =>
      s.kind === "line"
        ? { ...s, from: s.to, to: s.from }
        : s.kind === "quadratic"
          ? { ...s, from: s.to, to: s.from }
          : { ...s, from: s.to, to: s.from, c1: s.c2, c2: s.c1 },
    );
  [p.startWidth, p.endWidth] = [p.endWidth, p.startWidth];
  const remap = new Map<string, string>();
  for (let i = 0; i < len; i++) {
    remap.set(armId(id, i, "start"), armId(id, len - 1 - i, "end"));
    remap.set(armId(id, i, "end"), armId(id, len - 1 - i, "start"));
  }
  n.junctions.forEach((j) => {
    j.a = remap.get(j.a) ?? j.a;
    j.b = remap.get(j.b) ?? j.b;
  });
}
export function splitSegment(
  n: Network,
  id: string,
  index: number,
  t: number,
  nodeId: string,
): void {
  const p = n.paths.find((p) => p.id === id),
    s = p?.segments[index];
  if (
    !p ||
    !s ||
    !Number.isFinite(t) ||
    t <= 0 ||
    t >= 1 ||
    n.nodes.some((p) => p.id === nodeId)
  )
    throw new Error("Ungültige Teilung");
  const a = node(n, s.from),
    b = node(n, s.to),
    at = evaluate(n, s, t);
  let left: Segment, right: Segment;
  if (s.kind === "line") {
    left = { ...s, to: nodeId };
    right = { ...s, from: nodeId };
  } else if (s.kind === "quadratic") {
    left = { ...s, to: nodeId, control: mix(a, s.control, t) };
    right = { ...s, from: nodeId, control: mix(s.control, b, t) };
  } else {
    const a1 = mix(a, s.c1, t),
      b1 = mix(s.c1, s.c2, t),
      c1 = mix(s.c2, b, t);
    left = { ...s, to: nodeId, c1: a1, c2: mix(a1, b1, t) };
    right = { ...s, from: nodeId, c1: mix(b1, c1, t), c2: c1 };
  }
  // Keep radius references attached to the original physical ends.
  const remap = new Map<string, string>();
  for (let i = index; i < p.segments.length; i++) {
    remap.set(
      armId(id, i, "start"),
      armId(id, i === index ? index : i + 1, "start"),
    );
    remap.set(armId(id, i, "end"), armId(id, i + 1, "end"));
  }
  n.junctions.forEach((j) => {
    j.a = remap.get(j.a) ?? j.a;
    j.b = remap.get(j.b) ?? j.b;
  });
  n.nodes.push({ id: nodeId, ...at });
  p.segments.splice(index, 1, left, right);
}
export function cleanJunctions(n: Network): void {
  const arms = new Map<string, string>();
  n.paths.forEach((p) =>
    p.segments.forEach((s, i) => {
      arms.set(armId(p.id, i, "start"), s.from);
      arms.set(armId(p.id, i, "end"), s.to);
    }),
  );
  n.junctions = n.junctions.filter(
    (j) => arms.get(j.a) === j.node && arms.get(j.b) === j.node,
  );
}
export function detach(
  n: Network,
  pathId: string,
  nodeId: string,
  newId: string,
): void {
  const p = n.paths.find((p) => p.id === pathId);
  if (
    !p ||
    !p.segments.some((s) => s.from === nodeId || s.to === nodeId) ||
    n.nodes.some((p) => p.id === newId)
  )
    throw new Error("Kein Anschluss zum Lösen");
  const movedArms = new Set<string>();
  p.segments.forEach((s, i) => {
    if (s.from === nodeId) movedArms.add(armId(pathId, i, "start"));
    if (s.to === nodeId) movedArms.add(armId(pathId, i, "end"));
  });
  n.junctions.forEach((j) => {
    if (j.node === nodeId && movedArms.has(j.a) && movedArms.has(j.b))
      j.node = newId;
  });
  n.nodes.push({ ...node(n, nodeId), id: newId });
  p.segments.forEach((s) => {
    if (s.from === nodeId) s.from = newId;
    if (s.to === nodeId) s.to = newId;
  });
  cleanJunctions(n);
}
export function connect(n: Network, source: string, target: string): void {
  if (source === target) throw new Error("Zwei unterschiedliche Knoten wählen");
  node(n, target);
  n.paths.forEach((p) =>
    p.segments.forEach((s) => {
      if (s.from === source) s.from = target;
      if (s.to === source) s.to = target;
    }),
  );
  n.nodes = n.nodes.filter((p) => p.id !== source);
  n.junctions.forEach((j) => {
    if (j.node === source) j.node = target;
  });
  cleanJunctions(n);
  validate(n);
}
export class History {
  private past: Network[] = [];
  private future: Network[] = [];
  value: Network;
  constructor(value: Network) {
    validate(value);
    this.value = structuredClone(value);
  }
  get canUndo() {
    return this.past.length > 0;
  }
  get canRedo() {
    return this.future.length > 0;
  }
  commit(n: Network) {
    validate(n);
    if (JSON.stringify(n) === JSON.stringify(this.value)) return;
    this.past.push(structuredClone(this.value));
    this.value = structuredClone(n);
    this.future = [];
  }
  undo() {
    const prev = this.past.pop();
    if (prev) {
      this.future.push(this.value);
      this.value = prev;
    }
  }
  redo() {
    const next = this.future.pop();
    if (next) {
      this.past.push(this.value);
      this.value = next;
    }
  }
}
