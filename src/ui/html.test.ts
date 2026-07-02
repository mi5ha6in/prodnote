import { describe, expect, it } from "vitest";
import { badgeHtml, barHtml, barRowHtml, buttonAttrs, emptyStateHtml, fieldHtml } from "./html";

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

  it("clamps bar percent to 0–100 and escapes the title", () => {
    expect(barHtml(146)).toBe('<div class="bar"><span style="width: 100%"></span></div>');
    expect(barHtml(-5)).toContain("width: 0%");
    expect(barHtml(33.4, { tone: "muted" })).toBe('<div class="bar muted"><span style="width: 33%"></span></div>');
    expect(barHtml(50, { vertical: true, title: '<b>"t"</b>' })).toBe(
      '<div class="bar vertical" title="&lt;b&gt;&quot;t&quot;&lt;/b&gt;"><span style="height: 50%"></span></div>',
    );
  });

  it("renders a labeled bar row with escaped label and value", () => {
    const html = barRowHtml({ label: "<Проект>", value: "1 ч 30 м", percent: 75 });
    expect(html).toContain("&lt;Проект&gt;");
    expect(html).toContain("1 ч 30 м");
    expect(html).toContain('style="width: 75%"');
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
