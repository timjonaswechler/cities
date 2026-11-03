import * as THREE from "three";
import type { Surface } from "./geometry";
export interface View {
  x: number;
  y: number;
  height: number;
}
export class SurfaceView {
  private renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private group = new THREE.Group();
  private grid: THREE.GridHelper;
  private top = new THREE.OrthographicCamera();
  private spatial = new THREE.PerspectiveCamera(45, 1, 0.1, 20000);
  meshArea = 0;
  waterHeights: number[] = [];
  waterColor: string | null = null;
  triangles: [number, number, number, number, number, number][] = [];
  constructor(private container: HTMLElement) {
    this.renderer = new THREE.WebGLRenderer({
      antialias: true,
      preserveDrawingBuffer: true,
    });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setClearColor("#eff2ec");
    container.append(this.renderer.domElement);
    this.renderer.domElement.setAttribute("aria-label", "Three.js-Wegefläche");
    this.grid = new THREE.GridHelper(1000, 100, "#c5d1c6", "#dce3da");
    this.grid.rotation.x = Math.PI / 2;
    this.grid.position.z = -0.05;
    this.grid.renderOrder = -1;
    const gridMaterials = Array.isArray(this.grid.material)
      ? this.grid.material
      : [this.grid.material];
    gridMaterials.forEach((m) => (m.depthWrite = false));
    this.scene.add(this.grid, this.group);
  }
  setSurface(s: Surface) {
    for (const child of this.group.children.slice()) {
      const m = child as THREE.Mesh;
      m.geometry.dispose();
      const materials = Array.isArray(m.material) ? m.material : [m.material];
      materials.forEach((mat) => mat.dispose());
      this.group.remove(child);
    }
    this.meshArea = 0;
    this.triangles = [];
    this.waterHeights = [];
    this.waterColor = null;
    const layers = [
      { areas: s.roadAreas ?? s.areas, z: 0, color: "#427c70", water: false },
      ...(s.water
        ? [
            {
              areas: s.water.visibleAreas,
              z: -s.water.drop,
              color: "#2b91b4",
              water: true,
            },
          ]
        : []),
    ];
    for (const layer of layers)
      for (const area of layer.areas) {
        const shape = new THREE.Shape(
          area.outer.map((p) => new THREE.Vector2(p.x, p.y)),
        );
        shape.holes = area.holes.map(
          (h) => new THREE.Path(h.map((p) => new THREE.Vector2(p.x, p.y))),
        );
        const geometry = new THREE.ShapeGeometry(shape);
        geometry.translate(0, 0, layer.z);
        const material = new THREE.MeshBasicMaterial({
            color: layer.color,
            side: THREE.DoubleSide,
          }),
          pos = geometry.attributes.position,
          idx = geometry.index;
        if (layer.water) {
          this.waterColor = material.color.getHexString();
          for (let i = 0; i < pos.count; i++)
            this.waterHeights.push(pos.getZ(i));
        }
        if (idx)
          for (let i = 0; i < idx.count; i += 3) {
            const a = idx.getX(i),
              b = idx.getX(i + 1),
              c = idx.getX(i + 2);
            this.triangles.push([
              pos.getX(a),
              pos.getY(a),
              pos.getX(b),
              pos.getY(b),
              pos.getX(c),
              pos.getY(c),
            ]);
            this.meshArea +=
              Math.abs(
                (pos.getX(b) - pos.getX(a)) * (pos.getY(c) - pos.getY(a)) -
                  (pos.getY(b) - pos.getY(a)) * (pos.getX(c) - pos.getX(a)),
              ) / 2;
          }
        this.group.add(new THREE.Mesh(geometry, material));
        for (const ring of [area.outer, ...area.holes]) {
          const edge = new THREE.BufferGeometry().setFromPoints(
            [...ring, ring[0]].map(
              (p) => new THREE.Vector3(p.x, p.y, layer.z + 0.01),
            ),
          );
          this.group.add(
            new THREE.Line(
              edge,
              new THREE.LineBasicMaterial({
                color: layer.water ? "#18566b" : "#163f36",
              }),
            ),
          );
        }
      }
    if (s.water)
      for (const area of s.water.areas)
        for (const ring of [area.outer, ...area.holes]) {
          const positions: number[] = [];
          for (let i = 0; i < ring.length; i++) {
            const a = ring[i],
              b = ring[(i + 1) % ring.length],
              z = -s.water.drop;
            positions.push(
              a.x,
              a.y,
              0,
              b.x,
              b.y,
              0,
              b.x,
              b.y,
              z,
              a.x,
              a.y,
              0,
              b.x,
              b.y,
              z,
              a.x,
              a.y,
              z,
            );
          }
          const wall = new THREE.BufferGeometry();
          wall.setAttribute(
            "position",
            new THREE.Float32BufferAttribute(positions, 3),
          );
          this.group.add(
            new THREE.Mesh(
              wall,
              new THREE.MeshBasicMaterial({
                color: "#527b7b",
                side: THREE.DoubleSide,
              }),
            ),
          );
        }
  }
  render(view: View, spatial: boolean) {
    const w = this.container.clientWidth,
      h = this.container.clientHeight,
      aspect = w / h;
    this.renderer.setSize(w, h, false);
    const half = view.height / 2;
    Object.assign(this.top, {
      left: -half * aspect,
      right: half * aspect,
      top: half,
      bottom: -half,
      near: 0.1,
      far: 20000,
    });
    this.top.position.set(view.x, view.y, 1000);
    this.top.up.set(0, 1, 0);
    this.top.lookAt(view.x, view.y, 0);
    this.top.updateProjectionMatrix();
    this.spatial.aspect = aspect;
    this.spatial.position.set(view.x, view.y - view.height * 0.8, view.height);
    this.spatial.up.set(0, 0, 1);
    this.spatial.lookAt(view.x, view.y, 0);
    this.spatial.updateProjectionMatrix();
    this.renderer.render(this.scene, spatial ? this.spatial : this.top);
  }
}
