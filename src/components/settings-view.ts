import { SCHEMA_VERSION } from "../domain/types";
import { escapeHtml } from "../domain/markdown";
import { getTimerNotificationStatus, requestTimerNotificationPermission } from "../platform/notifications";
import { appStore } from "../state";
import { parseWorkspaceExport, stringifyExport, validateImportSnapshot } from "../storage/export";
import {
  ALLDAY_REMINDER_OPTIONS,
  getAllDayReminderHour,
  getEventReminderMinutes,
  REMINDER_OPTIONS,
  setAllDayReminderHour,
  setEventReminderMinutes,
} from "../storage/reminder-prefs";
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
import { badgeHtml, buttonAttrs, fieldHtml, modalHtml } from "../ui/html";
import { setBodyScrollLock, wireModal } from "./modal";
import { renderShadow } from "./shadow";
import { requireInput, requireSelect, requireTextArea } from "./view-utils";

export class SettingsView extends HTMLElement {
  private unsubscribe: (() => void) | null = null;
  private syncUnsubscribe: (() => void) | null = null;
  private creating: "project" | "tag" | null = null;

  connectedCallback(): void {
    this.unsubscribe = appStore.subscribe(() => this.render());
    this.syncUnsubscribe = subscribeSync(() => this.render());
    void refreshSyncSession();
    this.render();
  }

  disconnectedCallback(): void {
    this.unsubscribe?.();
    this.syncUnsubscribe?.();
    setBodyScrollLock(false);
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

  private render(): void {
    const workspace = appStore.getWorkspace();
    const settings = workspace.settings;
    const notificationStatus = getTimerNotificationStatus();
    const reminderMinutes = getEventReminderMinutes();
    const allDayHour = getAllDayReminderHour();
    const themePreference = getThemePreference();
    const syncState = getSyncState();
    const isSyncing = syncState.status === "syncing";
    const root = renderShadow(
      this,
      `
        <section class="view-grid">
          ${this.renderCreateModal()}

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
            <p class="muted">Напоминание срабатывает один раз перед началом события (только когда приложение открыто).</p>
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
            ${syncState.error ? `<p class="muted">Ошибка: ${escapeHtml(syncState.error)}</p>` : ""}
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
                <div class="row-actions">
                  ${badgeHtml(workspace.tags.length)}
                  <button ${buttonAttrs({ tone: "ghost", size: "small", data: { action: "open-tag" } })}>+ Добавить</button>
                </div>
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
        pomodoroFocusMinutes: Number(requireInput(form, "focus").value),
        pomodoroShortBreakMinutes: Number(requireInput(form, "shortBreak").value),
        pomodoroLongBreakMinutes: Number(requireInput(form, "longBreak").value),
        pomodoroLongBreakEvery: Number(requireInput(form, "longBreakEvery").value),
        weekStartsOn: Number(requireSelect(form, "weekStartsOn").value) === 7 ? 7 : 1,
        weeklyTimeGoalMinutes: Math.max(0, Math.round(Number(requireInput(form, "weeklyGoalHours").value) * 60)),
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

    root.querySelector<HTMLButtonElement>('[data-action="open-project"]')?.addEventListener("click", () => {
      this.creating = "project";
      this.render();
    });

    root.querySelector<HTMLButtonElement>('[data-action="open-tag"]')?.addEventListener("click", () => {
      this.creating = "tag";
      this.render();
    });

    root.querySelector<HTMLButtonElement>('[data-action="close-create"]')?.addEventListener("click", () => {
      this.creating = null;
      this.render();
    });

    setBodyScrollLock(this.creating !== null);

    if (this.creating) {
      wireModal(root, {
        onClose: () => {
          this.creating = null;
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

    root.querySelector<HTMLSelectElement>("[data-reminder-minutes]")?.addEventListener("change", (event) => {
      if (event.currentTarget instanceof HTMLSelectElement) {
        setEventReminderMinutes(Number(event.currentTarget.value));
      }
    });

    root.querySelector<HTMLSelectElement>("[data-allday-hour]")?.addEventListener("change", (event) => {
      if (event.currentTarget instanceof HTMLSelectElement) {
        setAllDayReminderHour(Number(event.currentTarget.value));
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
