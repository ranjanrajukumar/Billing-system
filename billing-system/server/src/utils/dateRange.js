import { Op } from 'sequelize';

/**
 * Period filtering shared by every list and report.
 *
 * The client sends either an explicit `from`/`to` pair or a named `period`.
 * Naming the period on the server as well means "last 3 months" means the same
 * thing everywhere, instead of each screen working out its own dates.
 */

const pad2 = (n) => String(n).padStart(2, '0');
const iso = (d) => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;

const startOfMonth = (d) => new Date(d.getFullYear(), d.getMonth(), 1);
const endOfMonth = (d) => new Date(d.getFullYear(), d.getMonth() + 1, 0);
const monthsBack = (n) => {
  const d = new Date();
  d.setMonth(d.getMonth() - n);
  return d;
};

/**
 * Indian financial years run April to March, so "this year" for a business is
 * not the calendar year. Both are offered; the caller picks.
 */
function financialYear(offset = 0) {
  const now = new Date();
  // Before April we are still in the financial year that began last April.
  const startYear = (now.getMonth() < 3 ? now.getFullYear() - 1 : now.getFullYear()) + offset;
  return {
    from: `${startYear}-04-01`,
    to: `${startYear + 1}-03-31`,
    label: `FY ${startYear}-${String(startYear + 1).slice(2)}`,
  };
}

const PERIODS = {
  today: () => ({ from: iso(new Date()), to: iso(new Date()), label: 'Today' }),
  thisMonth: () => ({ from: iso(startOfMonth(new Date())), to: iso(endOfMonth(new Date())), label: 'This month' }),
  lastMonth: () => {
    const d = monthsBack(1);
    return { from: iso(startOfMonth(d)), to: iso(endOfMonth(d)), label: 'Last month' };
  },
  last3Months: () => ({ from: iso(startOfMonth(monthsBack(2))), to: iso(new Date()), label: 'Last 3 months' }),
  last6Months: () => ({ from: iso(startOfMonth(monthsBack(5))), to: iso(new Date()), label: 'Last 6 months' }),
  last12Months: () => ({ from: iso(startOfMonth(monthsBack(11))), to: iso(new Date()), label: 'Last 12 months' }),
  thisYear: () => ({ from: `${new Date().getFullYear()}-01-01`, to: `${new Date().getFullYear()}-12-31`, label: 'This year' }),
  lastYear: () => {
    const y = new Date().getFullYear() - 1;
    return { from: `${y}-01-01`, to: `${y}-12-31`, label: String(y) };
  },
  thisFinancialYear: () => financialYear(0),
  lastFinancialYear: () => financialYear(-1),
  all: () => ({ from: '', to: '', label: 'All time' }),
};

const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'];

/**
 * A named month or year, e.g. ?period=month&month=2026-06 or ?period=year&year=2025.
 * Returns null when the value is missing or malformed, so the caller can fall
 * back rather than quietly reporting on the wrong window.
 */
function namedMonthOrYear(query) {
  if (query.period === 'month') {
    const match = /^(\d{4})-(\d{2})$/.exec(String(query.month || ''));
    if (!match) return null;
    const year = Number(match[1]);
    const month = Number(match[2]);
    if (month < 1 || month > 12) return null;
    const lastDay = new Date(year, month, 0).getDate();
    return {
      from: `${match[1]}-${match[2]}-01`,
      to: `${match[1]}-${match[2]}-${pad2(lastDay)}`,
      period: 'month',
      label: `${MONTH_NAMES[month - 1]} ${year}`,
    };
  }
  if (query.period === 'year') {
    const match = /^(\d{4})$/.exec(String(query.year || ''));
    if (!match) return null;
    return { from: `${match[1]}-01-01`, to: `${match[1]}-12-31`, period: 'year', label: match[1] };
  }
  return null;
}

/** Resolves whatever the client sent into a concrete { from, to }. */
export function resolvePeriod(query = {}) {
  // An explicit range always wins, so a custom date pair is never overridden.
  if (query.from || query.to) {
    return { from: query.from || '', to: query.to || '', period: 'custom', label: 'Custom range' };
  }
  const named = namedMonthOrYear(query);
  if (named) return named;

  const key = query.period;
  if (key && PERIODS[key]) {
    const { from, to, label } = PERIODS[key]();
    return { from, to, period: key, label };
  }
  return { from: '', to: '', period: 'all', label: 'All time' };
}

/**
 * Adds the range to a Sequelize `where` on the given column.
 * Returns `where` untouched when no period was asked for, so a list that has
 * never been filtered keeps behaving exactly as it did.
 */
export function withDateRange(where, query, column) {
  const { from, to } = resolvePeriod(query);
  if (!from && !to) return where;

  const range = {};
  if (from) range[Op.gte] = from;
  if (to) range[Op.lte] = to;
  return { ...where, [column]: range };
}

/** Same thing for DATETIME columns, where the day has to be spanned. */
export function withDateTimeRange(where, query, column) {
  const { from, to } = resolvePeriod(query);
  if (!from && !to) return where;

  const range = {};
  if (from) range[Op.gte] = new Date(`${from}T00:00:00`);
  if (to) range[Op.lte] = new Date(`${to}T23:59:59.999`);
  return { ...where, [column]: range };
}
