// Pure calculator state machine, kept out of the component so the arithmetic
// can be tested directly.

const MAX_DIGITS = 14;

export const OPERATORS = {
  '÷': (a, b) => a / b,
  '×': (a, b) => a * b,
  '−': (a, b) => a - b,
  '+': (a, b) => a + b,
};

export const initialState = { display: '0', pending: null, replace: true, history: '' };

/** Formats without pretending to more precision than a double actually has. */
function trim(value) {
  if (!Number.isFinite(value)) return 'Error';
  return String(Number(value.toPrecision(12)));
}

function resolve(pending, next) {
  if (!pending) return next;
  return OPERATORS[pending.operator](pending.value, next);
}

/**
 * Applies one key press and returns the next state.
 * Keys: 0-9 . C ⌫ ± % ÷ × − + =
 */
export function applyKey(state, key) {
  const { display, pending, replace } = state;
  const value = Number(display);

  if (key === 'C') return { ...initialState };

  if (key === '⌫') {
    if (replace) return state;
    const next = display.length > 1 ? display.slice(0, -1) : '0';
    return { ...state, display: next === '-' ? '0' : next };
  }

  if (key === '±') {
    if (display === '0') return state;
    return { ...state, display: display.startsWith('-') ? display.slice(1) : `-${display}` };
  }

  if (key === '%') return { ...state, display: trim(value / 100), replace: true };

  if (key === '.') {
    if (replace) return { ...state, display: '0.', replace: false };
    return display.includes('.') ? state : { ...state, display: `${display}.` };
  }

  if (/^[0-9]$/.test(key)) {
    if (replace) return { ...state, display: key, replace: false };
    if (display.replace(/[-.]/g, '').length >= MAX_DIGITS) return state;
    return { ...state, display: display === '0' ? key : display + key };
  }

  if (OPERATORS[key]) {
    // Chained operators fold the previous result before starting the next one.
    const carried = pending && !replace ? resolve(pending, value) : value;
    return {
      display: trim(carried),
      pending: { value: carried, operator: key },
      replace: true,
      history: `${trim(carried)} ${key}`,
    };
  }

  if (key === '=') {
    if (!pending) return state;
    const result = resolve(pending, value);
    return {
      display: trim(result),
      pending: null,
      replace: true,
      history: `${trim(pending.value)} ${pending.operator} ${trim(value)} =`,
    };
  }

  return state;
}

/**
 * Splits an amount into taxable value and GST.
 * `mode` is 'exclusive' (amount is before tax) or 'inclusive' (tax is inside it).
 */
export function gstBreakdown(amount, rate, mode) {
  const value = Number(amount || 0);
  const percent = Number(rate || 0);
  if (!value) return { base: 0, gst: 0, total: 0 };

  if (mode === 'inclusive') {
    const base = value / (1 + percent / 100);
    return { base, gst: value - base, total: value };
  }
  const gst = value * (percent / 100);
  return { base: value, gst, total: value + gst };
}
