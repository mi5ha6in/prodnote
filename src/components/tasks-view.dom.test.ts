// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { appStore } from "../state";
import "./tasks-view";

function mount(): HTMLElement {
  const element = document.createElement("pn-tasks-view");
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
  document.body.classList.remove("pn-modal-open");
});

describe("tasks-view (DOM)", () => {
  it("renders header actions and view toggles", () => {
    const root = shadow(mount());
    expect(root.querySelector('[data-action="open-create"]')).toBeTruthy();
    expect(root.querySelectorAll("[data-mode]")).toHaveLength(2);
  });

  it("shows an added task and its subtask progress", async () => {
    const element = mount();
    const task = await appStore.addTask({ title: "DOM Kanban Task" });
    expect(shadow(element).textContent).toContain("DOM Kanban Task");

    await appStore.addSubtask(task.id, "step one");
    expect(shadow(element).querySelector(".subtask-progress")?.textContent).toContain("0/1");

    await appStore.toggleSubtask(task.id, appStore.getWorkspace().tasks.find((t) => t.id === task.id)!.subtasks[0].id);
    expect(shadow(element).querySelector(".subtask-progress")?.textContent).toContain("1/1");
  });

  it("opens the create modal and locks scroll", () => {
    const element = mount();
    shadow(element).querySelector<HTMLButtonElement>('[data-action="open-create"]')?.click();
    expect(shadow(element).querySelector('form[data-form="task"]')).toBeTruthy();
    expect(document.body.classList.contains("pn-modal-open")).toBe(true);
  });
});
