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

## Notes
- The database file is stored in `backend/data/pos.sqlite`.
- Use a barcode scanner connected as a keyboard to scan SKU codes into the search field.
- After completing a sale, click Print Receipt to print the receipt view.
