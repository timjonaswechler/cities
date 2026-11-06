import { describe, expect, it, vi } from "vitest";
import { contourPoints, ringArea } from "../src/blockers";
import { type HouseArea, type HousePoint } from "../src/house-types";
import { houseGeometry } from "../src/houses";
import clipping, { type MultiPolygon, type Polygon } from "../src/overlay";
import { planPlots } from "../src/plots";
import type { BuildBlocker, PlannedPlot, PlotPlan } from "../src/plot-types";

function rectangle(x0: number, y0: number, x1: number, y1: number): HouseArea {
  return {
    outer: [
      { x: x0, y: y0 },
      { x: x1, y: y0 },
      { x: x1, y: y1 },
      { x: x0, y: y1 },
    ],
    holes: [],
  };
}
function plot(id = "site", area = rectangle(0, 0, 40, 30)): PlannedPlot {
  return { id, kind: "plot", seed: 42, ...area };
}
const blocker = (
  kind: BuildBlocker["kind"],
  ...areas: HouseArea[]
): BuildBlocker => ({ kind, areas });
const polygon = (area: HouseArea): Polygon =>
  [area.outer, ...area.holes].map((ring) => ring.map(({ x, y }) => [x, y]));
const envelope = (ring: HousePoint[]): Polygon => [
  ring.map(({ x, y }) => [x, y]),
];
const size = (area: HouseArea) =>
  Math.abs(ringArea(area.outer)) -
  area.holes.reduce((sum, hole) => sum + Math.abs(ringArea(hole)), 0);
function freeze<T>(value: T): T {
  if (value && typeof value === "object") {
    Object.values(value).forEach(freeze);
    Object.freeze(value);
  }
  return value;
}
function assertAccounting(plan: PlotPlan) {
  expect(plan.plannedArea).toBeCloseTo(size(plan.planned), 6);
  expect(plan.buildableArea).toBeCloseTo(
    plan.buildable.reduce((sum, area) => sum + size(area), 0),
    6,
  );
  expect(plan.excludedArea).toBeCloseTo(
    plan.excluded.reduce((sum, area) => sum + size(area), 0),
    6,
  );
  expect(plan.buildableArea + plan.excludedArea).toBeCloseTo(
    plan.plannedArea,
    5,
  );
  if (!plan.plannedArea) {
    expect(plan.buildable).toEqual([]);
    expect(plan.excluded).toEqual([]);
    return;
  }
  const buildable = plan.buildable.map(polygon),
    excluded = plan.excluded.map(polygon);
  expect(clipping.intersection(buildable, excluded)).toEqual([]);
  const missing = clipping.difference(
    polygon(plan.planned),
    clipping.union(buildable, excluded),
  );
  // Re-overlaying sampled oblique shared edges can leave 10 nm grid slivers.
  const missingArea = missing.reduce(
    (sum, rings) =>
      sum +
      rings.reduce(
        (area, ring, i) =>
          area +
          (i ? -1 : 1) * Math.abs(ringArea(ring.map(([x, y]) => ({ x, y })))),
        0,
      ),
    0,
  );
  expect(missingArea).toBeLessThan(1e-6);
}
function assertRoofs(plan: PlotPlan, blockers: BuildBlocker[]) {
  expect(plan.complex, plan.messages.join(" ")).toBeDefined();
  const allowed: MultiPolygon = plan.buildable.map(polygon),
    blocked = clipping.union(blockers.flatMap((b) => b.areas.map(polygon)));
  const volumes = plan.complex!.volumes;
  expect(volumes.filter((v) => v.role === "main")).toHaveLength(1);
  expect(new Set(volumes.map((v) => v.id)).size).toBe(volumes.length);
  expect(volumes.length).toBeLessThanOrEqual(4);
  for (const volume of volumes) {
    expect(volume.width).toBeGreaterThan(0);
    expect(volume.depth).toBeGreaterThan(0);
    expect(volume.angle).toBe(volumes[0].angle);
    expect(volume.ridge).toBe(volumes[0].ridge);
    const geometry = houseGeometry(volume);
    for (const ring of [geometry.footprint, geometry.roof]) {
      const envelope: Polygon = [ring.map(({ x, y }) => [x, y])];
      expect(clipping.difference(envelope, polygon(plan.planned))).toEqual([]);
      expect(clipping.difference(envelope, allowed)).toEqual([]);
      expect(clipping.intersection(envelope, blocked)).toEqual([]);
      // A whole volume belongs to one component, never a road-spanning union.
      expect(
        allowed.some((part) => !clipping.difference(envelope, part).length),
      ).toBe(true);
    }
  }
}

describe("pure plot planning", () => {
  it("builds a coherent main body and attached lower wing without manual road access", () => {
    const [plan] = planPlots([plot()], []);
    expect(plan.complex!.id).toBe("complex-site");
    expect(plan.complex!.volumes.map((v) => v.role)).toEqual(["main", "wing"]);
    const [main, wing] = plan.complex!.volumes;
    expect(main.storeys).toBe(2);
    expect(wing.storeys).toBe(1);
    expect(houseGeometry(wing).eaveHeight).toBeLessThan(
      houseGeometry(main).eaveHeight,
    );
    expect(houseGeometry(wing).ridgeHeight).toBeLessThan(
      houseGeometry(main).ridgeHeight,
    );
    const footprint = (v: typeof main): Polygon => [
      houseGeometry(v).footprint.map(({ x, y }) => [x, y]),
    ];
    expect(clipping.intersection(footprint(main), footprint(wing))).not.toEqual(
      [],
    );
    expect(main.width).toBeGreaterThan(8); // Not restricted to old fixed profiles.
    assertAccounting(plan);
    assertRoofs(plan, []);
  });

  it("subtracts the real contour, retaining concavity rather than using its bounding box", () => {
    const site = plot("concave", {
      outer: [
        { x: 0, y: 0 },
        { x: 40, y: 0 },
        { x: 40, y: 16 },
        { x: 18, y: 16 },
        { x: 18, y: 40 },
        { x: 0, y: 40 },
      ],
      holes: [],
    });
    const blockers = [blocker("road", rectangle(8, -10, 12, 50))],
      [plan] = planPlots([site], blockers);
    expect(plan.planned.outer).toEqual(site.outer);
    expect(plan.plannedArea).toBe(1072);
    expect(plan.excludedArea).toBe(160);
    expect(plan.buildableArea).toBe(912);
    expect(plan.buildable).toHaveLength(2);
    assertAccounting(plan);
    assertRoofs(plan, blockers);
  });

  it("keeps road-split parts and coordinates volumes on both under one complex", () => {
    const blockers = [blocker("road", rectangle(28, -10, 32, 40))],
      plans = planPlots([plot("split", rectangle(0, 0, 60, 30))], blockers),
      [plan] = plans;
    expect(plans).toHaveLength(1);
    expect(plan.buildable).toHaveLength(2);
    expect(plan.buildableArea).toBe(1680);
    expect(plan.excludedArea).toBe(120);
    expect(plan.complex!.volumes.some((v) => v.role === "outbuilding")).toBe(
      true,
    );
    for (const part of plan.buildable)
      expect(
        plan.complex!.volumes.some(
          (v) =>
            !clipping.difference(envelope(houseGeometry(v).roof), polygon(part))
              .length,
        ),
      ).toBe(true);
    assertAccounting(plan);
    assertRoofs(plan, blockers);
  });

  it("unions crossing river and roads without double-counting their shared area", () => {
    const blockers = [
      blocker("road", rectangle(18, -10, 22, 50), rectangle(18, -10, 22, 50)),
      blocker("water", rectangle(-10, 18, 50, 22)),
    ];
    const [plan] = planPlots(
      [plot("cross", rectangle(0, 0, 40, 40))],
      blockers,
    );
    expect(plan.buildable).toHaveLength(4);
    expect(plan.excludedArea).toBe(160 + 160 - 16);
    expect(plan.buildableArea).toBe(1296);
    assertAccounting(plan);
    assertRoofs(plan, blockers);
  });

  it("preserves site holes and dry islands inside a water blocker", () => {
    const site = plot("island", {
      ...rectangle(0, 0, 40, 40),
      holes: [rectangle(17, 17, 23, 23).outer],
    });
    const blockers = [
        blocker("water", {
          ...rectangle(-5, -5, 45, 45),
          holes: [rectangle(3, 3, 37, 37).outer],
        }),
      ],
      [plan] = planPlots([site], blockers);
    expect(plan.plannedArea).toBe(1564);
    expect(plan.buildableArea).toBe(1120);
    expect(plan.excludedArea).toBe(444);
    expect(plan.buildable).toHaveLength(1);
    expect(plan.buildable[0].holes).toHaveLength(1);
    assertAccounting(plan);
    assertRoofs(plan, blockers);
  });

  it.each(["road", "water"] as const)(
    "rejects all old envelopes with tiny enclosed %s obstacles, not just blocked corners",
    (kind) => {
      const site = plot("tiny-obstacles", rectangle(0, 0, 60, 30)),
        road = blocker("road", rectangle(28, -10, 32, 40)),
        [before] = planPlots([site], [road]),
        obstacles = before.complex!.volumes.map((v) =>
          rectangle(
            v.center.x - 0.0001,
            v.center.y - 0.0001,
            v.center.x + 0.0001,
            v.center.y + 0.0001,
          ),
        );
      for (const [i, volume] of before.complex!.volumes.entries()) {
        const center = volume.center;
        expect(
          houseGeometry(volume).roof.every(
            (p) => Math.hypot(p.x - center.x, p.y - center.y) > 1,
          ),
        ).toBe(true);
        expect(
          clipping.intersection(
            envelope(houseGeometry(volume).roof),
            polygon(obstacles[i]),
          ),
        ).not.toEqual([]);
      }
      const blockers = [road, blocker(kind, ...obstacles)],
        [after] = planPlots([site], blockers);
      expect(after.complex).not.toEqual(before.complex);
      assertAccounting(after);
      assertRoofs(after, blockers);
    },
  );

  it("samples curved source and hole edges before subtraction and roof fitting", () => {
    const site = plot("curved", {
      ...rectangle(0, 0, 40, 28),
      holes: [rectangle(10, 10, 18, 18).outer],
    });
    site.outerEdges = [
      { kind: "quadratic", control: { x: 20, y: -12 } },
      { kind: "line" },
      { kind: "line" },
      { kind: "line" },
    ];
    site.holeEdges = [
      [
        { kind: "quadratic", control: { x: 14, y: 6 } },
        { kind: "line" },
        { kind: "line" },
        { kind: "line" },
      ],
    ];
    const blockers = [blocker("road", rectangle(18, -10, 22, 40))],
      [plan] = planPlots([site], blockers);
    expect(plan.planned.outer).toEqual(
      contourPoints(site.outer, site.outerEdges),
    );
    expect(plan.planned.holes[0]).toEqual(
      contourPoints(site.holes![0], site.holeEdges[0]),
    );
    expect(plan.plannedArea).toBeCloseTo(1205.3333, 1);
    expect(plan.excludedArea).toBeCloseTo(135.92, 2);
    assertAccounting(plan);
    assertRoofs(plan, blockers);
  });

  it("returns explicit reasons for empty, zero-area, tiny, and fully blocked sites", () => {
    expect(planPlots([], [])).toEqual([]);
    const sites = [
      plot("empty", { outer: [], holes: [] }),
      plot("zero", {
        outer: [
          { x: 0, y: 0 },
          { x: 5, y: 0 },
          { x: 10, y: 0 },
        ],
        holes: [],
      }),
      plot("tiny", rectangle(20, 0, 21, 1)),
      plot("covered", rectangle(30, 0, 50, 20)),
    ];
    const plans = planPlots(sites, [
      blocker("water", rectangle(30, 0, 50, 20)),
    ]);
    for (const plan of plans) {
      expect(plan.complex).toBeUndefined();
      expect(plan.messages.length).toBeGreaterThan(0);
      assertAccounting(plan);
    }
    expect(plans[0].messages.join()).toContain("keine positive Fläche");
    expect(plans[1].messages.join()).toContain("keine positive Fläche");
    expect(plans[2].messages.join()).toContain("Keine passende Dachhülle");
    expect(plans[3].messages.join()).toContain("vollständig");
  });

  it("fits a small main alone and rejects a roomy bounding box with only narrow arms", () => {
    const [small] = planPlots([plot("small", rectangle(0, 0, 5.8, 5.8))], []);
    expect(small.complex!.volumes.map((v) => v.role)).toEqual(["main"]);
    assertRoofs(small, []);
    const narrow = plot("narrow", {
      outer: [
        { x: 0, y: 0 },
        { x: 40, y: 0 },
        { x: 40, y: 40 },
        { x: 38, y: 40 },
        { x: 38, y: 2 },
        { x: 2, y: 2 },
        { x: 2, y: 40 },
        { x: 0, y: 40 },
      ],
      holes: [],
    });
    const difference = vi.spyOn(clipping, "difference"),
      intersection = vi.spyOn(clipping, "intersection");
    try {
      const [rejected] = planPlots([narrow], []);
      expect(rejected.buildableArea).toBe(232);
      expect(rejected.complex).toBeUndefined();
      expect(rejected.messages.join()).toContain("Keine passende Dachhülle");
      // One setup operation of each kind plus at most 176 roof tests.
      expect(difference.mock.calls.length).toBeLessThanOrEqual(177);
      expect(intersection.mock.calls.length).toBeLessThanOrEqual(177);
    } finally {
      difference.mockRestore();
      intersection.mockRestore();
    }
  });

  it("is seeded, deterministic and does not mutate or alias source data", () => {
    const sites = freeze([plot("seeded", rectangle(0, 0, 26, 22))]),
      blockers = freeze([blocker("water", rectangle(0, 0, 2, 2))]),
      input = structuredClone({ sites, blockers }),
      first = planPlots(sites, blockers);
    expect(planPlots(sites, blockers)).toEqual(first);
    expect(
      planPlots([{ ...sites[0], seed: 43 }], blockers)[0].complex,
    ).not.toEqual(first[0].complex);
    assertRoofs(first[0], blockers);
    first[0].planned.outer[0].x = 999;
    first[0].buildable[0].outer[0].x = 999;
    expect({ sites, blockers }).toEqual(input);
  });

  it("rejects both positively overlapping planned sites, even when overlap is blocked", () => {
    const sites = [
        plot("A", rectangle(0, 0, 30, 24)),
        plot("B", rectangle(20, 0, 50, 24)),
        plot("C", rectangle(50, 0, 80, 24)),
      ],
      blockers = [blocker("road", rectangle(20, -10, 30, 34))],
      plans = planPlots(sites, blockers);
    for (const plan of plans.slice(0, 2)) {
      expect(plan.complex).toBeUndefined();
      expect(plan.plannedArea).toBe(720);
      expect(plan.buildableArea).toBe(480);
      expect(plan.excludedArea).toBe(240);
      expect(plan.messages.join()).toContain("Konflikt");
      assertAccounting(plan);
    }
    expect(plans[0].messages.join()).toContain("B");
    expect(plans[1].messages.join()).toContain("A");
    assertRoofs(plans[2], blockers);
    const reversed = planPlots([...sites].reverse(), blockers).reverse();
    expect(reversed).toEqual(plans);
  });

  it("does not mistake shared edges or a plot inside another site's hole for overlap", () => {
    const sites = [
      plot("ring", {
        ...rectangle(0, 0, 50, 50),
        holes: [rectangle(10, 10, 40, 40).outer],
      }),
      plot("inside-hole", rectangle(15, 15, 35, 35)),
      plot("adjacent", rectangle(50, 0, 70, 50)),
    ];
    for (const plan of planPlots(sites, [])) {
      expect(plan.messages.join()).not.toContain("Konflikt");
      assertAccounting(plan);
      assertRoofs(plan, []);
    }
  });

  it("keeps roof fitting valid after a rigid rotation and translation", () => {
    const angle = 0.63,
      pose = ({ x, y }: HousePoint): HousePoint => ({
        x: Math.cos(angle) * x - Math.sin(angle) * y + 7000,
        y: Math.sin(angle) * x + Math.cos(angle) * y - 9000,
      }),
      site = plot("rotated", rectangle(0, 0, 60, 30)),
      blockers = [blocker("road", rectangle(28, -10, 32, 40))];
    site.outer = site.outer.map(pose);
    blockers[0].areas[0].outer = blockers[0].areas[0].outer.map(pose);
    const [plan] = planPlots([site], blockers);
    expect(plan.buildable).toHaveLength(2);
    expect(plan.buildableArea).toBeCloseTo(1680, 5);
    assertAccounting(plan);
    assertRoofs(plan, blockers);
  });
});
