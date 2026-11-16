import * as THREE from "three";
import { ConvexGeometry } from "three/addons/geometries/ConvexGeometry.js";
import {
  materials,
  validateValues,
  type FeatureId,
  type Values,
} from "./feature-catalog";

export interface FeaturePort {
  id: string;
  kind: "room" | "wall" | "roof" | "access";
  position: [number, number, number];
  normal: [number, number, number];
}
export interface FeatureSpace {
  kind: "habitable" | "circulation";
  min: [number, number, number];
  max: [number, number, number];
}
export interface FeatureGeometry {
  solid: THREE.Group;
  reference: THREE.Group;
  ports: FeaturePort[];
  spaces: FeatureSpace[];
  bounds: THREE.Box3;
  metrics: Record<string, number>;
}
function addMesh(
  group: THREE.Group,
  name: string,
  geometry: THREE.BufferGeometry,
  materialId: string,
) {
  const mesh = new THREE.Mesh(
    geometry,
    new THREE.MeshStandardMaterial({
      color: materials.find((m) => m.id === materialId)!.color,
      roughness: materialId === "copper" ? 0.5 : 0.9,
      metalness: materialId === "copper" ? 0.4 : 0,
      side: THREE.DoubleSide,
    }),
  );
  mesh.name = name;
  mesh.userData.materialId = materialId;
  mesh.castShadow = true;
  mesh.receiveShadow = name === "floor" || name === "walkway";
  group.add(mesh);
  const edges = new THREE.LineSegments(
    new THREE.EdgesGeometry(geometry, 25),
    new THREE.LineBasicMaterial({
      color: "#493e32",
      transparent: true,
      opacity: 0.35,
    }),
  );
  edges.name = `${name}-edges`;
  group.add(edges);
  return mesh;
}
function box(
  group: THREE.Group,
  name: string,
  size: [number, number, number],
  position: [number, number, number],
  material: string,
) {
  const geometry = new THREE.BoxGeometry(...size);
  geometry.translate(...position);
  return addMesh(group, name, geometry, material);
}
function referenceBox(
  group: THREE.Group,
  size: [number, number, number],
  center: [number, number, number],
) {
  const shape = new THREE.BoxGeometry(...size),
    geometry = new THREE.EdgesGeometry(shape);
  geometry.translate(...center);
  shape.dispose();
  const lines = new THREE.LineSegments(
    geometry,
    new THREE.LineDashedMaterial({
      color: "#9ca89e",
      dashSize: 0.2,
      gapSize: 0.12,
      transparent: true,
      opacity: 0.8,
    }),
  );
  lines.computeLineDistances();
  group.add(lines);
}
function roof(
  group: THREE.Group,
  shape: string,
  w: number,
  d: number,
  rise: number,
  z: number,
  material: string,
  flatThickness = 0.25,
) {
  if (shape === "flat") {
    box(
      group,
      "roof",
      [w, d, flatThickness],
      [0, 0, z + flatThickness / 2],
      material,
    );
    return;
  }
  const points = [
    [-w / 2, -d / 2, z],
    [w / 2, -d / 2, z],
    [w / 2, d / 2, z],
    [-w / 2, d / 2, z],
  ];
  if (shape === "shed")
    points.push([-w / 2, d / 2, z + rise], [w / 2, d / 2, z + rise]);
  else {
    const halfRidge =
      shape === "hip" ? Math.max(0, (d - Math.min(w, d)) / 2) : d / 2;
    points.push([0, -halfRidge, z + rise], [0, halfRidge, z + rise]);
  }
  addMesh(
    group,
    "roof",
    new ConvexGeometry(points.map((p) => new THREE.Vector3(p[0], p[1], p[2]))),
    material,
  );
}
function room(
  group: THREE.Group,
  w: number,
  d: number,
  h: number,
  t: number,
  material: string,
  open = false,
) {
  box(group, "floor", [w, d, t], [0, 0, t / 2], material);
  box(group, "wall-left", [t, d, h], [(-w + t) / 2, 0, h / 2], material);
  box(group, "wall-right", [t, d, h], [(w - t) / 2, 0, h / 2], material);
  box(group, "wall-back", [w - 2 * t, t, h], [0, (d - t) / 2, h / 2], material);
  if (!open) {
    const door = Math.min(1.2, w - 2 * t),
      side = (w - door) / 2,
      doorHeight = 2.05;
    for (const sign of [-1, 1])
      box(
        group,
        `door-jamb-${sign}`,
        [side, t, h],
        [(sign * (door + side)) / 2, (-d + t) / 2, h / 2],
        material,
      );
    box(
      group,
      "door-lintel",
      [door, t, h - doorHeight],
      [0, (-d + t) / 2, (h + doorHeight) / 2],
      material,
    );
  }
}
function roomPorts(
  w: number,
  d: number,
  h: number,
  floor = 0.2,
): FeaturePort[] {
  return [
    {
      id: "Eingang",
      kind: "access",
      position: [0, -d / 2, floor],
      normal: [0, -1, 0],
    },
    {
      id: "Links",
      kind: "wall",
      position: [-w / 2, 0, h / 2],
      normal: [-1, 0, 0],
    },
    {
      id: "Rechts",
      kind: "wall",
      position: [w / 2, 0, h / 2],
      normal: [1, 0, 0],
    },
    {
      id: "Rückseite",
      kind: "wall",
      position: [0, d / 2, h / 2],
      normal: [0, 1, 0],
    },
    {
      id: "Dachanschluss",
      kind: "roof",
      position: [0, 0, h],
      normal: [0, 0, 1],
    },
  ];
}
function roomSpace(w: number, d: number, h: number, t: number): FeatureSpace {
  return {
    kind: "habitable",
    min: [-w / 2 + t, -d / 2 + t, t],
    max: [w / 2 - t, d / 2 - t, h],
  };
}
export function createFeature(id: FeatureId, values: Values): FeatureGeometry {
  validateValues(id, values);
  const n = (key: string) => values[key] as number,
    s = (key: string) => values[key] as string,
    solid = new THREE.Group(),
    reference = new THREE.Group();
  solid.name = `feature:${id}`;
  let ports: FeaturePort[] = [],
    spaces: FeatureSpace[] = [],
    metrics: Record<string, number> = {};
  switch (id) {
    case "room": {
      const w = n("width"),
        d = n("depth"),
        h = n("height"),
        t = n("thickness");
      room(solid, w, d, h, t, s("material"), s("front") === "open");
      ports = roomPorts(w, d, h, t);
      spaces = [roomSpace(w, d, h, t)];
      break;
    }
    case "roof": {
      const w = n("width") + 2 * n("eaves"),
        d = n("depth") + 2 * n("eaves");
      roof(
        solid,
        s("shape"),
        w,
        d,
        n("rise"),
        0,
        s("material"),
        n("thickness"),
      );
      referenceBox(reference, [n("width"), n("depth"), 0.04], [0, 0, -0.03]);
      ports = [
        {
          id: "Auflager",
          kind: "roof",
          position: [0, 0, 0],
          normal: [0, 0, -1],
        },
      ];
      break;
    }
    case "annex": {
      const w = n("width"),
        d = n("depth"),
        h = n("height");
      room(solid, w, d, h, 0.18, s("material"));
      roof(
        solid,
        s("shape"),
        w + 2 * n("eaves"),
        d + 2 * n("eaves"),
        n("rise"),
        h,
        s("roofMaterial"),
      );
      referenceBox(
        reference,
        [w + 2, 2, h + 0.8],
        [0, d / 2 + 1, (h + 0.8) / 2],
      );
      ports = [
        {
          id: "Zum Hauptbau",
          kind: "wall",
          position: [0, d / 2, h / 2],
          normal: [0, 1, 0],
        },
        roomPorts(w, d, h, 0.18)[0],
      ];
      spaces = [roomSpace(w, d, h, 0.18)];
      break;
    }
    case "overhang": {
      const w = n("width"),
        d = n("depth"),
        h = n("height"),
        base = n("base"),
        p = n("projection");
      const upper = new THREE.Group();
      room(upper, w, d + p, h, 0.2, s("material"), true);
      upper.position.set(0, -p / 2, base);
      solid.add(upper);
      referenceBox(reference, [w, d, base], [0, 0, base / 2]);
      if (s("supports") === "yes" && p > 0)
        for (const x of [-w * 0.32, w * 0.32]) {
          const points: THREE.Vector3[] = [];
          for (const dx of [-0.1, 0.1])
            for (const [y, z] of [
              [-d / 2, base - 0.7],
              [-d / 2, base],
              [-d / 2 - p, base],
            ])
              points.push(new THREE.Vector3(x + dx, y, z));
          addMesh(solid, "corbel", new ConvexGeometry(points), s("material"));
        }
      ports = roomPorts(w, d + p, h).map((port) => ({
        ...port,
        position: [
          port.position[0],
          port.position[1] - p / 2,
          port.position[2] + base,
        ],
      }));
      const space = roomSpace(w, d + p, h, 0.2);
      spaces = [
        {
          ...space,
          min: [space.min[0], space.min[1] - p / 2, space.min[2] + base],
          max: [space.max[0], space.max[1] - p / 2, space.max[2] + base],
        },
      ];
      metrics.projection = p;
      break;
    }
    case "gate": {
      const span = n("span"),
        h = n("clearance"),
        rise = s("shape") === "arch" ? n("rise") : 0,
        width = span + 2 * n("pier"),
        top = h + rise + n("lintel"),
        depth = n("depth"),
        shape = new THREE.Shape();
      shape.moveTo(-width / 2, 0);
      shape.lineTo(-width / 2, top);
      shape.lineTo(width / 2, top);
      shape.lineTo(width / 2, 0);
      shape.lineTo(span / 2, 0);
      shape.lineTo(span / 2, h);
      const steps = rise ? 24 : 1;
      for (let i = 1; i <= steps; i++) {
        const a = (i * Math.PI) / steps;
        shape.lineTo((span / 2) * Math.cos(a), h + rise * Math.sin(a));
      }
      shape.lineTo(-span / 2, 0);
      shape.closePath();
      const geometry = new THREE.ExtrudeGeometry(shape, {
        depth,
        bevelEnabled: false,
        steps: 1,
        curveSegments: 24,
      });
      geometry.rotateX(Math.PI / 2);
      geometry.translate(0, depth / 2, 0);
      addMesh(solid, "gate-with-opening", geometry, s("material"));
      ports = [-1, 1].map((sign) => ({
        id: sign < 0 ? "Einfahrt" : "Ausfahrt",
        kind: "access",
        position: [0, (sign * depth) / 2, 0],
        normal: [0, sign, 0],
      }));
      spaces = [
        {
          kind: "circulation",
          min: [-span / 2, -depth / 2, 0],
          max: [span / 2, depth / 2, h],
        },
      ];
      metrics.clearance = h;
      break;
    }
    case "wall": {
      const length = n("length"),
        h = n("height"),
        t = n("thickness");
      box(solid, "wall", [length, t, h], [0, 0, h / 2], s("material"));
      if (s("cap") === "pitched") {
        const cap = new THREE.Group();
        roof(cap, "gable", t + 0.16, length + 0.1, 0.22, h, s("material"));
        cap.rotation.z = Math.PI / 2;
        solid.add(cap);
      } else
        box(
          solid,
          "cap",
          [length + 0.1, t + 0.1, 0.12],
          [0, 0, h + 0.06],
          s("material"),
        );
      if (s("pillars") === "yes")
        for (const sign of [-1, 1])
          box(
            solid,
            "end-pier",
            [t + 0.25, t + 0.25, h + 0.3],
            [(sign * length) / 2, 0, (h + 0.3) / 2],
            s("material"),
          );
      ports = [-1, 1].map((sign) => ({
        id: sign < 0 ? "Anfang" : "Ende",
        kind: "wall",
        position: [(sign * length) / 2, 0, h / 2],
        normal: [sign, 0, 0],
      }));
      break;
    }
    case "connection": {
      const length = n("length"),
        w = n("width"),
        base = n("base"),
        h = n("clearance"),
        covered = s("cover") === "covered";
      box(
        solid,
        "walkway",
        [w, length, 0.16],
        [0, 0, base + 0.08],
        s("material"),
      );
      for (const side of [-1, 1]) {
        box(
          solid,
          "railing",
          [0.12, length, 0.12],
          [(side * (w - 0.12)) / 2, 0, base + 1.16],
          s("material"),
        );
        for (const end of [-1, 1])
          box(
            solid,
            "post",
            [0.16, 0.16, (covered ? h : 1) + 0.16],
            [
              (side * (w - 0.16)) / 2,
              (end * (length - 0.16)) / 2,
              base + ((covered ? h : 1) + 0.16) / 2,
            ],
            s("material"),
          );
      }
      if (covered)
        roof(
          solid,
          "gable",
          w + 0.5,
          length + 0.4,
          n("rise"),
          base + 0.16 + h,
          s("roofMaterial"),
        );
      ports = [-1, 1].map((sign) => ({
        id: sign < 0 ? "Verbindung A" : "Verbindung B",
        kind: "access",
        position: [0, (sign * length) / 2, base + 0.16],
        normal: [0, sign, 0],
      }));
      spaces = [
        {
          kind: "circulation",
          min: [-w / 2 + 0.16, -length / 2, base + 0.16],
          max: [w / 2 - 0.16, length / 2, base + 0.16 + h],
        },
      ];
      if (covered) metrics.clearance = h;
      break;
    }
  }
  solid.updateMatrixWorld(true);
  const bounds = new THREE.Box3().setFromObject(solid);
  metrics = { ...metrics, height: bounds.max.z };
  return { solid, reference, ports, spaces, bounds, metrics };
}
export function disposeFeature(root: THREE.Object3D) {
  root.traverse((object) => {
    if (!(object instanceof THREE.Mesh || object instanceof THREE.Line)) return;
    object.geometry.dispose();
    const list = Array.isArray(object.material)
      ? object.material
      : [object.material];
    list.forEach((material) => material.dispose());
  });
}
