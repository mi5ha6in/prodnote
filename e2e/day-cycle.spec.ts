import { expect, test } from "@playwright/test";

// Сквозной смок дневного цикла: план → бюджет → палитра → quick-create →
// привычки → ревью → календарь.
test("day-cycle smoke: plan wizard flush, budget, palette, quick-create, habits, review CTA", async ({ page }) => {
  await page.goto("/");
  await expect(page.locator("h1").first()).toBeVisible();

  // Задача на сегодня через быстрый ввод (синтаксис «сегодня»).
  await page.goto("/#/work/tasks");
  await page.getByLabel("Быстрое добавление задачи").fill("Смок-задача сегодня");
  await page.getByLabel("Быстрое добавление задачи").press("Enter");
  await expect(page.locator(".task-card", { hasText: "Смок-задача" }).first()).toBeVisible();

  // Мастер планирования: оценка без blur → Esc → оценка сохранена.
  await page.goto("/#/planner/today");
  await page.locator('button[data-action="start-plan"]').first().click();
  await page.locator('button[data-action="wizard-next"]').click();
  const estimate = page.locator("[data-plan-estimate]").first();
  await estimate.fill("45");
  await page.keyboard.press("Escape");
  await expect(page.locator("[data-modal]")).toHaveCount(0);
  await page.locator('button[data-action="start-plan"]').first().click();
  await page.locator('button[data-action="wizard-next"]').click();
  await expect(page.locator("[data-plan-estimate]").first()).toHaveValue("45");
  await page.keyboard.press("Escape");

  // Бюджет дня виден в метриках.
  await expect(page.locator(".metric-bar")).toContainText("Бюджет дня");

  // Кнопка палитры в топбаре открывает палитру.
  await page.locator("[data-open-palette]").click();
  await expect(page.locator("[data-palette-input]")).toBeVisible();
  await page.keyboard.press("Escape");

  // Создание задачи с новым проектом из модалки: набранный текст не теряется.
  await page.goto("/#/work/tasks");
  await page.locator('button[data-action="open-create"]').click();
  await page.locator('form[data-form="task"] input[name="title"]').fill("Задача с проектом на лету");
  await page.locator('[data-quick-create="project"] [data-quick-create-toggle]').click();
  await page.locator('[data-quick-create="project"] [data-quick-create-name]').fill("Смок-проект");
  await page.locator('[data-quick-create="project"] [data-quick-create-submit]').click();
  // Store emit → re-render приходит асинхронно; ждём, пока селект укажет на новый проект.
  await expect
    .poll(() =>
      page
        .locator('form[data-form="task"] select[name="projectId"]')
        .evaluate((el) => (el as HTMLSelectElement).selectedOptions[0]?.textContent ?? ""),
    )
    .toContain("Смок-проект");
  await expect(page.locator('form[data-form="task"] input[name="title"]')).toHaveValue("Задача с проектом на лету");
  await page.locator('form[data-form="task"] button[type="submit"]').click();
  await expect(page.locator(".task-card", { hasText: "Задача с проектом на лету" }).first()).toBeVisible();

  // Привычки: создать шаблон-привычку, отметить прошлую ячейку сетки.
  await page.goto("/#/planner/habits");
  const form = page.locator("[data-template-form]");
  await form.locator('input[name="title"]').fill("Смок-привычка");
  await form.locator('input[name="isHabit"]').check();
  await form.locator('button[type="submit"]').click();
  const pastCell = page.locator("[data-habit-cell]").nth(20);
  await expect(pastCell).toBeVisible();
  await pastCell.click();
  await expect(page.locator("[data-habit-cell]").nth(20)).toHaveClass(/is-done/);

  // Ревью: мастер до шага 3, CTA ведёт в недельный календарь.
  await page.goto("/#/analytics/review");
  await page.locator('button[data-action="start-wizard"]').click();
  await page.locator('button[data-action="wizard-next"]').click();
  await page.locator('button[data-action="wizard-next"]').click();
  await page.locator("[data-action-close-on-follow]").click();
  await expect(page.locator(".week-grid")).toBeVisible();
});
