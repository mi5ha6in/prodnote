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
});
