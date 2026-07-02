// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { dayKey } from "../domain/calendar";
import { appStore } from "../state";
import "./today-view";

function mount(): HTMLElement {
  const element = document.createElement("pn-today-view");
  document.body.appendChild(element);
  return element;
}

function shadow(element: HTMLElement): ShadowRoot {
  if (!element.shadowRoot) {
    throw new Error("shadow root not attached");
  }
  return element.shadowRoot;
}

afterEach(() => {
  document.body.innerHTML = "";
});

describe("today-view (DOM)", () => {
  it("renders the add form, day navigation and history", () => {
    const root = shadow(mount());
    expect(root.querySelector("[data-add-form]")).toBeTruthy();
    expect(root.querySelectorAll("[data-day-shift]")).toHaveLength(2);
    expect(root.querySelector(".history-grid")).toBeTruthy();
  });

  it("shows a checklist item for today and strikes it through when done", async () => {
    const element = mount();
    const today = dayKey(new Date());

    const item = await appStore.addChecklistItem({ title: "DOM пункт дня", day: today });
    expect(shadow(element).textContent).toContain("DOM пункт дня");

    await appStore.toggleChecklistItem(item!.id);
    expect(shadow(element).querySelector(".check-item.is-done")).toBeTruthy();
  });

  it("walks the day-planning wizard: overdue triage, task picking, budget", async () => {
    const overdue = await appStore.addTask({ title: "Хвост-планирования", dueDate: "2020-01-01" });
    const candidate = await appStore.addTask({ title: "Кандидат-планирования" });

    const element = mount();
    shadow(element).querySelector<HTMLButtonElement>('[data-action="start-plan"]')?.click();
    expect(shadow(element).textContent).toContain("Шаг 1 из 3");
    expect(shadow(element).textContent).toContain("Хвост-планирования");

    // забираем хвост в день — дедлайн переезжает на выбранный день
    shadow(element).querySelector<HTMLButtonElement>(`[data-plan-take="${overdue.id}"]`)?.click();
    await Promise.resolve();
    expect(appStore.getWorkspace().tasks.find((t) => t.id === overdue.id)?.dueDate).toBe(dayKey(new Date()));

    shadow(element).querySelector<HTMLButtonElement>('[data-action="wizard-next"]')?.click();
    expect(shadow(element).textContent).toContain("Шаг 2 из 3");

    const pick = shadow(element).querySelector<HTMLInputElement>(`[data-plan-pick="${candidate.id}"]`);
    expect(pick).toBeTruthy();
    pick!.checked = true;
    pick!.dispatchEvent(new Event("change"));
    await Promise.resolve();
    expect(appStore.getWorkspace().tasks.find((t) => t.id === candidate.id)?.plannedAt).toContain(dayKey(new Date()));

    shadow(element).querySelector<HTMLButtonElement>('[data-action="wizard-next"]')?.click();
    expect(shadow(element).textContent).toContain("Шаг 3 из 3");
    expect(shadow(element).textContent).toContain("Ёмкость дня");

    shadow(element).querySelector<HTMLButtonElement>('[data-action="close-wizard"]')?.click();
    expect(shadow(element).querySelector("[data-modal]")).toBeFalsy();
  });

  it("opens a specific day from the entity-id deep link", () => {
    const element = document.createElement("pn-today-view");
    element.setAttribute("entity-id", "2026-03-05");
    document.body.appendChild(element);

    const input = shadow(element).querySelector<HTMLInputElement>(".day-input");
    expect(input?.value).toBe("2026-03-05");
  });

  it("shows the day budget metric only when a daily capacity is set", async () => {
    const settings = appStore.getWorkspace().settings;
    expect(shadow(mount()).textContent).toContain("Бюджет дня");

    await appStore.updateSettings({ ...settings, dailyCapacityMinutes: 0 });
    expect(shadow(mount()).textContent).not.toContain("Бюджет дня");
    await appStore.updateSettings({ ...settings, dailyCapacityMinutes: 480 });
  });

  it("flushes an untyped estimate when the planning wizard closes", async () => {
    const task = await appStore.addTask({ title: "Оценка-без-blur", dueDate: dayKey(new Date()) });

    const element = mount();
    shadow(element).querySelector<HTMLButtonElement>('[data-action="start-plan"]')?.click();
    shadow(element).querySelector<HTMLButtonElement>('[data-action="wizard-next"]')?.click();

    const estimate = shadow(element).querySelector<HTMLInputElement>(`[data-plan-estimate="${task.id}"]`);
    expect(estimate).toBeTruthy();
    // Значение набрано, но change не сработал (нет blur) — закрытие должно его сохранить.
    estimate!.value = "45";
    shadow(element).querySelector<HTMLDialogElement>("[data-modal]")?.dispatchEvent(new Event("cancel"));
    await Promise.resolve();

    expect(appStore.getWorkspace().tasks.find((t) => t.id === task.id)?.estimateMinutes).toBe(45);
    expect(shadow(element).querySelector("[data-modal]")).toBeFalsy();
  });

  it("walks the shutdown wizard and writes the reflection into the day note", async () => {
    const today = dayKey(new Date());
    await appStore.addChecklistItem({ title: "Незакрытый пункт", day: today });

    const element = mount();
    shadow(element).querySelector<HTMLButtonElement>('[data-action="start-shutdown"]')?.click();
    expect(shadow(element).textContent).toContain("Итог дня");

    shadow(element).querySelector<HTMLButtonElement>('[data-action="wizard-next"]')?.click();
    expect(shadow(element).textContent).toContain("Незакрытый пункт");

    shadow(element).querySelector<HTMLButtonElement>('[data-action="wizard-next"]')?.click();
    const textarea = shadow(element).querySelector<HTMLTextAreaElement>("[data-shutdown-reflection]");
    expect(textarea).toBeTruthy();
    textarea!.value = "День прошёл собранно.";
    shadow(element).querySelector<HTMLButtonElement>('[data-action="shutdown-finish"]')?.click();
    await Promise.resolve();
    await Promise.resolve();

    const dayNote = appStore.getWorkspace().notes.find((note) => note.dayKey === today);
    expect(dayNote?.markdown).toContain("День прошёл собранно.");
    expect(shadow(element).querySelector("[data-modal]")).toBeFalsy();
  });
});
