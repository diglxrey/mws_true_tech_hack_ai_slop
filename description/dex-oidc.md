# Dex (OIDC) в этом репозитории

**Dex** — лёгкий OIDC-провайдер для **локальной разработки и демо**. В продакшене обычно подключают корпоративный IdP (Keycloak, Azure AD, Okta и т.д.): тот же поток Authorization Code + PKCE, другие `issuer` и JWKS.

Конфигурация: [`docker/dex/config.yaml`](../docker/dex/config.yaml).

## Демо-пользователи (пароль везде `password`)

| Email               | Роль в конфиге | Примечание        |
| ------------------- | -------------- | ----------------- |
| admin@example.com   | группа `admins` | «Админ» для демо |
| user@example.com    | группа `users`  | обычный пользователь |
| user2@example.com   | группа `users`  | второй пользователь |

Хеши паролей в конфиге — bcrypt; при смене пароля нужно пересчитать hash (см. комментарий в `config.yaml`).

## OAuth-клиенты (staticClients)

- **`snippeter-web`** — Next.js (Auth.js). Секрет должен совпадать с `AUTH_DEX_CLIENT_SECRET` в `.env` / `apps/web/.env.local`.

`redirectURIs` в Dex **должны совпадать** с URL вашего фронта, иначе авторизация завершится ошибкой redirect mismatch:

- `http://localhost:3000/api/auth/callback/dex` — dev Next напрямую.
- `http://localhost/api/auth/callback/dex` — вариант с nginx из [`docker-compose.app.yml`](../docker-compose.app.yml).

Если вы меняете публичный URL приложения, добавьте новый `redirectURI` в Dex и обновите переменные окружения.

## Почему нельзя «просто поменять» id и клиентов

1. **`issuer` в Dex** должен совпадать с `OIDC_ISSUER` и с полем `iss` в JWT — иначе API (Nest, `jose` + JWKS) не примет токен.
2. **`OIDC_AUDIENCE` / `AUTH_DEX_CLIENT_ID`** должны соответствовать зарегистрированному клиенту и настройкам API.
3. **`userID` в staticPasswords** — стабильный субъект в токене. В meta-БД (в т.ч. wiki) в полях вроде `created_by` / `updated_by` могут сохраняться идентификаторы пользователя. Если поменять `userID` в Dex без миграции данных, старые записи перестанут осмысленно сопоставляться с новым логином.

Менять email/username можно, но **осознанно** и при необходимости с миграцией или очисткой связанных данных.
