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

  const flushList = () => {
    if (listItems.length > 0) {
      blocks.push(`<ul>${listItems.join("")}</ul>`);
      listItems = [];
    }
  };

  for (const rawLine of lines) {
    const line = rawLine.trim();

    if (!line) {
      flushList();
      continue;
    }

    if (line.startsWith("- ")) {
      listItems.push(`<li>${renderInline(line.slice(2))}</li>`);
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

  flushList();
  return blocks.join("");
}
