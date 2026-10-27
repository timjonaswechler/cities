import { describe, expect, it } from 'vitest';
import type { City, OriginalGeometry } from '../src/model/types';
import { DEFAULT_STYLE, getMapTransform, PALETTES, renderMap } from '../src/render/map';
import { layoutOriginalLabel, originalLabelRidge } from '../src/render/labels';

const square = [{ x: -10, y: -10 }, { x: 10, y: -10 }, { x: 10, y: 10 }, { x: -10, y: 10 }];
function fixture(): City {
  return {
    name: 'A <city> & "town"',
    options: { seed: 1, size: 1, citadel: false, urban_castle: false, plaza: false, temple: false, walls: true, shantytown: false, coast: false, river: true, greens: false, gates: 1 },
    wards: [{ id: 7, name: 'A "quoted" ward', polygon: square, center: { x: 0, y: 0 }, kind: 'residential', withinCity: true, buildings: [{ polygon: square, landmark: false }] }],
    wall: square, castleWall: [], gates: [{ x: 0, y: -10 }], roads: [[{ x: 0, y: -40 }, { x: 0, y: 40 }]],
    river: [{ x: -40, y: 25 }, { x: 40, y: 25 }], riverWidth: 5, coast: [], trees: [{ x: 15, y: 15 }], fields: [square],
    labels: [{ text: 'Old <Town>', point: { x: 0, y: 0 }, angle: 0, size: 5 }],
    bounds: { x: -20, y: -30, width: 40, height: 60 },
  };
}

function originalFixture(): City {
  const city = fixture();
  const original: OriginalGeometry = {
    earth: square, water: [], shore: [],
    roads: [{ course: city.roads[0], path: [{ x: 0.123456789012345, y: -40 }, { x: 1.5, y: 0 }, { x: 3.25, y: 40 }], outlines: [[{ x: 3.25, y: 20 }, { x: 3.25, y: 40 }]] }],
    rivers: [
      { course: city.river, path: city.river, width: 5, bridges: [{ path: [{ x: 0, y: 22 }, { x: 0, y: 28 }], width: 2 }] },
      { course: [{ x: -40, y: -20 }, { x: 40, y: -20 }], path: [{ x: -40, y: -20 }, { x: 0, y: -18 }, { x: 40, y: -20 }], width: 4, bridges: [] },
    ],
    walls: [{ shape: square, segmentMask: [true, false, false, false], segments: [[{ x: -10, y: -10 }, { x: -4, y: -10 }]], towers: [{ x: -10, y: -10 }], gates: [[{ x: -1, y: -10 }, { x: 1, y: -10 }]], thickness: 1.9, towerRadius: 1.9, castle: false }],
    piers: [[{ x: 20, y: 10 }, { x: 25, y: 10 }]],
    furrows: [[{ x: -20, y: -15 }, { x: -15, y: -10 }], [{ x: -20, y: -14 }, { x: -15, y: -9 }]],
    alleys: [], districts: [],
  };
  city.originalGeometry = original;
  return city;
}

describe('map renderer', () => {
  it('keeps user supplied map and ward names as inert SVG text', () => {
    const city = fixture();
    city.name = '</title><script>alert(1)</script>';
    city.wards[0].name = '" onload="alert(1)';
    city.labels[0].text = '<image href="https://example.com/track"/>';
    const svg = renderMap(city, DEFAULT_STYLE, { width: 1280, height: 800 });
    expect(svg).not.toContain('<script>');
    expect(svg).not.toContain('<image');
    expect(svg).not.toContain(' onload="');
    expect(svg).toContain('&lt;/title&gt;');
    expect(svg).toContain('&quot; onload=&quot;');
  });

  it('renders stable vectors without changing the source model', () => {
    const city = fixture();
    const before = JSON.stringify(city);
    const svg = renderMap(city, { ...DEFAULT_STYLE, trees: true, roofs: true }, { width: 1280, height: 800 });
    expect(svg).toBe(renderMap(city, { ...DEFAULT_STYLE, trees: true, roofs: true }, { width: 1280, height: 800 }));
    expect(JSON.stringify(city)).toBe(before);
    expect(svg).toContain('data-ward-id="7"');
    expect(svg).toContain('class="bridges"');
    expect(svg).toContain('class="roof-ridge"');
    expect(svg).not.toMatch(/\b(?:NaN|Infinity|undefined)\b/);
  });

  it('maps camera offsets to screen pixels at every zoom level', () => {
    const city = fixture(), viewport = { width: 1280, height: 800 };
    const fit = getMapTransform(city, viewport);
    const camera = getMapTransform(city, viewport, { x: 73, y: -26, zoom: 3 });
    const center = { x: city.bounds.x + city.bounds.width / 2, y: city.bounds.y + city.bounds.height / 2 };
    expect(camera.scale).toBeCloseTo(fit.scale * 3);
    expect(camera.x + center.x * camera.scale).toBeCloseTo(fit.x + center.x * fit.scale + 73);
    expect(camera.y + center.y * camera.scale).toBeCloseTo(fit.y + center.y * fit.scale - 26);
  });

  it('retains finite transforms for tiny viewports and rejects nonfinite camera input', () => {
    const transform = getMapTransform(fixture(), { width: 1, height: 1 }, { x: NaN, y: Infinity, zoom: NaN });
    expect(Object.values(transform).every(Number.isFinite)).toBe(true);
    expect(transform.scale).toBeGreaterThan(0);
  });

  it('exports each palette without dropping cartographic geometry', () => {
    const city = fixture();
    for (const palette of Object.keys(PALETTES) as Array<keyof typeof PALETTES>) {
      const svg = renderMap(city, { ...DEFAULT_STYLE, palette }, { width: 390, height: 844 });
      expect(svg).toContain(PALETTES[palette].paper);
      expect(svg).toContain('class="city-wall"');
      expect(svg).toContain('class="building"');
      expect(svg).toContain('viewBox="0 0 390 844"');
    }
  });

  it('uses original projected roads without rounding, smoothing, or legacy geometry', () => {
    const city = originalFixture();
    city.roads = [[{ x: 9876, y: 9876 }, { x: 9877, y: 9877 }]];
    const svg = renderMap(city, { ...DEFAULT_STYLE, labels: false }, { width: 1280, height: 800 });
    expect(svg).toContain('M0.123456789012345 -40L1.5 0L3.25 40');
    expect(svg).not.toContain('9876');
    expect(svg).toContain('M3.25 20L3.25 40');
  });

  it('preserves original wall omissions, explicit towers and gate openings', () => {
    const city = originalFixture();
    const svg = renderMap(city, DEFAULT_STYLE, { width: 1280, height: 800 });
    expect(svg.match(/class="wall-tower"/g)).toHaveLength(1);
    expect(svg.match(/class="wall-gate"/g)).toHaveLength(1);
    const wall = svg.slice(svg.indexOf('class="city-wall original-wall"'), svg.indexOf('class="district-labels"'));
    expect(wall).toContain('M-10 -10L-4 -10');
    expect(wall).not.toContain('L10 10');
    expect(wall).toContain('r="1.9"');
  });

  it('draws every original river and prescribed bridge, pier and farm furrow', () => {
    const svg = renderMap(originalFixture(), DEFAULT_STYLE, { width: 1280, height: 800 });
    expect(svg.match(/class="river"/g)).toHaveLength(2);
    expect(svg).toContain('M0 22L0 28');
    expect(svg).toContain('M20 10L25 10');
    expect(svg).toContain('M-20 -15L-15 -10');
    expect(svg).toContain('M-20 -14L-15 -9');
    expect(svg).not.toContain('id="furrows-');
  });

  it('uses the recovered original viewport scaling and centered bounds', () => {
    const city = originalFixture();
    const transform = getMapTransform(city, { width: 1280, height: 800 });
    expect(transform.scale).toBe(8);
    expect(transform.x).toBe(640);
    expect(transform.y).toBe(400);
    const wide = getMapTransform(city, { width: 2400, height: 600 });
    expect(wide.scale).toBe(15);
  });

  it('normalizes original label direction without reversing the model ridge', () => {
    const ridge = [{ x: 40, y: -50 }, { x: 10, y: 0 }, { x: 0, y: 40 }];
    const before = JSON.stringify(ridge);
    const normalized = originalLabelRidge(ridge, 60);
    expect(normalized[0].x).toBeLessThan(normalized[normalized.length - 1].x);
    const letters = layoutOriginalLabel({ text: 'Dragonway Gate', point: { x: 0, y: 0 }, angle: 0, size: 9, path: ridge }, 3);
    expect(letters.every((letter) => Math.abs(letter.angle) < 90)).toBe(true);
    expect(letters.map((letter) => letter.text).join('')).toBe('DRAGONWAY GATE');
    expect(JSON.stringify(ridge)).toBe(before);
  });

  it('shrinks long names on short ridges and caps enlargement at the original 1.5 multiplier', () => {
    const label = { text: 'Southern Slums', point: { x: 0, y: 0 }, angle: 0, size: 9 };
    const small = layoutOriginalLabel({ ...label, path: [{ x: 0, y: 0 }, { x: 35, y: 0 }] }, 3);
    const large = layoutOriginalLabel({ ...label, path: [{ x: 0, y: 0 }, { x: 500, y: 0 }] }, 3);
    expect(small[0].size * 3).toBeLessThan(20);
    expect(large[0].size * 3).toBeCloseTo(27 * 1.5);
    expect(large.every((letter) => Number.isFinite(letter.point.x) && Number.isFinite(letter.point.y))).toBe(true);
  });
});
