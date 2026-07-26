# Noor Collection POS (Docker)

This repository contains a simple POS app (frontend + backend). Use Docker and Docker Compose to run both services without installing Node.js locally.

Run with Docker Compose:

```bash
docker-compose build
docker-compose up
```

- Frontend: http://localhost:3000
- Backend API: http://localhost:4000

Seeded users:
- Admin: `admin` / `admin123`
- Cashier: `cashier` / `12345`

Notes:
- The frontend `REACT_APP_API_URL` is configured at build-time via Docker Compose to point at the backend.
- Backend SQLite data is persisted in `backend/data` via a bind mount.
# POS Shop

## Overview
A simple POS system for small shops using React frontend, Node.js/Express backend, and SQLite.

## Setup
1. Install [Node.js](https://nodejs.org/) if not already installed.
2. Open a terminal in `C:\POS project`.
3. Run `npm install`.
4. Start the backend: `npm run --workspace backend dev`.
5. Start the frontend: `npm run --workspace frontend start`.

## Backend API
- `GET /api/products`
- `POST /api/products`
- `PUT /api/products/:id`
- `DELETE /api/products/:id`
- `POST /api/sales`
- `GET /api/reports/sales`

## Notes
- The database file is stored in `backend/data/pos.sqlite`.
- Open the frontend at `http://localhost:3000`.
- Use a barcode scanner connected as a keyboard to scan SKU codes into the search field.
- After completing a sale, click Print Receipt to print the receipt view.
