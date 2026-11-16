import type { Contour } from "./blockers";
import type { House, HouseArea, HousePoint } from "./house-types";

export interface PlannedPlot extends Contour {
  kind: "plot";
  seed: number;
}
// Keep blocker kinds and original site available to the planner. A 2D
// difference is only the currently usable ground area, not the source model.
export interface BuildBlocker {
  kind: "road" | "water";
  areas: HouseArea[];
}
export interface ComplexVolume extends House {
  // Attached wings share the main building's entrance.
  role: "main" | "wing";
  // Derived nearest street-edge point; not a walkable access route.
  entranceTarget?: HousePoint;
}
export interface BuildingComplex {
  id: string;
  volumes: ComplexVolume[];
}
export interface PlotPlan {
  id: string;
  planned: HouseArea;
  buildable: HouseArea[];
  excluded: HouseArea[];
  plannedArea: number;
  buildableArea: number;
  excludedArea: number;
  complex?: BuildingComplex;
  messages: string[];
}
