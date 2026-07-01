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

  it("renders fenced code blocks with escaped, non-processed content", () => {
    const html = renderMarkdown("```\n<b>1 < 2</b> **not bold**\n```");
    expect(html).toContain("<pre><code>");
    expect(html).toContain("&lt;b&gt;1 &lt; 2&lt;/b&gt; **not bold**");
    expect(html).not.toContain("<strong>");
  });

  it("renders task checkboxes for - [ ] and - [x]", () => {
    const html = renderMarkdown("- [ ] open\n- [x] done");
    expect(html).toContain('<li class="task-item"><input type="checkbox" disabled /> open</li>');
    expect(html).toContain('<input type="checkbox" disabled checked /> done');
  });

  it("renders ordered lists", () => {
    expect(renderMarkdown("1. first\n2. second")).toContain("<ol><li>first</li><li>second</li></ol>");
  });

  it("renders pipe tables with a header separator", () => {
    const html = renderMarkdown("| A | B |\n| --- | --- |\n| 1 | 2 |");
    expect(html).toContain("<table>");
    expect(html).toContain("<th>A</th>");
    expect(html).toContain("<td>1</td>");
    expect(html).toContain("<td>2</td>");
  });
});
