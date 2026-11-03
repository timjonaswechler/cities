import { describe, expect, it } from "vitest";
import {
  History,
  emptyNetwork,
  parse,
  serialize,
  validate,
  type Point,
} from "../src/network";
import {
  areaSize,
  computeSurface,
  contains,
  nearestBoundary,
} from "../src/geometry";
import { straight } from "./fixtures";

const rectangle = (x0: number, y0: number, x1: number, y1: number): Point[] => [
  { x: x0, y: y0 },
  { x: x1, y: y0 },
  { x: x1, y: y1 },
  { x: x0, y: y1 },
];
const water = (outer = rectangle(-10, -10, 10, 10), holes: Point[][] = []) => ({
  id: "See-1",
  kind: "water" as const,
  outer,
  holes,
});
const scene = (blockers = [water()]) => ({
  ...emptyNetwork(),
  version: 2 as const,
  areaBlockers: blockers,
});

describe("water area blockers", () => {
  it("W01 fills a real concave lake contour and exposes its boundary", () => {
    const n = scene([
      water([
        { x: 0, y: 0 },
        { x: 12, y: 0 },
        { x: 12, y: 8 },
        { x: 8, y: 8 },
        { x: 8, y: 12 },
        { x: 0, y: 12 },
      ]),
    ]);
    const s = computeSurface(n);
    expect(areaSize(s)).toBeCloseTo(128, 6);
    expect(contains(s, { x: 2, y: 2 })).toBe(true);
    expect(contains(s, { x: 10, y: 10 })).toBe(false);
    expect(nearestBoundary(s, { x: 4, y: 4 })!.distance).toBeCloseTo(4, 6);
    expect(s.water!.areas).toHaveLength(1);
    expect(s.water!.drop).toBeGreaterThan(0);
    expect(s.roadAreas).toEqual([]);
  });
  it("W02 preserves an island as an actual unblocked hole", () => {
    const n = scene([
      water(rectangle(-20, -15, 20, 15), [rectangle(-5, -4, 5, 4)]),
    ]);
    const s = computeSurface(n);
    expect(areaSize(s)).toBeCloseTo(1120, 6);
    expect(contains(s, { x: 0, y: 0 })).toBe(false);
    expect(contains(s, { x: 10, y: 0 })).toBe(true);
    expect(s.areas[0].holes).toHaveLength(1);
    const edge = nearestBoundary(s, { x: 0, y: 0 })!;
    expect(edge.hole).toBe(true);
    expect(edge.distance).toBeCloseTo(4, 6);
  });
  it("W03 unions water and roads without double-counting or road-topology changes", () => {
    const road = straight();
    const n = { ...road, version: 2 as const, areaBlockers: [water()] };
    const before = JSON.stringify(n),
      s = computeSurface(n);
    expect(areaSize(s)).toBeCloseTo(520, 6);
    expect(areaSize({ ...s, areas: s.roadAreas! })).toBeCloseTo(240, 6);
    expect(areaSize({ ...s, areas: s.water!.areas })).toBeCloseTo(400, 6);
    expect(areaSize({ ...s, areas: s.water!.visibleAreas })).toBeCloseTo(
      280,
      6,
    );
    expect(s.conflicts).toEqual([]);
    expect(JSON.stringify(n)).toBe(before);
    for (let x = -19.7; x < 20; x += 2.1)
      for (let y = -12.3; y < 12; y += 1.7) {
        const p = { x, y },
          onRoad = contains({ ...s, areas: s.roadAreas! }, p),
          onWater = contains({ ...s, areas: s.water!.visibleAreas }, p);
        expect(onRoad && onWater).toBe(false);
        expect(contains(s, p)).toBe(onRoad || onWater);
      }
    expect(n.paths).toEqual(road.paths);
    expect(n.nodes).toEqual(road.nodes);
  });
  it("W04 a road across an island still blocks only its own footprint", () => {
    const n = {
      ...straight(),
      version: 2 as const,
      areaBlockers: [
        water(rectangle(-10, -10, 10, 10), [rectangle(-4, -4, 4, 4)]),
      ],
    };
    const s = computeSurface(n);
    expect(areaSize(s)).toBeCloseTo(504, 6);
    expect(contains(s, { x: 0, y: 0 })).toBe(true);
    expect(contains(s, { x: 0, y: 3.5 })).toBe(false);
    expect(contains(s, { x: 0, y: 8 })).toBe(true);
    expect(s.areas[0].holes).toHaveLength(2);
  });
  it("W05 overlapping lakes merge, separate lakes and ponds on islands remain separate", () => {
    const n = scene([
      water(),
      { ...water(rectangle(0, -10, 20, 10)), id: "See-2" },
    ]);
    const s = computeSurface(n);
    expect(areaSize(s)).toBeCloseTo(600, 6);
    expect(s.water!.areas).toHaveLength(1);
    const nested = computeSurface(
      scene([
        water(rectangle(-20, -20, 20, 20), [rectangle(-10, -10, 10, 10)]),
        { ...water(rectangle(-2, -2, 2, 2)), id: "Inselteich" },
        { ...water(rectangle(30, 0, 35, 5)), id: "See-3" },
      ]),
    );
    expect(areaSize(nested)).toBeCloseTo(1241, 6);
    expect(nested.areas).toHaveLength(3);
    expect(contains(nested, { x: 0, y: 0 })).toBe(true);
    expect(contains(nested, { x: 5, y: 5 })).toBe(false);
  });
  it("W06 graph JSON/history preserve water and linked widths; legacy roads still load", () => {
    const old = straight();
    expect(parse(serialize(old))).toEqual(old);
    const n = { ...old, version: 2 as const, areaBlockers: [water()] };
    n.paths[0].widthsLinked = true;
    const h = new History(n),
      changed = structuredClone(n);
    changed.areaBlockers[0].outer[0].x = -15;
    h.commit(changed);
    expect(areaSize(computeSurface(h.value))).not.toBe(
      areaSize(computeSurface(n)),
    );
    h.undo();
    expect(h.value).toEqual(n);
    h.redo();
    expect(h.value).toEqual(changed);
    const restored = parse(serialize(h.value));
    expect(restored).toEqual(changed);
    expect(computeSurface(restored)).toEqual(computeSurface(changed));
    expect(restored.paths[0].widthsLinked).toBe(true);
    expect(() => validate({ ...n, version: 1 })).toThrow();
  });
  it("W07 invalid water contours and islands are rejected rather than silently repaired", () => {
    const lake = water();
    const invalid: unknown[] = [
      null,
      {},
      { ...lake, kind: "unknown" },
      { ...lake, id: "" },
      { ...lake, outer: [] },
      { ...lake, outer: [lake.outer[0], lake.outer[1]] },
      { ...lake, outer: [{ x: NaN, y: 0 }, ...lake.outer.slice(1)] },
      { ...lake, outer: [{ x: Infinity, y: 0 }, ...lake.outer.slice(1)] },
      {
        ...lake,
        outer: [lake.outer[0], lake.outer[0], ...lake.outer.slice(1)],
      },
      {
        ...lake,
        outer: [
          { x: 0, y: 0 },
          { x: 1, y: 0 },
          { x: 2, y: 0 },
        ],
      },
      {
        ...lake,
        outer: [
          { x: -5, y: -5 },
          { x: 5, y: 5 },
          { x: -5, y: 5 },
          { x: 5, y: -5 },
        ],
      },
      { ...lake, holes: null },
      { ...lake, holes: [[]] },
      { ...lake, holes: [rectangle(8, 8, 12, 12)] },
      { ...lake, holes: [rectangle(-10, -2, -5, 2)] },
      { ...lake, holes: [rectangle(-5, -5, 5, 5), rectangle(0, 0, 7, 7)] },
      { ...lake, holes: [rectangle(-5, -5, 5, 5), rectangle(-2, -2, 2, 2)] },
    ];
    for (const bad of invalid) {
      const value = { ...emptyNetwork(), version: 2, areaBlockers: [bad] };
      expect(() => parse(JSON.stringify(value))).toThrow();
      expect(() => validate(value)).toThrow();
    }
    expect(() => validate({ ...scene(), areaBlockers: {} })).toThrow();
    expect(() => validate(scene([lake, lake]))).toThrow();
  });
  it("W08 reversed winding and rigid motion preserve the real water geometry", () => {
    const n = scene([
      water(rectangle(-20, -15, 20, 15), [rectangle(-5, -4, 5, 4)]),
    ]);
    const s = computeSurface(n),
      reversed = structuredClone(n);
    reversed.areaBlockers[0].outer.reverse();
    reversed.areaBlockers[0].holes.forEach((r) => r.reverse());
    expect(areaSize(computeSurface(reversed))).toBeCloseTo(areaSize(s), 6);
    const moved = structuredClone(n),
      angle = 0.73;
    const pose = (p: Point): Point => ({
      x: p.x * Math.cos(angle) - p.y * Math.sin(angle) + 7000,
      y: p.x * Math.sin(angle) + p.y * Math.cos(angle) + 9000,
    });
    moved.areaBlockers.forEach((a) => {
      a.outer = a.outer.map(pose);
      a.holes = a.holes.map((r) => r.map(pose));
    });
    const result = computeSurface(moved);
    expect(areaSize(result)).toBeCloseTo(areaSize(s), 5);
    expect(nearestBoundary(result, pose({ x: 0, y: 0 }))!.distance).toBeCloseTo(
      4,
      5,
    );
    expect(contains(result, pose({ x: 0, y: 0 }))).toBe(false);
  });
});
