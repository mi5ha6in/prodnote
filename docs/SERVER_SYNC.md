# Server Sync

ProdNote может работать полностью локально, как раньше, или подключаться к self-host серверу синхронизации.

## Стек

- Node.js 24.
- Hono HTTP API.
- PostgreSQL 18.
- Drizzle ORM для подключения и миграций.
- SimpleWebAuthn для passkey-входа без email, телефона и пароля.
- Docker Compose для локального self-host запуска.

## Запуск через Docker

```bash
docker compose up --build
```

Адрес приложения:

```text
http://localhost:8787/
```

Сервисы:

- `app`: собирает frontend, запускает Node/Hono API и отдаёт статические файлы из `dist`.
- `db`: PostgreSQL 18 с volume `prodnote-postgres-18`, смонтированным в `/var/lib/postgresql`.

## Локальная разработка сервера

Нужен доступный Postgres и `DATABASE_URL`.

```bash
DATABASE_URL=postgres://prodnote:prodnote@127.0.0.1:5432/prodnote npm run dev:server
```

Frontend dev server остаётся отдельным:

```bash
npm run dev
```

В dev-режиме клиент по умолчанию использует API:

```text
http://localhost:8787
```

Passkey/WebAuthn не принимает IP `127.0.0.1` как RP domain, поэтому для входа через passkey открывайте локальное приложение через `localhost`. Сервер по умолчанию принимает Vite origins `127.0.0.1/localhost` на портах `5173-5179`, чтобы dev-запуск фронта и API не ломался; для passkey в dev тоже используйте `localhost`. Для своего домена задайте `APP_ORIGIN` или список `APP_ORIGINS` через запятую.

## Auth

Вход сделан через passkey/WebAuthn.

Сервер хранит:

- случайный `user.id`;
- случайный `handle`, например `prodnote-7K4F2`;
- public credential passkey;
- HttpOnly session cookie.

Сервер не хранит email, телефон, имя или пароль.

## Sync Model

Клиент остаётся offline-first:

- UI работает с `ProdNoteStore` и IndexedDB;
- сервер подтягивается после локальной загрузки;
- после локальных `commit()` запускается debounced push;
- ручная кнопка `Синхронизировать сейчас` есть в настройках.

Сервер хранит нормализованные таблицы для workspace-сущностей и отдаёт/принимает текущий `Workspace` JSON contract.

Активный таймер не синхронизируется в v1. Синхронизируются только завершённые `TimeSession`.

## API

- `GET /api/health`
- `GET /api/me`
- `POST /api/auth/passkey/register/options`
- `POST /api/auth/passkey/register/verify`
- `POST /api/auth/passkey/login/options`
- `POST /api/auth/passkey/login/verify`
- `POST /api/auth/logout`
- `GET /api/workspace`
- `PUT /api/workspace`

## Ограничения v1

- Один пользователь владеет одним workspace.
- Нет совместной работы.
- Нет end-to-end encryption: self-host сервер технически видит содержимое задач и заметок.
- Conflict policy: entity-level last-write-wins по timestamp.
