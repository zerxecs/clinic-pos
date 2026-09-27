# API contract (v1)

JSON REST API under `/api/v1`; request validation at the boundary, stable error codes, pagination, and request IDs. Protected routes require an active user and server-checked ADMIN/CASHIER role.

## Auth and users

- `POST /auth/login`, `/auth/refresh`, `/auth/logout`; `GET /auth/me`.
- Admin: `GET/POST /users`, `GET/PATCH /users/{id}`, `PUT /users/{id}/roles`.
- Admin reports: `GET /reports/sales`, `/reports/stock`, `/audit-logs`.

## Catalog and inventory

- `GET/POST /products`, `GET/PATCH /products/{id}`, `GET/POST /products/{id}/prices`; search accepts text and exact SKU/barcode.
- Product search returns active catalog details and `qty_sellable` (unexpired and active lots) to Cashiers, plus an `expiry_warning` when sellable stock expires within 30 days. Cashier responses omit raw on-hand totals, lot summaries, and lot-level status. Admin responses retain `qty_on_hand` and lot details for inventory inspection.
- `GET/POST /suppliers`, `GET/PATCH /suppliers/{id}`.
- `GET /inventory/lots`, `POST /inventory/receipts`, `POST /inventory/adjustments`, `GET /inventory/movements`, `GET /inventory/expiring`.

## Sales and payments

- `GET /tax-configuration` returns the configured seller/tax snapshot to authenticated users; `PUT /tax-configuration` is Admin-only and records an audit event. The initial status is `UNCONFIGURED`; checkout and quotes fail closed until an Admin enters the clinic's real registration and business details.
- Admin-managed catalog fields include `item_type` (`PRODUCT` or `SERVICE`), `tax_classification` (`VATABLE`, `VAT_EXEMPT`, `ZERO_RATED`, `NON_VAT`), SC/PWD eligibility flags, and a promotional discount in basis points. Product rows deduct FEFO inventory; services do not require or move stock. New and migrated products remain tax `UNCLASSIFIED` until reviewed.
- `POST /sales/quote` returns a server-calculated subtotal, discounts, tax, exempt/zero-rated amounts, and total. It accepts a single selected statutory type (`SC` or `PWD`), never a client-supplied percentage.
- `POST /sales` accepts an `Idempotency-Key`, item product IDs/quantities, and one or more payment tenders (`CASH`, `CARD`, `E_WALLET`, `OTHER`). Split tenders are allowed; tender amounts must sum exactly to the payable total. A statutory request contains only type, customer name, and ID number. A payment failure creates no completed sale and no stock deduction.
- Idempotency is scoped to the authenticated cashier and endpoint. Same key and same normalized request returns the original response; same key with a different request returns `409 IDEMPOTENCY_KEY_REUSED`.
- Checkout locks FEFO-ordered eligible lots, rejects expired/insufficient stock, and atomically writes sale/item snapshots, lot allocations, payment records, stock movements/balances, and audit entry. Failures roll back all changes.
- Responses include invoice number, timestamp, cashier, currency, subtotal/discount/tax/tax classification/total, line snapshots, tender method/amount/reference/status, and seller/tax/discount snapshots. Exact tender is preserved; no change is calculated. `GET /sales` supports paginated history filters; `GET /sales/{id}` returns the original stored invoice data; `POST /sales/{id}/void` records compensating entries while preserving original history.

Tax arithmetic uses integer cents and configured basis-point rates. VAT-inclusive selling prices have VAT extracted from the displayed amount; VAT-exclusive prices have tax added after discounts. SC/PWD discount eligibility is stored per product and one statutory benefit is compared against the configured promotion per line. Tax registration, tax classifications, eligibility, and applicable invoice rules must be confirmed against the clinic's documents and current professional advice before live use.

Cashier can search products, read sellable availability, create sales, and read permitted sales history. Admin can manage catalog/prices, suppliers, stock, users/roles, and reports. Error responses include `code`, `message`, `request_id`; stock conflicts use HTTP 409.


## Inventory, reports, and payment validation

- Product search responses are role-aware: Cashiers receive `qty_sellable` and a 30-day `expiry_warning`, without lot identifiers, lot codes, expiry dates, raw on-hand quantities, or lot active/sellability flags. Admins also receive `qty_on_hand` and a `lots` array for lots with positive on-hand quantity; each lot entry contains its ID/code, expiry date, on-hand quantity, active flag, and computed `is_sellable` flag.
- Admin-only GET /inventory/movements returns movement, product, lot, reference, actor, reason, and timestamp fields. Optional filters are product_id, lot_id, movement_type, from, and to (ISO dates); limit and offset paginate results.
- Admin-only GET /reports/sales accepts ISO date from/to (defaults to the last 30 days; maximum 366 days) and returns per-currency completed/voided counts and completed totals plus completed sales grouped by day and currency.
- Admin-only GET /reports/stock returns per-product on-hand, sellable, expired, expiring-soon, lot-count, and cost-value totals. Optional expiring_days defaults to 30 and is bounded to 0?365.
- Admin sees all receipt metadata from GET /sales; a Cashier sees only their own. The detail endpoint continues to enforce the same ownership rule.
- Tender objects accept only method, amount (positive, at most two decimal places), and optional reference. Payment status is server-owned: client-supplied status/outcome fields such as FAILED are rejected with HTTP 400 before the transaction starts. Payment totals are checked before sale, inventory, or payment writes; database failures during checkout roll the transaction back.
