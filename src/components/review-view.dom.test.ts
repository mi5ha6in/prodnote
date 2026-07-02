// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { shiftDayKey } from "../domain/checklist";
import { weekStartKey } from "../domain/review";
import { appStore } from "../state";
import "./review-view";

function mount(): HTMLElement {
  const element = document.createElement("pn-review-view");
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

describe("review-view (DOM)", () => {
  it("renders the score card, week navigation and a 7-day chart", () => {
    const root = shadow(mount());
    expect(root.querySelector(".score-value")).toBeTruthy();
    expect(root.querySelectorAll("[data-week-shift]")).toHaveLength(2);
    expect(root.querySelectorAll(".week-col")).toHaveLength(7);
  });

  it("reflects a completed checklist item in the score", async () => {
    const today = new Date().toISOString().slice(0, 10);
    const item = await appStore.addChecklistItem({ title: "Ревью-пункт", day: today });
    await appStore.toggleChecklistItem(item!.id);

    const root = shadow(mount());
    const score = Number(root.querySelector(".score-value")?.firstChild?.textContent ?? "0");
    expect(score).toBeGreaterThan(0);
  });

  it("walks the guided review wizard: inbox step lists unsorted tasks, overdue step reschedules", async () => {
    const overdue = await appStore.addTask({ title: "Просроченная в мастере", dueDate: "2020-01-01" });
    await appStore.addTask({ title: "Входящая в мастере" });

    const element = mount();
    const root = shadow(element);

    root.querySelector<HTMLButtonElement>('[data-action="start-wizard"]')?.click();
    expect(shadow(element).textContent).toContain("Шаг 1 из 3");
    expect(shadow(element).textContent).toContain("Входящая в мастере");

    shadow(element).querySelector<HTMLButtonElement>('[data-action="wizard-next"]')?.click();
    expect(shadow(element).textContent).toContain("Шаг 2 из 3");
    expect(shadow(element).textContent).toContain("Просроченная в мастере");

    shadow(element).querySelector<HTMLButtonElement>(`[data-wizard-postpone="${overdue.id}"]`)?.click();
    await Promise.resolve();
    const updated = appStore.getWorkspace().tasks.find((task) => task.id === overdue.id);
    expect(updated?.dueDate && updated.dueDate > new Date().toISOString().slice(0, 10)).toBe(true);

    shadow(element).querySelector<HTMLButtonElement>('[data-action="wizard-next"]')?.click();
    expect(shadow(element).textContent).toContain("Шаг 3 из 3");

    // Итоговый CTA ведёт в неделю календаря, начинающуюся со следующего понедельника.
    const nextWeek = shiftDayKey(weekStartKey(new Date(), appStore.getWorkspace().settings.weekStartsOn), 7);
    const cta = shadow(element).querySelector<HTMLAnchorElement>("[data-action-close-on-follow]");
    expect(cta?.getAttribute("href")).toBe(`#/planner/calendar/${nextWeek}`);

    shadow(element).querySelector<HTMLButtonElement>('[data-action="close-wizard"]')?.click();
    expect(shadow(element).querySelector("[data-modal]")).toBeFalsy();
  });
});
