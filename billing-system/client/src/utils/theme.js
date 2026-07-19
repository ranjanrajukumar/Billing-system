import { createTheme } from '@mui/material/styles';

export function buildTheme(mode) {
  return createTheme({
    palette: {
      mode,
      primary: { main: '#176b5d' },
      secondary: { main: '#b45309' },
      background: { default: mode === 'dark' ? '#101418' : '#f6f8f7' }
    },
    shape: { borderRadius: 12 },
    typography: {
      fontFamily: ['Inter', 'Roboto', 'Arial', 'sans-serif'].join(','),
      h4: { fontWeight: 700, letterSpacing: 0 },
      h6: { fontWeight: 700, letterSpacing: 0 }
    },
    components: {
      MuiButton: { defaultProps: { disableElevation: true } },
      MuiCard: { styleOverrides: { root: { borderRadius: 8 } } }
    }
  });
}
