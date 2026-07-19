import { Alert, Snackbar } from '@mui/material';
import { createContext, useContext, useMemo, useState } from 'react';

const ToastContext = createContext(null);

export function ToastProvider({ children }) {
  const [toast, setToast] = useState(null);
  const value = useMemo(() => ({
    showToast: (message, severity = 'success') => setToast({ message, severity })
  }), []);
  return (
    <ToastContext.Provider value={value}>
      {children}
      <Snackbar open={Boolean(toast)} autoHideDuration={3500} onClose={() => setToast(null)}>
        <Alert severity={toast?.severity || 'success'} variant="filled">{toast?.message}</Alert>
      </Snackbar>
    </ToastContext.Provider>
  );
}

export const useToast = () => useContext(ToastContext);
