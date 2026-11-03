import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import * as clipping from "polygon-clipping";
import type { MultiPolygon, Polygon as ClipPolygon } from "polygon-clipping";
import type { HousePart, HouseResult, Polygon, Scenario, View } from "./model";
import { rect } from "./geometry";

export interface Layers {
  blockers: boolean;
  constraints: boolean;
}
const palette = {
  background: 0xdde1d8,
  ground: 0xc7cbb8,
  bank: 0x8b9486,
  road: 0x8c9085,
  path: 0xb49d79,
  square: 0xd9c8a1,
  water: 0x458f9b,
  blocker: 0xd7524d,
};
// Micrometre snapping removes trigonometric near-duplicates before sweep-line clipping.
// This is far below Float32 rendering precision and every collision clearance.
const toClip = (polygon: Polygon): ClipPolygon => {
  const ring = polygon.map(
    (p) =>
      [Math.round(p.x * 1e6) / 1e6, Math.round(p.z * 1e6) / 1e6] as [
        number,
        number,
      ],
  );
  return [[...ring, ring[0]]];
};
const boundary = toClip(rect({ x: 0, z: 0 }, 44, 44));

function union(polygons: Polygon[]): MultiPolygon {
  if (!polygons.length) return [];
  const converted = polygons.map(toClip);
  return clipping.intersection(
    clipping.union(converted[0], ...converted.slice(1)),
    boundary,
  );
}
function shapes(polygons: MultiPolygon): THREE.Shape[] {
  return polygons.map((rings) => {
    const shape = new THREE.Shape(
      rings[0].map(([x, z]) => new THREE.Vector2(x, -z)),
    );
    for (const ring of rings.slice(1))
      shape.holes.push(
        new THREE.Path(ring.map(([x, z]) => new THREE.Vector2(x, -z))),
      );
    return shape;
  });
}
/** Clipped ribbon unions can contain slivers that collapse when stored as Float32.
 * Remove only numerically zero-area faces, preserving material groups and all real surfaces. */
function cleanTriangulation(
  source: THREE.BufferGeometry,
): THREE.BufferGeometry {
  const position = source.getAttribute("position");
  const indices = source.index;
  const count = indices?.count ?? position.count;
  const vertices: number[] = [];
  const clean = new THREE.BufferGeometry();
  const a = new THREE.Vector3(),
    b = new THREE.Vector3(),
    c = new THREE.Vector3();
  for (let i = 0; i < count; i += 3) {
    a.fromBufferAttribute(position, indices ? indices.getX(i) : i);
    b.fromBufferAttribute(position, indices ? indices.getX(i + 1) : i + 1);
    c.fromBufferAttribute(position, indices ? indices.getX(i + 2) : i + 2);
    if (
      new THREE.Vector3()
        .subVectors(b, a)
        .cross(new THREE.Vector3().subVectors(c, a))
        .lengthSq() <= 1e-14
    )
      continue;
    const material =
      source.groups.find((g) => i >= g.start && i < g.start + g.count)
        ?.materialIndex ?? 0;
    const last = clean.groups.at(-1);
    if (last?.materialIndex === material) last.count += 3;
    else clean.addGroup(vertices.length / 3, 3, material);
    vertices.push(...a.toArray(), ...b.toArray(), ...c.toArray());
  }
  clean.setAttribute("position", new THREE.Float32BufferAttribute(vertices, 3));
  clean.computeVertexNormals();
  source.dispose();
  return clean;
}
function flat(
  polygons: MultiPolygon,
  height: number,
  material: THREE.Material,
): THREE.Mesh {
  const geometry = cleanTriangulation(
    new THREE.ShapeGeometry(shapes(polygons)),
  );
  geometry.rotateX(-Math.PI / 2);
  geometry.translate(0, height, 0);
  const mesh = new THREE.Mesh(geometry, material);
  mesh.receiveShadow = true;
  return mesh;
}
const matte = (
  color: number,
  extra: THREE.MeshStandardMaterialParameters = {},
) =>
  new THREE.MeshStandardMaterial({
    color,
    roughness: 1,
    metalness: 0,
    ...extra,
  });

export function roofGeometry(part: HousePart): THREE.BufferGeometry {
  const w = part.width / 2 + part.overhang,
    d = part.depth / 2 + part.overhang,
    h = part.roofHeight;
  let points: number[][], faces: number[][];
  if (part.roof === "gable") {
    points = [
      [-w, 0, -d],
      [w, 0, -d],
      [0, h, -d],
      [-w, 0, d],
      [w, 0, d],
      [0, h, d],
    ];
    faces = [
      [0, 2, 1],
      [3, 4, 5],
      [0, 3, 5],
      [0, 5, 2],
      [1, 2, 5],
      [1, 5, 4],
    ];
  } else if (part.roof === "hip") {
    const inset = Math.min(w, d * 0.7);
    points = [
      [-w, 0, -d],
      [w, 0, -d],
      [w, 0, d],
      [-w, 0, d],
      [0, h, -d + inset],
      [0, h, d - inset],
    ];
    faces = [
      [0, 4, 1],
      [3, 2, 5],
      [0, 3, 5],
      [0, 5, 4],
      [1, 4, 5],
      [1, 5, 2],
    ];
  } else {
    points = [
      [-w, 0, -d],
      [w, 0, -d],
      [w, 0, d],
      [-w, 0, d],
      [-w, h, -d],
      [-w, h, d],
    ];
    faces = [
      [0, 4, 1],
      [3, 2, 5],
      [4, 5, 2],
      [4, 2, 1],
      [0, 3, 5],
      [0, 5, 4],
    ];
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute(
    "position",
    new THREE.Float32BufferAttribute(
      faces.flatMap((face) => face.flatMap((i) => points[i])),
      3,
    ),
  );
  geometry.computeVertexNormals();
  return geometry;
}
function outline(
  mesh: THREE.Mesh,
  color: number,
  opacity = 0.25,
): THREE.LineSegments {
  return new THREE.LineSegments(
    new THREE.EdgesGeometry(mesh.geometry, 25),
    new THREE.LineBasicMaterial({ color, transparent: true, opacity }),
  );
}

export function createScene(
  scenario: Scenario,
  result: HouseResult,
  layers: Layers,
): THREE.Scene {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(palette.background);
  scene.add(new THREE.HemisphereLight(0xfff6df, 0x7e918b, 2.5));
  const sun = new THREE.DirectionalLight(0xffefd5, 3.2);
  sun.position.set(-20, 38, 20);
  sun.castShadow = true;
  sun.shadow.mapSize.set(1024, 1024);
  Object.assign(sun.shadow.camera, {
    left: -30,
    right: 30,
    top: 30,
    bottom: -30,
    near: 1,
    far: 100,
  });
  sun.shadow.normalBias = 0.03;
  scene.add(sun);
  const waterSurfaces = scenario.surfaces.filter((s) => s.kind === "water");
  const waterUnion = union(waterSurfaces.flatMap((s) => s.polygons));
  const land = waterUnion.length
    ? clipping.difference(boundary, waterUnion)
    : [boundary];
  const slab = cleanTriangulation(
    new THREE.ExtrudeGeometry(shapes(land), {
      depth: 3.2,
      bevelEnabled: false,
      steps: 1,
    }),
  );
  slab.rotateX(-Math.PI / 2);
  slab.translate(0, -3.2, 0);
  const ground = new THREE.Mesh(slab, [
    matte(palette.ground),
    matte(palette.bank),
  ]);
  ground.receiveShadow = true;
  ground.castShadow = true;
  scene.add(ground);
  scene.add(
    flat(
      [boundary],
      -3.21,
      matte(waterSurfaces.length ? 0x32606a : palette.bank),
    ),
  );
  for (const surface of waterSurfaces)
    scene.add(
      flat(
        union(surface.polygons),
        -(surface.drop ?? 1.4),
        matte(palette.water, { roughness: 0.55 }),
      ),
    );
  for (const kind of ["square", "road", "path"] as const) {
    const polygons = scenario.surfaces
      .filter((s) => s.kind === kind)
      .flatMap((s) => s.polygons);
    if (!polygons.length) continue;
    // Raised strips continue over recessed water as deliberately simple bridge blockouts.
    scene.add(
      flat(
        union(polygons),
        kind === "path" ? 0.07 : kind === "road" ? 0.05 : 0.025,
        matte(palette[kind]),
      ),
    );
  }
  if (layers.blockers) {
    for (const blocker of scenario.blockers) {
      const group = new THREE.Group();
      const box = new THREE.Mesh(
        new THREE.BoxGeometry(blocker.width, blocker.height, blocker.depth),
        matte(palette.blocker, {
          transparent: true,
          opacity: 0.26,
          depthWrite: false,
        }),
      );
      box.position.y = blocker.height / 2;
      group.add(box);
      const lines = outline(box, palette.blocker, 0.85);
      lines.position.copy(box.position);
      group.add(lines);
      group.position.set(blocker.center.x, 0, blocker.center.z);
      group.rotation.y = -blocker.angle;
      scene.add(group);
    }
  }
  if (layers.constraints) {
    const points = [...scenario.buildArea, scenario.buildArea[0]].map(
      (p) => new THREE.Vector3(p.x, 0.12, p.z),
    );
    const line = new THREE.Line(
      new THREE.BufferGeometry().setFromPoints(points),
      new THREE.LineDashedMaterial({
        color: 0x70856c,
        dashSize: 0.7,
        gapSize: 0.45,
      }),
    );
    line.computeLineDistances();
    scene.add(line);
  }
  if (result.ok) {
    const house = result.house;
    const group = new THREE.Group();
    group.position.set(house.center.x, 0, house.center.z);
    group.rotation.y = -house.angle;
    const colors = {
      cottage: 0x9a644e,
      townhouse: 0x767d79,
      longhouse: 0x8d7754,
      winghouse: 0x9a7251,
    };
    for (const part of house.parts) {
      const walls = new THREE.Mesh(
        new THREE.BoxGeometry(part.width, part.wallHeight, part.depth),
        matte(0xf1e6cc),
      );
      walls.position.set(part.center.x, part.wallHeight / 2, part.center.z);
      walls.castShadow = true;
      walls.receiveShadow = true;
      const edges = outline(walls, 0x655d4e, 0.16);
      edges.position.copy(walls.position);
      group.add(walls, edges);
      const roof = new THREE.Mesh(
        roofGeometry(part),
        matte(colors[house.family]),
      );
      roof.position.set(part.center.x, part.wallHeight, part.center.z);
      roof.castShadow = true;
      roof.receiveShadow = true;
      const roofEdges = outline(roof, 0x463d34, 0.22);
      roofEdges.position.copy(roof.position);
      group.add(roof, roofEdges);
    }
    scene.add(group);
    if (layers.constraints) {
      for (const envelope of house.envelopes) {
        const points = [...envelope, envelope[0]].map(
          (p) => new THREE.Vector3(p.x, 0.14, p.z),
        );
        scene.add(
          new THREE.Line(
            new THREE.BufferGeometry().setFromPoints(points),
            new THREE.LineBasicMaterial({ color: 0xaf7a36 }),
          ),
        );
      }
      const marker = new THREE.Mesh(
        new THREE.ConeGeometry(0.32, 0.8, 3),
        matte(0x386e63),
      );
      marker.position.set(house.entrance.x, 0.5, house.entrance.z);
      scene.add(marker);
    }
  }
  return scene;
}

export function createRenderer(): THREE.WebGLRenderer {
  const renderer = new THREE.WebGLRenderer({
    antialias: true,
    preserveDrawingBuffer: true,
  });
  renderer.setPixelRatio(1);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  return renderer;
}
export function cameraFor(
  view: View,
  width: number,
  height: number,
): THREE.OrthographicCamera {
  const aspect = width / height,
    span = view === "top" ? 49 : 56;
  const camera = new THREE.OrthographicCamera(
    (-span * aspect) / 2,
    (span * aspect) / 2,
    span / 2,
    -span / 2,
    0.1,
    250,
  );
  camera.position.set(
    ...((view === "top" ? [0, 65, 0.001] : [42, 36, 48]) as [
      number,
      number,
      number,
    ]),
  );
  camera.lookAt(0, 0, 0);
  camera.updateProjectionMatrix();
  return camera;
}
export function disposeScene(scene: THREE.Scene): void {
  const geometries = new Set<THREE.BufferGeometry>(),
    materials = new Set<THREE.Material>();
  scene.traverse((object) => {
    if (object instanceof THREE.Mesh || object instanceof THREE.Line) {
      geometries.add(object.geometry);
      for (const material of Array.isArray(object.material)
        ? object.material
        : [object.material])
        materials.add(material);
    }
    if (object instanceof THREE.DirectionalLight) object.shadow.dispose();
  });
  geometries.forEach((g) => g.dispose());
  materials.forEach((m) => m.dispose());
  scene.clear();
}

/** One shared offscreen context for all thumbnail images, rather than a context per card. */
export class ThumbnailRenderer {
  private renderer = createRenderer();
  render(
    scenario: Scenario,
    result: HouseResult,
    view: View,
    layers: Layers,
  ): string {
    this.renderer.setSize(640, 440, false);
    const scene = createScene(scenario, result, layers);
    try {
      this.renderer.render(scene, cameraFor(view, 640, 440));
      return this.renderer.domElement.toDataURL("image/webp", 0.88);
    } finally {
      disposeScene(scene);
    }
  }
  dispose(): void {
    this.renderer.dispose();
  }
}

export class InspectorRenderer {
  private renderer = createRenderer();
  private scene?: THREE.Scene;
  private camera = cameraFor("perspective", 900, 700);
  private controls: OrbitControls;
  private observer: ResizeObserver;
  constructor(private container: HTMLElement) {
    container.append(this.renderer.domElement);
    this.renderer.domElement.setAttribute(
      "aria-label",
      "Interaktive 3D-Ansicht. Ziehen zum Drehen, Mausrad zum Zoomen, rechte Maustaste zum Verschieben.",
    );
    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.maxPolarAngle = Math.PI / 2 - 0.02;
    this.controls.minZoom = 0.5;
    this.controls.maxZoom = 4;
    this.controls.addEventListener("change", () => this.draw());
    this.observer = new ResizeObserver(() => this.resize());
    this.observer.observe(container);
  }
  show(
    scenario: Scenario,
    result: HouseResult,
    view: View,
    layers: Layers,
  ): void {
    if (this.scene) disposeScene(this.scene);
    this.scene = createScene(scenario, result, layers);
    this.reset(view);
  }
  reset(view: View): void {
    this.camera.position.set(
      ...((view === "top" ? [0, 65, 0.001] : [42, 36, 48]) as [
        number,
        number,
        number,
      ]),
    );
    this.camera.zoom = 1;
    this.controls.target.set(0, 0, 0);
    this.controls.update();
    this.resize();
  }
  private resize(): void {
    const { width, height } = this.container.getBoundingClientRect();
    if (!width || !height) return;
    this.renderer.setSize(width, height, false);
    const span = 56;
    this.camera.left = (-span * width) / height / 2;
    this.camera.right = -this.camera.left;
    this.camera.top = span / 2;
    this.camera.bottom = -span / 2;
    this.camera.updateProjectionMatrix();
    this.draw();
  }
  private draw(): void {
    if (this.scene) this.renderer.render(this.scene, this.camera);
  }
  image(): string {
    this.draw();
    return this.renderer.domElement.toDataURL("image/png");
  }
  dispose(): void {
    this.observer.disconnect();
    this.controls.dispose();
    if (this.scene) disposeScene(this.scene);
    this.renderer.dispose();
  }
}
