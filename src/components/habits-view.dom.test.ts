// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { dayKey } from "../domain/calendar";
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
  it("shows an empty state when there are no habits", () => {
    const root = shadow(mount());
    expect(root.querySelector(".empty")).toBeTruthy();
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
  });
});
