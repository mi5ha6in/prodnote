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
});
