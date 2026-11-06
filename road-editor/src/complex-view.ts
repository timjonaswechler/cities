import * as THREE from "three";
import { createHouseGroup } from "./house-view";
import type { BuildingComplex } from "./plot-types";

export function createComplexGroup(complex: BuildingComplex): THREE.Group {
  const group = new THREE.Group();
  group.name = `complex:${complex.id}`;
  group.userData = { kind: "building-complex", complexId: complex.id };
  for (const volume of complex.volumes) {
    const child = createHouseGroup(volume);
    child.name = `volume:${volume.id}`;
    child.traverse((object) => {
      Object.assign(object.userData, {
        complexId: complex.id,
        volumeId: volume.id,
        role: volume.role,
      });
    });
    group.add(child);
  }
  return group;
}
