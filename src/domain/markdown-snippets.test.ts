import { describe, expect, it } from "vitest";
import { applyMarkdownSnippetToText, MARKDOWN_SNIPPETS } from "./markdown-snippets";

function snippet(id: string) {
  const found = MARKDOWN_SNIPPETS.find((item) => item.id === id);
  if (!found) {
    throw new Error(`Snippet not found: ${id}`);
  }
  return found;
}

describe("markdown snippets", () => {
  it("wraps selected text and keeps selection inside markers", () => {
    const result = applyMarkdownSnippetToText("важный тезис", 0, 6, snippet("bold"));

    expect(result.value).toBe("**важный** тезис");
    expect(result.selectionStart).toBe(2);
    expect(result.selectionEnd).toBe(8);
  });

  it("inserts placeholder when nothing is selected", () => {
    const result = applyMarkdownSnippetToText("", 0, 0, snippet("link"));

    expect(result.value).toBe("[текст ссылки](https://)");
    expect(result.selectionStart).toBe(1);
    expect(result.selectionEnd).toBe("текст ссылки".length + 1);
  });

  it("prefixes every selected line for block snippets", () => {
    const result = applyMarkdownSnippetToText("первый\nвторой", 0, "первый\nвторой".length, snippet("list"));

    expect(result.value).toBe("- первый\n- второй");
    expect(result.selectionStart).toBe(0);
    expect(result.selectionEnd).toBe("- первый\n- второй".length);
  });
});
