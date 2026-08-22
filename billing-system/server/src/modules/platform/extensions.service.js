/**
 * Where a domain contributes to something platform owns.
 *
 * Platform is the floor the rest of the system stands on: authentication,
 * settings, the notification bell, document rendering. The moment it reaches
 * *upward* — asking inventory for stock, asking sales how to draw an invoice —
 * the floor depends on the building, and the modules can no longer be reasoned
 * about or switched off independently.
 *
 * The fix is not to move the code. It is to turn the call around. Platform
 * declares a point and asks whoever is listening; the domains answer. Nothing
 * in `platform/` names a domain, and a domain that is never loaded simply
 * contributes nothing — which is exactly what "this module is switched off"
 * should mean.
 *
 * Two shapes, because there are two kinds of question:
 *
 *   emit/on         many answers, all wanted — every alert, every extra column
 *   provide/resolve one answer, or none — how to render an invoice
 *
 * Registration happens once at start-up, from the composition root. That root
 * is allowed to know every module; it is the only thing that is.
 */

const listeners = new Map();
const providers = new Map();

/**
 * Listen for an extension point.
 *
 * Returns an unsubscribe, which matters mostly to tests: a suite that registers
 * a listener and leaves it there makes the next suite's results depend on the
 * order the files ran in.
 */
export function on(point, listener) {
  const list = listeners.get(point) || [];
  list.push(listener);
  listeners.set(point, list);
  return () => listeners.set(point, (listeners.get(point) || []).filter((l) => l !== listener));
}

/**
 * Ask everyone listening, and return what they said.
 *
 * One contributor throwing must not take the others down with it. The bell
 * showing five alerts instead of six is a worse day; the bell showing an error
 * page because one query failed is a broken feature. Failures are logged and
 * skipped, which is the same bargain `postIfEnabled` makes in accounting.
 */
export async function emit(point, ...args) {
  const results = await Promise.all((listeners.get(point) || []).map(async (listener) => {
    try {
      return await listener(...args);
    } catch (error) {
      console.warn(`Extension "${point}" failed: ${error.message}`);
      return undefined;
    }
  }));
  return results.filter((value) => value !== undefined);
}

/** Register the one implementation of something. Last registration wins. */
export function provide(point, implementation) {
  providers.set(point, implementation);
}

/** The implementation, or null when the domain that owns it is not loaded. */
export const resolve = (point) => providers.get(point) || null;

/** Every registration, dropped. Tests use this; nothing else should. */
export function reset() {
  listeners.clear();
  providers.clear();
}

/**
 * The points that exist.
 *
 * Named here rather than as loose strings so a typo in a contributor is a
 * missing import instead of a listener that is silently never called — the
 * failure that looks exactly like "the feature does nothing".
 */
export const POINTS = {
  /** Extra columns for the branch list. `(branches) => ({ [branchId]: {...} })` */
  BRANCH_SUMMARY: 'branch.summary',
  /** Alerts for the notification bell. `({ branchId }) => alert[]` */
  ALERTS: 'notifications.alerts',
  /** The business mode changed. `({ mode }) => void` */
  MODE_CHANGED: 'settings.modeChanged',
  /** Renders a document to HTML. `({ kind, record, ... }) => string` */
  DOCUMENT_HTML: 'document.html',
  /** A monitored place left its safe range. `({ reading, exception, violations }) => void` */
  SENSOR_BREACH: 'sensor.breach',
  /**
   * Something happened that the outside world may care about.
   * `({ eventType, payload }) => void`
   *
   * Deliberately generic. Webhooks must not require a new extension point per
   * event, or every domain that wants to publish one ends up editing platform —
   * the exact dependency the extension points exist to prevent.
   */
  DOMAIN_EVENT: 'domain.event',
};
