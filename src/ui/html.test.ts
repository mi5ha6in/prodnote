import { describe, expect, it } from "vitest";
import { badgeHtml, buttonAttrs, emptyStateHtml, fieldHtml } from "./html";

describe("ui html helpers", () => {
  it("renders button attributes with tone, size and kebab-case data attributes", () => {
    expect(
      buttonAttrs({
        tone: "danger",
        size: "small",
        type: "submit",
        disabled: true,
        data: { deleteProject: 'project_"unsafe"', ignored: false },
      }),
    ).toBe(
      'type="submit" class="danger small" disabled data-delete-project="project_&quot;unsafe&quot;"',
    );
  });

  it("escapes user content in badges and empty states", () => {
    expect(badgeHtml("<script>", { color: 'red" onmouseover="bad' })).toContain("&lt;script&gt;");
    expect(badgeHtml("<script>", { color: 'red" onmouseover="bad' })).not.toContain("<script>");
    expect(emptyStateHtml("<strong>empty</strong>")).toBe(
      '<div class="empty">&lt;strong&gt;empty&lt;/strong&gt;</div>',
    );
  });

  it("keeps form controls as markup while escaping the field label", () => {
    const html = fieldHtml({
      label: "Имя <проекта>",
      control: '<input name="name" />',
      className: "wide-field",
    });

    expect(html).toContain('class="wide-field"');
    expect(html).toContain("Имя &lt;проекта&gt;");
    expect(html).toContain('<input name="name" />');
  });
});
