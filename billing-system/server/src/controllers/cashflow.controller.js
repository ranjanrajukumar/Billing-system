import { asyncHandler } from '../utils/asyncHandler.js';
import { cashFlowSummary, cashPosition, dailyCashMovement } from '../services/cashflow.service.js';

/**
 * Cash flow. Deliberately built from documents rather than the journal, so a
 * shop running in Basic mode — with no double-entry bookkeeping at all — still
 * gets a straight answer to "did more come in than went out this month".
 */

const scopeOf = (req) => req.query.branchId || req.branchScope || null;

export const summary = asyncHandler(async (req, res) => {
  res.json(await cashFlowSummary({
    from: req.query.from,
    to: req.query.to,
    branchId: scopeOf(req),
  }));
});

export const position = asyncHandler(async (req, res) => {
  res.json(await cashPosition({ branchId: scopeOf(req) }));
});

export const daily = asyncHandler(async (req, res) => {
  res.json(await dailyCashMovement({
    from: req.query.from,
    to: req.query.to,
    branchId: scopeOf(req),
  }));
});

/** Everything the cash flow screen needs, in one round trip. */
export const overview = asyncHandler(async (req, res) => {
  const branchId = scopeOf(req);
  const { from, to } = req.query;

  const [flow, held, byDay] = await Promise.all([
    cashFlowSummary({ from, to, branchId }),
    cashPosition({ branchId }),
    dailyCashMovement({ from, to, branchId }),
  ]);

  res.json({ ...flow, position: held, daily: byDay });
});
