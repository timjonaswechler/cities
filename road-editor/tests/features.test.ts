import * as THREE from "three";
import { afterEach, describe, expect, it } from "vitest";
import {
  defaults,
  features,
  initialConfig,
  parseConfig,
  policyIssues,
  type FeatureId,
  type Values,
} from "../src/feature-catalog";
import {
  createFeature,
  disposeFeature,
  type FeatureGeometry,
} from "../src/feature-geometry";

const built: FeatureGeometry[] = [];
function build(id: FeatureId, values: Partial<Values> = {}) {
  const result = createFeature(id, { ...defaults(id), ...values } as Values);
  built.push(result);
  return result;
}
afterEach(() => {
  for (const feature of built.splice(0)) {
    disposeFeature(feature.solid);
    disposeFeature(feature.reference);
  }
});
function hits(feature: FeatureGeometry, x: number, z: number) {
  return new THREE.Raycaster(
    new THREE.Vector3(x, -20, z),
    new THREE.Vector3(0, 1, 0),
  )
    .intersectObject(feature.solid, true)
    .filter((hit) => hit.object instanceof THREE.Mesh)
    .map((hit) => hit.distance);
}

describe("individual feature geometry", () => {
  it.each(features)(
    "builds finite geometry for every $label variant",
    (definition) => {
      const candidates: Values[] = [defaults(definition.id)];
      for (const p of definition.properties) {
        if (p.kind === "number")
          for (const value of [p.min, p.max])
            candidates.push({ ...defaults(definition.id), [p.key]: value });
        else
          for (const option of p.options)
            candidates.push({
              ...defaults(definition.id),
              [p.key]: option.value,
            });
      }
      for (const values of candidates) {
        const f = build(definition.id, values);
        expect(f.bounds.isEmpty()).toBe(false);
        expect(f.metrics.height).toBeGreaterThan(0);
        f.solid.traverse((object) => {
          if (!(object instanceof THREE.Mesh)) return;
          const geometry: THREE.BufferGeometry = object.geometry;
          for (const attribute of Object.values(geometry.attributes))
            expect(Array.from(attribute.array).every(Number.isFinite)).toBe(
              true,
            );
        });
        expect(
          policyIssues(
            definition.id,
            values,
            f.metrics,
            initialConfig().locations[0].features[definition.id],
          ),
        ).toEqual([]);
      }
    },
  );

  it("uses roof dimensions, rise and eaves directly instead of scaling a fixed house", () => {
    const f = build("roof", { width: 7, depth: 9, rise: 3.7, eaves: 0.6 });
    const size = f.bounds.getSize(new THREE.Vector3());
    expect(size.x).toBeCloseTo(8.2, 5);
    expect(size.y).toBeCloseTo(10.2, 5);
    expect(size.z).toBeCloseTo(3.7, 5);
    expect(f.metrics.height).toBeCloseTo(3.7, 5);
  });

  it("measures the flat roof's actual thickness rather than its inactive rise setting", () => {
    const f = build("roof", { shape: "flat", rise: 5.8, thickness: 0.2 });
    expect(f.metrics.height).toBeCloseTo(0.2, 5);
  });

  it.each(["arch", "lintel"])(
    "leaves a real %s passage open through its complete depth",
    (shape) => {
      const f = build("gate", {
        shape,
        span: 3,
        clearance: 2.8,
        rise: 1.1,
        depth: 4,
        pier: 0.6,
      });
      expect(hits(f, 0, 1.4)).toEqual([]);
      expect(hits(f, 1.8, 1.4).length).toBeGreaterThan(0);
      const openingTop = shape === "arch" ? 3.9 : 2.8;
      expect(hits(f, 0, openingTop + 0.2).length).toBeGreaterThan(0);
      expect(f.metrics.clearance).toBe(2.8);
      expect(f.ports.map((p) => p.position[1])).toEqual([-2, 2]);
      expect(f.ports.map((p) => p.position[2])).toEqual([0, 0]);
    },
  );

  it("has a curved underside rather than a rectangular hole with a painted arch", () => {
    const f = build("gate", {
      shape: "arch",
      span: 3,
      clearance: 2.8,
      rise: 1.1,
    });
    expect(hits(f, 0, 3.35)).toEqual([]);
    expect(hits(f, 1.4, 3.35).length).toBeGreaterThan(0);
  });

  it("extends only the front of the upper room and keeps the host as reference geometry", () => {
    const f = build("overhang", {
      width: 6,
      depth: 5,
      base: 2.8,
      height: 2.6,
      projection: 0.8,
      supports: "no",
    });
    expect(f.bounds.min.y).toBeCloseTo(-3.3, 5);
    expect(f.bounds.max.y).toBeCloseTo(2.5, 5);
    expect(f.bounds.min.z).toBeCloseTo(2.8, 5);
    expect(f.bounds.max.z).toBeCloseTo(5.4, 5);
    expect(f.metrics.projection).toBe(0.8);
    expect(f.reference.children.length).toBeGreaterThan(0);
  });

  it("keeps habitable space distinct from walls and gives a gang two connection ends", () => {
    const room = build("room", { width: 6, depth: 8, thickness: 0.2 });
    expect(room.spaces).toHaveLength(1);
    expect(room.spaces[0].kind).toBe("habitable");
    expect(
      room.ports.find((p) => p.kind === "access")!.position[2],
    ).toBeCloseTo(0.2);
    expect(room.spaces[0].max[0] - room.spaces[0].min[0]).toBeCloseTo(5.6);
    const gang = build("connection", { length: 7, base: 1.2, clearance: 2.7 });
    expect(gang.spaces[0].kind).toBe("circulation");
    expect(gang.ports.map((p) => p.position.slice(0, 2))).toEqual([
      [0, -3.5],
      [0, 3.5],
    ]);
    for (const port of gang.ports) expect(port.position[2]).toBeCloseTo(1.36);
    expect(gang.metrics.clearance).toBe(2.7);
  });
});

describe("location rules and saved configurations", () => {
  it("reports height and material conflicts without mutating the inspected feature", () => {
    const config = initialConfig(),
      values = { ...defaults("roof"), rise: 4.6, material: "reed" },
      f = build("roof", values),
      before = structuredClone(values),
      policy = config.locations.find((l) => l.id === "town")!.features.roof;
    const issues = policyIssues("roof", values, f.metrics, policy);
    expect(issues).toHaveLength(2);
    expect(issues.join()).toContain("Reet");
    expect(issues.join()).toContain("4.60");
    expect(values).toEqual(before);
    policy.materials.push("reed");
    policy.limits.maxHeight = 5;
    expect(policyIssues("roof", values, f.metrics, policy)).toEqual([]);
  });

  it("checks actual wall caps and pillars, not only the wall-height slider", () => {
    const config = initialConfig(),
      values = { ...defaults("wall"), height: 2.4, pillars: "yes" },
      f = build("wall", values),
      policy = config.locations.find((l) => l.id === "town")!.features.wall;
    expect(f.metrics.height).toBeCloseTo(2.7, 5);
    expect(policyIssues("wall", values, f.metrics, policy)).toHaveLength(1);
  });

  it("keeps permission edits local to a feature and location", () => {
    const config = initialConfig();
    config.locations[1].features.roof.allowed = false;
    config.locations[1].features.roof.materials.length = 0;
    expect(config.locations[1].features.room.allowed).toBe(true);
    expect(config.locations[0].features.roof.materials.length).toBeGreaterThan(
      0,
    );
    expect(config.locations[2].features.roof.allowed).toBe(true);
    expect(parseConfig(JSON.stringify(config))).toEqual(config);
  });

  it("does not impose a fictitious ceiling on the open connection variant", () => {
    const values = { ...defaults("connection"), cover: "open" },
      f = build("connection", values),
      policy = initialConfig().locations[0].features.connection;
    policy.limits.minClearance = 4;
    expect(f.metrics.clearance).toBeUndefined();
    expect(policyIssues("connection", values, f.metrics, policy)).toEqual([]);
  });

  it("round-trips all individual choices and rejects malformed configurations", () => {
    const c = initialConfig();
    c.selectedFeature = "gate";
    c.values.gate.span = 4.5;
    expect(parseConfig(JSON.stringify(c))).toEqual(c);
    for (const change of [
      (x: typeof c) => {
        x.values.roof.rise = 99;
      },
      (x: typeof c) => {
        x.values.roof.material = "missing-material";
      },
      (x: typeof c) => {
        delete x.values.room.width;
      },
      (x: typeof c) => {
        x.locations[1].id = x.locations[0].id;
      },
      (x: typeof c) => {
        x.locations[0].features.roof.limits.maxHeight = -1;
      },
      (x: typeof c) => {
        x.locations[0].features.roof.materials.push("script");
      },
    ]) {
      const invalid = structuredClone(c);
      change(invalid);
      expect(() => parseConfig(JSON.stringify(invalid))).toThrow();
    }
  });
});
