// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { appStore } from "../state";
import "./command-palette";

function mount(): HTMLElement {
  const element = document.createElement("pn-command-palette");
  document.body.appendChild(element);
  return element;
}

function shadow(element: HTMLElement): ShadowRoot {
  if (!element.shadowRoot) {
    throw new Error("shadow root not attached");
  }
  return element.shadowRoot;
}

function openWith(element: HTMLElement, query: string): ShadowRoot {
  document.dispatchEvent(new KeyboardEvent("keydown", { key: "k", ctrlKey: true }));
  const root = shadow(element);
  const input = root.querySelector<HTMLInputElement>("[data-palette-input]");
  if (!input) {
    throw new Error("palette input missing");
  }
  input.value = query;
  input.dispatchEvent(new Event("input"));
  return shadow(element);
}

afterEach(() => {
  document.body.innerHTML = "";
  document.body.classList.remove("pn-modal-open");
});

describe("command-palette (DOM)", () => {
  it("offers query-driven create actions", () => {
    const element = mount();
    const root = openWith(element, "Купить молоко");
    const labels = [...root.querySelectorAll(".palette-label")].map((node) => node.textContent ?? "");
    expect(labels.some((label) => label.includes("Создать задачу: «Купить молоко»"))).toBe(true);
    expect(labels.some((label) => label.includes("Создать пункт дня"))).toBe(true);
  });

  it("creates a task from the typed query", async () => {
    const element = mount();
    const root = openWith(element, "Позвонить врачу");
    const createButton = [...root.querySelectorAll<HTMLButtonElement>(".palette-item")].find((button) =>
      button.textContent?.includes("Создать задачу"),
    );
    expect(createButton).toBeTruthy();
    createButton?.click();
    await Promise.resolve();

    expect(appStore.getWorkspace().tasks.some((task) => task.title === "Позвонить врачу")).toBe(true);
  });

  it("deep-links a search hit to the task detail route", async () => {
    const task = await appStore.addTask({ title: "Уникальная-палитра-задача" });
    const element = mount();
    const root = openWith(element, "Уникальная-палитра-задача");

    const hit = [...root.querySelectorAll<HTMLButtonElement>(".palette-item")].find(
      (button) => button.textContent?.includes("Уникальная-палитра-задача") && button.textContent?.includes("Задача"),
    );
    expect(hit).toBeTruthy();
    hit?.click();

    expect(window.location.hash).toBe(`#/work/tasks/${task.id}`);
  });
});
