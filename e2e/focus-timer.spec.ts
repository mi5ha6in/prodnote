import { expect, test } from "@playwright/test";

// Регрессия: «запускаю таймер/помодоро, а он не идёт».
// Таймер должен тикать посекундно с первой минуты, помодоро — считать вниз.
test("focus timer and pomodoro tick after start", async ({ page }) => {
  // «Отменить без записи» защищена confirm-диалогом — принимаем его.
  page.on("dialog", (dialog) => void dialog.accept());
  await page.goto("/");
  await expect(page.locator("h1").first()).toBeVisible();

  // Задача на сегодня через быстрый ввод.
  await page.goto("/#/work/tasks");
  await page.getByLabel("Быстрое добавление задачи").fill("Фокус-задача сегодня");
  await page.getByLabel("Быстрое добавление задачи").press("Enter");
  await expect(page.locator(".task-card", { hasText: "Фокус-задача" }).first()).toBeVisible();

  // Обычный таймер: readout меняется в течение пары секунд.
  await page.goto("/#/work/focus");
  const readout = page.locator("[data-focus-readout]");
  await expect(readout).toHaveText("00:00");
  await page.locator('button[name="mode"][value="timer"]').click();
  const timerStart = (await readout.textContent()) ?? "";
  await expect.poll(async () => readout.textContent(), { timeout: 5000 }).not.toBe(timerStart);

  // Пауза замораживает readout (кнопки есть и в мини-таймере — берём основную область).
  const main = page.getByRole("main");
  await main.locator('button[data-action="toggle-pause"]').click();
  const paused = (await readout.textContent()) ?? "";
  await page.waitForTimeout(2000);
  await expect(readout).toHaveText(paused);

  // Отмена → помодоро: считает вниз от фокусной фазы.
  await main.locator('button[data-action="cancel"]').click();
  await page.locator('button[name="mode"][value="pomodoro"]').click();
  const pomodoroStart = (await readout.textContent()) ?? "";
  expect(pomodoroStart).toMatch(/^\d{2}:\d{2}$/);
  await expect.poll(async () => readout.textContent(), { timeout: 5000 }).not.toBe(pomodoroStart);

  // На других вкладках активная сессия видна в топбаре и ведёт обратно в фокус.
  await page.goto("/#/work/tasks");
  const indicator = page.locator("[data-focus-link]");
  await expect(indicator).toHaveClass(/is-active/);
  await expect(indicator).toHaveText(/Фокус · \d{2}:\d{2}/);
  await indicator.click();
  await expect(page.locator("[data-focus-readout]")).toBeVisible();

  // Без сессии индикатор возвращается к «Начать фокус».
  await main.locator('button[data-action="cancel"]').click();
  await page.goto("/#/work/tasks");
  await expect(page.locator("[data-focus-link]")).not.toHaveClass(/is-active/);
  await expect(page.locator("[data-focus-link]")).toHaveText(/Начать фокус/);
});
