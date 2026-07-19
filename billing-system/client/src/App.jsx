import { CssBaseline, ThemeProvider } from '@mui/material';
import { useMemo, useState } from 'react';
import AppRoutes from './routes/AppRoutes.jsx';
import { buildTheme } from './utils/theme.js';
import { ToastProvider } from './context/ToastContext.jsx';

export default function App() {
  const [mode, setMode] = useState(localStorage.getItem('theme') || 'light');
  const theme = useMemo(() => buildTheme(mode), [mode]);
  const toggleMode = () => {
    setMode((prev) => {
      const next = prev === 'light' ? 'dark' : 'light';
      localStorage.setItem('theme', next);
      return next;
    });
  };

  return (
    <ThemeProvider theme={theme}>
      <CssBaseline />
      <ToastProvider>
        <AppRoutes mode={mode} onToggleMode={toggleMode} />
      </ToastProvider>
    </ThemeProvider>
  );
}
