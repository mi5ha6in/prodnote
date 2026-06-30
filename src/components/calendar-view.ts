import {
  buildMonthMatrix,
  buildWeekDays,
  dayKey,
  groupByHorizon,
  isMultiDay,
  layoutWeekSegments,
  minutesIntoDay,
  overflowForColumn,
  taskDeadlineItems,
  toCalendarItems,
  weekdayLabels,
  type CalendarItem,
  type MonthCell,
} from "../domain/calendar";
import { EVENT_KIND_LABELS, SESSION_MODE_LABELS } from "../domain/defaults";
import { buildIcs, parseIcs } from "../domain/ics";
import { expandRecurrence, type RecurrenceRule } from "../domain/recurrence";
import { escapeHtml } from "../domain/markdown";
import { requestTimerNotificationPermission } from "../platform/notifications";
import { formatDuration } from "../domain/stats";
import type { CalendarEvent, CalendarEventKind, Workspace } from "../domain/types";
import { appStore } from "../state";
import { confirmDestructive } from "../ui/actions";
import { buttonAttrs, fieldHtml, metricBarHtml, modalHtml, viewHeaderHtml } from "../ui/html";
import { setBodyScrollLock, wireModal } from "./modal";
import { renderShadow } from "./shadow";
import {
  formatDate,
  formatDateTime,
  fromDateTimeLocalValue,
  getProjectName,
  getTaskName,
  renderProjectOptions,
  renderTaskOptions,
  requireInput,
  requireSelect,
  requireTextArea,
  toDateTimeLocalValue,
} from "./view-utils";

const EVENT_KINDS: CalendarEventKind[] = ["event", "focus", "meeting", "deadline", "review"];
const MONTH_LANE_CAP = 3;
const MONTH_LABELS = [
  "Январь",
  "Февраль",
  "Март",
  "Апрель",
  "Май",
  "Июнь",
  "Июль",
  "Август",
  "Сентябрь",
  "Октябрь",
  "Ноябрь",
  "Декабрь",
];

export class CalendarView extends HTMLElement {
  private unsubscribe: (() => void) | null = null;
  private viewMode: "agenda" | "month" | "week" = "agenda";
  private modal: "event" | "manual" | null = null;
  private editingEventId: string | null = null;
  private draftAllDay = false;
  private draftStart: string | null = null;
  private monthCursor = { year: new Date().getFullYear(), month: new Date().getMonth() };
  private weekAnchor = new Date();
  private draggingEventId: string | null = null;

  connectedCallback(): void {
    this.unsubscribe = appStore.subscribe(() => this.render());
    this.render();
  }

  disconnectedCallback(): void {
    this.unsubscribe?.();
    setBodyScrollLock(false);
  }

  private render(): void {
    const workspace = appStore.getWorkspace();
    const now = new Date();
    const items = [...toCalendarItems(workspace.events), ...taskDeadlineItems(workspace.tasks)].sort(
      (a, b) => Date.parse(a.startsAt) - Date.parse(b.startsAt),
    );
    const sortedSessions = [...workspace.sessions].sort((a, b) => Date.parse(b.startedAt) - Date.parse(a.startedAt));

    const root = renderShadow(
      this,
      `
        <section class="view-grid">
          ${this.renderModal(workspace)}

          ${viewHeaderHtml({
            actions: `
              <div class="segmented" role="group" aria-label="Вид календаря">
                <button type="button" data-view="agenda" aria-pressed="${this.viewMode === "agenda"}">Повестка</button>
                <button type="button" data-view="week" aria-pressed="${this.viewMode === "week"}">Неделя</button>
                <button type="button" data-view="month" aria-pressed="${this.viewMode === "month"}">Месяц</button>
              </div>
              <button ${buttonAttrs({ tone: "ghost", data: { action: "import-ics" } })}>Импорт .ics</button>
              <button ${buttonAttrs({ tone: "ghost", data: { action: "export-ics" }, disabled: workspace.events.length === 0 })}>Экспорт .ics</button>
              <button ${buttonAttrs({ tone: "ghost", data: { action: "open-manual" }, disabled: workspace.tasks.length === 0 })}>+ Записать время</button>
              <button ${buttonAttrs({ data: { action: "open-event" } })}>+ Событие</button>
            `,
          })}

          ${metricBarHtml([
            { label: "Событий", value: workspace.events.length, hint: "Включая импортированные" },
            { label: "Сессий", value: workspace.sessions.length, hint: "Фактический журнал" },
          ])}

          ${
            this.viewMode === "agenda"
              ? this.renderAgenda(items, workspace, now)
              : this.viewMode === "week"
                ? this.renderWeek(items, workspace)
                : this.renderMonth(items, workspace)
          }

          <article class="card">
            <div class="card-header">
              <div>
                <p class="eyebrow">Факт</p>
                <h2>Рабочие сессии</h2>
              </div>
              <span class="status-pill">${sortedSessions.length}</span>
            </div>
            <div class="item-list">
              ${
                sortedSessions.length
                  ? sortedSessions
                      .slice(0, 12)
                      .map(
                        (session) => `
                          <div class="list-item">
                            <div class="meta-row">
                              <span class="status-pill">${SESSION_MODE_LABELS[session.mode]}</span>
                              <span>${formatDuration(session.durationMinutes)}</span>
                              <span>${formatDateTime(session.startedAt)}</span>
                            </div>
                            <strong>${escapeHtml(getTaskName(workspace.tasks, session.taskId))}</strong>
                            ${session.note ? `<p class="muted">${escapeHtml(session.note)}</p>` : ""}
                          </div>
                        `,
                      )
                      .join("")
                  : `<div class="empty">Остановите таймер или добавьте ручную сессию.</div>`
              }
            </div>
          </article>

          <input type="file" accept=".ics,text/calendar" data-ics-input hidden />
        </section>
      `,
      this.styles(),
    );

    setBodyScrollLock(this.modal !== null);
    this.bindActions(root);
  }

  private renderAgenda(items: CalendarItem[], workspace: Workspace, now: Date): string {
    const sections = groupByHorizon(items, now, workspace.settings.weekStartsOn);

    if (!sections.length) {
      return `<div class="empty">Пока нет событий. Создайте событие или импортируйте .ics.</div>`;
    }

    return `
      <div class="agenda">
        ${sections
          .map(
            (section) => `
              <section class="agenda-section">
                <div class="agenda-head">
                  <h3>${escapeHtml(section.label)}</h3>
                  <span class="status-pill">${section.items.length}</span>
                </div>
                <div class="item-list">
                  ${section.items.map((item) => this.renderAgendaItem(item, workspace)).join("")}
                </div>
              </section>
            `,
          )
          .join("")}
      </div>
    `;
  }

  private renderAgendaItem(item: CalendarItem, workspace: Workspace): string {
    const when = item.allDay
      ? isMultiDay(item)
        ? `${formatDate(item.startsAt)} – ${formatDate(item.endsAt)}`
        : "Весь день"
      : isMultiDay(item)
        ? `${formatDateTime(item.startsAt)} – ${formatDateTime(item.endsAt)}`
        : formatDateTime(item.startsAt);
    const taskName = item.taskId ? getTaskName(workspace.tasks, item.taskId) : "";
    const projectName = item.projectId ? getProjectName(workspace.projects, item.projectId) : "";
    const kindLabel = EVENT_KIND_LABELS[item.kind as CalendarEventKind] ?? item.kind;
    const editable = item.source === "event";

    return `
      <div class="list-item calendar-item ${editable ? "is-editable" : ""}" ${
        editable ? `data-edit-event="${escapeHtml(item.id)}" tabindex="0"` : ""
      }>
        <div class="calendar-item-row">
          <div class="calendar-item-main">
            <strong>${escapeHtml(item.title)}</strong>
            <div class="meta-row">
              <span class="status-pill">${escapeHtml(kindLabel)}</span>
              <span>${escapeHtml(when)}</span>
              ${taskName && item.source !== "deadline" ? `<span>${escapeHtml(taskName)}</span>` : ""}
              ${projectName ? `<span>${escapeHtml(projectName)}</span>` : ""}
            </div>
          </div>
          ${editable ? `<button ${buttonAttrs({ tone: "ghost", size: "small", data: { deleteEvent: item.id } })}>Удалить</button>` : ""}
        </div>
      </div>
    `;
  }

  private renderMonth(items: CalendarItem[], workspace: Workspace): string {
    const { year, month } = this.monthCursor;
    const weeks = buildMonthMatrix(year, month, workspace.settings.weekStartsOn, new Date());
    const labels = weekdayLabels(workspace.settings.weekStartsOn);

    return `
      <article class="card month-card">
        <div class="card-header month-nav">
          <button ${buttonAttrs({ tone: "ghost", size: "small", data: { action: "prev-month" } })}>‹</button>
          <h2>${MONTH_LABELS[month]} ${year}</h2>
          <div class="row-actions">
            <button ${buttonAttrs({ tone: "ghost", size: "small", data: { action: "today-month" } })}>Сегодня</button>
            <button ${buttonAttrs({ tone: "ghost", size: "small", data: { action: "next-month" } })}>›</button>
          </div>
        </div>
        <div class="month-head">
          ${labels.map((label) => `<div class="month-weekday">${escapeHtml(label)}</div>`).join("")}
        </div>
        <div class="month-weeks" role="grid" aria-label="Сетка месяца">
          ${weeks.map((week) => this.renderWeekRow(week, items)).join("")}
        </div>
      </article>
    `;
  }

  private renderWeekRow(week: MonthCell[], items: CalendarItem[]): string {
    const lanes = layoutWeekSegments(week, items);
    const visible = lanes.slice(0, MONTH_LANE_CAP);

    return `
      <div class="month-week" style="--lanes: ${visible.length}">
        <div class="week-days" role="row">
          ${week
            .map((cell, col) => {
              const overflow = overflowForColumn(lanes, col, MONTH_LANE_CAP);
              return `
                <div
                  class="month-cell ${cell.inMonth ? "" : "is-outside"} ${cell.isToday ? "is-today" : ""}"
                  data-new-event-date="${cell.dateKey}"
                  role="gridcell"
                  aria-label="${cell.dateKey}"
                  tabindex="0"
                >
                  <span class="month-day">${cell.day}</span>
                  ${overflow ? `<span class="month-more">+${overflow}</span>` : ""}
                </div>
              `;
            })
            .join("")}
        </div>
        <div class="week-bars">
          ${visible
            .map((lane, laneIndex) =>
              lane
                .map(
                  (segment) => `
                    <button
                      class="month-bar ${segment.continuesLeft ? "cont-left" : ""} ${segment.continuesRight ? "cont-right" : ""}"
                      style="grid-column: ${segment.startCol + 1} / span ${segment.span}; grid-row: ${laneIndex + 1};"
                      ${
                        segment.item.source === "event"
                          ? `data-edit-event="${escapeHtml(segment.item.id)}" draggable="true" data-drag-event="${escapeHtml(segment.item.id)}"`
                          : "disabled"
                      }
                      title="${escapeHtml(segment.item.title)}"
                    >${escapeHtml(segment.item.title)}</button>
                  `,
                )
                .join(""),
            )
            .join("")}
        </div>
      </div>
    `;
  }

  private renderWeek(items: CalendarItem[], workspace: Workspace): string {
    const days = buildWeekDays(this.weekAnchor, workspace.settings.weekStartsOn);
    const labels = weekdayLabels(workspace.settings.weekStartsOn);
    const allDayItems = items.filter((item) => item.allDay || isMultiDay(item));
    const timed = items.filter((item) => !item.allDay && !isMultiDay(item));
    const allDayLanesAll = layoutWeekSegments(days, allDayItems);
    const allDayLanes = allDayLanesAll.slice(0, MONTH_LANE_CAP);
    const allDayOverflow = days.map((_, col) => overflowForColumn(allDayLanesAll, col, MONTH_LANE_CAP));
    const hours = Array.from({ length: 24 }, (_, hour) => hour);
    const rangeLabel = `${formatDate(days[0].date.toISOString())} – ${formatDate(days[6].date.toISOString())}`;

    return `
      <article class="card week-card">
        <div class="card-header month-nav">
          <button ${buttonAttrs({ tone: "ghost", size: "small", data: { action: "prev-week" } })}>‹</button>
          <h2>${escapeHtml(rangeLabel)}</h2>
          <div class="row-actions">
            <button ${buttonAttrs({ tone: "ghost", size: "small", data: { action: "today-week" } })}>Сегодня</button>
            <button ${buttonAttrs({ tone: "ghost", size: "small", data: { action: "next-week" } })}>›</button>
          </div>
        </div>

        <div class="week-head">
          <div class="week-gutter-spacer"></div>
          ${days
            .map(
              (day, index) => `
                <div class="week-day-head ${day.isToday ? "is-today" : ""}" data-new-event-date="${day.dateKey}" tabindex="0">
                  <span class="week-day-label">${escapeHtml(labels[index])}</span>
                  <span class="week-day-num">${day.day}</span>
                </div>
              `,
            )
            .join("")}
        </div>

        ${
          allDayLanes.length
            ? `<div class="week-allday">
                <div class="week-gutter-spacer">весь день</div>
                <div class="week-allday-bars">
                  ${allDayLanes
                    .map((lane, laneIndex) =>
                      lane
                        .map(
                          (segment) => `
                            <button
                              class="month-bar ${segment.continuesLeft ? "cont-left" : ""} ${segment.continuesRight ? "cont-right" : ""}"
                              style="grid-column: ${segment.startCol + 1} / span ${segment.span}; grid-row: ${laneIndex + 1};"
                              ${segment.item.source === "event" ? `data-edit-event="${escapeHtml(segment.item.id)}"` : "disabled"}
                              title="${escapeHtml(segment.item.title)}"
                            >${escapeHtml(segment.item.title)}</button>
                          `,
                        )
                        .join(""),
                    )
                    .join("")}
                </div>
                ${
                  allDayOverflow.some((count) => count > 0)
                    ? `<div class="week-allday-more">
                        ${allDayOverflow.map((count) => `<span>${count > 0 ? `+${count}` : ""}</span>`).join("")}
                      </div>`
                    : ""
                }
              </div>`
            : ""
        }

        <div class="week-grid">
          <div class="week-gutter">
            ${hours.map((hour) => `<div class="week-hour-label">${hour.toString().padStart(2, "0")}:00</div>`).join("")}
          </div>
          ${days
            .map((day) => {
              const dayEvents = timed.filter((item) => dayKey(new Date(item.startsAt)) === day.dateKey);
              return `
                <div class="week-col ${day.isToday ? "is-today" : ""}" data-week-col="${day.dateKey}">
                  ${hours.map(() => `<div class="week-hour-line"></div>`).join("")}
                  ${dayEvents.map((item) => this.renderWeekEvent(item, workspace)).join("")}
                </div>
              `;
            })
            .join("")}
        </div>
      </article>
    `;
  }

  private renderWeekEvent(item: CalendarItem, workspace: Workspace): string {
    const startMin = minutesIntoDay(item.startsAt);
    const endMin = Math.max(startMin + 30, minutesIntoDay(item.endsAt));
    const topPct = (startMin / 1440) * 100;
    const heightPct = (Math.min(1440, endMin - startMin)) / 1440 * 100;
    const time = new Intl.DateTimeFormat("ru-RU", { hour: "2-digit", minute: "2-digit" }).format(new Date(item.startsAt));
    const taskName = item.taskId ? getTaskName(workspace.tasks, item.taskId) : "";
    const projectName = item.projectId ? getProjectName(workspace.projects, item.projectId) : "";

    return `
      <button
        class="week-event"
        style="top: ${topPct}%; height: ${heightPct}%;"
        ${item.source === "event" ? `data-edit-event="${escapeHtml(item.id)}" draggable="true" data-drag-event="${escapeHtml(item.id)}"` : "disabled"}
        title="${escapeHtml(item.title)}${taskName ? ` · ${escapeHtml(taskName)}` : ""}${projectName ? ` · ${escapeHtml(projectName)}` : ""}"
      >
        <strong>${escapeHtml(item.title)}</strong>
        <span>${escapeHtml(time)}</span>
        ${item.source === "event" ? `<span class="week-event-resize" data-resize-event="${escapeHtml(item.id)}" aria-hidden="true"></span>` : ""}
      </button>
    `;
  }

  private renderModal(workspace: Workspace): string {
    if (this.modal === "event") {
      return this.renderEventModal(workspace);
    }

    if (this.modal === "manual") {
      return this.renderManualModal(workspace);
    }

    return "";
  }

  private renderEventModal(workspace: Workspace): string {
    const event = this.editingEventId
      ? workspace.events.find((item) => item.id === this.editingEventId) ?? null
      : null;
    const allDay = this.draftAllDay;
    const startIso = event?.startsAt ?? this.draftStart ?? defaultStartIso();
    const endIso = event?.endsAt ?? new Date(Date.parse(startIso) + 60 * 60 * 1000).toISOString();

    const startControl = allDay
      ? `<input name="startsAt" type="date" required value="${toDateInputValue(startIso)}" />`
      : `<input name="startsAt" type="datetime-local" required value="${toDateTimeLocalValue(new Date(startIso))}" />`;
    const endControl = allDay
      ? `<input name="endsAt" type="date" required value="${toDateInputValue(endIso)}" />`
      : `<input name="endsAt" type="datetime-local" required value="${toDateTimeLocalValue(new Date(endIso))}" />`;

    return modalHtml({
      label: event ? "Редактирование события" : "Новое событие",
      body: `
        <form class="form-grid" data-form="event">
          <div class="card-header" style="margin-bottom: 0;">
            <div>
              <p class="eyebrow">${event ? "Редактирование" : "Календарь"}</p>
              <h2>${event ? escapeHtml(event.title) : "Новое событие"}</h2>
            </div>
            <button ${buttonAttrs({ tone: "ghost", size: "small", data: { action: "close-modal" } })}>Закрыть</button>
          </div>

          ${fieldHtml({
            label: "Название",
            control: `<input name="title" required value="${event ? escapeHtml(event.title) : ""}" placeholder="Например: встреча с командой" />`,
          })}

          <label class="check-row">
            <input type="checkbox" name="allDay" data-all-day ${allDay ? "checked" : ""} />
            <span>Весь день</span>
          </label>

          <div class="inline-grid">
            ${fieldHtml({ label: "Начало", control: startControl })}
            ${fieldHtml({ label: "Конец", control: endControl })}
          </div>

          <div class="inline-grid">
            ${fieldHtml({
              label: "Вид",
              control: `<select name="kind">
                ${EVENT_KINDS.map(
                  (kind) =>
                    `<option value="${kind}" ${event?.kind === kind ? "selected" : ""}>${EVENT_KIND_LABELS[kind]}</option>`,
                ).join("")}
              </select>`,
            })}
            ${fieldHtml({
              label: "Связать с задачей",
              control: `<select name="taskId">
                <option value="">Без задачи</option>
                ${renderTaskOptions(workspace.tasks, event?.taskId ?? null)}
              </select>`,
            })}
            ${fieldHtml({
              label: "Связать с проектом",
              control: `<select name="projectId">
                ${renderProjectOptions(workspace.projects, event?.projectId ?? null)}
              </select>`,
            })}
          </div>

          ${fieldHtml({
            label: "Место",
            control: `<input name="location" value="${event ? escapeHtml(event.location) : ""}" placeholder="Ссылка или адрес" />`,
          })}
          ${fieldHtml({
            label: "Описание",
            control: `<textarea name="description" placeholder="Детали события">${event ? escapeHtml(event.description) : ""}</textarea>`,
          })}

          ${
            event
              ? ""
              : `<div class="inline-grid">
                  ${fieldHtml({
                    label: "Повтор",
                    control: `<select name="repeat">
                      <option value="none">Без повтора</option>
                      <option value="daily">Каждый день</option>
                      <option value="weekly">Каждую неделю</option>
                      <option value="monthly">Каждый месяц</option>
                    </select>`,
                  })}
                  ${fieldHtml({ label: "Повторять до", control: `<input name="repeatUntil" type="date" />` })}
                </div>
                <p class="muted">Повтор создаёт отдельные события; правка одного не меняет остальные.</p>`
          }

          <div class="row-actions" style="justify-content: space-between;">
            <div class="row-actions">
              ${event ? `<button ${buttonAttrs({ tone: "danger", data: { deleteEvent: event.id } })}>Удалить</button>` : ""}
              ${
                event?.taskId
                  ? `<button ${buttonAttrs({ tone: "ghost", data: { action: "start-focus", taskId: event.taskId } })}>Запустить фокус</button>`
                  : ""
              }
            </div>
            <button ${buttonAttrs({ type: "submit" })}>${event ? "Сохранить" : "Создать событие"}</button>
          </div>
        </form>
      `,
    });
  }

  private renderManualModal(workspace: Workspace): string {
    const now = new Date();
    const thirtyMinutesAgo = new Date(now.getTime() - 30 * 60 * 1000);

    return modalHtml({
      label: "Ручная сессия",
      body: `
        <form class="form-grid" data-form="manual">
          <div class="card-header" style="margin-bottom: 0;">
            <div>
              <p class="eyebrow">История</p>
              <h2>Записать время</h2>
            </div>
            <button ${buttonAttrs({ tone: "ghost", size: "small", data: { action: "close-modal" } })}>Закрыть</button>
          </div>
          ${fieldHtml({
            label: "Задача",
            control: `<select name="taskId" required>${renderTaskOptions(workspace.tasks)}</select>`,
          })}
          <div class="inline-grid">
            ${fieldHtml({
              label: "Начало",
              control: `<input name="startedAt" type="datetime-local" required value="${toDateTimeLocalValue(thirtyMinutesAgo)}" />`,
            })}
            ${fieldHtml({
              label: "Конец",
              control: `<input name="endedAt" type="datetime-local" required value="${toDateTimeLocalValue(now)}" />`,
            })}
          </div>
          ${fieldHtml({
            label: "Заметка к сессии",
            control: `<textarea name="note" placeholder="Что было сделано за это время"></textarea>`,
          })}
          <button ${buttonAttrs({ type: "submit" })}>Записать время</button>
        </form>
      `,
    });
  }

  private bindActions(root: ShadowRoot): void {
    root.querySelectorAll<HTMLButtonElement>("[data-view]").forEach((button) => {
      button.addEventListener("click", () => {
        const view = button.dataset.view;
        this.viewMode = view === "month" ? "month" : view === "week" ? "week" : "agenda";
        this.render();
      });
    });

    root.querySelector<HTMLButtonElement>('[data-action="prev-week"]')?.addEventListener("click", () => this.shiftWeek(-7));
    root.querySelector<HTMLButtonElement>('[data-action="next-week"]')?.addEventListener("click", () => this.shiftWeek(7));
    root.querySelector<HTMLButtonElement>('[data-action="today-week"]')?.addEventListener("click", () => {
      this.weekAnchor = new Date();
      this.render();
    });

    root.querySelector<HTMLButtonElement>('[data-action="open-event"]')?.addEventListener("click", () => {
      this.openEventModal(null, null);
    });

    root.querySelector<HTMLButtonElement>('[data-action="open-manual"]')?.addEventListener("click", () => {
      this.modal = "manual";
      this.render();
    });

    root.querySelector<HTMLButtonElement>('[data-action="close-modal"]')?.addEventListener("click", () => {
      this.closeModal();
    });

    root.querySelector<HTMLButtonElement>('[data-action="start-focus"]')?.addEventListener("click", (event) => {
      const taskId = event.currentTarget instanceof HTMLElement ? event.currentTarget.dataset.taskId : undefined;
      if (!taskId || appStore.getActiveTimer()) {
        return;
      }
      void requestTimerNotificationPermission();
      void appStore.startTimer(taskId);
      this.closeModal();
      window.location.hash = "#/focus";
    });

    if (this.modal) {
      wireModal(root, { onClose: () => this.closeModal() });
    }

    root.querySelectorAll<HTMLElement>("[data-edit-event]").forEach((element) => {
      const open = () => {
        const id = element.dataset.editEvent;
        if (id) {
          this.openEventModal(id, null);
        }
      };
      element.addEventListener("click", (event) => {
        if (event.target instanceof Element && event.target.closest("button[data-delete-event]")) {
          return;
        }
        open();
      });
      element.addEventListener("keydown", (event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          open();
        }
      });
    });

    root.querySelectorAll<HTMLElement>("[data-new-event-date]").forEach((cell) => {
      cell.addEventListener("click", (event) => {
        if (event.target instanceof Element && event.target.closest("button")) {
          return;
        }
        const date = cell.dataset.newEventDate;
        if (date) {
          this.openEventModal(null, `${date}T09:00:00`);
        }
      });
    });

    root.querySelectorAll<HTMLElement>("[data-week-col]").forEach((column) => {
      column.addEventListener("click", (event) => {
        if (event.target instanceof Element && event.target.closest("button")) {
          return;
        }
        const date = column.dataset.weekCol;
        if (!date) {
          return;
        }
        const minutes = snapMinutes(column, event.clientY);
        this.openEventModal(null, `${date}T${pad(Math.floor(minutes / 60))}:${pad(minutes % 60)}:00`);
      });
    });

    root.querySelectorAll<HTMLElement>("[data-drag-event]").forEach((element) => {
      element.addEventListener("dragstart", (event) => {
        this.draggingEventId = element.dataset.dragEvent ?? null;
        if (event instanceof DragEvent && event.dataTransfer) {
          event.dataTransfer.effectAllowed = "move";
          event.dataTransfer.setData("text/plain", this.draggingEventId ?? "");
        }
      });
    });

    root.querySelectorAll<HTMLElement>("[data-new-event-date]").forEach((cell) => {
      cell.addEventListener("dragover", (event) => {
        event.preventDefault();
        cell.classList.add("is-drop-target");
      });
      cell.addEventListener("dragleave", () => cell.classList.remove("is-drop-target"));
      cell.addEventListener("drop", (event) => {
        event.preventDefault();
        cell.classList.remove("is-drop-target");
        const date = cell.dataset.newEventDate;
        if (date) {
          this.moveEventToDay(date);
        }
      });
      cell.addEventListener("keydown", (event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          const date = cell.dataset.newEventDate;
          if (date) {
            this.openEventModal(null, `${date}T09:00:00`);
          }
        }
      });
    });

    const monthCells = [...root.querySelectorAll<HTMLElement>(".month-cell")];
    monthCells.forEach((cell, index) => {
      cell.addEventListener("keydown", (event) => {
        const offsets: Record<string, number> = { ArrowRight: 1, ArrowLeft: -1, ArrowDown: 7, ArrowUp: -7 };
        const offset = offsets[event.key];
        if (offset === undefined) {
          return;
        }
        const target = monthCells[index + offset];
        if (target) {
          event.preventDefault();
          target.focus();
        }
      });
    });

    root.querySelectorAll<HTMLElement>("[data-week-col]").forEach((column) => {
      column.addEventListener("dragover", (event) => {
        event.preventDefault();
        column.classList.add("is-drop-target");
      });
      column.addEventListener("dragleave", () => column.classList.remove("is-drop-target"));
      column.addEventListener("drop", (event) => {
        event.preventDefault();
        column.classList.remove("is-drop-target");
        const date = column.dataset.weekCol;
        if (date) {
          this.moveEventToDayTime(date, snapMinutes(column, event.clientY));
        }
      });
    });

    root.querySelectorAll<HTMLElement>("[data-resize-event]").forEach((handle) => {
      handle.addEventListener("pointerdown", (event) => {
        if (!(event instanceof PointerEvent)) {
          return;
        }
        event.preventDefault();
        event.stopPropagation();

        const id = handle.dataset.resizeEvent;
        const eventEl = handle.closest<HTMLElement>(".week-event");
        const column = handle.closest<HTMLElement>("[data-week-col]");
        const calendarEvent = id ? appStore.getWorkspace().events.find((item) => item.id === id) : null;
        if (!id || !eventEl || !column || !calendarEvent) {
          return;
        }

        const startMin = minutesIntoDay(calendarEvent.startsAt);
        handle.setPointerCapture(event.pointerId);

        const onMove = (move: PointerEvent) => {
          const endMin = Math.max(startMin + 30, snapMinutes(column, move.clientY));
          eventEl.style.height = `${((endMin - startMin) / 1440) * 100}%`;
        };
        const onUp = (up: PointerEvent) => {
          handle.releasePointerCapture(event.pointerId);
          handle.removeEventListener("pointermove", onMove);
          handle.removeEventListener("pointerup", onUp);
          const endMin = Math.max(startMin + 30, snapMinutes(column, up.clientY));
          const start = new Date(calendarEvent.startsAt);
          const newEnd = new Date(start.getFullYear(), start.getMonth(), start.getDate(), 0, endMin, 0);
          this.commitEventMove(calendarEvent, calendarEvent.startsAt, newEnd.toISOString());
        };

        handle.addEventListener("pointermove", onMove);
        handle.addEventListener("pointerup", onUp);
      });
    });

    root.querySelectorAll<HTMLButtonElement>("[data-delete-event]").forEach((button) => {
      button.addEventListener("click", () => {
        const id = button.dataset.deleteEvent;
        if (id && confirmDestructive("Удалить это событие?")) {
          this.modal = null;
          this.editingEventId = null;
          void appStore.deleteEvent(id);
        }
      });
    });

    root.querySelector<HTMLInputElement>("[data-all-day]")?.addEventListener("change", (event) => {
      if (event.currentTarget instanceof HTMLInputElement) {
        this.draftAllDay = event.currentTarget.checked;
        this.render();
      }
    });

    root.querySelector<HTMLButtonElement>('[data-action="prev-month"]')?.addEventListener("click", () => this.shiftMonth(-1));
    root.querySelector<HTMLButtonElement>('[data-action="next-month"]')?.addEventListener("click", () => this.shiftMonth(1));
    root.querySelector<HTMLButtonElement>('[data-action="today-month"]')?.addEventListener("click", () => {
      const today = new Date();
      this.monthCursor = { year: today.getFullYear(), month: today.getMonth() };
      this.render();
    });

    root.querySelector<HTMLButtonElement>('[data-action="export-ics"]')?.addEventListener("click", () => {
      const ics = buildIcs(appStore.getWorkspace().events);
      const blob = new Blob([ics], { type: "text/calendar" });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = `prodnote-${new Date().toISOString().slice(0, 10)}.ics`;
      anchor.click();
      URL.revokeObjectURL(url);
    });

    const fileInput = root.querySelector<HTMLInputElement>("[data-ics-input]");
    root.querySelector<HTMLButtonElement>('[data-action="import-ics"]')?.addEventListener("click", () => {
      fileInput?.click();
    });
    fileInput?.addEventListener("change", (event) => {
      const input = event.currentTarget;
      if (!(input instanceof HTMLInputElement)) {
        return;
      }
      const file = input.files?.[0] ?? null;
      if (!file) {
        return;
      }

      void file
        .text()
        .then((text) => {
          const parsed = parseIcs(text);
          if (!parsed.length) {
            window.alert("В файле не найдено событий.");
            return;
          }
          if (!confirmDestructive(`Импортировать событий: ${parsed.length}? Дубликаты по UID обновятся.`)) {
            return;
          }
          return appStore.importEvents(parsed);
        })
        .catch((error: unknown) => {
          window.alert(`Не удалось импортировать .ics: ${String(error)}`);
        })
        .finally(() => {
          input.value = "";
        });
    });

    root.querySelector<HTMLFormElement>('[data-form="event"]')?.addEventListener("submit", (event) => {
      event.preventDefault();
      const form = event.currentTarget;
      if (!(form instanceof HTMLFormElement)) {
        return;
      }

      const allDay = this.draftAllDay;
      const startsAt = allDay
        ? fromDateInputValue(requireInput(form, "startsAt").value)
        : fromDateTimeLocalValue(requireInput(form, "startsAt").value);
      const endsAt = allDay
        ? fromDateInputValue(requireInput(form, "endsAt").value)
        : fromDateTimeLocalValue(requireInput(form, "endsAt").value);
      const taskId = requireSelect(form, "taskId").value || null;
      const projectId = requireSelect(form, "projectId").value || null;
      const kind = requireSelect(form, "kind").value as CalendarEventKind;
      const title = requireInput(form, "title").value;
      const description = requireTextArea(form, "description").value;
      const location = requireInput(form, "location").value;

      if (this.editingEventId) {
        void appStore.updateEvent({
          eventId: this.editingEventId,
          title,
          startsAt,
          endsAt,
          allDay,
          kind,
          taskId,
          projectId,
          description,
          location,
        });
      } else {
        const repeat = form.querySelector<HTMLSelectElement>('[name="repeat"]')?.value ?? "none";
        const untilValue = form.querySelector<HTMLInputElement>('[name="repeatUntil"]')?.value ?? "";
        if (repeat !== "none") {
          const rule: RecurrenceRule = {
            freq: repeat.toUpperCase(),
            interval: 1,
            count: null,
            untilMs: untilValue ? Date.parse(fromDateInputValue(untilValue)) + 86_400_000 : null,
            byDay: [],
          };
          const occurrences = expandRecurrence(startsAt, endsAt, rule, Date.now());
          void appStore.addEvents(
            occurrences.map((occ) => ({
              title,
              startsAt: occ.startsAt,
              endsAt: occ.endsAt,
              allDay,
              kind,
              taskId,
              projectId,
              description,
              location,
            })),
          );
        } else {
          void appStore.addEvent({ title, startsAt, endsAt, allDay, kind, taskId, projectId, description, location });
        }
      }

      this.closeModal();
    });

    root.querySelector<HTMLFormElement>('[data-form="manual"]')?.addEventListener("submit", (event) => {
      event.preventDefault();
      const form = event.currentTarget;
      if (!(form instanceof HTMLFormElement)) {
        return;
      }

      void appStore.addManualSession({
        taskId: requireSelect(form, "taskId").value,
        startedAt: fromDateTimeLocalValue(requireInput(form, "startedAt").value),
        endedAt: fromDateTimeLocalValue(requireInput(form, "endedAt").value),
        note: requireTextArea(form, "note").value,
      });
      this.closeModal();
    });
  }

  private moveEventToDay(dateKey: string): void {
    const event = this.takeDraggedEvent();
    if (!event) {
      return;
    }

    const [year, month, day] = dateKey.split("-").map(Number);
    const start = new Date(event.startsAt);
    const droppedMidnight = new Date(year, month - 1, day).getTime();
    const originMidnight = new Date(start.getFullYear(), start.getMonth(), start.getDate()).getTime();
    const dayDelta = Math.round((droppedMidnight - originMidnight) / 86_400_000);
    if (dayDelta === 0) {
      return;
    }

    const end = new Date(event.endsAt);
    const newStart = new Date(
      start.getFullYear(),
      start.getMonth(),
      start.getDate() + dayDelta,
      start.getHours(),
      start.getMinutes(),
      start.getSeconds(),
    );
    const newEnd = new Date(
      end.getFullYear(),
      end.getMonth(),
      end.getDate() + dayDelta,
      end.getHours(),
      end.getMinutes(),
      end.getSeconds(),
    );
    this.commitEventMove(event, newStart.toISOString(), newEnd.toISOString());
  }

  private moveEventToDayTime(dateKey: string, minutes: number): void {
    const event = this.takeDraggedEvent();
    if (!event || event.allDay) {
      return;
    }

    const [year, month, day] = dateKey.split("-").map(Number);
    const newStart = new Date(year, month - 1, day, 0, minutes, 0);
    const durationMs = Math.max(0, Date.parse(event.endsAt) - Date.parse(event.startsAt));
    const newEnd = new Date(newStart.getTime() + durationMs);
    this.commitEventMove(event, newStart.toISOString(), newEnd.toISOString());
  }

  private takeDraggedEvent(): CalendarEvent | null {
    const id = this.draggingEventId;
    this.draggingEventId = null;
    if (!id) {
      return null;
    }
    return appStore.getWorkspace().events.find((event) => event.id === id) ?? null;
  }

  private commitEventMove(event: CalendarEvent, startsAt: string, endsAt: string): void {
    void appStore.updateEvent({
      eventId: event.id,
      title: event.title,
      startsAt,
      endsAt,
      allDay: event.allDay,
      kind: event.kind,
      taskId: event.taskId,
      projectId: event.projectId,
      description: event.description,
      location: event.location,
    });
  }

  private openEventModal(eventId: string | null, draftStart: string | null): void {
    this.modal = "event";
    this.editingEventId = eventId;
    this.draftStart = draftStart;
    const event = eventId ? appStore.getWorkspace().events.find((item) => item.id === eventId) : null;
    this.draftAllDay = event?.allDay ?? false;
    this.render();
  }

  private closeModal(): void {
    this.modal = null;
    this.editingEventId = null;
    this.draftStart = null;
    this.draftAllDay = false;
    this.render();
  }

  private shiftMonth(delta: number): void {
    const date = new Date(this.monthCursor.year, this.monthCursor.month + delta, 1);
    this.monthCursor = { year: date.getFullYear(), month: date.getMonth() };
    this.render();
  }

  private shiftWeek(deltaDays: number): void {
    this.weekAnchor = new Date(
      this.weekAnchor.getFullYear(),
      this.weekAnchor.getMonth(),
      this.weekAnchor.getDate() + deltaDays,
    );
    this.render();
  }

  private styles(): string {
    return `
      .agenda {
        display: grid;
        gap: var(--space-5);
      }

      .agenda-head {
        align-items: center;
        display: flex;
        gap: var(--space-3);
        margin-bottom: var(--space-3);
      }

      .calendar-item.is-editable {
        cursor: pointer;
      }

      .calendar-item:focus-visible {
        border-color: var(--accent);
        box-shadow: 0 0 0 3px var(--accent-soft);
        outline: none;
      }

      .calendar-item-row {
        align-items: center;
        display: flex;
        gap: var(--space-3);
        justify-content: space-between;
      }

      .calendar-item-main {
        display: grid;
        gap: var(--space-2);
        min-width: 0;
      }

      .month-card {
        overflow-x: auto;
      }

      .month-nav {
        align-items: center;
      }

      .month-nav h2 {
        font-size: var(--text-lg);
      }

      .month-head {
        display: grid;
        grid-template-columns: repeat(7, minmax(7rem, 1fr));
      }

      .month-weekday {
        color: var(--muted);
        font-size: var(--text-xs);
        font-weight: 700;
        padding: var(--space-2);
        text-align: center;
        text-transform: uppercase;
      }

      .month-weeks {
        display: grid;
        gap: 1px;
      }

      .month-week {
        position: relative;
      }

      .week-days {
        display: grid;
        grid-template-columns: repeat(7, minmax(7rem, 1fr));
        gap: 1px;
      }

      .month-cell {
        background: var(--surface);
        border: 1px solid var(--line);
        border-radius: var(--radius-sm);
        cursor: pointer;
        min-height: calc(2rem + var(--lanes, 0) * 1.4rem + 0.6rem);
        padding: var(--space-2);
        position: relative;
      }

      .month-cell:hover {
        border-color: var(--line-strong);
      }

      .month-cell:focus-visible {
        border-color: var(--accent);
        box-shadow: 0 0 0 3px var(--accent-soft);
        outline: none;
      }

      .month-cell.is-outside {
        opacity: 0.5;
      }

      .month-cell.is-today {
        border-color: var(--accent);
      }

      .month-cell.is-drop-target,
      .week-col.is-drop-target {
        box-shadow: inset 0 0 0 2px var(--accent);
      }

      .month-day {
        font-size: var(--text-sm);
        font-weight: 650;
        font-variant-numeric: tabular-nums;
      }

      .month-more {
        bottom: 0.25rem;
        color: var(--muted);
        font-size: var(--text-xs);
        position: absolute;
        right: 0.4rem;
      }

      .week-bars {
        display: grid;
        gap: 0.15rem;
        grid-auto-rows: 1.25rem;
        grid-template-columns: repeat(7, minmax(7rem, 1fr));
        left: 0;
        padding: 0 var(--space-1);
        pointer-events: none;
        position: absolute;
        right: 0;
        top: 1.9rem;
      }

      .month-bar {
        background: var(--accent-soft);
        border: none;
        border-radius: var(--radius-sm);
        color: var(--accent-strong);
        cursor: pointer;
        font-size: var(--text-xs);
        font-weight: 600;
        min-height: auto;
        overflow: hidden;
        padding: 0.1rem 0.4rem;
        pointer-events: auto;
        text-align: left;
        text-overflow: ellipsis;
        white-space: nowrap;
      }

      .month-bar:disabled {
        cursor: default;
        opacity: 1;
      }

      .month-bar[draggable="true"],
      .week-event[draggable="true"] {
        cursor: grab;
      }

      .month-bar.cont-left {
        border-bottom-left-radius: 0;
        border-top-left-radius: 0;
      }

      .month-bar.cont-right {
        border-bottom-right-radius: 0;
        border-top-right-radius: 0;
      }

      .week-card {
        overflow-x: auto;
      }

      .week-head,
      .week-allday,
      .week-grid {
        grid-template-columns: 3.5rem repeat(7, minmax(5rem, 1fr));
        min-width: 38rem;
      }

      .week-head {
        display: grid;
        position: sticky;
        top: 0;
        z-index: 1;
      }

      .week-day-head {
        border-bottom: 1px solid var(--line);
        cursor: pointer;
        display: grid;
        gap: 0.1rem;
        justify-items: center;
        padding: var(--space-2);
      }

      .week-day-head.is-today {
        color: var(--accent-strong);
      }

      .week-day-label {
        color: var(--muted);
        font-size: var(--text-xs);
        font-weight: 700;
        text-transform: uppercase;
      }

      .week-day-num {
        font-size: var(--text-base);
        font-weight: 650;
        font-variant-numeric: tabular-nums;
      }

      .week-gutter-spacer {
        align-self: center;
        color: var(--muted);
        font-size: var(--text-xs);
        padding: var(--space-1);
        text-align: center;
      }

      .week-allday {
        border-bottom: 1px solid var(--line);
        display: grid;
      }

      .week-allday-bars {
        display: grid;
        gap: 0.15rem;
        grid-auto-rows: 1.25rem;
        grid-column: 2 / -1;
        grid-template-columns: repeat(7, minmax(0, 1fr));
        padding: var(--space-1) 0;
      }

      .week-allday-more {
        display: grid;
        grid-column: 2 / -1;
        grid-template-columns: repeat(7, minmax(0, 1fr));
      }

      .week-allday-more span {
        color: var(--muted);
        font-size: var(--text-xs);
        padding-left: 0.2rem;
      }

      .week-grid {
        display: grid;
      }

      .week-gutter {
        display: grid;
        grid-auto-rows: 2.6rem;
      }

      .week-hour-label {
        color: var(--muted);
        font-size: var(--text-xs);
        padding-right: var(--space-1);
        text-align: right;
        transform: translateY(-0.5rem);
      }

      .week-col {
        border-left: 1px solid var(--line);
        display: grid;
        grid-auto-rows: 2.6rem;
        position: relative;
      }

      .week-col.is-today {
        background: var(--accent-soft);
      }

      .week-hour-line {
        border-bottom: 1px solid var(--line);
      }

      .week-event {
        background: var(--accent);
        border: 1px solid var(--paper);
        border-radius: var(--radius-sm);
        color: white;
        cursor: pointer;
        display: grid;
        gap: 0;
        left: 2px;
        min-height: auto;
        overflow: hidden;
        padding: 0.1rem 0.3rem;
        position: absolute;
        right: 2px;
        text-align: left;
      }

      .week-event strong {
        font-size: var(--text-xs);
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }

      .week-event span {
        font-size: 0.65rem;
        opacity: 0.85;
      }

      .week-event-resize {
        bottom: 0;
        cursor: ns-resize;
        height: 0.45rem;
        left: 0;
        position: absolute;
        right: 0;
        touch-action: none;
      }

      .check-row {
        align-items: center;
        background: var(--surface);
        border: 1px solid var(--line);
        border-radius: var(--radius-pill);
        display: inline-flex;
        gap: var(--space-2);
        justify-self: start;
        padding: 0.3rem var(--space-3);
      }

      .check-row input {
        width: auto;
      }

      .check-row span {
        color: var(--ink);
        font-weight: 600;
      }

      @media (max-width: 720px) {
        .month-head,
        .week-days,
        .week-bars {
          grid-template-columns: repeat(7, minmax(2.6rem, 1fr));
        }

        .month-bar {
          font-size: 0;
          padding: 0.1rem;
        }
      }
    `;
  }
}

function defaultStartIso(): string {
  const date = new Date();
  date.setMinutes(0, 0, 0);
  date.setHours(date.getHours() + 1);
  return date.toISOString();
}

function toDateInputValue(iso: string): string {
  const date = new Date(iso);
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function fromDateInputValue(value: string): string {
  const [year, month, day] = value.split("-").map(Number);
  if (!year || !month || !day) {
    return new Date().toISOString();
  }
  return new Date(year, month - 1, day, 0, 0, 0, 0).toISOString();
}

function pad(value: number): string {
  return value.toString().padStart(2, "0");
}

/** Vertical click/drop position within a day column → minutes-of-day snapped to 30. */
function snapMinutes(column: HTMLElement, clientY: number): number {
  const rect = column.getBoundingClientRect();
  const fraction = rect.height > 0 ? (clientY - rect.top) / rect.height : 0;
  const minutes = Math.round((Math.max(0, Math.min(1, fraction)) * 1440) / 30) * 30;
  return Math.max(0, Math.min(1410, minutes));
}

customElements.define("pn-calendar-view", CalendarView);
