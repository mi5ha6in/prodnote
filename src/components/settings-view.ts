import { SCHEMA_VERSION } from "../domain/types";
import { escapeHtml } from "../domain/markdown";
import { getTimerNotificationStatus, requestTimerNotificationPermission } from "../platform/notifications";
import { disablePush, enablePush, getPushStatus, type PushStatus } from "../platform/push";
import { listBackups, readBackup, type BackupSummary } from "../storage/backups";
import { appStore } from "../state";
import { parseWorkspaceExport, stringifyExport, validateImportSnapshot } from "../storage/export";
import { ALLDAY_REMINDER_OPTIONS, REMINDER_OPTIONS } from "../domain/defaults";
import { getThemePreference, setThemePreference, type ThemePreference } from "../storage/theme";
import {
  getSyncState,
  loginPasskey,
  logoutSync,
  refreshSyncSession,
  registerPasskey,
  setSyncServerUrl,
  subscribeSync,
} from "../sync/client";
import { confirmDestructive } from "../ui/actions";
import { badgeHtml, buttonAttrs, emptyStateHtml, fieldHtml, modalHtml } from "../ui/html";
import { setBodyScrollLock, wireModal } from "./modal";
import { renderShadow } from "./shadow";
import { requireInput, requireSelect, requireTextArea } from "./view-utils";

export class SettingsView extends HTMLElement {
  private unsubscribe: (() => void) | null = null;
  private syncUnsubscribe: (() => void) | null = null;
  private creating: "project" | "tag" | null = null;
  private editing: { type: "project" | "tag"; id: string } | null = null;
  private pushStatus: PushStatus = "unsupported";
  private backups: BackupSummary[] = [];

  private refreshPushStatus(): void {
    void getPushStatus().then((status) => {
      if (status !== this.pushStatus) {
        this.pushStatus = status;
        this.render();
      }
    });
  }

  private refreshBackups(): void {
    void listBackups().then((backups) => {
      if (backups.length !== this.backups.length || backups[0]?.id !== this.backups[0]?.id) {
        this.backups = backups;
        this.render();
      }
    });
  }

  connectedCallback(): void {
    this.unsubscribe = appStore.subscribe(() => this.render());
    this.syncUnsubscribe = subscribeSync(() => this.render());
    void refreshSyncSession();
    this.refreshPushStatus();
    this.refreshBackups();
    this.render();
  }

  disconnectedCallback(): void {
    this.unsubscribe?.();
    this.syncUnsubscribe?.();
    setBodyScrollLock(false);
  }

  private pushHint(): string {
    switch (this.pushStatus) {
      case "on":
        return "Push включён: напоминания приходят на это устройство даже при закрытом приложении.";
      case "off":
        return "Push доступен: сервер доставит напоминания, даже когда вкладка закрыта.";
      case "denied":
        return "Push заблокирован браузером — измените разрешение уведомлений для сайта.";
      case "server-off":
        return "Push не настроен: нужен вход на сервер синхронизации с VAPID-ключами (см. документацию).";
      default:
        return "Этот браузер не поддерживает Web Push; напоминания работают только при открытом приложении.";
    }
  }

  private renderCreateModal(): string {
    if (this.creating === "project") {
      return modalHtml({
        label: "Новый проект",
        body: `
          <form class="form-grid" data-form="project">
            <div class="card-header" style="margin-bottom: 0;">
              <div>
                <p class="eyebrow">Проекты</p>
                <h2>Новый проект</h2>
              </div>
              <button ${buttonAttrs({ tone: "ghost", size: "small", data: { action: "close-create" } })}>Закрыть</button>
            </div>
            ${fieldHtml({
              label: "Название",
              control: `<input name="name" required placeholder="Например: Исследования" />`,
            })}
            ${fieldHtml({
              label: "Цвет",
              control: `<input name="color" type="color" value="#2f7d5c" />`,
            })}
            ${fieldHtml({
              label: "Описание",
              control: `<textarea name="description" placeholder="Для чего этот проект"></textarea>`,
            })}
            <button ${buttonAttrs({ type: "submit" })}>Добавить проект</button>
          </form>
        `,
      });
    }

    if (this.creating === "tag") {
      return modalHtml({
        label: "Новый тег",
        body: `
          <form class="form-grid" data-form="tag">
            <div class="card-header" style="margin-bottom: 0;">
              <div>
                <p class="eyebrow">Теги</p>
                <h2>Новый тег</h2>
              </div>
              <button ${buttonAttrs({ tone: "ghost", size: "small", data: { action: "close-create" } })}>Закрыть</button>
            </div>
            ${fieldHtml({
              label: "Название",
              control: `<input name="name" required placeholder="Например: глубокая работа" />`,
            })}
            ${fieldHtml({
              label: "Цвет",
              control: `<input name="color" type="color" value="#c98b38" />`,
            })}
            <button ${buttonAttrs({ type: "submit" })}>Добавить тег</button>
          </form>
        `,
      });
    }

    return "";
  }

  private renderEditModal(workspace: ReturnType<typeof appStore.getWorkspace>): string {
    const editing = this.editing;
    if (!editing) {
      return "";
    }

    if (editing.type === "project") {
      const project = workspace.projects.find((item) => item.id === editing.id);
      if (!project) {
        return "";
      }

      return modalHtml({
        label: "Редактирование проекта",
        body: `
          <form class="form-grid" data-form="edit-project">
            <div class="card-header" style="margin-bottom: 0;">
              <div>
                <p class="eyebrow">Проекты</p>
                <h2>Редактирование проекта</h2>
              </div>
              <button ${buttonAttrs({ tone: "ghost", size: "small", data: { action: "close-edit" } })}>Закрыть</button>
            </div>
            ${fieldHtml({
              label: "Название",
              control: `<input name="name" required value="${escapeHtml(project.name)}" />`,
            })}
            ${fieldHtml({
              label: "Цвет",
              control: `<input name="color" type="color" value="${escapeHtml(project.color)}" />`,
            })}
            ${fieldHtml({
              label: "Описание",
              control: `<textarea name="description" placeholder="Для чего этот проект">${escapeHtml(project.description)}</textarea>`,
            })}
            <button ${buttonAttrs({ type: "submit" })}>Сохранить проект</button>
          </form>
        `,
      });
    }

    const tag = workspace.tags.find((item) => item.id === editing.id);
    if (!tag) {
      return "";
    }

    return modalHtml({
      label: "Редактирование тега",
      body: `
        <form class="form-grid" data-form="edit-tag">
          <div class="card-header" style="margin-bottom: 0;">
            <div>
              <p class="eyebrow">Теги</p>
              <h2>Редактирование тега</h2>
            </div>
            <button ${buttonAttrs({ tone: "ghost", size: "small", data: { action: "close-edit" } })}>Закрыть</button>
          </div>
          ${fieldHtml({
            label: "Название",
            control: `<input name="name" required value="${escapeHtml(tag.name)}" />`,
          })}
          ${fieldHtml({
            label: "Цвет",
            control: `<input name="color" type="color" value="${escapeHtml(tag.color)}" />`,
          })}
          <button ${buttonAttrs({ type: "submit" })}>Сохранить тег</button>
        </form>
      `,
    });
  }

  private render(): void {
    const workspace = appStore.getWorkspace();
    const settings = workspace.settings;
    const notificationStatus = getTimerNotificationStatus();
    const reminderMinutes = settings.eventReminderMinutes;
    const allDayHour = settings.allDayReminderHour;
    const themePreference = getThemePreference();
    const syncState = getSyncState();
    const isSyncing = syncState.status === "syncing";
    const root = renderShadow(
      this,
      `
        <section class="view-grid">
          ${this.renderCreateModal()}
          ${this.renderEditModal(workspace)}

          <article class="card form-grid">
            <div>
              <p class="eyebrow">Оформление</p>
              <h2>Тема интерфейса</h2>
            </div>
            ${fieldHtml({
              label: "Тема",
              control: `<select data-theme-select>
                ${(
                  [
                    ["system", "Системная"],
                    ["light", "Светлая"],
                    ["dark", "Тёмная"],
                  ] as Array<[ThemePreference, string]>
                )
                  .map(([value, label]) => `<option value="${value}" ${value === themePreference ? "selected" : ""}>${label}</option>`)
                  .join("")}
              </select>`,
            })}
          </article>

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
              ${fieldHtml({
                label: "Цель по времени в неделю, часов (0 — выключено)",
                control: `<input name="weeklyGoalHours" type="number" min="0" max="120" step="0.5" value="${settings.weeklyTimeGoalMinutes / 60}" />`,
              })}
              ${fieldHtml({
                label: "Ёмкость дня для планирования, часов (0 — выключено)",
                control: `<input name="dayCapacityHours" type="number" min="0" max="24" step="0.5" value="${settings.dailyCapacityMinutes / 60}" />`,
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
              <div>
                <p class="eyebrow" style="margin-bottom: var(--space-2);">Снапшоты</p>
                <p class="muted">Автобэкапы пишутся раз в час: 7 дневных + 4 недельных.</p>
                <div class="item-list" style="margin-top: var(--space-2);">
                  ${
                    this.backups.length
                      ? this.backups
                          .map(
                            (backup) => `
                              <div class="list-item backup-row">
                                <span>${escapeHtml(formatBackupDate(backup.createdAt))}</span>
                                <span class="muted">${Math.max(1, Math.round(backup.sizeBytes / 1024))} КБ</span>
                                <button ${buttonAttrs({ tone: "ghost", size: "small", data: { restoreBackup: backup.id } })}>Восстановить</button>
                              </div>
                            `,
                          )
                          .join("")
                      : emptyStateHtml("Снапшоты появятся после первого часа работы.")
                  }
                </div>
              </div>
            </article>
          </div>

          <article class="card form-grid">
            <div class="card-header">
              <div>
                <p class="eyebrow">Уведомления</p>
                <h2>Напоминания: три шага</h2>
              </div>
              ${badgeHtml(formatNotificationStatus(notificationStatus))}
            </div>

            <div class="notify-step">
              <p class="eyebrow">1. Разрешение браузера</p>
              <p class="muted">${getNotificationStatusHint(notificationStatus)}</p>
              <div class="row-actions">
                <button ${buttonAttrs({
                  data: { action: "request-notifications" },
                  disabled: notificationStatus !== "default",
                })}>Разрешить уведомления</button>
              </div>
            </div>

            <div class="notify-step">
              <p class="eyebrow">2. О чём напоминать</p>
              ${fieldHtml({
                label: "Напоминать о событиях календаря",
                control: `<select data-reminder-minutes>
                  ${REMINDER_OPTIONS.map(
                    (minutes) =>
                      `<option value="${minutes}" ${minutes === reminderMinutes ? "selected" : ""}>${
                        minutes === 0 ? "Выключено" : `За ${minutes} минут`
                      }</option>`,
                  ).join("")}
                </select>`,
              })}
              ${fieldHtml({
                label: "Напоминание о делах на весь день и дедлайнах",
                control: `<select data-allday-hour>
                  ${ALLDAY_REMINDER_OPTIONS.map(
                    (hour) =>
                      `<option value="${hour}" ${hour === allDayHour ? "selected" : ""}>${
                        hour < 0 ? "Выключено" : `Утром в ${hour}:00`
                      }</option>`,
                  ).join("")}
                </select>`,
              })}
              <p class="muted">Напоминание срабатывает один раз перед началом события.</p>
            </div>

            <div class="notify-step">
              <p class="eyebrow">3. Доставка при закрытом приложении</p>
              <p class="muted">${this.pushHint()}</p>
              <div class="row-actions">
                ${
                  this.pushStatus === "on"
                    ? `<button ${buttonAttrs({ tone: "ghost", data: { action: "disable-push" } })}>Отключить push на этом устройстве</button>`
                    : `<button ${buttonAttrs({
                        data: { action: "enable-push" },
                        disabled: this.pushStatus !== "off",
                      })}>Включить push на этом устройстве</button>`
                }
              </div>
            </div>
          </article>

          <form class="card form-grid" data-form="sync">
            <div class="card-header">
              <div>
                <p class="eyebrow">Синхронизация</p>
                <h2>Node.js + Postgres сервер</h2>
              </div>
              ${badgeHtml(formatSyncStatus(syncState))}
            </div>
            <p class="muted">${
              syncState.authenticated
                ? `Вход выполнен: ${escapeHtml(syncState.user?.handle ?? "passkey")}. Последняя синхронизация: ${formatNullableDate(syncState.lastSyncedAt)}.`
                : "Локальная работа продолжит работать без сервера. Для синхронизации между устройствами войдите через passkey."
            }</p>
            ${
              syncState.error
                ? `<p class="muted">Ошибка: ${
                    syncState.error.includes("Failed to fetch")
                      ? "сервер недоступен. Проверьте адрес и что сервер запущен."
                      : escapeHtml(syncState.error)
                  }</p>`
                : ""
            }
            ${fieldHtml({
              label: "Адрес сервера",
              control: `<input name="serverUrl" required value="${escapeHtml(syncState.serverUrl)}" placeholder="http://127.0.0.1:8787" />`,
            })}
            <div class="row-actions">
              <button ${buttonAttrs({ type: "submit", tone: "ghost", disabled: isSyncing })}>Сохранить адрес</button>
              <button ${buttonAttrs({ type: "button", data: { action: "register-passkey" }, disabled: isSyncing })}>Создать passkey</button>
              <button ${buttonAttrs({ type: "button", data: { action: "login-passkey" }, disabled: isSyncing })}>Войти passkey</button>
              <button ${buttonAttrs({ type: "button", data: { action: "sync-now" }, disabled: isSyncing || !syncState.authenticated })}>Синхронизировать сейчас</button>
              <button ${buttonAttrs({ type: "button", tone: "ghost", data: { action: "logout-sync" }, disabled: isSyncing || !syncState.authenticated })}>Выйти</button>
            </div>
          </form>

          <div class="split-grid">
            <article class="card">
              <div class="card-header">
                <div>
                  <p class="eyebrow">Проекты</p>
                  <h2>Список</h2>
                </div>
                <div class="row-actions">
                  ${badgeHtml(workspace.projects.length)}
                  <button ${buttonAttrs({ tone: "ghost", size: "small", data: { action: "open-project" } })}>+ Добавить</button>
                </div>
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
                          <div class="row-actions">
                            <button ${buttonAttrs({ tone: "ghost", size: "small", data: { editProject: project.id } })}>Изменить</button>
                            <button ${buttonAttrs({ tone: "danger", size: "small", data: { deleteProject: project.id } })}>Удалить</button>
                          </div>
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
                <div class="row-actions">
                  ${badgeHtml(workspace.tags.length)}
                  <button ${buttonAttrs({ tone: "ghost", size: "small", data: { action: "open-tag" } })}>+ Добавить</button>
                </div>
              </div>
              <div class="item-list">
                ${
                  workspace.tags.length
                    ? workspace.tags
                        .map((tag) => {
                          const usage =
                            workspace.tasks.filter((task) => task.tagIds.includes(tag.id)).length +
                            workspace.notes.filter((note) => note.tagIds.includes(tag.id)).length;

                          return `
                        <div class="list-item">
                          <div class="project-row">
                            <div>
                              <div class="meta-row">
                                <span class="color-dot" style="--project-color: ${escapeHtml(tag.color)}"></span>
                                <strong>${escapeHtml(tag.name)}</strong>
                              </div>
                              <p class="muted">Используется: ${usage}</p>
                            </div>
                            <div class="row-actions">
                              <button ${buttonAttrs({ tone: "ghost", size: "small", data: { editTag: tag.id } })}>Изменить</button>
                              <button ${buttonAttrs({ tone: "danger", size: "small", data: { deleteTag: tag.id } })}>Удалить</button>
                            </div>
                          </div>
                        </div>
                      `;
                        })
                        .join("")
                    : emptyStateHtml("Тегов пока нет.")
                }
              </div>
            </article>
          </div>

          <p class="muted settings-footer">
            Схема v${SCHEMA_VERSION} · ${workspace.tasks.length + workspace.notes.length} задач и заметок ·
            хранилище IndexedDB <code>prodnote-db</code> · формат .prodnote.json
          </p>
        </section>
      `,
      `
        .settings-footer {
          font-size: var(--text-xs);
          text-align: center;
        }

        .settings-footer code {
          background: var(--paper-strong);
          border-radius: var(--radius-sm);
          padding: 0.05rem 0.3rem;
        }

        .backup-row {
          align-items: center;
          display: flex;
          flex-wrap: wrap;
          gap: var(--space-3);
          justify-content: space-between;
        }

        .notify-step {
          border-top: 1px solid var(--line);
          display: grid;
          gap: var(--space-2);
          padding-top: var(--space-3);
        }

        .file-label {
          align-items: center;
          background: var(--surface);
          border: 1px solid var(--line-strong);
          border-radius: var(--radius-md);
          color: var(--ink-soft);
          cursor: pointer;
          display: inline-flex;
          font-size: var(--text-sm);
          font-weight: 600;
          min-height: 2.5rem;
          padding: 0 var(--space-4);
        }

        .file-label input {
          display: none;
        }

        .color-dot {
          background: var(--project-color);
          border-radius: var(--radius-pill);
          display: inline-block;
          height: 0.9rem;
          width: 0.9rem;
        }

        .project-row {
          align-items: center;
          display: flex;
          gap: var(--space-4);
          justify-content: space-between;
        }

        .tag-cloud {
          display: flex;
          flex-wrap: wrap;
          gap: var(--space-2);
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
        ...appStore.getWorkspace().settings,
        pomodoroFocusMinutes: Number(requireInput(form, "focus").value),
        pomodoroShortBreakMinutes: Number(requireInput(form, "shortBreak").value),
        pomodoroLongBreakMinutes: Number(requireInput(form, "longBreak").value),
        pomodoroLongBreakEvery: Number(requireInput(form, "longBreakEvery").value),
        weekStartsOn: Number(requireSelect(form, "weekStartsOn").value) === 7 ? 7 : 1,
        weeklyTimeGoalMinutes: Math.max(0, Math.round(Number(requireInput(form, "weeklyGoalHours").value) * 60)),
        dailyCapacityMinutes: Math.max(0, Math.round(Number(requireInput(form, "dayCapacityHours").value) * 60)),
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
      this.creating = null;
      this.render();
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
      this.creating = null;
      this.render();
    });

    root.querySelector<HTMLFormElement>('[data-form="edit-project"]')?.addEventListener("submit", (event) => {
      event.preventDefault();
      const form = event.currentTarget;
      if (!(form instanceof HTMLFormElement) || this.editing?.type !== "project") {
        return;
      }

      void appStore.updateProject({
        projectId: this.editing.id,
        name: requireInput(form, "name").value,
        color: requireInput(form, "color").value,
        description: requireTextArea(form, "description").value,
      });
      this.editing = null;
      this.render();
    });

    root.querySelector<HTMLFormElement>('[data-form="edit-tag"]')?.addEventListener("submit", (event) => {
      event.preventDefault();
      const form = event.currentTarget;
      if (!(form instanceof HTMLFormElement) || this.editing?.type !== "tag") {
        return;
      }

      void appStore.updateTag({
        tagId: this.editing.id,
        name: requireInput(form, "name").value,
        color: requireInput(form, "color").value,
      });
      this.editing = null;
      this.render();
    });

    root.querySelector<HTMLButtonElement>('[data-action="open-project"]')?.addEventListener("click", () => {
      this.editing = null;
      this.creating = "project";
      this.render();
    });

    root.querySelector<HTMLButtonElement>('[data-action="open-tag"]')?.addEventListener("click", () => {
      this.editing = null;
      this.creating = "tag";
      this.render();
    });

    root.querySelector<HTMLButtonElement>('[data-action="close-create"]')?.addEventListener("click", () => {
      this.creating = null;
      this.render();
    });

    root.querySelectorAll<HTMLButtonElement>("[data-edit-project]").forEach((button) => {
      button.addEventListener("click", () => {
        const id = button.dataset.editProject;
        if (id) {
          this.creating = null;
          this.editing = { type: "project", id };
          this.render();
        }
      });
    });

    root.querySelectorAll<HTMLButtonElement>("[data-edit-tag]").forEach((button) => {
      button.addEventListener("click", () => {
        const id = button.dataset.editTag;
        if (id) {
          this.creating = null;
          this.editing = { type: "tag", id };
          this.render();
        }
      });
    });

    root.querySelector<HTMLButtonElement>('[data-action="close-edit"]')?.addEventListener("click", () => {
      this.editing = null;
      this.render();
    });

    setBodyScrollLock(this.creating !== null || this.editing !== null);

    if (this.creating || this.editing) {
      wireModal(root, {
        onClose: () => {
          this.creating = null;
          this.editing = null;
          this.render();
        },
      });
    }

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

    root.querySelectorAll<HTMLButtonElement>("[data-delete-tag]").forEach((button) => {
      button.addEventListener("click", () => {
        const tagId = button.dataset.deleteTag;
        const tag = workspace.tags.find((item) => item.id === tagId);
        if (!tagId || !tag) {
          return;
        }

        const usage =
          workspace.tasks.filter((task) => task.tagIds.includes(tagId)).length +
          workspace.notes.filter((note) => note.tagIds.includes(tagId)).length;
        const confirmed = confirmDestructive(
          `Удалить тег «${tag.name}»?\n\nОн будет снят с ${usage} задач и заметок. Сами записи останутся.`,
        );

        if (confirmed) {
          void appStore.deleteTag(tagId);
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

    root.querySelector<HTMLButtonElement>('[data-action="enable-push"]')?.addEventListener("click", () => {
      void enablePush()
        .catch(() => "server-off" as const)
        .then((status) => {
          this.pushStatus = status;
          this.render();
        });
    });

    root.querySelector<HTMLButtonElement>('[data-action="disable-push"]')?.addEventListener("click", () => {
      void disablePush().then((status) => {
        this.pushStatus = status;
        this.render();
      });
    });

    root.querySelector<HTMLSelectElement>("[data-reminder-minutes]")?.addEventListener("change", (event) => {
      if (event.currentTarget instanceof HTMLSelectElement) {
        void appStore.updateSettings({
          ...appStore.getWorkspace().settings,
          eventReminderMinutes: Math.max(0, Number(event.currentTarget.value)),
        });
      }
    });

    root.querySelector<HTMLSelectElement>("[data-allday-hour]")?.addEventListener("change", (event) => {
      if (event.currentTarget instanceof HTMLSelectElement) {
        void appStore.updateSettings({
          ...appStore.getWorkspace().settings,
          allDayReminderHour: Math.max(-1, Math.min(23, Number(event.currentTarget.value))),
        });
      }
    });

    root.querySelector<HTMLSelectElement>("[data-theme-select]")?.addEventListener("change", (event) => {
      if (event.currentTarget instanceof HTMLSelectElement) {
        setThemePreference(event.currentTarget.value as ThemePreference);
      }
    });

    root.querySelector<HTMLFormElement>('[data-form="sync"]')?.addEventListener("submit", (event) => {
      event.preventDefault();
      const form = event.currentTarget;
      if (!(form instanceof HTMLFormElement)) {
        return;
      }

      setSyncServerUrl(requireInput(form, "serverUrl").value);
      void refreshSyncSession();
    });

    root.querySelector<HTMLButtonElement>('[data-action="register-passkey"]')?.addEventListener("click", () => {
      void registerPasskey()
        .then(() => appStore.syncNow())
        .catch((error: unknown) => window.alert(`Не удалось создать passkey: ${String(error)}`));
    });

    root.querySelector<HTMLButtonElement>('[data-action="login-passkey"]')?.addEventListener("click", () => {
      void loginPasskey()
        .then(() => appStore.syncNow())
        .catch((error: unknown) => window.alert(`Не удалось войти: ${String(error)}`));
    });

    root.querySelector<HTMLButtonElement>('[data-action="sync-now"]')?.addEventListener("click", () => {
      void appStore.syncNow().catch((error: unknown) => window.alert(`Не удалось синхронизировать: ${String(error)}`));
    });

    root.querySelector<HTMLButtonElement>('[data-action="logout-sync"]')?.addEventListener("click", () => {
      void logoutSync().catch((error: unknown) => window.alert(`Не удалось выйти: ${String(error)}`));
    });

    root.querySelectorAll<HTMLButtonElement>("[data-restore-backup]").forEach((button) => {
      button.addEventListener("click", () => {
        const id = button.dataset.restoreBackup;
        const summary = this.backups.find((backup) => backup.id === id);
        if (!id || !summary) {
          return;
        }

        void readBackup(id)
          .then((payload) => {
            if (!payload) {
              throw new Error("снапшот не найден");
            }
            const preview = validateImportSnapshot(JSON.parse(payload) as unknown);
            const confirmed = confirmDestructive(
              `Восстановить снапшот от ${formatBackupDate(summary.createdAt)}?\n\nПроекты: ${preview.projects}\nЗадачи: ${preview.tasks}\nЗаметки: ${preview.notes}\nСессии: ${preview.sessions}\n\nТекущие локальные данные будут заменены.`,
            );
            if (!confirmed) {
              return;
            }
            return appStore.importWorkspace(parseWorkspaceExport(payload));
          })
          .catch((error: unknown) => {
            window.alert(`Не удалось восстановить снапшот: ${String(error)}`);
          });
      });
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

function formatSyncStatus(syncState: ReturnType<typeof getSyncState>): string {
  if (syncState.status === "syncing") {
    return "Синхронизация";
  }

  if (syncState.authenticated) {
    return "Подключено";
  }

  if (syncState.status === "offline") {
    return "Офлайн";
  }

  return "Локально";
}

function formatNullableDate(value: string | null): string {
  return value ? new Date(value).toLocaleString("ru-RU") : "ещё не было";
}

function formatBackupDate(value: string): string {
  return new Intl.DateTimeFormat("ru-RU", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}
