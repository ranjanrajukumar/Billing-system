const SERVER_ORIGIN = (import.meta.env.VITE_API_URL || 'http://localhost:5000/api').replace(/\/api\/?$/, '');

// The API returns image locations as server-relative paths (/media/... for
// database-backed images).
export const mediaUrl = (relativePath) => (relativePath ? SERVER_ORIGIN + relativePath : '');

// Intl wants a well-formed three-letter code and throws a RangeError on
// anything else. This runs on nearly every screen that shows money, so a
// stray "Rs" saved in settings used to take the whole app down with it.
const WELL_FORMED = /^[A-Za-z]{3}$/;

export const currency = (value) => {
  const saved = localStorage.getItem('currency') || '';
  const code = WELL_FORMED.test(saved) ? saved.toUpperCase() : 'INR';
  // Rupees group in lakhs and crores; everything else groups in thousands, so
  // the locale has to follow the currency rather than the user's region —
  // otherwise dollars print as $12,34,567.50.
  const locale = code === 'INR' ? 'en-IN' : 'en-US';
  try {
    return new Intl.NumberFormat(locale, { style: 'currency', currency: code }).format(Number(value || 0));
  } catch {
    // A well-formed code Intl still refuses: fall back rather than blank the page.
    return new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR' }).format(Number(value || 0));
  }
};
/**
 * A money figure short enough for an axis tick.
 *
 * Axis labels are read in a glance and stacked vertically, so the full figure
 * is both too long and unnecessary — the tooltip carries the exact number.
 * Rupees group in lakhs and crores, which is what an Indian reader expects to
 * see on a sales axis; everything else uses K/M.
 */
export const compactCurrency = (value) => {
  const saved = localStorage.getItem('currency') || '';
  const code = WELL_FORMED.test(saved) ? saved.toUpperCase() : 'INR';
  const n = Number(value || 0);
  const abs = Math.abs(n);
  const sign = n < 0 ? '-' : '';
  const trim = (x) => String(Number(x.toFixed(1)));

  if (code === 'INR') {
    if (abs >= 1e7) return `${sign}${trim(abs / 1e7)}Cr`;
    if (abs >= 1e5) return `${sign}${trim(abs / 1e5)}L`;
    if (abs >= 1e3) return `${sign}${trim(abs / 1e3)}K`;
  } else {
    if (abs >= 1e9) return `${sign}${trim(abs / 1e9)}B`;
    if (abs >= 1e6) return `${sign}${trim(abs / 1e6)}M`;
    if (abs >= 1e3) return `${sign}${trim(abs / 1e3)}K`;
  }
  return `${sign}${trim(abs)}`;
};

export const date = (value) => value ? new Intl.DateTimeFormat('en-IN').format(new Date(value)) : '-';
