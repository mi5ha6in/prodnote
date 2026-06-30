import { weekdayLabels } from "../domain/calendar";
import { shiftDayKey } from "../domain/checklist";
import { escapeHtml } from "../domain/markdown";
import { buildWeeklyReview, weekStartKey } from "../domain/review";
import { formatDuration } from "../domain/stats";
import { appStore } from "../state";
import { badgeHtml, buttonAttrs, metricBarHtml, viewHeaderHtml } from "../ui/html";
import { renderShadow } from "./shadow";
import { formatDate } from "./view-utils";

function scoreLabel(score: number): string {
  if (score >= 90) return "Отличная неделя";
  if (score >= 70) return "Сильная неделя";
  if (score >= 40) return "Хороший ритм";
  return "Разогрев";
}

export class ReviewView extends HTMLElement {
  private unsubscribe: (() => void) | null = null;
  private weekStart: string | null = null;

  connectedCallback(): void {
    this.unsubscribe = appStore.subscribe(() => this.render());
    this.render();
  }

  disconnectedCallback(): void {
    this.unsubscribe?.();
  }

  private currentWeekStart(): string {
    return weekStartKey(new Date(), appStore.getWorkspace().settings.weekStartsOn);
  }

  private render(): void {
    const workspace = appStore.getWorkspace();
    const thisWeek = this.currentWeekStart();
    const weekStart = this.weekStart ?? thisWeek;
    const review = buildWeeklyReview(workspace, weekStart);
    const labels = weekdayLabels(workspace.settings.weekStartsOn);
    const maxMinutes = Math.max(1, ...review.perDay.map((day) => day.minutes));

    const root = renderShadow(
      this,
      `
        <section class="view-grid">
          ${viewHeaderHtml({
            eyebrow: "Ревью",
            title: "Итоги недели",
            actions: `
              <div class="week-nav" role="group" aria-label="Выбор недели">
                <button ${buttonAttrs({ tone: "ghost", size: "small", data: { weekShift: -7 } })} aria-label="Предыдущая неделя">‹</button>
                <span class="week-range">${escapeHtml(formatDate(review.start))} — ${escapeHtml(formatDate(review.end))}</span>
                <button ${buttonAttrs({ tone: "ghost", size: "small", data: { weekShift: 7 } })} aria-label="Следующая неделя">›</button>
                ${weekStart !== thisWeek ? `<button ${buttonAttrs({ size: "small", data: { action: "this-week" } })}>Эта неделя</button>` : ""}
              </div>
            `,
          })}

          <article class="card score-card">
            <div>
              <p class="eyebrow">Индекс продуктивности</p>
              <div class="score-value">${review.score}<span>/100</span></div>
              ${badgeHtml(scoreLabel(review.score))}
            </div>
            <div class="score-bar"><span style="width: ${review.score}%"></span></div>
            <p class="muted">Складывается из активных дней (40%), выполнения чек-листа (30%) и привычек (30%).</p>
          </article>

          ${metricBarHtml([
            { label: "Время за неделю", value: formatDuration(review.totalMinutes), hint: `${review.sessionCount} сессий` },
            { label: "Задачи закрыты", value: review.tasksCompleted, hint: "Завершено за неделю" },
            { label: "Чек-лист", value: `${review.checklistDone}/${review.checklistPlanned}`, hint: "Выполнено из запланированных" },
            { label: "Активных дней", value: `${review.activeDays}/7`, hint: "С работой или отметками" },
          ])}

          <article class="card">
            <div class="card-header">
              <div>
                <p class="eyebrow">Ритм</p>
                <h2>Время по дням</h2>
              </div>
              ${review.habitsScheduled > 0 ? badgeHtml(`привычки: ${review.habitsDone}/${review.habitsScheduled}`) : ""}
            </div>
            <div class="week-chart">
              ${review.perDay
                .map(
                  (day, index) => `
                    <div class="week-col">
                      <div class="week-bar" title="${escapeHtml(formatDuration(day.minutes))}">
                        <span style="height: ${Math.round((day.minutes / maxMinutes) * 100)}%"></span>
                      </div>
                      <span class="week-label">${escapeHtml(labels[index] ?? "")}</span>
                    </div>
                  `,
                )
                .join("")}
            </div>
          </article>
        </section>
      `,
      styles,
    );

    root.querySelectorAll<HTMLButtonElement>("[data-week-shift]").forEach((button) => {
      button.addEventListener("click", () => {
        this.weekStart = shiftDayKey(weekStart, Number(button.dataset.weekShift));
        this.render();
      });
    });

    root.querySelector<HTMLButtonElement>('[data-action="this-week"]')?.addEventListener("click", () => {
      this.weekStart = null;
      this.render();
    });
  }
}

customElements.define("pn-review-view", ReviewView);

const styles = `
  .week-nav {
    align-items: center;
    display: flex;
    gap: var(--space-2);
  }

  .week-range {
    font-size: var(--text-sm);
    font-variant-numeric: tabular-nums;
    white-space: nowrap;
  }

  .score-card {
    display: grid;
    gap: var(--space-3);
  }

  .score-value {
    font-size: 2.4rem;
    font-weight: 700;
    line-height: 1;
  }

  .score-value span {
    color: var(--muted);
    font-size: var(--text-base);
    font-weight: 500;
  }

  .score-bar {
    background: var(--surface);
    border-radius: var(--radius-pill);
    height: 0.6rem;
    overflow: hidden;
  }

  .score-bar span {
    background: var(--accent);
    border-radius: var(--radius-pill);
    display: block;
    height: 100%;
  }

  .week-chart {
    align-items: end;
    display: grid;
    gap: var(--space-2);
    grid-template-columns: repeat(7, 1fr);
    height: 9rem;
  }

  .week-col {
    display: grid;
    gap: var(--space-1);
    height: 100%;
    grid-template-rows: 1fr auto;
  }

  .week-bar {
    align-items: end;
    background: var(--surface);
    border-radius: var(--radius-sm);
    display: flex;
    overflow: hidden;
  }

  .week-bar span {
    background: var(--accent);
    border-radius: var(--radius-sm);
    display: block;
    min-height: 2px;
    width: 100%;
  }

  .week-label {
    color: var(--muted);
    font-size: var(--text-xs);
    text-align: center;
  }
`;
