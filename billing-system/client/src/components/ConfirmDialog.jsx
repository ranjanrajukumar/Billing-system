import { useEffect, useRef } from 'react';
import { useTheme } from '@mui/material';
import Swal from 'sweetalert2';

/**
 * SweetAlert-backed confirmation.
 *
 * The props are unchanged from the previous MUI dialog (`open`, `title`,
 * `message`, `onCancel`, `onConfirm`) so every page that renders this keeps
 * working; only the presentation moved to SweetAlert.
 */
export default function ConfirmDialog({ open, message, onCancel, onConfirm, title = 'Confirm Action' }) {
  const theme = useTheme();
  const isDark = theme.palette.mode === 'dark';
  // Guards against re-opening while the same dialog is already on screen.
  const shown = useRef(false);

  useEffect(() => {
    if (!open) {
      shown.current = false;
      return;
    }
    if (shown.current) return;
    shown.current = true;

    Swal.fire({
      title,
      text: message,
      icon: 'warning',
      background: isDark ? '#1e2430' : '#ffffff',
      color: isDark ? '#e6e9ef' : '#1a2027',
      showCancelButton: true,
      confirmButtonText: 'Confirm',
      cancelButtonText: 'Cancel',
      confirmButtonColor: theme.palette.error.main,
      cancelButtonColor: theme.palette.mode === 'dark' ? '#4b5563' : '#6b7280',
      reverseButtons: true,
      focusCancel: true,
      allowOutsideClick: true,
    }).then((result) => {
      shown.current = false;
      if (result.isConfirmed) onConfirm?.();
      else onCancel?.();
    });
  }, [open, title, message, isDark]);

  // SweetAlert renders into its own container, so nothing is mounted here.
  return null;
}
