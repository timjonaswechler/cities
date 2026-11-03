import Clipper from "clipper-lib";

// Internal adapter: world-coordinate polygons in/out; integer clipping,
// winding conventions, nesting and numeric failure modes stay here.
export type Ring = [number, number][];
export type Polygon = Ring[];
export type MultiPolygon = Polygon[];
type Geometry = Polygon | MultiPolygon;
const SCALE = 1e8; // 10 nm, below all frozen geometry tolerances.
const MAX_INTEGER = 2 ** 51; // Within Clipper's exact-integer coordinate range.
function polygons(value: Geometry): MultiPolygon {
  if (!value.length) return [];
  return typeof value[0]?.[0]?.[0] === "number"
    ? [value as Polygon]
    : (value as MultiPolygon);
}
function operation(
  subject: MultiPolygon,
  clip: MultiPolygon,
  type: Clipper.ClipType,
): MultiPolygon {
  if (
    !subject.length ||
    (type === Clipper.ClipType.ctIntersection && !clip.length)
  )
    return [];
  const origin = subject[0][0][0];
  const paths = (polys: MultiPolygon): Clipper.Paths =>
    polys.flatMap((poly) =>
      poly.map((ring, index) => {
        const path = ring.map(([x, y]) => {
          const X = Math.round((x - origin[0]) * SCALE),
            Y = Math.round((y - origin[1]) * SCALE);
          if (
            !Number.isSafeInteger(X) ||
            !Number.isSafeInteger(Y) ||
            Math.abs(X) > MAX_INTEGER ||
            Math.abs(Y) > MAX_INTEGER
          )
            throw new Error(
              "Geometrie überschreitet den sicheren Ganzzahl-Clippingbereich.",
            );
          return { X, Y };
        });
        if (Clipper.Clipper.Orientation(path) !== (index === 0)) path.reverse();
        return path;
      }),
    );
  const engine = new Clipper.Clipper(),
    tree = new Clipper.PolyTree();
  engine.StrictlySimple = true;
  if (!engine.AddPaths(paths(subject), Clipper.PolyType.ptSubject, true))
    return [];
  if (clip.length) engine.AddPaths(paths(clip), Clipper.PolyType.ptClip, true);
  if (
    !engine.Execute(
      type,
      tree,
      Clipper.PolyFillType.pftNonZero,
      Clipper.PolyFillType.pftNonZero,
    )
  )
    throw new Error("Polygonoperation konnte nicht abgeschlossen werden.");
  const result: MultiPolygon = [];
  const ring = (path: Clipper.Path): Ring => {
    const points: Ring = path.map(({ X, Y }) => [
      X / SCALE + origin[0],
      Y / SCALE + origin[1],
    ]);
    return [...points, points[0]];
  };
  function visit(at: Clipper.PolyNode) {
    if (!at.IsHole() && at.Contour().length)
      result.push([
        ring(at.Contour()),
        ...at
          .Childs()
          .filter((n) => n.IsHole())
          .map((n) => ring(n.Contour())),
      ]);
    at.Childs().forEach(visit);
  }
  tree.Childs().forEach(visit);
  return result;
}
export default {
  union(first: Geometry, ...rest: Geometry[]): MultiPolygon {
    return operation(
      [first, ...rest].flatMap(polygons),
      [],
      Clipper.ClipType.ctUnion,
    );
  },
  difference(subject: Geometry, clip: Geometry): MultiPolygon {
    return operation(
      polygons(subject),
      polygons(clip),
      Clipper.ClipType.ctDifference,
    );
  },
  intersection(subject: Geometry, clip: Geometry): MultiPolygon {
    return operation(
      polygons(subject),
      polygons(clip),
      Clipper.ClipType.ctIntersection,
    );
  },
};
