-- Existing sale_item rows predate line_no. Order by the stable primary key
-- for deterministic historical numbering without changing item values.
WITH numbered AS (
  SELECT id, row_number() OVER (PARTITION BY sale_id ORDER BY id)::integer AS line_no
  FROM sale_item
)
UPDATE sale_item AS si SET line_no = numbered.line_no
FROM numbered WHERE numbered.id = si.id;

ALTER TABLE sale_item ADD CONSTRAINT sale_item_sale_line_no_unique UNIQUE (sale_id, line_no);
ALTER TABLE sale_item ADD CONSTRAINT sale_item_tax_classification_check
  CHECK (tax_classification IN ('UNCLASSIFIED','VATABLE','VAT_EXEMPT','ZERO_RATED','NON_VAT'));
ALTER TABLE sale DROP CONSTRAINT sale_status_check;
ALTER TABLE sale ADD CONSTRAINT sale_status_check CHECK (status IN ('PENDING','COMPLETED','VOIDED'));

-- Keep beneficiary identity separate from ordinary sale reads. Copy before
-- clearing the legacy duplicate values, retaining the historical records.
CREATE TABLE sale_beneficiary (
  sale_id uuid PRIMARY KEY REFERENCES sale(id) ON DELETE RESTRICT,
  benefit_type text CHECK (benefit_type IS NULL OR benefit_type IN ('SC','PWD')),
  customer_name text,
  id_number text,
  created_at timestamptz NOT NULL DEFAULT now()
);
INSERT INTO sale_beneficiary(sale_id, benefit_type, customer_name, id_number)
SELECT id, statutory_discount_type, statutory_customer_name, statutory_id_number
FROM sale
WHERE statutory_discount_type IS NOT NULL
   OR statutory_customer_name IS NOT NULL
   OR statutory_id_number IS NOT NULL
ON CONFLICT (sale_id) DO NOTHING;
UPDATE sale SET statutory_customer_name = NULL, statutory_id_number = NULL
WHERE statutory_customer_name IS NOT NULL OR statutory_id_number IS NOT NULL;

-- Protect completed financial records at the database boundary. Voiding may
-- update status and void metadata while preserving original sale calculations.
-- Existing empty tax snapshots remain explicitly unknown; this migration does
-- not infer tax classification or recalculate historical totals.
CREATE FUNCTION prevent_completed_sale_financial_change() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF OLD.status = 'COMPLETED' AND (
    NEW.receipt_number IS DISTINCT FROM OLD.receipt_number OR
    NEW.invoice_number IS DISTINCT FROM OLD.invoice_number OR
    NEW.cashier_user_id IS DISTINCT FROM OLD.cashier_user_id OR
    NEW.customer_name_snapshot IS DISTINCT FROM OLD.customer_name_snapshot OR
    NEW.subtotal IS DISTINCT FROM OLD.subtotal OR NEW.discount_total IS DISTINCT FROM OLD.discount_total OR
    NEW.tax_total IS DISTINCT FROM OLD.tax_total OR NEW.total IS DISTINCT FROM OLD.total OR
    NEW.currency IS DISTINCT FROM OLD.currency OR NEW.created_at IS DISTINCT FROM OLD.created_at OR
    NEW.tax_snapshot IS DISTINCT FROM OLD.tax_snapshot OR NEW.discount_snapshot IS DISTINCT FROM OLD.discount_snapshot OR
    NEW.taxable_total IS DISTINCT FROM OLD.taxable_total OR NEW.vat_exempt_total IS DISTINCT FROM OLD.vat_exempt_total OR
    NEW.zero_rated_total IS DISTINCT FROM OLD.zero_rated_total OR
    NEW.statutory_discount_type IS DISTINCT FROM OLD.statutory_discount_type OR
    NEW.statutory_customer_name IS DISTINCT FROM OLD.statutory_customer_name OR
    NEW.statutory_id_number IS DISTINCT FROM OLD.statutory_id_number
  ) THEN
    RAISE EXCEPTION 'Completed sale financial data is immutable' USING ERRCODE = '23000';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER sale_financial_snapshot_immutable
  BEFORE UPDATE ON sale FOR EACH ROW EXECUTE FUNCTION prevent_completed_sale_financial_change();

CREATE FUNCTION prevent_completed_sale_item_change() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE sale_status text; sale_id_to_check uuid;
BEGIN
  IF TG_OP = 'DELETE' THEN sale_id_to_check := OLD.sale_id; ELSE sale_id_to_check := NEW.sale_id; END IF;
  IF TG_OP = 'UPDATE' THEN
    SELECT status INTO sale_status FROM sale WHERE id = OLD.sale_id;
    IF sale_status = 'COMPLETED' THEN
      RAISE EXCEPTION 'Completed sale items are immutable' USING ERRCODE = '23000';
    END IF;
  END IF;
  SELECT status INTO sale_status FROM sale WHERE id = sale_id_to_check;
  IF sale_status = 'COMPLETED' THEN
    RAISE EXCEPTION 'Completed sale items are immutable' USING ERRCODE = '23000';
  END IF;
  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER sale_item_financial_snapshot_immutable
  BEFORE INSERT OR UPDATE OR DELETE ON sale_item FOR EACH ROW EXECUTE FUNCTION prevent_completed_sale_item_change();
