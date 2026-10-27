import type {
  Building, City, CityOptions, MapLabel, OriginalBridge, OriginalDistrict,
  OriginalGeometry, OriginalRiver, OriginalRoad, OriginalWall, Point, Polygon, Ward, WardKind,
} from './types';

// The extracted Haxe runtime is dynamic. Keep that boundary here, and describe
// the model fields the renderer consumes instead of passing its cyclic objects
// into the UI or modifying any generated coordinates.
interface RawVertex { point: Point; edges: RawEdge[]; __id__: number }
interface RawEdge { origin: RawVertex; next: RawEdge; face: RawFace; twin?: RawEdge }
interface RawFace { data: RawCell }
interface RawMap<K, V> {
  keys(): { hasNext(): boolean; next(): K };
  get(key: K): V;
}
interface RawBlock { shape: Polygon; lots: Polygon[]; buildings?: Polygon[]; rects?: Polygon[] }
interface RawGroup { core: RawFace; blocks: RawBlock[]; church?: RawBlock; alleys: Point[][] }
interface RawDistrict {
  name: string;
  border: RawEdge[];
  faces: RawFace[];
  groups: RawGroup[];
  type: { _hx_name: string };
  equator: Point[];
  getRidge(): Point[];
}
interface RawWard {
  __class__: { __name__: string };
  group?: RawGroup;
  building?: Polygon | Polygon[];
  buildings?: Polygon[];
  wall?: RawWall;
  monument?: Polygon;
  space?: Polygon;
  green?: Polygon;
  subPlots?: Polygon[];
  furrows?: { start: Point; end: Point }[];
  piers?: Point[][];
  spawnTrees(): Point[] | null;
}
interface RawCell {
  shape: Polygon;
  face: RawFace;
  ward: RawWard;
  district?: RawDistrict;
  withinCity: boolean;
  withinWalls: boolean;
  waterbody: boolean;
  seed: number;
}
interface RawWall {
  shape: Polygon;
  edges: RawEdge[];
  segments: boolean[];
  towers: RawVertex[];
  gates: RawVertex[];
  watergates: RawMap<RawVertex, RawCanal>;
}
interface RawCanal {
  course: RawEdge[];
  width: number;
  bridges: RawMap<RawVertex, RawEdge[] | null>;
}
interface RawCity {
  name: string;
  cells: RawCell[];
  inner: RawCell[];
  districts: RawDistrict[];
  walls: RawWall[];
  wall?: RawWall;
  citadel?: RawCell;
  gates: RawVertex[];
  arteries: RawEdge[][];
  canals: RawCanal[];
  earthEdge: Polygon;
  waterEdge: Polygon;
  shore: Point[];
  bounds: City['bounds'];
  getOcean(): Polygon;
}

/** Project the original model into serializable UI data without regenerating it. */
export function adaptOriginalCity(raw: unknown, options: CityOptions, treeRenderer?: { getTree(): Polygon }): City {
  const model = raw as RawCity;
  const copies = new WeakMap<Point, Point>();
  const point = (source: Point): Point => {
    let result = copies.get(source);
    if (!result) {
      result = { x: source.x, y: source.y };
      copies.set(source, result);
    }
    return result;
  };
  const polygon = (source: readonly Point[]): Polygon => source.map(point);
  const polygons = (source: readonly Polygon[]): Polygon[] => source.map(polygon);
  const wards: Ward[] = [];
  const fields: Polygon[] = [];
  const piers: Point[][] = [];
  const furrows: Point[][] = [];
  const trees: Point[] = [];
  const treeCrowns: Polygon[] = [];
  const inner = new Set(model.inner);
  const cellIds = new Map(model.cells.map((cell, index) => [cell, index]));

  for (const [id, cell] of model.cells.entries()) {
    const source = cell.ward;
    const originalKind = source.__class__.__name__.split('.').at(-1)!;
    const kind = wardKind(originalKind, options.shantytown && !inner.has(cell));
    // Wilderness and water cells carry no building graphics in PatchView.draw.
    // Their terrain survives in originalGeometry.earth/water/shore.
    if (!kind) continue;
    const buildings: Building[] = [];
    const addBuilding = (shape: Polygon, role: NonNullable<Building['role']>, landmark = false): void => {
      buildings.push({ polygon: polygon(shape), landmark, role });
    };
    switch (originalKind) {
      case 'Alleys': {
        const group = source.group!;
        if (group.core === cell.face) {
          for (const block of group.blocks) {
            for (const lot of block.lots) addBuilding(lot, block === group.church ? 'church' : 'lot', block === group.church);
          }
        }
        break;
      }
      case 'Castle': addBuilding(source.building as Polygon, 'castle', true); break;
      case 'Cathedral':
        for (const building of source.building as Polygon[]) addBuilding(building, 'temple', true);
        break;
      case 'Market':
        if (source.monument) addBuilding(source.monument, 'monument', true);
        break;
      case 'Farm':
        for (const building of source.buildings!) addBuilding(building, 'farm');
        fields.push(...polygons(source.subPlots!));
        furrows.push(...source.furrows!.map((line) => polygon([line.start, line.end])));
        break;
      case 'Harbour': piers.push(...polygons(source.piers!)); break;
    }
    const ward: Ward = {
      id, polygon: polygon(cell.shape), center: center(cell.shape), kind,
      name: cell.district?.name ?? ({ Castle: 'Castle', Cathedral: 'Temple', Market: 'Market', Farm: 'Farmland', Harbour: 'Harbour' }[originalKind] ?? originalKind),
      buildings, withinCity: cell.withinCity, originalKind, seed: cell.seed,
    };
    if (source.green) ward.green = polygon(source.green);
    if (source.space) ward.marketSpace = polygon(source.space);
    wards.push(ward);
  }

  // These are the original lazy tree generators, including courtyard and farm
  // edge planting. No substitute scattering or random source is introduced.
  for (const cell of model.cells) {
    const spawned = cell.ward.spawnTrees();
    if (spawned) {
      for (const position of spawned) {
        trees.push(point(position));
        // TreesLayer.addCityTrees interleaves each ward's tree generator with
        // getTree() for each crown. Farm tree generation uses this RNG state.
        if (treeRenderer) treeCrowns.push(treeRenderer.getTree().map((vertex) => ({
          x: vertex.x + position.x, y: vertex.y + position.y,
        })));
      }
    }
  }

  const districts: OriginalDistrict[] = model.districts.map((district) => ({
    name: district.name,
    polygon: polygon(chainPoints(district.border, true)),
    wardIds: district.faces.map((face) => cellIds.get(face.data)!),
    type: district.type._hx_name,
  }));
  const labels: MapLabel[] = model.districts.map((district) => {
    const ridge = polygon(district.getRidge());
    const first = ridge[0];
    const last = ridge[ridge.length - 1];
    return {
      text: district.name, point: center(ridge),
      angle: first && last ? Math.atan2(last.y - first.y, last.x - first.x) * 180 / Math.PI : 0,
      size: 9, path: ridge,
    };
  });
  const originalRoads = model.arteries.map((chain) => adaptRoad(chain, polygon));
  const originalRivers = model.canals.map((canal) => adaptRiver(canal, model.shore, polygon));
  const castleWall = model.citadel?.ward.wall;
  const originalWalls = model.walls.map((wall) => adaptWall(wall, wall === castleWall, polygon));
  const water = polygon(model.waterEdge);
  const originalGeometry: OriginalGeometry = {
    earth: polygon(model.earthEdge), water, shore: polygon(model.shore),
    roads: originalRoads, rivers: originalRivers, walls: originalWalls,
    piers, furrows, districts,
    alleys: model.districts.flatMap((district) => district.groups.flatMap((group) => polygons(group.alleys))),
    ...(treeRenderer ? { treeCrowns } : {}),
  };
  return {
    options: { ...options }, name: model.name, wards,
    wall: model.wall ? polygon(model.wall.shape) : [],
    castleWall: castleWall ? polygon(castleWall.shape) : [],
    gates: model.gates.map((vertex) => point(vertex.point)),
    roads: originalRoads.map((road) => road.course),
    river: originalRivers[0]?.course ?? [], riverWidth: originalRivers[0]?.width ?? 0,
    coast: water.length ? polygon(model.getOcean()) : [],
    trees, fields, labels, bounds: { ...model.bounds }, originalGeometry,
  };
}

function wardKind(originalKind: string, sprawl: boolean): WardKind | undefined {
  switch (originalKind) {
    case 'Alleys': return sprawl ? 'slum' : 'residential';
    case 'Castle': return 'castle';
    case 'Cathedral': return 'temple';
    case 'Market': return 'market';
    case 'Farm': return 'farm';
    case 'Park': return 'park';
    case 'Harbour': return 'harbour';
    default: return undefined;
  }
}

function center(points: readonly Point[]): Point {
  let x = 0;
  let y = 0;
  for (const point of points) { x += point.x; y += point.y; }
  return { x: x / points.length, y: y / points.length };
}
function chainPoints(chain: readonly RawEdge[], closed = false): Point[] {
  const result = chain.map((edge) => edge.origin.point);
  if (!closed && chain.length) result.push(chain[chain.length - 1].next.origin.point);
  return result;
}
function subtract(a: Point, b: Point): Point { return { x: a.x - b.x, y: a.y - b.y }; }
function add(a: Point, b: Point): Point { return { x: a.x + b.x, y: a.y + b.y }; }
function length(point: Point): number { return Math.sqrt(point.x * point.x + point.y * point.y); }
function distance(a: Point, b: Point): number { return length(subtract(a, b)); }
function normalize(vector: Point, amount: number): Point {
  if (vector.x === 0 && vector.y === 0) return { ...vector };
  amount /= length(vector);
  return { x: vector.x * amount, y: vector.y * amount };
}
function lerp(a: Point, b: Point, amount = 0.5): Point {
  return { x: a.x + (b.x - a.x) * amount, y: a.y + (b.y - a.y) * amount };
}
function edgeVector(edge: RawEdge): Point { return subtract(edge.next.origin.point, edge.origin.point); }
function mapEntries<K, V>(map: RawMap<K, V>): [K, V][] {
  const result: [K, V][] = [];
  const keys = map.keys();
  while (keys.hasNext()) {
    const key = keys.next();
    result.push([key, map.get(key)]);
  }
  return result;
}

// Original Chaikin.render and RoadsView.smoothRoad projection, mfcg.pretty.js
// 7380–7408 and 11202–11225. Identity comparisons keep street junctions fixed.
function chaikin(points: Point[], fixed: readonly Point[]): Point[] {
  for (let pass = 0; pass < 3; pass++) {
    const result: Point[] = [];
    for (let i = 1; i < points.length - 1; i++) {
      const point = points[i];
      if (fixed.includes(point)) result.push(point);
      else result.push(lerp(point, points[i - 1], 0.25), lerp(point, points[i + 1], 0.25));
    }
    result.unshift(points[0]);
    result.push(points[points.length - 1]);
    points = result;
  }
  return points;
}
function smoothRoad(points: Point[], fixed: Point[]): Point[] {
  const result = chaikin(points, fixed);
  for (const point of fixed) {
    const index = result.indexOf(point);
    if (index <= 0 || index === result.length - 1) continue;
    const before = result[index - 1];
    const after = result[index + 1];
    const beforeLength = distance(before, point);
    const afterLength = distance(point, after);
    if (beforeLength <= 0.5 || afterLength <= 0.5) continue;
    const first = lerp(before, point, (beforeLength - 1) / beforeLength);
    const second = lerp(after, point, (afterLength - 1) / afterLength);
    result.splice(index, 1, first, second);
  }
  return result;
}
function adaptRoad(chain: RawEdge[], copy: (points: Point[]) => Polygon): OriginalRoad {
  const course = chainPoints(chain);
  const fixed: Point[] = [];
  const outside: number[] = [];
  chain.forEach((edge, index) => {
    let entirelyInside = true;
    let entirelyOutside = true;
    for (const neighbor of edge.origin.edges) {
      if (neighbor.face.data.withinCity) entirelyOutside = false;
      else entirelyInside = false;
    }
    if (!entirelyOutside) fixed.push(edge.origin.point);
    if (!entirelyInside) outside.push(index);
  });
  const runs: number[][] = [];
  outside.forEach((index, i) => {
    if (i === 0 || index - 1 !== outside[i - 1]) runs.push([]);
    runs[runs.length - 1].push(index);
  });
  const outlines = runs.map((run) => {
    if (run[0] > 0) run.unshift(run[0] - 1);
    if (run[run.length - 1] < course.length - 1) run.push(run[run.length - 1] + 1);
    return copy(smoothRoad(run.map((index) => course[index]), fixed));
  });
  return { course: copy(course), path: copy(smoothRoad(course, fixed)), outlines };
}

// Original RiverView.update bridge geometry, 11019–11119. The model identifies
// crossings; this does not infer intersections from arbitrary road segments.
function adaptRiver(canal: RawCanal, shore: Point[], copy: (points: Point[]) => Polygon): OriginalRiver {
  const entries = mapEntries(canal.bridges);
  const course = chainPoints(canal.course);
  const rendered = course.slice();
  if (shore.length) rendered[0] = lerp(rendered[0], rendered[1]);
  const path = chaikin(rendered, entries.map(([vertex]) => vertex.point));
  const halfWidth = (canal.width + 1.2) / 2;
  const bridges: OriginalBridge[] = entries.map(([vertex, road]) => {
    const point = vertex.point;
    const canalIndex = canal.course.findIndex((edge) => edge.origin === vertex);
    let direction = edgeVector(canal.course[canalIndex]);
    if (canalIndex > 0) direction = add(direction, edgeVector(canal.course[canalIndex - 1]));
    if (road === null) {
      const normal = normalize({ x: -direction.y, y: direction.x }, halfWidth);
      return { path: copy([subtract(point, normal), add(point, normal)]), width: 1.2 };
    }
    const roadIndex = road.findIndex((edge) => edge.origin === vertex);
    let start: Point;
    let end: Point;
    if (roadIndex === 0) {
      const normal = normalize({ x: -direction.y, y: direction.x }, halfWidth);
      const sideA = add(point, normal);
      const sideB = subtract(point, normal);
      start = add(point, normalize(edgeVector(road[roadIndex]), halfWidth));
      end = distance(start, sideA) > distance(start, sideB) ? sideA : sideB;
    } else {
      const roadDirection = add(edgeVector(road[roadIndex - 1]), edgeVector(road[roadIndex]));
      const sine = Math.abs((roadDirection.x * direction.y - roadDirection.y * direction.x) / length(roadDirection) / length(direction));
      const extent = halfWidth / sine;
      start = add(point, normalize(edgeVector(road[roadIndex]), extent));
      end = subtract(point, normalize(edgeVector(road[roadIndex - 1]), extent));
    }
    return { path: copy([start, end]), width: 2 };
  });
  const river: OriginalRiver = { course: copy(course), path: copy(path), width: canal.width, bridges };
  if (shore.length) {
    const origin = course[0];
    const index = shore.indexOf(origin);
    const before = shore[(index + shore.length - 1) % shore.length];
    const after = shore[(index + 1) % shore.length];
    const [mouthOrigin, next, shoreBefore, shoreAfter] = copy([origin, course[1], before, after]);
    river.mouth = {
      origin: mouthOrigin, next, shoreBefore, shoreAfter,
      convex: (origin.x - before.x) * (after.y - origin.y) - (origin.y - before.y) * (after.x - origin.x) > 0,
    };
  }
  return river;
}

// Original WallsView.draw (11678–11776): segment masks, real tower locations,
// and openings around city/castle/water gates are retained without resampling.
function adaptWall(wall: RawWall, castle: boolean, copy: (points: Point[]) => Polygon): OriginalWall {
  const openings = new Map<RawVertex, Point[]>();
  const makeOpening = (vertex: RawVertex, width: number): void => {
    const index = wall.edges.findIndex((edge) => edge.origin === vertex);
    const previous = wall.edges[(index + wall.edges.length - 1) % wall.edges.length];
    const next = wall.edges[index];
    openings.set(vertex, [
      add(vertex.point, normalize(edgeVector(previous), -width / 2)),
      add(vertex.point, normalize(edgeVector(next), width / 2)),
    ]);
  };
  for (const gate of wall.gates) makeOpening(gate, 2);
  for (const [vertex, canal] of mapEntries(wall.watergates)) makeOpening(vertex, canal.width);
  const segments: Point[][] = [];
  wall.edges.forEach((edge, index) => {
    if (!wall.segments[index]) return;
    const from = openings.get(edge.origin);
    const to = openings.get(edge.next.origin);
    segments.push(copy([
      from ? add(from[1], normalize(edgeVector(edge), 1.9)) : edge.origin.point,
      to ? add(to[0], normalize(edgeVector(edge), -1.9)) : edge.next.origin.point,
    ]));
  });
  return {
    shape: copy(wall.shape), segmentMask: wall.segments.slice(), segments,
    towers: copy(wall.towers.map((vertex) => vertex.point)),
    // Haxe ObjectMap.iterator enumerates numeric object IDs, not insertion
    // order; that is also the original drawing order for overlapping gates.
    gates: [...openings.entries()].sort(([a], [b]) => a.__id__ - b.__id__).map(([, opening]) => copy(opening)), thickness: 1.9,
    towerRadius: castle ? 2.5 : 1.9, castle,
  };
}
