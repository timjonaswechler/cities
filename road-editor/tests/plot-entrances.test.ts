import { describe, expect, it } from "vitest";
import type { HouseArea, HousePoint } from "../src/house-types";
import { houseGeometry } from "../src/houses";
import clipping, { type Polygon } from "../src/overlay";
import type {
  BuildBlocker,
  ComplexVolume,
  PlannedPlot,
} from "../src/plot-types";
import { planPlots } from "../src/plots";
import { evaluateProject } from "../src/plot-project";
import { quadratic } from "./fixtures";

function rectangle(x0: number, y0: number, x1: number, y1: number): HouseArea {
  return {
    outer: [
      { x: x0, y: y0 },
      { x: x1, y: y0 },
      { x: x1, y: y1 },
      { x: x0, y: y1 },
    ],
    holes: [],
  };
}
const site = (area = rectangle(0, 0, 40, 30)): PlannedPlot => ({
  id: "site",
  kind: "plot",
  seed: 42,
  ...area,
});
const road = (area: HouseArea): BuildBlocker => ({
  kind: "road",
  areas: [area],
});
function facing(volume: ComplexVolume): HousePoint {
  const entrance = houseGeometry(volume).entrance,
    x = entrance.x - volume.center.x,
    y = entrance.y - volume.center.y,
    length = Math.hypot(x, y);
  return { x: x / length, y: y / length };
}
function nearestStreet(point: HousePoint, roads: HouseArea[]) {
  let distance = Infinity,
    nearest = { x: NaN, y: NaN };
  for (const area of roads)
    for (const ring of [area.outer, ...area.holes])
      for (let i = 0; i < ring.length; i++) {
        const a = ring[i],
          b = ring[(i + 1) % ring.length],
          dx = b.x - a.x,
          dy = b.y - a.y,
          denominator = dx * dx + dy * dy;
        if (!denominator) continue;
        const t = Math.max(
            0,
            Math.min(
              1,
              ((point.x - a.x) * dx + (point.y - a.y) * dy) / denominator,
            ),
          ),
          candidate = { x: a.x + dx * t, y: a.y + dy * t },
          candidateDistance = Math.hypot(
            candidate.x - point.x,
            candidate.y - point.y,
          );
        if (candidateDistance < distance) {
          distance = candidateDistance;
          nearest = candidate;
        }
      }
  return nearest;
}
function assertFacesNearest(volumes: ComplexVolume[], roads: HouseArea[]) {
  for (const volume of volumes) {
    if (volume.role === "wing") continue;
    const entrance = houseGeometry(volume).entrance,
      target = nearestStreet(entrance, roads),
      normal = facing(volume),
      dx = target.x - entrance.x,
      dy = target.y - entrance.y,
      distance = Math.hypot(dx, dy);
    expect(volume.entranceTarget?.x).toBeCloseTo(target.x, 7);
    expect(volume.entranceTarget?.y).toBeCloseTo(target.y, 7);
    expect(normal.x * (dy / distance) - normal.y * (dx / distance)).toBeCloseTo(
      0,
      8,
    );
    expect(normal.x * (dx / distance) + normal.y * (dy / distance)).toBeCloseTo(
      1,
      8,
    );
  }
}
function assertClearDoors(volumes: ComplexVolume[]) {
  for (const volume of volumes) {
    if (volume.role === "wing") continue;
    const p = houseGeometry(volume).entrance,
      n = facing(volume),
      side = { x: -n.y * 0.6, y: n.x * 0.6 },
      approach: Polygon = [
        [
          [p.x + side.x, p.y + side.y],
          [p.x - side.x, p.y - side.y],
          [p.x - side.x + n.x, p.y - side.y + n.y],
          [p.x + side.x + n.x, p.y + side.y + n.y],
        ],
      ];
    for (const other of volumes) {
      if (other === volume) continue;
      const footprint: Polygon = [
        houseGeometry(other).footprint.map(({ x, y }) => [x, y]),
      ];
      expect(clipping.intersection(approach, footprint)).toEqual([]);
    }
  }
}

describe("automatic main entrances on vector plots", () => {
  it.each([
    ["west", rectangle(-12, -20, -8, 50), { x: -1, y: 0 }],
    ["east", rectangle(48, -20, 52, 50), { x: 1, y: 0 }],
    ["south", rectangle(-20, -12, 60, -8), { x: 0, y: -1 }],
    ["north", rectangle(-20, 38, 60, 42), { x: 0, y: 1 }],
  ] as const)(
    "places every building's entrance towards the street to the %s",
    (_, area, normal) => {
      const [plan] = planPlots([site()], [road(area)]);
      expect(plan.complex).toBeDefined();
      expect(plan.complex!.volumes.some((v) => v.role === "wing")).toBe(true);
      for (const volume of plan.complex!.volumes) {
        if (volume.role === "wing") continue;
        expect(volume.entranceSide).toBeDefined();
        expect(facing(volume).x).toBeCloseTo(normal.x);
        expect(facing(volume).y).toBeCloseTo(normal.y);
      }
      assertClearDoors(plan.complex!.volumes);
    },
  );

  it("chooses the nearest real road edge per body, ignoring nearer water and road centre lines", () => {
    const blockers: BuildBlocker[] = [
        road(rectangle(-100, -50, -4, 80)),
        road(rectangle(48, -50, 52, 80)),
        { kind: "water", areas: [rectangle(-20, -3, 60, -1)] },
      ],
      before = structuredClone(blockers),
      [plan] = planPlots([site()], blockers),
      main = plan.complex!.volumes.find((v) => v.role === "main")!;
    // The broad western road has the nearer boundary but the farther axis.
    expect(facing(main).x).toBeCloseTo(-1);
    for (const volume of plan.complex!.volumes) {
      if (volume.role === "wing") continue;
      const westDistance = volume.center.x + 4,
        eastDistance = 48 - volume.center.x;
      expect(facing(volume).x).toBeCloseTo(
        westDistance < eastDistance ? -1 : 1,
      );
      expect(facing(volume).y).toBeCloseTo(0);
    }
    assertClearDoors(plan.complex!.volumes);
    expect(blockers).toEqual(before);
    expect(planPlots([site()], [...blockers].reverse())).toEqual([plan]);
  });

  it("gives each separate plot its own building facing the shared street", () => {
    const plans = planPlots(
      [
        { ...site(rectangle(0, 0, 28, 30)), id: "west" },
        { ...site(rectangle(32, 0, 60, 30)), id: "east" },
      ],
      [road(rectangle(28, -10, 32, 40))],
    );
    expect(plans).toHaveLength(2);
    for (const plan of plans) {
      const volumes = plan.complex!.volumes,
        main = volumes.find((v) => v.role === "main")!;
      expect(volumes.filter((v) => v.role === "main")).toHaveLength(1);
      expect(facing(main).x).toBeCloseTo(plan.id === "west" ? 1 : -1);
      expect(facing(main).y).toBeCloseTo(0);
      for (const volume of volumes) {
        expect(volume.angle).toBe(main.angle);
        expect(volume.ridge).toBe(main.ridge);
      }
      assertClearDoors(volumes);
    }
  });

  it("keeps the entrance facing the road after rotation and translation", () => {
    const angle = 0.63,
      c = Math.cos(angle),
      s = Math.sin(angle),
      pose = ({ x, y }: HousePoint): HousePoint => ({
        x: c * x - s * y + 7000,
        y: s * x + c * y - 9000,
      }),
      plot = site(rectangle(0, 0, 60, 30)),
      street = rectangle(28, -10, 32, 40);
    plot.outer = plot.outer.map(pose);
    street.outer = street.outer.map(pose);
    const [plan] = planPlots([plot], [road(street)]);
    for (const volume of plan.complex!.volumes) {
      if (volume.role === "wing") continue;
      const localX =
          c * (volume.center.x - 7000) + s * (volume.center.y + 9000),
        sign = localX < 30 ? 1 : -1,
        normal = facing(volume);
      expect(normal.x).toBeCloseTo(sign * c);
      expect(normal.y).toBeCloseTo(sign * s);
    }
    assertClearDoors(plan.complex!.volumes);
  });

  it("does not choose a long facade that faces away from a short nearby street", () => {
    const [plan] = planPlots(
      [site(rectangle(-20, -4, 20, 4))],
      [road(rectangle(6, 4.5, 6.5, 5))],
    );
    const main = plan.complex!.volumes[0];
    assertFacesNearest([main], [rectangle(6, 4.5, 6.5, 5)]);
    assertClearDoors(plan.complex!.volumes);
  });

  it("recognises a street's inner boundary around a dry courtyard", () => {
    const [plan] = planPlots(
      [site()],
      [
        road({
          ...rectangle(-10, -10, 50, 40),
          holes: [rectangle(-2, -2, 42, 32).outer],
        }),
      ],
    );
    expect(facing(plan.complex!.volumes[0]).y).toBeCloseTo(-1);
    assertClearDoors(plan.complex!.volumes);
  });

  it("updates entrance sides when roads move, keeping the main envelope and source contour intact", () => {
    const plot = site(),
      before = structuredClone(plot),
      [west] = planPlots([plot], [road(rectangle(-12, -20, -8, 50))]),
      [east] = planPlots([plot], [road(rectangle(48, -20, 52, 50))]),
      oldMain = houseGeometry(west.complex!.volumes[0]),
      newMain = houseGeometry(east.complex!.volumes[0]);
    expect(facing(west.complex!.volumes[0]).x).toBeCloseTo(-1);
    expect(facing(east.complex!.volumes[0]).x).toBeCloseTo(1);
    expect(newMain.footprint).toEqual(oldMain.footprint);
    expect(newMain.roof).toEqual(oldMain.roof);
    expect(plot).toEqual(before);
  });

  it("rotates the actual building so the doorway normal hits the nearest point on an oblique road", () => {
    const angle = 0.37,
      street = rectangle(-100, 40, 140, 44);
    street.outer = street.outer.map(({ x, y }) => ({
      x: 20 + Math.cos(angle) * (x - 20) - Math.sin(angle) * (y - 42),
      y: 42 + Math.sin(angle) * (x - 20) + Math.cos(angle) * (y - 42),
    }));
    const [plan] = planPlots([site()], [road(street)]);
    expect(plan.complex).toBeDefined();
    assertFacesNearest(plan.complex!.volumes, [street]);
    assertClearDoors(plan.complex!.volumes);
  });

  it("aims at the nearest finite street end, not the extension of its tangent", () => {
    const street = rectangle(55, 40, 65, 44),
      [plan] = planPlots([site()], [road(street)]);
    expect(plan.complex).toBeDefined();
    assertFacesNearest(plan.complex!.volumes, [street]);
    assertClearDoors(plan.complex!.volumes);
  });

  it("aims one building at the rendered road curve and leaves other ground parts free", () => {
    const project = quadratic();
    project.version = 5;
    project.nodes[0].x = -60;
    project.nodes[1].x = 60;
    Object.assign(project.paths[0].segments[0], { control: { x: 0, y: 60 } });
    project.plots = [site(rectangle(-15, -35, 60, 48))];
    const { plots, surface } = evaluateProject(project),
      volumes = plots[0].complex!.volumes;
    expect(plots[0].buildable.length).toBeGreaterThan(1);
    expect(volumes.filter((v) => v.role === "main")).toHaveLength(1);
    expect(volumes.length).toBeLessThanOrEqual(2);
    assertFacesNearest(volumes, surface.roadAreas!);
    const main = volumes.find((v) => v.role === "main")!;
    for (const wing of volumes.filter((v) => v.role === "wing"))
      expect(wing.angle).toBe(main.angle);
    assertClearDoors(volumes);
  });

  it("never keeps a wrongly oriented building when the road-aligned roof cannot fit", () => {
    const street: HouseArea = {
      outer: [
        { x: -200, y: 400 },
        { x: 400, y: -200 },
        { x: 403, y: -197 },
        { x: -197, y: 403 },
      ],
      holes: [],
    };
    const [plan] = planPlots([site(rectangle(0, 0, 50, 5.8))], [road(street)]);
    expect(plan.buildableArea).toBeCloseTo(290);
    expect(plan.complex).toBeUndefined();
    expect(plan.messages.join()).toContain("Keine passende Dachhülle");
  });

  it("still supplies an entrance without roads, with an explicit provisional-orientation notice", () => {
    const [plan] = planPlots(
      [site()],
      [{ kind: "water", areas: [rectangle(-12, -20, -8, 50)] }],
    );
    expect(plan.messages.join()).toContain("Keine Straße vorhanden");
    for (const volume of plan.complex!.volumes) {
      expect(volume.entranceSide).toBeUndefined();
      expect(volume.entranceTarget).toBeUndefined();
      expect(Number.isFinite(houseGeometry(volume).entrance.x)).toBe(true);
      expect(Number.isFinite(houseGeometry(volume).entrance.y)).toBe(true);
    }
    assertClearDoors(plan.complex!.volumes);
  });
});
