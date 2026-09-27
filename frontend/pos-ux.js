// Date-only expiry values are clinic calendar dates. The browser's local
// timezone is the POS workstation timezone until the app has a clinic setting.
export function isWithinExpiryWarning(expiresOn, now = new Date(), days = 30) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(expiresOn || '')) return false;
  const [year, month, day] = expiresOn.split('-').map(Number);
  const expiry = new Date(year, month - 1, day);
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  return (expiry - today) / 86400000 <= days;
}

export function findExactBarcode(products, query) {
  const barcode = String(query || '').trim();
  return barcode ? products.find(product => String(product.barcode || '') === barcode) : undefined;
}

export function barcodeFromKeyboardEvent(event, products, query) {
  return event?.key === 'Enter' ? findExactBarcode(products, query) : undefined;
}
