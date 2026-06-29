// In-memory conversation state for the inbound WhatsApp booking flow, keyed by
// the patient's E.164 phone number, with a 30-minute TTL (idle conversations
// are dropped so a returning patient starts fresh).
//
// ⚠️  PRODUCTION CAVEAT — Vercel serverless is stateless and ephemeral. Each
// function invocation may land on a different (or cold) instance, so this Map
// is NOT reliably shared between two inbound webhook messages in production.
// CONFIRM / CANCEL and single-shot FAQ replies are stateless and work fine, but
// the MULTI-STEP booking flow needs shared state. For real production scale,
// replace this Map with Redis (e.g. Upstash) or a small DB table keyed by phone.

const TTL_MS = 30 * 60 * 1000; // 30 minutes
const store = new Map(); // phone -> { state, expiresAt }

function isExpired(entry) {
  return !entry || entry.expiresAt <= Date.now();
}

// Returns the current state object for a phone, or null if none / expired.
export function getState(phone) {
  const entry = store.get(phone);
  if (isExpired(entry)) {
    store.delete(phone);
    return null;
  }
  return entry.state;
}

// Replaces the state for a phone and (re)sets its 30-min TTL.
export function setState(phone, state) {
  store.set(phone, { state, expiresAt: Date.now() + TTL_MS });
  return state;
}

// Shallow-merges a patch into the existing state (or starts a new one).
export function patchState(phone, patch) {
  const current = getState(phone) || { step: null, data: {} };
  const next = { ...current, ...patch, data: { ...current.data, ...(patch.data || {}) } };
  return setState(phone, next);
}

export function clearState(phone) {
  store.delete(phone);
}

// Opportunistic sweep of expired entries (called on each inbound message so the
// Map can't grow unbounded on a long-lived instance).
export function sweep() {
  for (const [phone, entry] of store) {
    if (isExpired(entry)) store.delete(phone);
  }
}
