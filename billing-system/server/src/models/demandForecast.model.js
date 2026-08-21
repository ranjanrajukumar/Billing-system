import { DataTypes } from 'sequelize';
import { enumType, unsignedInteger } from './types.js';

export const FORECAST_PERIODS = ['Daily', 'Weekly', 'Monthly'];

/**
 * Methods the forecaster can pick, worst to best. Recorded per row because
 * "why is this number 40?" is asked about individual lines, not about the run,
 * and the answer is usually "because this product has six days of history".
 */
export const FORECAST_METHODS = [
  'None',            // no usable history at all
  'Naive',           // last period repeated
  'MovingAverage',   // flat average of the recent window
  'SeasonalNaive',   // same weekday/month last cycle
  'TrendSeasonal',   // level + damped trend + seasonal index
  'Manual',          // a person overrode it
];

/**
 * One forecast for one product, at one location, for one period.
 *
 * Written rather than computed on demand, for two reasons. Forecast accuracy
 * can only be measured if what was predicted survives to be compared with what
 * happened — a forecast recomputed today with today's data always looks right.
 * And a replenishment order raised last Tuesday has to be explainable in terms
 * of what was known last Tuesday, not what is known now.
 *
 * `actualQty` and `variance` are backfilled once the period has closed, which
 * is what makes the accuracy figures on the planning screen real measurements
 * rather than a self-assessment.
 */
export default (sequelize) => sequelize.define('DemandForecast', {
  id: { type: unsignedInteger(sequelize), autoIncrement: true, primaryKey: true },

  productId: { type: unsignedInteger(sequelize), allowNull: false },
  branchId: { type: unsignedInteger(sequelize), allowNull: false },

  periodType: { ...enumType(sequelize, FORECAST_PERIODS), allowNull: false, defaultValue: 'Daily' },
  // The first day of the period being described. Daily periods are that day;
  // weekly periods start on Monday; monthly on the first.
  periodStart: { type: DataTypes.DATEONLY, allowNull: false },
  periodEnd: { type: DataTypes.DATEONLY, allowNull: false },

  // ---- What was predicted ----
  forecastQty: { type: DataTypes.DECIMAL(14, 3), allowNull: false, defaultValue: 0 },
  // The interval the method thinks the outcome lands in. A wide band on a
  // volatile line is information, not a defect: it tells a buyer to hold more
  // cover, and it is the honest output of a small sample.
  confidenceLow: { type: DataTypes.DECIMAL(14, 3), allowNull: true },
  confidenceHigh: { type: DataTypes.DECIMAL(14, 3), allowNull: true },
  confidencePercent: { type: DataTypes.DECIMAL(5, 2), allowNull: true },

  method: { ...enumType(sequelize, FORECAST_METHODS), allowNull: false, defaultValue: 'None' },
  // Days of history the method had to work with. The first thing to look at
  // when a forecast is disputed.
  historyDays: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
  // Level, trend and seasonal index that produced the number, kept so a line
  // can be explained without re-running anything.
  basis: { type: DataTypes.TEXT, allowNull: true },

  // ---- What actually happened ----
  actualQty: { type: DataTypes.DECIMAL(14, 3), allowNull: true },
  // actual − forecast. Positive means demand beat the forecast.
  variance: { type: DataTypes.DECIMAL(14, 3), allowNull: true },
  // Absolute percentage error for this line, the input to the accuracy figures.
  absPercentError: { type: DataTypes.DECIMAL(9, 2), allowNull: true },

  // ---- Human override ----
  // A planner who knows about the wedding season or the road closure outranks
  // the model. The original stays in forecastQty so the override can be judged
  // later on its own record.
  overrideQty: { type: DataTypes.DECIMAL(14, 3), allowNull: true },
  overrideReason: { type: DataTypes.STRING(255), allowNull: true },
  overrideBy: { type: DataTypes.INTEGER, allowNull: true },
  overrideAt: { type: DataTypes.DATE, allowNull: true },

  // Which run produced this row, so a whole generation can be traced or undone.
  runId: { type: DataTypes.STRING(40), allowNull: true },
  generatedAt: { type: DataTypes.DATE, allowNull: true },

  authadd: { type: DataTypes.INTEGER, allowNull: true },
  authlstedit: { type: DataTypes.INTEGER, allowNull: true },
  authdel: { type: DataTypes.INTEGER, allowNull: true },
  detstatus: { type: DataTypes.BOOLEAN, defaultValue: false },
  delondt: { type: DataTypes.DATE, allowNull: true },
}, {
  timestamps: true,
  createdAt: 'addondt',
  updatedAt: 'editondt',
  tableName: 'demand_forecasts',
  indexes: [
    // The grain. Re-running a day replaces its rows rather than doubling them.
    {
      unique: true,
      name: 'demand_forecast_grain',
      fields: ['product_id', 'branch_id', 'period_type', 'period_start'],
    },
    { fields: ['branch_id', 'period_start'] },
    { fields: ['period_type', 'period_start'] },
    { fields: ['run_id'] },
  ],
});
