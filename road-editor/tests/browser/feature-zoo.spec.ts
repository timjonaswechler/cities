import { test, expect, type Page } from "@playwright/test";
const snapshot = (page: Page) =>
  page.evaluate(() => window.__featureZoo.snapshot());
const errors = new WeakMap<Page, string[]>();
test.beforeEach(async ({ page }) => {
  const found: string[] = [];
  errors.set(page, found);
  page.on("pageerror", (e) => found.push(e.message));
  page.on("console", (e) => {
    if (e.type() === "error") found.push(e.text());
  });
  await page.goto("/feature-zoo.html");
});
test.afterEach(({ page }) => expect(errors.get(page)).toEqual([]));

test("all seven features render real finite meshes and retain their individual settings", async ({
  page,
}) => {
  await page.getByLabel("Breite als Zahl", { exact: true }).fill("9.5");
  await expect
    .poll(async () => (await snapshot(page)).config.values.room.width)
    .toBe(9.5);
  const room = await snapshot(page);
  expect(room.bounds.max[0] - room.bounds.min[0]).toBeCloseTo(9.5);
  for (const id of [
    "roof",
    "annex",
    "overhang",
    "gate",
    "wall",
    "connection",
    "room",
  ]) {
    await page.locator(`[data-feature="${id}"]`).click();
    const s = await snapshot(page);
    expect(s.config.selectedFeature).toBe(id);
    expect(s.view.meshes.length).toBeGreaterThan(0);
    expect(s.view.meshes.every((m) => m.finite)).toBe(true);
    expect(s.issues).toEqual([]);
    expect(s.ports.length).toBeGreaterThan(0);
  }
  await expect(page.getByLabel("Breite als Zahl", { exact: true })).toHaveValue(
    "9.5",
  );
  expect((await snapshot(page)).config.values.roof.width).toBe(7);
});

test("editable location limits and per-feature material permissions flag, rather than clamp, the mesh", async ({
  page,
}) => {
  await page.locator('[data-feature="roof"]').click();
  await page.getByLabel("Dachhöhe als Zahl", { exact: true }).fill("4.8");
  await page.locator("#location").selectOption("town");
  await expect(page.locator("#check")).toHaveClass("invalid");
  expect((await snapshot(page)).metrics.height).toBeCloseTo(4.8, 5);
  await page.getByLabel("Dachmaterial", { exact: true }).selectOption("reed");
  expect((await snapshot(page)).issues).toHaveLength(2);
  await page.getByLabel("Dachhöhe max. als Zahl", { exact: true }).fill("5");
  expect((await snapshot(page)).issues).toHaveLength(1);
  await page
    .getByRole("checkbox", { name: "Reet zulassen", exact: true })
    .check();
  await expect(page.locator("#check")).toHaveClass("valid");
  await page
    .getByRole("checkbox", { name: "Feature hier freigeben", exact: true })
    .uncheck();
  await expect(page.locator("#check")).toHaveClass("invalid");
  await page
    .getByRole("checkbox", { name: "Feature hier freigeben", exact: true })
    .check();
  await page.locator("#location").selectOption("village");
  await expect(page.locator("#check")).toHaveClass("invalid");
  await page.locator("#location").selectOption("town");
  await expect(page.locator("#check")).toHaveClass("valid");
  const s = await snapshot(page);
  expect(s.config.values.roof.rise).toBe(4.8);
  expect(
    s.config.locations.find((l) => l.id === "village")!.features.roof.limits
      .maxHeight,
  ).toBe(3);
  expect(
    s.config.locations.find((l) => l.id === "town")!.features.wall.materials,
  ).not.toContain("reed");
  await page.getByLabel("Dachform", { exact: true }).selectOption("flat");
  expect((await snapshot(page)).metrics.height).toBeCloseTo(0.25, 5);
  await expect(
    page.getByLabel("Dachhöhe als Zahl", { exact: true }),
  ).toHaveCount(0);
});

test("opening variants, occupied-space display and camera controls change only their intended state", async ({
  page,
}) => {
  await page.locator('[data-feature="gate"]').click();
  const arch = await snapshot(page);
  expect(arch.metrics.height).toBeCloseTo(4.3, 5);
  await page.getByLabel("Öffnung", { exact: true }).selectOption("lintel");
  const plain = await snapshot(page);
  expect(plain.metrics.height).toBeCloseTo(3.2, 5);
  expect(plain.metrics.clearance).toBe(2.8);
  await expect(
    page.getByLabel("Bogenanstieg als Zahl", { exact: true }),
  ).toHaveCount(0);
  await page.getByRole("checkbox", { name: "Nutzraum", exact: true }).check();
  await page
    .getByRole("checkbox", { name: "Anschlüsse", exact: true })
    .uncheck();
  await page.getByRole("button", { name: "Vorn", exact: true }).click();
  const front = await snapshot(page);
  expect(front.view.spacesVisible).toBe(true);
  expect(front.view.portsVisible).toBe(false);
  await page.getByRole("button", { name: "Oben", exact: true }).click();
  const top = await snapshot(page);
  expect(top.view.camera).not.toEqual(front.view.camera);
  expect(top.config).toEqual(plain.config);
});

test("configuration JSON round-trips and invalid imports leave geometry and choices intact", async ({
  page,
}) => {
  await page.locator('[data-feature="overhang"]').click();
  await page
    .getByLabel("Vorstoß nach vorn als Zahl", { exact: true })
    .fill("0.8");
  await page.locator("#location").selectOption("town");
  const saved = (await snapshot(page)).config;
  const download = page.waitForEvent("download");
  await page
    .getByRole("button", { name: "Konfiguration speichern", exact: true })
    .click();
  const file = (await (await download).path())!;
  await page
    .getByRole("button", { name: "Bauteil zurücksetzen", exact: true })
    .click();
  expect((await snapshot(page)).config).not.toEqual(saved);
  await page.locator("#config-file").setInputFiles(file);
  await expect.poll(async () => (await snapshot(page)).config).toEqual(saved);
  const invalid = structuredClone(saved);
  invalid.values.overhang.projection = 999;
  await page.locator("#config-file").setInputFiles({
    name: "invalid.json",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify(invalid)),
  });
  await expect(page.locator("#notice")).toContainText("Import abgelehnt");
  expect((await snapshot(page)).config).toEqual(saved);
  expect((await snapshot(page)).view.meshes.every((m) => m.finite)).toBe(true);
});
