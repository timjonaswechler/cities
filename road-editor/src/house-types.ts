// Shared house interface: metres, XY ground plane, +Z height, angles in radians.
// This module has no editor, graph, renderer, or browser dependencies.
export interface HousePoint {
  x: number;
  y: number;
}
export interface HouseArea {
  outer: HousePoint[];
  holes: HousePoint[][];
}
export interface PlotBounds {
  min: HousePoint;
  max: HousePoint;
}
export interface HouseAccess {
  point: HousePoint;
  tangent: HousePoint;
}
export interface House {
  id: string;
  center: HousePoint;
  angle: number;
  width: number;
  depth: number;
  storeys: 1 | 2;
  ridge: "width" | "depth";
}
export interface HouseRequest {
  bounds: PlotBounds;
  access: HouseAccess | null;
  roads: HouseArea[];
  water: HouseArea[];
  seed: number;
}
export interface HouseResult {
  houses: House[];
  rejections: string[];
  tested: number;
}
export interface HouseGeometry {
  footprint: HousePoint[];
  roof: HousePoint[];
  ridge: [HousePoint, HousePoint];
  eaveHeight: number;
  ridgeHeight: number;
  entrance: HousePoint;
}
export interface HousePlot {
  bounds: PlotBounds;
  access: HouseAccess | null;
  seed: number;
  previewId?: string;
  accepted?: House;
}
export const HOUSE_PROFILES = [
  { width: 4, depth: 6, storeys: 1, ridge: "depth" },
  { width: 6, depth: 8, storeys: 2, ridge: "width" },
  { width: 8, depth: 5, storeys: 1, ridge: "depth" },
] as const;
export const HOUSE_RULES = {
  overhang: 0.5,
  clearance: 0.5,
  storeyHeight: 2.8,
  accessWidth: 1.2,
  maxAccessLength: 12,
  accessTolerance: 0.05,
} as const;
