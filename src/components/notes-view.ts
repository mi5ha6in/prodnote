import { escapeHtml, renderMarkdown } from "../domain/markdown";
import { applyMarkdownSnippetToText, MARKDOWN_SNIPPETS, type MarkdownSnippet } from "../domain/markdown-snippets";
import type { Note, Workspace } from "../domain/types";
import { appStore } from "../state";
import { badgeHtml, buttonAttrs, emptyStateHtml, fieldHtml } from "../ui/html";
import { renderShadow } from "./shadow";
import {
  formatDate,
  formatDateTime,
  getProjectName,
  getTaskName,
  renderProjectOptions,
  renderTagPills,
  renderTaskOptions,
  requireInput,
  requireSelect,
  requireTextArea,
} from "./view-utils";

const EMPTY_PREVIEW_HTML = `<p class="muted">Начните писать Markdown или примените сниппет. Preview обновится здесь.</p>`;

export class NotesView extends HTMLElement {
  private unsubscribe: (() => void) | null = null;
  private editorFullscreen = false;
  private openedNoteId: string | null = null;
  private openedNoteMode: "preview" | "edit" = "preview";

  connectedCallback(): void {
    this.unsubscribe = appStore.subscribe(() => this.render());
    this.render();
  }

  disconnectedCallback(): void {
    this.unsubscribe?.();
  }

  private render(): void {
    const workspace = appStore.getWorkspace();
    const root = renderShadow(
      this,
      `
        <section class="view-grid">
          ${this.renderOpenedNotePanel(workspace)}

          <div class="split-grid">
            <form class="card form-grid editor-card ${this.editorFullscreen ? "is-fullscreen" : ""}" data-markdown-editor data-form="note">
              <div class="card-header editor-header">
                <div>
                  <p class="eyebrow">Markdown</p>
                  <h2>Новый конспект</h2>
                </div>
                <button
                  ${buttonAttrs({ tone: "ghost", size: "small", data: { action: "toggle-fullscreen" } })}
                  aria-pressed="${this.editorFullscreen ? "true" : "false"}"
                >
                  ${this.editorFullscreen ? "Свернуть" : "На весь экран"}
                </button>
              </div>

              ${fieldHtml({
                label: "Название",
                control: `<input name="title" required placeholder="Например: итоги исследования" />`,
              })}
              <div class="inline-grid">
                ${fieldHtml({
                  label: "Проект",
                  control: `<select name="projectId">${renderProjectOptions(workspace.projects)}</select>`,
                })}
                ${fieldHtml({
                  label: "Связанная задача",
                  control: `<select name="taskId">
                  <option value="">Без задачи</option>
                  ${renderTaskOptions(workspace.tasks)}
                </select>`,
                })}
              </div>
              <fieldset>
                <legend>Теги</legend>
                ${
                  workspace.tags.length
                    ? workspace.tags
                        .map(
                          (tag) => `
                            <label class="check-row">
                              <input type="checkbox" name="tagIds" value="${escapeHtml(tag.id)}" />
                              <span>${escapeHtml(tag.name)}</span>
                            </label>
                          `,
                        )
                        .join("")
                    : `<p class="muted">Теги можно добавить в настройках.</p>`
                }
              </fieldset>
              <div class="markdown-tools" aria-label="Сниппеты Markdown">
                ${this.renderSnippetButtons()}
              </div>
              <div class="editor-grid">
                ${fieldHtml({
                  label: "Текст",
                  className: "markdown-field",
                  control: `<textarea
                    name="markdown"
                    required
                    data-note-markdown
                    placeholder="# Заголовок&#10;- тезис&#10;- следующий шаг"
                  ></textarea>`,
                })}
                <article class="preview-panel" aria-live="polite">
                  <div class="card-header compact">
                    <div>
                      <p class="eyebrow">Preview</p>
                      <h3>Живой просмотр</h3>
                    </div>
                  </div>
                  <div class="markdown-preview" data-note-preview>${EMPTY_PREVIEW_HTML}</div>
                </article>
              </div>
              <button type="submit">Сохранить заметку</button>
            </form>

            <article class="card syntax-card">
              <div class="card-header">
                <div>
                  <p class="eyebrow">Синтаксис</p>
                  <h2>Шпаргалка Markdown</h2>
                </div>
              </div>
              <p class="muted">Поддерживается безопасный subset: заголовки, списки, цитаты, inline-код, ссылки, жирный и курсив.</p>
              <div class="syntax-list">
                ${MARKDOWN_SNIPPETS.map(
                  (snippet) => `
                    <div class="syntax-item">
                      <strong>${escapeHtml(snippet.label)}</strong>
                      <code>${escapeHtml(snippet.hint)}</code>
                    </div>
                  `,
                ).join("")}
              </div>
            </article>
          </div>

          <article class="card">
            <div class="card-header">
              <div>
                <p class="eyebrow">База знаний</p>
                <h2>Заметки</h2>
              </div>
              ${badgeHtml(workspace.notes.length)}
            </div>
            <div class="notes-grid">
              ${
                workspace.notes.length
                  ? workspace.notes.map((note) => {
                      const linkedTasks = note.linkedTaskIds
                        .map((taskId) => getTaskName(workspace.tasks, taskId))
                        .join(", ");
                      return `
                        <article class="note-card">
                          <div class="meta-row">
                            <span>${escapeHtml(getProjectName(workspace.projects, note.projectId))}</span>
                            <span>${formatDate(note.updatedAt)}</span>
                            <span>${note.editHistory.length} ред.</span>
                          </div>
                          <h3>${escapeHtml(note.title)}</h3>
                          <div class="markdown-preview">${renderMarkdown(note.markdown)}</div>
                          <div class="meta-row">
                            ${linkedTasks ? `<span>задачи: ${escapeHtml(linkedTasks)}</span>` : ""}
                            ${renderTagPills(workspace.tags, note.tagIds)}
                          </div>
                          <button ${buttonAttrs({ tone: "ghost", size: "small", data: { openNote: note.id } })}>Открыть</button>
                        </article>
                      `;
                    }).join("")
                  : emptyStateHtml("Пока нет заметок. Создайте первый Markdown-конспект.")
              }
            </div>
          </article>
        </section>
      `,
      `
        .notes-grid {
          column-count: 2;
          column-gap: 1rem;
        }

        .editor-card {
          transition:
            border-radius 180ms ease,
            box-shadow 180ms ease,
            inset 180ms ease;
        }

        .editor-card.is-fullscreen {
          border-radius: 0;
          display: grid;
          inset: 0;
          max-height: 100vh;
          overflow: auto;
          padding: clamp(1rem, 3vw, 2rem);
          position: fixed;
          z-index: 50;
        }

        .existing-editor {
          border-radius: 0;
          display: grid;
          inset: 0;
          max-height: 100vh;
          overflow: auto;
          padding: clamp(1rem, 3vw, 2rem);
          position: fixed;
          z-index: 60;
        }

        .existing-editor .editor-grid {
          grid-template-columns: minmax(0, 1.15fr) minmax(18rem, 0.85fr);
        }

        .existing-editor textarea {
          min-height: min(58vh, 44rem);
        }

        .editor-card.is-fullscreen .editor-grid {
          grid-template-columns: minmax(0, 1.15fr) minmax(18rem, 0.85fr);
        }

        .editor-card.is-fullscreen textarea {
          min-height: min(58vh, 44rem);
        }

        .editor-header {
          margin-bottom: 0;
        }

        .editor-grid {
          display: grid;
          gap: 0.85rem;
          grid-template-columns: minmax(0, 1fr);
          min-width: 0;
        }

        .markdown-field textarea {
          font-family:
            "SFMono-Regular",
            "Consolas",
            "Liberation Mono",
            monospace;
          min-height: 17rem;
        }

        .markdown-tools {
          display: flex;
          flex-wrap: wrap;
          gap: 0.45rem;
        }

        .snippet-button {
          background: rgba(42, 157, 143, 0.12);
          color: var(--ink);
        }

        .preview-panel {
          background: var(--surface);
          border: 1px solid var(--line);
          border-radius: 0.78rem;
          min-width: 0;
          padding: 0.85rem;
        }

        .preview-panel .compact {
          margin-bottom: 0.6rem;
        }

        .syntax-card {
          display: grid;
          gap: 0.85rem;
        }

        .syntax-list {
          display: grid;
          gap: 0.55rem;
        }

        .syntax-item {
          align-items: center;
          background: var(--surface);
          border: 1px solid var(--line);
          border-radius: 0.7rem;
          display: flex;
          gap: 0.75rem;
          justify-content: space-between;
          min-width: 0;
          padding: 0.65rem 0.75rem;
        }

        .syntax-item code {
          color: var(--accent-strong);
          overflow-wrap: anywhere;
          text-align: right;
        }

        .edit-history {
          display: grid;
          gap: 0.55rem;
        }

        .edit-history-row {
          align-items: center;
          background: var(--surface);
          border: 1px solid var(--line);
          border-radius: 0.7rem;
          display: flex;
          gap: 0.75rem;
          justify-content: space-between;
          padding: 0.65rem 0.75rem;
        }

        .edit-history-row span {
          color: var(--muted);
        }

        .note-card {
          background: var(--paper);
          border: 1px solid var(--line);
          border-radius: 0.9rem;
          break-inside: avoid;
          box-shadow: var(--shadow);
          display: inline-grid;
          gap: 0.7rem;
          margin: 0 0 1rem;
          padding: 1rem;
          width: 100%;
        }

        fieldset {
          border: 1px solid var(--line);
          border-radius: 0.72rem;
          display: flex;
          flex-wrap: wrap;
          gap: 0.5rem;
          margin: 0;
          padding: 0.75rem;
        }

        legend {
          color: var(--muted);
          font-size: 0.84rem;
          font-weight: 900;
          padding: 0 0.35rem;
        }

        .check-row {
          align-items: center;
          background: var(--surface);
          border-radius: 999px;
          display: flex;
          gap: 0.4rem;
          padding: 0.35rem 0.55rem;
        }

        .check-row input {
          width: auto;
        }

        @media (max-width: 820px) {
          .notes-grid {
            column-count: 1;
          }

          .editor-card.is-fullscreen .editor-grid {
            grid-template-columns: 1fr;
          }

          .existing-editor .editor-grid {
            grid-template-columns: 1fr;
          }
        }
      `,
    );

    this.bindEditorActions(root);

    root.querySelector<HTMLFormElement>('[data-form="note"]')?.addEventListener("submit", (event) => {
      event.preventDefault();
      const form = event.currentTarget;
      if (!(form instanceof HTMLFormElement)) {
        return;
      }

      const taskId = requireSelect(form, "taskId").value;
      const tagIds = [...form.querySelectorAll<HTMLInputElement>('input[name="tagIds"]:checked')].map(
        (input) => input.value,
      );

      void appStore.addNote({
        title: requireInput(form, "title").value,
        markdown: requireTextArea(form, "markdown").value,
        projectId: requireSelect(form, "projectId").value || null,
        linkedTaskIds: taskId ? [taskId] : [],
        tagIds,
      });
      this.editorFullscreen = false;
      form.reset();
      this.updateNotePreview(form);
    });

    root.querySelector<HTMLFormElement>('[data-form="edit-note"]')?.addEventListener("submit", (event) => {
      event.preventDefault();
      const form = event.currentTarget;
      if (!(form instanceof HTMLFormElement) || !this.openedNoteId || this.openedNoteMode !== "edit") {
        return;
      }

      const taskId = requireSelect(form, "taskId").value;
      const tagIds = [...form.querySelectorAll<HTMLInputElement>('input[name="tagIds"]:checked')].map(
        (input) => input.value,
      );
      const noteId = this.openedNoteId;
      void appStore
        .updateNote({
          noteId,
          title: requireInput(form, "title").value,
          markdown: requireTextArea(form, "markdown").value,
          projectId: requireSelect(form, "projectId").value || null,
          linkedTaskIds: taskId ? [taskId] : [],
          tagIds,
        })
        .then(() => {
          this.openedNoteId = noteId;
          this.openedNoteMode = "preview";
          this.render();
        });
    });

    root.querySelectorAll<HTMLButtonElement>("[data-open-note]").forEach((button) => {
      button.addEventListener("click", () => {
        const noteId = button.dataset.openNote;
        if (!noteId) {
          return;
        }

        this.openedNoteId = noteId;
        this.openedNoteMode = "preview";
        this.render();
      });
    });

    root.querySelector<HTMLButtonElement>('[data-action="edit-open-note"]')?.addEventListener("click", () => {
      if (!this.openedNoteId) {
        return;
      }

      this.openedNoteMode = "edit";
      this.render();
    });

    root.querySelector<HTMLButtonElement>('[data-action="cancel-note-edit"]')?.addEventListener("click", () => {
      this.openedNoteMode = "preview";
      this.render();
    });

    root.querySelector<HTMLButtonElement>('[data-action="close-open-note"]')?.addEventListener("click", () => {
      this.openedNoteId = null;
      this.openedNoteMode = "preview";
      this.render();
    });
  }

  private renderOpenedNotePanel(workspace: Workspace): string {
    if (!this.openedNoteId) {
      return "";
    }

    const note = workspace.notes.find((item) => item.id === this.openedNoteId);
    if (!note) {
      return "";
    }

    if (this.openedNoteMode === "preview") {
      return this.renderOpenedNotePreview(workspace, note);
    }

    return this.renderOpenedNoteEditor(workspace, note);
  }

  private renderOpenedNotePreview(workspace: Workspace, note: Note): string {
    const linkedTasks = note.linkedTaskIds.map((taskId) => getTaskName(workspace.tasks, taskId)).join(", ");

    return `
      <article class="card existing-editor note-reader" data-open-note-panel>
        <div class="card-header editor-header">
          <div>
            <p class="eyebrow">Заметка</p>
            <h2>${escapeHtml(note.title)}</h2>
          </div>
          <div class="row-actions">
            <button ${buttonAttrs({ tone: "ghost", size: "small", data: { action: "close-open-note" } })}>Закрыть</button>
            <button ${buttonAttrs({ size: "small", data: { action: "edit-open-note" } })}>Редактировать</button>
          </div>
        </div>

        <div class="three-grid">
          <article class="card subtle">
            <p class="eyebrow">Проект</p>
            <strong>${escapeHtml(getProjectName(workspace.projects, note.projectId))}</strong>
          </article>
          <article class="card subtle">
            <p class="eyebrow">Обновлена</p>
            <strong>${formatDateTime(note.updatedAt)}</strong>
          </article>
          <article class="card subtle">
            <p class="eyebrow">Редактирований</p>
            <strong>${note.editHistory.length}</strong>
          </article>
        </div>

        <article class="preview-panel note-reader-body">
          <div class="markdown-preview">${renderMarkdown(note.markdown)}</div>
        </article>

        <div class="meta-row">
          ${linkedTasks ? `<span>задачи: ${escapeHtml(linkedTasks)}</span>` : ""}
          ${renderTagPills(workspace.tags, note.tagIds)}
        </div>

        <article class="card subtle">
          <div class="card-header compact">
            <div>
              <p class="eyebrow">История</p>
              <h3>История сохранений</h3>
            </div>
          </div>
          ${this.renderEditHistory(note)}
        </article>
      </article>
    `;
  }

  private renderOpenedNoteEditor(workspace: Workspace, note: Note): string {
    return `
      <form class="card form-grid editor-card existing-editor" data-markdown-editor data-form="edit-note">
        <div class="card-header editor-header">
          <div>
            <p class="eyebrow">Редактирование</p>
            <h2>${escapeHtml(note.title)}</h2>
          </div>
          <div class="row-actions">
            <button ${buttonAttrs({ tone: "ghost", size: "small", data: { action: "cancel-note-edit" } })}>Отмена</button>
            <button ${buttonAttrs({ type: "submit", size: "small" })}>Сохранить</button>
          </div>
        </div>

        <div class="three-grid">
          <article class="card subtle">
            <p class="eyebrow">Создана</p>
            <strong>${formatDateTime(note.createdAt)}</strong>
          </article>
          <article class="card subtle">
            <p class="eyebrow">Обновлена</p>
            <strong>${formatDateTime(note.updatedAt)}</strong>
          </article>
          <article class="card subtle">
            <p class="eyebrow">Редактирований</p>
            <strong>${note.editHistory.length}</strong>
          </article>
        </div>

        ${fieldHtml({
          label: "Название",
          control: `<input name="title" required value="${escapeHtml(note.title)}" />`,
        })}
        <div class="inline-grid">
          ${fieldHtml({
            label: "Проект",
            control: `<select name="projectId">${renderProjectOptions(workspace.projects, note.projectId)}</select>`,
          })}
          ${fieldHtml({
            label: "Связанная задача",
            control: `<select name="taskId">
              <option value="">Без задачи</option>
              ${renderTaskOptions(workspace.tasks, note.linkedTaskIds[0] ?? null)}
            </select>`,
          })}
        </div>
        <fieldset>
          <legend>Теги</legend>
          ${
            workspace.tags.length
              ? workspace.tags
                  .map(
                    (tag) => `
                      <label class="check-row">
                        <input
                          type="checkbox"
                          name="tagIds"
                          value="${escapeHtml(tag.id)}"
                          ${note.tagIds.includes(tag.id) ? "checked" : ""}
                        />
                        <span>${escapeHtml(tag.name)}</span>
                      </label>
                    `,
                  )
                  .join("")
              : `<p class="muted">Теги можно добавить в настройках.</p>`
          }
        </fieldset>
        <div class="markdown-tools" aria-label="Сниппеты Markdown">
          ${this.renderSnippetButtons()}
        </div>
        <div class="editor-grid">
          ${fieldHtml({
            label: "Текст",
            className: "markdown-field",
            control: `<textarea name="markdown" required data-note-markdown>${escapeHtml(note.markdown)}</textarea>`,
          })}
          <article class="preview-panel" aria-live="polite">
            <div class="card-header compact">
              <div>
                <p class="eyebrow">Preview</p>
                <h3>Живой просмотр</h3>
              </div>
            </div>
            <div class="markdown-preview" data-note-preview>${renderMarkdown(note.markdown)}</div>
          </article>
        </div>

        <article class="card subtle">
          <div class="card-header compact">
            <div>
              <p class="eyebrow">История</p>
              <h3>История сохранений</h3>
            </div>
          </div>
          ${this.renderEditHistory(note)}
        </article>
      </form>
    `;
  }

  private renderEditHistory(note: Note): string {
    if (!note.editHistory.length) {
      return emptyStateHtml("Эта заметка ещё не редактировалась после создания.");
    }

    return `
      <div class="edit-history">
        ${note.editHistory
          .map(
            (entry) => `
              <div class="edit-history-row">
                <strong>${formatDateTime(entry.editedAt)}</strong>
                <span>Сохранено</span>
              </div>
            `,
          )
          .join("")}
      </div>
    `;
  }

  private renderSnippetButtons(): string {
    return MARKDOWN_SNIPPETS.map(
      (snippet) => `
        <button
          ${buttonAttrs({
            tone: "ghost",
            size: "small",
            className: "snippet-button",
            data: { markdownSnippet: snippet.id },
          })}
          title="${escapeHtml(snippet.hint)}"
        >
          ${escapeHtml(snippet.label)}
        </button>
      `,
    ).join("");
  }

  private bindEditorActions(root: ShadowRoot): void {
    root.querySelectorAll<HTMLElement>("[data-markdown-editor]").forEach((editor) => {
      const textarea = editor.querySelector<HTMLTextAreaElement>("[data-note-markdown]");
      if (!textarea) {
        return;
      }

      textarea.addEventListener("input", () => this.updateNotePreview(editor));
      this.updateNotePreview(editor);

      editor.querySelectorAll<HTMLButtonElement>("[data-markdown-snippet]").forEach((button) => {
        button.addEventListener("click", () => {
          const snippet = MARKDOWN_SNIPPETS.find((item) => item.id === button.dataset.markdownSnippet);
          if (!snippet) {
            return;
          }

          this.applyMarkdownSnippet(textarea, snippet);
          this.updateNotePreview(editor);
        });
      });

      editor.querySelector<HTMLButtonElement>('[data-action="toggle-fullscreen"]')?.addEventListener("click", () => {
        this.setEditorFullscreen(editor, !this.editorFullscreen);
      });
    });

    root.addEventListener("keydown", (event) => {
      if (!(event instanceof KeyboardEvent) || event.key !== "Escape") {
        return;
      }

      if (this.openedNoteId) {
        this.openedNoteId = null;
        this.openedNoteMode = "preview";
        this.render();
        return;
      }

      if (this.editorFullscreen) {
        const editor = root.querySelector<HTMLElement>('[data-form="note"]');
        if (editor) {
          this.setEditorFullscreen(editor, false);
        }
      }
    });
  }

  private setEditorFullscreen(editor: HTMLElement, enabled: boolean): void {
    this.editorFullscreen = enabled;
    const button = editor.querySelector<HTMLButtonElement>('[data-action="toggle-fullscreen"]');

    editor.classList.toggle("is-fullscreen", enabled);
    if (button) {
      button.textContent = enabled ? "Свернуть" : "На весь экран";
      button.setAttribute("aria-pressed", enabled ? "true" : "false");
    }
  }

  private updateNotePreview(container: ParentNode): void {
    const textarea = container.querySelector<HTMLTextAreaElement>("[data-note-markdown]");
    const preview = container.querySelector<HTMLElement>("[data-note-preview]");
    if (!textarea || !preview) {
      return;
    }

    const markdown = textarea.value.trim();
    preview.innerHTML = markdown ? renderMarkdown(markdown) : EMPTY_PREVIEW_HTML;
  }

  private applyMarkdownSnippet(textarea: HTMLTextAreaElement, snippet: MarkdownSnippet): void {
    const result = applyMarkdownSnippetToText(textarea.value, textarea.selectionStart, textarea.selectionEnd, snippet);

    textarea.value = result.value;
    textarea.dispatchEvent(new Event("input", { bubbles: true }));
    textarea.focus();
    textarea.setSelectionRange(result.selectionStart, result.selectionEnd);
  }
}

customElements.define("pn-notes-view", NotesView);
