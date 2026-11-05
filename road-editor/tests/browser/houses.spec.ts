import { test, expect, type Page } from "@playwright/test";
import { houseGeometry } from "../../src/houses";
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
async function setup(page: Page, small = false) {
  await page.getByRole("button", { name: "Neu", exact: true }).click();
  await page.getByRole("button", { name: "Zeichnen", exact: true }).click();
  await click(page, -30, 0);
  await click(page, 30, 0);
  await page.keyboard.press("Escape");
  await page
    .getByRole("button", { name: "Bauplatz markieren", exact: true })
    .click();
  await click(page, small ? -2 : -12, 2);
  await click(page, small ? 2 : 12, small ? 5 : 23);
  await click(page, 0, 2);
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
});
test.afterEach(({ page }) => {
  expect(errors.get(page)).toEqual([]);
});

test("H07 marks a plot, compares three houses, accepts one and preserves exact data through history and JSON", async ({
  page,
}, info) => {
  await setup(page);
  const s = await snapshot(page);
  expect(s.houses.result?.houses).toHaveLength(3);
  expect(s.network.housePlot?.access?.point.y).toBeCloseTo(2, 8);
  const variants = s.houses.result!.houses;
  const roofs = new Set<string>();
  for (const house of variants) {
    await page
      .getByLabel("Hausvariante", { exact: true })
      .selectOption(house.id);
    const current = await snapshot(page);
    expect(current.houses.preview).toEqual(house);
    roofs.add((await page.locator(".house-roof").getAttribute("points"))!);
    const mesh = current.houses.meshes.find((m) => m.name === "house-roof")!;
    const heights = mesh.positions.filter((_, i) => i % 3 === 2);
    expect(Math.max(...heights)).toBeCloseTo(
      houseGeometry(house).ridgeHeight,
      5,
    );
    expect(Math.min(...heights)).toBeCloseTo(
      houseGeometry(house).eaveHeight,
      5,
    );
  }
  expect(roofs.size).toBe(3);
  await page
    .getByLabel("Hausvariante", { exact: true })
    .selectOption(variants[1].id);
  const box = (await page.locator("#editor").boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2 - 80);
  await page.mouse.wheel(0, -1000);
  await expect
    .poll(async () => (await snapshot(page)).view.height)
    .toBeLessThan(50);
  await page.screenshot({ path: info.outputPath("house-top.png") });
  for (const index of [0, 1]) {
    await page
      .getByLabel("Hausvariante", { exact: true })
      .selectOption(variants[index].id);
    await page.getByRole("button", { name: "3D prüfen", exact: true }).click();
    await page.screenshot({
      path: info.outputPath(`house-spatial-${index}.png`),
    });
    await page.getByRole("button", { name: "Draufsicht", exact: true }).click();
  }
  await page
    .getByRole("button", { name: "Haus übernehmen", exact: true })
    .click();
  expect((await snapshot(page)).network.housePlot?.accepted).toEqual(
    variants[1],
  );
  await expect(page.getByLabel("Hausvariante", { exact: true })).toBeDisabled();
  await page.getByRole("button", { name: "Undo", exact: true }).click();
  expect((await snapshot(page)).network.housePlot?.accepted).toBeUndefined();
  await page.getByRole("button", { name: "Redo", exact: true }).click();
  // JSON normalizes signed zero; compare the serializable project data.
  const saved = JSON.parse(JSON.stringify((await snapshot(page)).network));
  const download = page.waitForEvent("download");
  await page
    .getByRole("button", { name: "JSON speichern", exact: true })
    .click();
  const file = (await (await download).path())!;
  await page.getByRole("button", { name: "Neu", exact: true }).click();
  expect((await snapshot(page)).network.housePlot).toBeUndefined();
  await page.locator("#import").setInputFiles(file);
  await expect.poll(async () => (await snapshot(page)).network).toEqual(saved);
  await page
    .getByRole("button", { name: "Haus entfernen", exact: true })
    .click();
  expect((await snapshot(page)).network.housePlot?.accepted).toBeUndefined();
  await page.getByRole("button", { name: "Undo", exact: true }).click();
  expect((await snapshot(page)).network.housePlot?.accepted).toEqual(
    saved.housePlot.accepted,
  );
  await page
    .getByRole("button", { name: "Bauplatz löschen", exact: true })
    .click();
  expect((await snapshot(page)).network.housePlot).toBeUndefined();
  expect((await snapshot(page)).houses.meshes).toEqual([]);
  await page.getByRole("button", { name: "Undo", exact: true }).click();
  expect((await snapshot(page)).network).toEqual(saved);
});

test("commits a seed change when clicking accept directly without Tab", async ({
  page,
}) => {
  await setup(page);
  await page.getByLabel("Haus-Seed", { exact: true }).fill("43");
  await page
    .getByRole("button", { name: "Haus übernehmen", exact: true })
    .click();
  const n = (await snapshot(page)).network;
  expect(n.housePlot!.seed).toBe(43);
  expect(n.housePlot!.accepted?.id).toMatch(/^house-43-/);
});

for (const seed of ["-1", ""])
  test(`rejects direct acceptance of ${seed === "" ? "empty" : "negative"} seed and recovers on correction`, async ({
    page,
  }) => {
    await setup(page);
    const before = (await snapshot(page)).network;
    await page.getByLabel("Haus-Seed", { exact: true }).fill(seed);
    await page
      .getByRole("button", { name: "Haus übernehmen", exact: true })
      .click();
    expect((await snapshot(page)).network).toEqual(before);
    await expect(page.locator("#status")).toContainText("Ungültiger Bauplatz");
    await expect(page.getByLabel("Haus-Seed", { exact: true })).toHaveValue(
      seed,
    );
    await page.getByLabel("Haus-Seed", { exact: true }).fill("43");
    await page
      .getByRole("button", { name: "Haus übernehmen", exact: true })
      .click();
    expect((await snapshot(page)).network.housePlot?.accepted?.id).toMatch(
      /^house-43-/,
    );
  });

test("rejects an unsupported accepted profile without replacing the project", async ({
  page,
}) => {
  await setup(page);
  await page
    .getByRole("button", { name: "Haus übernehmen", exact: true })
    .click();
  const before = (await snapshot(page)).network;
  const invalid = structuredClone(before);
  invalid.housePlot!.accepted!.storeys = 2;
  await page.locator("#import").setInputFiles({
    name: "bad-profile.json",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify(invalid)),
  });
  await expect(page.locator("#status")).toContainText("Import abgelehnt");
  expect((await snapshot(page)).network).toEqual(before);
});

test("H02/H03 explain too-small plots and water blockers without inventing houses", async ({
  page,
}) => {
  await setup(page, true);
  expect((await snapshot(page)).houses.result?.houses).toEqual([]);
  await expect(page.locator("#house-inspector")).toContainText(
    "0 von 3 Varianten",
  );
  await expect(
    page.getByRole("button", { name: "Haus übernehmen", exact: true }),
  ).toBeDisabled();
  await setup(page);
  const n = (await snapshot(page)).network;
  n.areaBlockers!.push({
    id: "water",
    kind: "water",
    outer: [
      { x: -14, y: 3 },
      { x: 14, y: 3 },
      { x: 14, y: 25 },
      { x: -14, y: 25 },
    ],
  });
  await page.locator("#import").setInputFiles({
    name: "water-plot.json",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify(n)),
  });
  await expect
    .poll(async () => (await snapshot(page)).houses.result?.houses.length)
    .toBe(0);
  await expect(page.locator("#house-inspector")).toContainText("Wasser");
  expect((await snapshot(page)).houses.meshes).toEqual([]);
});

test("H06 road edits visibly invalidate the accepted house but never replace it", async ({
  page,
}, info) => {
  await setup(page);
  await page
    .getByRole("button", { name: "Haus übernehmen", exact: true })
    .click();
  const accepted = (await snapshot(page)).network.housePlot!.accepted;
  await click(page, 0, 0);
  await page.getByLabel("Breite Anfang (m)", { exact: true }).fill("12");
  await page.getByLabel("Breite Anfang (m)", { exact: true }).press("Tab");
  const invalid = await snapshot(page);
  expect(invalid.network.housePlot!.accepted).toEqual(accepted);
  expect(invalid.houses.conflicts.length).toBeGreaterThan(0);
  await expect(page.locator("#house-inspector [role=alert]")).toContainText(
    "Haus ungültig",
  );
  await expect(page.locator(".house-roof")).toHaveAttribute("fill", "#be503e");
  await page.screenshot({ path: info.outputPath("house-conflict.png") });
  await page.getByRole("button", { name: "Undo", exact: true }).click();
  expect((await snapshot(page)).houses.conflicts).toEqual([]);
  expect((await snapshot(page)).network.housePlot!.accepted).toEqual(accepted);
});

test("pen and fixed drawing preserve a version-4 house project through undo and redo", async ({
  page,
}) => {
  await setup(page);
  await page
    .getByRole("button", { name: "Haus übernehmen", exact: true })
    .click();
  const plot = (await snapshot(page)).network.housePlot;
  await page.keyboard.press("p");
  await click(page, -25, -20);
  await click(page, -10, -20);
  await page.keyboard.press("Enter");
  expect((await snapshot(page)).network.paths).toHaveLength(2);
  expect((await snapshot(page)).network.version).toBe(4);
  await page.getByRole("button", { name: "Undo", exact: true }).click();
  expect((await snapshot(page)).network.paths).toHaveLength(1);
  expect((await snapshot(page)).network.housePlot).toEqual(plot);
  await page.getByRole("button", { name: "Redo", exact: true }).click();
  expect((await snapshot(page)).network.paths).toHaveLength(2);
  await page.locator("#kind").selectOption("line");
  await page.getByRole("button", { name: "Zeichnen", exact: true }).click();
  await click(page, 10, -20);
  await click(page, 25, -20);
  await page.keyboard.press("Escape");
  const combined = await snapshot(page);
  expect(combined.network.paths).toHaveLength(3);
  expect(combined.network.version).toBe(4);
  expect(combined.network.housePlot).toEqual(plot);
  expect(combined.houses.conflicts).toEqual([]);
  await page.keyboard.press("p");
  await click(page, -20, -30);
  await page
    .getByRole("button", { name: "Bauplatz markieren", exact: true })
    .click();
  await click(page, -5, 5);
  await page.keyboard.press("Escape");
  expect((await snapshot(page)).network).toEqual(combined.network);
  await expect(page.locator("#select")).toHaveClass("active");
  await expect(page.locator(".pen-overlay")).toHaveCount(0);
});

test("cancels an unfinished plot and rejects invalid seeds/imports without changing the project", async ({
  page,
}) => {
  await setup(page);
  const before = (await snapshot(page)).network;
  await page
    .getByRole("button", { name: "Bauplatz markieren", exact: true })
    .click();
  await click(page, -5, 5);
  await page.keyboard.press("Escape");
  expect((await snapshot(page)).network).toEqual(before);
  await page.getByLabel("Haus-Seed", { exact: true }).fill("-1");
  await page.getByLabel("Haus-Seed", { exact: true }).press("Tab");
  expect((await snapshot(page)).network).toEqual(before);
  await expect(page.locator("#status")).toContainText("Ungültiger Bauplatz");
  const invalid = structuredClone(before);
  invalid.housePlot!.access!.tangent = { x: 0, y: 0 };
  await page.locator("#import").setInputFiles({
    name: "bad-house.json",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify(invalid)),
  });
  await expect(page.locator("#status")).toContainText("Import abgelehnt");
  expect((await snapshot(page)).network).toEqual(before);
});
