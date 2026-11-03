export type Point = { x: number; z: number };
export type Polygon = Point[];
export type Neighbors = "none" | "one" | "dense";
export type Family =
  "auto" | "cottage" | "townhouse" | "longhouse" | "winghouse";
export type View = "perspective" | "top";
export type SurfaceKind = "road" | "path" | "water" | "square";

export interface Surface {
  id: string;
  kind: SurfaceKind;
  polygons: Polygon[];
  centerline?: Point[];
  widths?: number[];
  /** Water below ground, in metres. Other surfaces stay at ground level. */
  drop?: number;
}

export interface Blocker {
  center: Point;
  width: number;
  depth: number;
  height: number;
  angle: number;
}

export interface ScenarioSpec {
  id: string;
  group: string;
  motif: string;
  label: string;
  widths: string;
  side: number;
  neighbors: Neighbors;
  waterDrop: number;
  size: number;
  access: string;
}

export interface Scenario {
  spec: ScenarioSpec;
  surfaces: Surface[];
  blockers: Blocker[];
  buildArea: Polygon;
  maxHeight: number;
  notes: string[];
}

export interface HousePart {
  center: Point;
  width: number;
  depth: number;
  wallHeight: number;
  roofHeight: number;
  roof: "gable" | "hip" | "shed";
  overhang: number;
}

export interface House {
  family: Exclude<Family, "auto">;
  center: Point;
  angle: number;
  parts: HousePart[];
  /** Full roof envelopes, in world metres, not only wall footprints. */
  envelopes: Polygon[];
  entrance: Point;
  frontage?: string;
  height: number;
}

export type HouseResult =
  | { ok: true; house: House; attempts: number }
  | { ok: false; reason: string; attempts: number };

export const FAMILY_LABELS: Record<Family, string> = {
  auto: "Standort entscheidet",
  cottage: "Giebelhaus",
  townhouse: "Stadthaus",
  longhouse: "Langhaus",
  winghouse: "Winkelhaus",
};
export const NEIGHBOR_LABELS: Record<Neighbors, string> = {
  none: "Freistehend",
  one: "Ein Nachbar",
  dense: "Dichte Nachbarn",
};
