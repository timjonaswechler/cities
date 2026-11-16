import { test, expect, type Page } from "@playwright/test";
import type { Network } from "../../src/network";

const snapshot = (page: Page) =>
  page.evaluate(() => window.__wegwerk.snapshot());

function legacyProject(): Network {
  return {
    version: 4,
    nodes: [
      { id: "a", x: -30, y: 0 },
      { id: "b", x: 30, y: 0 },
    ],
    paths: [
      {
        id: "road",
        startWidth: 4,
        endWidth: 4,
        segments: [{ kind: "line", from: "a", to: "b" }],
      },
    ],
    junctions: [],
    areaBlockers: [],
    housePlot: {
      bounds: { min: { x: -12, y: 2 }, max: { x: 12, y: 23 } },
      access: { point: { x: 0, y: 2 }, tangent: { x: 1, y: 0 } },
      seed: 42,
      previewId: "saved-house",
      accepted: {
        id: "saved-house",
        center: { x: 0, y: 9 },
        angle: 0,
        width: 6,
        depth: 8,
        storeys: 2,
        ridge: "width",
      },
    },
  };
}
async function load(page: Page, network: Network) {
  await page.locator("#import").setInputFiles({
    name: "legacy-house.json",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify(network)),
  });
}
async function click(page: Page, x: number, y: number) {
  const box = (await page.locator("#editor").boundingBox())!,
    s = await snapshot(page);
  await page.mouse.click(
    box.x + box.width / 2 + ((x - s.view.x) * box.height) / s.view.height,
    box.y + box.height / 2 - ((y - s.view.y) * box.height) / s.view.height,
  );
}
async function removedSidebarContent(page: Page) {
  await expect(
    page.locator("#legacy-house-panel, #house-inspector"),
  ).toHaveCount(0);
  await expect(page.locator("main > aside > .hint")).toHaveCount(0);
  await expect(page.locator("#home")).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Bauplatz markieren", exact: true }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Zugang wählen", exact: true }),
  ).toHaveCount(0);
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
test.afterEach(({ page }) => expect(errors.get(page)).toEqual([]));

test("removes the legacy panel and marked help blocks while retaining pen controls", async ({
  page,
}) => {
  await removedSidebarContent(page);
  await page.getByRole("button", { name: "Zeichnen", exact: true }).click();
  await expect(page.locator("#inspector")).toContainText("Stift zeichnen");
  await expect(page.locator("#inspector > .hint")).toHaveCount(0);
  await expect(
    page.getByText(
      "Am Startpunkt schließt ein Klick ausdrücklich als Fläche.",
      { exact: false },
    ),
  ).toHaveCount(0);
  await page
    .getByRole("button", { name: "Offen beenden · Enter", exact: true })
    .click();
  await expect(page.locator("#select")).toHaveClass("active");
});

test("imports and round-trips an accepted legacy house without restoring the removed panel", async ({
  page,
}) => {
  const saved = legacyProject();
  await load(page, saved);
  let s = await snapshot(page);
  expect(s.network).toEqual(saved);
  expect(s.houses.conflicts).toEqual([]);
  const roof = s.houses.meshes.find((m) => m.name === "house-roof")!,
    heights = roof.positions.filter((_, i) => i % 3 === 2);
  expect(Math.max(...heights)).toBeCloseTo(10.1, 5);
  expect(Math.min(...heights)).toBeCloseTo(5.6, 5);
  await removedSidebarContent(page);
  await page.getByRole("button", { name: "3D prüfen", exact: true }).click();
  expect((await snapshot(page)).network).toEqual(saved);
  await page.getByRole("button", { name: "Draufsicht", exact: true }).click();
  const download = page.waitForEvent("download");
  await page
    .getByRole("button", { name: "JSON speichern", exact: true })
    .click();
  const file = (await (await download).path())!;
  await page.getByRole("button", { name: "Neu", exact: true }).click();
  expect((await snapshot(page)).network.housePlot).toBeUndefined();
  await page.locator("#import").setInputFiles(file);
  await expect.poll(async () => (await snapshot(page)).network).toEqual(saved);
  await removedSidebarContent(page);
  await page.getByRole("button", { name: "Undo", exact: true }).click();
  expect((await snapshot(page)).network.housePlot).toBeUndefined();
  await page.getByRole("button", { name: "Redo", exact: true }).click();
  s = await snapshot(page);
  expect(s.network).toEqual(saved);
  expect(s.houses.meshes.length).toBeGreaterThan(0);
});

test("road edits still flag a legacy house visually without replacing its stored description", async ({
  page,
}) => {
  const saved = legacyProject();
  await load(page, saved);
  await click(page, 0, 0);
  await page.getByLabel("Breite Anfang (m)", { exact: true }).fill("12");
  await page.getByLabel("Breite Anfang (m)", { exact: true }).press("Tab");
  const changed = await snapshot(page);
  expect(changed.network.housePlot).toEqual(saved.housePlot);
  expect(changed.houses.conflicts.length).toBeGreaterThan(0);
  await expect(page.locator(".house-roof")).toHaveAttribute("fill", "#be503e");
  await page.getByRole("button", { name: "Undo", exact: true }).click();
  expect((await snapshot(page)).houses.conflicts).toEqual([]);
  expect((await snapshot(page)).network).toEqual(saved);
  await removedSidebarContent(page);
});

for (const invalidField of ["profile", "seed", "access"] as const)
  test(`rejects an invalid legacy ${invalidField} atomically without the removed UI`, async ({
    page,
  }) => {
    const saved = legacyProject();
    await load(page, saved);
    const invalid = structuredClone(saved);
    if (invalidField === "profile") invalid.housePlot!.accepted!.storeys = 1;
    if (invalidField === "seed") invalid.housePlot!.seed = -1;
    if (invalidField === "access")
      invalid.housePlot!.access!.tangent = { x: 0, y: 0 };
    await load(page, invalid);
    await expect(page.locator("#status")).toContainText("Import abgelehnt");
    expect((await snapshot(page)).network).toEqual(saved);
    await removedSidebarContent(page);
  });

test("new pen and fixed paths preserve imported legacy house data through undo and redo", async ({
  page,
}) => {
  const saved = legacyProject();
  await load(page, saved);
  await page.keyboard.press("p");
  await click(page, -25, -20);
  await click(page, -10, -20);
  await page.keyboard.press("Enter");
  expect((await snapshot(page)).network.paths).toHaveLength(2);
  await page.getByRole("button", { name: "Undo", exact: true }).click();
  expect((await snapshot(page)).network).toEqual(saved);
  await page.getByRole("button", { name: "Redo", exact: true }).click();
  await page.locator("#kind").selectOption("line");
  await page.getByRole("button", { name: "Zeichnen", exact: true }).click();
  await click(page, 10, -20);
  await click(page, 25, -20);
  await page.keyboard.press("Escape");
  const current = await snapshot(page);
  expect(current.network.paths).toHaveLength(3);
  expect(current.network.version).toBe(4);
  expect(current.network.housePlot).toEqual(saved.housePlot);
  expect(current.houses.conflicts).toEqual([]);
  await removedSidebarContent(page);
});

for (const reason of ["small", "water"] as const)
  test(`an imported ${reason}-blocked legacy plot invents no house or legacy controls`, async ({
    page,
  }) => {
    const saved = legacyProject();
    delete saved.housePlot!.accepted;
    delete saved.housePlot!.previewId;
    if (reason === "small")
      saved.housePlot!.bounds = { min: { x: -2, y: 2 }, max: { x: 2, y: 5 } };
    else
      saved.areaBlockers!.push({
        id: "water",
        kind: "water",
        outer: [
          { x: -14, y: 3 },
          { x: 14, y: 3 },
          { x: 14, y: 25 },
          { x: -14, y: 25 },
        ],
      });
    await load(page, saved);
    await expect
      .poll(async () => (await snapshot(page)).network)
      .toEqual(saved);
    const s = await snapshot(page);
    expect(s.houses.result?.houses).toEqual([]);
    expect(s.houses.meshes).toEqual([]);
    await expect(page.locator(".house-roof")).toHaveCount(0);
    await removedSidebarContent(page);
  });
