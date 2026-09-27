CREATE TABLE tax_configuration (
  id smallint PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  registration_type text NOT NULL DEFAULT 'UNCONFIGURED' CHECK (registration_type IN ('UNCONFIGURED','VAT_REGISTERED','NON_VAT','VAT_EXEMPT')),
  vat_rate_basis_points integer NOT NULL DEFAULT 0 CHECK (vat_rate_basis_points BETWEEN 0 AND 10000),
  pricing_mode text NOT NULL DEFAULT 'INCLUSIVE' CHECK (pricing_mode IN ('INCLUSIVE','EXCLUSIVE')),
  registered_name text,
  trade_name text,
  tin text,
  branch_code text,
  registered_address text,
  effective_from date,
  updated_by uuid REFERENCES app_user(id) ON DELETE RESTRICT,
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (registration_type = 'VAT_REGISTERED' OR vat_rate_basis_points = 0)
);
INSERT INTO tax_configuration(id) VALUES (1);

ALTER TABLE product ADD COLUMN tax_classification text NOT NULL DEFAULT 'UNCLASSIFIED'
  CHECK (tax_classification IN ('UNCLASSIFIED','VATABLE','VAT_EXEMPT','ZERO_RATED','NON_VAT'));
ALTER TABLE product ADD COLUMN item_type text NOT NULL DEFAULT 'PRODUCT' CHECK (item_type IN ('PRODUCT','SERVICE'));
ALTER TABLE product ADD COLUMN sc_discount_eligible boolean NOT NULL DEFAULT false;
ALTER TABLE product ADD COLUMN pwd_discount_eligible boolean NOT NULL DEFAULT false;
ALTER TABLE product ADD COLUMN promotion_basis_points integer NOT NULL DEFAULT 0 CHECK (promotion_basis_points BETWEEN 0 AND 10000);

ALTER TABLE sale ADD COLUMN invoice_number text UNIQUE;
ALTER TABLE sale ADD COLUMN tax_snapshot jsonb NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE sale ADD COLUMN discount_snapshot jsonb NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE sale ADD COLUMN taxable_total numeric(12,2) NOT NULL DEFAULT 0 CHECK (taxable_total >= 0);
ALTER TABLE sale ADD COLUMN vat_exempt_total numeric(12,2) NOT NULL DEFAULT 0 CHECK (vat_exempt_total >= 0);
ALTER TABLE sale ADD COLUMN zero_rated_total numeric(12,2) NOT NULL DEFAULT 0 CHECK (zero_rated_total >= 0);
ALTER TABLE sale ADD COLUMN statutory_discount_type text CHECK (statutory_discount_type IN ('SC','PWD'));
ALTER TABLE sale ADD COLUMN statutory_customer_name text;
ALTER TABLE sale ADD COLUMN statutory_id_number text;

ALTER TABLE sale_item ADD COLUMN gross_amount numeric(12,2) NOT NULL DEFAULT 0 CHECK (gross_amount >= 0);
ALTER TABLE sale_item ADD COLUMN tax_classification text NOT NULL DEFAULT 'UNCLASSIFIED';
ALTER TABLE sale_item ADD COLUMN taxable_amount numeric(12,2) NOT NULL DEFAULT 0 CHECK (taxable_amount >= 0);
ALTER TABLE sale_item ADD COLUMN vat_exempt_amount numeric(12,2) NOT NULL DEFAULT 0 CHECK (vat_exempt_amount >= 0);
ALTER TABLE sale_item ADD COLUMN zero_rated_amount numeric(12,2) NOT NULL DEFAULT 0 CHECK (zero_rated_amount >= 0);
ALTER TABLE sale_item ADD COLUMN discount_type text CHECK (discount_type IN ('SC','PWD','PROMOTION'));
ALTER TABLE sale_item ADD COLUMN line_no integer NOT NULL DEFAULT 1 CHECK (line_no > 0);
