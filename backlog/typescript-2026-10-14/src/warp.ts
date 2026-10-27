import type { City, Point } from './model/types';

export type WarpTool = 'move' | 'expand' | 'contract' | 'rotate';

/** Apply a continuous brush to every geometry layer with shared vertices visited once. */
export function warpCity(city: City, center: Point, delta: Point, radius: number, tool: WarpTool): void {
  if (!(radius > 0) || ![center.x, center.y, delta.x, delta.y, radius].every(Number.isFinite)) return;
  const visited = new WeakSet<Point>();
  const transform = (point: Point): void => {
    if (visited.has(point)) return;
    visited.add(point);
    const dx = point.x - center.x, dy = point.y - center.y;
    const t = Math.min(1, Math.hypot(dx, dy) / radius);
    const weight = (1 - t * t) ** 2;
    if (!weight) return;
    if (tool === 'move') {
      point.x += delta.x * weight;
      point.y += delta.y * weight;
    } else if (tool === 'rotate') {
      const angle = (delta.x + delta.y) * 0.015 * weight;
      point.x = center.x + dx * Math.cos(angle) - dy * Math.sin(angle);
      point.y = center.y + dx * Math.sin(angle) + dy * Math.cos(angle);
    } else {
      const distance = Math.min(6, Math.hypot(delta.x, delta.y));
      const scale = Math.exp(distance * 0.009 * weight * (tool === 'expand' ? 1 : -1));
      point.x = center.x + dx * scale;
      point.y = center.y + dy * scale;
    }
  };
  for (const ward of city.wards) {
    ward.polygon.forEach(transform);
    ward.green?.forEach(transform);
    ward.marketSpace?.forEach(transform);
    transform(ward.center);
    for (const building of ward.buildings) {
      building.polygon.forEach(transform);
      building.courtyard?.forEach(transform);
    }
  }
  [city.wall, city.castleWall, city.gates, city.river, city.coast, city.trees, ...city.roads, ...city.fields].forEach(points => points.forEach(transform));
  const original = city.originalGeometry;
  if (original) {
    [original.earth, original.water, original.shore, ...original.piers,
      ...original.furrows, ...original.alleys, ...(original.treeCrowns ?? []),
      ...original.districts.map((district) => district.polygon),
    ].forEach((points) => points.forEach(transform));
    for (const road of original.roads) {
      [road.course, road.path, ...road.outlines].forEach((points) => points.forEach(transform));
    }
    for (const river of original.rivers) {
      [river.course, river.path, ...river.bridges.map((bridge) => bridge.path)].forEach((points) => points.forEach(transform));
      if (river.mouth) {
        const { origin, next, shoreBefore, shoreAfter } = river.mouth;
        [origin, next, shoreBefore, shoreAfter].forEach(transform);
      }
    }
    for (const wall of original.walls) {
      [wall.shape, wall.towers, ...wall.segments, ...wall.gates].forEach((points) => points.forEach(transform));
    }
  }
  for (const label of city.labels) {
    transform(label.point);
    label.path?.forEach(transform);
  }
}
