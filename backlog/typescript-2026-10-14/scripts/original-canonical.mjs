export function canonicalCity(city, classes, enums, rngSeed) {
  const groups = [...new Set(city.cells.map(cell => cell.ward.group).filter(Boolean))];
  const point = value => value == null ? null : [value.x, value.y];
  const className = value => value?.__class__?.__name__ ?? null;
  const edge = value => ({
    from: point(value.origin.point), to: point(value.next.origin.point),
    type: value.data?._hx_index ?? null,
    face: city.cells.indexOf(value.face?.data),
    twinFace: city.cells.indexOf(value.twin?.face?.data),
  });
  const loose = value => {
    if (value == null) return null;
    if (typeof value === 'number') return Number.isFinite(value) ? value : String(value);
    if (typeof value !== 'object') return typeof value === 'function' ? undefined : value;
    if (Array.isArray(value)) return value.map(loose);
    if (typeof value.x === 'number' && typeof value.y === 'number') return point(value);
    const type = className(value);
    if (type === 'com.watabou.geom.Vertex') return point(value.point);
    if (type === 'com.watabou.geom.HalfEdge') return edge(value);
    if (type === 'com.watabou.geom.Face') return city.cells.indexOf(value.data);
    if (type === 'com.watabou.mfcg.model.Cell') return city.cells.indexOf(value);
    if (type === 'com.watabou.mfcg.model.District') return city.districts.indexOf(value);
    if (type === 'com.watabou.mfcg.model.wards.WardGroup') return groups.indexOf(value);
    if (type === 'haxe.ds.ObjectMap') return undefined;
    const result = {};
    for (const key of Object.keys(value).sort()) {
      if (key.startsWith('__') || key === 'hx__closures__' || key === 'model' || key === 'city' || key === 'patch' || key === 'view' || key.startsWith('cache')) continue;
      const item = loose(value[key]);
      if (item !== undefined) result[key] = item;
    }
    return result;
  };
  const wall = value => value == null ? null : ({
    real: value.real, shape: loose(value.shape), segments: loose(value.segments),
    gates: loose(value.gates), towers: loose(value.towers), coastTowers: loose(value.coastTowers),
    patches: value.patches.map(cell => city.cells.indexOf(cell)), edges: value.edges.map(edge),
  });
  const ward = value => {
    const result = { type: className(value) };
    for (const key of Object.keys(value).sort()) {
      if (key.startsWith('__') || key === 'hx__closures__' || ['model', 'patch', 'wall'].includes(key)) continue;
      const item = loose(value[key]);
      if (item !== undefined) result[key] = item;
    }
    if (value.wall) result.wall = wall(value.wall);
    return result;
  };
  return {
    name: city.name, rngSeed, blueprint: loose(city.bp), nPatches: city.nPatches,
    center: point(city.center), north: city.north,
    bounds: { x: city.bounds.x, y: city.bounds.y, width: city.bounds.width, height: city.bounds.height },
    cells: city.cells.map(cell => ({
      seed: cell.seed, withinCity: cell.withinCity, withinWalls: cell.withinWalls,
      waterbody: cell.waterbody, landing: cell.landing ?? null,
      shape: loose(cell.shape), ward: ward(cell.ward), district: city.districts.indexOf(cell.district),
    })),
    inner: city.inner.map(cell => city.cells.indexOf(cell)),
    plaza: city.cells.indexOf(city.plaza), citadel: city.cells.indexOf(city.citadel),
    groups: groups.map(group => {
      const result = {};
      for (const key of ['faces', 'core', 'urban', 'district', 'shape', 'inner', 'border', 'alleys', 'blocks']) result[key] = loose(group[key]);
      result.church = group.blocks.indexOf(group.church);
      return result;
    }),
    districts: city.districts.map(district => {
      const result = {};
      for (const key of ['name', 'type', 'faces', 'greenery', 'alleys', 'border', 'ridge', 'equator', 'groups']) result[key] = loose(district[key]);
      return result;
    }),
    wall: wall(city.wall), walls: city.walls.map(wall), border: wall(city.border),
    gates: loose(city.gates), streets: loose(city.streets), roads: loose(city.roads), arteries: loose(city.arteries),
    canals: loose(city.canals), horizon: loose(city.horizon), earthEdge: loose(city.earthEdge),
    waterEdge: loose(city.waterEdge), shore: loose(city.shore), landmarks: loose(city.landmarks),
  };
}
