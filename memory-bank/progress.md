# Progress

**What works**

- Added backend API for VTU-style service transactions: `GET /api/service-transactions` and `POST /api/service-transactions`.
- Added SQLite table `service_transactions` with provider, reference, amount, payment method, status, cashier, and timestamp fields.
- Added frontend `VTU Services` module with service-type form (Data, Airtime, Subscription, Exams), payment capture, and recent transaction history.
- Fixed runtime issue in sales checkout where `saleId` was referenced before parsing API response.
- Added new mobile app scaffold `mobile-video-editor/` (Expo + React Native) for classic, modern, and premium video editing UX.
- Implemented video import, preview, style packs, trim controls, playback speed, premium feature list, and export simulation flow in `mobile-video-editor/App.tsx`.
- Replaced `mobile-video-editor/App.tsx` with a full Pro Mobile Suite implementation including dashboard tabs, timeline clip operations (split/duplicate/delete/reverse/freeze), undo/redo snapshots, AI caption editor, local autosave/recovery, and export-package file writing.
- Updated mobile app branding metadata in `mobile-video-editor/app.json` to Pro Mobile Suite naming/slug.
- Added and aligned required Expo dependencies for the new app implementation (`expo-file-system`, slider/asset/react-native compatibility versions).
- Validated latest mobile app runtime: Expo web successfully bundled after dependency reconciliation (`Web Bundled ... AppEntry.js`).
- Added backend Media Vault APIs for legal social-account linking and authorized media backup import/export in `backend/src/index.js`.
- Added frontend admin Media Vault module with account-link, import-job, asset-list, and JSON export UX in `frontend/src/App.js`.
- Added validator coverage for social account linking and media import request payloads in `backend/src/validation.test.js`.
- Added OAuth-ready account link completion support with optional authorization code exchange and provider token encryption-at-rest scaffold (`TOKEN_ENCRYPTION_SECRET`) in `backend/src/index.js`.
- Updated Media Vault frontend completion form to accept authorization code and display OAuth mode result in `frontend/src/App.js`.
- Documented OAuth env vars and Media Vault flow in `README.md`.
- Added provider media endpoint support (`TIKTOK_MEDIA_LIST_URL`, `FACEBOOK_MEDIA_LIST_URL`) and token refresh leeway control (`TOKEN_REFRESH_LEEWAY_SECONDS`) in backend config.
- Import jobs now try provider-backed asset fetch using stored encrypted tokens and refresh tokens first, then fall back to simulation when provider fetch cannot run.
- Implemented platform-specific adapter mapping in `backend/src/index.js` for TikTok/Facebook payload shapes, including URL templating with `{account_id}` and deterministic normalized asset fields.
- Added `GET /api/media-vault/env-check` to validate OAuth and import env readiness, and `POST /api/media-vault/test-connection` to probe provider connectivity for linked accounts.
- Extended import job persistence to include `importMode` and `errorMessage`, and updated frontend Media Vault UI to display these diagnostics.
- Added `Copy Env Template` UX in `frontend/src/App.js` to generate and copy a ready-to-fill `.env` block derived from current Media Vault environment status.
- Added `Download .env.example` action in `frontend/src/App.js` to export the generated Media Vault env template as a file.

**Not started / backlog**

- Add service transaction reporting/export filters by date/service type.
- Add real video rendering/export integration (FFmpeg kit or backend render pipeline).
- Replace Media Vault simulated OAuth/import stubs with official provider API integrations and secure token storage.
- Add provider-specific token refresh and media listing integrations against official TikTok/Facebook APIs.
- Break down `mobile-video-editor/App.tsx` into smaller components/modules to reduce maintenance risk.

**Known issues**

- End-to-end browser verification for VTU flow not yet run in this session.
- Windows shell context in this environment can intermittently mangle PowerShell command prefixes/control chars (`^U`), so `cmd /c npm ...` is more reliable for Expo run checks.
- Frontend jest run in this environment reported incomplete `RUNS` output; backend tests passed and frontend changed files show zero editor diagnostics.

_Keep bullets factual and small; link issues or PRs when useful._
