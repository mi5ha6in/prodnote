// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { dayKey } from "../domain/calendar";
import { shiftDayKey } from "../domain/checklist";
import { appStore } from "../state";
import "./habits-view";

function mount(): HTMLElement {
  const element = document.createElement("pn-habits-view");
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

describe("habits-view (DOM)", () => {
  it("shows the routine management card with a creation form even when empty", () => {
    const root = shadow(mount());
    expect(root.querySelector("[data-template-form]")).toBeTruthy();
    expect(root.textContent).toContain("Привычки и рутины");
  });

  it("creates a template from the form and lists it in the routine section", async () => {
    const element = mount();
    const form = shadow(element).querySelector<HTMLFormElement>("[data-template-form]");
    const title = form?.elements.namedItem("title");
    expect(title).toBeInstanceOf(HTMLInputElement);
    (title as HTMLInputElement).value = "Разбор входящих";
    form!.dispatchEvent(new Event("submit"));
    await Promise.resolve();
    await Promise.resolve();

    const template = appStore.getWorkspace().checklistTemplates.find((entry) => entry.title === "Разбор входящих");
    expect(template).toBeTruthy();
    expect(shadow(element).textContent).toContain("Разбор входящих");

    await appStore.removeChecklistTemplate(template!.id);
  });

  it("renders a habit grid with a completed cell once an item is done", async () => {
    const today = dayKey(new Date());
    const template = await appStore.addChecklistTemplate({ title: "Английский", cadence: "daily", isHabit: true });
    const item = appStore.getWorkspace().checklist.find((entry) => entry.templateId === template!.id && entry.day === today);
    expect(item).toBeTruthy();
    await appStore.toggleChecklistItem(item!.id);

    const root = shadow(mount());
    expect(root.textContent).toContain("Английский");
    expect(root.querySelector(".habit-cell.is-done")).toBeTruthy();

    await appStore.removeChecklistTemplate(template!.id);
  });

  it("retro-marks a past day by clicking its grid cell", async () => {
    const today = dayKey(new Date());
    const pastDay = shiftDayKey(today, -3);
    const template = await appStore.addChecklistTemplate({ title: "Прогулка", cadence: "daily", isHabit: true });

    const element = mount();
    const cell = shadow(element).querySelector<HTMLButtonElement>(
      `[data-habit-cell="${template!.id}"][data-day="${pastDay}"]`,
    );
    expect(cell).toBeTruthy();
    cell!.click();
    await Promise.resolve();
    await Promise.resolve();

    const created = appStore
      .getWorkspace()
      .checklist.find((entry) => entry.templateId === template!.id && entry.day === pastDay);
    expect(created?.done).toBe(true);

    await appStore.removeChecklistTemplate(template!.id);
  });

  it("archives a template from the routine list", async () => {
    const template = await appStore.addChecklistTemplate({ title: "Архивная рутина", cadence: "daily" });

    const element = mount();
    shadow(element).querySelector<HTMLButtonElement>(`[data-template-archive="${template!.id}"]`)?.click();
    await Promise.resolve();
    await Promise.resolve();

    expect(
      appStore.getWorkspace().checklistTemplates.find((entry) => entry.id === template!.id)?.archived,
    ).toBe(true);
    expect(shadow(element).textContent).toContain("в архиве");

    await appStore.removeChecklistTemplate(template!.id);
  });
});
