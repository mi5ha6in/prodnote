// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { appStore } from "../state";
import "./notes-view";

function mount(): HTMLElement {
  const element = document.createElement("pn-notes-view");
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

describe("notes-view (DOM)", () => {
  it("filters the library by the search query", async () => {
    const element = mount();
    await appStore.addNote({ title: "TypeScript narrowing", markdown: "unions" });
    await appStore.addNote({ title: "Cooking pasta", markdown: "recipe" });

    const input = shadow(element).querySelector<HTMLInputElement>("[data-note-search]");
    expect(input).toBeTruthy();
    input!.value = "typescript";
    input!.dispatchEvent(new Event("input"));

    const cards = [...shadow(element).querySelectorAll<HTMLElement>("[data-note-id]")];
    const visible = cards.filter((card) => card.style.display !== "none");
    expect(visible).toHaveLength(1);
    expect(visible[0].textContent).toContain("TypeScript narrowing");
  });

  it("opens the create modal and locks scroll", () => {
    const element = mount();
    shadow(element).querySelector<HTMLButtonElement>('[data-action="open-create"]')?.click();
    expect(shadow(element).querySelector('form[data-form="note"]')).toBeTruthy();
    expect(document.body.classList.contains("pn-modal-open")).toBe(true);
  });
});
