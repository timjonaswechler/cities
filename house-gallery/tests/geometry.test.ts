import { describe, expect, it } from "vitest";
import {
  circle,
  contains,
  overlaps,
  rect,
  ribbon,
  separated,
} from "../src/geometry";

describe("independent geometry contracts", () => {
  it("rejects crossing thin polygons, not only contained vertices", () => {
    const horizontal = rect({ x: 0, z: 0 }, 12, 1);
    const vertical = rect({ x: 0, z: 0 }, 1, 12);
    expect(overlaps(horizontal, vertical)).toBe(true);
    expect(separated(horizontal, vertical)).toBe(false);
    expect(contains({ x: 0, z: 0 }, horizontal)).toBe(true);
  });
  it("respects full clearance including diagonal edges", () => {
    const a = rect({ x: 0, z: 0 }, 4, 6, Math.PI / 4);
    expect(separated(a, a, 1)).toBe(false);
    expect(separated(a, rect({ x: 10, z: 0 }, 2, 2), 1)).toBe(true);
    expect(
      separated(rect({ x: 0, z: 0 }, 2, 2), rect({ x: 2.5, z: 0 }, 2, 2), 0.6),
    ).toBe(false);
  });
  it("constructs tapered ribbons with continuous joins and finite positive widths", () => {
    const polygons = ribbon(
      [
        { x: -10, z: 0 },
        { x: 0, z: 0 },
        { x: 0, z: 10 },
      ],
      [2, 4, 8],
    );
    expect(polygons).toHaveLength(5);
    expect(polygons[0][1].z - polygons[0][2].z).toBe(4);
    expect(polygons.some((poly) => contains({ x: 0.5, z: -0.5 }, poly))).toBe(
      true,
    );
    expect(
      polygons
        .flat()
        .every((p) => Number.isFinite(p.x) && Number.isFinite(p.z)),
    ).toBe(true);
    expect(circle({ x: 0, z: 0 }, 3)).toHaveLength(24);
  });
});
