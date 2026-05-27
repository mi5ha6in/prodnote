# Данные и хранение

## Workspace

Все данные приложения объединены в `Workspace`.

Файл экспорта имеет форму:

```ts
{
  schemaVersion,
  exportedAt,
  projects,
  tasks,
  notes,
  tags,
  sessions,
  pomodoroCycles,
  plans,
  settings
}
```

Текущая версия схемы:

```ts
SCHEMA_VERSION = 3
```

## Основные сущности

### Project

Проект группирует задачи и заметки.

Важные поля:

- `id`;
- `name`;
- `color`;
- `description`;
- `archived`;
- `createdAt`;
- `updatedAt`.

Удаление проекта не удаляет задачи и заметки. У связанных сущностей очищается `projectId`.

### Tag

Тег помогает группировать задачи и заметки по контексту.

Поля:

- `id`;
- `name`;
- `color`.

### Task

Задача - основная единица работы.

Поля:

- `id`;
- `title`;
- `description`;
- `projectId`;
- `status`;
- `priority`;
- `tagIds`;
- `dueDate`;
- `plannedAt`;
- `estimateMinutes`;
- `history`;
- `createdAt`;
- `updatedAt`;
- `completedAt`.

Статусы:

- `backlog`;
- `active`;
- `blocked`;
- `done`.

Приоритеты:

- `low`;
- `medium`;
- `high`.

### TaskHistoryEntry

История задачи хранит рабочий журнал.

Поля:

- `id`;
- `at`;
- `kind`;
- `markdown`.

Типы записей:

- `note`;
- `progress`;
- `decision`.

### Note

Заметка - отдельная Markdown-запись, которую можно связать с задачами.

Поля:

- `id`;
- `title`;
- `markdown`;
- `projectId`;
- `linkedTaskIds`;
- `tagIds`;
- `editHistory`;
- `createdAt`;
- `updatedAt`.

`editHistory` хранит время каждого сохраненного редактирования заметки.

### NoteEditEntry

Запись редактирования заметки.

Поля:

- `id`;
- `editedAt`.

### TimeSession

Сессия времени фиксирует завершенную работу.

Поля:

- `id`;
- `taskId`;
- `startedAt`;
- `endedAt`;
- `durationMinutes`;
- `mode`;
- `note`;
- `pomodoroCycleId`.

Режимы:

- `timer`;
- `manual`;
- `pomodoro`.

Сессии всегда связаны с задачей.

### PomodoroCycle

Помодоро-цикл хранит настройки и прогресс серии фокус-сессий.

Поля:

- `id`;
- `taskId`;
- `focusMinutes`;
- `shortBreakMinutes`;
- `longBreakMinutes`;
- `longBreakEvery`;
- `startedAt`;
- `completedFocusCount`;
- `status`.

Фокусная фаза создает `TimeSession`. Перерыв не создает рабочую сессию.

### CalendarPlan

План календаря показывает будущую или плановую активность.

Поля:

- `id`;
- `taskId`;
- `title`;
- `startsAt`;
- `endsAt`;
- `kind`;
- `createdAt`.

Типы:

- `focus`;
- `deadline`;
- `review`.

### Settings

Настройки приложения.

Поля:

- `pomodoroFocusMinutes`;
- `pomodoroShortBreakMinutes`;
- `pomodoroLongBreakMinutes`;
- `pomodoroLongBreakEvery`;
- `weekStartsOn`.

## IndexedDB

База:

```text
prodnote-db
```

Object stores:

- `projects`;
- `tasks`;
- `notes`;
- `tags`;
- `sessions`;
- `pomodoroCycles`;
- `plans`;
- `settings`;
- `meta`.

`settings` хранится отдельно по ключу `settings`.

`meta` хранит:

- `schemaVersion`;
- `exportedAt`.

## Export

Экспорт создается через `stringifyExport(workspace)`.

При экспорте:

- workspace клонируется;
- `schemaVersion` принудительно выставляется в текущий `SCHEMA_VERSION`;
- `exportedAt` обновляется текущим ISO timestamp;
- результат сериализуется в JSON с отступами.

Имя файла в UI:

```text
prodnote-YYYY-MM-DD.prodnote.json
```

## Import

Импорт проходит через:

- `validateImportSnapshot()`;
- `parseWorkspaceExport()`;
- `appStore.importWorkspace()`.

Валидация проверяет:

- объектность файла;
- `schemaVersion`;
- наличие массивов `projects`, `tasks`, `notes`, `tags`, `sessions`, `plans`;
- наличие `settings`.

После подтверждения пользователя текущий workspace заменяется импортированным.

Файлы старых версий мигрируются при импорте: у старых заметок добавляется или нормализуется `editHistory`, а workspace сохраняется в текущей версии.

## Изменение схемы

Если меняется структура persisted data:

- увеличить `SCHEMA_VERSION`;
- обновить типы в `src/domain/types.ts`;
- обновить фабрики в `src/domain/defaults.ts`;
- обновить import/export validation;
- добавить миграцию или совместимость чтения;
- добавить тесты.

Минимальный набор тестов при изменении схемы:

- импорт старого файла;
- экспорт нового файла;
- загрузка стартового workspace;
- сохранение и повторная загрузка через storage layer, если доступно в выбранной test environment.
