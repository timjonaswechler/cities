import { describe, expect, it } from "vitest";
import { computeSurface } from "../src/geometry";
import { generateHouses, validateHouse } from "../src/houses";
import { houseRequest, pickHouseAccess } from "../src/house-project";
import {
  closePath,
  History,
  openArea,
  parse,
  serialize,
  type Network,
} from "../src/network";

function project(): Network {
  return {
    version: 4,
    nodes: [
      { id: "a", x: -30, y: 0 },
      { id: "b", x: 30, y: 0 },
    ],
    paths: [
      {
        id: "road",
        startWidth: 4,
        endWidth: 4,
        segments: [{ kind: "line", from: "a", to: "b" }],
      },
    ],
    junctions: [],
    areaBlockers: [],
    housePlot: {
      bounds: { min: { x: -12, y: 2 }, max: { x: 12, y: 23 } },
      access: { point: { x: 0, y: 2 }, tangent: { x: 1, y: 0 } },
      seed: 42,
    },
  };
}

describe("house project adapter and persistence", () => {
  it("picks actual road boundaries, never an unrelated water boundary", () => {
    const n = project();
    n.areaBlockers!.push({
      id: "water",
      kind: "water",
      outer: [
        { x: 15, y: 10 },
        { x: 20, y: 10 },
        { x: 20, y: 15 },
        { x: 15, y: 15 },
      ],
    });
    const s = computeSurface(n);
    expect(pickHouseAccess(s, { x: 0, y: 2.2 }, 0.3)?.point).toEqual({
      x: 0,
      y: 2,
    });
    expect(pickHouseAccess(s, { x: 15, y: 12 }, 1)).toBeNull();
    const request = houseRequest(n.housePlot!, s);
    expect(request.roads).toEqual(s.roadAreas);
    expect(request.water).toEqual(s.water!.areas);
  });
  it("preserves exact accepted house, seed and preview through JSON and undo/redo", () => {
    const n = project(),
      h = new History(n);
    const chosen = generateHouses(houseRequest(n.housePlot!, computeSurface(n)))
      .houses[1];
    n.housePlot!.accepted = chosen;
    n.housePlot!.previewId = chosen.id;
    h.commit(n);
    expect(parse(serialize(h.value))).toEqual(n);
    h.undo();
    expect(h.value.housePlot?.accepted).toBeUndefined();
    h.redo();
    expect(h.value.housePlot?.accepted).toEqual(chosen);
  });
  it("revalidates a saved concrete house when the road changes without replacing it", () => {
    const n = project();
    n.housePlot!.accepted = generateHouses(
      houseRequest(n.housePlot!, computeSurface(n)),
    ).houses[0];
    const before = structuredClone(n.housePlot!.accepted);
    expect(
      validateHouse(houseRequest(n.housePlot!, computeSurface(n)), before),
    ).toEqual([]);
    n.paths[0].startWidth = n.paths[0].endWidth = 12;
    expect(
      validateHouse(houseRequest(n.housePlot!, computeSurface(n)), before)
        .length,
    ).toBeGreaterThan(0);
    expect(n.housePlot!.accepted).toEqual(before);
  });
  it.each([1, 2, 3] as const)(
    "still loads version %s without house data",
    (version) => {
      const n = project();
      delete n.housePlot;
      if (version === 1) delete n.areaBlockers;
      n.version = version;
      expect(parse(serialize(n))).toEqual(n);
    },
  );
  it("rejects malformed house data and old-format house data atomically", () => {
    const n = project(),
      h = new History(n);
    const mutations = [
      (p: Network) => {
        p.version = 3;
      },
      (p: Network) => {
        p.housePlot!.seed = -1;
      },
      (p: Network) => {
        p.housePlot!.seed = 1.5;
      },
      (p: Network) => {
        p.housePlot!.bounds.max.x = p.housePlot!.bounds.min.x;
      },
      (p: Network) => {
        p.housePlot!.access!.tangent = { x: 0, y: 0 };
      },
      (p: Network) => {
        p.housePlot!.accepted = { id: "bad" } as never;
      },
      (p: Network) => {
        p.housePlot = null as never;
      },
    ];
    for (const mutate of mutations) {
      const invalid = structuredClone(n);
      mutate(invalid);
      expect(() => h.commit(parse(JSON.stringify(invalid)))).toThrow();
      expect(h.value).toEqual(n);
    }
  });
  it("rejects unsupported full profile tuples but permits saved spatial conflicts", () => {
    const n = project();
    n.housePlot!.accepted = generateHouses(
      houseRequest(n.housePlot!, computeSurface(n)),
    ).houses[0];
    const history = new History(n);
    for (const change of [
      { storeys: 2 as const },
      { ridge: "width" as const },
    ]) {
      const bad = structuredClone(n);
      Object.assign(bad.housePlot!.accepted!, change);
      expect(() => history.commit(parse(JSON.stringify(bad)))).toThrow(
        "Hausdaten",
      );
      expect(history.value).toEqual(n);
    }
    n.paths[0].startWidth = n.paths[0].endWidth = 12;
    expect(parse(serialize(n)).housePlot!.accepted).toEqual(
      n.housePlot!.accepted,
    );
  });
  it("does not downgrade v4 when converting vector contours", () => {
    const n = project();
    n.nodes.push({ id: "c", x: 0, y: -15 });
    n.paths[0].segments.push({ kind: "line", from: "b", to: "c" });
    closePath(n, "road");
    expect(n.version).toBe(4);
    openArea(n, "road");
    expect(n.version).toBe(4);
    expect(parse(serialize(n)).housePlot).toEqual(n.housePlot);
  });
});
