import type { Building, Camera, City, MapLabel, MapStyle, OriginalGeometry, OriginalRiver, OriginalWall, PaletteName, Point, Polygon, Ward } from '../model/types';
import { layoutOriginalLabel } from './labels';

export interface Palette {
  name: string;
  paper: string;
  ink: string;
  roof: string;
  road: string;
  water: string;
  green: string;
  tree: string;
  wall: string;
  label: string;
}

/** The default colours are recovered from the original application's default.json. */
export const PALETTES: Record<PaletteName, Palette> = {
  default: { name: 'Default', paper: '#CCC5B8', ink: '#1A1917', roof: '#A5A095', road: '#CCC5B8', water: '#7F7A71', green: '#A59F93', tree: '#7F7A71', wall: '#1A1917', label: '#1A1917' },
  ink: { name: 'Ink', paper: '#CCCAC2', ink: '#130F26', roof: '#9A979B', road: '#CCCAC2', water: '#6C6974', green: '#A5A2A2', tree: '#47454C', wall: '#130F26', label: '#150C3F' },
  bw: { name: 'Black & white', paper: '#FFFFFF', ink: '#000000', roof: '#DDDDDD', road: '#FFFFFF', water: '#FFFFFF', green: '#EEEEEE', tree: '#EEEEEE', wall: '#000000', label: '#000000' },
  natural: { name: 'Natural', paper: '#BFBFB5', ink: '#3F322C', roof: '#66707F', road: '#E1DBD5', water: '#8F9997', green: '#8D927B', tree: '#777F66', wall: '#4C4C4C', label: '#662C28' },
  vivid: { name: 'Vivid', paper: '#FFF2C8', ink: '#4C5950', roof: '#D6A36E', road: '#FFF2C8', water: '#779988', green: '#C3CC99', tree: '#667755', wall: '#606661', label: '#2D3D4C' },
  modern: { name: 'Modern', paper: '#E5E5DA', ink: '#333333', roof: '#E5B75B', road: '#CCCCC1', water: '#59A3B2', green: '#CCCCA3', tree: '#777F66', wall: '#666660', label: '#222222' },
};

export const DEFAULT_STYLE: MapStyle = {
  palette: 'default', labels: true, title: true, compass: true, scale: true,
  grid: true, buildings: true, trees: false, fields: true, shadows: true,
  roofs: false, strokeWidth: 1,
};

export interface Viewport { width: number; height: number }
export interface MapTransform { scale: number; x: number; y: number }

/** Camera offsets are screen pixels; its zoom multiplies the fitted world scale. */
export function getMapTransform(city: City, viewport: Viewport, camera: Camera = { x: 0, y: 0, zoom: 1 }): MapTransform {
  const width = Math.max(1, viewport.width);
  const height = Math.max(1, viewport.height);
  const zoom = Number.isFinite(camera.zoom) ? Math.max(0.05, camera.zoom) : 1;
  if (city.originalGeometry) {
    // MapScene.get_mapScale / layoutMap, without changing the model viewport.
    const fitX = width / (Math.max(1, city.bounds.width) + 40);
    const fitY = height / (Math.max(1, city.bounds.height) + 40);
    const minimum = Math.min(fitX, fitY), maximum = Math.max(fitX, fitY);
    const scale = (maximum / minimum > 2 ? maximum / 2 : minimum) * zoom;
    return {
      scale,
      x: width / 2 - (city.bounds.x + city.bounds.width / 2) * scale + (Number.isFinite(camera.x) ? camera.x : 0),
      y: height / 2 - (city.bounds.y + city.bounds.height / 2) * scale + (Number.isFinite(camera.y) ? camera.y : 0),
    };
  }
  const top = Math.min(100, height * 0.13);
  const bottom = Math.min(64, height * 0.08);
  const fit = 0.93 * Math.min(Math.max(width - 48, width * 0.72) / Math.max(1, city.bounds.width),
    Math.max(height - top - bottom, height * 0.6) / Math.max(1, city.bounds.height));
  const scale = fit * zoom;
  return {
    scale,
    x: width / 2 - (city.bounds.x + city.bounds.width / 2) * scale + (Number.isFinite(camera.x) ? camera.x : 0),
    y: top + (height - top - bottom) / 2 - Math.min(40, height * 0.05) - (city.bounds.y + city.bounds.height / 2) * scale + (Number.isFinite(camera.y) ? camera.y : 0),
  };
}

export const fitCamera = getMapTransform;

const n = (value: number): string => Number.isFinite(value) ? String(value) : '0';
export const escapeSvgText = (value: string): string => value.replace(/[&<>"']/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' })[character]!);
const points = (polygon: Polygon): string => polygon.map((point) => `${n(point.x)},${n(point.y)}`).join(' ');
const path = (polygon: Polygon, closed = false): string => polygon.length ? `M${polygon.map((point) => `${n(point.x)} ${n(point.y)}`).join('L')}${closed ? 'Z' : ''}` : '';
const distance = (a: Point, b: Point): number => Math.hypot(b.x - a.x, b.y - a.y);
const lerp = (a: Point, b: Point, t: number): Point => ({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t });

function smoothPath(line: Point[]): string {
  if (line.length < 3) return path(line);
  let result = `M${n(line[0].x)} ${n(line[0].y)}`;
  for (let i = 0; i < line.length - 1; i++) {
    const previous = line[Math.max(0, i - 1)], current = line[i], next = line[i + 1], after = line[Math.min(line.length - 1, i + 2)];
    result += `C${n(current.x + (next.x - previous.x) / 6)} ${n(current.y + (next.y - previous.y) / 6)} ${n(next.x - (after.x - current.x) / 6)} ${n(next.y - (after.y - current.y) / 6)} ${n(next.x)} ${n(next.y)}`;
  }
  return result;
}

function roadPath(road: Point[], city: City): string {
  // Lots are inset against the street graph. Preserve that graph in town and
  // round the country roads only after they leave all populated bounds.
  const outside = road.findIndex((point) => point.x < city.bounds.x || point.x > city.bounds.x + city.bounds.width
    || point.y < city.bounds.y || point.y > city.bounds.y + city.bounds.height);
  if (outside < 0 || road.length - outside < 2) return path(road);
  const join = Math.max(0, outside - 1);
  return path(road.slice(0, join + 1)) + smoothPath(road.slice(join));
}

function buildingPath(building: Building): string {
  return path(building.polygon, true) + (building.courtyard?.length ? path(building.courtyard, true) : '');
}

function roofRidges(polygon: Polygon): string {
  if (polygon.length < 3) return '';
  const center = polygon.reduce((acc, point) => ({ x: acc.x + point.x / polygon.length, y: acc.y + point.y / polygon.length }), { x: 0, y: 0 });
  if (polygon.length !== 4) return polygon.map((point) => path([point, center])).join('');
  const [a, b, c, d] = polygon;
  const long = distance(a, b) > distance(b, c);
  const start = long ? lerp(a, d, 0.5) : lerp(a, b, 0.5);
  const end = long ? lerp(b, c, 0.5) : lerp(c, d, 0.5);
  const ridgeA = lerp(start, end, 0.2), ridgeB = lerp(start, end, 0.8);
  return path([ridgeA, ridgeB]) + (long
    ? path([a, ridgeA, d]) + path([b, ridgeB, c])
    : path([a, ridgeA, b]) + path([c, ridgeB, d]));
}

function renderWard(ward: Ward, style: MapStyle, palette: Palette, originalStroke?: number): string {
  const output = [`<g class="ward ward-${ward.kind}" data-ward-id="${ward.id}" aria-label="${escapeSvgText(ward.name)}">`,
    `<polygon class="ward-hit-area" points="${points(ward.polygon)}" fill="transparent" stroke="none"/>`];
  if (ward.green) output.push(`<polygon class="ward-green" points="${points(ward.green)}" fill="${palette.green}"/>`);
  else if (ward.kind === 'park' && originalStroke === undefined) output.push(`<polygon points="${points(ward.polygon)}" fill="${palette.green}" fill-opacity="0.55"/>`);
  if (originalStroke !== undefined && ward.kind === 'castle' && palette.road !== palette.paper) {
    output.push(`<polygon points="${points(ward.polygon)}" fill="${palette.road}"/>`);
  }
  if (style.buildings) {
    if (style.shadows && originalStroke === undefined) {
      const shadows = ward.buildings.filter((building) => !building.landmark).map(buildingPath).join('');
      output.push(`<path class="building-shadows" d="${shadows}" fill="${palette.ink}" fill-rule="evenodd" opacity="0.7" transform="translate(0 0.38)"/>`);
    }
    if (style.shadows && originalStroke !== undefined) {
      const faces = ward.buildings.filter((building) => !building.landmark)
        .map((building) => buildingFacadePath(building.polygon, -1.2 * (building.role === 'farm' ? 0.3 : 0.5))).join('');
      output.push(`<path class="building-facades" d="${faces}" fill="${palette.wall}" stroke="${palette.ink}" stroke-width="${n(originalStroke)}"/>`);
    }
    for (const building of ward.buildings) {
      const d = buildingPath(building);
      const raised = originalStroke !== undefined && style.shadows && !building.landmark ? -1.2 * (building.role === 'farm' ? 0.3 : 0.5) : 0;
      output.push(`<path class="building${building.landmark ? ' landmark' : ''}" d="${d}"${raised ? ` transform="translate(0 ${n(raised)})"` : ''} fill="${building.landmark ? palette.wall : palette.roof}" fill-rule="evenodd" stroke="${palette.ink}" stroke-width="${n(originalStroke ?? 0.19 * style.strokeWidth)}" stroke-linejoin="round"/>`);
    }
    if (style.roofs) {
      const ridges = ward.buildings.filter((building) => !building.landmark).map((building) => roofRidges(building.polygon)).join('');
      const raised = originalStroke !== undefined && style.shadows ? -1.2 * (ward.kind === 'farm' ? 0.3 : 0.5) : 0;
      output.push(`<path class="roof-ridge" d="${ridges}"${raised ? ` transform="translate(0 ${n(raised)})"` : ''} stroke="${palette.ink}" stroke-width="${n(originalStroke ?? 0.11 * style.strokeWidth)}" fill="none" opacity="0.65"/>`);
    }
  }
  output.push('</g>');
  return output.join('');
}

/** BuildingPainter.paint's raised south-facing facades. */
function buildingFacadePath(polygon: Polygon, height: number): string {
  const faces: string[] = [];
  for (let i = 0; i < polygon.length; i++) {
    const a = polygon[i], b = polygon[(i + 1) % polygon.length];
    if (b.x >= a.x) continue;
    faces.push(path([a, b, { x: b.x, y: b.y + height }, { x: a.x, y: a.y + height }], true));
  }
  return faces.join('');
}

function renderFields(city: City, palette: Palette): string {
  const definitions: string[] = [];
  const plots: string[] = [];
  for (let i = 0; i < city.fields.length; i++) {
    const field = city.fields[i];
    if (field.length < 3) continue;
    const angle = Math.atan2(field[1].y - field[0].y, field[1].x - field[0].x) * 180 / Math.PI;
    definitions.push(`<pattern id="furrows-${i}" width="1.5" height="1.5" patternUnits="userSpaceOnUse" patternTransform="rotate(${n(angle)})"><path d="M0 0V1.5" fill="none" stroke="${palette.green}" stroke-width="0.2"/></pattern>`);
    plots.push(`<polygon points="${points(field)}" fill="url(#furrows-${i})"/>`);
  }
  return `<g class="fields" pointer-events="none"><defs>${definitions.join('')}</defs>${plots.join('')}</g>`;
}

function renderWater(city: City, palette: Palette, stroke: number): string {
  const output = ['<g class="water" pointer-events="none">'];
  if (city.coast.length) {
    output.push(`<path d="${path(city.coast, true)}" fill="${palette.water}" stroke="${palette.ink}" stroke-width="${n(0.25 * stroke)}"/>`);
  }
  if (city.river.length > 1) {
    const riverPath = smoothPath(city.river);
    output.push(`<path d="${riverPath}" fill="none" stroke="${palette.ink}" stroke-width="${n(city.riverWidth + 0.45 * stroke)}" stroke-linejoin="round" stroke-linecap="round"/>`,
      `<path d="${riverPath}" fill="none" stroke="${palette.water}" stroke-width="${n(city.riverWidth)}" stroke-linejoin="round" stroke-linecap="round"/>`);
  }
  output.push('</g>');
  return output.join('');
}

function intersection(a: Point, b: Point, c: Point, d: Point): Point | null {
  const denominator = (b.x - a.x) * (d.y - c.y) - (b.y - a.y) * (d.x - c.x);
  if (Math.abs(denominator) < 1e-8) return null;
  const t = ((c.x - a.x) * (d.y - c.y) - (c.y - a.y) * (d.x - c.x)) / denominator;
  const u = ((c.x - a.x) * (b.y - a.y) - (c.y - a.y) * (b.x - a.x)) / denominator;
  return t >= 0 && t <= 1 && u >= 0 && u <= 1 ? lerp(a, b, t) : null;
}

function renderBridges(city: City, palette: Palette, stroke: number): string {
  const output: string[] = [];
  const crossings: Point[] = [];
  for (const road of city.roads) {
    for (let i = 1; i < road.length; i++) {
      const a = road[i - 1], b = road[i];
      const length = distance(a, b);
      if (length < 0.01) continue;
      for (let j = 1; j < city.river.length; j++) {
        const c = city.river[j - 1], d = city.river[j];
        const point = intersection(a, b, c, d);
        if (!point || crossings.some((other) => distance(point, other) < 3)) continue;
        crossings.push(point);
        const direction = { x: (b.x - a.x) / length, y: (b.y - a.y) / length };
        const riverLength = distance(c, d);
        const sine = Math.abs(direction.x * (d.y - c.y) - direction.y * (d.x - c.x)) / Math.max(0.01, riverLength);
        const half = Math.min(city.riverWidth * 2, city.riverWidth / Math.max(0.3, sine) / 2 + 1.1);
        const start = { x: point.x - direction.x * half, y: point.y - direction.y * half };
        const end = { x: point.x + direction.x * half, y: point.y + direction.y * half };
        output.push(`<path d="${path([start, end])}" stroke="${palette.ink}" stroke-width="${n(3.1 + 0.25 * stroke)}" fill="none"/>`,
          `<path d="${path([start, end])}" stroke="${palette.road}" stroke-width="2.55" fill="none"/>`);
      }
    }
  }
  return `<g class="bridges" pointer-events="none">${output.join('')}</g>`;
}

function renderWall(wall: Polygon, gates: Point[], palette: Palette, castle = false): string {
  if (wall.length < 3) return '';
  const output: string[] = [];
  const gateWidth = 3.2;
  const radius = castle ? 2.15 : 1.8;
  // Gates can lie in the middle of an edge; split that edge instead of painting
  // paper over the opening, which would also erase a river or road beneath it.
  for (let i = 0; i < wall.length; i++) {
    const a = wall[i], b = wall[(i + 1) % wall.length];
    const length = distance(a, b);
    if (length < 0.01) continue;
    const direction = { x: (b.x - a.x) / length, y: (b.y - a.y) / length };
    const openings = gates.map((gate) => {
      const t = ((gate.x - a.x) * direction.x + (gate.y - a.y) * direction.y) / length;
      return { t, point: lerp(a, b, Math.max(0, Math.min(1, t))), gate };
    }).filter((entry) => entry.t > -0.01 && entry.t < 1.01 && distance(entry.point, entry.gate) < 2.3)
      .sort((left, right) => left.t - right.t);
    let position = 0;
    for (const opening of openings) {
      const start = Math.max(0, opening.t - gateWidth / length / 2);
      if (start > position) output.push(`<path d="${path([lerp(a, b, position), lerp(a, b, start)])}"/>`);
      position = Math.min(1, opening.t + gateWidth / length / 2);
    }
    if (position < 1) output.push(`<path d="${path([lerp(a, b, position), b])}"/>`);
  }
  const towers = wall.filter((point) => !gates.some((gate) => distance(point, gate) < gateWidth + 0.5))
    .map((point) => `<circle cx="${n(point.x)}" cy="${n(point.y)}" r="${n(radius)}"/>`).join('');
  const gatehouses = gates.map((gate) => {
    let closestDistance = Infinity, angle = 0;
    for (let i = 0; i < wall.length; i++) {
      const a = wall[i], b = wall[(i + 1) % wall.length], length = distance(a, b);
      if (length < 0.01) continue;
      const t = Math.max(0, Math.min(1, ((gate.x - a.x) * (b.x - a.x) + (gate.y - a.y) * (b.y - a.y)) / (length * length)));
      const gap = distance(gate, lerp(a, b, t));
      if (gap < closestDistance) { closestDistance = gap; angle = Math.atan2(b.y - a.y, b.x - a.x) * 180 / Math.PI; }
    }
    if (closestDistance > 2.3) return '';
    return `<g transform="translate(${n(gate.x)} ${n(gate.y)}) rotate(${n(angle)})"><rect x="-3.6" y="-1.6" width="2" height="3.2"/><rect x="1.6" y="-1.6" width="2" height="3.2"/></g>`;
  }).join('');
  return `<g class="${castle ? 'castle-wall' : 'city-wall'}" pointer-events="none"><g fill="none" stroke="${palette.wall}" stroke-width="1.9" stroke-linejoin="round" stroke-linecap="round">${output.join('')}</g><g fill="${palette.wall}">${towers}${gatehouses}</g></g>`;
}

function renderOriginalRoads(geometry: OriginalGeometry, wards: Ward[], palette: Palette, stroke: number, buildingsVisible: boolean): string {
  const outlines = geometry.roads.flatMap((road) => buildingsVisible ? road.outlines : [road.path]);
  const output = [`<g class="roads original-roads" fill="none" stroke-linejoin="round" pointer-events="none"><g class="road-outlines" stroke="${palette.ink}" stroke-width="${n(2 + 2 * stroke)}" stroke-linecap="butt">`,
    ...outlines.map((line) => `<path d="${path(line)}"/>`),
    `</g><g class="road-fills" stroke="${palette.road}" stroke-width="2" stroke-linecap="round">`,
    ...geometry.roads.map((road) => `<path d="${path(road.path)}"/>`), '</g>'];
  if (palette.road !== palette.paper) {
    for (const ward of wards) {
      if (ward.marketSpace) output.push(`<path class="market-space" d="${path(ward.marketSpace, true)}" fill="${palette.road}" stroke="${palette.road}" stroke-width="2"/>`);
    }
  }
  output.push('</g>');
  return output.join('');
}

function renderOriginalWall(wall: OriginalWall, palette: Palette, stroke: number): string {
  const outline = palette.wall !== palette.ink;
  const segments = wall.segments.map((line) => `<path d="${path(line)}"/>`).join('');
  const output = [`<g class="${wall.castle ? 'castle-wall' : 'city-wall'} original-wall" pointer-events="none">`];
  if (outline) output.push(`<g fill="none" stroke="${palette.ink}" stroke-width="${n(wall.thickness + stroke)}" stroke-linecap="round">${segments}</g>`);
  output.push(`<g fill="none" stroke="${palette.wall}" stroke-width="${n(wall.thickness - (outline ? stroke : 0))}" stroke-linecap="round">${segments}</g>`,
    `<g fill="${palette.wall}"${outline ? ` stroke="${palette.ink}" stroke-width="${n(stroke)}"` : ''}>`);
  for (const tower of wall.towers) output.push(`<circle class="wall-tower" cx="${n(tower.x)}" cy="${n(tower.y)}" r="${n(wall.towerRadius)}"/>`);
  // WallsView.drawGate always uses the city tower radius (1.9), also at castle gates.
  for (const gate of wall.gates) {
    if (gate.length < 2) continue;
    const [a, b] = gate;
    const center = lerp(a, b, 0.5), gap = distance(a, b), angle = Math.atan2(b.y - a.y, b.x - a.x) * 180 / Math.PI;
    output.push(`<g class="wall-gate" transform="translate(${n(center.x)} ${n(center.y)}) rotate(${n(angle)})"><rect x="${n(-gap / 2 - 3.8)}" y="-1.9" width="3.8" height="3.8"/><rect x="${n(gap / 2)}" y="-1.9" width="3.8" height="3.8"/></g>`);
  }
  output.push('</g></g>');
  return output.join('');
}

function renderOriginalMouth(river: OriginalRiver, palette: Palette, stroke: number): string {
  const mouth = river.mouth;
  if (!mouth) return '';
  const half = { x: (mouth.next.x - mouth.origin.x) / 2, y: (mouth.next.y - mouth.origin.y) / 2 };
  const length = Math.hypot(half.x, half.y);
  if (!length) return '';
  const center = lerp(mouth.origin, mouth.next, 0.5), radius = (river.width - stroke) / 2;
  const normal = { x: -half.y / length * radius, y: half.x / length * radius };
  const left = { x: center.x + normal.x, y: center.y + normal.y };
  const right = { x: center.x - normal.x, y: center.y - normal.y };
  const before = lerp(mouth.shoreBefore, mouth.origin, 0.5), after = lerp(mouth.shoreAfter, mouth.origin, 0.5);
  const leftControl = { x: left.x - half.x, y: left.y - half.y };
  const rightControl = { x: right.x - half.x, y: right.y - half.y };
  const beforeControl = lerp(before, mouth.origin, 0.5), afterControl = lerp(after, mouth.origin, 0.5);
  const coordinates = (point: Point) => `${n(point.x)} ${n(point.y)}`;
  const leftBank = `M${coordinates(left)}C${coordinates(leftControl)} ${coordinates(beforeControl)} ${coordinates(before)}`;
  const rightBank = `M${coordinates(right)}C${coordinates(rightControl)} ${coordinates(afterControl)} ${coordinates(after)}`;
  const fill = `${leftBank}${mouth.convex ? `L${coordinates(mouth.origin)}` : ''}L${coordinates(after)}C${coordinates(afterControl)} ${coordinates(rightControl)} ${coordinates(right)}Z`;
  return `<g class="river-mouth"><path d="${fill}" fill="${palette.water}"/><path d="${leftBank}${rightBank}" fill="none" stroke="${palette.ink}" stroke-width="${n(stroke)}"/></g>`;
}

function renderOriginalRivers(geometry: OriginalGeometry, palette: Palette, stroke: number): string {
  const output = ['<g class="rivers" pointer-events="none">'];
  for (const river of geometry.rivers) {
    const d = path(river.path);
    output.push(`<g class="river"><path d="${d}" fill="none" stroke="${palette.ink}" stroke-width="${n(river.width)}" stroke-linecap="butt" stroke-linejoin="round"/>`,
      `<path d="${d}" fill="none" stroke="${palette.water}" stroke-width="${n(Math.max(0, river.width - 2 * stroke))}" stroke-linejoin="round"/>`,
      renderOriginalMouth(river, palette, stroke), '<g class="bridges">');
    for (const bridge of river.bridges) {
      output.push(`<path d="${path(bridge.path)}" fill="none" stroke="${palette.ink}" stroke-width="${n(bridge.width + stroke)}" stroke-linecap="butt"/>`,
        `<path d="${path(bridge.path)}" fill="none" stroke="${palette.road}" stroke-width="${n(Math.max(0, bridge.width - stroke))}"/>`);
    }
    output.push('</g></g>');
  }
  output.push('</g>');
  return output.join('');
}

function renderOriginalPiers(geometry: OriginalGeometry, palette: Palette, stroke: number): string {
  const output = ['<g class="piers" fill="none" stroke-linecap="butt" pointer-events="none">'];
  for (const pier of geometry.piers) {
    if (pier.length < 2) continue;
    const [a, b] = pier;
    if (stroke >= 1.2) output.push(`<path d="${path(pier)}" stroke="${palette.ink}" stroke-width="${n(stroke)}"/>`);
    else {
      const length = distance(a, b);
      const offset = { x: (a.x - b.x) / Math.max(length, 0.001) * stroke, y: (a.y - b.y) / Math.max(length, 0.001) * stroke };
      const inside = pier.map((point) => ({ x: point.x + offset.x, y: point.y + offset.y }));
      output.push(`<path d="${path(pier)}" stroke="${palette.ink}" stroke-width="${n(1.2 + stroke)}"/>`,
        `<path d="${path(inside)}" stroke="${palette.paper}" stroke-width="${n(1.2 - stroke)}"/>`);
    }
  }
  output.push('</g>');
  return output.join('');
}

function renderTrees(trees: Point[], palette: Palette, stroke: number): string {
  return `<g class="trees" fill="${palette.tree}" stroke="${palette.ink}" stroke-width="${n(0.15 * stroke)}" pointer-events="none">${trees.map((point, index) => {
    const radius = 0.6 + ((index * 7) % 11) / 14;
    return `<circle cx="${n(point.x)}" cy="${n(point.y)}" r="${n(radius)}"/><path d="M${n(point.x - radius * 0.5)} ${n(point.y + radius * 0.25)}q${n(radius * 0.4)} ${n(radius * 0.4)} ${n(radius * 0.9)} 0" fill="none" opacity="0.5"/>`;
  }).join('')}</g>`;
}

function renderLabel(label: MapLabel, index: number, palette: Palette, originalScale?: number): string {
  const text = escapeSvgText(label.text.toUpperCase());
  if (originalScale !== undefined && label.path && label.path.length > 1) {
    const letters = layoutOriginalLabel(label, originalScale);
    return `<g class="district-label" aria-label="${text}" fill="${palette.label}" stroke="${palette.paper}" stroke-width="${n(2 * 3.2 / 3 / originalScale)}" paint-order="stroke" stroke-linejoin="round" text-anchor="middle">${letters.map((letter) => `<text transform="translate(${n(letter.point.x)} ${n(letter.point.y)}) rotate(${n(letter.angle)})" y="${n(letter.baseline)}" font-size="${n(letter.size)}">${escapeSvgText(letter.text)}</text>`).join('')}</g>`;
  }
  const attributes = `font-size="${n(label.size)}" fill="${palette.label}" stroke="${palette.paper}" stroke-width="${n(label.size * 0.095)}" paint-order="stroke" stroke-linejoin="round" text-anchor="middle"`;
  if (label.path && label.path.length > 1) {
    return `<defs><path id="label-curve-${index}" d="${smoothPath(label.path)}"/></defs><text ${attributes}><textPath href="#label-curve-${index}" startOffset="50%">${text}</textPath></text>`;
  }
  return `<text x="${n(label.point.x)}" y="${n(label.point.y)}" transform="rotate(${n(label.angle)} ${n(label.point.x)} ${n(label.point.y)})" ${attributes}>${text}</text>`;
}

function renderCompass(viewport: Viewport, palette: Palette): string {
  const radius = Math.min(78, viewport.width * 0.092, viewport.height * 0.11);
  const x = viewport.width - radius - 12, y = viewport.height - radius - 12;
  const output = [`<g class="compass" transform="translate(${n(x)} ${n(y)})" pointer-events="none" stroke="${palette.ink}" stroke-width="0.85"><circle r="${n(radius * 0.8)}" fill="none"/><circle r="${n(radius * 0.54)}" fill="none" stroke-width="0.5"/>`];
  for (let i = 0; i < 4; i++) {
    output.push(`<g transform="rotate(${i * 90})"><path d="M0 0L0 ${n(-radius)}L${n(radius * 0.11)} ${n(-radius * 0.11)}Z" fill="${palette.ink}"/><path d="M0 0L0 ${n(-radius)}L${n(-radius * 0.11)} ${n(-radius * 0.11)}Z" fill="${palette.paper}"/></g>`);
  }
  output.push(`<text x="0" y="${n(-radius - 9)}" text-anchor="middle" font-family="'IM Fell', Georgia, serif" font-size="${n(Math.max(18, radius * 0.34))}" fill="${palette.ink}" stroke="none">N</text></g>`);
  return output.join('');
}

function renderScale(viewport: Viewport, transform: MapTransform, palette: Palette): string {
  // Recovered unit conversion: Db.meters = new Db("m", 0.25).
  const target = Math.min(180, viewport.width * 0.4);
  const targetMetres = target / transform.scale * 4;
  const magnitude = 10 ** Math.floor(Math.log10(targetMetres));
  const normalized = targetMetres / magnitude;
  const step = [1, 2, 4, 5, 10].reduce((best, value) => Math.abs(value - normalized) < Math.abs(best - normalized) ? value : best);
  const metres = step * magnitude;
  const length = metres / 4 * transform.scale;
  const y = viewport.height - 11, x = 10;
  const ticks = [0, 0.25, 0.5, 0.75, 1].map((value) => `M${n(x + length * value)} ${n(y)}v${value % 0.5 === 0 ? '-12' : '-6'}`).join('');
  return `<g class="map-scale" pointer-events="none"><path d="M${x} ${y}h${n(length)}${ticks}" stroke="${palette.ink}" stroke-width="0.55" fill="none" opacity="0.7"/><g font-family="'IM Fell', Georgia, serif" font-size="19" fill="${palette.ink}"><text x="${x}" y="${y - 20}" text-anchor="middle">0</text><text x="${n(x + length / 2)}" y="${y - 20}" text-anchor="middle">${n(metres / 2)}</text><text x="${n(x + length)}" y="${y - 20}" text-anchor="middle">${n(metres)} m</text></g></g>`;
}

/** Produce actual editable vector geometry, including every visible lot. */
export function renderMap(city: City, style: MapStyle, viewport: Viewport, camera?: Camera): string {
  const width = Math.max(1, viewport.width), height = Math.max(1, viewport.height);
  const palette = PALETTES[style.palette] ?? PALETTES.default;
  const transform = getMapTransform(city, viewport, camera);
  const original = city.originalGeometry;
  const originalStroke = 1.6 / 3 * style.strokeWidth / transform.scale;
  const visible = { x: -transform.x / transform.scale, y: -transform.y / transform.scale, width: width / transform.scale, height: height / transform.scale };
  const output = [`<svg id="city-map" xmlns="http://www.w3.org/2000/svg" width="${n(width)}" height="${n(height)}" viewBox="0 0 ${n(width)} ${n(height)}" preserveAspectRatio="xMidYMid meet" role="img" aria-labelledby="map-title map-description">`,
    `<title id="map-title">${escapeSvgText(city.name)}</title><desc id="map-description">A generated medieval city with ${city.options.size} wards. Seed ${city.options.seed}.</desc>`,
    `<rect width="100%" height="100%" fill="${palette.paper}"/>`,
    `<g id="map-geometry" transform="translate(${n(transform.x)} ${n(transform.y)}) scale(${n(transform.scale)})">`];
  const grid = style.grid ? `<defs><pattern id="map-grid" width="50" height="50" patternUnits="userSpaceOnUse"><path d="M50 0H0V50" fill="none" stroke="${palette.ink}" stroke-width="${n(0.5 / transform.scale)}" opacity="0.38"/></pattern></defs><rect class="map-grid" x="${n(visible.x)}" y="${n(visible.y)}" width="${n(visible.width)}" height="${n(visible.height)}" fill="url(#map-grid)" pointer-events="none"/>` : '';
  if (!original) output.push(grid);
  if (original) {
    if (city.coast.length) output.push(`<path class="coast" d="${path(city.coast, true)}" fill="${palette.water}" stroke="${palette.ink}" stroke-width="${n(originalStroke)}" pointer-events="none"/>`);
    output.push(renderOriginalRoads(original, city.wards, palette, originalStroke, style.buildings));
    output.push(renderOriginalRivers(original, palette, originalStroke));
    if (style.fields) output.push(`<g class="fields original-fields" fill="none" stroke="${palette.green}" stroke-width="${n(originalStroke)}" stroke-linecap="butt" pointer-events="none">${original.furrows.map((furrow) => `<path d="${path(furrow)}"/>`).join('')}</g>`);
    output.push(renderOriginalPiers(original, palette, originalStroke));
  } else {
    if (style.fields) output.push(renderFields(city, palette));
    const roadPaths = city.roads.map((road) => `<path d="${roadPath(road, city)}"/>`).join('');
    output.push(`<g class="roads" fill="none" stroke-linejoin="round" stroke-linecap="round" pointer-events="none"><g stroke="${palette.ink}" stroke-width="${n(2 + 0.24 * style.strokeWidth)}">${roadPaths}</g><g stroke="${palette.road}" stroke-width="2">${roadPaths}</g></g>`);
    output.push(renderWater(city, palette, style.strokeWidth));
    if (city.river.length > 1) output.push(renderBridges(city, palette, style.strokeWidth));
  }
  output.push(city.wards.map((ward) => renderWard(ward, style, palette, original ? originalStroke : undefined)).join(''));
  if (style.trees) {
    if (original?.treeCrowns) {
      const crowns = original.treeCrowns.map((crown) => `<path d="${path(crown, true)}"/>`).join('');
      output.push(`<g class="trees original-trees" pointer-events="none"><g fill="none" stroke="${palette.ink}" stroke-width="${n(2 * originalStroke)}">${crowns}</g><g fill="${palette.tree}">${crowns}</g></g>`);
    } else output.push(renderTrees(city.trees, palette, style.strokeWidth));
  }
  if (original) output.push(...original.walls.map((wall) => renderOriginalWall(wall, palette, originalStroke)));
  else {
    output.push(renderWall(city.wall, city.gates, palette));
    output.push(renderWall(city.castleWall, [], palette, true));
  }
  if (original) output.push(grid);
  if (style.labels) output.push(`<g class="district-labels" font-family="'IM Fell', Georgia, serif" pointer-events="none">${city.labels.map((label, index) => renderLabel(label, index, palette, original ? transform.scale : undefined)).join('')}</g>`);
  output.push('</g>');
  if (style.title) {
    const size = Math.min(54, Math.max(26, width * 0.055), width / Math.max(12, city.name.length) * 1.55);
    output.push(`<text class="city-title" x="${n(width / 2)}" y="${n(size * 1.12)}" text-anchor="middle" font-family="'IM Fell', Georgia, serif" font-size="${n(size)}" font-weight="400" fill="${palette.label}" pointer-events="none">${escapeSvgText(city.name)}</text>`);
  }
  if (style.compass) output.push(renderCompass({ width, height }, palette));
  if (style.scale) output.push(renderScale({ width, height }, transform, palette));
  output.push('</svg>');
  return output.join('');
}
