import { describe, expect, it } from 'vitest';
import type { City, Point } from '../src/model/types';
import { DEFAULT_OPTIONS } from '../src/state';
import { warpCity } from '../src/warp';

describe('warping original generator geometry', () => {
  it('moves every recovered drawing layer and visits shared vertices once', () => {
    const vertices: Point[] = [];
    const vertex = (): Point => {
      const point = { x: 0, y: 0 };
      vertices.push(point);
      return point;
    };
    const shared = vertex();
    const city: City = {
      options: { ...DEFAULT_OPTIONS }, name: 'Original',
      wards: [{
        id: 0, polygon: [shared, vertex()], center: vertex(), kind: 'market', name: 'Square', withinCity: true,
        buildings: [{ polygon: [shared, vertex()], landmark: true, courtyard: [vertex()] }],
        green: [vertex()], marketSpace: [shared, vertex()],
      }],
      wall: [shared], castleWall: [vertex()], gates: [shared], roads: [[shared, vertex()]],
      river: [shared, vertex()], riverWidth: 5, coast: [vertex()], trees: [vertex()], fields: [[vertex()]],
      labels: [{ text: 'Square', point: vertex(), angle: 0, size: 9, path: [vertex()] }],
      bounds: { x: -10, y: -10, width: 20, height: 20 },
      originalGeometry: {
        earth: [vertex()], water: [vertex()], shore: [vertex()],
        roads: [{ course: [shared, vertex()], path: [shared, vertex()], outlines: [[vertex()]] }],
        rivers: [{
          course: [shared, vertex()], path: [vertex()], width: 5,
          bridges: [{ path: [vertex()], width: 2 }],
          mouth: { origin: shared, next: vertex(), shoreBefore: vertex(), shoreAfter: vertex(), convex: true },
        }],
        walls: [{
          shape: [shared, vertex()], segmentMask: [true], segments: [[shared, vertex()]],
          towers: [vertex()], gates: [[vertex()]], thickness: 1.9, towerRadius: 2.5, castle: true,
        }],
        piers: [[vertex()]], furrows: [[vertex()]], alleys: [[vertex()]], treeCrowns: [[vertex()]],
        districts: [{ name: 'Square', polygon: [shared, vertex()], wardIds: [0], type: 'CENTER' }],
      },
    };

    warpCity(city, { x: 0, y: 0 }, { x: 2, y: -1 }, 10, 'move');

    for (const point of vertices) expect(point).toEqual({ x: 2, y: -1 });
    expect(city.originalGeometry!.walls[0].thickness).toBe(1.9);
    expect(city.originalGeometry!.rivers[0].width).toBe(5);
    expect(city.originalGeometry!.walls[0].segmentMask).toEqual([true]);
  });
});
