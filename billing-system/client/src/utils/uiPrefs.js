/**
 * The company's saved appearance, as the shell reads it.
 *
 * Kept in localStorage rather than fetched, because the sidebar, the theme and
 * the page frame all need it on the very first render. Waiting for a request
 * would paint the default layout and then jump to the real one — the flash
 * being worst on exactly the wide-screen setups the layout options exist for.
 * It is written by AuthContext from the sign-in payload, the same way the
 * currency is.
 *
 * Never throws. A half-written value here would take the whole application
 * down before it rendered, and no layout preference is worth a white screen.
 */
const DEFAULTS = {
  accent: 'indigo',
  radius: 'rounded',
  density: 'comfortable',
  theme: 'light',
  layout: 'full',
  sidebar: 'standard',
  cards: 'outlined',
  font: 'inter',
};

/**
 * The company's name and mark as the last signed-in session saw them.
 *
 * The sign-in screens render before any request has been authorised, so the
 * name cannot be fetched — but a returning browser already has it from the
 * previous session, which covers every machine after its first use. A first
 * visit falls back to a plain descriptor rather than a product name.
 */
export function readBranding() {
  try {
    const user = JSON.parse(localStorage.getItem('user') || '{}') || {};
    return { name: user.companyName || 'Billing System', logoUrl: user.companyLogoUrl || null };
  } catch {
    return { name: 'Billing System', logoUrl: null };
  }
}

export function readUiPrefs() {
  try {
    const saved = JSON.parse(localStorage.getItem('ui') || '{}');
    return { ...DEFAULTS, ...(saved && typeof saved === 'object' ? saved : {}) };
  } catch {
    return { ...DEFAULTS };
  }
}

/**
 * Whole looks, rather than seven knobs.
 *
 * The individual settings each move one thing a little; nobody sets out to
 * choose a border radius. A preset is the unit people actually think in — "make
 * it look like an ERP", "make it look modern" — and applying one changes every
 * setting at once so the change is visible immediately rather than cumulative.
 * Each stays fully editable afterwards: a preset is a starting point, not a lock.
 */
export const DESIGN_PRESETS = {
  pos: {
    label: 'POS',
    hint: 'White and deep navy, rounded cards, soft shadows',
    values: { uiAccent: 'navy', uiRadius: 'rounded', uiDensity: 'comfortable',
      uiLayout: 'full', uiSidebar: 'standard', uiCards: 'elevated', uiFont: 'inter',
      uiTheme: 'light' },
  },
  modern: {
    label: 'Modern',
    hint: 'Indigo, rounded, roomy — the current look',
    values: { uiAccent: 'indigo', uiRadius: 'rounded', uiDensity: 'comfortable',
      uiLayout: 'full', uiSidebar: 'standard', uiCards: 'outlined', uiFont: 'inter',
      uiTheme: 'light' },
  },
  erp: {
    label: 'Classic ERP',
    hint: 'Square, dense, every row on screen',
    values: { uiAccent: 'slate', uiRadius: 'square', uiDensity: 'compact',
      uiLayout: 'full', uiSidebar: 'compact', uiCards: 'outlined', uiFont: 'system',
      uiTheme: 'light' },
  },
  minimal: {
    label: 'Minimal',
    hint: 'No borders, centred, quiet',
    values: { uiAccent: 'slate', uiRadius: 'soft', uiDensity: 'comfortable',
      uiLayout: 'centered', uiSidebar: 'compact', uiCards: 'flat', uiFont: 'system',
      uiTheme: 'light' },
  },
  retail: {
    label: 'Retail',
    hint: 'Warm, raised panels, easy to read across a counter',
    values: { uiAccent: 'teal', uiRadius: 'rounded', uiDensity: 'comfortable',
      uiLayout: 'centered', uiSidebar: 'standard', uiCards: 'elevated', uiFont: 'inter',
      uiTheme: 'light' },
  },
  print: {
    label: 'Document',
    hint: 'Serif and flat, like the paperwork it produces',
    values: { uiAccent: 'amber', uiRadius: 'square', uiDensity: 'comfortable',
      uiLayout: 'centered', uiSidebar: 'standard', uiCards: 'flat', uiFont: 'serif',
      uiTheme: 'light' },
  },
  midnight: {
    label: 'Midnight',
    hint: 'Dark throughout, for a screen that is on all night',
    values: { uiAccent: 'blue', uiRadius: 'soft', uiDensity: 'comfortable',
      uiLayout: 'full', uiSidebar: 'standard', uiCards: 'elevated', uiFont: 'inter',
      uiTheme: 'dark' },
  },
  contrast: {
    label: 'High contrast',
    hint: 'Hard edges and clear borders, for poor light',
    values: { uiAccent: 'slate', uiRadius: 'square', uiDensity: 'comfortable',
      uiLayout: 'full', uiSidebar: 'standard', uiCards: 'outlined', uiFont: 'system',
      uiTheme: 'light' },
  },
  floor: {
    label: 'Warehouse floor',
    hint: 'Roomy rows and big targets, for a shared terminal',
    values: { uiAccent: 'amber', uiRadius: 'rounded', uiDensity: 'comfortable',
      uiLayout: 'full', uiSidebar: 'standard', uiCards: 'elevated', uiFont: 'system',
      uiTheme: 'light' },
  },
};

/** How wide the page content is allowed to get. */
export const CONTENT_WIDTHS = {
  full: { label: 'Full width', max: '100%' },
  // A line of text or a row of figures stops being scannable somewhere around
  // here; past it the eye has to travel back across empty desk to find the
  // next row. Wide monitors are the reason this option exists.
  centered: { label: 'Centered', max: '1600px' },
};

/** How much room the navigation takes from the page. */
export const SIDEBAR_WIDTHS = {
  standard: { label: 'Standard', px: 256 },
  compact: { label: 'Compact', px: 208 },
};

/** How cards and panels are separated from the page behind them. */
export const CARD_STYLES = {
  outlined: 'Outlined',
  elevated: 'Elevated',
  flat: 'Flat',
};
