import { test, expect, type Page } from "@playwright/test";
import { contains } from "../../src/geometry";
const snapshot = (page: Page) =>
  page.evaluate(() => window.__wegwerk.snapshot());
async function click(page: Page, x: number, y: number) {
  const box = (await page.locator("#editor").boundingBox())!,
    s = await snapshot(page);
  await page.mouse.click(
    box.x + box.width / 2 + ((x - s.view.x) * box.height) / s.view.height,
    box.y + box.height / 2 - ((y - s.view.y) * box.height) / s.view.height,
  );
}
async function begin(page: Page, material: "road" | "water", kind = "line") {
  await page.getByLabel("Zeichenmaterial").selectOption(material);
  await page.locator("#kind").selectOption(kind);
  await page.getByRole("button", { name: "Zeichnen", exact: true }).click();
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
test.afterEach(({ page }) => {
  expect(errors.get(page)).toEqual([]);
});
test("V11 both materials draw open line/quadratic/cubic vectors with independent widths", async ({
  page,
}) => {
  for (const material of ["road", "water"] as const)
    for (const kind of ["line", "quadratic", "cubic"]) {
      await page.getByRole("button", { name: "Neu", exact: true }).click();
      await begin(page, material, kind);
      await click(page, -20, 0);
      await click(page, 20, 0);
      await page.keyboard.press("Escape");
      let s = await snapshot(page);
      expect(s.network.paths[0].kind ?? "road").toBe(material);
      expect(s.network.paths[0].segments[0].kind).toBe(kind);
      expect(s.network.areaBlockers ?? []).toHaveLength(0);
      await expect(page.getByLabel("Breite Anfang (m)")).toBeVisible();
      const before = s.area;
      await page.getByLabel("Breite Anfang (m)").fill("8");
      await page.getByLabel("Breite Anfang (m)").press("Tab");
      s = await snapshot(page);
      expect(s.network.paths[0]).toMatchObject({ startWidth: 8, endWidth: 4 });
      expect(s.area).toBeGreaterThan(before);
      if (material === "water")
        expect(s.waterMesh.heights.every((z) => z < 0)).toBe(true);
    }
});
test("V12 closing either material fills its vector interior, hides widths and retains editable Bezier handles", async ({
  page,
}, testInfo) => {
  for (const material of ["road", "water"] as const) {
    await page.getByRole("button", { name: "Neu", exact: true }).click();
    await begin(page, material, "quadratic");
    await click(page, -20, 0);
    await click(page, 20, 0);
    await page.locator("#kind").selectOption("line");
    await page
      .getByRole("button", { name: "Pfad schließen", exact: true })
      .click();
    let s = await snapshot(page);
    expect(s.network.paths).toHaveLength(0);
    expect(s.network.areaBlockers![0].kind).toBe(material);
    expect(s.area).toBeCloseTo(400 / 3, 1);
    expect(contains(s.surface, { x: 0, y: 2 })).toBe(true);
    await expect(page.getByLabel("Breite Anfang (m)")).toHaveCount(0);
    await expect(page.getByLabel("Breite Ende (m)")).toHaveCount(0);
    const closed = structuredClone(s.network),
      originalArea = s.area;
    const grip = (await page.locator('[data-handle="control"]').boundingBox())!,
      editor = (await page.locator("#editor").boundingBox())!;
    const gx = grip.x + grip.width / 2,
      gy = grip.y + grip.height / 2;
    await page.mouse.move(gx, gy);
    await page.mouse.down();
    await page.mouse.move(gx, gy - (5 * editor.height) / s.view.height, {
      steps: 8,
    });
    await page.mouse.up();
    expect(
      (await snapshot(page)).network.areaBlockers![0].outerEdges![0],
    ).toMatchObject({ kind: "quadratic" });
    expect(
      Number(await page.getByLabel("Griff Y (m)").inputValue()),
    ).toBeCloseTo(15, 1);
    expect((await snapshot(page)).area).toBeGreaterThan(originalArea);
    await page.getByRole("button", { name: "Undo", exact: true }).click();
    expect((await snapshot(page)).network).toEqual(closed);
    await click(page, -20, 0);
    await page
      .getByRole("button", { name: "Punkt einfügen", exact: true })
      .click();
    expect((await snapshot(page)).network.areaBlockers![0].outer).toHaveLength(
      3,
    );
    expect((await snapshot(page)).area).toBeCloseTo(originalArea, 5);
    await page.getByRole("button", { name: "Undo", exact: true }).click();
    expect((await snapshot(page)).network).toEqual(closed);
    await page.locator('[data-handle="control"]').click();
    await page.getByLabel("Griff Y (m)").fill("20");
    await page.getByLabel("Griff Y (m)").press("Tab");
    s = await snapshot(page);
    expect(s.area).toBeCloseTo(800 / 3, 1);
    expect(s.network.areaBlockers![0].outerEdges![0]).toMatchObject({
      kind: "quadratic",
      control: { x: 0, y: 20 },
    });
    await page.getByRole("button", { name: "Undo", exact: true }).click();
    expect((await snapshot(page)).area).toBeCloseTo(400 / 3, 1);
    await page.getByRole("button", { name: "Redo", exact: true }).click();
    await page.screenshot({
      path: testInfo.outputPath(`filled-${material}.png`),
    });
    const saved = page.waitForEvent("download");
    await page
      .getByRole("button", { name: "JSON speichern", exact: true })
      .click();
    const file = (await (await saved).path())!,
      before = (await snapshot(page)).network;
    await page.getByRole("button", { name: "Neu", exact: true }).click();
    await page.locator("#import").setInputFiles(file);
    await expect
      .poll(async () => (await snapshot(page)).network)
      .toEqual(before);
    await click(page, 0, 4);
    await page
      .getByRole("button", { name: "Kontur öffnen", exact: true })
      .click();
    await expect(page.getByLabel("Breite Anfang (m)")).toHaveValue("4");
    expect((await snapshot(page)).network.paths[0].kind).toBe(material);
  }
});
test("V13 island contours use the same curves; old polygon water can gain cubic handles", async ({
  page,
}, testInfo) => {
  await begin(page, "water");
  for (const [x, y] of [
    [-20, -20],
    [20, -20],
    [20, 20],
    [-20, 20],
    [-20, -20],
  ])
    await click(page, x, y);
  await page
    .getByRole("button", { name: "Insel aussparen", exact: true })
    .click();
  await page.locator("#kind").selectOption("quadratic");
  await click(page, -5, 0);
  await click(page, 5, 0);
  await click(page, -5, 0);
  let s = await snapshot(page);
  expect(s.network.areaBlockers![0].holeEdges![0][0].kind).toBe("quadratic");
  expect(contains(s.surface, { x: 0, y: 0 })).toBe(false);
  expect(s.area).toBeCloseTo(1600 - 50 / 3, 1);
  await page.screenshot({ path: testInfo.outputPath("curved-island.png") });
  const old = {
    version: 2,
    nodes: [],
    paths: [],
    junctions: [],
    areaBlockers: [
      {
        id: "Alt",
        kind: "water",
        outer: [
          { x: -20, y: -20 },
          { x: 20, y: -20 },
          { x: 20, y: 20 },
          { x: -20, y: 20 },
        ],
        holes: [],
      },
    ],
  };
  await page.locator("#import").setInputFiles({
    name: "legacy.json",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify(old)),
  });
  await expect.poll(async () => (await snapshot(page)).network).toEqual(old);
  await click(page, 5, 5);
  await click(page, -20, -20);
  await page.getByLabel("Kontursegment").selectOption("cubic");
  await page.locator('[data-handle="c2"]').click();
  await page.getByLabel("Griff Y (m)").fill("-5");
  await page.getByLabel("Griff Y (m)").press("Tab");
  s = await snapshot(page);
  expect(s.network.version).toBe(3);
  expect(s.network.areaBlockers![0].outerEdges![0]).toMatchObject({
    kind: "cubic",
    c2: { y: -5 },
  });
  expect(s.area).not.toBeCloseTo(1600, 1);
  expect(Math.abs(s.meshArea - s.area)).toBeLessThan(0.02);
});
