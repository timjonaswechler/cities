import { test, expect } from "@playwright/test";
import type { Page } from "@playwright/test";
import { readFileSync, mkdirSync } from "node:fs";
import { CATALOG, GROUPS } from "../../src/scenarios";
import { VISUAL_CASES } from "../fixtures";

let errors: string[];
test.beforeEach(async ({ page }) => {
  errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("console", (e) => {
    if (e.type() === "error") errors.push(e.text());
  });
});
test.afterEach(() => {
  expect(errors, "No console/runtime errors in the tested flow").toEqual([]);
});
async function ready(page: Page): Promise<void> {
  await expect(page.locator("#gallery")).toHaveAttribute("aria-busy", "false", {
    timeout: 90_000,
  });
  await expect(page.locator('[data-result="render-error"]')).toHaveCount(0);
  await expect(page.locator("#error-banner")).toBeHidden();
  const cards = page.getByTestId("study-card");
  await expect(page.locator(".study-image img")).toHaveCount(
    await cards.count(),
  );
}

test("starts with actual WebGL thumbnails and navigates every theme without errors", async ({
  page,
}) => {
  await page.goto("/?seed=42");
  await ready(page);
  await expect(page.getByTestId("study-card")).toHaveCount(12);
  await expect(page.locator('[data-result="accepted"]')).not.toHaveCount(0);
  mkdirSync("test-results/visual", { recursive: true });
  await page.screenshot({
    path: "test-results/visual/overview.png",
    fullPage: true,
  });
  for (const group of GROUPS) {
    await page.locator(`[data-group="${group.id}"]`).click();
    await ready(page);
    await expect(page.locator("#heading")).toHaveText(group.label);
    const expected = CATALOG.filter(
      (s) => s.group === group.id,
    ).length.toLocaleString("de-DE");
    await expect(page.locator("#result-count")).toHaveText(
      `${expected} Studien`,
    );
    if (group.id === "limits")
      await expect(page.locator('[data-result="rejected"]')).toHaveCount(4);
  }
});

test("filters independent widths/neighbors, searches, paginates, and restores the URL", async ({
  page,
}) => {
  await page.goto("/?seed=42&group=road-water");
  await ready(page);
  const first = await page
    .getByTestId("study-card")
    .first()
    .getAttribute("data-case");
  await page.locator("#next-page").click();
  await ready(page);
  expect(
    await page.getByTestId("study-card").first().getAttribute("data-case"),
  ).not.toBe(first);
  await page.locator("#route-width").selectOption("r6");
  await page.locator("#water-width").selectOption("w7");
  await page.locator("#neighbors").selectOption("one");
  await ready(page);
  await expect(page.locator("#result-count")).toHaveText("48 Studien");
  for (const card of await page.getByTestId("study-card").all()) {
    await expect(card).toContainText("Straße 6 m · Wasser 7 m");
    await expect(card).toContainText("Ein Nachbar");
  }
  await page.reload();
  await ready(page);
  await expect(page.locator("#route-width")).toHaveValue("r6");
  await expect(page.locator("#water-width")).toHaveValue("w7");
  await page.locator("#search").fill("Schräge Brücke");
  await ready(page);
  await expect(page.locator("#result-count")).toHaveText("6 Studien");
  await page.locator("#search").fill("<script>nichts</script>");
  await ready(page);
  await expect(page.getByText("Keine passenden Studien.")).toBeVisible();
  await page.locator("#clear-filters").click();
  await ready(page);
  await expect(page.locator("#result-count")).toHaveText("2.304 Studien");
});

test("seed zero, house family, and camera changes are reproducible rather than just labels", async ({
  page,
}) => {
  await page.goto("/?seed=0&group=streets");
  await ready(page);
  const image0 = await page
    .locator(".study-image img")
    .first()
    .getAttribute("src");
  await page.locator("#next-seed").click();
  await ready(page);
  expect(
    await page.locator(".study-image img").first().getAttribute("src"),
  ).not.toBe(image0);
  await page.locator("#seed").fill("0");
  await page
    .getByRole("button", { name: "Seed anwenden", exact: true })
    .click();
  await ready(page);
  expect(
    await page.locator(".study-image img").first().getAttribute("src"),
  ).toBe(image0);
  await page.locator("#family").selectOption("longhouse");
  await ready(page);
  await expect(page.locator(".house-fact").first()).toContainText("Langhaus");
  const perspective = await page
    .locator(".study-image img")
    .first()
    .getAttribute("src");
  await page.locator('[data-view="top"]').click();
  await ready(page);
  expect(
    await page.locator(".study-image img").first().getAttribute("src"),
  ).not.toBe(perspective);
  const top = await page
    .locator(".study-image img")
    .first()
    .getAttribute("src");
  await page.reload();
  await ready(page);
  expect(
    await page.locator(".study-image img").first().getAttribute("src"),
  ).toBe(top);
});

test("single view supports orbit, zoom, pan, reset, export, deep link, and Escape", async ({
  page,
}) => {
  await page.goto("/?seed=42");
  await ready(page);
  await page.getByTestId("study-card").first().click();
  const dialog = page.locator("#inspector-dialog"),
    canvas = page.locator("#inspector-canvas canvas");
  await expect(dialog).toBeVisible();
  await expect(canvas).toBeVisible();
  await expect(page.locator("#inspector-title")).not.toBeEmpty();
  const image = () => canvas.evaluate((c: HTMLCanvasElement) => c.toDataURL());
  const original = await image();
  const box = (await canvas.boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(
    box.x + box.width / 2 + 90,
    box.y + box.height / 2 + 25,
    { steps: 8 },
  );
  await page.mouse.up();
  expect(await image()).not.toBe(original);
  const orbited = await image();
  await page.mouse.wheel(0, -250);
  expect(await image()).not.toBe(orbited);
  const zoomed = await image();
  await page.mouse.down({ button: "right" });
  await page.mouse.move(
    box.x + box.width / 2 + 130,
    box.y + box.height / 2 + 45,
    { steps: 6 },
  );
  await page.mouse.up({ button: "right" });
  expect(await image()).not.toBe(zoomed);
  await page.locator("#reset-camera").click();
  expect(await image()).toBe(original);
  const downloadJSON = page.waitForEvent("download");
  await page.locator("#download-case").click();
  const json = await downloadJSON;
  const data = JSON.parse(readFileSync((await json.path())!, "utf8"));
  expect(data.seed).toBe(42);
  expect(data.version).toBe(1);
  expect(data.result).toHaveProperty("ok");
  expect(data.scenario.spec.id).toBe(
    new URL(page.url()).searchParams.get("case"),
  );
  const downloadPNG = page.waitForEvent("download");
  await page.locator("#download-image").click();
  const png = readFileSync((await (await downloadPNG).path())!);
  expect(png.subarray(0, 8).toString("hex")).toBe("89504e470d0a1a0a");
  expect(png.length).toBeGreaterThan(5000);
  const url = page.url();
  await page.reload();
  await expect(dialog).toBeVisible();
  expect(page.url()).toBe(url);
  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();
  await expect(page).not.toHaveURL(/[?&]case=/);
});

test("matrix explains every axis, exports the complete catalog, and closes accessibly", async ({
  page,
}) => {
  await page.goto("/?seed=42");
  await ready(page);
  await page.locator("#show-matrix").click();
  await expect(page.locator("#matrix-dialog")).toBeVisible();
  await expect(page.locator("#matrix-dialog tbody tr")).toHaveCount(11);
  await expect(page.locator("#matrix-dialog tfoot")).toContainText("9.136");
  await page
    .locator("#matrix-dialog details")
    .first()
    .locator("summary")
    .click();
  await expect(page.locator("#matrix-dialog details").first()).toContainText(
    "Kehre rechts",
  );
  await page.keyboard.press("Escape");
  const event = page.waitForEvent("download");
  await page.locator("#export-catalog").click();
  const data = JSON.parse(readFileSync((await (await event).path())!, "utf8"));
  expect(data.scenarios).toHaveLength(9136);
  expect(new Set(data.scenarios.map((s: { id: string }) => s.id)).size).toBe(
    9136,
  );
});

test("flooded control displays the actual water height and explains the bounded rejection", async ({ page }) => {
  const spec = CATALOG.find(s => s.group === "limits" && s.motif === "flooded")!;
  await page.goto(`/?seed=42&group=limits&case=${encodeURIComponent(spec.id)}`);
  await ready(page);
  await expect(page.locator("#inspector-dialog")).toBeVisible();
  await expect(page.locator("#inspector-facts")).toContainText("−1.4 m");
  await expect(page.locator("#inspector-facts")).toContainText("kein mathematischer Unbebaubarkeitsnachweis");
  await expect(page.locator('[data-result="rejected"]')).toHaveCount(4);
});

test("mobile remains usable without document overflow, including the single view", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/?seed=42");
  await ready(page);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: "test-results/visual/mobile.png",
    fullPage: true,
  });
  await page.getByTestId("study-card").first().click();
  await expect(page.locator("#inspector-canvas canvas")).toBeVisible();
  expect(
    await page.evaluate(
      () =>
        document.querySelector("#inspector-dialog")!.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.locator("#close-inspector").click();
  await expect(page.locator("#inspector-dialog")).toBeHidden();
});

test("fixed visual corpus: every theme, water/road/path combinations, island, and rejection", async ({
  page,
}) => {
  test.setTimeout(600_000);
  mkdirSync("test-results/visual", { recursive: true });
  for (const spec of VISUAL_CASES) {
    await page.goto(
      `/?seed=42&group=${spec.group}&case=${encodeURIComponent(spec.id)}`,
    );
    await ready(page);
    await expect(page.locator("#inspector-dialog")).toBeVisible();
    await expect(page.locator("#inspector-canvas canvas")).toBeVisible();
    await expect(page.locator("#inspector-title")).toHaveText(spec.label);
    await page
      .locator("#inspector-dialog")
      .screenshot({
        path: `test-results/visual/${spec.group}-${spec.motif}.png`,
      });
    await page.locator("#close-inspector").click();
  }
});
