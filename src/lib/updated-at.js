/**
 * Optimistic concurrency check: true when the updated_at a client loaded
 * still matches the stored one, so its save isn't overwriting a newer edit.
 */
export function sameUpdatedAt(clientVal, serverVal) {
  return String(clientVal ?? '').trim() === String(serverVal ?? '').trim();
}

/** True when the client sent an updated_at to check against. */
export function hasExpectedUpdatedAt(value) {
  return value != null && String(value).trim() !== '';
}
