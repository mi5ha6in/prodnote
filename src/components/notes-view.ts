import { escapeHtml, renderMarkdown } from "../domain/markdown";
import { applyMarkdownSnippetToText, MARKDOWN_SNIPPETS, type MarkdownSnippet } from "../domain/markdown-snippets";
import { extractOpenCheckboxes } from "../domain/note-tasks";
import { findBacklinks, searchNotes } from "../domain/search";
import type { Note, Workspace } from "../domain/types";
import { appStore } from "../state";
import { confirmDestructive } from "../ui/actions";
import { badgeHtml, buttonAttrs, emptyStateHtml, fieldHtml, metricBarHtml, modalHtml, viewHeaderHtml } from "../ui/html";
import { setBodyScrollLock, wireModal } from "./modal";
import { quickCreateHtml, wireQuickCreate, type QuickCreateKind } from "./quick-create";
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
  private searchQuery = "";
  /** Черновик открытого редактора: без него quick-create проекта/тега стёр бы набранный текст (store emit → re-render). */
  private noteDraft: { title: string; markdown: string; projectId: string; taskId: string; tagIds: string[] } | null =
    null;

  connectedCallback(): void {
    // Deep link `#/notes/notes/<id>` (command palette): pre-open that note.
    const entityId = this.getAttribute("entity-id");
    if (entityId) {
      this.openedNoteId = entityId;
    }
    this.unsubscribe = appStore.subscribe(() => this.render());
    document.addEventListener("keydown", this.onHotkey);
    this.render();
  }

  disconnectedCallback(): void {
    this.unsubscribe?.();
    document.removeEventListener("keydown", this.onHotkey);
    setBodyScrollLock(false);
  }

  /** n — новая заметка, / — поиск. Не срабатывает, когда фокус в поле ввода или открыта модалка. */
  private onHotkey = (event: KeyboardEvent): void => {
    if (event.defaultPrevented || event.metaKey || event.ctrlKey || event.altKey) {
      return;
    }
    const target = event.composedPath()[0];
    if (
      target instanceof HTMLElement &&
      (target.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName))
    ) {
      return;
    }
    if (this.modalOpen) {
      return;
    }

    if (event.key === "n" || event.key === "т") {
      event.preventDefault();
      this.creating = true;
      this.render();
    } else if (event.key === "/") {
      event.preventDefault();
      this.shadowRoot?.querySelector<HTMLInputElement>("[data-note-search]")?.focus();
    }
  };

  private get modalOpen(): boolean {
    return this.creating || this.openedNoteId !== null;
  }

  private closeModals(): void {
    this.creating = false;
    this.openedNoteId = null;
    this.openedNoteMode = "preview";
    this.noteDraft = null;
    // Drop a stale deep-link hash so the same note can be reopened from the palette.
    if (window.location.hash.startsWith("#/notes/notes/")) {
      history.replaceState(null, "", "#/notes/notes");
    }
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
            actions: `<button ${buttonAttrs({ data: { action: "open-create" } })}>+ Новая заметка</button>`,
          })}

          <article class="card">
            <div class="card-header">
              <div>
                <p class="eyebrow">Библиотека</p>
                <h2>Все заметки</h2>
              </div>
              <div class="row-actions">
                <input data-note-search type="search" placeholder="Поиск…" value="${escapeHtml(this.searchQuery)}" aria-label="Поиск заметок" />
                ${badgeHtml(workspace.notes.length)}
              </div>
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
                          <article class="note-card" data-note-id="${escapeHtml(note.id)}">
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
                  : emptyStateHtml("Пока нет заметок. Создайте первую заметку в Markdown.")
              }
            </div>
          </article>
        </section>
      `,
      `
        .card-header .row-actions {
          flex-wrap: nowrap;
        }

        [data-note-search] {
          width: 14rem;
        }

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

        .markdown-preview .wikilink {
          cursor: pointer;
          text-decoration: underline;
          text-decoration-style: dotted;
        }

        .backlink {
          cursor: pointer;
          text-align: left;
        }

        .editor-grid {
          align-items: start;
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
          height: min(48vh, 26rem);
          min-height: 12rem;
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
          max-height: min(48vh, 26rem);
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

          .card-header .row-actions {
            flex-wrap: wrap;
          }

          [data-note-search] {
            width: 100%;
          }
        }
      `,
    );

    setBodyScrollLock(this.modalOpen);
    this.bindModalActions(root);

    const searchInput = root.querySelector<HTMLInputElement>("[data-note-search]");
    searchInput?.addEventListener("input", () => {
      this.searchQuery = searchInput.value;
      this.applyNoteFilter(root);
    });
    this.applyNoteFilter(root);
  }

  private applyNoteFilter(root: ShadowRoot): void {
    const matches = new Set(searchNotes(appStore.getWorkspace().notes, this.searchQuery).map((note) => note.id));
    root.querySelectorAll<HTMLElement>("[data-note-id]").forEach((card) => {
      card.style.display = matches.has(card.dataset.noteId ?? "") ? "" : "none";
    });
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
    // Черновик переживает re-render после quick-create проекта/тега.
    const draft = this.noteDraft ?? {
      title: note?.title ?? "",
      markdown: note?.markdown ?? "",
      projectId: note?.projectId ?? "",
      taskId: note?.linkedTaskIds[0] ?? "",
      tagIds: note?.tagIds ?? [],
    };

    return modalHtml({
      wide: true,
      label: isEdit ? "Редактирование заметки" : "Новая заметка",
      body: `
        <form class="form-grid" data-markdown-editor data-form="${isEdit ? "edit-note" : "note"}">
          <div class="card-header" style="margin-bottom: 0;">
            <div>
              <p class="eyebrow">${isEdit ? "Редактирование" : "Заметки"}</p>
              <h2>${isEdit ? escapeHtml(note.title) : "Новая заметка"}</h2>
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
            control: `<input name="title" required value="${escapeHtml(draft.title)}" placeholder="Например: итоги исследования" />`,
          })}
          <div class="inline-grid">
            <div class="form-grid" style="gap: var(--space-2);">
              ${fieldHtml({
                label: "Проект",
                control: `<select name="projectId">${renderProjectOptions(workspace.projects, draft.projectId || null)}</select>`,
              })}
              ${quickCreateHtml("project")}
            </div>
            ${fieldHtml({
              label: "Связанная задача",
              control: `<select name="taskId">
                <option value="">Без задачи</option>
                ${renderTaskOptions(workspace.tasks, draft.taskId || null)}
              </select>`,
            })}
          </div>
          <fieldset>
            <legend>Теги</legend>
            ${workspace.tags
              .map(
                (tag) => `
                  <label class="check-row">
                    <input type="checkbox" name="tagIds" value="${escapeHtml(tag.id)}" ${
                      draft.tagIds.includes(tag.id) ? "checked" : ""
                    } />
                    <span>${escapeHtml(tag.name)}</span>
                  </label>
                `,
              )
              .join("")}
            ${quickCreateHtml("tag")}
          </fieldset>
          <div class="markdown-tools" aria-label="Сниппеты Markdown">
            ${this.renderSnippetButtons()}
          </div>
          <div class="editor-grid">
            ${fieldHtml({
              label: "Текст",
              className: "markdown-field",
              control: `<textarea name="markdown" required data-note-markdown placeholder="# Заголовок&#10;- тезис&#10;- следующий шаг">${escapeHtml(draft.markdown)}</textarea>`,
            })}
            <article class="preview-panel" aria-live="polite">
              <div class="markdown-preview" data-note-preview>${draft.markdown ? renderMarkdown(draft.markdown) : EMPTY_PREVIEW_HTML}</div>
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
              ${
                extractOpenCheckboxes(note.markdown).length
                  ? `<button ${buttonAttrs({ tone: "ghost", size: "small", data: { action: "extract-tasks" } })}>Чекбоксы → задачи</button>`
                  : ""
              }
              <button ${buttonAttrs({ size: "small", data: { action: "edit-open-note" } })}>Редактировать</button>
              <button ${buttonAttrs({ tone: "danger", size: "small", data: { action: "delete-open-note" } })}>Удалить</button>
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

          ${this.renderBacklinks(workspace, note)}

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

  private renderBacklinks(workspace: Workspace, note: Note): string {
    const backlinks = findBacklinks(workspace.notes, note);
    if (!backlinks.length) {
      return "";
    }

    return `
      <article class="card subtle">
        <div class="card-header" style="margin-bottom: var(--space-3);">
          <div>
            <p class="eyebrow">Связи</p>
            <h3>Упоминается в</h3>
          </div>
        </div>
        <div class="item-list">
          ${backlinks
            .map(
              (link) => `
                <button class="list-item backlink" data-open-note="${escapeHtml(link.id)}">
                  <strong>${escapeHtml(link.title)}</strong>
                </button>
              `,
            )
            .join("")}
        </div>
      </article>
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

  /** Снять значения открытого редактора заметки в черновик. */
  private snapshotNoteForm(root: ShadowRoot): void {
    const form = root.querySelector<HTMLFormElement>("[data-markdown-editor]");
    if (!form) {
      return;
    }
    this.noteDraft = {
      title: requireInput(form, "title").value,
      markdown: requireTextArea(form, "markdown").value,
      projectId: requireSelect(form, "projectId").value,
      taskId: requireSelect(form, "taskId").value,
      tagIds: [...form.querySelectorAll<HTMLInputElement>('input[name="tagIds"]:checked')].map((input) => input.value),
    };
  }

  private bindModalActions(root: ShadowRoot): void {
    root.querySelector<HTMLButtonElement>('[data-action="open-create"]')?.addEventListener("click", () => {
      this.creating = true;
      this.openedNoteId = null;
      this.noteDraft = null;
      this.render();
    });

    // Quick-create проекта/тега внутри открытого редактора заметки.
    if (this.creating || (this.openedNoteId !== null && this.openedNoteMode === "edit")) {
      wireQuickCreate(root, {
        beforeCreate: () => this.snapshotNoteForm(root),
        onCreated: (kind: QuickCreateKind, id: string) => {
          if (!this.noteDraft) {
            return;
          }
          if (kind === "project") {
            this.noteDraft.projectId = id;
          } else if (!this.noteDraft.tagIds.includes(id)) {
            this.noteDraft.tagIds = [...this.noteDraft.tagIds, id];
          }
          this.render();
        },
      });
    }

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

    root.querySelectorAll<HTMLElement>("[data-wikilink]").forEach((link) => {
      link.addEventListener("click", (event) => {
        event.preventDefault();
        const title = link.dataset.wikilink?.toLowerCase();
        const target = appStore.getWorkspace().notes.find((note) => note.title.toLowerCase() === title);
        if (target) {
          this.creating = false;
          this.openedNoteId = target.id;
          this.openedNoteMode = "preview";
          this.render();
        }
      });
    });

    root.querySelector<HTMLButtonElement>('[data-action="edit-open-note"]')?.addEventListener("click", () => {
      if (!this.openedNoteId) {
        return;
      }

      this.openedNoteMode = "edit";
      this.noteDraft = null;
      this.render();
    });

    root.querySelector<HTMLButtonElement>('[data-action="cancel-note-edit"]')?.addEventListener("click", () => {
      this.openedNoteMode = "preview";
      this.noteDraft = null;
      this.render();
    });

    root.querySelector<HTMLButtonElement>('[data-action="close-open-note"]')?.addEventListener("click", () => {
      this.closeModals();
    });

    root.querySelector<HTMLButtonElement>('[data-action="extract-tasks"]')?.addEventListener("click", () => {
      if (this.openedNoteId) {
        void appStore.extractTasksFromNote(this.openedNoteId);
      }
    });

    root.querySelector<HTMLButtonElement>('[data-action="delete-open-note"]')?.addEventListener("click", () => {
      const noteId = this.openedNoteId;
      const note = appStore.getWorkspace().notes.find((item) => item.id === noteId);
      if (!noteId || !note) {
        return;
      }

      const confirmed = confirmDestructive(`Удалить заметку «${note.title}»?\n\nЭто действие необратимо.`);
      if (!confirmed) {
        return;
      }

      void appStore.deleteNote(noteId).then(() => this.closeModals());
    });

    root.querySelector<HTMLButtonElement>('[data-action="close-create"]')?.addEventListener("click", () => {
      this.creating = false;
      this.noteDraft = null;
      this.render();
    });

    if (this.modalOpen) {
      wireModal(root, {
        onClose: () => {
          if (this.openedNoteId && this.openedNoteMode === "edit") {
            this.openedNoteMode = "preview";
            this.noteDraft = null;
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
      this.noteDraft = null;
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
          this.noteDraft = null;
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
