// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { appStore } from "../state";
import "./calendar-view";

function mount(): HTMLElement {
  const element = document.createElement("pn-calendar-view");
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

describe("calendar-view (DOM)", () => {
  it("renders header actions and the three view toggles", () => {
    const root = shadow(mount());
    expect(root.querySelector('[data-action="open-event"]')).toBeTruthy();
    expect(root.querySelector('[data-action="import-ics"]')).toBeTruthy();
    expect(root.querySelectorAll("[data-view]")).toHaveLength(3);
  });

  it("shows a newly added event in the agenda", async () => {
    const element = mount();
    await appStore.addEvent({
      title: "DOM Test Event",
      startsAt: new Date().toISOString(),
      endsAt: new Date(Date.now() + 3_600_000).toISOString(),
    });
    expect(shadow(element).textContent).toContain("DOM Test Event");
  });

  it("switches between agenda, week and month views", () => {
    const element = mount();
    shadow(element).querySelector<HTMLButtonElement>('[data-view="month"]')?.click();
    expect(shadow(element).querySelector(".month-weeks")).toBeTruthy();

    shadow(element).querySelector<HTMLButtonElement>('[data-view="week"]')?.click();
    expect(shadow(element).querySelector(".week-grid")).toBeTruthy();
  });

  it("opens the event modal and locks background scroll", () => {
    const element = mount();
    shadow(element).querySelector<HTMLButtonElement>('[data-action="open-event"]')?.click();

    expect(shadow(element).querySelector('form[data-form="event"]')).toBeTruthy();
    expect(document.body.classList.contains("pn-modal-open")).toBe(true);

    shadow(element).querySelector<HTMLButtonElement>('[data-action="close-modal"]')?.click();
    expect(shadow(element).querySelector('form[data-form="event"]')).toBeNull();
    expect(document.body.classList.contains("pn-modal-open")).toBe(false);
  });
});
