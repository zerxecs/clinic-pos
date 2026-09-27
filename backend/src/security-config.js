const placeholderPattern = /^(?:password(?:\d+)?|changeme|change-me|secret|your[-_].*|replace[-_].*|placeholder.*|development[-_].*|example.*)$/i;

export function validateAccessTokenSecret(value) {
  if (typeof value !== 'string' || Buffer.byteLength(value.trim()) < 32 || placeholderPattern.test(value.trim())) {
    throw new Error('ACCESS_TOKEN_SECRET must be a non-placeholder value of at least 32 bytes');
  }
  return value;
}
