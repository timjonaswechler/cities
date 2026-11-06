import * as THREE from "three";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createComplexGroup } from "../src/complex-view";
import * as houseView from "../src/house-view";
import { plotOverlay, plotPanel } from "../src/plot-ui";
import type { BuildingComplex, PlannedPlot, PlotPlan } from "../src/plot-types";

const rectangle = (x: number, y: number, width: number, depth: number) => [
  { x, y },
  { x: x + width, y },
  { x: x + width, y: y + depth },
  { x, y: y + depth },
];
const complex: BuildingComplex = {
  id: "Komplex-1",
  volumes: [
    {
      id: "Hauptbau",
      role: "main",
      center: { x: 5, y: 24 },
      width: 4,
      depth: 6,
      angle: 0,
      storeys: 2,
      ridge: "depth",
    },
    {
      id: "Flügel",
      role: "wing",
      center: { x: 25, y: 23 },
      width: 4,
      depth: 6,
      angle: 0.3,
      storeys: 1,
      ridge: "width",
    },
    {
      id: "Nebenbau",
      role: "outbuilding",
      center: { x: 25, y: 13 },
      width: 2,
      depth: 3,
      angle: Math.PI / 2,
      storeys: 1,
      ridge: "depth",
    },
  ],
};
const plot: PlannedPlot = {
  id: "Bauplatz-1",
  kind: "plot",
  seed: 7,
  outer: rectangle(0, 10, 30, 20),
  holes: [rectangle(12, 17, 3, 3)],
};
const plan: PlotPlan = {
  id: plot.id,
  planned: { outer: plot.outer, holes: plot.holes! },
  buildable: [
    { outer: rectangle(0, 10, 10, 20), holes: [rectangle(2, 14, 3, 4)] },
    { outer: rectangle(20, 10, 10, 20), holes: [] },
  ],
  excluded: [
    { outer: rectangle(10, 10, 10, 20), holes: plot.holes! },
    { outer: rectangle(2, 14, 3, 4), holes: [] },
  ],
  plannedArea: 591,
  buildableArea: 388,
  excludedArea: 203,
  complex,
  messages: [],
};
const action = (html: string, name: string) =>
  html.match(new RegExp(`<button[^>]*data-plot-action="${name}"[^>]*>`))![0];
const paths = (html: string, name: string) =>
  [...html.matchAll(new RegExp(`<path class="${name}"[^>]*>`, "g"))].map(
    (match) => match[0],
  );

describe("automatic plot panel", () => {
  it("explains the closed-vector workflow without manual access or house selection", () => {
    const html = plotPanel(undefined, undefined);
    expect(html).toContain("Material „Bauplatz“");
    expect(html).toContain("geschlossenen Vektor zeichnen");
    expect(html).toContain("Gebäudekomplex wird automatisch erzeugt");
    expect(html).toContain("Bauplatz zeichnen");
    expect(html).toContain("Neue Bebauung");
    expect(html).toContain("Bauplatz löschen");
    expect(action(html, "new")).not.toContain("disabled");
    expect(action(html, "regenerate")).toContain("disabled");
    expect(action(html, "delete")).toContain("disabled");
    expect(html).not.toMatch(
      /<input|<select|data-house-|Seed|Zugang|übernehmen/,
    );
  });

  it("reports drawn, usable and excluded area with one complex across disconnected parts", () => {
    const before = structuredClone({ plot, plan }),
      html = plotPanel(plot, plan);
    expect(html).toContain("Gezeichnet: <strong>591 m²</strong>");
    expect(html).toContain("Bebaubar: <strong>388 m²</strong>");
    expect(html).toContain("Ausgeschlossen: <strong>203 m²</strong>");
    expect(html).toContain(
      "2 getrennte Teilflächen · 1 Gebäudekomplex · 3 Baukörper",
    );
    expect(html).not.toContain("2 Gebäudekomplexe");
    for (const name of ["new", "regenerate", "delete"])
      expect(action(html, name)).not.toContain("disabled");
    expect({ plot, plan }).toEqual(before);
  });

  it("escapes imported ids and planner messages", () => {
    const id = `<img src=x onerror="bad('x')"> &`,
      message = `Kein <script>"Haus" & 'Grund'</script>`,
      html = plotPanel({ ...plot, id }, { ...plan, id, messages: [message] });
    expect(html).toContain(
      "&lt;img src=x onerror=&quot;bad(&#39;x&#39;)&quot;&gt; &amp;",
    );
    expect(html).toContain(
      "Kein &lt;script&gt;&quot;Haus&quot; &amp; &#39;Grund&#39;&lt;/script&gt;",
    );
    expect(html).not.toContain(id);
    expect(html).not.toMatch(/<img|<script/);
  });

  it("keeps empty or rejected results honest and still permits regeneration", () => {
    const rejected: PlotPlan = {
        ...plan,
        buildable: [],
        buildableArea: 0,
        excluded: [plan.planned],
        excludedArea: plan.plannedArea,
        complex: undefined,
        messages: ["Bauplatz vollständig durch Weg oder Wasser gesperrt."],
      },
      html = plotPanel(plot, rejected);
    expect(html).toContain("Bebaubar: <strong>0 m²</strong>");
    expect(html).toContain("0 Teilflächen · 0 Gebäudekomplexe · 0 Baukörper");
    expect(html).toContain("Keine bebaubare Fläche.");
    expect(html).toContain(rejected.messages[0]);
    expect(action(html, "regenerate")).not.toContain("disabled");
    const noFit = plotPanel(plot, {
      ...plan,
      complex: { id: complex.id, volumes: [] },
    });
    expect(noFit).toContain("Keine passende Bebauung gefunden.");
    expect(noFit).toContain("0 Gebäudekomplexe · 0 Baukörper");
    expect(noFit).not.toContain("1 Gebäudekomplex");
  });

  it("does not display a stale plan or invent statistics before planning", () => {
    for (const result of [undefined, { ...plan, id: "Anderer Bauplatz" }]) {
      const html = plotPanel(plot, result);
      expect(html).toContain("Noch kein Planungsergebnis.");
      expect(html).not.toContain("m²");
      expect(action(html, "delete")).not.toContain("disabled");
    }
    expect(plotPanel(undefined, plan)).not.toContain("591");
  });

  it("formats large and fractional areas legibly in German", () => {
    expect(plotPanel(plot, { ...plan, plannedArea: 1234.56 })).toContain(
      "1.234,6 m²",
    );
  });
});

describe("plot SVG overlay", () => {
  it("uses x/-y and even-odd paths for planned, allowed and excluded holes", () => {
    const before = structuredClone(plan),
      html = plotOverlay([plan], plot.id, 0.25),
      planned = paths(html, "plot-planned"),
      buildable = paths(html, "plot-buildable"),
      excluded = paths(html, "plot-excluded");
    expect(planned).toHaveLength(1);
    expect(buildable).toHaveLength(2);
    expect(excluded).toHaveLength(2);
    expect(planned[0]).toContain(
      'd="M 0,-10 L 30,-10 L 30,-30 L 0,-30 Z M 12,-17 L 15,-17 L 15,-20 L 12,-20 Z"',
    );
    expect(buildable[0]).toContain(
      'd="M 0,-10 L 10,-10 L 10,-30 L 0,-30 Z M 2,-14 L 5,-14 L 5,-18 L 2,-18 Z"',
    );
    expect(excluded[0]).toContain(
      'd="M 10,-10 L 20,-10 L 20,-30 L 10,-30 Z M 12,-17 L 15,-17 L 15,-20 L 12,-20 Z"',
    );
    for (const path of [...planned, ...buildable, ...excluded]) {
      expect(path).toContain('fill-rule="evenodd"');
      expect(path).toContain('vector-effect="non-scaling-stroke"');
    }
    expect(plan).toEqual(before);
  });

  it("keeps allowed fill pale and exclusions striped so roads and water remain visible", () => {
    const html = plotOverlay([plan], undefined, 1);
    expect(paths(html, "plot-buildable")[0]).toContain(
      'fill="#eddbb6" fill-opacity="0.24"',
    );
    expect(paths(html, "plot-planned")[0]).toContain('fill="none"');
    expect(html).toContain('<pattern id="plot-excluded-hatch"');
    expect(html).toContain('stroke-opacity="0.25"');
    for (const path of paths(html, "plot-excluded"))
      expect(path).toContain('fill="url(#plot-excluded-hatch)"');
    expect(html).toContain('pointer-events="none"');
    expect(html).not.toMatch(/pointer-events="(?!none)|data-plot-action|<rect/);
    expect(html).not.toContain('class="plot-selection"');
    expect(html).not.toContain('class="plot-label"');
  });

  it("highlights only the selection and gives it readable, scale-aware statistics", () => {
    const html = plotOverlay(
      [plan, { ...plan, id: "Bauplatz-2" }],
      plot.id,
      0.25,
    );
    expect(paths(html, "plot-selection")).toHaveLength(1);
    expect(paths(html, "plot-selection")[0]).toContain('stroke-width="2.5"');
    expect(html.match(/class="plot-label"/g)).toHaveLength(1);
    expect(html).toContain('x="0" y="-31.75" font-size="2.75"');
    expect(html).toContain('paint-order="stroke"');
    expect(html).toContain("Bauplatz-1 · 388 m² bebaubar · 3 Baukörper");
  });

  it("escapes ids in both SVG attributes and text without using them as paint ids", () => {
    const id = `x\"><script>' &`,
      html = plotOverlay([{ ...plan, id }], id, 1);
    expect(html).toContain(
      'data-plot-id="x&quot;&gt;&lt;script&gt;&#39; &amp;"',
    );
    expect(html).toContain("x&quot;&gt;&lt;script&gt;&#39; &amp; · 388 m²");
    expect(html).not.toContain("<script>");
    expect(html).not.toContain(id);
  });

  it("renders empty and rejected plans without bogus paths or nonfinite labels", () => {
    expect(plotOverlay([], undefined, 1)).toBe(
      '<g class="plot-overlay" pointer-events="none" aria-hidden="true"></g>',
    );
    const empty: PlotPlan = {
      id: plot.id,
      planned: { outer: [], holes: [] },
      buildable: [],
      excluded: [],
      plannedArea: 0,
      buildableArea: 0,
      excludedArea: 0,
      messages: ["Ungültiger Bauplatz"],
    };
    expect(plotOverlay([empty], plot.id, 1)).not.toMatch(
      /<path|<text|<pattern/,
    );
    const rejected = plotOverlay(
      [{ ...plan, buildable: [], complex: undefined, buildableArea: 0 }],
      plot.id,
      1,
    );
    expect(rejected).not.toContain('class="plot-buildable"');
    expect(rejected).toContain("0 m² bebaubar · 0 Baukörper");
  });

  it.each([0, -1, NaN, Infinity])("falls back from invalid unit %s", (unit) => {
    const html = plotOverlay([plan], plot.id, unit);
    expect(html).not.toMatch(/NaN|Infinity/);
    expect(html).toContain('font-size="11"');
    expect(html).toContain('width="8" height="8"');
  });
});

const groups: THREE.Group[] = [];
const renderComplex = (description: BuildingComplex) => {
  const group = createComplexGroup(description);
  groups.push(group);
  return group;
};
afterEach(() => {
  vi.restoreAllMocks();
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

describe("Three.js building complex", () => {
  it("aggregates disconnected volumes in one semantic group using the existing house renderer", () => {
    const before = structuredClone(complex),
      createHouse = vi.spyOn(houseView, "createHouseGroup"),
      group = renderComplex(complex);
    expect(group).toBeInstanceOf(THREE.Group);
    expect(group.name).toBe("complex:Komplex-1");
    expect(group.userData).toEqual({
      kind: "building-complex",
      complexId: complex.id,
    });
    expect(group.children).toHaveLength(3);
    expect(createHouse).toHaveBeenCalledTimes(3);
    const meshes: THREE.Mesh[] = [];
    for (const [index, child] of group.children.entries()) {
      const volume = complex.volumes[index];
      expect(createHouse).toHaveBeenNthCalledWith(index + 1, volume);
      expect(child.name).toBe(`volume:${volume.id}`);
      expect(child.parent).toBe(group);
      expect(child.userData.houseId).toBe(volume.id);
      child.traverse((object) => {
        expect(object.userData).toMatchObject({
          complexId: complex.id,
          volumeId: volume.id,
          role: volume.role,
        });
        if (object instanceof THREE.Mesh) meshes.push(object);
        if (!(object instanceof THREE.Mesh || object instanceof THREE.Line))
          return;
        const geometry: THREE.BufferGeometry = object.geometry;
        for (const attribute of Object.values(geometry.attributes))
          expect(Array.from(attribute.array).every(Number.isFinite)).toBe(true);
        geometry.computeBoundingSphere();
        expect(Number.isFinite(geometry.boundingSphere!.radius)).toBe(true);
      });
    }
    expect(meshes).toHaveLength(6);
    expect(meshes.filter((mesh) => mesh.name === "house-walls")).toHaveLength(
      3,
    );
    expect(meshes.filter((mesh) => mesh.name === "house-roof")).toHaveLength(3);
    const bounds = new THREE.Box3().setFromObject(group);
    expect(bounds.min.x).toBeLessThan(5);
    expect(bounds.max.x).toBeGreaterThan(25);
    expect(complex).toEqual(before);
  });

  it("preserves the exact house geometry without a second roof algorithm", () => {
    const group = renderComplex(complex);
    for (const [index, child] of group.children.entries()) {
      const house = houseView.createHouseGroup(complex.volumes[index]);
      groups.push(house);
      expect(child.children.map((object) => object.name)).toEqual(
        house.children.map((object) => object.name),
      );
      for (const expected of house.children) {
        if (!(expected instanceof THREE.Mesh || expected instanceof THREE.Line))
          continue;
        const actual = child.getObjectByName(expected.name) as typeof expected;
        expect(Array.from(actual.geometry.attributes.position.array)).toEqual(
          Array.from(expected.geometry.attributes.position.array),
        );
      }
    }
  });

  it("returns an identifiable empty group when no volumes were generated", () => {
    const group = renderComplex({ id: "Leer", volumes: [] });
    expect(group.name).toBe("complex:Leer");
    expect(group.userData.complexId).toBe("Leer");
    expect(group.children).toEqual([]);
  });
});
