import { afterAll, describe, expect, it } from "vitest";
import { mkdirSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { CATALOG, GROUPS, buildScenario } from "../src/scenarios";
import { generateHouse, CLEARANCE } from "../src/generator";
import { contains, rect, separated } from "../src/geometry";
import type { Polygon, Scenario } from "../src/model";
import { EXPECTED_COUNTS, REPRESENTATIVES, SEEDS } from "./fixtures";

const summary: Record<string, unknown> = {};
const finite = (polygon: Polygon) =>
  polygon.length >= 3 &&
  polygon.every((p) => Number.isFinite(p.x) && Number.isFinite(p.z));
function convex(polygon: Polygon): boolean {
  const signs = polygon
    .map((a, i) => {
      const b = polygon[(i + 1) % polygon.length],
        c = polygon[(i + 2) % polygon.length];
      return Math.sign((b.x - a.x) * (c.z - b.z) - (b.z - a.z) * (c.x - b.x));
    })
    .filter(Boolean);
  return signs.every((s) => s === signs[0]);
}
function verifyPlacement(
  scenario: Scenario,
  envelopes: Polygon[],
  height: number,
): string[] {
  const failures: string[] = [];
  if (!(Number.isFinite(height) && height > 0 && height <= scenario.maxHeight))
    failures.push("height");
  for (const envelope of envelopes) {
    if (
      !finite(envelope) ||
      !envelope.every((p) => contains(p, scenario.buildArea))
    )
      failures.push("envelope outside area");
    for (const surface of scenario.surfaces)
      for (const polygon of surface.polygons) {
        if (!separated(envelope, polygon, CLEARANCE[surface.kind]))
          failures.push("surface collision: " + surface.id);
      }
    for (const b of scenario.blockers)
      if (
        !separated(
          envelope,
          rect(b.center, b.width, b.depth, b.angle),
          CLEARANCE.blocker,
        )
      )
        failures.push("blocker collision");
  }
  return failures;
}
afterAll(() => {
  mkdirSync("test-results", { recursive: true });
  writeFileSync(
    "test-results/matrix-summary.json",
    JSON.stringify(
      {
        catalogCount: CATALOG.length,
        seeds: SEEDS,
        matrixSeed: 42,
        catalogIdSha256: createHash("sha256")
          .update(CATALOG.map((s) => s.id).join("\n"))
          .digest("hex"),
        groups: summary,
      },
      null,
      2,
    ),
  );
});
describe("frozen finite catalog", () => {
  it("contains exactly the complete product of all frozen axes and stable unique IDs", () => {
    expect(CATALOG).toHaveLength(9136);
    expect(
      createHash("sha256")
        .update(CATALOG.map((s) => s.id).join("\n"))
        .digest("hex"),
    ).toBe("36795df925cee09365ce22aa2f94d8186c05fd1d7b6044215a649a87c258c7a3");
    expect(new Set(CATALOG.map((s) => s.id)).size).toBe(CATALOG.length);
    for (const group of GROUPS) {
      const entries = CATALOG.filter((s) => s.group === group.id);
      expect(entries.length, group.id).toBe(EXPECTED_COUNTS[group.id]);
      expect(entries.length).toBe(
        group.motifs.length *
          group.widths.length *
          group.sides.length *
          group.drops.length *
          group.sizes.length *
          group.accesses.length *
          group.neighbors.length,
      );
      for (const motif of group.motifs)
        for (const widths of group.widths)
          for (const side of group.sides)
            for (const waterDrop of group.drops)
              for (const size of group.sizes)
                for (const access of group.accesses)
                  for (const neighbors of group.neighbors)
                    expect(
                      entries.some(
                        (s) =>
                          s.motif === motif.id &&
                          s.widths === widths &&
                          s.side === side &&
                          s.waterDrop === waterDrop &&
                          s.size === size &&
                          s.access === access &&
                          s.neighbors === neighbors,
                      ),
                    ).toBe(true);
    }
  });
  for (const group of GROUPS)
    it(
      group.id +
        ": every matrix entry is finite, deterministic, correctly described, and collision-safe",
      () => {
        const failures: string[] = [],
          rejected: string[] = [];
        let accepted = 0;
        for (const spec of CATALOG.filter((s) => s.group === group.id)) {
          const scenario = buildScenario(spec);
          const check = (ok: boolean, message: string) => {
            if (!ok) failures.push(spec.id + ": " + message);
          };
          check(
            finite(scenario.buildArea) && convex(scenario.buildArea),
            "invalid build area",
          );
          for (const surface of scenario.surfaces) {
            check(
              surface.polygons.every((poly) => finite(poly) && convex(poly)),
              "invalid/nonconvex collision primitive " + surface.id,
            );
            if (surface.kind === "water")
              check(
                Number.isFinite(surface.drop) && surface.drop! > 0,
                "water not below ground",
              );
            if (surface.centerline) {
              check(
                surface.centerline.length === surface.widths?.length,
                "width/point count mismatch",
              );
              check(
                surface.widths!.every((w) => Number.isFinite(w) && w > 0),
                "nonpositive width",
              );
              const token = spec.widths
                .split("/")
                .find((w) =>
                  w.startsWith(
                    surface.kind === "water"
                      ? "w"
                      : surface.kind === "path"
                        ? "p"
                        : "r",
                  ),
                );
              if (
                token &&
                !["junctions", "mixed"].includes(group.id) &&
                !(
                  group.id === "deadends" &&
                  surface.id !== scenario.surfaces[0].id
                )
              ) {
                const widths = token.slice(1).split("-").map(Number);
                check(
                  surface.widths![0] === widths[0] &&
                    surface.widths!.at(-1) === (widths[1] ?? widths[0]),
                  "incorrect labeled width",
                );
              }
            }
          }
          if (group.id !== "limits")
            check(
              scenario.blockers.length ===
                (spec.neighbors === "none"
                  ? 0
                  : spec.neighbors === "one"
                    ? 1
                    : 4),
              "neighbor count not represented",
            );
          for (const b of scenario.blockers) {
            const polygon = rect(b.center, b.width, b.depth, b.angle);
            if (group.id !== "limits")
              check(
                scenario.surfaces.every((s) =>
                  s.polygons.every((poly) => separated(polygon, poly, 0.4)),
                ),
                "neighbor overlaps environmental keepout",
              );
          }
          const before = JSON.stringify(scenario);
          const result = generateHouse(scenario, 42);
          const repeated = generateHouse(scenario, 42);
          check(
            JSON.stringify(result) === JSON.stringify(repeated),
            "nondeterministic result",
          );
          check(
            before === JSON.stringify(scenario),
            "generator mutates local data",
          );
          check(
            Number.isInteger(result.attempts) &&
              result.attempts >= 0 &&
              result.attempts <= 720,
            "unbounded attempts",
          );
          if (result.ok) {
            accepted++;
            for (const failure of verifyPlacement(
              scenario,
              result.house.envelopes,
              result.house.height,
            ))
              check(false, failure);
            check(
              result.house.parts.every(
                (part) =>
                  part.width > 0 &&
                  part.depth > 0 &&
                  part.wallHeight > 0 &&
                  part.roofHeight > 0,
              ),
              "invalid dimensions",
            );
            check(
              group.id !== "limits",
              "unbuildable fixture incorrectly occupied",
            );
          } else {
            rejected.push(spec.id);
            check(
              result.reason.length > 20 && result.attempts > 0,
              "unexplained rejection",
            );
          }
        }
        summary[group.id] = {
          accepted,
          rejected: rejected.length,
          rejectedIds: rejected,
          failures,
        };
        expect(failures, failures.slice(0, 20).join("\n")).toEqual([]);
      },
    );
  it("different labeled width profiles really produce different local geometry for every motif", () => {
    const failures: string[] = [];
    for (const group of GROUPS)
      for (const motif of group.motifs) {
        const base = CATALOG.find(
          (s) => s.group === group.id && s.motif === motif.id,
        )!;
        const geometry = group.widths.map((widths) =>
          JSON.stringify(buildScenario({ ...base, widths }).surfaces),
        );
        if (new Set(geometry).size !== group.widths.length)
          failures.push(group.id + "/" + motif.id);
      }
    expect(failures).toEqual([]);
  });
  it("every ordinary motif has a buildable canonical form; all rejection controls reject at every fixed seed", () => {
    for (const spec of REPRESENTATIVES)
      for (const seed of SEEDS) {
        const scenario = buildScenario(spec),
          result = generateHouse(scenario, seed, "cottage");
        if (spec.group === "limits") expect(result.ok, spec.id).toBe(false);
        else expect(result.ok, spec.id + " seed " + seed).toBe(true);
      }
  });
  it("all house families are deterministic and valid on every motif at all fixed seeds (or explicitly rejected)", () => {
    for (const spec of REPRESENTATIVES)
      for (const seed of SEEDS)
        for (const family of [
          "cottage",
          "townhouse",
          "longhouse",
          "winghouse",
        ] as const) {
          const scenario = buildScenario(spec),
            result = generateHouse(scenario, seed, family);
          expect(generateHouse(scenario, seed, family)).toEqual(result);
          if (result.ok)
            expect(
              verifyPlacement(
                scenario,
                result.house.envelopes,
                result.house.height,
              ),
              spec.id,
            ).toEqual([]);
          else expect(result.reason.length).toBeGreaterThan(20);
        }
  });
});
