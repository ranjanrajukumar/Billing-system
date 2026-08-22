import { QueryTypes } from 'sequelize';
import { randomUUID } from 'crypto';
import { sequelize, DemandForecast } from '../../models/index.js';
import { FORECAST_PERIODS } from '../../models/demandForecast.model.js';

/**
 * Demand forecasting.
 *
 * This is statistical forecasting — Holt-Winters with a damped trend and
 * additive weekly seasonality — not a neural network, and it is described that
 * way on purpose. For SKU-level retail demand, where most lines have a few
 * months of history and many days of zero sales, exponential smoothing is what
 * actually wins: it is fast enough to run across a whole catalogue nightly, it
 * degrades gracefully when a product has six days of history instead of six
 * hundred, and every number it produces can be explained to the buyer who has
 * to act on it. A deep model on fifty observations would mostly be fitting
 * noise and would be far harder to argue with when it is wrong.
 *
 * The seams for a heavier model are deliberate: `buildDailySeries` produces the
 * training data, `forecastSeries` is a pure function from a series to a
 * prediction, and `method` is recorded per row. Pointing that one function at
 * an external service changes the model without touching storage, scoring, the
 * replenishment engine or the UI.
 */

// Weekly seasonality. Retail demand moves on a seven-day cycle far more
// strongly than on any other, because that is how customers' weeks work.
const SEASON_LENGTH = 7;

// Smoothing constants. Chosen for stability rather than for the lowest possible
// in-sample error: a forecast that lurches after one strange day makes buyers
// stop trusting the system, and an over-fitted constant is worse out of sample.
const ALPHA = 0.3;  // level
const BETA = 0.1;   // trend
const GAMMA = 0.2;  // seasonal
const PHI = 0.95;   // trend damping — growth is assumed to flatten, not run away

// z for an 80% two-sided interval. Deliberately not 95%: on noisy SKU demand a
// 95% band is so wide it stops informing the order quantity.
const Z_80 = 1.2816;
const CONFIDENCE_PERCENT = 80;

const toDateKey = (date) => new Date(date).toISOString().slice(0, 10);
const addDays = (date, days) => {
  const next = new Date(date);
  next.setUTCDate(next.getUTCDate() + days);
  return next;
};

/**
 * Sales history as one row per product, location and day.
 *
 * Cancelled and draft invoices are excluded: neither represents demand that was
 * actually met. Returns are not netted off here — a sale that happened and was
 * later returned still tells us the customer wanted it that day, and returns
 * are their own signal handled separately.
 */
async function fetchSalesHistory({ branchId = null, productIds = null, from, to }) {
  const replacements = { from: toDateKey(from), to: toDateKey(to) };

  let filter = '';
  if (branchId) {
    filter += ' AND i.branch_id = :branchId';
    replacements.branchId = branchId;
  }
  if (productIds && productIds.length) {
    filter += ' AND ii.product_id IN (:productIds)';
    replacements.productIds = productIds;
  }

  return sequelize.query(`
    SELECT
      ii.product_id           AS productId,
      i.branch_id             AS branchId,
      i.invoice_date          AS day,
      SUM(ii.quantity)        AS quantity
    FROM invoice_items ii
    JOIN invoices i ON i.id = ii.invoice_id
    WHERE i.detstatus = 0
      AND ii.detstatus = 0
      AND i.status NOT IN ('Cancelled', 'Draft')
      AND i.invoice_date BETWEEN :from AND :to
      ${filter}
    GROUP BY ii.product_id, i.branch_id, i.invoice_date
  `, { replacements, type: QueryTypes.SELECT });
}

/**
 * Turns sparse sales rows into a dense day-by-day series.
 *
 * The gaps matter as much as the sales: a product that sold ten units on
 * Monday and nothing until Friday averages two a day, and a series that only
 * contains the days with sales would say five. Missing days are real zeros, not
 * missing data.
 */
function buildDailySeries(rows, from, to) {
  const byDay = new Map();
  for (const row of rows) {
    byDay.set(toDateKey(row.day), Number(row.quantity) || 0);
  }

  const series = [];
  for (let day = new Date(toDateKey(from)); day <= new Date(toDateKey(to)); day = addDays(day, 1)) {
    series.push({ date: new Date(day), value: byDay.get(toDateKey(day)) || 0 });
  }
  return series;
}

const mean = (values) => (values.length ? values.reduce((a, b) => a + b, 0) / values.length : 0);

/**
 * Fits the model and predicts `horizon` days forward.
 *
 * Pure: a series in, a prediction out. The method actually used steps down as
 * history runs short, because the alternative — fitting seasonality to eleven
 * days of data — produces confident nonsense, and a buyer cannot tell confident
 * nonsense from a good forecast by looking at it.
 */
function forecastSeries(series, horizon = 1) {
  const values = series.map((point) => point.value);
  const n = values.length;

  const flat = (qty, method) => ({
    method,
    daily: new Array(horizon).fill(Math.max(0, qty)),
    sigma: 0,
    level: qty,
    trend: 0,
    seasonal: new Array(SEASON_LENGTH).fill(0),
    historyDays: n,
  });

  if (n === 0) return flat(0, 'None');
  // Nothing has ever sold. That is a real answer, not a missing one.
  if (values.every((value) => value === 0)) return flat(0, 'None');
  if (n < 7) return flat(mean(values), 'Naive');
  if (n < 14) return flat(mean(values.slice(-7)), 'MovingAverage');

  // Seasonality needs at least two complete cycles to be a pattern rather than
  // a coincidence.
  const useSeasonal = n >= SEASON_LENGTH * 2;

  // ---- Initialisation ----
  const firstCycle = values.slice(0, SEASON_LENGTH);
  const secondCycle = values.slice(SEASON_LENGTH, SEASON_LENGTH * 2);
  let level = mean(firstCycle);
  let trend = useSeasonal ? (mean(secondCycle) - mean(firstCycle)) / SEASON_LENGTH : 0;
  const seasonal = new Array(SEASON_LENGTH).fill(0);
  if (useSeasonal) {
    for (let i = 0; i < SEASON_LENGTH; i += 1) seasonal[i] = firstCycle[i] - level;
  }

  // ---- Fit, collecting one-step errors as we go ----
  // The residuals are the honest basis for the confidence interval: they are
  // how wrong this model has been on this product, not a textbook assumption.
  const residuals = [];
  const start = useSeasonal ? SEASON_LENGTH : 1;

  for (let t = start; t < n; t += 1) {
    const seasonIndex = t % SEASON_LENGTH;
    const predicted = level + PHI * trend + (useSeasonal ? seasonal[seasonIndex] : 0);
    residuals.push(values[t] - predicted);

    const previousLevel = level;
    const deseasonalised = values[t] - (useSeasonal ? seasonal[seasonIndex] : 0);

    level = ALPHA * deseasonalised + (1 - ALPHA) * (level + PHI * trend);
    trend = BETA * (level - previousLevel) + (1 - BETA) * PHI * trend;
    if (useSeasonal) {
      seasonal[seasonIndex] = GAMMA * (values[t] - level) + (1 - GAMMA) * seasonal[seasonIndex];
    }
  }

  // Population standard deviation of the residuals; the mean error of an
  // exponential smoother is ~0 by construction, so this is the spread.
  const sigma = residuals.length
    ? Math.sqrt(mean(residuals.map((residual) => residual * residual)))
    : 0;

  // ---- Project forward ----
  // The trend is damped cumulatively, so a rising line flattens out over the
  // horizon instead of growing without limit — the single most common way an
  // automated forecast orders a catastrophic quantity.
  const daily = [];
  let dampedSum = 0;
  for (let h = 1; h <= horizon; h += 1) {
    dampedSum += PHI ** h;
    const seasonIndex = (n + h - 1) % SEASON_LENGTH;
    const point = level + dampedSum * trend + (useSeasonal ? seasonal[seasonIndex] : 0);
    daily.push(Math.max(0, point));
  }

  return {
    method: useSeasonal ? 'TrendSeasonal' : 'MovingAverage',
    daily,
    sigma,
    level,
    trend,
    seasonal,
    historyDays: n,
  };
}

/** Start of the period a day belongs to, so rows land on a stable grain. */
function periodStartFor(date, periodType) {
  const day = new Date(toDateKey(date));
  if (periodType === 'Weekly') {
    // ISO weeks start Monday; getUTCDay() calls Sunday 0.
    const weekday = (day.getUTCDay() + 6) % 7;
    return addDays(day, -weekday);
  }
  if (periodType === 'Monthly') {
    return new Date(Date.UTC(day.getUTCFullYear(), day.getUTCMonth(), 1));
  }
  return day;
}

function periodEndFor(start, periodType) {
  if (periodType === 'Weekly') return addDays(start, 6);
  if (periodType === 'Monthly') {
    return new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + 1, 0));
  }
  return start;
}

/**
 * Generates and stores forecasts for every product that has sold at a location.
 *
 * Products with no sales history at all are skipped rather than forecast at
 * zero: a row saying "we predict nobody will buy this" is indistinguishable
 * from "we have never stocked this", and filling the table with the second kind
 * buries the first.
 */
export async function generateForecasts({
  branchId = null,
  periodType = 'Daily',
  horizonDays = 30,
  historyDays = 180,
  userId = null,
} = {}) {
  if (!FORECAST_PERIODS.includes(periodType)) {
    throw Object.assign(new Error(`Unknown forecast period: ${periodType}`), { status: 400 });
  }

  const runId = randomUUID().slice(0, 32);
  const generatedAt = new Date();
  const today = new Date(toDateKey(new Date()));
  const from = addDays(today, -historyDays);
  const to = addDays(today, -1); // yesterday: today is still accumulating

  const rows = await fetchSalesHistory({ branchId, from, to });
  if (rows.length === 0) {
    return { runId, periodType, written: 0, skipped: 0, message: 'No sales history in the selected window.' };
  }

  // Group into one series per product and location.
  const groups = new Map();
  for (const row of rows) {
    const key = `${row.productId}:${row.branchId}`;
    if (!groups.has(key)) {
      groups.set(key, { productId: Number(row.productId), branchId: Number(row.branchId), rows: [] });
    }
    groups.get(key).rows.push(row);
  }

  const records = [];
  let skipped = 0;

  for (const group of groups.values()) {
    // Start the series at the product's first sale, not at the window edge, or
    // a line launched last week looks like six months of zeroes.
    const firstSale = group.rows
      .map((row) => new Date(toDateKey(row.day)))
      .reduce((earliest, day) => (day < earliest ? day : earliest));

    const series = buildDailySeries(group.rows, firstSale, to);
    const fit = forecastSeries(series, horizonDays);

    if (fit.method === 'None') {
      skipped += 1;
      continue;
    }

    // Daily predictions rolled up onto whichever grain was asked for.
    const buckets = new Map();
    for (let h = 0; h < horizonDays; h += 1) {
      const day = addDays(today, h);
      const start = periodStartFor(day, periodType);
      const key = toDateKey(start);
      if (!buckets.has(key)) {
        buckets.set(key, { start, end: periodEndFor(start, periodType), qty: 0, days: 0 });
      }
      const bucket = buckets.get(key);
      bucket.qty += fit.daily[h];
      bucket.days += 1;
    }

    for (const bucket of buckets.values()) {
      // Errors accumulate as the square root of the number of days, not
      // linearly — a week's forecast is proportionally tighter than a day's.
      const margin = Z_80 * fit.sigma * Math.sqrt(bucket.days);
      const qty = Math.round(bucket.qty * 1000) / 1000;

      records.push({
        productId: group.productId,
        branchId: group.branchId,
        periodType,
        periodStart: toDateKey(bucket.start),
        periodEnd: toDateKey(bucket.end),
        forecastQty: qty,
        confidenceLow: Math.max(0, Math.round((qty - margin) * 1000) / 1000),
        confidenceHigh: Math.round((qty + margin) * 1000) / 1000,
        confidencePercent: CONFIDENCE_PERCENT,
        method: fit.method,
        historyDays: fit.historyDays,
        basis: JSON.stringify({
          level: Math.round(fit.level * 1000) / 1000,
          trend: Math.round(fit.trend * 1000) / 1000,
          sigma: Math.round(fit.sigma * 1000) / 1000,
          seasonal: fit.seasonal.map((value) => Math.round(value * 100) / 100),
          days: bucket.days,
        }),
        runId,
        generatedAt,
        authadd: userId,
      });
    }
  }

  // One upsert per grain: re-running a day replaces its rows rather than
  // doubling them, which is what makes the job safe to trigger by hand.
  let written = 0;
  const CHUNK = 500;
  for (let i = 0; i < records.length; i += CHUNK) {
    const chunk = records.slice(i, i + CHUNK);
    await DemandForecast.bulkCreate(chunk, {
      updateOnDuplicate: [
        'periodEnd', 'forecastQty', 'confidenceLow', 'confidenceHigh', 'confidencePercent',
        'method', 'historyDays', 'basis', 'runId', 'generatedAt', 'editondt',
      ],
    });
    written += chunk.length;
  }

  return { runId, periodType, written, skipped, products: groups.size, generatedAt };
}

/**
 * Fills in what actually happened for periods that have closed.
 *
 * Without this the accuracy figures would be a claim rather than a measurement.
 * Only past periods are scored, and only where a forecast was recorded before
 * the period began.
 */
export async function scoreForecastAccuracy({ branchId = null, periodType = 'Daily', lookbackDays = 60 } = {}) {
  const today = new Date(toDateKey(new Date()));
  const from = addDays(today, -lookbackDays);

  const where = {
    periodType,
    detstatus: false,
  };
  if (branchId) where.branchId = branchId;

  const forecasts = await DemandForecast.findAll({
    where: {
      ...where,
      periodStart: { [sequelize.Sequelize.Op.gte]: toDateKey(from) },
      periodEnd: { [sequelize.Sequelize.Op.lt]: toDateKey(today) },
    },
  });

  if (forecasts.length === 0) return { scored: 0 };

  const actuals = await fetchSalesHistory({ branchId, from, to: addDays(today, -1) });
  const actualByKey = new Map();
  for (const row of actuals) {
    const key = `${row.productId}:${row.branchId}:${toDateKey(row.day)}`;
    actualByKey.set(key, Number(row.quantity) || 0);
  }

  let scored = 0;
  for (const forecast of forecasts) {
    let actual = 0;
    for (
      let day = new Date(forecast.periodStart);
      day <= new Date(forecast.periodEnd);
      day = addDays(day, 1)
    ) {
      actual += actualByKey.get(`${forecast.productId}:${forecast.branchId}:${toDateKey(day)}`) || 0;
    }

    // An override is what the business actually stood behind, so that is what
    // gets judged when one exists.
    const predicted = Number(forecast.overrideQty ?? forecast.forecastQty);
    const variance = actual - predicted;
    // Percentage error is undefined against zero actual demand; those lines are
    // left unscored rather than counted as 100% wrong, which would let a
    // catalogue of dead SKUs dominate the accuracy figure.
    const absPercentError = actual > 0
      ? Math.round((Math.abs(variance) / actual) * 10000) / 100
      : null;

    await forecast.update({
      actualQty: actual,
      variance: Math.round(variance * 1000) / 1000,
      absPercentError,
    });
    scored += 1;
  }

  return { scored };
}

/**
 * Headline accuracy for a location: mean absolute percentage error turned into
 * the "how right have we been" figure the planning screen shows.
 */
export async function forecastAccuracy({ branchId = null, periodType = 'Daily', lookbackDays = 30 } = {}) {
  const today = new Date(toDateKey(new Date()));
  const replacements = { from: toDateKey(addDays(today, -lookbackDays)), to: toDateKey(today), periodType };
  let filter = '';
  if (branchId) {
    filter = ' AND branch_id = :branchId';
    replacements.branchId = branchId;
  }

  const [row] = await sequelize.query(`
    SELECT
      COUNT(*)                    AS scoredLines,
      AVG(abs_percent_error)      AS mape,
      SUM(CASE WHEN variance > 0 THEN 1 ELSE 0 END) AS underForecast,
      SUM(CASE WHEN variance < 0 THEN 1 ELSE 0 END) AS overForecast
    FROM demand_forecasts
    WHERE detstatus = 0
      AND period_type = :periodType
      AND abs_percent_error IS NOT NULL
      AND period_start >= :from
      AND period_end < :to
      ${filter}
  `, { replacements, type: QueryTypes.SELECT });

  const mape = row?.mape === null || row?.mape === undefined ? null : Number(row.mape);

  return {
    scoredLines: Number(row?.scoredLines || 0),
    mape: mape === null ? null : Math.round(mape * 100) / 100,
    // The figure management asks for. Floored at zero: a forecast can be
    // infinitely wrong, but "negative accuracy" means nothing to anybody.
    accuracyPercent: mape === null ? null : Math.max(0, Math.round((100 - mape) * 100) / 100),
    underForecast: Number(row?.underForecast || 0),
    overForecast: Number(row?.overForecast || 0),
  };
}

/** Forecast demand for one line across a window, honouring any override. */
async function demandOverWindow({ productId, branchId, days }) {
  const today = new Date(toDateKey(new Date()));
  const rows = await DemandForecast.findAll({
    where: {
      productId,
      branchId,
      periodType: 'Daily',
      detstatus: false,
      periodStart: {
        [sequelize.Sequelize.Op.gte]: toDateKey(today),
        [sequelize.Sequelize.Op.lt]: toDateKey(addDays(today, days)),
      },
    },
  });

  return rows.reduce((total, row) => total + Number(row.overrideQty ?? row.forecastQty), 0);
}

export const __testing = { forecastSeries, buildDailySeries, periodStartFor, SEASON_LENGTH };
