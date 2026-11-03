import { describe, it, expect } from "vitest";
import {
  computeSurface,
  areaSize,
  contains,
  nearestBoundary,
} from "../src/geometry";
import {
  validate,
  parse,
  serialize,
  moveNode,
  reversePath,
  splitSegment,
  History,
  detach,
  connect,
  type Network,
  type Point,
  type Segment,
} from "../src/network";
import {
  straight,
  quadratic,
  cubic,
  junction,
  loop,
  crossing,
  graph,
  line,
} from "./fixtures";
const distanceLiteral = (a: Point, b: Point) =>
  Math.hypot(a.x - b.x, a.y - b.y);
const close = (a: number, b: number, t = 1e-6) =>
  expect(Math.abs(a - b)).toBeLessThanOrEqual(t);
function transform(n: Network, angle: number, x: number, y: number) {
  const f = (p: Point) => ({
    x: Math.cos(angle) * p.x - Math.sin(angle) * p.y + x,
    y: Math.sin(angle) * p.x + Math.cos(angle) * p.y + y,
  });
  n.nodes = n.nodes.map((p) => ({ ...p, ...f(p) }));
  n.paths.forEach((p) =>
    p.segments.forEach((s) => {
      if (s.kind === "quadratic") s.control = f(s.control);
      if (s.kind === "cubic") {
        s.c1 = f(s.c1);
        s.c2 = f(s.c2);
      }
    }),
  );
  return n;
}
function point(n: Network, s: Segment, t: number): Point {
  const a = n.nodes.find((p) => p.id === s.from)!,
    b = n.nodes.find((p) => p.id === s.to)!,
    u = 1 - t;
  if (s.kind === "line") return { x: a.x * u + b.x * t, y: a.y * u + b.y * t };
  if (s.kind === "quadratic")
    return {
      x: a.x * u * u + 2 * u * t * s.control.x + b.x * t * t,
      y: a.y * u * u + 2 * u * t * s.control.y + b.y * t * t,
    };
  return {
    x:
      a.x * u ** 3 +
      3 * u * u * t * s.c1.x +
      3 * u * t * t * s.c2.x +
      b.x * t ** 3,
    y:
      a.y * u ** 3 +
      3 * u * u * t * s.c1.y +
      3 * u * t * t * s.c2.y +
      b.y * t ** 3,
  };
}
describe("frozen world-coordinate evaluator", () => {
  it("S2 smooth subdivision preserves existing junction fillets", () => {
    const n = junction("X", 3),
      before = computeSurface(n);
    splitSegment(n, "E", 0, 4 / 30, "split");
    const after = computeSurface(n);
    expect(after.radii.find((r) => r.requested === 3)?.effective).toBe(3);
    close(areaSize(after), areaSize(before), 0.02);
    expect(contains(after, { x: 2.5, y: 3.5 })).toBe(true);
    reversePath(n, "E");
    expect(
      computeSurface(n).radii.find((r) => r.requested === 3)?.effective,
    ).toBe(3);
  });
  it("S2b curved tapered subdivision preserves its junction radius", () => {
    const n = junction("T", 2);
    n.paths[0].startWidth = 4;
    n.paths[0].endWidth = 10;
    n.paths[0].segments[0] = {
      kind: "quadratic",
      from: "o",
      to: "e",
      control: { x: 15, y: 5 },
    };
    const before = computeSurface(n);
    expect(before.radii.find((r) => r.requested === 2)?.effective).toBe(2);
    splitSegment(n, "E", 0, 0.1, "split");
    const after = computeSurface(n);
    expect(after.radii.find((r) => r.requested === 2)?.effective).toBe(2);
    close(areaSize(after), areaSize(before), 0.02);
  });
  it("S5 repeated curved splits and reversal remain numerically stable", () => {
    for (const splits of [2, 3]) {
      const n = junction("T", 2);
      n.paths[0].startWidth = 4;
      n.paths[0].endWidth = 10;
      n.paths[0].segments[0] = {
        kind: "quadratic",
        from: "o",
        to: "e",
        control: { x: 15, y: 5 },
      };
      const before = computeSurface(n);
      for (let i = 0; i < splits; i++)
        splitSegment(n, "E", i, 0.1, `split-${i}`);
      reversePath(n, "E");
      const after = computeSurface(n);
      expect(after.radii.find((r) => r.requested === 2)?.effective).toBe(2);
      close(areaSize(before), areaSize(after), 0.02);
      const moved = computeSurface(
        transform(structuredClone(n), 0.731, 81, -23),
      );
      close(areaSize(after), areaSize(moved), 0.02);
      const reviewerMotion = computeSurface(
        transform(structuredClone(n), 0.0274, -28.24, -22.91),
      );
      close(areaSize(after), areaSize(reviewerMotion), 0.02);
      expect(
        reviewerMotion.radii.find((r) => r.requested === 2)?.effective,
      ).toBe(2);
      const rotatedGraph = transform(structuredClone(n), 2, 0, 0),
        rotated = computeSurface(rotatedGraph);
      expect(rotated.areas).toHaveLength(1);
      const translatedGraph = transform(structuredClone(n), 2, 7000, 9000),
        translated = computeSurface(translatedGraph);
      expect(translated.areas).toHaveLength(1);
      close(
        nearestBoundary(
          translated,
          translatedGraph.nodes.find((p) => p.id === "split-1")!,
        )!.distance,
        nearestBoundary(after, n.nodes.find((p) => p.id === "split-1")!)!
          .distance,
        0.04,
      );
      close(
        nearestBoundary(
          rotated,
          rotatedGraph.nodes.find((p) => p.id === "split-1")!,
        )!.distance,
        nearestBoundary(after, n.nodes.find((p) => p.id === "split-1")!)!
          .distance,
        0.04,
      );
    }
  });
  it("S5b deterministic rigid-motion probes keep split surfaces stable", () => {
    const n = junction("T", 2);
    n.paths[0].startWidth = 4;
    n.paths[0].endWidth = 10;
    n.paths[0].segments[0] = {
      kind: "quadratic",
      from: "o",
      to: "e",
      control: { x: 15, y: 5 },
    };
    for (let i = 0; i < 3; i++) splitSegment(n, "E", i, 0.1, `split-${i}`);
    reversePath(n, "E");
    const referenceSurface = computeSurface(n),
      reference = areaSize(referenceSurface);
    const referenceDistance = nearestBoundary(
      referenceSurface,
      n.nodes.find((p) => p.id === "split-1")!,
    )!.distance;
    for (let i = 0; i < 24; i++) {
      const angle = i * 0.2371,
        x = Math.sin(i * 1.31) * 83,
        y = Math.cos(i * 0.773) * 91;
      const moved = transform(structuredClone(n), angle, x, y),
        s = computeSurface(moved);
      expect(s.areas).toHaveLength(1);
      close(
        nearestBoundary(s, moved.nodes.find((p) => p.id === "split-1")!)!
          .distance,
        referenceDistance,
        0.04,
      );
      close(areaSize(s), reference, 0.02);
      expect(s.radii.find((r) => r.requested === 2)?.effective).toBe(2);
      expect(s.conflicts).toEqual([]);
    }
  });
  it("G09b nested disconnected surface inside a free interior preserves its hole", () => {
    const n = loop();
    n.nodes.push(
      { id: "inside-a", x: -4, y: 0 },
      { id: "inside-b", x: 4, y: 0 },
    );
    n.paths.push(line("inside", "inside-a", "inside-b", 2));
    const s = computeSurface(n);
    close(areaSize(s), 648);
    expect(s.areas).toHaveLength(2);
    expect(s.areas.reduce((sum, a) => sum + a.holes.length, 0)).toBe(1);
    expect(contains(s, { x: 0, y: 0 })).toBe(true);
    expect(contains(s, { x: 10, y: 0 })).toBe(false);
    expect(s.conflicts).toEqual([]);
  });
  it("G09c smooth closed cubic path keeps only its outer and inner boundaries", () => {
    const k = (20 * 4 * (Math.sqrt(2) - 1)) / 3;
    const n = graph(
      [
        { id: "e", x: 20, y: 0 },
        { id: "n", x: 0, y: 20 },
        { id: "w", x: -20, y: 0 },
        { id: "s", x: 0, y: -20 },
      ],
      [
        {
          id: "closed",
          startWidth: 4,
          endWidth: 4,
          segments: [
            {
              kind: "cubic",
              from: "e",
              to: "n",
              c1: { x: 20, y: k },
              c2: { x: k, y: 20 },
            },
            {
              kind: "cubic",
              from: "n",
              to: "w",
              c1: { x: -k, y: 20 },
              c2: { x: -20, y: k },
            },
            {
              kind: "cubic",
              from: "w",
              to: "s",
              c1: { x: -20, y: -k },
              c2: { x: -k, y: -20 },
            },
            {
              kind: "cubic",
              from: "s",
              to: "e",
              c1: { x: k, y: -20 },
              c2: { x: 20, y: -k },
            },
          ],
        },
      ],
    );
    const original = serialize(n),
      s = computeSurface(n);
    expect(serialize(n)).toBe(original);
    expect(s.areas).toHaveLength(1);
    expect(s.areas[0].holes).toHaveLength(1);
    expect(contains(s, { x: 0, y: 0 })).toBe(false);
    expect(contains(s, { x: 0, y: 18.04 })).toBe(true);
    expect(contains(s, { x: 0, y: 17.96 })).toBe(false);
    close(nearestBoundary(s, { x: 0, y: 0 })!.distance, 18, 0.04);
    const moved = computeSurface(transform(structuredClone(n), 2, 4, -7));
    expect(moved.areas).toHaveLength(1);
    expect(moved.areas[0].holes).toHaveLength(1);
    close(areaSize(s), areaSize(moved), 0.02);
    close(nearestBoundary(moved, { x: 4, y: -7 })!.distance, 18, 0.04);
  });
  it("S5c short smooth split preserves topology and distance at translated coordinates", () => {
    const n = junction("T", 2);
    n.paths[0].startWidth = 4;
    n.paths[0].endWidth = 10;
    n.paths[0].segments[0] = {
      kind: "quadratic",
      from: "o",
      to: "e",
      control: { x: 15, y: 5 },
    };
    splitSegment(n, "E", 0, 0.37, "first");
    splitSegment(n, "E", 0, 0.9999, "near");
    reversePath(n, "E");
    const before = computeSurface(n),
      d = nearestBoundary(
        before,
        n.nodes.find((p) => p.id === "near")!,
      )!.distance;
    expect(before.areas).toHaveLength(1);
    expect(d).toBeGreaterThan(3);
    const moved = transform(structuredClone(n), 2, 7000, 9000),
      s = computeSurface(moved);
    expect(s.areas).toHaveLength(1);
    close(areaSize(s), areaSize(before), 0.02);
    close(
      nearestBoundary(s, moved.nodes.find((p) => p.id === "near")!)!.distance,
      d,
      0.04,
    );
  });
  it("S5d stationary Bezier endpoints preserve deliberate corners under translation", () => {
    for (const kind of ["quadratic", "cubic"] as const) {
      const n = graph(
        [
          { id: "a", x: -30, y: 0 },
          { id: "o", x: 0, y: 0 },
          { id: "b", x: 30, y: 3 },
        ],
        [
          {
            id: "corner",
            startWidth: 4,
            endWidth: 4,
            segments: [
              kind === "quadratic"
                ? { kind, from: "a", to: "o", control: { x: 0, y: 0 } }
                : {
                    kind,
                    from: "a",
                    to: "o",
                    c1: { x: -10, y: 0 },
                    c2: { x: 0, y: 0 },
                  },
              { kind: "line", from: "o", to: "b" },
            ],
          },
        ],
      );
      const original = serialize(n),
        before = computeSurface(n);
      expect(areaSize(before)).toBeGreaterThan(240);
      const moved = transform(structuredClone(n), 0, 7000, 9000),
        after = computeSurface(moved);
      close(areaSize(before), areaSize(after), 0.02);
      expect(serialize(n)).toBe(original);
      expect(after.areas).toHaveLength(1);
      const first = n.paths[0].segments[0];
      if (first.kind === "quadratic") first.control.x = -0.00001;
      else if (first.kind === "cubic") first.c2.x = -0.00001;
      close(
        areaSize(before),
        areaSize(computeSurface(transform(n, 0, 7000, 9000))),
        0.02,
      );
    }
  });
  it("S6 cubic fillet feasibility survives shape-preserving subdivision", () => {
    const n = junction("T", 2);
    n.paths[0].startWidth = 4;
    n.paths[0].endWidth = 10;
    n.paths[0].segments[0] = {
      kind: "cubic",
      from: "o",
      to: "e",
      c1: { x: 10, y: 4 },
      c2: { x: 20, y: -4 },
    };
    const before = computeSurface(n);
    expect(before.radii.find((r) => r.requested === 2)?.effective).toBe(2);
    splitSegment(n, "E", 0, 0.1, "split");
    const after = computeSurface(n);
    expect(after.radii.find((r) => r.requested === 2)?.effective).toBe(2);
    close(areaSize(before), areaSize(after), 0.02);
    const r = after.radii.find((r) => r.requested === 2)!;
    const armSurface = computeSurface({
      ...n,
      paths: [n.paths.find((p) => p.id === "E")!],
      junctions: [],
    });
    const closest = nearestBoundary(armSurface, r.center!)!;
    close(closest.distance, 2, 1e-6);
    expect(distanceLiteral(closest.point, r.tangentA!)).toBeLessThanOrEqual(
      0.04,
    );
    expect(
      Math.abs(
        (r.center!.x - r.tangentA!.x) * closest.direction.x +
          (r.center!.y - r.tangentA!.y) * closest.direction.y,
      ),
    ).toBeLessThanOrEqual(0.04);
    const referenceDistance = nearestBoundary(
      after,
      n.nodes.find((p) => p.id === "split")!,
    )!.distance;
    splitSegment(n, "E", 1, 0.37, "again");
    reversePath(n, "E");
    for (const [angle, x, y] of [
      [2, 7000, 9000],
      [0.0274, -28.24, -22.91],
      [0.731, 81, -23],
    ]) {
      const movedGraph = transform(structuredClone(n), angle, x, y),
        s = computeSurface(movedGraph);
      expect(s.areas).toHaveLength(1);
      expect(s.radii.find((r) => r.requested === 2)?.effective).toBe(2);
      close(areaSize(before), areaSize(s), 0.02);
      close(
        nearestBoundary(s, movedGraph.nodes.find((p) => p.id === "split")!)!
          .distance,
        referenceDistance,
        0.04,
      );
    }
  });
  it("S3 conflicts include node cores and fillet material", () => {
    const n = junction("T", 0);
    n.paths = n.paths.filter((p) => p.id !== "W");
    n.nodes.push({ id: "u", x: -1.4, y: -0.5 }, { id: "v", x: -0.6, y: -0.5 });
    n.paths.push(line("independent", "u", "v", 0.2));
    expect(contains(computeSurface(n), { x: -1, y: -0.5 })).toBe(true);
    expect(computeSurface(n).conflicts).toContain("E × independent");
    n.junctions[0].radius = 3;
    n.nodes.find((p) => p.id === "u")!.x = 2.3;
    n.nodes.find((p) => p.id === "u")!.y = 3.5;
    n.nodes.find((p) => p.id === "v")!.x = 2.5;
    n.nodes.find((p) => p.id === "v")!.y = 3.5;
    const rounded = computeSurface(n);
    expect(rounded.radii.find((r) => r.requested === 3)?.effective).toBe(3);
    expect(rounded.conflicts).toContain("E × independent");
  });
  it("S4 detach retains radii whose two arms stay together", () => {
    const n = graph(
      [
        { id: "e", x: 30, y: 0 },
        { id: "o", x: 0, y: 0 },
        { id: "n", x: 0, y: 30 },
        { id: "w", x: -30, y: 0 },
      ],
      [
        {
          id: "P",
          startWidth: 4,
          endWidth: 4,
          segments: [
            { kind: "line", from: "e", to: "o" },
            { kind: "line", from: "o", to: "n" },
          ],
        },
        line("W", "o", "w", 4),
      ],
    );
    n.junctions = [
      { node: "o", a: "P:0:end", b: "P:1:start", radius: 3 },
      { node: "o", a: "P:1:start", b: "W:0:start", radius: 1 },
    ];
    detach(n, "P", "o", "detached");
    expect(n.junctions).toEqual([
      { node: "detached", a: "P:0:end", b: "P:1:start", radius: 3 },
    ]);
    expect(
      computeSurface(n).radii.find((r) => r.requested === 3)?.effective,
    ).toBe(3);
  });

  it("G03b arc-length width is not Bézier parameter, including a stationary endpoint", () => {
    const n = graph(
      [
        { id: "a", x: 0, y: 0 },
        { id: "b", x: 40, y: 0 },
      ],
      [
        {
          id: "Q",
          startWidth: 3,
          endWidth: 9,
          segments: [
            { kind: "quadratic", from: "a", to: "b", control: { x: 0, y: 0 } },
          ],
        },
      ],
    );
    const s = computeSurface(n);
    close(areaSize(s), 240);
    expect(contains(s, { x: 10, y: 2.24 })).toBe(true);
    expect(contains(s, { x: 10, y: 2.26 })).toBe(false);
  });
  it("G07b tapered and curved arm radii follow the actual edges", () => {
    const n = junction("T", 2);
    n.paths[0].startWidth = 4;
    n.paths[0].endWidth = 10;
    let s = computeSurface(n),
      r = s.radii.find((r) => r.requested === 2)!;
    expect(r.effective).toBe(2);
    // East edge is y=2+0.1*x: radius vector is orthogonal to that line.
    close(r.tangentA!.x - r.center!.x + 0.1 * (r.tangentA!.y - r.center!.y), 0);
    close(
      Math.abs(0.1 * r.center!.x - r.center!.y + 2) / Math.hypot(0.1, 1),
      2,
    );
    n.paths[0].segments[0] = {
      kind: "quadratic",
      from: "o",
      to: "e",
      control: { x: 15, y: 5 },
    };
    s = computeSurface(n);
    r = s.radii.find((r) => r.requested === 2)!;
    expect(r.effective).toBe(2);
    close(distanceLiteral(r.center!, r.tangentA!), 2);
    expect(areaSize(s)).toBeGreaterThan(0);
    const acute = junction("T", 3);
    acute.nodes.find((p) => p.id === "n")!.x = 30;
    acute.nodes.find((p) => p.id === "n")!.y = 1;
    const failed = computeSurface(acute).radii.find((r) => r.requested === 3)!;
    expect(failed.effective).toBe(0);
    expect(failed.reason).toBeTruthy();
  });
  it("G05b detach/connect preserves stable identity and validates collapsed segments", () => {
    const n = junction();
    detach(n, "E", "o", "own");
    expect(n.paths[0].segments[0].from).toBe("own");
    expect(computeSurface(n).conflicts).toContain("E × N");
    connect(n, "own", "o");
    expect(n.paths[0].segments[0].from).toBe("o");
    expect(computeSurface(n).conflicts).toEqual([]);
  });

  it("G01 butt-capped line and quadratic cross-section", () => {
    const s = computeSurface(straight());
    close(areaSize(s), 240);
    expect(contains(s, { x: 0, y: 2.99 })).toBe(true);
    expect(contains(s, { x: 0, y: 3.01 })).toBe(false);
    expect(contains(s, { x: 20.01, y: 0 })).toBe(false);
    const q = computeSurface(quadratic());
    expect(contains(q, { x: 0, y: 11.96 })).toBe(true);
    expect(contains(q, { x: 0, y: 12.04 })).toBe(false);
    expect(contains(q, { x: 0, y: 8.04 })).toBe(true);
    expect(contains(q, { x: 0, y: 7.96 })).toBe(false);
  });
  it("G02 cubic S / compound finite, nonempty", () => {
    const s = computeSurface(cubic());
    expect(areaSize(s)).toBeGreaterThan(300);
    expect(
      s.areas
        .flatMap((a) => [a.outer, ...a.holes])
        .flat()
        .every((p) => Number.isFinite(p.x) && Number.isFinite(p.y)),
    ).toBe(true);
  });
  it("G03 linear width over arc length, not parameter t", () => {
    const n = straight();
    n.paths[0].startWidth = 3;
    n.paths[0].endWidth = 9;
    const s = computeSurface(n);
    close(areaSize(s), 240);
    expect(contains(s, { x: -10, y: 2.24 })).toBe(true);
    expect(contains(s, { x: -10, y: 2.26 })).toBe(false);
    expect(contains(s, { x: 10, y: 3.74 })).toBe(true);
    expect(contains(s, { x: 10, y: 3.76 })).toBe(false);
    n.paths[0].endWidth = 3;
    close(areaSize(computeSurface(n)), 120);
    // Unequal lengths: at x=0, 1/4 of a 40m compound path, width is 4.5.
    const c = graph(
      [
        { id: "a", x: -10, y: 0 },
        { id: "b", x: 0, y: 0 },
        { id: "c", x: 30, y: 0 },
      ],
      [
        {
          id: "C",
          startWidth: 3,
          endWidth: 9,
          segments: [
            { kind: "line", from: "a", to: "b" },
            { kind: "line", from: "b", to: "c" },
          ],
        },
      ],
    );
    expect(contains(computeSurface(c), { x: 0, y: 2.24 })).toBe(true);
    expect(contains(computeSurface(c), { x: 0, y: 2.26 })).toBe(false);
  });
  it("G04 direction reversal preserves curved tapered physical surface", () => {
    for (const n of [quadratic(), cubic()]) {
      n.paths[0].startWidth = 3;
      n.paths[0].endWidth = 9;
      const before = computeSurface(n);
      reversePath(n, n.paths[0].id);
      const after = computeSurface(n);
      close(areaSize(before), areaSize(after), 0.02);
      for (let x = -31; x < 36; x += 2.5)
        for (let y = -20; y < 21; y += 2.5)
          expect(contains(after, { x, y })).toBe(contains(before, { x, y }));
    }
  });
  it("G04b radii survive reversal and rigid motion without changing geometry", () => {
    const n = junction("Y", 2),
      s = computeSurface(n);
    n.paths.forEach((p) => reversePath(n, p.id));
    const reversed = computeSurface(n);
    close(areaSize(s), areaSize(reversed), 0.02);
    expect(reversed.radii.find((r) => r.requested === 2)?.effective).toBe(2);
    const moved = computeSurface(transform(structuredClone(n), 0.731, 81, -23));
    close(areaSize(s), areaSize(moved), 0.02);
    expect(moved.radii.find((r) => r.requested === 2)?.effective).toBe(2);
  });
  it("G05 shared identity survives movement, coincidence does not connect", () => {
    const n = junction();
    moveNode(n, "o", { x: 4, y: 5 });
    expect(n.paths.every((p) => p.segments[0].from === "o")).toBe(true);
    expect(contains(computeSurface(n), { x: 4, y: 5 })).toBe(true);
    const c = crossing();
    const ids = c.nodes.map((p) => p.id);
    computeSurface(c);
    expect(c.nodes.map((p) => p.id)).toEqual(ids);
  });
  it("G06 T/Y/X unequal widths and skewed arms", () => {
    for (const kind of ["T", "Y", "X"] as const) {
      const n = junction(kind, 2),
        s = computeSurface(n);
      expect(s.areas).toHaveLength(1);
      expect(s.conflicts).toEqual([]);
      expect(s.radii.find((r) => r.requested === 2)?.effective).toBe(2);
    }
  });
  it("G07 local circular junction radius: zero, valid, impossible", () => {
    const n = junction("X"),
      base = computeSurface(n);
    close(areaSize(base), 605.5); // 30*(6+4+8+3) - (6+8+6+4.5)
    n.junctions[0].radius = 3;
    const s = computeSurface(n),
      r = s.radii.find((r) => r.requested === 3)!;
    expect(r.effective).toBe(3);
    close(areaSize(s) - areaSize(base), 9 * (1 - Math.PI / 4), 0.02);
    close(r.center!.x, 5);
    close(r.center!.y, 6);
    close(
      Math.hypot(r.center!.x - r.tangentA!.x, r.center!.y - r.tangentA!.y),
      3,
    );
    close(r.tangentA!.y, 3);
    close(r.tangentB!.x, 2);
    // Added material is OUTSIDE the circle centered (5,6), radius 3.
    expect(contains(base, { x: 2.5, y: 3.5 })).toBe(false);
    expect(contains(s, { x: 2.5, y: 3.5 })).toBe(true);
    expect(contains(s, { x: 3, y: 4 })).toBe(false);
    expect(contains(s, { x: 25, y: 3.01 })).toBe(false); // no global buffer
    n.junctions[0].radius = 1000;
    const failed = computeSurface(n).radii.find((r) => r.requested === 1000)!;
    expect(failed.effective).toBe(0);
    expect(failed.reason).toBeTruthy();
  });
  it("G08 short dead-end has butt cap; short junction rejects radius", () => {
    const n = graph(
      [
        { id: "a", x: 0, y: 0 },
        { id: "b", x: 2, y: 0 },
      ],
      [line("short", "a", "b", 4)],
    );
    close(areaSize(computeSurface(n)), 8);
    expect(contains(computeSurface(n), { x: 2.01, y: 0 })).toBe(false);
    const j = junction("T", 3);
    j.nodes.find((p) => p.id === "e")!.x = 2;
    expect(
      computeSurface(j).radii.find((r) => r.requested === 3)?.effective,
    ).toBe(0);
  });
  it("G09 union preserves enclosed free region, with independent area oracle", () => {
    const s = computeSurface(loop());
    expect(s.areas).toHaveLength(1);
    expect(s.areas[0].holes).toHaveLength(1);
    expect(contains(s, { x: 0, y: 0 })).toBe(false);
    expect(contains(s, { x: 20, y: 0 })).toBe(true);
    // Bevel outer corners: 44² - 4*(2*2/2) - 36².
    close(areaSize(s), 632);
  });
  it("G10 disconnected subnetworks stay separate", () => {
    const n = straight();
    n.nodes.push({ id: "c", x: -20, y: 20 }, { id: "d", x: 20, y: 20 });
    n.paths.push(line("other", "c", "d"));
    expect(computeSurface(n).areas).toHaveLength(2);
  });
  it("G11 unresolved overlap is visible and never mutates topology", () => {
    const n = crossing(),
      before = JSON.stringify(n),
      s = computeSurface(n);
    expect(s.conflicts).toEqual(["L × U"]);
    expect(JSON.stringify(n)).toBe(before);
  });
  it("G11b remote surface overlap and self-crossing remain unresolved", () => {
    const n = graph(
      [
        { id: "o", x: 0, y: 0 },
        { id: "a", x: 20, y: 0 },
        { id: "b", x: 20, y: 20 },
        { id: "c", x: 0, y: 20 },
        { id: "d", x: 19, y: 20 },
      ],
      [
        {
          id: "A",
          startWidth: 4,
          endWidth: 4,
          segments: [
            { kind: "line", from: "o", to: "a" },
            { kind: "line", from: "a", to: "b" },
          ],
        },
        {
          id: "B",
          startWidth: 4,
          endWidth: 4,
          segments: [
            { kind: "line", from: "o", to: "c" },
            { kind: "line", from: "c", to: "d" },
          ],
        },
      ],
    );
    expect(computeSurface(n).conflicts).toContain("A × B");
    const self = graph(
      [
        { id: "a", x: -20, y: -20 },
        { id: "b", x: 20, y: 20 },
        { id: "c", x: -20, y: 20 },
        { id: "d", x: 20, y: -20 },
      ],
      [
        {
          id: "self",
          startWidth: 4,
          endWidth: 4,
          segments: [
            { kind: "line", from: "a", to: "b" },
            { kind: "line", from: "b", to: "c" },
            { kind: "line", from: "c", to: "d" },
          ],
        },
      ],
    );
    expect(computeSurface(self).conflicts).toContain("self × self");
  });
  it("G12 De Casteljau split preserves quadratic and cubic at arbitrary t", () => {
    for (const n of [quadratic(), cubic()]) {
      const old = structuredClone(n),
        seg = old.paths[0].segments[0];
      splitSegment(n, n.paths[0].id, 0, 0.37, "split");
      expect(n.paths[0].segments[0].to).toBe("split");
      expect(n.paths[0].segments[1].from).toBe("split");
      for (let i = 0; i <= 20; i++) {
        const t = i / 20,
          index = t <= 0.37 ? 0 : 1,
          local = index === 0 ? t / 0.37 : (t - 0.37) / 0.63;
        const a = point(old, seg, t),
          b = point(n, n.paths[0].segments[index], local);
        close(a.x, b.x);
        close(a.y, b.y);
      }
      close(areaSize(computeSurface(old)), areaSize(computeSurface(n)), 0.02);
    }
  });
  it("G13 JSON, history, deterministic reconstruction", () => {
    const n = cubic(),
      h = new History(n),
      initial = serialize(n);
    const next = structuredClone(n);
    next.paths[0].startWidth = 10;
    h.commit(next);
    h.undo();
    expect(serialize(h.value)).toBe(initial);
    h.redo();
    expect(h.value.paths[0].startWidth).toBe(10);
    expect(computeSurface(parse(serialize(n)))).toEqual(computeSurface(n));
    expect(() => parse('{"version":2}')).toThrow();
  });
  it("G14 rejects invalid input, never emits NaN surfaces", () => {
    const invalid: Network[] = [];
    for (const v of [NaN, Infinity]) {
      const n = straight();
      n.nodes[0].x = v;
      invalid.push(n);
    }
    for (const v of [0, -1, NaN]) {
      const n = straight();
      n.paths[0].startWidth = v;
      invalid.push(n);
    }
    const missing = straight();
    missing.paths[0].segments[0].from = "absent";
    invalid.push(missing);
    const degenerate = straight();
    degenerate.nodes[1].x = -20;
    invalid.push(degenerate);
    const duplicate = straight();
    duplicate.nodes[1].id = "a";
    invalid.push(duplicate);
    const empty = straight();
    empty.paths[0].segments = [];
    invalid.push(empty);
    const disconnected = cubic();
    disconnected.paths[0].segments[1].from = "a";
    invalid.push(disconnected);
    for (const n of invalid) {
      expect(() => validate(n)).toThrow();
      expect(() => computeSurface(n)).toThrow();
    }
    expect(() =>
      parse('{"version":1,"nodes":null,"paths":[],"junctions":[]}'),
    ).toThrow();
  });
  it("G14b folded offsets are diagnosed instead of presented as unqualified geometry", () => {
    const n = quadratic();
    n.nodes[0].x = -1;
    n.nodes[1].x = 1;
    const s = n.paths[0].segments[0];
    if (s.kind === "quadratic") s.control = { x: 0, y: 2 };
    n.paths[0].startWidth = 10;
    n.paths[0].endWidth = 10;
    expect(computeSurface(n).diagnostics.join(" ")).toContain("Kurvenradius");
  });
  it("G15 rigid motion, boundary distance/direction, negative controls", () => {
    const n = cubic(),
      s = computeSurface(n),
      moved = computeSurface(transform(structuredClone(n), 0.731, 81, -23));
    close(areaSize(s), areaSize(moved), 0.02);
    const hit = nearestBoundary(computeSurface(straight()), { x: 0, y: 10 })!;
    close(hit.distance, 7);
    close(hit.point.y, 3);
    close(Math.abs(hit.direction.x), 1);
    const hole = nearestBoundary(computeSurface(loop()), { x: 0, y: 0 })!;
    expect(hole.hole).toBe(true);
    close(hole.distance, 18);
    expect(
      Math.abs(areaSize(computeSurface(straight())) - 241),
    ).toBeGreaterThan(0.9);
    expect(contains(computeSurface(loop()), { x: 0, y: 0 })).not.toBe(true);
  });
});
