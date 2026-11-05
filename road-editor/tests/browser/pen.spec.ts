import { test, expect, type Page } from "@playwright/test";
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
async function pull(
  page: Page,
  x: number,
  y: number,
  hx: number,
  hy: number,
  release = true,
) {
  const a = await at(page, x, y),
    b = await at(page, hx, hy);
  await page.mouse.move(a.x, a.y);
  await page.mouse.down();
  await page.mouse.move(b.x, b.y, { steps: 6 });
  if (release) await page.mouse.up();
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

test("P: click / drag sets actual Bezier handles, previews before release and ends with a corner / line", async ({
  page,
}, info) => {
  await page.keyboard.press("p");
  await expect(page.locator("#kind")).toHaveValue("pen");
  await click(page, -30, 0);
  expect((await snapshot(page)).network.nodes).toEqual([]);
  await expect(page.locator(".empty-instruction")).toHaveCount(0);
  const hover = await at(page, -10, 10);
  await page.mouse.move(hover.x, hover.y);
  await expect(page.locator(".pen-preview")).toBeVisible();
  await pull(page, -10, 10, -2, 10, false);
  expect((await snapshot(page)).network.paths).toEqual([]);
  await expect(page.locator(".pen-grip")).toHaveCount(2);
  await page.screenshot({ path: info.outputPath("pen-drag-preview.png") });
  await page.mouse.up();
  let n = (await snapshot(page)).network;
  expect(n.paths[0].segments[0].kind).toBe("cubic");
  const first = n.paths[0].segments[0];
  if (first.kind !== "cubic") throw new Error("cubic");
  expect(first.c1.x).toBeCloseTo(-30, 6);
  expect(first.c1.y).toBeCloseTo(0, 6);
  expect(first.c2.x).toBeCloseTo(-18, 6);
  expect(first.c2.y).toBeCloseTo(10, 6);
  await pull(page, 10, 0, 15, -5);
  await click(page, 30, 0);
  await click(page, 40, 10);
  await page.keyboard.press("Enter");
  n = (await snapshot(page)).network;
  expect(n.paths[0].segments.map((s) => s.kind)).toEqual([
    "cubic",
    "cubic",
    "cubic",
    "line",
  ]);
  expect(n.areaBlockers).toEqual([]);
  await expect(page.locator(".pen-overlay")).toHaveCount(0);
  await expect(page.locator("#select")).toHaveClass("active");
  await page.screenshot({ path: info.outputPath("pen-path.png") });
  // Moving a newly drawn anchor must carry its attached handles, not leave
  // them at their old world positions and unexpectedly distort the tangent.
  const beforeMove = structuredClone(n.paths[0].segments[0]);
  await pull(page, -10, 10, -10, 15);
  const moved = (await snapshot(page)).network.paths[0].segments[0];
  if (beforeMove.kind !== "cubic" || moved.kind !== "cubic")
    throw new Error("cubic");
  expect(moved.c2.y).toBeCloseTo(beforeMove.c2.y + 5, 5);
});

test("Esc cancels an in-flight drag, first-point drafts leave no orphan nodes, undo is one point gesture", async ({
  page,
}) => {
  const empty = (await snapshot(page)).network;
  await page.keyboard.press("p");
  await click(page, -20, 0);
  await pull(page, 20, 0, 20, 15, false);
  await page.keyboard.press("Escape");
  await page.mouse.up();
  expect((await snapshot(page)).network).toEqual(empty);
  await expect(page.locator("#draw")).toHaveClass("active");
  await click(page, 20, 0);
  const one = (await snapshot(page)).network;
  expect(one.paths[0].segments[0].kind).toBe("line");
  await pull(page, 30, 15, 35, 20);
  await page.getByRole("button", { name: "Undo", exact: true }).click();
  expect((await snapshot(page)).network).toEqual(one);
  await page.getByRole("button", { name: "Redo", exact: true }).click();
  expect((await snapshot(page)).network.paths[0].segments).toHaveLength(2);
  await click(page, 40, 20);
  expect((await snapshot(page)).network.paths).toHaveLength(1);
  expect((await snapshot(page)).network.paths[0].segments).toHaveLength(3);
  await page.keyboard.press("v");
  const before = (await snapshot(page)).network;
  await page.keyboard.press("p");
  await click(page, -30, -20);
  await page.keyboard.press("Escape");
  expect((await snapshot(page)).network).toEqual(before);
});

for (const material of ["road", "water"] as const)
  test(`pen closure uses the original two handle directions for ${material}`, async ({
    page,
  }, info) => {
    await page.getByLabel("Zeichenmaterial").selectOption(material);
    await page.getByRole("button", { name: "Zeichnen", exact: true }).click();
    await pull(page, -20, 0, -20, 12);
    await pull(page, 20, 0, 20, -12);
    const start = await at(page, -20, 0);
    await page.mouse.move(start.x, start.y);
    await expect(page.locator(".pen-close")).toBeVisible();
    await click(page, -20, 0);
    const s = await snapshot(page);
    expect(s.network.paths).toEqual([]);
    const a = s.network.areaBlockers![0];
    expect(a.kind).toBe(material);
    expect(a.outerEdges?.map((e) => e.kind)).toEqual(["cubic", "cubic"]);
    expect(s.area).toBeGreaterThan(100);
    expect(Math.abs(s.area - s.meshArea)).toBeLessThan(0.02);
    await page.screenshot({
      path: info.outputPath(`pen-closed-${material}.png`),
    });
    await pull(page, -20, 0, -20, 3);
    const moved = (await snapshot(page)).network.areaBlockers![0];
    const beforeEdge = a.outerEdges![0],
      afterEdge = moved.outerEdges![0];
    if (beforeEdge.kind !== "cubic" || afterEdge.kind !== "cubic")
      throw new Error("cubic");
    expect(afterEdge.c1.y).toBeCloseTo(beforeEdge.c1.y + 3, 5);
    await page.getByRole("button", { name: "Undo", exact: true }).click();
    expect((await snapshot(page)).network.areaBlockers![0]).toEqual(a);
    await page.getByRole("button", { name: "Undo", exact: true }).click();
    expect((await snapshot(page)).network.paths[0].segments).toHaveLength(1);
  });

test("the same pen gestures draw a curved hole, and undo removes only the last draft point", async ({
  page,
}) => {
  await page.locator("#import").setInputFiles({
    name: "contour.json",
    mimeType: "application/json",
    buffer: Buffer.from(
      JSON.stringify({
        version: 3,
        nodes: [],
        paths: [],
        junctions: [],
        areaBlockers: [
          {
            id: "lake",
            kind: "water",
            outer: [
              { x: -30, y: -20 },
              { x: 30, y: -20 },
              { x: 30, y: 20 },
              { x: -30, y: 20 },
            ],
            holes: [],
          },
        ],
      }),
    ),
  });
  await expect
    .poll(async () => (await snapshot(page)).network.areaBlockers?.length)
    .toBe(1);
  await click(page, 0, 0);
  await page
    .getByRole("button", { name: "Insel aussparen", exact: true })
    .click();
  await pull(page, -5, 0, -5, 3);
  await pull(page, 5, 0, 5, -3);
  await page.getByRole("button", { name: "Undo", exact: true }).click();
  await pull(page, 5, 0, 5, -3);
  await page.keyboard.press("Enter");
  const s = await snapshot(page);
  expect(s.network.areaBlockers![0].holes).toHaveLength(1);
  expect(s.network.areaBlockers![0].holeEdges![0].map((e) => e.kind)).toEqual([
    "cubic",
    "cubic",
  ]);
  expect(s.area).toBeLessThan(2400);
});
