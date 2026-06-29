import { describe, expect, it } from "vitest";
import { renderMarkdown } from "./markdown";

describe("markdown renderer", () => {
  it("renders basic markdown and escapes html", () => {
    const html = renderMarkdown("# Title\n- **safe**\n<script>alert(1)</script>");

    expect(html).toContain("<h1>Title</h1>");
    expect(html).toContain("<strong>safe</strong>");
    expect(html).toContain("&lt;script&gt;");
    expect(html).not.toContain("<script>");
  });

  it("renders [[wiki-links]] as data-wikilink anchors", () => {
    const html = renderMarkdown("see [[Other Note]] here");
    expect(html).toContain('data-wikilink="Other Note"');
    expect(html).toContain('class="wikilink"');
  });
});
