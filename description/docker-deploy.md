# Запуск через Docker

Инфраструктура (Postgres meta + data, Redis, MinIO, Dex): `[docker-compose.yml](../docker-compose.yml)`.

Приложения (Nest API, Next.js, nginx как reverse proxy к Next): `[docker-compose.app.yml](../docker-compose.app.yml)`.

## Минимальный сценарий

1. Скопируйте примеры окружения:
  ```bash
   cp .env.example .env
   cp apps/web/.env.example apps/web/.env.local
  ```
2. В **корневом** `.env` задайте реальные значения как минимум:
  - `MWS_FUSION_BASE_URL`, `MWS_TOKEN` (и при необходимости `MWS_SPACE_ID`)
  - Для wiki AI (опционально): `LLM_API_KEY`, `LLM_PROVIDER`, `LLM_MODEL`
  - `AUTH_SECRET` (сгенерируйте: `openssl rand -base64 32`)
  - для входа через nginx на порту 80: `AUTH_URL=http://localhost`, `AUTH_TRUST_HOST=true` (в корневом `.env` или задано в `docker-compose.app.yml` для сервиса `web`)
3. Для **Docker** выровняйте URL с комментариями в `.env.example`: сервисы внутри compose обращаются друг к другу по именам (`postgres-meta`, `redis`, `minio`, `dex`, `api`). В `docker-compose.app.yml` для API заданы переопределения `META_DATABASE_URL`, `REDIS_URL`, `S3_ENDPOINT`, `OIDC_JWKS_URI`, `CORS_ORIGIN` — при необходимости скорректируйте их в compose или в `.env`.
4. Поднимите всё:
  ```bash
   docker compose -f docker-compose.yml -f docker-compose.app.yml up -d --build
  ```
5. Откройте в браузере:
  - Wiki через nginx: `http://localhost/` (после логина — главная или `/wiki`)
  - API (REST и WebSocket wiki collab): `http://localhost/api/v1` (nginx проксирует на контейнер `api`, порт 3001 снаружи не открыт)
  - Dex: `http://localhost:5556/dex`

`NEXT_PUBLIC_API_URL` при сборке образа `web` по умолчанию `http://localhost` (тот же origin, что и nginx на :80): WebSocket коллаба и внешние ссылки строятся как `http://localhost/api/v1/...`. Аутентифицированные REST-вызовы из UI по-прежнему идут через Next BFF `/api/backend/*` с подстановкой Bearer. Для локального `pnpm dev` без nginx задайте в `apps/web/.env.local` значение `http://localhost:3001`.

## Схема портов (по умолчанию)


| Порт (хост) | Сервис         |
| ----------- | -------------- |
| 80          | nginx → Next и `/api/v1/*` → Nest (внутри сети) |
| 15432       | Postgres meta  |
| 15433       | Postgres data  |
| 6379        | Redis          |
| 9000 / 9001 | MinIO API / UI |
| 5556        | Dex            |


## Миграции meta-БД

Таблицы wiki и остальная схема meta-БД применяются **при старте API** (`MetaMigrationService`, файлы в `apps/api/src/db/migrations/`). Отдельный шаг миграций не нужен, если API успешно подключился к `postgres-meta`.

## Nginx

Конфиг: `[docker/nginx/default.conf](../docker/nginx/default.conf)`. Проксирует `/` на `web:3000`, префикс `/api/v1/` на `api:3001` (путь к Nest без изменений), с заголовками `X-Forwarded-`* и поддержкой WebSocket для wiki collab.

Если приложение за HTTPS-терминацией, добавьте `X-Forwarded-Proto https` на балансировщике и при необходимости задайте `AUTH_URL` / `AUTH_TRUST_HOST` для Auth.js (см. `apps/web/.env.example`).