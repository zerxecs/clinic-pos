/** Shape product search results according to the caller's server-verified role. */
export function shapeProductRows(rows, isAdmin) {
  if (isAdmin) return rows;

  return rows.map(({ id, sku, barcode, name, description, unit, item_type, price, currency, qty_sellable, qty_expiring_soon }) => ({
    id,
    sku,
    barcode,
    name,
    description,
    unit,
    item_type,
    price,
    currency,
    qty_sellable,
    expiry_warning: Number(qty_expiring_soon) > 0,
  }));
}
