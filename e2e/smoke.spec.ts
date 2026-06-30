import { expect, test } from "@playwright/test";

test.beforeEach(async ({ page }) => {
  await page.goto("/");
  // The app shell lives in an open shadow root; wait for the title to render.
  await expect(page.locator("h1").first()).toBeVisible();
});

test("renders the shell without a large gap above the content", async ({ page }) => {
  // The shell re-renders on store emits, so poll a fresh handle each time.
  // Regression guard: a broken grid once pushed <main> a full viewport down.
  await expect
    .poll(async () => {
      const box = await page.locator("h1").first().boundingBox();
      return box ? box.y : Number.POSITIVE_INFINITY;
    })
    .toBeLessThan(160);
});

test("navigates to the new sections via the sidebar", async ({ page }) => {
  for (const [hash, label] of [
    ["#/today", "Сегодня"],
    ["#/habits", "Привычки"],
    ["#/review", "Ревью"],
  ] as const) {
    await page.locator(`a.nav-item[href="${hash}"]`).click();
    await expect(page.locator("h1").first()).toHaveText(label);
  }
});

test("adds a daily checklist item and checks it off", async ({ page }) => {
  await page.locator('a.nav-item[href="#/today"]').click();
  await page.getByPlaceholder("Добавить пункт на день…").fill("E2E пункт");
  await page.getByPlaceholder("Добавить пункт на день…").press("Enter");

  const item = page.locator(".check-item", { hasText: "E2E пункт" });
  await expect(item).toBeVisible();

  await item.getByRole("checkbox").check();
  await expect(page.locator(".check-item.is-done", { hasText: "E2E пункт" })).toBeVisible();
});
