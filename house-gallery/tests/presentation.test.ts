import { describe, expect, it } from "vitest";
import { CATALOG, buildScenario } from "../src/scenarios";
import { describeContext, matchesContext } from "../src/presentation";
import { geometryWidths } from "./topology";

const scenario = (id: string) =>
  buildScenario(CATALOG.find((s) => s.id === id)!);
describe("physical context presentation, not neutral catalog factors", () => {
  for (const [access, summary, profiles] of [
    ["none", "Freifläche · ohne Straße oder Weg", []],
    ["road", "Straße 6 m", ["r6"]],
    ["path", "Weg 1.8–2.8 m", ["p1.8-2.8"]],
  ] as const)
    it("space access " + access + " reflects only actual surfaces", () => {
      const context = scenario(`spaces~triangle~r6~0~0~1~${access}~none`);
      const facts = describeContext(context);
      expect(facts.summary).toBe(summary);
      expect(facts.routeProfiles).toEqual(profiles);
      expect(matchesContext(context.spec, facts, { route: "r6" })).toBe(
        access === "road",
      );
      expect(
        matchesContext(context.spec, facts, { search: "Straße 6 m" }),
      ).toBe(access === "road");
      expect(matchesContext(context.spec, facts, { search: "r6" })).toBe(
        access === "road",
      );
    });
  it("control cases do not invent a road and flooded water uses its actual height", () => {
    for (const motif of ["tiny", "flooded"]) {
      const context = scenario(`limits~${motif}~r6~0~0~1~none~none`),
        facts = describeContext(context);
      expect(facts.routeProfiles).toEqual([]);
      expect(matchesContext(context.spec, facts, { route: "r6" })).toBe(false);
      expect(
        matchesContext(context.spec, facts, { search: "Straße 6 m" }),
      ).toBe(false);
      if (motif === "flooded") {
        expect(facts.waterDrop).toBe(1.4);
        expect(facts.summary).toContain("Wasserfläche");
      } else expect(facts.waterDrop).toBeUndefined();
    }
  });
  it("ponds/shores have no fictitious channel width; real watercourses do", () => {
    for (const spec of CATALOG.filter((s) => s.group === "shores")) {
      const facts = describeContext(buildScenario(spec));
      expect(facts.waterProfiles).toEqual([]);
      expect(facts.summary).toContain("Wasserfläche");
      expect(matchesContext(spec, facts, { water: "w7" })).toBe(false);
    }
    const context = scenario("waterways~straight~w7~0~0.6~1~none~none");
    expect(describeContext(context).summary).toBe("Wasser 7 m");
    expect(
      matchesContext(context.spec, describeContext(context), { water: "w7" }),
    ).toBe(true);
  });
  it("neutral factor mutation cannot change the physical facts", () => {
    const context = scenario("spaces~triangle~r6~0~0~1~none~none");
    const before = describeContext(context);
    context.spec = { ...context.spec, widths: "r10/w12", access: "road" };
    expect(describeContext(context)).toEqual(before);
  });
  it("physical filters and search distinguish all three actual space access modes", () => {
    const specs = CATALOG.filter(
      (s) => s.group === "spaces" && s.neighbors === "none",
    );
    for (const filter of [
      { route: "r6" },
      { search: "Straße 6 m" },
      { search: "r6" },
    ]) {
      const matches = specs.filter((s) =>
        matchesContext(s, describeContext(buildScenario(s)), filter),
      );
      expect(matches).toHaveLength(36);
      expect(matches.every((s) => s.access === "road")).toBe(true);
    }
    const paths = specs.filter((s) =>
      matchesContext(s, describeContext(buildScenario(s)), {
        route: "p1.8-2.8",
      }),
    );
    expect(paths).toHaveLength(36);
    expect(paths.every((s) => s.access === "path")).toBe(true);
  });
  it("every displayed physical profile is backed by real geometric cross-sections; full IDs remain findable", () => {
    for (const spec of CATALOG) {
      const context = buildScenario(spec),
        facts = describeContext(context);
      const actual = new Set<string>();
      for (const surface of context.surfaces) {
        if (!surface.centerline) continue;
        const widths = geometryWidths(surface),
          start = widths[0][0],
          end = widths.at(-1)![1];
        const prefix =
          surface.kind === "road" ? "r" : surface.kind === "path" ? "p" : "w";
        actual.add(
          `${prefix}${Number(start.toFixed(6))}${Math.abs(start - end) < 1e-6 ? "" : `-${Number(end.toFixed(6))}`}`,
        );
      }
      expect(
        new Set([...facts.routeProfiles, ...facts.waterProfiles]),
        spec.id,
      ).toEqual(actual);
      expect(matchesContext(spec, facts, { search: spec.id }), spec.id).toBe(
        true,
      );
      expect(matchesContext(spec, facts, { search: "Straße 6 m" })).toBe(
        facts.routeProfiles.includes("r6"),
      );
    }
  });
});
