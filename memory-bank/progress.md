# Progress

**What works**

- Added backend API for VTU-style service transactions: `GET /api/service-transactions` and `POST /api/service-transactions`.
- Added SQLite table `service_transactions` with provider, reference, amount, payment method, status, cashier, and timestamp fields.
- Added frontend `VTU Services` module with service-type form (Data, Airtime, Subscription, Exams), payment capture, and recent transaction history.
- Fixed runtime issue in sales checkout where `saleId` was referenced before parsing API response.

**Not started / backlog**

- Add service transaction reporting/export filters by date/service type.

**Known issues**

- End-to-end browser verification for VTU flow not yet run in this session.

_Keep bullets factual and small; link issues or PRs when useful._
