# Noor Collection POS (Docker)

This repository contains a simple POS app (frontend + backend) that can be run locally or hosted on a server with Docker.

## Run with Docker Compose

```bash
docker compose up --build
```

- Frontend: http://localhost:3000
- Backend API: http://localhost:4000

## Hosted / LAN access

For a machine that should be reachable from another laptop or device on the same network, use:

```bash
docker compose -f docker-compose.hosted.yml up --build -d
```

Then open the host machine IP address on port 3000, for example:

- http://192.168.1.50:3000

Seeded users:
- Admin: `admin` / `admin123`
- Cashier: `cashier` / `12345`

Notes:
- The frontend now proxies API requests through the same host, so the app can be opened from a remote device without needing a separate backend URL.
- Backend SQLite data is persisted in `backend/data` via a bind mount.

## Local development

If you prefer to run without Docker:

```bash
npm install
npm run --workspace backend dev
npm run --workspace frontend start
```

## Backend API
- `GET /api/products`
- `POST /api/products`
- `PUT /api/products/:id`
- `DELETE /api/products/:id`
- `POST /api/sales`
- `GET /api/reports/sales`
- `GET /api/service-transactions`
- `POST /api/service-transactions`

## Media Vault (Authorized Social Backup)

Admin users can use the in-app Media Vault module to:
- start an account link flow for TikTok/Facebook,
- complete link with OAuth state + authorization code,
- run authorized import jobs,
- export a JSON backup manifest.

This implementation only supports legal/authorized account backups. It does not bypass provider controls.

### Required backend environment variables (OAuth-enabled mode)

Set these on your backend service before using real provider OAuth:

- `TOKEN_ENCRYPTION_SECRET` (required, long random string)
- `TIKTOK_CLIENT_ID`
- `TIKTOK_CLIENT_SECRET`
- `TIKTOK_OAUTH_AUTHORIZE_URL`
- `TIKTOK_OAUTH_TOKEN_URL`
- `TIKTOK_OAUTH_REDIRECT_URI`
- `TIKTOK_OAUTH_SCOPE` (optional)
- `TIKTOK_MEDIA_LIST_URL` (optional for provider-backed imports)
- `FACEBOOK_CLIENT_ID`
- `FACEBOOK_CLIENT_SECRET`
- `FACEBOOK_OAUTH_AUTHORIZE_URL`
- `FACEBOOK_OAUTH_TOKEN_URL`
- `FACEBOOK_OAUTH_REDIRECT_URI`
- `FACEBOOK_OAUTH_SCOPE` (optional)
- `FACEBOOK_MEDIA_LIST_URL` (optional for provider-backed imports)
- `TOKEN_REFRESH_LEEWAY_SECONDS` (optional; default `120`)

If OAuth env vars are missing, Media Vault falls back to simulated link mode for development.

When media list endpoints and encrypted tokens are available, import jobs try provider APIs first and only fall back to simulation when provider fetch fails.

Provider adapter notes:
- `TIKTOK_MEDIA_LIST_URL` and `FACEBOOK_MEDIA_LIST_URL` can include `{account_id}` placeholder, which will be replaced with linked `platformAccountId`.
- Adapter currently recognizes common response containers:
	- TikTok: `data.videos`, `data.items`, `videos`, `items`, `data`
	- Facebook: `data`, `posts.data`, `items`
- Normalized media fields persisted are: `platformMediaId`, `mediaType`, `sourceUrl`, `thumbnailUrl`, `caption`, `postedAt`, `downloadPath`.

### Media Vault API endpoints

- `GET /api/media-vault/accounts`
- `POST /api/media-vault/accounts/link-init`
- `POST /api/media-vault/accounts/link-complete`
- `POST /api/media-vault/import-jobs`
- `GET /api/media-vault/import-jobs`
- `GET /api/media-vault/assets`
- `GET /api/media-vault/export`
- `GET /api/media-vault/env-check` (validates OAuth/env readiness)
- `POST /api/media-vault/test-connection` (tests provider connectivity for a linked account)

Import jobs now persist provider diagnostics:
- `importMode` (`provider` or `simulated`)
- `errorMessage` (provider failure reason when fallback happened)

Media Vault UI now includes `Copy Env Template` and `Download .env.example` actions that generate a ready-to-fill environment template based on the latest `env-check` snapshot.

## Notes
- The database file is stored in `backend/data/pos.sqlite`.
- Use a barcode scanner connected as a keyboard to scan SKU codes into the search field.
- After completing a sale, click Print Receipt to print the receipt view.
