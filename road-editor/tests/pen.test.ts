import { describe, expect, it } from "vitest";
import { penCurve } from "../src/pen";
import { curvePoint, curveDerivative } from "../src/curves";

describe("pen click / drag convention", () => {
  const start = { point: { x: 0, y: 0 } },
    end = { point: { x: 10, y: 0 } };
  it("clicks produce a line, with no preset bend", () => {
    expect(penCurve(start, end)).toEqual({ kind: "line" });
  });
  it("dragged handles define outgoing and reflected incoming controls", () => {
    const a = { ...start, outgoing: { x: 0, y: 5 } },
      b = { ...end, outgoing: { x: 10, y: -5 } },
      before = structuredClone([a, b]);
    const curve = penCurve(a, b);
    expect(curve).toEqual({
      kind: "cubic",
      c1: { x: 0, y: 5 },
      c2: { x: 10, y: 5 },
    });
    expect(curvePoint(a.point, b.point, curve, 0.5)).toEqual({ x: 5, y: 3.75 });
    expect([a, b]).toEqual(before);
  });
  it("initializes a common tangent through a dragged anchor without permanent coupling", () => {
    const middle = { point: { x: 5, y: 5 }, outgoing: { x: 8, y: 5 } };
    const incoming = penCurve(start, middle),
      outgoing = penCurve(middle, end);
    expect(curveDerivative(start.point, middle.point, incoming, 1)).toEqual({
      x: 9,
      y: 0,
    });
    expect(curveDerivative(middle.point, end.point, outgoing, 0)).toEqual({
      x: 9,
      y: 0,
    });
    if (incoming.kind !== "cubic" || outgoing.kind !== "cubic")
      throw new Error("cubic expected");
    incoming.c2.x = 1;
    expect(outgoing.c1.x).toBe(8);
    expect(middle.outgoing.x).toBe(8);
  });
  it("a click after a curve makes a corner; the next click can be a straight segment", () => {
    expect(penCurve({ ...start, outgoing: { x: 2, y: 3 } }, end)).toEqual({
      kind: "cubic",
      c1: { x: 2, y: 3 },
      c2: end.point,
    });
    expect(penCurve(end, { point: { x: 20, y: 5 } })).toEqual({ kind: "line" });
  });
});
