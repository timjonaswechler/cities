import { test, expect, type Page } from "@playwright/test";
import { junction, loop, crossing, quadratic } from "../fixtures";
import type { Network } from "../../src/network";
import { contains } from "../../src/geometry";
function inMesh(triangles: number[][], x: number, y: number) {
  return triangles.some(([ax, ay, bx, by, cx, cy]) => {
    const d = (by - cy) * (ax - cx) + (cx - bx) * (ay - cy),
      a = ((by - cy) * (x - cx) + (cx - bx) * (y - cy)) / d,
      b = ((cy - ay) * (x - cx) + (ax - cx) * (y - cy)) / d;
    return a >= 0 && b >= 0 && a + b <= 1;
  });
}
function sameMesh(s: Awaited<ReturnType<typeof snapshot>>) {
  for (let x = -31.7; x < 36; x += 3.17)
    for (let y = -30.3; y < 35; y += 3.43)
      expect(inMesh(s.meshTriangles, x, y)).toBe(contains(s.surface, { x, y }));
}
const snapshot = (p: Page) => p.evaluate(() => window.__wegwerk.snapshot());
async function load(p: Page, n: Network) {
  await p.locator("#import").setInputFiles({
    name: "network.json",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify(n)),
  });
  await expect
    .poll(async () => JSON.stringify((await snapshot(p)).network))
    .toBe(JSON.stringify(n));
}
async function beginWater(p: Page) {
  await p.getByLabel("Zeichenmaterial").selectOption("water");
  await p.locator("#kind").selectOption("line");
  await p.getByRole("button", { name: "Zeichnen", exact: true }).click();
}
async function at(p: Page, x: number, y: number) {
  const box = await p.locator("#editor").boundingBox(),
    s = await snapshot(p);
  return {
    x: box!.x + box!.width / 2 + ((x - s.view.x) * box!.height) / s.view.height,
    y:
      box!.y + box!.height / 2 - ((y - s.view.y) * box!.height) / s.view.height,
  };
}
async function clickWorld(p: Page, x: number, y: number) {
  const q = await at(p, x, y);
  await p.mouse.click(q.x, q.y);
}
async function drag(
  p: Page,
  a: { x: number; y: number },
  b: { x: number; y: number },
) {
  const from = await at(p, a.x, a.y),
    to = await at(p, b.x, b.y);
  await p.mouse.move(from.x, from.y);
  await p.mouse.down();
  await p.mouse.move(to.x, to.y, { steps: 8 });
  await p.mouse.up();
}
const errors = new WeakMap<Page, string[]>();
test.beforeEach(async ({ page }) => {
  const e: string[] = [];
  errors.set(page, e);
  page.on("pageerror", (x) => e.push(x.message));
  page.on("console", (m) => {
    if (m.type() === "error") e.push(m.text());
  });
  await page.goto("/");
  await expect(page.locator("#editor")).toBeVisible();
});
test.afterEach(async ({ page }) => {
  expect(errors.get(page)).toEqual([]);
});
test("S1 undo reconciles controls on removed segments", async ({ page }) => {
  await page.getByRole("button", { name: "Neu", exact: true }).click();
  await page.locator("#kind").selectOption("quadratic");
  await page.getByRole("button", { name: "Zeichnen", exact: true }).click();
  await clickWorld(page, -30, 0);
  await clickWorld(page, 0, 0);
  await clickWorld(page, 30, 0);
  await page.keyboard.press("Escape");
  const id = (await snapshot(page)).network.paths[0].id;
  await page.locator(`[data-path="${id}"]`).first().click({ force: true });
  await page.locator('[data-handle="control"][data-segment="1"]').click();
  await page.getByRole("button", { name: "Undo", exact: true }).click();
  const s = await snapshot(page);
  expect(s.network.paths[0].segments).toHaveLength(1);
  expect(s.selection.handle).toBeUndefined();
  await expect(page.getByLabel("Griff X (m)")).toHaveCount(0);
  await page.getByRole("button", { name: "Redo", exact: true }).click();
  expect((await snapshot(page)).network.paths[0].segments).toHaveLength(2);
});
test("W09 draws and edits a lowered water blocker with atomic undo/delete", async ({
  page,
}, testInfo) => {
  await page.getByRole("button", { name: "Neu", exact: true }).click();
  await beginWater(page);
  await clickWorld(page, -20, -15);
  await clickWorld(page, 20, -15);
  await page.keyboard.press("Escape");
  expect((await snapshot(page)).network.areaBlockers ?? []).toEqual([]);
  expect((await snapshot(page)).area).toBeCloseTo(160, 5);
  expect((await snapshot(page)).network.paths[0].kind).toBe("water");
  await page.getByRole("button", { name: "Neu", exact: true }).click();
  await beginWater(page);
  for (const [x, y] of [
    [-20, -15],
    [20, -15],
    [20, 15],
    [-20, 15],
  ])
    await clickWorld(page, x, y);
  expect((await snapshot(page)).area).toBeGreaterThan(0);
  expect((await snapshot(page)).network.areaBlockers).toEqual([]);
  await clickWorld(page, -20, -15);
  let s = await snapshot(page);
  expect(s.network.version).toBe(3);
  expect(s.network.areaBlockers).toHaveLength(1);
  expect(s.area).toBeCloseTo(1200, 5);
  expect(s.meshArea).toBeCloseTo(s.area, 2);
  expect(s.waterMesh.color).toBe("2b91b4");
  expect(s.waterMesh.heights.length).toBeGreaterThan(0);
  expect(s.waterMesh.heights.every((z) => z < 0)).toBe(true);
  sameMesh(s);
  await drag(page, { x: -20, y: -15 }, { x: -25, y: -15 });
  await expect(page.getByLabel("Ufer X (m)")).toHaveValue("-25");
  await page.getByLabel("Ufer X (m)").fill("-30");
  await page.getByLabel("Ufer X (m)").press("Tab");
  s = await snapshot(page);
  expect(s.area).toBeCloseTo(1350, 4);
  const valid = s.network;
  await page.getByLabel("Ufer X (m)").fill("30");
  await page.getByLabel("Ufer X (m)").press("Tab");
  expect((await snapshot(page)).network).toEqual(valid);
  await expect(page.locator("#status")).toContainText("Kontur");
  await page.getByRole("button", { name: "Undo", exact: true }).click();
  expect((await snapshot(page)).area).toBeCloseTo(1275, 4);
  await page.getByRole("button", { name: "Redo", exact: true }).click();
  expect((await snapshot(page)).network).toEqual(valid);
  await page
    .getByRole("button", { name: "Punkt einfügen", exact: true })
    .click();
  expect((await snapshot(page)).network.areaBlockers![0].outer).toHaveLength(5);
  expect((await snapshot(page)).area).toBeCloseTo(1350, 4);
  await page
    .getByRole("button", { name: "Punkt entfernen", exact: true })
    .click();
  expect((await snapshot(page)).network.areaBlockers![0].outer).toHaveLength(4);
  await page.screenshot({ path: testInfo.outputPath("water-area.png") });
  await page
    .getByRole("button", { name: "Wasser löschen", exact: true })
    .click();
  expect((await snapshot(page)).area).toBe(0);
  await page.getByRole("button", { name: "Undo", exact: true }).click();
  expect((await snapshot(page)).area).toBeCloseTo(1350, 4);
});
test("W10 islands stay free, roads remain blocked, water survives graph JSON and 3D", async ({
  page,
}, testInfo) => {
  const road: Network = {
    version: 1,
    nodes: [
      { id: "a", x: -20, y: 0 },
      { id: "b", x: 20, y: 0 },
    ],
    paths: [
      {
        id: "L",
        startWidth: 6,
        endWidth: 6,
        widthsLinked: true,
        segments: [{ kind: "line", from: "a", to: "b" }],
      },
    ],
    junctions: [],
  };
  await load(page, road);
  await beginWater(page);
  for (const [x, y] of [
    [-10, -10],
    [10, -10],
    [10, 10],
    [-10, 10],
  ])
    await clickWorld(page, x, y);
  await page
    .getByRole("button", { name: "Pfad schließen", exact: true })
    .click();
  expect((await snapshot(page)).area).toBeCloseTo(520, 5);
  await page
    .getByRole("button", { name: "Insel aussparen", exact: true })
    .click();
  for (const [x, y] of [
    [-4, -4],
    [4, -4],
    [4, 4],
    [-4, 4],
  ])
    await clickWorld(page, x, y);
  await page
    .getByRole("button", { name: "Fläche schließen", exact: true })
    .click();
  let s = await snapshot(page);
  expect(s.area).toBeCloseTo(504, 5);
  expect(s.meshArea).toBeCloseTo(504, 2);
  expect(s.network.nodes).toEqual(road.nodes);
  expect(s.network.paths).toEqual(road.paths);
  expect(contains(s.surface, { x: 0, y: 0 })).toBe(true);
  expect(contains(s.surface, { x: 0, y: 3.5 })).toBe(false);
  expect(contains(s.surface, { x: 0, y: 8 })).toBe(true);
  expect(s.surface.areas[0].holes).toHaveLength(2);
  sameMesh(s);
  const saved = page.waitForEvent("download");
  await page
    .getByRole("button", { name: "JSON speichern", exact: true })
    .click();
  const file = (await (await saved).path())!;
  const valid = s.network;
  await page.getByRole("button", { name: "Neu", exact: true }).click();
  await page.locator("#import").setInputFiles(file);
  await expect.poll(async () => (await snapshot(page)).network).toEqual(valid);
  await page.getByRole("button", { name: "3D prüfen", exact: true }).click();
  s = await snapshot(page);
  expect(s.meshArea).toBeCloseTo(504, 2);
  expect(s.waterMesh.heights.every((z) => z < 0)).toBe(true);
  await page.screenshot({ path: testInfo.outputPath("water-island-3d.png") });
  await page.getByRole("button", { name: "Draufsicht", exact: true }).click();
  const invalid = structuredClone(valid);
  invalid.areaBlockers![0].holes = [
    [
      { x: 8, y: 8 },
      { x: 12, y: 8 },
      { x: 12, y: 12 },
      { x: 8, y: 12 },
    ],
  ];
  await page.locator("#import").setInputFiles({
    name: "invalid-water.json",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify(invalid)),
  });
  await expect(page.locator("#status")).toContainText("Import abgelehnt");
  expect((await snapshot(page)).network).toEqual(valid);
  await page.locator('[data-node="a"]').click();
  await expect(
    page.getByRole("button", { name: "Breiten koppeln", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
});
test("W11 invalid closure preserves the open vector and undo clears removed island selections", async ({
  page,
}) => {
  await page.getByRole("button", { name: "Neu", exact: true }).click();
  await beginWater(page);
  for (const [x, y] of [
    [-10, -10],
    [10, 10],
    [-10, 10],
    [10, -10],
  ])
    await clickWorld(page, x, y);
  const open = (await snapshot(page)).network;
  await page
    .getByRole("button", { name: "Pfad schließen", exact: true })
    .click();
  expect((await snapshot(page)).network).toEqual(open);
  expect((await snapshot(page)).network.areaBlockers).toEqual([]);
  await expect(page.locator("#status")).toContainText("Kontur");
  await page.getByRole("button", { name: "Undo", exact: true }).click();
  await page
    .getByRole("button", { name: "Pfad schließen", exact: true })
    .click();
  expect((await snapshot(page)).area).toBeCloseTo(200, 5);
  await page
    .getByRole("button", { name: "Wasser löschen", exact: true })
    .click();
  await beginWater(page);
  for (const [x, y] of [
    [-20, -20],
    [20, -20],
    [20, 20],
    [-20, 20],
  ])
    await clickWorld(page, x, y);
  await page
    .getByRole("button", { name: "Pfad schließen", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Insel aussparen", exact: true })
    .click();
  for (const [x, y] of [
    [-4, -4],
    [4, -4],
    [4, 4],
    [-4, 4],
  ])
    await clickWorld(page, x, y);
  await page.keyboard.press("Enter");
  await expect(
    page.getByRole("button", { name: "Insel entfernen", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Undo", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Insel entfernen", exact: true }),
  ).toHaveCount(0);
  await page
    .getByRole("button", { name: "Insel aussparen", exact: true })
    .click();
  await page.getByRole("button", { name: "Undo", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Zeichnen", exact: true }),
  ).not.toHaveClass(/active/);
});
test("B06 width link synchronizes either input, unlinks, and participates in undo/redo", async ({
  page,
}, testInfo) => {
  await load(page, quadratic());
  await page.locator('[data-path="Q"]').first().click({ force: true });
  const link = page.getByRole("button", {
    name: "Breiten koppeln",
    exact: true,
  });
  const start = page.getByLabel("Breite Anfang (m)"),
    end = page.getByLabel("Breite Ende (m)");
  const width = async (input: typeof start, value: string) => {
    await input.fill(value);
    await input.press("Tab");
  };
  await expect(link).toHaveAttribute("aria-pressed", "false");
  await width(start, "8");
  await expect(end).toHaveValue("4");
  const taperedArea = (await snapshot(page)).area;
  await link.click();
  await expect(link).toHaveAttribute("aria-pressed", "true");
  await expect(start).toHaveValue("8");
  await expect(end).toHaveValue("8");
  expect((await snapshot(page)).area).toBeGreaterThan(taperedArea);
  await width(end, "6");
  await expect(start).toHaveValue("6");
  await expect(end).toHaveValue("6");
  await width(start, "5");
  await expect(end).toHaveValue("5");
  const valid = (await snapshot(page)).network;
  await width(end, "0");
  expect((await snapshot(page)).network).toEqual(valid);
  await expect(start).toHaveValue("5");
  await expect(end).toHaveValue("5");
  await expect(page.locator("#status")).toContainText("positiv");
  await page.getByRole("button", { name: "Undo", exact: true }).click();
  await expect(start).toHaveValue("6");
  await expect(end).toHaveValue("6");
  await expect(link).toHaveAttribute("aria-pressed", "true");
  await page.getByRole("button", { name: "Redo", exact: true }).click();
  await expect(start).toHaveValue("5");
  await expect(end).toHaveValue("5");
  sameMesh(await snapshot(page));
  await page.screenshot({ path: testInfo.outputPath("linked-widths.png") });
  await link.focus();
  await link.press("Space");
  await expect(link).toHaveAttribute("aria-pressed", "false");
  await expect(start).toHaveValue("5");
  await expect(end).toHaveValue("5");
  await width(end, "3");
  await expect(start).toHaveValue("5");
  await expect(end).toHaveValue("3");
  await page.getByRole("button", { name: "Undo", exact: true }).click();
  await page.getByRole("button", { name: "Undo", exact: true }).click();
  await expect(link).toHaveAttribute("aria-pressed", "true");
  await expect(start).toHaveValue("5");
  await expect(end).toHaveValue("5");
});
test("B07 width link belongs to its path and survives graph JSON roundtrips", async ({
  page,
}) => {
  const link = page.getByRole("button", {
    name: "Breiten koppeln",
    exact: true,
  });
  await link.click();
  await expect(link).toHaveAttribute("aria-pressed", "true");
  await page.locator('[data-node="c"]').click();
  await expect(link).toHaveAttribute("aria-pressed", "false");
  await page.getByLabel("Breite Anfang (m)").fill("7");
  await page.getByLabel("Breite Anfang (m)").press("Tab");
  await expect(page.getByLabel("Breite Ende (m)")).toHaveValue("4");
  await page.locator('[data-node="a"]').click();
  await expect(link).toHaveAttribute("aria-pressed", "true");
  const saved = page.waitForEvent("download");
  await page
    .getByRole("button", { name: "JSON speichern", exact: true })
    .click();
  const file = (await (await saved).path())!;
  const before = (await snapshot(page)).network;
  await page.reload();
  await expect(link).toHaveAttribute("aria-pressed", "false");
  await page.locator("#import").setInputFiles(file);
  await expect.poll(async () => (await snapshot(page)).network).toEqual(before);
  await page.locator('[data-node="a"]').click();
  await expect(link).toHaveAttribute("aria-pressed", "true");
  await page.getByLabel("Breite Ende (m)").fill("5");
  await page.getByLabel("Breite Ende (m)").press("Tab");
  const paths = (await snapshot(page)).network.paths;
  expect(paths[0]).toMatchObject({
    startWidth: 5,
    endWidth: 5,
    widthsLinked: true,
  });
  expect(paths[1]).toMatchObject({ startWidth: 7, endWidth: 4 });
});
test("B01 draw, select, anchor/control drag, numeric width/position, undo/redo", async ({
  page,
}) => {
  await page.getByRole("button", { name: "Neu", exact: true }).click();
  await page.locator("#kind").selectOption("quadratic");
  await page.getByRole("button", { name: "Zeichnen", exact: true }).click();
  await clickWorld(page, -20, 0);
  await clickWorld(page, 20, 0);
  await page.getByRole("button", { name: "Auswählen", exact: true }).click();
  let s = await snapshot(page);
  expect(s.network.paths).toHaveLength(1);
  const id = s.network.paths[0].id;
  await page.locator(`[data-path="${id}"]`).first().click({ force: true });
  const before = s.area;
  await page.getByLabel("Breite Anfang (m)").fill("8");
  await page.getByLabel("Breite Anfang (m)").press("Tab");
  s = await snapshot(page);
  expect(s.network.paths[0].startWidth).toBe(8);
  expect(s.area).toBeGreaterThan(before);
  await page.getByRole("button", { name: "Undo", exact: true }).click();
  expect((await snapshot(page)).network.paths[0].startWidth).toBe(4);
  await page.getByRole("button", { name: "Redo", exact: true }).click();
  expect((await snapshot(page)).network.paths[0].startWidth).toBe(8);
  const control = s.network.paths[0].segments[0];
  expect(control.kind).toBe("quadratic");
  if (control.kind !== "quadratic") throw Error("kind");
  const oldArea = (await snapshot(page)).area;
  await drag(page, control.control, { x: 0, y: 25 });
  s = await snapshot(page);
  const seg = s.network.paths[0].segments[0];
  expect(seg.kind === "quadratic" && seg.control.y).toBeCloseTo(25, 0);
  expect(s.area).not.toBeCloseTo(oldArea, 1);
  const a = s.network.nodes[0];
  await drag(page, a, { x: -25, y: -5 });
  await page.getByLabel("Knoten X (m)").fill("-30");
  await page.getByLabel("Knoten X (m)").press("Tab");
  s = await snapshot(page);
  expect(s.network.nodes[0].x).toBe(-30);
  expect(s.network.paths[0].segments[0].from).toBe(a.id);
  expect(Math.abs(s.meshArea - s.area)).toBeLessThan(0.01);
  sameMesh(s);
  await page.screenshot({ path: "evidence/editing.png" });
});
test("B02 docking, shared move, detach/connect, shape-preserving segment insertion", async ({
  page,
}) => {
  await load(page, quadratic());
  await page.getByRole("button", { name: "Zeichnen", exact: true }).click();
  await page.locator("#kind").selectOption("line");
  const originalArea = (await snapshot(page)).area;
  await clickWorld(page, 0, 10);
  expect((await snapshot(page)).area).toBeCloseTo(originalArea, 2);
  await clickWorld(page, 0, -20);
  await page.getByRole("button", { name: "Auswählen", exact: true }).click();
  let s = await snapshot(page);
  expect(s.network.paths).toHaveLength(2);
  expect(s.network.paths[0].segments).toHaveLength(2);
  const joint = s.network.paths[1].segments[0].from;
  expect(s.network.paths[0].segments[0].to).toBe(joint);
  await drag(page, { x: 0, y: 10 }, { x: 3, y: 12 });
  s = await snapshot(page);
  expect(s.network.nodes.find((n) => n.id === joint)!.x).toBeCloseTo(3, 0);
  const branch = s.network.paths[1].id;
  await page.locator(`[data-path="${branch}"]`).first().click({ force: true });
  await clickWorld(page, 3, 12);
  await page
    .getByRole("button", { name: "Anschluss lösen", exact: true })
    .click();
  s = await snapshot(page);
  const detached = s.network.paths[1].segments[0].from;
  expect(detached).not.toBe(joint);
  await page.locator("#join-target").selectOption(joint);
  await page
    .getByRole("button", { name: "Knoten verbinden", exact: true })
    .click();
  s = await snapshot(page);
  expect(s.network.paths[1].segments[0].from).toBe(joint);
  expect(s.surface.conflicts).toEqual([]);
  await page.screenshot({ path: "evidence/connections.png" });
  await page.getByRole("button", { name: "Zeichnen", exact: true }).click();
  await clickWorld(page, 3, 12);
  await clickWorld(page, 30, 25);
  s = await snapshot(page);
  expect(s.network.paths[2].segments[0].from).toBe(joint);
});
test("B03 local radius, impossible radius feedback, parameters survive save/load", async ({
  page,
}) => {
  await load(page, junction("X"));
  await clickWorld(page, 0, 0);
  const before = (await snapshot(page)).area;
  await page
    .locator('[data-radius-a="E:0:start"][data-radius-b="N:0:start"]')
    .fill("3");
  await page
    .locator('[data-radius-a="E:0:start"][data-radius-b="N:0:start"]')
    .press("Tab");
  let s = await snapshot(page);
  expect(s.area).toBeGreaterThan(before);
  expect(s.surface.radii.find((r) => r.requested === 3)!.effective).toBe(3);
  await page.screenshot({ path: "evidence/radius-valid.png" });
  const download = page.waitForEvent("download");
  await page
    .getByRole("button", { name: "JSON speichern", exact: true })
    .click();
  const saved = await download;
  const file = await saved.path();
  expect(file).toBeTruthy();
  await page.getByRole("button", { name: "Neu", exact: true }).click();
  await page.locator("#import").setInputFiles(file!);
  await expect
    .poll(async () => (await snapshot(page)).network)
    .toEqual(s.network);
  await clickWorld(page, 0, 0);
  await page
    .locator('[data-radius-a="E:0:start"][data-radius-b="N:0:start"]')
    .fill("1000");
  await page
    .locator('[data-radius-a="E:0:start"][data-radius-b="N:0:start"]')
    .press("Tab");
  s = await snapshot(page);
  expect(s.surface.radii.find((r) => r.requested === 1000)!.effective).toBe(0);
  await expect(page.locator("#inspector")).toContainText("wirksam 0");
  await page.screenshot({ path: "evidence/radius-feedback.png" });
});
test("B04 holes, conflict visibility, 3D uses identical surface, pan/zoom do not edit", async ({
  page,
}) => {
  await load(page, loop());
  let s = await snapshot(page);
  expect(s.surface.areas[0].holes).toHaveLength(1);
  expect(s.area).toBeCloseTo(632, 5);
  expect(s.meshArea).toBeCloseTo(632, 2);
  sameMesh(s);
  await page.screenshot({ path: "evidence/hole-top.png" });
  await page.getByRole("button", { name: "3D prüfen", exact: true }).click();
  expect((await snapshot(page)).meshArea).toBeCloseTo(632, 2);
  await page.screenshot({ path: "evidence/hole-3d.png" });
  await page.getByRole("button", { name: "Draufsicht", exact: true }).click();
  const before = JSON.stringify((await snapshot(page)).network);
  const q = await at(page, 0, 0);
  await page.mouse.move(q.x, q.y);
  await page.mouse.wheel(0, -100);
  await page.mouse.down({ button: "middle" });
  await page.mouse.move(q.x + 30, q.y + 30);
  await page.mouse.up({ button: "middle" });
  expect(JSON.stringify((await snapshot(page)).network)).toBe(before);
  await page
    .getByRole("button", { name: "Ansicht 0 / 120 m", exact: true })
    .click();
  expect((await snapshot(page)).view).toEqual({ x: 0, y: 0, height: 120 });
  await load(page, crossing());
  await expect(page.locator("#diagnostics")).toContainText("L × U");
  await page.screenshot({ path: "evidence/conflict.png" });
});
test("B05 mixed compound creation, numeric handles, reverse/delete, rejected edits are atomic", async ({
  page,
}) => {
  await page.getByRole("button", { name: "Neu", exact: true }).click();
  await page.locator("#kind").selectOption("line");
  await page.getByRole("button", { name: "Zeichnen", exact: true }).click();
  await clickWorld(page, -30, -10);
  await clickWorld(page, -10, -10);
  await page.locator("#kind").selectOption("quadratic");
  await clickWorld(page, 10, 0);
  await page.locator("#kind").selectOption("cubic");
  await clickWorld(page, 30, 15);
  await page.keyboard.press("Escape");
  let s = await snapshot(page);
  expect(s.network.paths).toHaveLength(1);
  expect(s.network.paths[0].segments.map((s) => s.kind)).toEqual([
    "line",
    "quadratic",
    "cubic",
  ]);
  const id = s.network.paths[0].id;
  await page.locator(`[data-path="${id}"]`).first().click({ force: true });
  await page.locator('[data-handle="c2"]').click();
  await page.getByLabel("Griff Y (m)").fill("24");
  await page.getByLabel("Griff Y (m)").press("Tab");
  s = await snapshot(page);
  const c = s.network.paths[0].segments[2];
  expect(c.kind === "cubic" && c.c2.y).toBe(24);
  const physical = s.area;
  await page
    .getByRole("button", { name: "Richtung umkehren", exact: true })
    .click();
  expect((await snapshot(page)).area).toBeCloseTo(physical, 2);
  const valid = (await snapshot(page)).network;
  await page.getByLabel("Breite Anfang (m)").fill("0");
  await page.getByLabel("Breite Anfang (m)").press("Tab");
  expect((await snapshot(page)).network).toEqual(valid);
  await expect(page.locator("#status")).toContainText("positiv");
  await page.locator("#import").setInputFiles({
    name: "invalid.json",
    mimeType: "application/json",
    buffer: Buffer.from('{"version":2}'),
  });
  await expect(page.locator("#status")).toContainText("Import abgelehnt");
  expect((await snapshot(page)).network).toEqual(valid);
  await page.getByRole("button", { name: "Pfad löschen", exact: true }).click();
  expect((await snapshot(page)).area).toBe(0);
  expect((await snapshot(page)).network.paths).toHaveLength(0);
  await page.getByRole("button", { name: "Undo", exact: true }).click();
  expect((await snapshot(page)).network).toEqual(valid);
  sameMesh(await snapshot(page));
});
