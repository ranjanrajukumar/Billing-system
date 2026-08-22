import { on, POINTS } from '../platform/extensions.service.js';
import { branchTotals } from './stock.service.js';
import { reconcileStock } from './stockAudit.service.js';

/**
 * What inventory tells the rest of the application about itself.
 *
 * Both of these used to be pulled: the branch screen imported `branchTotals`,
 * and the notification service imported `reconcileStock`. Both are platform
 * code reaching into a domain, and both are now pushed from this side instead.
 *
 * The practical difference shows up when inventory is not loaded — the branch
 * list simply has no stock column and the bell has no drift alert, rather than
 * platform failing to import a module that is not there.
 */

/** Stock held at each location, for the branch list's totals column. */
on(POINTS.BRANCH_SUMMARY, async () => {
  const totals = await branchTotals();
  return Object.fromEntries(totals.map((row) => [
    Number(row.branchId),
    { totalStock: Number(row.totalStock || 0) },
  ]));
});

/**
 * Stock that does not add up.
 *
 * The one alert nobody can raise by hand, because it is the difference between
 * three figures that should agree — the balance, the sum of its movements, and
 * the sum of its lots. Drift is the failure an inventory system cannot recover
 * from, so it is raised at the top severity.
 */
on(POINTS.ALERTS, async ({ branchId }) => {
  const { mismatched, driftValue } = await reconcileStock({ branchId });

  // Returned whatever the count is, including zero. The bell's own `add`
  // drops empty alerts and hides ones whose module is off — that gating is
  // platform's job and stays there, so this contributes the fact and lets the
  // feed decide whether it is worth showing.
  return {
    key: 'stock-drift',
    severity: 'critical',
    category: 'Stock',
    title: 'Stock figures do not match the ledger',
    detail: `${mismatched} balance${mismatched === 1 ? '' : 's'} disagree with the movement history`
      + ` — ₹${Math.round(driftValue).toLocaleString('en-IN')} at cost`,
    count: mismatched,
    link: '/stock-audit',
    module: 'stockAudit',
    menu: 'stockAudit',
  };
});
