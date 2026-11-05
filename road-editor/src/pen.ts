import type { Curve } from "./curves";
import type { Point } from "./network";

// Outgoing handle at an anchor; an incoming handle is its reflection only
// while creating the point. Stored curve handles remain independently editable.
export interface PenPoint {
  point: Point;
  outgoing?: Point;
}
export function penCurve(start: PenPoint, end: PenPoint): Curve {
  if (!start.outgoing && !end.outgoing) return { kind: "line" };
  const control = start.outgoing ?? start.point;
  return {
    kind: "cubic",
    c1: { x: control.x, y: control.y },
    c2: end.outgoing
      ? {
          x: 2 * end.point.x - end.outgoing.x,
          y: 2 * end.point.y - end.outgoing.y,
        }
      : { x: end.point.x, y: end.point.y },
  };
}
