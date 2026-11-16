import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { disposeFeature, type FeatureGeometry } from "./feature-geometry";

export class FeatureView {
  private renderer = new THREE.WebGLRenderer({
    antialias: true,
    preserveDrawingBuffer: true,
  });
  private scene = new THREE.Scene();
  private camera = new THREE.PerspectiveCamera(38, 1, 0.05, 1000);
  private controls: OrbitControls;
  private root = new THREE.Group();
  private ports = new THREE.Group();
  private spaces = new THREE.Group();
  private outline?: THREE.Box3Helper;
  private bounds = new THREE.Box3();
  private feature?: FeatureGeometry;
  constructor(private container: HTMLElement) {
    this.scene.background = new THREE.Color("#f2f1e9");
    this.camera.up.set(0, 0, 1);
    this.camera.position.set(13, -18, 12);
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
    this.renderer.domElement.setAttribute("aria-label", "Bauteil in 3D");
    container.append(this.renderer.domElement);
    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = false;
    this.controls.minDistance = 1;
    this.controls.maxDistance = 180;
    this.controls.addEventListener("change", () => this.render());
    const grid = new THREE.GridHelper(80, 80, "#b5c0b2", "#d8ded2");
    grid.rotation.x = Math.PI / 2;
    grid.position.z = -0.025;
    const plane = new THREE.Mesh(
      new THREE.PlaneGeometry(80, 80),
      new THREE.ShadowMaterial({ opacity: 0.13 }),
    );
    plane.receiveShadow = true;
    plane.position.z = -0.02;
    const key = new THREE.DirectionalLight(0xfff5dd, 3);
    key.position.set(-8, -12, 22);
    key.castShadow = true;
    key.shadow.mapSize.set(1024, 1024);
    Object.assign(key.shadow.camera, {
      left: -20,
      right: 20,
      top: 20,
      bottom: -20,
      near: 0.1,
      far: 80,
    });
    key.shadow.normalBias = 0.04;
    this.scene.add(
      new THREE.HemisphereLight(0xffffff, 0x8a937f, 2),
      key,
      plane,
      grid,
      this.root,
      this.ports,
      this.spaces,
    );
    new ResizeObserver(() => {
      const { width, height } = container.getBoundingClientRect();
      this.renderer.setSize(width, height);
      this.camera.aspect = width / Math.max(height, 1);
      this.camera.updateProjectionMatrix();
      this.render();
    }).observe(container);
  }
  setFeature(feature: FeatureGeometry, fit: boolean, invalid: boolean) {
    for (const group of [this.root, this.ports, this.spaces]) {
      disposeFeature(group);
      group.clear();
    }
    if (this.outline) {
      this.scene.remove(this.outline);
      disposeFeature(this.outline);
    }
    this.feature = feature;
    this.bounds.copy(feature.bounds);
    this.root.add(feature.solid, feature.reference);
    this.outline = new THREE.Box3Helper(
      feature.bounds,
      invalid ? 0xbd563f : 0x92a58a,
    );
    const outlineMaterials = Array.isArray(this.outline.material)
      ? this.outline.material
      : [this.outline.material];
    for (const material of outlineMaterials) {
      material.transparent = true;
      material.opacity = invalid ? 0.9 : 0.3;
    }
    this.scene.add(this.outline);
    for (const port of feature.ports) {
      const color =
          port.kind === "access"
            ? 0x29806b
            : port.kind === "roof"
              ? 0x677fbb
              : 0xb88637,
        origin = new THREE.Vector3(...port.position),
        arrow = new THREE.ArrowHelper(
          new THREE.Vector3(...port.normal),
          origin,
          0.8,
          color,
          0.2,
          0.12,
        ),
        dot = new THREE.Mesh(
          new THREE.SphereGeometry(0.07, 12, 8),
          new THREE.MeshBasicMaterial({ color, depthTest: false }),
        );
      dot.position.copy(origin);
      dot.renderOrder = 3;
      this.ports.add(arrow, dot);
    }
    for (const space of feature.spaces) {
      const bounds = new THREE.Box3(
          new THREE.Vector3(...space.min),
          new THREE.Vector3(...space.max),
        ),
        size = bounds.getSize(new THREE.Vector3()),
        mesh = new THREE.Mesh(
          new THREE.BoxGeometry(size.x, size.y, size.z),
          new THREE.MeshBasicMaterial({
            color: space.kind === "habitable" ? 0x548fc0 : 0x54a997,
            transparent: true,
            opacity: 0.13,
            depthWrite: false,
          }),
        );
      mesh.position.copy(bounds.getCenter(new THREE.Vector3()));
      this.spaces.add(mesh, new THREE.Box3Helper(bounds, 0x548fc0));
    }
    if (fit) this.fit();
    else this.render();
  }
  helpers(ports: boolean, spaces: boolean) {
    this.ports.visible = ports;
    this.spaces.visible = spaces;
    this.render();
  }
  fit(view: "3d" | "front" | "side" | "top" = "3d") {
    if (this.bounds.isEmpty()) return;
    const center = this.bounds.getCenter(new THREE.Vector3()),
      size = this.bounds.getSize(new THREE.Vector3()),
      distance =
        (Math.max(size.x, size.y, size.z, 2) /
          (2 * Math.tan(THREE.MathUtils.degToRad(this.camera.fov / 2)))) *
        1.65,
      direction =
        view === "front"
          ? new THREE.Vector3(0, -1, 0.03)
          : view === "side"
            ? new THREE.Vector3(1, 0, 0.03)
            : view === "top"
              ? new THREE.Vector3(0, -0.001, 1)
              : new THREE.Vector3(0.8, -1, 0.65);
    this.controls.target.copy(center);
    this.camera.position
      .copy(center)
      .addScaledVector(direction.normalize(), distance);
    this.controls.update();
    this.render();
  }
  snapshot() {
    const meshes: { name: string; vertices: number; finite: boolean }[] = [];
    this.feature?.solid.traverse((object) => {
      if (!(object instanceof THREE.Mesh)) return;
      const positions = object.geometry.getAttribute("position");
      meshes.push({
        name: object.name,
        vertices: positions.count,
        finite: Array.from(positions.array).every(Number.isFinite),
      });
    });
    return {
      meshes,
      camera: this.camera.position.toArray(),
      portsVisible: this.ports.visible,
      spacesVisible: this.spaces.visible,
    };
  }
  private render() {
    this.renderer.render(this.scene, this.camera);
  }
}
