import { test, expect } from "@playwright/test";
import { mkdirSync } from "node:fs";

const CASES = [
  {
    name: "space-none",
    id: "spaces~triangle~r6~0~0~1~none~none",
    text: "Freifläche · ohne Straße oder Weg",
  },
  {
    name: "space-road",
    id: "spaces~triangle~r6~0~0~1~road~none",
    text: "Straße 6 m",
  },
  {
    name: "space-path",
    id: "spaces~triangle~r6~0~0~1~path~none",
    text: "Weg 1.8–2.8 m",
  },
  {
    name: "tiny",
    id: "limits~tiny~r6~0~0~1~none~none",
    text: "Ohne Straße oder Weg",
  },
  {
    name: "flooded",
    id: "limits~flooded~r6~0~0~1~none~none",
    text: "Freie Wasserfläche · keine Trassenbreite",
  },
  {
    name: "pond",
    id: "shores~long-pond~w7~0~0.6~1~none~none",
    text: "Freie Wasserfläche · keine Trassenbreite",
  },
  {
    name: "flow",
    id: "waterways~straight~w7~0~0.6~1~none~none",
    text: "Wasser 7 m",
  },
];
let errors: string[];
test.beforeEach(({ page }) => {
  errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("console", (e) => {
    if (e.type() === "error") errors.push(e.text());
  });
});
test.afterEach(() => expect(errors).toEqual([]));
for (const fixture of CASES)
  test("truthful context label: " + fixture.name, async ({ page }) => {
    await page.goto(
      `/?seed=42&group=all&q=${encodeURIComponent(fixture.id)}&case=${encodeURIComponent(fixture.id)}`,
    );
    await expect(page.locator("#gallery")).toHaveAttribute(
      "aria-busy",
      "false",
      { timeout: 90_000 },
    );
    await expect(page.locator("#inspector-dialog")).toBeVisible();
    mkdirSync("test-results/context", { recursive: true });
    await page
      .locator("#inspector-dialog")
      .screenshot({ path: `test-results/context/${fixture.name}.png` });
    await expect(page.locator(".scenario-widths"), fixture.id).toHaveText(
      fixture.text,
    );
    await expect(page.locator(".study-caption > p"), fixture.id).toHaveText(
      fixture.text,
    );
    await expect(page.getByTestId("study-card")).toHaveCount(1);
  });

test("truthful context filters and search: no neutral road or pond width is treated as a real route", async ({
  page,
}) => {
  for (const query of ["route=r6", "q=Stra%C3%9Fe%206%20m", "q=r6"]) {
    await page.goto(`/?seed=42&group=spaces&neighbors=none&${query}`);
    await expect(page.locator("#gallery")).toHaveAttribute(
      "aria-busy",
      "false",
      { timeout: 90_000 },
    );
    await expect(page.locator("#result-count")).toHaveText("36 Studien");
    for (const card of await page.getByTestId("study-card").all()) {
      await expect(card.locator(".study-caption > p")).toHaveText("Straße 6 m");
    }
  }
  await page.goto("/?seed=42&group=shores&water=w7");
  await expect(page.locator("#gallery")).toHaveAttribute("aria-busy", "false", {
    timeout: 90_000,
  });
  await expect(page.locator("#result-count")).toHaveText("0 Studien");
  await page.goto("/?seed=42&group=spaces&neighbors=none&route=p1.8-2.8");
  await expect(page.locator("#gallery")).toHaveAttribute("aria-busy", "false", {
    timeout: 90_000,
  });
  await expect(page.locator("#result-count")).toHaveText("36 Studien");
  await expect(page.locator(".study-caption > p").first()).toHaveText(
    "Weg 1.8–2.8 m",
  );
});
