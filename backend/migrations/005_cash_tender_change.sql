-- These values describe only transactions created after this migration. Keep
-- legacy values NULL because their original tender and change are unknown.
ALTER TABLE payment
  ADD COLUMN tendered_amount numeric(12,2),
  ADD COLUMN change_amount numeric(12,2),
  ADD CONSTRAINT payment_tender_change_pair CHECK (
    (tendered_amount IS NULL AND change_amount IS NULL) OR
    (tendered_amount IS NOT NULL AND change_amount IS NOT NULL AND tendered_amount >= amount AND change_amount >= 0)
  );
