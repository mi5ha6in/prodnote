const ALLOWED_LINK_PROTOCOLS = new Set(["http:", "https:", "mailto:"]);

export function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function sanitizeUrl(url: string): string {
  try {
    const baseUrl = typeof window === "undefined" ? "https://prodnote.local" : window.location.origin;
    const parsed = new URL(url, baseUrl);
    return ALLOWED_LINK_PROTOCOLS.has(parsed.protocol) ? parsed.href : "#";
  } catch {
    return "#";
  }
}

function renderInline(value: string): string {
  return escapeHtml(value)
    .replace(/`([^`]+)`/g, "<code>$1</code>")
    .replace(
      /\[\[([^\]]+)\]\]/g,
      (_match, title: string) => `<a class="wikilink" data-wikilink="${title.trim()}">${title.trim()}</a>`,
    )
    .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
    .replace(/\*([^*]+)\*/g, "<em>$1</em>")
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, (_match, label: string, url: string) => {
      const href = sanitizeUrl(url);
      return `<a href="${escapeHtml(href)}" target="_blank" rel="noreferrer">${label}</a>`;
    });
}

export function renderMarkdown(markdown: string): string {
  const lines = markdown.trim().split(/\r?\n/);
  const blocks: string[] = [];
  let listItems: string[] = [];
  let listType: "ul" | "ol" | null = null;
  let codeLines: string[] | null = null;
  let tableRows: string[] | null = null;

  const flushList = () => {
    if (listItems.length && listType) {
      blocks.push(`<${listType}>${listItems.join("")}</${listType}>`);
    }
    listItems = [];
    listType = null;
  };

  const startList = (type: "ul" | "ol") => {
    if (listType !== type) {
      flushList();
      listType = type;
    }
  };

  const flushTable = () => {
    const rows = tableRows;
    tableRows = null;
    if (!rows || !rows.length) {
      return;
    }

    const cells = (line: string) => line.replace(/^\|/, "").replace(/\|$/, "").split("|").map((cell) => cell.trim());

    // A real table needs a header row followed by a `---` separator row.
    if (rows.length >= 2 && /^[\s|:-]+$/.test(rows[1]) && rows[1].includes("-")) {
      const header = cells(rows[0]).map((cell) => `<th>${renderInline(cell)}</th>`).join("");
      const body = rows
        .slice(2)
        .map((row) => `<tr>${cells(row).map((cell) => `<td>${renderInline(cell)}</td>`).join("")}</tr>`)
        .join("");
      blocks.push(`<table><thead><tr>${header}</tr></thead>${body ? `<tbody>${body}</tbody>` : ""}</table>`);
    } else {
      for (const row of rows) {
        blocks.push(`<p>${renderInline(row.trim())}</p>`);
      }
    }
  };

  for (const rawLine of lines) {
    if (rawLine.trim().startsWith("```")) {
      if (codeLines === null) {
        flushList();
        flushTable();
        codeLines = [];
      } else {
        blocks.push(`<pre><code>${escapeHtml(codeLines.join("\n"))}</code></pre>`);
        codeLines = null;
      }
      continue;
    }
    if (codeLines !== null) {
      codeLines.push(rawLine);
      continue;
    }

    const line = rawLine.trim();

    if (line.length > 1 && line.startsWith("|") && line.endsWith("|")) {
      flushList();
      (tableRows ??= []).push(line);
      continue;
    }
    flushTable();

    if (!line) {
      flushList();
      continue;
    }

    const taskMatch = line.match(/^- \[([ xX])\]\s+(.*)$/);
    if (taskMatch) {
      startList("ul");
      const checked = taskMatch[1].toLowerCase() === "x" ? " checked" : "";
      listItems.push(`<li class="task-item"><input type="checkbox" disabled${checked} /> ${renderInline(taskMatch[2])}</li>`);
      continue;
    }

    if (line.startsWith("- ")) {
      startList("ul");
      listItems.push(`<li>${renderInline(line.slice(2))}</li>`);
      continue;
    }

    const orderedMatch = line.match(/^\d+\.\s+(.*)$/);
    if (orderedMatch) {
      startList("ol");
      listItems.push(`<li>${renderInline(orderedMatch[1])}</li>`);
      continue;
    }

    flushList();

    if (line.startsWith("### ")) {
      blocks.push(`<h3>${renderInline(line.slice(4))}</h3>`);
    } else if (line.startsWith("## ")) {
      blocks.push(`<h2>${renderInline(line.slice(3))}</h2>`);
    } else if (line.startsWith("# ")) {
      blocks.push(`<h1>${renderInline(line.slice(2))}</h1>`);
    } else if (line.startsWith("> ")) {
      blocks.push(`<blockquote>${renderInline(line.slice(2))}</blockquote>`);
    } else {
      blocks.push(`<p>${renderInline(line)}</p>`);
    }
  }

  if (codeLines !== null) {
    blocks.push(`<pre><code>${escapeHtml(codeLines.join("\n"))}</code></pre>`);
  }
  flushTable();
  flushList();
  return blocks.join("");
}
