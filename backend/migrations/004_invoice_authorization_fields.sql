ALTER TABLE tax_configuration
  ADD COLUMN permit_to_use_number text,
  ADD COLUMN permit_to_use_date date,
  ADD COLUMN authority_to_print_number text,
  ADD COLUMN authority_to_print_date date,
  ADD COLUMN approved_serial_numbers text;
