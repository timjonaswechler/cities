import { afterAll, describe, expect, it } from "vitest";
import { mkdirSync, writeFileSync } from "node:fs";
import * as THREE from "three";
import { CATALOG, GROUPS, buildScenario } from "../src/scenarios";
import { generateHouse } from "../src/generator";
import { createScene, disposeScene } from "../src/scene";

const summary: Record<
  string,
  { cases: number; triangles: number; failures: string[] }
> = {};
afterAll(() => {
  mkdirSync("test-results", { recursive: true });
  writeFileSync(
    "test-results/mesh-summary.json",
    JSON.stringify({ seed: 42, groups: summary }, null, 2),
  );
});
describe("supplemental full-catalog mesh acceptance (same frozen 9,136 IDs)", () => {
  for (const group of GROUPS)
    it(
      group.id + ": every case can actually be triangulated",
      () => {
        const failures: string[] = [];
        let triangles = 0,
          cases = 0;
        const a = new THREE.Vector3(),
          b = new THREE.Vector3(),
          c = new THREE.Vector3();
        for (const spec of CATALOG.filter((s) => s.group === group.id)) {
          const context = buildScenario(spec);
          let scene: THREE.Scene | undefined;
          try {
            scene = createScene(context, generateHouse(context, 42), {
              blockers: true,
              constraints: true,
            });
            scene.traverse((object) => {
              if (!(object instanceof THREE.Mesh)) return;
              const geometry = object.geometry as THREE.BufferGeometry;
              const position = geometry.getAttribute("position"),
                normal = geometry.getAttribute("normal");
              if (
                !position ||
                !normal ||
                !Array.from(position.array).every(Number.isFinite) ||
                !Array.from(normal.array).every(Number.isFinite)
              )
                throw Error("nonfinite/missing mesh data");
              for (let i = 0; i < normal.count; i++) {
                if (
                  Math.abs(
                    Math.hypot(normal.getX(i), normal.getY(i), normal.getZ(i)) -
                      1,
                  ) > 1e-4
                )
                  throw Error("nonunit normal");
              }
              const count = geometry.index?.count ?? position.count;
              if (count % 3) throw Error("invalid triangle count");
              for (let i = 0; i < count; i += 3) {
                const ia = geometry.index ? geometry.index.getX(i) : i;
                const ib = geometry.index ? geometry.index.getX(i + 1) : i + 1;
                const ic = geometry.index ? geometry.index.getX(i + 2) : i + 2;
                if (
                  ![ia, ib, ic].every(
                    (n) => Number.isInteger(n) && n >= 0 && n < position.count,
                  )
                )
                  throw Error("invalid index");
                a.fromBufferAttribute(position, ia);
                b.fromBufferAttribute(position, ib);
                c.fromBufferAttribute(position, ic);
                if (b.sub(a).cross(c.sub(a)).length() <= 1e-7)
                  throw Error("degenerate triangle");
                triangles++;
              }
            });
            cases++;
          } catch (cause) {
            failures.push(spec.id + ": " + String(cause));
          } finally {
            if (scene) disposeScene(scene);
          }
        }
        summary[group.id] = { cases, triangles, failures };
        expect(failures, failures.slice(0, 20).join("\n")).toEqual([]);
        expect(cases).toBe(CATALOG.filter((s) => s.group === group.id).length);
      },
      600_000,
    );
});
