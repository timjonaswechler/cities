import { HOUSE_PROFILES, type HousePlot, type HousePoint } from "./house-types";

export function validateHousePlot(value: unknown): asserts value is HousePlot {
  const fail = (): never => {
    throw new Error("Ungültiger Bauplatz oder ungültige Hausdaten");
  };
  if (!value || typeof value !== "object") fail();
  const plot = value as HousePlot;
  const point = (p: HousePoint) =>
    p && typeof p === "object" && Number.isFinite(p.x) && Number.isFinite(p.y);
  const b = plot.bounds;
  if (
    !b ||
    !point(b.min) ||
    !point(b.max) ||
    !(b.max.x > b.min.x) ||
    !(b.max.y > b.min.y) ||
    !Number.isFinite(b.max.x - b.min.x) ||
    !Number.isFinite(b.max.y - b.min.y) ||
    !Number.isInteger(plot.seed) ||
    plot.seed < 0 ||
    plot.seed > 0xffffffff ||
    (plot.previewId !== undefined && typeof plot.previewId !== "string")
  )
    fail();
  if (plot.access !== null) {
    const a = plot.access;
    if (
      !a ||
      !point(a.point) ||
      !point(a.tangent) ||
      !Number.isFinite(Math.hypot(a.tangent.x, a.tangent.y)) ||
      Math.hypot(a.tangent.x, a.tangent.y) === 0
    )
      fail();
  }
  if (plot.accepted !== undefined) {
    const h = plot.accepted;
    if (
      !h ||
      typeof h.id !== "string" ||
      !h.id ||
      !point(h.center) ||
      !Number.isFinite(h.angle) ||
      !HOUSE_PROFILES.some(
        (p) =>
          h.width === p.width &&
          h.depth === p.depth &&
          h.storeys === p.storeys &&
          h.ridge === p.ridge,
      )
    )
      fail();
  }
}
