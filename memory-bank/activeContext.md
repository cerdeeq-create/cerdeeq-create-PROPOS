# Active context

**Current focus** (one short paragraph):

Added a VTU services workflow into the existing POS app, covering Data, Airtime, Subscription TV, and Exams transactions with persistent backend storage and frontend history.

**In progress**:

- [x] Add service transaction API endpoints and SQLite table
- [x] Add frontend VTU Services view and transaction form
- [ ] Validate end-to-end flow in running browser session

**Decisions (recent)**:

- Reused the existing single App.js activeView pattern instead of introducing new pages/routes.
- Stored VTU events in a dedicated `service_transactions` table to keep data separate from product sales.

**Open questions**:

- Should only admin users access VTU, or both admin and cashier (currently both can access)?

_Update when the task or branch focus changes._
