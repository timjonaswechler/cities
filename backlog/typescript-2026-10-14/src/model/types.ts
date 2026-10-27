export interface Point { x: number; y: number }
export type Polygon = Point[];

export interface CityOptions {
  seed: number;
  size: number;
  citadel: boolean;
  urban_castle: boolean;
  plaza: boolean;
  temple: boolean;
  walls: boolean;
  shantytown: boolean;
  coast: boolean;
  river: boolean;
  greens: boolean;
  gates: number;
  hub?: boolean;
  sea?: number;
}

export type WardKind = 'craftsmen' | 'merchants' | 'residential' | 'slum' | 'castle' | 'temple' | 'market' | 'park' | 'farm' | 'harbour';
export interface Building {
  polygon: Polygon;
  landmark: boolean;
  courtyard?: Polygon;
  role?: 'lot' | 'church' | 'castle' | 'temple' | 'monument' | 'farm';
}
export interface Ward {
  id: number;
  polygon: Polygon;
  center: Point;
  kind: WardKind;
  name: string;
  buildings: Building[];
  withinCity: boolean;
  originalKind?: string;
  seed?: number;
  green?: Polygon;
  marketSpace?: Polygon;
}
export interface MapLabel { text: string; point: Point; angle: number; size: number; path?: Point[] }

/** Unrounded geometry and drawing paths recovered from the original generator. */
export interface OriginalRoad {
  course: Point[];
  path: Point[];
  outlines: Point[][];
}
export interface OriginalBridge { path: Point[]; width: number }
export interface OriginalRiver {
  course: Point[];
  path: Point[];
  width: number;
  bridges: OriginalBridge[];
  mouth?: { origin: Point; next: Point; shoreBefore: Point; shoreAfter: Point; convex: boolean };
}
export interface OriginalWall {
  shape: Polygon;
  segmentMask: boolean[];
  segments: Point[][];
  towers: Point[];
  gates: Point[][];
  thickness: number;
  towerRadius: number;
  castle: boolean;
}
export interface OriginalDistrict {
  name: string;
  polygon: Polygon;
  wardIds: number[];
  type: string;
}
export interface OriginalGeometry {
  earth: Polygon;
  water: Polygon;
  shore: Point[];
  roads: OriginalRoad[];
  rivers: OriginalRiver[];
  walls: OriginalWall[];
  piers: Point[][];
  furrows: Point[][];
  alleys: Point[][];
  districts: OriginalDistrict[];
  treeCrowns?: Polygon[];
}
export interface City {
  options: CityOptions;
  name: string;
  /** Original blueprint name, retained when restoring a cloned naming session. */
  generationName?: string;
  wards: Ward[];
  wall: Polygon;
  castleWall: Polygon;
  gates: Point[];
  roads: Point[][];
  river: Point[];
  riverWidth: number;
  coast: Polygon;
  trees: Point[];
  fields: Polygon[];
  labels: MapLabel[];
  bounds: { x: number; y: number; width: number; height: number };
  originalGeometry?: OriginalGeometry;
}

export type PaletteName = 'default' | 'ink' | 'bw' | 'natural' | 'vivid' | 'modern';
export interface MapStyle {
  palette: PaletteName;
  labels: boolean;
  title: boolean;
  compass: boolean;
  scale: boolean;
  grid: boolean;
  buildings: boolean;
  trees: boolean;
  fields: boolean;
  shadows: boolean;
  roofs: boolean;
  strokeWidth: number;
}
export interface Camera { x: number; y: number; zoom: number }
