# ProdNote

Локальный PWA-органайзер задач, заметок, тайм-трекинга и помодоро на vanilla Web Components с Shadow DOM.

## Документация

- [Обзор документации](./docs/README.md)
- [Руководство пользователя](./docs/USER_GUIDE.md)
- [Архитектура](./docs/ARCHITECTURE.md)
- [Данные и хранение](./docs/DATA_AND_STORAGE.md)
- [Разработка](./docs/DEVELOPMENT.md)
- [Дорожная карта](./docs/ROADMAP.md)

## Запуск

```bash
npm install
npm run dev
```

Production build:

```bash
npm run build
```

Тесты:

```bash
npm test
```

## Для будущих AI-агентов

Репозиторные правила разработки находятся в [AGENTS.md](./AGENTS.md).

## Что реализовано

- Vite + TypeScript без UI-фреймворка.
- Native Custom Elements с Shadow DOM.
- Задачи: канбан, список, статусы, проекты, теги, история работы.
- Заметки: отдельный раздел, Markdown-хранение и безопасный preview.
- Тайм-трекинг: ручные сессии, обычный таймер и помодоро.
- Календарь: планы, дедлайны, история рабочих сессий.
- Статистика: время по дням, задачам, проектам, тегам, productive hours и heatmap.
- IndexedDB `prodnote-db` как основное локальное хранилище.
- Экспорт/импорт одного `.prodnote.json` файла.
- PWA manifest и service worker для offline-first поведения после первого открытия.
