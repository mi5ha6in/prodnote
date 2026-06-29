import { escapeHtml, renderMarkdown } from "../domain/markdown";
import { applyMarkdownSnippetToText, MARKDOWN_SNIPPETS, type MarkdownSnippet } from "../domain/markdown-snippets";
import type { Note, Workspace } from "../domain/types";
import { appStore } from "../state";
import { badgeHtml, buttonAttrs, emptyStateHtml, fieldHtml, metricBarHtml, modalHtml, viewHeaderHtml } from "../ui/html";
import { wireModal } from "./modal";
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
  private creating = false;
  private openedNoteId: string | null = null;
  private openedNoteMode: "preview" | "edit" = "preview";

  connectedCallback(): void {
    this.unsubscribe = appStore.subscribe(() => this.render());
    this.render();
  }

  disconnectedCallback(): void {
    this.unsubscribe?.();
  }

  private get modalOpen(): boolean {
    return this.creating || this.openedNoteId !== null;
  }

  private closeModals(): void {
    this.creating = false;
    this.openedNoteId = null;
    this.openedNoteMode = "preview";
    this.render();
  }

  private render(): void {
    const workspace = appStore.getWorkspace();
    const root = renderShadow(
      this,
      `
        <section class="view-grid">
          ${this.renderModal(workspace)}

          ${viewHeaderHtml({
            actions: `<button ${buttonAttrs({ data: { action: "open-create" } })}>+ Новый конспект</button>`,
          })}

          <article class="card">
            <div class="card-header">
              <div>
                <p class="eyebrow">Библиотека</p>
                <h2>Все конспекты</h2>
              </div>
              ${badgeHtml(workspace.notes.length)}
            </div>
            <div class="notes-grid">
              ${
                workspace.notes.length
                  ? workspace.notes
                      .map((note) => {
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
                      })
                      .join("")
                  : emptyStateHtml("Пока нет заметок. Создайте первый Markdown-конспект.")
              }
            </div>
          </article>
        </section>
      `,
      `
        .notes-grid {
          column-count: 2;
          column-gap: var(--space-4);
        }

        .note-card {
          background: var(--surface);
          border: 1px solid var(--line);
          border-radius: var(--radius-md);
          break-inside: avoid;
          display: inline-grid;
          gap: var(--space-2);
          margin: 0 0 var(--space-4);
          padding: var(--space-4);
          width: 100%;
        }

        .note-card .markdown-preview {
          display: -webkit-box;
          -webkit-box-orient: vertical;
          -webkit-line-clamp: 5;
          overflow: hidden;
        }

        .editor-grid {
          display: grid;
          gap: var(--space-3);
          grid-template-columns: minmax(0, 1.1fr) minmax(16rem, 0.9fr);
          min-width: 0;
        }

        .markdown-field textarea {
          font-family:
            "SFMono-Regular",
            "Consolas",
            "Liberation Mono",
            monospace;
          min-height: min(48vh, 30rem);
        }

        .markdown-tools {
          display: flex;
          flex-wrap: wrap;
          gap: var(--space-2);
        }

        .snippet-button {
          background: var(--accent-soft);
          border-color: transparent;
          color: var(--accent-strong);
        }

        .preview-panel {
          background: var(--surface);
          border: 1px solid var(--line);
          border-radius: var(--radius-md);
          min-width: 0;
          overflow: auto;
          padding: var(--space-3);
        }

        .syntax-list {
          display: grid;
          gap: var(--space-2);
        }

        .syntax-item {
          align-items: center;
          background: var(--surface);
          border: 1px solid var(--line);
          border-radius: var(--radius-sm);
          display: flex;
          gap: var(--space-3);
          justify-content: space-between;
          min-width: 0;
          padding: var(--space-2) var(--space-3);
        }

        .syntax-item code {
          color: var(--accent-strong);
          overflow-wrap: anywhere;
          text-align: right;
        }

        .edit-history {
          display: grid;
          gap: var(--space-2);
        }

        .edit-history-row {
          align-items: center;
          background: var(--surface);
          border: 1px solid var(--line);
          border-radius: var(--radius-sm);
          display: flex;
          gap: var(--space-3);
          justify-content: space-between;
          padding: var(--space-2) var(--space-3);
        }

        .edit-history-row span {
          color: var(--muted);
        }

        details.cheatsheet summary {
          cursor: pointer;
          font-weight: 600;
        }

        details.cheatsheet[open] summary {
          margin-bottom: var(--space-3);
        }

        fieldset {
          border: 1px solid var(--line);
          border-radius: var(--radius-md);
          display: flex;
          flex-wrap: wrap;
          gap: var(--space-2);
          margin: 0;
          padding: var(--space-3);
        }

        legend {
          color: var(--muted);
          font-size: var(--text-sm);
          font-weight: 700;
          padding: 0 var(--space-1);
        }

        .check-row {
          align-items: center;
          background: var(--surface);
          border: 1px solid var(--line);
          border-radius: var(--radius-pill);
          display: flex;
          gap: var(--space-2);
          padding: 0.3rem var(--space-3);
        }

        .check-row input {
          width: auto;
        }

        @media (max-width: 820px) {
          .notes-grid {
            column-count: 1;
          }

          .editor-grid {
            grid-template-columns: 1fr;
          }
        }
      `,
    );

    this.bindModalActions(root);
  }

  private renderModal(workspace: Workspace): string {
    if (this.creating) {
      return this.renderEditorModal(workspace, null);
    }

    if (!this.openedNoteId) {
      return "";
    }

    const note = workspace.notes.find((item) => item.id === this.openedNoteId);
    if (!note) {
      return "";
    }

    return this.openedNoteMode === "edit"
      ? this.renderEditorModal(workspace, note)
      : this.renderNotePreviewModal(workspace, note);
  }

  private renderEditorModal(workspace: Workspace, note: Note | null): string {
    const isEdit = note !== null;
    const cancelAction = isEdit ? "cancel-note-edit" : "close-create";

    return modalHtml({
      wide: true,
      label: isEdit ? "Редактирование заметки" : "Новый конспект",
      body: `
        <form class="form-grid" data-markdown-editor data-form="${isEdit ? "edit-note" : "note"}">
          <div class="card-header" style="margin-bottom: 0;">
            <div>
              <p class="eyebrow">${isEdit ? "Редактирование" : "Markdown"}</p>
              <h2>${isEdit ? escapeHtml(note.title) : "Новый конспект"}</h2>
            </div>
            <div class="row-actions">
              <button ${buttonAttrs({ tone: "ghost", size: "small", data: { action: cancelAction } })}>${isEdit ? "Отмена" : "Закрыть"}</button>
              <button ${buttonAttrs({ type: "submit", size: "small" })}>Сохранить</button>
            </div>
          </div>

          ${
            isEdit
              ? metricBarHtml([
                  { label: "Создана", value: formatDateTime(note.createdAt) },
                  { label: "Обновлена", value: formatDateTime(note.updatedAt) },
                  { label: "Редактирований", value: note.editHistory.length },
                ])
              : ""
          }

          ${fieldHtml({
            label: "Название",
            control: `<input name="title" required value="${isEdit ? escapeHtml(note.title) : ""}" placeholder="Например: итоги исследования" />`,
          })}
          <div class="inline-grid">
            ${fieldHtml({
              label: "Проект",
              control: `<select name="projectId">${renderProjectOptions(workspace.projects, note?.projectId ?? null)}</select>`,
            })}
            ${fieldHtml({
              label: "Связанная задача",
              control: `<select name="taskId">
                <option value="">Без задачи</option>
                ${renderTaskOptions(workspace.tasks, note?.linkedTaskIds[0] ?? null)}
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
                          <input type="checkbox" name="tagIds" value="${escapeHtml(tag.id)}" ${
                            note?.tagIds.includes(tag.id) ? "checked" : ""
                          } />
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
              control: `<textarea name="markdown" required data-note-markdown placeholder="# Заголовок&#10;- тезис&#10;- следующий шаг">${
                isEdit ? escapeHtml(note.markdown) : ""
              }</textarea>`,
            })}
            <article class="preview-panel" aria-live="polite">
              <div class="markdown-preview" data-note-preview>${isEdit ? renderMarkdown(note.markdown) : EMPTY_PREVIEW_HTML}</div>
            </article>
          </div>

          <details class="cheatsheet">
            <summary>Шпаргалка Markdown</summary>
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
          </details>

          ${
            isEdit
              ? `
                <article class="card subtle">
                  <div class="card-header" style="margin-bottom: var(--space-3);">
                    <div>
                      <p class="eyebrow">История</p>
                      <h3>История сохранений</h3>
                    </div>
                  </div>
                  ${this.renderEditHistory(note)}
                </article>
              `
              : ""
          }
        </form>
      `,
    });
  }

  private renderNotePreviewModal(workspace: Workspace, note: Note): string {
    const linkedTasks = note.linkedTaskIds.map((taskId) => getTaskName(workspace.tasks, taskId)).join(", ");

    return modalHtml({
      wide: true,
      label: "Заметка",
      body: `
        <article class="form-grid">
          <div class="card-header" style="margin-bottom: 0;">
            <div>
              <p class="eyebrow">Заметка</p>
              <h2>${escapeHtml(note.title)}</h2>
            </div>
            <div class="row-actions">
              <button ${buttonAttrs({ tone: "ghost", size: "small", data: { action: "close-open-note" } })}>Закрыть</button>
              <button ${buttonAttrs({ size: "small", data: { action: "edit-open-note" } })}>Редактировать</button>
            </div>
          </div>

          ${metricBarHtml([
            { label: "Проект", value: getProjectName(workspace.projects, note.projectId) },
            { label: "Обновлена", value: formatDateTime(note.updatedAt) },
            { label: "Редактирований", value: note.editHistory.length },
          ])}

          <article class="preview-panel">
            <div class="markdown-preview">${renderMarkdown(note.markdown)}</div>
          </article>

          <div class="meta-row">
            ${linkedTasks ? `<span>задачи: ${escapeHtml(linkedTasks)}</span>` : ""}
            ${renderTagPills(workspace.tags, note.tagIds)}
          </div>

          <article class="card subtle">
            <div class="card-header" style="margin-bottom: var(--space-3);">
              <div>
                <p class="eyebrow">История</p>
                <h3>История сохранений</h3>
              </div>
            </div>
            ${this.renderEditHistory(note)}
          </article>
        </article>
      `,
    });
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

  private bindModalActions(root: ShadowRoot): void {
    root.querySelector<HTMLButtonElement>('[data-action="open-create"]')?.addEventListener("click", () => {
      this.creating = true;
      this.openedNoteId = null;
      this.render();
    });

    root.querySelectorAll<HTMLButtonElement>("[data-open-note]").forEach((button) => {
      button.addEventListener("click", () => {
        const noteId = button.dataset.openNote;
        if (!noteId) {
          return;
        }

        this.creating = false;
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
      this.closeModals();
    });

    root.querySelector<HTMLButtonElement>('[data-action="close-create"]')?.addEventListener("click", () => {
      this.creating = false;
      this.render();
    });

    if (this.modalOpen) {
      wireModal(root, {
        onClose: () => {
          if (this.openedNoteId && this.openedNoteMode === "edit") {
            this.openedNoteMode = "preview";
            this.render();
            return;
          }

          this.closeModals();
        },
      });
    }

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
      this.creating = false;
      this.render();
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
    });
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
