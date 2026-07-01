// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { appStore } from "../state";
import "./task-detail-view";

function mount(entityId: string): HTMLElement {
  const element = document.createElement("pn-task-detail-view");
  element.setAttribute("entity-id", entityId);
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

describe("task-detail-view (DOM)", () => {
  it("shows a not-found message with a back link for an unknown id", () => {
    const root = shadow(mount("missing-task"));
    expect(root.textContent).toContain("не найдена");
    expect(root.querySelector<HTMLAnchorElement>(".back-link")?.getAttribute("href")).toBe("#/work/tasks");
  });

  it("renders the task title, actions and side panels", async () => {
    const task = await appStore.addTask({ title: "Detail Page Task" });
    await appStore.addManualSession({
      taskId: task.id,
      startedAt: "2026-06-05T10:00:00.000Z",
      endedAt: "2026-06-05T10:30:00.000Z",
    });

    const root = shadow(mount(task.id));
    expect(root.textContent).toContain("Detail Page Task");
    expect(root.querySelector('[data-action="edit-task"]')).toBeTruthy();
    expect(root.querySelector('[data-action="delete-task"]')).toBeTruthy();
    expect(root.querySelector("[data-status]")).toBeTruthy();
    expect(root.textContent).toContain("Записано времени");
    expect(root.textContent).toContain("Последние сессии");
  });

  it("switches into edit mode when the edit action is clicked", async () => {
    const task = await appStore.addTask({ title: "Editable Task" });
    const element = mount(task.id);
    shadow(element).querySelector<HTMLButtonElement>('[data-action="edit-task"]')?.click();
    expect(shadow(element).querySelector('form[data-form="edit-task"]')).toBeTruthy();
  });
});
