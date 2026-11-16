import { describe, expect, it } from "vitest";
import { areaSize, computeSurface } from "../src/geometry";
import {
  closePath,
  openArea,
  History,
  parse,
  serialize,
  type Network,
} from "../src/network";

function draft(): Network {
  return {
    version: 5,
    nodes: [
      { id: "a", x: 0, y: 0 },
      { id: "b", x: 20, y: 0 },
      { id: "c", x: 20, y: 20 },
    ],
    paths: [
      {
        id: "site",
        kind: "plot",
        plotSeed: 7,
        startWidth: 4,
        endWidth: 4,
        segments: [
          { kind: "line", from: "a", to: "b" },
          { kind: "line", from: "b", to: "c" },
        ],
      },
    ],
    junctions: [],
    areaBlockers: [],
  };
}
describe("editable plot source", () => {
  it("keeps an open plot unbuilt and out of the road/water blocker surface", () => {
    const n = draft();
    expect(areaSize(computeSurface(n))).toBe(0);
    expect(parse(serialize(n))).toEqual(n);
  });
  it("closes into a planned plot, not a blocker, and preserves seed when reopening", () => {
    const n = draft();
    closePath(n, "site");
    expect(n.plots).toHaveLength(1);
    expect(n.plots![0]).toMatchObject({ id: "site", kind: "plot", seed: 7 });
    expect(n.areaBlockers).toEqual([]);
    expect(areaSize(computeSurface(n))).toBe(0);
    const closed = structuredClone(n);
    expect(parse(serialize(closed))).toEqual(closed);
    openArea(n, "site");
    expect(n.paths[0]).toMatchObject({ kind: "plot", plotSeed: 7 });
    closePath(n, "site");
    expect(n.plots).toEqual(closed.plots);
    expect(n.version).toBe(5);
  });
  it("stores source contours through undo/redo without persisting a generated complex", () => {
    const n = draft(),
      h = new History(n);
    closePath(n, "site");
    h.commit(n);
    expect(h.value.plots).toHaveLength(1);
    expect(serialize(h.value)).not.toContain('"complex"');
    h.undo();
    expect(h.value.plots).toBeUndefined();
    h.redo();
    expect(h.value.plots).toEqual(n.plots);
  });
  it("rejects old formats and malformed planned contours atomically", () => {
    const n = draft();
    closePath(n, "site");
    const h = new History(n);
    const cases = [
      (x: Network) => {
        x.version = 4;
      },
      (x: Network) => {
        x.plots![0].seed = -1;
      },
      (x: Network) => {
        x.plots![0].outer = [
          { x: 0, y: 0 },
          { x: 20, y: 20 },
          { x: 0, y: 20 },
          { x: 20, y: 0 },
        ];
        delete x.plots![0].outerEdges;
      },
      (x: Network) => {
        x.plots!.push(structuredClone(x.plots![0]));
      },
    ];
    for (const mutate of cases) {
      const bad = structuredClone(n);
      mutate(bad);
      expect(() => h.commit(parse(JSON.stringify(bad)))).toThrow();
      expect(h.value).toEqual(n);
    }
    const old = draft();
    old.version = 4;
    expect(() => parse(JSON.stringify(old))).toThrow();
  });
});
