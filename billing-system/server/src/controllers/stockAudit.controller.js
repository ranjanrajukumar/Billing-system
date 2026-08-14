import { asyncHandler } from '../utils/asyncHandler.js';
import { auditExceptions, locationAudit, reconcileStock } from '../services/stockAudit.service.js';

/**
 * Stock audit. Read-only by design: it reports drift, it never quietly
 * corrects it — a self-repairing reconciliation destroys the evidence of
 * whatever caused the problem in the first place.
 */

const scopeOf = (req) => req.query.branchId || req.branchScope || null;

/** Does the held figure agree with the ledger and the lots? */
export const reconciliation = asyncHandler(async (req, res) => {
  res.json(await reconcileStock({
    branchId: scopeOf(req),
    includeMatched: req.query.includeMatched === 'true',
  }));
});

/** What moved at one location over a period, and who moved it. */
export const location = asyncHandler(async (req, res) => {
  res.json(await locationAudit({
    branchId: req.params.branchId || scopeOf(req),
    from: req.query.from,
    to: req.query.to,
  }));
});

/** Movements worth a second look. */
export const exceptions = asyncHandler(async (req, res) => {
  res.json(await auditExceptions({
    branchId: scopeOf(req),
    from: req.query.from,
    to: req.query.to,
    threshold: req.query.threshold,
  }));
});

/** The audit landing page: health check plus anything unusual. */
export const overview = asyncHandler(async (req, res) => {
  const branchId = scopeOf(req);
  const { from, to } = req.query;

  const [reconciled, unusual] = await Promise.all([
    reconcileStock({ branchId }),
    auditExceptions({ branchId, from, to, threshold: req.query.threshold }),
  ]);

  res.json({ reconciliation: reconciled, exceptions: unusual });
});
