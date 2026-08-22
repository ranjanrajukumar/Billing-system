import { Op } from 'sequelize';
import { Branch, DemandForecast, Product } from '../../models/index.js';
import { asyncHandler } from '../../utils/asyncHandler.js';
import { scopedWhere } from '../../middleware/branchContext.js';
import { getPagination, paged } from '../../utils/pagination.js';
import {
  forecastAccuracy, generateForecasts, scoreForecastAccuracy,
} from './forecast.service.js';

const included = [
  { model: Product, attributes: ['id', 'productName', 'sku', 'primaryUnit', 'purchasePrice', 'sellingPrice'] },
  { model: Branch, attributes: ['id', 'branchName', 'locationType'] },
];

/**
 * The planning grid: what we expect to sell, against what is actually there.
 *
 * Stock is joined on rather than stored on the forecast, because the forecast
 * is a statement about demand and stock changes every time somebody buys
 * something. A planner looking at this screen needs today's position, not the
 * position when the forecast ran.
 */
export const listForecasts = asyncHandler(async (req, res) => {
  const { page, limit, offset } = getPagination(req.query);
  const {
    periodType = 'Daily', from, to, productId, search, method, onlyOverrides,
  } = req.query;

  const where = scopedWhere(req, { detstatus: false, periodType });

  if (from || to) {
    where.periodStart = {};
    if (from) where.periodStart[Op.gte] = from;
    if (to) where.periodStart[Op.lte] = to;
  } else {
    // Default to what is still ahead: a planner acts on the future.
    where.periodEnd = { [Op.gte]: new Date().toISOString().slice(0, 10) };
  }

  if (productId) where.productId = productId;
  if (method) where.method = method;
  if (onlyOverrides === 'true') where.overrideQty = { [Op.ne]: null };

  const include = [...included];
  if (search) {
    include[0] = {
      ...included[0],
      where: {
        [Op.or]: [
          { productName: { [Op.like]: `%${search}%` } },
          { sku: { [Op.like]: `%${search}%` } },
        ],
      },
    };
  }

  const { rows, count } = await DemandForecast.findAndCountAll({
    where,
    include,
    order: [['periodStart', 'ASC'], ['forecastQty', 'DESC']],
    limit,
    offset,
    distinct: true,
  });

  res.json(paged(rows, count, page, limit));
});

/**
 * Runs the forecaster.
 *
 * Synchronous on purpose at this scale: a few thousand lines finish inside a
 * request, and a planner who presses "Regenerate" wants to see the result, not
 * a job id. This is the first thing to move to the scheduler when the catalogue
 * grows past what a request can comfortably hold.
 */
export const runForecast = asyncHandler(async (req, res) => {
  const { periodType = 'Daily', horizonDays = 30, historyDays = 180 } = req.body || {};

  const result = await generateForecasts({
    branchId: req.branchScope || null,
    periodType,
    horizonDays: Math.min(Math.max(Number(horizonDays) || 30, 1), 180),
    historyDays: Math.min(Math.max(Number(historyDays) || 180, 14), 730),
    userId: req.user?.id ?? null,
  });

  // Scoring the periods that have closed keeps the accuracy figure current
  // without a separate button nobody would press.
  const scored = await scoreForecastAccuracy({
    branchId: req.branchScope || null,
    periodType,
  });

  res.status(201).json({ ...result, ...scored });
});

/**
 * A planner overriding the model.
 *
 * The model's number is never overwritten. Keeping both is what allows the
 * question "are our overrides making things better or worse?" to be answered
 * later — and on most planning teams the honest answer is genuinely mixed.
 */
export const overrideForecast = asyncHandler(async (req, res) => {
  const forecast = await DemandForecast.findOne({
    where: scopedWhere(req, { id: req.params.id, detstatus: false }),
  });
  if (!forecast) return res.status(404).json({ message: 'Forecast not found' });

  const { overrideQty, overrideReason } = req.body || {};

  if (overrideQty === null || overrideQty === '') {
    await forecast.update({
      overrideQty: null, overrideReason: null, overrideBy: null, overrideAt: null,
    });
    return res.json(forecast);
  }

  const quantity = Number(overrideQty);
  if (!Number.isFinite(quantity) || quantity < 0) {
    return res.status(400).json({ message: 'Override quantity must be zero or more' });
  }

  await forecast.update({
    overrideQty: quantity,
    overrideReason: overrideReason || null,
    overrideBy: req.user?.id ?? null,
    overrideAt: new Date(),
    method: 'Manual',
  });

  res.json(forecast);
});

/** Headline numbers for the planning dashboard. */
export const forecastSummary = asyncHandler(async (req, res) => {
  const { periodType = 'Daily', lookbackDays = 30 } = req.query;
  const branchId = req.branchScope || null;

  const accuracy = await forecastAccuracy({
    branchId,
    periodType,
    lookbackDays: Number(lookbackDays) || 30,
  });

  const today = new Date().toISOString().slice(0, 10);
  const horizon = new Date();
  horizon.setDate(horizon.getDate() + 30);

  const upcoming = await DemandForecast.findAll({
    where: scopedWhere(req, {
      detstatus: false,
      periodType,
      periodStart: { [Op.gte]: today, [Op.lt]: horizon.toISOString().slice(0, 10) },
    }),
    attributes: ['forecastQty', 'overrideQty'],
  });

  const forecastUnits = upcoming.reduce(
    (total, row) => total + Number(row.overrideQty ?? row.forecastQty), 0,
  );

  res.json({
    ...accuracy,
    linesForecast: upcoming.length,
    forecastUnitsNext30Days: Math.round(forecastUnits * 100) / 100,
    overridesActive: upcoming.filter((row) => row.overrideQty !== null).length,
  });
});

/** One line's forecast history, for the drill-down chart. */
export const forecastTrend = asyncHandler(async (req, res) => {
  const { productId } = req.params;
  const { periodType = 'Daily', days = 60 } = req.query;

  const from = new Date();
  from.setDate(from.getDate() - Number(days || 60));
  const to = new Date();
  to.setDate(to.getDate() + Number(days || 60));

  const rows = await DemandForecast.findAll({
    where: scopedWhere(req, {
      productId,
      periodType,
      detstatus: false,
      periodStart: { [Op.between]: [from.toISOString().slice(0, 10), to.toISOString().slice(0, 10)] },
    }),
    order: [['periodStart', 'ASC']],
    attributes: [
      'periodStart', 'periodEnd', 'forecastQty', 'overrideQty', 'actualQty',
      'confidenceLow', 'confidenceHigh', 'variance', 'absPercentError', 'method',
    ],
  });

  res.json(rows);
});
