import { describe, expect, it } from "vitest";
import * as THREE from "three";
import { createScene, disposeScene } from "../src/scene";
import { buildScenario } from "../src/scenarios";
import { generateHouse } from "../src/generator";
import { SEEDS, VISUAL_CASES } from "./fixtures";

describe("actual Three.js geometry and materials", () => {
  it("has finite vertices/normals, valid indices, and nondegenerate triangles in all fixed visual scenes", () => {
    for (const spec of VISUAL_CASES)
      for (const seed of SEEDS) {
        const scenario = buildScenario(spec);
        const scene = createScene(scenario, generateHouse(scenario, seed), {
          blockers: true,
          constraints: true,
        });
        scene.traverse((object) => {
          if (!(object instanceof THREE.Mesh)) return;
          const geometry = object.geometry;
          const position = geometry.getAttribute("position"),
            normal = geometry.getAttribute("normal");
          expect(
            Array.from(position.array).every(Number.isFinite),
            spec.id,
          ).toBe(true);
          expect(Array.from(normal.array).every(Number.isFinite), spec.id).toBe(
            true,
          );
          for (let i = 0; i < normal.count; i++)
            expect(
              Math.hypot(normal.getX(i), normal.getY(i), normal.getZ(i)),
            ).toBeCloseTo(1, 4);
          const indices: number[] = geometry.index
            ? Array.from(geometry.index.array as ArrayLike<number>)
            : Array.from({ length: position.count }, (_, i) => i);
          expect(
            indices.every(
              (i) => Number.isInteger(i) && i >= 0 && i < position.count,
            ),
          ).toBe(true);
          expect(indices.length % 3).toBe(0);
          for (let i = 0; i < indices.length; i += 3) {
            const a = new THREE.Vector3().fromBufferAttribute(
              position,
              indices[i],
            );
            const b = new THREE.Vector3().fromBufferAttribute(
              position,
              indices[i + 1],
            );
            const c = new THREE.Vector3().fromBufferAttribute(
              position,
              indices[i + 2],
            );
            expect(
              b.sub(a).cross(c.sub(a)).length(),
              spec.id + " degenerate mesh",
            ).toBeGreaterThan(1e-7);
          }
        });
        disposeScene(scene);
      }
  });
  it("uses genuinely red transparent blockers, recessed water, and purely visual layer toggles", () => {
    const spec = VISUAL_CASES.find((s) => s.group === "road-water")!;
    const scenario = buildScenario(spec),
      result = generateHouse(scenario, 42);
    expect(scenario.blockers.length).toBe(4);
    for (const visible of [true, false]) {
      const scene = createScene(scenario, result, {
        blockers: visible,
        constraints: false,
      });
      const blockers: THREE.Mesh[] = [],
        water: THREE.Mesh[] = [];
      scene.traverse((o) => {
        if (
          !(o instanceof THREE.Mesh) ||
          !(o.material instanceof THREE.MeshStandardMaterial)
        )
          return;
        if (o.material.transparent) blockers.push(o);
        if (o.material.color.getHex() === 0x458f9b) water.push(o);
      });
      expect(blockers).toHaveLength(visible ? scenario.blockers.length : 0);
      for (const blocker of blockers) {
        const material = blocker.material as THREE.MeshStandardMaterial;
        expect(material.opacity).toBeGreaterThan(0);
        expect(material.opacity).toBeLessThan(1);
        expect(material.color.r).toBeGreaterThan(material.color.g * 2);
      }
      expect(water.length).toBeGreaterThan(0);
      for (const mesh of water) {
        const positions = mesh.geometry.getAttribute("position");
        for (let i = 0; i < positions.count; i++)
          expect(positions.getY(i)).toBeCloseTo(-1.4, 5);
      }
      disposeScene(scene);
    }
    expect(generateHouse(scenario, 42)).toEqual(result);
  });
});
