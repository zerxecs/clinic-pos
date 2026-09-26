# Architecture

See the approved clinic POS architecture proposal on Multica issue POSS-2. Core records: app_user, role, user_role, product, product_price, supplier, inventory_lot, stock_movement, sale, sale_item, sale_item_lot, payment, and audit_log.

PostgreSQL uses ordered, forward-only migrations. Use UUID identifiers, timestamptz event times, NUMERIC for money and quantities, and preserve posted sales as immutable snapshots. Lot deductions use FEFO and are committed in the same transaction as sale items, payments, stock movements, and audit entries.
