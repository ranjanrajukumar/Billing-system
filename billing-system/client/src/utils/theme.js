import { createTheme, alpha } from '@mui/material/styles';

export function buildTheme(mode) {
  const isDark = mode === 'dark';

  const primary = {
    main: '#4f46e5',
    light: '#7c74f0',
    dark: '#3730a3',
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
    shape: { borderRadius: 14 },
    shadows: [
      'none',
      isDark
        ? '0 1px 4px rgba(0,0,0,0.5)'
        : '0 1px 4px rgba(79,70,229,0.06)',
      isDark
        ? '0 4px 12px rgba(0,0,0,0.5)'
        : '0 4px 12px rgba(79,70,229,0.08)',
      isDark
        ? '0 8px 24px rgba(0,0,0,0.5)'
        : '0 8px 24px rgba(79,70,229,0.12)',
      isDark
        ? '0 16px 48px rgba(0,0,0,0.6)'
        : '0 16px 48px rgba(79,70,229,0.16)',
      ...Array(20).fill('none'),
    ],
    typography: {
      fontFamily: ['Inter', 'Roboto', 'Arial', 'sans-serif'].join(','),
      h1: { fontWeight: 800, letterSpacing: '-0.02em' },
      h2: { fontWeight: 800, letterSpacing: '-0.02em' },
      h3: { fontWeight: 700, letterSpacing: '-0.01em' },
      h4: { fontWeight: 700, letterSpacing: '-0.01em' },
      h5: { fontWeight: 700 },
      h6: { fontWeight: 700 },
      subtitle1: { fontWeight: 600 },
      subtitle2: { fontWeight: 600 },
      body1: { fontSize: '0.9375rem', lineHeight: 1.6 },
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
            borderRadius: 10,
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
            borderRadius: 16,
            border: `1px solid ${isDark ? alpha('#ffffff', 0.08) : alpha('#000000', 0.06)}`,
            backgroundImage: 'none',
            transition: 'box-shadow 0.2s ease, transform 0.2s ease',
            '&:hover': {
              boxShadow: isDark
                ? '0 8px 32px rgba(0,0,0,0.4)'
                : '0 8px 32px rgba(79,70,229,0.12)',
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
            borderRight: `1px solid ${isDark ? alpha('#ffffff', 0.06) : alpha('#4f46e5', 0.08)}`,
          },
        },
      },
      MuiTextField: {
        defaultProps: { size: 'small' },
        styleOverrides: {
          root: {
            '& .MuiOutlinedInput-root': {
              borderRadius: 10,
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
            borderRadius: 8,
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
              borderBottom: `2px solid ${isDark ? alpha('#ffffff', 0.08) : alpha('#4f46e5', 0.08)}`,
            },
          },
        },
      },
      MuiTableRow: {
        styleOverrides: {
          root: {
            '&:hover': {
              backgroundColor: isDark
                ? alpha('#ffffff', 0.03)
                : alpha('#4f46e5', 0.03),
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
          },
        },
      },
      MuiDialog: {
        styleOverrides: {
          paper: {
            borderRadius: 20,
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
            borderRadius: 10,
            marginBottom: 2,
            transition: 'all 0.15s ease',
            '&:hover': {
              backgroundColor: isDark
                ? alpha('#4f46e5', 0.15)
                : alpha('#4f46e5', 0.07),
            },
            '&.active, &.Mui-selected': {
              backgroundColor: isDark
                ? alpha('#4f46e5', 0.3)
                : alpha('#4f46e5', 0.1),
              color: primary.main,
              '&:hover': {
                backgroundColor: isDark
                  ? alpha('#4f46e5', 0.35)
                  : alpha('#4f46e5', 0.14),
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
          root: { borderRadius: 10 },
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
            borderRadius: 8,
            fontSize: '0.8rem',
            fontWeight: 500,
          },
        },
      },
    },
  });
}

// Design tokens for use across components
export const tokens = {
  gradients: {
    primary: 'linear-gradient(135deg, #4f46e5 0%, #7c74f0 100%)',
    secondary: 'linear-gradient(135deg, #f59e0b 0%, #fbbf24 100%)',
    success: 'linear-gradient(135deg, #10b981 0%, #34d399 100%)',
    warning: 'linear-gradient(135deg, #f59e0b 0%, #fb923c 100%)',
    error: 'linear-gradient(135deg, #ef4444 0%, #f87171 100%)',
    info: 'linear-gradient(135deg, #06b6d4 0%, #38bdf8 100%)',
    dark: 'linear-gradient(135deg, #0f0f1a 0%, #1a1a2e 100%)',
    hero: 'linear-gradient(135deg, #4f46e5 0%, #7c3aed 50%, #06b6d4 100%)',
  },
};
