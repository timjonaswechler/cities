import { test, expect, type Page } from "@playwright/test";
import { houseGeometry } from "../../src/houses";
import clipping, { type MultiPolygon } from "../../src/overlay";
import { quadratic } from "../fixtures";
import type { PlotPlan } from "../../src/plot-types";
const snapshot = (page: Page) =>
  page.evaluate(() => window.__wegwerk.snapshot());
async function at(page: Page, x: number, y: number) {
  const box = (await page.locator("#editor").boundingBox())!,
    s = await snapshot(page);
  return {
    x: box.x + box.width / 2 + ((x - s.view.x) * box.height) / s.view.height,
    y: box.y + box.height / 2 - ((y - s.view.y) * box.height) / s.view.height,
  };
}
async function click(page: Page, x: number, y: number) {
  const p = await at(page, x, y);
  await page.mouse.click(p.x, p.y);
}
async function pull(page: Page, x: number, y: number, hx: number, hy: number) {
  const a = await at(page, x, y),
    b = await at(page, hx, hy);
  await page.mouse.move(a.x, a.y);
  await page.mouse.down();
  await page.mouse.move(b.x, b.y, { steps: 6 });
  await page.mouse.up();
}
async function begin(page: Page, material: "plot" | "road" | "water") {
  await page.getByLabel("Zeichenmaterial").selectOption(material);
  await page.locator("#kind").selectOption("pen");
  await page.getByRole("button", { name: "Zeichnen", exact: true }).click();
}
async function rectangle(
  page: Page,
  material: "plot" | "water",
  x1 = -25,
  y1 = -20,
  x2 = 25,
  y2 = 20,
) {
  await begin(page, material);
  for (const [x, y] of [
    [x1, y1],
    [x2, y1],
    [x2, y2],
    [x1, y2],
    [x1, y1],
  ])
    await click(page, x, y);
}
const errors = new WeakMap<Page, string[]>();
test.beforeEach(async ({ page }) => {
  const e: string[] = [];
  errors.set(page, e);
  page.on("pageerror", (x) => e.push(x.message));
  page.on("console", (x) => {
    if (x.type() === "error") e.push(x.text());
  });
  await page.goto("/");
  await page.getByRole("button", { name: "Neu", exact: true }).click();
});
test.afterEach(({ page }) => expect(errors.get(page)).toEqual([]));
function area(polys: MultiPolygon) {
  return polys.reduce(
    (sum, poly) =>
      sum +
      poly.reduce(
        (a, ring, i) =>
          a +
          ((i ? -1 : 1) *
            Math.abs(
              ring.reduce(
                (s, p, j) =>
                  s +
                  p[0] * ring[(j + 1) % ring.length][1] -
                  p[1] * ring[(j + 1) % ring.length][0],
                0,
              ),
            )) /
            2,
        0,
      ),
    0,
  );
}

function assertOneBuilding(plan: PlotPlan) {
  expect(plan.complex).toBeDefined();
  const volumes = plan.complex!.volumes,
    footprints: MultiPolygon = volumes.map((v) => [
      houseGeometry(v).footprint.map((p) => [p.x, p.y]),
    ]),
    roofs: MultiPolygon = volumes.map((v) => [
      houseGeometry(v).roof.map((p) => [p.x, p.y]),
    ]),
    parts: MultiPolygon = plan.buildable.map((a) =>
      [a.outer, ...a.holes].map((r) => r.map((p) => [p.x, p.y])),
    );
  expect(volumes.filter((v) => v.role === "main")).toHaveLength(1);
  expect(volumes.length).toBeLessThanOrEqual(2);
  expect(clipping.union(footprints)).toHaveLength(1);
  expect(parts.some((part) => !clipping.difference(roofs, part).length)).toBe(
    true,
  );
  return volumes;
}

test("draw a vector plot in an empty scene: one automatic complex, no manual access, source-only JSON and history", async ({
  page,
}, info) => {
  await rectangle(page, "plot");
  let s = await snapshot(page);
  expect(s.network.version).toBe(5);
  expect(s.network.plots).toHaveLength(1);
  expect(s.network.paths).toEqual([]);
  expect(s.area).toBe(0);
  expect(s.plots[0].plannedArea).toBeCloseTo(2000, 5);
  expect(s.plots[0].buildableArea).toBeCloseTo(2000, 5);
  expect(s.plots[0].excludedArea).toBe(0);
  expect(s.plots[0].complex!.volumes.length).toBeGreaterThanOrEqual(2);
  expect(s.complexMeshes).toHaveLength(1);
  expect(s.complexMeshes[0].positions.every(Number.isFinite)).toBe(true);
  expect(
    Math.max(...s.complexMeshes[0].positions.filter((_, i) => i % 3 === 2)),
  ).toBeGreaterThan(2);
  await expect(
    page.getByRole("button", { name: "Zugang wählen", exact: true }),
  ).not.toBeVisible();
  await expect(page.locator("#plot-inspector")).toContainText(
    "1 Gebäudekomplex",
  );
  const box = (await page.locator("#editor").boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.wheel(0, -800);
  await expect
    .poll(async () => (await snapshot(page)).view.height)
    .toBeLessThan(60);
  await page.screenshot({ path: info.outputPath("plot-complex-top.png") });
  await page.getByRole("button", { name: "3D prüfen", exact: true }).click();
  await page.screenshot({ path: info.outputPath("plot-complex-3d.png") });
  await page.getByRole("button", { name: "Draufsicht", exact: true }).click();
  const saved = JSON.parse(JSON.stringify(s.network));
  const download = page.waitForEvent("download");
  await page
    .getByRole("button", { name: "JSON speichern", exact: true })
    .click();
  const file = (await (await download).path())!;
  await page.getByRole("button", { name: "Neu", exact: true }).click();
  expect((await snapshot(page)).network.plots).toBeUndefined();
  await page.locator("#import").setInputFiles(file);
  await expect.poll(async () => (await snapshot(page)).network).toEqual(saved);
  const before = (await snapshot(page)).network.plots![0].seed;
  await page
    .getByRole("button", { name: "Neue Bebauung", exact: true })
    .click();
  expect((await snapshot(page)).network.plots![0].seed).toBe(
    (before + 1) >>> 0,
  );
  await page.getByRole("button", { name: "Undo", exact: true }).click();
  expect((await snapshot(page)).network).toEqual(saved);
  await page
    .getByRole("button", { name: "Bauplatz löschen", exact: true })
    .click();
  expect((await snapshot(page)).network.plots).toEqual([]);
  expect((await snapshot(page)).complexMeshes).toEqual([]);
  await page.getByRole("button", { name: "Undo", exact: true }).click();
  expect((await snapshot(page)).network).toEqual(saved);
});

test("main entrances follow the nearest street automatically through drawing, import and undo", async ({
  page,
}) => {
  await rectangle(page, "plot");
  const source = structuredClone((await snapshot(page)).network.plots);
  await expect(page.locator("#plot-inspector")).toContainText(
    "Keine Straße vorhanden",
  );
  await begin(page, "road");
  await click(page, 35, -30);
  await click(page, 35, 30);
  await page.keyboard.press("Escape");
  const east = await snapshot(page);
  await page.getByLabel("Bauplatz auswählen").selectOption(source![0].id);
  await expect(page.locator("#plot-inspector")).not.toContainText(
    "Keine Straße vorhanden",
  );

  async function assertEntrances(sign: number) {
    const current = await snapshot(page),
      volumes = current.plots[0].complex!.volumes,
      buildings = volumes.filter((v) => v.role !== "wing");
    expect(buildings.length).toBeGreaterThan(0);
    expect(volumes.some((v) => v.role === "wing")).toBe(true);
    await expect(page.locator(".plot-entrance")).toHaveCount(buildings.length);
    for (const volume of buildings) {
      const entrance = houseGeometry(volume).entrance,
        marker = page.locator(
          `.plot-entrance[data-volume-id="${volume.id}"] circle`,
        );
      expect((entrance.x - volume.center.x) * sign).toBeGreaterThan(0);
      expect(entrance.y).toBeCloseTo(volume.center.y);
      expect(Number(await marker.getAttribute("cx"))).toBeCloseTo(entrance.x);
      expect(Number(await marker.getAttribute("cy"))).toBeCloseTo(-entrance.y);
    }
    expect(current.network.plots).toEqual(source);
    expect(JSON.stringify(current.network)).not.toContain("entranceSide");
    expect(JSON.stringify(current.network)).not.toContain("entranceTarget");
  }

  await assertEntrances(1);
  const west = structuredClone(east.network);
  for (const node of west.nodes) node.x = -35;
  await page.locator("#import").setInputFiles({
    name: "street-west.json",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify(west)),
  });
  await expect.poll(async () => (await snapshot(page)).network).toEqual(west);
  await assertEntrances(-1);
  await page.getByRole("button", { name: "Undo", exact: true }).click();
  await expect
    .poll(async () => (await snapshot(page)).network)
    .toEqual(east.network);
  await assertEntrances(1);
});

test("a road curve gets one connected building with one exact nearest-edge target", async ({
  page,
}) => {
  const project = quadratic();
  project.version = 5;
  project.nodes[0].x = -60;
  project.nodes[1].x = 60;
  Object.assign(project.paths[0].segments[0], { control: { x: 0, y: 60 } });
  project.plots = [
    {
      id: "curve-site",
      kind: "plot",
      seed: 42,
      outer: [
        { x: -15, y: -35 },
        { x: 60, y: -35 },
        { x: 60, y: 48 },
        { x: -15, y: 48 },
      ],
    },
  ];
  await page.locator("#import").setInputFiles({
    name: "curved-street.json",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify(project)),
  });
  await page.getByLabel("Bauplatz auswählen").selectOption("curve-site");
  const current = await snapshot(page),
    volumes = assertOneBuilding(current.plots[0]),
    buildings = volumes.filter((v) => v.role !== "wing"),
    main = buildings.find((v) => v.role === "main")!;
  expect(current.plots[0].buildable.length).toBeGreaterThan(1);
  expect(buildings).toHaveLength(1);
  await expect(page.locator(".plot-frontage")).toHaveCount(buildings.length);
  for (const volume of buildings) {
    const entrance = houseGeometry(volume).entrance,
      target = volume.entranceTarget!,
      nx = entrance.x - volume.center.x,
      ny = entrance.y - volume.center.y,
      dx = target.x - entrance.x,
      dy = target.y - entrance.y,
      normalizer = Math.hypot(nx, ny) * Math.hypot(dx, dy);
    expect((nx * dy - ny * dx) / normalizer).toBeCloseTo(0, 8);
    expect((nx * dx + ny * dy) / normalizer).toBeCloseTo(1, 8);
    await expect(
      page.locator(`.plot-frontage[data-volume-id="${volume.id}"] path`),
    ).toHaveAttribute(
      "d",
      `M ${entrance.x},${-entrance.y} L ${target.x},${-target.y}`,
    );
  }
  for (const wing of volumes.filter((v) => v.role === "wing"))
    expect(wing.angle).toBe(main.angle);
  expect(current.network.plots).toEqual(project.plots);
  expect(JSON.stringify(current.network)).not.toContain("entranceTarget");
});

test("road and river are ground blockers, not destructive plot cuts or additional plot objects", async ({
  page,
}, info) => {
  await rectangle(page, "plot");
  const source = structuredClone((await snapshot(page)).network.plots);
  await begin(page, "road");
  await click(page, -40, 0);
  await click(page, 40, 0);
  await page.keyboard.press("Escape");
  let s = await snapshot(page);
  expect(s.plots[0].buildable).toHaveLength(2);
  expect(s.plots[0].excludedArea).toBeCloseTo(200, 5);
  await rectangle(page, "water", -4, -30, 4, 30);
  s = await snapshot(page);
  const plan = s.plots[0];
  expect(s.network.plots).toEqual(source);
  expect(s.network.plots).toHaveLength(1);
  expect(plan.buildable).toHaveLength(4);
  expect(plan.excludedArea).toBeCloseTo(488, 5);
  expect(plan.buildableArea).toBeCloseTo(1512, 5);
  expect(s.complexMeshes).toHaveLength(1);
  assertOneBuilding(plan);
  await expect(page.locator(".plot-entrance")).toHaveCount(1);
  const permitted: MultiPolygon = plan.buildable.map((a) =>
    [a.outer, ...a.holes].map((r) => r.map((p) => [p.x, p.y])),
  );
  for (const v of plan.complex!.volumes) {
    const roof = houseGeometry(v).roof.map(
      (p) => [p.x, p.y] as [number, number],
    );
    expect(area(clipping.difference([roof], permitted))).toBeLessThan(1e-6);
  }
  await page.getByLabel("Bauplatz auswählen").selectOption(source![0].id);
  await expect(page.locator("#plot-inspector")).toContainText(
    "nur ein zusammenhängender Gebäudekomplex",
  );
  await page.screenshot({ path: info.outputPath("plot-blockers.png") });
  const plannedBefore = structuredClone(s.network.plots);
  await page.getByLabel("Zeichenmaterial").selectOption("road");
  await click(page, 25, 0);
  await page.getByLabel("Breite Anfang (m)", { exact: true }).fill("8");
  await page.getByLabel("Breite Anfang (m)", { exact: true }).press("Tab");
  expect((await snapshot(page)).plots[0].buildableArea).toBeLessThan(
    plan.buildableArea,
  );
  expect((await snapshot(page)).network.plots).toEqual(plannedBefore);
});

test("curved plot contours and holes remain editable, and direct regeneration after a coordinate edit is not swallowed", async ({
  page,
}) => {
  await begin(page, "plot");
  await pull(page, -20, 0, -20, 12);
  await pull(page, 20, 0, 20, -12);
  await click(page, -20, 0);
  let s = await snapshot(page);
  const original = s.network.plots![0];
  expect(original.outer).toHaveLength(2);
  expect(original.outerEdges!.map((e) => e.kind)).toEqual(["cubic", "cubic"]);
  await page
    .getByRole("button", { name: "Aussparung zeichnen", exact: true })
    .click();
  await pull(page, -3, 0, -3, 2);
  await pull(page, 3, 0, 3, -2);
  await page.keyboard.press("Enter");
  s = await snapshot(page);
  expect(s.network.plots![0].holes).toHaveLength(1);
  expect(s.plots[0].plannedArea).toBeLessThan(576);
  await pull(page, -20, 0, -22, 0);
  const before = (await snapshot(page)).network.plots![0];
  await page.getByLabel("Kontur X (m)", { exact: true }).fill("-23");
  await page
    .getByRole("button", { name: "Neue Bebauung", exact: true })
    .click();
  const after = (await snapshot(page)).network.plots![0];
  expect(after.outer[0].x).toBeCloseTo(-23, 5);
  expect(after.seed).toBe((before.seed + 1) >>> 0);
  expect(after.holes).toEqual(before.holes);
});

test("a completely blocked site remains selectable and retains the original contour", async ({
  page,
}) => {
  await rectangle(page, "plot", -10, -10, 10, 10);
  const original = (await snapshot(page)).network.plots![0];
  await rectangle(page, "water", -15, -15, 15, 15);
  await page.getByLabel("Bauplatz auswählen").selectOption(original.id);
  const s = await snapshot(page);
  expect(s.plots[0].buildable).toEqual([]);
  expect(s.plots[0].complex).toBeUndefined();
  expect(s.complexMeshes).toEqual([]);
  expect(s.network.plots![0]).toEqual(original);
  await expect(page.locator("#plot-inspector")).toContainText(
    "Keine bebaubare Fläche",
  );
  const invalid = structuredClone(s.network);
  invalid.plots![0].outer[1].x = 1e12;
  await page.locator("#import").setInputFiles({
    name: "out-of-range.json",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify(invalid)),
  });
  await expect(page.locator("#status")).toContainText("Import abgelehnt");
  expect((await snapshot(page)).network).toEqual(s.network);
  await page
    .getByRole("button", { name: "Bauplatz löschen", exact: true })
    .click();
  expect((await snapshot(page)).network.areaBlockers).toHaveLength(1);
});
