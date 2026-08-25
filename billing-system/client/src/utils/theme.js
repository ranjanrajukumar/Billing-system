import { createTheme, alpha } from '@mui/material/styles';

/**
 * The accents a company may pick from, rather than a free colour picker.
 *
 * A palette has to work as a gradient, as a tint behind text, and as a shadow,
 * in both light and dark. An arbitrary hex passes none of those tests reliably
 * — the first thing anyone chooses is a colour that leaves white button text
 * unreadable. These are checked; `rgb` is the same colour for the shadow
 * stack, which is tinted with the accent rather than plain black.
 */
export const UI_ACCENTS = {
  indigo: { label: 'Indigo',  main: '#4f46e5', light: '#7c74f0', dark: '#3730a3', rgb: '79,70,229' },
  blue:   { label: 'Blue',    main: '#2563eb', light: '#60a5fa', dark: '#1d4ed8', rgb: '37,99,235' },
  teal:   { label: 'Teal',    main: '#0d9488', light: '#2dd4bf', dark: '#0f766e', rgb: '13,148,136' },
  green:  { label: 'Green',   main: '#16a34a', light: '#4ade80', dark: '#15803d', rgb: '22,163,74' },
  amber:  { label: 'Amber',   main: '#b45309', light: '#f59e0b', dark: '#92400e', rgb: '180,83,9' },
  rose:   { label: 'Rose',    main: '#e11d48', light: '#fb7185', dark: '#be123c', rgb: '225,29,72' },
  slate:  { label: 'Slate',   main: '#475569', light: '#94a3b8', dark: '#334155', rgb: '71,85,105' },
  // Deep navy-purple on white: dark enough to carry white button text at any
  // size, and cool enough that the money figures beside it stay the loudest
  // thing on a billing screen.
  navy:   { label: 'Navy',    main: '#312e81', light: '#4f46e5', dark: '#1e1b4b', rgb: '49,46,129' },
  violet: { label: 'Violet',  main: '#6d28d9', light: '#8b5cf6', dark: '#4c1d95', rgb: '109,40,217' },
};

/**
 * Typefaces, as stacks that are already on the machine.
 *
 * Nothing is fetched. A warehouse terminal on a bad connection would otherwise
 * render the whole application in a fallback face for the first second of every
 * page, and a webfont that fails to load entirely is a design that silently
 * never arrives. The change between these is large enough to read as a
 * different application, which is the point.
 */
export const UI_FONTS = {
  inter:  { label: 'Inter',    stack: ['Inter', 'Roboto', 'Arial', 'sans-serif'] },
  system: { label: 'System',   stack: ['-apple-system', 'Segoe UI', 'Roboto', 'Helvetica Neue', 'Arial', 'sans-serif'] },
  serif:  { label: 'Serif',    stack: ['Georgia', 'Cambria', 'Times New Roman', 'serif'] },
  mono:   { label: 'Monospace', stack: ['ui-monospace', 'Consolas', 'Menlo', 'monospace'] },
};

/** How square the corners are. The base radius; components scale off it. */
export const UI_RADIUS = { rounded: 14, soft: 8, square: 4 };

/**
 * How much room a row gets. Compact is not merely smaller text — it is fewer
 * pixels of padding per row, which is what decides how many lines of a stock
 * list fit on screen at once. That is the only reason anyone asks for it.
 */
export const UI_DENSITY = {
  comfortable: { label: 'Comfortable', cell: '12px 16px', spacing: 8, body: '0.9375rem' },
  compact:     { label: 'Compact',     cell: '6px 12px',  spacing: 6, body: '0.875rem' },
};

export function buildTheme(mode, options = {}) {
  const isDark = mode === 'dark';

  const accent = UI_ACCENTS[options.accent] || UI_ACCENTS.indigo;
  const radius = UI_RADIUS[options.radius] ?? UI_RADIUS.rounded;
  const density = UI_DENSITY[options.density] || UI_DENSITY.comfortable;
  // How a panel separates itself from the page: a hairline, a shadow, or
  // nothing but its own background. Flat suits a dense screen where a dozen
  // outlined cards turn into a grid of boxes and stop grouping anything.
  const cards = ['outlined', 'elevated', 'flat'].includes(options.cards) ? options.cards : 'outlined';
  const font = UI_FONTS[options.font] || UI_FONTS.inter;
  const cardBorder = cards === 'outlined'
    ? `1px solid ${isDark ? alpha('#ffffff', 0.08) : alpha('#000000', 0.06)}`
    : 'none';

  const primary = {
    main: accent.main,
    light: accent.light,
    dark: accent.dark,
    contrastText: '#ffffff',
  };

  const secondary = {
    main: '#f59e0b',
    light: '#fbbf24',
    dark: '#d97706',
    contrastText: '#000000',
  };

  const success = { main: '#10b981', light: '#34d399', dark: '#059669' };
  const warning = { main: '#f59e0b', light: '#fbbf24', dark: '#d97706' };
  const error = { main: '#ef4444', light: '#f87171', dark: '#dc2626' };
  const info = { main: '#06b6d4', light: '#22d3ee', dark: '#0891b2' };

  const bgDefault = isDark ? '#0f0f1a' : '#f1f5fb';
  const bgPaper = isDark ? '#1a1a2e' : '#ffffff';
  const bgElevated = isDark ? '#242444' : '#f8faff';

  return createTheme({
    palette: {
      mode,
      primary,
      secondary,
      success,
      warning,
      error,
      info,
      background: {
        default: bgDefault,
        paper: bgPaper,
      },
      divider: isDark ? alpha('#ffffff', 0.1) : alpha('#000000', 0.08),
      text: {
        primary: isDark ? '#f1f5f9' : '#0f172a',
        secondary: isDark ? '#94a3b8' : '#64748b',
        disabled: isDark ? '#475569' : '#cbd5e1',
      },
    },
    shape: { borderRadius: radius },
    spacing: density.spacing,
    shadows: [
      'none',
      isDark
        ? '0 1px 4px rgba(0,0,0,0.5)'
        : `0 1px 4px rgba(${accent.rgb},0.06)`,
      isDark
        ? '0 4px 12px rgba(0,0,0,0.5)'
        : `0 4px 12px rgba(${accent.rgb},0.08)`,
      isDark
        ? '0 8px 24px rgba(0,0,0,0.5)'
        : `0 8px 24px rgba(${accent.rgb},0.12)`,
      isDark
        ? '0 16px 48px rgba(0,0,0,0.6)'
        : `0 16px 48px rgba(${accent.rgb},0.16)`,
      ...Array(20).fill('none'),
    ],
    typography: {
      fontFamily: font.stack.join(','),
      h1: { fontWeight: 800, letterSpacing: '-0.02em' },
      h2: { fontWeight: 800, letterSpacing: '-0.02em' },
      h3: { fontWeight: 700, letterSpacing: '-0.01em' },
      h4: { fontWeight: 700, letterSpacing: '-0.01em' },
      h5: { fontWeight: 700 },
      h6: { fontWeight: 700 },
      subtitle1: { fontWeight: 600 },
      subtitle2: { fontWeight: 600 },
      body1: { fontSize: density.body, lineHeight: 1.6 },
      body2: { fontSize: '0.875rem', lineHeight: 1.6 },
      button: { fontWeight: 600, textTransform: 'none', letterSpacing: '0.01em' },
    },
    components: {
      MuiCssBaseline: {
        styleOverrides: {
          '*': {
            boxSizing: 'border-box',
          },
          '::-webkit-scrollbar': {
            width: 6,
            height: 6,
          },
          '::-webkit-scrollbar-track': {
            background: 'transparent',
          },
          '::-webkit-scrollbar-thumb': {
            background: isDark ? alpha('#ffffff', 0.2) : alpha('#000000', 0.15),
            borderRadius: 99,
          },
        },
      },
      MuiButton: {
        defaultProps: { disableElevation: true },
        styleOverrides: {
          root: {
            borderRadius: Math.max(radius - 4, 2),
            padding: '8px 20px',
            fontWeight: 600,
            transition: 'all 0.2s ease',
            '&:hover': { transform: 'translateY(-1px)' },
            '&:active': { transform: 'translateY(0)' },
          },
          contained: {
            background: `linear-gradient(135deg, ${primary.main} 0%, ${primary.dark} 100%)`,
            '&:hover': {
              background: `linear-gradient(135deg, ${primary.light} 0%, ${primary.main} 100%)`,
            },
          },
          containedSecondary: {
            background: `linear-gradient(135deg, ${secondary.light} 0%, ${secondary.dark} 100%)`,
          },
          sizeSmall: { padding: '5px 14px', fontSize: '0.8125rem' },
          sizeLarge: { padding: '12px 28px', fontSize: '1rem' },
        },
      },
      MuiCard: {
        styleOverrides: {
          root: {
            borderRadius: radius + 2,
            border: cardBorder,
            boxShadow: cards === 'elevated'
              ? `0 4px 12px rgba(${accent.rgb},${isDark ? 0.35 : 0.10})`
              : 'none',
            backgroundImage: 'none',
            transition: 'box-shadow 0.2s ease, transform 0.2s ease',
            '&:hover': {
              boxShadow: isDark
                ? '0 8px 32px rgba(0,0,0,0.4)'
                : `0 8px 32px rgba(${accent.rgb},0.12)`,
            },
          },
        },
      },
      MuiCardContent: {
        styleOverrides: {
          root: { padding: '20px', '&:last-child': { paddingBottom: '20px' } },
        },
      },
      MuiPaper: {
        styleOverrides: {
          root: {
            backgroundImage: 'none',
          },
          outlined: {
            border: `1px solid ${isDark ? alpha('#ffffff', 0.08) : alpha('#000000', 0.07)}`,
          },
        },
      },
      MuiAppBar: {
        styleOverrides: {
          root: {
            backgroundImage: 'none',
            backgroundColor: isDark
              ? alpha('#1a1a2e', 0.9)
              : alpha('#ffffff', 0.9),
            backdropFilter: 'blur(20px)',
            WebkitBackdropFilter: 'blur(20px)',
            borderBottom: `1px solid ${isDark ? alpha('#ffffff', 0.06) : alpha('#000000', 0.06)}`,
            color: isDark ? '#f1f5f9' : '#0f172a',
          },
        },
      },
      MuiDrawer: {
        styleOverrides: {
          paper: {
            backgroundImage: 'none',
            backgroundColor: isDark ? '#14142b' : '#ffffff',
            borderRight: `1px solid ${isDark ? alpha('#ffffff', 0.06) : alpha(accent.main, 0.08)}`,
          },
        },
      },
      MuiTextField: {
        defaultProps: { size: 'small' },
        styleOverrides: {
          root: {
            '& .MuiOutlinedInput-root': {
              // Followed the corner setting everywhere except here, so "square"
              // left every input on the form still rounded.
              borderRadius: Math.max(radius - 4, 2),
              // Figures line up under each other while they are being typed as
              // well as after: a rate column that jumps about as you edit it is
              // the thing that makes data entry feel unreliable.
              fontVariantNumeric: 'tabular-nums',
              transition: 'box-shadow 0.2s',
              '&.Mui-focused': {
                boxShadow: `0 0 0 3px ${alpha(primary.main, 0.15)}`,
              },
            },
          },
        },
      },
      MuiChip: {
        styleOverrides: {
          root: {
            borderRadius: Math.max(radius - 6, 2),
            fontWeight: 600,
            fontSize: '0.75rem',
          },
        },
      },
      MuiTableHead: {
        styleOverrides: {
          root: {
            '& .MuiTableCell-head': {
              fontWeight: 700,
              fontSize: '0.75rem',
              textTransform: 'uppercase',
              letterSpacing: '0.06em',
              color: isDark ? '#94a3b8' : '#64748b',
              backgroundColor: isDark ? alpha('#ffffff', 0.04) : alpha('#f8faff', 1),
              borderBottom: `2px solid ${isDark ? alpha('#ffffff', 0.08) : alpha(accent.main, 0.08)}`,
              // Column names stay put while the rows scroll under them. On a
              // three-hundred-line stock list, a header that scrolls away means
              // counting columns to find out what a number is.
              position: 'sticky',
              top: 0,
              zIndex: 2,
              whiteSpace: 'nowrap',
            },
          },
        },
      },
      MuiTableRow: {
        styleOverrides: {
          root: {
            // Banding rather than vertical rules: on a wide grid the eye loses
            // the row, not the column, and stripes fix that without adding a
            // line between every pair of figures.
            '&:nth-of-type(even):not(.MuiTableRow-head)': {
              backgroundColor: isDark ? alpha('#ffffff', 0.015) : alpha('#000000', 0.012),
            },
            '&:hover': {
              backgroundColor: isDark
                ? alpha('#ffffff', 0.03)
                : alpha(accent.main, 0.03),
            },
            '&:last-child td': { borderBottom: 0 },
          },
        },
      },
      MuiTableCell: {
        styleOverrides: {
          root: {
            borderBottom: `1px solid ${isDark ? alpha('#ffffff', 0.06) : alpha('#000000', 0.05)}`,
            fontSize: '0.875rem',
            // Where density actually bites: rows per screen on a stock list.
            padding: density.cell,
            // The single most useful thing you can do to a ledger: digits share
            // one width, so thousands sit under thousands and a wrong figure is
            // visible as a shape before it is read.
            fontVariantNumeric: 'tabular-nums',
          },
        },
      },
      MuiDialog: {
        styleOverrides: {
          paper: {
            borderRadius: radius + 6,
            backgroundImage: 'none',
          },
        },
      },
      MuiDialogTitle: {
        styleOverrides: {
          root: {
            fontWeight: 700,
            fontSize: '1.125rem',
            padding: '20px 24px 12px',
            borderBottom: `1px solid ${isDark ? alpha('#ffffff', 0.08) : alpha('#000000', 0.06)}`,
          },
        },
      },
      MuiDialogContent: {
        styleOverrides: {
          root: { padding: '20px 24px' },
        },
      },
      MuiListItemButton: {
        styleOverrides: {
          root: {
            borderRadius: Math.max(radius - 4, 2),
            marginBottom: 2,
            transition: 'all 0.15s ease',
            '&:hover': {
              backgroundColor: isDark
                ? alpha(accent.main, 0.15)
                : alpha(accent.main, 0.07),
            },
            '&.active, &.Mui-selected': {
              backgroundColor: isDark
                ? alpha(accent.main, 0.3)
                : alpha(accent.main, 0.1),
              color: primary.main,
              '&:hover': {
                backgroundColor: isDark
                  ? alpha(accent.main, 0.35)
                  : alpha(accent.main, 0.14),
              },
            },
          },
        },
      },
      MuiTabs: {
        styleOverrides: {
          root: {
            '& .MuiTabs-indicator': {
              borderRadius: 99,
              height: 3,
            },
          },
        },
      },
      MuiTab: {
        styleOverrides: {
          root: {
            fontWeight: 600,
            textTransform: 'none',
            fontSize: '0.875rem',
            minWidth: 'auto',
          },
        },
      },
      MuiAlert: {
        styleOverrides: {
          root: { borderRadius: Math.max(radius - 4, 2) },
        },
      },
      MuiAvatar: {
        styleOverrides: {
          root: {
            fontWeight: 700,
          },
        },
      },
      MuiTooltip: {
        styleOverrides: {
          tooltip: {
            borderRadius: Math.max(radius - 6, 2),
            fontSize: '0.8rem',
            fontWeight: 500,
          },
        },
      },
    },
  });
}
