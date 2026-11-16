import * as THREE from "three";
import { afterEach, describe, expect, it } from "vitest";
import { houseOverlay, housePanel, plotFromCorners } from "../src/house-ui";
import { createHouseGroup } from "../src/house-view";
import { houseGeometry } from "../src/houses";
import type { House, HousePlot, HousePoint } from "../src/house-types";

const house: House = {
  id: "Haus-1",
  center: { x: 0, y: 11 },
  angle: 0,
  width: 4,
  depth: 6,
  storeys: 1,
  ridge: "depth",
};
const plot: HousePlot = {
  bounds: { min: { x: -12, y: 2 }, max: { x: 12, y: 23 } },
  access: { point: { x: 0, y: 2 }, tangent: { x: 1, y: 0 } },
  seed: 7,
};
const panel = (state: Partial<Parameters<typeof housePanel>[0]> = {}) =>
  housePanel({ conflicts: [], mode: "select", ...state });
const action = (html: string, name: string) =>
  html.match(new RegExp(`<button[^>]*data-house-action="${name}"[^>]*>`))![0];
const svgPoint = (p: HousePoint) => `${p.x},${-p.y}`;

describe("plot selection", () => {
  it("orders either corner without mutating or aliasing the input", () => {
    const a = { x: 12, y: -4 },
      b = { x: -8, y: 20 },
      before = structuredClone({ a, b }),
      bounds = plotFromCorners(a, b);
    expect(bounds).toEqual({ min: { x: -8, y: -4 }, max: { x: 12, y: 20 } });
    expect(plotFromCorners(b, a)).toEqual(bounds);
    expect({ a, b }).toEqual(before);
    bounds.min.x = -100;
    expect({ a, b }).toEqual(before);
  });
  it.each([
    [
      { x: NaN, y: 0 },
      { x: 1, y: 1 },
    ],
    [
      { x: 0, y: Infinity },
      { x: 1, y: 1 },
    ],
    [
      { x: 0, y: 0 },
      { x: -Infinity, y: 1 },
    ],
    [
      { x: 0, y: 0 },
      { x: 1, y: NaN },
    ],
    [
      { x: 0, y: 0 },
      { x: 0, y: 1 },
    ],
    [
      { x: 0, y: 1 },
      { x: 1, y: 1 },
    ],
    [
      { x: 1, y: 1 },
      { x: 1, y: 1 },
    ],
    [
      { x: -Number.MAX_VALUE, y: 0 },
      { x: Number.MAX_VALUE, y: 1 },
    ],
  ])(
    "rejects nonfinite, zero-width, zero-depth, or overflowing bounds",
    (a, b) => {
      expect(() => plotFromCorners(a, b)).toThrow(/Bauplatz/);
    },
  );
});

describe("house panel", () => {
  it("explains the two-corner/road-edge workflow without fabricating a variant", () => {
    const html = panel();
    expect(html).toContain("Zwei gegenüberliegende Ecken");
    expect(html).toContain("tatsächlichen Wegrand");
    expect(html).toContain('data-house-field="seed" value="" disabled');
    expect(html).toContain("Haus-Seed");
    expect(html).toContain(
      'data-house-field="preview" aria-label="Hausvariante" disabled',
    );
    expect(html).not.toContain("4 × 6");
    expect(action(html, "draw-plot")).not.toContain("disabled");
    for (const name of ["pick-access", "accept", "remove-house", "delete-plot"])
      expect(action(html, name)).toContain("disabled");
  });
  it("exposes all profiles with dimensions, floors, roof direction, and preview selection", () => {
    const houses: House[] = [
      house,
      {
        ...house,
        id: "Haus-2",
        width: 6,
        depth: 8,
        storeys: 2,
        ridge: "width",
      },
      { ...house, id: "Haus-3", width: 8, depth: 5 },
    ];
    const html = panel({
      plot,
      result: { houses, rejections: [], tested: 14 },
      preview: houses[1],
    });
    expect(html).toContain("4 × 6 m · 1 Geschoss · First entlang Tiefe");
    expect(html).toContain("6 × 8 m · 2 Geschosse · First entlang Breite");
    expect(html).toContain("8 × 5 m · 1 Geschoss · First entlang Tiefe");
    expect(html).toContain('<option value="Haus-2" selected>');
    expect(html).toContain("3 von 3 Varianten · 14 Kandidaten geprüft");
    expect(html).toContain("Vorschau · noch nicht übernommen");
    expect(html).not.toContain("Übernommenes Haus");
    expect(action(html, "accept")).not.toContain("disabled");
    expect(action(html, "delete-plot")).not.toContain("disabled");
  });
  it("keeps accepted data visible independently of a new preview or failed search", () => {
    const accepted = { ...house, id: "Festes Haus" },
      html = panel({
        plot: { ...plot, accepted },
        preview: { ...house, id: "Neue Vorschau", storeys: 2 },
        result: { houses: [], rejections: ["Bauplatz zu klein"], tested: 81 },
      });
    expect(html).toContain("Übernommenes Haus");
    expect(html).toContain("Festes Haus");
    expect(html).toContain("Vorschau · noch nicht übernommen");
    expect(html).toContain(
      "Seed und Variantenwechsel ersetzen das übernommene Haus nicht",
    );
    expect(html).toContain("0 von 3 Varianten");
    expect(html).toContain("Keine passende Variante gefunden");
    expect(html).toContain("Bauplatz zu klein");
    expect(action(html, "remove-house")).not.toContain("disabled");
  });
  it("reports fewer variants, bounded-search limitations, and escaped errors", () => {
    const html = panel({
      plot,
      preview: house,
      result: {
        houses: [house],
        tested: 81,
        rejections: ["Wasser < Dach & Zugang > 12 m: \"nein\" / 'gesperrt'"],
      },
      conflicts: ['Weg <script>alert("x")</script> & Wasser'],
    });
    expect(html).toContain("1 von 3 Varianten");
    expect(html).toContain("endlichen Suche");
    expect(html).toContain("keine Garantie");
    expect(html).toContain("Ablehnungsgründe");
    expect(html).toContain(
      "Wasser &lt; Dach &amp; Zugang &gt; 12 m: &quot;nein&quot; / &#39;gesperrt&#39;",
    );
    expect(html).toContain('class="danger" role="alert"');
    expect(html).toContain("Hauskonflikte – Haus ungültig");
    expect(html).toContain(
      "Weg &lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt; &amp; Wasser",
    );
    expect(html).not.toContain("<script>");
    expect(action(html, "accept")).toContain("disabled");
  });
  it("escapes IDs in both attributes and accepted-house text", () => {
    const injected = {
        ...house,
        id: "'\"><img src=x onerror=alert(1)> & Haus",
      },
      html = panel({
        plot: { ...plot, accepted: injected, previewId: injected.id },
        result: { houses: [injected], rejections: [], tested: 1 },
      });
    expect(html).not.toContain("<img");
    expect(html).toContain(
      'value="&#39;&quot;&gt;&lt;img src=x onerror=alert(1)&gt; &amp; Haus" selected',
    );
    expect(html).toContain("Vorschau · bereits übernommen");
    expect(html).toContain(
      '<span class="tag">&#39;&quot;&gt;&lt;img src=x onerror=alert(1)&gt; &amp; Haus</span>',
    );
  });
  it("marks the active drawing/access mode and requires access before acceptance", () => {
    expect(action(panel({ mode: "plot" }), "draw-plot")).toContain(
      'aria-pressed="true"',
    );
    const html = panel({
      plot: { ...plot, access: null },
      preview: house,
      mode: "access",
    });
    expect(action(html, "pick-access")).toContain('class="active"');
    expect(html).toContain("tatsächlichen Wegrand");
    expect(action(html, "accept")).toContain("disabled");
  });
});

describe("house SVG overlay", () => {
  it("uses the shared geometry in x/-y and cannot intercept editor input", () => {
    const geometry = houseGeometry(house),
      html = houseOverlay({
        bounds: plot.bounds,
        access: plot.access,
        house,
        unit: 0.25,
      });
    expect(html).toContain('pointer-events="none"');
    expect(html).toContain('x="-12" y="-23" width="24" height="21"');
    for (const ring of [geometry.roof, geometry.footprint, geometry.ridge])
      expect(html).toContain(`points="${ring.map(svgPoint).join(" ")}"`);
    expect(html).toContain(
      `points="${svgPoint(geometry.entrance)} ${svgPoint(plot.access!.point)}"`,
    );
    expect(html).toContain('class="house-access-point" cx="0" cy="-2" r="1"');
    for (const element of html.matchAll(
      /<(?:rect|polygon|polyline|line|circle)\b[^>]*>/g,
    ))
      expect(element[0]).toContain('vector-effect="non-scaling-stroke"');
    expect(html).not.toContain("data-house-action");
  });
  it("marks conflicts red and remains finite when no unit or tangent is usable", () => {
    const html = houseOverlay({
      house,
      access: { point: { x: 2, y: 3 }, tangent: { x: 0, y: 0 } },
      conflict: true,
      unit: NaN,
    });
    expect(html).toContain('stroke="#be503e"');
    expect(html).toContain('fill="#be503e"');
    expect(html).not.toContain("house-access-edge");
    expect(html).not.toMatch(/NaN|Infinity/);
    expect(houseOverlay({ unit: 1 })).not.toMatch(
      /<(?:rect|polygon|polyline|line|circle)\b/,
    );
  });
});

const groups: THREE.Group[] = [];
const renderHouse = (description: House, conflict = false) => {
  const group = createHouseGroup(description, conflict);
  groups.push(group);
  return group;
};
afterEach(() => {
  for (const group of groups.splice(0))
    group.traverse((object) => {
      if (!(object instanceof THREE.Mesh || object instanceof THREE.Line))
        return;
      object.geometry.dispose();
      const materials = Array.isArray(object.material)
        ? object.material
        : [object.material];
      materials.forEach((material) => material.dispose());
    });
});
const vertices = (geometry: THREE.BufferGeometry) => {
  const position = geometry.getAttribute("position"),
    index = geometry.getIndex();
  return Array.from({ length: index?.count ?? position.count }, (_, i) =>
    new THREE.Vector3().fromBufferAttribute(
      position,
      index ? index.getX(i) : i,
    ),
  );
};
const key = (p: THREE.Vector3) => `${p.x},${p.y},${p.z}`;
const triangleNormal = (points: THREE.Vector3[], i: number) =>
  points[i + 1]
    .clone()
    .sub(points[i])
    .cross(points[i + 2].clone().sub(points[i]));

describe("Three.js house volume", () => {
  for (const ridge of ["width", "depth"] as const)
    for (const angle of [0, 0.73, Math.PI / 2])
      for (const storeys of [1, 2] as const)
        it(`renders closed walls, two gables and both roof slopes: ${ridge}, ${angle}, ${storeys} storeys`, () => {
          const description: House = {
              ...house,
              center: { x: 17, y: -9 },
              width: 6,
              depth: 8,
              ridge,
              angle,
              storeys,
            },
            before = structuredClone(description),
            shape = houseGeometry(description),
            group = renderHouse(description),
            walls = group.getObjectByName("house-walls") as THREE.Mesh,
            roof = group.getObjectByName("house-roof") as THREE.Mesh;
          expect(description).toEqual(before);
          expect(group).toBeInstanceOf(THREE.Group);
          group.traverse((object) => {
            if (!(object instanceof THREE.Mesh || object instanceof THREE.Line))
              return;
            const geometry: THREE.BufferGeometry = object.geometry;
            for (const attribute of Object.values(geometry.attributes))
              expect(Array.from(attribute.array).every(Number.isFinite)).toBe(
                true,
              );
            object.geometry.computeBoundingBox();
            object.geometry.computeBoundingSphere();
            expect(
              Number.isFinite(object.geometry.boundingSphere!.radius),
            ).toBe(true);
          });
          const wallPoints = vertices(walls.geometry),
            edges = new Map<string, { count: number; direction: number }>();
          let volume = 0,
            gables = 0;
          const axis = new THREE.Vector3(
            shape.ridge[1].x - shape.ridge[0].x,
            shape.ridge[1].y - shape.ridge[0].y,
            0,
          ).normalize();
          for (let i = 0; i < wallPoints.length; i += 3) {
            const normal = triangleNormal(wallPoints, i);
            expect(normal.length()).toBeGreaterThan(1e-6);
            if (
              Math.abs(normal.clone().normalize().dot(axis)) > 0.999 &&
              Math.max(...wallPoints.slice(i, i + 3).map((p) => p.z)) >
                shape.ridgeHeight - 1e-5
            )
              gables++;
            volume +=
              wallPoints[i].dot(
                wallPoints[i + 1].clone().cross(wallPoints[i + 2]),
              ) / 6;
            for (let j = 0; j < 3; j++) {
              const a = key(wallPoints[i + j]),
                b = key(wallPoints[i + ((j + 1) % 3)]),
                edgeKey = [a, b].sort().join("|"),
                edge = edges.get(edgeKey) ?? { count: 0, direction: 0 };
              edge.count++;
              edge.direction += a < b ? 1 : -1;
              edges.set(edgeKey, edge);
            }
          }
          expect(gables).toBe(2);
          expect(volume).toBeGreaterThan(0);
          for (const edge of edges.values())
            expect(edge).toEqual({ count: 2, direction: 0 });
          expect(
            new Set(wallPoints.map(key)).size -
              edges.size +
              wallPoints.length / 3,
          ).toBe(2);
          expect(walls.geometry.boundingBox!.min.z).toBe(0);
          expect(walls.geometry.boundingBox!.max.z).toBeCloseTo(
            shape.ridgeHeight,
            5,
          );
          for (const axis of ["x", "y"] as const) {
            expect(walls.geometry.boundingBox!.min[axis]).toBeCloseTo(
              Math.min(...shape.footprint.map((p) => p[axis])),
              5,
            );
            expect(walls.geometry.boundingBox!.max[axis]).toBeCloseTo(
              Math.max(...shape.footprint.map((p) => p[axis])),
              5,
            );
          }
          expect(shape.eaveHeight).toBeCloseTo(storeys * 2.8);
          const roofPoints = vertices(roof.geometry),
            expectedRoof = [
              ...shape.roof.map(
                (p) => new THREE.Vector3(p.x, p.y, shape.eaveHeight),
              ),
              ...shape.ridge.map(
                (p) => new THREE.Vector3(p.x, p.y, shape.ridgeHeight),
              ),
            ],
            normals: THREE.Vector3[] = [];
          expect(roofPoints).toHaveLength(12);
          expect(roof.geometry.groups.map((part) => part.count)).toEqual([
            6, 6,
          ]);
          for (const expected of expectedRoof)
            expect(
              roofPoints.some((actual) => actual.distanceTo(expected) < 1e-5),
            ).toBe(true);
          for (let i = 0; i < roofPoints.length; i += 3) {
            const normal = triangleNormal(roofPoints, i).normalize();
            expect(normal.z).toBeGreaterThan(0);
            expect(normal.z).toBeCloseTo(Math.SQRT1_2, 5);
            normals.push(normal);
          }
          expect(normals[0].dot(normals[1])).toBeCloseTo(1, 5);
          expect(normals[2].dot(normals[3])).toBeCloseTo(1, 5);
          expect(normals[0].dot(normals[2])).toBeCloseTo(0, 5);
          expect(roof.geometry.boundingBox!.min.z).toBeCloseTo(
            shape.eaveHeight,
            5,
          );
          expect(roof.geometry.boundingBox!.max.z).toBeCloseTo(
            shape.ridgeHeight,
            5,
          );
          const marker = group.getObjectByName(
            "house-entrance",
          ) as THREE.LineSegments;
          expect(marker).toBeInstanceOf(THREE.LineSegments);
          expect(
            vertices(marker.geometry).some(
              (p) =>
                Math.hypot(p.x - shape.entrance.x, p.y - shape.entrance.y) <
                0.1,
            ),
          ).toBe(true);
          expect(
            vertices(marker.geometry).every((p) => p.z > 0 && p.z < 0.1),
          ).toBe(true);
        });
  it("uses contrasting roof/edges and red conflict styling without changing geometry", () => {
    const normal = renderHouse(house),
      invalid = renderHouse(house, true),
      wall = normal.getObjectByName("house-walls") as THREE.Mesh<
        THREE.BufferGeometry,
        THREE.MeshBasicMaterial
      >,
      roof = normal.getObjectByName("house-roof") as THREE.Mesh<
        THREE.BufferGeometry,
        THREE.MeshBasicMaterial[]
      >,
      invalidWall = invalid.getObjectByName("house-walls") as THREE.Mesh<
        THREE.BufferGeometry,
        THREE.MeshBasicMaterial
      >;
    expect(wall.material.color.getHex()).not.toBe(
      roof.material[0].color.getHex(),
    );
    expect(roof.material[0].color.getHex()).not.toBe(
      roof.material[1].color.getHex(),
    );
    expect(invalidWall.material.color.r).toBeGreaterThan(
      invalidWall.material.color.g,
    );
    expect(invalidWall.material.color.getHex()).not.toBe(
      wall.material.color.getHex(),
    );
    expect(vertices(invalidWall.geometry)).toEqual(vertices(wall.geometry));
    expect(normal.getObjectByName("house-wall-edges")).toBeInstanceOf(
      THREE.LineSegments,
    );
    expect(normal.getObjectByName("house-roof-edges")).toBeInstanceOf(
      THREE.LineSegments,
    );
    expect(invalid.userData.conflict).toBe(true);
    expect(wall.geometry).not.toBe(invalidWall.geometry);
    expect(wall.material).not.toBe(invalidWall.material);
  });
});
