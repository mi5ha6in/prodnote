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
import type { ChecklistCadence, ChecklistItem, ChecklistTemplate } from "../domain/types";
import { appStore } from "../state";
import { confirmDestructive } from "../ui/actions";
import { badgeHtml, buttonAttrs, emptyStateHtml, metricBarHtml, viewHeaderHtml } from "../ui/html";
import { ICONS } from "../ui/icons";
import { renderShadow } from "./shadow";

const WINDOW_DAYS = 28;

export class HabitsView extends HTMLElement {
  private unsubscribe: (() => void) | null = null;
  private editingTemplateId: string | null = null;

  connectedCallback(): void {
    this.unsubscribe = appStore.subscribe(() => this.render());
    this.render();
  }

  disconnectedCallback(): void {
    this.unsubscribe?.();
  }

  /**
   * Store может эмитить во время набора (догоняющий commit, init, sync) —
   * re-render стёр бы недопечатанную форму. Снимаем значения перед перерисовкой
   * и возвращаем их в свежую форму.
   */
  private readTemplateFormDraft(): {
    title: string;
    cadence: string;
    targetCount: string;
    targetPerWeek: string;
    isHabit: boolean;
    focusedName: string | null;
  } | null {
    const form = this.shadowRoot?.querySelector<HTMLFormElement>("[data-template-form]");
    if (!form) {
      return null;
    }
    const value = (name: string): string => {
      const control = form.elements.namedItem(name);
      return control instanceof HTMLInputElement || control instanceof HTMLSelectElement ? control.value : "";
    };
    const habit = form.elements.namedItem("isHabit");
    const active = this.shadowRoot?.activeElement;
    return {
      title: value("title"),
      cadence: value("cadence"),
      targetCount: value("targetCount"),
      targetPerWeek: value("targetPerWeek"),
      isHabit: habit instanceof HTMLInputElement ? habit.checked : false,
      focusedName: active instanceof HTMLInputElement && active.form === form ? active.name : null,
    };
  }

  private restoreTemplateFormDraft(
    root: ShadowRoot,
    draft: NonNullable<ReturnType<HabitsView["readTemplateFormDraft"]>>,
  ): void {
    const form = root.querySelector<HTMLFormElement>("[data-template-form]");
    if (!form) {
      return;
    }
    const set = (name: string, value: string): void => {
      const control = form.elements.namedItem(name);
      if (control instanceof HTMLInputElement || control instanceof HTMLSelectElement) {
        control.value = value;
      }
    };
    set("title", draft.title);
    set("cadence", draft.cadence);
    set("targetCount", draft.targetCount);
    set("targetPerWeek", draft.targetPerWeek);
    const habit = form.elements.namedItem("isHabit");
    if (habit instanceof HTMLInputElement) {
      habit.checked = draft.isHabit;
    }
    if (draft.focusedName) {
      const focused = form.elements.namedItem(draft.focusedName);
      if (focused instanceof HTMLInputElement) {
        focused.focus();
        focused.setSelectionRange?.(focused.value.length, focused.value.length);
      }
    }
  }

  private render(): void {
    const formDraft = this.readTemplateFormDraft();
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
          ${viewHeaderHtml({ eyebrow: "Планер", title: "Привычки и рутины" })}

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
              : `<article class="card">${emptyStateHtml("Отметьте шаблон ниже как «привычку» — он появится здесь с 28-дневной сеткой и серией.")}</article>`
          }

          ${this.renderRoutineCard(workspace.checklistTemplates)}
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
          min-height: 0;
          padding: 0;
        }

        button.habit-cell:hover {
          border-color: var(--accent);
        }

        .template-form {
          align-items: center;
          display: flex;
          flex-wrap: wrap;
          gap: var(--space-2);
          margin: var(--space-2) 0 var(--space-3);
        }

        .template-form input[name="title"] {
          flex: 1;
          min-width: 12rem;
        }

        .template-form select,
        .template-item select {
          width: auto;
        }

        .template-habit {
          align-items: center;
          color: var(--muted);
          display: flex;
          flex-direction: row;
          gap: var(--space-1);
          white-space: nowrap;
        }

        .template-habit input {
          width: auto;
        }

        .target-input {
          width: 3.6rem;
        }

        .template-list {
          display: grid;
          gap: var(--space-2);
        }

        .template-item {
          align-items: center;
          background: var(--surface);
          border: 1px solid var(--line);
          border-radius: var(--radius-md);
          display: flex;
          flex-wrap: wrap;
          gap: var(--space-2) var(--space-3);
          padding: var(--space-2) var(--space-3);
        }

        .template-item.is-archived {
          opacity: 0.65;
        }

        .template-item label {
          margin: 0;
        }

        .template-title {
          background: transparent;
          border: none;
          color: inherit;
          cursor: text;
          flex: 1;
          font: inherit;
          font-weight: 600;
          min-height: 0;
          min-width: 8rem;
          padding: 0;
          text-align: left;
        }

        .template-edit {
          flex: 1;
          min-width: 8rem;
        }

        .template-edit input {
          width: 100%;
        }

        @media (max-width: 720px) {
          .habit-grid {
            grid-template-columns: repeat(14, 1fr);
            grid-auto-rows: 1fr;
          }
        }
      `,
    );

    if (formDraft) {
      this.restoreTemplateFormDraft(root, formDraft);
    }
    this.wire(root);
  }

  private renderRoutineCard(templates: ChecklistTemplate[]): string {
    const cadenceOptions = (selected: ChecklistCadence): string =>
      (Object.keys(CHECKLIST_CADENCE_LABELS) as ChecklistCadence[])
        .map(
          (value) =>
            `<option value="${value}" ${value === selected ? "selected" : ""}>${CHECKLIST_CADENCE_LABELS[value]}</option>`,
        )
        .join("");

    return `
      <article class="card">
        <div class="card-header">
          <div>
            <p class="eyebrow">Рутина</p>
            <h2>Повторяющиеся пункты</h2>
          </div>
        </div>
        <p class="muted">
          Шаблоны автоматически добавляются в «Список на день» в подходящие дни.
          Отмеченные как «привычка» дополнительно отслеживаются в сетках выше.
        </p>

        <form class="template-form" data-template-form>
          <input name="title" placeholder="Например: зарядка" aria-label="Название шаблона" autocomplete="off" />
          <select name="cadence" aria-label="Периодичность">${cadenceOptions("daily")}</select>
          <label class="template-habit"><input type="number" name="targetCount" min="1" max="99" value="1" aria-label="Повторов в день" class="target-input" /> в день</label>
          <label class="template-habit"><input type="number" name="targetPerWeek" min="1" max="7" placeholder="—" aria-label="Раз в неделю" class="target-input" /> в неделю</label>
          <label class="template-habit"><input type="checkbox" name="isHabit" /> привычка</label>
          <button ${buttonAttrs({ type: "submit", size: "small" })}>Добавить</button>
        </form>

        <div class="template-list">
          ${
            templates.length
              ? templates.map((template) => this.renderTemplateRow(template, cadenceOptions)).join("")
              : emptyStateHtml("Добавьте первый шаблон — он будет появляться в списке дня автоматически.")
          }
        </div>
      </article>
    `;
  }

  private renderTemplateRow(
    template: ChecklistTemplate,
    cadenceOptions: (selected: ChecklistCadence) => string,
  ): string {
    return `
      <div class="template-item ${template.archived ? "is-archived" : ""}">
        ${
          this.editingTemplateId === template.id
            ? `<form class="template-edit" data-edit-form><input name="title" value="${escapeHtml(template.title)}" aria-label="Название шаблона" autocomplete="off" /></form>`
            : `<button type="button" class="template-title" data-edit-template="${escapeHtml(template.id)}" title="Переименовать">${escapeHtml(template.title)}</button>`
        }
        ${template.archived ? badgeHtml("в архиве") : ""}
        ${template.isHabit ? badgeHtml("привычка") : ""}
        ${template.targetCount > 1 ? badgeHtml(`×${template.targetCount}/день`) : ""}
        ${template.targetPerWeek ? badgeHtml(`${template.targetPerWeek}/нед`) : ""}
        <select data-template-cadence="${escapeHtml(template.id)}" aria-label="Периодичность">${cadenceOptions(template.cadence)}</select>
        <label class="template-habit">
          <input type="checkbox" data-template-habit="${escapeHtml(template.id)}" ${template.isHabit ? "checked" : ""} /> привычка
        </label>
        <button ${buttonAttrs({ tone: "ghost", size: "small", data: { templateArchive: template.id, archived: template.archived ? "" : "1" } })}>
          ${template.archived ? "Вернуть" : "Архивировать"}
        </button>
        <button ${buttonAttrs({ tone: "ghost", size: "small", icon: true, label: "Удалить шаблон", data: { templateRemove: template.id } })}>${ICONS.trash}</button>
      </div>
    `;
  }

  private wire(root: ShadowRoot): void {
    root.querySelectorAll<HTMLButtonElement>("[data-habit-cell]").forEach((button) => {
      button.addEventListener("click", () => {
        const templateId = button.dataset.habitCell;
        const day = button.dataset.day;
        if (templateId && day) {
          void appStore.toggleTemplateItemForDay(templateId, day);
        }
      });
    });

    const templateForm = root.querySelector<HTMLFormElement>("[data-template-form]");
    templateForm?.addEventListener("submit", (event) => {
      event.preventDefault();
      const title = templateForm.elements.namedItem("title");
      const cadence = templateForm.elements.namedItem("cadence");
      const habit = templateForm.elements.namedItem("isHabit");
      const targetCount = templateForm.elements.namedItem("targetCount");
      const targetPerWeek = templateForm.elements.namedItem("targetPerWeek");
      if (!(title instanceof HTMLInputElement) || !title.value.trim()) {
        return;
      }
      void appStore.addChecklistTemplate({
        title: title.value,
        cadence: cadence instanceof HTMLSelectElement ? (cadence.value as ChecklistCadence) : "daily",
        isHabit: habit instanceof HTMLInputElement ? habit.checked : false,
        targetCount: targetCount instanceof HTMLInputElement ? Number(targetCount.value) || 1 : 1,
        targetPerWeek:
          targetPerWeek instanceof HTMLInputElement && targetPerWeek.value ? Number(targetPerWeek.value) : null,
      });
      // Иначе снапшот формы вернёт введённое обратно после re-render.
      templateForm.reset();
    });

    root.querySelectorAll<HTMLButtonElement>("[data-edit-template]").forEach((button) => {
      button.addEventListener("click", () => {
        const id = button.dataset.editTemplate;
        if (id) {
          this.editingTemplateId = id;
          this.render();
        }
      });
    });
    this.wireEditForm(root);

    root.querySelectorAll<HTMLSelectElement>("[data-template-cadence]").forEach((select) => {
      select.addEventListener("change", () => {
        const id = select.dataset.templateCadence;
        if (id) {
          void appStore.updateChecklistTemplate({ templateId: id, cadence: select.value as ChecklistCadence });
        }
      });
    });

    root.querySelectorAll<HTMLInputElement>("[data-template-habit]").forEach((checkbox) => {
      checkbox.addEventListener("change", () => {
        const id = checkbox.dataset.templateHabit;
        if (id) {
          void appStore.updateChecklistTemplate({ templateId: id, isHabit: checkbox.checked });
        }
      });
    });

    root.querySelectorAll<HTMLButtonElement>("[data-template-archive]").forEach((button) => {
      button.addEventListener("click", () => {
        const id = button.dataset.templateArchive;
        if (id) {
          void appStore.updateChecklistTemplate({ templateId: id, archived: button.dataset.archived === "1" });
        }
      });
    });

    root.querySelectorAll<HTMLButtonElement>("[data-template-remove]").forEach((button) => {
      button.addEventListener("click", () => {
        const id = button.dataset.templateRemove;
        const template = appStore.getWorkspace().checklistTemplates.find((entry) => entry.id === id);
        if (!id || !template) {
          return;
        }
        if (!confirmDestructive(`Удалить шаблон «${template.title}»?\n\nОтметки прошлых дней останутся в истории.`)) {
          return;
        }
        void appStore.removeChecklistTemplate(id);
      });
    });
  }

  private wireEditForm(root: ShadowRoot): void {
    const form = root.querySelector<HTMLFormElement>("[data-edit-form]");
    const templateId = this.editingTemplateId;
    if (!form || !templateId) {
      return;
    }
    const input = form.elements.namedItem("title");
    if (!(input instanceof HTMLInputElement)) {
      return;
    }

    let done = false;
    const commit = (): void => {
      if (done) {
        return;
      }
      done = true;
      const value = input.value;
      this.editingTemplateId = null;
      void appStore.updateChecklistTemplate({ templateId, title: value });
      this.render();
    };

    form.addEventListener("submit", (event) => {
      event.preventDefault();
      commit();
    });
    input.addEventListener("blur", commit);
    input.addEventListener("keydown", (event) => {
      if (event.key === "Escape") {
        event.preventDefault();
        done = true;
        this.editingTemplateId = null;
        this.render();
      }
    });
    input.focus();
    input.select();
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
        // Прошедшие и сегодняшний день можно отмечать задним числом прямо из сетки.
        if (scheduled && day <= today) {
          return `<button type="button" class="habit-cell ${state}" data-habit-cell="${escapeHtml(habit.id)}" data-day="${escapeHtml(day)}" title="${escapeHtml(`${title} · нажмите, чтобы отметить`)}" aria-label="${escapeHtml(`${habit.title}: отметить ${day}`)}"></button>`;
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
