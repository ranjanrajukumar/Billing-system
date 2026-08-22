/**
 * Loads every domain's contributions.
 *
 * Importing a hooks file *is* the registration — each one calls `on` or
 * `provide` at module scope. Nothing exports anything, so this is imported for
 * its side effects, which is the one place in this codebase where that is the
 * intended design rather than an accident.
 *
 * This file and `routes/index.js` are the composition root: the only two places
 * allowed to know that all eight modules exist. Everything else either belongs
 * to a domain or is beneath them all in `platform`.
 *
 * Loaded once, from `app.js`, before the first request is served. A hook that
 * registers late is a feature that works on the second request and not the
 * first, which is the sort of bug that only reproduces on a cold start.
 */
import './inventory/inventory.hooks.js';
import './sales/sales.hooks.js';
import './accounting/accounting.hooks.js';
