# Разработка

## Требования

- Node.js 24+.
- npm 11+.

Установка:

```bash
npm install
```

Запуск dev server:

```bash
npm run dev
```

Адрес:

```text
http://127.0.0.1:5173/
```

## Проверки

Тесты:

```bash
npm test
```

Production build:

```bash
npm run build
```

Watch mode для тестов:

```bash
npm run test:watch
```

Перед завершением задачи обычно достаточно:

```bash
npm test
npm run build
```

Если менялся UI, дополнительно открыть приложение в браузере и проверить измененный экран.

## Структура проекта

```text
src/
  components/
  domain/
  storage/
  ui/
  styles/
  main.ts
  state.ts
public/
  icons/
  manifest.webmanifest
  sw.js
docs/
AGENTS.md
README.md
```

## Как добавить новый экран

1. Создать компонент в `src/components/new-view.ts`.
2. Использовать `renderShadow(this, content, styles)`.
3. Зарегистрировать custom element.
4. Импортировать файл в `src/main.ts`.
5. Добавить route в `src/components/app-root.ts`.
6. Добавить тесты для логики, если экран меняет данные.
7. Проверить `npm test` и `npm run build`.

## Как добавить новую мутацию данных

1. Добавить метод в `ProdNoteStore`.
2. Внутри метода использовать `commit()`.
3. Не писать в IndexedDB напрямую из компонента.
4. Обновить связанные сущности безопасно.
5. Добавить тест в `src/state.test.ts`.

Пример:

```ts
async someMutation(id: EntityId): Promise<void> {
  await this.commit((workspace) => {
    // mutate workspace here
  });
}
```

## Как добавить новую статистику

1. Добавить чистую функцию в `src/domain/stats.ts`.
2. Покрыть функцию тестом в `src/domain/stats.test.ts`.
3. Подключить результат в `pn-stats-view`.
4. Проверить пустое состояние, чтобы UI не ломался без сессий.

## Как менять UI

Правила:

- каждый компонент рендерится через Shadow DOM;
- не выносить внутренние стили компонента в global CSS;
- общие tokens и базовые классы держать в `src/ui/styles.ts`;
- повторяющиеся маленькие HTML-фрагменты держать в `src/ui/html.ts`;
- не превращать `src/ui` в headless framework: сложные tabs, combobox, dialog, menu и keyboard machines добавлять только под конкретную необходимость;
- использовать `min-width: 0` в grid/flex-контейнерах, где возможен overflow;
- длинный пользовательский текст и URL должны переноситься;
- destructive actions требуют подтверждения;
- формы должны работать с клавиатуры и через native controls.

## Как менять Markdown

Markdown renderer находится в `src/domain/markdown.ts`.

Если добавляется новая конструкция:

- HTML должен оставаться экранированным;
- ссылки должны проходить protocol allowlist;
- добавить тест в `src/domain/markdown.test.ts`.

## Как менять PWA

Файлы:

- `public/manifest.webmanifest`;
- `public/sw.js`;
- `src/main.ts`.

После изменения service worker нужно проверять production build, потому что регистрация идет только в `import.meta.env.PROD`.

## Работа с браузерными данными при разработке

Данные живут в IndexedDB браузера. Если нужно начать с чистого состояния:

- открыть DevTools;
- очистить IndexedDB для `127.0.0.1:5173`;
- перезагрузить страницу.

Перед очисткой можно сделать экспорт в `.prodnote.json`.

## Типичные проблемы

### UI разъезжается в канбане

Проверить:

- есть ли `min-width: 0` у grid/flex children;
- переносится ли длинный текст через `overflow-wrap: anywhere`;
- нет ли слишком широкой формы внутри карточки.

### Данные не обновились после действия

Проверить:

- действие идет через `ProdNoteStore`;
- метод вызывает `commit()`;
- компонент подписан через `appStore.subscribe()`;
- нет ошибки IndexedDB в консоли.

### Экспорт импортируется с ошибкой

Проверить:

- `schemaVersion`;
- обязательные массивы;
- наличие `settings`;
- не был ли файл отредактирован вручную.
