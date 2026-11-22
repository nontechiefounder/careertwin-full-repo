// The fabricated-content worker is retired. No application fallback is allowed.
export async function processOutboxEvent() {
  throw new Error('LEGACY_WORKER_DISABLED_USE_CONTEXT_SERVICE');
}
export async function drainPendingOutboxEvents() {
  throw new Error('LEGACY_WORKER_DISABLED_USE_CONTEXT_SERVICE');
}
