import * as THREE from "three";
import { houseGeometry } from "./houses";
import type { House, HousePoint } from "./house-types";

const counterclockwise = (ring: HousePoint[]) => {
  const points = ring.slice();
  if (THREE.ShapeUtils.area(points.map((p) => new THREE.Vector2(p.x, p.y))) < 0)
    points.reverse();
  return points;
};
const meshGeometry = (points: THREE.Vector3[]) => {
  const geometry = new THREE.BufferGeometry().setFromPoints(points);
  geometry.computeVertexNormals();
  return geometry;
};
const quad = (
  target: THREE.Vector3[],
  a: THREE.Vector3,
  b: THREE.Vector3,
  c: THREE.Vector3,
  d: THREE.Vector3,
) => target.push(a, b, c, a, c, d);

export function createHouseGroup(house: House, conflict = false): THREE.Group {
  const shape = houseGeometry(house),
    footprint = counterclockwise(shape.footprint),
    roof = counterclockwise(shape.roof),
    [r0, r1] = shape.ridge,
    axis = new THREE.Vector2(r1.x - r0.x, r1.y - r0.y).normalize(),
    distance = (p: HousePoint) =>
      Math.abs(axis.x * (p.y - r0.y) - axis.y * (p.x - r0.x)),
    run = distance(roof[0]),
    nearestEnd = (p: HousePoint) =>
      (p.x - r0.x) ** 2 + (p.y - r0.y) ** 2 <=
      (p.x - r1.x) ** 2 + (p.y - r1.y) ** 2
        ? 0
        : 1,
    vector = (p: HousePoint, z: number) => new THREE.Vector3(p.x, p.y, z),
    bottom = footprint.map((p) => vector(p, 0)),
    // The wall/roof intersection is inset from the overhanging eave. Derive
    // its height from the supplied roof planes, not from house dimensions.
    top = footprint.map((p) =>
      vector(
        p,
        shape.ridgeHeight -
          ((shape.ridgeHeight - shape.eaveHeight) * distance(p)) / run,
      ),
    ),
    innerRidge: THREE.Vector3[] = [],
    walls: THREE.Vector3[] = [],
    planes: THREE.Vector3[] = [];
  for (let i = 1; i < bottom.length - 1; i++)
    walls.push(bottom[0], bottom[i + 1], bottom[i]);
  for (let i = 0; i < footprint.length; i++) {
    const j = (i + 1) % footprint.length,
      end = nearestEnd(footprint[i]);
    quad(walls, bottom[i], bottom[j], top[j], top[i]);
    if (end === nearestEnd(footprint[j])) {
      const peak = new THREE.Vector3(
        (footprint[i].x + footprint[j].x) / 2,
        (footprint[i].y + footprint[j].y) / 2,
        shape.ridgeHeight,
      );
      innerRidge[end] = peak;
      walls.push(top[i], top[j], peak);
    }
  }
  for (let i = 0; i < footprint.length; i++) {
    const j = (i + 1) % footprint.length,
      a = nearestEnd(footprint[i]),
      b = nearestEnd(footprint[j]);
    if (a !== b) quad(walls, top[i], top[j], innerRidge[b], innerRidge[a]);
  }
  for (let i = 0; i < roof.length; i++) {
    const j = (i + 1) % roof.length,
      a = nearestEnd(roof[i]),
      b = nearestEnd(roof[j]);
    if (a !== b)
      quad(
        planes,
        vector(roof[i], shape.eaveHeight),
        vector(roof[j], shape.eaveHeight),
        vector(shape.ridge[b], shape.ridgeHeight),
        vector(shape.ridge[a], shape.ridgeHeight),
      );
  }
  const group = new THREE.Group();
  group.name = `house:${house.id}`;
  group.userData = { houseId: house.id, conflict };
  const wallGeometry = meshGeometry(walls),
    roofGeometry = meshGeometry(planes),
    wallMesh = new THREE.Mesh(
      wallGeometry,
      new THREE.MeshBasicMaterial({ color: conflict ? "#dc9689" : "#d6c6a8" }),
    ),
    roofMesh = new THREE.Mesh(
      roofGeometry,
      [conflict ? "#a64436" : "#776353", conflict ? "#8f352b" : "#665244"].map(
        (color) =>
          new THREE.MeshBasicMaterial({
            color,
            side: THREE.DoubleSide,
            // The closed wall volume has a pitched cap underneath the roof.
            polygonOffset: true,
            polygonOffsetFactor: -1,
            polygonOffsetUnits: -1,
          }),
      ),
    );
  roofGeometry.addGroup(0, 6, 0);
  roofGeometry.addGroup(6, 6, 1);
  wallMesh.name = "house-walls";
  roofMesh.name = "house-roof";
  group.add(wallMesh, roofMesh);
  for (const [name, geometry] of [
    ["house-wall-edges", wallGeometry],
    ["house-roof-edges", roofGeometry],
  ] as const) {
    const edges = new THREE.LineSegments(
      new THREE.EdgesGeometry(geometry, 20),
      new THREE.LineBasicMaterial({
        color: conflict ? "#8b2e23" : "#4d493d",
        transparent: true,
        opacity: 0.45,
      }),
    );
    edges.name = name;
    group.add(edges);
  }
  const center = footprint
      .reduce<THREE.Vector3>(
        (sum, p) => sum.add(vector(p, 0)),
        new THREE.Vector3(),
      )
      .divideScalar(footprint.length),
    entry = vector(shape.entrance, 0.06),
    outward = vector(shape.entrance, 0).sub(center).normalize(),
    across = new THREE.Vector3(-outward.y, outward.x, 0),
    tip = entry.clone().addScaledVector(outward, 0.05),
    tail = entry.clone().addScaledVector(outward, 0.9),
    shoulder = entry.clone().addScaledVector(outward, 0.45),
    marker = new THREE.LineSegments(
      new THREE.BufferGeometry().setFromPoints([
        tail,
        tip,
        tip,
        shoulder.clone().addScaledVector(across, 0.2),
        tip,
        shoulder.clone().addScaledVector(across, -0.2),
      ]),
      new THREE.LineBasicMaterial({ color: conflict ? "#8b2e23" : "#285b4a" }),
    );
  marker.name = "house-entrance";
  group.add(marker);
  return group;
}
