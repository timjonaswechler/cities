import { nearestBoundary, type Surface } from "./geometry";
import type { HousePlot, HousePoint, HouseRequest } from "./house-types";

// The only adapter between house inputs and the editor's derived surfaces.
export function houseRequest(plot: HousePlot, surface: Surface): HouseRequest {
  return {
    bounds: plot.bounds,
    access: plot.access,
    seed: plot.seed,
    roads: surface.roadAreas ?? [],
    water: surface.water?.areas ?? [],
  };
}
export function pickHouseAccess(
  surface: Surface,
  point: HousePoint,
  maxDistance: number,
) {
  const hit = nearestBoundary(
    { ...surface, areas: surface.roadAreas ?? [] },
    point,
  );
  return hit && hit.distance <= maxDistance
    ? { point: hit.point, tangent: hit.direction }
    : null;
}
