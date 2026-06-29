import { describe, expect, it } from "vitest";
import { createProject, createTag, createTask } from "../domain/defaults";
import {
  getProjectName,
  getTaskName,
  renderProjectOptions,
  renderTagPills,
  renderTaskOptions,
} from "./view-utils";

describe("view utils", () => {
  it("resolves linked entity labels and fallbacks", () => {
    const project = { ...createProject({ name: "Работа" }), id: "project_1" };
    const task = { ...createTask({ title: "Сделать обзор" }), id: "task_1" };

    expect(getProjectName([project], project.id)).toBe("Работа");
    expect(getProjectName([project], null)).toBe("Без проекта");
    expect(getTaskName([task], task.id)).toBe("Сделать обзор");
    expect(getTaskName([task], "missing")).toBe("Удалённая задача");
  });

  it("renders escaped select options and selected state", () => {
    const project = { ...createProject({ name: '<Работа "важная">' }), id: "project_1" };
    const task = { ...createTask({ title: "<Проверить>" }), id: "task_1" };

    expect(renderProjectOptions([project], project.id)).toContain(
      '<option value="project_1" selected>&lt;Работа &quot;важная&quot;&gt;</option>',
    );
    expect(renderTaskOptions([task], task.id)).toContain(
      '<option value="task_1" selected>&lt;Проверить&gt;</option>',
    );
  });

  it("renders only known tags", () => {
    const tag = { ...createTag({ name: "Фокус", color: "#2f7d5c" }), id: "tag_1" };
    const html = renderTagPills([tag], [tag.id, "missing"]);

    expect(html).toContain("Фокус");
    expect(html).toContain("#2f7d5c");
    expect(html).not.toContain("missing");
  });
});
