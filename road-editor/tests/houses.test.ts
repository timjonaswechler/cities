import { describe, expect, it } from "vitest";
import {
  HOUSE_RULES,
  type House,
  type HouseArea,
  type HousePoint,
  type HouseRequest,
} from "../src/house-types";
import { generateHouses, houseGeometry, validateHouse } from "../src/houses";

function rectangle(x1: number, y1: number, x2: number, y2: number): HouseArea {
  return {
    outer: [
      { x: x1, y: y1 },
      { x: x2, y: y1 },
      { x: x2, y: y2 },
      { x: x1, y: y2 },
    ],
    holes: [],
  };
}
function request(): HouseRequest {
  return {
    bounds: { min: { x: -12, y: 2 }, max: { x: 12, y: 23 } },
    access: { point: { x: 0, y: 2 }, tangent: { x: 1, y: 0 } },
    roads: [rectangle(-30, -2, 30, 2)],
    water: [],
    seed: 42,
  };
}
function house(overrides: Partial<House> = {}): House {
  return {
    id: "fixed-house",
    center: { x: 0, y: 8 },
    angle: 0,
    width: 4,
    depth: 6,
    storeys: 1,
    ridge: "depth",
    ...overrides,
  };
}
function freeze<T>(value: T): T {
  if (value && typeof value === "object") {
    Object.values(value).forEach(freeze);
    Object.freeze(value);
  }
  return value;
}
const distance = (a: HousePoint, b: HousePoint) =>
  Math.hypot(a.x - b.x, a.y - b.y);

describe("first-milestone house generation", () => {
  it("H01: returns exactly the three distinct fixed profiles, all valid", () => {
    const input = request(),
      result = generateHouses(input);
    expect(result.rejections).toEqual([]);
    expect(
      result.houses.map(({ width, depth, storeys, ridge }) => [
        width,
        depth,
        storeys,
        ridge,
      ]),
    ).toEqual([
      [4, 6, 1, "depth"],
      [6, 8, 2, "width"],
      [8, 5, 1, "depth"],
    ]);
    expect(new Set(result.houses.map((h) => h.id)).size).toBe(3);
    expect(result.tested).toBeGreaterThanOrEqual(3);
    expect(result.tested).toBeLessThanOrEqual(81);
    for (const h of result.houses) {
      expect(validateHouse(input, h)).toEqual([]);
      expect(Object.keys(h).sort()).toEqual([
        "angle",
        "center",
        "depth",
        "id",
        "ridge",
        "storeys",
        "width",
      ]);
    }
  });

  it("is seeded, reproducible, and never mutates requests or fixed houses", () => {
    const input = freeze(request()),
      before = structuredClone(input),
      fixed = freeze(house()),
      fixedBefore = structuredClone(fixed),
      first = generateHouses(input);
    expect(generateHouses(input)).toEqual(first);
    expect(
      generateHouses({ ...input, seed: 43 }).houses.map((h) => h.center),
    ).not.toEqual(first.houses.map((h) => h.center));
    expect(validateHouse(input, fixed)).toEqual([]);
    const geometry = houseGeometry(fixed);
    geometry.footprint[0].x = 999;
    expect(input).toEqual(before);
    expect(fixed).toEqual(fixedBefore);
    expect(first.houses).not.toHaveLength(0);
  });

  it("H02: rejects a plot too small even for the smallest roof", () => {
    const input = request();
    input.bounds = { min: { x: -2, y: 2 }, max: { x: 2, y: 5 } };
    const result = generateHouses(input);
    expect(result.houses).toEqual([]);
    expect(result.rejections).toHaveLength(3);
    expect(
      result.rejections.every((reason) => reason.includes("Dachhülle")),
    ).toBe(true);
    expect(result.tested).toBeLessThanOrEqual(81);
  });

  it("H03: water covering the whole plot yields a clean rejection", () => {
    const input = request();
    input.water = [rectangle(-12, 2, 12, 23)];
    const result = generateHouses(input);
    expect(result.houses).toEqual([]);
    expect(result.rejections.join(" ")).toContain("Wasser");
  });

  it("never tests more than 27 placements per profile, even with no successes", () => {
    const input = request();
    input.water = [rectangle(-12, 2.01, 12, 23)];
    const result = generateHouses(input);
    expect(result.houses).toEqual([]);
    expect(result.tested).toBe(81);
    expect(result.rejections).toHaveLength(3);
  });

  it.each(["water", "roads"] as const)(
    "H03: detects a tiny %s island entirely inside a roof",
    (kind) => {
      const input = request(),
        obstacle = rectangle(-0.01, 7.99, 0.01, 8.01);
      input[kind].push(obstacle);
      const roof = houseGeometry(house()).roof;
      expect(
        roof.every(
          (p) => p.x < -0.01 || p.x > 0.01 || p.y < 7.99 || p.y > 8.01,
        ),
      ).toBe(true);
      expect(validateHouse(input, house()).join(" ")).toContain(
        kind === "water" ? "Wasser" : "Weg",
      );
    },
  );

  it("uses edge-to-edge clearance, not just distances from roof vertices", () => {
    const input = request();
    input.water = [rectangle(2.75, 7.99, 2.85, 8.01)];
    expect(validateHouse(input, house()).join(" ")).toContain(
      "0,5 m Abstand zu Wasser",
    );
    input.water = [rectangle(3, 7.99, 3.1, 8.01)];
    expect(validateHouse(input, house())).toEqual([]);
  });

  it("H04: rejects road collision by overhang alone although walls are clear", () => {
    const fixed = house({ center: { x: 0, y: 5.2 } }),
      geometry = houseGeometry(fixed);
    expect(Math.min(...geometry.footprint.map((p) => p.y))).toBeGreaterThan(2);
    expect(Math.min(...geometry.roof.map((p) => p.y))).toBeLessThan(2);
    expect(validateHouse(request(), fixed).join(" ")).toContain(
      "Abstand zu Weg",
    );
  });

  it("H05: water between the entrance and road blocks every proposal", () => {
    const input = request();
    input.water = [rectangle(-20, 2.1, 20, 2.2)];
    expect(validateHouse(input, house()).join(" ")).toContain(
      "Zugang wird durch Wasser blockiert",
    );
    const result = generateHouses(input);
    expect(result.houses).toEqual([]);
    expect(result.rejections.join(" ")).toContain("Zugang");
    expect(result.tested).toBe(81);
  });

  it.each([-1.2, -0.3, 0.7, 1.7, 2.4])(
    "keeps all profiles valid along an oblique road at %s radians",
    (angle) => {
      const input = request(),
        c = Math.cos(angle),
        s = Math.sin(angle),
        rotate = (p: HousePoint): HousePoint => ({
          x: c * p.x - s * p.y,
          y: s * p.x + c * p.y,
        }),
        middle = rotate({ x: 0, y: 12 });
      input.roads[0].outer = input.roads[0].outer.map(rotate);
      input.access = {
        point: rotate({ x: 0, y: 2 }),
        tangent: rotate({ x: 1, y: 0 }),
      };
      input.bounds = {
        min: { x: middle.x - 14, y: middle.y - 14 },
        max: { x: middle.x + 14, y: middle.y + 14 },
      };
      const result = generateHouses(input);
      expect(result.houses, JSON.stringify(result)).toHaveLength(3);
      for (const fixed of result.houses) {
        expect(validateHouse(input, fixed)).toEqual([]);
        expect(fixed.angle).toBeCloseTo(angle);
        expect(
          houseGeometry(fixed).roof.every(
            (p) =>
              p.x >= input.bounds.min.x - 1e-8 &&
              p.x <= input.bounds.max.x + 1e-8 &&
              p.y >= input.bounds.min.y - 1e-8 &&
              p.y <= input.bounds.max.y + 1e-8,
          ),
        ).toBe(true);
      }
    },
  );

  it("offers houses on either side of the road with the front facing the access", () => {
    for (const reverse of [false, true]) {
      const input = request();
      input.bounds = { min: { x: -12, y: -23 }, max: { x: 12, y: -2 } };
      input.access = {
        point: { x: 0, y: -2 },
        tangent: { x: reverse ? -1 : 1, y: 0 },
      };
      const result = generateHouses(input);
      expect(result.houses).toHaveLength(3);
      for (const h of result.houses) {
        expect(validateHouse(input, h)).toEqual([]);
        expect(houseGeometry(h).entrance.y).toBeGreaterThan(h.center.y);
      }
    }
  });
});

describe("canonical geometry and plot boundaries", () => {
  it.each([
    [house(), 2.8, 2.5, 7],
    [house({ width: 6, depth: 8, storeys: 2, ridge: "width" }), 5.6, 4.5, 7],
    [house({ width: 8, depth: 5 }), 2.8, 4.5, 6],
  ] as const)(
    "constructs 45° gables and exactly 0.5 m overhang: %j",
    (h, eave, rise, ridgeLength) => {
      const g = houseGeometry(h);
      expect(g.eaveHeight).toBeCloseTo(eave);
      expect(g.ridgeHeight - g.eaveHeight).toBeCloseTo(rise);
      expect(distance(...g.ridge)).toBeCloseTo(ridgeLength);
      expect(
        distance(g.roof[0], g.roof[1]) -
          distance(g.footprint[0], g.footprint[1]),
      ).toBeCloseTo(1);
      expect(
        distance(g.roof[1], g.roof[2]) -
          distance(g.footprint[1], g.footprint[2]),
      ).toBeCloseTo(1);
      expect(g.entrance).toEqual({
        x: h.center.x,
        y: h.center.y - h.depth / 2,
      });
    },
  );

  it("rotates footprint, roof, ridge and entrance using the same local axes", () => {
    const h = house({ center: { x: 10, y: 20 }, angle: Math.PI / 2 }),
      g = houseGeometry(h);
    expect(g.entrance.x).toBeCloseTo(13);
    expect(g.entrance.y).toBeCloseTo(20);
    expect(g.footprint[0].x).toBeCloseTo(13);
    expect(g.footprint[0].y).toBeCloseTo(18);
    expect(g.roof[0].x).toBeCloseTo(13.5);
    expect(g.roof[0].y).toBeCloseTo(17.5);
    expect(distance(...g.ridge)).toBeCloseTo(7);
  });

  it("requires the entire roof rectangle in the plot, not just the footprint", () => {
    const input = request(),
      fixed = house({ center: { x: 9.75, y: 8 } });
    expect(
      houseGeometry(fixed).footprint.every((p) => p.x <= input.bounds.max.x),
    ).toBe(true);
    expect(validateHouse(input, fixed).join(" ")).toContain(
      "Dachhülle liegt außerhalb",
    );
  });

  it("allows dry holes, but still enforces clearance from their material boundary", () => {
    const input = request(),
      water = rectangle(-50, -50, 50, 50);
    water.holes = [rectangle(-15, 1, 15, 25).outer];
    input.water = [water];
    expect(validateHouse(input, house())).toEqual([]);
    expect(generateHouses(input).houses).toHaveLength(3);
    water.holes = [rectangle(-2.75, 1, 15, 25).outer];
    expect(validateHouse(input, house()).join(" ")).toContain(
      "Abstand zu Wasser",
    );
  });

  it("allows access at the boundary of a road hole and measures its inner clearance", () => {
    const input = request(),
      road = rectangle(-30, -30, 30, 30),
      fixed = house({ center: { x: 0, y: 6 } });
    road.holes = [rectangle(-12, 2, 12, 23).outer];
    input.roads = [road];
    expect(validateHouse(input, fixed)).toEqual([]);
    expect(
      validateHouse(input, { ...fixed, center: { x: 0, y: 5.99 } }).join(" "),
    ).toContain("Abstand zu Weg");
  });

  it("rejects noncanonical and nonfinite house parameters rather than distorting them", () => {
    for (const fixed of [
      house({ width: 4.1 }),
      house({ ridge: "width" }),
      house({ angle: NaN }),
    ])
      expect(validateHouse(request(), fixed).length).toBeGreaterThan(0);
    const input = request();
    input.bounds.max.x = Infinity;
    expect(generateHouses(input).houses).toEqual([]);
    expect(generateHouses(input).rejections.length).toBeGreaterThan(0);
  });
});

describe("direct access corridor", () => {
  it("rejects missing access, interior road points, stale edges, and water masquerading as a road", () => {
    const input = request();
    input.access = null;
    expect(generateHouses(input).houses).toEqual([]);
    input.access = { point: { x: 0, y: 0 }, tangent: { x: 1, y: 0 } };
    expect(validateHouse(input, house()).join(" ")).toContain(
      "aktuellen Wegrand",
    );
    input.access.point.y = 2;
    input.roads = [rectangle(-30, -3, 30, 3)];
    expect(validateHouse(input, house()).join(" ")).toContain(
      "aktuellen Wegrand",
    );
    input.roads = [];
    input.water = [rectangle(-30, -2, 30, 2)];
    expect(generateHouses(input).houses).toEqual([]);
    expect(validateHouse(input, house()).join(" ")).toContain(
      "aktuellen Wegrand",
    );
  });

  it("uses the union boundary, not an obsolete internal edge of overlapping roads", () => {
    const input = request();
    input.roads.push(rectangle(-30, 1, 30, 3));
    expect(validateHouse(input, house()).join(" ")).toContain(
      "aktuellen Wegrand",
    );
  });

  it("accepts the defined edge tolerance but rejects larger offsets", () => {
    const input = request();
    input.access!.point.y += HOUSE_RULES.accessTolerance;
    expect(validateHouse(input, house())).toEqual([]);
    input.access!.point.y += 0.001;
    expect(validateHouse(input, house()).join(" ")).toContain(
      "aktuellen Wegrand",
    );
  });

  it("rejects water at the selected access point even where road overlaps it", () => {
    const input = request();
    input.water.push(rectangle(-0.1, 1.9, 0.1, 2.1));
    expect(validateHouse(input, house()).join(" ")).toContain(
      "Wegrand liegt im Wasser",
    );
    expect(generateHouses(input).houses).toEqual([]);
  });

  it.each(["water", "roads"] as const)(
    "enforces the entire 1.2 m corridor width, including a tiny enclosed %s island",
    (kind) => {
      const input = request();
      input[kind].push(rectangle(0.5, 3.5, 0.55, 3.55));
      expect(validateHouse(input, house()).join(" ")).toContain(
        kind === "water"
          ? "Zugang wird durch Wasser blockiert"
          : "Wegeflächen nur am gewählten Ende",
      );
      input[kind].pop();
      input[kind].push(rectangle(0.61, 3.5, 0.66, 3.55));
      expect(validateHouse(input, house())).toEqual([]);
    },
  );

  it("cannot cross another road or reenter an earlier part of the selected road", () => {
    const input = request();
    input.roads.push(rectangle(-3, 3, 3, 3.2));
    expect(validateHouse(input, house()).join(" ")).toContain(
      "Wegeflächen nur am gewählten Ende",
    );
    input.roads.push(rectangle(2, 1, 3, 3.2));
    expect(validateHouse(input, house()).join(" ")).toContain(
      "Wegeflächen nur am gewählten Ende",
    );
  });

  it("caps an oblique approach on the selected edge instead of crossing into it", () => {
    const fixed = house({ center: { x: 3, y: 8 } });
    expect(validateHouse(request(), fixed)).toEqual([]);
  });

  it("requires the outside-road corridor width to remain inside the plot", () => {
    const input = request();
    input.bounds.min.x = 0;
    const fixed = house({ center: { x: 4, y: 8 } });
    expect(validateHouse(input, fixed).join(" ")).toContain(
      "Zugang außerhalb des Wegs muss im Bauplatz",
    );
  });

  it("requires a genuine road mouth over the full corridor width", () => {
    const input = request();
    input.roads = [rectangle(-0.5, -2, 0.5, 2)];
    expect(validateHouse(input, house()).join(" ")).toContain(
      "Wegeflächen nur am gewählten Ende",
    );
  });

  it("limits access to 12 m and rejects an entrance facing away from it", () => {
    expect(
      validateHouse(request(), house({ center: { x: 0, y: 17 } })),
    ).toEqual([]);
    expect(
      validateHouse(request(), house({ center: { x: 0, y: 17.01 } })).join(" "),
    ).toContain("höchstens 12 m");
    expect(
      validateHouse(request(), house({ angle: Math.PI })).join(" "),
    ).toContain("vordere Eingang");
  });

  it("revalidates a concrete house after road widening without changing its parameters", () => {
    const input = request(),
      fixed = freeze(house({ center: { x: 0, y: 6 } })),
      before = structuredClone(fixed);
    expect(validateHouse(input, fixed)).toEqual([]);
    input.roads = [rectangle(-30, -3, 30, 3)];
    expect(validateHouse(input, fixed).length).toBeGreaterThan(0);
    expect(fixed).toEqual(before);
    input.access!.point.y = 3;
    expect(validateHouse(input, fixed).join(" ")).toContain("Abstand zu Weg");
    expect(fixed).toEqual(before);
  });
});
