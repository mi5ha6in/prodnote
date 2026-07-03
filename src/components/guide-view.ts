import guideMarkdown from "../../docs/USER_GUIDE.md?raw";
import { renderMarkdown } from "../domain/markdown";
import { viewHeaderHtml } from "../ui/html";
import { renderShadow } from "./shadow";

// H1-заголовок из файла дублирует шапку раздела — убираем первую строку.
const guideBody = guideMarkdown.replace(/^#\s+.*\r?\n/, "");

export class GuideView extends HTMLElement {
  connectedCallback(): void {
    renderShadow(
      this,
      `
        <div class="view-grid">
          ${viewHeaderHtml({ eyebrow: "Справка", title: "Руководство пользователя" })}
          <article class="card">
            <div class="markdown-preview guide-body">${renderMarkdown(guideBody)}</div>
          </article>
        </div>
      `,
      `
        .guide-body {
          max-width: 46rem;
        }

        .guide-body h2 {
          margin-top: var(--space-5);
        }

        .guide-body h2:first-child {
          margin-top: 0;
        }
      `,
    );
  }
}

customElements.define("pn-guide-view", GuideView);
