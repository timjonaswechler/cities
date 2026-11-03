import { describe, expect, it } from "vitest";
import {
  closePath,
  openArea,
  parse,
  serialize,
  type Network,
} from "../src/network";
import type { AreaBlocker } from "../src/blockers";
import { curvePoint, splitCurve, type Curve } from "../src/curves";
import { areaSize, computeSurface, contains } from "../src/geometry";
import { straight, quadratic, junction } from "./fixtures";

const lens = (
  kind: "road" | "water",
): AreaBlocker & { outerEdges: Curve[]; holes: [] } => ({
  id: "Kontur",
  kind,
  outer: [
    { x: -10, y: 0 },
    { x: 10, y: 0 },
  ],
  outerEdges: [
    { kind: "quadratic" as const, control: { x: 0, y: 10 } },
    { kind: "quadratic" as const, control: { x: 0, y: -10 } },
  ],
  holes: [],
});
const filled = (kind: "road" | "water"): Network => ({
  version: 3,
  nodes: [],
  paths: [],
  junctions: [],
  areaBlockers: [lens(kind)],
});

describe("one vector model for road and water", () => {
  it("V01 open water and road use the identical variable-width stroke", () => {
    const road = quadratic(),
      water: Network = { ...structuredClone(road), version: 3 };
    road.paths[0].startWidth = water.paths[0].startWidth = 3;
    road.paths[0].endWidth = water.paths[0].endWidth = 9;
    water.paths[0].kind = "water";
    const a = computeSurface(road),
      b = computeSurface(water);
    expect(b.areas).toEqual(a.areas);
    expect(b.roadAreas).toEqual([]);
    expect(b.water!.areas).toEqual(a.areas);
    expect(b.water!.drop).toBeGreaterThan(0);
    expect(contains(b, { x: 0, y: 10 })).toBe(true);
  });
  it("V02 local water junction radii use the same geometry as road junctions", () => {
    const road = junction("T", 3),
      water = structuredClone(road);
    water.version = 3;
    water.paths.forEach((p) => (p.kind = "water"));
    const a = computeSurface(road),
      b = computeSurface(water);
    expect(b.areas).toEqual(a.areas);
    expect(b.radii).toEqual(a.radii);
    expect(b.roadAreas).toEqual([]);
  });
  it("V03 a closed road or water curve fills its interior without widths", () => {
    for (const kind of ["road", "water"] as const) {
      const n = filled(kind),
        s = computeSurface(n);
      expect(areaSize(s)).toBeCloseTo(400 / 3, 1);
      expect(contains(s, { x: 0, y: 0 })).toBe(true);
      expect(contains(s, { x: 0, y: 6 })).toBe(false);
      expect(n.areaBlockers![0]).not.toHaveProperty("startWidth");
      expect(n.areaBlockers![0]).not.toHaveProperty("endWidth");
      if (kind === "water") expect(s.water!.areas).toEqual(s.areas);
      else {
        expect(s.water).toBeUndefined();
        expect(s.roadAreas).toEqual(s.areas);
      }
    }
  });
  it("V04 explicit closure converts the centerline to an area, not a thick loop", () => {
    for (const kind of ["road", "water"] as const) {
      const n: Network = { ...quadratic(), version: 3 };
      n.paths[0].kind = kind;
      const id = n.paths[0].id;
      closePath(n, id, { kind: "line" });
      expect(n.paths).toHaveLength(0);
      expect(n.areaBlockers).toHaveLength(1);
      expect(n.areaBlockers![0].kind).toBe(kind);
      // Fixture: x spans 40 m; y(t)=40t(1-t), so integral y dx = 800/3 m².
      expect(areaSize(computeSurface(n))).toBeCloseTo(800 / 3, 1);
      expect(contains(computeSurface(n), { x: 0, y: 5 })).toBe(true);
      expect(n.nodes).toHaveLength(0);
    }
  });
  it("V05 closed cubic contours keep their handles and support exact De Casteljau insertion", () => {
    const a = lens("water");
    a.outerEdges[0] = {
      kind: "cubic",
      c1: { x: -8, y: 10 },
      c2: { x: 8, y: 10 },
    };
    const n: Network = {
      version: 3,
      nodes: [],
      paths: [],
      junctions: [],
      areaBlockers: [a],
    };
    const before = areaSize(computeSurface(n)),
      original = a.outerEdges[0];
    const cut = splitCurve(a.outer[0], a.outer[1], original, 0.37);
    a.outer.splice(1, 0, cut.point);
    a.outerEdges.splice(0, 1, cut.left, cut.right);
    for (let i = 0; i <= 20; i++) {
      const t = i / 20,
        left = t <= 0.37;
      const expected = curvePoint(
        { x: -10, y: 0 },
        { x: 10, y: 0 },
        original,
        t,
      );
      const actual = curvePoint(
        a.outer[left ? 0 : 1],
        a.outer[left ? 1 : 2],
        a.outerEdges[left ? 0 : 1],
        left ? t / 0.37 : (t - 0.37) / 0.63,
      );
      expect(actual.x).toBeCloseTo(expected.x, 9);
      expect(actual.y).toBeCloseTo(expected.y, 9);
    }
    expect(areaSize(computeSurface(n))).toBeCloseTo(before, 1);
  });
  it("V06 curved island holes work for both materials", () => {
    for (const kind of ["road", "water"] as const) {
      const hole = lens(kind);
      const n: Network = {
        version: 3,
        nodes: [],
        paths: [],
        junctions: [],
        areaBlockers: [
          {
            id: "Outer",
            kind,
            outer: [
              { x: -20, y: -20 },
              { x: 20, y: -20 },
              { x: 20, y: 20 },
              { x: -20, y: 20 },
            ],
            holes: [hole.outer],
            holeEdges: [hole.outerEdges],
          },
        ],
      };
      const s = computeSurface(n);
      expect(areaSize(s)).toBeCloseTo(1600 - 400 / 3, 1);
      expect(contains(s, { x: 0, y: 0 })).toBe(false);
      expect(contains(s, { x: 0, y: 12 })).toBe(true);
      expect(s.areas[0].holes).toHaveLength(1);
    }
  });
  it("V07 cross-material intersections block their union without becoming road junctions", () => {
    const n = junction("T");
    n.version = 3;
    n.paths[1].kind = "water";
    const s = computeSurface(n);
    expect(s.conflicts).toEqual([]);
    expect(
      s.radii.some((r) => r.a.startsWith("N:") || r.b.startsWith("N:")),
    ).toBe(false);
    expect(s.water!.areas.length).toBeGreaterThan(0);
    expect(s.roadAreas!.length).toBeGreaterThan(0);
  });
  it("V08 opening a closed curve restores an editable width-bearing path", () => {
    const n = filled("water");
    openArea(n, "Kontur");
    expect(n.areaBlockers).toEqual([]);
    expect(n.paths).toHaveLength(1);
    expect(n.paths[0]).toMatchObject({
      kind: "water",
      startWidth: 4,
      endWidth: 4,
    });
    expect(n.paths[0].segments[0].kind).toBe("quadratic");
    expect(areaSize(computeSurface(n))).toBeGreaterThan(0);
  });
  it("V09 version 3 roundtrips material/curves; older polygon and road files still load", () => {
    const n = filled("water");
    expect(parse(serialize(n))).toEqual(n);
    expect(parse(serialize(straight()))).toEqual(straight());
    const old: Network = {
      version: 2,
      nodes: [],
      paths: [],
      junctions: [],
      areaBlockers: [
        {
          id: "Old",
          kind: "water",
          outer: [
            { x: 0, y: 0 },
            { x: 10, y: 0 },
            { x: 0, y: 10 },
          ],
        },
      ],
    };
    expect(areaSize(computeSurface(parse(serialize(old))))).toBeCloseTo(50, 6);
  });
  it("V15 curved fills preserve occupancy under rigid movement, winding reversal and material changes", () => {
    const source = filled("water");
    source.areaBlockers![0].outerEdges![0] = {
      kind: "cubic",
      c1: { x: -8, y: 10 },
      c2: { x: 8, y: 10 },
    };
    const before = areaSize(computeSurface(source));
    for (let i = 0; i < 16; i++) {
      const angle = (i * Math.PI * 2) / 13,
        c = Math.cos(angle),
        s = Math.sin(angle);
      const transform = (p: { x: number; y: number }) => ({
        x: p.x * c - p.y * s + 997 * i,
        y: p.x * s + p.y * c - 317 * i,
      });
      const n = structuredClone(source),
        a = n.areaBlockers![0];
      a.outer = a.outer.map(transform);
      a.outerEdges = a.outerEdges!.map((edge) =>
        edge.kind === "line"
          ? edge
          : edge.kind === "quadratic"
            ? { ...edge, control: transform(edge.control) }
            : { ...edge, c1: transform(edge.c1), c2: transform(edge.c2) },
      );
      expect(Math.abs(areaSize(computeSurface(n)) - before)).toBeLessThan(0.02);
      a.outer = [a.outer[0], ...a.outer.slice(1).reverse()];
      a.outerEdges = a.outerEdges
        .reverse()
        .map((edge) =>
          edge.kind === "cubic" ? { ...edge, c1: edge.c2, c2: edge.c1 } : edge,
        );
      const reversed = computeSurface(n);
      expect(Math.abs(areaSize(reversed) - before)).toBeLessThan(0.02);
      expect(contains(reversed, transform({ x: 0, y: 0 }))).toBe(true);
      expect(contains(reversed, transform({ x: 0, y: 12 }))).toBe(false);
      a.kind = "road";
      expect(computeSurface(n).areas).toEqual(reversed.areas);
    }
  });
  it("V14 closure retains nodes still used by another path and rejects invalid closure atomically", () => {
    const n: Network = { ...quadratic(), version: 3 };
    n.nodes.push({ id: "c", x: -30, y: -20 });
    n.paths.push({
      id: "Other",
      startWidth: 3,
      endWidth: 3,
      segments: [{ kind: "line", from: "a", to: "c" }],
    });
    const other = structuredClone(n.paths[1]);
    closePath(n, "Q");
    expect(n.paths).toEqual([other]);
    expect(n.nodes.map((q) => q.id).sort()).toEqual(["a", "c"]);
    expect(areaSize(computeSurface(n))).toBeGreaterThan(0);
    const invalid = straight(),
      before = structuredClone(invalid);
    expect(() => closePath(invalid, "L")).toThrow();
    expect(invalid).toEqual(before);
  });
  it("V10 malformed curves and legacy files pretending to have new semantics reject", () => {
    const n = filled("water");
    for (const outerEdges of [
      [],
      [{ kind: "quadratic", control: { x: NaN, y: 0 } }, { kind: "line" }],
      [{ kind: "unknown" }, { kind: "line" }],
      [{ kind: "quadratic", control: { x: 0, y: 10 } }, null],
    ]) {
      const bad = structuredClone(n);
      bad.areaBlockers![0].outerEdges = outerEdges as never;
      expect(() => computeSurface(bad)).toThrow();
    }
    expect(() => parse(JSON.stringify({ ...n, version: 2 }))).toThrow();
    const badRoad = straight();
    badRoad.paths[0].kind = "water";
    expect(() => computeSurface(badRoad)).toThrow();
    const holes = filled("road");
    holes.areaBlockers![0].holes = [
      [
        { x: -1, y: -1 },
        { x: 1, y: -1 },
        { x: 0, y: 1 },
      ],
    ];
    expect(() => openArea(holes, "Kontur")).toThrow();
  });
});
