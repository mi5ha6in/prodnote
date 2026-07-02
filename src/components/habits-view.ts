import { dayKey } from "../domain/calendar";
import {
  habitDoneDays,
  habitStreak,
  habitWeekProgress,
  habitWeekStreak,
  lastNDays,
  templateAppliesToDay,
} from "../domain/checklist";
import { CHECKLIST_CADENCE_LABELS } from "../domain/defaults";
import { escapeHtml } from "../domain/markdown";
import { weekStartKey } from "../domain/review";
import type { ChecklistItem, ChecklistTemplate } from "../domain/types";
import { appStore } from "../state";
import { badgeHtml, emptyStateHtml, metricBarHtml, viewHeaderHtml } from "../ui/html";
import { renderShadow } from "./shadow";

const WINDOW_DAYS = 28;

export class HabitsView extends HTMLElement {
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
    const today = dayKey(new Date());
    const habits = workspace.checklistTemplates.filter((template) => template.isHabit && !template.archived);
    const days = lastNDays(today, WINDOW_DAYS);

    const scheduledToday = habits.filter((habit) => templateAppliesToDay(habit, today));
    const doneToday = scheduledToday.filter((habit) => habitDoneDays(workspace.checklist, habit.id).has(today)).length;

    const root = renderShadow(
      this,
      `
        <section class="view-grid">
          ${viewHeaderHtml({ eyebrow: "Привычки", title: "Трекер привычек" })}

          ${metricBarHtml([
            { label: "Привычек", value: habits.length, hint: "Активные шаблоны-привычки" },
            { label: "Сегодня", value: `${doneToday}/${scheduledToday.length}`, hint: "Выполнено из запланированных" },
            {
              label: "Лучшая серия",
              value: habits.reduce((max, habit) => Math.max(max, habitStreak(habit, workspace.checklist, today)), 0),
              hint: "Дней подряд",
            },
          ])}

          ${
            habits.length
              ? `<div class="habit-list">${habits
                  .map((habit) =>
                    this.renderHabit(
                      habit,
                      workspace.checklist,
                      days,
                      today,
                      weekStartKey(new Date(), workspace.settings.weekStartsOn),
                    ),
                  )
                  .join("")}</div>`
              : `<article class="card">${emptyStateHtml("Отметьте пункт как «привычку» в разделе «Сегодня» — он появится здесь со статистикой и серией.")}</article>`
          }
        </section>
      `,
      `
        .habit-list {
          display: grid;
          gap: var(--space-3);
        }

        .habit-head {
          align-items: center;
          display: flex;
          flex-wrap: wrap;
          gap: var(--space-2);
          justify-content: space-between;
          margin-bottom: var(--space-3);
        }

        .habit-title {
          font-size: var(--text-base);
          font-weight: 650;
        }

        .habit-grid {
          display: grid;
          gap: 3px;
          grid-template-columns: repeat(${WINDOW_DAYS}, 1fr);
        }

        .habit-cell {
          aspect-ratio: 1;
          background: var(--surface);
          border: 1px solid var(--line);
          border-radius: 4px;
        }

        .habit-cell.is-done {
          background: var(--accent);
          border-color: var(--accent);
        }

        .habit-cell.is-missed {
          background: transparent;
          border-color: var(--line-strong);
        }

        .habit-cell.is-today {
          border-color: var(--accent);
          box-shadow: inset 0 0 0 1px var(--accent-soft);
        }

        .habit-cell.is-off {
          background: transparent;
          border-style: dashed;
          opacity: 0.5;
        }

        button.habit-cell {
          cursor: pointer;
          font: inherit;
          padding: 0;
        }

        @media (max-width: 720px) {
          .habit-grid {
            grid-template-columns: repeat(14, 1fr);
            grid-auto-rows: 1fr;
          }
        }
      `,
    );

    root.querySelectorAll<HTMLButtonElement>("[data-habit-toggle]").forEach((button) => {
      button.addEventListener("click", () => {
        const id = button.dataset.habitToggle;
        if (id) {
          void appStore.toggleChecklistItem(id);
        }
      });
    });
  }

  private renderHabit(
    habit: ChecklistTemplate,
    items: ChecklistItem[],
    days: string[],
    today: string,
    weekStart: string,
  ): string {
    const done = habitDoneDays(items, habit.id);
    // Недельная цель считает недели, дневная — дни подряд.
    const streak = habit.targetPerWeek
      ? habitWeekStreak(habit, items, weekStart)
      : habitStreak(habit, items, today);
    const weekProgress = habit.targetPerWeek ? habitWeekProgress(habit, items, weekStart) : null;
    const todayItem = items.find((item) => item.templateId === habit.id && item.day === today);

    const cells = days
      .map((day) => {
        const scheduled = templateAppliesToDay(habit, day);
        let state = "is-off";
        if (scheduled && done.has(day)) {
          state = "is-done";
        } else if (scheduled && day === today) {
          state = "is-today";
        } else if (scheduled) {
          state = "is-missed";
        }
        const title = `${day}${scheduled ? (done.has(day) ? " · выполнено" : " · запланировано") : ""}`;
        if (day === today && todayItem) {
          return `<button type="button" class="habit-cell ${state}" data-habit-toggle="${escapeHtml(todayItem.id)}" title="${escapeHtml(`${title} · нажмите, чтобы отметить`)}" aria-label="${escapeHtml(`${habit.title}: отметить сегодня`)}"></button>`;
        }
        return `<span class="habit-cell ${state}" title="${escapeHtml(title)}"></span>`;
      })
      .join("");

    return `
      <article class="card">
        <div class="habit-head">
          <span class="habit-title">${escapeHtml(habit.title)}</span>
          <div class="meta-row">
            ${badgeHtml(CHECKLIST_CADENCE_LABELS[habit.cadence])}
            ${habit.targetCount > 1 ? badgeHtml(`×${habit.targetCount}/день`) : ""}
            ${weekProgress !== null ? badgeHtml(`неделя: ${weekProgress}/${habit.targetPerWeek}`) : ""}
            ${badgeHtml(habit.targetPerWeek ? `серия недель: ${streak}` : `серия: ${streak}`)}
          </div>
        </div>
        <div class="habit-grid" aria-label="Последние ${WINDOW_DAYS} дней">${cells}</div>
      </article>
    `;
  }
}

customElements.define("pn-habits-view", HabitsView);
