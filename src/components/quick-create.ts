import { escapeHtml } from "../domain/markdown";
import { appStore } from "../state";
import { buttonAttrs } from "../ui/html";

/**
 * Inline «+ Новый проект / + Новый тег» для форм задач и заметок: управление
 * сущностями остаётся в настройках, здесь — только быстрое создание на месте.
 *
 * Это helper с разметкой (div, не вложенная form — quick-create живёт внутри
 * чужих форм), а не custom element. Хост обязан пережить re-render стора:
 * снять черновик формы в `beforeCreate` и восстановить его в `onCreated`.
 */
export type QuickCreateKind = "project" | "tag";

export function quickCreateHtml(kind: QuickCreateKind): string {
  const label = kind === "project" ? "+ Новый проект" : "+ Новый тег";
  const placeholder = kind === "project" ? "Название проекта" : "Название тега";
  const defaultColor = kind === "project" ? "#2a9d8f" : "#e07a5f";

  return `
    <div class="quick-create" data-quick-create="${kind}">
      <button ${buttonAttrs({ tone: "ghost", size: "small", data: { quickCreateToggle: kind } })}>${label}</button>
      <span class="quick-create-fields" data-quick-create-fields hidden>
        <input type="text" data-quick-create-name placeholder="${escapeHtml(placeholder)}" aria-label="${escapeHtml(placeholder)}" autocomplete="off" />
        <input type="color" data-quick-create-color value="${defaultColor}" aria-label="Цвет" />
        <button ${buttonAttrs({ size: "small", data: { quickCreateSubmit: kind } })}>Добавить</button>
      </span>
    </div>
  `;
}

export function wireQuickCreate(
  root: ParentNode,
  options: {
    /** Вызывается до записи в store — хост снимает черновик своей формы. */
    beforeCreate?: (kind: QuickCreateKind) => void;
    /** Вызывается после создания — хост дописывает id в черновик и перерисовывается. */
    onCreated: (kind: QuickCreateKind, id: string) => void;
  },
): void {
  root.querySelectorAll<HTMLElement>("[data-quick-create]").forEach((container) => {
    const kind = container.dataset.quickCreate === "tag" ? "tag" : ("project" as QuickCreateKind);
    const fields = container.querySelector<HTMLElement>("[data-quick-create-fields]");
    const nameInput = container.querySelector<HTMLInputElement>("[data-quick-create-name]");

    container.querySelector<HTMLButtonElement>("[data-quick-create-toggle]")?.addEventListener("click", () => {
      if (!fields) {
        return;
      }
      fields.hidden = !fields.hidden;
      if (!fields.hidden) {
        nameInput?.focus();
      }
    });

    const submit = async (): Promise<void> => {
      const name = nameInput?.value.trim();
      if (!name) {
        return;
      }
      const color = container.querySelector<HTMLInputElement>("[data-quick-create-color]")?.value;
      options.beforeCreate?.(kind);
      const created =
        kind === "project" ? await appStore.addProject({ name, color }) : await appStore.addTag({ name, color });
      options.onCreated(kind, created.id);
    };

    container.querySelector<HTMLButtonElement>("[data-quick-create-submit]")?.addEventListener("click", () => {
      void submit();
    });
    // Enter в поле имени создаёт сущность, не отправляя внешнюю форму.
    nameInput?.addEventListener("keydown", (event) => {
      if (event.key === "Enter") {
        event.preventDefault();
        void submit();
      }
    });
  });
}
