export type MarkdownSnippet = {
  id: string;
  label: string;
  hint: string;
  mode: "wrap" | "line";
  before: string;
  after?: string;
  placeholder: string;
};

export type MarkdownSnippetResult = {
  value: string;
  selectionStart: number;
  selectionEnd: number;
};

export const MARKDOWN_SNIPPETS: MarkdownSnippet[] = [
  {
    id: "bold",
    label: "Жирный",
    hint: "**важно**",
    mode: "wrap",
    before: "**",
    after: "**",
    placeholder: "важно",
  },
  {
    id: "italic",
    label: "Курсив",
    hint: "*мысль*",
    mode: "wrap",
    before: "*",
    after: "*",
    placeholder: "мысль",
  },
  {
    id: "code",
    label: "Код",
    hint: "`term`",
    mode: "wrap",
    before: "`",
    after: "`",
    placeholder: "term",
  },
  {
    id: "link",
    label: "Ссылка",
    hint: "[текст](https://)",
    mode: "wrap",
    before: "[",
    after: "](https://)",
    placeholder: "текст ссылки",
  },
  {
    id: "h2",
    label: "Заголовок",
    hint: "## Раздел",
    mode: "line",
    before: "## ",
    placeholder: "Раздел",
  },
  {
    id: "list",
    label: "Список",
    hint: "- пункт",
    mode: "line",
    before: "- ",
    placeholder: "пункт",
  },
  {
    id: "quote",
    label: "Цитата",
    hint: "> вывод",
    mode: "line",
    before: "> ",
    placeholder: "вывод",
  },
  {
    id: "task",
    label: "Чекбокс",
    hint: "- [ ] дело",
    mode: "line",
    before: "- [ ] ",
    placeholder: "дело",
  },
  {
    id: "ordered",
    label: "Нумерация",
    hint: "1. пункт",
    mode: "line",
    before: "1. ",
    placeholder: "пункт",
  },
  {
    id: "codeblock",
    label: "Блок кода",
    hint: "```",
    mode: "wrap",
    before: "```\n",
    after: "\n```",
    placeholder: "код",
  },
  {
    id: "table",
    label: "Таблица",
    hint: "| A | B |",
    mode: "wrap",
    before: "| Колонка | Колонка |\n| --- | --- |\n| ",
    after: " |  |",
    placeholder: "значение",
  },
];

export function applyMarkdownSnippetToText(
  value: string,
  selectionStart: number,
  selectionEnd: number,
  snippet: MarkdownSnippet,
): MarkdownSnippetResult {
  return snippet.mode === "line"
    ? applyLineSnippet(value, selectionStart, selectionEnd, snippet)
    : applyWrapSnippet(value, selectionStart, selectionEnd, snippet);
}

function applyWrapSnippet(
  value: string,
  selectionStart: number,
  selectionEnd: number,
  snippet: MarkdownSnippet,
): MarkdownSnippetResult {
  const selected = value.slice(selectionStart, selectionEnd) || snippet.placeholder;
  const after = snippet.after ?? "";
  const replacement = `${snippet.before}${selected}${after}`;

  return {
    value: `${value.slice(0, selectionStart)}${replacement}${value.slice(selectionEnd)}`,
    selectionStart: selectionStart + snippet.before.length,
    selectionEnd: selectionStart + snippet.before.length + selected.length,
  };
}

function applyLineSnippet(
  value: string,
  selectionStart: number,
  selectionEnd: number,
  snippet: MarkdownSnippet,
): MarkdownSnippetResult {
  const lineStart = value.lastIndexOf("\n", Math.max(0, selectionStart - 1)) + 1;
  const nextLineBreak = value.indexOf("\n", selectionEnd);
  const lineEnd = nextLineBreak === -1 ? value.length : nextLineBreak;
  const selectedBlock = value.slice(lineStart, lineEnd) || snippet.placeholder;
  const replacement = selectedBlock
    .split("\n")
    .map((line) => (line.startsWith(snippet.before) ? line : `${snippet.before}${line || snippet.placeholder}`))
    .join("\n");

  return {
    value: `${value.slice(0, lineStart)}${replacement}${value.slice(lineEnd)}`,
    selectionStart: lineStart,
    selectionEnd: lineStart + replacement.length,
  };
}
