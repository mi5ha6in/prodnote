import { describe, expect, it } from "vitest";
import { HUBS, hubDefaultHash, resolveRoute } from "./app-router";

describe("resolveRoute", () => {
  it("defaults an empty or bare hash to the planner overview", () => {
    expect(resolveRoute("")).toEqual({ hubId: "planner", tabId: "overview", canonical: "#/planner/overview" });
    expect(resolveRoute("#/")).toMatchObject({ canonical: "#/planner/overview" });
  });

  it("passes canonical hub/tab routes through unchanged", () => {
    expect(resolveRoute("#/work/focus")).toEqual({ hubId: "work", tabId: "focus", canonical: "#/work/focus" });
    expect(resolveRoute("#/analytics/review")).toMatchObject({ hubId: "analytics", tabId: "review" });
  });

  it("normalizes legacy single-segment routes to their hub/tab pair", () => {
    expect(resolveRoute("#/tasks")).toMatchObject({ hubId: "work", tabId: "tasks", canonical: "#/work/tasks" });
    expect(resolveRoute("#/today")).toMatchObject({ canonical: "#/planner/today" });
    expect(resolveRoute("#/calendar")).toMatchObject({ canonical: "#/planner/calendar" });
    expect(resolveRoute("#/review")).toMatchObject({ canonical: "#/analytics/review" });
    expect(resolveRoute("#/dashboard")).toMatchObject({ canonical: "#/planner/overview" });
  });

  it("falls back to a hub's default tab for hub-only or unknown tabs", () => {
    expect(resolveRoute("#/analytics")).toMatchObject({ hubId: "analytics", tabId: "stats" });
    expect(resolveRoute("#/work/bogus")).toMatchObject({ hubId: "work", tabId: "tasks" });
  });

  it("falls back to the default route for unknown hubs", () => {
    expect(resolveRoute("#/nope")).toMatchObject({ canonical: "#/planner/overview" });
  });

  it("builds a hub's default hash from its first tab", () => {
    const work = HUBS.find((hub) => hub.id === "work");
    expect(work && hubDefaultHash(work)).toBe("#/work/tasks");
  });
});
