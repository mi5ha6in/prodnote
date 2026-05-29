# ProdNote

Offline-first PWA-органайзер задач, заметок, тайм-трекинга и помодоро на vanilla Web Components с Shadow DOM.
Может работать полностью локально или синхронизироваться через self-host Node.js + PostgreSQL сервер.

## Документация

- [Обзор документации](./docs/README.md)
- [Руководство пользователя](./docs/USER_GUIDE.md)
- [Архитектура](./docs/ARCHITECTURE.md)
- [Данные и хранение](./docs/DATA_AND_STORAGE.md)
- [Разработка](./docs/DEVELOPMENT.md)
- [Server Sync](./docs/SERVER_SYNC.md)
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

Self-host сервер и Postgres через Docker:

```bash
docker compose up --build
```

Адрес:

```text
http://localhost:8787/
```

## Деплой

Автодеплой настроен через GitHub Actions: при push в `main` workflow собирает проект, прогоняет тесты и публикует `dist` в GitHub Pages.

Ожидаемый адрес после включения Pages:

```text
https://mi5ha6in.github.io/prodnote/
```

В настройках репозитория GitHub нужно выбрать `Settings -> Pages -> Build and deployment -> Source: GitHub Actions`.

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
- Optional server sync: Node.js, Hono, PostgreSQL, passkey/WebAuthn auth и Docker Compose.
