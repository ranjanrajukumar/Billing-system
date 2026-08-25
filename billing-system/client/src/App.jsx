import { CssBaseline, ThemeProvider } from '@mui/material';
import { useEffect, useMemo, useState } from 'react';
import AppRoutes from './routes/AppRoutes.jsx';
import { buildTheme } from './utils/theme.js';
import { readUiPrefs } from './utils/uiPrefs.js';
import { useAuth } from './context/AuthContext.jsx';
import { ToastProvider } from './context/ToastContext.jsx';

export default function App() {
  // Read from the auth payload as well as from storage, and in that order of
  // authority. Storage is what makes the *first* paint correct, before any
  // request has returned; the payload is what makes it *current*.
  //
  // Subscribing to the context is load-bearing rather than tidy. `<App />` is
  // created once in main.jsx and handed to AuthProvider as `children`, so the
  // element is referentially identical on every provider re-render and React
  // skips it. Without this hook App renders exactly once, the theme freezes at
  // whatever storage held before sign-in, and a saved appearance only appears
  // after a manual reload — which is precisely how it behaved.
  const { user } = useAuth();
  const ui = { ...readUiPrefs(), ...(user?.ui || {}) };

  // The company default only decides where a new browser starts; whatever this
  // person last chose in the top bar wins on their own machine.
  const [mode, setMode] = useState(localStorage.getItem('theme') || ui.theme || 'light');

  const theme = useMemo(
    () => buildTheme(mode, {
      accent: ui.accent, radius: ui.radius, density: ui.density,
      cards: ui.cards, font: ui.font,
    }),
    [mode, ui.accent, ui.radius, ui.density, ui.cards, ui.font],
  );

  // The tab is part of the application too: a person with six tabs open finds
  // this one by its title, and "ShopBill Pro" told them nothing about whose
  // books they were looking at. Falls back to the neutral title in index.html
  // rather than inventing one before sign-in.
  useEffect(() => {
    if (user?.companyName) document.title = user.companyName;
  }, [user?.companyName]);

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
