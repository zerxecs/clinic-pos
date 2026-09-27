import argon2 from 'argon2';

export function validateAdminCredentials({ username, displayName, password }) {
  const normalizedUsername = String(username || '').trim().toLowerCase();
  const normalizedDisplayName = String(displayName || '').trim();
  if (!/^[a-z0-9._-]{3,80}$/.test(normalizedUsername) || !normalizedDisplayName || normalizedDisplayName.length > 200 || typeof password !== 'string' || password.length < 12 || password.length > 200) {
    throw new Error('Admin credentials are invalid; password must be 12 to 200 characters.');
  }
  return { username: normalizedUsername, displayName: normalizedDisplayName, password };
}

export async function hashAdminPassword(password) {
  return argon2.hash(password, { type: argon2.argon2id });
}
