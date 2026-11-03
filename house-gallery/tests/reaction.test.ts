import { describe, expect, it } from "vitest";
import { CATALOG, buildScenario } from "../src/scenarios";
import { generateHouse } from "../src/generator";
import { rect, ribbon } from "../src/geometry";
import type { Scenario } from "../src/model";

const base = (): Scenario =>
  buildScenario(
    CATALOG.find(
      (s) =>
        s.group === "streets" &&
        s.motif === "straight" &&
        s.widths === "r3" &&
        s.neighbors === "none" &&
        s.side === 0,
    )!,
  );
describe("environment reactions with unchanged ID and unchanged seed", () => {
  for (const kind of [
    "blocker",
    "water",
    "square",
    "buildArea",
    "road-width",
  ] as const)
    it("reacts to changed " + kind + ", not to another random roll", () => {
      const scenario = base(),
        first = generateHouse(scenario, 42, "cottage");
      expect(first.ok).toBe(true);
      if (!first.ok) return;
      const changed = structuredClone(scenario),
        center = first.house.center;
      if (kind === "blocker")
        changed.blockers.push({
          center,
          width: 12,
          depth: 14,
          height: 6,
          angle: first.house.angle,
        });
      if (kind === "water" || kind === "square")
        changed.surfaces.push({
          id: "new-keepout",
          kind,
          polygons: [rect(center, 12, 14)],
          ...(kind === "water" ? { drop: 1.4 } : {}),
        });
      if (kind === "buildArea")
        changed.buildArea = rect({ x: -8, z: 5 }, 9, 10);
      if (kind === "road-width") {
        const road = changed.surfaces[0];
        road.widths = road.widths!.map(() => 12);
        road.polygons = ribbon(road.centerline!, road.widths);
      }
      expect(changed.spec.id).toBe(scenario.spec.id);
      const after = generateHouse(changed, 42, "cottage");
      expect(
        after.ok ? JSON.stringify(after.house.envelopes) : "rejected",
      ).not.toBe(JSON.stringify(first.house.envelopes));
      expect(generateHouse(changed, 42, "cottage")).toEqual(after);
    });
  it("rejects invalid seeds without looping and accepts both unsigned boundaries", () => {
    for (const seed of [-1, NaN, Infinity, 1.2, 4294967296])
      expect(generateHouse(base(), seed).ok).toBe(false);
    for (const seed of [0, 4294967295])
      expect(generateHouse(base(), seed).ok).toBe(true);
  });
});
