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
