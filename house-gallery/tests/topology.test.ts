import { describe, expect, it } from "vitest";
import { CATALOG, GROUPS, buildScenario } from "../src/scenarios";
import type { Scenario } from "../src/model";
import { contains, overlaps } from "../src/geometry";
import {
  armGaps,
  centerlines,
  geometryWidths,
  headingDifference,
  intersections,
  network,
  pointLineDistance,
  turns,
} from "./topology";
import type { Line } from "./topology";

const PIN = {
  straight: "streets~straight~r3~0~0~1~none~none",
  left: "streets~curve-left-wide~r3~0~0~1~none~none",
  right: "streets~curve-right-wide~r3~0~0~1~none~none",
  s: "streets~s-left~r3~0~0~1~none~none",
  t: "junctions~t~r3~0~0~1~none~none",
  y: "junctions~y~r3~0~0~1~none~none",
  cross: "junctions~cross~r3~0~0~1~none~none",
  deadend: "deadends~plain~r3~0~0~1~none~none",
  parallel: "road-water~parallel~r3+w3~0~0.6~1~none~none",
  bridge: "road-water~bridge~r3+w3~0~0.6~1~none~none",
};
function byId(id: string): Scenario {
  const spec = CATALOG.find((s) => s.id === id);
  if (!spec) throw Error("Pinned case missing: " + id);
  return buildScenario(spec);
}
function assertLine(line: Line, kind: string): void {
  const angles = turns(line),
    total = angles.reduce((a, b) => a + b, 0);
  if (kind === "straight") {
    expect(angles.every((a) => Math.abs(a) < 1e-6)).toBe(true);
    return;
  }
  const sign = kind.includes("right") ? -1 : 1;
  if (kind.startsWith("s-")) {
    expect(angles.some((a) => a > 0.01) && angles.some((a) => a < -0.01)).toBe(
      true,
    );
    const half = Math.floor(angles.length / 2);
    expect(
      angles.slice(0, half).reduce((a, b) => a + b, 0) * sign,
    ).toBeGreaterThan(0.1);
    expect(angles.slice(half).reduce((a, b) => a + b, 0) * sign).toBeLessThan(
      -0.1,
    );
  } else if (kind.startsWith("corner")) {
    expect(angles).toHaveLength(1);
    expect((total * sign * 180) / Math.PI).toBeCloseTo(
      kind.endsWith("45") ? 45 : 90,
      4,
    );
  } else {
    expect(angles.length).toBeGreaterThan(3);
    expect(angles.every((a) => a * sign > 0)).toBe(true);
    if (kind.startsWith("hairpin"))
      expect((Math.abs(total) * 180) / Math.PI).toBeGreaterThan(180);
    else expect((Math.abs(total) * 180) / Math.PI).toBeGreaterThan(90);
  }
}
function assertKnot(lines: Line[], kind: string): void {
  const graph = network(lines),
    branches = graph.nodes.filter((n) => n.degree >= 3);
  expect(graph.components).toBe(1);
  if (kind === "roundabout") {
    expect(graph.cycles).toBe(1);
    expect(branches.map((n) => n.degree).sort()).toEqual([3, 3, 3]);
    expect(graph.nodes.filter((n) => n.degree === 1)).toHaveLength(3);
    return;
  }
  expect(graph.cycles).toBe(0);
  if (kind === "offset") {
    expect(branches.map((n) => n.degree).sort()).toEqual([3, 3]);
    expect(graph.nodes.filter((n) => n.degree === 1)).toHaveLength(4);
    return;
  }
  const arms =
    kind === "five" ? 5 : kind === "six" ? 6 : kind.startsWith("cross") ? 4 : 3;
  expect(branches).toHaveLength(1);
  expect(branches[0].degree).toBe(arms);
  expect(graph.nodes.filter((n) => n.degree === 1)).toHaveLength(arms);
  const gaps = armGaps(branches[0].directions);
  if (kind === "t" || kind === "t-skew")
    expect(gaps.some((a) => Math.abs(a - 180) < 1e-3)).toBe(true);
  if (kind === "y")
    expect(gaps.every((a) => Math.abs(a - 120) < 1e-3)).toBe(true);
  if (kind === "y-skew")
    expect(gaps.every((a) => Math.abs(a - 120) < 1e-3)).toBe(false);
  if (kind === "cross")
    expect(gaps.every((a) => Math.abs(a - 90) < 1e-3)).toBe(true);
  if (kind === "cross-skew")
    expect(gaps.every((a) => Math.abs(a - 90) < 1e-3)).toBe(false);
}
function assertDeadend(scenario: Scenario, kind: string): void {
  const routes = centerlines(scenario.surfaces, ["road", "path"]),
    graph = network(routes);
  const interiorEnds = graph.nodes.filter(
    (n) =>
      n.degree === 1 && Math.abs(n.point.x) < 22 && Math.abs(n.point.z) < 22,
  );
  expect(graph.components).toBe(1);
  expect(graph.cycles).toBe(0);
  expect(interiorEnds).toHaveLength(kind === "hammer" ? 2 : 1);
  expect(graph.nodes.filter((n) => n.degree >= 3)).toHaveLength(
    kind === "hammer" ? 1 : 0,
  );
  if (kind === "court") {
    const square = scenario.surfaces
      .filter((s) => s.kind === "square")
      .flatMap((s) => s.polygons);
    const road = scenario.surfaces
      .filter((s) => s.kind === "road" || s.kind === "path")
      .flatMap((s) => s.polygons);
    expect(square.some((a) => road.some((b) => overlaps(a, b)))).toBe(true);
  }
  if (kind === "plain" || kind === "bulb") {
    const line = routes[0],
      end = line.at(-1)!,
      before = line.at(-2)!;
    const dx = end.x - before.x,
      dz = end.z - before.z,
      length = Math.hypot(dx, dz);
    const extent = Math.max(
      ...scenario.surfaces
        .filter((s) => s.kind === "road" || s.kind === "path")
        .flatMap((s) => s.polygons.flat())
        .map((p) => ((p.x - end.x) * dx + (p.z - end.z) * dz) / length),
    );
    const width = scenario.surfaces[0].widths!.at(-1)!;
    if (kind === "bulb") expect(extent / width).toBeGreaterThan(0.9);
    else expect(extent / width).toBeCloseTo(0.5, 4);
  }
}
function assertCombination(scenario: Scenario, kind: string): void {
  const routes = centerlines(scenario.surfaces, ["road", "path"]),
    water = centerlines(scenario.surfaces, ["water"]);
  const crossings = intersections(routes, water);
  if (kind === "parallel" || kind === "converging") {
    expect(crossings).toHaveLength(0);
    if (kind === "parallel")
      expect(headingDifference(routes[0], water[0])).toBeLessThan(1e-6);
    else {
      expect(headingDifference(routes[0], water[0])).toBeGreaterThan(0.01);
      expect(pointLineDistance(routes[0][0], water[0])).toBeGreaterThan(
        pointLineDistance(routes[0].at(-1)!, water[0]) + 1,
      );
    }
  } else if (["bridge", "skew-bridge", "bend-bridge"].includes(kind)) {
    expect(crossings).toHaveLength(1);
    if (kind === "bridge")
      expect(headingDifference(routes[0], water[0])).toBeCloseTo(1, 5);
    if (kind === "skew-bridge") {
      expect(headingDifference(routes[0], water[0])).toBeGreaterThan(0.1);
      expect(headingDifference(routes[0], water[0])).toBeLessThan(0.99);
    }
    if (kind === "bend-bridge")
      expect(turns(routes[0]).some((a) => Math.abs(a) > 0.1)).toBe(true);
  } else if (kind === "bridgehead") {
    expect(crossings).toHaveLength(1);
    expect(network(routes).nodes.filter((n) => n.degree === 3)).toHaveLength(1);
    expect(network(routes).components).toBe(1);
  } else if (kind === "quay-end") {
    expect(crossings).toHaveLength(0);
    expect(
      network(routes).nodes.filter(
        (n) =>
          n.degree === 1 &&
          Math.abs(n.point.x) < 22 &&
          Math.abs(n.point.z) < 22,
      ),
    ).toHaveLength(1);
    const roadPolygons = scenario.surfaces
      .filter((s) => s.kind === "road" || s.kind === "path")
      .flatMap((s) => s.polygons);
    const waterPolygons = scenario.surfaces
      .filter((s) => s.kind === "water")
      .flatMap((s) => s.polygons);
    expect(
      roadPolygons.every((a) => waterPolygons.every((b) => !overlaps(a, b))),
    ).toBe(true);
  } else if (kind === "tributary") {
    expect(network(water).nodes.filter((n) => n.degree === 3)).toHaveLength(1);
    expect(crossings).toHaveLength(1);
  }
}
function assertMixed(scenario: Scenario, kind: string): void {
  const roads = centerlines(scenario.surfaces, ["road"]),
    paths = centerlines(scenario.surfaces, ["path"]),
    water = centerlines(scenario.surfaces, ["water"]);
  expect(roads.length > 0 && paths.length > 0 && water.length > 0).toBe(true);
  const graph = network([...roads, ...paths]);
  if (kind === "island-access") {
    expect(network(water).cycles).toBe(1);
    expect(graph.components).toBe(2);
    expect(intersections(roads, water)).toHaveLength(1);
    expect(intersections(paths, water)).toHaveLength(1);
  } else if (kind === "market-water") {
    expect(graph.components).toBe(2);
    expect(intersections([...roads, ...paths], water)).toHaveLength(0);
    expect(headingDifference(roads[0], water[0])).toBeLessThan(1e-6);
    expect(headingDifference(paths[0], water[0])).toBeLessThan(1e-6);
    const square = scenario.surfaces.find((s) => s.kind === "square")!;
    expect(
      square.polygons
        .flat()
        .every(
          (p) =>
            !scenario.surfaces
              .filter((s) => s.kind !== "square")
              .some((s) => s.polygons.some((poly) => contains(p, poly))),
        ),
    ).toBe(true);
  } else {
    expect(graph.components).toBe(1);
    if (kind === "t-bridge") {
      expect(network(roads).nodes.filter((n) => n.degree === 3)).toHaveLength(
        1,
      );
      expect(intersections(roads, water)).toHaveLength(1);
    }
    if (kind === "cross-bridge") {
      expect(network(roads).nodes.filter((n) => n.degree === 4)).toHaveLength(
        1,
      );
      expect(intersections([...roads, ...paths], water)).toHaveLength(2);
    }
    if (kind === "court-water") {
      expect(intersections([...roads, ...paths], water)).toHaveLength(0);
      const square = scenario.surfaces.find(
        (s) => s.kind === "square",
      )!.polygons;
      expect(square.some((poly) => contains(paths[0].at(-1)!, poly))).toBe(
        true,
      );
    }
    if (kind === "canal-corner") {
      expect(turns(water[0]).some((a) => Math.abs(a) > 1)).toBe(true);
      expect(intersections(roads, water)).toHaveLength(1);
    }
  }
}

describe("geometry-derived topology, not titles or declared arm counts", () => {
  for (const group of ["streets", "paths"])
    for (const motif of GROUPS.find((g) => g.id === group)!.motifs)
      it(group + "/" + motif.id + ": signed shape contract", () => {
        const id = `${group}~${motif.id}~${group === "streets" ? "r3" : "p1.5"}~0~0~1~none~none`;
        assertLine(
          centerlines(byId(id).surfaces, ["road", "path"])[0],
          motif.id,
        );
      });
  for (const motif of GROUPS.find((g) => g.id === "junctions")!.motifs)
    it(
      "junction/" +
        motif.id +
        ": actual branches, connectivity and angle classes at every width",
      () => {
        for (const spec of CATALOG.filter(
          (s) =>
            s.group === "junctions" &&
            s.motif === motif.id &&
            s.side === 0 &&
            s.neighbors === "none",
        ))
          assertKnot(
            centerlines(buildScenario(spec).surfaces, ["road"]),
            motif.id,
          );
      },
    );
  for (const motif of GROUPS.find((g) => g.id === "deadends")!.motifs)
    it("deadend/" + motif.id + ": real terminal and access", () => {
      for (const spec of CATALOG.filter(
        (s) =>
          s.group === "deadends" &&
          s.motif === motif.id &&
          s.side === 0 &&
          s.neighbors === "none",
      ))
        assertDeadend(buildScenario(spec), motif.id);
    });
  for (const group of ["road-water", "path-water"])
    for (const motif of GROUPS.find((g) => g.id === group)!.motifs)
      it(
        group +
          "/" +
          motif.id +
          ": intersections versus parallel routes at every width pair",
        () => {
          for (const spec of CATALOG.filter(
            (s) =>
              s.group === group &&
              s.motif === motif.id &&
              s.side === 0 &&
              s.neighbors === "none" &&
              s.waterDrop === 0.6,
          ))
            assertCombination(buildScenario(spec), motif.id);
        },
      );
  for (const motif of GROUPS.find((g) => g.id === "mixed")!.motifs)
    it(
      "mixed/" +
        motif.id +
        ": all three systems connect as intended at every width pair",
      () => {
        for (const spec of CATALOG.filter(
          (s) =>
            s.group === "mixed" &&
            s.motif === motif.id &&
            s.side === 0 &&
            s.neighbors === "none" &&
            s.waterDrop === 0.6,
        ))
          assertMixed(buildScenario(spec), motif.id);
      },
    );
  it("water curves, canal bend, fork, and connected channels have their promised topology", () => {
    for (const motif of [
      "straight",
      "curve-left-wide",
      "curve-right-wide",
      "curve-left-tight",
      "curve-right-tight",
      "s-left",
      "s-right",
    ]) {
      const scenario = byId(`waterways~${motif}~w3~0~0.6~1~none~none`);
      assertLine(centerlines(scenario.surfaces, ["water"])[0], motif);
    }
    const canal = centerlines(
      byId("waterways~canal~w3~0~0.6~1~none~none").surfaces,
      ["water"],
    )[0];
    expect((turns(canal)[0] * 180) / Math.PI).toBeCloseTo(90, 5);
    for (const [motif, degree] of [
      ["fork", 3],
      ["channels", 4],
    ] as const) {
      const graph = network(
        centerlines(byId(`waterways~${motif}~w3~0~0.6~1~none~none`).surfaces, [
          "water",
        ]),
      );
      expect(graph.components).toBe(1);
      expect(
        graph.nodes.filter((n) => n.degree >= 3).map((n) => n.degree),
      ).toEqual([degree]);
    }
  });
  it("tight/wide curve radii differ geometrically and reflection reverses signed curvature", () => {
    const radius = (points: Line) => {
      const [a, b, c] = points;
      const ab = Math.hypot(b.x - a.x, b.z - a.z),
        bc = Math.hypot(c.x - b.x, c.z - b.z),
        ac = Math.hypot(c.x - a.x, c.z - a.z);
      return (
        (ab * bc * ac) /
        (2 * Math.abs((b.x - a.x) * (c.z - a.z) - (b.z - a.z) * (c.x - a.x)))
      );
    };
    for (const [kind, expected] of [
      ["wide", 20],
      ["tight", 10],
    ] as const) {
      const line = centerlines(
        byId(`streets~curve-left-${kind}~r3~0~0~1~none~none`).surfaces,
        ["road"],
      )[0];
      const reflected = centerlines(
        byId(`streets~curve-left-${kind}~r3~1~0~1~none~none`).surfaces,
        ["road"],
      )[0];
      expect(radius(line)).toBeCloseTo(expected, 5);
      expect(turns(line).reduce((a, b) => a + b, 0)).toBeGreaterThan(0);
      expect(turns(reflected).reduce((a, b) => a + b, 0)).toBeLessThan(0);
    }
  });
  it("all catalog centerline widths correspond to actual polygon cross-sections, including junctions and mixed", () => {
    for (const spec of CATALOG) {
      const scenario = buildScenario(spec);
      for (const surface of scenario.surfaces) {
        if (!surface.centerline || !surface.widths) continue;
        const measured = geometryWidths(surface);
        measured.forEach(([start, end], i) => {
          expect(start, spec.id + "/" + surface.id).toBeCloseTo(
            surface.widths![i],
            5,
          );
          expect(end, spec.id + "/" + surface.id).toBeCloseTo(
            surface.widths![i + 1],
            5,
          );
        });
        const prefix =
          surface.kind === "road" ? "r" : surface.kind === "path" ? "p" : "w";
        const token = spec.widths.split("/").find((w) => w.startsWith(prefix));
        if (
          token &&
          !(spec.group === "deadends" && surface.id !== scenario.surfaces[0].id)
        ) {
          const dimensions = token.slice(1).split("-").map(Number),
            end = dimensions[1] ?? dimensions[0];
          const first = measured[0][0],
            last = measured.at(-1)![1];
          if (spec.group === "junctions")
            expect(
              [dimensions[0], end].some((w) => Math.abs(w - first) < 1e-5),
            ).toBe(true);
          else expect(first, spec.id).toBeCloseTo(dimensions[0], 5);
          expect(last, spec.id).toBeCloseTo(end, 5);
        }
        if (spec.group === "mixed" && surface.kind === "path") {
          expect(measured[0][0]).toBeCloseTo(1.8, 5);
          expect(measured.at(-1)![1]).toBeCloseTo(2.8, 5);
        }
      }
    }
  });
  it("mutation controls reject wrong shapes, branch counts, through-roads, crossings, and fabricated width metadata", () => {
    const line = (id: string) =>
      centerlines(byId(id).surfaces, ["road", "path"])[0];
    expect(() => assertLine(line(PIN.left), "straight")).toThrow();
    expect(() => assertLine(line(PIN.right), "curve-left-wide")).toThrow();
    expect(() => assertLine(line(PIN.left), "s-left")).toThrow();
    expect(() => assertKnot([line(PIN.straight)], "t")).toThrow();
    expect(() =>
      assertKnot(centerlines(byId(PIN.cross).surfaces, ["road"]), "y"),
    ).toThrow();
    expect(() =>
      assertKnot(centerlines(byId(PIN.t).surfaces, ["road"]), "cross"),
    ).toThrow();
    expect(() => assertDeadend(byId(PIN.straight), "plain")).toThrow();
    expect(() => assertCombination(byId(PIN.bridge), "parallel")).toThrow();
    expect(() => assertCombination(byId(PIN.parallel), "bridge")).toThrow();
    const fabricated = structuredClone(byId(PIN.deadend).surfaces[0]);
    fabricated.centerline![1].x += 5;
    expect(() => geometryWidths(fabricated)).toThrow();
    const metadata = structuredClone(byId(PIN.straight).surfaces[0]);
    metadata.widths = metadata.widths!.map((w) => w * 2);
    expect(geometryWidths(metadata)[0][0]).not.toBe(metadata.widths[0]);
  });
});
