import { SCHEMA_VERSION } from "../domain/types";
import { escapeHtml } from "../domain/markdown";
import { getTimerNotificationStatus, requestTimerNotificationPermission } from "../platform/notifications";
import { appStore } from "../state";
import { parseWorkspaceExport, stringifyExport, validateImportSnapshot } from "../storage/export";
import { confirmDestructive } from "../ui/actions";
import { badgeHtml, buttonAttrs, fieldHtml } from "../ui/html";
import { renderShadow } from "./shadow";
import { requireInput, requireSelect, requireTextArea } from "./view-utils";

export class SettingsView extends HTMLElement {
  private unsubscribe: (() => void) | null = null;

  connectedCallback(): void {
    this.unsubscribe = appStore.subscribe(() => this.render());
    this.render();
  }

  disconnectedCallback(): void {
    this.unsubscribe?.();
  }

  private render(): void {
    const workspace = appStore.getWorkspace();
    const settings = workspace.settings;
    const notificationStatus = getTimerNotificationStatus();
    const root = renderShadow(
      this,
      `
        <section class="view-grid">
          <div class="three-grid">
            <article class="card">
              <p class="eyebrow">Схема</p>
                <span class="stat-number">v${SCHEMA_VERSION}</span>
              <p class="muted">Формат .prodnote.json.</p>
            </article>
            <article class="card">
              <p class="eyebrow">Данные</p>
              <span class="stat-number">${workspace.tasks.length + workspace.notes.length}</span>
              <p class="muted">Задачи и заметки.</p>
            </article>
            <article class="card">
              <p class="eyebrow">Локально</p>
              <span class="stat-number">IDB</span>
              <p class="muted">IndexedDB prodnote-db.</p>
            </article>
          </div>

          <div class="split-grid">
            <form class="card form-grid" data-form="settings">
              <div>
                <p class="eyebrow">Помодоро</p>
                <h2>Настройки фокуса</h2>
              </div>
              <div class="inline-grid">
                ${fieldHtml({
                  label: "Фокус, минут",
                  control: `<input name="focus" type="number" min="1" max="180" required value="${settings.pomodoroFocusMinutes}" />`,
                })}
                ${fieldHtml({
                  label: "Короткий перерыв",
                  control: `<input name="shortBreak" type="number" min="1" max="60" required value="${settings.pomodoroShortBreakMinutes}" />`,
                })}
              </div>
              <div class="inline-grid">
                ${fieldHtml({
                  label: "Длинный перерыв",
                  control: `<input name="longBreak" type="number" min="1" max="120" required value="${settings.pomodoroLongBreakMinutes}" />`,
                })}
                ${fieldHtml({
                  label: "Длинный перерыв после",
                  control: `<input name="longBreakEvery" type="number" min="1" max="12" required value="${settings.pomodoroLongBreakEvery}" />`,
                })}
              </div>
              ${fieldHtml({
                label: "Первый день недели",
                control: `<select name="weekStartsOn">
                  <option value="1" ${settings.weekStartsOn === 1 ? "selected" : ""}>Понедельник</option>
                  <option value="7" ${settings.weekStartsOn === 7 ? "selected" : ""}>Воскресенье</option>
                </select>`,
              })}
              <button ${buttonAttrs({ type: "submit" })}>Сохранить настройки</button>
            </form>

            <article class="card form-grid">
              <div>
                <p class="eyebrow">Файл</p>
                <h2>Экспорт и импорт</h2>
              </div>
              <p class="muted">Экспорт создаёт один JSON-файл со всеми проектами, задачами, заметками, сессиями, планами и настройками.</p>
              <div class="row-actions">
                <button ${buttonAttrs({ data: { action: "export" } })}>Скачать .prodnote.json</button>
                <label class="file-label">
                  Импортировать файл
                  <input type="file" accept=".json,.prodnote.json,application/json" data-import />
                </label>
              </div>
            </article>
          </div>

          <article class="card form-grid">
            <div class="card-header">
              <div>
                <p class="eyebrow">Уведомления</p>
                <h2>Системные уведомления таймера</h2>
              </div>
              ${badgeHtml(formatNotificationStatus(notificationStatus))}
            </div>
            <p class="muted">${getNotificationStatusHint(notificationStatus)}</p>
            <div class="row-actions">
              <button ${buttonAttrs({
                data: { action: "request-notifications" },
                disabled: notificationStatus !== "default",
              })}>Разрешить уведомления</button>
            </div>
          </article>

          <div class="split-grid">
            <form class="card form-grid" data-form="project">
              <div>
                <p class="eyebrow">Проекты</p>
                <h2>Новый проект</h2>
              </div>
              ${fieldHtml({
                label: "Название",
                control: `<input name="name" required placeholder="Например: Исследования" />`,
              })}
              ${fieldHtml({
                label: "Цвет",
                control: `<input name="color" type="color" value="#2a9d8f" />`,
              })}
              ${fieldHtml({
                label: "Описание",
                control: `<textarea name="description" placeholder="Для чего этот проект"></textarea>`,
              })}
              <button ${buttonAttrs({ type: "submit" })}>Добавить проект</button>
            </form>

            <form class="card form-grid" data-form="tag">
              <div>
                <p class="eyebrow">Теги</p>
                <h2>Новый тег</h2>
              </div>
              ${fieldHtml({
                label: "Название",
                control: `<input name="name" required placeholder="Например: глубокая работа" />`,
              })}
              ${fieldHtml({
                label: "Цвет",
                control: `<input name="color" type="color" value="#e19f44" />`,
              })}
              <button ${buttonAttrs({ type: "submit" })}>Добавить тег</button>
            </form>
          </div>

          <div class="split-grid">
            <article class="card">
              <div class="card-header">
                <div>
                  <p class="eyebrow">Проекты</p>
                  <h2>Список</h2>
                </div>
                ${badgeHtml(workspace.projects.length)}
              </div>
              <div class="item-list">
                ${workspace.projects
                  .map(
                    (project) => {
                      const taskCount = workspace.tasks.filter((task) => task.projectId === project.id).length;
                      const noteCount = workspace.notes.filter((note) => note.projectId === project.id).length;

                      return `
                      <div class="list-item">
                        <div class="project-row">
                          <div>
                            <div class="meta-row">
                              <span class="color-dot" style="--project-color: ${escapeHtml(project.color)}"></span>
                              <strong>${escapeHtml(project.name)}</strong>
                            </div>
                            <p class="muted">${taskCount} задач, ${noteCount} заметок</p>
                          </div>
                          <button ${buttonAttrs({ tone: "danger", size: "small", data: { deleteProject: project.id } })}>Удалить</button>
                        </div>
                        ${project.description ? `<p class="muted">${escapeHtml(project.description)}</p>` : ""}
                      </div>
                    `;
                    },
                  )
                  .join("")}
              </div>
            </article>

            <article class="card">
              <div class="card-header">
                <div>
                  <p class="eyebrow">Теги</p>
                  <h2>Список</h2>
                </div>
                ${badgeHtml(workspace.tags.length)}
              </div>
              <div class="tag-cloud">
                ${workspace.tags
                  .map(
                    (tag) =>
                      `<span class="tag-pill" style="--tag-color: ${escapeHtml(tag.color)}">${escapeHtml(tag.name)}</span>`,
                  )
                  .join("")}
              </div>
            </article>
          </div>
        </section>
      `,
      `
        .file-label {
          align-items: center;
          background: rgba(20, 33, 61, 0.06);
          border-radius: 999px;
          color: var(--ink);
          cursor: pointer;
          display: inline-flex;
          font-weight: 900;
          min-height: 2.65rem;
          padding: 0.75rem 1.15rem;
        }

        .file-label input {
          display: none;
        }

        .color-dot {
          background: var(--project-color);
          border-radius: 999px;
          display: inline-block;
          height: 0.9rem;
          width: 0.9rem;
        }

        .project-row {
          align-items: center;
          display: flex;
          gap: 1rem;
          justify-content: space-between;
        }

        .tag-cloud {
          display: flex;
          flex-wrap: wrap;
          gap: 0.5rem;
        }
      `,
    );

    root.querySelector<HTMLFormElement>('[data-form="settings"]')?.addEventListener("submit", (event) => {
      event.preventDefault();
      const form = event.currentTarget;
      if (!(form instanceof HTMLFormElement)) {
        return;
      }

      void appStore.updateSettings({
        pomodoroFocusMinutes: Number(requireInput(form, "focus").value),
        pomodoroShortBreakMinutes: Number(requireInput(form, "shortBreak").value),
        pomodoroLongBreakMinutes: Number(requireInput(form, "longBreak").value),
        pomodoroLongBreakEvery: Number(requireInput(form, "longBreakEvery").value),
        weekStartsOn: Number(requireSelect(form, "weekStartsOn").value) === 7 ? 7 : 1,
      });
    });

    root.querySelector<HTMLFormElement>('[data-form="project"]')?.addEventListener("submit", (event) => {
      event.preventDefault();
      const form = event.currentTarget;
      if (!(form instanceof HTMLFormElement)) {
        return;
      }

      void appStore.addProject({
        name: requireInput(form, "name").value,
        color: requireInput(form, "color").value,
        description: requireTextArea(form, "description").value,
      });
      form.reset();
    });

    root.querySelector<HTMLFormElement>('[data-form="tag"]')?.addEventListener("submit", (event) => {
      event.preventDefault();
      const form = event.currentTarget;
      if (!(form instanceof HTMLFormElement)) {
        return;
      }

      void appStore.addTag({
        name: requireInput(form, "name").value,
        color: requireInput(form, "color").value,
      });
      form.reset();
    });

    root.querySelectorAll<HTMLButtonElement>("[data-delete-project]").forEach((button) => {
      button.addEventListener("click", () => {
        const projectId = button.dataset.deleteProject;
        const project = workspace.projects.find((item) => item.id === projectId);
        if (!projectId || !project) {
          return;
        }

        const taskCount = workspace.tasks.filter((task) => task.projectId === projectId).length;
        const noteCount = workspace.notes.filter((note) => note.projectId === projectId).length;
        const confirmed = confirmDestructive(
          `Удалить проект «${project.name}»?\n\n${taskCount} задач и ${noteCount} заметок останутся, но будут перенесены в «Без проекта».`,
        );

        if (confirmed) {
          void appStore.deleteProject(projectId);
        }
      });
    });

    root.querySelector<HTMLButtonElement>('[data-action="export"]')?.addEventListener("click", () => {
      const blob = new Blob([stringifyExport(appStore.getWorkspace())], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = `prodnote-${new Date().toISOString().slice(0, 10)}.prodnote.json`;
      anchor.click();
      URL.revokeObjectURL(url);
    });

    root.querySelector<HTMLButtonElement>('[data-action="request-notifications"]')?.addEventListener("click", () => {
      void requestTimerNotificationPermission().then(() => this.render());
    });

    root.querySelector<HTMLInputElement>("[data-import]")?.addEventListener("change", (event) => {
      const input = event.currentTarget;
      if (!(input instanceof HTMLInputElement)) {
        return;
      }

      const file = input.files?.[0] ?? null;
      if (!file) {
        return;
      }

      void file.text()
        .then((text) => {
          const parsed = JSON.parse(text) as unknown;
          const preview = validateImportSnapshot(parsed);
          const confirmed = confirmDestructive(
            `Импортировать workspace?\n\nПроекты: ${preview.projects}\nЗадачи: ${preview.tasks}\nЗаметки: ${preview.notes}\nСессии: ${preview.sessions}\n\nТекущие локальные данные будут заменены.`,
          );
          if (!confirmed) {
            return;
          }

          return appStore.importWorkspace(parseWorkspaceExport(text));
        })
        .catch((error: unknown) => {
          window.alert(`Не удалось импортировать файл: ${String(error)}`);
        })
        .finally(() => {
          input.value = "";
        });
    });
  }
}

customElements.define("pn-settings-view", SettingsView);

function formatNotificationStatus(status: ReturnType<typeof getTimerNotificationStatus>): string {
  if (status === "granted") {
    return "Разрешены";
  }

  if (status === "denied") {
    return "Запрещены";
  }

  if (status === "unsupported") {
    return "Недоступны";
  }

  return "Не запрошены";
}

function getNotificationStatusHint(status: ReturnType<typeof getTimerNotificationStatus>): string {
  if (status === "granted") {
    return "Когда фаза помодоро заканчивается, ProdNote покажет системное уведомление и оставит уведомление в приложении.";
  }

  if (status === "denied") {
    return "Браузер уже запретил уведомления. Чтобы включить их, измените разрешение сайта в настройках браузера или системы.";
  }

  if (status === "unsupported") {
    return "Этот браузер не поддерживает Web Notifications API, поэтому останутся только уведомления внутри приложения и звук.";
  }

  return "Нажмите кнопку ниже. Браузер должен показать системный запрос разрешения; без него внешние уведомления не появятся.";
}
