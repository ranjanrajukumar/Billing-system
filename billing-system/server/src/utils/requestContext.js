import { AsyncLocalStorage } from 'node:async_hooks';

// Model hooks fire deep inside Sequelize with no access to req, so the request
// details ride along in async-local storage instead of being threaded through
// every controller call.
const storage = new AsyncLocalStorage();

export function runWithContext(context, fn) {
  return storage.run(context, fn);
}

export function getContext() {
  return storage.getStore();
}

/** Called once authentication resolves; the store object is mutated in place. */
export function setContextUser(user) {
  const store = storage.getStore();
  if (!store) return;
  store.userId = user?.id ?? null;
  store.userName = user?.name ?? null;
}
