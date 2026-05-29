# Архитектура

## Общая схема

ProdNote - offline-first одностраничное приложение. Оно может работать без сервера, а self-host сервер синхронизации подключается опционально.

Основные слои:

- `src/domain`: типы, фабрики, расчеты, Markdown и помодоро-логика.
- `src/storage`: IndexedDB и импорт/экспорт.
- `src/sync`: optional клиент синхронизации с Node.js/Postgres сервером.
- `src/state.ts`: единый store и операции изменения данных.
- `src/ui`: внутренний design system слой: tokens, базовые CSS-классы и маленькие HTML helpers.
- `src/components`: Web Components экраны и компонентный рендеринг.
- `public`: PWA manifest, service worker и иконка.
- `server`: Hono API, passkey auth, Postgres persistence и migrations.

Поток данных:

```text
UI component -> ProdNoteStore -> domain/storage -> IndexedDB -> subscribers -> rerender
                               -> optional sync client -> server -> Postgres
```

Компоненты не должны напрямую писать в IndexedDB. Все постоянные изменения должны проходить через `ProdNoteStore`.

## Роутинг

Роутинг сделан через hash URL:

```text
#/dashboard
#/tasks
#/notes
#/calendar
#/focus
#/stats
#/settings
```

Точка маршрутизации - `src/components/app-root.ts`.

`app-root`:

- слушает `hashchange`;
- выбирает текущий экран;
- рендерит layout;
- показывает sidebar и mini timer;
- вставляет нужный view component.

## Web Components и Shadow DOM

Все пользовательские компоненты должны быть native Custom Elements.

Правило проекта:

```ts
renderShadow(this, content, styles)
```

`renderShadow()` находится в `src/components/shadow.ts`. Общие CSS tokens и базовые классы подключаются из `src/ui/styles.ts`.

Почему так:

- изоляция стилей;
- предсказуемость компонентов;
- меньше случайных CSS-конфликтов;
- проект остается без UI-фреймворка.

Глобальные стили в `src/styles/global.css` должны оставаться минимальными. Внутренние стили компонентов живут в Shadow DOM.

## Internal Design System Layer

`src/ui` - это не отдельная headless-библиотека и не внешний UI-kit. Это внутренний слой для текущего приложения, чтобы не дублировать повторяющиеся tokens, базовые классы и простые HTML-фрагменты.

Текущий публичный внутренний API:

- `src/ui/styles.ts`: общие CSS variables, базовые классы кнопок, форм, карточек, бейджей и пустых состояний.
- `src/ui/html.ts`: маленькие helpers для повторяемого markup: `buttonAttrs`, `badgeHtml`, `emptyStateHtml`, `fieldHtml`.
- `src/ui/actions.ts`: общие UI actions вроде `confirmDestructive`.

Что не нужно делать заранее:

- tabs;
- combobox;
- dialog framework;
- menu framework;
- keyboard state machines;
- abstractions для поведения, которое используется только в одном экране.

Сложное поведение остается внутри screen component, пока оно реально не повторилось и не стало мешать сопровождению.

## Store

`ProdNoteStore` в `src/state.ts` отвечает за:

- загрузку workspace из IndexedDB;
- подписки UI-компонентов;
- создание проектов, тегов, задач, заметок и планов;
- редактирование заметок с записью времени редактирования;
- обновление статуса задачи;
- удаление проекта;
- добавление истории задачи;
- ручные сессии;
- обычный таймер;
- помодоро;
- импорт workspace;
- сохранение в IndexedDB.

Типичный метод store:

```ts
async updateSomething(): Promise<void> {
  await this.commit((workspace) => {
    // mutate workspace
  });
}
```

`commit()` сохраняет workspace и вызывает подписчиков.

## Components

Основные компоненты:

- `app-root`: shell, sidebar, route host.
- `pn-mini-timer`: компактный таймер в sidebar.
- `pn-dashboard-view`: обзор.
- `pn-tasks-view`: задачи, канбан и список.
- `pn-notes-view`: заметки и Markdown preview.
- `pn-calendar-view`: план и история времени.
- `pn-focus-view`: активная работа, таймер и помодоро.
- `pn-stats-view`: аналитика.
- `pn-settings-view`: настройки, проекты, теги, импорт/экспорт.

Новые экраны нужно:

- создать как Custom Element;
- использовать Shadow DOM через `renderShadow()`;
- зарегистрировать в `src/main.ts`;
- добавить route в `app-root`, если экран должен быть доступен через навигацию.

## Domain Layer

`src/domain/types.ts` содержит основную модель данных и `SCHEMA_VERSION`.

`src/domain/defaults.ts` содержит:

- labels для статусов и режимов;
- `createId()`;
- фабрики сущностей;
- стартовый workspace.

`src/domain/stats.ts` содержит чистые функции расчета статистики. Их удобно тестировать отдельно.

`src/domain/pomodoro.ts` содержит чистые функции для помодоро-циклов.

`src/domain/markdown.ts` содержит небольшой Markdown renderer с HTML escaping.

## Storage Layer

`src/storage/idb.ts`:

- открывает базу `prodnote-db`;
- создает object stores;
- читает workspace;
- сохраняет workspace;
- заменяет workspace при импорте.

`src/storage/export.ts`:

- создает export snapshot;
- сериализует workspace;
- валидирует импорт;
- парсит импортируемый файл.

## Server Sync

`src/sync/client.ts`:

- хранит адрес сервера, device id, server revision и tombstones в `localStorage`;
- делает passkey registration/login через WebAuthn browser API;
- выполняет initial pull после локальной загрузки;
- запускает debounced push после `ProdNoteStore.commit()`;
- не синхронизирует активный таймер.

`server/index.ts`:

- поднимает Hono API;
- отдаёт production frontend из `dist`;
- запускает SQL migrations при старте.

Postgres хранит нормализованные таблицы workspace-сущностей. Внешний API при этом принимает и отдаёт текущий `Workspace` contract, чтобы клиентский доменный слой не зависел от серверной схемы.

## PWA

PWA состоит из:

- `public/manifest.webmanifest`;
- generated `dist/sw.js` из `scripts/sw.template.js`;
- `public/icons/icon.svg`;
- регистрации service worker в `src/main.ts`.

Service worker кэширует app shell и помогает приложению открываться офлайн после первого успешного открытия.

## Важные архитектурные правила

- Не добавлять UI-фреймворки без явного решения.
- Не писать в IndexedDB напрямую из UI.
- Не обходить `ProdNoteStore` для мутаций.
- Не ломать `.prodnote.json` без изменения `SCHEMA_VERSION`.
- Не удалять связанные данные молча.
- Держать тяжелую бизнес-логику вне компонентов.
