# Snippeter (wiki)

Коллаборативная **wiki** на Next.js: страницы, теги, версии, комментарии, граф связей, встраиваемые блоки **MWS Tables**, опциональные подсказки **LLM** в редакторе. Данные wiki и метаданные — в **PostgreSQL (meta-БД)**; авторизация через **OIDC** (в демо — [Dex](https://dexidp.io/)).

Подробнее про Docker, Dex и «хвост» API без UI: папка [`description/`](description/).

## Сертификат участника

![Сертификат участника True Tech Hack 2026](assets/certificate.jpg)

## Быстрый старт (Docker)

1. `cp .env.example .env` и заполните как минимум `MWS_*`, `AUTH_SECRET` (секреты провайдеров — плейсхолдеры вида `insert-your-key` в примере).
2. Для локальных переопределений Next (по желанию): `cp apps/web/.env.example apps/web/.env.local`.
3. Поднимите инфраструктуру и приложения:

   ```bash
   docker compose -f docker-compose.yml -f docker-compose.app.yml up -d --build
   ```

4. Откройте `http://localhost/` (nginx → Next), войдите через Dex (см. ниже). Публичный REST/WS Nest: `http://localhost/api/v1` (порт 3001 на хосте не публикуется).

Пошагово и порты: [`description/docker-deploy.md`](description/docker-deploy.md).

## Быстрый старт (разработка без Docker приложений)

- Инфраструктура: `docker compose up -d` (Postgres, Redis, MinIO, Dex).
- `pnpm install` из корня репозитория.
- `cp .env.example .env` и при необходимости `apps/web/.env.local` из примера.
- `pnpm dev` — Turbo поднимает `api` и `web`.

Wiki: `http://localhost:3000/wiki` после входа.

## Dex: демо-логины

Пароль для всех учёток ниже: **`password`**.

| Email             | Заметка      |
| ----------------- | ------------ |
| admin@example.com | группа admins |
| user@example.com  | группа users  |
| user2@example.com | группа users |

Почему нельзя произвольно менять `userID` и OAuth-клиентов без правок env и данных — в [`description/dex-oidc.md`](description/dex-oidc.md).

## Полезные команды

| Команда | Назначение |
| ------- | ---------- |
| `pnpm dev` | dev через Turbo |
| `pnpm build` | сборка пакетов |
| `pnpm lint` / `pnpm typecheck` | проверки |
| `pnpm --filter api test` | тесты API |

Требования: **Node ≥ 20**, **pnpm 9** (см. корневой `package.json`).

## Безопасность

Если реальные ключи (LLM, MWS, Langfuse и т.д.) когда-либо попадали в чат или публичный репозиторий — **отзовите их у провайдера** и задайте новые в `.env`. В репозитории только примеры с плейсхолдерами.

## Документация

- Docker: [`description/docker-deploy.md`](description/docker-deploy.md).
- Dex / OIDC: [`description/dex-oidc.md`](description/dex-oidc.md).
