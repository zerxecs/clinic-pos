export function canonicalJson(value) {
  if (Array.isArray(value)) {
    return `[${value.map(canonicalJson).join(',')}]`;
  }

  if (value && typeof value === 'object') {
    const entries = Object.keys(value)
      .sort()
      .map(key => `${JSON.stringify(key)}:${canonicalJson(value[key])}`);

    // Stable object-key order gives idempotency checks the same bytes when
    // equivalent request objects arrive with keys in a different order.
    return `{${entries.join(',')}}`;
  }

  return JSON.stringify(value);
}
