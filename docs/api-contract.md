# API contract (v1)

JSON REST API under `/api/v1`; request validation at the boundary, stable error codes, pagination, and request IDs. Protected routes require an active user and server-checked ADMIN/CASHIER role.

## Auth and users

- `POST /auth/login`, `/auth/refresh`, `/auth/logout`; `GET /auth/me`.
- Admin: `GET/POST /users`, `GET/PATCH /users/{id}`, `PUT /users/{id}/roles`.
- Admin reports: `GET /reports/sales`, `/reports/stock`, `/audit-logs`.

## Catalog and inventory

- `GET/POST /products`, `GET/PATCH /products/{id}`, `GET/POST /products/{id}/prices`; search accepts text and exact SKU/barcode.
- Product availability includes `qty_on_hand`, `qty_sellable` (unexpired and active lots), and lot summaries with expiry dates. Cashier sees sellable totals and expiry warnings; Admin may inspect all lots.
- `GET/POST /suppliers`, `GET/PATCH /suppliers/{id}`.
- `GET /inventory/lots`, `POST /inventory/receipts`, `POST /inventory/adjustments`, `GET /inventory/movements`, `GET /inventory/expiring`.

## Sales and payments

- `POST /sales` accepts an `Idempotency-Key`, item product IDs/quantities, and one or more payment tenders (`CASH`, `CARD`, `E_WALLET`, `OTHER`). Split tenders are allowed; tender amounts must sum to the payable total. A payment failure creates no completed sale and no stock deduction.
- Idempotency is scoped to the authenticated cashier and endpoint. Same key and same normalized request returns the original response; same key with a different request returns `409 IDEMPOTENCY_KEY_REUSED`.
- Checkout locks FEFO-ordered eligible lots, rejects expired/insufficient stock, and atomically writes sale/item snapshots, lot allocations, payment records, stock movements/balances, and audit entry. Failures roll back all changes.
- Responses include receipt number, timestamp, cashier, currency, subtotal/discount/tax/total, item SKU/name/quantity/unit price/line total, tender method/amount/reference/status, and change due where applicable. `GET /sales` supports paginated history filters; `GET /sales/{id}` returns receipt details; `POST /sales/{id}/void` records compensating entries while preserving original history.

Cashier can search products, read sellable availability, create sales, and read permitted sales history. Admin can manage catalog/prices, suppliers, stock, users/roles, and reports. Error responses include `code`, `message`, `request_id`; stock conflicts use HTTP 409.


## Inventory, reports, and payment validation

- Product search responses include qty_on_hand, qty_sellable, and a lots array for lots with positive on-hand quantity. Each lot entry contains its ID/code, expiry date, on-hand quantity, active flag, and computed is_sellable flag.
- Admin-only GET /inventory/movements returns movement, product, lot, reference, actor, reason, and timestamp fields. Optional filters are product_id, lot_id, movement_type, from, and to (ISO dates); limit and offset paginate results.
- Admin-only GET /reports/sales accepts ISO date from/to (defaults to the last 30 days; maximum 366 days) and returns per-currency completed/voided counts and completed totals plus completed sales grouped by day and currency.
- Admin-only GET /reports/stock returns per-product on-hand, sellable, expired, expiring-soon, lot-count, and cost-value totals. Optional expiring_days defaults to 30 and is bounded to 0?365.
- Admin sees all receipt metadata from GET /sales; a Cashier sees only their own. The detail endpoint continues to enforce the same ownership rule.
- Tender objects accept only method, amount (positive, at most two decimal places), and optional reference. Payment status is server-owned: client-supplied status/outcome fields such as FAILED are rejected with HTTP 400 before the transaction starts. Payment totals are checked before sale, inventory, or payment writes; database failures during checkout roll the transaction back.
